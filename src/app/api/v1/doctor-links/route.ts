/**
 * Doctor directory + links (PRD 10.1, 12.2).
 * GET  /doctors            → verified directory, searchable
 * GET  /doctor-links       → links I own as a patient, or patients linked to me
 * POST /doctor-links       → grant a consent-scoped link (time-boxed)
 * DELETE /doctor-links?id= → revoke immediately
 */

import { all, boot, insert, nowIso, one, run, uid } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { DOCTOR_CATEGORIES } from "@/lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINK_CATEGORIES = DOCTOR_CATEGORIES;

export async function GET(req: Request) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const specialty = (url.searchParams.get("specialty") ?? "").trim();

    let doctors = all<any>(
      `SELECT id, name, specialty, languages, availability, verified_at, fee_inr, rating,
              experience_years, bio, registration_no, council, code, clinic
         FROM doctors WHERE verified_at IS NOT NULL ORDER BY rating DESC`,
    );
    if (specialty) doctors = doctors.filter((d) => d.specialty === specialty);
    if (q)
      doctors = doctors.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.specialty.toLowerCase().includes(q) ||
          (d.languages ?? "").toLowerCase().includes(q),
      );

    const specialties = [...new Set(all<{ specialty: string }>(`SELECT DISTINCT specialty FROM doctors`).map((s) => s.specialty))];

    // Patient-side links.
    const myDoctor = one<{ id: string }>(`SELECT id FROM doctors WHERE account_id = ? LIMIT 1`, [session.accountId]);
    let links: any[] = [];
    if (myDoctor) {
      links = all<any>(
        `SELECT dl.*, p.name AS person_name, d.name AS doctor_name, d.specialty
           FROM doctor_links dl
           JOIN persons p ON p.id = dl.person_id
           JOIN doctors d ON d.id = dl.doctor_id
          WHERE dl.doctor_id = ? ORDER BY dl.created_at DESC`,
        [myDoctor.id],
      ).map((l) => ({ ...l, scope: safe(l.scope_json), isPatient: false }));
    } else {
      links = all<any>(
        `SELECT dl.*, p.name AS person_name, d.name AS doctor_name, d.specialty
           FROM doctor_links dl
           JOIN persons p ON p.id = dl.person_id
           JOIN doctors d ON d.id = dl.doctor_id
          WHERE p.account_id = ? OR p.claimed_by_account_id = ?
          ORDER BY dl.created_at DESC`,
        [session.accountId, session.accountId],
      ).map((l) => ({ ...l, scope: safe(l.scope_json), isPatient: true }));
    }

    return ok({
      doctors: doctors.map((d) => ({
        id: d.id, name: d.name, specialty: d.specialty, languages: d.languages,
        availability: d.availability, feeInr: d.fee_inr, rating: d.rating,
        experienceYears: d.experience_years, bio: d.bio,
        registrationNo: d.registration_no, council: d.council, code: d.code,
        clinic: d.clinic,
        verified: !!d.verified_at,
      })),
      specialties,
      links: links.map((l) => ({
        id: l.id, personId: l.person_id, personName: l.person_name, doctorId: l.doctor_id,
        doctorName: l.doctor_name, specialty: l.specialty, scope: l.scope,
        status: l.status, startsAt: l.starts_at, endsAt: l.ends_at, revokedAt: l.revoked_at,
        isPatient: l.isPatient, createdAt: l.created_at,
      })),
      linkCategories: LINK_CATEGORIES,
    });
  } catch (err) {
    console.error("[doctors.get]", err);
    return serverError();
  }
}

export async function POST(req: Request) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const b = await body<{ personId?: string; doctorCode?: string; doctorId?: string; categories?: string[]; days?: number; note?: string }>(req);
    if (!b.personId) return badRequest("Missing personId.");

    const person = one<{ id: string; name: string }>(
      `SELECT id, name FROM persons WHERE id = ? AND (account_id = ? OR claimed_by_account_id = ?)`,
      [b.personId, session.accountId, session.accountId],
    );
    if (!person) return badRequest("You can only link a doctor to a profile you own.");

    const doctor = b.doctorId
      ? one<any>(`SELECT * FROM doctors WHERE id = ?`, [b.doctorId])
      : one<any>(`SELECT * FROM doctors WHERE code = ?`, [String(b.doctorCode ?? "").trim().toUpperCase()]);
    if (!doctor) return badRequest("No verified doctor found for that code.");
    if (!doctor.verified_at) return badRequest("That doctor is not verified yet.");

    const categories = (b.categories ?? [...LINK_CATEGORIES]).filter((c: string) =>
      (LINK_CATEGORIES as readonly string[]).includes(c),
    );
    if (!categories.length) return badRequest("Choose at least one thing to share.");

    const days = Math.min(365, Math.max(1, Number(b.days ?? 30)));
    const startsAt = nowIso();
    const endsAt = new Date(Date.now() + days * 86400000).toISOString();

    // Revoke any previous live link so the newest scope always wins.
    run(
      `UPDATE doctor_links SET status = 'revoked', revoked_at = ? WHERE person_id = ? AND doctor_id = ? AND status = 'active'`,
      [nowIso(), b.personId, doctor.id],
    );

    const id = uid("dl");
    const note = String(b.note ?? "").trim();
    insert("doctor_links", {
      id,
      person_id: b.personId,
      doctor_id: doctor.id,
      scope_json: JSON.stringify({ categories, note }),
      starts_at: startsAt,
      ends_at: endsAt,
      revoked_at: null,
      status: "active",
      created_at: nowIso(),
    });
    audit(session.accountId, b.personId, "doctor_link_created", "owner");

    const accessCode = `DOCM-${id.slice(-5).toUpperCase()}`;
    return ok({ id, accessCode, doctorName: doctor.name, categories, endsAt }, { status: 201 });
  } catch (err) {
    console.error("[doctor-links.post]", err);
    return serverError();
  }
}

export async function DELETE(req: Request) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const url = new URL(req.url);
    if (url.searchParams.get("all") === "true") {
      const personId = url.searchParams.get("personId");
      if (personId) {
        run(
          `UPDATE doctor_links SET status = 'revoked', revoked_at = ? WHERE person_id = ? AND status = 'active'`,
          [nowIso(), personId],
        );
      } else {
        run(
          `UPDATE doctor_links SET status = 'revoked', revoked_at = ?
             WHERE person_id IN (SELECT id FROM persons WHERE account_id = ? OR claimed_by_account_id = ?) AND status = 'active'`,
          [nowIso(), session.accountId, session.accountId],
        );
      }
      return ok({ revoked: true, all: true });
    }

    const id = url.searchParams.get("id");
    if (!id) return badRequest("Missing link id.");

    const link = one<{ id: string; person_id: string }>(`SELECT id, person_id FROM doctor_links WHERE id = ?`, [id]);
    if (!link) return badRequest("That link no longer exists.");
    const owns = one<{ id: string }>(
      `SELECT id FROM persons WHERE id = ? AND (account_id = ? OR claimed_by_account_id = ?)`,
      [link.person_id, session.accountId, session.accountId],
    );
    if (!owns) return badRequest("You can only revoke a link you granted.");

    run(`UPDATE doctor_links SET status = 'revoked', revoked_at = ? WHERE id = ?`, [nowIso(), id]);
    audit(session.accountId, link.person_id, "doctor_link_revoked", "owner");
    return ok({ revoked: true });
  } catch (err) {
    console.error("[doctor-links.delete]", err);
    return serverError();
  }
}

function safe(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : Array.isArray(v?.categories) ? v.categories : [];
  } catch {
    return [];
  }
}
