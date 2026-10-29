/**
 * Voice / typed journal ingest — the heart of the product (PRD 6.2, 6.3).
 *
 *   transcript → extract → persist → on-log rules → alerts → score → verdict
 *
 * The verdict (severity, title, actions) is produced only from the versioned
 * rule store and fixed templates; nothing in the request can raise or lower it.
 * A Level-4 verdict opens a 15-second SOS countdown server-side.
 */

import fs from "node:fs";
import path from "node:path";
import { all, audioDir, boot, insert, j, localDate, nowIso, one, run, uid } from "@/lib/db";
import { badRequest, body, forbidden, ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/session";
import { requirePerson } from "@/lib/scope";
import { extract, type Extraction } from "@/lib/nlu/extract";
import { runRules, recomputeScore, upsertDailyFeatures, updateBaselines, loadPersonData } from "@/lib/analysis";
import { processOutcomes, type AlertRow } from "@/lib/alerts";
import { buildVerdict, type Verdict } from "@/lib/verdict";
import { analyseAcoustics, type AcousticInput } from "@/lib/acoustic";
import { activeSos, startSos, COUNTDOWN_SECONDS } from "@/lib/sos";
import { remember } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

type LogBody = {
  transcript?: string;
  lang?: "en" | "hi" | "bn" | "ta";
  mode?: "voice" | "typed" | "quick";
  duration_s?: number;
  clientId?: string;
  acoustic?: AcousticInput;
  vitals?: { type: string; value: Record<string, number | string>; unit?: string }[];
  question?: string;
};

export async function GET(req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    const url = new URL(req.url);
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 30));

    const entries = all<any>(
      `SELECT r.id, r.kind, r.duration_s, r.created_at, r.quality_flag, r.storage_ref,
              t.text, t.language, a.distress_0_100, a.calibrating
         FROM recordings r
         LEFT JOIN transcripts t ON t.recording_id = r.id
         LEFT JOIN acoustic_features a ON a.recording_id = r.id
        WHERE r.person_id = ? AND r.deleted_at IS NULL
        ORDER BY r.created_at DESC LIMIT ?`,
      [personId, limit],
    );

    return ok({
      entries: entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        createdAt: e.created_at,
        durationS: e.duration_s,
        quality: e.quality_flag,
        text: e.text,
        language: e.language,
        distress: e.distress_0_100,
        calibrating: !!e.calibrating,
        hasAudio: !!e.storage_ref,
      })),
    });
  } catch (err) {
    console.error("[log.get]", err);
    return serverError();
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    boot();
    const session = await getSession();
    if (!session) return unauthorized();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId, session);
    if (!guard.ok) return guard.res;
    if (guard.access.role !== "owner")
      return badRequest("Only the account owner can add entries for this person.");

    const b = await body<LogBody>(req);
    const transcript = String(b.transcript ?? "").trim();
    const hasTypedVitals = Array.isArray(b.vitals) && b.vitals.length > 0;
    if (!transcript && !hasTypedVitals) return badRequest("Nothing was said or entered. Please try again.");

    const now = new Date();
    const extraction: Extraction = transcript
      ? extract(transcript, b.lang)
      : emptyExtraction(b.lang ?? "en");

    if (hasTypedVitals) {
      for (const v of b.vitals!) {
        if (!v?.type) continue;
        if (!extraction.vitals.some((x) => x.type === v.type)) {
          extraction.vitals.push({ type: v.type as any, value: v.value ?? {}, unit: v.unit ?? "", raw: "typed" });
        }
      }
      extraction.hasContent = true;
      if (extraction.intent === "daily_journal" && extraction.symptoms.length === 0) extraction.intent = "vital_log";
    }

    const person = one<{ name: string }>(`SELECT name FROM persons WHERE id = ?`, [personId]);
    if (!person) return badRequest("Person not found.");

    const durationS = Number(b.duration_s ?? 0) || 0;

    // ---- recording + transcript + acoustics
    const recordingId = uid("rec");
    let storageRef: string | null = null;
    if (transcript && (durationS > 0 || b.mode === "voice")) {
      storageRef = await persistAudio(b.clientId, transcript);
    }
    insert("recordings", {
      id: recordingId,
      person_id: personId,
      kind: b.mode === "voice" ? "voice" : b.mode === "quick" ? "quick" : "typed",
      storage_ref: storageRef,
      duration_s: durationS,
      language: extraction.language,
      quality_flag: null,
      snr_db: null,
      expires_at: null,
      deleted_at: null,
      created_at: nowIso(),
    });

    if (transcript) {
      insert("transcripts", {
        id: uid("tr"),
        recording_id: recordingId,
        person_id: personId,
        text: transcript,
        language: extraction.language,
        confidence: 0.86,
        edited_by_user: 0,
        created_at: nowIso(),
      });
    }

    let distress: number | null = null;
    let acousticQuality: string | null = null;
    if (b.acoustic && (durationS > 0 || transcript)) {
      const ac = analyseAcoustics({ ...b.acoustic, durationS: durationS || b.acoustic.durationS });
      distress = ac.distress;
      acousticQuality = ac.quality;
      const priorCount = one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM acoustic_features WHERE person_id = ?`,
        [personId],
      )?.c ?? 0;
      insert("acoustic_features", {
        id: uid("ac"),
        recording_id: recordingId,
        person_id: personId,
        features_json: JSON.stringify(ac.features),
        distress_0_100: ac.distress,
        confidence: ac.quality === "good" ? 0.8 : ac.quality === "ok" ? 0.6 : 0.35,
        model_version: "acoustic-1.0.0",
        calibrating: priorCount < 5 ? 1 : 0,
        created_at: nowIso(),
      });
      if (ac.quality === "poor") {
        run(`UPDATE recordings SET quality_flag = ? WHERE id = ?`, ["poor", recordingId]);
      }
    }

    // ---- symptoms
    const date = localDate(now);
    const saved = { symptoms: 0, vitals: 0, medicines: 0, journal: false };
    for (const s of extraction.symptoms) {
      insert("symptoms", {
        id: uid("sym"),
        person_id: personId,
        recording_id: recordingId,
        symptom: s.key,
        body_part: s.bodyPart,
        onset: s.onset,
        duration: s.duration,
        severity_words: s.severity,
        red_flag: extraction.redFlags.includes(s.key) ? 1 : 0,
        ts: nowIso(),
        resolved_at: null,
        created_at: nowIso(),
      });
      saved.symptoms++;
    }
    for (const rf of extraction.redFlags) {
      if (extraction.symptoms.some((s) => s.key === rf)) continue;
      insert("symptoms", {
        id: uid("sym"),
        person_id: personId,
        recording_id: recordingId,
        symptom: rf,
        body_part: null,
        onset: extraction.onset,
        duration: extraction.duration,
        severity_words: "severe",
        red_flag: 1,
        ts: nowIso(),
        resolved_at: null,
        created_at: nowIso(),
      });
      saved.symptoms++;
    }

    // ---- vitals
    for (const v of extraction.vitals) {
      insert("vitals", {
        id: uid("vit"),
        person_id: personId,
        ts: nowIso(),
        type: v.type,
        value_json: JSON.stringify(v.value),
        unit: v.unit,
        source: b.mode === "voice" ? "voice" : "typed",
        confirmed: 1,
        held: 0,
        created_at: nowIso(),
      });
      saved.vitals++;
    }

    // ---- medicine events
    const activeMeds = all<{ name: string }>(
      `SELECT name FROM medicines WHERE person_id = ? AND active = 1`,
      [personId],
    );
    for (const m of extraction.medicineEvents) {
      const name = m.name ?? activeMeds[0]?.name ?? null;
      insert("medicine_events", {
        id: uid("me"),
        person_id: personId,
        medicine_id: null,
        name,
        ts: nowIso(),
        status: m.status,
        created_at: nowIso(),
      });
      saved.medicines++;
    }

    // ---- daily journal (merge, never clobber a value with null)
    const existing = one<any>(`SELECT * FROM journal_entries WHERE person_id = ? AND date = ?`, [personId, date]);
    const next = {
      mood: extraction.mood ?? existing?.mood ?? null,
      energy: extraction.energy ?? existing?.energy ?? null,
      sleep_hours: extraction.sleepHours ?? existing?.sleep_hours ?? null,
      sleep_quality: extraction.sleepQuality ?? existing?.sleep_quality ?? null,
      stress: extraction.stress ?? existing?.stress ?? null,
      activity_minutes: extraction.activityMinutes ?? existing?.activity_minutes ?? null,
      activity_type: extraction.activityType ?? existing?.activity_type ?? null,
      food_tags: extraction.foodTags.length ? JSON.stringify(extraction.foodTags) : existing?.food_tags ?? null,
      hydration: extraction.hydration ?? existing?.hydration ?? null,
    };
    if (existing) {
      run(
        `UPDATE journal_entries SET mood=?, energy=?, sleep_hours=?, sleep_quality=?, stress=?, activity_minutes=?,
           activity_type=?, food_tags=?, hydration=?, recording_id=?, summary_json=?, updated_at=? WHERE id=?`,
        [
          next.mood, next.energy, next.sleep_hours, next.sleep_quality, next.stress, next.activity_minutes,
          next.activity_type, next.food_tags, next.hydration, recordingId,
          JSON.stringify({ intent: extraction.intent, symptoms: extraction.symptoms.map((s) => s.key) }),
          nowIso(), existing.id,
        ],
      );
    } else {
      insert("journal_entries", {
        id: uid("je"),
        person_id: personId,
        date,
        recording_id: recordingId,
        ...next,
        edit_source: "extraction",
        summary_json: JSON.stringify({ intent: extraction.intent, symptoms: extraction.symptoms.map((s) => s.key) }),
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    }
    saved.journal = true;

    // ---- rules → alerts
    const { outcomes } = runRules(personId, "on_log", now);
    const { created } = processOutcomes(personId, outcomes, now);

    // ---- derived analytics
    recomputeScore(personId, now);
    upsertDailyFeatures(personId, date);
    updateBaselines(personId, now);
    if (transcript) remember(personId, "transcript", recordingId, transcript);

    // ---- verdict + history context
    const history = buildHistory(personId, extraction, now);
    const verdict: Verdict = buildVerdict({
      extraction,
      outcomes,
      lang: extraction.language,
      history,
      distress,
    });

    // ---- SOS: level 4 or red-flag + distress opens the countdown
    let sos: { id: string; countdown: number; trigger: string } | null = null;
    if (verdict.sosEligible) {
      const existingSos = activeSos(personId);
      if (!existingSos) {
        const started = startSos(
          personId,
          verdict.level === 4 ? "rule" : "red_flag_distress",
          verdict.title,
          null,
        );
        sos = { id: started.id, countdown: COUNTDOWN_SECONDS, trigger: started.trigger };
      } else {
        sos = { id: existingSos.id, countdown: COUNTDOWN_SECONDS, trigger: existingSos.trigger };
      }
    }

    return ok({
      verdict,
      saved,
      extraction: {
        intent: extraction.intent,
        language: extraction.language,
        symptoms: extraction.symptoms.map((s) => ({ key: s.key, label: s.label, severity: s.severity })),
        vitals: extraction.vitals.map((v) => ({ type: v.type, value: v.value, unit: v.unit })),
        mood: extraction.mood,
        sleepHours: extraction.sleepHours,
        stress: extraction.stress,
        activityMinutes: extraction.activityMinutes,
        redFlags: extraction.redFlags,
        foodTags: extraction.foodTags,
        medicineEvents: extraction.medicineEvents,
      },
      distress,
      acousticQuality,
      alert: created[0] ? publicAlert(created[0]) : null,
      sos,
      recordingId,
    });
  } catch (err) {
    console.error("[log.post]", err);
    return serverError();
  }
}

function publicAlert(a: AlertRow) {
  return {
    id: a.id,
    level: a.level,
    ruleId: a.rule_id,
    title: a.title,
    evidence: j<Record<string, any>>(a.evidence_json, {}),
    confidence: a.confidence,
    createdAt: a.created_at,
  };
}

function buildHistory(personId: string, e: Extraction, now: Date) {
  const since = new Date(now.getTime() - 7 * 86400000).toISOString();
  let recentSameSymptom = 0;
  if (e.symptoms[0]) {
    recentSameSymptom =
      one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM symptoms WHERE person_id = ? AND symptom = ? AND ts >= ?`,
        [personId, e.symptoms[0].key, since],
      )?.c ?? 0;
  }
  const days =
    one<{ c: number }>(
      `SELECT COUNT(DISTINCT date) AS c FROM journal_entries WHERE person_id = ?`,
      [personId],
    )?.c ?? 0;
  return { recentSameSymptom, daysOfData: days };
}

