// Abgleich zwischen Geräten: ein Gerät schickt seinen Stand, der Server führt ihn mit dem gespeicherten zusammen
// und gibt das Ergebnis zurück. Gespeichert wird in Vercel Blob unter einem festen Pfad (alle Geräte der Familie).
// Geschrieben wird nur, wenn sich wirklich etwas geändert hat (kostenloses Kontingent: 2.000 Schreibvorgänge im Monat).
import { createHash } from "node:crypto";
import { blobConfigured, blobToken } from "@/lib/blobToken";
import { head, put } from "@vercel/blob";
import { analyseList, emptyState, mergeStates, normalizeCode, sameState, type SyncState } from "@/lib/syncCore";
import defaults from "@/lib/default-podcasts.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const MAX_BYTES = 900_000;

const FAMILY_PATH = "sync/familie.json";
const pathFor = (code: string) => `sync/${createHash("sha256").update(`leocast:${code}`).digest("hex")}.json`;

const LIST_PATH = "config/analyse-list.json";

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    const meta = await head(path, { token: blobToken() });
    const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function load(path: string): Promise<SyncState> {
  try {
    const meta = await head(path, { token: blobToken() });
    const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return emptyState();
    const data = (await res.json()) as SyncState;
    return data && data.v === 1 ? data : emptyState();
  } catch {
    return emptyState(); // noch nichts gespeichert
  }
}

export async function GET(request: Request) {
  // ?test=1: einmal wirklich schreiben, um die Verbindung zum Speicher zu prüfen
  if (new URL(request.url).searchParams.get("test")) {
    try {
      await put("config/test.json", JSON.stringify({ at: new Date().toISOString() }), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token: blobToken(),
      });
      return Response.json({ ok: true }, { headers: noStore });
    } catch (e) {
      return Response.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
    }
  }
  // Zur Fehlersuche nur die Namen passender Variablen (nie die Werte)
  const names = Object.keys(process.env).filter((n) => /BLOB|READ_WRITE|OIDC/i.test(n));
  let sdk = "?";
  try {
    sdk = (await import("@vercel/blob/package.json")).version;
  } catch {
    /* egal */
  }
  return Response.json(
    {
      configured: blobConfigured(),
      variables: names,
      oidcHeader: request.headers.has("x-vercel-oidc-token"),
      sdk,
    },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  if (!blobConfigured())
    return Response.json({ error: "Abgleich ist noch nicht eingerichtet" }, { status: 503, headers: noStore });

  const raw = await request.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "zu groß" }, { status: 413, headers: noStore });
  let body: { code?: string; auto?: boolean; state?: SyncState };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "ungültig" }, { status: 400, headers: noStore });
  }
  // Standard: alle Geräte gehören automatisch zur Familie (private App, keine vertraulichen Daten).
  // Ein Familien-Schlüssel (frühere Version) wird nur noch einmalig zum Übernehmen alter Daten gelesen.
  const code = body.auto ? null : normalizeCode(body.code || "");
  if (!body.auto && !code) return Response.json({ error: "Familien-Schlüssel ungültig" }, { status: 400, headers: noStore });
  const incoming = body.state && body.state.v === 1 ? body.state : emptyState();

  const path = code ? pathFor(code) : FAMILY_PATH;
  const stored = await load(path);
  const merged = mergeStates(stored, incoming);
  let wrote = false;
  if (!sameState(stored, merged)) {
    await put(path, JSON.stringify(merged), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
      token: blobToken(),
    });
    wrote = true;
    // Liste für die Vorab-Analyse mitpflegen (nur Podcast-Namen und Feed-Adressen, keine Familiendaten)
    const list = analyseList(merged, defaults);
    const storedList = await loadJson<{ podcasts: unknown }>(LIST_PATH);
    if (JSON.stringify(storedList?.podcasts) !== JSON.stringify(list)) {
      await put(LIST_PATH, JSON.stringify({ podcasts: list, updated: new Date().toISOString() }), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      token: blobToken(),
      });
    }
  }
  return Response.json({ state: merged, wrote }, { headers: noStore });
}
