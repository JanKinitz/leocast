"use client";

// Podcast-Feeds laden (über /api/feed), Feed-Adressen bei Bedarf über die Suche finden, offline aus dem Speicher.
import type { MediaItem, PodcastSource } from "./library";
import { read, write } from "./store";
import { log } from "./diagnostics";
import { hashUrl, loadMarkerIndex } from "./markers";
import filter from "./content-filter.json";

export type Episode = {
  guid: string;
  title: string;
  audioUrl: string;
  image?: string;
  durationSec?: number;
  audioBytes?: number;
  published?: string;
  episodeType?: string;
  transcriptUrl?: string;
  transcriptType?: string;
  chaptersUrl?: string;
};

export type Feed = { title: string; image?: string; episodes: Episode[]; loadedAt: number };

const feedKey = (id: string) => `leocast:feed4:${id}`;
const feedUrlKey = (id: string) => `leocast:feedurl:${id}`;

export function cachedFeed(id: string): Feed | null {
  return read<Feed | null>(feedKey(id), null);
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveFeedUrl(source: PodcastSource): Promise<string> {
  if (source.feedUrl) return source.feedUrl;
  const cached = read<string | null>(feedUrlKey(source.id), null);
  if (cached) return cached;
  const res = await fetch(`/api/podcast-search?q=${encodeURIComponent(source.search)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Suche fehlgeschlagen");
  const wanted = normalize(source.name);
  const results: { name: string; feedUrl: string }[] = data.results || [];
  const hit =
    results.find((r) => normalize(r.name) === wanted) ||
    results.find((r) => normalize(r.name).includes(wanted)) ||
    results[0];
  if (!hit) throw new Error(`Kein offener Feed für „${source.name}“ gefunden`);
  write(feedUrlKey(source.id), hit.feedUrl);
  log("ok", `Feed für „${source.name}“ gefunden: ${hit.name}`);
  return hit.feedUrl;
}

const inflight = new Map<string, Promise<Feed>>();

const SNAKE = new RegExp(filter.snake, "i");
const SNAKE_IGNORE = new RegExp(filter.snakeIgnore, "gi");
/** Kommt eine Schlange vor? („Schlange stehen“ zählt nicht) */
export function mentionsSnake(text: string): boolean {
  return SNAKE.test(text.toLowerCase().replace(SNAKE_IGNORE, " "));
}

/** Folgen ausblenden, die die Vorab-Analyse markiert hat (z. B. Schlange am Anfang) */
async function dropHidden(feed: Feed): Promise<Feed> {
  try {
    const idx = await loadMarkerIndex();
    const hidden = idx?.hidden;
    if (!hidden || !Object.keys(hidden).length) return feed;
    const keep: Episode[] = [];
    for (const e of feed.episodes) if (!hidden[await hashUrl(e.audioUrl)]) keep.push(e);
    return keep.length === feed.episodes.length ? feed : { ...feed, episodes: keep };
  } catch {
    return feed;
  }
}

export function loadFeed(source: PodcastSource, maxAgeMs = 30 * 60 * 1000): Promise<Feed> {
  const cached = cachedFeed(source.id);
  if (cached && Date.now() - cached.loadedAt < maxAgeMs) return dropHidden(cached);
  if (typeof navigator !== "undefined" && !navigator.onLine && cached) return dropHidden(cached);
  const existing = inflight.get(source.id);
  if (existing) return existing;
  const p = (async () => {
    try {
      const url = await resolveFeedUrl(source);
      const res = await fetch(`/api/feed?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      let episodes: Episode[] = (data.episodes || []).map((e: any) => ({
        guid: e.guid,
        title: e.title,
        audioUrl: e.audioUrl,
        image: e.image || data.image,
        durationSec: e.durationSec,
        audioBytes: e.audioBytes,
        published: e.published,
        episodeType: e.episodeType,
        transcriptUrl: e.transcriptUrl,
        transcriptType: e.transcriptType,
        chaptersUrl: e.chaptersUrl,
      }));
      const before = episodes.length;
      const kidsOnly = new Set(
        (data.episodes || [])
          .filter((e: { title: string }) => !source.onlyKids || isForKids(e))
          .map((e: { guid?: string; audioUrl: string }) => e.guid || e.audioUrl),
      );
      episodes = episodes.filter(
        (e) => isRealContent(e) && !(source.hideTitle && source.hideTitle.test(e.title)) && kidsOnly.has(e.guid || e.audioUrl),
      );
      if (before !== episodes.length) log("info", `„${source.name}“: ${before - episodes.length} Folgen ohne echten Inhalt ausgeblendet`);
      // Folgen mit Schlangen ausblenden (Titel oder Beschreibung)
      const descr = new Map<string, string>((data.episodes || []).map((e: any) => [e.guid, String(e.description || "")]));
      const n = episodes.length;
      episodes = episodes.filter((e) => !mentionsSnake(`${e.title} ${descr.get(e.guid) || ""}`));
      if (n !== episodes.length) log("info", `„${source.name}“: ${n - episodes.length} Folgen mit Schlange ausgeblendet`);
      const feed = await dropHidden({ title: data.title, image: data.image, episodes, loadedAt: Date.now() });
      write(feedKey(source.id), feed);
      return feed;
    } catch (e) {
      log("error", `Feed „${source.name}“: ${(e as Error).message}`);
      if (cached) return cached;
      throw e;
    } finally {
      inflight.delete(source.id);
    }
  })();
  inflight.set(source.id, p);
  return p;
}

// Ankündigungen, Pausen-Hinweise, Trailer und sehr kurze Folgen sind keine echten Inhalte
const NOT_CONTENT = /\b(ankündigung|trailer|teaser|vorschau|pause|sommerpause|winterpause|in eigener sache|hinweis|neuigkeiten|news|update|bonus-?info)\b/i;

// Zielgruppe einer Folge aus Titel, Untertitel, Stichworten (und Beschreibung) ablesen.
// „onlyKids“: nur Folgen, die ausdrücklich für Kinder sind – nicht „für Erwachsene“ und nicht „für Erwachsene & Kinder“.
const ADULT = /erwachsen/i;
const KIDS = /\b(kinder\w*|kind|kids)\b/i;

export function isForKids(e: { title: string; subtitle?: string; keywords?: string; description?: string }): boolean {
  const head = [e.title, e.subtitle, e.keywords].filter(Boolean).join(" ");
  if (ADULT.test(head)) return false;
  return KIDS.test(head) || KIDS.test(e.description || "");
}

export function isRealContent(e: Episode): boolean {
  if (e.episodeType === "trailer" || e.episodeType === "bonus") return false;
  const dur = e.durationSec || 0;
  if (dur > 0 && dur < 240) return false;
  if (NOT_CONTENT.test(e.title) && (dur === 0 || dur < 600)) return false;
  return true;
}

export function episodeItem(ep: Episode, source: PodcastSource): MediaItem {
  return {
    kind: "episode",
    id: `ep:${source.id}:${ep.guid}`,
    title: ep.title,
    subtitle: source.name,
    image: ep.image,
    color: source.color,
    durationSec: ep.durationSec,
    audioBytes: ep.audioBytes,
    audioUrl: ep.audioUrl,
    transcriptUrl: ep.transcriptUrl,
    transcriptType: ep.transcriptType,
    chaptersUrl: ep.chaptersUrl,
    podcastId: source.id,
  };
}
