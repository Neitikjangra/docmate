import { badRequest, fail, ok, unauthorized, body } from "@/lib/api";
import { normalizePhone, verifyOtp } from "@/lib/otp";
import { boot, insert, one, nowIso, uid } from "@/lib/db";
import { setSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  boot();
  const { phone, code, purpose } = await body<{ phone?: string; code?: string; purpose?: string }>(req);
  if (!phone || !code) return badRequest("Phone number and code are required.");

  const result = verifyOtp(phone, code, purpose ?? "login");
  if (!result.ok) {
    if (result.error === "incorrect") {
      return fail(401, "incorrect_code", `Incorrect code. ${result.attemptsLeft ?? 0} attempts left.`);
    }
    if (result.error === "locked") {
      return fail(423, "locked", "Too many wrong attempts. This number is locked for 15 minutes.");
    }
    if (result.error === "expired") return fail(410, "expired", "That code has expired. Request a new one.");
    return unauthorized("Request a new code.");
  }

  const phoneNorm = normalizePhone(phone);
  let account = one<{ id: string; is_doctor: number; language: string; consent_at: string | null }>(
    `SELECT id, is_doctor, language, consent_at FROM accounts WHERE phone = ?`,
    [phoneNorm],
  );
  if (!account) {
    const id = uid("acc");
    insert("accounts", {
      id,
      phone: phoneNorm,
      language: "en",
      consent_version: null,
      consent_at: null,
      status: "active",
      is_doctor: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    account = { id, is_doctor: 0, language: "en", consent_at: null };
  }

  const doctorRow = one<{ id: string }>(`SELECT id FROM doctors WHERE account_id = ?`, [account.id]);
  const isDoctor = !!account.is_doctor || !!doctorRow;

  await setSession(account.id, isDoctor);

  const profileCount = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM persons WHERE account_id = ? OR claimed_by_account_id = ?`,
    [account.id, account.id],
  )?.c ?? 0;

  return ok({
    accountId: account.id,
    phone: phoneNorm,
    isDoctor,
    hasProfile: profileCount > 0,
    needsConsent: !account.consent_at,
    language: account.language,
  });
}
