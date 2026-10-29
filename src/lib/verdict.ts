/**
 * Verdict → result card (PRD 6.3, 15.3, 17.3).
 *
 * Structure is the guardrail: card text is chosen from fixed templates keyed by
 * rule id and severity. Nothing here can name a medicine, give a dose, or move
 * the severity away from what the rule engine decided. Titles are ≤ 12 words.
 */

import { t } from "./i18n";
import type { Extraction } from "./nlu/extract";
import type { RuleOutcome } from "./rules/engine";

export type VerdictLevel = 0 | 1 | 2 | 3 | 4;

export type VerdictAction = { key: string; label: string; href: string };

export type Verdict = {
  level: VerdictLevel;
  kind: "journal" | "symptom" | "vital" | "question" | "emergency";
  title: string;
  why: string;
  guardrail: string;
  actions: VerdictAction[];
  speak: string;
  tone: "mint" | "mint-soft" | "terracotta" | "red";
  ruleId: string | null;
  ruleVersion: string | null;
  confidence: "low" | "medium" | "high";
  evidence: Record<string, any>;
  sosEligible: boolean;
  redFlags: string[];
};

export type VerdictHistory = {
  recentSameSymptom?: number;
  bpBaseline?: number | null;
  lastWeekNote?: string | null;
  daysOfData?: number;
};

const RULE_TITLES: Record<string, Record<number, (e: Record<string, any>) => string>> = {
  "BP-01": {
    4: () => "Blood pressure is at an emergency level.",
    3: () => "Blood pressure has stayed high this week.",
  },
  "SUG-01": {
    3: (e) => `Fasting sugar has been rising, now ${e.readings?.[e.readings.length - 1]?.value ?? ""} mg/dL.`,
  },
  "SUG-02": {
    4: (e) => `Low blood sugar at ${e.reading?.value ?? ""} mg/dL with warning signs.`,
  },
  "SYM-01": {
    3: (e) => `${e.symptom ?? "That symptom"} logged ${e.occurrences ?? 3} times this week.`,
  },
  "SYM-02": {
    4: (e) => `Red-flag symptom with a distressed voice.`,
  },
  "SLP-01": {
    3: (e) => `Short sleep on ${e.shortNights ?? 5} nights with a dip.`,
  },
  "MED-01": {
    3: (e) => `Doses missed ${e.missedDoses ?? 3} times with rising blood pressure.`,
  },
  "MIS-01": {
    2: (e) => `No blood pressure reading for ${e.daysSinceLastBp ?? 10} days.`,
  },
  "MOOD-01": {
    3: () => "Low mood, short sleep and appetite loss together.",
  },
};

function firstSymptom(e: Extraction): string {
  return e.symptoms[0]?.label ?? "your symptom";
}

function vitalsOutOfRange(e: Extraction): boolean {
  return e.vitals.some((v) => {
    if (v.type === "bp") {
      const s = Number(v.value.systolic);
      const d = Number(v.value.diastolic);
      return s >= 160 || d >= 100 || s < 90 || d < 60;
    }
    const val = Number(v.value.value);
    if (v.type === "sugar_fasting") return val >= 140 || val < 70;
    if (v.type === "sugar_random") return val >= 200 || val < 70;
    if (v.type === "spo2") return val < 92;
    if (v.type === "temp") return val >= 101;
    return false;
  });
}

function whyLine(
  outcome: RuleOutcome | null,
  e: Extraction,
  h: VerdictHistory,
  lang: string,
): string {
  const whyPrefix = t(lang, "card.why_prefix");
  if (outcome) {
    const ev = outcome.evidence;
    switch (outcome.ruleId) {
      case "BP-01":
        if (outcome.level === 4)
          return `${whyPrefix} ${ev.reading?.systolic}/${ev.reading?.diastolic} mmHg is above ${ev.threshold}, and you mentioned feeling unwell.`;
        return `${whyPrefix} ${ev.readings?.length ?? 3} readings at or above ${ev.threshold} in ${ev.windowDays} days.`;
      case "SUG-01":
        return `${whyPrefix} three rising fasting readings, now about ${ev.liftPct}% above your usual ${ev.baseline} mg/dL.`;
      case "SUG-02":
        return `${whyPrefix} a reading of ${ev.reading?.value} mg/dL together with ${ev.symptom?.label ?? "warning signs"}.`;
      case "SYM-01":
        return `${whyPrefix} this is the ${ev.occurrences}th time in ${ev.windowDays} days.`;
      case "SYM-02":
        return `${whyPrefix} a red-flag symptom with voice distress at ${ev.distress}/100 (above ${ev.threshold}).`;
      case "SLP-01":
        return `${whyPrefix} ${ev.shortNights} nights under 5 hours, averaging ${ev.avgSleepHours}h${ev.bpRiseMmHg != null ? `, with BP up ${ev.bpRiseMmHg} mmHg` : ""}.`;
      case "MED-01":
        return `${whyPrefix} ${ev.missedDoses} missed doses in ${ev.windowDays} days and blood pressure up ${ev.bpRiseMmHg} mmHg.`;
      case "MIS-01":
        return `${whyPrefix} your usual gap is ${ev.typicalGapDays} days; it has been ${ev.daysSinceLastBp}.`;
      case "MOOD-01":
        return `${whyPrefix} ${ev.lowMoodDays} low days, sleep averaging ${ev.avgSleepHours}h${ev.appetiteLoss ? ", appetite down" : ""}.`;
      default:
        break;
    }
  }
  if (e.redFlags.length) return `${whyPrefix} you described ${e.redFlagLabels.join(", ")}.`;
  if (e.symptoms.length > 1) return `${whyPrefix} ${e.symptoms.map((s) => s.label).join(", ")}.`;
  if (e.symptoms.length === 1)
    return `${whyPrefix} you described ${firstSymptom(e)}${h.recentSameSymptom && h.recentSameSymptom > 1 ? `, and it has come up ${h.recentSameSymptom} times recently` : ""}.`;
  if (vitalsOutOfRange(e)) return `${whyPrefix} that reading is outside your usual range.`;
  if (h.lastWeekNote) return `${whyPrefix} ${h.lastWeekNote}`;
  return `${whyPrefix} you logged it and there is no pattern yet.`;
}

