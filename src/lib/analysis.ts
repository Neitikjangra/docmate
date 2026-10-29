/**
 * Analysis layer: assembles one person's data into the pure shapes the rule and
 * score engines expect, runs them, and persists scores + daily features.
 * This is the only bridge between SQLite and the deterministic engines.
 */

import { all, insert, j, localDate, nowIso, one, run, uid } from "./db";
import rulesJson from "./rules/rules.json";
import {
  evaluateRules,
  type JournalRow,
  type MedRow,
  type PersonData,
  type RuleDef,
  type RuleOutcome,
  type SymptomRow,
  type VitalRow,
} from "./rules/engine";
import { computeScore, type ScoreResult } from "./score";
import { SYMPTOM_BY_KEY } from "./nlu/lexicon";

export type PersonRowLite = {
  id: string;
  name: string;
  dob: string | null;
  sex_at_birth: string | null;
};

const DAY = 86400000;

export function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * DAY));
}

/** Rule definitions: the seeded table is the source of truth, JSON is the seed. */
export function loadRuleDefs(): RuleDef[] {
  const rows = all<{ id: string; definition_json: string; active: number }>(
    `SELECT id, definition_json, active FROM rules`,
  );
  if (rows.length) {
    return rows
      .map((r) => {
        const def = j<RuleDef>(r.definition_json, {} as RuleDef);
        return { ...def, active: !!r.active && def.active !== false };
      })
      .filter((r) => r && r.id);
  }
  return rulesJson as unknown as RuleDef[];
}

export function loadPersonData(personId: string, now = new Date()): PersonData {
  const person = one<PersonRowLite>(`SELECT id, name, dob, sex_at_birth FROM persons WHERE id = ?`, [
    personId,
  ]);
  const sinceIso = new Date(now.getTime() - 150 * DAY).toISOString();
  const sinceDate = localDate(new Date(now.getTime() - 150 * DAY));

  const conditions = all<{ name: string }>(`SELECT name FROM conditions WHERE person_id = ?`, [
    personId,
  ]).map((c) => c.name);

  const vitals: VitalRow[] = all<any>(
    `SELECT * FROM vitals WHERE person_id = ? AND ts >= ? ORDER BY ts ASC`,
    [personId, sinceIso],
  ).map((r) => {
    const v = j<Record<string, number>>(r.value_json, {});
    return {
      id: r.id,
      ts: r.ts,
      type: r.type,
      systolic: v.systolic ?? null,
      diastolic: v.diastolic ?? null,
      value: v.value ?? v.weight ?? null,
      held: r.held,
      confirmed: r.confirmed,
    };
  });

  const symptomRows = all<any>(
    `SELECT * FROM symptoms WHERE person_id = ? AND ts >= ? ORDER BY ts ASC`,
    [personId, sinceIso],
  );
  const symptoms: SymptomRow[] = symptomRows.map((r) => ({
    id: r.id,
    ts: r.ts,
    symptomKey: r.symptom,
    label: SYMPTOM_BY_KEY[r.symptom]?.label ?? r.severity_words ?? r.symptom,
    redFlag: !!r.red_flag,
  }));
  const appetiteDays = new Set(
    symptomRows.filter((r) => r.symptom === "appetite_loss").map((r) => String(r.ts).slice(0, 10)),
  );

  const journal: JournalRow[] = all<any>(
    `SELECT * FROM journal_entries WHERE person_id = ? AND date >= ? ORDER BY date ASC`,
    [personId, sinceDate],
  ).map((r) => ({
    date: r.date,
    mood: r.mood,
    energy: r.energy,
    sleepHours: r.sleep_hours,
    stress: r.stress,
    appetiteLoss: appetiteDays.has(r.date),
    distress: null,
  }));

  const medicineEvents: MedRow[] = all<any>(
    `SELECT * FROM medicine_events WHERE person_id = ? AND ts >= ? ORDER BY ts ASC`,
    [personId, sinceIso],
  ).map((r) => ({ ts: r.ts, name: r.name, status: r.status }));

  const distress = all<any>(
    `SELECT * FROM acoustic_features WHERE person_id = ? AND created_at >= ? ORDER BY created_at ASC`,
    [personId, sinceIso],
  ).map((r) => ({ ts: r.created_at, value: r.distress_0_100 }));

  const baselines: PersonData["baselines"] = {};
  for (const b of all<any>(`SELECT * FROM baselines WHERE person_id = ?`, [personId])) {
    baselines[b.signal] = { median: b.median, spread: b.spread, n: b.n };
  }

  return {
    personId,
    name: person?.name ?? "You",
    ageYears: ageFrom(person?.dob ?? null),
    sexAtBirth: person?.sex_at_birth ?? null,
    conditions,
    vitals,
    symptoms,
    journal,
    medicineEvents,
    distress,
    baselines,
    now,
  };
}

