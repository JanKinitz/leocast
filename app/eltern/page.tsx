"use client";

// Elternbereich: hinter einer Rechenaufgabe. Spotify verbinden, Speicher, Prüfprotokoll.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LogPanel from "@/components/LogPanel";
import { usePlayer } from "@/components/PlayerProvider";
import { getMe, loadToken, logout, startLogin } from "@/lib/spotify";
import { storageEstimate } from "@/lib/offline";
import { getDownloads, useStoreVersion } from "@/lib/store";
import { allPodcasts } from "@/lib/library";
import PodcastManager from "@/components/PodcastManager";
import AnalysisPanel from "@/components/AnalysisPanel";
import SyncCard from "@/components/SyncCard";
import { canInstall, isStandalone, onInstallChange, promptInstall } from "@/lib/install";

function InstallCard() {
  const [, rerender] = useState(0);
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const standalone = isStandalone();
  return (
    <section className="card">
      <h2>App auf dem Startbildschirm</h2>
      {standalone ? (
        <p className="hint">Leocast ist installiert und läuft als App. Updates lädt die App von selbst, sobald nichts abgespielt wird.</p>
      ) : canInstall() ? (
        <>
          <p className="hint">Installiere Leocast als App: eigenes Symbol, Vollbild, startet auch ohne Internet.</p>
          <button className="button" onClick={() => promptInstall()}>
            App installieren
          </button>
        </>
      ) : (
        <p className="hint">
          Chrome bietet die Installation gerade nicht direkt an. So geht es von Hand: oben rechts auf ⋮ tippen, dann „App
          installieren“ oder „Zum Startbildschirm hinzufügen“.
        </p>
      )}
    </section>
  );
}
import { aiConfigured, getManualIntro, getStartMode, setManualIntro, setStartMode, type StartMode } from "@/lib/markers";

function fmtMinSec(sec: number | null) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

function parseMinSec(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

function IntroSettings() {
  useStoreVersion();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => {
    aiConfigured().then(setAi);
  }, []);
  return (
    <section className="card">
      <h2>Werbung und Vorspann überspringen</h2>
      <p className="hint">
        {ai === null
          ? "Prüfe KI-Analyse …"
          : ai
            ? "KI-Analyse ist eingerichtet: Leocast hört sich den Anfang jeder Folge an und findet Werbung und den Beginn der Geschichte selbst."
            : "KI-Analyse ist noch nicht eingerichtet (GROQ_API_KEY fehlt bei Vercel). Bis dahin nutzt Leocast Transkripte, wo es sie gibt."}
      </p>
      <p className="hint">
        Werbung wird immer übersprungen. Danach kannst du je Podcast wählen, wo die Folge beginnt. Im Player gibt es außerdem
        die Knöpfe „Ausruhen“ (Mond) und „Geschichte“ (Buch), solange diese Stellen noch vor einem liegen. Die Minuten brauchst
        du nur, wenn die Analyse bei einem Podcast nicht klappt.
      </p>
      <ul className="intro-list">
        {allPodcasts().map((p) => {
          const current = getManualIntro(p.id);
          const value = drafts[p.id] ?? fmtMinSec(current);
          return (
            <li key={p.id}>
              <label htmlFor={`intro-${p.id}`}>{p.name}</label>
              <input
                id={`intro-${p.id}`}
                inputMode="numeric"
                placeholder="z. B. 3:30"
                value={value}
                onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
              />
              <select
                className="start-mode"
                aria-label={`Start bei ${p.name}`}
                value={getStartMode(p.id)}
                onChange={(e) => setStartMode(p.id, e.target.value as StartMode)}
              >
                <option value="anfang">Start nach der Werbung</option>
                <option value="entspannung">Start beim Ausruhen</option>
                <option value="geschichte">Start bei der Geschichte</option>
              </select>
              <button
                className="secondary"
                onClick={() => {
                  const sec = parseMinSec(value);
                  if (sec !== null && Number.isNaN(sec)) {
                    setSaved(`${p.name}: bitte als Minuten:Sekunden eingeben, z. B. 3:30`);
                    return;
                  }
                  setManualIntro(p.id, sec);
                  setSaved(sec ? `${p.name}: Geschichte ab ${fmtMinSec(sec)}` : `${p.name}: kein Vorspann eingestellt`);
                }}
              >
                Speichern
              </button>
            </li>
          );
        })}
      </ul>
      {saved && <p className="hint">{saved}</p>}
    </section>
  );
}

