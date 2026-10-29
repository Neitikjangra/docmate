"use client";

import React from "react";

/**
 * The recording heartbeat (PRD 2.2) — a scrolling ECG trace that is the
 * product's signature motion. One SVG path, one CSS animation, so it stays
 * smooth on a low-end phone.
 */
export function HeartbeatLine({
  active = true,
  tone = "mint",
  height = 44,
}: {
  active?: boolean;
  tone?: "mint" | "red" | "terracotta";
  height?: number;
}) {
  const color = tone === "red" ? "#D83F3A" : tone === "terracotta" ? "#D4705A" : "#6EE0CF";
  const path =
    "M0 22 L26 22 L32 22 L36 10 L41 34 L45 22 L58 22 L64 22 L68 17 L72 27 L76 22 " +
    "L102 22 L108 22 L112 6 L117 38 L121 22 L134 22 L140 22 L144 14 L148 30 L152 22 " +
    "L178 22 L184 22 L188 9 L193 35 L197 22 L210 22 L216 22 L220 18 L224 26 L228 22 L240 22";

  return (
    <div className="relative w-full overflow-hidden" style={{ height }} aria-hidden>
      <svg viewBox="0 0 240 44" width="100%" height={height} preserveAspectRatio="none">
        <g className={active ? "ecg-scroll" : ""}>
          {[-240, 0, 240].map((x) => (
            <path
              key={x}
              transform={`translate(${x},0)`}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

/** Tiny equaliser used inside chips while the mic is hot. */
export function Eq({ tone = "mint" }: { tone?: "mint" | "red" }) {
  return (
    <span className="eq" style={{ color: tone === "red" ? "var(--red)" : "var(--mint)" }}>
      <span style={{ background: "currentColor" }} />
      <span style={{ background: "currentColor" }} />
      <span style={{ background: "currentColor" }} />
      <span style={{ background: "currentColor" }} />
      <span style={{ background: "currentColor" }} />
    </span>
  );
}
