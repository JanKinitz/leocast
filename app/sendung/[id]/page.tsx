"use client";

// Sendungs-Welt: eigene Farbe, großes rundes Logo, Folgen als wischbare Reihen.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PlayTile, Rail } from "@/components/Tiles";
import { useFeed, useOnline } from "@/components/hooks";
import { IconBack, IconCloudDown, IconHeart } from "@/components/Icons";
import { podcastById } from "@/lib/library";
import { episodeItem } from "@/lib/podcasts";
import { getDownloads, getProgress, isLiked, markDownloaded, toggleLike, useStoreVersion } from "@/lib/store";
import { downloadEpisode, requestPersistentStorage } from "@/lib/offline";
import { log } from "@/lib/diagnostics";
import { prefetchMarkers } from "@/lib/markers";
import { img } from "@/lib/img";

export default function Sendung() {
  useStoreVersion();
  const { id } = useParams<{ id: string }>();
  const source = podcastById(id);
  const { feed, error } = useFeed(source);
  const online = useOnline();
  const [saving, setSaving] = useState<string | null>(null);

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
  const fresh = all.filter((it) => !getProgress(it.id)?.finished);
  const heard = all.filter((it) => getProgress(it.id)?.finished);
  const liked = isLiked(`pod:${source.id}`);
  const notSaved = fresh.filter((it) => !downloads[it.id]).slice(0, 3);

  async function saveForLater() {
    await requestPersistentStorage();
    for (const it of notSaved) {
      setSaving(it.id);
      const { result, detail } = await downloadEpisode(it.audioUrl!);
      if (result !== "failed") {
        markDownloaded(it, result);
        prefetchMarkers(it);
      }
      log(result === "failed" ? "error" : "ok", `Offline „${it.title}“: ${result} – ${detail}`);
    }
    setSaving(null);
  }

  return (
    <main className="page world" style={{ ["--world" as string]: source.color }}>
      <header className="world-top">
        <Link href="/" className="round-btn back-btn" aria-label="Zurück">
          <IconBack />
        </Link>
        <span className="world-name">{source.name}</span>
      </header>

      <div className="world-hero">
        <div className="world-logo" style={{ background: source.color }}>
          {feed?.image && <img src={img(feed.image, 640)} alt="" />}
        </div>
        <h1 className="world-title">{feed?.title || source.name}</h1>
        <div className="world-actions">
          <button
            className={`chip ${liked ? "on" : ""}`}
            aria-pressed={liked}
            onClick={() => toggleLike(`pod:${source.id}`, { podcastId: source.id, title: source.name, image: feed?.image })}
          >
            <IconHeart filled={liked} />
            Mag ich
          </button>
          {online && notSaved.length > 0 && (
            <button className="chip" onClick={saveForLater} disabled={!!saving}>
              <IconCloudDown />
              {saving ? "Speichere…" : "Für unterwegs speichern"}
            </button>
          )}
        </div>
      </div>

      {!feed && !error && <p className="hint">Lade Folgen…</p>}
      {error && !feed && <p className="hint">Die Folgen lassen sich gerade nicht laden.</p>}

      {fresh.length > 0 && (
        <Rail title={online ? "Neueste Folgen" : "Ohne Internet hörbar"}>
          {fresh.map((it) => (
            <PlayTile key={it.id} item={it} more={all} wide />
          ))}
        </Rail>
      )}

      {heard.length > 0 && (
        <Rail title="Schon gehört">
          {heard.map((it) => (
            <PlayTile key={it.id} item={it} more={all} />
          ))}
        </Rail>
      )}
    </main>
  );
}
