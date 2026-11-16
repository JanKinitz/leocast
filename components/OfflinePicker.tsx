"use client";

// Auswahl, welche Folgen für unterwegs gespeichert werden – mit Größe und freiem Speicher.
import { useEffect, useState } from "react";
import type { MediaItem } from "@/lib/library";
import { getDownloads, markDownloaded, unmarkDownloaded, useStoreVersion } from "@/lib/store";
import { downloadEpisode, removeEpisode, requestPersistentStorage, storageEstimate } from "@/lib/offline";
import { prefetchMarkers } from "@/lib/markers";
import { log } from "@/lib/diagnostics";
import { getDevice, getSyncStatus } from "@/lib/sync";
import { img } from "@/lib/img";
import { IconBack, IconCheck } from "./Icons";

/** Größe in MB: laut Feed oder geschätzt (128 kbit/s) */
function sizeMb(it: MediaItem): number {
  if (it.audioBytes && it.audioBytes > 100_000) return it.audioBytes / 1024 / 1024;
  return ((it.durationSec || 1800) * 128) / 8 / 1024;
}

const mb = (n: number) => `${Math.max(1, Math.round(n))} MB`;

export default function OfflinePicker({ items, onClose }: { items: MediaItem[]; onClose: () => void }) {
  useStoreVersion();
  const downloads = getDownloads();
  // Was auf den anderen Geräten gespeichert ist (aus dem letzten Abgleich)
  const own = getDevice().id;
  const elsewhere = (id: string) =>
    Object.entries(getSyncStatus()?.devices || {})
      .filter(([dev, d]) => dev !== own && d.downloads?.[id])
      .map(([, d]) => d.name);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [free, setFree] = useState<number | null>(null);

  useEffect(() => {
    storageEstimate().then((e) => e && setFree((e.quota - e.usage) / 1024 / 1024));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const chosen = items.filter((it) => picked.has(it.id));
  const total = chosen.reduce((sum, it) => sum + sizeMb(it), 0);
  const tooMuch = free != null && total > free * 0.8;

  async function save() {
    await requestPersistentStorage();
    let n = 0;
    for (const it of chosen) {
      setBusy(it.id);
      const { result, detail } = await downloadEpisode(it.audioUrl!);
      if (result !== "failed") {
        markDownloaded(it, result);
        prefetchMarkers(it);
      }
      log(result === "failed" ? "error" : "ok", `Offline „${it.title}“: ${result} – ${detail}`);
      setDone(++n);
    }
    setBusy(null);
    setPicked(new Set());
    setDone(0);
    storageEstimate().then((e) => e && setFree((e.quota - e.usage) / 1024 / 1024));
  }

  async function remove(it: MediaItem) {
    if (it.audioUrl) await removeEpisode(it.audioUrl);
    unmarkDownloaded(it.id);
    log("info", `Offline entfernt: ${it.title}`);
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Für unterwegs speichern">
      <header className="sheet-top">
        <button className="round-btn back-btn" onClick={onClose} aria-label="Zurück" disabled={!!busy}>
          <IconBack />
        </button>
        <h2>Für unterwegs speichern</h2>
      </header>
      <p className="sheet-hint">Tippe die Folgen an, die du ohne Internet hören willst.</p>

      <ul className="pick-list">
        {items.map((it) => {
          const saved = !!downloads[it.id];
          const on = picked.has(it.id);
          return (
            <li key={it.id} className={`pick ${on ? "on" : ""} ${saved ? "saved" : ""}`}>
              <button
                className="pick-main"
                onClick={() => !saved && toggle(it.id)}
                disabled={!!busy}
                aria-pressed={saved || on}
              >
                {it.image ? <img src={img(it.image, 128)} alt="" /> : <span className="pick-noimg" />}
                <span className="pick-text">
                  <span className="pick-title">{it.title}</span>
                  <span className="pick-meta">
                    {it.durationSec ? `${Math.round(it.durationSec / 60)} Min. · ` : ""}
                    {saved ? "gespeichert" : mb(sizeMb(it))}
                    {elsewhere(it.id).length ? ` · auf ${elsewhere(it.id).join(" und ")} gespeichert` : ""}
                    {busy === it.id ? " · wird gespeichert …" : ""}
                  </span>
                </span>
                <span className={`pick-box ${saved || on ? "checked" : ""}`} aria-hidden="true">
                  {(saved || on) && <IconCheck />}
                </span>
              </button>
              {saved && (
                <button className="pick-remove" onClick={() => remove(it)} disabled={!!busy}>
                  Löschen
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="sheet-bottom">
        <span className="sheet-sum">
          {chosen.length
            ? `${chosen.length} ${chosen.length === 1 ? "Folge" : "Folgen"} · ${mb(total)}`
            : "Noch nichts ausgewählt"}
          {free != null && <span className="pick-meta"> · frei: {free > 2048 ? `${(free / 1024).toFixed(0)} GB` : mb(free)}</span>}
          {tooMuch && <span className="pick-warn"> Das ist zu viel für den freien Speicher.</span>}
        </span>
        <button className="button" disabled={!chosen.length || !!busy || tooMuch} onClick={save}>
          {busy ? `Speichere ${done + 1} von ${chosen.length} …` : "Speichern"}
        </button>
      </footer>
    </div>
  );
}
