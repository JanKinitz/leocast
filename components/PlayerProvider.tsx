"use client";

// Ein gemeinsamer Player für Podcast-Folgen (eigener Audio-Player) und Spotify-Titel (Web Playback SDK).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "@/lib/library";
import { playableSrc } from "@/lib/offline";
import { getProgress, saveProgress } from "@/lib/store";
import { hasSpotify, musicContinuous } from "@/lib/spotify";
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
  /** Ganze Liste, aus der gerade abgespielt wird (Playlist, Album, Sendung) */
  list: MediaItem[];
  /** Musik: zum vorigen (-1) bzw. nächsten (+1) Lied der Liste */
  skipTrack: (dir: -1 | 1) => void;
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
  /** Nach einem Fehler: aktuelle Folge bzw. aktuelles Lied an derselben Stelle neu starten */
  retry: () => void;
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
  // Podcast-Folgen: soll gerade etwas laufen? Und Stand der automatischen Wiederholung nach Fehlern
  const wantPlayRef = useRef(false);
  const recoveringRef = useRef(false);
  const retryCountRef = useRef(0);
  const goodPosRef = useRef(0);
  const lastRetryPosRef = useRef(0);
  const [current, setCurrent] = useState<MediaItem | null>(null);
  const [more, setMore] = useState<MediaItem[]>([]);
  // ganze Liste der aktuellen Playlist/Sendung (für „nächstes Lied“-Anzeige)
  const moreRef = useRef<MediaItem[]>([]);
  const [list, setList] = useState<MediaItem[]>([]);
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
    setSpotifyEnabled(hasSpotify());
  }, []);

  const onSdkState = useCallback((s: SdkState) => {
    if (engineRef.current !== "spotify") return;
    // Nächstes Lied der Playlist läuft: Anzeige im Player mitziehen
    const cur = currentRef.current;
    if (s.uri && cur?.uri && s.uri !== cur.uri) {
      const next = moreRef.current.find((m) => m.uri === s.uri);
      if (next) {
        currentRef.current = next;
        setCurrent(next);
      }
    }
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
      if (engineRef.current !== "audio" || recoveringRef.current) return;
      goodPosRef.current = a.currentTime;
      // Läuft wieder eine Weile ohne Fehler: Zähler für Wiederholungen zurücksetzen
      if (retryCountRef.current && a.currentTime - lastRetryPosRef.current > 30) retryCountRef.current = 0;
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
      if (engineRef.current !== "audio" || recoveringRef.current) return;
      setPlaying(false);
      const item = currentRef.current;
      if (item) saveProgress(item, a.currentTime, a.duration || 0);
    };
    const onEnded = () => {
      // Kein automatisches Weiterspielen: Folge zu Ende = Stille
      wantPlayRef.current = false;
      setPlaying(false);
      const item = currentRef.current;
      if (item) saveProgress(item, 0, a.duration || 0, true);
      log("info", "Folge zu Ende – Wiedergabe gestoppt");
    };
    const waitOnline = () =>
      new Promise<void>((resolve) => {
        if (navigator.onLine) return resolve();
        const done = () => {
          window.removeEventListener("online", done);
          window.clearTimeout(t);
          resolve();
        };
        const t = window.setTimeout(done, 60000);
        window.addEventListener("online", done);
      });

    // Folge an derselben Stelle neu laden (z. B. Verbindung kurz weg, Adresse des Podcast-Servers abgelaufen)
    const recover = async (item: MediaItem, at: number, attempt: number) => {
      await waitOnline();
      if (currentRef.current?.id !== item.id || engineRef.current !== "audio" || !wantPlayRef.current) {
        recoveringRef.current = false;
        return;
      }
      try {
        const { src } = await playableSrc(item.audioUrl!);
        const resumeAt = Math.max(0, at - 2);
        a.addEventListener(
          "loadedmetadata",
          () => {
            a.currentTime = resumeAt;
          },
          { once: true },
        );
        a.src = src;
        await a.play();
        lastRetryPosRef.current = resumeAt;
        recoveringRef.current = false;
        setError(null);
        log("ok", `Folge läuft wieder ab ${Math.round(resumeAt)} s (Versuch ${attempt})`);
      } catch (e) {
        // play() scheitert meist zusammen mit einem neuen error-Ereignis; das übernimmt den nächsten Versuch
        log("error", `Neuer Versuch ${attempt}: ${(e as Error).message}`);
        if (a.error == null) {
          recoveringRef.current = false;
          giveUp(item, at);
        }
      }
    };

    const giveUp = (item: MediaItem, at: number) => {
      recoveringRef.current = false;
      wantPlayRef.current = false;
      setPlaying(false);
      saveProgress(item, at, durationRef.current || 0);
      setError("Diese Folge lässt sich gerade nicht abspielen.");
    };

    const onError = () => {
      if (engineRef.current !== "audio") return;
      const item = currentRef.current;
      const err = a.error;
      const at = goodPosRef.current;
      log("error", `Folge-Fehler ${err?.code ?? "?"}${err?.message ? ` (${err.message})` : ""} bei ${Math.round(at)} s`);
      if (!item?.audioUrl) {
        setError("Diese Folge lässt sich gerade nicht abspielen.");
        return;
      }
      if (!wantPlayRef.current || retryCountRef.current >= 3) return giveUp(item, at);
      retryCountRef.current += 1;
      const attempt = retryCountRef.current;
      recoveringRef.current = true;
      window.setTimeout(() => recover(item, at, attempt), [500, 2000, 5000][attempt - 1] ?? 5000);
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
    wantPlayRef.current = false;
    audioRef.current?.pause();
    if (engineRef.current === "spotify") spotifyRef.current.sdk()?.pause();
  }, []);

  const play = useCallback(
    async (item: MediaItem, moreItems: MediaItem[] = []) => {
      setError(null);
      retryCountRef.current = 0;
      recoveringRef.current = false;
      goodPosRef.current = 0;
      wantPlayRef.current = item.kind === "episode";
      currentRef.current = item;
      setCurrent(item);
      setMore(moreItems.filter((m) => m.id !== item.id).slice(0, 12));
      moreRef.current = moreItems;
      setList(moreItems);
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
          const queue = musicContinuous()
            ? moreItems.filter((m) => m.kind === "track" && m.uri).map((m) => m.uri as string)
            : undefined;
          await spotifyRef.current.play(item.uri, queue && queue.includes(item.uri) ? queue : undefined);
        }
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg.includes("bereit") ? "Musik startet gleich – bitte noch einmal tippen." : "Das hat nicht geklappt.");
        log("error", `Abspielen: ${msg}`);
      }
    },
    [open],
  );

  const skipTrack = useCallback(
    (dir: -1 | 1) => {
      const all = moreRef.current;
      const cur = currentRef.current;
      const idx = cur ? all.findIndex((m) => m.id === cur.id) : -1;
      // Zurück am Liedanfang: vorheriges Lied; nach den ersten Sekunden: Lied von vorn
      if (dir === -1 && positionRef.current > 4) {
        if (engineRef.current === "spotify") spotifyRef.current.sdk()?.seek(0);
        return;
      }
      const target = all[idx + dir];
      if (target) play(target, all);
    },
    [play],
  );

  const toggle = useCallback(() => {
    if (engineRef.current === "audio") {
      const a = audioRef.current!;
      const cur = currentRef.current;
      if (a.error && cur) {
        // Nach einem Fehler: Folge an der letzten Stelle neu starten
        play(cur, moreRef.current);
      } else if (a.paused) {
        wantPlayRef.current = true;
        a.play().catch((e) => log("error", `Weiterspielen: ${(e as Error).message}`));
      } else {
        wantPlayRef.current = false;
        a.pause();
      }
    } else if (engineRef.current === "spotify") {
      const p = spotifyRef.current.sdk();
      if (!p) return;
      // Nach einer Neuverbindung ist im Player nichts geladen: dann das aktuelle Lied neu starten
      Promise.resolve(p.getCurrentState())
        .catch(() => null)
        .then((s: unknown) => {
          const cur = currentRef.current;
          if (s) p.togglePlay();
          else if (cur) play(cur, moreRef.current);
        });
    }
  }, [play]);

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

  const retry = useCallback(() => {
    const cur = currentRef.current;
    if (cur) play(cur, moreRef.current);
  }, [play]);

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
      list,
      skipTrack,
      storyAt,
      skipToStory,
      relaxAt,
      skipToRelax,
      retry,
    }),
    [current, more, playing, position, duration, expanded, open, close, play, toggle, seekBy, seekTo, sleep, setSleep, sleepEndsAt, spotifyHook.ready, spotifyHook.error, error, storyAt, skipToStory, relaxAt, skipToRelax, list, skipTrack, retry],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
