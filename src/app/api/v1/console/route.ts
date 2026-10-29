/**
 * Simulation Console feed (locked decision 2).
 * GET → which external drivers are live vs simulated, the full outbox of
 * everything the simulated drivers would have sent, the rule store, the
 * nightly job ledger and a privacy-scrubbed analytics roll-up.
 */

import { all, boot, one } from "@/lib/db";
import { ok, serverError } from "@/lib/api";
import { adapterStatus, outbox } from "@/lib/adapters";
import { loadRuleDefs } from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    boot();

    const rules = loadRuleDefs().map((r) => ({
      id: r.id,
      version: r.version,
      title: r.title,
      level: r.level,
      active: r.active !== false,
      evaluator: r.evaluator,
      windowDays: (r.params as any)?.windowDays ?? null,
      reviewedBy: r.reviewedBy ?? null,
      reviewedAt: r.reviewedAt ?? null,
    }));

    const rows = outbox(undefined, 200).map((r) => ({
      id: r.id,
      channel: r.channel,
      to: r.to_addr ?? r.to_label ?? "—",
      toLabel: r.to_label,
      subject: r.subject,
      body: r.body,
      status: r.status,
      meta: safe(r.meta_json),
      createdAt: r.created_at,
    }));

    const counts = all<{ channel: string; c: number }>(
      `SELECT channel, COUNT(*) AS c FROM outbox GROUP BY channel`,
    );

    const jobs = all<any>(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT 40`);

    const analytics = all<{ name: string; c: number }>(
      `SELECT name, COUNT(*) AS c FROM analytics_events GROUP BY name ORDER BY c DESC LIMIT 20`,
    );

    const stats = {
      persons: one<{ c: number }>(`SELECT COUNT(*) AS c FROM persons`)?.c ?? 0,
      accounts: one<{ c: number }>(`SELECT COUNT(*) AS c FROM accounts`)?.c ?? 0,
      recordings: one<{ c: number }>(`SELECT COUNT(*) AS c FROM recordings`)?.c ?? 0,
      alerts: one<{ c: number }>(`SELECT COUNT(*) AS c FROM alerts`)?.c ?? 0,
      sos: one<{ c: number }>(`SELECT COUNT(*) AS c FROM sos_events`)?.c ?? 0,
      consultations: one<{ c: number }>(`SELECT COUNT(*) AS c FROM consultations`)?.c ?? 0,
      seedVersion: one<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'seed_version'`)?.value ?? null,
    };

    return ok({
      adapters: adapterStatus(),
      outbox: rows,
      outboxCounts: counts,
      rules,
      jobs: jobs.map((j) => ({
        id: j.id, kind: j.kind, status: j.status, personId: j.person_id,
        result: safe(j.result_json), createdAt: j.created_at, finishedAt: j.finished_at,
      })),
      analytics,
      stats,
    });
  } catch (err) {
    console.error("[console]", err);
    return serverError();
  }
}

function safe(s: string | null): Record<string, any> {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
