"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { BarSeries, ComponentBars, ScoreRing } from "@/components/charts";
import { Card, EmptyState, Pill, SectionTitle, Segmented } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

interface ScoreComponent {
  key: string;
  label: string;
  quality: number;
  weight: number;
  n: number;
  windowDays: number;
}

interface ScoreData {
  status: string;
  value: number | null;
  raw: number;
  band: string;
  bandWord: string;
  bandTone: string;
  penalty: number;
  penaltyCapped: boolean;
  components: ScoreComponent[];
  dataComponents: number;
}

interface HistoryRow {
  date: string;
  score: number | null;
  raw: number;
}

interface Prediction {
  kind: string;
  label?: string;
  detail?: string;
  confidence: "low" | "medium" | "high";
  dataDays?: number;
  data_days?: number;
  value_json?: string;
}

interface Dashboard {
  empty?: boolean;
  person: { id: string; name: string; age: number | null; relation: string | null; isManaged: boolean };
  score: ScoreData;
  history: HistoryRow[];
  predictions: Prediction[];
}

type Range = "14" | "30" | "90";

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

const COMPONENT_NOTE: Record<string, string> = {
  vitals: "Blood pressure, sugar and other readings you logged.",
  sleep: "Hours slept each night.",
  mood: "How you felt, plus the tone of your voice.",
  activity: "Minutes of movement each day.",
  adherence: "Whether medicines were taken on time.",
};

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}

