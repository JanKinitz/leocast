// Holt einen offenen Podcast-Feed (RSS), damit der Browser ihn lesen darf (CORS), und liefert JSON.
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  subtitle?: string;
  keywords?: string;
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

// Manche Anbieter teilen lange Feeds auf mehrere Seiten auf (atom:link rel="next"/"last", RFC 5005)
const MAX_PAGES = 30;
const PAGE_RELS = ["next", "last", "prev", "previous"];

async function fetchChannel(url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Leocast/0.1 (private family podcast app)" },
      redirect: "follow",
    });
  } catch (e) {
    throw Object.assign(new Error(`Feed nicht erreichbar: ${(e as Error).message}`), { status: 502 });
  }
  if (!res.ok) throw Object.assign(new Error(`Feed antwortet mit ${res.status}`), { status: 502 });
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw Object.assign(new Error("Feed ist zu groß"), { status: 413 });
  const xml = new TextDecoder("utf-8").decode(buf);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    throw Object.assign(new Error("Kein gültiger Feed"), { status: 422 });
  }
  const channel = doc?.rss?.channel;
  if (!channel) throw Object.assign(new Error("Kein RSS-Feed"), { status: 422 });
  return channel;
}

function pageLinks(channel: any, base: string): string[] {
  const links = [...asArray<any>(channel["atom:link"]), ...asArray<any>(channel.link)];
  const out: string[] = [];
  for (const l of links) {
    if (typeof l !== "object" || !PAGE_RELS.includes(String(l?.["@_rel"] || ""))) continue;
    try {
      out.push(new URL(String(l["@_href"]), base).toString());
    } catch {
      /* ungültige Adresse */
    }
  }
  return out;
}

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !/^https?:\/\//i.test(url)) {
    return Response.json({ error: "Parameter url fehlt oder ist ungültig" }, { status: 400 });
  }
  let channel: any;
  try {
    channel = await fetchChannel(url);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: (e as { status?: number }).status || 502 });
  }

  // Alle Seiten einsammeln (erste Seite = neueste Folgen)
  const items: any[] = [...asArray<any>(channel.item)];
  const seen = new Set([url]);
  const todo = pageLinks(channel, url);
  let pages = 1;
  while (todo.length && pages < MAX_PAGES) {
    const next = todo.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    try {
      const ch = await fetchChannel(next);
      pages++;
      items.push(...asArray<any>(ch.item));
      todo.push(...pageLinks(ch, next));
    } catch {
      /* eine fehlende Seite soll die anderen nicht verhindern */
    }
  }

  const channelImage: string | undefined =
    channel["itunes:image"]?.["@_href"] || text(channel.image?.url) || undefined;

  const byGuid = new Set<string>();
  const episodes: Episode[] = items
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
        subtitle: text(item["itunes:subtitle"]).slice(0, 300) || undefined,
        keywords: text(item["itunes:keywords"]).slice(0, 300) || undefined,
        ...pickTranscript(item),
        chaptersUrl: asArray<any>(item["podcast:chapters"])[0]?.["@_url"],
      };
    })
    .filter((e): e is Episode => !!e && !byGuid.has(e.guid) && !!byGuid.add(e.guid));
  // Neueste zuerst (Seiten können in beliebiger Reihenfolge kommen)
  if (pages > 1) {
    const time = (e: Episode) => (e.published ? Date.parse(e.published) || 0 : 0);
    episodes.sort((a, b) => time(b) - time(a));
  }

  return Response.json(
    {
      feedUrl: url,
      pages,
      title: text(channel.title),
      author: text(channel["itunes:author"]),
      image: channelImage,
      episodes,
    },
    { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" } },
  );
}
