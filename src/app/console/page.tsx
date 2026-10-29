"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/app/providers";
import { Card, EmptyState, Pill, SectionTitle, Spinner, Stat } from "@/components/ui";
import { api, ApiError, track } from "@/lib/client/api";

/* ------------------------------------------------------------------ types */

type Adapter = {
  service: string;
  channel: string;
  driver: "simulated" | "live";
  envKey: string;
  configured: boolean;
  label: string;
};

type OutboxRow = {
  id: string;
  channel: string;
  to: string;
  toLabel: string | null;
  subject: string | null;
  body: string;
  status: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

type OutboxCount = { channel: string; c: number };

type Rule = {
  id: string;
  version: string;
  title: string;
  level: number;
  active: boolean;
  evaluator: string;
  windowDays: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

type Job = {
  id: string;
  kind: string;
  status: string;
  personId: string | null;
  result: Record<string, unknown>;
  createdAt: string;
  finishedAt: string | null;
};

type AnalyticsRow = { name: string; c: number };

type Stats = {
  persons: number;
  accounts: number;
  recordings: number;
  alerts: number;
  sos: number;
  consultations: number;
  seedVersion: string | null;
};

type ConsoleResp = {
  adapters: Adapter[];
  outbox: OutboxRow[];
  outboxCounts: OutboxCount[];
  rules: Rule[];
  jobs: Job[];
  analytics: AnalyticsRow[];
  stats: Stats;
};

/* ---------------------------------------------------------------- helpers */

const CHANNELS = ["all", "otp", "sms", "push", "call", "payment", "tts"] as const;
type ChannelFilter = (typeof CHANNELS)[number];

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong. Please try again.";
}

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function levelTone(level: number): string {
  return level >= 4 ? "red" : level === 3 ? "terracotta" : "muted";
}

/* ------------------------------------------------------------------- page */

export default function ConsolePage() {
  const { ready, t, toast } = useApp();

  const [data, setData] = useState<ConsoleResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [runningNightly, setRunningNightly] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    else setRefreshing(true);
    try {
      const res = await api.get<ConsoleResp>("/api/v1/console");
      setData(res);
    } catch (e) {
      if (!silent) setError(errMsg(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const runNightlyNow = useCallback(async () => {
    setRunningNightly(true);
    try {
      const res = await api.post<{
        summary: {
          persons: number;
          alertsCreated: number;
          predictions: number;
          purged: number;
          errors: string[];
        };
      }>("/api/v1/jobs/nightly", {});
      const s = res.summary;
      track("nightly_run", { count: s.persons }, "console");
      await load(true);
      toast({
        tone: s.errors.length ? "terracotta" : "mint",
        title: "Nightly run finished",
        body: `${s.persons} analysed · ${s.alertsCreated} alerts · ${s.predictions} predictions · ${s.purged} clips purged`,
      });
    } catch (e) {
      toast({ tone: "red", title: "Nightly run failed", body: errMsg(e) });
    } finally {
      setRunningNightly(false);
    }
  }, [load, toast]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void load(true);
    }, 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const countsByChannel = useMemo(() => {
    const map: Record<string, number> = { all: 0 };
    for (const c of data?.outboxCounts ?? []) {
      map[c.channel] = c.c;
      map.all += c.c;
    }
    return map;
  }, [data]);

  const filteredOutbox = useMemo(() => {
    const list = data?.outbox ?? [];
    return channel === "all" ? list : list.filter((r) => r.channel === channel);
  }, [data, channel]);

  const analyticsMax = useMemo(
    () => Math.max(1, ...(data?.analytics ?? []).map((a) => a.c)),
    [data],
  );

  /* -------------------------------------------------------------- loading */

  if (!ready || loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-muted">
        <Spinner size={22} />
        <p className="text-[13px]">{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card tone="terracotta" className="p-5">
        <p className="text-[13px] font-semibold text-cream">{error ?? "Could not load the console."}</p>
        <button type="button" className="btn-ghost mt-3" onClick={() => { setLoading(true); void load(); }}>
          {t("common.retry")}
        </button>
      </Card>
    );
  }

  const { stats } = data;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-cream">{t("console.title")}</h1>
          <p className="mt-1 text-[13px] text-muted">{t("console.subtitle")}</p>
        </div>
        <button type="button" className="btn-ghost" disabled={refreshing} onClick={() => void load(true)}>
          {refreshing ? <Spinner size={16} /> : null} Refresh
        </button>
      </div>

      {/* nightly trigger */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-cream">Nightly run</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">
            Baselines, doctor-reviewed rules, score, predictions and the audio retention sweep —
            once per person, recorded in the job queue below.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={runningNightly}
          onClick={runNightlyNow}
        >
          {runningNightly ? <Spinner size={16} /> : null} Run nightly job
        </button>
      </Card>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Persons" value={stats.persons} />
        <Stat label="Accounts" value={stats.accounts} />
        <Stat label="Recordings" value={stats.recordings} />
        <Stat label="Alerts" value={stats.alerts} />
        <Stat label="SOS events" value={stats.sos} tone="terracotta" />
        <Stat label="Consults" value={stats.consultations} />
        <Stat label="Seed version" value={stats.seedVersion ?? "—"} tone="muted" />
      </div>

      {/* adapters */}
      <div>
        <SectionTitle hint="Drop the env key in to go live — no code change.">{t("console.adapters")}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.adapters.map((a) => (
            <Card key={a.service} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-cream">{a.service}</p>
                  <p className="mt-0.5 text-[12px] text-muted">{a.label}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${a.driver === "live" ? "bg-mint text-night" : "ring-mint tone-mint"}`}>
                  {a.driver === "live" ? t("console.live") : t("console.simulated")}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="chip">{a.channel}</span>
                <span className="mono text-[11.5px] text-muted">{a.envKey}</span>
              </div>
              <p className="mt-2 text-[11.5px] leading-snug text-muted">
                Without <span className="mono">{a.envKey}</span> every message is recorded here instead of sent.
              </p>
            </Card>
          ))}
        </div>
      </div>

      {/* channel filter */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip whitespace-nowrap ${channel === c ? "ring-mint tone-mint" : ""}`}
            onClick={() => setChannel(c)}
          >
            {c} · {countsByChannel[c] ?? 0}
          </button>
        ))}
      </div>

      {/* outbox */}
      <div>
        <SectionTitle hint="The exact payload each simulated driver would have sent.">Outbox</SectionTitle>
        {filteredOutbox.length === 0 ? (
          <EmptyState title={t("console.empty")} body="Nothing has been sent on this channel yet." />
        ) : (
          <div className="space-y-3">
            {filteredOutbox.map((r) => {
              const otpCode = typeof r.meta?.code === "string" ? (r.meta.code as string) : null;
              const isOtp = r.channel === "otp" || !!otpCode;
              return (
                <Card key={r.id} className={isOtp ? "p-4 ring-mint" : "p-4"}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={isOtp ? "mint" : "muted"}>{r.channel}</Pill>
                      <Pill tone={r.status === "delivered" ? "sage" : r.status === "suppressed" ? "terracotta" : "muted"}>{r.status}</Pill>
                      {otpCode ? <span className="mono text-[15px] font-bold tracking-[0.3em] text-mint">{otpCode}</span> : null}
                    </div>
                    <span className="text-[11.5px] text-muted">{stamp(r.createdAt)}</span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="text-muted">To</span>
                    <span className="mono text-cream">{r.toLabel ?? r.to}</span>
                    {r.subject ? <span className="text-cream/90">· {r.subject}</span> : null}
                  </div>

                  <pre className="mono mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl2 border border-hairline bg-night3/70 p-3 text-[12px] leading-relaxed text-cream/90">
                    {r.body}
                  </pre>

                  <button
                    type="button"
                    className="link mt-2 text-[12px]"
                    onClick={() => setExpanded((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                  >
                    {expanded[r.id] ? "Hide raw meta" : "Show raw meta"}
                  </button>

                  {expanded[r.id] ? (
                    <div className="mt-2 overflow-hidden rounded-xl2 border border-hairline">
                      <table className="w-full text-left text-[12px]">
                        <tbody>
                          {Object.entries(r.meta).length === 0 ? (
                            <tr><td className="px-3 py-2 text-muted">No metadata.</td></tr>
                          ) : (
                            Object.entries(r.meta).map(([k, v]) => (
                              <tr key={k} className="border-t border-hairline first:border-t-0">
                                <td className="w-1/3 px-3 py-1.5 align-top text-muted">{k}</td>
                                <td className="mono px-3 py-1.5 break-all text-cream/90">
                                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* rule store */}
      <div>
        <SectionTitle hint="Thresholds live in the rule store, not in code.">Rule store</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead className="bg-night3/70 text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Rule</th>
                <th className="px-3 py-2 font-semibold">Ver</th>
                <th className="px-3 py-2 font-semibold">Title</th>
                <th className="px-3 py-2 font-semibold">Level</th>
                <th className="px-3 py-2 font-semibold">Window</th>
                <th className="px-3 py-2 font-semibold">Active</th>
                <th className="px-3 py-2 font-semibold">Evaluator</th>
                <th className="px-3 py-2 font-semibold">Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.id} className="border-t border-hairline">
                  <td className="mono px-3 py-2 text-cream/90">{r.id}</td>
                  <td className="px-3 py-2 text-muted">{r.version}</td>
                  <td className="px-3 py-2 text-cream/90">{r.title}</td>
                  <td className="px-3 py-2"><Pill tone={levelTone(r.level)}>L{r.level}</Pill></td>
                  <td className="px-3 py-2 text-muted">{r.windowDays != null ? `${r.windowDays}d` : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={r.active ? "tone-mint" : "tone-muted"}>{r.active ? "active" : "off"}</span>
                  </td>
                  <td className="px-3 py-2 text-muted">{r.evaluator}</td>
                  <td className="px-3 py-2 text-muted">
                    {r.reviewedBy ?? "—"}{r.reviewedAt ? ` · ${String(r.reviewedAt).slice(0, 10)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* jobs + analytics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <SectionTitle>{t("console.jobs")}</SectionTitle>
          <Card className="divide-y divide-hairline">
            {data.jobs.length === 0 ? (
              <p className="p-4 text-[13px] text-muted">{t("console.empty")}</p>
            ) : (
              data.jobs.slice(0, 12).map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-3 p-3.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-cream">{j.kind}</p>
                    <p className="text-[11.5px] text-muted">
                      {j.personId ? `${j.personId} · ` : ""}{stamp(j.createdAt)}
                      {j.finishedAt ? ` → ${stamp(j.finishedAt)}` : ""}
                    </p>
                  </div>
                  <Pill tone={j.status === "done" ? "mint" : j.status === "failed" ? "red" : "muted"}>{j.status}</Pill>
                </div>
              ))
            )}
          </Card>
        </div>

        <div>
          <SectionTitle hint="Privacy-scrubbed — names only, never health text.">Analytics</SectionTitle>
          <Card className="space-y-3 p-4">
            {data.analytics.length === 0 ? (
              <p className="text-[13px] text-muted">{t("console.empty")}</p>
            ) : (
              data.analytics.map((a) => (
                <div key={a.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold text-cream">{a.name}</span>
                    <span className="text-[12px] text-muted">{a.c}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-night3">
                    <div className="h-full rounded-full bg-mint/70" style={{ width: `${(a.c / analyticsMax) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
