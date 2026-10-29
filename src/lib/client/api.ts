"use client";

/** Thin fetch wrapper for the v1 envelope (PRD 16.1). */

export type ApiOk<T> = { ok: true; data: T; requestId: string };
export type ApiErr = { ok: false; error: { code: string; message: string; requestId: string } };

export class ApiError extends Error {
  code: string;
  status: number;
  requestId: string;
  constructor(message: string, code: string, status: number, requestId: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || !json?.ok) {
    const err = json?.error ?? {};
    throw new ApiError(
      err.message ?? "Something went wrong.",
      err.code ?? "error",
      res.status,
      err.requestId ?? "",
    );
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body?: any) => call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: any) => call<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => call<T>(path, { method: "DELETE" }),
};

/** Fire-and-forget analytics (never blocks the UI, never sends health text). */
export function track(name: string, meta?: Record<string, any>, screen?: string, language?: string) {
  try {
    void fetch("/api/v1/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, screen, language, meta }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
