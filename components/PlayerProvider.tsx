"use client";

// Ein gemeinsamer Player für Podcast-Folgen (eigener Audio-Player) und Spotify-Titel (Web Playback SDK).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "@/lib/library";
import { playableSrc } from "@/lib/offline";
import { getProgress, saveProgress } from "@/lib/store";
import { loadToken } from "@/lib/spotify";
import { log } from "@/lib/diagnostics";
import { setAppPlaying } from "@/lib/appState";
import { podcastById } from "@/lib/library";
import { getMarkers, getStartMode } from "@/lib/markers";
import { useSpotifyPlayer, type SdkState } from "./useSpotifyPlayer";

export type SleepMode = "end" | 15 | 30 | 45;

type PlayerCtx = {
  current: MediaItem | null;
  more: MediaItem[];
  playing: boolean;
  position: number;
  duration: number;
  expanded: boolean;
  open: () => void;
  close: () => void;
  play: (item: MediaItem, more?: MediaItem[]) => Promise<void>;
  toggle: () => void;
  seekBy: (sec: number) => void;
  seekTo: (sec: number) => void;
  sleep: SleepMode;
  setSleep: (m: SleepMode) => void;
  sleepEndsAt: number | null;
  spotifyReady: boolean;
  spotifyError: string | null;
  error: string | null;
  /** Absolute Stelle, an der die eigentliche Geschichte beginnt (oder null) */
  storyAt: number | null;
  skipToStory: () => void;
  /** Absolute Stelle, an der die Entspannung beginnt (oder null) */
  relaxAt: number | null;
  skipToRelax: () => void;
};

const Ctx = createContext<PlayerCtx | null>(null);

export function usePlayer(): PlayerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlayer außerhalb des PlayerProvider");
  return c;
}

const TABLET_QUERY = "(min-width: 900px) and (orientation: landscape), (min-width: 700px) and (orientation: portrait)";

export function isTabletLayout() {
  return typeof window !== "undefined" && window.matchMedia(TABLET_QUERY).matches;
}

