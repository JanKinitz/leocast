// Analysiert neue Folgen aller Leocast-Podcasts im Voraus (läuft in GitHub Actions).
// Ruft die veröffentlichte App auf (/api/feed, /api/analyze – der Groq-Schlüssel bleibt bei Vercel)
// und schreibt die Sprungmarken in einen Ordner, der auf den Zweig „markers“ gepusht wird.
// Aufruf: node scripts/analyse-all.mjs <ausgabe-ordner>
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const BASE = process.env.LEOCAST_URL || "https://leocast.vercel.app";
const OUT = process.argv[2] || "markers-out";
const PER_PODCAST = Number(process.env.PER_PODCAST || 60); // so viele Folgen zeigt die App je Podcast
// Kostenloses Groq-Kontingent: max. 2 Stunden Audio pro Stunde, 8 Minuten pro Folge → höchstens 15 Folgen pro Stunde
const PAUSE_MS = Number(process.env.PAUSE_MS || 245_000);
const MAX_RUNTIME_MS = Number(process.env.MAX_RUNTIME_MS || 5 * 60 * 60 * 1000);
const PROMPT_VERSION = 4; // wie in app/api/analyze/route.ts
const RETRY_ERRORS_AFTER = 7 * 24 * 3600 * 1000;

// Welche Podcasts? Die Eltern schalten „Sprungmarken mit KI“ je Podcast im Elternbereich ein (über den Abgleich gespeichert)
const listRes = await fetch(`${BASE}/api/analyse-list`).then((r) => r.json()).catch(() => null);
const podcasts =
  listRes?.podcasts ||
  JSON.parse(readFileSync(new URL("../lib/default-podcasts.json", import.meta.url), "utf8")).filter((p) => p.ai);
console.log(`Podcasts mit KI-Sprungmarken (${listRes?.source || "Grundeinstellung"}): ${podcasts.map((p) => p.name).join(", ")}`);

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
// Der Zweig enthält nur Daten: Vercel soll ihn nicht als App veröffentlichen (sonst Fehler-Mails)
writeFileSync(join(OUT, "vercel.json"), JSON.stringify({ git: { deploymentEnabled: false } }, null, 2));
const indexFile = join(OUT, "index.json");
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : { entries: {} };
// Regel „nur mit Entspannung springen“ auch auf ältere Ergebnisse anwenden (aus den gespeicherten Abschnitten)
for (const [h, e] of Object.entries(index.entries)) {
  const file = join(OUT, "segments", `${h}.json`);
  if (e.error || e.storyStart == null || !existsSync(file)) continue;
  const segs = JSON.parse(readFileSync(file, "utf8"));
  const before = segs.filter((x) => x.t >= (e.contentStart || 0) && x.t < e.storyStart);
  if (!before.some((x) => x.l === "E")) {
    console.log(`Kein Sprung mehr (keine Entspannung): ${e.title}`);
    e.storyStart = null;
  } else if (e.relaxStart == null) {
    // Beginn der Entspannung nachtragen – ohne neue Analyse
    const first = before.find((x) => x.l === "E" && x.t > (e.contentStart || 0));
    if (first) e.relaxStart = first.t;
  }
}

let stats = null;
const save = () => {
  index.updated = new Date().toISOString();
  // Übersicht je Podcast für den Statusbericht
  if (stats)
    index.stats = stats.map((p) => {
      const done = p.hashes.map((h) => index.entries[h]).filter((e) => e && !e.error && (e.pv || 0) >= PROMPT_VERSION);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        total: p.hashes.length,
        analysed: done.length,
        withStory: done.filter((e) => e.storyStart != null).length,
        errors: p.hashes.filter((h) => index.entries[h]?.error).length,
      };
    });
  writeFileSync(indexFile, JSON.stringify(index));
};
// Zwischendurch veröffentlichen, damit die App neue Sprungmarken nicht erst nach Stunden bekommt
const publish = () => {
  if (!process.env.PUBLISH) return;
  try {
    execSync('git add -A && (git diff --cached --quiet || (git commit -qm "Sprungmarken aktualisieren" && git push -q origin HEAD:markers))', {
      cwd: OUT,
      stdio: "inherit",
      shell: "/bin/bash",
    });
  } catch (e) {
    console.log(`Veröffentlichen fehlgeschlagen: ${e.message}`);
  }
};

save();
publish();

// Warteschlange: pro Podcast die neuesten Folgen, abwechselnd zwischen den Podcasts
const lists = [];
stats = [];
for (const p of podcasts) {
  try {
    const url = await feedUrlFor(p);
    if (!url) continue;
    const { ok, data } = await json(`${BASE}/api/feed?url=${encodeURIComponent(url)}`);
    if (!ok) continue;
    const hide = p.hideTitle ? new RegExp(p.hideTitle, "i") : null;
    const eps = (data.episodes || [])
      .filter((e) => e.audioUrl && isRealContent(e) && !(hide && hide.test(e.title)))
      .slice(0, PER_PODCAST)
      .map((e) => ({ ...e, show: p.name, night: p.category === "gutenacht" }));
    lists.push(eps);
    stats.push({ id: p.id, name: p.name, category: p.category, hashes: eps.map((e) => hashUrl(e.audioUrl)) });
    console.log(`${p.name}: ${eps.length} Folgen`);
  } catch (e) {
    console.log(`${p.name}: Feed-Fehler ${e.message}`);
  }
}
save();
publish();

