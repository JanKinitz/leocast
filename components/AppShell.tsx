"use client";

import { usePathname } from "next/navigation";
import { usePlayer } from "./PlayerProvider";
import PlayerDock from "./PlayerDock";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const p = usePlayer();
  const path = usePathname();
  const parents = path.startsWith("/eltern") || path.startsWith("/callback");
  const hasPlayer = !!p.current && !parents;
  return (
    <div className={`shell ${hasPlayer ? "has-player" : ""}`}>
      <div className="content">{children}</div>
      {hasPlayer && <PlayerDock />}
    </div>
  );
}
