/**
 * Single person: read, update, delete (PRD 5.4, 15.5).
 * Deletion cascades every row that carries person_id, then removes the profile.
 */

import { all, boot, insert, nowIso, one, run, uid } from "@/lib/db";
import { badRequest, body, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { canSee, requirePerson } from "@/lib/scope";
import { ageFrom } from "@/lib/analysis";
import { listAlerts } from "@/lib/alerts";
import { auditList } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

const PERSON_TABLES = [
  "conditions", "medicines", "allergies", "emergency_contacts", "recordings", "transcripts",
  "acoustic_features", "journal_entries", "symptoms", "vitals", "medicine_events", "reports",
  "cycle_entries", "daily_features", "baselines", "health_scores", "alerts", "notifications",
  "notification_settings", "sos_events", "predictions", "memory_vectors", "graph_nodes",
  "graph_edges", "sharing_grants", "doctor_links", "consultations", "doctor_messages",
];

export async function GET(_req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    const { access } = guard;
    const p = access.person as any;

    const je = one<any>(`SELECT * FROM journal_entries WHERE person_id = ? ORDER BY date DESC LIMIT 1`, [personId]);

    return ok({
      person: {
        id: p.id,
        name: p.name,
        dob: p.dob,
        age: ageFrom(p.dob),
        sex: p.sex_at_birth,
        height_cm: p.height_cm,
        weight_kg: p.weight_kg,
        relation: p.relation_to_owner,
        isManaged: !!p.is_managed,
        work_status: p.work_status,
        work_hours: p.work_hours,
        exercise_level: p.exercise_level,
        sleep_band: p.sleep_band,
        diet: p.diet,
        tobacco: p.tobacco,
        alcohol: p.alcohol,
        preferred_voice: p.preferred_voice,
        checkin_time: p.checkin_time,
        retention_days: p.retention_days,
        completeness: p.completeness,
        onboarded: !!p.onboarded,
        blood_group: p.blood_group || "O+",
        bp_top: p.bp_top ?? 138,
        bp_bottom: p.bp_bottom ?? 86,
      },
      role: access.role,
      categories: access.categories,
      conditions: all<{ id: string; name: string; since: string | null }>(
        `SELECT id, name, since FROM conditions WHERE person_id = ? ORDER BY created_at ASC`,
        [personId],
      ),
      medicines: all<any>(
        `SELECT id, name, dosage_text, active FROM medicines WHERE person_id = ? AND active = 1`,
        [personId],
      ),
      allergies: all<{ id: string; name: string }>(`SELECT id, name FROM allergies WHERE person_id = ?`, [personId]),
      emergencyContacts: canSee(access, "alerts")
        ? all<{ id: string; name: string; phone: string; priority: number }>(
            `SELECT id, name, phone, priority FROM emergency_contacts WHERE person_id = ? ORDER BY priority ASC`,
            [personId],
          )
        : [],
      latestJournal: je ?? null,
      alertCount: canSee(access, "alerts") ? listAlerts(personId, 100).length : 0,
      audit: canSee(access, "alerts") ? auditList(personId, 20).map(anonymiseAudit) : [],
    });
  } catch (err) {
    console.error("[person.get]", err);
    return serverError();
  }
}

function anonymiseAudit(a: any) {
  return { id: a.id, source: a.source, category: a.category, ts: a.ts };
}

