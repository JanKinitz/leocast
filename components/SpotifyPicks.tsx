"use client";

// Elternbereich: Playlists und Alben aus Spotify für „Meine Musik“ auswählen (keine einzelnen Lieder).
import { useState } from "react";
import { searchSpotify, type SpotifyPick } from "@/lib/spotify";
import { addPick, getPicks, read, removePick, useStoreVersion, write } from "@/lib/store";
import { img } from "@/lib/img";
import { useSpotifyPlaylists } from "@/components/hooks";

export default function SpotifyPicks({ loggedIn }: { loggedIn: boolean }) {
  useStoreVersion();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SpotifyPick[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const picks = getPicks();
  const { playlists } = useSpotifyPlaylists();
  const own = playlists.filter((pl) => !picks.some((p) => p.id === pl.id));

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const list = await searchSpotify(q.trim());
      setHits(list);
      if (!list.length) setMsg("Nichts gefunden.");
    } catch (err) {
      setMsg(`Suche klappt gerade nicht: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3>Musik für „Meine Musik“</h3>
      <label className="ai-switch">
        <span className="ai-name">Lieder einer Playlist nacheinander abspielen</span>
        <input
          type="checkbox"
          role="switch"
          checked={read<boolean>("leocast:music-continuous", true) !== false}
          onChange={(e) => write("leocast:music-continuous", e.target.checked)}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>
      <p className="hint">
        Gilt nur für Musik. Es läuft nur die gewählte Playlist bzw. das Album bis zum Ende – danach ist Schluss. Podcasts
        spielen weiterhin nur eine Folge.
      </p>
      {picks.length > 0 ? (
        <ul className="pod-list">
          {picks.map((p) => (
            <li key={p.id}>
              <span className="pod-name">
                {p.name} <span className="hint">({p.kind === "album" ? "Album" : "Playlist"})</span>
              </span>
              <button className="secondary" onClick={() => removePick(p.id)}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Noch nichts ausgewählt – „Meine Musik“ ist in der Kinderansicht ausgeblendet.</p>
      )}

      {loggedIn && own.length > 0 && (
        <>
          <p className="hint">Playlists aus dem Spotify-Konto deines Kindes (erscheinen nur, wenn du sie hinzufügst):</p>
          <ul className="pod-list">
            {own.map((pl) => (
              <li key={pl.id}>
                <span className="pod-name">{pl.name}</span>
                <button
                  onClick={() =>
                    addPick({ kind: "playlist", id: pl.id, name: pl.name, image: pl.images?.[0]?.url, by: "eigene Playlist" })
                  }
                >
                  + Hinzufügen
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {loggedIn ? (
        <>
          <form className="pod-search" onSubmit={search}>
            <input
              type="search"
              placeholder="Album oder Playlist, z. B. Bibi und Tina, Kinderlieder"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Musik suchen"
            />
            <button type="submit" disabled={busy}>
              {busy ? "Suche …" : "Suchen"}
            </button>
          </form>
          {hits && hits.length > 0 && (
            <ul className="pod-hits">
              {hits.map((h) => (
                <li key={h.id}>
                  {h.image ? <img src={img(h.image, 128)} alt="" width={64} height={64} /> : <span className="pod-noimg" />}
                  <div className="pod-info">
                    <strong>{h.name}</strong>
                    <span className="hint">
                      {h.kind === "album" ? "Album" : "Playlist"}
                      {h.by ? ` · ${h.by}` : ""}
                    </span>
                  </div>
                  {picks.some((p) => p.id === h.id) ? (
                    <span className="hint">schon dabei</span>
                  ) : (
                    <div className="pod-actions">
                      <button onClick={() => addPick(h)}>+ Hinzufügen</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="hint">Zum Suchen auf diesem Gerät bei Spotify anmelden.</p>
      )}
      {msg && <p className="hint">{msg}</p>}
    </>
  );
}
