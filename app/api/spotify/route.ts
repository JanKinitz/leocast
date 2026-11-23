// Gemeinsame Spotify-Anmeldung für alle Geräte der Familie.
// Spotify erneuert bei PKCE den Refresh-Token bei jedem Erneuern (der alte wird ungültig). Wenn mehrere Geräte
// oder Tabs gleichzeitig erneuern, fliegt eins raus. Deshalb hält der Server die eine Anmeldung und gibt den
// gekoppelten Geräten nur kurzlebige Zugangs-Tokens (1 Stunde).
// Gespeichert verschlüsselt (AES-256-GCM, Schlüssel aus dem Blob-Schlüssel abgeleitet) in Vercel Blob.
// Ein Gerät darf Tokens holen, wenn es einen Geräte-Schlüssel hat (bekommt es beim Anmelden oder per QR-Code).
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { del, head, put } from "@vercel/blob";
import { blobToken } from "@/lib/blobToken";
import { SPOTIFY_CLIENT_ID } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

const PATH = "spotify/anmeldung.json";
const noStore = { "Cache-Control": "no-store" };
const MAX_KEYS = 12;

type Session = {
  v: 1;
  refresh_token: string | null; // null = abgelaufen, neu anmelden
  access_token: string | null;
  expires_at: number;
  auth_at: number; // Zeitpunkt der Anmeldung bei Spotify (Refresh-Tokens laufen 6 Monate danach ab)
  user: { id: string; name: string } | null;
  keys: string[]; // SHA-256 der Geräte-Schlüssel
};

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });

function secret(): Buffer {
  const t = blobToken();
  if (!t) throw new Error("Speicher nicht eingerichtet");
  return createHash("sha256").update(`leocast-spotify:${t}`).digest();
}

const hashKey = (key: string) => createHash("sha256").update(`leocast-device:${key}`).digest("hex");

function keyOk(s: Session, key: unknown): boolean {
  if (typeof key !== "string" || key.length < 20) return false;
  const h = Buffer.from(hashKey(key));
  return s.keys.some((k) => {
    const b = Buffer.from(k);
    return b.length === h.length && timingSafeEqual(b, h);
  });
}

async function load(): Promise<Session | null> {
  try {
    const meta = await head(PATH, { token: blobToken() });
    const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const box = (await res.json()) as { v: 1; d: string };
    const raw = Buffer.from(box.d, "base64");
    const decipher = createDecipheriv("aes-256-gcm", secret(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(plain) as Session;
  } catch {
    return null;
  }
}

async function save(s: Session) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(s), "utf8"), cipher.final()]);
  const d = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
  await put(PATH, JSON.stringify({ v: 1, d }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
    token: blobToken(),
  });
}

async function spotifyRefresh(refresh: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, grant_type: "refresh_token", refresh_token: refresh }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function status(s: Session) {
  return {
    active: Boolean(s.refresh_token),
    user: s.user?.name || null,
    authAt: s.auth_at,
    // Spotify: Refresh-Tokens laufen 6 Monate nach der Anmeldung ab
    expiresAround: s.auth_at + 182 * 24 * 3600 * 1000,
    devices: s.keys.length,
  };
}

export async function POST(request: Request) {
  if (!blobToken()) return json({ error: "Speicher nicht eingerichtet" }, 503);
  let body: {
    action?: string;
    key?: string;
    token?: { access_token: string; refresh_token: string; expires_at: number; auth_at?: number };
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "ungültig" }, 400);
  }

  // Neu angemeldet (oder alte Anmeldung eines Geräts übernehmen)
  if (body.action === "save") {
    const t = body.token;
    if (!t?.access_token || !t.refresh_token) return json({ error: "Token fehlt" }, 400);
    // Prüfen, dass der Token wirklich von Spotify ist (nur freigeschaltete Konten bekommen welche)
    const me = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${t.access_token}` } });
    if (!me.ok) return json({ error: "Spotify kennt diese Anmeldung nicht" }, 401);
    const user = (await me.json()) as { id: string; display_name?: string };
    const old = await load();
    let key = typeof body.key === "string" && old && keyOk(old, body.key) ? body.key : null;
    const keys = old ? [...old.keys] : [];
    if (!key) {
      key = randomBytes(24).toString("base64url");
      keys.push(hashKey(key));
    }
    const s: Session = {
      v: 1,
      refresh_token: t.refresh_token,
      access_token: t.access_token,
      expires_at: t.expires_at,
      auth_at: t.auth_at || Date.now(),
      user: { id: user.id, name: user.display_name || user.id },
      keys: keys.slice(-MAX_KEYS),
    };
    await save(s);
    return json({ ok: true, key, ...status(s) });
  }

  const s = await load();
  if (!s) return json({ error: "keine Anmeldung", active: false }, 404);
  if (!keyOk(s, body.key)) return json({ error: "Gerät nicht gekoppelt", active: false }, 403);

  if (body.action === "status") return json({ ok: true, ...status(s) });

  if (body.action === "logout") {
    await del(PATH, { token: blobToken() }).catch(() => {});
    return json({ ok: true });
  }

  if (body.action === "token") {
    if (!s.refresh_token) return json({ error: "abgelaufen", ...status(s) }, 410);
    if (s.access_token && Date.now() < s.expires_at - 120_000)
      return json({ access_token: s.access_token, expires_at: s.expires_at, ...status(s) });
    let r = await spotifyRefresh(s.refresh_token);
    if (!r.ok && r.data?.error === "invalid_grant") {
      // Vielleicht hat gerade ein anderer Aufruf erneuert: frisch nachlesen
      await new Promise((ok) => setTimeout(ok, 1500));
      const again = await load();
      if (again?.refresh_token && again.refresh_token !== s.refresh_token) {
        if (again.access_token && Date.now() < again.expires_at - 60_000)
          return json({ access_token: again.access_token, expires_at: again.expires_at, ...status(again) });
        r = await spotifyRefresh(again.refresh_token);
        Object.assign(s, again);
      }
    }
    if (!r.ok) {
      if (r.data?.error === "invalid_grant") {
        // abgelaufen (nach 6 Monaten) oder in Spotify entfernt: Geräte-Schlüssel bleiben, neue Anmeldung genügt
        s.refresh_token = null;
        s.access_token = null;
        await save(s);
        return json({ error: "abgelaufen", ...status(s) }, 410);
      }
      return json({ error: `Spotify antwortet nicht (${r.data?.error || "?"})` }, 502);
    }
    s.access_token = r.data.access_token;
    s.refresh_token = r.data.refresh_token || s.refresh_token;
    s.expires_at = Date.now() + (Number(r.data.expires_in || 3600) - 60) * 1000;
    await save(s);
    return json({ access_token: s.access_token, expires_at: s.expires_at, ...status(s) });
  }

  return json({ error: "unbekannte Aktion" }, 400);
}