type PatchBody = {
  name?: string;
  dob?: string;
  age?: number;
  sex?: string;
  relation?: string;
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
  retention_days?: number;
  onboarded?: boolean;
  completeness?: number;
  blood_group?: string;
  bp_top?: number;
  bp_bottom?: number;
  conditions?: string[];
  medicines?: string[] | string;
  allergies?: string[];
  emergencyContacts?: { name: string; phone: string }[];
};

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId, session);
    if (!guard.ok) return guard.res;
    if (guard.access.role !== "owner") return forbidden("Only the owner can edit this profile.");

    const b = await body<PatchBody>(req);
    if (b.name !== undefined && String(b.name).trim().length < 2) return badRequest("Please enter a valid name.");
    if (b.dob) {
      const age = ageFrom(b.dob);
      if (age === null || age < 13 || age > 120) return badRequest("Please check the date of birth.");
    }

    const cols: Record<string, any> = {};
    const map: [keyof PatchBody, string][] = [
      ["name", "name"], ["dob", "dob"], ["sex", "sex_at_birth"], ["relation", "relation_to_owner"],
      ["height_cm", "height_cm"], ["weight_kg", "weight_kg"], ["work_status", "work_status"],
      ["work_hours", "work_hours"], ["exercise_level", "exercise_level"], ["sleep_band", "sleep_band"],
      ["diet", "diet"], ["tobacco", "tobacco"], ["alcohol", "alcohol"],
      ["preferred_voice", "preferred_voice"], ["checkin_time", "checkin_time"],
      ["retention_days", "retention_days"], ["completeness", "completeness"],
      ["blood_group", "blood_group"], ["bp_top", "bp_top"], ["bp_bottom", "bp_bottom"],
    ];
    for (const [k, col] of map) if (b[k] !== undefined) cols[col] = b[k];
    if (b.age !== undefined && Number(b.age) > 0) {
      cols.dob = `${new Date().getFullYear() - Number(b.age)}-01-01`;
    }
    if (b.onboarded !== undefined) cols.onboarded = b.onboarded ? 1 : 0;
    cols.updated_at = nowIso();

    run(
      `UPDATE persons SET ${Object.keys(cols).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
      [...Object.values(cols), personId],
    );

    if (b.conditions) {
      run(`DELETE FROM conditions WHERE person_id = ?`, [personId]);
      for (const c of b.conditions) {
        const n = String(c).trim();
        if (!n) continue;
        insert("conditions", { id: uid("cond"), person_id: personId, name: n, status: "confirmed", source: "user", created_at: nowIso() });
      }
    }
    if (b.medicines !== undefined) {
      run(`DELETE FROM medicines WHERE person_id = ?`, [personId]);
      const meds = Array.isArray(b.medicines)
        ? b.medicines
        : String(b.medicines).split(",").map((s) => s.trim()).filter(Boolean);
      for (const m of meds) {
        const n = String(m).trim();
        if (!n) continue;
        insert("medicines", { id: uid("med"), person_id: personId, name: n, active: 1, created_at: nowIso() });
      }
    }
    if (b.allergies) {
      run(`DELETE FROM allergies WHERE person_id = ?`, [personId]);
      for (const a of b.allergies) {
        const n = String(a).trim();
        if (!n) continue;
        insert("allergies", { id: uid("alg"), person_id: personId, name: n, created_at: nowIso() });
      }
    }
    if (b.emergencyContacts) {
      run(`DELETE FROM emergency_contacts WHERE person_id = ?`, [personId]);
      let prio = 1;
      for (const c of b.emergencyContacts) {
        const n = String(c?.name ?? "").trim();
        const p = String(c?.phone ?? "").replace(/\D/g, "");
        if (!n || p.length < 10) continue;
        insert("emergency_contacts", {
          id: uid("ec"), person_id: personId, name: n, phone: p, priority: prio++,
          verified_at: nowIso(), created_at: nowIso(),
        });
      }
    }

    return ok({ updated: true });
  } catch (err) {
    console.error("[person.patch]", err);
    return serverError();
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId, session);
    if (!guard.ok) return guard.res;
    if (guard.access.role !== "owner") return forbidden("Only the owner can delete this profile.");
    if (!one<{ id: string }>(`SELECT id FROM persons WHERE id = ?`, [personId])) return notFound();

    for (const t of PERSON_TABLES) run(`DELETE FROM ${t} WHERE person_id = ?`, [personId]);
    run(`DELETE FROM onboarding_state WHERE account_id = ?`, [personId]);
    run(`DELETE FROM persons WHERE id = ?`, [personId]);

    return ok({ deleted: true });
  } catch (err) {
    console.error("[person.delete]", err);
    return serverError();
  }
}
