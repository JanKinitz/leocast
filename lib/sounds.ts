"use client";

// Kleine Geräusche für die Figuren – direkt im Browser erzeugt (keine Audiodateien, kein Download).
// Leise und kurz. Läuft gerade eine Folge oder ein Lied, bleibt es still (nur die Bewegung).
import { isAppPlaying } from "./appState";

let ctx: AudioContext | null = null;
let out: AudioNode | null = null;

// Handylautsprecher geben tiefe Töne kaum wieder: alles läuft über einen Kompressor und ist lauter abgemischt
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    const master = ctx.createGain();
    master.gain.value = 1.6;
    comp.connect(master).connect(ctx.destination);
    out = comp;
  }
  return ctx;
}

const dest = () => out || ctx!.destination;

type Tone = {
  type?: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  dur: number;
  vol?: number;
  vibrato?: number;
  /** Klangfarbe: Bandpass/Tiefpass, z. B. für Vokale („Ho“, „Quaak“) */
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  /** schnelles Lauter/Leiser (Schnurren, Brummen), Schläge pro Sekunde */
  tremolo?: number;
};

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
    const v = (t.vol ?? 1) * 0.45;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(v, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    let node: AudioNode = osc;
    if (t.filter) {
      const f = ac.createBiquadFilter();
      f.type = t.filter.type;
      f.frequency.value = t.filter.freq;
      f.Q.value = t.filter.q ?? 4;
      node.connect(f);
      node = f;
    }
    if (t.tremolo) {
      const trem = ac.createGain();
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      lfo.frequency.value = t.tremolo;
      depth.gain.value = 0.5;
      trem.gain.value = 0.5;
      lfo.connect(depth).connect(trem.gain);
      lfo.start(start);
      lfo.stop(start + t.dur + 0.05);
      node.connect(trem);
      node = trem;
    }
    node.connect(gain).connect(dest());
    osc.start(start);
    osc.stop(start + t.dur + 0.05);
  }
}

function noise(dur: number, freq: number, at = 0, vol = 1, type: BiquadFilterType = "bandpass", toFreq?: number) {
  const ac = audio();
  if (!ac) return;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, ac.currentTime + 0.02 + at);
  if (toFreq) filter.frequency.exponentialRampToValueAtTime(toFreq, ac.currentTime + 0.02 + at + dur);
  const gain = ac.createGain();
  const start = ac.currentTime + 0.02 + at;
  gain.gain.setValueAtTime(0.5 * vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(dest());
  src.start(start);
}

const seq = (n: number, step: number, f: (i: number, at: number) => void) => {
  for (let i = 0; i < n; i++) f(i, i * step);
};

