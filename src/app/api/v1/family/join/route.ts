/** Join a family with a code (PRD 9.1). */

import crypto from "node:crypto";
import { boot, insert, nowIso, one, uid } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { SHAREABLE_CATEGORIES } from "@/lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHAREABLE = SHAREABLE_CATEGORIES;

export async function POST(req: Request) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();

    const existing = one<{ id: string }>(
      `SELECT id FROM family_members WHERE account_id = ? LIMIT 1`,
      [session.accountId],
    );
    if (existing) return badRequest("You are already in a family space.");

    const b = await body<{ code?: string; personId?: string; relation?: string }>(req);
    const code = String(b.code ?? "").trim().toUpperCase();
    if (code.length < 6) return badRequest("That join code does not look right.");

    const hash = crypto.createHash("sha256").update(code).digest("hex");
    const family = one<any>(`SELECT * FROM families WHERE code_hash = ?`, [hash]);
    if (!family) return badRequest("No family found for that code.");
    if (family.code_expires_at && new Date(family.code_expires_at).getTime() < Date.now())
      return badRequest("That code has expired. Ask the family admin for a new one.");

    const person = b.personId
      ? one<{ id: string }>(`SELECT id FROM persons WHERE id = ? AND account_id = ?`, [b.personId, session.accountId])
      : one<{ id: string }>(`SELECT id FROM persons WHERE account_id = ? AND is_managed = 0 LIMIT 1`, [session.accountId]);
    if (!person) return badRequest("Create your own profile before joining a family.");

    insert("family_members", {
      id: uid("fmm"),
      family_id: family.id,
      person_id: person.id,
      account_id: session.accountId,
      role: "member",
      status: "active",
      relation: b.relation ?? "family",
      joined_at: nowIso(),
      created_at: nowIso(),
    });

    // A new member starts fully private: no grants until they choose to share.
    for (const c of SHAREABLE) {
      insert("sharing_grants", {
        id: uid("sgr"),
        subject_person_id: person.id,
        viewer_account_id: null,
        family_id: family.id,
        category: c,
        granted: 0,
        expires_at: null,
        revoked_at: null,
        created_at: nowIso(),
      });
    }

    return ok({ joined: true, familyId: family.id, familyName: family.name, isAdmin: false });
  } catch (err) {
    console.error("[family.join]", err);
    return serverError();
  }
}
