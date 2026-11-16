// Bibliothek: welche Podcasts und Kategorien Leocast zeigt.
// Später pflegen Eltern das im Elternbereich (und es wird zwischen den Geräten abgeglichen).

import { read, write } from "./store";
import defaults from "./default-podcasts.json";

export type MediaKind = "episode" | "track";

/** Ein abspielbarer Eintrag (Podcast-Folge oder Spotify-Titel). */
export type MediaItem = {
  kind: MediaKind;
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  color?: string;
  durationSec?: number;
  /** Podcast-Folge: Dateigröße laut Feed (für die Speicher-Auswahl) */
  audioBytes?: number;
  /** Podcast-Folge: Adresse der Audiodatei */
  audioUrl?: string;
  /** Podcast-Folge: Transkript/Kapitel für die Sprungmarke „Zur Geschichte“ */
  transcriptUrl?: string;
  transcriptType?: string;
  chaptersUrl?: string;
  /** Spotify-Titel: spotify:track:… */
  uri?: string;
  podcastId?: string;
  playlistId?: string;
};

export type PodcastSource = {
  id: string;
  name: string;
  /** Suchbegriff für das Podcast-Verzeichnis, falls keine Feed-Adresse bekannt ist */
  search: string;
  feedUrl?: string;
  /** Zusätzlich ausblenden, wenn der Titel passt (z. B. Folgen nur für Erwachsene) */
  hideTitle?: RegExp;
  /** Werbung vor der Folge automatisch überspringen */
  skipAds?: boolean;
  /** Zusätzliche Wörter, die zum Vorspann gehören (für die Transkript-Erkennung) */
  introWords?: string;
  color: string;
  category: "podcasts" | "gutenacht";
  /** Cover aus dem Verzeichnis (bis der Feed geladen ist) */
  image?: string;
  /** Sprungmarken per KI – Grundeinstellung (Eltern können es je Podcast ein- und ausschalten) */
  ai?: boolean;
};

// Feste Startbibliothek (auch vom Analyse-Skript in GitHub Actions gelesen)
export const PODCASTS: PodcastSource[] = (defaults as (Omit<PodcastSource, "hideTitle"> & { hideTitle?: string })[]).map(
  (p) => ({ ...p, hideTitle: p.hideTitle ? new RegExp(p.hideTitle, "i") : undefined }),
);

// ---- Von Eltern hinzugefügte und ausgeblendete Podcasts (auf dem Gerät gespeichert) ----
export type CustomPodcast = {
  id: string;
  name: string;
  feedUrl: string;
  image?: string;
  color: string;
  category: "podcasts" | "gutenacht";
};

const CUSTOM_KEY = "leocast:custom-podcasts";
const HIDDEN_KEY = "leocast:hidden-podcasts";
const CATEGORY_KEY = "leocast:podcast-category";

export function getCustomPodcasts(): CustomPodcast[] {
  return read<CustomPodcast[]>(CUSTOM_KEY, []);
}

export function addCustomPodcast(p: Omit<CustomPodcast, "id" | "color"> & { id?: string }): CustomPodcast {
  const list = getCustomPodcasts();
  const existing = list.find((x) => x.feedUrl === p.feedUrl);
  if (existing) return existing;
  const id = p.id || `pod-${Date.now().toString(36)}`;
  const entry: CustomPodcast = { ...p, id, color: colorFor(p.name) };
  write(CUSTOM_KEY, [...list, entry]);
  // Falls derselbe Podcast schon fest eingebaut, aber ausgeblendet war: einfach wieder einblenden
  write(HIDDEN_KEY, getHiddenPodcasts().filter((h) => h !== id));
  return entry;
}

export function getHiddenPodcasts(): string[] {
  return read<string[]>(HIDDEN_KEY, []);
}

/** Podcast entfernen: eigene werden gelöscht, eingebaute nur ausgeblendet */
export function removePodcast(id: string) {
  const custom = getCustomPodcasts();
  if (custom.some((c) => c.id === id)) write(CUSTOM_KEY, custom.filter((c) => c.id !== id));
  else write(HIDDEN_KEY, [...new Set([...getHiddenPodcasts(), id])]);
}

export function restorePodcast(id: string) {
  write(HIDDEN_KEY, getHiddenPodcasts().filter((h) => h !== id));
}

export function setPodcastCategory(id: string, category: PodcastSource["category"]) {
  write(CATEGORY_KEY, { ...read<Record<string, string>>(CATEGORY_KEY, {}), [id]: category });
}

const cache = new Map<string, PodcastSource>();
/** Gleiche Objekte zurückgeben, solange sich nichts ändert (wichtig für React-Effekte) */
function stable(p: PodcastSource): PodcastSource {
  const key = JSON.stringify({ ...p, hideTitle: p.hideTitle?.source });
  const hit = cache.get(key);
  if (hit) return hit;
  cache.set(key, p);
  return p;
}

/** Alle sichtbaren Podcasts: eingebaute (ohne ausgeblendete) plus eigene */
export function allPodcasts(): PodcastSource[] {
  const hidden = new Set(getHiddenPodcasts());
  const categories = read<Record<string, PodcastSource["category"]>>(CATEGORY_KEY, {});
  const custom: PodcastSource[] = getCustomPodcasts().map((c) => ({
    id: c.id,
    name: c.name,
    search: c.name,
    feedUrl: c.feedUrl,
    color: c.color,
    category: c.category,
    image: c.image,
  }));
  return [...PODCASTS.filter((p) => !hidden.has(p.id)), ...custom].map((p) =>
    stable(categories[p.id] ? { ...p, category: categories[p.id] } : p),
  );
}

// ---- Sprungmarken mit KI: je Podcast an/aus (wird zwischen den Geräten abgeglichen) ----
const aiKey = (id: string) => `leocast:ai:${id}`;

export function isAiEnabled(id: string): boolean {
  const v = read<boolean | null>(aiKey(id), null);
  if (v !== null) return v;
  return Boolean(PODCASTS.find((p) => p.id === id)?.ai);
}

export function setAiEnabled(id: string, on: boolean) {
  write(aiKey(id), on);
}

export function podcastById(id: string): PodcastSource | undefined {
  return allPodcasts().find((p) => p.id === id) || PODCASTS.find((p) => p.id === id);
}

/** Farbe für Kacheln ohne Bild, aus dem Namen abgeleitet */
export function colorFor(text: string): string {
  const palette = ["#7c3aed", "#0f766e", "#b45309", "#be185d", "#1d4ed8", "#4d7c0f", "#9333ea", "#0e7490"];
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
