"use client";

// Lädt das Spotify Web Playback SDK und macht Leocast selbst zu einem Spotify-Connect-Gerät.
import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken, getDevices, playUri, SpotifyError } from "@/lib/spotify";
import { log } from "@/lib/diagnostics";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: any;
  }
}

export type SdkState = { paused: boolean; position: number; duration: number; uri?: string };

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
  });
  return sdkPromise;
}

// Wie lange wir auf „bereit“ warten, bevor wir aufgeben
const READY_TIMEOUT = 12000;
// Nach so langer Zeit im Hintergrund prüfen, ob Spotify das Gerät noch kennt
const STALE_AFTER = 60 * 1000;

export function useSpotifyPlayer(enabled: boolean, onState: (s: SdkState) => void) {
  const playerRef = useRef<any>(null);
  const [deviceId, setDeviceIdState] = useState<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const readyWaitersRef = useRef<((id: string) => void)[]>([]);
  const reconnectingRef = useRef<Promise<string> | null>(null);
  const setDeviceId = useCallback((id: string | null) => {
    deviceIdRef.current = id;
    setDeviceIdState(id);
    if (id) {
      const waiters = readyWaitersRef.current;
      readyWaitersRef.current = [];
      waiters.forEach((fn) => fn(id));
    }
  }, []);
  const [error, setError] = useState<string | null>(null);
  const activatedRef = useRef(false);
  const wantedUriRef = useRef<string | null>(null);
  const allowedRef = useRef<Set<string>>(new Set());
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadSdk().then(() => {
      if (cancelled || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: "Leocast",
        volume: 0.8,
        getOAuthToken: (cb: (t: string) => void) => {
          getAccessToken().then((t) => t && cb(t));
        },
      });
      player.addListener("ready", ({ device_id }: { device_id: string }) => {
        setDeviceId(device_id);
        setError(null);
        log("ok", "Spotify-Player bereit");
      });
      player.addListener("not_ready", () => {
        setDeviceId(null);
        log("info", "Spotify-Player getrennt");
      });
      const onErr =
        (kind: string) =>
        ({ message }: { message: string }) => {
          // Tipp auf Pause/Spulen, während nichts geladen ist: harmlos, nicht melden
          if (/no list was loaded/i.test(message)) return;
          setError(`${kind}: ${message}`);
          log("error", `Spotify ${kind}: ${message}`);
        };
      player.addListener("initialization_error", onErr("Start"));
      player.addListener("authentication_error", onErr("Anmeldung"));
      player.addListener("account_error", onErr("Konto"));
      player.addListener("playback_error", onErr("Wiedergabe"));
      player.addListener("player_state_changed", (s: any) => {
        if (!s) return;
        const uri = s.track_window?.current_track?.uri;
        // Kein Autoplay: läuft etwas anderes als der gewählte Titel, sofort anhalten
        if (allowedRef.current.size && uri && !allowedRef.current.has(uri) && !s.paused) {
          player.pause();
        }
        onStateRef.current({ paused: s.paused, position: s.position / 1000, duration: s.duration / 1000, uri });
      });
      player.connect();
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, setDeviceId]);

  // Auf „bereit“ warten (oder sofort, wenn schon bereit)
  const waitReady = useCallback((): Promise<string> => {
    if (deviceIdRef.current) return Promise.resolve(deviceIdRef.current);
    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        readyWaitersRef.current = readyWaitersRef.current.filter((fn) => fn !== done);
        reject(new Error("Spotify ist noch nicht bereit"));
      }, READY_TIMEOUT);
      const done = (id: string) => {
        window.clearTimeout(timer);
        resolve(id);
      };
      readyWaitersRef.current.push(done);
    });
  }, []);

  // Player neu bei Spotify anmelden (Spotify hat das Gerät vergessen, z. B. nach langem Schlaf des Handys)
  const reconnect = useCallback((): Promise<string> => {
    if (reconnectingRef.current) return reconnectingRef.current;
    const player = playerRef.current;
    if (!player) return Promise.reject(new Error("Spotify ist noch nicht bereit"));
    log("info", "Spotify-Player verbindet sich neu");
    setDeviceId(null);
    activatedRef.current = false;
    const p = (async () => {
      try {
        player.disconnect();
      } catch {
        /* egal */
      }
      await new Promise((r) => setTimeout(r, 300));
      const wait = waitReady();
      await player.connect();
      return wait;
    })().finally(() => {
      reconnectingRef.current = null;
    });
    reconnectingRef.current = p;
    return p;
  }, [setDeviceId, waitReady]);

  // Zurück aus dem Hintergrund: prüfen, ob Spotify das Gerät noch kennt, sonst neu verbinden
  useEffect(() => {
    if (!enabled) return;
    let hiddenAt = 0;
    const onVis = async () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (!hiddenAt || Date.now() - hiddenAt < STALE_AFTER || !playerRef.current || !navigator.onLine) return;
      hiddenAt = 0;
      const id = deviceIdRef.current;
      try {
        const res = await getDevices();
        if (!id || !res?.devices?.some((d) => d.id === id)) await reconnect();
      } catch {
        /* kein Netz o. Ä.: beim nächsten Abspielen klappt es über den zweiten Versuch */
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled, reconnect]);

  const play = useCallback(
    async (uri: string, queue?: string[]) => {
      const player = playerRef.current;
      if (!player) throw new Error("Spotify ist noch nicht bereit");
      let id = deviceIdRef.current || (await (reconnectingRef.current || waitReady()));
      if (!activatedRef.current) {
        try {
          await player.activateElement();
        } catch {
          /* ältere SDK-Versionen */
        }
        activatedRef.current = true;
      }
      wantedUriRef.current = uri;
      allowedRef.current = new Set(queue && queue.length ? queue : [uri]);
      try {
        await playUri(id, uri, queue);
      } catch (e) {
        // Spotify kennt das Gerät nicht mehr: neu anmelden und einmal still wiederholen
        if (!(e instanceof SpotifyError && e.status === 404)) throw e;
        log("info", "Spotify kennt das Gerät nicht mehr – neuer Versuch");
        id = await reconnect();
        try {
          await player.activateElement();
        } catch {
          /* ältere SDK-Versionen */
        }
        activatedRef.current = true;
        await playUri(id, uri, queue);
        log("ok", "Zweiter Versuch hat geklappt");
      }
    },
    [reconnect, waitReady],
  );

  const sdk = useCallback(() => playerRef.current, []);

  return { ready: !!deviceId, error, play, sdk };
}
