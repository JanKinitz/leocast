"use client";

// Obere Leiste wie in der KiKA-App: Start · Ich, dazu das Eltern-Schloss (3 Sekunden gedrückt halten).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { IconFace, IconHome, IconLock } from "./Icons";

export default function TopNav() {
  const path = usePathname();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const started = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    started.current = Date.now();
    setHint(false);
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      router.push("/eltern");
    }, 3000);
  };
  const stopHold = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
    // Kurz getippt: zeigen, wie es geht
    if (started.current && Date.now() - started.current < 2900) {
      setHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 4000);
    }
    started.current = 0;
  };

  return (
    <header className="topnav">
      <div className="topnav-side" />
      <nav className="pill-nav" aria-label="Hauptnavigation">
        <Link href="/" className={`pill ${path === "/" ? "active" : ""}`}>
          <IconHome size={22} />
          Start
        </Link>
        <Link href="/ich" className={`pill ${path === "/ich" ? "active" : ""}`}>
          <span className="avatar">
            <IconFace />
          </span>
          Ich
        </Link>
      </nav>
      <div className="topnav-side lock-wrap">
        <button
          className={`lock ${holding ? "holding" : ""}`}
          aria-label="Elternbereich: 3 Sekunden gedrückt halten"
          onPointerDown={startHold}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onContextMenu={(e) => e.preventDefault()}
        >
          <IconLock />
          <span className="lock-label">Eltern</span>
        </button>
        {hint && <div className="lock-hint">Für Eltern: Schloss 3 Sekunden gedrückt halten</div>}
      </div>
    </header>
  );
}
