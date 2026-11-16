// Holt einen offenen Podcast-Feed (RSS), damit der Browser ihn lesen darf (CORS), und liefert JSON.
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

type Episode = {
  guid: string;
  title: string;
  audioUrl: string;
  audioType?: string;
  audioBytes?: number;
  published?: string;
  durationSec?: number;
  image?: string;
  description?: string;
  episodeType?: string;
  transcriptUrl?: string;
  transcriptType?: string;
  chaptersUrl?: string;
};

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"]);
  }
  return "";
}

function parseDuration(v: unknown): number | undefined {
  const s = text(v).trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Transkript mit Zeitangaben bevorzugen: VTT, dann SRT, dann HTML (Text ohne Zeiten nützt nichts)
function pickTranscript(item: any): { transcriptUrl?: string; transcriptType?: string } {
  const list = asArray<any>(item["podcast:transcript"]);
  for (const type of ["text/vtt", "application/x-subrip", "application/srt", "text/html"]) {
    const t = list.find((x) => x?.["@_type"] === type);
    if (t?.["@_url"]) return { transcriptUrl: t["@_url"], transcriptType: type };
  }
  return {};
}

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !/^https?:\/\//i.test(url)) {
    return Response.json({ error: "Parameter url fehlt oder ist ungültig" }, { status: 400 });
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Leocast/0.1 (private family podcast app)" },
      redirect: "follow",
    });
  } catch (e) {
    return Response.json({ error: `Feed nicht erreichbar: ${(e as Error).message}` }, { status: 502 });
  }
  if (!res.ok) {
    return Response.json({ error: `Feed antwortet mit ${res.status}` }, { status: 502 });
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return Response.json({ error: "Feed ist zu groß" }, { status: 413 });
  }
  const xml = new TextDecoder("utf-8").decode(buf);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return Response.json({ error: "Kein gültiger Feed" }, { status: 422 });
  }
  const channel = doc?.rss?.channel;
  if (!channel) return Response.json({ error: "Kein RSS-Feed" }, { status: 422 });

  const channelImage: string | undefined =
    channel["itunes:image"]?.["@_href"] || text(channel.image?.url) || undefined;

  const episodes: Episode[] = asArray<any>(channel.item)
    .map((item: any): Episode | null => {
      const enc = asArray<any>(item.enclosure)[0];
      const audioUrl = enc?.["@_url"];
      if (!audioUrl) return null;
      return {
        guid: text(item.guid) || audioUrl,
        title: text(item.title),
        audioUrl,
        audioType: enc?.["@_type"],
        audioBytes: enc?.["@_length"] ? Number(enc["@_length"]) : undefined,
        published: text(item.pubDate) || undefined,
        durationSec: parseDuration(item["itunes:duration"]),
        image: item["itunes:image"]?.["@_href"] || channelImage,
        description: text(item["itunes:summary"] || item.description).slice(0, 500),
        episodeType: text(item["itunes:episodeType"]) || undefined,
        ...pickTranscript(item),
        chaptersUrl: asArray<any>(item["podcast:chapters"])[0]?.["@_url"],
      };
    })
    .filter((e): e is Episode => !!e);

  return Response.json(
    {
      feedUrl: url,
      title: text(channel.title),
      author: text(channel["itunes:author"]),
      image: channelImage,
      episodes,
    },
    { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" } },
  );
}
