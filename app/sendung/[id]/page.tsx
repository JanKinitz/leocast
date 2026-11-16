"use client";

// Sendungs-Welt: eigene Farbe, großes rundes Logo, Folgen als wischbare Reihen.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PlayTile, Rail } from "@/components/Tiles";
import { useFeed, useOnline } from "@/components/hooks";
import { IconBack, IconCloudDown, IconHeart } from "@/components/Icons";
import { podcastById } from "@/lib/library";
import { episodeItem } from "@/lib/podcasts";
import { getDownloads, getProgress, isLiked, toggleLike, useStoreVersion } from "@/lib/store";
import OfflinePicker from "@/components/OfflinePicker";
import { withFigures } from "@/components/Figures";
import { prefetchMarkers } from "@/lib/markers";
import { img } from "@/lib/img";

export default function Sendung() {
  useStoreVersion();
  const { id } = useParams<{ id: string }>();
  const source = podcastById(id);
  const { feed, error } = useFeed(source);
  const online = useOnline();
  const [picking, setPicking] = useState(false);

  // Die drei neuesten Folgen vorab analysieren, damit Sprungmarken beim Abspielen schon bereitstehen
  useEffect(() => {
    if (!feed || !source || !online) return;
    feed.episodes.slice(0, 3).forEach((ep) => prefetchMarkers(episodeItem(ep, source)));
  }, [feed, source, online]);

  if (!source) {
    return (
      <main className="page">
        <p>Diese Sendung gibt es hier nicht.</p>
        <Link className="button" href="/">
          Zur Startseite
        </Link>
      </main>
    );
  }

  const downloads = getDownloads();
  const all = (feed?.episodes || []).map((e) => episodeItem(e, source)).filter((it) => online || !!downloads[it.id]);
  // Neue Folgen zuerst, schon gehörte dahinter (mit Haken) – alles in einer Reihe, damit es auf einen Bildschirm passt
  const fresh = all.filter((it) => !getProgress(it.id)?.finished);
  const heard = all.filter((it) => getProgress(it.id)?.finished);
  const liked = isLiked(`pod:${source.id}`);
  const savedCount = all.filter((it) => downloads[it.id]).length;
  const logo = feed?.image || source.image;

  return (
    <main className="page world world-fit" style={{ ["--world" as string]: source.color }}>
      <header className="world-head">
        <Link href="/" className="round-btn back-btn" aria-label="Zurück">
          <IconBack />
        </Link>
        <div className="world-logo small" style={{ background: source.color }}>
          {logo && <img src={img(logo, 256)} alt="" />}
        </div>
        <h1 className="world-title">{source.name}</h1>
      </header>

      <div className="world-actions">
        <button
          className={`chip ${liked ? "on" : ""}`}
          aria-pressed={liked}
          onClick={() => toggleLike(`pod:${source.id}`, { podcastId: source.id, title: source.name, image: feed?.image })}
        >
          <IconHeart filled={liked} />
          Mag ich
        </button>
        {online && all.length > 0 && (
          <button className="chip" onClick={() => setPicking(true)}>
            <IconCloudDown />
            {savedCount ? `Unterwegs (${savedCount})` : "Für unterwegs"}
          </button>
        )}
      </div>

      {!feed && !error && <p className="hint">Lade Folgen…</p>}
      {error && !feed && <p className="hint">Die Folgen lassen sich gerade nicht laden.</p>}

      {all.length > 0 && (
        <Rail title={online ? "Folgen" : "Ohne Internet hörbar"}>
          {withFigures(
            [...fresh, ...heard].map((it) => <PlayTile key={it.id} item={it} more={all} wide />),
            1,
          )}
        </Rail>
      )}

      {picking && <OfflinePicker items={all} onClose={() => setPicking(false)} />}
    </main>
  );
}
