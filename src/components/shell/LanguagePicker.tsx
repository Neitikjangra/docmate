"use client";

import React, { useState } from "react";
import { useApp } from "@/app/providers";
import { Sheet } from "@/components/ui";
import { LANGS } from "@/lib/i18n";

/**
 * Language picker (PRD 16.4). Switching is immediate for the UI, for voice
 * replies and for the greeting — no reload, no lost work.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useApp();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === language) ?? LANGS[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="chip transition hover:border-mint/40 hover:text-cream"
        aria-label="Change language"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
        </svg>
        {compact ? current.code.toUpperCase() : current.native}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("ob.lang_q")} size="sm">
        <div className="space-y-2">
          {LANGS.map((l) => {
            const active = l.code === language;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  setLanguage(l.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition ${
                  active ? "border-mint/50 bg-tint-mint" : "border-hairline bg-night3/50 hover:border-mint/30"
                }`}
              >
                <span>
                  <span className="block font-display text-[16px] font-semibold text-cream">{l.native}</span>
                  <span className="text-[12px] text-muted">{l.label}</span>
                </span>
                {active ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6EE0CF" strokeWidth="2.2">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          Voice answers, the greeting and every card follow this choice. Docmate also understands Hinglish.
        </p>
      </Sheet>
    </>
  );
}
