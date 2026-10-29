/**
 * JSON API envelope helpers (PRD 16.1).
 * Every response carries a `requestId`; every error is `{ code, message, requestId }`.
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";

export type ApiError = { code: string; message: string; requestId: string };

export function requestId(): string {
  return "req_" + crypto.randomBytes(8).toString("hex");
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data, requestId: requestId() }, init);
}

export function fail(status: number, code: string, message: string): NextResponse {
  const body: ApiError = { code, message, requestId: requestId() };
  return NextResponse.json({ ok: false, error: body }, { status });
}

export const unauthorized = (message = "Sign in to continue.") =>
  fail(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this person's data.") =>
  fail(403, "forbidden", message);
export const notFound = (message = "Not found.") => fail(404, "not_found", message);
export const badRequest = (message = "Invalid request.") => fail(400, "bad_request", message);
export const rateLimited = (message = "Too many attempts. Try again later.") =>
  fail(429, "rate_limited", message);
export const serverError = (message = "Something went wrong on our side.") =>
  fail(500, "server_error", message);

/** Cursor pagination helper (PRD 16.1): page through by `created_at`/`ts`. */
export function paginate<T extends { [k: string]: any }>(
  rows: T[],
  limit: number,
  cursorKey: string,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: String(last?.[cursorKey] ?? "") || null };
}

export async function body<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/** PII-scrubbed structured log — never write health content (PRD 15.3). */
export function logEvent(name: string, meta: Record<string, any> = {}): void {
  const safe: Record<string, any> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (["text", "transcript", "body", "journal", "content", "evidence"].includes(k)) continue;
    safe[k] = v;
  }
  // eslint-disable-next-line no-console
  console.log(`[docmate] ${name}`, JSON.stringify(safe));
}
