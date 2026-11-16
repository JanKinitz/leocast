"use client";

// Sprungmarke „Zur Geschichte“: aus Kapiteln/Transkript (über /api/markers) oder von Eltern pro Podcast eingestellt.
import { PODCASTS, type MediaItem } from "./library";
import { read, write } from "./store";
import { log } from "./diagnostics";

type Markers = { storyStart: number | null; source: string };

const key = (id: string) => `leocast:markers:${id}`;
const manualKey = (podcastId: string) => `leocast:intro:${podcastId}`;

/** Von Eltern eingestellter Vorspann in Sekunden (gilt für alle Folgen eines Podcasts) */
export function getManualIntro(podcastId: string): number | null {
  return read<number | null>(manualKey(podcastId), null);
}

export function setManualIntro(podcastId: string, sec: number | null) {
  write(manualKey(podcastId), sec);
}

/** Beginn der Geschichte in Sekunden, bezogen auf die Original-Folge (ohne eingefügte Werbung) */
export async function storyStart(item: MediaItem): Promise<{ sec: number; source: string } | null> {
  if (item.kind !== "episode") return null;
  const cached = read<Markers | null>(key(item.id), null);
  let markers = cached;
  if (!markers && (item.transcriptUrl || item.chaptersUrl) && navigator.onLine) {
    const source = PODCASTS.find((p) => p.id === item.podcastId);
    const q = new URLSearchParams();
    if (item.chaptersUrl) q.set("chapters", item.chaptersUrl);
    if (item.transcriptUrl) q.set("transcript", item.transcriptUrl);
    if (item.transcriptType) q.set("type", item.transcriptType);
    if (source?.introWords) q.set("intro", source.introWords);
    try {
      const res = await fetch(`/api/markers?${q.toString()}`);
      markers = (await res.json()) as Markers;
      write(key(item.id), markers);
    } catch {
      markers = null;
    }
  }
  if (markers?.storyStart) return { sec: markers.storyStart, source: markers.source };
  const manual = item.podcastId ? getManualIntro(item.podcastId) : null;
  if (manual) return { sec: manual, source: "eingestellt" };
  return null;
}

/** Beim Speichern für unterwegs gleich mit abfragen, damit es offline funktioniert */
export function prefetchMarkers(item: MediaItem) {
  storyStart(item).catch(() => log("info", "Sprungmarke nicht verfügbar"));
}
