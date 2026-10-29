/**
 * Deterministic, data-driven rule engine (PRD 8.2, 11.3).
 * Thresholds live in rules.json / the `rules` table — never hard-coded here.
 * The engine is a pure function over one person's data so it can be unit-tested.
 */

export type Confidence = "low" | "medium" | "high";

export type RuleDef = {
  id: string;
  version: string;
  title: string;
  evaluator: string;
  level: number;
  active: boolean;
  params: Record<string, any>;
  minData?: Record<string, number>;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
};

export type VitalRow = {
  id: string;
  ts: string;
  type: string;
  systolic?: number | null;
  diastolic?: number | null;
  value?: number | null;
  held?: number | boolean;
  confirmed?: number | boolean;
};

export type SymptomRow = {
  id: string;
  ts: string;
  symptomKey: string;
  label: string;
  redFlag: boolean;
};

export type JournalRow = {
  date: string;
  mood: number | null;
  energy: number | null;
  sleepHours: number | null;
  stress: number | null;
  appetiteLoss?: boolean;
  distress?: number | null;
};

export type MedRow = { ts: string; name: string | null; status: "taken" | "missed" };

export type PersonData = {
  personId: string;
  name: string;
  ageYears: number | null;
  sexAtBirth: string | null;
  conditions: string[];
  vitals: VitalRow[];
  symptoms: SymptomRow[];
  journal: JournalRow[];
  medicineEvents: MedRow[];
  distress: { ts: string; value: number }[];
  baselines: Record<string, { median: number | null; spread: number | null; n: number }>;
  now: Date;
};

export type RuleOutcome = {
  ruleId: string;
  ruleVersion: string;
  level: number;
  title: string;
  confidence: Confidence;
  evidence: Record<string, any>;
  dedupeKey: string;
  dataDays: number;
};

const DAY = 86400000;
const HOUR = 3600000;

