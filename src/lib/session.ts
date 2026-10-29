/**
 * Session handling (PRD 14): HMAC-signed HTTP-only cookie.
 * 15-minute access token + 30-day rotating refresh, no server-side session store.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";

const DATA_DIR = path.join(process.cwd(), "data");
const KEY_FILE = path.join(DATA_DIR, ".session.key");

export const ACCESS_COOKIE = "dm_at";
export const REFRESH_COOKIE = "dm_rt";
export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_S = 30 * 24 * 3600;

let cached: string | null = null;

function secret(): string {
  if (cached) return cached;
  if (process.env.SESSION_SECRET) return (cached = process.env.SESSION_SECRET);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(KEY_FILE)) cached = fs.readFileSync(KEY_FILE, "utf8").trim();
  else {
    cached = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(KEY_FILE, cached, { mode: 0o600 });
  }
  return cached;
}

export type SessionPayload = {
  sub: string; // account id
  typ: "access" | "refresh";
  doctor?: boolean;
  iat: number;
  exp: number;
};

export type SessionUser = { accountId: string; isDoctor: boolean };

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signToken(
  payload: Pick<SessionPayload, "sub" | "typ" | "doctor">,
  ttlSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const access = verifyToken(jar.get(ACCESS_COOKIE)?.value);
  if (access && access.typ === "access") {
    return { accountId: access.sub, isDoctor: !!access.doctor };
  }
  const refresh = verifyToken(jar.get(REFRESH_COOKIE)?.value);
  if (refresh && refresh.typ === "refresh") {
    return { accountId: refresh.sub, isDoctor: !!refresh.doctor };
  }
  return null;
}

export async function setSession(accountId: string, isDoctor = false): Promise<void> {
  const jar = await cookies();
  const base = { path: "/", httpOnly: true, sameSite: "lax" as const };
  jar.set(ACCESS_COOKIE, signToken({ sub: accountId, typ: "access", doctor: isDoctor }, ACCESS_TTL_S), {
    ...base,
    maxAge: ACCESS_TTL_S,
  });
  jar.set(REFRESH_COOKIE, signToken({ sub: accountId, typ: "refresh", doctor: isDoctor }, REFRESH_TTL_S), {
    ...base,
    maxAge: REFRESH_TTL_S,
  });
}

export async function refreshSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const refresh = verifyToken(jar.get(REFRESH_COOKIE)?.value);
  if (!refresh || refresh.typ !== "refresh") return null;
  await setSession(refresh.sub, !!refresh.doctor);
  return { accountId: refresh.sub, isDoctor: !!refresh.doctor };
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