function formatShort(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function componentSentence(c: ScoreComponent): string {
  const base = COMPONENT_NOTE[c.key] ?? "This part of your health data.";
  if (c.n === 0) return `${base} Nothing logged in the last ${c.windowDays} days, so it is not counted yet.`;
  const win = `the last ${c.windowDays} days`;
  if (c.quality >= 0.8) return `${base} Holding up well over ${win}.`;
  if (c.quality >= 0.6) return `${base} Broadly steady over ${win}.`;
  if (c.quality >= 0.4) return `${base} Slipping a little over ${win}.`;
  return `${base} Pulling the score down over ${win}.`;
}

function confidenceTone(level: string): "muted" | "sage" | "mint" {
  if (level === "high") return "mint";
  if (level === "medium") return "sage";
  return "muted";
}

function predictionText(p: Prediction): { label: string; detail: string } {
  if (p.label) return { label: p.label, detail: p.detail ?? "" };
  if (p.value_json) {
    try {
      const v = JSON.parse(p.value_json);
      return { label: String(v.label ?? p.kind), detail: String(v.detail ?? "") };
    } catch {
      return { label: p.kind, detail: "" };
    }
  }
  return { label: p.kind.replace(/_/g, " "), detail: "" };
}

function predictionDays(p: Prediction): number {
  return p.dataDays ?? p.data_days ?? 0;
}

export default function ScorePage() {
  const { personId } = useParams<{ personId: string }>();
  const { t } = useApp();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("30");

  const load = useCallback(async () => {
    if (!personId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Dashboard>(`/api/v1/persons/${personId}/dashboard?days=90`);
      setData(res);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    void load();
  }, [load]);

  const backLink = (
    <Link href="/" className="link text-[13px]">
      Back to dashboard
    </Link>
  );

  if (loading) {
    return (
      <div className="animate-rise space-y-4">
        <div>{backLink}</div>
        <div className="surface-2 h-56 animate-pulse" aria-hidden />
        <div className="surface-2 h-48 animate-pulse" aria-hidden />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-rise space-y-4">
        <div>{backLink}</div>
        <Card tone="terracotta" className="p-4">
          <p className="text-[14px] leading-relaxed text-cream">{error}</p>
          <button type="button" onClick={() => void load()} className="btn-ghost mt-3">
            {t("common.retry")}
          </button>
        </Card>
      </div>
    );
  }

  if (!data || data.empty) {
    return (
      <div className="animate-rise space-y-4">
        <div>{backLink}</div>
        <EmptyState title="Nothing to show" body="This profile has no score history yet." action={backLink} />
      </div>
    );
  }

  const score = data.score;
  const learning = score.status !== "ok";
  const window = data.history.slice(-Number(range));
  const rangeLabel = window.length
    ? `${formatShort(window[0].date)} – ${formatShort(window[window.length - 1].date)}`
    : "No data yet";
  const points = window.map((h) => h.score);
  const worstFirst = [...score.components].sort((a, b) => a.quality - b.quality);
  const last14 = data.history.slice(-14);
  const dayRows = last14
    .map((h, i) => ({
      date: h.date,
      score: h.score,
      delta: i === 0 ? null : (h.score ?? 0) - (last14[i - 1].score ?? 0),
    }))
    .reverse();

  return (
    <div className="animate-rise space-y-6">
      <div>{backLink}</div>

      <div>
        <SectionTitle hint={`${data.person.name}${data.person.age != null ? `, ${data.person.age}` : ""}`}>
          Health score
        </SectionTitle>
        <Card className="flex flex-col items-center gap-3 p-6">
          <ScoreRing
            value={learning ? null : score.value}
            band={score.band}
            size={190}
            label={score.bandWord}
            sublabel={rangeLabel}
          />
          {learning ? <Pill tone="muted">{t("home.learning")}</Pill> : null}
          <p className="max-w-md text-center text-[12.5px] leading-relaxed text-muted">
            Built only from what this person logs. Red is never used for a score — a low number is a
            prompt to look, not a diagnosis.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle hint="Every part that fed today's number.">How this was calculated</SectionTitle>
        <Card className="space-y-4 p-4">
          <ComponentBars components={score.components} />
          {score.penalty > 0 ? (
            <div className="surface-2 flex items-center justify-between gap-3 p-3.5">
              <div>
                <p className="text-[13px] font-semibold text-cream">Active pattern penalty</p>
                <p className="text-[12px] leading-snug text-muted">
                  Unresolved alerts are still lowering today's score.
                </p>
              </div>
              <span className="font-display text-[20px] font-semibold tone-terracotta">
                -{Math.round(score.penalty)}
              </span>
            </div>
          ) : null}
          {score.penaltyCapped ? (
            <p className="text-[12px] text-muted">The penalty has reached its cap of 25 points.</p>
          ) : null}
          <p className="text-[12.5px] leading-relaxed text-muted">
            Score = weighted quality of your logs minus a penalty for active patterns. Vitals count 30%
            over 14 days; sleep 20%, mood and voice 20%, activity 15% and medicine adherence 15% each over
            7 days. An active level-2 pattern costs 3 points, level 3 costs 8 and level 4 costs 20, capped
            at 25. The day's score is smoothed over a 3-day average; a level-4 alert bypasses smoothing so
            you see it immediately.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle
          hint={`${window.length} day${window.length === 1 ? "" : "s"} with a recorded score.`}
          action={<Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} size="sm" />}
        >
          Score over time
        </SectionTitle>
        <Card className="p-4">
          <BarSeries points={points} height={104} color="#6EE0CF" />
        </Card>
      </div>

      <div>
        <SectionTitle hint="Sorted worst first — in plain language.">What's moving the score</SectionTitle>
        <Card className="space-y-3 p-4">
          {worstFirst.map((c) => (
            <div key={c.key} className="surface-2 p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-semibold text-cream">{c.label}</span>
                <span className="text-[12px] text-muted">
                  {c.n === 0 ? "no data" : `${Math.round(c.quality * 100)}%`} · weight {Math.round(c.weight * 100)}%
                </span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{componentSentence(c)}</p>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <SectionTitle hint="The last 14 days, newest first.">Day by day</SectionTitle>
        {dayRows.length === 0 ? (
          <p className="text-[13px] text-muted">No daily scores recorded yet.</p>
        ) : (
          <Card className="divide-y divide-hairline p-0">
            {dayRows.map((row) => {
              const delta = row.delta;
              const deltaTone =
                delta == null || delta === 0 ? "tone-muted" : delta > 0 ? "tone-mint" : "tone-terracotta";
              const arrow = delta == null || delta === 0 ? "→" : delta > 0 ? "↑" : "↓";
              return (
                <div key={row.date} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[13px] text-cream">{formatShort(row.date)}</span>
                  <span className="font-display text-[14px] font-semibold text-cream">
                    {row.score == null ? "—" : Math.round(row.score)}
                  </span>
                  <span className={`ml-auto text-[12.5px] font-semibold ${deltaTone}`}>
                    {delta == null ? "" : `${arrow} ${delta > 0 ? "+" : ""}${Math.round(delta)}`}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      <div>
        <SectionTitle hint="Patterns Docmate has noticed so far.">Predictions</SectionTitle>
        {data.predictions.length === 0 ? (
          <p className="text-[13px] text-muted">Not enough data to spot a pattern yet.</p>
        ) : (
          <div className="space-y-2">
            {data.predictions.map((p, i) => {
              const text = predictionText(p);
              const days = predictionDays(p);
              return (
                <Card key={`${p.kind}-${i}`} className="p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-cream">{text.label}</span>
                    <Pill tone={confidenceTone(p.confidence)}>{p.confidence}</Pill>
                    <span className="ml-auto text-[11px] text-muted">
                      {t("alert.data_days", { n: days })}
                    </span>
                  </div>
                  {text.detail ? (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{text.detail}</p>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Fewer than 14 days of logs can only ever be low confidence, and a pattern alone is never an
          emergency.
        </p>
      </div>
    </div>
  );
}
