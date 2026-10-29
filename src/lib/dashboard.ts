/**
 * Dashboard assembly (PRD 8.1–8.3, 11).
 * One person-scoped call returns everything the home screen renders, so the UI
 * never issues a waterfall of requests and every number comes from one snapshot.
 */

import { all, insert, localDate, nowIso, one, uid } from "./db";
import { ageFrom, loadPersonData, recomputeScore, scoreHistory, upsertDailyFeatures } from "./analysis";
import { listAlerts, type AlertRow } from "./alerts";
import { computePredictions, persistPredictions, listPredictions, daysOfData } from "./predictions";
import { familyScore, bandOf, BAND_WORDS, type Band } from "./score";
import { activeSos, listSos } from "./sos";
import { getPerson } from "./scope";

const DAY = 86400000;

export type SeriesPoint = { date: string; value: number | null };

function rangeSeries(personId: string, days: number) {
  const since = localDate(new Date(Date.now() - days * DAY));
  const rows = all<any>(
    `SELECT date, sleep_hours, mood, activity_minutes, energy, stress FROM daily_features
      WHERE person_id = ? AND date >= ? ORDER BY date ASC`,
    [personId, since],
  );
  const bpRows = all<any>(
    `SELECT ts, value_json FROM vitals WHERE person_id = ? AND type = 'bp' ORDER BY ts ASC`,
    [personId],
  );
  const bpByDate = new Map<string, { sys: number[]; dia: number[] }>();
  for (const r of bpRows) {
    const d = String(r.ts).slice(0, 10);
    try {
      const v = JSON.parse(r.value_json);
      if (typeof v.systolic === "number") {
        if (!bpByDate.has(d)) bpByDate.set(d, { sys: [], dia: [] });
        bpByDate.get(d)!.sys.push(v.systolic);
        if (typeof v.diastolic === "number") bpByDate.get(d)!.dia.push(v.diastolic);
      }
    } catch {
      /* ignore */
    }
  }

  const sleep: SeriesPoint[] = [];
  const mood: SeriesPoint[] = [];
  const activity: SeriesPoint[] = [];
  const systolic: SeriesPoint[] = [];
  const diastolic: SeriesPoint[] = [];
  for (const r of rows) {
    sleep.push({ date: r.date, value: r.sleep_hours ?? null });
    mood.push({ date: r.date, value: r.mood ?? null });
    activity.push({ date: r.date, value: r.activity_minutes ?? null });
    const bps = bpByDate.get(r.date);
    systolic.push({ date: r.date, value: bps && bps.sys.length ? Math.round(bps.sys.reduce((a, b) => a + b, 0) / bps.sys.length) : null });
    diastolic.push({ date: r.date, value: bps && bps.dia.length ? Math.round(bps.dia.reduce((a, b) => a + b, 0) / bps.dia.length) : null });
  }
  return { sleep, mood, activity, systolic, diastolic };
}

