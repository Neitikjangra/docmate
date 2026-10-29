/** Dashboard snapshot for one person (PRD 8.1). */

import { boot } from "@/lib/db";
import { ok, serverError } from "@/lib/api";
import { requirePerson, getPerson } from "@/lib/scope";
import { buildDashboard } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    if (!getPerson(personId)) return ok({ empty: true });

    const url = new URL(req.url);
    const days = Math.min(120, Math.max(7, Number(url.searchParams.get("days") ?? 30)));
    const dashboard = await buildDashboard(personId, days);
    return ok({ ...dashboard, role: guard.access.role, categories: guard.access.categories });
  } catch (err) {
    console.error("[dashboard]", err);
    return serverError();
  }
}
