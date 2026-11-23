"use client";

import { useEffect, useState } from "react";
import type { PodcastSource } from "@/lib/library";
import { cachedFeed, loadFeed, type Feed } from "@/lib/podcasts";
import { getPlaylists, hasSpotify, type Playlist } from "@/lib/spotify";
import { read, write } from "@/lib/store";
import { log } from "@/lib/diagnostics";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useFeed(source: PodcastSource | undefined): { feed: Feed | null; error: string | null } {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!source) return;
    setFeed(cachedFeed(source.id));
    let alive = true;
    loadFeed(source)
      .then((f) => alive && setFeed(f))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [source]);
  return { feed, error };
}

const PLAYLISTS_KEY = "leocast:spotify-playlists";

export function useSpotifyPlaylists(): { loggedIn: boolean; playlists: Playlist[] } {
  const [loggedIn, setLoggedIn] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  useEffect(() => {
    const has = hasSpotify();
    setLoggedIn(has);
    if (!has) return;
    setPlaylists(read<Playlist[]>(PLAYLISTS_KEY, []));
    if (!navigator.onLine) return;
    getPlaylists()
      .then((p) => {
        setPlaylists(p);
        write(PLAYLISTS_KEY, p);
      })
      .catch((e) => log("error", `Playlists: ${(e as Error).message}`));
  }, []);
  return { loggedIn, playlists };
}
