"use client";

import Link from "next/link";
import React, { useState } from "react";
import { useApp } from "@/app/providers";
import { SeverityBar } from "@/components/ui";
import { HeartbeatLine } from "./HeartbeatLine";
import type { Verdict } from "@/lib/verdict";

const TONE_RING: Record<string, string> = {
  mint: "ring-mint",
  "mint-soft": "ring-mint",
  terracotta: "ring-terracotta",
  red: "ring-red",
};

const TONE_TEXT: Record<string, string> = {
  mint: "tone-mint",
  "mint-soft": "tone-mint-soft",
  terracotta: "tone-terracotta",
  red: "tone-red",
};

/**
 * The result card (PRD 6.3, 15.3). Its text is fixed by the verdict object —
 * this component can only lay it out, never change severity, name a medicine
 * or give a dose.
 */
export function ResultCard({
  verdict,
  distress,
  acousticQuality,
  onSpeak,
  onShare,
  onEdit,
}: {
  verdict: Verdict;
  distress?: number | null;
  acousticQuality?: string | null;
  onSpeak?: () => void;
  onShare?: () => void;
  onEdit?: () => void;
}) {
  const { t, language } = useApp();
  const [speaking, setSpeaking] = useState(false);
  const [showWhy, setShowWhy] = useState(true);

  return (
    <article className={`surface animate-slide-up p-5 ${TONE_RING[verdict.tone] ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`font-display text-[11px] font-bold uppercase tracking-[0.16em] ${TONE_TEXT[verdict.tone]}`}>
            {t(`card.level.${verdict.level}`)}
          </span>
        </div>
        <SeverityBar level={verdict.level} />
      </div>

      <h2 className="mt-3 font-display text-[21px] font-semibold leading-snug text-cream">{verdict.title}</h2>

      {showWhy ? <p className="mt-2 text-[14px] leading-relaxed text-sage/90">{verdict.why}</p> : null}

      {distress != null && distress >= 45 ? (
        <div className="mt-3 rounded-2xl border border-hairline bg-night3/50 p-3">
          <div className="flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">
            <span>Voice distress</span>
            <span className="mono text-cream">{distress}/100</span>
          </div>
          <div className="mt-2">
            <HeartbeatLine tone={distress >= 85 ? "red" : "terracotta"} height={30} />
          </div>
          {acousticQuality === "poor" ? (
            <p className="mt-2 text-[11.5px] text-muted">The clip was noisy, so this signal was treated gently.</p>
          ) : null}
        </div>
      ) : null}

      {verdict.confidence === "low" ? (
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          {t("alert.confidence", { level: verdict.confidence })} · Still learning your normal, so this note is
          deliberately cautious.
        </p>
      ) : null}

      {verdict.actions.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {verdict.actions.map((a, i) => (
            <Link
              key={a.key}
              href={a.href}
              className={
                a.key === "sos"
                  ? "btn-danger"
                  : i === 0
                    ? "btn-primary"
                    : "btn-ghost"
              }
            >
              {t(`card.act.${a.key}`)}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        {onSpeak ? (
          <button
            type="button"
            onClick={() => {
              setSpeaking(true);
              onSpeak();
              window.setTimeout(() => setSpeaking(false), 1200);
            }}
            className="chip hover:border-mint/40 hover:text-cream"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path d="M16 8.5a5 5 0 0 1 0 7" />
            </svg>
            {speaking ? "…" : t("card.read_to_me")}
          </button>
        ) : null}
        {onShare ? (
          <button type="button" onClick={onShare} className="chip hover:border-mint/40 hover:text-cream">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M8 7l4-4 4 4" />
            </svg>
            {t("card.share_doctor")}
          </button>
        ) : null}
        {onEdit ? (
          <button type="button" onClick={onEdit} className="chip hover:border-mint/40 hover:text-cream">
            {t("card.edit")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          className="chip ml-auto hover:border-mint/40 hover:text-cream"
          aria-pressed={showWhy}
        >
          {showWhy ? "Hide why" : t("card.why_prefix")}
        </button>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted" data-lang={language}>
        {t("card.guardrail")}
        {verdict.ruleId ? ` · ${verdict.ruleId} v${verdict.ruleVersion ?? "1"}` : ""}
      </p>
    </article>
  );
}
