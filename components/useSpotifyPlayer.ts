"use client";

// Lädt das Spotify Web Playback SDK und macht Leocast selbst zu einem Spotify-Connect-Gerät.
import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken, playUri } from "@/lib/spotify";
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

export function useSpotifyPlayer(enabled: boolean, onState: (s: SdkState) => void) {
  const playerRef = useRef<any>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activatedRef = useRef(false);
  const wantedUriRef = useRef<string | null>(null);
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
      player.addListener("not_ready", () => setDeviceId(null));
      const onErr =
        (kind: string) =>
        ({ message }: { message: string }) => {
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
        if (wantedUriRef.current && uri && uri !== wantedUriRef.current && !s.paused) {
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
  }, [enabled]);

  const play = useCallback(
    async (uri: string) => {
      const player = playerRef.current;
      if (!player || !deviceId) throw new Error("Spotify ist noch nicht bereit");
      if (!activatedRef.current) {
        try {
          await player.activateElement();
        } catch {
          /* ältere SDK-Versionen */
        }
        activatedRef.current = true;
      }
      wantedUriRef.current = uri;
      await playUri(deviceId, uri);
    },
    [deviceId],
  );

  const sdk = useCallback(() => playerRef.current, []);

  return { ready: !!deviceId, error, play, sdk };
}
