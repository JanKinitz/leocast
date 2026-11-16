"use client";

// Mein Bereich: Mag ich, Weiterhören, Ohne Internet.
import TopNav from "@/components/TopNav";
import { LinkTile, PlayTile, Rail } from "@/components/Tiles";
import { IconCloudCheck, IconHeart } from "@/components/Icons";
import { useOnline } from "@/components/hooks";
import { podcastById } from "@/lib/library";
import { continueListening, getDownloads, getLikes, useStoreVersion } from "@/lib/store";

export default function Ich() {
  useStoreVersion();
  const online = useOnline();
  const likes = Object.entries(getLikes()).sort((a, b) => b[1].at - a[1].at);
  const downloads = Object.values(getDownloads()).sort((a, b) => b.at - a.at);
  const resume = continueListening().filter((p) => online || !!getDownloads()[p.item.id]);
  const nothing = likes.length === 0 && downloads.length === 0 && resume.length === 0;

  return (
    <main className="page">
      <TopNav />

      {nothing && (
        <div className="empty">
          <p>Hier sammelst du deine Lieblinge.</p>
          <p>Tippe beim Hören auf das Herz.</p>
        </div>
      )}

      {likes.length > 0 && (
        <Rail title="Mag ich" icon={<IconHeart filled />}>
          {likes.map(([id, l]) => {
            if (l.item) return <PlayTile key={id} item={l.item} />;
            if (l.podcastId) {
              const src = podcastById(l.podcastId);
              return <LinkTile key={id} href={`/sendung/${l.podcastId}`} title={l.title} image={l.image} color={src?.color} />;
            }
            return null;
          })}
        </Rail>
      )}

      {resume.length > 0 && (
        <Rail title="Weiterhören">
          {resume.map((p) => (
            <PlayTile key={p.item.id} item={p.item} wide />
          ))}
        </Rail>
      )}

      {downloads.length > 0 && (
        <Rail title="Ohne Internet" icon={<IconCloudCheck size={24} />}>
          {downloads.map((d) => (
            <PlayTile key={d.item.id} item={d.item} more={downloads.map((x) => x.item)} />
          ))}
        </Rail>
      )}
    </main>
  );
}
