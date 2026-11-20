"use client";

// Startseite: Meine Podcasts, Meine Lieder, Gute Nacht (Weiterhören und Mag ich stehen unter „Ich“) – alles als wischbare Kachel-Reihen.
import InstallBanner from "@/components/InstallBanner";
import TopNav from "@/components/TopNav";
import { withFigures } from "@/components/Figures";
import { LinkTile, Rail } from "@/components/Tiles";
import { useFeed, useOnline, useSpotifyPlaylists } from "@/components/hooks";
import { allPodcasts, colorFor, type PodcastSource } from "@/lib/library";
import { getDownloads, getPicks, useStoreVersion } from "@/lib/store";

function PodcastTile({ source }: { source: PodcastSource }) {
  const { feed } = useFeed(source);
  return <LinkTile href={`/sendung/${source.id}`} title={source.name} image={feed?.image || source.image} color={source.color} size="l" />;
}

function hasOffline(source: PodcastSource) {
  return Object.values(getDownloads()).some((d) => d.item.podcastId === source.id);
}

export default function Home() {
  useStoreVersion();
  const online = useOnline();
  const { loggedIn } = useSpotifyPlaylists();
  // Meine Lieder: nur was die Eltern im Elternbereich ausgewählt haben (Playlists, Alben).
  // Nur mit Spotify-Anmeldung auf diesem Gerät und mit Internet – sonst ließe sich nichts abspielen.
  const music = getPicks().map((p) => ({ id: p.id, href: `/${p.kind}/${p.id}`, name: p.name, image: p.image }));
  const library = allPodcasts();
  const podcasts = library.filter((p) => p.category === "podcasts" && (online || hasOffline(p)));
  const night = library.filter((p) => p.category === "gutenacht" && (online || hasOffline(p)));

  return (
    <main className="page">
      <TopNav />
      <InstallBanner />

      {!online && <div className="offline-note">Kein Internet – hier ist alles, was du ohne Internet hören kannst.</div>}

      {podcasts.length > 0 && (
        <Rail title="Meine Podcasts">
          {withFigures(podcasts.map((s) => <PodcastTile key={s.id} source={s} />))}
        </Rail>
      )}

      {online && loggedIn && music.length > 0 && (
        <Rail title="Meine Lieder">
          {music.map((m) => (
            <LinkTile key={m.id} href={m.href} title={m.name} image={m.image} color={colorFor(m.name)} />
          ))}
        </Rail>
      )}

      {night.length > 0 && (
        <Rail title="Gute Nacht">
          {night.map((s) => (
            <PodcastTile key={s.id} source={s} />
          ))}
        </Rail>
      )}
    </main>
  );
}
