"use client";

// Lädt das Spotify Web Playback SDK und macht die App selbst zu einem Spotify-Connect-Gerät.
import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken, playUri } from "@/lib/spotify";
import { log } from "@/lib/diagnostics";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: any;
  }
}

export type PlayerState = {
  paused: boolean;
  position: number;
  duration: number;
  trackName?: string;
  trackUri?: string;
  image?: string;
  artist?: string;
};

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

export function useSpotifyPlayer(enabled: boolean) {
  const playerRef = useRef<any>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [state, setState] = useState<PlayerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activatedRef = useRef(false);
  const stopAtEndRef = useRef<string | null>(null);

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
        log("ok", `Web Playback SDK bereit (Gerät ${device_id.slice(0, 8)}…)`);
      });
      player.addListener("not_ready", () => {
        setDeviceId(null);
        log("info", "Web Playback SDK nicht mehr bereit");
      });
      const onErr = (kind: string) => ({ message }: { message: string }) => {
        const text = `${kind}: ${message}`;
        setError(text);
        log("error", text);
      };
      player.addListener("initialization_error", onErr("Initialisierung (DRM/Browser)"));
      player.addListener("authentication_error", onErr("Anmeldung"));
      player.addListener("account_error", onErr("Konto (Premium nötig)"));
      player.addListener("playback_error", onErr("Wiedergabe"));
      player.addListener("autoplay_failed", () => {
        log("error", "Autoplay vom Browser blockiert – bitte noch einmal auf Play tippen");
      });
      player.addListener("player_state_changed", (s: any) => {
        if (!s) return;
        const cur = s.track_window?.current_track;
        setState({
          paused: s.paused,
          position: s.position,
          duration: s.duration,
          trackName: cur?.name,
          trackUri: cur?.uri,
          image: cur?.album?.images?.[0]?.url,
          artist: (cur?.artists || []).map((a: any) => a.name).join(", "),
        });
        // Wiedergabe am Ende des gewählten Titels anhalten (kein Autoplay mit ähnlichen Titeln)
        if (stopAtEndRef.current && cur?.uri && cur.uri !== stopAtEndRef.current && !s.paused) {
          player.pause();
          log("info", "Anderer Titel gestartet – Leocast hat angehalten (kein Autoplay)");
        }
      });
      player.connect().then((ok: boolean) => {
        log(ok ? "info" : "error", ok ? "Verbinde mit Spotify…" : "Verbindung zum SDK fehlgeschlagen");
      });
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const play = useCallback(
    async (uri: string) => {
      const player = playerRef.current;
      if (!player || !deviceId) {
        setError("Player ist noch nicht bereit");
        return;
      }
      if (!activatedRef.current) {
        // Mobile Browser starten Audio nur nach einer Berührung
        try {
          await player.activateElement();
        } catch {
          /* ältere SDK-Versionen */
        }
        activatedRef.current = true;
      }
      try {
        stopAtEndRef.current = uri;
        await playUri(deviceId, uri);
        log("ok", "Wiedergabe gestartet");
      } catch (e: any) {
        setError(e.message);
        log("error", `Abspielen fehlgeschlagen: ${e.message}`);
      }
    },
    [deviceId],
  );

  const toggle = useCallback(() => playerRef.current?.togglePlay(), []);
  const seekBy = useCallback(
    (ms: number) => {
      if (!state) return;
      playerRef.current?.seek(Math.max(0, state.position + ms));
    },
    [state],
  );

  return { deviceId, state, error, play, toggle, seekBy };
}
