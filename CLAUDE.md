# Leocast – Projektregeln für Claude

Kindgerechte PWA für unsere 7-jährige Tochter: Kindermusik aus Spotify und Kinderpodcasts aus offenen Feeds
(offline-fähig). Bedienung nach Vorbild der KiKA-App. Android-Handy und Android-Tablet, Chrome.

- Spezifikation (Claude Doc): https://claude.ai/artifact/8xLENZSEFkAUiEFxouVHJS
- Projektstand: claude.ai-Projekt „Leocast“, Dokument `claude/leocast-projektstand.md`
- Technische Vorlage: https://github.com/JanKinitz/sunify

## Harte Regeln

1. **Sprache:** Oberfläche und Kommunikation auf Deutsch, kurze Sätze, Du-Form, keine Fachbegriffe in der Kinderansicht.
2. **Kinderansicht:** große Tippflächen (mind. 64 px), Titel nie abschneiden (umbrechen statt `ellipsis`/`line-clamp`),
   keine versteckten Gesten außer dem Eltern-Schloss, maximal zwei Taps vom Start bis zum Abspielen.
3. **Nur abspielbare Inhalte zeigen:** Spotify-Einträge mit `is_playable === false` oder `restrictions` ausfiltern.
4. **Kein automatisches Weiterspielen:** ein Tap spielt genau einen Titel (`uris: [uri]`); Playlist-Durchlauf nur, wenn im
   Elternbereich erlaubt.
5. **Zugangsdaten** nur als Vercel-Umgebungsvariablen. Nie ausgeben, nie committen. Das Repository ist **öffentlich**.
   Die Spotify-Client-ID ist nicht geheim (PKCE ohne Secret).
6. **Spotify-Audio nie selbst speichern** (Developer Terms). Offline nur für Folgen aus offenen RSS-Feeds.
7. **Nicht-kommerziell:** Vercel Hobby erlaubt nur private Nutzung. Keine Werbung, keine Affiliate-Links.

## Release-Ablauf

- Hosting: **Vercel** (Hobby). Jeder Push auf `main` wird automatisch veröffentlicht.
- **Claude committet und pusht direkt, ohne Rückfrage** (Vercel kennt keine Credits pro Deployment, Grenze 100 Deployments
  pro Tag). Sollte doch ein Credit- oder Kontingent-Limit auftauchen: wie bei Sunify nur nach Bestätigung im Chat.
- Vor jedem Push: `npm run typecheck` und `npm run build` – in der Claude-Cloud ist npm gesperrt, dann prüft
  GitHub Actions (`.github/workflows/ci.yml`). Nach dem Push den Lauf beobachten und Fehler sofort beheben.
- Commit-Nachrichten auf Deutsch, im Imperativ.

## Spotify

- Developer-App „Leocast“ im Konto des Vaters (Premium), Entwicklungsmodus, max. 5 Nutzer (Kinderkonto freigeschaltet).
- Redirect-URIs: `http://127.0.0.1:3000/callback` (lokal; `localhost` ist nicht erlaubt) und `https://<vercel-adresse>/callback`.
- Endpunkte nach den Änderungen vom Feb. 2026: `/me/playlists`, `/playlists/{id}/items`, Einzelabrufe für Shows/Episoden.

## Struktur (Prototyp)

- `app/page.tsx` – Login, Playlists, Wiedergabe (Web Playback SDK, `components/useSpotifyPlayer.ts`)
- `app/podcast/page.tsx` – Feed laden, Folge offline speichern, abspielen (`lib/offline.ts`)
- `app/api/feed/route.ts` – RSS holen und als JSON liefern
- `public/sw.js` – Service Worker (App offline, gespeicherte Folgen mit Range-Unterstützung)
- `lib/diagnostics.ts` + `components/LogPanel.tsx` – Prüfprotokoll für Tests auf dem Gerät
