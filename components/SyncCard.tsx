"use client";

// Elternbereich: Abgleich zwischen den Geräten (läuft automatisch), Gerätename, was auf welchem Gerät gespeichert ist.
import { useEffect, useState } from "react";
import { getDevice, getSyncStatus, setDeviceName, syncConfigured, syncNow } from "@/lib/sync";
import { useStoreVersion } from "@/lib/store";

function since(at: number) {
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

export default function SyncCard() {
  useStoreVersion();
  const [mounted, setMounted] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    syncConfigured().then(setConfigured);
  }, []);

  if (!mounted) return null;
  const device = getDevice();
  const status = getSyncStatus();
  const devices = Object.entries(status?.devices || {}).sort((a, b) => (a[0] === device.id ? -1 : b[0] === device.id ? 1 : 0));

  return (
    <section className="card">
      <h2>Geräte abgleichen</h2>
      <p className="hint">
        {configured === false
          ? "Der Abgleich ist auf dem Server noch nicht eingerichtet."
          : "Läuft automatisch: Mag ich, Weiterhören, eigene Podcasts und Einstellungen sind auf allen Geräten gleich, auf denen Leocast geöffnet wird."}
      </p>
      <div className="pod-search">
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await syncNow("von Hand");
            setBusy(false);
          }}
        >
          {busy ? "Gleiche ab …" : "Jetzt abgleichen"}
        </button>
      </div>
      {status && (
        <p className="hint">
          Zuletzt {since(status.at)}: {status.ok ? status.message : `Fehler – ${status.message}`}
        </p>
      )}

      <h3>Name dieses Geräts</h3>
      <div className="pod-search">
        <input
          defaultValue={device.name}
          aria-label="Name dieses Geräts"
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== device.name) {
              setDeviceName(e.target.value);
              syncNow("Gerätename");
            }
          }}
        />
      </div>

      {devices.length > 0 && (
        <>
          <h3>Geräte</h3>
          <ul className="ana-list">
            {devices.map(([id, d]) => {
              const list = Object.entries(d.downloads || {});
              return (
                <li key={id}>
                  <button className="ana-head" onClick={() => setOpen(open === id ? null : id)}>
                    <strong>
                      {d.name}
                      {id === device.id ? " (dieses Gerät)" : ""}
                    </strong>
                    <span className="hint">
                      {list.length} {list.length === 1 ? "Folge" : "Folgen"} für unterwegs · Spotify{" "}
                      {d.spotify ? "angemeldet" : "nicht angemeldet"}
                    </span>
                  </button>
                  {open === id && (
                    <ul className="device-downloads">
                      {list.length ? list.map(([eid, e]) => <li key={eid}>{e.title}</li>) : <li>Nichts gespeichert</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
