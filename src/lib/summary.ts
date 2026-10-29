/**
 * 30-day consented summary assembly (PRD 10.2, 12.2).
 * Only the categories the viewer is allowed to see end up in the payload —
 * the same object feeds the on-screen view and the PDF.
 */

import { all, j, localDate, nowIso, one } from "./db";
import { ageFrom, recomputeScore, scoreHistory } from "./analysis";
import { listAlerts } from "./alerts";
import { listPredictions } from "./predictions";
import { bandOf, BAND_WORDS } from "./score";
import type { SummaryInput } from "./pdf";

export type SummaryPayload = SummaryInput & {
  personId: string;
  allowed: string[];
  omitted: string[];
  physicianNote: string;
};

const RANGE_DAYS = 30;

export function buildSummary(
  personId: string,
  allowed: string[],
  opts?: { fromDays?: number },
): SummaryPayload | null {
  const person = one<any>(`SELECT * FROM persons WHERE id = ?`, [personId]);
  if (!person) return null;

  const days = opts?.fromDays ?? RANGE_DAYS;
  const now = new Date();
  const rangeTo = localDate(now);
  const rangeFrom = localDate(new Date(now.getTime() - days * 86400000));
  const sinceIso = new Date(now.getTime() - days * 86400000).toISOString();

  const allow = (c: string) => allowed.includes(c);
  const omitted: string[] = [];

  const scoreResult = recomputeScore(personId, now);
  const band = scoreResult.status === "ok" ? bandOf(scoreResult.score ?? scoreResult.raw) : "starting";
  const history = scoreHistory(personId, days);

  const conditions = all<{ name: string }>(`SELECT name FROM conditions WHERE person_id = ?`, [personId]).map(
    (c) => c.name,
  );
  const medicines = all<{ name: string; dosage_text: string | null }>(
    `SELECT name, dosage_text FROM medicines WHERE person_id = ? AND active = 1`,
    [personId],
  ).map((m) => (m.dosage_text ? `${m.name} (${m.dosage_text})` : m.name));

  const vitalRows = allow("vitals")
    ? all<any>(
        `SELECT type, value_json, unit, ts FROM vitals WHERE person_id = ? AND ts >= ? ORDER BY ts DESC LIMIT 40`,
        [personId, sinceIso],
      )
    : [];
  if (!allow("vitals")) omitted.push("vitals");

  const vitals = vitalRows.map((v) => {
    const val = j<Record<string, number>>(v.value_json, {});
    const label = v.type === "bp" ? "BP" : v.type.replace(/_/g, " ");
    const value = v.type === "bp" ? `${val.systolic}/${val.diastolic}` : `${val.value ?? ""}`;
    return { label, value: `${value} ${v.unit ?? ""}`.trim(), date: String(v.ts).slice(0, 10) };
  });

  const symptomAgg = allow("journal_summaries")
    ? all<{ symptom: string; c: number; last: string }>(
        `SELECT symptom, COUNT(*) AS c, MAX(ts) AS last FROM symptoms
          WHERE person_id = ? AND ts >= ? GROUP BY symptom ORDER BY c DESC LIMIT 8`,
        [personId, sinceIso],
      )
    : [];
  if (!allow("journal_summaries")) omitted.push("journal_summaries");

  const alerts = allow("alerts")
    ? listAlerts(personId, 20)
        .filter((a) => new Date(a.created_at).getTime() >= now.getTime() - days * 86400000)
        .map((a) => ({ level: a.level, title: a.title, ruleId: a.rule_id, date: String(a.created_at).slice(0, 10) }))
    : [];
  if (!allow("alerts")) omitted.push("alerts");

  const predictions = allow("score")
    ? listPredictions(personId).map((p: any) => ({
        label: p.label ?? p.kind.replace(/_/g, " "),
        detail: p.detail ?? "",
        confidence: p.confidence,
        dataDays: p.dataDays ?? p.data_days ?? 0,
      }))
    : [];
  if (!allow("score")) omitted.push("score");

  const components = allow("score")
    ? scoreResult.components.map((c) => ({ label: c.label, quality: c.quality, weight: c.weight }))
    : [];

  const spanDays = history.length;

  return {
    personId,
    personName: person.name,
    ageYears: ageFrom(person.dob),
    sexAtBirth: person.sex_at_birth,
    conditions,
    medicines,
    rangeFrom,
    rangeTo,
    score: allow("score") && scoreResult.status === "ok" ? scoreResult.score : null,
    bandWord: BAND_WORDS[band].en,
    components,
    vitals,
    symptoms: symptomAgg.map((s) => ({ label: s.symptom.replace(/_/g, " "), count: s.c, last: String(s.last).slice(0, 10) })),
    alerts,
    predictions,
    categories: allowed,
    generatedAt: nowIso(),
    allowed,
    omitted,
    physicianNote:
      `Prepared by Docmate from ${spanDays} days of self-reported voice and typed logs. ` +
      `Not a diagnosis. Please confirm with the patient before acting.`,
  };
}

export { RANGE_DAYS };
