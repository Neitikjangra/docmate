/**
 * Alerts + notifications for one person (PRD 8.1, 8.3, 12.3).
 * GET   → open alerts, history and the notification ledger.
 * PATCH → mark an alert useful / false alarm / resolved.
 */

import { boot } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { canSee, requirePerson } from "@/lib/scope";
import { listAlerts, listNotifications, resolveAlert } from "@/lib/alerts";
import { publicAlert } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    if (!canSee(guard.access, "alerts")) return ok({ alerts: [], open: [], notifications: [] });

    const alerts = listAlerts(personId, 60);
    return ok({
      alerts: alerts.map(publicAlert),
      open: alerts.filter((a) => a.status === "new").map(publicAlert),
      notifications: listNotifications(personId, 40).map((n: any) => ({
        id: n.id,
        alertId: n.alert_id,
        channel: n.channel,
        recipient: n.recipient_label,
        title: n.title,
        body: n.body,
        sentAt: n.sent_at,
        suppressedReason: n.suppressed_reason,
        createdAt: n.created_at,
      })),
    });
  } catch (err) {
    console.error("[alerts.get]", err);
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
    if (guard.access.role !== "owner") return badRequest("Only the owner can update alerts.");

    const b = await body<{ alertId?: string; status?: string }>(req);
    const status = String(b.status ?? "");
    if (!["useful", "false_alarm", "resolved"].includes(status)) return badRequest("Unknown status.");
    if (!b.alertId) return badRequest("Missing alertId.");
    resolveAlert(b.alertId, status as "useful" | "false_alarm" | "resolved");
    return ok({ updated: true });
  } catch (err) {
    console.error("[alerts.patch]", err);
    return serverError();
  }
}
