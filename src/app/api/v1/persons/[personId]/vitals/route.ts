/**
 * Vitals read/write (PRD 6.2 typed path).
 * GET  → recent readings grouped for the trend charts.
 * POST → a typed reading; re-runs the on-log rules so the same safety net
 *        applies whether a number arrives by voice or by hand.
 */

import { all, boot, insert, nowIso, localDate, uid } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { requirePerson } from "@/lib/scope";
import { processOutcomes } from "@/lib/alerts";
import { recomputeScore, runRules, updateBaselines, upsertDailyFeatures } from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

const ALLOWED = new Set(["bp", "sugar_fasting", "sugar_random", "weight", "spo2", "temp", "pulse"]);

export async function GET(req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const rows = all<any>(
      type
        ? `SELECT * FROM vitals WHERE person_id = ? AND ts >= ? AND type = ? ORDER BY ts DESC LIMIT 300`
        : `SELECT * FROM vitals WHERE person_id = ? AND ts >= ? ORDER BY ts DESC LIMIT 300`,
      type ? [personId, since, type] : [personId, since],
    );

    return ok({
      vitals: rows.map((r) => ({
        id: r.id,
        ts: r.ts,
        type: r.type,
        value: safeParse(r.value_json),
        unit: r.unit,
        source: r.source,
        held: !!r.held,
      })),
    });
  } catch (err) {
    console.error("[vitals.get]", err);
    return serverError();
  }
}

type VitalBody = { type?: string; value?: Record<string, number>; unit?: string; ts?: string };

const RANGES: Record<string, [number, number]> = {
  systolic: [60, 300], diastolic: [30, 200], value: [10, 900], pulse: [20, 250],
};

export async function POST(req: Request, ctx: Ctx) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId, session);
    if (!guard.ok) return guard.res;
    if (guard.access.role !== "owner") return badRequest("Only the owner can add readings.");

    const b = await body<VitalBody>(req);
    const type = String(b.type ?? "");
    if (!ALLOWED.has(type)) return badRequest("That reading type is not supported.");
    const value = b.value ?? {};
    const nums = Object.entries(value);
    if (!nums.length) return badRequest("Please enter a value.");
    for (const [k, v] of nums) {
      const n = Number(v);
      if (!Number.isFinite(n)) return badRequest("Please enter numbers only.");
      const range = RANGES[k] ?? RANGES.value;
      if (n < range[0] || n > range[1]) return badRequest(`The ${k} value looks out of the possible range.`);
    }
    if (type === "bp" && (value.systolic == null || value.diastolic == null))
      return badRequest("A blood-pressure reading needs both numbers.");
    if (type === "bp" && Number(value.systolic) < Number(value.diastolic))
      return badRequest("The upper number should be higher than the lower number.");

    const ts = b.ts ? new Date(b.ts).toISOString() : nowIso();
    const id = uid("vit");
    insert("vitals", {
      id,
      person_id: personId,
      ts,
      type,
      value_json: JSON.stringify(value),
      unit: b.unit ?? defaultUnit(type),
      source: "typed",
      confirmed: 1,
      held: 0,
      created_at: nowIso(),
    });

    const now = new Date();
    const { outcomes } = runRules(personId, "on_log", now);
    const { created } = processOutcomes(personId, outcomes, now);
    recomputeScore(personId, now);
    upsertDailyFeatures(personId, localDate(now));
    updateBaselines(personId, now);

    return ok({
      saved: { id, type, value, ts },
      alert: created.map((a) => ({
        id: a.id, level: a.level, ruleId: a.rule_id, title: a.title, confidence: a.confidence,
      }))[0] ?? null,
    }, { status: 201 });
  } catch (err) {
    console.error("[vitals.post]", err);
    return serverError();
  }
}

function defaultUnit(type: string): string {
  switch (type) {
    case "bp": return "mmHg";
    case "sugar_fasting":
    case "sugar_random": return "mg/dL";
    case "weight": return "kg";
    case "spo2": return "%";
    case "temp": return "°F";
    case "pulse": return "bpm";
    default: return "";
  }
}

function safeParse(s: string): Record<string, number> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
