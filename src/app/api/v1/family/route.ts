/**
 * Family space (PRD 9).
 * GET  → the family this account belongs to, its members, my sharing grants
 *        and the family health score built only from granted scores.
 * POST → create a family (the creator becomes the Family Admin).
 */

import crypto from "node:crypto";
import { all, boot, insert, nowIso, one, run, uid } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { familyScore } from "@/lib/score";
import { recomputeScore } from "@/lib/analysis";
import { generateCode } from "@/lib/seed";
import { SHAREABLE_CATEGORIES } from "@/lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHAREABLE = SHAREABLE_CATEGORIES;

function myMembership(accountId: string) {
  return one<any>(
    `SELECT fm.*, f.name AS family_name, f.admin_account_id, f.code_expires_at
       FROM family_members fm JOIN families f ON f.id = fm.family_id
      WHERE fm.account_id = ? ORDER BY fm.created_at DESC LIMIT 1`,
    [accountId],
  );
}

export async function GET() {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const membership = myMembership(session.accountId);
    if (!membership) return ok({ family: null, members: [], familyScore: null });

    const codeRow = one<{ value: string }>(`SELECT value FROM app_meta WHERE key = ?`, [
      `family_code_${membership.family_id}`,
    ]);

    const members = all<any>(
      `SELECT fm.id, fm.person_id, fm.account_id, fm.role, fm.status, fm.relation,
              p.name, p.dob, p.is_managed
         FROM family_members fm JOIN persons p ON p.id = fm.person_id
        WHERE fm.family_id = ? ORDER BY fm.created_at ASC`,
      [membership.family_id],
    ).map((m) => {
      const grants = all<{ category: string; granted: number }>(
        `SELECT category, granted FROM sharing_grants
          WHERE subject_person_id = ? AND family_id = ? AND revoked_at IS NULL`,
        [m.person_id, membership.family_id],
      );
      const granted = grants.filter((g) => g.granted && g.category !== "__paused__").map((g) => g.category);
      const paused = grants.some((g) => g.category === "__paused__" && g.granted);
      const s = recomputeScore(m.person_id);
      const score = s.status === "ok" ? s.score ?? s.raw : s.raw;
      const lastJ = one<{ created_at: string }>(
        `SELECT created_at FROM journal_entries WHERE person_id = ? ORDER BY date DESC LIMIT 1`,
        [m.person_id],
      ) ?? one<{ created_at: string }>(
        `SELECT created_at FROM vitals WHERE person_id = ? ORDER BY ts DESC LIMIT 1`,
        [m.person_id],
      );
      const age = m.dob ? Math.max(0, Math.floor((Date.now() - new Date(m.dob).getTime()) / (365.25 * 86400000))) : null;

      return {
        id: m.id,
        personId: m.person_id,
        name: m.name,
        role: m.role,
        status: m.status,
        relation: m.relation,
        isManaged: !!m.is_managed,
        isMe: m.account_id === session.accountId && !m.is_managed,
        granted,
        paused,
        score: score != null ? Math.round(score) : null,
        age,
        lastNoteAt: lastJ?.created_at ?? null,
      };
    });

    const scoreMembers = members.filter((m) => m.granted.includes("score"));
    const scores = scoreMembers.map((m) => m.score);
    const fam = familyScore(scores);

    return ok({
      family: {
        id: membership.family_id,
        name: membership.family_name,
        code: codeRow?.value ?? "DOCM47",
        codeExpiresAt: membership.code_expires_at,
        adminAccountId: membership.admin_account_id,
        isAdmin: membership.admin_account_id === session.accountId,
        myRole: membership.role,
      },
      members,
      familyScore: fam,
    });
  } catch (err) {
    console.error("[family.get]", err);
    return serverError();
  }
}

export async function DELETE(req: Request) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const url = new URL(req.url);
    const memberId = url.searchParams.get("memberId");
    if (!memberId) return badRequest("Missing memberId");
    run(`DELETE FROM family_members WHERE id = ?`, [memberId]);
    return ok({ deleted: true });
  } catch (err) {
    console.error("[family.delete]", err);
    return serverError();
  }
}

export async function POST(req: Request) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    if (myMembership(session.accountId)) return badRequest("You are already in a family space.");

    const b = await body<{ name?: string; personId?: string }>(req);
    const name = String(b.name ?? "").trim() || "My Family";
    const person = b.personId
      ? one<{ id: string }>(`SELECT id FROM persons WHERE id = ? AND account_id = ?`, [b.personId, session.accountId])
      : one<{ id: string }>(`SELECT id FROM persons WHERE account_id = ? AND is_managed = 0 LIMIT 1`, [session.accountId]);
    if (!person) return badRequest("Create your own profile before starting a family space.");

    const familyId = uid("fam");
    const code = generateCode(8);
    insert("families", {
      id: familyId,
      name,
      admin_account_id: session.accountId,
      code_hash: crypto.createHash("sha256").update(code).digest("hex"),
      code_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      auto_approve_until: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    insert("app_meta", { key: `family_code_${familyId}`, value: code, updated_at: nowIso() });

    insert("family_members", {
      id: uid("fmm"),
      family_id: familyId,
      person_id: person.id,
      account_id: session.accountId,
      role: "admin",
      status: "active",
      relation: "self",
      joined_at: nowIso(),
      created_at: nowIso(),
    });
    for (const c of SHAREABLE) {
      insert("sharing_grants", {
        id: uid("sgr"),
        subject_person_id: person.id,
        viewer_account_id: null,
        family_id: familyId,
        category: c,
        granted: 1,
        expires_at: null,
        revoked_at: null,
        created_at: nowIso(),
      });
    }

    return ok({ familyId, name, code }, { status: 201 });
  } catch (err) {
    console.error("[family.post]", err);
    return serverError();
  }
}
