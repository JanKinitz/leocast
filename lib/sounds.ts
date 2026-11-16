"use client";

// Kleine Geräusche für die Figuren – direkt im Browser erzeugt (keine Audiodateien, kein Download).
// Leise und kurz. Läuft gerade eine Folge oder ein Lied, bleibt es still (nur die Bewegung).
import { isAppPlaying } from "./appState";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ||= new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

type Tone = { type?: OscillatorType; from: number; to?: number; at?: number; dur: number; vol?: number; vibrato?: number };

function tones(list: Tone[]) {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime + 0.02;
  for (const t of list) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const start = now + (t.at || 0);
    osc.type = t.type || "sine";
    osc.frequency.setValueAtTime(t.from, start);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
    if (t.vibrato) {
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = t.vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + t.dur);
    }
    const v = (t.vol ?? 1) * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(v, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + t.dur + 0.05);
  }
}

function noise(dur: number, freq: number, at = 0, vol = 1) {
  const ac = audio();
  if (!ac) return;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const gain = ac.createGain();
  const start = ac.currentTime + 0.02 + at;
  gain.gain.setValueAtTime(0.12 * vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(start);
}

export const SOUNDS = {
  boing: () => tones([{ type: "triangle", from: 180, to: 520, dur: 0.35, vibrato: 25 }]),
  huuu: () => tones([{ from: 520, to: 260, dur: 1.1, vibrato: 18, vol: 0.8 }]),
  pop: () => tones([{ type: "triangle", from: 600, to: 1200, dur: 0.09 }, { from: 900, to: 400, at: 0.1, dur: 0.12 }]),
  bells: () =>
    tones([
      { from: 1318, dur: 0.6, vol: 0.6 },
      { from: 1568, at: 0.15, dur: 0.6, vol: 0.6 },
      { from: 2093, at: 0.3, dur: 0.8, vol: 0.5 },
    ]),
  whistlePop: () => {
    tones([{ type: "sine", from: 600, to: 2400, dur: 0.6, vol: 0.5 }]);
    noise(0.35, 1800, 0.62, 1.2);
    tones([{ type: "triangle", from: 1500, to: 700, at: 0.64, dur: 0.25, vol: 0.5 }]);
  },
  honk: () => tones([{ type: "square", from: 330, dur: 0.18, vol: 0.4 }, { type: "square", from: 330, at: 0.22, dur: 0.25, vol: 0.4 }]),
  buzz: () => tones([{ type: "sawtooth", from: 190, to: 230, dur: 0.7, vibrato: 30, vol: 0.35 }]),
  ribbit: () => tones([{ type: "square", from: 140, to: 90, dur: 0.14, vol: 0.4 }, { type: "square", from: 160, to: 100, at: 0.18, dur: 0.16, vol: 0.4 }]),
  hoot: () => tones([{ from: 420, to: 380, dur: 0.3 }, { from: 420, to: 360, at: 0.4, dur: 0.45 }]),
  beep: () => tones([{ type: "square", from: 880, dur: 0.1, vol: 0.3 }, { type: "square", from: 1320, at: 0.13, dur: 0.1, vol: 0.3 }, { type: "square", from: 660, at: 0.26, dur: 0.16, vol: 0.3 }]),
  roar: () => tones([{ type: "sawtooth", from: 110, to: 70, dur: 0.6, vibrato: 12, vol: 0.4 }]),
  chime: () => tones([{ from: 784, dur: 0.4 }, { from: 988, at: 0.12, dur: 0.4 }, { from: 1175, at: 0.24, dur: 0.6 }]),
  splash: () => noise(0.5, 900),
  giggle: () =>
    tones([0, 0.11, 0.22, 0.33].map((at, i) => ({ type: "triangle" as OscillatorType, from: 700 + i * 60, to: 950 + i * 60, at, dur: 0.09 }))),
  whoosh: () => noise(0.6, 600),
  sniff: () => {
    noise(0.12, 2500);
    noise(0.12, 2500, 0.18);
  },
  tick: () => tones([{ type: "square", from: 1500, dur: 0.05, vol: 0.3 }, { type: "square", from: 1200, at: 0.12, dur: 0.05, vol: 0.3 }]),
};

export type SoundName = keyof typeof SOUNDS;

export function playSound(name: SoundName) {
  if (isAppPlaying()) return;
  try {
    SOUNDS[name]();
  } catch {
    /* kein Ton – egal */
  }
}
