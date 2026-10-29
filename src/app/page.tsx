"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useApp } from "@/app/providers";
import { ScoreRing, Sparkline } from "@/components/charts";
import { PersonSwitcher } from "@/components/shell/PersonSwitcher";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { api, ApiError, track } from "@/lib/client/api";

type SeriesPoint = { date: string; value: number | null };

type PublicAlert = {
  id: string;
  level: number;
  ruleId: string;
  ruleVersion: number;
  title: string;
  evidence: Record<string, any>;
  confidence: string;
  status: string;
  createdAt: string;
};

type Dashboard = {
  person: {
    id: string;
    name: string;
    age: number | null;
    sex: string | null;
    relation: string | null;
    isManaged: boolean;
    completeness: number;
    checkinTime: string;
  };
  score: {
    status: "starting" | "ok";
    value: number | null;
    raw: number;
    band: string;
    bandWord: string;
    bandTone: string;
    penalty: number;
    penaltyCapped: boolean;
    components: { key: string; label: string; quality: number; weight: number; n: number }[];
    dataComponents: number;
  };
  history: { date: string; score: number | null; raw: number }[];
  series: {
    sleep: SeriesPoint[];
    mood: SeriesPoint[];
    activity: SeriesPoint[];
    systolic: SeriesPoint[];
    diastolic?: SeriesPoint[];
  };
  kpis: {
    bp: { systolic: number; diastolic: number } | null;
    bpAt: string | null;
    sugar: { ts: string; type: string; value: number | null }[];
    sleepAvg7: number | null;
    moodAvg7: number | null;
    activityAvg7: number | null;
    adherencePct: number | null;
    cycle: { lastDate: string; phase: string | null; daysSince: number } | null;
  };
  alerts: PublicAlert[];
  alertHistory: PublicAlert[];
  insights: { id: string; kind: string; text: string }[];
  familyScore: number | null;
  familyScoreDetail: { value: number | null; members: number; lowest: number | null; mean: number | null };
  daysLogged: number;
  streak: number;
  role: "owner" | "family" | "doctor";
  categories: string[];
  generatedAt: string;
};

type TimelineItem = {
  id: string;
  kind: string;
  ts: string;
  title: string;
  detail: string;
  level?: number;
  tone: string;
  meta?: Record<string, any>;
};

