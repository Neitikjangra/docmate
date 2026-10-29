"use client";

import React from "react";

export type MicState = "idle" | "listening" | "processing" | "blocked";

/**
 * The hero microphone (PRD 2.2, 5.3). Its ring breathes with the live input
 * level so a person can see that Docmate is hearing them.
 */
export function MicButton({
  state = "idle",
  level = 0,
  onPress,
  size = 116,
  label,
  disabled,
}: {
  state?: MicState;
  level?: number;
  onPress?: () => void;
  size?: number;
  label?: string;
  disabled?: boolean;
}) {
  const listening = state === "listening";
  const processing = state === "processing";
  const blocked = state === "blocked";
  const tint = blocked ? "var(--terracotta)" : listening ? "var(--mint)" : "var(--mint)";
  const scale = 1 + Math.min(0.22, level * 0.22);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {listening ? (
        <>
          <span className="pulse-ring" style={{ borderColor: tint }} />
          <span className="pulse-ring" style={{ borderColor: tint, animationDelay: "0.65s" }} />
        </>
      ) : null}

      <button
        type="button"
        onClick={onPress}
        disabled={disabled || processing}
        aria-label={label ?? (listening ? "Stop recording" : "Start recording")}
        className="relative z-10 flex items-center justify-center rounded-full transition-transform duration-150 active:scale-95 disabled:cursor-wait"
        style={{
          width: size,
          height: size,
          transform: `scale(${listening ? scale : 1})`,
          background: listening
            ? "radial-gradient(circle at 32% 28%, #9FF0E3, #6EE0CF 45%, #3F8C82 100%)"
            : blocked
              ? "radial-gradient(circle at 32% 28%, #E9A08C, #D4705A 55%, #8F4A3B 100%)"
              : "radial-gradient(circle at 32% 28%, #3A5C60, #23383D 55%, #16252A 100%)",
          boxShadow: listening
            ? "0 0 0 1px rgba(110,224,207,.45), 0 18px 42px -18px rgba(110,224,207,.6)"
            : "0 12px 30px -16px rgba(0,0,0,.9), inset 0 0 0 1px rgba(239,229,214,.08)",
        }}
      >
        {processing ? (
          <svg width={size * 0.32} height={size * 0.32} viewBox="0 0 24 24" className="animate-spin">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2.6" fill="none" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </svg>
        ) : (
          <svg
            width={size * 0.34}
            height={size * 0.34}
            viewBox="0 0 24 24"
            fill="none"
            stroke={listening ? "#06211E" : blocked ? "#2A100C" : "var(--cream)"}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
            <path d="M12 18v3.5M9 21.5h6" />
          </svg>
        )}
      </button>
    </div>
  );
}
