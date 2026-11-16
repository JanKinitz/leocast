"use client";

import { useEffect, useState } from "react";
import { finishLogin } from "@/lib/spotify";
import { log } from "@/lib/diagnostics";

export default function Callback() {
  const [message, setMessage] = useState("Anmeldung wird abgeschlossen…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const err = params.get("error");
    if (err) {
      setMessage(`Spotify hat die Anmeldung abgelehnt: ${err}`);
      log("error", `Login abgelehnt: ${err}`);
      return;
    }
    if (!code) {
      setMessage("Kein Anmelde-Code erhalten.");
      return;
    }
    finishLogin(code)
      .then(() => {
        log("ok", "Spotify-Login erfolgreich");
        window.location.replace("/");
      })
      .catch((e) => {
        setMessage(e.message);
        log("error", `Login: ${e.message}`);
      });
  }, []);

  return (
    <main>
      <h1>Leocast</h1>
      <p>{message}</p>
      <a className="button" href="/">
        Zur Startseite
      </a>
    </main>
  );
}
