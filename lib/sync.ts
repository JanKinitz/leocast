"use client";

// Abgleich zwischen Handy und Tablet (automatisch, Server: /api/sync).
// Abgeglichen werden: Mag ich, Fortschritt, selbst hinzugefügte/ausgeblendete Podcasts, Reihen-Zuordnung,
// Einstellungen „Sprungmarken mit KI“, „Vorspann“ und „Start“, von Eltern korrigierte Sprungmarken.
// Pro Gerät: Name und welche Folgen dort offline gespeichert sind.
import { getDownloads, read, setWriteHook, writeRaw } from "./store";
import { emptyState, type DeviceInfo, type Stamped, type SyncState } from "./syncCore";
import { log } from "./diagnostics";

const MAP_KEYS = ["leocast:likes", "leocast:progress", "leocast:podcast-category", "leocast:spotify-picks"];
const LIST_KEYS = ["leocast:custom-podcasts"]; // Listen von Objekten mit id
const SCALAR_KEYS = ["leocast:hidden-podcasts", "leocast:music-continuous"];
const SCALAR_PREFIXES = ["leocast:intro:", "leocast:autostory:", "leocast:ai:"];
const CORRECTION_PREFIX = "leocast:markers3:"; // nur von Eltern korrigierte Sprungmarken

const META = "leocast:sync-meta";
const CODE = "leocast:family-code";
const DEVICE = "leocast:device";
const STATUS = "leocast:sync-status";

type Meta = Record<string, Record<string, number>>;
export type SyncStatus = { at: number; ok: boolean; message: string; devices?: Record<string, DeviceInfo> };

const isScalar = (key: string) =>
  SCALAR_KEYS.includes(key) || SCALAR_PREFIXES.some((p) => key.startsWith(p)) || key.startsWith(CORRECTION_PREFIX);
const isSynced = (key: string) => MAP_KEYS.includes(key) || LIST_KEYS.includes(key) || isScalar(key);

function asMap(key: string, value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (LIST_KEYS.includes(key) && Array.isArray(value))
    return Object.fromEntries(value.map((x: { id: string }) => [x.id, x]));
  if (MAP_KEYS.includes(key) && typeof value === "object") return value as Record<string, unknown>;
  return { _: value };
}

function fromMap(key: string, map: Record<string, unknown>): unknown {
  const entries = Object.entries(map).filter(([, v]) => v != null);
  if (LIST_KEYS.includes(key)) return entries.map(([, v]) => v);
  if (MAP_KEYS.includes(key)) return Object.fromEntries(entries);
  return map._ ?? null;
}

// ---- Änderungen vermerken ----
let onLocalChange: ((key: string) => void) | null = null;

setWriteHook((key, before, after) => {
  if (!isSynced(key)) return;
  if (key.startsWith(CORRECTION_PREFIX) && !(after as { corrected?: boolean } | null)?.corrected) return;
  const now = Date.now();
  const a = asMap(key, before);
  const b = asMap(key, after);
  const meta = read<Meta>(META, {});
  const m = (meta[key] ||= {});
  let changed = false;
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[id] ?? null) !== JSON.stringify(b[id] ?? null)) {
      m[id] = now;
      changed = true;
    }
  }
  if (changed) {
    writeRaw(META, meta);
    onLocalChange?.(key);
  }
});

export function setLocalChangeListener(fn: (key: string) => void) {
  onLocalChange = fn;
}

// ---- Familien-Schlüssel und Gerät ----
export function getFamilyCode(): string | null {
  return read<string | null>(CODE, null);
}

type Device = { id: string; name: string; changed: number; renamed?: boolean; model?: boolean };

/** Android: Telefone haben „Mobile“ im Browser-Kennzeichen, Tablets nicht */
function isTablet(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return !/Mobile/i.test(ua);
  return /iPad/i.test(ua) || Math.min(window.screen.width, window.screen.height) >= 700;
}

