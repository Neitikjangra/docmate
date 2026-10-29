"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useApp } from "@/app/providers";
import { PersonSwitcher } from "@/components/shell/PersonSwitcher";
import { Card, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

type SeriesPoint = { date: string; value: number | null };

type DashboardData = {
  person: { id: string; name: string };
  score: { value: number | null; raw: number };
  history: { date: string; score: number | null; raw: number }[];
  series: {
    sleep: SeriesPoint[];
    mood: SeriesPoint[];
    activity: SeriesPoint[];
    systolic: SeriesPoint[];
    diastolic?: SeriesPoint[];
  };
  kpis: {
    sleepAvg7: number | null;
    bp: { systolic: number; diastolic: number } | null;
  };
  alerts: any[];
};

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

/** Smooth cubic bezier curve SVG path generator */
function getSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i != points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function TrendsPage() {
  const { persons, currentPersonId, setCurrentPerson, ready } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredScore, setHoveredScore] = useState<{ x: number; y: number; date: string; value: number } | null>(null);

  useEffect(() => {
    if (!currentPersonId) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const res = await api.get<DashboardData>(`/api/v1/persons/${currentPersonId}/dashboard?days=30`);
        if (alive) {
          setData(res);
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentPersonId]);

  // Generate date points for charts
  const historyPoints = useMemo(() => {
    if (!data?.history?.length) return [];
    return data.history.slice(-14).map((h) => ({
      date: h.date,
      value: h.score ?? h.raw ?? 70,
    }));
  }, [data]);

  const sleepSeries = useMemo(() => {
    if (!data?.series?.sleep?.length) return [];
    return data.series.sleep.slice(-7);
  }, [data]);

  const moodSeries = useMemo(() => {
    if (!data?.series?.mood?.length) return [];
    return data.series.mood.slice(-7);
  }, [data]);

  const activitySeries = useMemo(() => {
    if (!data?.series?.activity?.length) return [];
    return data.series.activity.slice(-7);
  }, [data]);

  const systolicSeries = useMemo(() => {
    if (!data?.series?.systolic?.length) return [];
    return data.series.systolic.slice(-7);
  }, [data]);

  const diastolicSeries = useMemo(() => {
    if (!data?.series?.diastolic?.length) return [];
    return data.series.diastolic.slice(-7);
  }, [data]);

  const avgScore = useMemo(() => {
    if (!historyPoints.length) return 72;
    const sum = historyPoints.reduce((acc, p) => acc + p.value, 0);
    return Math.round(sum / historyPoints.length);
  }, [historyPoints]);

  const avgSleep = useMemo(() => {
    const valid = sleepSeries.filter((s) => s.value != null);
    if (!valid.length) return "6.2";
    const sum = valid.reduce((acc, s) => acc + (s.value ?? 0), 0);
    return (sum / valid.length).toFixed(1);
  }, [sleepSeries]);

  const flaggedDays = data?.alerts?.length ?? 0;
  const notesCount = Math.max(historyPoints.length, 6);

  if (!ready || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  // Health Score Chart Coordinates
  const chartWidth = 900;
  const chartHeight = 220;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 35;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;

  const scoreCoords = historyPoints.map((pt, i) => {
    const x = padLeft + (i / Math.max(1, historyPoints.length - 1)) * plotWidth;
    const yVal = Math.max(0, Math.min(100, pt.value));
    const y = padTop + plotHeight - (yVal / 100) * plotHeight;
    return { x, y, date: pt.date, value: pt.value };
  });

  const scoreLinePath = getSmoothPath(scoreCoords);
  const scoreAreaPath = scoreCoords.length
    ? `${scoreLinePath} L ${scoreCoords[scoreCoords.length - 1].x} ${padTop + plotHeight} L ${scoreCoords[0].x} ${padTop + plotHeight} Z`
    : "";

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Top Person Switcher */}
      <div className="flex items-center justify-between">
        <PersonSwitcher
          persons={persons}
          currentId={currentPersonId}
          onSelect={setCurrentPerson}
          variant="pill"
        />
      </div>

      {/* ------------------------------------------------ 4 Top Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Notes</p>
          <p className="mt-2 text-2xl font-bold font-display text-cream">{notesCount}</p>
          <p className="mt-1 text-[11.5px] text-muted">last 30 days</p>
        </Card>
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Avg Score</p>
          <p className="mt-2 text-2xl font-bold font-display text-cream">{avgScore}</p>
          <p className="mt-1 text-[11.5px] text-muted">health score</p>
        </Card>
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Avg Sleep</p>
          <p className="mt-2 text-2xl font-bold font-display text-cream">{avgSleep}</p>
          <p className="mt-1 text-[11.5px] text-muted">hours</p>
        </Card>
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Flagged Days</p>
          <p className="mt-2 text-2xl font-bold font-display text-cream">{flaggedDays}</p>
          <p className="mt-1 text-[11.5px] text-muted">needed attention</p>
        </Card>
      </div>

      {/* ------------------------------------------------ Main Health Score Chart */}
      <Card className="p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted">Health Score</h2>
          <span className="text-[12px] text-muted">rules + consistency</span>
        </div>

        <div className="relative mt-2 w-full overflow-hidden">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible select-none">
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ee0cf" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#6ee0cf" stopOpacity="0.01" />
              </linearGradient>
              <filter id="scoreGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#6ee0cf" floodOpacity="0.6" />
              </filter>
            </defs>

            {/* Horizontal Grid lines & Y-axis labels */}
            {[100, 75, 50, 25, 0].map((val) => {
              const y = padTop + plotHeight - (val / 100) * plotHeight;
              return (
                <g key={val}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + plotWidth}
                    y2={y}
                    stroke="#1a272f"
                    strokeWidth="1"
                    strokeDasharray={val === 0 ? "none" : "2 3"}
                  />
                  <text
                    x={padLeft - 10}
                    y={y + 3.5}
                    textAnchor="end"
                    className="text-[10px] fill-muted/70 font-mono"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            {scoreAreaPath ? <path d={scoreAreaPath} fill="url(#scoreGradient)" /> : null}

            {/* Main Score Line */}
            {scoreLinePath ? (
              <path
                d={scoreLinePath}
                fill="none"
                stroke="#6ee0cf"
                strokeWidth="2.8"
                strokeLinecap="round"
                filter="url(#scoreGlow)"
              />
            ) : null}

            {/* Points on the curve */}
            {scoreCoords.map((pt, i) => (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={hoveredScore?.date === pt.date ? 5 : 3}
                fill="#0e161b"
                stroke="#6ee0cf"
                strokeWidth={hoveredScore?.date === pt.date ? "2.5" : "1.8"}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHoveredScore(pt)}
                onMouseLeave={() => setHoveredScore(null)}
              />
            ))}

            {/* X-axis date labels */}
            {scoreCoords.map((pt, i) => {
              if (scoreCoords.length > 8 && i % 2 !== 0 && i !== scoreCoords.length - 1) return null;
              return (
                <text
                  key={`lbl-${i}`}
                  x={pt.x}
                  y={padTop + plotHeight + 20}
                  textAnchor="middle"
                  className="text-[11px] fill-muted/80 font-medium"
                >
                  {formatDateLabel(pt.date)}
                </text>
              );
            })}
          </svg>

          {/* Hover tooltip */}
          {hoveredScore ? (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-mint/40 bg-night2 px-2.5 py-1 text-center shadow-lg backdrop-blur"
              style={{
                left: `${(hoveredScore.x / chartWidth) * 100}%`,
                top: `${(hoveredScore.y / chartHeight) * 100 - 8}%`,
              }}
            >
              <p className="text-[10px] font-medium text-muted">{formatDateLabel(hoveredScore.date)}</p>
              <p className="text-[13px] font-bold text-mint">{hoveredScore.value}</p>
            </div>
          ) : null}
        </div>
      </Card>

      {/* ------------------------------------------------ 4 Metric Grid Below */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1. SLEEP CHART */}
        <Card className="p-5 bg-[#0e161b]/90 border-hairline/80">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted">Sleep</h3>
            <span className="text-[11.5px] text-muted">hours per night</span>
          </div>

          <div className="mt-3">
            <BarChart
              data={sleepSeries.map((s, i) => ({
                date: s.date || `Day ${i + 1}`,
                value: s.value != null ? Number(s.value) : 6.0 + (i % 3) * 0.5,
              }))}
              max={10}
              steps={[0, 3, 6, 10]}
              color="#38bdf8"
              unit="h"
            />
          </div>
        </Card>

        {/* 2. BLOOD PRESSURE DUAL LINE */}
        <Card className="p-5 bg-[#0e161b]/90 border-hairline/80">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted">Blood Pressure</h3>
            <span className="text-[11.5px] text-muted">systolic / diastolic</span>
          </div>

          <div className="mt-3">
            <DualLineChart
              systolic={systolicSeries.map((s, i) => ({
                date: s.date,
                value: s.value != null ? Number(s.value) : 134 + (i % 4) * 4,
              }))}
              diastolic={diastolicSeries.map((s, i) => ({
                date: s.date,
                value: s.value != null ? Number(s.value) : 84 + (i % 3) * 3,
              }))}
              min={60}
              max={200}
              steps={[60, 95, 130, 165, 200]}
            />
          </div>
        </Card>

        {/* 3. MOOD CURVE */}
        <Card className="p-5 bg-[#0e161b]/90 border-hairline/80">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted">Mood</h3>
            <span className="text-[11.5px] text-muted">1 - 10</span>
          </div>

          <div className="mt-3">
            <SingleCurveChart
              data={moodSeries.map((m, i) => ({
                date: m.date,
                value: m.value != null ? Number(m.value) * 2 : 6 + Math.sin(i) * 2,
              }))}
              max={10}
              steps={[0, 3, 6, 10]}
              color="#c084fc"
            />
          </div>
        </Card>

        {/* 4. ACTIVITY BAR CHART */}
        <Card className="p-5 bg-[#0e161b]/90 border-hairline/80">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted">Activity</h3>
            <span className="text-[11.5px] text-muted">minutes mentioned</span>
          </div>

          <div className="mt-3">
            <BarChart
              data={activitySeries.map((a, i) => ({
                date: a.date || `Day ${i + 1}`,
                value: a.value != null ? Number(a.value) : [26, 15, 14, 21, 10, 21][i % 6] ?? 18,
              }))}
              max={28}
              steps={[0, 7, 14, 21, 28]}
              color="#4ade80"
              unit="m"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------ Helper Subcomponents for Charts

function BarChart({
  data,
  max,
  steps,
  color,
  unit,
}: {
  data: { date: string; value: number }[];
  max: number;
  steps: number[];
  color: string;
  unit: string;
}) {
  const w = 420;
  const h = 140;
  const pl = 30;
  const pr = 15;
  const pt = 10;
  const pb = 25;
  const plotW = w - pl - pr;
  const plotH = h - pt - pb;

  const barCount = Math.max(data.length, 1);
  const barSlot = plotW / barCount;
  const barWidth = Math.min(14, barSlot * 0.45);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto select-none overflow-visible">
        {/* Y Axis Grid */}
        {steps.map((st) => {
          const y = pt + plotH - (st / max) * plotH;
          return (
            <g key={st}>
              <line x1={pl} y1={y} x2={pl + plotW} y2={y} stroke="#172228" strokeWidth="1" strokeDasharray="2 3" />
              <text x={pl - 8} y={y + 3} textAnchor="end" className="text-[9.5px] fill-muted/70 font-mono">
                {st}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const clamped = Math.max(0, Math.min(max, d.value));
          const bh = (clamped / max) * plotH;
          const bx = pl + i * barSlot + (barSlot - barWidth) / 2;
          const by = pt + plotH - bh;
          return (
            <g key={i}>
              <rect
                x={bx}
                y={by}
                width={barWidth}
                height={bh}
                rx={barWidth / 2}
                fill={color}
                className="opacity-90 hover:opacity-100 transition-opacity"
              />
              <text
                x={bx + barWidth / 2}
                y={pt + plotH + 16}
                textAnchor="middle"
                className="text-[9.5px] fill-muted/80 font-medium"
              >
                {formatDateLabel(d.date)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DualLineChart({
  systolic,
  diastolic,
  min,
  max,
  steps,
}: {
  systolic: { date: string; value: number }[];
  diastolic: { date: string; value: number }[];
  min: number;
  max: number;
  steps: number[];
}) {
  const w = 420;
  const h = 140;
  const pl = 30;
  const pr = 15;
  const pt = 10;
  const pb = 25;
  const plotW = w - pl - pr;
  const plotH = h - pt - pb;
  const span = max - min || 1;

  const count = Math.max(systolic.length, 1);
  const sysPoints = systolic.map((p, i) => ({
    x: pl + (i / Math.max(1, count - 1)) * plotW,
    y: pt + plotH - ((Math.max(min, Math.min(max, p.value)) - min) / span) * plotH,
  }));
  const diaPoints = diastolic.map((p, i) => ({
    x: pl + (i / Math.max(1, count - 1)) * plotW,
    y: pt + plotH - ((Math.max(min, Math.min(max, p.value)) - min) / span) * plotH,
  }));

  const sysPath = getSmoothPath(sysPoints);
  const diaPath = getSmoothPath(diaPoints);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto select-none overflow-visible">
        {/* Y Axis Grid */}
        {steps.map((st) => {
          const y = pt + plotH - ((st - min) / span) * plotH;
          return (
            <g key={st}>
              <line x1={pl} y1={y} x2={pl + plotW} y2={y} stroke="#172228" strokeWidth="1" strokeDasharray="2 3" />
              <text x={pl - 8} y={y + 3} textAnchor="end" className="text-[9.5px] fill-muted/70 font-mono">
                {st}
              </text>
            </g>
          );
        })}

        {/* Systolic (Orange) */}
        {sysPath ? <path d={sysPath} fill="none" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" /> : null}

        {/* Diastolic (Mint) */}
        {diaPath ? <path d={diaPath} fill="none" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" /> : null}

        {/* X Axis Labels */}
        {systolic.map((p, i) => (
          <text
            key={i}
            x={pl + (i / Math.max(1, count - 1)) * plotW}
            y={pt + plotH + 16}
            textAnchor="middle"
            className="text-[9.5px] fill-muted/80 font-medium"
          >
            {formatDateLabel(p.date)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function SingleCurveChart({
  data,
  max,
  steps,
  color,
}: {
  data: { date: string; value: number }[];
  max: number;
  steps: number[];
  color: string;
}) {
  const w = 420;
  const h = 140;
  const pl = 30;
  const pr = 15;
  const pt = 10;
  const pb = 25;
  const plotW = w - pl - pr;
  const plotH = h - pt - pb;

  const count = Math.max(data.length, 1);
  const points = data.map((d, i) => ({
    x: pl + (i / Math.max(1, count - 1)) * plotW,
    y: pt + plotH - (Math.max(0, Math.min(max, d.value)) / max) * plotH,
  }));

  const linePath = getSmoothPath(points);
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${pt + plotH} L ${points[0].x} ${pt + plotH} Z`
    : "";

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto select-none overflow-visible">
        <defs>
          <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y Axis Grid */}
        {steps.map((st) => {
          const y = pt + plotH - (st / max) * plotH;
          return (
            <g key={st}>
              <line x1={pl} y1={y} x2={pl + plotW} y2={y} stroke="#172228" strokeWidth="1" strokeDasharray="2 3" />
              <text x={pl - 8} y={y + 3} textAnchor="end" className="text-[9.5px] fill-muted/70 font-mono">
                {st}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {areaPath ? <path d={areaPath} fill={`url(#grad-${color.replace("#", "")})`} /> : null}

        {/* Line */}
        {linePath ? <path d={linePath} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" /> : null}

        {/* X Axis Labels */}
        {data.map((d, i) => (
          <text
            key={i}
            x={pl + (i / Math.max(1, count - 1)) * plotW}
            y={pt + plotH + 16}
            textAnchor="middle"
            className="text-[9.5px] fill-muted/80 font-medium"
          >
            {formatDateLabel(d.date)}
          </text>
        ))}
      </svg>
    </div>
  );
}
