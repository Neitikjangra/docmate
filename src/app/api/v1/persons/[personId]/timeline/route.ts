/**
 * Unified timeline (PRD 8.5): journals, symptoms, vitals, medicine events,
 * alerts and SOS merged into one reverse-chronological feed, each item tagged
 * with who may see it so the family view can filter without leaking text.
 */

import { all, j, localDate, boot } from "@/lib/db";
import { ok, serverError } from "@/lib/api";
import { canSee, requirePerson } from "@/lib/scope";
import { listAlerts, type AlertRow } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ personId: string }> };

export type TimelineItem = {
  id: string;
  kind: "journal" | "symptom" | "vital" | "medicine" | "alert" | "sos" | "report";
  ts: string;
  title: string;
  detail: string;
  level?: number;
  tone: string;
  visibility: string[];
  meta?: Record<string, any>;
};

export async function GET(req: Request, ctx: Ctx) {
  try {
    boot();
    const { personId } = await ctx.params;
    const guard = await requirePerson(personId);
    if (!guard.ok) return guard.res;
    const access = guard.access;
    const url = new URL(req.url);
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
    const limit = Math.min(400, Math.max(10, Number(url.searchParams.get("limit") ?? 120)));
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const items: TimelineItem[] = [];

    if (canSee(access, "journal") || access.role === "owner") {
      for (const r of all<any>(
        `SELECT je.date, je.mood, je.energy, je.sleep_hours, je.stress, je.activity_minutes,
                je.food_tags, je.hydration, t.text, je.created_at, je.id
           FROM journal_entries je
           LEFT JOIN transcripts t ON t.recording_id = je.recording_id
          WHERE je.person_id = ? ORDER BY je.date DESC LIMIT 60`,
        [personId],
      )) {
        const bits: string[] = [];
        if (r.mood != null) bits.push(`mood ${r.mood}/5`);
        if (r.sleep_hours != null) bits.push(`${r.sleep_hours}h sleep`);
        if (r.activity_minutes != null) bits.push(`${Math.round(r.activity_minutes)} min active`);
        if (r.stress != null) bits.push(`stress ${r.stress}/5`);
        items.push({
          id: r.id,
          kind: "journal",
          ts: new Date(`${r.date}T20:00:00`).toISOString(),
          title: "Journal entry",
          detail: bits.join(" · ") || "Logged for the day",
          tone: "mint",
          visibility: access.role === "owner" ? ["owner"] : ["owner", "family"],
          meta: { date: r.date, text: r.text ?? null },
        });
      }
    }

    for (const r of all<any>(
      `SELECT * FROM symptoms WHERE person_id = ? AND ts >= ? ORDER BY ts DESC LIMIT 120`,
      [personId, since],
    )) {
      items.push({
        id: r.id,
        kind: "symptom",
        ts: r.ts,
        title: r.symptom.replace(/_/g, " "),
        detail: [r.severity_words, r.duration, r.onset].filter(Boolean).join(" · ") || "Logged",
        level: r.red_flag ? 4 : undefined,
        tone: r.red_flag ? "red" : "terracotta",
        visibility: ["owner", "family", "doctor"],
        meta: { bodyPart: r.body_part, redFlag: !!r.red_flag },
      });
    }

    for (const r of all<any>(
      `SELECT * FROM vitals WHERE person_id = ? AND ts >= ? ORDER BY ts DESC LIMIT 150`,
      [personId, since],
    )) {
      const v = j<Record<string, number>>(r.value_json, {});
      const label =
        r.type === "bp" ? `BP ${v.systolic}/${v.diastolic} ${r.unit ?? "mmHg"}`
          : `${r.type.replace(/_/g, " ")} ${v.value ?? ""} ${r.unit ?? ""}`.trim();
      items.push({
        id: r.id,
        kind: "vital",
        ts: r.ts,
        title: label,
        detail: r.source === "voice" ? "Said out loud" : "Entered by hand",
        tone: "sage",
        visibility: ["owner", "family", "doctor"],
        meta: { type: r.type, value: v },
      });
    }

    for (const r of all<any>(
      `SELECT * FROM medicine_events WHERE person_id = ? AND ts >= ? ORDER BY ts DESC LIMIT 80`,
      [personId, since],
    )) {
      items.push({
        id: r.id,
        kind: "medicine",
        ts: r.ts,
        title: r.status === "taken" ? `Took ${r.name ?? "medicine"}` : `Missed ${r.name ?? "a dose"}`,
        detail: r.status === "taken" ? "Dose recorded" : "Dose not recorded",
        tone: r.status === "taken" ? "mint" : "terracotta",
        visibility: ["owner"],
        meta: { status: r.status },
      });
    }

    if (canSee(access, "alerts")) {
      for (const a of listAlerts(personId, 40) as AlertRow[]) {
        items.push({
          id: a.id,
          kind: "alert",
          ts: a.created_at,
          title: a.title,
          detail: `${a.rule_id} · confidence ${a.confidence}`,
          level: a.level,
          tone: a.level >= 4 ? "red" : a.level === 3 ? "terracotta" : "mint-soft",
          visibility: ["owner", "family", "doctor"],
          meta: { ruleId: a.rule_id, status: a.status },
        });
      }
    }

    for (const s of all<any>(
      `SELECT * FROM sos_events WHERE person_id = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 20`,
      [personId, since],
    )) {
      items.push({
        id: s.id,
        kind: "sos",
        ts: s.started_at,
        title: s.outcome === "cancelled" ? "SOS cancelled" : s.outcome === "escalated" ? "SOS — contacts alerted" : "SOS started",
        detail: s.reason ?? "Emergency",
        level: 4,
        tone: "red",
        visibility: ["owner", "family", "doctor"],
        meta: { outcome: s.outcome, trigger: s.trigger },
      });
    }

    for (const r of all<any>(
      `SELECT * FROM reports WHERE person_id = ? ORDER BY created_at DESC LIMIT 30`,
      [personId],
    )) {
      items.push({
        id: r.id,
        kind: "report",
        ts: r.created_at,
        title: `Report — ${r.file_name ?? r.kind}`,
        detail: r.report_date ? `Dated ${r.report_date}` : "Uploaded",
        tone: "sage",
        visibility: ["owner", "family", "doctor"],
        meta: { kind: r.kind, confirmed: !!r.confirmed },
      });
    }

    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    const visible = items.filter((i) => access.role === "owner" || i.visibility.includes(access.role));

    // Group by local date for the UI.
    const groups = new Map<string, TimelineItem[]>();
    for (const it of visible.slice(0, limit)) {
      const d = localDate(it.ts);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(it);
    }

    return ok({
      groups: [...groups.entries()].map(([date, entries]) => ({ date, entries })),
      total: visible.length,
      role: access.role,
    });
  } catch (err) {
    console.error("[timeline]", err);
    return serverError();
  }
}
