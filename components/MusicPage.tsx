"use client";

// Spotify-Playlist oder -Album: Lieder als große Kacheln. Ein Tipp spielt genau dieses eine Lied.
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import { IconBack, IconPause, IconPlay } from "@/components/Icons";
import { useSpotifyPlaylists } from "@/components/hooks";
import { colorFor, type MediaItem } from "@/lib/library";
import { getAlbumTracks, getPlaylistItems, type PlayableItem } from "@/lib/spotify";
import { getPicks, read, write } from "@/lib/store";
import { log } from "@/lib/diagnostics";
import { img } from "@/lib/img";

export default function MusicPage({ kind, id }: { kind: "playlist" | "album"; id: string }) {
  const { playlists } = useSpotifyPlaylists();
  const own = playlists.find((p) => p.id === id);
  const pick = getPicks().find((p) => p.id === id);
  const key = `leocast:${kind}:${id}`;
  const [items, setItems] = useState<MediaItem[]>([]);
  const [meta, setMeta] = useState<{ name?: string; image?: string }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(read<MediaItem[]>(key, []));
    const load: Promise<PlayableItem[]> =
      kind === "album"
        ? getAlbumTracks(id).then((a) => {
            setMeta({ name: a.name, image: a.image });
            return a.items;
          })
        : getPlaylistItems(id);
    load
      .then((list) => {
        const playable: MediaItem[] = list.map((t) => ({
          // Spotify-Podcastfolgen laufen ebenfalls über Spotify
          kind: "track",
          id: `sp:${t.uri}`,
          title: t.name,
          subtitle: t.subtitle,
          image: t.image,
          color: colorFor(t.name),
          durationSec: t.duration_ms ? t.duration_ms / 1000 : undefined,
          uri: t.uri,
          playlistId: id,
        }));
        setItems(playable);
        write(key, playable);
      })
      .catch((e) => {
        setError("Die Lieder lassen sich gerade nicht laden.");
        log("error", `${kind === "album" ? "Album" : "Playlist"}: ${(e as Error).message}`);
      });
  }, [id, key, kind]);

  const name = own?.name || pick?.name || meta.name || "Lieder";
  const image = own?.images?.[0]?.url || pick?.image || meta.image;
  const color = colorFor(name);

  return (
    <main className="page world world-fit" style={{ ["--world" as string]: color }}>
      <header className="world-head">
        <Link href="/" className="round-btn back-btn" aria-label="Zurück">
          <IconBack />
        </Link>
        <div className="world-logo small square" style={{ background: color }}>
          {image && <img src={img(image, 256)} alt="" />}
        </div>
        <h1 className="world-title">{name}</h1>
      </header>
      {error && <p className="hint">{error}</p>}
      {items.length > 0 && (
        <ol className="track-list">
          {items.map((it, i) => (
            <TrackRow key={it.id} item={it} index={i} list={items} />
          ))}
        </ol>
      )}
    </main>
  );
}

function fmt(sec?: number) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

/** Eine Zeile der Liederliste: Antippen spielt das Lied (und je nach Einstellung die folgenden) */
function TrackRow({ item, index, list }: { item: MediaItem; index: number; list: MediaItem[] }) {
  const p = usePlayer();
  const isCurrent = p.current?.id === item.id;
  return (
    <li>
      <button
        className={`track-row ${isCurrent ? "is-current" : ""}`}
        onClick={() => (isCurrent ? p.toggle() : p.play(item, list))}
        aria-label={`${item.title} ${isCurrent && p.playing ? "anhalten" : "abspielen"}`}
      >
        <span className="track-num">{index + 1}</span>
        {item.image ? <img src={img(item.image, 128)} alt="" className="track-cover" /> : <span className="track-cover" />}
        <span className="track-text">
          <span className="track-title">{item.title}</span>
          {item.subtitle && <span className="track-sub">{item.subtitle}</span>}
        </span>
        <span className="track-time">{fmt(item.durationSec)}</span>
        <span className="track-play" aria-hidden="true">
          {isCurrent && p.playing ? <IconPause size={22} /> : <IconPlay size={22} />}
        </span>
      </button>
    </li>
  );
}
