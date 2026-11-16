// KI-Analyse einer Folge: die ersten Minuten der echten Audiodatei abschreiben lassen (Whisper bei Groq)
// und ein Sprachmodell bestimmen lassen, wo Werbung endet und wo die eigentliche Geschichte beginnt.
// Zeiten beziehen sich auf die tatsächliche Audiodatei (mit Werbung). Ergebnis wird 30 Tage im CDN gespeichert.
export const runtime = "nodejs";
export const maxDuration = 120;
// Aus Frankfurt laden, damit die eingefügte Werbung der auf den Geräten in Deutschland entspricht
export const preferredRegion = "fra1";

const WINDOW_SEC = 480; // erste 8 Minuten: bei LALUNA beginnt die Geschichte erst nach Werbung, Wünschen und Ritual
const MAX_BYTES = 24 * 1024 * 1024; // Groq (kostenlos): Dateien bis 25 MB
const GROQ = "https://api.groq.com/openai/v1";
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

type Seg = { start: number; end: number; text: string };

async function fetchRange(url: string, start: number, end: number): Promise<{ bytes: Uint8Array; total: number | null }> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, "User-Agent": UA }, redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Audio nicht ladbar (${res.status})`);
  const cr = res.headers.get("content-range");
  const total = cr ? Number(cr.split("/")[1]) || null : Number(res.headers.get("content-length")) || null;
  // Falls der Server den Bereich ignoriert: nach der gewünschten Menge abbrechen
  const want = end - start + 1;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < want) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
  }
  reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(got, want));
  let off = 0;
  for (const c of chunks) {
    const n = Math.min(c.length, bytes.length - off);
    bytes.set(c.subarray(0, n), off);
    off += n;
    if (off >= bytes.length) break;
  }
  return { bytes, total: res.status === 206 ? total : got >= want ? null : got };
}

function id3Size(b: Uint8Array): number {
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    return 10 + ((b[6] & 0x7f) << 21) + ((b[7] & 0x7f) << 14) + ((b[8] & 0x7f) << 7) + (b[9] & 0x7f);
  }
  return 0;
}

// Bitrate aus dem ersten MP3-Frame (kbit/s); null wenn kein MP3
function mp3Bitrate(b: Uint8Array, from: number): number | null {
  const v1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const v2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  for (let i = from; i < b.length - 4; i++) {
    if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) {
      const version = (b[i + 1] >> 3) & 3; // 3 = MPEG1
      const layer = (b[i + 1] >> 1) & 3; // 1 = Layer III
      const idx = (b[i + 2] >> 4) & 15;
      if (layer !== 1 || idx === 0 || idx === 15 || version === 1) continue;
      return (version === 3 ? v1 : v2)[idx];
    }
  }
  return null;
}

async function transcribe(audio: Uint8Array, key: string): Promise<Seg[]> {
  const form = new FormData();
  form.append("file", new Blob([audio.slice().buffer as ArrayBuffer], { type: "audio/mpeg" }), "anfang.mp3");
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "de");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  const res = await fetch(`${GROQ}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok)
    throw Object.assign(new Error(`Abschreiben fehlgeschlagen (${res.status}): ${(await res.text()).slice(0, 200)}`), {
      status: res.status === 429 ? 429 : 502,
    });
  const data = await res.json();
  return (data.segments || []).map((s: Seg) => ({ start: s.start, end: s.end, text: String(s.text).trim() }));
}

// Version der Anweisung: steigt, wenn sich die Erkennung ändert (Vorab-Analyse prüft dann alles neu)
const PROMPT_VERSION = 4;

