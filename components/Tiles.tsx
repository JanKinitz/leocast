"use client";

// Reihen (Karussell zum Wischen) und große Kacheln
import Link from "next/link";
import type { ReactNode } from "react";
import type { MediaItem } from "@/lib/library";
import { getDownloads, getProgress, useStoreVersion } from "@/lib/store";
import { usePlayer } from "./PlayerProvider";
import { IconCheck, IconCloudCheck } from "./Icons";
import { img } from "@/lib/img";

export function Rail({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rail-section">
      <h2 className="rail-title">
        {icon}
        {title}
      </h2>
      <div className="rail">{children}</div>
    </section>
  );
}

function Cover({ image, color, label }: { image?: string; color?: string; label?: string }) {
  return (
    <div className="cover" style={{ background: color || "#2a2f55" }}>
      {image ? <img src={img(image, 384)} alt="" loading="lazy" /> : <span className="cover-label">{label}</span>}
    </div>
  );
}

export function LinkTile({
  href,
  title,
  image,
  color,
  size = "m",
}: {
  href: string;
  title: string;
  image?: string;
  color?: string;
  size?: "m" | "l";
}) {
  return (
    <Link href={href} className={`tile tile-${size}`}>
      <Cover image={image} color={color} label={title} />
      <span className="tile-title">{title}</span>
    </Link>
  );
}

function fmtMin(sec?: number) {
  if (!sec) return null;
  return `${Math.max(1, Math.round(sec / 60))} Min.`;
}

export function PlayTile({ item, more, wide = false }: { item: MediaItem; more?: MediaItem[]; wide?: boolean }) {
  useStoreVersion();
  const player = usePlayer();
  const progress = getProgress(item.id);
  const offline = !!getDownloads()[item.id];
  const isCurrent = player.current?.id === item.id;
  const pct = progress && progress.dur > 0 && !progress.finished ? Math.min(100, (progress.pos / progress.dur) * 100) : 0;
  return (
    <button className={`tile ${wide ? "tile-wide" : "tile-m"} ${isCurrent ? "is-current" : ""}`} onClick={() => player.play(item, more)}>
      <div className="cover-wrap">
        <Cover image={item.image} color={item.color} label={item.title} />
        {fmtMin(item.durationSec) && <span className="badge-duration">{fmtMin(item.durationSec)}</span>}
        {offline && (
          <span className="badge-icon" aria-label="Ohne Internet hörbar">
            <IconCloudCheck />
          </span>
        )}
        {progress?.finished && (
          <span className="badge-icon badge-done" aria-label="Schon gehört">
            <IconCheck />
          </span>
        )}
        {pct > 0 && (
          <span className="progress-line">
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
      <span className="tile-title">{item.title}</span>
    </button>
  );
}
