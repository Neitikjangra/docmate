/**
 * Deterministic multilingual extraction engine (PRD 6.2 step 6, 7.2).
 * Pure function: transcript -> strict structured JSON. No model, no network.
 */

import {
  ACTIVITY_WORDS,
  ENERGY_HIGH,
  ENERGY_LOW,
  FOOD_TAGS,
  MEDICINE_MISSED,
  MEDICINE_TAKEN,
  MOOD_GOOD,
  MOOD_LOW,
  MOOD_VERY_LOW,
  QUESTION_MARKERS,
  RED_FLAGS,
  SLEEP_LOW_QUALITY,
  SLEEP_WORDS,
  STRESS_EVENTS,
  SYMPTOMS,
  VITAL_WORDS,
  WATER_LOW,
  WATER_OK,
  alt,
  detectLang,
  norm,
  type Lang,
} from "./lexicon";

export type Intent =
  | "symptom_check"
  | "daily_journal"
  | "vital_log"
  | "question"
  | "emergency";

export type ExtractedVital = {
  type: "bp" | "sugar_fasting" | "sugar_random" | "weight" | "spo2" | "temp";
  value: Record<string, number | string>;
  unit: string;
  raw: string;
};

export type Extraction = {
  intent: Intent;
  language: Lang;
  redFlags: string[];
  redFlagLabels: string[];
  symptoms: {
    key: string;
    label: string;
    bodyPart: string;
    severity: "mild" | "moderate" | "severe";
    duration: string | null;
    onset: string | null;
    triggers: string[];
    raw: string;
  }[];
  vitals: ExtractedVital[];
  mood: number | null;
  moodTags: string[];
  energy: number | null;
  stress: number | null;
  stressTags: string[];
  sleepHours: number | null;
  sleepQuality: "good" | "ok" | "poor" | null;
  activityMinutes: number | null;
  activityType: string | null;
  foodTags: string[];
  hydration: "low" | "ok" | null;
  medicineEvents: { name: string | null; status: "taken" | "missed" }[];
  questions: string[];
  duration: string | null;
  onset: string | null;
  triggers: string[];
  hasContent: boolean;
};

const SEVERE_WORDS = [
  "severe", "unbearable", "very bad", "extreme", "worst", "bahut tez", "bahut tez", "bahut zyada",
  "tez", "तेज़", "तेज", "बहुत", "असहनीय", "ज्यादा", "खूप", "अনেক", "অনেক", "খুব", "மிக", "அதிக",
];
const MILD_WORDS = [
  "mild", "slight", "little", "a bit", "slightly", "thoda", "halka", "kam", "थोड़ा", "हल्का", "कम",
  "একটু", "হালকা", "கொஞ்சம்", "இலகு",
];

function findTriggers(t: string): string[] {
  const out: string[] = [];
  const map: [string, RegExp][] = [
    ["after_dinner", /after dinner|raat ke khane|रात के खाने|খাবারের পরে|இரவு உணவுக்குப் பின்/],
    ["after_meal", /after (a )?meal|after (eating|food)|khane ke baad|खाने के बाद|খাওয়ার পর/],
    ["empty_stomach", /empty stomach|khali pet|खाली पेट|খালি পেট/],
    ["morning", /morning|subah|सुबह|সকাল/],
    ["night", /at night|raat me|रात में|রাতে|রাত/],
    ["evening", /evening|shaam|शाम/],
    ["after_walking", /after walk|walk ke baad|टहलने के बाद/],
    ["before_food", /before food|khane se pehle|खाने से पहले/],
  ];
  for (const [k, re] of map) if (re.test(t)) out.push(k);
  return out;
}

