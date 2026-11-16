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

  const startHold = () => {
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      router.push("/eltern");
    }, 3000);
  };
  const stopHold = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
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
      <div className="topnav-side">
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
        </button>
      </div>
    </header>
  );
}