function actionsFor(level: VerdictLevel, kind: Verdict["kind"]): VerdictAction[] {
  if (level === 4) {
    return [
      { key: "sos", label: t("en", "card.act.sos"), href: "/?sos=1" },
      { key: "doctor", label: t("en", "card.act.doctor"), href: "/doctor" },
    ];
  }
  if (level === 3) {
    return [
      { key: "doctor", label: t("en", "card.act.doctor"), href: "/doctor" },
      { key: "track", label: t("en", "card.act.track"), href: "/timeline" },
    ];
  }
  if (level === 2) {
    return [
      { key: "track", label: t("en", "card.act.track"), href: "/timeline" },
      { key: "log_vitals", label: t("en", "card.act.log_vitals"), href: "/record?mode=vitals" },
    ];
  }
  if (kind === "journal") return [];
  return [
    { key: "track", label: t("en", "card.act.track"), href: "/timeline" },
    { key: "rest", label: t("en", "card.act.rest"), href: "/" },
  ];
}

export function buildVerdict(args: {
  extraction: Extraction;
  outcomes: RuleOutcome[];
  lang: string;
  history?: VerdictHistory;
  distress?: number | null;
  redFlagDistressThreshold?: number;
}): Verdict {
  const { extraction: e, outcomes, lang } = args;
  const h = args.history ?? {};
  const top = outcomes.length ? [...outcomes].sort((a, b) => b.level - a.level)[0] : null;
  const threshold = args.redFlagDistressThreshold ?? 85;

  let level: VerdictLevel;
  if (top) {
    level = (top.level as VerdictLevel) ?? 1;
  } else if (e.redFlags.length) {
    level = 3;
  } else if (e.symptoms.some((s) => s.severity === "severe") || vitalsOutOfRange(e)) {
    level = 2;
  } else if (e.symptoms.length) {
    level = 1;
  } else if (e.intent === "question") {
    level = 2;
  } else {
    level = 0;
  }

  const distress = args.distress ?? null;
  const sosEligible =
    level === 4 ||
    (e.redFlags.length > 0 && distress !== null && distress >= threshold);

  const kind: Verdict["kind"] =
    level === 4 ? "emergency" : e.intent === "vital_log" ? "vital" : e.intent === "question" ? "question" : e.symptoms.length ? "symptom" : "journal";

  let title: string;
  if (top) {
    const maker = RULE_TITLES[top.ruleId]?.[top.level];
    title = maker ? maker(top.evidence) : top.title;
  } else if (level === 4) {
    title = t(lang, "card.level.4");
  } else if (e.redFlags.length) {
    title = `Worth checking today — ${e.redFlagLabels[0]}.`;
  } else if (e.symptoms.length) {
    title = `${t(lang, level === 2 ? "card.level.2" : "card.level.1")} — ${firstSymptom(e)}.`;
  } else if (e.intent === "vital_log") {
    title = vitalsOutOfRange(e) ? "That reading is worth watching." : "Reading saved.";
  } else if (e.intent === "question") {
    title = "I cannot answer that safely.";
  } else {
    title = t(lang, "card.journal_saved");
  }

  const why = whyLine(top, e, h, lang);
  const tone: Verdict["tone"] =
    level === 4 ? "red" : level === 3 ? "terracotta" : level === 2 ? "mint-soft" : "mint";

  const speak =
    level === 0
      ? `${title}. ${t(lang, "card.guardrail")}`
      : `${title} ${why} ${t(lang, "card.guardrail")}`;

  return {
    level,
    kind,
    title,
    why,
    guardrail: t(lang, "card.guardrail"),
    actions: actionsFor(level, kind),
    speak,
    tone,
    ruleId: top?.ruleId ?? null,
    ruleVersion: top?.ruleVersion ?? null,
    confidence: top?.confidence ?? (h.daysOfData && h.daysOfData >= 14 ? "medium" : "low"),
    evidence: top?.evidence ?? {
      symptoms: e.symptoms.map((s) => s.key),
      vitals: e.vitals.map((v) => v.type),
      redFlags: e.redFlags,
    },
    sosEligible,
    redFlags: e.redFlags,
  };
}
