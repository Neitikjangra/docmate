import { ok, unauthorized, badRequest, body } from "@/lib/api";
import { boot, insert, one, run, nowIso, uid } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Onboarding resume state (PRD 4.2). Every completed step is stored server-side
 * so quitting mid-flow and reloading continues where the user stopped.
 */

export async function GET() {
  boot();
  const session = await getSession();
  if (!session) return unauthorized();

  const state = one<{ step: number; data_json: string }>(
    `SELECT step, data_json FROM onboarding_state WHERE account_id = ?`,
    [session.accountId],
  );
  const account = one<{ language: string; consent_at: string | null }>(
    `SELECT language, consent_at FROM accounts WHERE id = ?`,
    [session.accountId],
  );

  let data: Record<string, unknown> = {};
  try {
    data = state ? JSON.parse(state.data_json) : {};
  } catch {
    data = {};
  }
  return ok({
    step: state?.step ?? 0,
    data,
    language: account?.language ?? "en",
    consentGiven: !!account?.consent_at,
  });
}

export async function PATCH(req: Request) {
  boot();
  const session = await getSession();
  if (!session) return unauthorized();

  const payload = await body<{ step?: number; data?: Record<string, unknown>; language?: string }>(req);
  if (payload.step !== undefined && (typeof payload.step !== "number" || payload.step < 0 || payload.step > 8)) {
    return badRequest("Invalid onboarding step.");
  }

  const existing = one<{ step: number; data_json: string }>(
    `SELECT step, data_json FROM onboarding_state WHERE account_id = ?`,
    [session.accountId],
  );
  let data: Record<string, unknown> = {};
  try {
    data = existing ? JSON.parse(existing.data_json) : {};
  } catch {
    data = {};
  }
  if (payload.data) data = { ...data, ...payload.data };

  const step = payload.step ?? existing?.step ?? 0;
  if (existing) {
    run(`UPDATE onboarding_state SET step = ?, data_json = ?, updated_at = ? WHERE account_id = ?`, [
      step,
      JSON.stringify(data),
      nowIso(),
      session.accountId,
    ]);
  } else {
    insert("onboarding_state", {
      account_id: session.accountId,
      step,
      data_json: JSON.stringify(data),
      updated_at: nowIso(),
    });
  }

  if (payload.language) {
    run(`UPDATE accounts SET language = ?, updated_at = ? WHERE id = ?`, [
      payload.language,
      nowIso(),
      session.accountId,
    ]);
  }

  // Consent is stored before any health row is written (PRD 4.3).
  if (payload.data?.consentGiven === true) {
    const account = one<{ consent_at: string | null }>(`SELECT consent_at FROM accounts WHERE id = ?`, [
      session.accountId,
    ]);
    if (!account?.consent_at) {
      run(`UPDATE accounts SET consent_version = ?, consent_at = ?, updated_at = ? WHERE id = ?`, [
        "v1.0",
        nowIso(),
        nowIso(),
        session.accountId,
      ]);
    }
    insert("consents", {
      id: uid("cns"),
      account_id: session.accountId,
      person_id: null,
      kind: "terms_and_health_data",
      version: "v1.0",
      language: (payload.language ?? "en") as string,
      granted_at: nowIso(),
      revoked_at: null,
    });
  }

  return ok({ step, saved: true });
}
