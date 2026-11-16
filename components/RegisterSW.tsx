"use client";

// Service Worker registrieren und Aktualisierungen automatisch übernehmen:
// Ist eine neue Version veröffentlicht, lädt die App neu, sobald gerade nichts abgespielt wird.
import { useEffect } from "react";
import { isAppPlaying, onAppPlayingChange } from "@/lib/appState";
import { log } from "@/lib/diagnostics";
import "@/lib/install"; // Installations-Angebot von Chrome früh abfangen

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const CHECK_EVERY = 10 * 60 * 1000;

export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    let updateReady = false;
    let reloading = false;

    const reloadWhenIdle = () => {
      if (!updateReady || reloading || isAppPlaying()) return;
      reloading = true;
      log("info", "Neue Version – Leocast lädt neu");
      window.location.reload();
    };

    const check = async () => {
      if (!navigator.onLine) return;
      try {
        navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
        const res = await fetch("/api/version", { cache: "no-store" });
        const { build } = await res.json();
        if (build && build !== BUILD) {
          updateReady = true;
          reloadWhenIdle();
        }
      } catch {
        /* offline oder Server nicht erreichbar */
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`/sw.js?v=${BUILD}`).catch(() => {
        /* Service Worker optional */
      });
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    const off = onAppPlayingChange(reloadWhenIdle);
    const timer = window.setInterval(check, CHECK_EVERY);
    check();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
      off();
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
