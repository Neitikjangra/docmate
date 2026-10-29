/**
 * Sharing grants — the owner decides, per category, what the family can see
 * (PRD 9.2, 12.1). Journal text and audio are never shareable; the UI never
 * offers them and this route refuses them outright.
 */

import { all, boot, insert, nowIso, one, run, uid } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { SHAREABLE_CATEGORIES } from "@/lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHAREABLE = SHAREABLE_CATEGORIES;

const NEVER_SHAREABLE = new Set(["journal", "audio", "cycle", "journal_text"]);

export async function GET() {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const rows = all<any>(
      `SELECT sg.*, p.name AS person_name FROM sharing_grants sg
         JOIN persons p ON p.id = sg.subject_person_id
        WHERE p.account_id = ? OR p.claimed_by_account_id = ?
        ORDER BY p.created_at ASC`,
      [session.accountId, session.accountId],
    );
    const byPerson = new Map<string, { personId: string; name: string; granted: string[]; paused: boolean }>();
    for (const r of rows) {
      if (!byPerson.has(r.subject_person_id))
        byPerson.set(r.subject_person_id, { personId: r.subject_person_id, name: r.person_name, granted: [], paused: false });
      const entry = byPerson.get(r.subject_person_id)!;
      if (r.category === "__paused__") entry.paused = !!r.granted;
      else if (r.granted && !r.revoked_at) entry.granted.push(r.category);
    }
    return ok({ shareable: SHAREABLE, neverShareable: [...NEVER_SHAREABLE], persons: [...byPerson.values()] });
  } catch (err) {
    console.error("[grants.get]", err);
    return serverError();
  }
}

export async function PATCH(req: Request) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const b = await body<{ personId?: string; categories?: string[]; paused?: boolean }>(req);
    if (!b.personId) return badRequest("Missing personId.");
    const person = one<{ id: string }>(
      `SELECT id FROM persons WHERE id = ? AND (account_id = ? OR claimed_by_account_id = ?)`,
      [b.personId, session.accountId, session.accountId],
    );
    if (!person) return badRequest("You can only change sharing for a profile you own.");

    const member = one<{ family_id: string }>(
      `SELECT family_id FROM family_members WHERE account_id = ? AND status = 'active' LIMIT 1`,
      [session.accountId],
    );
    if (!member) return badRequest("You are not in a family space yet.");
    const familyId = member.family_id;

    if (b.paused !== undefined) {
      const existing = one<{ id: string }>(
        `SELECT id FROM sharing_grants WHERE subject_person_id = ? AND family_id = ? AND category = '__paused__'`,
        [b.personId, familyId],
      );
      if (existing) run(`UPDATE sharing_grants SET granted = ?, revoked_at = NULL WHERE id = ?`, [b.paused ? 1 : 0, existing.id]);
      else
        insert("sharing_grants", {
          id: uid("sgr"),
          subject_person_id: b.personId,
          viewer_account_id: null,
          family_id: familyId,
          category: "__paused__",
          granted: b.paused ? 1 : 0,
          expires_at: null,
          revoked_at: null,
          created_at: nowIso(),
        });
    }

    if (b.categories) {
      for (const c of b.categories) {
        if (NEVER_SHAREABLE.has(c)) return badRequest(`${c} can never be shared with family.`);
      }
      for (const c of SHAREABLE) {
        const want = b.categories.includes(c);
        const existing = one<{ id: string }>(
          `SELECT id FROM sharing_grants WHERE subject_person_id = ? AND family_id = ? AND category = ?`,
          [b.personId, familyId, c],
        );
        if (existing) run(`UPDATE sharing_grants SET granted = ?, revoked_at = NULL WHERE id = ?`, [want ? 1 : 0, existing.id]);
        else
          insert("sharing_grants", {
            id: uid("sgr"),
            subject_person_id: b.personId,
            viewer_account_id: null,
            family_id: familyId,
            category: c,
            granted: want ? 1 : 0,
            expires_at: null,
            revoked_at: null,
            created_at: nowIso(),
          });
      }
    }

    return ok({ updated: true });
  } catch (err) {
    console.error("[grants.patch]", err);
    return serverError();
  }
}
