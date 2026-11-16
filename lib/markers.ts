"use client";

// Sprungmarken einer Folge:
// 1. KI-Analyse der echten Audiodatei (/api/analyze) – Zeiten inklusive Werbung, für alle MP3-Podcasts
// 2. Ersatz: Kapitel oder Transkript (/api/markers) – Zeiten ohne eingefügte Werbung
// 3. Ersatz: von Eltern pro Podcast eingestellter Vorspann
import { podcastById, type MediaItem } from "./library";
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
  id?: string;
  hash?: string;
  /** Nur KI: Abschnitte mit Einordnung (W Werbung, I Vorspann, E Entspannung, G Geschichte, O Abspann) */
  segments?: { t: number; l: string; text: string }[];
  model?: string;
  reason?: string;
  title?: string;
  corrected?: boolean;
};

/** Alle gespeicherten KI-Analysen (für den Elternbereich) */
export function analysedEpisodes(): Markers[] {
  if (typeof localStorage === "undefined") return [];
  const out: Markers[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("leocast:markers3:")) {
      const m = read<Markers | null>(k, null);
      if (m?.source === "ki" && m.id) out.push(m);
    }
  }
  return out;
}

/** Analyse einer Folge verwerfen, damit sie neu gemacht wird */
export function forgetMarkers(id: string) {
  write(nonceKey(id), Date.now());
  if (typeof localStorage !== "undefined") localStorage.removeItem(key(id));
  write(key(id), null);
}

/** Eltern korrigieren den Beginn der Geschichte für genau diese Folge */
export function setStoryStart(id: string, sec: number) {
  const m = read<Markers | null>(key(id), null);
  if (m) write(key(id), { ...m, story: sec, corrected: true });
}

const key = (id: string) => `leocast:markers3:${id}`;
const nonceKey = (id: string) => `leocast:reanalyse:${id}`;
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

// ---- Vorab-Analysen aus GitHub (Zweig „markers“, gefüllt von .github/workflows/analyse.yml) ----
const RAW = "https://raw.githubusercontent.com/JanKinitz/leocast/markers";
const INDEX_KEY = "leocast:marker-index";
type IndexEntry = {
  storyStart?: number | null;
  contentStart?: number;
  totalSec?: number | null;
  reason?: string;
  model?: string;
  firstWords?: string | null;
  error?: string;
};
type MarkerIndex = { at: number; entries: Record<string, IndexEntry> };
let indexJob: Promise<MarkerIndex | null> | null = null;

export async function hashUrl(url: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(url.trim()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verzeichnis der vorab analysierten Folgen (alle 20 Minuten neu, offline aus dem Speicher) */
export function loadMarkerIndex(): Promise<MarkerIndex | null> {
  const stored = read<MarkerIndex | null>(INDEX_KEY, null);
  const fresh = stored && Date.now() - stored.at < 20 * 60 * 1000;
  if (fresh || (typeof navigator !== "undefined" && !navigator.onLine)) return Promise.resolve(stored);
  if (!indexJob) {
    indexJob = fetch(`${RAW}/index.json`, { cache: "no-cache" })
      .then(async (res) => {
        if (!res.ok) return stored;
        const data = await res.json();
        const idx: MarkerIndex = { at: Date.now(), entries: data.entries || {} };
        if (typeof localStorage !== "undefined") localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
        return idx;
      })
      .catch(() => stored)
      .finally(() => {
        indexJob = null;
      });
  }
  return indexJob;
}

async function fromIndex(item: MediaItem): Promise<Markers | null> {
  if (!item.audioUrl) return null;
  const idx = await loadMarkerIndex();
  if (!idx) return null;
  const hash = await hashUrl(item.audioUrl);
  const e = idx.entries[hash];
  if (!e || e.error) return null;
  return {
    story: e.storyStart ?? null,
    content: e.contentStart || 0,
    totalSec: e.totalSec ?? null,
    absolute: true,
    source: "ki",
    id: item.id,
    hash,
    title: item.title,
    reason: e.reason,
    model: e.model,
    firstWords: e.firstWords,
  };
}

/** Abschnitte einer vorab analysierten Folge nachladen (für die Prüfansicht im Elternbereich) */
export async function loadSegments(hash: string): Promise<Markers["segments"] | null> {
  try {
    const res = await fetch(`${RAW}/segments/${hash}.json`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

let quotaUntil = 0;
/** true, solange das kostenlose KI-Kontingent aufgebraucht ist */
export function aiPaused() {
  return Date.now() < quotaUntil;
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
  if (!item.audioUrl || aiPaused()) return null;
  const show = item.podcastId ? podcastById(item.podcastId)?.name || "" : "";
  const q = new URLSearchParams({ v: "2", audio: item.audioUrl, title: item.title, show, debug: "1" });
  const nonce = read<number | null>(nonceKey(item.id), null);
  if (nonce) q.set("r", String(nonce));
  const res = await fetch(`/api/analyze?${q.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 429) quotaUntil = Date.now() + 60 * 60 * 1000;
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
    id: item.id,
    firstWords: data.firstWords,
    segments: data.segments,
    model: data.model,
    reason: data.reason,
    title: item.title,
  };
}

async function fromTranscript(item: MediaItem): Promise<Markers | null> {
  if (!item.transcriptUrl && !item.chaptersUrl) return null;
  const source = item.podcastId ? podcastById(item.podcastId) : undefined;
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
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  // Ergebnisse ohne KI nur behalten, bis die KI-Analyse klappt
  if (cached && (cached.source === "ki" || offline)) return Promise.resolve(cached);
  const manual = (): Markers | null => {
    const m = item.podcastId ? getManualIntro(item.podcastId) : null;
    return m ? { story: m, content: 0, totalSec: null, absolute: true, source: "eingestellt" } : null;
  };
  if (offline) return Promise.resolve(manual());
  const running = pending.get(item.id);
  if (running) return running;
  const job = (async () => {
    let m: Markers | null = null;
    try {
      const reanalyse = read<number | null>(nonceKey(item.id), null);
      m =
        (reanalyse ? null : await fromIndex(item)) ||
        (await fromAi(item)) ||
        cached ||
        (await fromTranscript(item));
    } catch (e) {
      log("info", `Sprungmarke „${item.title}“: ${(e as Error).message}`);
    }
    if (m) write(key(item.id), m);
    return m || manual();
  })().finally(() => pending.delete(item.id));
  pending.set(item.id, job);
  return job;
}

/** Ist die Folge schon vorab (in GitHub) analysiert? */
export async function inIndex(item: MediaItem): Promise<boolean> {
  return !!(await fromIndex(item));
}

/** Liegt für die Folge schon eine Sprungmarke auf dem Gerät? */
export function hasMarkers(id: string): boolean {
  return read<Markers | null>(key(id), null)?.source === "ki";
}

/** Vorab ermitteln (z. B. beim Speichern für unterwegs oder beim Öffnen einer Sendung) */
export function prefetchMarkers(item: MediaItem) {
  getMarkers(item).catch(() => {});
}

export { fmt as fmtMinSec };
