"use client";

// Prototyp: offener Podcast-Feed laden, Folge offline speichern, im Flugzeugmodus abspielen.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  cachedMode,
  downloadEpisode,
  playableSrc,
  removeEpisode,
  requestPersistentStorage,
  storageEstimate,
  type DownloadResult,
} from "@/lib/offline";
import { log } from "@/lib/diagnostics";
import LogPanel from "@/components/LogPanel";

type Episode = {
  guid: string;
  title: string;
  audioUrl: string;
  durationSec?: number;
  image?: string;
  published?: string;
};

type Feed = { feedUrl: string; title: string; image?: string; episodes: Episode[] };

const PRESETS = [
  { name: "CheckPod", url: "https://feeds.br.de/checkpod-der-podcast-mit-checker-tobi/feed.xml" },
  {
    name: "Bleib entspannt!",
    url: "https://cdn.audiorella.com/podcasts/1760-bleib-entspannt-der-meditations-podcast-magische-momente-fur-kinder-eltern/feed.rss",
  },
];

const FEED_KEY = "leocast:last-feed";

function fmtDuration(sec?: number) {
  if (!sec) return "";
  const m = Math.round(sec / 60);
  return `${m} Min.`;
}

export default function PodcastTest() {
  const [feedUrl, setFeedUrl] = useState(PRESETS[0].url);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [modes, setModes] = useState<Record<string, DownloadResult | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{ ep: Episode; from: string } | null>(null);
  const [storage, setStorage] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAfterRef = useRef(true);

  const refreshModes = useCallback(async (eps: Episode[]) => {
    const entries = await Promise.all(eps.map(async (e) => [e.audioUrl, await cachedMode(e.audioUrl)] as const));
    setModes(Object.fromEntries(entries));
    const est = await storageEstimate();
    if (est) setStorage(`${(est.usage / 1024 / 1024).toFixed(0)} MB belegt von ${(est.quota / 1024 / 1024 / 1024).toFixed(1)} GB`);
  }, []);

  const loadFeed = useCallback(
    async (url: string) => {
      setError(null);
      try {
        const res = await fetch(`/api/feed?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.status);
        const f: Feed = { ...data, episodes: data.episodes.slice(0, 10) };
        setFeed(f);
        localStorage.setItem(FEED_KEY, JSON.stringify(f));
        log("ok", `Feed „${f.title}“ geladen (${data.episodes.length} Folgen)`);
        refreshModes(f.episodes);
      } catch (e: any) {
        const cached = localStorage.getItem(FEED_KEY);
        if (cached) {
          const f = JSON.parse(cached) as Feed;
          setFeed(f);
          refreshModes(f.episodes);
          log("info", `Feed offline aus dem Speicher: „${f.title}“`);
        } else {
          setError(`Feed: ${e.message}`);
          log("error", `Feed laden: ${e.message}`);
        }
      }
    },
    [refreshModes],
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const cached = localStorage.getItem(FEED_KEY);
    if (cached) {
      const f = JSON.parse(cached) as Feed;
      setFeed(f);
      setFeedUrl(f.feedUrl);
      refreshModes(f.episodes);
      if (navigator.onLine) loadFeed(f.feedUrl);
    } else {
      loadFeed(PRESETS[0].url);
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [loadFeed, refreshModes]);

  async function save(ep: Episode) {
    setBusy(ep.audioUrl);
    const granted = await requestPersistentStorage();
    log("info", `Dauerhafter Speicher ${granted ? "erlaubt" : "nicht garantiert"}`);
    const { result, detail } = await downloadEpisode(ep.audioUrl);
    log(result === "failed" ? "error" : "ok", `Download „${ep.title}“: ${result} – ${detail}`);
    setBusy(null);
    if (feed) refreshModes(feed.episodes);
  }

  async function remove(ep: Episode) {
    await removeEpisode(ep.audioUrl);
    if (feed) refreshModes(feed.episodes);
  }

  async function play(ep: Episode) {
    const { src, from } = await playableSrc(ep.audioUrl);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = src;
    setNowPlaying({ ep, from });
    try {
      await audio.play();
      log("ok", `Spielt „${ep.title}“ aus: ${from}${online ? "" : " (offline)"}`);
    } catch (e: any) {
      log("error", `Abspielen fehlgeschlagen (${from}): ${e.message}`);
    }
  }

  return (
    <main>
      <div className="topbar">
        <Link className="button back" href="/" aria-label="Zurück">
          ←
        </Link>
        <h1>Podcast-Test</h1>
      </div>

      <div className={`status ${online ? "info" : "ok"}`}>
        {online ? "Online" : "Offline – es spielen nur gespeicherte Folgen"}
        {storage && <div className="sub">{storage}</div>}
      </div>

      <div className="actions">
        {PRESETS.map((p) => (
          <button
            key={p.url}
            className="secondary small"
            onClick={() => {
              setFeedUrl(p.url);
              loadFeed(p.url);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="actions">
        <input
          style={{ flex: 1, minHeight: 48, fontSize: 16, padding: "0 12px", borderRadius: 12, border: "1px solid #ddd" }}
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          aria-label="Feed-Adresse"
        />
        <button className="small" onClick={() => loadFeed(feedUrl)}>
          Laden
        </button>
      </div>

      {error && <div className="status error">{error}</div>}

      {feed && (
        <>
          <h2 className="title">{feed.title}</h2>
          <ul className="list">
            {feed.episodes.map((ep) => {
              const mode = modes[ep.audioUrl];
              return (
                <li key={ep.guid} className="row">
                  {ep.image ? <img src={ep.image} alt="" /> : <div className="cover" />}
                  <div className="text title">
                    {ep.title}
                    <div className="sub">
                      {fmtDuration(ep.durationSec)}
                      {mode ? ` · offline gespeichert (${mode})` : ""}
                    </div>
                    <div className="actions">
                      {!mode && (
                        <button className="secondary small" disabled={busy === ep.audioUrl || !online} onClick={() => save(ep)}>
                          {busy === ep.audioUrl ? "Speichere…" : "Offline speichern"}
                        </button>
                      )}
                      {mode && (
                        <button className="secondary small" onClick={() => remove(ep)}>
                          Löschen
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    className="play"
                    aria-label={`${ep.title} abspielen`}
                    disabled={!online && !mode}
                    onClick={() => play(ep)}
                  >
                    ▶
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {nowPlaying && (
        <div className="status ok">
          <strong className="title">{nowPlaying.ep.title}</strong>
          <div className="sub">Quelle: {nowPlaying.from}</div>
          <label className="sub" style={{ display: "block", marginTop: 8 }}>
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => (stopAfterRef.current = e.target.checked)}
            />{" "}
            Nach dieser Folge stoppen
          </label>
        </div>
      )}
      <audio
        ref={audioRef}
        controls
        onEnded={() => {
          if (stopAfterRef.current) log("info", "Folge zu Ende – Wiedergabe gestoppt");
        }}
        onError={() => log("error", "Audio-Element meldet einen Fehler")}
      />

      <LogPanel />
    </main>
  );
}