function Gate({ onOpen }: { onOpen: () => void }) {
  const task = useMemo(() => {
    const a = 6 + Math.floor(Math.random() * 4);
    const b = 6 + Math.floor(Math.random() * 4);
    return { a, b, result: a * b };
  }, []);
  const [answer, setAnswer] = useState("");
  const [wrong, setWrong] = useState(false);
  return (
    <main className="page parents">
      <h1>Nur für Eltern</h1>
      <form
        className="gate"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number(answer) === task.result) onOpen();
          else {
            setWrong(true);
            setAnswer("");
          }
        }}
      >
        <label htmlFor="gate-answer">
          Wie viel ist {task.a} × {task.b}?
        </label>
        <input id="gate-answer" inputMode="numeric" value={answer} onChange={(e) => setAnswer(e.target.value)} autoComplete="off" />
        {wrong && <p className="hint">Das stimmt leider nicht.</p>}
        <div className="actions">
          <button type="submit">Öffnen</button>
          <Link className="button secondary" href="/">
            Zurück
          </Link>
        </div>
      </form>
    </main>
  );
}

export default function Eltern() {
  useStoreVersion();
  const [open, setOpen] = useState(false);
  const [spotifyUser, setSpotifyUser] = useState<string | null>(null);
  const [spotifyLoggedIn, setSpotifyLoggedIn] = useState(false);
  const [storage, setStorage] = useState("");
  const player = usePlayer();

  useEffect(() => {
    if (!open) return;
    const has = !!loadToken();
    setSpotifyLoggedIn(has);
    if (has)
      getMe()
        .then((m) => setSpotifyUser(`${m.display_name || m.id} (${m.product === "premium" ? "Premium" : m.product})`))
        .catch(() => setSpotifyUser("Anmeldung abgelaufen"));
    storageEstimate().then((e) => e && setStorage(`${(e.usage / 1024 / 1024).toFixed(0)} MB belegt`));
  }, [open]);

  if (!open) return <Gate onOpen={() => setOpen(true)} />;

  const downloads = Object.values(getDownloads()).length;

  return (
    <main className="page parents">
      <div className="topbar">
        <h1>Elternbereich</h1>
        <Link className="button secondary" href="/">
          Zur Kinderansicht
        </Link>
      </div>

      <section className="card">
        <h2>Spotify (Musik)</h2>
        {spotifyLoggedIn ? (
          <>
            <p>Verbunden: {spotifyUser || "…"}</p>
            <p>Player: {player.spotifyReady ? "bereit" : player.spotifyError || "startet…"}</p>
            <button
              className="secondary"
              onClick={() => {
                logout();
                setSpotifyLoggedIn(false);
              }}
            >
              Abmelden
            </button>
          </>
        ) : (
          <>
            <p>Für die Musik einmal mit dem Spotify-Konto des Kindes anmelden.</p>
            <button onClick={() => startLogin()}>Mit Spotify anmelden</button>
          </>
        )}
      </section>

      <section className="card">
        <h2>Ohne Internet</h2>
        <p>
          {downloads} Folgen gespeichert{storage ? ` · ${storage}` : ""}.
        </p>
        <p className="hint">Folgen speicherst du in einer Sendung über „Für unterwegs speichern“.</p>
      </section>

      <SyncCard />

      <PodcastManager />

      <InstallCard />

      <IntroSettings />

      <AnalysisPanel />

      <section className="card">
        <h2>Prüfprotokoll</h2>
        <LogPanel />
      </section>
    </main>
  );
}
