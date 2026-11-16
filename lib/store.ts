"use client";

// Kleiner lokaler Speicher (localStorage) mit Benachrichtigung, damit Ansichten sich aktualisieren.
import { useSyncExternalStore } from "react";
import type { MediaItem } from "./library";

const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** In Komponenten aufrufen, damit sie bei Änderungen neu zeichnen. */
export function useStoreVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

export function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher voll */
  }
  emit();
}

// ---- Mag ich ----
const LIKES = "leocast:likes";
export type LikeEntry = { item?: MediaItem; podcastId?: string; playlistId?: string; title: string; image?: string; at: number };

export function getLikes(): Record<string, LikeEntry> {
  return read(LIKES, {} as Record<string, LikeEntry>);
}
export function isLiked(id: string) {
  return !!getLikes()[id];
}
export function toggleLike(id: string, entry: Omit<LikeEntry, "at">) {
  const likes = getLikes();
  if (likes[id]) delete likes[id];
  else likes[id] = { ...entry, at: Date.now() };
  write(LIKES, likes);
}

// ---- Fortschritt / Weiterhören ----
const PROGRESS = "leocast:progress";
export type Progress = { pos: number; dur: number; finished: boolean; updated: number; item: MediaItem };

export function getProgressMap(): Record<string, Progress> {
  return read(PROGRESS, {} as Record<string, Progress>);
}
export function getProgress(id: string): Progress | undefined {
  return getProgressMap()[id];
}
export function saveProgress(item: MediaItem, pos: number, dur: number, finished = false) {
  const map = getProgressMap();
  map[item.id] = { pos, dur, finished, updated: Date.now(), item };
  // Nur die letzten 200 Einträge behalten
  const entries = Object.entries(map).sort((a, b) => b[1].updated - a[1].updated).slice(0, 200);
  write(PROGRESS, Object.fromEntries(entries));
}
export function continueListening(): Progress[] {
  return Object.values(getProgressMap())
    .filter((p) => !p.finished && p.pos > 15 && p.item.kind === "episode")
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 10);
}

// ---- Downloads (Metadaten; die Dateien liegen im Cache Storage) ----
const DOWNLOADS = "leocast:downloads";
export type DownloadEntry = { item: MediaItem; mode: string; at: number };

export function getDownloads(): Record<string, DownloadEntry> {
  return read(DOWNLOADS, {} as Record<string, DownloadEntry>);
}
export function markDownloaded(item: MediaItem, mode: string) {
  const d = getDownloads();
  d[item.id] = { item, mode, at: Date.now() };
  write(DOWNLOADS, d);
}
export function unmarkDownloaded(id: string) {
  const d = getDownloads();
  delete d[id];
  write(DOWNLOADS, d);
}
