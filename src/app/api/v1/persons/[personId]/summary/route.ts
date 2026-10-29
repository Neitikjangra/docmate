/**
 * 30-day consented summary (PRD 10.2, 12.2).
 * GET ?format=json  → the on-screen view
 * GET ?format=pdf   → a one-page PDF (pdf-lib)
 * Access is category-scoped: a doctor sees only the scopes on their live link,
 * and every export is written to the access audit.
 */

import { boot } from "@/lib/db";
import { forbidden, notFound, ok, serverError } from "@/lib/api";
import { canSee, DOCTOR_CATEGORIES, requirePerson, SHAREABLE_CATEGORIES } from "@/lib/scope";
import { buildSummary } from "@/lib/summary";
import { buildSummaryPdf } from "@/lib/pdf";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    const access = guard.access;
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "json";
    const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days") ?? 30)));

    let allowed: string[];
    if (access.role === "owner") {
      allowed = [...SHAREABLE_CATEGORIES];
    } else if (access.role === "doctor") {
      allowed = DOCTOR_CATEGORIES.filter((c) => access.categories.includes(c));
    } else {
      allowed = SHAREABLE_CATEGORIES.filter((c) => canSee(access, c));
    }
    if (!allowed.length) return forbidden("No summary categories are shared with you.");

    const summary = buildSummary(personId, allowed, { fromDays: days });
    if (!summary) return notFound("Person not found.");

    if (format === "pdf") {
      audit(access.viewerAccountId, personId, "summary_export", access.source === "doctor" ? "doctor" : "export");
      const bytes = await buildSummaryPdf(summary);
      return new Response(Buffer.from(bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="docmate-summary-${summary.rangeTo}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return ok({ summary, role: access.role });
  } catch (err) {
    console.error("[summary]", err);
    return serverError();
  }
}