export const SOUNDS = {
  // Gespenst: „Huuuu-huu“, schaurig mit Zittern, am Ende „Buh!“
  ghost: () => {
    tones([
      { from: 520, to: 330, dur: 1.1, vibrato: 22, vol: 0.8 },
      { from: 440, to: 280, at: 1.0, dur: 0.8, vibrato: 22, vol: 0.6 },
      { type: "sawtooth", from: 260, to: 180, at: 1.7, dur: 0.35, vol: 0.8, filter: { type: "lowpass", freq: 900 } },
    ]);
  },
  // Kürbis: „Hehehe“-Kichern
  pumpkin: () =>
    seq(6, 0.22, (i, at) =>
      tones([{ type: "sawtooth", from: 520 - i * 25, to: 430 - i * 25, at, dur: 0.15, vol: 0.6, filter: { type: "bandpass", freq: 1300, q: 3 } }]),
    ),
  // Nikolaus: „Ho! Ho! Ho!“ und Glöckchen
  santa: () => {
    seq(3, 0.42, (_i, at) =>
      tones([{ type: "sawtooth", from: 210, to: 170, at, dur: 0.3, vol: 1.2, filter: { type: "bandpass", freq: 650, q: 2.5 } }]),
    );
    seq(6, 0.12, (i, at) => tones([{ from: [1568, 1760, 2093][i % 3], at: 1.35 + at, dur: 0.5, vol: 0.4 }]));
  },
  // Stern: glitzernde Tonleiter nach oben
  sparkle: () => seq(10, 0.11, (i, at) => tones([{ from: 880 * Math.pow(2, i / 5), at, dur: 0.45, vol: 0.45 }, { type: "triangle", from: 1760 * Math.pow(2, i / 5), at: at + 0.04, dur: 0.25, vol: 0.2 }])),
  // Rakete: drei Countdown-Piepser, Triebwerk, Pfeifen, Knall
  rocket: () => {
    seq(3, 0.25, (i, at) => tones([{ type: "square", from: i === 2 ? 1320 : 880, at, dur: 0.12, vol: 0.4 }]));
    noise(1.3, 300, 0.75, 1.6, "lowpass", 2500);
    tones([{ from: 500, to: 2600, at: 0.9, dur: 0.9, vol: 0.45 }]);
    noise(0.5, 1500, 1.85, 2);
    seq(6, 0.07, (i, at) => tones([{ type: "triangle", from: 1200 + i * 150, to: 600, at: 1.9 + at, dur: 0.15, vol: 0.4 }]));
  },
  // Schneemann: „Brrrr“ (zittert vor Kälte) und Eis-Klingeln
  snowman: () => {
    tones([{ type: "sawtooth", from: 300, to: 260, dur: 0.9, vol: 0.7, tremolo: 28, filter: { type: "bandpass", freq: 900, q: 2 } }]);
    seq(5, 0.15, (i, at) => tones([{ from: [1319, 1568, 1976, 2349, 2637][i], at: 1.0 + at, dur: 0.5, vol: 0.35 }]));
  },
  // Clown: Hup-Hup, Flötenpfiff hoch und runter
  clown: () => {
    tones([
      { type: "square", from: 440, dur: 0.16, vol: 0.55, filter: { type: "bandpass", freq: 900, q: 2 } },
      { type: "square", from: 440, at: 0.22, dur: 0.22, vol: 0.55, filter: { type: "bandpass", freq: 900, q: 2 } },
      { from: 400, to: 1600, at: 0.6, dur: 0.6, vol: 0.5, vibrato: 10 },
      { from: 1600, to: 500, at: 1.25, dur: 0.6, vol: 0.5, vibrato: 10 },
    ]);
  },
  // Hase: drei Hopser-„Boing“
  bunny: () => seq(3, 0.5, (i, at) => tones([{ type: "triangle", from: 330 + i * 60, to: 900 + i * 120, at, dur: 0.3, vibrato: 30, vol: 0.7 }])),
  // Biene: Summen, das näher kommt und wegfliegt
  bee: () => tones([{ type: "sawtooth", from: 230, to: 290, dur: 2.3, vibrato: 18, vol: 0.55, tremolo: 6, filter: { type: "bandpass", freq: 700, q: 1.5 } }]),
  // Sonne: warmer Akkord, der aufgeht
  sun: () => seq(4, 0.18, (i, at) => tones([{ from: [523, 659, 784, 1047][i], at, dur: 1.4 - at, vol: 0.4 }, { type: "triangle", from: [523, 659, 784, 1047][i] * 2, at, dur: 0.6, vol: 0.15 }])),
  // Eis: Schlürfen, „Mmmh“, Plopp
  icecream: () => {
    noise(0.6, 500, 0, 1.4, "bandpass", 3000);
    tones([{ type: "sawtooth", from: 240, to: 300, at: 0.7, dur: 0.8, vol: 0.6, filter: { type: "lowpass", freq: 700 } }]);
    tones([{ type: "triangle", from: 600, to: 1300, at: 1.6, dur: 0.1 }, { from: 900, to: 400, at: 1.72, dur: 0.14 }]);
  },
  // Igel: schnüffeln, rollen, quieken
  hedgehog: () => {
    seq(3, 0.2, (_i, at) => noise(0.12, 2400, at, 1.6));
    noise(1.1, 250, 0.65, 1.4, "lowpass");
    tones([{ type: "triangle", from: 1000, to: 1700, at: 1.9, dur: 0.15, vol: 0.6 }, { type: "triangle", from: 1100, to: 1800, at: 2.1, dur: 0.15, vol: 0.6 }]);
  },
  // Wuschel: „Bwoing“ und lautes Kichern
  monster: () => {
    tones([{ type: "triangle", from: 200, to: 700, dur: 0.5, vibrato: 40, vol: 0.8 }]);
    seq(8, 0.12, (i, at) => tones([{ type: "sawtooth", from: 620 + (i % 2) * 90, to: 520, at: 0.7 + at, dur: 0.09, vol: 0.5, filter: { type: "bandpass", freq: 1500, q: 3 } }]));
  },
  // Frosch: „Quaak – quaak“ und Zungen-Schnalzen
  frog: () => {
    seq(2, 0.45, (_i, at) => tones([{ type: "sawtooth", from: 260, to: 190, at, dur: 0.32, vol: 1.1, tremolo: 35, filter: { type: "bandpass", freq: 1000, q: 3 } }]));
    tones([{ type: "triangle", from: 300, to: 1500, at: 1.0, dur: 0.12, vol: 0.6 }]);
    noise(0.08, 3000, 1.15, 1.5);
  },
  // Eule: „Huu-hu-huuu“ mit Flügelschlagen
  owl: () => {
    tones([
      { from: 410, to: 380, dur: 0.45, vol: 0.9, vibrato: 4, filter: { type: "lowpass", freq: 1200 } },
      { from: 400, to: 370, at: 0.6, dur: 0.18, vol: 0.8, filter: { type: "lowpass", freq: 1200 } },
      { from: 420, to: 360, at: 0.85, dur: 0.7, vol: 0.9, vibrato: 5, filter: { type: "lowpass", freq: 1200 } },
    ]);
    seq(8, 0.12, (_i, at) => noise(0.07, 900, 1.6 + at, 1.4));
  },
  // Roboter: Piep-Melodie und Surren
  robot: () => {
    seq(6, 0.13, (i, at) => tones([{ type: "square", from: [880, 1320, 660, 990, 1760, 1175][i], at, dur: 0.1, vol: 0.4 }]));
    tones([{ type: "square", from: 300, to: 900, at: 0.9, dur: 0.6, vol: 0.25, filter: { type: "lowpass", freq: 1500 } }]);
    tones([{ type: "square", from: 900, to: 300, at: 1.55, dur: 0.5, vol: 0.25, filter: { type: "lowpass", freq: 1500 } }]);
  },
  // Dino: zwei Stampfer, dann Brüllen
  dino: () => {
    noise(0.25, 180, 0, 2.2, "lowpass");
    noise(0.25, 180, 0.6, 2.2, "lowpass");
    noise(1.1, 500, 1.2, 1.8, "bandpass", 300);
    tones([{ type: "sawtooth", from: 330, to: 180, at: 1.2, dur: 1.1, vol: 0.9, tremolo: 22, filter: { type: "lowpass", freq: 1400 } }]);
  },
  // Krake: blubbernde Blasen
  octopus: () => seq(12, 0.15, (i, at) => tones([{ from: 500 + (i % 4) * 120, to: 1100 + (i % 3) * 200, at, dur: 0.1, vol: 0.55 }])),
};

export type SoundName = keyof typeof SOUNDS;

export function playSound(name: SoundName) {
  if (isAppPlaying()) return;
  const ac = audio();
  if (!ac) return;
  const go = () => {
    try {
      SOUNDS[name]();
    } catch {
      /* kein Ton – egal */
    }
  };
  // Erst spielen, wenn der Ton-Kanal wirklich läuft (Android startet ihn erst nach dem Antippen)
  if (ac.state === "running") go();
  else ac.resume().then(go).catch(() => {});
}
