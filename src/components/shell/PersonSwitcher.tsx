"use client";

import React from "react";
import type { PersonCard } from "@/app/providers";

const TONE: Record<string, string> = {
  mint: "#6EE0CF",
  terracotta: "#D4705A",
  sage: "#E6E1CC",
  mintDim: "#3F8C82",
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  person,
  size = 44,
  active,
  onClick,
  badge,
}: {
  person: { name: string; avatarTone: string; role?: string; isManaged?: boolean };
  size?: number;
  active?: boolean;
  onClick?: () => void;
  badge?: string | null;
}) {
  const color = TONE[person.avatarTone] ?? TONE.mint;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${person.name}${person.isManaged ? " · managed" : ""}${person.role && person.role !== "owner" ? ` · ${person.role}` : ""}`}
      className="relative shrink-0 rounded-full transition-transform active:scale-95"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 34% 28%, ${color}44, ${color}18 60%, transparent)`,
        boxShadow: active
          ? `0 0 0 2px ${color}, 0 8px 22px -12px ${color}`
          : "inset 0 0 0 1px rgba(30,42,49,1)",
      }}
    >
      <span
        className="absolute inset-0 flex items-center justify-center font-display font-semibold"
        style={{ fontSize: size * 0.36, color: active ? color : "var(--cream)" }}
      >
        {initials(person.name)}
      </span>
      {person.role && person.role !== "owner" ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 grid h-[15px] w-[15px] place-items-center rounded-full bg-night3 text-[8px] font-bold uppercase"
          style={{ color }}
        >
          {person.role === "doctor" ? "Dr" : "F"}
        </span>
      ) : null}
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-night bg-alertred" />
      ) : null}
    </button>
  );
}

/**
 * Person switcher pill bar matching Docmate design.
 */
export function PersonSwitcher({
  persons,
  currentId,
  onSelect,
  onAdd,
  size = 28,
  urgentIds = [],
  variant = "pill",
}: {
  persons: PersonCard[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  size?: number;
  urgentIds?: string[];
  variant?: "pill" | "circle";
}) {
  if (variant === "circle") {
    return (
      <div className="no-scrollbar flex items-center gap-2.5 overflow-x-auto">
        {persons.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-1">
            <Avatar
              person={p}
              size={size}
              active={p.id === currentId}
              onClick={() => onSelect(p.id)}
              badge={urgentIds.includes(p.id) ? "urgent" : null}
            />
            <span
              className={`max-w-[70px] truncate text-[11px] font-semibold ${
                p.id === currentId ? "text-cream" : "text-muted"
              }`}
            >
              {p.name.split(" ")[0]}
            </span>
          </div>
        ))}
        {onAdd ? (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={onAdd}
              aria-label="Add a person"
              className="grid shrink-0 place-items-center rounded-full border border-dashed border-hairline text-muted transition hover:border-mint/50 hover:text-mint"
              style={{ width: size, height: size }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <span className="text-[10.5px] font-semibold text-muted">Add</span>
          </div>
        ) : null}
      </div>
    );
  }

  // Pill variant matching mockups: [ (AS) Ananya Sharma  83 ]
  return (
    <div className="no-scrollbar flex items-center gap-2.5 overflow-x-auto py-1">
      {persons.map((p) => {
        const active = p.id === currentId;
        const toneColor = TONE[p.avatarTone] ?? TONE.mint;
        const score = p.score;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`group inline-flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              active
                ? "border border-mint/40 bg-[#122325] text-cream shadow-[0_0_15px_-4px_rgba(110,224,207,0.3)] ring-1 ring-mint/25"
                : "border border-hairline bg-night2/70 text-muted hover:border-hairline hover:bg-night3/80 hover:text-cream"
            }`}
          >
            <span
              className="grid place-items-center rounded-full text-[10.5px] font-bold"
              style={{
                width: 24,
                height: 24,
                background: `${toneColor}28`,
                color: toneColor,
              }}
            >
              {initials(p.name)}
            </span>
            <span className={active ? "font-semibold text-cream" : "text-muted group-hover:text-cream"}>
              {p.name}
            </span>
            {score != null ? (
              <span
                className="text-[12px] font-bold"
                style={{
                  color: score >= 75 ? "#6EE0CF" : score >= 60 ? "#E0A36E" : "#D4705A",
                }}
              >
                {score}
              </span>
            ) : null}
          </button>
        );
      })}
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add a person"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-hairline px-3 py-1.5 text-[12px] font-medium text-muted transition hover:border-mint/50 hover:text-mint"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>Add</span>
        </button>
      ) : null}
    </div>
  );
}
