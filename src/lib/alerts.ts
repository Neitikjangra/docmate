/**
 * Alert creation + notification policy (PRD 8.1, 8.3).
 *
 * Rules never send anything. They produce outcomes; this module decides what
 * becomes an alert and whether it is allowed to notify:
 *   · L1/L2  → in-app only, never a notification.
 *   · L3     → 1 pattern notification per person per day, quiet hours 22:00–07:00
 *              (holds until morning), 72 h dedupe unless it worsens.
 *   · L4     → exempt from cap, quiet hours and the L3 toggle.
 */

import { all, insert, j, one, run, uid, nowIso } from "./db";
import type { RuleOutcome } from "./rules/engine";
import { sendPush } from "./adapters/push";
import { sendSms } from "./adapters/sms";

export type AlertRow = {
  id: string;
  person_id: string;
  rule_id: string;
  rule_version: string;
  level: number;
  title: string;
  evidence_json: string;
  confidence: string;
  status: string;
  dedupe_key: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type NotificationSettings = {
  person_id: string;
  level3_enabled: number;
  level4_enabled: number;
  detailed_preview: number;
  quiet_start: string;
  quiet_end: string;
  daily_reminder: number;
  reminder_time: string;
};

const HOUR = 3600000;

export function getNotificationSettings(personId: string): NotificationSettings {
  const existing = one<NotificationSettings>(
    `SELECT * FROM notification_settings WHERE person_id = ?`,
    [personId],
  );
  if (existing) return existing;
  const row: NotificationSettings = {
    person_id: personId,
    level3_enabled: 1,
    level4_enabled: 1,
    detailed_preview: 0,
    quiet_start: "22:00",
    quiet_end: "07:00",
    daily_reminder: 1,
    reminder_time: "21:00",
  };
  insert("notification_settings", row);
  return row;
}

export function setNotificationSettings(personId: string, patch: Partial<NotificationSettings>): NotificationSettings {
  getNotificationSettings(personId);
  const keys = Object.keys(patch).filter((k) => k !== "person_id");
  if (keys.length) {
    run(
      `UPDATE notification_settings SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE person_id = ?`,
      [...keys.map((k) => (patch as any)[k]), personId],
    );
  }
  return getNotificationSettings(personId);
}

/** Local minutes-since-midnight for a quiet-hours comparison. */
function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
function parseHM(s: string): number {
  const [h, m] = String(s || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
export function inQuietHours(now: Date, start: string, end: string): boolean {
  const cur = minutesOfDay(now);
  const s = parseHM(start);
  const e = parseHM(end);
  if (s === e) return false;
  if (s < e) return cur >= s && cur < e;
  return cur >= s || cur < e; // wraps midnight (22:00 → 07:00)
}

export type PolicyDecision = { send: boolean; reason?: string; waitUntilMorning?: boolean };

export function policyDecision(
  level: number,
  settings: NotificationSettings,
  now: Date,
  opts: { notifiedToday: number; hasEmergencyContact: boolean },
): PolicyDecision {
  if (level <= 2) return { send: false, reason: "level_low" };

  if (level === 4) {
    // L4 is non-disableable while an emergency contact exists.
    if (!opts.hasEmergencyContact) return { send: false, reason: "no_emergency_contact" };
    if (!settings.level4_enabled && opts.hasEmergencyContact) {
      // Toggle cannot switch off a life-safety alert.
    }
    return { send: true };
  }

  // ---- L3
  if (!settings.level3_enabled) return { send: false, reason: "toggle_off" };
  if (inQuietHours(now, settings.quiet_start, settings.quiet_end)) {
    return { send: false, reason: "quiet_hours", waitUntilMorning: true };
  }
  if (opts.notifiedToday >= 1) return { send: false, reason: "daily_cap" };
  return { send: true };
}

export function createAlertFromOutcome(
  personId: string,
  outcome: RuleOutcome,
  now = new Date(),
): AlertRow | null {
  const recent = one<AlertRow>(
    `SELECT * FROM alerts WHERE person_id = ? AND dedupe_key = ? ORDER BY created_at DESC LIMIT 1`,
    [personId, outcome.dedupeKey],
  );
  if (recent) {
    const age = now.getTime() - new Date(recent.created_at).getTime();
    const worsened = outcome.level > recent.level;
    if (!worsened && age < 72 * HOUR) return null; // 72 h dedupe
  }

  const row: AlertRow = {
    id: uid("alert"),
    person_id: personId,
    rule_id: outcome.ruleId,
    rule_version: outcome.ruleVersion,
    level: outcome.level,
    title: outcome.title,
    evidence_json: JSON.stringify(outcome.evidence),
    confidence: outcome.confidence,
    status: "new",
    dedupe_key: outcome.dedupeKey,
    created_at: nowIso(),
    resolved_at: null,
  };
  insert("alerts", row);
  return row;
}

export function notifiedTodayCount(personId: string, now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const row = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM notifications
      WHERE person_id = ? AND sent_at IS NOT NULL AND sent_at >= ?`,
    [personId, start.toISOString()],
  );
  return row?.c ?? 0;
}

function recipients(personId: string): { accountId: string | null; label: string; phone: string | null }[] {
  const person = one<{ account_id: string; claimed_by_account_id: string | null }>(
    `SELECT account_id, claimed_by_account_id FROM persons WHERE id = ?`,
    [personId],
  );
  const ownerAccount = person?.account_id ?? null;
  const out: { accountId: string | null; label: string; phone: string | null }[] = [];
  if (ownerAccount) out.push({ accountId: ownerAccount, label: "Account owner", phone: null });
  const contacts = all<{ name: string; phone: string }>(
    `SELECT name, phone FROM emergency_contacts WHERE person_id = ? ORDER BY priority ASC`,
    [personId],
  );
  for (const c of contacts) out.push({ accountId: null, label: c.name, phone: c.phone });
  return out;
}

export function hasEmergencyContact(personId: string): boolean {
  return !!one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM emergency_contacts WHERE person_id = ?`,
    [personId],
  )?.c;
}

export type NotifyResult = { sent: number; suppressed: number; decision: PolicyDecision };

/** Emit notifications for an alert, honouring the policy. Writes the audit trail. */
export function notifyForAlert(alert: AlertRow, now = new Date()): NotifyResult {
  const settings = getNotificationSettings(alert.person_id);
  const decision = policyDecision(alert.level, settings, now, {
    notifiedToday: notifiedTodayCount(alert.person_id, now),
    hasEmergencyContact: hasEmergencyContact(alert.person_id),
  });

  const person = one<{ name: string }>(`SELECT name FROM persons WHERE id = ?`, [alert.person_id]);
  const recips = recipients(alert.person_id);
  const detailed = !!settings.detailed_preview;
  const pushTitle = detailed ? alert.title : "Docmate alert";
  const pushBody = detailed
    ? `${person?.name ?? "Someone you care for"}: ${alert.title}`
    : `A health alert needs your attention for ${person?.name ?? "someone you care for"}. Open Docmate.`;

  if (!decision.send) {
    for (const r of recips) {
      insert("notifications", {
        id: uid("ntf"),
        alert_id: alert.id,
        person_id: alert.person_id,
        recipient_account_id: r.accountId,
        recipient_label: r.label,
        channel: r.phone && alert.level === 4 ? "sms" : "push",
        title: pushTitle,
        body: pushBody,
        meta_json: JSON.stringify({ ruleId: alert.rule_id, level: alert.level }),
        sent_at: null,
        suppressed_reason: decision.reason ?? "suppressed",
        created_at: nowIso(),
      });
    }
    return { sent: 0, suppressed: recips.length, decision };
  }

  let sent = 0;
  for (const r of recips) {
    const useSms = alert.level === 4 && r.phone;
    const channel = useSms ? "sms" : "push";
    insert("notifications", {
      id: uid("ntf"),
      alert_id: alert.id,
      person_id: alert.person_id,
      recipient_account_id: r.accountId,
      recipient_label: r.label,
      channel,
      title: pushTitle,
      body: pushBody,
      meta_json: JSON.stringify({ ruleId: alert.rule_id, level: alert.level, detailed }),
      sent_at: nowIso(),
      suppressed_reason: null,
      created_at: nowIso(),
    });
    if (useSms) sendSms(r.phone!, pushBody, r.label, { ruleId: alert.rule_id, level: alert.level });
    else sendPush(null, pushTitle, pushBody, { ruleId: alert.rule_id, level: alert.level });
    sent++;
  }
  return { sent, suppressed: 0, decision };
}

/** Full pipeline used by the log route and the nightly job. */
export function processOutcomes(
  personId: string,
  outcomes: RuleOutcome[],
  now = new Date(),
): { created: AlertRow[]; notified: number } {
  const created: AlertRow[] = [];
  let notified = 0;
  for (const outcome of outcomes) {
    const alert = createAlertFromOutcome(personId, outcome, now);
    if (alert) {
      created.push(alert);
      const res = notifyForAlert(alert, now);
      notified += res.sent;
    }
  }
  return { created, notified };
}

export function listAlerts(personId: string, limit = 50): AlertRow[] {
  return all<AlertRow>(
    `SELECT * FROM alerts WHERE person_id = ? ORDER BY created_at DESC LIMIT ?`,
    [personId, limit],
  );
}

export function listNotifications(personId: string, limit = 50) {
  return all<any>(
    `SELECT * FROM notifications WHERE person_id = ? ORDER BY created_at DESC LIMIT ?`,
    [personId, limit],
  );
}

export function alertEvidence(alert: AlertRow): Record<string, any> {
  return j<Record<string, any>>(alert.evidence_json, {});
}

export function resolveAlert(alertId: string, status: "useful" | "false_alarm" | "resolved"): void {
  run(`UPDATE alerts SET status = ?, resolved_at = ? WHERE id = ?`, [status, nowIso(), alertId]);
}
