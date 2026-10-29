/**
 * Person scope guard (PRD 13.1, blueprint §8).
 *
 * Every person-scoped read/write goes through here. The guard resolves
 * personId → ownership, family sharing grant, or active doctor link, and
 * refuses everything else with 403. Health modules never see an unscoped query.
 */

import { NextResponse } from "next/server";
import { all, one } from "./db";
import { forbidden, notFound } from "./api";
import { getSession, type SessionUser } from "./session";
import { audit, type AuditSource } from "./audit";

export type PersonRow = {
  id: string;
  account_id: string;
  claimed_by_account_id: string | null;
  name: string;
  dob: string | null;
  sex_at_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  relation_to_owner: string | null;
  is_managed: number;
  preferred_voice: string | null;
  checkin_time: string;
  retention_days: number;
  completeness: number;
  onboarded: number;
  created_at: string;
  updated_at: string;
};

/** Categories that can be shared with family (PRD 9.1 — journal text/audio and cycle never are). */
export const SHAREABLE_CATEGORIES = ["score", "alerts", "vitals", "reports", "family_insights"] as const;
export const DOCTOR_CATEGORIES = ["score", "vitals", "journal_summaries", "reports", "alerts"] as const;

export type Access = {
  person: PersonRow;
  role: "owner" | "family" | "doctor";
  source: AuditSource;
  categories: string[];
  viewerAccountId: string;
  linkId?: string;
};

export function getPerson(personId: string): PersonRow | undefined {
  return one<PersonRow>(`SELECT * FROM persons WHERE id = ?`, [personId]);
}

/** Persons the account owns (incl. managed profiles) — the switcher list base. */
export function ownedPersons(accountId: string): PersonRow[] {
  return all<PersonRow>(
    `SELECT * FROM persons WHERE account_id = ? OR claimed_by_account_id = ? ORDER BY created_at ASC`,
    [accountId, accountId],
  );
}

function activeFamilyCategories(accountId: string, personId: string): string[] | null {
  const member = one<{ family_id: string }>(
    `SELECT family_id FROM family_members WHERE account_id = ? AND status = 'active' LIMIT 1`,
    [accountId],
  );
  if (!member) return null;
  const subjectMember = one<{ id: string }>(
    `SELECT id FROM family_members WHERE family_id = ? AND person_id = ? LIMIT 1`,
    [member.family_id, personId],
  );
  if (!subjectMember) return null;
  const grants = all<{ category: string }>(
    `SELECT category FROM sharing_grants
      WHERE subject_person_id = ? AND family_id = ? AND granted = 1
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`,
    [personId, member.family_id, new Date().toISOString()],
  );
  const paused = one<{ id: string }>(
    `SELECT id FROM sharing_grants WHERE subject_person_id = ? AND family_id = ? AND category = '__paused__'
        AND granted = 0 AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`,
    [personId, member.family_id, new Date().toISOString()],
  );
  if (paused) return [];
  if (!grants.length) return null;
  return [...new Set(grants.map((g) => g.category))];
}

function doctorCategories(accountId: string, personId: string): { categories: string[]; linkId: string } | null {
  const doc = one<{ id: string }>(`SELECT id FROM doctors WHERE account_id = ? LIMIT 1`, [accountId]);
  if (!doc) return null;
  const link = one<{
    id: string;
    scope_json: string;
    starts_at: string;
    ends_at: string | null;
    revoked_at: string | null;
    status: string;
  }>(
    `SELECT * FROM doctor_links WHERE person_id = ? AND doctor_id = ? ORDER BY created_at DESC LIMIT 1`,
    [personId, doc.id],
  );
  if (!link) return null;
  if (link.status !== "active" || link.revoked_at) return null;
  const now = Date.now();
  if (new Date(link.starts_at).getTime() > now) return null;
  if (link.ends_at && new Date(link.ends_at).getTime() <= now) return null;
  let cats: string[] = [];
  try {
    const parsed = JSON.parse(link.scope_json);
    cats = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.categories) ? parsed.categories : [];
  } catch {
    cats = [];
  }
  return { categories: cats, linkId: link.id };
}

/**
 * Resolve access. Returns null when the account has no ownership, grant or
 * active doctor link for this person.
 */
export function resolvePerson(personId: string, accountId: string): Access | null {
  const person = getPerson(personId);
  if (!person) return null;

  if (person.account_id === accountId || person.claimed_by_account_id === accountId) {
    return {
      person,
      role: "owner",
      source: "owner",
      categories: [...SHAREABLE_CATEGORIES, "journal", "cycle", "audio"],
      viewerAccountId: accountId,
    };
  }

  const fam = activeFamilyCategories(accountId, personId);
  if (fam) {
    audit(accountId, personId, "family_view", "family");
    return { person, role: "family", source: "family", categories: fam, viewerAccountId: accountId };
  }

  const doc = doctorCategories(accountId, personId);
  if (doc) {
    audit(accountId, personId, "doctor_view", "doctor");
    return {
      person,
      role: "doctor",
      source: "doctor",
      categories: doc.categories,
      viewerAccountId: accountId,
      linkId: doc.linkId,
    };
  }

  return null;
}

export type ScopeResult = { ok: true; access: Access } | { ok: false; res: NextResponse };

/** Route-handler helper: current session + resolved access, else the right error. */
export async function requirePerson(personId: string, sessionIn?: SessionUser): Promise<ScopeResult> {
  const session = sessionIn ?? (await getSession());
  if (!session) return { ok: false, res: forbidden("Sign in to continue.") };
  const person = getPerson(personId);
  if (!person) return { ok: false, res: notFound("Person not found.") };
  const access = resolvePerson(personId, session.accountId);
  if (!access) return { ok: false, res: forbidden() };
  return { ok: true, access };
}

export function canSee(access: Access, category: string): boolean {
  if (access.role === "owner") return true;
  return access.categories.includes(category);
}
