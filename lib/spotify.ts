// Spotify-Anmeldung (OAuth 2.0 Authorization Code mit PKCE, ohne Client Secret) und Web-API-Aufrufe.
// Die Client-ID ist nicht geheim und darf im öffentlichen Repository stehen.

export const SPOTIFY_CLIENT_ID =
  process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "848bfd91a7c44ca5ad16a792c783f18a";

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-read-playback-position",
].join(" ");

const TOKEN_KEY = "leocast:spotify-token";
const VERIFIER_KEY = "leocast:pkce-verifier";

export type StoredToken = {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // ms
  scope?: string;
};

export function redirectUri(): string {
  return `${window.location.origin}/callback`;
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length = 64): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += chars[values[i] % chars.length];
  return out;
}

export async function startLogin(): Promise<void> {
  const verifier = randomString(64);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64url(digest);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(VERIFIER_KEY, verifier); // Android kann den Tab beim Login neu laden
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<StoredToken> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Spotify-Token: ${data.error || res.status} ${data.error_description || ""}`.trim());
  }
  const token: StoredToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
    scope: data.scope,
  };
  return token;
}

export async function finishLogin(code: string): Promise<void> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY) || localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Anmeldung abgelaufen. Bitte noch einmal anmelden.");
  const token = await tokenRequest({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  saveToken(token);
  sessionStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(VERIFIER_KEY);
}

function saveToken(token: StoredToken) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function loadToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

let refreshing: Promise<string> | null = null;

export async function getAccessToken(): Promise<string | null> {
  const token = loadToken();
  if (!token) return null;
  if (Date.now() < token.expires_at) return token.access_token;
  if (!token.refresh_token) return null;
  if (!refreshing) {
    refreshing = tokenRequest({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    })
      .then((t) => {
        if (!t.refresh_token) t.refresh_token = token.refresh_token;
        saveToken(t);
        return t.access_token;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export class SpotifyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const access = await getAccessToken();
  if (!access) throw new SpotifyError(401, "Nicht angemeldet");
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || text || res.statusText;
    throw new SpotifyError(res.status, `${res.status}: ${msg}`);
  }
  return data as T;
}

export type SpotifyImage = { url: string; width?: number; height?: number };

export type Playlist = {
  id: string;
  name: string;
  uri: string;
  images: SpotifyImage[] | null;
  owner?: { id: string; display_name?: string };
};

export type PlayableItem = {
  id: string;
  name: string;
  uri: string;
  type: "track" | "episode";
  duration_ms: number;
  is_playable?: boolean;
  restrictions?: { reason: string };
  image?: string;
  subtitle?: string;
};

export async function getMe() {
  return api<{ id: string; display_name?: string; product?: string; country?: string }>("/me");
}

export async function getPlaylists(): Promise<Playlist[]> {
  const data = await api<{ items: Playlist[] }>("/me/playlists?limit=50");
  return (data?.items || []).filter(Boolean);
}

function toItem(raw: any): PlayableItem | null {
  const t = raw?.item || raw?.track; // neuer Name "item", alter Name "track"
  if (!t || !t.uri) return null;
  const isEpisode = t.type === "episode";
  const images: SpotifyImage[] = isEpisode ? t.images || t.show?.images || [] : t.album?.images || [];
  return {
    id: t.id,
    name: t.name,
    uri: t.uri,
    type: isEpisode ? "episode" : "track",
    duration_ms: t.duration_ms,
    is_playable: t.is_playable,
    restrictions: t.restrictions,
    image: images[0]?.url,
    subtitle: isEpisode ? t.show?.name : (t.artists || []).map((a: any) => a.name).join(", "),
  };
}

export async function getPlaylistItems(id: string): Promise<PlayableItem[]> {
  let data: { items: any[] };
  try {
    data = await api<{ items: any[] }>(`/playlists/${id}/items?limit=100&market=from_token`);
  } catch (e) {
    if (e instanceof SpotifyError && e.status === 404) {
      data = await api<{ items: any[] }>(`/playlists/${id}/tracks?limit=100&market=from_token`);
    } else {
      throw e;
    }
  }
  return (data?.items || [])
    .map(toItem)
    .filter((x): x is PlayableItem => !!x)
    // Nur abspielbare Inhalte zeigen (keine gesperrten Bonusinhalte, keine Markt-Sperren)
    .filter((x) => x.is_playable !== false && !x.restrictions);
}

export async function playUri(deviceId: string, uri: string, queue?: string[]) {
  // Ohne Liste: nur genau diesen einen Titel. Mit Liste: ab diesem Titel nacheinander (nur diese Liste, nichts danach)
  const uris = queue && queue.length > 1 ? queue.slice(0, 100) : [uri];
  await api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    body: JSON.stringify(uris.length > 1 ? { uris, offset: { uri } } : { uris }),
  });
}

// Lieder einer Playlist bzw. eines Albums nacheinander abspielen (Einstellung im Elternbereich, Standard: an)
const CONTINUOUS = "leocast:music-continuous";
export function musicContinuous(): boolean {
  try {
    const v = localStorage.getItem(CONTINUOUS);
    return v === null ? true : JSON.parse(v) !== false;
  } catch {
    return true;
  }
}

export async function getDevices() {
  return api<{ devices: { id: string; name: string; type: string; is_active: boolean }[] }>(
    "/me/player/devices",
  );
}

// ---- Auswahl der Eltern: Playlists und Alben suchen ----
export type SpotifyPick = { kind: "playlist" | "album"; id: string; name: string; image?: string; by?: string };

export async function searchSpotify(q: string): Promise<SpotifyPick[]> {
  // Seit Februar 2026 liefert die Suche höchstens 10 Treffer je Art
  const data = await api<{ playlists?: { items: any[] }; albums?: { items: any[] } }>(
    `/search?type=album,playlist&limit=10&market=from_token&q=${encodeURIComponent(q)}`,
  );
  const albums: SpotifyPick[] = (data?.albums?.items || []).filter(Boolean).map((a: any) => ({
    kind: "album",
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url,
    by: (a.artists || []).map((x: any) => x.name).join(", "),
  }));
  const playlists: SpotifyPick[] = (data?.playlists?.items || []).filter(Boolean).map((p: any) => ({
    kind: "playlist",
    id: p.id,
    name: p.name,
    image: p.images?.[0]?.url,
    by: p.owner?.display_name,
  }));
  // abwechselnd mischen, damit beide Arten oben auftauchen
  const out: SpotifyPick[] = [];
  for (let i = 0; i < Math.max(albums.length, playlists.length); i++) {
    if (albums[i]) out.push(albums[i]);
    if (playlists[i]) out.push(playlists[i]);
  }
  return out;
}

export async function getAlbumTracks(id: string): Promise<{ name: string; image?: string; items: PlayableItem[] }> {
  const a = await api<any>(`/albums/${id}?market=from_token`);
  const image = a?.images?.[0]?.url;
  const items: PlayableItem[] = (a?.tracks?.items || [])
    .filter((t: any) => t && t.uri)
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      uri: t.uri,
      type: "track" as const,
      duration_ms: t.duration_ms,
      is_playable: t.is_playable,
      restrictions: t.restrictions,
      image,
      subtitle: (t.artists || []).map((x: any) => x.name).join(", "),
    }))
    .filter((x: PlayableItem) => x.is_playable !== false && !x.restrictions);
  return { name: a?.name || "Album", image, items };
}
