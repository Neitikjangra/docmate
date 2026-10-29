/**
 * Payment adapter for tele-consults (PRD 10.3).
 * Simulated driver returns a UPI-style reference; the idempotency key makes a
 * repeat booking with the same key a no-op returning the original reference.
 */

import { one } from "../db";
import { recordOutbox, type OutboxRow } from "./index";

export type ChargeResult = {
  status: "paid" | "already_paid";
  reference: string;
  amountInr: number;
  idempotencyKey: string;
  row?: OutboxRow;
};

function upiRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `upi_${s}`;
}

export function charge(
  amountInr: number,
  idempotencyKey: string,
  payload: Record<string, any>,
): ChargeResult {
  const existing = one<{ meta_json: string | null; body: string }>(
    `SELECT meta_json, body FROM outbox WHERE channel = 'payment' AND meta_json LIKE ? LIMIT 1`,
    [`%${idempotencyKey}%`],
  );
  if (existing) {
    let ref = "";
    try {
      ref = JSON.parse(existing.meta_json || "{}").reference ?? "";
    } catch {
      ref = "";
    }
    return { status: "already_paid", reference: ref, amountInr, idempotencyKey };
  }

  const reference = upiRef();
  const row = recordOutbox({
    channel: "payment",
    to: null,
    toLabel: payload.doctorName ?? "Doctor",
    subject: "Consult payment",
    body: `UPI ${reference} · ₹${amountInr} authorised for ${payload.doctorName ?? "consult"} (${payload.mode ?? "video"})`,
    meta: { reference, amountInr, idempotencyKey, ...payload },
  });
  return { status: "paid", reference, amountInr, idempotencyKey, row };
}
