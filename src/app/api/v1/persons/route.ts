/**
 * Persons list + creation (PRD 4.2, 5).
 *  GET  → every person the signed-in account may open (owned, family, doctor).
 *  POST → create an own or managed profile from the onboarding answers.
 */

import { all, boot, insert, nowIso, one, run, uid } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getPerson, ownedPersons, type PersonRow } from "@/lib/scope";
import { ageFrom } from "@/lib/analysis";
import { getNotificationSettings } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PersonCard = {
  id: string;
  name: string;
  relation: string | null;
  isManaged: boolean;
  dob: string | null;
  age: number | null;
  sex: string | null;
  role: "owner" | "family" | "doctor";
  avatarTone: string;
  score?: number | null;
};

const TONES = ["mint", "terracotta", "sage", "mintDim"];

function toneFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return TONES[h % TONES.length];
}

function toCard(p: PersonRow, role: "owner" | "family" | "doctor"): PersonCard {
  const lastScore = one<{ score: number | null; raw_score: number | null }>(
    `SELECT score, raw_score FROM health_scores WHERE person_id = ? ORDER BY date DESC LIMIT 1`,
    [p.id],
  );
  const score = lastScore ? (lastScore.score ?? lastScore.raw_score ?? null) : null;
  return {
    id: p.id,
    name: p.name,
    relation: p.relation_to_owner,
    isManaged: !!p.is_managed,
    dob: p.dob,
    age: ageFrom(p.dob),
    sex: p.sex_at_birth,
    role,
    avatarTone: toneFor(p.id),
    score: score != null ? Math.round(score) : null,
  };
}

/** Everyone this account can open — used to build the person switcher. */
function visiblePersons(accountId: string): PersonCard[] {
  const seen = new Set<string>();
  const cards: PersonCard[] = [];
  for (const p of ownedPersons(accountId)) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    cards.push(toCard(p, "owner"));
  }

  // Family members shared into a family this account belongs to.
  const fam = one<{ family_id: string }>(
    `SELECT family_id FROM family_members WHERE account_id = ? AND status = 'active' LIMIT 1`,
    [accountId],
  );
  if (fam) {
    const shares = all<{ person_id: string }>(
      `SELECT DISTINCT subject_person_id AS person_id FROM sharing_grants
        WHERE family_id = ? AND granted = 1 AND revoked_at IS NULL
          AND category <> '__paused__'
          AND (expires_at IS NULL OR expires_at > ?)`,
      [fam.family_id, nowIso()],
    );
    for (const s of shares) {
      if (seen.has(s.person_id)) continue;
      const p = getPerson(s.person_id);
      if (!p) continue;
      seen.add(p.id);
      cards.push(toCard(p, "family"));
    }
  }

  // Patients linked to this doctor.
  const doc = one<{ id: string }>(`SELECT id FROM doctors WHERE account_id = ? LIMIT 1`, [accountId]);
  if (doc) {
    const links = all<{ person_id: string }>(
      `SELECT DISTINCT person_id FROM doctor_links
        WHERE doctor_id = ? AND status = 'active' AND revoked_at IS NULL`,
      [doc.id],
    );
    for (const l of links) {
      if (seen.has(l.person_id)) continue;
      const p = getPerson(l.person_id);
      if (!p) continue;
      seen.add(p.id);
      cards.push(toCard(p, "doctor"));
    }
  }

  return cards;
}

export async function GET() {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    return ok({ persons: visiblePersons(session.accountId) });
  } catch (err) {
    console.error("[persons.list]", err);
    return serverError();
  }
}

type CreateBody = {
  name?: string;
  dob?: string;
  sex?: string;
  relation?: string;
  isManaged?: boolean;
  height_cm?: number;
  weight_kg?: number;
  work_status?: string;
  work_hours?: string;
  exercise_level?: string;
  sleep_band?: string;
  diet?: string;
  tobacco?: string;
  alcohol?: string;
  preferred_voice?: string;
  checkin_time?: string;
  conditions?: string[];
  medicines?: { name: string; dosage?: string }[];
  allergies?: string[];
  emergencyContacts?: { name: string; phone: string }[];
};