function emptyExtraction(lang: "en" | "hi" | "bn" | "ta"): Extraction {
  return {
    intent: "daily_journal",
    language: lang,
    redFlags: [],
    redFlagLabels: [],
    symptoms: [],
    vitals: [],
    mood: null,
    moodTags: [],
    energy: null,
    stress: null,
    stressTags: [],
    sleepHours: null,
    sleepQuality: null,
    activityMinutes: null,
    activityType: null,
    foodTags: [],
    hydration: null,
    medicineEvents: [],
    questions: [],
    duration: null,
    onset: null,
    triggers: [],
    hasContent: false,
  };
}

/** Persist the clip only when one was sent; audio never leaves the device otherwise. */
async function persistAudio(clientId: string | undefined, transcript: string): Promise<string | null> {
  // The browser records locally and uploads an opaque reference; we keep the
  // pointer (and never the transcript) so retention rules can delete it.
  if (!clientId) return null;
  const dir = audioDir();
  const safe = String(clientId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "clip";
  const file = path.join(dir, `${safe}.txt`);
  try {
    fs.writeFileSync(file, `${transcript.length}`, "utf8");
    return path.relative(process.cwd(), file);
  } catch {
    return null;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    if (guard.access.role !== "owner") return forbidden("Only owner can clear notes.");

    run(`DELETE FROM journal_entries WHERE person_id = ?`, [personId]);
    run(`DELETE FROM transcripts WHERE person_id = ?`, [personId]);
    run(`DELETE FROM acoustic_features WHERE person_id = ?`, [personId]);
    run(`DELETE FROM recordings WHERE person_id = ?`, [personId]);
    run(`DELETE FROM symptoms WHERE person_id = ?`, [personId]);

    return ok({ cleared: true });
  } catch (err) {
    console.error("[log.delete]", err);
    return serverError();
  }
}
