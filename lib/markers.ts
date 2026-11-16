"use client";

// Sprungmarken einer Folge:
// 1. KI-Analyse der echten Audiodatei (/api/analyze) – Zeiten inklusive Werbung, für alle MP3-Podcasts
// 2. Ersatz: Kapitel oder Transkript (/api/markers) – Zeiten ohne eingefügte Werbung
// 3. Ersatz: von Eltern pro Podcast eingestellter Vorspann
import { PODCASTS, type MediaItem } from "./library";
import { read, write } from "./store";
import { log } from "./diagnostics";

export type Markers = {
  /** Beginn der Geschichte in Sekunden */
  story: number | null;
  /** Ende der Fremdwerbung in Sekunden (nur KI) */
  content: number;
  /** Länge der analysierten Datei, um abweichende Werbelänge auf dem Gerät auszugleichen */
  totalSec: number | null;
  /** true: Zeiten gelten in der echten Datei; false: in der Folge ohne eingefügte Werbung */
  absolute: boolean;
  source: "ki" | "chapters" | "transcript" | "eingestellt" | "none";
  firstWords?: string | null;
};

const key = (id: string) => `leocast:markers2:${id}`;
const manualKey = (podcastId: string) => `leocast:intro:${podcastId}`;
const autoKey = (podcastId: string) => `leocast:autostory:${podcastId}`;
const pending = new Map<string, Promise<Markers | null>>();

export function getManualIntro(podcastId: string): number | null {
  return read<number | null>(manualKey(podcastId), null);
}
export function setManualIntro(podcastId: string, sec: number | null) {
  write(manualKey(podcastId), sec);
}
/** Automatisch zur Geschichte springen (statt nur den Knopf zu zeigen) */
export function getAutoStory(podcastId: string): boolean {
  return read<boolean>(autoKey(podcastId), false);
}
export function setAutoStory(podcastId: string, on: boolean) {
  write(autoKey(podcastId), on);
}

export async function aiConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/analyze?check=1");
    return Boolean((await res.json()).configured);
  } catch {
    return false;
  }
}

async function fromAi(item: MediaItem): Promise<Markers | null> {
  if (!item.audioUrl) return null;
  const res = await fetch(`/api/analyze?audio=${encodeURIComponent(item.audioUrl)}`);
  const data = await res.json();
  if (!res.ok) {
    log("info", `KI-Analyse „${item.title}“: ${data.error || res.status}`);
    return null;
  }
  log("ok", `KI-Analyse „${item.title}“: Geschichte ab ${fmt(data.storyStart)} – ${data.reason || ""}`);
  return {
    story: data.storyStart,
    content: data.contentStart || 0,
    totalSec: data.totalSec,
    absolute: true,
    source: "ki",
    firstWords: data.firstWords,
  };
}

async function fromTranscript(item: MediaItem): Promise<Markers | null> {
  if (!item.transcriptUrl && !item.chaptersUrl) return null;
  const source = PODCASTS.find((p) => p.id === item.podcastId);
  const q = new URLSearchParams();
  if (item.chaptersUrl) q.set("chapters", item.chaptersUrl);
  if (item.transcriptUrl) q.set("transcript", item.transcriptUrl);
  if (item.transcriptType) q.set("type", item.transcriptType);
  if (source?.introWords) q.set("intro", source.introWords);
  const res = await fetch(`/api/markers?${q.toString()}`);
  const data = await res.json();
  if (!data.storyStart) return null;
  return { story: data.storyStart, content: 0, totalSec: null, absolute: false, source: data.source };
}

function fmt(sec: number | null | undefined) {
  if (sec == null) return "–";
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

/** Sprungmarken einer Folge (einmal ermittelt, dann auf dem Gerät gespeichert – auch offline nutzbar) */
export function getMarkers(item: MediaItem): Promise<Markers | null> {
  if (item.kind !== "episode") return Promise.resolve(null);
  const cached = read<Markers | null>(key(item.id), null);
  if (cached) return Promise.resolve(cached);
  const manual = (): Markers | null => {
    const m = item.podcastId ? getManualIntro(item.podcastId) : null;
    return m ? { story: m, content: 0, totalSec: null, absolute: true, source: "eingestellt" } : null;
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve(manual());
  const running = pending.get(item.id);
  if (running) return running;
  const job = (async () => {
    let m: Markers | null = null;
    try {
      m = (await fromAi(item)) || (await fromTranscript(item));
    } catch (e) {
      log("info", `Sprungmarke „${item.title}“: ${(e as Error).message}`);
    }
    if (m) write(key(item.id), m);
    return m || manual();
  })().finally(() => pending.delete(item.id));
  pending.set(item.id, job);
  return job;
}

/** Vorab ermitteln (z. B. beim Speichern für unterwegs oder beim Öffnen einer Sendung) */
export function prefetchMarkers(item: MediaItem) {
  getMarkers(item).catch(() => {});
}

export { fmt as fmtMinSec };
