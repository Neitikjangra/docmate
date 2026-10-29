/**
 * Family feed (PRD 8.2, 9.3).
 * For every member of my family space, return only what that person has shared
 * with the family — nothing else is read from the database.
 */

import { all, boot, one } from "@/lib/db";
import { ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { canSee, resolvePerson } from "@/lib/scope";
import { recomputeScore, scoreHistory } from "@/lib/analysis";
import { listAlerts } from "@/lib/alerts";
import { bandOf, BAND_WORDS } from "@/lib/score";
import { listPredictions } from "@/lib/predictions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();

    const member = one<{ family_id: string }>(
      `SELECT family_id FROM family_members WHERE account_id = ? AND status = 'active' LIMIT 1`,
      [session.accountId],
    );
    if (!member) return ok({ members: [], familyId: null });

    const rows = all<any>(
      `SELECT fm.person_id, fm.relation, fm.role, p.name, p.dob, p.is_managed
         FROM family_members fm JOIN persons p ON p.id = fm.person_id
        WHERE fm.family_id = ? AND fm.status = 'active'
        ORDER BY fm.created_at ASC`,
      [member.family_id],
    );

    const members = rows.map((r) => {
      const access = resolvePerson(r.person_id, session.accountId);
      const isMe =
        all<{ id: string }>(
          `SELECT id FROM persons WHERE id = ? AND (account_id = ? OR claimed_by_account_id = ?)`,
          [r.person_id, session.accountId, session.accountId],
        ).length > 0;

      if (!access) {
        return {
          personId: r.person_id, name: r.name, relation: r.relation, role: r.role,
          isMe, shared: false, categories: [],
          score: null, band: null, bandWord: null, alerts: [], latestVitals: null, insights: [],
          trend: [], predictions: [],
        };
      }
      const score = canSee(access, "score") ? recomputeScore(r.person_id) : null;
      const band = score && score.status === "ok" ? bandOf(score.score ?? score.raw) : "starting";
      const alerts = canSee(access, "alerts")
        ? listAlerts(r.person_id, 20).filter((a) => a.status === "new")
        : [];
      const vitals = canSee(access, "vitals")
        ? all<any>(
            `SELECT type, value_json, unit, ts FROM vitals WHERE person_id = ? ORDER BY ts DESC LIMIT 6`,
            [r.person_id],
          ).map((v) => ({ type: v.type, value: safe(v.value_json), unit: v.unit, ts: v.ts }))
        : [];
      const insights = all<any>(
        `SELECT text, kind FROM insights WHERE person_id = ? ORDER BY created_at DESC LIMIT 2`,
        [r.person_id],
      );
      const trend = canSee(access, "score")
        ? scoreHistory(r.person_id, 14).map((h) => ({ date: h.date, score: h.score }))
        : [];
      const predictions = canSee(access, "family_insights")
        ? listPredictions(r.person_id).map((p: any) => ({
            kind: p.kind, label: p.label ?? p.kind, detail: p.detail ?? "", confidence: p.confidence, urgent: !!p.urgent,
          }))
        : [];

      const isMeOwned = isMe;

      return {
        personId: r.person_id,
        name: r.name,
        relation: r.relation,
        role: r.role,
        isMe: isMeOwned,
        shared: true,
        categories: access.categories.filter((c) => ["score", "alerts", "vitals", "reports", "family_insights"].includes(c)),
        score: score && score.status === "ok" ? score.score : null,
        rawScore: score ? score.raw : null,
        band,
        bandWord: BAND_WORDS[band].en,
        alerts: alerts.map((a) => ({ id: a.id, level: a.level, title: a.title, createdAt: a.created_at })),
        latestVitals: vitals,
        insights: insights.map((i) => ({ text: i.text, kind: i.kind })),
        trend,
        predictions,
      };
    });

    return ok({ familyId: member.family_id, members });
  } catch (err) {
    console.error("[family.feed]", err);
    return serverError();
  }
}

function safe(s: string): Record<string, number> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
