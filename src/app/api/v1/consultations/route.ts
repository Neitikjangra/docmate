/**
 * Tele-consults (PRD 10.3).
 * GET  → consultations I booked, or, for a doctor, the ones booked with me.
 * POST → book a slot; makes sure a consent-scoped link exists, then charges
 *        through the payment adapter (simulated) with an idempotency key.
 */

import { all, boot, insert, nowIso, one, uid } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { charge } from "@/lib/adapters/payment";
import { recordOutbox } from "@/lib/adapters";
import { DOCTOR_CATEGORIES } from "@/lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINK_CATEGORIES = DOCTOR_CATEGORIES;
const MODES = ["video", "audio", "phone", "chat"];

export async function GET() {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const myDoctor = one<{ id: string }>(`SELECT id FROM doctors WHERE account_id = ? LIMIT 1`, [session.accountId]);

    const rows = myDoctor
      ? all<any>(
          `SELECT c.*, p.name AS person_name, d.name AS doctor_name, d.specialty
             FROM consultations c JOIN persons p ON p.id = c.person_id
             JOIN doctors d ON d.id = c.doctor_id
            WHERE c.doctor_id = ? ORDER BY c.slot DESC LIMIT 60`,
          [myDoctor.id],
        )
      : all<any>(
          `SELECT c.*, p.name AS person_name, d.name AS doctor_name, d.specialty
             FROM consultations c JOIN persons p ON p.id = c.person_id
             JOIN doctors d ON d.id = c.doctor_id
            WHERE p.account_id = ? OR p.claimed_by_account_id = ?
            ORDER BY c.slot DESC LIMIT 60`,
          [session.accountId, session.accountId],
        );

    return ok({
      consultations: rows.map((c) => ({
        id: c.id, personId: c.person_id, personName: c.person_name, doctorId: c.doctor_id,
        doctorName: c.doctor_name, specialty: c.specialty, slot: c.slot, mode: c.mode,
        status: c.status, amountInr: c.amount_inr, paymentRef: c.payment_ref, createdAt: c.created_at,
      })),
      asDoctor: !!myDoctor,
      modes: MODES,
    });
  } catch (err) {
    console.error("[consultations.get]", err);
    return serverError();
  }
}

export async function POST(req: Request) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const b = await body<{ personId?: string; doctorId?: string; doctorCode?: string; slot?: string; mode?: string }>(req);
    if (!b.personId) return badRequest("Missing personId.");
    if (!b.slot) return badRequest("Pick a time for the consult.");
    const mode = MODES.includes(String(b.mode)) ? String(b.mode) : "video";

    const person = one<{ id: string; name: string }>(
      `SELECT id, name FROM persons WHERE id = ? AND (account_id = ? OR claimed_by_account_id = ?)`,
      [b.personId, session.accountId, session.accountId],
    );
    if (!person) return badRequest("You can only book for a profile you own.");

    const doctor = b.doctorId
      ? one<any>(`SELECT * FROM doctors WHERE id = ?`, [b.doctorId])
      : one<any>(`SELECT * FROM doctors WHERE code = ?`, [String(b.doctorCode ?? "").trim().toUpperCase()]);
    if (!doctor) return badRequest("Choose a verified doctor.");

    // Ensure a live, consented link covers the consult.
    let link = one<any>(
      `SELECT * FROM doctor_links WHERE person_id = ? AND doctor_id = ? AND status = 'active' AND revoked_at IS NULL
        AND (ends_at IS NULL OR ends_at > ?) ORDER BY created_at DESC LIMIT 1`,
      [b.personId, doctor.id, nowIso()],
    );
    if (!link) {
      link = {
        id: uid("dl"),
        person_id: b.personId,
        doctor_id: doctor.id,
        scope_json: JSON.stringify({ categories: LINK_CATEGORIES }),
        starts_at: nowIso(),
        ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        revoked_at: null,
        status: "active",
        created_at: nowIso(),
      };
      insert("doctor_links", link);
    }

    const idempotencyKey = `consult_${b.personId}_${doctor.id}_${String(b.slot).slice(0, 16)}`;
    const pay = charge(doctor.fee_inr, idempotencyKey, {
      doctorName: doctor.name, personName: person.name, mode, slot: b.slot,
    });

    const id = uid("cons");
    insert("consultations", {
      id,
      person_id: b.personId,
      doctor_id: doctor.id,
      doctor_link_id: link.id,
      slot: String(b.slot),
      mode,
      status: "booked",
      payment_ref: pay.reference,
      amount_inr: doctor.fee_inr,
      notes_ref: null,
      prescription_ref: null,
      summary_json: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    recordOutbox({
      channel: "push",
      to: null,
      toLabel: doctor.name,
      subject: "New consult booked",
      body: `${person.name} booked a ${mode} consult with ${doctor.name} at ${b.slot}.`,
      meta: { consultationId: id, doctorId: doctor.id },
    });

    return ok(
      {
        consultation: {
          id, doctorName: doctor.name, specialty: doctor.specialty, personName: person.name,
          slot: b.slot, mode, status: "booked", amountInr: doctor.fee_inr, paymentRef: pay.reference,
        },
        payment: pay,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[consultations.post]", err);
    return serverError();
  }
}
