"use client";
// Elternbereich: gemeinsame Spotify-Anmeldung – Status, Ablaufdatum, QR-Code für weitere Geräte
import { useEffect, useState } from "react";
import { familyStatus, logoutEverywhere, pairingLink, shareLogin, startLogin, type FamilyStatus } from "@/lib/spotify";

const date = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }) : "?");

export default function SpotifyFamilyCard({ loggedIn, onChange }: { loggedIn: boolean; onChange: () => void }) {
  const [st, setSt] = useState<FamilyStatus | null | undefined>(undefined);
  const [qr, setQr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    let s = await familyStatus();
    if (!s && loggedIn && (await shareLogin().catch(() => false))) s = await familyStatus();
    setSt(s);
    setLink(pairingLink());
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const showQr = async () => {
    const l = pairingLink();
    if (!l) return;
    const QR = await import("qrcode");
    setQr(await QR.toDataURL(l, { margin: 1, width: 280, color: { dark: "#14172b", light: "#ffffff" } }));
  };

  if (st === undefined) return null;
  if (!st) {
    return loggedIn ? (
      <p className="hint">Anmeldung gilt nur auf diesem Gerät (gemeinsame Anmeldung gerade nicht erreichbar).</p>
    ) : null;
  }

  const soon = st.expiresAround && st.expiresAround - Date.now() < 14 * 24 * 3600 * 1000;

  return (
    <div className="family-spotify">
      {st.active ? (
        <p>
          Gilt auf allen gekoppelten Geräten{st.devices ? ` (${st.devices})` : ""}. Spotify verlangt nach 6 Monaten eine
          neue Anmeldung – ungefähr am <b>{date(st.expiresAround)}</b>.
        </p>
      ) : (
        <p className="warn-box">Die Spotify-Anmeldung ist abgelaufen. Einmal neu anmelden – dann geht es auf allen Geräten wieder.</p>
      )}
      {(soon || !st.active) && (
        <button onClick={() => startLogin()}>Jetzt neu anmelden</button>
      )}
      {st.active && link && (
        <>
          {qr ? (
            <div className="pair-qr">
              <img src={qr} alt="QR-Code zum Koppeln" width={240} height={240} />
              <p className="hint">
                Mit dem anderen Handy oder Tablet abfotografieren (Kamera-App) und den Link in Chrome öffnen. Danach ist
                Spotify dort ohne Anmeldung da. Den Code nur in der Familie zeigen.
              </p>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button className="secondary" onClick={() => navigator.share({ title: "Leocast koppeln", url: link }).catch(() => {})}>
                  Link teilen
                </button>
              )}
              <button className="secondary" onClick={() => setQr(null)}>
                QR-Code ausblenden
              </button>
            </div>
          ) : (
            <button className="secondary" onClick={showQr}>
              Anderes Gerät verbinden (QR-Code)
            </button>
          )}
        </>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          if (!confirmStep()) return;
          setBusy(true);
          await logoutEverywhere();
          setBusy(false);
          setSt(null);
          onChange();
        }}
      >
        Auf allen Geräten abmelden
      </button>
    </div>
  );
}

// kein window.confirm (blockiert auf manchen Geräten); zweimal tippen genügt
let armed = 0;
function confirmStep(): boolean {
  if (Date.now() - armed < 4000) return true;
  armed = Date.now();
  return false;
}
