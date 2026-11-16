"use client";

import { useEffect, useState } from "react";
import { clearLog, readLog, subscribeLog, type LogEntry } from "@/lib/diagnostics";

export default function LogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    setEntries(readLog());
    return subscribeLog(() => setEntries(readLog()));
  }, []);
  return (
    <details className="log">
      <summary>Prüfprotokoll ({entries.length})</summary>
      <button className="small" onClick={clearLog}>
        Leeren
      </button>
      <ul>
        {entries.map((e, i) => (
          <li key={i} className={`log-${e.level}`}>
            <span>{e.time}</span> {e.text}
          </li>
        ))}
      </ul>
    </details>
  );
}
