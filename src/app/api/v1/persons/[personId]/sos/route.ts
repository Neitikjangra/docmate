/**
 * SOS state machine endpoint (PRD 8.4).
 * POST { action: "start" | "escalate" | "cancel", ... }
 *
 * The row is written first, messages queue behind it, and escalation works
 * whether or not the client is online (the adapters buffer to the outbox).
 */

import { all, boot } from "@/lib/db";
import { badRequest, body, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { requirePerson } from "@/lib/scope";
import {
  activeSos, cancelSos, escalateSos, finalizeSos, getSos, listSos, sosSummary, startSos,
  COUNTDOWN_SECONDS, type SosTrigger,
} from "@/lib/sos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

const TRIGGERS: SosTrigger[] = ["rule", "button", "red_flag_distress"];

export async function GET(_req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    const contacts = all<{ name: string; phone: string; priority: number }>(
      `SELECT name, phone, priority FROM emergency_contacts WHERE person_id = ? ORDER BY priority ASC`,
      [personId],
    );
    return ok({
      active: activeSos(personId) ?? null,
      recent: listSos(personId, 10).map((s) => ({
        ...s,
        notified: s.contacts_notified_json ? JSON.parse(s.contacts_notified_json) : [],
      })),
      contacts,
      countdownSeconds: COUNTDOWN_SECONDS,
    });
  } catch (err) {
    console.error("[sos.get]", err);
    return serverError();
  }
}

type Body = {
  action?: "start" | "escalate" | "cancel" | "resolve";
  id?: string;
  trigger?: string;
  reason?: string;
  location?: Record<string, any> | null;
};

export async function POST(req: Request, ctx: Ctx) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId, session);
    if (!guard.ok) return guard.res;

    const b = await body<Body>(req);
    const action = b.action ?? "start";

    if (action === "start") {
      const existing = activeSos(personId);
      if (existing) return ok({ sos: existing, countdownSeconds: COUNTDOWN_SECONDS, resumed: true });
      const trigger: SosTrigger = TRIGGERS.includes(b.trigger as SosTrigger) ? (b.trigger as SosTrigger) : "button";
      const reason = String(b.reason ?? "").trim() || "Emergency reported by the person";
      const sos = startSos(personId, trigger, reason, b.location ?? null);
      return ok({ sos, countdownSeconds: COUNTDOWN_SECONDS }, { status: 201 });
    }

    if (action === "cancel") {
      if (!b.id) return badRequest("Missing SOS id.");
      const sos = cancelSos(b.id);
      if (!sos) return badRequest("That SOS no longer exists.");
      return ok({ sos });
    }

    if (action === "escalate") {
      if (!b.id) return badRequest("Missing SOS id.");
      const existing = getSos(b.id);
      if (!existing) return badRequest("That SOS no longer exists.");
      if (existing.outcome === "escalated") return ok({ sos: existing, escalation: null, alreadyEscalated: true });
      const escalation = escalateSos(b.id, b.reason);
      return ok({ sos: getSos(b.id), escalation });
    }

    if (action === "resolve") {
      if (!b.id) return badRequest("Missing SOS id.");
      finalizeSos(b.id, "resolved");
      return ok({ sos: getSos(b.id) });
    }

    return badRequest("Unknown action.");
  } catch (err) {
    console.error("[sos.post]", err);
    return serverError();
  }
}
