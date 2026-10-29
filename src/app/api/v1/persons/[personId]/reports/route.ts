/**
 * Reports / lab uploads (PRD 6.4).
 * The file itself never reaches the server in this build; the client extracts
 * values locally and sends the confirmed numbers, which is the privacy-first
 * path the PRD describes.
 */

import { all, boot, insert, j, nowIso, uid } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { canSee, requirePerson } from "@/lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    if (!canSee(guard.access, "reports")) return ok({ reports: [] });

    return ok({
      reports: all<any>(
        `SELECT * FROM reports WHERE person_id = ? ORDER BY created_at DESC LIMIT 50`,
        [personId],
      ).map((r) => ({
        id: r.id,
        fileName: r.file_name,
        kind: r.kind,
        reportDate: r.report_date,
        confirmed: !!r.confirmed,
        source: r.source,
        values: j<any[]>(r.extracted_values_json, []),
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[reports.get]", err);
    return serverError();
  }
}

type Body = {
  fileName?: string;
  kind?: string;
  reportDate?: string;
  values?: { label: string; value: string; unit?: string; flag?: "low" | "normal" | "high" }[];
};

export async function POST(req: Request, ctx: Ctx) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId, session);
    if (!guard.ok) return guard.res;
    if (guard.access.role !== "owner") return badRequest("Only the owner can add reports.");

    const b = await body<Body>(req);
    const fileName = String(b.fileName ?? "").trim() || "Report";
    const values = (b.values ?? []).filter((v) => v && v.label && v.value);

    insert("reports", {
      id: uid("rep"),
      person_id: personId,
      file_ref: null,
      file_name: fileName,
      kind: b.kind ?? "lab",
      extracted_values_json: JSON.stringify(values),
      report_date: b.reportDate ?? null,
      confirmed: 1,
      source: "upload",
      created_at: nowIso(),
    });

    return ok({ saved: true, count: values.length }, { status: 201 });
  } catch (err) {
    console.error("[reports.post]", err);
    return serverError();
  }
}
