"""Vertont podcast/skript.json mit Piper (zwei Stimmen) und baut eine MP3 mit Kapitelmarken.

Aufruf: python podcast/vertonen.py <stimmen-ordner> <ausgabe.mp3>
"""
import json
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

HIER = Path(__file__).parent
STIMMEN = Path(sys.argv[1])
AUSGABE = Path(sys.argv[2])
MODELLE = {"Lena": "de_DE-kerstin-low", "Jonas": "de_DE-thorsten-high"}
RATE = 22050


def sprechbar(t: str) -> str:
    t = t.replace("„", "").replace("“", "").replace("CO2", "C O zwei").replace("6G", "sechs G")
    t = t.replace("Xiaokang", "Schiau-kang").replace("Hu Jintao", "Hu Dschin-tao").replace("Wen Jiabao", "Wen Dschia-bao")
    t = t.replace("Xi Jinping", "Schi Dschin-ping").replace("Deng Xiaoping", "Deng Schiau-ping").replace("Shenzhen", "Schen-dschen")
    t = t.replace("Tiananmen", "Tian-an-men").replace("Yuan", "Jüan")
    return re.sub(r"\s+", " ", t).strip()


def stille(ms: int) -> bytes:
    return b"\x00\x00" * int(RATE * ms / 1000)


def pcm(voice: PiperVoice, text: str, cfg: SynthesisConfig) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        with wave.open(f.name, "wb") as w:
            voice.synthesize_wav(text, w, syn_config=cfg)
        with wave.open(f.name, "rb") as r:
            daten = r.readframes(r.getnframes())
            rate = r.getframerate()
    if rate != RATE:  # auf gemeinsame Abtastrate bringen
        daten = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "-",
             "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-"],
            input=daten, capture_output=True, check=True).stdout
    return daten


def main() -> None:
    kapitel = json.loads((HIER / "skript.json").read_text(encoding="utf-8"))
    stimmen = {n: PiperVoice.load(str(STIMMEN / f"{m}.onnx")) for n, m in MODELLE.items()}
    cfg = {"Lena": SynthesisConfig(length_scale=1.0), "Jonas": SynthesisConfig(length_scale=1.02)}
    audio = bytearray(stille(400))
    marken = []
    letzter = None
    for k in kapitel:
        start = len(audio) // 2
        for z in k["lines"]:
            if letzter is not None:
                audio += stille(550 if z["s"] != letzter else 300)
            audio += pcm(stimmen[z["s"]], sprechbar(z["t"]), cfg[z["s"]])
            letzter = z["s"]
        audio += stille(1200)
        marken.append((start, len(audio) // 2, f'{k["title"]} – {k["sub"]}'))
        print(f'{k["title"]}: {len(k["lines"])} Sätze', flush=True)

    meta = [";FFMETADATA1", "title=Fünf Jahre, ein Plan – Chinas Fünfjahrespläne 1953 bis 2030",
            "artist=Lena & Jonas", "album=Fünf Jahre, ein Plan", "date=2026", "genre=Podcast"]
    for a, b, t in marken:
        meta += ["[CHAPTER]", "TIMEBASE=1/%d" % RATE, f"START={a}", f"END={b}", f"title={t}"]
    with tempfile.TemporaryDirectory() as d:
        raw, mf = Path(d) / "a.raw", Path(d) / "meta.txt"
        raw.write_bytes(bytes(audio))
        mf.write_text("\n".join(meta) + "\n", encoding="utf-8")
        AUSGABE.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-i", str(raw),
             "-i", str(mf), "-map_metadata", "1", "-map_chapters", "1",
             "-af", "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100",
             "-c:a", "libmp3lame", "-b:a", "96k", "-id3v2_version", "3", str(AUSGABE)],
            check=True)
    print(f"Fertig: {AUSGABE} ({len(audio) / 2 / RATE / 60:.1f} Minuten)")


if __name__ == "__main__":
    main()
