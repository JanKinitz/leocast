"use client";

// Im Hintergrund: für alle sichtbaren Folgen die Sprungmarken holen, bevor jemand auf Abspielen tippt.
// 1. Vorab-Analysen aus GitHub (sofort)  2. Was dort fehlt (z. B. neue Folgen, eigene Podcasts): langsam selbst
// analysieren lassen – eine Folge pro gut einer Minute, wegen des kostenlosen KI-Kontingents.
import { useEffect } from "react";
import { PODCASTS, allPodcasts } from "@/lib/library";
import { episodeItem, loadFeed } from "@/lib/podcasts";
import { aiPaused, getMarkers, hasMarkers, inIndex, loadMarkerIndex } from "@/lib/markers";
import { useStoreVersion } from "@/lib/store";
import { log } from "@/lib/diagnostics";

const PER_PODCAST = 5; // ältere Folgen übernimmt die Vorab-Analyse in GitHub
const PAUSE_MS = 240_000; // kostenloses Kontingent: höchstens ca. 15 Folgen pro Stunde
let running = false;
let again = false;
let generation = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(isAlive: () => boolean) {
  if (running) {
    again = true;
    return;
  }
  running = true;
  again = false;
  try {
    await sleep(8000);
    await loadMarkerIndex();
    const lists = [];
    // Die festen Podcasts analysiert GitHub vorab – hier nur selbst hinzugefügte, damit das Kontingent reicht
    const builtIn = new Set(PODCASTS.map((p) => p.id));
    for (const source of allPodcasts().filter((p) => !builtIn.has(p.id))) {
      try {
        const feed = await loadFeed(source);
        lists.push(feed.episodes.slice(0, PER_PODCAST).map((e) => episodeItem(e, source)));
      } catch {
        /* Feed gerade nicht erreichbar */
      }
    }
    const queue = [];
    for (let i = 0; i < PER_PODCAST; i++) for (const l of lists) if (l[i]) queue.push(l[i]);

    let live = 0;
    for (const item of queue) {
      if (!isAlive() || !navigator.onLine || aiPaused()) break;
      if (hasMarkers(item.id)) continue;
      const ready = await inIndex(item);
      await getMarkers(item);
      if (!ready) {
        live++;
        await sleep(PAUSE_MS);
      }
    }
    if (live) log("info", `Hintergrund: ${live} Folgen selbst analysiert`);
  } finally {
    running = false;
    if (again && isAlive()) run(isAlive);
  }
}

export default function MarkerPrefetcher() {
  const version = useStoreVersion();
  const libraryKey = allPodcasts()
    .map((p) => p.id)
    .join(",");
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const gen = ++generation;
    const alive = () => gen === generation;
    run(alive);
    const onOnline = () => run(alive);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
    // neu starten, wenn Podcasts hinzukommen
  }, [libraryKey]);
  void version;
  return null;
}
