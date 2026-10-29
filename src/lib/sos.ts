/**
 * SOS state machine (PRD 8.4).
 *
 * start → countdown (15 s, client-owned clock) → escalate (SMS + push + automated
 * call) → resolved | cancelled. The state machine takes no notice of network
 * availability: the screen opens and the event row is written first, messages
 * queue behind it.
 */

import { all, insert, j, one, run, uid, nowIso } from "./db";
import { sendSms } from "./adapters/sms";
import { sendPush } from "./adapters/push";
import { placeCall } from "./adapters/call";

export type SosTrigger = "rule" | "button" | "red_flag_distress";
export type SosStatus = "countdown" | "escalated" | "cancelled" | "resolved";

export type SosRow = {
  id: string;
  person_id: string;
  trigger: string;
  reason: string | null;
  started_at: string;
  cancelled_at: string | null;
  contacts_notified_json: string | null;
  location_json: string | null;
  outcome: string | null;
  created_at: string;
};

export const COUNTDOWN_SECONDS = 15;

export function startSos(
  personId: string,
  trigger: SosTrigger,
  reason: string,
  location?: Record<string, any> | null,
): SosRow {
  const row: SosRow = {
    id: uid("sos"),
    person_id: personId,
    trigger,
    reason,
    started_at: nowIso(),
    cancelled_at: null,
    contacts_notified_json: null,
    location_json: location ? JSON.stringify(location) : null,
    outcome: null,
    created_at: nowIso(),
  };
  insert("sos_events", row);
  return row;
}

export function getSos(id: string): SosRow | undefined {
  return one<SosRow>(`SELECT * FROM sos_events WHERE id = ?`, [id]);
}

export function cancelSos(id: string): SosRow | undefined {
  const row = getSos(id);
  if (!row) return undefined;
  run(`UPDATE sos_events SET cancelled_at = ?, outcome = ? WHERE id = ?`, [
    nowIso(),
    "cancelled",
    id,
  ]);
  return getSos(id);
}

export type Escalation = {
  notified: { name: string; phone: string; channel: string }[];
  callPlacedTo: string | null;
  reason: string;
};

export function escalateSos(id: string, reasonOverride?: string): Escalation {
  const row = getSos(id);
  if (!row) return { notified: [], callPlacedTo: null, reason: "" };

  const person = one<{ name: string }>(`SELECT name FROM persons WHERE id = ?`, [row.person_id]);
  const personName = person?.name ?? "A Docmate user";
  const contacts = all<{ name: string; phone: string }>(
    `SELECT name, phone FROM emergency_contacts WHERE person_id = ? ORDER BY priority ASC`,
    [row.person_id],
  );
  const loc = j<Record<string, any> | null>(row.location_json, null);
  const when = new Date(row.started_at).toLocaleString("en-IN");
  const reason = reasonOverride || row.reason || "Emergency reported";
  const body =
    `EMERGENCY — ${personName} triggered a Docmate SOS at ${when}. Reason: ${reason}.` +
    (loc?.label ? ` Last location: ${loc.label}.` : "") +
    ` Please call back now. In an emergency dial 108.`;

  const notified: Escalation["notified"] = [];
  for (const c of contacts) {
    sendSms(c.phone, body, c.name, { sosId: row.id, level: 4 });
    sendPush(null, `SOS: ${personName} needs help`, body, { sosId: row.id, level: 4 });
    notified.push({ name: c.name, phone: c.phone, channel: "sms+push" });
  }

  let callPlacedTo: string | null = null;
  if (contacts[0]) {
    placeCall(contacts[0].phone, { personName, reason, when, location: loc?.label ?? null }, contacts[0].name);
    callPlacedTo = contacts[0].phone;
  }

  run(`UPDATE sos_events SET contacts_notified_json = ?, outcome = ? WHERE id = ?`, [
    JSON.stringify(notified),
    "escalated",
    id,
  ]);

  return { notified, callPlacedTo, reason };
}

export function finalizeSos(id: string, outcome: string): void {
  run(`UPDATE sos_events SET outcome = ? WHERE id = ?`, [outcome, id]);
}

export function listSos(personId: string, limit = 20): SosRow[] {
  return all<SosRow>(
    `SELECT * FROM sos_events WHERE person_id = ? ORDER BY started_at DESC LIMIT ?`,
    [personId, limit],
  );
}

export function activeSos(personId: string): SosRow | undefined {
  return one<SosRow>(
    `SELECT * FROM sos_events WHERE person_id = ? AND outcome IS NULL ORDER BY started_at DESC LIMIT 1`,
    [personId],
  );
}

/** Post-event timeline summary offered to the doctor (PRD 8.4). */
export function sosSummary(personId: string, id: string) {
  const row = getSos(id);
  if (!row) return null;
  const since = new Date(new Date(row.started_at).getTime() - 6 * 3600000).toISOString();
  const symptoms = all<any>(
    `SELECT symptom, severity_words, red_flag, ts FROM symptoms WHERE person_id = ? AND ts >= ? ORDER BY ts ASC`,
    [personId, since],
  );
  const vitals = all<any>(
    `SELECT type, value_json, ts FROM vitals WHERE person_id = ? AND ts >= ? ORDER BY ts ASC`,
    [personId, since],
  );
  const distress = all<any>(
    `SELECT distress_0_100, created_at FROM acoustic_features WHERE person_id = ? AND created_at >= ? ORDER BY created_at ASC`,
    [personId, since],
  );
  return { sos: row, windowHours: 6, symptoms, vitals, distress };
}
