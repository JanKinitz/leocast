"use client";

// Startseite: Weiterhören, Meine Podcasts, Meine Lieder, Gute Nacht – alles als wischbare Kachel-Reihen.
import InstallBanner from "@/components/InstallBanner";
import TopNav from "@/components/TopNav";
import { LinkTile, PlayTile, Rail } from "@/components/Tiles";
import { useFeed, useOnline, useSpotifyPlaylists } from "@/components/hooks";
import { PODCASTS, colorFor, type PodcastSource } from "@/lib/library";
import { continueListening, getDownloads, useStoreVersion } from "@/lib/store";
import { cachedFeed, episodeItem } from "@/lib/podcasts";

function PodcastTile({ source }: { source: PodcastSource }) {
  const { feed } = useFeed(source);
  return <LinkTile href={`/sendung/${source.id}`} title={source.name} image={feed?.image} color={source.color} size="l" />;
}

function hasOffline(source: PodcastSource) {
  return Object.values(getDownloads()).some((d) => d.item.podcastId === source.id);
}

export default function Home() {
  useStoreVersion();
  const online = useOnline();
  const { playlists } = useSpotifyPlaylists();
  const resume = continueListening().filter((p) => online || !!getDownloads()[p.item.id]);
  const podcasts = PODCASTS.filter((p) => p.category === "podcasts" && (online || hasOffline(p)));
  const night = PODCASTS.filter((p) => p.category === "gutenacht" && (online || hasOffline(p)));

  return (
    <main className="page">
      <TopNav />
      <InstallBanner />

      {!online && <div className="offline-note">Kein Internet – hier ist alles, was du ohne Internet hören kannst.</div>}

      {resume.length > 0 && (
        <Rail title="Weiterhören">
          {resume.map((p) => {
            const src = PODCASTS.find((s) => s.id === p.item.podcastId);
            const feed = src ? cachedFeed(src.id) : null;
            const more = src && feed ? feed.episodes.map((e) => episodeItem(e, src)) : [];
            return <PlayTile key={p.item.id} item={p.item} more={more} wide />;
          })}
        </Rail>
      )}

      {podcasts.length > 0 && (
        <Rail title="Meine Podcasts">
          {podcasts.map((s) => (
            <PodcastTile key={s.id} source={s} />
          ))}
        </Rail>
      )}

      {online && playlists.length > 0 && (
        <Rail title="Meine Lieder">
          {playlists.map((pl) => (
            <LinkTile key={pl.id} href={`/playlist/${pl.id}`} title={pl.name} image={pl.images?.[0]?.url} color={colorFor(pl.name)} />
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
