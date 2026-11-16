"use client";

// Startseite: Weiterhören, Meine Podcasts, Meine Lieder, Gute Nacht – alles als wischbare Kachel-Reihen.
import InstallBanner from "@/components/InstallBanner";
import TopNav from "@/components/TopNav";
import { withFigures } from "@/components/Figures";
import { LinkTile, PlayTile, Rail } from "@/components/Tiles";
import { useFeed, useOnline, useSpotifyPlaylists } from "@/components/hooks";
import { allPodcasts, colorFor, type PodcastSource } from "@/lib/library";
import { continueListening, getDownloads, getPicks, useStoreVersion } from "@/lib/store";
import { cachedFeed, episodeItem } from "@/lib/podcasts";

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
  const { loggedIn, playlists } = useSpotifyPlaylists();
  // Meine Lieder: Auswahl der Eltern (Playlists, Alben) und die eigenen Playlists des Kinderkontos.
  // Nur mit Spotify-Anmeldung auf diesem Gerät und mit Internet – sonst ließe sich nichts abspielen.
  const picks = getPicks();
  const music = [
    ...picks.map((p) => ({ id: p.id, href: `/${p.kind}/${p.id}`, name: p.name, image: p.image })),
    ...playlists
      .filter((pl) => !picks.some((p) => p.id === pl.id))
      .map((pl) => ({ id: pl.id, href: `/playlist/${pl.id}`, name: pl.name, image: pl.images?.[0]?.url })),
  ];
  const resume = continueListening().filter((p) => online || !!getDownloads()[p.item.id]);
  const library = allPodcasts();
  const podcasts = library.filter((p) => p.category === "podcasts" && (online || hasOffline(p)));
  const night = library.filter((p) => p.category === "gutenacht" && (online || hasOffline(p)));

  return (
    <main className="page">
      <TopNav />
      <InstallBanner />

      {!online && <div className="offline-note">Kein Internet – hier ist alles, was du ohne Internet hören kannst.</div>}

      {resume.length > 0 && (
        <Rail title="Weiterhören">
          {resume.map((p) => {
            const src = library.find((s) => s.id === p.item.podcastId);
            const feed = src ? cachedFeed(src.id) : null;
            const more = src && feed ? feed.episodes.map((e) => episodeItem(e, src)) : [];
            return <PlayTile key={p.item.id} item={p.item} more={more} wide />;
          })}
        </Rail>
      )}

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
