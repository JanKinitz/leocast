// Welche Podcasts die Vorab-Analyse (GitHub Actions) bearbeiten soll: von den Eltern per „Sprungmarken mit KI“
// gewählt und über den Abgleich gespeichert. Ohne Abgleich: die Grundeinstellung der festen Podcasts.
import { blobToken } from "@/lib/blobToken";
import { head } from "@vercel/blob";
import defaults from "@/lib/default-podcasts.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const fallback = (defaults as { ai?: boolean }[]).filter((p) => p.ai);
  try {
    if (!blobToken()) throw new Error("kein Speicher");
    const meta = await head("config/analyse-list.json", { token: blobToken() });
    const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return Response.json({ podcasts: data.podcasts, source: "eltern" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ podcasts: fallback, source: "grundeinstellung" }, { headers: { "Cache-Control": "no-store" } });
  }
}