function since(days: number, now: Date): number {
  return now.getTime() - days * DAY;
}
function sinceHours(h: number, now: Date): number {
  return now.getTime() - h * HOUR;
}
function ts(v: string | Date): number {
  return new Date(v).getTime();
}
function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function rising(series: number[], minStep = 0): boolean {
  if (series.length < 2) return false;
  for (let i = 1; i < series.length; i++) if (series[i] - series[i - 1] <= minStep) return false;
  return true;
}
function dayKey(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function hasCondition(data: PersonData, names: string[]): boolean {
  return data.conditions.some((c) => names.some((n) => c.toLowerCase().includes(n)));
}

function messagesForText(key: string, params: Record<string, any>) {
  return { key, params };
}

/** BP trend over a window: median(second half) - median(first half). */
function bpRise(data: PersonData, days: number): number | null {
  const cutoff = since(days, data.now);
  const rows = data.vitals
    .filter((v) => v.type === "bp" && ts(v.ts) >= cutoff && !v.held)
    .sort((a, b) => ts(a.ts) - ts(b.ts));
  if (rows.length < 4) return null;
  const half = Math.floor(rows.length / 2);
  const first = median(rows.slice(0, half).map((r) => Number(r.systolic)));
  const second = median(rows.slice(half).map((r) => Number(r.systolic)));
  if (first === null || second === null) return null;
  return second - first;
}

type Evaluator = (data: PersonData, rule: RuleDef) => RuleOutcome | null;

const EVALUATORS: Record<string, Evaluator> = {
  // ---------------------------------------------------------------- BP-01
  bp_emergency(data, rule) {
    const p = rule.params;
    const rows = data.vitals
      .filter(
        (v) => v.type === "bp" && !v.held && ts(v.ts) >= since(p.validationDays ?? 7, data.now),
      )
      .sort((a, b) => ts(b.ts) - ts(a.ts));

    const emergency = rows.find(
      (r) => Number(r.systolic) >= p.sysThreshold && Number(r.diastolic) >= p.diaThreshold,
    );
    if (emergency) {
      const nearbySymptom = data.symptoms.find(
        (s) =>
          Math.abs(ts(s.ts) - ts(emergency.ts)) <= (p.symptomWindowHours ?? 36) * HOUR,
      );
      if (!p.requiresSymptom || nearbySymptom) {
        return {
          ruleId: rule.id,
          ruleVersion: rule.version,
          level: rule.level,
          title: rule.title,
          confidence: "high",
          dataDays: p.validationDays ?? 7,
          dedupeKey: `${rule.id}:${dayKey(data.now)}`,
          evidence: {
            reading: {
              ts: emergency.ts,
              systolic: emergency.systolic,
              diastolic: emergency.diastolic,
            },
            symptom: nearbySymptom
              ? { ts: nearbySymptom.ts, label: nearbySymptom.label }
              : null,
            threshold: `${p.sysThreshold}/${p.diaThreshold} mmHg`,
          },
        };
      }
    }

    if (p.requiresHypertension && !hasCondition(data, ["hypertension", "blood pressure", "bp", "रक्तचाप"])) {
      return null;
    }
    const window = rows.filter((r) => ts(r.ts) >= since(p.sustainedDays, data.now));
    const high = window.filter(
      (r) => Number(r.systolic) >= p.sustainedSys || Number(r.diastolic) >= p.sustainedDia,
    );
    if (high.length >= p.sustainedReadings) {
      return {
        ruleId: rule.id,
        ruleVersion: rule.version,
        level: p.sustainedLevel ?? 3,
        title: `${rule.title} — sustained`,
        confidence: "high",
        dataDays: p.sustainedDays,
        dedupeKey: `${rule.id}:sustained:${dayKey(data.now)}`,
        evidence: {
          readings: high.map((r) => ({
            ts: r.ts,
            systolic: r.systolic,
            diastolic: r.diastolic,
          })),
          threshold: `>= ${p.sustainedSys}/${p.sustainedDia} mmHg`,
          windowDays: p.sustainedDays,
        },
      };
    }
    return null;
  },

  // ---------------------------------------------------------------- SUG-01
  sugar_rising(data, rule) {
    const p = rule.params;
    const rows = data.vitals
      .filter(
        (v) =>
          v.type === "sugar_fasting" && !v.held && ts(v.ts) >= since(p.days ?? 21, data.now),
      )
      .sort((a, b) => ts(a.ts) - ts(b.ts));
    if (rows.length < (p.consecutive ?? 3)) return null;
    const last = rows.slice(-p.consecutive);
    const series = last.map((r) => Number(r.value));
    if (!rising(series)) return null;
    const base =
      data.baselines["sugar_fasting"]?.median ?? p.defaultBaseline ?? median(series)!;
    const latest = series[series.length - 1];
    if (latest < base * (1 + (p.baselineLiftPct ?? 20) / 100)) return null;
    return {
      ruleId: rule.id,
      ruleVersion: rule.version,
      level: rule.level,
      title: rule.title,
      confidence: rows.length >= 5 ? "high" : "medium",
      dataDays: Math.max(1, Math.round((ts(last[last.length - 1].ts) - ts(last[0].ts)) / DAY)),
      dedupeKey: `${rule.id}:${dayKey(last[last.length - 1].ts)}`,
      evidence: {
        readings: last.map((r) => ({ ts: r.ts, value: Number(r.value) })),
        baseline: Math.round(base),
        liftPct: Math.round(((latest - base) / base) * 100),
      },
    };
  },

  // ---------------------------------------------------------------- SUG-02
  sugar_hypo(data, rule) {
    const p = rule.params;
    const cutoff = sinceHours(p.symptomWindowHours ?? 12, data.now);
    const lows = data.vitals.filter(
      (v) => v.type.startsWith("sugar") && !v.held && ts(v.ts) >= cutoff && Number(v.value) < p.threshold,
    );
    for (const low of lows) {
      const sym = data.symptoms.find(
        (s) =>
          ts(s.ts) >= cutoff &&
          (p.symptomKeys as string[]).some((k) => s.symptomKey === k || s.label.includes(k)),
      );
      if (sym) {
        return {
          ruleId: rule.id,
          ruleVersion: rule.version,
          level: rule.level,
          title: rule.title,
          confidence: "high",
          dataDays: 1,
          dedupeKey: `${rule.id}:${dayKey(data.now)}`,
          evidence: {
            reading: { ts: low.ts, value: Number(low.value), unit: "mg/dL" },
            symptom: { ts: sym.ts, label: sym.label },
            threshold: `< ${p.threshold} mg/dL`,
          },
        };
      }
    }
    return null;
  },

  // ---------------------------------------------------------------- SYM-01
  symptom_frequency(data, rule) {
    const p = rule.params;
    const cutoff = since(p.days ?? 7, data.now);
    const watch = new Set<string>(p.watchKeys as string[]);
    const rows = data.symptoms.filter((s) => ts(s.ts) >= cutoff && watch.has(s.symptomKey));
    const byKey = new Map<string, SymptomRow[]>();
    for (const r of rows) {
      const arr = byKey.get(r.symptomKey) ?? [];
      arr.push(r);
      byKey.set(r.symptomKey, arr);
    }
    for (const [key, arr] of byKey) {
      if (arr.length >= (p.count ?? 3)) {
        return {
          ruleId: rule.id,
          ruleVersion: rule.version,
          level: rule.level,
          title: rule.title,
          confidence: arr.length >= 4 ? "high" : "medium",
          dataDays: p.days ?? 7,
          dedupeKey: `${rule.id}:${key}:${dayKey(data.now)}`,
          evidence: {
            symptom: arr[0].label,
            occurrences: arr.length,
            windowDays: p.days,
            timestamps: arr.map((a) => a.ts),
          },
        };
      }
    }
    return null;
  },

  // ---------------------------------------------------------------- SYM-02
  redflag_distress(data, rule) {
    const p = rule.params;
    const cutoff = sinceHours(p.windowHours ?? 12, data.now);
    const flag = data.symptoms.find((s) => s.redFlag && ts(s.ts) >= cutoff);
    if (!flag) return null;
    const latest = [...data.distress].sort((a, b) => ts(b.ts) - ts(a.ts))[0];
    if (!latest || latest.value < p.distressThreshold) return null;
    return {
      ruleId: rule.id,
      ruleVersion: rule.version,
      level: rule.level,
      title: rule.title,
      confidence: "high",
      dataDays: 1,
      dedupeKey: `${rule.id}:${dayKey(data.now)}`,
      evidence: {
        symptom: { ts: flag.ts, label: flag.label },
        distress: latest.value,
        threshold: p.distressThreshold,
        audioGrounded: true,
      },
    };
  },

  // ---------------------------------------------------------------- SLP-01
  sleep_decline(data, rule) {
    const p = rule.params;
    const cutoff = since(p.days ?? 7, data.now).valueOf();
    const rows = data.journal.filter(
      (j) => new Date(j.date + "T00:00:00").getTime() >= cutoff && j.sleepHours !== null,
    );
    const shortNights = rows.filter((j) => Number(j.sleepHours) < p.maxHours);
    if (shortNights.length < (p.nights ?? 5)) return null;
    const avgSleep =
      rows.reduce((a, b) => a + Number(b.sleepHours), 0) / Math.max(1, rows.length);
    const moods = rows.filter((j) => j.mood !== null).map((j) => Number(j.mood));
    const avgMood = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
    const rise = bpRise(data, p.days ?? 7);
    const moodDropped = avgMood !== null && avgMood < (p.moodDropBelow ?? 3);
    const bpRose = rise !== null && rise >= (p.bpRiseMmHg ?? 8);
    if (!moodDropped && !bpRose) return null;
    return {
      ruleId: rule.id,
      ruleVersion: rule.version,
      level: rule.level,
      title: rule.title,
      confidence: shortNights.length >= 6 ? "high" : "medium",
      dataDays: rows.length,
      dedupeKey: `${rule.id}:${dayKey(data.now)}`,
      evidence: {
        shortNights: shortNights.length,
        avgSleepHours: Number(avgSleep.toFixed(1)),
        avgMood: avgMood === null ? null : Number(avgMood.toFixed(1)),
        bpRiseMmHg: rise,
      },
    };
  },

  // ---------------------------------------------------------------- MED-01
  med_adherence(data, rule) {
    const p = rule.params;
    if (
      p.requiresChronicCondition &&
      !hasCondition(data, ["diabetes", "hypertension", "thyroid", "heart", "kidney", "asthma", "pcos"])
    ) {
      return null;
    }
    const cutoff = since(p.days ?? 7, data.now);
    const missed = data.medicineEvents.filter(
      (m) => m.status === "missed" && ts(m.ts) >= cutoff,
    );
    if (missed.length < (p.missedCount ?? 3)) return null;
    const rise = bpRise(data, p.days ?? 7);
    if (rise === null || rise < (p.bpRiseMmHg ?? 8)) return null;
    return {
      ruleId: rule.id,
      ruleVersion: rule.version,
      level: rule.level,
      title: rule.title,
      confidence: "medium",
      dataDays: p.days ?? 7,
      dedupeKey: `${rule.id}:${dayKey(data.now)}`,
      evidence: {
        missedDoses: missed.length,
        windowDays: p.days,
        bpRiseMmHg: rise,
        timestamps: missed.map((m) => m.ts),
      },
    };
  },

  // ---------------------------------------------------------------- MIS-01
  bp_absence(data, rule) {
    const p = rule.params;
    if (p.requiresHypertension && !hasCondition(data, ["hypertension", "blood pressure", "bp", "रक्तचाप"]))
      return null;
    const rows = data.vitals
      .filter((v) => v.type === "bp")
      .sort((a, b) => ts(b.ts) - ts(a.ts));
    if (rows.length < (rule.minData?.vitals ?? 2)) return null;
    const gapDays = (data.now.getTime() - ts(rows[0].ts)) / DAY;
    if (gapDays < p.absenceDays) return null;
    const gaps: number[] = [];
    for (let i = 1; i < rows.length; i++) gaps.push((ts(rows[i - 1].ts) - ts(rows[i].ts)) / DAY);
    const typical = median(gaps);
    if (typical === null || typical > p.previousGapDays) return null;
    return {
      ruleId: rule.id,
      ruleVersion: rule.version,
      level: rule.level,
      title: rule.title,
      confidence: "medium",
      dataDays: Math.round(gapDays),
      dedupeKey: `${rule.id}:${dayKey(data.now)}`,
      evidence: {
        daysSinceLastBp: Math.round(gapDays),
        typicalGapDays: Number(typical.toFixed(1)),
        lastReading: rows[0].ts,
      },
    };
  },

  // -------------------------------------------------------------- MOOD-01
  mood_decline(data, rule) {
    const p = rule.params;
    const cutoff = since(p.days ?? 7, data.now);
    const rows = data.journal.filter(
      (j) => new Date(j.date + "T00:00:00").getTime() >= cutoff && j.mood !== null,
    );
    const lowDays = rows.filter((j) => Number(j.mood) <= p.maxMood);
    if (lowDays.length < (p.minDays ?? 5)) return null;
    const sleepAvg =
      rows.filter((j) => j.sleepHours !== null).reduce((a, b) => a + Number(b.sleepHours), 0) /
      Math.max(1, rows.filter((j) => j.sleepHours !== null).length);
    const appetite = rows.some((j) => j.appetiteLoss);
    if (p.requiresAppetiteLoss && !appetite) return null;
    if (sleepAvg > p.maxSleep) return null;
    const base = data.baselines["distress"]?.median ?? null;
    const latest = [...data.distress].sort((a, b) => ts(b.ts) - ts(a.ts))[0];
    if (base !== null && latest && latest.value - base < (p.distressAboveBaseline ?? 10)) return null;
    return {
      ruleId: rule.id,
      ruleVersion: rule.version,
      level: rule.level,
      title: rule.title,
      confidence: "medium",
      dataDays: rows.length,
      dedupeKey: `${rule.id}:${dayKey(data.now)}`,
      evidence: {
        lowMoodDays: lowDays.length,
        avgSleepHours: Number(sleepAvg.toFixed(1)),
        appetiteLoss: appetite,
        distress: latest ? latest.value : null,
        baseline: base,
      },
    };
  },
};

/** Fast rules evaluated immediately after each log (PRD 11.3 step 2). */
export const ON_LOG_RULES = new Set(["BP-01", "SUG-02", "SYM-02"]);

export function evaluateRules(
  data: PersonData,
  rules: RuleDef[],
  mode: "on_log" | "nightly" = "nightly",
): RuleOutcome[] {
  const out: RuleOutcome[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    if (mode === "on_log" && !ON_LOG_RULES.has(rule.id)) continue;
    const fn = EVALUATORS[rule.evaluator];
    if (!fn) continue;
    try {
      const res = fn(data, rule);
      if (res) out.push(res);
    } catch (err) {
      console.error(`[docmate] rule ${rule.id} failed`, err);
    }
  }
  return out.sort((a, b) => b.level - a.level);
}

export { EVALUATORS, hasCondition, bpRise, median };
export const ruleMessage = messagesForText;
