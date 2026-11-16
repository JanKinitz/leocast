// Offline-Speicher für Podcast-Folgen aus offenen Feeds (Cache Storage).

export const AUDIO_CACHE = "leocast-audio-v1";

export type DownloadResult = "cors" | "opaque" | "failed";

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* nicht unterstützt */
  }
  return false;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage || 0, quota: e.quota || 0 };
  } catch {
    return null;
  }
}

export async function downloadEpisode(url: string): Promise<{ result: DownloadResult; detail: string }> {
  const cache = await caches.open(AUDIO_CACHE);
  // 1. Versuch: normaler Download (CORS). Dann kann die App die Datei selbst lesen und spulen.
  try {
    const res = await fetch(url, { mode: "cors", redirect: "follow" });
    if (res.ok) {
      const blob = await res.blob();
      await cache.put(
        url,
        new Response(blob, {
          headers: {
            "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
            "Content-Length": String(blob.size),
            "X-Leocast-Mode": "cors",
          },
        }),
      );
      return { result: "cors", detail: `${(blob.size / 1024 / 1024).toFixed(1)} MB gespeichert` };
    }
  } catch {
    /* Server erlaubt kein CORS – weiter mit Plan B */
  }
  // 2. Versuch: "opaque" speichern. Inhalt ist für die App unlesbar, kann aber abgespielt werden.
  try {
    const res = await fetch(url, { mode: "no-cors", redirect: "follow" });
    await cache.put(url, res);
    return { result: "opaque", detail: "gespeichert (ohne CORS, Größe unbekannt)" };
  } catch (e) {
    return { result: "failed", detail: (e as Error).message };
  }
}

export async function cachedMode(url: string): Promise<DownloadResult | null> {
  const cache = await caches.open(AUDIO_CACHE);
  const res = await cache.match(url);
  if (!res) return null;
  if (res.type === "opaque") return "opaque";
  return "cors";
}

export async function removeEpisode(url: string) {
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(url);
}

/** Quelle für das Audio-Element: gespeicherte Datei als Blob-URL, sonst die Original-Adresse. */
export async function playableSrc(url: string): Promise<{ src: string; from: string }> {
  const cache = await caches.open(AUDIO_CACHE);
  const res = await cache.match(url);
  if (res && res.type !== "opaque") {
    const blob = await res.blob();
    return { src: URL.createObjectURL(blob), from: "Gerätespeicher" };
  }
  if (res) return { src: url, from: "Gerätespeicher (über Service Worker)" };
  return { src: url, from: "Internet" };
}
