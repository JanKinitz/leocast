"use client";
// Gerät koppeln: Link aus dem QR-Code im Elternbereich. Übernimmt die gemeinsame Spotify-Anmeldung.
import Link from "next/link";
import { useEffect, useState } from "react";
import { familyStatus, setFamilyKey } from "@/lib/spotify";

export default function Koppeln() {
  const [msg, setMsg] = useState("Einen Moment…");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const key = new URLSearchParams(window.location.hash.slice(1)).get("k");
    history.replaceState(null, "", "/koppeln"); // Schlüssel nicht im Verlauf stehen lassen
    if (!key) {
      setMsg("Der Link ist unvollständig. Bitte den QR-Code im Elternbereich noch einmal abfotografieren.");
      return;
    }
    setFamilyKey(key);
    familyStatus().then((s) => {
      if (s?.active) {
        setOk(true);
        setMsg(`Fertig! Spotify ist jetzt auch hier angemeldet${s.user ? ` (${s.user})` : ""}.`);
      } else if (s && !s.error) {
        setMsg("Gekoppelt. Die Spotify-Anmeldung ist aber abgelaufen – bitte im Elternbereich neu anmelden.");
      } else {
        setMsg("Das hat nicht geklappt. Bitte einen neuen QR-Code im Elternbereich zeigen lassen.");
      }
    });
  }, []);

  return (
    <main className="page parents">
      <div className="topbar">
        <h1>Gerät verbinden</h1>
      </div>
      <section className="card">
        <p>{msg}</p>
        <Link className="button" href="/">
          {ok ? "Los geht’s" : "Zur Startseite"}
        </Link>
      </section>
    </main>
  );
}