export function getDevice(): Device {
  let d = read<Device | null>(DEVICE, null);
  if (!d) {
    d = { id: crypto.randomUUID(), name: isTablet() ? "Tablet" : "Handy", changed: Date.now() };
    writeRaw(DEVICE, d);
  }
  return d;
}

/** Gerätemodell aus Chrome (z. B. „SM-A426B“ oder „Pixel 7“) als Namen übernehmen, solange niemand umbenannt hat */
export async function detectDeviceName() {
  const d = getDevice();
  // Nur die automatischen Namen ersetzen – selbst vergebene (z. B. „Handy Jan“) bleiben
  if (d.renamed || d.model || !["Handy", "Tablet"].includes(d.name)) return;
  const uad = (navigator as unknown as { userAgentData?: { getHighEntropyValues: (k: string[]) => Promise<{ model?: string }> } })
    .userAgentData;
  try {
    const { model } = uad ? await uad.getHighEntropyValues(["model"]) : { model: undefined };
    const kind = isTablet() ? "Tablet" : "Handy";
    const pretty = model ? prettyModel(model) : "";
    writeRaw(DEVICE, { ...d, name: pretty ? `${kind} ${pretty}` : kind, model: true, changed: Date.now() });
  } catch {
    /* kein Modell verfügbar */
  }
}

// Samsung nennt seine Geräte intern „SM-A426B“ – daraus „Galaxy A42“ machen; andere Hersteller liefern meist schon Klartext
function prettyModel(model: string): string {
  const m = /^SM-([A-Z])(\d{2,3})/i.exec(model.trim());
  if (m) {
    const series = m[1].toUpperCase();
    const num = m[2].length === 3 ? m[2].slice(0, 2) : m[2];
    const name = series === "F" ? `Z Fold/Flip` : series === "X" || series === "T" || series === "P" ? `Tab` : `${series}${num}`;
    return `Galaxy ${name} (${model.trim()})`;
  }
  return model.trim();
}

export function setDeviceName(name: string) {
  const d = getDevice();
  writeRaw(DEVICE, { ...d, name: name.trim().slice(0, 30) || d.name, renamed: true, changed: Date.now() });
}

const REMOVALS = "leocast:device-removals";

/** Gerät aus der Liste nehmen (wird beim nächsten Abgleich an alle Geräte weitergegeben) */
export function removeDevices(ids: string[]) {
  const now = Date.now();
  const map = read<Record<string, number>>(REMOVALS, {});
  for (const id of ids) if (id !== getDevice().id) map[id] = now;
  writeRaw(REMOVALS, map);
  const status = getSyncStatus();
  if (status?.devices) {
    for (const id of ids) if (status.devices[id] && id !== getDevice().id) status.devices[id] = { ...status.devices[id], removed: true, at: now };
    writeRaw(STATUS, status);
  }
}

export function getSyncStatus(): SyncStatus | null {
  return read<SyncStatus | null>(STATUS, null);
}

// ---- Stand bauen und übernehmen ----
function localKeys(): string[] {
  const keys = new Set<string>([...MAP_KEYS, ...LIST_KEYS, ...SCALAR_KEYS]);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isScalar(k)) keys.add(k);
  }
  for (const k of Object.keys(read<Meta>(META, {}))) keys.add(k);
  return [...keys];
}

