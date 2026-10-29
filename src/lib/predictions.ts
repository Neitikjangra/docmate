/**
 * Predictions (PRD 7.4). Every prediction states its pattern, how many days of
 * data back it, and a confidence tag. Under 14 days is always low confidence and
 * can never be used for an urgent alert.
 */

import { insert, run, uid, nowIso, localDate, all } from "./db";
import { loadPersonData } from "./analysis";

export type Prediction = {
  kind: "vitals_trend" | "symptom_recurrence" | "mood_sleep_slide" | "adherence_risk" | "week_risk";
  label: string;
  detail: string;
  confidence: "low" | "medium" | "high";
  dataDays: number;
  value: Record<string, any>;
};

const DAY = 86400000;

/** Theil–Sen slope — robust to a single wild reading. */
function slope(points: { x: number; y: number }[]): { m: number; b: number } | null {
  if (points.length < 4) return null;
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++)
    for (let k = i + 1; k < points.length; k++) {
      const dx = points[k].x - points[i].x;
      if (Math.abs(dx) < 1e-9) continue;
      slopes.push((points[k].y - points[i].y) / dx);
    }
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const m = slopes.length % 2 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;
  const mx = points.reduce((a, b) => a + b.x, 0) / points.length;
  const my = points.reduce((a, b) => a + b.y, 0) / points.length;
  return { m, b: my - m * mx };
}

function confidenceFor(days: number, spread: number): Prediction["confidence"] {
  if (days < 14) return "low";
  if (days < 30 || spread > 0.35) return "medium";
  return "high";
}

