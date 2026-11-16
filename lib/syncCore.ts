// Abgleich zwischen Geräten – gemeinsamer Teil für App und Server.
// Jeder Eintrag trägt den Zeitpunkt seiner letzten Änderung; beim Zusammenführen gewinnt der neuere
// (auch Löschungen: dann ist v = null). So kann jedes Gerät jederzeit seinen ganzen Stand schicken.

export type Stamped = { v: unknown; at: number };

export type DeviceInfo = {
  name: string;
  /** zuletzt gesehen */
  at: number;
  /** offline gespeicherte Folgen auf diesem Gerät */
  downloads: Record<string, { title: string; podcastId?: string; image?: string }>;
};

export type SyncState = {
  v: 1;
  /** Speicher-Schlüssel → Eintrag → Wert mit Zeitstempel */
  keys: Record<string, Record<string, Stamped>>;
  devices: Record<string, DeviceInfo>;
};

export const emptyState = (): SyncState => ({ v: 1, keys: {}, devices: {} });

export function mergeStates(a: SyncState, b: SyncState): SyncState {
  const out: SyncState = { v: 1, keys: {}, devices: { ...a.devices } };
  for (const key of new Set([...Object.keys(a.keys), ...Object.keys(b.keys)])) {
    const left = a.keys[key] || {};
    const right = b.keys[key] || {};
    const merged: Record<string, Stamped> = {};
    for (const id of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const l = left[id];
      const r = right[id];
      merged[id] = !l ? r : !r ? l : r.at > l.at ? r : l;
    }
    out.keys[key] = merged;
  }
  for (const [id, d] of Object.entries(b.devices || {})) {
    if (!out.devices[id] || d.at > out.devices[id].at) out.devices[id] = d;
  }
  return out;
}

/** Gleicher Inhalt? (um unnötige Schreibvorgänge zu sparen) */
export function sameState(a: SyncState, b: SyncState): boolean {
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}

function sortDeep(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortDeep);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.keys(x as object)
        .sort()
        .map((k) => [k, sortDeep((x as Record<string, unknown>)[k])]),
    );
  return x;
}

/** Familien-Schlüssel: 16 Zeichen ohne verwechselbare Buchstaben, z. B. K7PM-Q2XD-9HTA-4WRB */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 16 || [...raw].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return raw.match(/.{4}/g)!.join("-");
}
