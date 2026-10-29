/**
 * Adapter layer (plan §5).
 *
 * Every third-party wire (SMS, push, voice call, payment, cloud TTS) sits behind
 * a driver. The running driver is chosen by whether its env key is present, so
 * dropping a key into `.env.local` flips it to the live service with no code
 * change. With no key, the simulated driver records the exact payload it would
 * have sent into the `outbox` table, which the Simulation Console renders.
 */

import { all, insert, uid, nowIso, j } from "../db";

export type Channel = "otp" | "sms" | "push" | "call" | "payment" | "tts";

export type OutboxRow = {
  id: string;
  channel: string;
  to_addr: string | null;
  to_label: string | null;
  subject: string | null;
  body: string;
  meta_json: string | null;
  status: string;
  created_at: string;
};

export type DriverName = "simulated" | "live";

export type AdapterStatus = {
  service: string;
  channel: Channel;
  driver: DriverName;
  envKey: string;
  configured: boolean;
  label: string;
};

const SERVICES: { service: string; channel: Channel; envKey: string; label: string }[] = [
  { service: "SMS gateway", channel: "sms", envKey: "SMS_API_KEY", label: "Emergency + invite SMS" },
  { service: "Push service", channel: "push", envKey: "PUSH_API_KEY", label: "Alert notifications" },
  { service: "Voice call", channel: "call", envKey: "CALL_API_KEY", label: "Automated SOS call" },
  { service: "Payment gateway", channel: "payment", envKey: "PAYMENT_API_KEY", label: "Tele-consult booking" },
  { service: "Cloud TTS", channel: "tts", envKey: "TTS_API_KEY", label: "Spoken replies (browser fallback)" },
];

export function adapterStatus(): AdapterStatus[] {
  return SERVICES.map((s) => ({
    ...s,
    configured: !!process.env[s.envKey],
    driver: process.env[s.envKey] ? "live" : "simulated",
  }));
}

export function recordOutbox(row: {
  channel: Channel;
  to?: string | null;
  toLabel?: string | null;
  subject?: string | null;
  body: string;
  meta?: Record<string, any>;
  status?: string;
}): OutboxRow {
  const rec: OutboxRow = {
    id: uid("out"),
    channel: row.channel,
    to_addr: row.to ?? null,
    to_label: row.toLabel ?? null,
    subject: row.subject ?? null,
    body: row.body,
    meta_json: row.meta ? JSON.stringify(row.meta) : null,
    status: row.status ?? "delivered",
    created_at: nowIso(),
  };
  insert("outbox", rec);
  return rec;
}

export function outbox(channel?: Channel | Channel[], limit = 50): OutboxRow[] {
  if (!channel) {
    return all<OutboxRow>(`SELECT * FROM outbox ORDER BY created_at DESC LIMIT ?`, [limit]);
  }
  const list = Array.isArray(channel) ? channel : [channel];
  const marks = list.map(() => "?").join(",");
  return all<OutboxRow>(
    `SELECT * FROM outbox WHERE channel IN (${marks}) ORDER BY created_at DESC LIMIT ?`,
    [...list, limit],
  );
}

export function outboxMeta(row: OutboxRow): Record<string, any> {
  return j<Record<string, any>>(row.meta_json, {});
}