function kpis(personId: string) {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const bp = one<any>(
    `SELECT ts, value_json FROM vitals WHERE person_id = ? AND type = 'bp' AND held = 0 ORDER BY ts DESC LIMIT 1`,
    [personId],
  );
  let bpValue: { systolic: number; diastolic: number } | null = null;
  if (bp) {
    try {
      const v = JSON.parse(bp.value_json);
      if (typeof v.systolic === "number") bpValue = { systolic: v.systolic, diastolic: v.diastolic };
    } catch {
      /* ignore */
    }
  }
  const sugar = all<any>(
    `SELECT ts, type, value_json FROM vitals WHERE person_id = ? AND type LIKE 'sugar%' ORDER BY ts DESC LIMIT 4`,
    [personId],
  ).map((s) => {
    let value: number | null = null;
    try {
      value = JSON.parse(s.value_json).value ?? null;
    } catch {
      /* ignore */
    }
    return { ts: s.ts, type: s.type, value };
  });

  const avg = (col: string, days: number) => {
    const sinceDate = localDate(new Date(Date.now() - days * DAY));
    const r = one<{ v: number | null }>(
      `SELECT AVG(${col}) AS v FROM daily_features WHERE person_id = ? AND date >= ? AND ${col} IS NOT NULL`,
      [personId, sinceDate],
    );
    return r?.v == null ? null : Math.round(r.v * 10) / 10;
  };
  const adherence = one<{ taken: number; total: number }>(
    `SELECT SUM(CASE WHEN status='taken' THEN 1 ELSE 0 END) AS taken, COUNT(*) AS total
       FROM medicine_events WHERE person_id = ? AND ts >= ?`,
    [personId, since],
  );

  return {
    bp: bpValue,
    bpAt: bp?.ts ?? null,
    sugar,
    sleepAvg7: avg("sleep_hours", 7),
    moodAvg7: avg("mood", 7),
    activityAvg7: avg("activity_minutes", 7),
    adherencePct: adherence?.total ? Math.round(((adherence.taken ?? 0) / adherence.total) * 100) : null,
    cycle: cycleInfo(personId),
  };
}

/** Cycle context for the female-only KPI (PRD 8.3). */
function cycleInfo(personId: string) {
  const row = one<{ date: string; phase: string | null }>(
    `SELECT date, phase FROM cycle_entries WHERE person_id = ? ORDER BY date DESC LIMIT 1`,
    [personId],
  );
  if (!row) return null;
  const daysSince = Math.max(
    0,
    Math.round((Date.now() - new Date(`${row.date}T00:00:00`).getTime()) / DAY),
  );
  return { lastDate: row.date, phase: row.phase ?? null, daysSince };
}

/** Deterministic insight lines from the person's own data (no LLM, PRD 10.3). */
function buildInsights(personId: string): { id: string; kind: string; text: string }[] {
  const out: { id: string; kind: string; text: string }[] = [];
  const data = loadPersonData(personId);
  const recent = data.journal.slice(-7);
  const sleepVals = recent.map((j) => Number(j.sleepHours)).filter((n) => Number.isFinite(n));
  if (sleepVals.length >= 3) {
    const avg = sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length;
    if (avg < 6) out.push({ id: uid("ins"), kind: "sleep", text: `Sleep has averaged ${avg.toFixed(1)}h over the last week — under the 7h your body likes.` });
    else out.push({ id: uid("ins"), kind: "sleep", text: `Sleep has held at about ${avg.toFixed(1)}h a night this week.` });
  }
  const actVals = all<{ activity_minutes: number | null }>(
    `SELECT activity_minutes FROM daily_features WHERE person_id = ? AND activity_minutes IS NOT NULL ORDER BY date DESC LIMIT 7`,
    [personId],
  ).map((r) => Number(r.activity_minutes)).filter((n) => Number.isFinite(n));
  if (actVals.length >= 3) {
    const avg = Math.round(actVals.reduce((a, b) => a + b, 0) / actVals.length);
    out.push({ id: uid("ins"), kind: "activity", text: avg >= 30 ? `Movement is steady at about ${avg} minutes a day.` : `Movement is light — about ${avg} minutes a day.` });
  }
  const symptomCounts = new Map<string, number>();
  for (const s of data.symptoms.filter((s) => new Date(s.ts).getTime() > Date.now() - 7 * DAY)) {
    symptomCounts.set(s.symptomKey, (symptomCounts.get(s.symptomKey) ?? 0) + 1);
  }
  const top = [...symptomCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) out.push({ id: uid("ins"), kind: "symptom", text: `${top[1]} mentions of ${top[0].replace(/_/g, " ")} this week — worth raising at the next visit.` });
  return out;
}

