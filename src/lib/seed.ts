/**
 * Seed (plan Phase 2 + 10).
 *
 *   1. the versioned rule store, from rules.json
 *   2. notification defaults per person
 *   3. the doctor directory (PRD 17.4 — dummy, verified, with registration no.)
 *   4. a rich demo family with ~90 days of history, a family space, sharing
 *      grants, a doctor link, a consultation and real score history
 *
 * Everything is written with the raw handle passed in from db.boot() so this
 * module stays free of import cycles. Seeding the demo family is skipped once
 * any account exists, so a real user's data is never overwritten.
 */

import crypto from "node:crypto";
import type Database from "better-sqlite3";
import rulesJson from "./rules/rules.json";

const SEED_VERSION = "2026-10-28.1";
const DAY = 86400000;

type Db = Database.Database;

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
const iso = (d: Date) => d.toISOString();
const nowIso = () => iso(new Date());
const day = (offset: number) => new Date(Date.now() - offset * DAY);
const dateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

/** Deterministic PRNG so the demo data is identical on every machine. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function insert(db: Db, table: string, row: Record<string, any>): void {
  const keys = Object.keys(row);
  const stmt = db.prepare(
    `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
  );
  stmt.run(...keys.map((k) => normalize(row[k])));
}
function upsertRule(db: Db, row: Record<string, any>): void {
  db.prepare(
    `INSERT INTO rules (id, version, title, definition_json, level, active, reviewed_by, reviewed_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET version=excluded.version, title=excluded.title,
       definition_json=excluded.definition_json, level=excluded.level, active=excluded.active,
       reviewed_by=excluded.reviewed_by, reviewed_at=excluded.reviewed_at, updated_at=excluded.updated_at`,
  ).run(
    row.id,
    row.version,
    row.title,
    JSON.stringify(row.definition),
    row.level,
    row.active ? 1 : 0,
    row.reviewed_by,
    row.reviewed_at,
    nowIso(),
  );
}
function normalize(v: any): any {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}
function codeHash(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateCode(len = 8): string {
  let s = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

// ------------------------------------------------------------------- doctors

const DOCTORS = [
  {
    name: "Dr Sanjay Banerjee",
    specialty: "Geriatrics",
    registration_no: "WB-29381",
    council: "West Bengal Medical Council",
    languages: "Bengali, Hindi, English",
    availability: "Mon–Sat, 09:00–13:00",
    fee_inr: 800,
    rating: 4.9,
    experience_years: 21,
    code: "DRBAN21",
    bio: "Geriatric medicine, elder care, and chronic conditions.",
    clinic: "AMRI · Kolkata",
  },
  {
    name: "Dr Arjun Deshmukh",
    specialty: "Cardiology",
    registration_no: "MH-84729",
    council: "Maharashtra Medical Council",
    languages: "Marathi, Hindi, English",
    availability: "Daily, 10:00–14:00",
    fee_inr: 900,
    rating: 4.9,
    experience_years: 18,
    code: "DRDES18",
    bio: "Preventive cardiology, hypertension and coronary care.",
    clinic: "Ruby Hall · Pune",
  },
  {
    name: "Dr Nithin Rao",
    specialty: "Pulmonology",
    registration_no: "KA-49201",
    council: "Karnataka Medical Council",
    languages: "Kannada, English, Hindi",
    availability: "Tue–Sun, 11:00–16:00",
    fee_inr: 700,
    rating: 4.8,
    experience_years: 14,
    code: "DRRAO14",
    bio: "Chest medicine, asthma, and respiratory wellness.",
    clinic: "Manipal Hospital · Bengaluru",
  },
  {
    name: "Dr Meera Krishnan",
    specialty: "Internal Medicine",
    registration_no: "TN-58291",
    council: "Tamil Nadu Medical Council",
    languages: "Tamil, English, Hindi",
    availability: "Daily, 09:00–15:00",
    fee_inr: 600,
    rating: 4.8,
    experience_years: 14,
    code: "DRKRI14",
    bio: "Adult primary care, diabetic care, and hypertension.",
    clinic: "Apollo Clinic · Chennai",
  },
  {
    name: "Dr Kavya Reddy",
    specialty: "Family Medicine",
    registration_no: "AP-38291",
    council: "Andhra Pradesh Medical Council",
    languages: "Telugu, English",
    availability: "Mon–Fri, 10:00–16:00",
    fee_inr: 500,
    rating: 4.7,
    experience_years: 9,
    code: "DRRED09",
    bio: "Holistic family healthcare and chronic disease prevention.",
    clinic: "CARE Hospitals · Hyderabad",
  },
  {
    name: "Dr Fatima Shaikh",
    specialty: "Internal Medicine",
    registration_no: "MH-92018",
    council: "Maharashtra Medical Council",
    languages: "Hindi, Marathi, English",
    availability: "Daily, 11:00–17:00",
    fee_inr: 550,
    rating: 4.7,
    experience_years: 11,
    code: "DRSHA11",
    bio: "Chronic disorder management and preventative health.",
    clinic: "Lilavati · Mumbai",
  },
  {
    name: "Dr Priya Malhotra",
    specialty: "Endocrinology",
    registration_no: "DL-39201",
    council: "Delhi Medical Council",
    languages: "Hindi, English, Punjabi",
    availability: "Mon–Sat, 10:00–14:00",
    fee_inr: 750,
    rating: 4.8,
    experience_years: 12,
    code: "DRMAL12",
    bio: "Diabetes, metabolic syndromes, and thyroid care.",
    clinic: "Max Saket · New Delhi",
  },
  {
    name: "Dr Rahul Nair",
    specialty: "Mental Health",
    registration_no: "KL-29103",
    council: "Travancore-Cochin Medical Council",
    languages: "Malayalam, English",
    availability: "Daily, 15:00–20:00",
    fee_inr: 550,
    rating: 4.6,
    experience_years: 8,
    code: "DRNAI08",
    bio: "Anxiety, cognitive balance, sleep and emotional resilience.",
    clinic: "Mindfirst · Kochi",
  },
];

// --------------------------------------------------------------------- seed

export function ensureSeed(db: Db): void {
  seedRules(db);
  seedDoctors(db);

  // Count only real (non-doctor) accounts: seedDoctors() has already created the
  // demo doctor's login, so counting every account would always be > 0 and the
  // demo family would never be seeded on a fresh install.
  const ownerCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM accounts WHERE COALESCE(is_doctor, 0) = 0`).get() as {
      c: number;
    }
  ).c;

  if (ownerCount === 0) {
    seedDemoFamily(db);
  }

  db.prepare(
    `INSERT INTO app_meta (key, value, updated_at) VALUES ('seed_version', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(SEED_VERSION, nowIso());
}

function seedRules(db: Db): void {
  for (const r of rulesJson as any[]) {
    upsertRule(db, {
      id: r.id,
      version: r.version,
      title: `${r.id} · ${r.title}`,
      definition: r,
      level: r.level,
      active: r.active !== false,
      reviewed_by: r.reviewedBy ?? "Demo clinical advisor",
      reviewed_at: r.reviewedAt ?? "2026-10-20",
    });
  }
}

function seedDoctors(db: Db): void {
  for (const d of DOCTORS) {
    const existing = db.prepare(`SELECT id FROM doctors WHERE code = ?`).get(d.code) as { id: string } | undefined;
    if (existing) {
      db.prepare(`UPDATE doctors SET clinic = ?, rating = ?, fee_inr = ?, experience_years = ?, specialty = ?, languages = ? WHERE id = ?`).run(
        d.clinic, d.rating, d.fee_inr, d.experience_years, d.specialty, d.languages, existing.id
      );
      continue;
    }
    insert(db, "doctors", {
      id: uid("doc"),
      account_id: null,
      name: d.name,
      registration_no: d.registration_no,
      council: d.council,
      specialty: d.specialty,
      languages: d.languages,
      availability: d.availability,
      verified_at: iso(day(120)),
      code: d.code,
      phone: null,
      fee_inr: d.fee_inr,
      rating: d.rating,
      experience_years: d.experience_years,
      bio: d.bio,
      clinic: d.clinic,
      created_at: nowIso(),
    });
  }

  // Dr Meera Krishnan gets login account so the doctor portal can be accessed.
  const doc = db.prepare(`SELECT id, account_id FROM doctors WHERE code = 'DRKRI14'`).get() as
    | { id: string; account_id: string | null }
    | undefined;
  if (doc && !doc.account_id) {
    const phone = "9000000001";
    let account = db.prepare(`SELECT id FROM accounts WHERE phone = ?`).get(phone) as
      | { id: string }
      | undefined;
    if (!account) {
      const id = uid("acc");
      insert(db, "accounts", {
        id,
        phone,
        language: "en",
        consent_version: null,
        consent_at: null,
        status: "active",
        is_doctor: 1,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      account = { id };
    }
    db.prepare(`UPDATE doctors SET account_id = ?, phone = ? WHERE id = ?`).run(account.id, phone, doc.id);
  }
}

// ------------------------------------------------------------------ demo data

type Spec = {
  key: "self" | "father" | "mother";
  name: string;
  dob: string;
  sex: string;
  relation: string;
  managed: number;
  height: number;
  weight: number;
};

function seedDemoFamily(db: Db): void {
  const rnd = mulberry32(20261028);
  const ownerAccountId = uid("acc");
  insert(db, "accounts", {
    id: ownerAccountId,
    phone: "9876543210",
    language: "en",
    consent_version: "v1.0",
    consent_at: iso(day(95)),
    status: "active",
    is_doctor: 0,
    created_at: iso(day(95)),
    updated_at: nowIso(),
  });
  insert(db, "consents", {
    id: uid("cns"),
    account_id: ownerAccountId,
    person_id: null,
    kind: "terms_and_health_data",
    version: "v1.0",
    language: "en",
    granted_at: iso(day(95)),
    revoked_at: null,
  });

  const specs: Spec[] = [
    { key: "self", name: "Ananya Sharma", dob: "1992-04-18", sex: "Female", relation: "self", managed: 0, height: 165, weight: 60 },
    { key: "father", name: "Raghavan", dob: "1958-02-11", sex: "Male", relation: "father", managed: 1, height: 170, weight: 82 },
    { key: "mother", name: "Lakshmi", dob: "1962-09-03", sex: "Female", relation: "mother", managed: 1, height: 158, weight: 68 },
  ];

  const personIds: Record<string, string> = {};

  for (const s of specs) {
    const pid = uid("per");
    personIds[s.key] = pid;
    insert(db, "persons", {
      id: pid,
      account_id: ownerAccountId,
      claimed_by_account_id: null,
      name: s.name,
      dob: s.dob,
      sex_at_birth: s.sex,
      height_cm: s.height,
      weight_kg: s.weight,
      work_status: s.key === "self" ? "Desk job" : "Retired",
      work_hours: s.key === "self" ? "9 to 6" : null,
      exercise_level: s.key === "self" ? "Regular" : "Light",
      sleep_band: s.key === "self" ? "7-8 hours" : "Under 6 hours",
      diet: s.key === "self" ? "Mixed" : "Home cooked",
      tobacco: "No",
      alcohol: s.key === "self" ? "Occasionally" : "No",
      relation_to_owner: s.relation,
      is_managed: s.managed,
      preferred_voice: "en-IN",
      checkin_time: "21:00",
      retention_days: 90,
      completeness: s.key === "self" ? 100 : 85,
      onboarded: 1,
      created_at: iso(day(94)),
      updated_at: nowIso(),
    });
    insert(db, "notification_settings", {
      person_id: pid,
      level3_enabled: 1,
      level4_enabled: 1,
      detailed_preview: 0,
      quiet_start: "22:00",
      quiet_end: "07:00",
      daily_reminder: 1,
      reminder_time: "21:00",
    });
    insert(db, "consents", {
      id: uid("cns"),
      account_id: ownerAccountId,
      person_id: pid,
      kind: "profile_management",
      version: "v1.0",
      language: "en",
      granted_at: iso(day(94)),
      revoked_at: null,
    });
  }

  // conditions & medicines
  const cond = (pid: string, name: string, since: string) =>
    insert(db, "conditions", {
      id: uid("cnd"),
      person_id: pid,
      name,
      status: "confirmed",
      source: "user",
      since,
      created_at: nowIso(),
    });
  const med = (pid: string, name: string, dosage: string, schedule: any) =>
    insert(db, "medicines", {
      id: uid("med"),
      person_id: pid,
      name,
      dosage_text: dosage,
      schedule_json: schedule,
      active: 1,
      created_at: nowIso(),
    });

  cond(personIds.self, "Seasonal allergy", "2020");
  cond(personIds.father, "Hypertension", "2015");
  cond(personIds.father, "Type 2 diabetes", "2019");
  cond(personIds.mother, "Hypertension", "2016");
  cond(personIds.mother, "Hypothyroidism", "2018");

  med(personIds.father, "Amlodipine", "5 mg, once daily", { times: ["08:00"] });
  med(personIds.father, "Metformin", "500 mg, twice daily", { times: ["08:00", "21:00"] });
  med(personIds.mother, "Telmisartan", "40 mg, once daily", { times: ["08:00"] });
  med(personIds.mother, "Thyronorm", "50 mcg, once daily", { times: ["07:00"] });

  insert(db, "allergies", { id: uid("alg"), person_id: personIds.self, name: "Dust", created_at: nowIso() });
  insert(db, "allergies", { id: uid("alg"), person_id: personIds.father, name: "Penicillin", created_at: nowIso() });

  for (const s of specs) {
    insert(db, "emergency_contacts", {
      id: uid("ec"),
      person_id: personIds[s.key],
      name: s.key === "self" ? "Sunita Mehta" : "Rohan Mehta",
      phone: s.key === "self" ? "9876500011" : "9876543210",
      priority: 1,
      verified_at: iso(day(90)),
      created_at: nowIso(),
    });
  }

  generateHistory(db, rnd, personIds);

  // One period log so the female-only cycle KPI (PRD 8.3) has something to show.
  insert(db, "cycle_entries", {
    id: uid("cyc"),
    person_id: personIds.mother,
    date: dateStr(day(14)),
    phase: "follicular",
    symptoms_json: JSON.stringify(["fatigue"]),
    created_at: iso(day(14)),
  });

  // ---- family space
  const familyId = uid("fam");
  const initialCode = "DOCM47";
  insert(db, "families", {
    id: familyId,
    name: "Sharma family",
    admin_account_id: ownerAccountId,
    code_hash: codeHash(initialCode),
    code_expires_at: iso(new Date(Date.now() + 7 * DAY)),
    auto_approve_until: null,
    created_at: iso(day(90)),
    updated_at: nowIso(),
  });
  // The plain code is kept so the demo admin can see and share it; only the
  // hash is ever used to check a join.
  db.prepare(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(`family_code_${familyId}`, initialCode, nowIso());

  for (const s of specs) {
    insert(db, "family_members", {
      id: uid("fmm"),
      family_id: familyId,
      person_id: personIds[s.key],
      account_id: ownerAccountId,
      role: s.key === "self" ? "admin" : "member",
      status: "active",
      relation: s.relation,
      joined_at: iso(day(89)),
      created_at: iso(day(90)),
    });
    for (const category of ["score", "alerts", "vitals", "reports", "family_insights"]) {
      insert(db, "sharing_grants", {
        id: uid("sgr"),
        subject_person_id: personIds[s.key],
        viewer_account_id: null,
        family_id: familyId,
        category,
        granted: 1,
        expires_at: null,
        revoked_at: null,
        created_at: iso(day(89)),
      });
    }
  }

  insert(db, "insights", {
    id: uid("ins"),
    person_id: null,
    family_id: familyId,
    kind: "family",
    text: "Father's blood pressure has been high on 3 readings this week, and Mother is sleeping under 5 hours.",
    created_at: nowIso(),
  });
  insert(db, "insights", {
    id: uid("ins"),
    person_id: null,
    family_id: familyId,
    kind: "family",
    text: "Two members share a late-dinner pattern — meals after 21:30 line up with their worst readings.",
    created_at: nowIso(),
  });

  // ---- consultation matching design (Dr Meera Krishnan · Lakshmi · Completed)
  const meera = db.prepare(`SELECT id FROM doctors WHERE code = 'DRKRI14'`).get() as
    | { id: string }
    | undefined;
  if (meera) {
    insert(db, "consultations", {
      id: uid("con"),
      person_id: personIds.mother,
      doctor_id: meera.id,
      doctor_link_id: null,
      slot: "2026-10-28T16:20:00.000Z",
      mode: "phone",
      status: "completed",
      payment_ref: "upi_MEERA987",
      amount_inr: 600,
      notes_ref: null,
      prescription_ref: null,
      summary_json: JSON.stringify({
        notes: "Reviewed blood pressure and diabetes management. Continue Metformin 500mg and Amlodipine 5mg.",
        followUpInDays: 14,
      }),
      created_at: "2026-10-28T16:20:00.000Z",
      updated_at: "2026-10-28T16:45:00.000Z",
    });
  }

  // ---- score history, features and baselines (last 30 days, oldest first)
  seedDerived(db, Object.values(personIds));
}

function pushVital(
  db: Db,
  personId: string,
  when: Date,
  type: string,
  value: Record<string, any>,
  unit: string,
): void {
  insert(db, "vitals", {
    id: uid("vit"),
    person_id: personId,
    ts: iso(when),
    type,
    value_json: JSON.stringify(value),
    unit,
    source: "typed",
    confirmed: 1,
    held: 0,
    created_at: iso(when),
  });
}

function pushJournal(
  db: Db,
  personId: string,
  when: Date,
  j: {
    mood?: number;
    energy?: number;
    sleepHours?: number;
    sleepQuality?: string;
    stress?: number;
    activityMinutes?: number;
    activityType?: string;
    foodTags?: string[];
    hydration?: string;
    summary?: any;
  },
): void {
  const d = dateStr(when);
  const existing = db
    .prepare(`SELECT id FROM journal_entries WHERE person_id = ? AND date = ?`)
    .get(personId, d) as { id: string } | undefined;
  const row = {
    id: existing?.id ?? uid("jrn"),
    person_id: personId,
    date: d,
    recording_id: null,
    mood: j.mood ?? null,
    energy: j.energy ?? null,
    sleep_hours: j.sleepHours ?? null,
    sleep_quality: j.sleepQuality ?? null,
    stress: j.stress ?? null,
    activity_minutes: j.activityMinutes ?? null,
    activity_type: j.activityType ?? null,
    food_tags: j.foodTags ? JSON.stringify(j.foodTags) : null,
    hydration: j.hydration ?? null,
    summary_json: j.summary ? JSON.stringify(j.summary) : null,
    edit_source: "extraction",
    created_at: iso(when),
    updated_at: iso(when),
  };
  if (existing) {
    db.prepare(
      `UPDATE journal_entries SET mood=?, energy=?, sleep_hours=?, sleep_quality=?, stress=?,
        activity_minutes=?, activity_type=?, food_tags=?, hydration=?, summary_json=?, updated_at=?
       WHERE id=?`,
    ).run(
      row.mood, row.energy, row.sleep_hours, row.sleep_quality, row.stress, row.activity_minutes,
      row.activity_type, row.food_tags, row.hydration, row.summary_json, row.updated_at, row.id,
    );
  } else {
    insert(db, "journal_entries", row);
  }
}

function pushSymptom(
  db: Db,
  personId: string,
  when: Date,
  symptom: string,
  label: string,
  redFlag = false,
): void {
  insert(db, "symptoms", {
    id: uid("sym"),
    person_id: personId,
    recording_id: null,
    symptom,
    body_part: null,
    onset: null,
    duration: null,
    severity_words: label,
    red_flag: redFlag ? 1 : 0,
    ts: iso(when),
    resolved_at: null,
    created_at: iso(when),
  });
}

function pushMedEvent(db: Db, personId: string, when: Date, name: string, status: "taken" | "missed"): void {
  insert(db, "medicine_events", {
    id: uid("mev"),
    person_id: personId,
    medicine_id: null,
    name,
    ts: iso(when),
    status,
    created_at: iso(when),
  });
}

function pushDistress(db: Db, personId: string, when: Date, distress: number): void {
  insert(db, "acoustic_features", {
    id: uid("acf"),
    recording_id: null,
    person_id: personId,
    features_json: JSON.stringify({ f0Mean: 165 + Math.round(distress), jitter: 0.01, shimmer: 0.04, speechRate: 3.4, pauseRatio: 0.22, model: "demo" }),
    distress_0_100: distress,
    confidence: 0.74,
    model_version: "demo-1.0",
    calibrating: distress > 0 ? 0 : 1,
    created_at: iso(when),
  });
}

function generateHistory(db: Db, rnd: number | (() => number), ids: Record<string, string>): void {
  const r = typeof rnd === "function" ? rnd : mulberry32(1);
  const self = ids.self;
  const father = ids.father;
  const mother = ids.mother;

  for (let offset = 92; offset >= 0; offset--) {
    const when = day(offset);
    const t = day(offset);

    // ---------------------------------------------------------- self (steady)
    if (offset % 2 === 0) {
      pushVital(db, self, t, "bp", { systolic: 116 + Math.round(r() * 10), diastolic: 74 + Math.round(r() * 6) }, "mmHg");
    }
    pushJournal(db, self, when, {
      mood: 4,
      energy: 4,
      sleepHours: 7 + Math.round(r() * 10) / 10,
      sleepQuality: "good",
      stress: 2,
      activityMinutes: 25 + Math.round(r() * 25),
      activityType: "walk",
      foodTags: ["vegetables", "light"],
      hydration: "ok",
    });
    pushMedEvent(db, self, t, "Vitamin D", "taken");
    if (offset % 3 === 0) pushDistress(db, self, t, 18 + Math.round(r() * 10));

    // -------------------------------------------------------- father (L3 story)
    if (offset % 3 === 0) pushDistress(db, father, t, 24 + Math.round(r() * 12));
    pushJournal(db, father, when, {
      mood: offset < 7 ? 3 : 4,
      energy: 3,
      sleepHours: 5.6 + Math.round(r() * 12) / 10,
      sleepQuality: "ok",
      stress: 3,
      activityMinutes: 15 + Math.round(r() * 20),
      activityType: "walk",
      foodTags: offset % 2 ? ["heavy_dinner"] : ["light"],
      hydration: "ok",
    });
    pushMedEvent(db, father, t, "Amlodipine", "taken");
    pushMedEvent(db, father, t, "Metformin", offset > 7 && offset < 10 ? "missed" : "taken");

    // BP: baseline ~138/88, with 3 clearly high readings in the last 7 days
    if (offset % 4 === 0 && offset > 7) {
      pushVital(db, father, t, "bp", { systolic: 132 + Math.round(r() * 14), diastolic: 84 + Math.round(r() * 8) }, "mmHg");
    }
    if (offset === 6) pushVital(db, father, t, "bp", { systolic: 172, diastolic: 106 }, "mmHg");
    if (offset === 4) pushVital(db, father, t, "bp", { systolic: 162, diastolic: 98 }, "mmHg");
    if (offset === 1) pushVital(db, father, t, "bp", { systolic: 168, diastolic: 104 }, "mmHg");
    if (offset === 2) pushSymptom(db, father, t, "headache", "headache");

    // fasting sugar drifting up: 3 rising readings at the end
    if (offset % 6 === 0 && offset > 12) {
      pushVital(db, father, t, "sugar_fasting", { value: 104 + Math.round(r() * 12), context: "fasting" }, "mg/dL");
    }
    if (offset === 9) pushVital(db, father, t, "sugar_fasting", { value: 118, context: "fasting" }, "mg/dL");
    if (offset === 5) pushVital(db, father, t, "sugar_fasting", { value: 131, context: "fasting" }, "mg/dL");
    if (offset === 1) pushVital(db, father, t, "sugar_fasting", { value: 148, context: "fasting" }, "mg/dL");

    // -------------------------------------------------------- mother (sleep story)
    if (offset % 3 === 1) pushDistress(db, mother, t, 34 + Math.round(r() * 20));
    const shortSleep = offset <= 6;
    pushJournal(db, mother, when, {
      mood: shortSleep ? 2 : 4,
      energy: shortSleep ? 2 : 4,
      sleepHours: shortSleep ? 4.3 + Math.round(r() * 7) / 10 : 6.8 + Math.round(r() * 12) / 10,
      sleepQuality: shortSleep ? "poor" : "good",
      stress: shortSleep ? 4 : 2,
      activityMinutes: 12 + Math.round(r() * 20),
      activityType: "walk",
      foodTags: shortSleep ? ["heavy_dinner", "tea_coffee"] : ["light", "vegetables"],
      hydration: "ok",
    });
    pushMedEvent(db, mother, t, "Telmisartan", "taken");
    pushMedEvent(db, mother, t, "Thyronorm", "taken");
    if (offset % 5 === 0) {
      pushVital(db, mother, t, "bp", { systolic: 128 + Math.round(r() * 16), diastolic: 82 + Math.round(r() * 8) }, "mmHg");
    }
    if (offset % 9 === 0) pushSymptom(db, mother, t, "joint_pain", "joint pain");
    if (offset === 2) pushSymptom(db, mother, t, "sleep_problem", "trouble sleeping");
  }
}

function seedDerived(db: Db, personIds: string[]): void {
  // Lazy-require so this module has no import cycle with the engines.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { recomputeScore, upsertDailyFeatures } = require("./analysis") as typeof import("./analysis");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { remember } = require("./memory") as typeof import("./memory");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runNightly } = require("./jobs") as typeof import("./jobs");

  for (const pid of personIds) {
    for (let offset = 30; offset >= 0; offset--) {
      const past = day(offset);
      try {
        upsertDailyFeatures(pid, dateStr(past));
        recomputeScore(pid, past);
      } catch (err) {
        console.error("[docmate] seed score failed", err);
      }
    }
    remember(pid, "seed", null, "Seeded demo history for the Docmate walkthrough.");
  }

  // Baselines, alerts, predictions and the retention sweep come from the same
  // nightly pipeline the live app runs, so the Console's job ledger has real
  // history and the seeded alerts carry proper rule IDs and evidence.
  try {
    runNightly("seed");
  } catch (err) {
    console.error("[docmate] seed nightly job failed", err);
  }
}
