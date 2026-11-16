// Kleines Protokoll für den Prototyp: zeigt auf dem Gerät, was geklappt hat und was nicht.

export type LogEntry = { time: string; level: "ok" | "info" | "error"; text: string };

const KEY = "leocast:log";
const listeners = new Set<() => void>();

export function readLog(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function log(level: LogEntry["level"], text: string) {
  if (typeof window === "undefined") return;
  const entries = readLog();
  entries.unshift({ time: new Date().toLocaleTimeString("de-DE"), level, text });
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 60)));
  listeners.forEach((fn) => fn());
}

export function clearLog() {
  localStorage.removeItem(KEY);
  listeners.forEach((fn) => fn());
}

export function subscribeLog(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