const queue = [];
for (let i = 0; i < PER_PODCAST; i++) for (const l of lists) if (l[i]) queue.push(l[i]);
// Referenz-Folgen (von Eltern geprüft) zuerst, damit Verbesserungen schnell messbar sind
const reference = JSON.parse(readFileSync(new URL("../lib/reference-markers.json", import.meta.url), "utf8"));
const isRef = (e) => reference.some((r) => e.title.includes(r.title));
// Reihenfolge: Referenz-Folgen, dann Gute-Nacht-Podcasts (dort lohnt der Sprung), dann der Rest
const rank = (e) => (isRef(e) ? 0 : e.night ? 1 : 2);
queue.sort((a, b) => rank(a) - rank(b));

const started = Date.now();
let analysed = 0;
for (let qi = 0; qi < queue.length; qi++) {
  const ep = queue[qi];
  if (Date.now() - started > MAX_RUNTIME_MS) break;
  const h = hashUrl(ep.audioUrl);
  const known = index.entries[h];
  // Fehler erneut versuchen – außer bei Folgen, die grundsätzlich nicht gehen (kein MP3)
  // neu prüfen, wenn die Erkennung seitdem verbessert wurde (Version der Anweisung)
  // Geschichte nicht gefunden, weil am Ende des Fensters noch entspannt wurde: einmal mit Verlängerung nachholen
  const segFile = join(OUT, "segments", `${h}.json`);
  const endsRelaxed =
    known && !known.error && known.storyStart == null && (known.window || 0) <= 480 && existsSync(segFile) &&
    JSON.parse(readFileSync(segFile, "utf8")).slice(-4).some((x) => x.l === "E");
  const retryNoStory = (known && !known.error && (known.pv || 0) < PROMPT_VERSION) || endsRelaxed;
  if (known && !retryNoStory && (!known.error || (/MP3/.test(known.error) && Date.now() - known.at < RETRY_ERRORS_AFTER))) continue;

  // Wissens-Podcasts: nur die ersten 2,5 Minuten (Werbung erkennen), einen Sprung zur Geschichte gibt es dort nicht
  const q = new URLSearchParams({
    v: "2",
    audio: ep.audioUrl,
    title: ep.title,
    show: ep.show,
    debug: "1",
    window: ep.night ? "480" : "150",
    r: String(Date.now()),
  });
  const { ok, status, data } = await json(`${BASE}/api/analyze?${q}`);
  if (status === 429) {
    // Stunden-Kontingent: 10 Minuten warten und dieselbe Folge erneut versuchen
    console.log(`Kontingent gerade aufgebraucht – warte 10 Minuten (${String(data.error || "").slice(0, 120)})`);
    await sleep(10 * 60 * 1000);
    qi--;
    continue;
  }
  if (ok) {
    const { segments, ...rest } = data;
    index.entries[h] = { ...rest, title: ep.title, at: Date.now() };
    if (segments) writeFileSync(join(OUT, "segments", `${h}.json`), JSON.stringify(segments));
    console.log(`✓ ${ep.show} – ${ep.title}: Werbung bis ${data.contentStart}s, Geschichte ab ${data.storyStart}s (${data.model}) ${data.reason || ""}`);
    if (data.warnings) console.log(`  Hinweise: ${data.warnings.join(" | ")}`);
  } else {
    index.entries[h] = { error: data.error || String(status), title: ep.title, at: Date.now() };
    console.log(`✗ ${ep.show} – ${ep.title}: ${data.error || status}`);
  }
  analysed++;
  save();
  publish();
  await sleep(PAUSE_MS);
}
save();
publish();

// Abgleich mit den Referenzwerten der Eltern
const t = (s) => (s == null ? "–" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
console.log("\nReferenz-Abgleich (Eltern ↔ KI):");
for (const r of reference) {
  const ep = queue.find((e) => e.title.includes(r.title));
  const m = ep && index.entries[hashUrl(ep.audioUrl)];
  if (!m || m.error) {
    console.log(`  ${r.title}: noch nicht analysiert ${m?.error || ""}`);
    continue;
  }
  // Werbung kann bei jedem Abruf anders lang sein: Abstand Werbe-Ende → Geschichte vergleichen
  const kiGap = m.storyStart != null ? m.storyStart - (m.contentStart || 0) : null;
  const refGap = r.story != null ? r.story - r.adEnd : null;
  const diff = kiGap != null && refGap != null ? Math.round(kiGap - refGap) : null;
  console.log(
    `  ${r.title}: Werbung bis ${t(m.contentStart)} (Eltern ${t(r.adEnd)}), Geschichte ab ${t(m.storyStart)} (Eltern ${t(r.story)}), Abweichung ${diff == null ? "–" : diff + " s"}`,
  );
}
console.log(`Fertig: ${analysed} Folgen analysiert, ${Object.keys(index.entries).length} im Verzeichnis`);