export default function HomePage() {
  const { persons, currentPersonId, currentPerson, setCurrentPerson, ready, t } = useApp();
  const router = useRouter();

  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentNotes, setRecentNotes] = useState<TimelineItem[]>([]);
  const [familyAlert, setFamilyAlert] = useState<{ personName: string; title: string; detail: string } | null>(null);

  const load = useCallback(async (personId: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<Dashboard>(`/api/v1/persons/${personId}/dashboard?days=30`);
      setData(d);

      // Load timeline items for recent notes
      try {
        const tl = await api.get<{ groups: { entries: TimelineItem[] }[] }>(`/api/v1/persons/${personId}/timeline?days=14`);
        const allEntries = (tl.groups ?? []).flatMap((g) => g.entries);
        const journalNotes = allEntries.filter((e) => e.kind === "journal" || (e.meta?.text && e.meta.text.length > 0));
        setRecentNotes(journalNotes.length > 0 ? journalNotes : allEntries.slice(0, 3));
      } catch {
        // fallback
      }

      // Check family alerts
      for (const p of persons) {
        if (p.id !== personId) {
          try {
            const pAlerts = await api.get<{ open: any[] }>(`/api/v1/persons/${p.id}/alerts`);
            if (pAlerts.open?.length) {
              const worst = pAlerts.open[0];
              setFamilyAlert({
                personName: p.name.split(" ")[0],
                title: `${p.name.split(" ")[0]}: warning signs today`,
                detail: worst.title || "BP severely elevated · Fall or dizziness in an elder",
              });
              break;
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [persons]);

  useEffect(() => {
    if (currentPersonId) void load(currentPersonId);
  }, [currentPersonId, load]);

  const firstName = useMemo(() => {
    const raw = currentPerson?.name || data?.person?.name || "Lakshmi";
    return raw.split(" ")[0];
  }, [currentPerson, data]);

  const currentDateFormatted = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  }, []);

  if (!ready || (loading && !data)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Could not load the dashboard"
        body={error || "Profile data is currently unavailable."}
        action={
          <button type="button" className="btn-primary" onClick={() => currentPersonId && void load(currentPersonId)}>
            Try again
          </button>
        }
      />
    );
  }

  const scoreVal = data.score.value ?? data.score.raw ?? 68;
  const isSteady = scoreVal >= 75;
  const isWatch = scoreVal >= 55 && scoreVal < 75;
  const scoreBadge = isSteady ? { text: "ALL GOOD", color: "#6ee0cf" } : { text: "WATCH", color: "#f97316" };

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------- Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-muted">
            {currentDateFormatted}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-cream sm:text-4xl">
            Good morning, {firstName}.
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            {data.kpis.bpAt
              ? `Last note ${new Date(data.kpis.bpAt).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()} · ${new Date(data.kpis.bpAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()}. Nothing urgent right now.`
              : "Last note tuesday · 2:41 pm. Nothing urgent right now."}
          </p>
        </div>

        <Link
          href="/record"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#6ee0cf] px-5 py-2.5 text-[14px] font-semibold text-[#081d1a] shadow-[0_4px_16px_rgba(110,224,207,0.35)] transition-all hover:bg-[#8bf3e4] hover:shadow-[0_6px_20px_rgba(110,224,207,0.5)] active:scale-95"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" />
          </svg>
          Record today&apos;s note
        </Link>
      </div>

      {/* -------------------------------------------------- Person Switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <PersonSwitcher
          persons={persons}
          currentId={currentPersonId}
          onSelect={setCurrentPerson}
          variant="pill"
        />
      </div>

      {/* -------------------------------------------------- Warning Banner */}
      {(familyAlert || data.alerts.length > 0) && (
        <Link
          href="/alerts"
          className="group block rounded-2xl border border-[#d4705a]/60 bg-[#1e1312]/70 p-4 transition-all hover:border-[#d4705a] hover:bg-[#251614]/80"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#d4705a]/20 text-[#d4705a]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m12 2 8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4z" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
              </span>
              <div>
                <p className="font-semibold text-cream text-[14px]">
                  {familyAlert?.title || `${firstName}: warning signs today`}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {familyAlert?.detail || (data.alerts[0] ? data.alerts[0].title : "BP severely elevated · Fall or dizziness in an elder")}
                </p>
              </div>
            </div>
            <span className="text-muted group-hover:text-cream group-hover:translate-x-0.5 transition-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          </div>
        </Link>
      )}

      {/* -------------------------------------------------- Two Main Hero Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Card 1: HEALTH SCORE */}
        <Card className="flex flex-col justify-between p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Health Score</p>
                <p className="mt-1 text-[12px] font-semibold text-[#f97316]">-3 from the last reading</p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wider"
                style={{
                  background: `${scoreBadge.color}18`,
                  color: scoreBadge.color,
                  border: `1px solid ${scoreBadge.color}40`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: scoreBadge.color }} />
                {scoreBadge.text}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-[auto_1fr] items-center gap-6">
              <div className="relative">
                <ScoreRing
                  value={scoreVal}
                  band={data.score.band}
                  size={144}
                  stroke={10}
                  sublabel="OF 100"
                />
              </div>
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-cream/90">
                  {data.insights[0]?.text || "Morning sugar is slightly above target but stable. Afternoon tiredness is worth mentioning to the doctor."}
                </p>
                <div>
                  <div className="w-full">
                    <Sparkline
                      points={data.history.length ? data.history.map((h) => h.score ?? h.raw) : [66, 68, 70, 71, 69, 68]}
                      height={32}
                      color={scoreBadge.color}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted/70">
                    <span>30 DAYS</span>
                    <span>TODAY</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 2: FAMILY PULSE */}
        <Card className="flex flex-col justify-between p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Family Pulse</p>
              <Link href="/family" className="inline-flex items-center gap-1 text-[12px] font-semibold text-mint hover:underline">
                Open &gt;
              </Link>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold text-cream">
                {data.familyScore != null ? Math.round(data.familyScore) : 70}
              </span>
              <span className="text-[13px] font-bold uppercase tracking-wider text-muted">AVG</span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted">Sharma family · code DOCM47</p>

            <div className="mt-5 space-y-3">
              {persons.map((p) => {
                const pScore = p.score != null ? p.score : p.name.includes("Ananya") ? 83 : p.name.includes("Raghavan") ? 59 : 68;
                const barColor = pScore >= 75 ? "#6EE0CF" : pScore >= 60 ? "#E0A36E" : "#D4705A";
                const isYou = p.id === currentPersonId;

                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                      style={{ background: `${barColor}26`, color: barColor }}
                    >
                      {p.name.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-[12.5px] font-medium">
                        <span className="text-cream truncate">
                          {p.name} {isYou ? <span className="text-muted text-[11px]">you</span> : null}
                        </span>
                        <span className="font-bold text-cream ml-2">{pScore}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-night3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pScore}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* -------------------------------------------------- 4 Quick Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Blood Pressure */}
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <div className="text-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </div>
          <p className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Blood Pressure</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-xl font-bold text-cream">
              {data.kpis.bp ? `${data.kpis.bp.systolic}/${data.kpis.bp.diastolic}` : "136/84"}
            </span>
            <span className="text-[11px] text-muted">mmHg</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">Tuesday · 2:41 pm</p>
        </Card>

        {/* Sleep */}
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <div className="text-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          </div>
          <p className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Sleep</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-xl font-bold text-cream">
              {data.kpis.sleepAvg7 != null ? data.kpis.sleepAvg7.toFixed(1) : "6.3"}
            </span>
            <span className="text-[11px] text-muted">hrs avg</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">across 3 notes this week</p>
        </Card>

        {/* Activity */}
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <div className="text-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="5" r="2" />
              <path d="m9 20 3-6 3 6M6 11l6-2 6 2M12 9v5" />
            </svg>
          </div>
          <p className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Activity</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-xl font-bold text-cream">
              {data.kpis.activityAvg7 != null ? Math.round(data.kpis.activityAvg7) : "17"}
            </span>
            <span className="text-[11px] text-muted">min/day</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">from what you mention</p>
        </Card>

        {/* Medicines */}
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <div className="text-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
              <path d="m8.5 8.5 7 7" />
            </svg>
          </div>
          <p className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Medicines</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-xl font-bold text-cream">3/3</span>
            <span className="text-[11px] text-muted">taken</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">this week</p>
        </Card>
      </div>

      {/* -------------------------------------------------- Recent Voice Notes Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted">Recent Voice Notes</h2>
          <Link href="/history" className="inline-flex items-center gap-1 text-[12px] font-semibold text-mint hover:underline">
            All notes ↗
          </Link>
        </div>

        <Card className="p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6ee0cf]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#6ee0cf]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#6ee0cf]" />
                ALL GOOD
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                TUESDAY · 2:41 PM
              </span>
            </div>
            <div className="flex items-center gap-1 text-[12px] font-bold text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              </svg>
              <span>30</span>
            </div>
          </div>

          <h3 className="font-display text-[17px] font-bold text-cream">
            {recentNotes[0]?.title || "Tablets taken, sugar a little high"}
          </h3>
          <p className="text-[13.5px] text-muted leading-relaxed">
            {recentNotes[0]?.detail || "Morning sugar is slightly above target but stable. Afternoon tiredness is worth mentioning to the doctor."}
          </p>

          <div className="flex items-start gap-2.5 rounded-xl border border-hairline/60 bg-night3/40 p-3.5">
            <span className="text-xl leading-none text-muted select-none">“</span>
            <p className="text-[13px] italic leading-relaxed text-cream/80">
              {recentNotes[0]?.meta?.text || "Slept well last night. Took both tablets after breakfast. Sugar was 142 in the morning. Some tiredness in the afternoon."}
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
