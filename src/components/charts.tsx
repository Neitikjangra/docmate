"use client";

import React from "react";

const TONE: Record<string, string> = {
  starting: "#8A8F8C",
  steady: "#6EE0CF",
  okay: "#9FE6D8",
  slipping: "#D4705A",
  attention: "#D83F3A",
};

/** The health-score dial. Red is never used for a score (PRD 11.2). */
export function ScoreRing({
  value,
  band,
  size = 168,
  label,
  sublabel,
  stroke = 11,
}: {
  value: number | null;
  band: string;
  size?: number;
  label?: string;
  sublabel?: string;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const color = TONE[band] ?? TONE.starting;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16222A" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[42px] font-semibold leading-none" style={{ color }}>
          {value == null ? "—" : Math.round(value)}
        </span>
        {label ? <span className="mt-1 text-[12px] font-semibold" style={{ color }}>{label}</span> : null}
        {sublabel ? <span className="mt-0.5 text-[11px] text-muted">{sublabel}</span> : null}
      </div>
    </div>
  );
}

/** A small smoothing-free line for any series; used for score + vitals trends. */
export function Sparkline({
  points,
  height = 64,
  color = "#6EE0CF",
  fill = true,
  showDots = false,
  band,
}: {
  points: (number | null)[];
  height?: number;
  color?: string;
  fill?: boolean;
  showDots?: boolean;
  band?: [number, number];
}) {
  const w = 300;
  const vals = points.map((p) => (p == null ? null : Number(p)));
  const numeric = vals.filter((v): v is number => v != null);
  if (numeric.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-xl2 border border-dashed border-hairline text-[12px] text-muted" style={{ height }}>
        Not enough data yet
      </div>
    );
  }
  const lo = band ? band[0] : Math.min(...numeric);
  const hi = band ? band[1] : Math.max(...numeric);
  const span = hi - lo || 1;
  const stepX = w / Math.max(1, vals.length - 1);
  const y = (v: number) => height - ((v - lo) / span) * (height - 12) - 6;

  const segs: string[] = [];
  let cur: string[] = [];
  vals.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segs.push(cur.join(" "));
      cur = [];
    } else cur.push(`${cur.length === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (cur.length) segs.push(cur.join(" "));

  const areaPath = (() => {
    const first = vals.findIndex((v) => v != null);
    const lastIdx = vals.length - 1 - [...vals].reverse().findIndex((v) => v != null);
    if (first < 0) return "";
    const d = segs.flatMap((s) => [s]).join(" ");
    return `${d} L${(lastIdx * stepX).toFixed(1)},${height} L${(first * stepX).toFixed(1)},${height} Z`;
  })();

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      {fill && areaPath ? <path d={areaPath} fill={color} fillOpacity="0.1" /> : null}
      {segs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {showDots
        ? vals.map((v, i) =>
            v == null ? null : <circle key={i} cx={i * stepX} cy={y(v)} r="2.4" fill={color} />,
          )
        : null}
    </svg>
  );
}

/** Vertical bars for sleep / activity (minutes or hours). */
export function BarSeries({
  points,
  height = 72,
  color = "#6EE0CF",
  unit = "",
  goal,
}: {
  points: (number | null)[];
  height?: number;
  color?: string;
  unit?: string;
  goal?: number;
}) {
  const numeric = points.filter((v): v is number => v != null);
  const max = Math.max(goal ?? 0, ...numeric, 1);
  const goalY = goal ? height - (goal / max) * (height - 8) : null;
  return (
    <div className="relative" style={{ height }}>
      {goalY != null ? (
        <div className="absolute inset-x-0 border-t border-dashed border-hairline" style={{ top: goalY }} />
      ) : null}
      <div className="flex h-full items-end gap-1">
        {points.map((p, i) => {
          const h = p == null ? 2 : Math.max(3, (Math.min(p, max) / max) * (height - 8));
          return (
            <div key={i} className="group relative flex-1">
              <div
                className="bar-grow w-full rounded-t-md"
                style={{ height: h, background: p == null ? "#1E2A31" : color, opacity: p == null ? 1 : 0.85 }}
                title={p == null ? "no entry" : `${p}${unit}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Horizontal component bars for the score breakdown. */
export function ComponentBars({
  components,
}: {
  components: { key: string; label: string; quality: number; weight: number; n: number }[];
}) {
  return (
    <div className="space-y-3">
      {components.map((c) => {
        const pct = Math.round(c.quality * 100);
        const color = pct >= 80 ? "#6EE0CF" : pct >= 60 ? "#9FE6D8" : pct >= 40 ? "#D4705A" : "#D83F3A";
        return (
          <div key={c.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-cream">{c.label}</span>
              <span className="text-[12px] text-muted">
                {c.n === 0 ? "no data" : `${pct}%`} · weight {Math.round(c.weight * 100)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-night3">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${c.n === 0 ? 0 : pct}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const BAND_TONE = TONE;
