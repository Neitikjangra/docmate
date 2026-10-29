/**
 * Privacy-scrubbed product analytics (PRD 15.3).
 * Only the event name, screen and language are stored — never health content.
 */

import { boot, insert, nowIso, uid } from "@/lib/db";
import { body, ok, serverError } from "@/lib/api";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { name?: string; screen?: string; language?: string; meta?: Record<string, any> };

const ALLOWED_META = new Set(["personId", "level", "ruleId", "channel", "count", "mode", "step"]);

export async function POST(req: Request) {
  try {
    boot();
    const session = await getSession();
    const b = await body<Body>(req);
    const name = String(b.name ?? "").trim().slice(0, 48);
    if (!name) return ok({ logged: false });

    const meta: Record<string, any> = {};
    for (const [k, v] of Object.entries(b.meta ?? {})) {
      if (ALLOWED_META.has(k)) meta[k] = typeof v === "string" ? v.slice(0, 64) : v;
    }

    insert("analytics_events", {
      id: uid("ev"),
      account_id: session?.accountId ?? null,
      name,
      screen: b.screen ? String(b.screen).slice(0, 48) : null,
      language: b.language ? String(b.language).slice(0, 8) : null,
      app_version: "1.0.0",
      meta_json: JSON.stringify(meta),
      ts: nowIso(),
    });

    return ok({ logged: true });
  } catch (err) {
    console.error("[analytics]", err);
    return serverError();
  }
}
