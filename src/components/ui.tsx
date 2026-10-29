"use client";

import React, { useEffect, useRef } from "react";

/* ------------------------------------------------------------------ card */
export function Card({
  children,
  className = "",
  tone = "plain",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "plain" | "raised" | "mint" | "terracotta" | "red" }) {
  const toneCls =
    tone === "mint" ? "ring-mint bg-tint-mint"
      : tone === "terracotta" ? "ring-terracotta bg-tint-terracotta"
      : tone === "red" ? "ring-red bg-tint-red"
      : tone === "raised" ? "bg-night3/80"
      : "";
  return (
    <div {...rest} className={`surface ${toneCls} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
  hint,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-[17px] font-semibold text-cream">{children}</h2>
        {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ sheet */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-night/80 backdrop-blur-sm animate-fade-in"
      />
      <div
        className={`relative z-10 w-full ${width} animate-slide-up rounded-t-xl3 border border-hairline bg-night2 p-5 sm:rounded-xl3 sm:p-6`}
      >
        {title ? (
          <div className="mb-4 flex items-start justify-between gap-4">
            <h3 className="font-display text-[19px] font-semibold text-cream">{title}</h3>
            <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-night3 hover:text-cream" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="max-h-[68vh] overflow-y-auto pr-0.5">{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ toggle */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      {label || hint ? (
        <span className="min-w-0">
          {label ? <span className="block text-[14px] font-semibold text-cream">{label}</span> : null}
          {hint ? <span className="mt-0.5 block text-[12px] leading-snug text-muted">{hint}</span> : null}
        </span>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition ${
          checked ? "border-mint/60 bg-mint/90" : "border-hairline bg-night3"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-night shadow transition-all ${
            checked ? "left-[26px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

/* --------------------------------------------------------------- segmented */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-full border border-hairline bg-night3/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full font-semibold transition ${
            size === "sm" ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]"
          } ${value === o.value ? "bg-mint text-night" : "text-muted hover:text-cream"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- stat */
export function Stat({
  label,
  value,
  unit,
  hint,
  tone = "mint",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
  tone?: "mint" | "terracotta" | "red" | "sage" | "muted";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "terracotta" ? "tone-terracotta" : tone === "red" ? "tone-red" : tone === "sage" ? "tone-sage" : tone === "muted" ? "tone-muted" : "tone-mint";
  return (
    <div className="surface-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
        {icon ? <span className={toneCls}>{icon}</span> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`kpi-value ${toneCls}`}>{value}</span>
        {unit ? <span className="text-[12px] text-muted">{unit}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-[12px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ misc */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-hairline px-6 py-10 text-center">
      {icon ? <div className="mb-3 tone-muted">{icon}</div> : null}
      <p className="font-display text-[16px] font-semibold text-cream">{title}</p>
      {body ? <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: string }) {
  const map: Record<string, string> = {
    mint: "border-mint/40 bg-tint-mint tone-mint",
    terracotta: "border-terracotta/40 bg-tint-terracotta tone-terracotta",
    red: "border-alertred/50 bg-tint-red tone-red",
    sage: "border-sage/25 bg-tint-sage tone-sage",
    muted: "border-hairline bg-night3/70 tone-muted",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${map[tone] ?? map.muted}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- severity bar */
export function SeverityBar({ level, max = 4 }: { level: number; max?: number }) {
  const colors = ["#3F8C82", "#6EE0CF", "#9FE6D8", "#D4705A", "#D83F3A"];
  return (
    <div className="flex items-center gap-1" aria-label={`severity ${level} of ${max}`}>
      {Array.from({ length: max + 1 }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-6 rounded-full transition-colors"
          style={{ background: i <= level ? colors[Math.min(i, 4)] : "#1E2A31" }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ toasts */
export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: { id: string; tone: "mint" | "terracotta" | "red"; title: string; body?: string }[];
  onDismiss: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  if (!toasts.length) return null;
  return (
    <div ref={ref} className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-8">
      {toasts.map((tt) => {
        const tone =
          tt.tone === "red" ? "ring-red bg-tint-red" : tt.tone === "terracotta" ? "ring-terracotta bg-tint-terracotta" : "ring-mint bg-tint-mint";
        return (
          <button
            key={tt.id}
            onClick={() => onDismiss(tt.id)}
            className={`pointer-events-auto w-full max-w-md animate-slide-up rounded-2xl border border-hairline bg-night2/95 p-3.5 text-left backdrop-blur ${tone}`}
          >
            <p className="text-[13px] font-semibold text-cream">{tt.title}</p>
            {tt.body ? <p className="mt-0.5 text-[12px] leading-snug text-muted">{tt.body}</p> : null}
          </button>
        );
      })}
    </div>
  );
}
