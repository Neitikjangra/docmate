import { clearSession, refreshSession } from "@/lib/session";
import { boot } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  boot();
  const session = await refreshSession();
  if (!session) {
    await clearSession();
    return Response.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 });
  }
  return Response.json({ ok: true, data: session });
}