export function runRules(personId: string, mode: "on_log" | "nightly" = "nightly", now = new Date()) {
  const data = loadPersonData(personId, now);
  const rules = loadRuleDefs();
  const outcomes = evaluateRules(data, rules, mode);
  return { data, outcomes };
}

// -------------------------------------------------------------- score + cache

function scoreInput(personId: string, now: Date) {
  const data = loadPersonData(personId, now);
  const alerts = all<any>(
    `SELECT level, created_at, status FROM alerts WHERE person_id = ? AND created_at >= ?`,
    [personId, new Date(now.getTime() - 8 * DAY).toISOString()],
  );
  return { data, alerts };
}

export function recomputeScore(personId: string, now = new Date()): ScoreResult {
  const { data, alerts } = scoreInput(personId, now);
  const prev = all<{ raw_score: number; date: string }>(
    `SELECT raw_score, date FROM health_scores WHERE person_id = ? ORDER BY date DESC LIMIT 2`,
    [personId],
  );
  const rawResult = computeScore({
    vitals: data.vitals,
    journal: data.journal,
    medicineEvents: data.medicineEvents,
    distress: data.distress,
    alerts,
    now,
  });

  let display = rawResult.raw;
  if (rawResult.status === "ok") {
    // 3-day EMA over raw scores (L4 bypasses smoothing — PRD 11.2).
    const hasL4 = alerts.some((a) => a.level === 4 && a.status === "new");
    if (!hasL4 && prev.length) {
      const hist = [rawResult.raw, ...prev.map((p) => p.raw_score)];
      display = rawResult.raw;
      let acc = rawResult.raw;
      for (let i = 1; i < hist.length; i++) acc = 0.5 * hist[i] + 0.5 * acc;
      display = Math.round(acc * 10) / 10;
    }
    display = Math.round(display * 10) / 10;
  }

  const result: ScoreResult = { ...rawResult, score: rawResult.status === "ok" ? display : null };

  const date = localDate(now);
  const existing = one<{ id: string }>(
    `SELECT id FROM health_scores WHERE person_id = ? AND date = ?`,
    [personId, date],
  );
  const row = {
    id: existing?.id ?? uid("hs"),
    person_id: personId,
    date,
    score: result.score ?? 0,
    raw_score: result.raw,
    components_json: JSON.stringify(result.components),
    penalty: result.penalty,
    rule_version: "1.0.0",
    created_at: nowIso(),
  };
  if (existing) {
    run(
      `UPDATE health_scores SET score=?, raw_score=?, components_json=?, penalty=?, rule_version=?, created_at=? WHERE id=?`,
      [row.score, row.raw_score, row.components_json, row.penalty, row.rule_version, row.created_at, row.id],
    );
  } else {
    insert("health_scores", row);
  }

  return result;
}

export function scoreHistory(personId: string, days = 30) {
  const since = localDate(new Date(Date.now() - days * DAY));
  return all<any>(
    `SELECT date, score, raw_score, penalty, components_json FROM health_scores
      WHERE person_id = ? AND date >= ? ORDER BY date ASC`,
    [personId, since],
  );
}

