"use client";

// Kleine Figuren zwischen den Kacheln (wie in der KiKA-App, aber eigene Figuren):
// antippen → Geräusch + Bewegung. Jede Woche wechseln sie von selbst; zu besonderen Zeiten
// (Halloween, Nikolaus, Weihnachten, Silvester, Fasching, Ostern …) kommt eine passende Figur.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FigureScene } from "@/lib/figures3d";
import { playSound, type SoundName } from "@/lib/sounds";

type Anim = "bounce" | "wobble" | "spin" | "float" | "hop" | "twinkle" | "launch" | "buzz" | "wave" | "roll";

export type Figure = {
  id: string;
  name: string;
  /** Zeitraum im Jahr als MMTT, z. B. [1015, 1102]; darf über den Jahreswechsel gehen */
  season?: [number, number];
  anim: Anim;
  sound: SoundName;
  art: ReactNode;
};

// Gemeinsame Gesichtsteile
const Eyes = ({ y = 52, dx = 14, cx = 60, r = 7 }: { y?: number; dx?: number; cx?: number; r?: number }) => (
  <g>
    <circle cx={cx - dx} cy={y} r={r} fill="#fff" />
    <circle cx={cx + dx} cy={y} r={r} fill="#fff" />
    <circle cx={cx - dx + 1.5} cy={y + 1} r={r * 0.5} fill="#1b1d33" />
    <circle cx={cx + dx + 1.5} cy={y + 1} r={r * 0.5} fill="#1b1d33" />
    <circle cx={cx - dx + 3} cy={y - 1.5} r={1.4} fill="#fff" />
    <circle cx={cx + dx + 3} cy={y - 1.5} r={1.4} fill="#fff" />
  </g>
);
const Smile = ({ y = 68, w = 12, cx = 60 }: { y?: number; w?: number; cx?: number }) => (
  <path d={`M${cx - w} ${y} Q${cx} ${y + w * 0.9} ${cx + w} ${y}`} stroke="#1b1d33" strokeWidth="3.5" fill="none" strokeLinecap="round" />
);
const Cheeks = ({ y = 64, dx = 24, cx = 60 }: { y?: number; dx?: number; cx?: number }) => (
  <g fill="#ff8fab" opacity="0.7">
    <ellipse cx={cx - dx} cy={y} rx="5" ry="3.5" />
    <ellipse cx={cx + dx} cy={y} rx="5" ry="3.5" />
  </g>
);

