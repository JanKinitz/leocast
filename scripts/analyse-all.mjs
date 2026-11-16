// Analysiert neue Folgen aller Leocast-Podcasts im Voraus (läuft in GitHub Actions).
// Ruft die veröffentlichte App auf (/api/feed, /api/analyze – der Groq-Schlüssel bleibt bei Vercel)
// und schreibt die Sprungmarken in einen Ordner, der auf den Zweig „markers“ gepusht wird.
// Aufruf: node scripts/analyse-all.mjs <ausgabe-ordner>
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.LEOCAST_URL || "https://leocast.vercel.app";
const OUT = process.argv[2] || "markers-out";
const PER_PODCAST = Number(process.env.PER_PODCAST || 15);
const PAUSE_MS = Number(process.env.PAUSE_MS || 70_000); // kostenloses Groq-Kontingent: ca. 1 Analyse pro Minute
const MAX_RUNTIME_MS = Number(process.env.MAX_RUNTIME_MS || 5 * 60 * 60 * 1000);
const RETRY_ERRORS_AFTER = 7 * 24 * 3600 * 1000;

const podcasts = JSON.parse(readFileSync(new URL("../lib/default-podcasts.json", import.meta.url), "utf8"));
const extraFile = new URL("../lib/extra-feeds.json", import.meta.url);
const extra = existsSync(extraFile) ? JSON.parse(readFileSync(extraFile, "utf8")) : [];

export const hashUrl = (url) => createHash("sha1").update(url.trim()).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
const NOT_CONTENT =
  /\b(ankündigung|trailer|teaser|vorschau|pause|sommerpause|winterpause|in eigener sache|hinweis|neuigkeiten|news|update|bonus-?info)\b/i;

function isRealContent(e) {
  if (e.episodeType === "trailer" || e.episodeType === "bonus") return false;
  const dur = e.durationSec || 0;
  if (dur > 0 && dur < 240) return false;
  if (NOT_CONTENT.test(e.title) && (dur === 0 || dur < 600)) return false;
  return true;
}

async function json(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Leocast-Vorab-Analyse" } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function feedUrlFor(p) {
  if (p.feedUrl) return p.feedUrl;
  const { data } = await json(`${BASE}/api/podcast-search?q=${encodeURIComponent(p.search || p.name)}`);
  const results = data.results || [];
  const wanted = normalize(p.name);
  const hit =
    results.find((r) => normalize(r.name) === wanted) || results.find((r) => normalize(r.name).includes(wanted)) || results[0];
  return hit?.feedUrl;
}

mkdirSync(join(OUT, "segments"), { recursive: true });
const indexFile = join(OUT, "index.json");
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : { entries: {} };
const save = () => {
  index.updated = new Date().toISOString();
  writeFileSync(indexFile, JSON.stringify(index));
};

// Warteschlange: pro Podcast die neuesten Folgen, abwechselnd zwischen den Podcasts
const lists = [];
for (const p of [...podcasts, ...extra]) {
  try {
    const url = await feedUrlFor(p);
    if (!url) continue;
    const { ok, data } = await json(`${BASE}/api/feed?url=${encodeURIComponent(url)}`);
    if (!ok) continue;
    const hide = p.hideTitle ? new RegExp(p.hideTitle, "i") : null;
    const eps = (data.episodes || [])
      .filter((e) => e.audioUrl && isRealContent(e) && !(hide && hide.test(e.title)))
      .slice(0, PER_PODCAST)
      .map((e) => ({ ...e, show: p.name }));
    lists.push(eps);
    console.log(`${p.name}: ${eps.length} Folgen`);
  } catch (e) {
    console.log(`${p.name}: Feed-Fehler ${e.message}`);
  }
}
const queue = [];
for (let i = 0; i < PER_PODCAST; i++) for (const l of lists) if (l[i]) queue.push(l[i]);

const started = Date.now();
let analysed = 0;
for (const ep of queue) {
  if (Date.now() - started > MAX_RUNTIME_MS) break;
  const h = hashUrl(ep.audioUrl);
  const known = index.entries[h];
  if (known && (!known.error || Date.now() - known.at < RETRY_ERRORS_AFTER)) continue;

  const q = new URLSearchParams({ v: "2", audio: ep.audioUrl, title: ep.title, show: ep.show, debug: "1", r: String(Date.now()) });
  const { ok, status, data } = await json(`${BASE}/api/analyze?${q}`);
  if (status === 429) {
    console.log("Tageskontingent aufgebraucht – Rest beim nächsten Lauf");
    break;
  }
  if (ok) {
    const { segments, ...rest } = data;
    index.entries[h] = { ...rest, title: ep.title, at: Date.now() };
    if (segments) writeFileSync(join(OUT, "segments", `${h}.json`), JSON.stringify(segments));
    console.log(`✓ ${ep.show} – ${ep.title}: Werbung bis ${data.contentStart}s, Geschichte ab ${data.storyStart}s`);
  } else {
    index.entries[h] = { error: data.error || String(status), title: ep.title, at: Date.now() };
    console.log(`✗ ${ep.show} – ${ep.title}: ${data.error || status}`);
  }
  analysed++;
  save();
  await sleep(PAUSE_MS);
}
save();
console.log(`Fertig: ${analysed} Folgen analysiert, ${Object.keys(index.entries).length} im Verzeichnis`);
