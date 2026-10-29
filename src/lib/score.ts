/**
 * Health score engine (PRD 11).
 * Pure functions — no DB access — so the golden tests can pin exact numbers.
 *
 *   H = 100 · Σwᵢcᵢ / Σwᵢ  −  P        clamped to 0..100
 *   F = 0.7 · mean(H_shared) + 0.3 · min(H_shared)
 *
 * Red is never used for a score (PRD 11.2): the band words below are the only
 * labels the UI may render.
 */

export type Band = "starting" | "steady" | "okay" | "slipping" | "attention";

export const WEIGHTS: Record<string, number> = {
  vitals: 0.3,
  sleep: 0.2,
  mood: 0.2,
  activity: 0.15,
  adherence: 0.15,
};

export const WINDOWS: Record<string, number> = {
  vitals: 14,
  sleep: 7,
  mood: 7,
  activity: 7,
  adherence: 7,
};

/** Penalty added for an unresolved alert of each level (PRD 11.1). */
export const PENALTY_BY_LEVEL: Record<number, number> = { 2: 3, 3: 8, 4: 20 };
export const PENALTY_CAP = 25;
export const EMA_ALPHA = 0.5;

export type ScoreComponent = {
  key: string;
  label: string;
  weight: number;
  quality: number; // 0..1
  windowDays: number;
  n: number;
};

export type ScoreInput = {
  vitals: {
    ts: string;
    type: string;
    systolic?: number | null;
    diastolic?: number | null;
    value?: number | null;
    held?: number | boolean;
  }[];
  journal: {
    date: string;
    sleepHours?: number | null;
    mood?: number | null;
    energy?: number | null;
    activityMinutes?: number | null;
    stress?: number | null;
  }[];
  medicineEvents: { ts: string; status: string }[];
  distress: { ts: string; value: number }[];
  alerts: { level: number; created_at: string; status?: string }[];
  now: Date;
};

export type ScoreResult = {
  status: "starting" | "ok";
  score: number | null; // smoothed display score (null when starting)
  raw: number; // unsmoothed score
  penalty: number;
  penaltyCapped: boolean;
  components: ScoreComponent[];
  dataComponents: number;
};

const DAY = 86400000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const ts = (v: string) => new Date(v).getTime();
const dayStart = (d: string) => new Date(d + "T00:00:00").getTime();

// --------------------------------------------------------------- component c

export function qualityVitals(rows: ScoreInput["vitals"]): { q: number; n: number } {
  const qs: number[] = [];
  for (const r of rows) {
    if (r.held) continue;
    if (r.type === "bp") {
      const sys = Number(r.systolic);
      const dia = Number(r.diastolic);
      if (!Number.isFinite(sys)) continue;
      let q: number;
      if (sys >= 180 || dia >= 120) q = 0.08;
      else if (sys >= 160 || dia >= 100) q = 0.25;
      else if (sys >= 140 || dia >= 90) q = 0.5;
      else if (sys >= 130 || dia >= 85) q = 0.8;
      else if (sys >= 90) q = 1;
      else q = 0.7; // hypotensive
      qs.push(q);
    } else if (r.type.startsWith("sugar")) {
      const v = Number(r.value);
      if (!Number.isFinite(v)) continue;
      const fasting = r.type === "sugar_fasting";
      const lo = fasting ? 80 : 80;
      const hi = fasting ? 110 : 160;
      if (v < 70) qs.push(0.15);
      else if (v < lo) qs.push(0.7);
      else if (v <= hi) qs.push(1);
      else if (v <= (fasting ? 140 : 200)) qs.push(0.55);
      else qs.push(0.25);
    } else if (r.type === "spo2") {
      const v = Number(r.value);
      if (!Number.isFinite(v)) continue;
      qs.push(v >= 95 ? 1 : v >= 92 ? 0.6 : 0.25);
    } else if (r.type === "weight") {
      qs.push(1); // neutral: weight alone is not a risk signal
    } else if (r.type === "temp") {
      const v = Number(r.value);
      if (!Number.isFinite(v)) continue;
      qs.push(v >= 97 && v <= 99.5 ? 1 : v <= 100.4 ? 0.6 : 0.25);
    }
  }
  if (!qs.length) return { q: 0, n: 0 };
  return { q: qs.reduce((a, b) => a + b, 0) / qs.length, n: qs.length };
}

export function qualitySleep(rows: ScoreInput["journal"]): { q: number; n: number } {
  const hrs = rows.map((r) => r.sleepHours).filter((h): h is number => typeof h === "number");
  if (!hrs.length) return { q: 0, n: 0 };
  const qs = hrs.map((h) => {
    if (h >= 7 && h <= 9) return 1;
    if (h >= 6) return 0.8;
    if (h >= 5) return 0.55;
    if (h >= 4) return 0.35;
    return 0.2;
  });
  return { q: qs.reduce((a, b) => a + b, 0) / qs.length, n: hrs.length };
}

export function qualityMood(
  rows: ScoreInput["journal"],
  distress: ScoreInput["distress"],
): { q: number; n: number } {
  const moods = rows.map((r) => r.mood).filter((m): m is number => typeof m === "number");
  const moodNorm = moods.length
    ? moods.reduce((a, b) => a + clamp01((b - 1) / 4), 0) / moods.length
    : null;
  const dNorm = distress.length
    ? distress.reduce((a, b) => a + (1 - clamp01(b.value / 100)), 0) / distress.length
    : null;
  if (moodNorm === null && dNorm === null) return { q: 0, n: 0 };
  if (moodNorm !== null && dNorm !== null) return { q: 0.7 * moodNorm + 0.3 * dNorm, n: moods.length };
  return { q: (moodNorm ?? dNorm)!, n: moods.length || distress.length };
}

