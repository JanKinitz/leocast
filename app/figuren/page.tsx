"use client";

// Alle Figuren auf einen Blick (für Eltern und zum Prüfen). /figuren?teil=2 zeigt die zweite Hälfte –
// Browser erlauben nur etwa 16 3D-Flächen gleichzeitig.
import Link from "next/link";
import { useEffect, useState } from "react";
import { FIGURES, FigureTile } from "@/components/Figures";
import { IconBack } from "@/components/Icons";

export default function FigurenPage() {
  const [teil, setTeil] = useState(1);
  useEffect(() => {
    setTeil(Number(new URLSearchParams(window.location.search).get("teil")) || 1);
  }, []);
  const half = Math.ceil(FIGURES.length / 2);
  const list = teil === 2 ? FIGURES.slice(half) : FIGURES.slice(0, half);
  return (
    <main className="page">
      <header className="world-head">
        <Link href="/" onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }} className="round-btn back-btn" aria-label="Zurück">
          <IconBack />
        </Link>
        <h1 className="world-title">Alle Figuren</h1>
      </header>
      <div className="pill-bar" style={{ display: "flex", gap: 8, padding: "0 16px 8px" }}>
        {[1, 2].map((n) => (
          <Link
            key={n}
            href={n === 2 ? "/figuren?teil=2" : "/figuren"}
            className={`button ${teil === n ? "" : "secondary"}`}
            onClick={() => setTeil(n)}
          >
            {n === 1 ? "Figuren 1–9" : "Figuren 10–18"}
          </Link>
        ))}
      </div>
      <div className="figure-grid">
        {list.map((f) => (
          <FigureTile key={f.id} figure={f} />
        ))}
      </div>
      <p className="hint" style={{ padding: "0 16px" }}>Zum Ausprobieren einfach antippen.</p>
    </main>
  );
}