export async function buildDashboard(personId: string, days = 30) {
  const person = getPerson(personId);
  const score = recomputeScore(personId);
  const history = scoreHistory(personId, days);
  const band: Band = score.status === "ok" ? bandOf(score.score ?? score.raw) : "starting";

  const data = loadPersonData(personId);
  const today = localDate(new Date());
  upsertDailyFeatures(personId, today);

  const alerts = listAlerts(personId, 30);
  const openAlerts = alerts.filter((a) => a.status === "new");

  const predictions = listPredictions(personId);
  if (daysOfData(personId) >= 3) {
    persistPredictions(personId);
  }

  const insights = all<any>(
    `SELECT id, kind, text FROM insights WHERE person_id = ? ORDER BY created_at DESC LIMIT 6`,
    [personId],
  );
  if (!insights.length) {
    for (const i of buildInsights(personId)) {
      insert("insights", { id: i.id, person_id: personId, family_id: null, kind: i.kind, text: i.text, created_at: nowIso() });
      insights.push(i);
    }
  }

  const sharedScores = all<{ id: string }>(
    `SELECT p.id FROM persons p
       JOIN family_members fm ON fm.person_id = p.id AND fm.status = 'active'
      WHERE p.id IN (SELECT subject_person_id FROM sharing_grants WHERE category = 'score' AND granted = 1 AND revoked_at IS NULL)`,
  ).map((r) => {
    const s = recomputeScore(r.id);
    return s.status === "ok" ? s.score ?? s.raw : null;
  }).filter((n): n is number => n !== null);

  const fam = familyScore(sharedScores);

  const daysLogged = daysOfData(personId);
  const streak = computeStreak(personId);

  return {
    person: {
      id: person?.id ?? personId,
      name: person?.name ?? "You",
      age: ageFrom(person?.dob ?? null),
      sex: person?.sex_at_birth ?? null,
      relation: person?.relation_to_owner ?? null,
      isManaged: !!person?.is_managed,
      completeness: person?.completeness ?? 0,
      checkinTime: person?.checkin_time ?? "21:00",
    },
    score: {
      status: score.status,
      value: score.score,
      raw: score.raw,
      band,
      bandWord: BAND_WORDS[band].en,
      bandTone: BAND_WORDS[band].tone,
      penalty: score.penalty,
      penaltyCapped: score.penaltyCapped,
      components: score.components,
      dataComponents: score.dataComponents,
    },
    history: history.map((h) => ({ date: h.date, score: h.score, raw: h.raw_score })),
    series: rangeSeries(personId, 14),
    kpis: kpis(personId),
    alerts: openAlerts.map(publicAlert),
    alertHistory: alerts.slice(0, 10).map(publicAlert),
    predictions: predictions.length ? predictions : listPredictions(personId),
    insights: insights.slice(0, 5),
    familyScore: fam.value,
    familyScoreDetail: fam,
    daysLogged,
    streak,
    sos: {
      active: activeSos(personId) ?? null,
      recent: listSos(personId, 3),
    },
    generatedAt: nowIso(),
  };
}

function computeStreak(personId: string): number {
  const rows = all<{ date: string }>(
    `SELECT DISTINCT date FROM journal_entries WHERE person_id = ? ORDER BY date DESC LIMIT 60`,
    [personId],
  );
  if (!rows.length) return 0;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < rows.length; i++) {
    const expected = localDate(new Date(today.getTime() - i * DAY));
    if (rows[i].date === expected) streak++;
    else if (i === 0 && rows[i].date === localDate(new Date(today.getTime() - DAY))) {
      streak++;
    } else break;
  }
  return streak;
}

export function publicAlert(a: AlertRow) {
  let evidence: Record<string, any> = {};
  try {
    evidence = JSON.parse(a.evidence_json);
  } catch {
    evidence = {};
  }
  return {
    id: a.id,
    level: a.level,
    ruleId: a.rule_id,
    ruleVersion: a.rule_version,
    title: a.title,
    evidence,
    confidence: a.confidence,
    status: a.status,
    createdAt: a.created_at,
    resolvedAt: a.resolved_at,
  };
}