const PROMPT = `Du bekommst den Anfang einer Kinder-Podcast-Folge (automatisch abgeschrieben) als nummerierte Abschnitte,
dazu den Titel der Folge. Teile die Abschnitte in zusammenhängende Blöcke ein. Jeder Block hat einen Typ:
W = eingespielte Fremdwerbung: Spots für Produkte, Firmen, Apps, Versicherungen, Shops oder andere Podcasts, meist mit
    anderer Stimme und ohne Bezug zur Sendung. Begrüßung oder Eigenwerbung der Sprecherin der Sendung ist KEIN W.
I = Vorspann der Sendung: Erkennungsmelodie, Begrüßung, Vorstellen, wer sich die Folge gewünscht hat, Grüße,
    Wünsche-Aufruf, Eigenwerbung der Sendung (werbefrei hören, Unterstützer, Abo, Bewertung), Hinweise
E = Entspannung vor der Geschichte: hinlegen, zudecken, Augen schließen, atmen ("ein und aus"), Körper wird schwer und
    warm, ganz ruhig werden
G = die eigentliche Geschichte bzw. Fantasiereise. Sie beginnt in dem Moment, in dem die erzählte Welt einsetzt:
    eine Figur kommt dazu oder ein Ort wird betreten bzw. vorgestellt – auch wenn das in jeder Folge gleich anfängt.
    Bei Wissens-Sendungen: das eigentliche Thema.
O = Abspann (Verabschiedung, Gute-Nacht-Wünsche am Ende)

Beispiele (echte Folgen, von Eltern geprüft). Die Sätze sind nur Beispiele: Jede Folge beginnt anders, achte auf
den Inhalt, nicht auf genaue Formulierungen.
- LALUNA Traumreisen, Folge 88: Fremdwerbung (W), Begrüßung und wer sich die Folge gewünscht hat (I), dann
  "Hallo du kleiner Held ..." mit Hinlegen und Atmen (E). Die Geschichte (G) beginnt, als die Begleitfigur kommt:
  "Luna, die kleine Zauberkatze, kommt jetzt zu dir ...".
- Bleib entspannt!, "Noel, der Weihnachtsstern": Fremdwerbung (W), Vorspann (I), dann "Hallo du, schön dass du da
  bist ..." mit Entspannung (E). Die Fantasiereise (G) beginnt, als ein Ort vorgestellt wird: "Stelle dir jetzt vor,
  du stehst an deinem Fenster ...". In anderen Folgen klingt dieser Übergang anders.
- CheckPod: keine Fremdwerbung, nur ein kurzes Intro mit Erkennungsmelodie (I), dann direkt das Thema (G).
  Wenn es keine Fremdwerbung gibt, darf es auch keinen W-Block geben.

Antworte nur mit kurzem JSON. Für jeden Block nur die Nummer des ERSTEN Abschnitts und den Typ, in Reihenfolge, z. B.:
{"blocks":[{"from":0,"type":"W"},{"from":4,"type":"I"},{"from":11,"type":"E"},{"from":27,"type":"G"}],
"reason":"<ein kurzer Satz, woran du den Beginn der Geschichte erkennst>"}`;

type Decision = { content: number; story: number | null; reason: string; labels: string; model: string; warnings: string[] };

async function decide(segs: Seg[], key: string, title: string, show: string): Promise<Decision> {
  const lines = segs
    .map((s, i) => `[${i}] ${s.text}`)
    .join("\n");
  const user = `Sendung: ${show || "unbekannt"}\nTitel der Folge: ${title || "unbekannt"}\nAnzahl Abschnitte: ${segs.length}\n\n${lines}`;
  // Jedes Modell hat ein eigenes kostenloses Tageskontingent: ist eins aufgebraucht, das nächste nehmen
  const models = [process.env.GROQ_LLM_MODEL, "openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"].filter(
    Boolean,
  ) as string[];
  let limited = 0;
  const errors: string[] = [];
  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      temperature: 0,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: user },
      ],
    };
    body.max_completion_tokens = 3000;
    if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
    if (model.startsWith("qwen/")) body.reasoning_effort = "none";
    const res = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 429) limited++;
      errors.push(`${model}: ${res.status} ${(await res.text()).slice(0, 100)}`);
      continue;
    }
    const data = await res.json();
    let out: { blocks?: { from?: number; type?: string }[]; reason?: string } = {};
    const choice = data.choices?.[0];
    const text: string = choice?.message?.content || "";
    // JSON aus der Antwort herauslösen (manche Modelle schreiben Text oder Denkblöcke drumherum)
    const json = text.replace(/<think>[\s\S]*?<\/think>/g, "").match(/\{[\s\S]*\}/)?.[0];
    try {
      out = JSON.parse(json || "{}");
    } catch {
      errors.push(`${model}: keine gültige Antwort (${choice?.finish_reason}) ${text.slice(0, 160)}`);
      continue;
    }
    // Blöcke in einen Buchstaben pro Abschnitt umwandeln
    const blocks = (Array.isArray(out.blocks) ? out.blocks : [])
      .map((b) => ({ from: Number(b.from), type: String(b.type || "").toUpperCase().slice(0, 1) }))
      .filter((b) => Number.isInteger(b.from) && b.from >= 0 && b.from < segs.length && "WIEGO".includes(b.type) && b.type)
      .sort((a, b) => a.from - b.from);
    if (!blocks.length) {
      errors.push(`${model}: keine Blöcke (${choice?.finish_reason}) ${text.slice(0, 160)}`);
      continue;
    }
    let labels = "";
    for (let i = 0; i < segs.length; i++) {
      const b = [...blocks].reverse().find((x) => x.from <= i) || blocks[0];
      labels += b.type;
    }
    return { ...fromLabels(labels, segs), reason: String(out.reason || "").slice(0, 200), labels, model, warnings: errors };
  }
  throw Object.assign(new Error(`Sprachmodell nicht erreichbar (${errors.join(" | ")})`), {
    status: limited === models.length ? 429 : 502,
  });
}

