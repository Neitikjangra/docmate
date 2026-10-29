import { clearSession } from "@/lib/session";
import { boot } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  boot();
  await clearSession();
  return Response.json({ ok: true, data: { signedOut: true } });
}
