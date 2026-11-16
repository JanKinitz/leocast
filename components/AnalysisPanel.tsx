"use client";

// Elternbereich: KI-Analysen nachprüfen und bei Bedarf den Beginn der Geschichte von Hand setzen.
import { useEffect, useState } from "react";
import { analysedEpisodes, forgetMarkers, fmtMinSec, setStoryStart, type Markers } from "@/lib/markers";
import { useStoreVersion } from "@/lib/store";

const LABEL: Record<string, string> = {
  W: "Werbung",
  I: "Vorspann",
  E: "Entspannung",
  G: "Geschichte",
  O: "Abspann",
};

export default function AnalysisPanel() {
  const version = useStoreVersion();
  const [list, setList] = useState<Markers[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setList(analysedEpisodes()), [version]);

  if (!list.length)
    return (
      <section className="card">
        <h2>KI-Analysen</h2>
        <p className="hint">Noch keine Folge analysiert. Spiel eine Folge ab, dann erscheint sie hier.</p>
      </section>
    );

  return (
    <section className="card">
      <h2>KI-Analysen</h2>
      <p className="hint">
        Tippe eine Folge an, um zu sehen, wie die KI den Anfang eingeteilt hat. Stimmt der Beginn der Geschichte nicht, tippe auf
        den richtigen Abschnitt und dann auf „Geschichte beginnt hier“.
      </p>
      <ul className="ana-list">
        {list.map((m) => (
          <li key={m.id}>
            <button className="ana-head" onClick={() => setOpen(open === m.id ? null : m.id || null)}>
              <strong>{m.title}</strong>
              <span className="hint">
                Werbung bis {fmtMinSec(m.content)} · Geschichte ab {fmtMinSec(m.story)}
                {m.corrected ? " (von dir gesetzt)" : ""}
              </span>
            </button>
            {open === m.id && (
              <div className="ana-body">
                {m.reason && <p className="hint">KI: {m.reason}</p>}
                <ol className="ana-segs">
                  {m.segments?.map((s, i) => (
                    <li key={i} className={`seg seg-${s.l} ${m.story === s.t ? "story" : ""}`}>
                      <span className="seg-time">{fmtMinSec(s.t)}</span>
                      <span className="seg-label">{LABEL[s.l] || s.l}</span>
                      <span className="seg-text">{s.text}</span>
                      {s.l !== "W" && m.story !== s.t && (
                        <button className="secondary seg-set" onClick={() => m.id && setStoryStart(m.id, s.t)}>
                          Geschichte beginnt hier
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
                <button className="secondary" onClick={() => m.id && forgetMarkers(m.id)}>
                  Neu analysieren lassen
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
