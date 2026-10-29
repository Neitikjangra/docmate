import { ok } from "@/lib/api";
import { boot, one } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ownedPersons } from "@/lib/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  boot();
  const session = await getSession();
  if (!session) return ok({ account: null, persons: [] });

  const account = one<{ id: string; phone: string; language: string; consent_at: string | null; is_doctor: number }>(
    `SELECT id, phone, language, consent_at, is_doctor FROM accounts WHERE id = ?`,
    [session.accountId],
  );
  const doctor = one<{ id: string; name: string; specialty: string }>(
    `SELECT id, name, specialty FROM doctors WHERE account_id = ?`,
    [session.accountId],
  );

  const persons = ownedPersons(session.accountId);
  const hasProfile = persons.length > 0;

  return ok({
    account: {
      accountId: session.accountId,
      phone: account?.phone ?? null,
      isDoctor: !!doctor,
      hasProfile,
      needsConsent: !account?.consent_at,
      language: (account?.language as any) ?? "en",
      doctor: doctor ?? null,
    },
    persons: persons.map((p) => ({
      id: p.id,
      name: p.name,
      relation: p.relation_to_owner,
      isManaged: !!p.is_managed,
      dob: p.dob,
      age: p.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31557600000) : null,
      sex: p.sex_at_birth,
      role: p.account_id === session.accountId ? "owner" : "family",
      avatarTone: p.id.charCodeAt(0) % 2 === 0 ? "mint" : "terracotta",
    })),
  });
}