export function qualityActivity(rows: ScoreInput["journal"]): { q: number; n: number } {
  const mins = rows.map((r) => r.activityMinutes).filter((m): m is number => typeof m === "number");
  if (!mins.length) return { q: 0, n: 0 };
  const qs = mins.map((m) => clamp01(m / 30));
  return { q: qs.reduce((a, b) => a + b, 0) / qs.length, n: mins.length };
}

export function qualityAdherence(events: ScoreInput["medicineEvents"]): { q: number; n: number } {
  if (!events.length) return { q: 0, n: 0 };
  const taken = events.filter((e) => e.status === "taken").length;
  return { q: clamp01(taken / events.length), n: events.length };
}

export function computePenalty(alerts: ScoreInput["alerts"], now: Date): { p: number; capped: boolean } {
  const cutoff = now.getTime() - 7 * DAY;
  let p = 0;
  for (const a of alerts) {
    if (a.status && a.status !== "new" && a.status !== "open") continue;
    if (ts(a.created_at) < cutoff) continue;
    p += PENALTY_BY_LEVEL[a.level] ?? 0;
  }
  if (p > PENALTY_CAP) return { p: PENALTY_CAP, capped: true };
  return { p, capped: false };
}

export function computeScore(input: ScoreInput): ScoreResult {
  const now = input.now;
  const w = (days: number) => now.getTime() - days * DAY;

  const vitals = qualityVitals(input.vitals.filter((v) => ts(v.ts) >= w(WINDOWS.vitals)));
  const sleep = qualitySleep(
    input.journal.filter((j) => dayStart(j.date) >= w(WINDOWS.sleep)),
  );
  const mood = qualityMood(
    input.journal.filter((j) => dayStart(j.date) >= w(WINDOWS.mood)),
    input.distress.filter((d) => ts(d.ts) >= w(WINDOWS.mood)),
  );
  const activity = qualityActivity(
    input.journal.filter((j) => dayStart(j.date) >= w(WINDOWS.activity)),
  );
  const adherence = qualityAdherence(
    input.medicineEvents.filter((m) => ts(m.ts) >= w(WINDOWS.adherence)),
  );

  const parts: ScoreComponent[] = [
    { key: "vitals", label: "Vitals", weight: WEIGHTS.vitals, quality: vitals.q, windowDays: WINDOWS.vitals, n: vitals.n },
    { key: "sleep", label: "Sleep", weight: WEIGHTS.sleep, quality: sleep.q, windowDays: WINDOWS.sleep, n: sleep.n },
    { key: "mood", label: "Mood & voice", weight: WEIGHTS.mood, quality: mood.q, windowDays: WINDOWS.mood, n: mood.n },
    { key: "activity", label: "Activity", weight: WEIGHTS.activity, quality: activity.q, windowDays: WINDOWS.activity, n: activity.n },
    { key: "adherence", label: "Medicine adherence", weight: WEIGHTS.adherence, quality: adherence.q, windowDays: WINDOWS.adherence, n: adherence.n },
  ];

  const dataComponents = parts.filter((p) => p.n > 0);
  const { p: penalty, capped } = computePenalty(input.alerts, now);

  if (dataComponents.length < 2) {
    return {
      status: "starting",
      score: null,
      raw: 0,
      penalty,
      penaltyCapped: capped,
      components: parts,
      dataComponents: dataComponents.length,
    };
  }

  const wsum = dataComponents.reduce((a, b) => a + b.weight, 0);
  const weighted = dataComponents.reduce((a, b) => a + b.weight * b.quality, 0);
  const raw = clamp100(100 * (weighted / wsum) - penalty);

  return {
    status: "ok",
    score: raw,
    raw,
    penalty,
    penaltyCapped: capped,
    components: parts,
    dataComponents: dataComponents.length,
  };
}

/** 3-day EMA over per-day raw scores; the latest entry may bypass smoothing (L4). */
export function smoothSeries(raws: number[], alpha = EMA_ALPHA): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (const r of raws) {
    const v: number = prev === null ? r : alpha * r + (1 - alpha) * prev;
    out.push(Math.round(v * 10) / 10);
    prev = v;
  }
  return out;
}

export function bandOf(score: number | null): Band {
  if (score === null) return "starting";
  if (score >= 80) return "steady";
  if (score >= 60) return "okay";
  if (score >= 40) return "slipping";
  return "attention";
}

export const BAND_WORDS: Record<Band, { en: string; tone: string }> = {
  starting: { en: "Starting", tone: "muted" },
  steady: { en: "Steady", tone: "mint" },
  okay: { en: "Okay, keep watching", tone: "mint-soft" },
  slipping: { en: "Slipping", tone: "terracotta" },
  attention: { en: "Needs attention", tone: "terracotta-strong" },
};

/** Family score: 0.7·mean + 0.3·min. A single sharer means F = that score. */
export function familyScore(scores: (number | null)[]): {
  value: number | null;
  members: number;
  lowest: number | null;
  mean: number | null;
} {
  const val = scores.filter((s): s is number => typeof s === "number");
  if (!val.length) return { value: null, members: 0, lowest: null, mean: null };
  const mean = val.reduce((a, b) => a + b, 0) / val.length;
  const min = Math.min(...val);
  const value = val.length === 1 ? val[0] : 0.7 * mean + 0.3 * min;
  return { value: Math.round(value * 10) / 10, members: val.length, lowest: min, mean: Math.round(mean * 10) / 10 };
}
