import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, insert, nowIso, run, uid } from "@/lib/db";
import { canSee, requirePerson, resolvePerson } from "@/lib/scope";

let accountA: string;
let accountB: string;
let personA: string;
let personB: string;
let familyId: string;
let grantId: string | null = null;

function makeAccount(): string {
  const id = uid("isoa");
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
  return id;
}

function makePerson(accountId: string, name: string): string {
  const id = uid("isop");
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
  return id;
}

beforeAll(() => {
  boot();
  accountA = makeAccount();
  accountB = makeAccount();
  personA = makePerson(accountA, "Isolation A");
  personB = makePerson(accountB, "Isolation B");

  // A family both accounts are active members of; A's person is a subject.
  // NOTE: no grant is created yet — the negative case must be real.
  familyId = uid("isofam");
  insert("families", {
    id: familyId,
    name: "Isolation Family",
    admin_account_id: accountA,
    code_hash: "iso-hash",
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  insert("family_members", {
    id: uid("isofm"),
    family_id: familyId,
    person_id: personB,
    account_id: accountB,
    role: "member",
    status: "active",
    relation: "sibling",
    joined_at: nowIso(),
    created_at: nowIso(),
  });
  insert("family_members", {
    id: uid("isofm"),
    family_id: familyId,
    person_id: personA,
    account_id: accountA,
    role: "admin",
    status: "active",
    relation: "self",
    joined_at: nowIso(),
    created_at: nowIso(),
  });
});

afterAll(() => {
  run(`DELETE FROM access_audit WHERE subject_person_id = ?`, [personA]);
  run(`DELETE FROM sharing_grants WHERE subject_person_id = ?`, [personA]);
  if (familyId) run(`DELETE FROM family_members WHERE family_id = ?`, [familyId]);
  if (familyId) run(`DELETE FROM families WHERE id = ?`, [familyId]);
  run(`DELETE FROM persons WHERE id IN (?, ?)`, [personA, personB]);
  run(`DELETE FROM accounts WHERE id IN (?, ?)`, [accountA, accountB]);
});

describe("per-person data isolation", () => {
  it("resolves the owner but refuses a stranger with no grant", async () => {
    // owner still sees their own person, including private categories
    const owner = resolvePerson(personA, accountA);
    expect(owner).not.toBeNull();
    expect(owner?.role).toBe("owner");
    expect(canSee(owner!, "journal")).toBe(true);

    // account B owns nothing here and has no grant: no access at all
    expect(resolvePerson(personA, accountB)).toBeNull();

    // therefore the route helper refuses with 403
    const refused = await requirePerson(personA, { accountId: accountB, isDoctor: false });
    expect(refused.ok).toBe(false);
  });

  it("grants family access to exactly the shared categories", () => {
    grantId = uid("isogr");
    insert("sharing_grants", {
      id: grantId,
      subject_person_id: personA,
      viewer_account_id: null,
      family_id: familyId,
      category: "score",
      granted: 1,
      expires_at: null,
      revoked_at: null,
      created_at: nowIso(),
    });

    const access = resolvePerson(personA, accountB);
    expect(access).not.toBeNull();
    expect(access?.role).toBe("family");
    expect(canSee(access!, "score")).toBe(true);
    // journal text / audio / cycle are never shareable with family
    expect(canSee(access!, "journal")).toBe(false);
    expect(canSee(access!, "cycle")).toBe(false);
    expect(canSee(access!, "audio")).toBe(false);
  });

  it("removes access again once the grant is revoked", () => {
    expect(grantId).toBeTruthy();
    run(`UPDATE sharing_grants SET revoked_at = ? WHERE id = ?`, [nowIso(), grantId]);
    expect(resolvePerson(personA, accountB)).toBeNull();
  });
});
