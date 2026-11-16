"use client";

// Prototyp-Startseite: Spotify-Anmeldung, Playlists als große Kacheln, Wiedergabe in der App.
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getMe,
  getPlaylistItems,
  getPlaylists,
  loadToken,
  logout,
  startLogin,
  type PlayableItem,
  type Playlist,
} from "@/lib/spotify";
import { log } from "@/lib/diagnostics";
import { useSpotifyPlayer } from "@/components/useSpotifyPlayer";
import LogPanel from "@/components/LogPanel";

type Me = { id: string; display_name?: string; product?: string; country?: string };

export default function Home() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [open, setOpen] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlayableItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const player = useSpotifyPlayer(!!loggedIn);

  useEffect(() => {
    setLoggedIn(!!loadToken());
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    getMe()
      .then((m) => {
        setMe(m);
        log(m.product === "premium" ? "ok" : "error", `Angemeldet als ${m.display_name || m.id} (${m.product})`);
      })
      .catch((e) => {
        setError(e.message);
        log("error", `Profil laden: ${e.message}`);
      });
    getPlaylists()
      .then((p) => {
        setPlaylists(p);
        log("ok", `${p.length} Playlists geladen`);
      })
      .catch((e) => {
        setError(e.message);
        log("error", `Playlists laden: ${e.message}`);
      });
  }, [loggedIn]);

  async function openPlaylist(p: Playlist) {
    setOpen(p);
    setItems([]);
    setLoading(true);
    try {
      const list = await getPlaylistItems(p.id);
      setItems(list);
      log("ok", `„${p.name}“: ${list.length} abspielbare Titel`);
    } catch (e: any) {
      setError(e.message);
      log("error", `Playlist-Inhalt: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (loggedIn === null) return null;

  if (!loggedIn) {
    return (
      <main>
        <h1>Leocast</h1>
        <p>Prototyp: Bitte mit dem Spotify-Konto anmelden, das Leocast benutzen soll.</p>
        <div className="actions">
          <button onClick={() => startLogin()}>Mit Spotify anmelden</button>
          <Link className="button secondary" href="/podcast">
            Podcast-Test (ohne Spotify)
          </Link>
        </div>
        <LogPanel />
      </main>
    );
  }

  return (
    <main>
      <div className="topbar">
        {open ? (
          <button className="back" aria-label="Zurück" onClick={() => setOpen(null)}>
            ←
          </button>
        ) : (
          <h1>Hallo{me?.display_name ? ` ${me.display_name}` : ""}!</h1>
        )}
        <div className="actions">
          <Link className="button secondary small" href="/podcast">
            Podcast-Test
          </Link>
          <button
            className="secondary small"
            onClick={() => {
              logout();
              setLoggedIn(false);
            }}
          >
            Abmelden
          </button>
        </div>
      </div>

      <div className={`status ${player.deviceId ? "ok" : player.error ? "error" : "info"}`}>
        {player.deviceId
          ? "Spotify-Player in Leocast ist bereit."
          : player.error
            ? `Spotify-Player: ${player.error}`
            : "Spotify-Player startet…"}
      </div>
      {error && <div className="status error">{error}</div>}

      {!open && (
        <>
          <h2>Meine Playlists</h2>
          <div className="grid">
            {playlists.map((p) => (
              <button key={p.id} className="tile" onClick={() => openPlaylist(p)}>
                {p.images?.[0]?.url ? <img src={p.images[0].url} alt="" /> : <div className="cover" />}
                <div className="title">{p.name}</div>
              </button>
            ))}
          </div>
          {playlists.length === 0 && <p>Noch keine Playlists in diesem Konto.</p>}
        </>
      )}

      {open && (
        <>
          <h2 className="title">{open.name}</h2>
          {loading && <p>Lade…</p>}
          <ul className="list">
            {items.map((it) => (
              <li key={it.uri} className="row">
                {it.image ? <img src={it.image} alt="" /> : <div className="cover" />}
                <div className="text title">
                  {it.name}
                  {it.subtitle && <div className="sub">{it.subtitle}</div>}
                </div>
                <button
                  className="play"
                  aria-label={`${it.name} abspielen`}
                  disabled={!player.deviceId}
                  onClick={() => player.play(it.uri)}
                >
                  ▶
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <LogPanel />

      {player.state?.trackName && (
        <div className="miniplayer">
          {player.state.image && <img src={player.state.image} alt="" />}
          <div className="text title">
            {player.state.trackName}
            <div className="sub">{player.state.artist}</div>
          </div>
          <button aria-label="10 Sekunden zurück" onClick={() => player.seekBy(-10000)}>
            ↺
          </button>
          <button aria-label={player.state.paused ? "Abspielen" : "Pause"} onClick={player.toggle}>
            {player.state.paused ? "▶" : "❚❚"}
          </button>
          <button aria-label="30 Sekunden vor" onClick={() => player.seekBy(30000)}>
            ↻
          </button>
        </div>
      )}
    </main>
  );
}
