"use client";

// Elternbereich: Geräte verbinden (Familien-Schlüssel), Stand des Abgleichs, was auf welchem Gerät gespeichert ist.
import { useEffect, useState } from "react";
import {
  getDevice,
  getFamilyCode,
  getSyncStatus,
  newFamilyCode,
  setDeviceName,
  setFamilyCode,
  syncConfigured,
  syncNow,
} from "@/lib/sync";
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
  const [join, setJoin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    syncConfigured().then(setConfigured);
    // Link „…/eltern?familie=XXXX-…“ vom anderen Gerät
    const fromLink = new URLSearchParams(window.location.search).get("familie");
    if (fromLink && !getFamilyCode()) setJoin(fromLink);
  }, []);

  if (!mounted) return null;
  const code = getFamilyCode();
  const device = getDevice();
  const status = getSyncStatus();
  const devices = Object.entries(status?.devices || {}).sort((a, b) => (a[0] === device.id ? -1 : b[0] === device.id ? 1 : 0));

  async function connect(value: string) {
    if (!setFamilyCode(value)) {
      setMsg("Der Schlüssel stimmt nicht. Er hat 16 Zeichen, z. B. K7PM-Q2XD-9HTA-4WRB.");
      return;
    }
    setBusy(true);
    await syncNow("verbunden");
    setBusy(false);
    setJoin("");
    setMsg(null);
  }

  async function share() {
    const link = `${window.location.origin}/eltern?familie=${code}`;
    const text = `Leocast verbinden: Elternbereich öffnen und diesen Familien-Schlüssel eingeben: ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Leocast verbinden", text, url: link });
      else {
        await navigator.clipboard.writeText(`${text}\n${link}`);
        setMsg("Kopiert. Füge es auf dem anderen Gerät ein.");
      }
    } catch {
      /* abgebrochen */
    }
  }

  return (
    <section className="card">
      <h2>Geräte abgleichen</h2>
      {configured === false && (
        <p className="hint">
          Der Abgleich ist auf dem Server noch nicht eingerichtet (Speicher bei Vercel fehlt). Du kannst die Geräte trotzdem
          schon verbinden – abgeglichen wird, sobald er eingerichtet ist.
        </p>
      )}

      {!code ? (
        <>
          <p className="hint">
            Verbinde Handy und Tablet, damit „Mag ich“, „Weiterhören“, eigene Podcasts und Einstellungen auf beiden gleich
            sind. Auf dem ersten Gerät „Neu anlegen“ tippen, auf dem zweiten den Schlüssel eingeben.
          </p>
          <button disabled={busy} onClick={() => connect(newFamilyCode())}>
            Neu anlegen
          </button>
          <div className="pod-search">
            <input
              placeholder="Familien-Schlüssel, z. B. K7PM-Q2XD-9HTA-4WRB"
              value={join}
              autoCapitalize="characters"
              onChange={(e) => setJoin(e.target.value)}
              aria-label="Familien-Schlüssel"
            />
            <button className="secondary" disabled={busy || !join.trim()} onClick={() => connect(join)}>
              Verbinden
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Familien-Schlüssel: <strong className="family-code">{code}</strong>
          </p>
          <p className="hint">Auf dem anderen Gerät im Elternbereich eingeben – oder hier teilen.</p>
          <div className="pod-search">
            <button onClick={share}>Schlüssel teilen</button>
            <button className="secondary" disabled={busy} onClick={async () => {
              setBusy(true);
              await syncNow("von Hand");
              setBusy(false);
            }}>
              {busy ? "Gleiche ab …" : "Jetzt abgleichen"}
            </button>
          </div>
          {status && (
            <p className="hint">
              Zuletzt {since(status.at)}: {status.ok ? status.message : `Fehler – ${status.message}`}
            </p>
          )}

          <h3>Dieses Gerät</h3>
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
              <h3>Für unterwegs gespeichert</h3>
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
                          {list.length} {list.length === 1 ? "Folge" : "Folgen"} · zuletzt geändert {since(d.at)}
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

          <button
            className="secondary"
            onClick={() => {
              setFamilyCode(null);
              setMsg("Dieses Gerät ist nicht mehr verbunden. Die Daten auf dem Gerät bleiben erhalten.");
            }}
          >
            Verbindung trennen
          </button>
        </>
      )}
      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}