export default function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<"audio" | "spotify" | null>(null);
  const currentRef = useRef<MediaItem | null>(null);
  const lastSaveRef = useRef(0);
  const [current, setCurrent] = useState<MediaItem | null>(null);
  const [more, setMore] = useState<MediaItem[]>([]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setAppPlaying(playing), [playing]);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [sleep, setSleepState] = useState<SleepMode>("end");
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spotifyEnabled, setSpotifyEnabled] = useState(false);
  const [storyAt, setStoryAt] = useState<number | null>(null);
  const [relaxAt, setRelaxAt] = useState<number | null>(null);

  useEffect(() => {
    setSpotifyEnabled(!!loadToken());
  }, []);

  const onSdkState = useCallback((s: SdkState) => {
    if (engineRef.current !== "spotify") return;
    setPlaying(!s.paused);
    setPosition(s.position);
    setDuration(s.duration);
  }, []);
  const spotifyHook = useSpotifyPlayer(spotifyEnabled, onSdkState);
  const spotifyRef = useRef(spotifyHook);
  spotifyRef.current = spotifyHook;
  const positionRef = useRef(0);
  positionRef.current = position;
  const durationRef = useRef(0);
  durationRef.current = duration;

  // Audio-Element für Podcast-Folgen
  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    audioRef.current = a;
    const onTime = () => {
      if (engineRef.current !== "audio") return;
      setPosition(a.currentTime);
      if (isFinite(a.duration)) setDuration(a.duration);
      const item = currentRef.current;
      if (item && Date.now() - lastSaveRef.current > 5000) {
        lastSaveRef.current = Date.now();
        saveProgress(item, a.currentTime, a.duration || 0);
      }
    };
    const onPlay = () => engineRef.current === "audio" && setPlaying(true);
    const onPause = () => {
      if (engineRef.current !== "audio") return;
      setPlaying(false);
      const item = currentRef.current;
      if (item) saveProgress(item, a.currentTime, a.duration || 0);
    };
    const onEnded = () => {
      // Kein automatisches Weiterspielen: Folge zu Ende = Stille
      setPlaying(false);
      const item = currentRef.current;
      if (item) saveProgress(item, 0, a.duration || 0, true);
      log("info", "Folge zu Ende – Wiedergabe gestoppt");
    };
    const onError = () => {
      if (engineRef.current === "audio") setError("Diese Folge lässt sich gerade nicht abspielen.");
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
    };
  }, []);

  // Spotify: Position regelmäßig abfragen
  useEffect(() => {
    if (!playing || engineRef.current !== "spotify") return;
    const t = setInterval(async () => {
      const p = spotifyRef.current.sdk();
      const s = p && (await p.getCurrentState());
      if (s) {
        setPosition(s.position / 1000);
        setDuration(s.duration / 1000);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [playing]);

  // Zurück-Taste von Android schließt den Vollbild-Player
  useEffect(() => {
    const onPop = () => setExpanded(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = useCallback(() => {
    if (isTabletLayout()) return;
    setExpanded((was) => {
      if (!was) window.history.pushState({ leocastPlayer: true }, "");
      return true;
    });
  }, []);

  const close = useCallback(() => {
    if (window.history.state?.leocastPlayer) window.history.back();
    else setExpanded(false);
  }, []);

  const pauseAll = useCallback(() => {
    audioRef.current?.pause();
    if (engineRef.current === "spotify") spotifyRef.current.sdk()?.pause();
  }, []);

  const play = useCallback(
    async (item: MediaItem, moreItems: MediaItem[] = []) => {
      setError(null);
      currentRef.current = item;
      setCurrent(item);
      setMore(moreItems.filter((m) => m.id !== item.id).slice(0, 12));
      setPosition(0);
      setDuration(item.durationSec || 0);
      open();
      try {
        if (item.kind === "episode" && item.audioUrl) {
          if (engineRef.current === "spotify") spotifyRef.current.sdk()?.pause();
          engineRef.current = "audio";
          const a = audioRef.current!;
          a.volume = 1;
          const { src } = await playableSrc(item.audioUrl);
          a.src = src;
          const saved = getProgress(item.id);
          const source = item.podcastId ? podcastById(item.podcastId) : undefined;
          setStoryAt(null);
          setRelaxAt(null);
          const markers = getMarkers(item);
          const resumed = Boolean(saved && !saved.finished && saved.pos > 5);
          a.addEventListener(
            "loadedmetadata",
            async () => {
              const dur = isFinite(a.duration) ? a.duration : 0;
              // Ersatz ohne KI: eingefügte Werbung = tatsächliche Länge minus Länge laut Feed
              const extra = item.durationSec && dur ? dur - item.durationSec : 0;
              const feedOffset = extra > 5 && extra < 240 ? extra : 0;
              if (resumed && saved) a.currentTime = Math.max(0, saved.pos - 3);

              const m = await markers;
              if (currentRef.current?.id !== item.id) return;
              let shift = 0;
              if (m?.absolute && m.totalSec && dur) {
                // Auf diesem Gerät kann die Werbung anders lang sein als bei der Analyse
                const d = dur - m.totalSec;
                shift = Math.abs(d) > 2 && Math.abs(d) < 240 ? d : 0;
              } else if (m && !m.absolute) {
                shift = feedOffset;
              }
              const adEnd = m?.source === "ki" ? m.content + shift : feedOffset;
              const story = m?.story != null ? m.story + shift : null;
              const relax = m?.relax != null && story != null ? m.relax + shift : null;
              setStoryAt(story);
              setRelaxAt(relax);
              if (story != null) log("info", `Entspannung ab ${relax == null ? "–" : Math.round(relax)} s, Geschichte ab ${Math.round(story)} s (${m?.source})`);
              if (resumed) return;
              const pos = a.currentTime;
              // Werbung immer überspringen; danach je nach Einstellung der Eltern weiter springen
              const mode = item.podcastId ? getStartMode(item.podcastId) : "anfang";
              const target =
                mode === "geschichte" && story != null
                  ? story
                  : mode !== "anfang" && relax != null
                    ? relax
                    : mode === "entspannung" && story != null
                      ? story
                      : adEnd > 3 && source?.skipAds !== false
                        ? adEnd
                        : 0;
              if (target > pos + 2) {
                a.currentTime = target;
                log("ok", `Start bei ${Math.round(target)} s (${target === adEnd ? "nach der Werbung" : mode})`);
              }
            },
            { once: true },
          );
          await a.play();
          saveProgress(item, saved && !saved.finished ? saved.pos : 0, item.durationSec || 0);
        } else if (item.kind === "track" && item.uri) {
          setStoryAt(null);
          setRelaxAt(null);
          audioRef.current?.pause();
          engineRef.current = "spotify";
          await spotifyRef.current.play(item.uri);
        }
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg.includes("bereit") ? "Musik startet gleich – bitte noch einmal tippen." : "Das hat nicht geklappt.");
        log("error", `Abspielen: ${msg}`);
      }
    },
    [open],
  );

  const toggle = useCallback(() => {
    if (engineRef.current === "audio") {
      const a = audioRef.current!;
      if (a.paused) a.play();
      else a.pause();
    } else if (engineRef.current === "spotify") {
      spotifyRef.current.sdk()?.togglePlay();
    }
  }, []);

  const seekTo = useCallback(
    (sec: number) => {
      const d = durationRef.current;
      const s = Math.max(0, d ? Math.min(sec, d - 1) : sec);
      if (engineRef.current === "audio") audioRef.current!.currentTime = s;
      else if (engineRef.current === "spotify") spotifyRef.current.sdk()?.seek(Math.round(s * 1000));
      setPosition(s);
    },
    [],
  );

  const seekBy = useCallback((sec: number) => seekTo(positionRef.current + sec), [seekTo]);

  const skipToStory = useCallback(() => {
    if (storyAt != null) {
      seekTo(storyAt);
      log("info", "Zur Geschichte gesprungen");
    }
  }, [storyAt, seekTo]);

  const skipToRelax = useCallback(() => {
    if (relaxAt != null) {
      seekTo(relaxAt);
      log("info", "Zur Entspannung gesprungen");
    }
  }, [relaxAt, seekTo]);

  // Schlaf-Timer: nach X Minuten langsam leiser werden und anhalten
  const setSleep = useCallback((m: SleepMode) => {
    setSleepState(m);
    setSleepEndsAt(m === "end" ? null : Date.now() + m * 60 * 1000);
  }, []);

  useEffect(() => {
    if (!sleepEndsAt) return;
    const t = setInterval(async () => {
      const left = sleepEndsAt - Date.now();
      if (left > 10000) return;
      const vol = Math.max(0, left / 10000);
      if (engineRef.current === "audio" && audioRef.current) audioRef.current.volume = vol;
      if (engineRef.current === "spotify") spotifyRef.current.sdk()?.setVolume(vol * 0.8);
      if (left <= 0) {
        pauseAll();
        if (audioRef.current) audioRef.current.volume = 1;
        spotifyRef.current.sdk()?.setVolume(0.8);
        setSleepEndsAt(null);
        setSleepState("end");
        log("info", "Schlaf-Timer: Wiedergabe angehalten");
      }
    }, 500);
    return () => clearInterval(t);
  }, [sleepEndsAt, pauseAll]);

  // Sperrbildschirm und Kopfhörertasten
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.subtitle || "Leocast",
      artwork: current.image ? [{ src: current.image, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => toggle());
    navigator.mediaSession.setActionHandler("pause", () => toggle());
    navigator.mediaSession.setActionHandler("seekbackward", () => seekBy(-10));
    navigator.mediaSession.setActionHandler("seekforward", () => seekBy(30));
  }, [current, toggle, seekBy]);

  const value = useMemo<PlayerCtx>(
    () => ({
      current,
      more,
      playing,
      position,
      duration,
      expanded,
      open,
      close,
      play,
      toggle,
      seekBy,
      seekTo,
      sleep,
      setSleep,
      sleepEndsAt,
      spotifyReady: spotifyHook.ready,
      spotifyError: spotifyHook.error,
      error,
      storyAt,
      skipToStory,
      relaxAt,
      skipToRelax,
    }),
    [current, more, playing, position, duration, expanded, open, close, play, toggle, seekBy, seekTo, sleep, setSleep, sleepEndsAt, spotifyHook.ready, spotifyHook.error, error, storyAt, skipToStory, relaxAt, skipToRelax],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