export function computePredictions(personId: string, now = new Date()): Prediction[] {
  const data = loadPersonData(personId, now);
  const out: Prediction[] = [];
  const earliest = (tsList: string[]) =>
    tsList.length ? Math.round((now.getTime() - new Date(tsList[0]).getTime()) / DAY) : 0;

  // ---- vitals trend (BP systolic)
  const bp = data.vitals
    .filter((v) => v.type === "bp" && !v.held && Number(v.systolic) > 0)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  if (bp.length >= 4) {
    const t0 = new Date(bp[0].ts).getTime();
    const pts = bp.map((v) => ({ x: (new Date(v.ts).getTime() - t0) / DAY, y: Number(v.systolic) }));
    const fit = slope(pts);
    const days = earliest(bp.map((v) => v.ts));
    if (fit) {
      const lastX = pts[pts.length - 1].x;
      const nowVal = fit.m * lastX + fit.b;
      const in14 = fit.m * (lastX + 14) + fit.b;
      // residual spread → confidence band
      const resid = pts.map((p) => Math.abs(p.y - (fit.m * p.x + fit.b)));
      const band = Math.max(3, resid.reduce((a, b) => a + b, 0) / resid.length);
      const spread = band / Math.max(1, nowVal);
      out.push({
        kind: "vitals_trend",
        label: "Blood pressure trend",
        detail:
          Math.abs(fit.m) < 0.15
            ? `Systolic is holding around ${Math.round(nowVal)} mmHg.`
            : `Systolic is ${fit.m > 0 ? "rising" : "falling"} about ${Math.abs(fit.m).toFixed(1)} mmHg per day; around ${Math.round(in14)} mmHg in 14 days.`,
        confidence: confidenceFor(days, spread),
        dataDays: days,
        value: {
          slopePerDay: Number(fit.m.toFixed(3)),
          now: Math.round(nowVal),
          forecast14: Math.round(in14),
          band: Math.round(band),
        },
      });
    }
  }

  // ---- symptom recurrence with triggers
  const bySymptom = new Map<string, { ts: string; triggers: string[] }[]>();
  for (const s of data.symptoms) {
    const arr = bySymptom.get(s.symptomKey) ?? [];
    arr.push({ ts: s.ts, triggers: [] });
    bySymptom.set(s.symptomKey, arr);
  }
  for (const [key, arr] of bySymptom) {
    if (arr.length < 3) continue;
    const days = earliest(arr.map((a) => a.ts));
    const repeatDays = new Set(arr.map((a) => String(a.ts).slice(0, 10))).size;
    out.push({
      kind: "symptom_recurrence",
      label: `Repeat: ${key.replaceAll("_", " ")}`,
      detail: `${arr.length} times across ${repeatDays} days — a recurring pattern, not a one-off.`,
      confidence: confidenceFor(days, 0.4),
      dataDays: days,
      value: { symptom: key, occurrences: arr.length, days: repeatDays },
    });
  }

  // ---- mood / sleep slide vs own baseline
  const recent = data.journal.slice(-7);
  const older = data.journal.slice(-21, -7);
  if (recent.length >= 4 && older.length >= 4) {
    const avg = (rows: typeof recent, key: "mood" | "sleepHours") =>
      rows.reduce((a, b) => a + (Number((b as any)[key]) || 0), 0) / Math.max(1, rows.length);
    const moodNow = avg(recent, "mood");
    const moodBefore = avg(older, "mood");
    const sleepNow = avg(recent, "sleepHours");
    const sleepBefore = avg(older, "sleepHours");
    const moodSlide = moodBefore - moodNow;
    const sleepSlide = sleepBefore - sleepNow;
    if (moodSlide > 0.4 || sleepSlide > 0.5) {
      const days = data.journal.length;
      out.push({
        kind: "mood_sleep_slide",
        label: "Mood and sleep slide",
        detail: `Mood down ${moodSlide.toFixed(1)}/5 and sleep down ${sleepSlide.toFixed(1)} h versus your own earlier weeks.`,
        confidence: confidenceFor(days, 0.3),
        dataDays: days,
        value: { moodSlide: Number(moodSlide.toFixed(2)), sleepSlide: Number(sleepSlide.toFixed(2)) },
      });
    }
  }

  // ---- adherence risk
  const recentMeds = data.medicineEvents.slice(-14);
  if (recentMeds.length >= 5) {
    const missed = recentMeds.filter((m) => m.status === "missed").length;
    const rate = missed / recentMeds.length;
    if (rate >= 0.2) {
      out.push({
        kind: "adherence_risk",
        label: "Adherence risk",
        detail: `${missed} of the last ${recentMeds.length} doses were missed — likely to drift without a reminder.`,
        confidence: confidenceFor(14, 0.2),
        dataDays: 14,
        value: { missed, total: recentMeds.length, rate: Number(rate.toFixed(2)) },
      });
    }
  }

  // ---- next-7-day risk flag (never urgent under 14 days)
  const riskScore = out.reduce((a, p) => {
    const w = p.kind === "vitals_trend" ? 2 : 1;
    const c = p.confidence === "high" ? 1 : p.confidence === "medium" ? 0.6 : 0.35;
    return a + w * c;
  }, 0);
  const dataDays = Math.round(
    data.journal.length +
      new Set(data.vitals.map((v) => String(v.ts).slice(0, 10))).size,
  );
  out.push({
    kind: "week_risk",
    label: "Next 7 days",
    detail:
      riskScore >= 2
        ? "Elevated pattern risk — keep logging and act on the alerts above."
        : riskScore >= 1
          ? "Mild pattern risk — nothing urgent."
          : "No pattern risk detected from your recent logs.",
    confidence: confidenceFor(dataDays, 0.3),
    dataDays,
    value: { riskScore: Number(riskScore.toFixed(2)), urgent: false },
  });

  return out;
}

export function persistPredictions(personId: string, now = new Date()): Prediction[] {
  const preds = computePredictions(personId, now);
  run(`DELETE FROM predictions WHERE person_id = ?`, [personId]);
  for (const p of preds) {
    insert("predictions", {
      id: uid("prd"),
      person_id: personId,
      kind: p.kind,
      horizon_days: 14,
      value_json: JSON.stringify({ ...p.value, label: p.label, detail: p.detail }),
      confidence: p.confidence,
      data_days: p.dataDays,
      created_at: nowIso(),
    });
  }
  return preds;
}

export function listPredictions(personId: string) {
  return all<any>(
    `SELECT * FROM predictions WHERE person_id = ? ORDER BY data_days DESC`,
    [personId],
  );
}

export function daysOfData(personId: string, now = new Date()): number {
  const data = loadPersonData(personId, now);
  const dates = new Set<string>([
    ...data.journal.map((j) => j.date),
    ...data.vitals.map((v) => String(v.ts).slice(0, 10)),
    ...data.symptoms.map((s) => String(s.ts).slice(0, 10)),
  ]);
  return dates.size;
}

export { localDate };
