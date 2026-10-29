/**
 * Access audit log (PRD 9.1, 10.2, 15.4).
 * Written on every cross-person read: family views, doctor views, exports.
 * The profile owner can see this list in Profile → "Who can see my data".
 */

import { all, insert, uid, nowIso } from "./db";

export type AuditSource = "family" | "doctor" | "export" | "owner" | "system";

export function audit(
  viewerAccountId: string,
  subjectPersonId: string,
  category: string,
  source: AuditSource,
): void {
  insert("access_audit", {
    id: uid("aud"),
    viewer_account_id: viewerAccountId,
    subject_person_id: subjectPersonId,
    category,
    source,
    ts: nowIso(),
  });
}

export type AuditRow = {
  id: string;
  viewer_account_id: string;
  subject_person_id: string;
  category: string;
  source: string;
  ts: string;
};

export function auditList(personId: string, limit = 50): AuditRow[] {
  return all<AuditRow>(
    `SELECT * FROM access_audit WHERE subject_person_id = ? ORDER BY ts DESC LIMIT ?`,
    [personId, limit],
  );
}
