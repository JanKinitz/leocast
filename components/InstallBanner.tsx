"use client";

// Nur im Browser sichtbar (nicht in der installierten App): großer Knopf zum Installieren.
import { useEffect, useState } from "react";
import { canInstall, isStandalone, onInstallChange, promptInstall } from "@/lib/install";

export default function InstallBanner() {
  const [, rerender] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return onInstallChange(() => rerender((n) => n + 1));
  }, []);
  if (!mounted || isStandalone() || !canInstall()) return null;
  return (
    <div className="install-banner">
      <span>Leocast als App auf den Startbildschirm holen</span>
      <button className="button" onClick={() => promptInstall()}>
        Installieren
      </button>
    </div>
  );
}
