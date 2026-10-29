/**
 * Nightly job ledger (plan §8.8, §9).
 *
 * The Simulation Console shows a real queue: one analysis row per person plus
 * a retention sweep, each with its own status and result. Nothing here is
 * faked — this is the same rule engine, baselines, score and prediction code
 * the live log route runs, just executed for everyone at once.
 */

import fs from "node:fs";
import path from "node:path";
import { all, boot, insert, localDate, nowIso, run, uid } from "./db";
import { recomputeScore, runRules, updateBaselines, upsertDailyFeatures } from "./analysis";
import { processOutcomes } from "./alerts";
import { persistPredictions } from "./predictions";

export type NightlyTrigger = "manual" | "seed" | "schedule";

export type NightlySummary = {
  jobIds: string[];
  persons: number;
  alertsCreated: number;
  predictions: number;
  purged: number;
  errors: string[];
};

const DAY = 86400000;

function openJob(kind: string, personId: string | null, payload: Record<string, any>): string {
  const id = uid("job");
  insert("jobs", {
    id,
    person_id: personId,
    kind,
    status: "running",
    payload_json: JSON.stringify(payload),
    result_json: null,
    created_at: nowIso(),
    finished_at: null,
  });
  return id;
}

function closeJob(id: string, status: "done" | "failed", result: Record<string, any>): void {
  run(`UPDATE jobs SET status = ?, result_json = ?, finished_at = ? WHERE id = ?`, [
    status,
    JSON.stringify(result),
    nowIso(),
    id,
  ]);
}

/**
 * Retention sweep: honours an explicit `expires_at`, otherwise the person's
 * `retention_days` counted from when the clip was captured. The audio file is
 * unlinked and the row is marked deleted; the transcript and features stay so
 * the score history does not silently change.
 */
export function purgeExpiredAudio(now = new Date()): number {
  const rows = all<{
    id: string;
    storage_ref: string | null;
    created_at: string;
    expires_at: string | null;
    retention_days: number | null;
  }>(
    `SELECT r.id, r.storage_ref, r.created_at, r.expires_at,
            COALESCE(p.retention_days, 90) AS retention_days
       FROM recordings r JOIN persons p ON p.id = r.person_id
      WHERE r.deleted_at IS NULL`,
  );

  let purged = 0;
  for (const r of rows) {
    const createdAt = new Date(r.created_at).getTime();
    if (Number.isNaN(createdAt)) continue;
    const expiresAt = r.expires_at ? new Date(r.expires_at).getTime() : null;
    const keepUntil = createdAt + Number(r.retention_days ?? 90) * DAY;
    const expired =
      (expiresAt !== null && expiresAt <= now.getTime()) || keepUntil <= now.getTime();
    if (!expired) continue;

    if (r.storage_ref) {
      try {
        fs.unlinkSync(path.join(process.cwd(), r.storage_ref));
      } catch {
        // Already gone — the row still needs marking.
      }
    }
    run(`UPDATE recordings SET deleted_at = ? WHERE id = ?`, [nowIso(), r.id]);
    purged++;
  }
  return purged;
}

/** Run the whole nightly pipeline once and record it in the job ledger. */
export function runNightly(trigger: NightlyTrigger = "manual"): NightlySummary {
  boot();
  const now = new Date();
  const date = localDate(now);
  const summary: NightlySummary = {
    jobIds: [],
    persons: 0,
    alertsCreated: 0,
    predictions: 0,
    purged: 0,
    errors: [],
  };

  for (const p of all<{ id: string; name: string }>(`SELECT id, name FROM persons`)) {
    const jobId = openJob("nightly_analysis", p.id, { trigger, date });
    summary.jobIds.push(jobId);
    try {
      updateBaselines(p.id, now);
      const { outcomes } = runRules(p.id, "nightly", now);
      const { created } = processOutcomes(p.id, outcomes, now);
      recomputeScore(p.id, now);
      upsertDailyFeatures(p.id, date);
      const predictions = persistPredictions(p.id);
      summary.persons++;
      summary.alertsCreated += created.length;
      summary.predictions += predictions.length;
      closeJob(jobId, "done", {
        person: p.name,
        alertLevels: created.map((a) => a.level),
        predictions: predictions.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${p.name}: ${message}`);
      closeJob(jobId, "failed", { person: p.name, error: message });
    }
  }

  const purgeJobId = openJob("audio_retention", null, { trigger });
  summary.jobIds.push(purgeJobId);
  try {
    summary.purged = purgeExpiredAudio(now);
    closeJob(purgeJobId, "done", { purged: summary.purged });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    summary.errors.push(`retention: ${message}`);
    closeJob(purgeJobId, "failed", { error: message });
  }

  return summary;
}