function findDuration(t: string): { duration: string | null; onset: string | null } {
  let duration: string | null = null;
  let onset: string | null = null;
  const dm = t.match(
    /(\d{1,3})\s*(day|days|din|दिन|দিন|நாள்|hour|hours|hrs|ghante|घंटे|ঘণ্টা|மணி|week|weeks|hafte|हफ्ते|सप्ताह|সপ্তাহ|வாரம்|month|months|mahine|महीने|মাস|மாதம்)/,
  );
  if (dm) duration = `${dm[1]} ${dm[2]}`;
  const since = t.match(
    /since\s+(yesterday|morning|evening|last night|today|kal|aaj|आज|कल|সকাল থেকে|গতকাল)/,
  );
  if (since) onset = `since ${since[1]}`;
  else if (/yesterday|kal|कल|গতকাল|நேற்று/.test(t)) onset = "since yesterday";
  else if (/since morning|subah se|सुबह से|সকাল থেকে|காலையில் இருந்து/.test(t)) onset = "since morning";
  else if (/last night|raat se|रात से|গত রাত|நேற்று இரவு/.test(t)) onset = "since last night";
  return { duration, onset };
}

function parseVitals(t: string): ExtractedVital[] {
  const out: ExtractedVital[] = [];
  const bpWord = alt(VITAL_WORDS.bp);
  const bp = t.match(
    new RegExp(`(?:${bpWord})[^0-9]{0,14}(\\d{2,3})\\s*(?:\\/|by|over|बाय|और|-|to)?\\s*(\\d{2,3})`),
  );
  const bpBare = t.match(/\b(\d{2,3})\s*(?:\/|by|over)\s*(\d{2,3})\b/);
  const m = bp ?? (/(bp|बीपी)/i.test(t) ? bpBare : null);
  if (m) {
    const sys = Number(m[1]);
    const dia = Number(m[2]);
    if (sys >= 60 && sys <= 300 && dia >= 30 && dia <= 200) {
      out.push({ type: "bp", value: { systolic: sys, diastolic: dia }, unit: "mmHg", raw: m[0] });
    }
  }

  const sugarWord = alt(VITAL_WORDS.sugar);
  const sm = t.match(new RegExp(`(?:${sugarWord})[^0-9]{0,16}(\\d{2,4})`));
  const sm2 = t.match(new RegExp(`(\\d{2,4})[^0-9]{0,16}(?:${sugarWord})`));
  const sMatch = sm ?? sm2;
  if (sMatch) {
    const val = Number(sMatch[1].length > 3 ? sMatch[1].slice(0, 3) : sMatch[1]);
    if (val >= 20 && val <= 900) {
      const isFasting = VITAL_WORDS.fasting.some((w) => t.includes(w));
      const isPost = VITAL_WORDS.postmeal.some((w) => t.includes(w));
      out.push({
        type: isFasting ? "sugar_fasting" : "sugar_random",
        value: { value: val, context: isFasting ? "fasting" : isPost ? "post_meal" : "random" },
        unit: "mg/dL",
        raw: sMatch[0],
      });
    }
  }

  const wWord = alt(VITAL_WORDS.weight);
  const wm = t.match(new RegExp(`(?:${wWord})[^0-9]{0,12}(\\d{2,3})(?:\\.\\d)?\\s*(?:kg|kilo|kgs|किलो)?`));
  if (wm) {
    const val = Number(wm[1]);
    if (val >= 20 && val <= 250) out.push({ type: "weight", value: { value: val }, unit: "kg", raw: wm[0] });
  }

  const oWord = alt(VITAL_WORDS.spo2);
  const om = t.match(new RegExp(`(?:${oWord})[^0-9]{0,12}(\\d{2,3})`));
  if (om) {
    const val = Number(om[1]);
    if (val >= 50 && val <= 100) out.push({ type: "spo2", value: { value: val }, unit: "%", raw: om[0] });
  }

  const tWord = alt(VITAL_WORDS.temp);
  const tm = t.match(new RegExp(`(?:${tWord})[^0-9]{0,12}(\\d{2}(?:\\.\\d)?)`));
  if (tm) {
    const val = Number(tm[1]);
    if (val >= 95 && val <= 108) out.push({ type: "temp", value: { value: val }, unit: "°F", raw: tm[0] });
    else if (val >= 34 && val <= 42)
      out.push({ type: "temp", value: { value: Math.round((val * 9) / 5 + 32) }, unit: "°F", raw: tm[0] });
  }

  return out;
}

