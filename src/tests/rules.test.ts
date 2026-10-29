import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, getDb, insert, nowIso, run, uid } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { loadRuleDefs, runRules } from "@/lib/analysis";

const SEEDED_RULES = [
  "BP-01",
  "SUG-01",
  "SUG-02",
  "SYM-01",
  "SYM-02",
  "SLP-01",
  "MED-01",
  "MIS-01",
  "MOOD-01",
];

const createdAccounts: string[] = [];
const createdPersons: string[] = [];

function makeAccount(): string {
  const id = uid("tacc");
  insert("accounts", {
    id,
    phone: `9${Math.floor(Math.random() * 1e9)
      .toString()
      .padStart(9, "0")}`,
    language: "en",
    status: "active",
    is_doctor: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  createdAccounts.push(id);
  return id;
}

function makePerson(accountId: string, name: string): string {
  const id = uid("tper");
  insert("persons", {
    id,
    account_id: accountId,
    name,
    checkin_time: "21:00",
    retention_days: 90,
    completeness: 0,
    onboarded: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  createdPersons.push(id);
  return id;
}

/** A person whose logged data is an emergency BP reading plus a nearby symptom. */
function seedEmergency(personId: string, now: Date): void {
  insert("vitals", {
    id: uid("tvit"),
    person_id: personId,
    ts: now.toISOString(),
    type: "bp",
    value_json: JSON.stringify({ systolic: 185, diastolic: 125 }),
    unit: "mmHg",
    source: "typed",
    confirmed: 1,
    held: 0,
    created_at: now.toISOString(),
  });
  insert("symptoms", {
    id: uid("tsym"),
    person_id: personId,
    symptom: "headache",
    severity_words: "headache",
    red_flag: 0,
    ts: now.toISOString(),
    created_at: now.toISOString(),
  });
}

beforeAll(() => {
  boot();
  ensureSeed(getDb());
});

afterAll(() => {
  for (const pid of createdPersons) {
    for (const table of [
      "vitals",
      "symptoms",
      "conditions",
      "medicine_events",
      "daily_features",
      "baselines",
      "health_scores",
      "alerts",
      "notifications",
      "access_audit",
    ]) {
      const column = table === "access_audit" ? "subject_person_id" : "person_id";
      run(`DELETE FROM ${table} WHERE ${column} = ?`, [pid]);
    }
    run(`DELETE FROM persons WHERE id = ?`, [pid]);
  }
  for (const aid of createdAccounts) run(`DELETE FROM accounts WHERE id = ?`, [aid]);
});

describe("versioned rule engine", () => {
  it("loads the 9 seeded rules, each versioned and clinically reviewed", () => {
    const defs = loadRuleDefs();
    expect(defs).toHaveLength(9);
    const ids = defs.map((r) => r.id);
    for (const id of SEEDED_RULES) expect(ids).toContain(id);

    for (const r of defs) {
      expect(r.id).toBeTruthy();
      expect(r.version).toBeTruthy();
      expect(typeof r.level).toBe("number");
      const reviewed = (r as any).reviewedBy ?? (r as any).reviewed_by;
      expect(reviewed).toBeTruthy();
    }
  });

  it("fires a level-4 BP-01 outcome for an emergency reading with a nearby symptom", () => {
    const account = makeAccount();
    const person = makePerson(account, "Rule test emergency");
    const now = new Date();
    seedEmergency(person, now);

    const { outcomes } = runRules(person, "on_log", now);
    const bp = outcomes.find((o) => o.ruleId === "BP-01");
    expect(bp).toBeTruthy();
    expect(bp?.level).toBe(4);
    expect(bp?.evidence).toBeTruthy();
    expect((bp?.evidence as any).reading.systolic).toBe(185);
    expect((bp?.evidence as any).threshold).toBe("180/120 mmHg");
  });

  it("gives every returned outcome the fields that make it auditable", () => {
    const account = makeAccount();
    const person = makePerson(account, "Rule test audit");
    const now = new Date();
    seedEmergency(person, now);

    const { outcomes } = runRules(person, "on_log", now);
    expect(outcomes.length).toBeGreaterThan(0);
    for (const o of outcomes) {
      expect(o.ruleId).toBeTruthy();
      expect(o.ruleVersion).toBeTruthy();
      expect(typeof o.level).toBe("number");
      expect(o.evidence).toBeTypeOf("object");
      expect(o.evidence).not.toBeNull();
    }
  });

  it("does not fire a rule whose min_data requirement is unmet", () => {
    const account = makeAccount();
    const person = makePerson(account, "Rule test sparse");
    const now = new Date();

    insert("conditions", {
      id: uid("tcnd"),
      person_id: person,
      name: "Hypertension",
      status: "confirmed",
      source: "user",
      since: "2015",
      created_at: nowIso(),
    });

    // a single old BP reading: MIS-01 requires min_data.vitals >= 2
    const old = new Date(now.getTime() - 15 * 86400000);
    insert("vitals", {
      id: uid("tvit"),
      person_id: person,
      ts: old.toISOString(),
      type: "bp",
      value_json: JSON.stringify({ systolic: 148, diastolic: 94 }),
      unit: "mmHg",
      source: "typed",
      confirmed: 1,
      held: 0,
      created_at: old.toISOString(),
    });

    const { outcomes } = runRules(person, "nightly", now);
    expect(outcomes.map((o) => o.ruleId)).not.toContain("MIS-01");
  });
});
