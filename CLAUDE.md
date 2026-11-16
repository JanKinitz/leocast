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

## Gestaltung

- **Dunkles Design** (Abend/Einschlafen): Grund `#14172b`, Flächen `#1e2240`, Akzent gelb `#ffd43b` für Hauptknöpfe,
  orange `#ff8a3d` für die aktive Navigation. Schrift Nunito.
- Muster nach KiKA-App: Pillen-Leiste oben (Start · Ich), große Kacheln in wischbaren Reihen, Sendungs-Welt mit eigener
  Farbe und rundem Logo, runder gelber Zurück-Knopf, Herz = Mag ich, Wolke = offline.
- Player: Handy = Vollbild beim Abspielen (Android-Zurück schließt ihn) + kleiner Player unten; Tablet quer = Player
  rechts dauerhaft; Tablet hochkant = Player unten dauerhaft. Umschaltung rein per CSS-Media-Query (`globals.css`).
- Wireframes: https://claude.ai/artifact/GTBMHerutbdNW8tVrge5iL

## Struktur

- `app/page.tsx` Startseite · `app/sendung/[id]` Sendungs-Welt · `app/playlist/[id]` Spotify-Playlist ·
  `app/ich` Mein Bereich · `app/eltern` Elternbereich (Rechenaufgabe; Schloss oben rechts 3 s halten)
- `components/PlayerProvider.tsx` – ein Player für Podcast-Folgen (Audio-Element) und Spotify (Web Playback SDK),
  Fortschritt, Schlaf-Timer, Media Session · `components/PlayerDock.tsx` – Mini- und Vollbild-Player
- `lib/library.ts` – Podcasts und Kategorien (Feed-Adresse fest oder per Suche gefunden)
- `lib/podcasts.ts` – Feeds laden/cachen · `lib/store.ts` – Mag ich, Fortschritt, Downloads (localStorage)
- `app/api/feed` – RSS als JSON · `app/api/podcast-search` – Apple-Podcast-Verzeichnis (nur Treffer mit Feed)
- `public/sw.js` – Service Worker (App offline, gespeicherte Folgen mit Range-Unterstützung)
- `lib/diagnostics.ts` + `components/LogPanel.tsx` – Prüfprotokoll (im Elternbereich)