export function upsertDailyFeatures(personId: string, date: string): void {
  const jr = one<any>(`SELECT * FROM journal_entries WHERE person_id = ? AND date = ?`, [
    personId,
    date,
  ]);
  const dayStartIso = date + "T00:00:00.000Z";
  const dayEndIso = date + "T23:59:59.999Z";
  const symptomCount =
    one<{ c: number }>(
      `SELECT COUNT(*) AS c FROM symptoms WHERE person_id = ? AND ts >= ? AND ts <= ?`,
      [personId, dayStartIso, dayEndIso],
    )?.c ?? 0;
  const vitalRows = all<any>(
    `SELECT type, value_json FROM vitals WHERE person_id = ? AND ts >= ? AND ts <= ?`,
    [personId, dayStartIso, dayEndIso],
  );
  const distressRow = one<{ d: number | null }>(
    `SELECT AVG(distress_0_100) AS d FROM acoustic_features WHERE person_id = ? AND created_at >= ? AND created_at <= ?`,
    [personId, dayStartIso, dayEndIso],
  );
  const adherence = one<{ taken: number; total: number }>(
    `SELECT SUM(CASE WHEN status='taken' THEN 1 ELSE 0 END) AS taken, COUNT(*) AS total
       FROM medicine_events WHERE person_id = ? AND ts >= ? AND ts <= ?`,
    [personId, dayStartIso, dayEndIso],
  );

  const row = {
    person_id: personId,
    date,
    sleep_hours: jr?.sleep_hours ?? null,
    mood: jr?.mood ?? null,
    energy: jr?.energy ?? null,
    stress: jr?.stress ?? null,
    activity_minutes: jr?.activity_minutes ?? null,
    adherence: adherence?.total ? adherence.taken / adherence.total : null,
    symptom_count: symptomCount,
    vitals_json: JSON.stringify(vitalRows),
    distress: distressRow?.d ?? null,
    features_json: JSON.stringify({ source: "daily" }),
    updated_at: nowIso(),
  };
  const existing = one<{ person_id: string }>(
    `SELECT person_id FROM daily_features WHERE person_id = ? AND date = ?`,
    [personId, date],
  );
  if (existing) {
    run(
      `UPDATE daily_features SET sleep_hours=?, mood=?, energy=?, stress=?, activity_minutes=?, adherence=?,
        symptom_count=?, vitals_json=?, distress=?, features_json=?, updated_at=? WHERE person_id=? AND date=?`,
      [
        row.sleep_hours, row.mood, row.energy, row.stress, row.activity_minutes, row.adherence,
        row.symptom_count, row.vitals_json, row.distress, row.features_json, row.updated_at,
        personId, date,
      ],
    );
  } else {
    insert("daily_features", row);
  }
}

/** Recompute baselines (median/spread) after enough logs (PRD 6.2). */
export function updateBaselines(personId: string, now = new Date()): void {
  const data = loadPersonData(personId, now);
  const series: Record<string, number[]> = {
    bp_systolic: data.vitals.filter((v) => v.type === "bp" && !v.held).map((v) => Number(v.systolic)),
    sugar_fasting: data.vitals.filter((v) => v.type === "sugar_fasting").map((v) => Number(v.value)),
    distress: data.distress.map((d) => d.value),
    sleep: data.journal.map((j) => Number(j.sleepHours)).filter((n) => Number.isFinite(n)),
    mood: data.journal.map((j) => Number(j.mood)).filter((n) => Number.isFinite(n)),
  };
  for (const [signal, values] of Object.entries(series)) {
    const vals = values.filter((v) => Number.isFinite(v));
    if (vals.length < 3) continue;
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const spread = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    const existing = one<{ signal: string }>(
      `SELECT signal FROM baselines WHERE person_id = ? AND signal = ?`,
      [personId, signal],
    );
    if (existing) {
      run(`UPDATE baselines SET median=?, spread=?, n=?, updated_at=? WHERE person_id=? AND signal=?`, [
        median, spread, vals.length, nowIso(), personId, signal,
      ]);
    } else {
      insert("baselines", {
        person_id: personId,
        signal,
        median,
        spread,
        n: vals.length,
        updated_at: nowIso(),
      });
    }
  }
}