export const FIGURES: Figure[] = [
  // ---- besondere Zeiten ----
  {
    id: "gespenst",
    name: "Gespensti",
    season: [1015, 1102],
    anim: "float",
    sound: "ghost",
    art: (
      <>
        <path d="M30 100 V55 a30 30 0 0 1 60 0 V100 l-10 -8 -10 8 -10 -8 -10 8 -10 -8z" fill="#f1f3ff" />
        <Eyes y={55} r={6} />
        <ellipse cx="60" cy="74" rx="6" ry="8" fill="#1b1d33" />
        <Cheeks y={66} dx={20} />
      </>
    ),
  },
  {
    id: "kuerbis",
    name: "Kürbi",
    season: [1001, 1102],
    anim: "bounce",
    sound: "pumpkin",
    art: (
      <>
        <rect x="55" y="18" width="10" height="16" rx="4" fill="#4d7c0f" />
        <ellipse cx="60" cy="68" rx="42" ry="34" fill="#f97316" />
        <path d="M60 36 V100 M38 40 Q30 68 40 98 M82 40 Q90 68 80 98" stroke="#ea580c" strokeWidth="3" fill="none" />
        <path d="M42 58 l8 -8 8 8z M62 58 l8 -8 8 8z" fill="#1b1d33" />
        <path d="M42 76 Q60 92 78 76 Q60 84 42 76z" fill="#1b1d33" />
      </>
    ),
  },
  {
    id: "nikolaus",
    name: "Nikolaus",
    season: [1201, 1207],
    anim: "wave",
    sound: "santa",
    art: (
      <>
        <path d="M30 50 Q60 0 90 50z" fill="#dc2626" />
        <circle cx="92" cy="20" r="7" fill="#fff" />
        <rect x="26" y="46" width="68" height="10" rx="5" fill="#fff" />
        <circle cx="60" cy="68" r="22" fill="#ffd8b5" />
        <Eyes y={64} r={4.5} dx={9} />
        <path d="M34 72 Q60 120 86 72 Q74 84 60 82 Q46 84 34 72z" fill="#fff" />
        <circle cx="60" cy="74" r="4" fill="#ff8fab" />
      </>
    ),
  },
  {
    id: "stern",
    name: "Funkelstern",
    season: [1208, 1226],
    anim: "twinkle",
    sound: "sparkle",
    art: (
      <>
        <path d="M60 10 L72 44 L108 44 L79 65 L90 100 L60 79 L30 100 L41 65 L12 44 L48 44z" fill="#ffd43b" stroke="#f59f00" strokeWidth="3" strokeLinejoin="round" />
        <Eyes y={58} r={5} dx={10} />
        <Smile y={70} w={8} />
      </>
    ),
  },
  {
    id: "rakete",
    name: "Raketi",
    season: [1227, 102],
    anim: "launch",
    sound: "rocket",
    art: (
      <>
        <path d="M60 8 Q84 30 80 78 H40 Q36 30 60 8z" fill="#e5e7eb" />
        <path d="M40 60 L24 86 L42 80z M80 60 L96 86 L78 80z" fill="#ef4444" />
        <circle cx="60" cy="44" r="12" fill="#60a5fa" stroke="#1e3a8a" strokeWidth="3" />
        <Eyes y={44} r={3.5} dx={5} />
        <path d="M48 80 Q60 112 72 80z" fill="#ffd43b" />
        <path d="M54 80 Q60 100 66 80z" fill="#f97316" />
      </>
    ),
  },
  {
    id: "schneemann",
    name: "Flocke",
    season: [1201, 228],
    anim: "wobble",
    sound: "snowman",
    art: (
      <>
        <circle cx="60" cy="84" r="28" fill="#f8fafc" />
        <circle cx="60" cy="44" r="22" fill="#f8fafc" />
        <rect x="42" y="14" width="36" height="8" rx="3" fill="#1b1d33" />
        <rect x="48" y="0" width="24" height="18" rx="3" fill="#1b1d33" />
        <Eyes y={40} r={4} dx={8} />
        <path d="M60 46 L76 50 L60 52z" fill="#f97316" />
        <path d="M38 64 Q60 72 82 64" stroke="#dc2626" strokeWidth="7" fill="none" strokeLinecap="round" />
        <circle cx="60" cy="80" r="3" fill="#1b1d33" />
        <circle cx="60" cy="92" r="3" fill="#1b1d33" />
      </>
    ),
  },
  {
    id: "clown",
    name: "Tröti",
    season: [201, 305],
    anim: "spin",
    sound: "clown",
    art: (
      <>
        <circle cx="34" cy="50" r="14" fill="#f97316" />
        <circle cx="86" cy="50" r="14" fill="#f97316" />
        <circle cx="60" cy="62" r="32" fill="#fff1e6" />
        <path d="M44 34 L60 4 L76 34z" fill="#8b5cf6" />
        <circle cx="60" cy="4" r="5" fill="#ffd43b" />
        <Eyes y={54} r={5} dx={12} />
        <circle cx="60" cy="66" r="8" fill="#ef4444" />
        <Smile y={76} w={14} />
      </>
    ),
  },
  {
    id: "hase",
    name: "Hoppel",
    season: [315, 425],
    anim: "hop",
    sound: "bunny",
    art: (
      <>
        <ellipse cx="44" cy="26" rx="9" ry="24" fill="#f5f5f4" />
        <ellipse cx="76" cy="26" rx="9" ry="24" fill="#f5f5f4" />
        <ellipse cx="44" cy="28" rx="4" ry="16" fill="#fbcfe8" />
        <ellipse cx="76" cy="28" rx="4" ry="16" fill="#fbcfe8" />
        <circle cx="60" cy="72" r="32" fill="#f5f5f4" />
        <Eyes y={66} r={5} dx={12} />
        <ellipse cx="60" cy="78" rx="4" ry="3" fill="#f472b6" />
        <Smile y={84} w={7} />
        <Cheeks y={80} dx={20} />
      </>
    ),
  },
  {
    id: "biene",
    name: "Summsi",
    season: [401, 615],
    anim: "buzz",
    sound: "bee",
    art: (
      <>
        <ellipse cx="44" cy="38" rx="16" ry="12" fill="#e0f2fe" opacity="0.9" />
        <ellipse cx="76" cy="38" rx="16" ry="12" fill="#e0f2fe" opacity="0.9" />
        <ellipse cx="60" cy="70" rx="36" ry="28" fill="#facc15" />
        <path d="M44 46 Q40 70 44 94 M60 42 V98 M76 46 Q80 70 76 94" stroke="#1b1d33" strokeWidth="7" fill="none" opacity="0.85" />
        <circle cx="60" cy="62" r="20" fill="#facc15" />
        <Eyes y={60} r={4.5} dx={8} />
        <Smile y={70} w={7} />
      </>
    ),
  },
  {
    id: "sonne",
    name: "Sunny",
    season: [616, 831],
    anim: "spin",
    sound: "sun",
    art: (
      <>
        <g stroke="#f59f00" strokeWidth="7" strokeLinecap="round">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="60" y1="8" x2="60" y2="20" transform={`rotate(${a} 60 60)`} />
          ))}
        </g>
        <circle cx="60" cy="60" r="32" fill="#ffd43b" />
        <Eyes y={54} r={5} dx={11} />
        <Smile y={68} w={11} />
        <Cheeks y={64} dx={20} />
      </>
    ),
  },
  {
    id: "eis",
    name: "Schlecki",
    season: [620, 831],
    anim: "wobble",
    sound: "icecream",
    art: (
      <>
        <path d="M38 62 L60 116 L82 62z" fill="#d97706" />
        <path d="M44 70 L76 70 M48 82 L72 82" stroke="#b45309" strokeWidth="3" />
        <circle cx="60" cy="44" r="26" fill="#f9a8d4" />
        <circle cx="52" cy="20" r="6" fill="#ef4444" />
        <Eyes y={42} r={4.5} dx={9} />
        <Smile y={52} w={7} />
      </>
    ),
  },
  {
    id: "igel",
    name: "Pieks",
    season: [901, 1130],
    anim: "roll",
    sound: "hedgehog",
    art: (
      <>
        <path d="M18 80 L24 50 L34 64 L40 34 L50 56 L58 28 L64 54 L74 32 L78 58 L90 44 L88 70 L100 66 L92 86z" fill="#78350f" />
        <ellipse cx="62" cy="80" rx="40" ry="22" fill="#a16207" />
        <ellipse cx="90" cy="82" rx="16" ry="14" fill="#fde68a" />
        <circle cx="104" cy="82" r="4" fill="#1b1d33" />
        <circle cx="92" cy="76" r="3.5" fill="#1b1d33" />
        <circle cx="93" cy="75" r="1.2" fill="#fff" />
      </>
    ),
  },

  // ---- das ganze Jahr ----
  {
    id: "wuschel",
    name: "Wuschel",
    anim: "bounce",
    sound: "monster",
    art: (
      <>
        <path d="M24 70 Q18 40 34 36 Q32 18 50 22 Q60 8 72 22 Q90 18 88 36 Q104 42 96 70 Q104 96 80 100 H40 Q16 96 24 70z" fill="#14b8a6" />
        <Eyes y={54} r={8} dx={14} />
        <path d="M46 74 Q60 90 74 74z" fill="#1b1d33" />
        <path d="M54 76 h4 v5 h-4z M62 76 h4 v5 h-4z" fill="#fff" />
      </>
    ),
  },
  {
    id: "frosch",
    name: "Quaki",
    anim: "hop",
    sound: "frog",
    art: (
      <>
        <circle cx="40" cy="38" r="14" fill="#4ade80" />
        <circle cx="80" cy="38" r="14" fill="#4ade80" />
        <ellipse cx="60" cy="72" rx="40" ry="30" fill="#4ade80" />
        <Eyes y={38} r={8} dx={20} />
        <path d="M36 74 Q60 96 84 74" stroke="#166534" strokeWidth="4" fill="none" strokeLinecap="round" />
        <Cheeks y={72} dx={30} />
      </>
    ),
  },
  {
    id: "eule",
    name: "Uhu",
    anim: "wobble",
    sound: "owl",
    art: (
      <>
        <path d="M30 40 L36 18 L48 32z M90 40 L84 18 L72 32z" fill="#92400e" />
        <ellipse cx="60" cy="68" rx="34" ry="40" fill="#b45309" />
        <ellipse cx="60" cy="80" rx="22" ry="24" fill="#fde68a" />
        <circle cx="46" cy="50" r="12" fill="#fff" />
        <circle cx="74" cy="50" r="12" fill="#fff" />
        <circle cx="47" cy="51" r="6" fill="#1b1d33" />
        <circle cx="75" cy="51" r="6" fill="#1b1d33" />
        <path d="M54 60 L66 60 L60 70z" fill="#f59f00" />
      </>
    ),
  },
  {
    id: "roboter",
    name: "Bip",
    anim: "wave",
    sound: "robot",
    art: (
      <>
        <line x1="60" y1="8" x2="60" y2="22" stroke="#94a3b8" strokeWidth="4" />
        <circle cx="60" cy="8" r="6" fill="#ef4444" />
        <rect x="26" y="22" width="68" height="56" rx="14" fill="#94a3b8" />
        <rect x="36" y="34" width="48" height="26" rx="8" fill="#1e293b" />
        <circle cx="50" cy="47" r="6" fill="#22d3ee" />
        <circle cx="70" cy="47" r="6" fill="#22d3ee" />
        <rect x="44" y="66" width="32" height="5" rx="2.5" fill="#1e293b" />
        <rect x="36" y="82" width="48" height="26" rx="8" fill="#64748b" />
      </>
    ),
  },
  {
    id: "dino",
    name: "Rexi",
    anim: "bounce",
    sound: "dino",
    art: (
      <>
        <path d="M22 96 Q20 60 46 54 Q46 24 72 22 Q100 22 100 46 Q100 60 84 62 L76 62 Q80 96 64 100z" fill="#34d399" />
        <path d="M30 66 l6 -10 l6 8 l6 -10 l6 8" stroke="#059669" strokeWidth="4" fill="none" strokeLinejoin="round" />
        <circle cx="80" cy="38" r="6" fill="#fff" />
        <circle cx="81" cy="39" r="3" fill="#1b1d33" />
        <path d="M76 52 Q88 58 98 50" stroke="#065f46" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "krake",
    name: "Blubb",
    anim: "wobble",
    sound: "octopus",
    art: (
      <>
        <g fill="#c084fc">
          {[24, 40, 56, 72, 88].map((x) => (
            <path key={x} d={`M${x} 70 Q${x - 6} 92 ${x + 2} 108 Q${x + 10} 92 ${x + 8} 70z`} />
          ))}
        </g>
        <ellipse cx="60" cy="54" rx="36" ry="32" fill="#c084fc" />
        <Eyes y={52} r={7} dx={13} />
        <Smile y={66} w={9} />
        <Cheeks y={62} dx={24} />
      </>
    ),
  },
];

