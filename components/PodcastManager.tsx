"use client";

// Elternbereich: Podcasts suchen, hinzufügen, einsortieren und entfernen – ohne neue Version der App.
import { useState } from "react";
import {
  PODCASTS,
  addCustomPodcast,
  allPodcasts,
  getHiddenPodcasts,
  removePodcast,
  restorePodcast,
  setPodcastCategory,
  type PodcastSource,
} from "@/lib/library";
import { useStoreVersion } from "@/lib/store";
import { log } from "@/lib/diagnostics";
import { img } from "@/lib/img";

type Hit = { id: string; name: string; author: string; feedUrl: string; image?: string; episodes?: number };
type Category = PodcastSource["category"];

const CATEGORY_LABEL: Record<Category, string> = { podcasts: "Meine Podcasts", gutenacht: "Gute Nacht" };

export default function PodcastManager() {
  useStoreVersion();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState("");

  const library = allPodcasts();
  const inLibrary = new Set(library.map((p) => p.feedUrl).filter(Boolean));
  const hidden = PODCASTS.filter((p) => getHiddenPodcasts().includes(p.id));

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/podcast-search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      setHits(data.results);
      if (!data.results.length) setMessage("Nichts gefunden. Probier einen anderen Namen oder gib unten die Feed-Adresse ein.");
    } catch (err) {
      setMessage(`Suche klappt gerade nicht: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function add(hit: { name: string; feedUrl: string; image?: string }, category: Category) {
    const entry = addCustomPodcast({ name: hit.name, feedUrl: hit.feedUrl, image: hit.image, category });
    log("ok", `Podcast hinzugefügt: ${entry.name} (${CATEGORY_LABEL[category]})`);
    setMessage(`„${entry.name}“ steht jetzt unter ${CATEGORY_LABEL[category]}.`);
  }

  async function addByUrl(category: Category) {
    const url = feedUrl.trim();
    if (!/^https?:\/\//.test(url)) {
      setMessage("Bitte eine vollständige Adresse eingeben, die mit https:// beginnt.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/feed?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok || !data.episodes?.length) throw new Error(data.error || "keine Folgen gefunden");
      add({ name: data.title || url, feedUrl: url, image: data.image }, category);
      setFeedUrl("");
    } catch (err) {
      setMessage(`Feed lässt sich nicht laden: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Podcasts</h2>

      <ul className="pod-list">
        {library.map((p) => (
          <li key={p.id}>
            <span className="pod-name">{p.name}</span>
            <select
              aria-label={`Reihe für ${p.name}`}
              value={p.category}
              onChange={(e) => setPodcastCategory(p.id, e.target.value as Category)}
            >
              <option value="podcasts">Meine Podcasts</option>
              <option value="gutenacht">Gute Nacht</option>
            </select>
            <button className="secondary" onClick={() => removePodcast(p.id)}>
              Entfernen
            </button>
          </li>
        ))}
      </ul>

      {hidden.length > 0 && (
        <p className="hint">
          Ausgeblendet:{" "}
          {hidden.map((p) => (
            <button key={p.id} className="linkish" onClick={() => restorePodcast(p.id)}>
              {p.name} wieder zeigen
            </button>
          ))}
        </p>
      )}

      <h3>Neuen Podcast suchen</h3>
      <form className="pod-search" onSubmit={search}>
        <input
          type="search"
          placeholder="z. B. Die Maus, Kakadu, Figarino"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Podcast suchen"
        />
        <button type="submit" disabled={busy}>
          {busy ? "Suche …" : "Suchen"}
        </button>
      </form>

      {hits && hits.length > 0 && (
        <ul className="pod-hits">
          {hits.map((h) => (
            <li key={h.id}>
              {h.image ? <img src={img(h.image, 128)} alt="" width={64} height={64} /> : <span className="pod-noimg" />}
              <div className="pod-info">
                <strong>{h.name}</strong>
                <span className="hint">
                  {h.author}
                  {h.episodes ? ` · ${h.episodes} Folgen` : ""}
                </span>
              </div>
              {inLibrary.has(h.feedUrl) ? (
                <span className="hint">schon dabei</span>
              ) : (
                <div className="pod-actions">
                  <button onClick={() => add(h, "podcasts")}>+ Podcasts</button>
                  <button className="secondary" onClick={() => add(h, "gutenacht")}>
                    + Gute Nacht
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Oder Feed-Adresse eingeben</h3>
      <div className="pod-search">
        <input
          type="url"
          inputMode="url"
          placeholder="https://…/feed.xml"
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          aria-label="Feed-Adresse"
        />
        <button disabled={busy} onClick={() => addByUrl("podcasts")}>
          + Podcasts
        </button>
        <button className="secondary" disabled={busy} onClick={() => addByUrl("gutenacht")}>
          + Gute Nacht
        </button>
      </div>

      {message && <p className="hint">{message}</p>}
      <p className="hint">
        Neue Podcasts gelten vorerst nur auf diesem Gerät. Der Abgleich zwischen Handy und Tablet kommt als Nächstes.
      </p>
    </section>
  );
}
