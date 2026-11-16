"use client";

// Spotify-Playlist: Lieder als große Kacheln. Ein Tipp spielt genau dieses eine Lied.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PlayTile, Rail } from "@/components/Tiles";
import { IconBack } from "@/components/Icons";
import { useSpotifyPlaylists } from "@/components/hooks";
import { colorFor, type MediaItem } from "@/lib/library";
import { getPlaylistItems } from "@/lib/spotify";
import { read, write } from "@/lib/store";
import { log } from "@/lib/diagnostics";
import { img } from "@/lib/img";

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const { playlists } = useSpotifyPlaylists();
  const pl = playlists.find((p) => p.id === id);
  const key = `leocast:playlist:${id}`;
  const [items, setItems] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(read<MediaItem[]>(key, []));
    getPlaylistItems(id)
      .then((list) => {
        const mapped: MediaItem[] = list.map((t) => ({
          kind: t.type === "episode" ? "episode" : "track",
          id: `sp:${t.uri}`,
          title: t.name,
          subtitle: t.subtitle,
          image: t.image,
          color: colorFor(t.name),
          durationSec: t.duration_ms ? t.duration_ms / 1000 : undefined,
          uri: t.uri,
          playlistId: id,
        }));
        // Spotify-Podcastfolgen laufen ebenfalls über Spotify
        const playable = mapped.map((m) => (m.kind === "episode" ? { ...m, kind: "track" as const } : m));
        setItems(playable);
        write(key, playable);
      })
      .catch((e) => {
        setError("Die Lieder lassen sich gerade nicht laden.");
        log("error", `Playlist: ${(e as Error).message}`);
      });
  }, [id, key]);

  const color = pl ? colorFor(pl.name) : "#3b2f6b";

  return (
    <main className="page world world-fit" style={{ ["--world" as string]: color }}>
      <header className="world-head">
        <Link href="/" className="round-btn back-btn" aria-label="Zurück">
          <IconBack />
        </Link>
        <div className="world-logo small square" style={{ background: color }}>
          {pl?.images?.[0]?.url && <img src={img(pl.images[0].url, 256)} alt="" />}
        </div>
        <h1 className="world-title">{pl?.name || "Lieder"}</h1>
      </header>
      {error && <p className="hint">{error}</p>}
      {items.length > 0 && (
        <Rail title="Lieder">
          {items.map((it) => (
            <PlayTile key={it.id} item={it} more={items} />
          ))}
        </Rail>
      )}
    </main>
  );
}
