/** Notification settings for one person (PRD 8.3, 12.3). */

import { boot } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { requirePerson } from "@/lib/scope";
import { getNotificationSettings, setNotificationSettings, hasEmergencyContact } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(_req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    const s = getNotificationSettings(personId);
    return ok({ settings: s, hasEmergencyContact: hasEmergencyContact(personId) });
  } catch (err) {
    console.error("[notifications.get]", err);
    return serverError();
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId, session);
    if (!guard.ok) return guard.res;
    if (guard.access.role !== "owner") return badRequest("Only the owner can change notification settings.");

    const b = await body<Record<string, any>>(req);
    const patch: Record<string, any> = {};
    for (const k of ["level3_enabled", "level4_enabled", "detailed_preview", "daily_reminder"]) {
      if (b[k] !== undefined) patch[k] = b[k] ? 1 : 0;
    }
    for (const k of ["quiet_start", "quiet_end", "reminder_time"]) {
      if (b[k] !== undefined) {
        if (!TIME_RE.test(String(b[k]))) return badRequest("Times must look like 22:00.");
        patch[k] = String(b[k]);
      }
    }
    const settings = setNotificationSettings(personId, patch);
    return ok({ settings });
  } catch (err) {
    console.error("[notifications.patch]", err);
    return serverError();
  }
}