function parseSleep(t: string): { hours: number | null; quality: "good" | "ok" | "poor" | null } {
  let hours: number | null = null;
  let quality: "good" | "ok" | "poor" | null = null;
  const sleepWord = alt(SLEEP_WORDS);
  // Hour units include the romanised Hinglish forms ("7 ghante soyi") alongside
  // the Indic scripts, so sleep gets captured from the way pilot users speak.
  const hourUnit = "hours?|hrs?|h\\b|ghante|ghanta|घंटे|घंटा|ঘণ্টা|மணி";
  const patterns = [
    new RegExp(`(?:${sleepWord})[^0-9]{0,18}(\\d{1,2}(?:\\.\\d)?)\\s*(?:${hourUnit})`),
    new RegExp(`(\\d{1,2}(?:\\.\\d)?)\\s*(?:${hourUnit})[^0-9]{0,18}(?:${sleepWord})`),
    new RegExp(`(?:${sleepWord})[^0-9]{0,12}(\\d{1,2}(?:\\.\\d)?)`),
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const v = Number(m[1]);
      if (v > 0 && v <= 24) {
        hours = v;
        break;
      }
    }
  }
  if (SLEEP_LOW_QUALITY.some((w) => t.includes(w))) quality = "poor";
  else if (hours !== null) quality = hours >= 7 ? "good" : hours >= 6 ? "ok" : "poor";
  return { hours, quality };
}

function parseActivity(t: string): { minutes: number | null; type: string | null } {
  const actWord = alt(ACTIVITY_WORDS);
  let type: string | null = null;
  const tm = t.match(new RegExp(`(?:${actWord})`));
  if (tm) type = tm[0];
  const mm = t.match(
    new RegExp(`(?:${actWord})[^0-9]{0,16}(\\d{1,3})\\s*(?:min|mins|minutes|मिनट|मिनिट|मिनटों|মিনিট|நிமிடம்)`),
  );
  const mm2 = t.match(/(\d{1,3})\s*(?:min|mins|minutes|मिनट|मिनटों|মিনিট|நிமிடம்)/);
  const m = mm ?? (type ? mm2 : null);
  if (m) {
    const v = Number(m[1]);
    if (v > 0 && v <= 600) return { minutes: v, type };
  }
  // "walked for half an hour"
  if (type && /half an hour|aadha ghanta|आधा घंटा|আধা ঘণ্টা/.test(t)) return { minutes: 30, type };
  if (type && /one hour|1 hour|ek ghanta|एक घंटा|এক ঘণ্টা|ஒரு மணி/.test(t)) return { minutes: 60, type };
  return { minutes: null, type };
}

function scoreMood(t: string): { mood: number | null; tags: string[]; energy: number | null } {
  const tags: string[] = [];
  let mood: number | null = null;
  if (MOOD_VERY_LOW.some((w) => t.includes(w))) {
    mood = 1;
    tags.push("very_low");
  } else if (MOOD_LOW.some((w) => t.includes(w))) {
    mood = 2;
    tags.push("low");
  } else if (MOOD_GOOD.some((w) => t.includes(w))) {
    mood = 4;
    tags.push("good");
  }
  let energy: number | null = null;
  if (ENERGY_LOW.some((w) => t.includes(w))) energy = 2;
  else if (ENERGY_HIGH.some((w) => t.includes(w))) energy = 4;
  return { mood, tags, energy };
}

