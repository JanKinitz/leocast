"use client";

// PWA-Installation: Chrome meldet „beforeinstallprompt“ früh – wir merken uns das Ereignis für den Knopf.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    installed ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function canInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  notify();
  return outcome === "accepted";
}

export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
