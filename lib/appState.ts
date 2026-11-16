// Kleiner gemeinsamer Zustand außerhalb von React: läuft gerade etwas?
// Wird genutzt, um Updates erst dann neu zu laden, wenn nichts abgespielt wird.
let playing = false;
const listeners = new Set<() => void>();

export function setAppPlaying(value: boolean) {
  playing = value;
  listeners.forEach((l) => l());
}

export function isAppPlaying() {
  return playing;
}

export function onAppPlayingChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