/** Werbung endet beim ersten Nicht-W; Geschichte = erster G-Abschnitt, nach dem es überwiegend mit G weitergeht */
function fromLabels(labels: string, segs: Seg[]): { content: number; story: number | null } {
  let content = 0;
  while (content < labels.length && labels[content] === "W") content++;
  if (content >= labels.length) content = 0;
  let story: number | null = null;
  for (let i = content; i < labels.length; i++) {
    if (labels[i] !== "G") continue;
    const next = labels.slice(i, i + 6);
    const g = [...next].filter((c) => c === "G").length;
    if (g >= Math.min(4, next.length) && !next.includes("E")) {
      story = i;
      break;
    }
  }
  // Nur springen, wenn vor der Geschichte eine Entspannung kommt (Gute-Nacht-Podcasts).
  // Bei Wissens-Podcasts (CheckPod, Anna, Ole) bleibt das Intro, wie es ist.
  const hasRelax = story != null && labels.slice(content, story).includes("E");
  if (story != null && (!hasRelax || segs[story].start - segs[content].start < 20)) story = null;
  return { content, story };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // Name der Variablen bei Vercel: GROQ_API_KEY (andere Schreibweisen werden auch akzeptiert)
  const key =
    process.env.GROQ_API_KEY || process.env.GROQ || process.env.groq || process.env.GROG || process.env.grog || process.env.Groq || process.env.Grog;
  if (params.get("check")) return Response.json({ configured: Boolean(key) }, { headers: { "Cache-Control": "no-store" } });

  const audio = params.get("audio") || "";
  const title = (params.get("title") || "").slice(0, 200);
  const show = (params.get("show") || "").slice(0, 100);
  const debug = params.get("debug") === "1";
  // Kürzeres Fenster (z. B. nur Werbung erkennen bei Wissens-Podcasts) spart Kontingent
  const windowSec = Math.min(WINDOW_SEC, Math.max(90, Number(params.get("window")) || WINDOW_SEC));
  const noStore = { "Cache-Control": "no-store" };
  if (!key) return Response.json({ error: "KI-Analyse nicht eingerichtet" }, { status: 503, headers: noStore });
  if (!/^https?:\/\//.test(audio)) return Response.json({ error: "Audio-Adresse fehlt" }, { status: 400, headers: noStore });

  try {
    const head = await fetchRange(audio, 0, 65535);
    const id3 = id3Size(head.bytes);
    let probe = head.bytes;
    if (id3 > head.bytes.length - 4) probe = (await fetchRange(audio, id3, id3 + 8191)).bytes;
    const kbps = mp3Bitrate(probe, id3 > head.bytes.length - 4 ? 0 : id3);
    if (!kbps) throw new Error("Nur MP3-Folgen können analysiert werden");

    const end = Math.min(id3 + Math.round((kbps * 1000 * windowSec) / 8), MAX_BYTES) - 1;
    const part = await fetchRange(audio, 0, end);
    const segs = (await transcribe(part.bytes, key)).filter((s) => s.text);
    if (segs.length < 3) throw new Error("Zu wenig Sprache erkannt");

    const d = await decide(segs, key, title, show);
    const total = head.total ?? part.total;
    const totalSec = total ? Math.round(((total - id3) * 8) / (kbps * 1000)) : null;
    const story = d.story != null ? segs[d.story].start : null;
    const content = segs[d.content].start;
    return Response.json(
      {
        source: "ki",
        storyStart: story,
        contentStart: content > 3 ? content : 0,
        totalSec,
        firstWords: d.story != null ? segs[d.story].text.slice(0, 120) : null,
        reason: d.reason,
        model: d.model,
        window: windowSec,
        pv: PROMPT_VERSION,
        ...(d.warnings.length ? { warnings: d.warnings.map((w) => w.slice(0, 300)) } : {}),
        // Zum Nachprüfen im Elternbereich: Abschnitte mit Zeit und Einordnung
        ...(debug ? { segments: segs.map((x, i) => ({ t: Math.round(x.start), l: d.labels[i], text: x.text })) } : {}),
      },
      { headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=2592000" } },
    );
  } catch (e) {
    const status = (e as { status?: number }).status || 502;
    return Response.json({ error: (e as Error).message }, { status, headers: noStore });
  }
}
