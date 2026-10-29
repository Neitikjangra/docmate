/**
 * Nightly job trigger + ledger (plan §8.8, §9 — the Console's "nightly run
 * trigger"). Public like the rest of the Console feed, which is the inspected
 * adapter surface rather than a user-facing endpoint.
 */

import { all, boot } from "@/lib/db";
import { ok, serverError } from "@/lib/api";
import { runNightly } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    boot();
    const jobs = all<any>(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT 60`).map((j) => ({
      id: j.id,
      kind: j.kind,
      status: j.status,
      personId: j.person_id,
      result: j.result_json ? JSON.parse(j.result_json) : {},
      createdAt: j.created_at,
      finishedAt: j.finished_at,
    }));
    return ok({ jobs });
  } catch (err) {
    console.error("[jobs.get]", err);
    return serverError();
  }
}

export async function POST() {
  try {
    boot();
    return ok({ summary: runNightly("manual") });
  } catch (err) {
    console.error("[jobs.nightly]", err);
    return serverError();
  }
}
