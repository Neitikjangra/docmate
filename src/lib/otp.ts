/**
 * Phone-OTP authentication (PRD 14, 16.1).
 * 6-digit code · 5-minute TTL · resend after 30 s · 5 failed attempts locks the
 * number for 15 minutes. Codes are delivered through the Simulation Console.
 */

import { all, insert, one, run, uid, nowIso } from "./db";

export const OTP_TTL_MIN = 5;
export const MAX_ATTEMPTS = 5;
export const LOCK_MIN = 15;
export const RESEND_SECONDS = 30;

export type OtpRequestResult =
  | { ok: true; code: string; expiresAt: string; purpose: string }
  | { ok: false; error: "rate_limited" | "locked"; retryAfter?: number; lockedUntil?: string };

export function normalizePhone(input: string): string {
  const digits = String(input || "").replace(/[^\d]/g, "");
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function sixDigits(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function requestOtp(phoneRaw: string, purpose = "login"): OtpRequestResult {
  const phone = normalizePhone(phoneRaw);
  const now = Date.now();

  const open = one<{ locked_until: string | null }>(
    `SELECT locked_until FROM otp_codes WHERE phone = ? AND consumed = 0 ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  if (open?.locked_until && new Date(open.locked_until).getTime() > now) {
    return { ok: false, error: "locked", lockedUntil: open.locked_until };
  }

  const latest = one<{ created_at: string }>(
    `SELECT created_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  if (latest) {
    const elapsed = (now - new Date(latest.created_at).getTime()) / 1000;
    if (elapsed < RESEND_SECONDS) {
      return { ok: false, error: "rate_limited", retryAfter: Math.ceil(RESEND_SECONDS - elapsed) };
    }
  }

  run(`UPDATE otp_codes SET consumed = 1 WHERE phone = ? AND consumed = 0`, [phone]);

  const code = sixDigits();
  const expiresAt = new Date(now + OTP_TTL_MIN * 60000).toISOString();
  insert("otp_codes", {
    id: uid("otp"),
    phone,
    code,
    purpose,
    attempts: 0,
    locked_until: null,
    expires_at: expiresAt,
    consumed: 0,
    created_at: nowIso(),
  });

  return { ok: true, code, expiresAt, purpose };
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "expired" | "incorrect" | "locked"; attemptsLeft?: number; lockedUntil?: string };

export function verifyOtp(phoneRaw: string, code: string, purpose = "login"): OtpVerifyResult {
  const phone = normalizePhone(phoneRaw);
  const now = Date.now();
  const row = one<{
    id: string;
    code: string;
    attempts: number;
    locked_until: string | null;
    expires_at: string;
  }>(
    `SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND consumed = 0 ORDER BY created_at DESC LIMIT 1`,
    [phone, purpose],
  );

  if (!row) return { ok: false, error: "not_found" };
  if (row.locked_until && new Date(row.locked_until).getTime() > now) {
    return { ok: false, error: "locked", lockedUntil: row.locked_until };
  }
  if (new Date(row.expires_at).getTime() < now) return { ok: false, error: "expired" };

  if (String(code).trim() !== row.code) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      const lockedUntil = new Date(now + LOCK_MIN * 60000).toISOString();
      run(`UPDATE otp_codes SET attempts = ?, locked_until = ?, consumed = 1 WHERE id = ?`, [
        attempts,
        lockedUntil,
        row.id,
      ]);
      return { ok: false, error: "locked", lockedUntil };
    }
    run(`UPDATE otp_codes SET attempts = ? WHERE id = ?`, [attempts, row.id]);
    return { ok: false, error: "incorrect", attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  run(`UPDATE otp_codes SET consumed = 1 WHERE id = ?`, [row.id]);
  return { ok: true };
}

export type OtpInboxRow = {
  id: string;
  phone: string;
  code: string;
  purpose: string;
  attempts: number;
  locked_until: string | null;
  expires_at: string;
  consumed: number;
  created_at: string;
  state: "active" | "used" | "expired" | "locked";
};

export function otpInbox(limit = 40): OtpInboxRow[] {
  const rows = all<OtpInboxRow>(`SELECT * FROM otp_codes ORDER BY created_at DESC LIMIT ?`, [limit]);
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    state:
      r.locked_until && new Date(r.locked_until).getTime() > now
        ? "locked"
        : r.consumed
          ? "used"
          : new Date(r.expires_at).getTime() < now
            ? "expired"
            : "active",
  }));
}

export function attemptsLastHour(phoneRaw: string): number {
  const phone = normalizePhone(phoneRaw);
  const since = new Date(Date.now() - 3600000).toISOString();
  const row = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM otp_codes WHERE phone = ? AND created_at >= ?`,
    [phone, since],
  );
  return row?.c ?? 0;
}
