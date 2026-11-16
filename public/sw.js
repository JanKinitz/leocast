// Leocast Service Worker
// - App-Seiten: zuerst Netz, ohne Netz aus dem Speicher (App startet im Flugzeugmodus)
// - Statische Dateien: zuerst Speicher
// - Gespeicherte Podcast-Folgen: aus dem Audio-Speicher, mit Unterstützung für Spulen (Range)
// - /api/feed: zuerst Netz, sonst letzte Antwort

const VERSION = "v2";
const APP_CACHE = `leocast-app-${VERSION}`;
const AUDIO_CACHE = "leocast-audio-v1";
const SHELL = ["/", "/ich", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("leocast-app-") && k !== APP_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function rangeResponse(request, cached) {
  const range = request.headers.get("Range");
  if (!range || cached.type === "opaque") return cached;
  const blob = await cached.blob();
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) return cached;
  const size = blob.size;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Fremde Adressen (Spotify, Podcast-Server) nur anfassen, wenn es um Audio geht
  if (url.origin !== self.location.origin) {
    if (request.destination !== "audio" && request.destination !== "video") return;
    event.respondWith(
      (async () => {
        const audio = await (await caches.open(AUDIO_CACHE)).match(request.url);
        if (audio) return rangeResponse(request, audio);
        return fetch(request);
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {

      // Feed-Daten: Netz zuerst, dann letzte Antwort
      if (url.pathname.startsWith("/api/feed")) {
        try {
          const res = await fetch(request);
          if (res.ok) (await caches.open(APP_CACHE)).put(request, res.clone());
          return res;
        } catch {
          const cached = await caches.match(request);
          return cached || Response.json({ error: "offline" }, { status: 503 });
        }
      }
      if (url.pathname.startsWith("/api/")) return fetch(request);

      // Seiten: Netz zuerst
      if (request.mode === "navigate") {
        try {
          const res = await fetch(request);
          (await caches.open(APP_CACHE)).put(request, res.clone());
          return res;
        } catch {
          const cached = (await caches.match(request)) || (await caches.match("/"));
          return cached || new Response("Offline", { status: 503 });
        }
      }

      // Statische Dateien (JS, CSS, Bilder): Speicher zuerst
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const res = await fetch(request);
        if (res.ok && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
          (await caches.open(APP_CACHE)).put(request, res.clone());
        }
        return res;
      } catch {
        return new Response("", { status: 504 });
      }
    })(),
  );
});