export async function POST(req: Request) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();

    const b = await body<CreateBody>(req);
    const name = String(b.name ?? "").trim();
    if (name.length < 2) return badRequest("Please enter a name (at least 2 letters).");

    const isManaged = !!b.isManaged;
    if (b.dob) {
      const age = ageFrom(b.dob);
      if (age === null || Number.isNaN(age)) return badRequest("That date of birth does not look right.");
      if (!isManaged && age < 13)
        return badRequest("Docmate is for people aged 13 and above. A parent or guardian can manage a profile instead.");
      if (age > 120) return badRequest("Please check the date of birth.");
    }

    // A person may only manage one own profile per account.
    if (!isManaged) {
      const own = one<{ id: string }>(
        `SELECT id FROM persons WHERE account_id = ? AND is_managed = 0 LIMIT 1`,
        [session.accountId],
      );
      if (own) {
        // The onboarding "about you" step is idempotent: update the existing self.
        run(
          `UPDATE persons SET name=?, dob=?, sex_at_birth=?, height_cm=?, weight_kg=?, work_status=?,
             work_hours=?, exercise_level=?, sleep_band=?, diet=?, tobacco=?, alcohol=?,
             preferred_voice=?, checkin_time=?, updated_at=? WHERE id=?`,
          [
            name, b.dob ?? null, b.sex ?? null, b.height_cm ?? null, b.weight_kg ?? null,
            b.work_status ?? null, b.work_hours ?? null, b.exercise_level ?? null, b.sleep_band ?? null,
            b.diet ?? null, b.tobacco ?? null, b.alcohol ?? null,
            b.preferred_voice ?? null, b.checkin_time ?? "21:00", nowIso(), own.id,
          ],
        );
        await applyExtras(own.id, b);
        getNotificationSettings(own.id);
        return ok({ person: toCard(getPerson(own.id)!, "owner"), created: false });
      }
    }

    const id = uid("p");
    insert("persons", {
      id,
      account_id: session.accountId,
      claimed_by_account_id: isManaged ? session.accountId : null,
      name,
      dob: b.dob ?? null,
      sex_at_birth: b.sex ?? null,
      height_cm: b.height_cm ?? null,
      weight_kg: b.weight_kg ?? null,
      work_status: b.work_status ?? null,
      work_hours: b.work_hours ?? null,
      exercise_level: b.exercise_level ?? null,
      sleep_band: b.sleep_band ?? null,
      diet: b.diet ?? null,
      tobacco: b.tobacco ?? null,
      alcohol: b.alcohol ?? null,
      relation_to_owner: b.relation ?? (isManaged ? "family" : "self"),
      is_managed: isManaged ? 1 : 0,
      preferred_voice: b.preferred_voice ?? null,
      checkin_time: b.checkin_time ?? "21:00",
      retention_days: 90,
      completeness: isManaged ? 40 : 30,
      onboarded: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    await applyExtras(id, b);
    getNotificationSettings(id);

    return ok({ person: toCard(getPerson(id)!, "owner"), created: true }, { status: 201 });
  } catch (err) {
    console.error("[persons.create]", err);
    return serverError();
  }
}

async function applyExtras(personId: string, b: CreateBody): Promise<void> {
  for (const c of b.conditions ?? []) {
    const n = String(c).trim();
    if (!n) continue;
    const dupe = one<{ id: string }>(`SELECT id FROM conditions WHERE person_id = ? AND name = ?`, [personId, n]);
    if (dupe) continue;
    insert("conditions", { id: uid("cond"), person_id: personId, name: n, status: "confirmed", source: "user", created_at: nowIso() });
  }
  for (const m of b.medicines ?? []) {
    const n = String(m?.name ?? "").trim();
    if (!n) continue;
    const dupe = one<{ id: string }>(`SELECT id FROM medicines WHERE person_id = ? AND name = ?`, [personId, n]);
    if (dupe) continue;
    insert("medicines", {
      id: uid("med"), person_id: personId, name: n,
      dosage_text: m.dosage ?? null, schedule_json: JSON.stringify({ times: ["08:00"] }),
      active: 1, created_at: nowIso(),
    });
  }
  for (const a of b.allergies ?? []) {
    const n = String(a).trim();
    if (!n) continue;
    const dupe = one<{ id: string }>(`SELECT id FROM allergies WHERE person_id = ? AND name = ?`, [personId, n]);
    if (dupe) continue;
    insert("allergies", { id: uid("alg"), person_id: personId, name: n, created_at: nowIso() });
  }
  let prio = 1;
  for (const c of b.emergencyContacts ?? []) {
    const n = String(c?.name ?? "").trim();
    const p = String(c?.phone ?? "").replace(/\D/g, "");
    if (!n || p.length < 10) continue;
    insert("emergency_contacts", {
      id: uid("ec"), person_id: personId, name: n, phone: p, priority: prio++,
      verified_at: nowIso(), created_at: nowIso(),
    });
  }
}