function buildState(): SyncState {
  const state = emptyState();
  const meta = read<Meta>(META, {});
  for (const key of localKeys()) {
    const value = read<unknown>(key, null);
    if (key.startsWith(CORRECTION_PREFIX) && !(value as { corrected?: boolean } | null)?.corrected && !meta[key]) continue;
    const map = asMap(key, value);
    const stamps = meta[key] || {};
    const items: Record<string, Stamped> = {};
    for (const id of new Set([...Object.keys(map), ...Object.keys(stamps)])) {
      // Ältere Daten ohne Vermerk zählen als „sehr alt“, damit neuere Änderungen gewinnen
      items[id] = { v: map[id] ?? null, at: stamps[id] || 1 };
    }
    if (Object.keys(items).length) state.keys[key] = items;
  }
  const device = getDevice();
  const downloads = Object.fromEntries(
    Object.entries(getDownloads()).map(([id, d]) => [
      id,
      { title: d.item.title, podcastId: d.item.podcastId, image: d.item.image },
    ]),
  );
  const spotify = Boolean(read<unknown>("leocast:spotify-token", null));
  const own: DeviceInfo = { name: device.name, at: device.changed, downloads, spotify };
  // Downloads geändert? Dann zählt das als Änderung am Gerät
  const last = read<string>("leocast:sync-downloads", "");
  const sig = JSON.stringify(Object.keys(downloads).sort()) + device.name + spotify;
  if (sig !== last) {
    own.at = Date.now();
    writeRaw(DEVICE, { ...device, changed: own.at });
    writeRaw("leocast:sync-downloads", sig);
  }
  state.devices[device.id] = own;
  for (const [id, at] of Object.entries(read<Record<string, number>>(REMOVALS, {}))) {
    state.devices[id] = { name: "", at, downloads: {}, removed: true };
  }
  return state;
}

function applyState(remote: SyncState) {
  const meta = read<Meta>(META, {});
  let changed = false;
  for (const [key, items] of Object.entries(remote.keys)) {
    if (!isSynced(key)) continue;
    const local = asMap(key, read<unknown>(key, null));
    const stamps = (meta[key] ||= {});
    let keyChanged = false;
    for (const [id, item] of Object.entries(items)) {
      if (item.at > (stamps[id] || 0)) {
        stamps[id] = item.at;
        if (JSON.stringify(local[id] ?? null) !== JSON.stringify(item.v ?? null)) {
          local[id] = item.v;
          keyChanged = true;
        }
      }
    }
    if (keyChanged) {
      writeRaw(key, fromMap(key, local));
      changed = true;
    }
  }
  writeRaw(META, meta);
  return changed;
}

// ---- Abgleich ausführen ----
let running: Promise<void> | null = null;

async function post(payload: Record<string, unknown>) {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, state: buildState() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.status);
  return data as { state: SyncState; wrote: boolean };
}

export function syncNow(reason = ""): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return Promise.resolve();
  // Automatische Testbrowser (z. B. die Foto-Prüfung auf GitHub) nie als Gerät anmelden
  if (navigator.webdriver) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    try {
      // Frühere Version mit Familien-Schlüssel: alte Daten einmal holen, dann automatisch weiter
      const oldCode = getFamilyCode();
      if (oldCode) {
        try {
          applyState((await post({ code: oldCode })).state);
        } catch {
          /* alter Stand nicht erreichbar – egal */
        }
        writeRaw(CODE, null);
      }
      let data = await post({ auto: true });
      // Wurde dieses Gerät von einem anderen aus der Liste genommen, aber es wird noch benutzt: wieder anmelden
      const me = data.state.devices[getDevice().id];
      if (me?.removed) {
        writeRaw(DEVICE, { ...getDevice(), changed: Date.now() });
        writeRaw("leocast:sync-downloads", "");
        data = await post({ auto: true });
      }
      writeRaw(REMOVALS, {});
      const changed = applyState(data.state);
      writeRaw(STATUS, {
        at: Date.now(),
        ok: true,
        message: changed ? "Neues vom anderen Gerät übernommen" : "Alles auf dem gleichen Stand",
        devices: data.state.devices,
      } satisfies SyncStatus);
      if (changed || data.wrote) log("ok", `Abgleich${reason ? ` (${reason})` : ""}: ${changed ? "übernommen" : "gesendet"}`);
    } catch (e) {
      writeRaw(STATUS, { at: Date.now(), ok: false, message: (e as Error).message } satisfies SyncStatus);
      log("error", `Abgleich: ${(e as Error).message}`);
    } finally {
      running = null;
    }
  })();
  return running;
}

export async function syncConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/sync");
    return Boolean((await res.json()).configured);
  } catch {
    return false;
  }
}
