"use client";

// Startet den Abgleich zwischen den Geräten: beim Öffnen, beim Zurückkehren in die App, alle 5 Minuten
// und kurz nach Änderungen. Der Hörfortschritt ändert sich ständig – der wird höchstens alle 10 Minuten
// geschickt (und sobald die App in den Hintergrund geht), um das kostenlose Kontingent zu schonen.
import { useEffect } from "react";
import { detectDeviceName, setLocalChangeListener, syncNow } from "@/lib/sync";

const SOON_MS = 5_000;
const PROGRESS_MS = 10 * 60_000;
const PULL_MS = 5 * 60_000;

export default function SyncManager() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    let soon: ReturnType<typeof setTimeout> | null = null;
    let later: ReturnType<typeof setTimeout> | null = null;

    const run = (reason: string) => {
      if (soon) clearTimeout(soon);
      if (later) clearTimeout(later);
      soon = later = null;
      syncNow(reason);
    };

    setLocalChangeListener((key) => {
      if (key === "leocast:progress") {
        if (!later && !soon) later = setTimeout(() => run("Fortschritt"), PROGRESS_MS);
      } else {
        if (soon) clearTimeout(soon);
        soon = setTimeout(() => run("Änderung"), SOON_MS);
      }
    });

    const onVisibility = () => run(document.visibilityState === "visible" ? "zurück" : "Hintergrund");
    const onOnline = () => run("online");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => document.visibilityState === "visible" && run("regelmäßig"), PULL_MS);
    detectDeviceName().finally(() => run("Start"));

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
      setLocalChangeListener(() => {});
      if (soon) clearTimeout(soon);
      if (later) clearTimeout(later);
    };
  }, []);
  return null;
}
