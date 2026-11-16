// Berechnet, wo in einer Folge die eigentliche Geschichte beginnt – aus Kapitelmarken oder einem Transkript mit Zeiten.
// Zeiten beziehen sich auf die Original-Folge (ohne nachträglich eingefügte Werbung).
export const runtime = "nodejs";

type Segment = { start: number; text: string };

// Typische Wörter aus Begrüßung, Wünschen, Eigenwerbung und Atem-/Entspannungsübungen
const DEFAULT_INTRO =
  "willkommen|hallo ihr|ich bin lina|wünsche für diese|schreib mir|sternschnuppen|werbefrei|patreon|unterstütz|abonnier|" +
  "lege dich|leg dich|gemütlich hin|decke dich|kuschel dich|mach es dir|bequem|atme|atmen|ein und aus|einatmen|ausatmen|" +
  "augen|entspann|ganz ruhig|ganz schwer|lass los|spür";

const CHAPTER_INTRO = /intro|einleitung|begrüßung|willkommen|entspann|atem|werbung|ankündigung|vorwort|einstimmung/i;

function parseTime(t: string): number {
  const parts = t.trim().replace(",", ".").split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function parseVtt(text: string): Segment[] {
  const out: Segment[] = [];
  const blocks = text.replace(/\r/g, "").split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split("\n");
    const idx = lines.findIndex((l) => l.includes("-->"));
    if (idx < 0) continue;
    const start = parseTime(lines[idx].split("-->")[0]);
    const body = lines
      .slice(idx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!Number.isNaN(start) && body) out.push({ start, text: body });
  }
  return out;
}

function parseHtml(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /<time>([^<]+)<\/time>\s*<p>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = parseTime(m[1]);
    if (!Number.isNaN(start)) out.push({ start, text: m[2].replace(/<[^>]+>/g, "") });
  }
  return out;
}

/** Vorspann = zusammenhängende Abschnitte vom Anfang, die nach Begrüßung/Entspannung klingen (eine Lücke erlaubt). */
function storyFromSegments(segs: Segment[], intro: RegExp): number | null {
  let lastIntro = -1;
  let misses = 0;
  for (let i = 0; i < segs.length && segs[i].start < 600; i++) {
    if (intro.test(segs[i].text.toLowerCase())) {
      lastIntro = i;
      misses = 0;
    } else if (++misses >= 2) break;
  }
  const next = segs[lastIntro + 1];
  if (lastIntro < 0 || !next || next.start < 20) return null;
  return next.start;
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Leocast/0.3 (private family podcast app)" } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const chapters = params.get("chapters");
  const transcript = params.get("transcript");
  const type = params.get("type") || "";
  const introParam = params.get("intro");
  const intro = new RegExp(introParam ? `${DEFAULT_INTRO}|${introParam}` : DEFAULT_INTRO, "i");
  const headers = { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" };

  if (chapters && /^https:\/\//.test(chapters)) {
    const raw = await getText(chapters);
    try {
      const data = raw ? JSON.parse(raw) : null;
      const list: { startTime: number; title?: string }[] = data?.chapters || [];
      if (list.length > 1 && CHAPTER_INTRO.test(list[0].title || "")) {
        const story = list.find((c, i) => i > 0 && !CHAPTER_INTRO.test(c.title || ""));
        if (story) return Response.json({ storyStart: story.startTime, source: "chapters", title: story.title }, { headers });
      }
    } catch {
      /* ungültige Kapitel */
    }
  }

  if (transcript && /^https:\/\//.test(transcript)) {
    const raw = await getText(transcript);
    if (raw) {
      const segs = type.includes("html") || raw.includes("<time>") ? parseHtml(raw) : parseVtt(raw);
      const storyStart = storyFromSegments(segs, intro);
      if (storyStart != null) return Response.json({ storyStart, source: "transcript", segments: segs.length }, { headers });
      return Response.json({ storyStart: null, source: "transcript", segments: segs.length }, { headers });
    }
  }

  return Response.json({ storyStart: null, source: "none" }, { headers });
}