// ---- Auswahl der Woche ----
function mmdd(d: Date) {
  return (d.getMonth() + 1) * 100 + d.getDate();
}

function inSeason(season: [number, number], today: number) {
  const [from, to] = season;
  return from <= to ? today >= from && today <= to : today >= from || today <= to;
}

function seasonLength([from, to]: [number, number]) {
  const day = (v: number) => Math.floor(v / 100) * 31 + (v % 100);
  return from <= to ? day(to) - day(from) : 12 * 31 - day(from) + day(to);
}

/** Zwei Figuren pro Woche: die passende zur Jahreszeit (die speziellste zuerst) und eine wechselnde */
export function figuresOfTheWeek(date = new Date()): Figure[] {
  const week = Math.floor((date.getTime() / 86400000 + 3) / 7); // Wechsel jeden Montag
  const today = mmdd(date);
  const seasonal = FIGURES.filter((f) => f.season && inSeason(f.season, today)).sort(
    (a, b) => seasonLength(a.season!) - seasonLength(b.season!),
  );
  const yearRound = FIGURES.filter((f) => !f.season);
  const pick = (n: number) => yearRound[((week + n) % yearRound.length + yearRound.length) % yearRound.length];
  // Kurze Anlässe (Nikolaus, Halloween, Silvester …) zeigen sich jede Woche, Jahreszeiten-Figuren (z. B. Igel im
  // Herbst) nur jede zweite – so gibt es jede Woche etwas Neues zu entdecken
  const special = seasonal.filter((f) => seasonLength(f.season!) <= 45);
  const long = seasonal.filter((f) => seasonLength(f.season!) > 45);
  const longPick = long.length ? long[Math.floor(week / 2) % long.length] : null;
  if (special.length) return [special[0], week % 2 && longPick ? longPick : pick(0)];
  if (longPick && week % 2 === 0) return [longPick, pick(0)];
  return [pick(0), pick(3)];
}

