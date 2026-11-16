// Sucht Podcasts im Apple-Podcast-Verzeichnis (kostenlos, ohne Schlüssel) und liefert nur Treffer mit offenem Feed.
export const runtime = "nodejs";

type ItunesResult = {
  collectionId: number;
  collectionName: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  trackCount?: number;
};

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "Suchbegriff fehlt" }, { status: 400 });
  const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&country=de&limit=15&term=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Leocast/0.2 (private family podcast app)" } });
    if (!res.ok) return Response.json({ error: `Verzeichnis antwortet mit ${res.status}` }, { status: 502 });
    const data = (await res.json()) as { results?: ItunesResult[] };
    const results = (data.results || [])
      .filter((r) => !!r.feedUrl)
      .map((r) => ({
        id: String(r.collectionId),
        name: r.collectionName,
        author: r.artistName || "",
        feedUrl: r.feedUrl as string,
        image: r.artworkUrl600,
        episodes: r.trackCount,
      }));
    return Response.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
