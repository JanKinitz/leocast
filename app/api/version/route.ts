// Aktuelle Version auf dem Server, damit offene Apps merken, dass es ein Update gibt
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