export function FigureTile({ figure }: { figure: Figure }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<FigureScene | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);

  // 3D-Figur erst laden, wenn sie sichtbar wird; nur animieren, solange sie zu sehen ist
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === "undefined") return;
    let disposed = false;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (entry.isIntersecting) {
          if (!sceneRef.current) {
            try {
              const { createFigureScene } = await import("@/lib/figures3d");
              if (disposed) return;
              sceneRef.current = await createFigureScene(canvas, figure.id, figure.anim);
              setReady(true);
            } catch {
              return; // kein WebGL: gezeichnete Figur bleibt
            }
          }
          if (document.visibilityState === "visible") sceneRef.current?.start();
        } else {
          sceneRef.current?.stop();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(canvas);
    const onVis = () => (document.visibilityState === "visible" ? null : sceneRef.current?.stop());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true;
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [figure.id, figure.anim]);

  return (
    <button
      className={`figure-tile anim-${figure.anim} ${active && !ready ? "active" : ""} ${ready ? "is-3d" : ""}`}
      onClick={() => {
        playSound(figure.sound);
        if (sceneRef.current) sceneRef.current.tap();
        else setActive((n) => n + 1);
      }}
      onAnimationEnd={() => setActive(0)}
      aria-label={`${figure.name} antippen`}
    >
      <span className="figure-stage">
        <canvas ref={canvasRef} className="figure-canvas" width={130} height={130} />
        {!ready && (
          <svg viewBox="0 0 120 120" className="figure-art" aria-hidden="true" key={active}>
            {figure.art}
          </svg>
        )}
      </span>
      <span className="figure-name">{figure.name}</span>
    </button>
  );
}

/** Figuren in eine Reihe einstreuen: nach jedem 5. Inhalt eine, höchstens zwei pro Reihe */
export function withFigures(children: ReactNode[], salt = 0, every = 5, max = 2): ReactNode[] {
  const figs = figuresOfTheWeek();
  const out: ReactNode[] = [];
  let used = 0;
  children.forEach((child, i) => {
    out.push(child);
    if ((i + 1) % every === 0 && used < max && i < children.length - 1) {
      const f = figs[(used + salt) % figs.length];
      out.push(<FigureTile key={`fig-${f.id}-${i}`} figure={f} />);
      used++;
    }
  });
  // Kurze Reihen (weniger als 5 Inhalte): eine Figur ans Ende
  if (!used && children.length >= 3) {
    const f = figs[salt % figs.length];
    out.push(<FigureTile key={`fig-${f.id}-end`} figure={f} />);
  }
  return out;
}
