"use client";

// Player-Ansichten:
// - Handy: kleiner Player unten; Abspielen öffnet den Player als Vollbild.
// - Tablet quer: Player dauerhaft rechts, links weiter stöbern.
// - Tablet hochkant: Player dauerhaft unten.
import { useState } from "react";
import { isLiked, toggleLike, useStoreVersion } from "@/lib/store";
import { usePlayer, type SleepMode } from "./PlayerProvider";
import { PlayTile } from "./Tiles";
import { IconBack10, IconDown, IconFwd30, IconHeart, IconMoon, IconPause, IconPlay } from "./Icons";

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SLEEP_OPTIONS: { mode: SleepMode; label: string }[] = [
  { mode: "end", label: "Nach dieser Folge" },
  { mode: 15, label: "In 15 Minuten" },
  { mode: 30, label: "In 30 Minuten" },
  { mode: 45, label: "In 45 Minuten" },
];

function MiniPlayer() {
  const p = usePlayer();
  if (!p.current) return null;
  return (
    <div className="mini-player">
      <button className="mini-open" onClick={p.open} aria-label="Player öffnen">
        <span className="mini-cover" style={{ background: p.current.color || "#2a2f55" }}>
          {p.current.image && <img src={p.current.image} alt="" />}
        </span>
        <span className="mini-title">{p.current.title}</span>
      </button>
      <button className="round-btn big" onClick={p.toggle} aria-label={p.playing ? "Pause" : "Abspielen"}>
        {p.playing ? <IconPause size={26} /> : <IconPlay size={26} />}
      </button>
    </div>
  );
}

function FullPlayer() {
  useStoreVersion();
  const p = usePlayer();
  const [sleepOpen, setSleepOpen] = useState(false);
  if (!p.current) return null;
  const item = p.current;
  const liked = isLiked(item.id);
  const remainingMin = p.sleepEndsAt ? Math.max(1, Math.ceil((p.sleepEndsAt - Date.now()) / 60000)) : null;

  return (
    <div className="full-player" style={{ ["--world" as string]: item.color || "#1f3a5c" }}>
      <div className="fp-top">
        <button className="round-btn fp-close" onClick={p.close} aria-label="Player verkleinern">
          <IconDown />
        </button>
        <span className="fp-grip" aria-hidden="true" />
        <span className="fp-top-spacer" />
      </div>

      <div className="fp-main">
        <div className="fp-cover" style={{ background: item.color || "#2a2f55" }}>
          {item.image && <img src={item.image} alt="" />}
        </div>
        <div className="fp-body">
          <h2 className="fp-title">{item.title}</h2>
          {item.subtitle && <div className="fp-subtitle">{item.subtitle}</div>}

          <div className="fp-progress">
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(p.duration))}
              value={Math.floor(p.position)}
              onChange={(e) => p.seekTo(Number(e.target.value))}
              aria-label="Stelle in der Folge"
              style={{ ["--pct" as string]: `${p.duration ? (p.position / p.duration) * 100 : 0}%` }}
            />
            <div className="fp-times">
              <span>{fmt(p.position)}</span>
              <span>-{fmt(p.duration - p.position)}</span>
            </div>
          </div>

          <div className="fp-controls">
            <button className="round-btn mid" onClick={() => p.seekBy(-10)} aria-label="10 Sekunden zurück">
              <IconBack10 />
              <span className="btn-mini-label">10</span>
            </button>
            <button className="round-btn huge" onClick={p.toggle} aria-label={p.playing ? "Pause" : "Abspielen"}>
              {p.playing ? <IconPause size={44} /> : <IconPlay size={44} />}
            </button>
            <button className="round-btn mid" onClick={() => p.seekBy(30)} aria-label="30 Sekunden vor">
              <IconFwd30 />
              <span className="btn-mini-label">30</span>
            </button>
          </div>

          {p.error && <div className="fp-error">{p.error}</div>}

          <div className="fp-actions">
            <button
              className={`chip ${liked ? "on" : ""}`}
              onClick={() => toggleLike(item.id, { item, title: item.title, image: item.image })}
              aria-pressed={liked}
            >
              <IconHeart filled={liked} />
              Mag ich
            </button>
            <div className="sleep">
              <button className={`chip ${p.sleep !== "end" ? "on" : ""}`} onClick={() => setSleepOpen((o) => !o)} aria-expanded={sleepOpen}>
                <IconMoon />
                {remainingMin ? `Schlafen in ${remainingMin} Min.` : "Schlafen"}
              </button>
              {sleepOpen && (
                <div className="sleep-menu" role="menu">
                  {SLEEP_OPTIONS.map((o) => (
                    <button
                      key={String(o.mode)}
                      role="menuitemradio"
                      aria-checked={p.sleep === o.mode}
                      className={p.sleep === o.mode ? "on" : ""}
                      onClick={() => {
                        p.setSleep(o.mode);
                        setSleepOpen(false);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {p.more.length > 0 && (
        <div className="fp-more">
          <h3>Mehr von {item.subtitle || "hier"}</h3>
          <div className="rail">
            {p.more.map((m) => (
              <PlayTile key={m.id} item={m} more={[item, ...p.more]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlayerDock() {
  const p = usePlayer();
  if (!p.current) return null;
  return (
    <>
      <div className="dock-mini">
        <MiniPlayer />
      </div>
      <aside className={`dock-full ${p.expanded ? "expanded" : ""}`} aria-label="Player">
        <FullPlayer />
      </aside>
    </>
  );
}