export function extract(transcript: string, hint?: Lang): Extraction {
  const t = norm(transcript);
  const language = hint ?? detectLang(t);

  const redFlags: string[] = [];
  const redFlagLabels: string[] = [];
  for (const rf of RED_FLAGS) {
    if (rf.phrases.some((p) => t.includes(p))) {
      redFlags.push(rf.key);
      redFlagLabels.push(rf.label);
    }
  }

  const severe = SEVERE_WORDS.some((w) => t.includes(w));
  const mild = MILD_WORDS.some((w) => t.includes(w));

  const symptoms: Extraction["symptoms"] = [];
  for (const s of SYMPTOMS) {
    const hit = s.phrases.find((p) => t.includes(p));
    if (!hit) continue;
    // guard: avoid double-counting "breathlessness" when a red flag already matched
    if (s.key === "breathlessness" && redFlags.includes("breathless")) continue;
    if (symptoms.some((x) => x.key === s.key)) continue;
    symptoms.push({
      key: s.key,
      label: s.label,
      bodyPart: s.bodyPart,
      severity: s.severityHint === "severe" || severe ? "severe" : mild ? "mild" : "moderate",
      duration: null,
      onset: null,
      triggers: [],
      raw: hit,
    });
  }

  const vitals = parseVitals(t);
  const { duration, onset } = findDuration(t);
  const triggers = findTriggers(t);
  for (const s of symptoms) {
    s.duration = duration;
    s.onset = onset;
    s.triggers = triggers;
  }

  const { hours: sleepHours, quality: sleepQuality } = parseSleep(t);
  const { minutes: activityMinutes, type: activityType } = parseActivity(t);
  const { mood, tags: moodTags, energy } = scoreMood(t);

  let stress: number | null = null;
  const stressTags: string[] = [];
  for (const e of STRESS_EVENTS) {
    if (t.includes(e)) {
      stressTags.push(e);
      stress = 4;
    }
  }
  if (/bahut tension|very stressed|बहुत तनाव|очень|খুব চাপ|மிக அழுத்தம்/.test(t)) stress = 5;

  const foodTags: string[] = [];
  for (const f of FOOD_TAGS) if (f.phrases.some((p) => t.includes(p))) foodTags.push(f.tag);

  let hydration: "low" | "ok" | null = null;
  if (WATER_LOW.some((w) => t.includes(w))) hydration = "low";
  else if (WATER_OK.some((w) => t.includes(w))) hydration = "ok";

  const medicineEvents: Extraction["medicineEvents"] = [];
  if (MEDICINE_TAKEN.some((w) => t.includes(w))) {
    const name = t.match(/took my ([a-z\u0900-\u097F]{3,20}) (?:tablet|medicine|pill)/);
    medicineEvents.push({ name: name ? name[1] : null, status: "taken" });
  }
  if (MEDICINE_MISSED.some((w) => t.includes(w))) {
    medicineEvents.push({ name: null, status: "missed" });
  }

  const questions: string[] = [];
  if (QUESTION_MARKERS.some((w) => t.includes(w)) || transcript.trim().endsWith("?")) {
    questions.push(transcript.trim());
  }

  let intent: Intent = "daily_journal";
  if (redFlags.length) intent = "emergency";
  else if (vitals.length && symptoms.length === 0) intent = "vital_log";
  else if (symptoms.length) intent = "symptom_check";
  else if (questions.length) intent = "question";

  const hasContent =
    symptoms.length > 0 ||
    vitals.length > 0 ||
    mood !== null ||
    energy !== null ||
    sleepHours !== null ||
    activityMinutes !== null ||
    foodTags.length > 0 ||
    medicineEvents.length > 0 ||
    stressTags.length > 0 ||
    questions.length > 0 ||
    t.length > 12;

  return {
    intent,
    language,
    redFlags,
    redFlagLabels,
    symptoms,
    vitals,
    mood,
    moodTags,
    energy,
    stress,
    stressTags,
    sleepHours,
    sleepQuality,
    activityMinutes,
    activityType,
    foodTags,
    hydration,
    medicineEvents,
    questions,
    duration,
    onset,
    triggers,
    hasContent,
  };
}
