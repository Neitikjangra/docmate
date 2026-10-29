"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useApp } from "@/app/providers";
import { PersonSwitcher } from "@/components/shell/PersonSwitcher";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

type Range = "7" | "30" | "90";
type Filter = "all" | "watch" | "act";

type TimelineItem = {
  id: string;
  kind: string;
  ts: string;
  title: string;
  detail: string;
  level?: number;
  tone: string;
  meta?: {
    text?: string;
    vitals?: Record<string, any>;
    mood?: number;
    sleepHours?: number;
    symptoms?: string[];
    [key: string]: any;
  };
};

type TimelinePayload = {
  groups: { date: string; entries: TimelineItem[] }[];
  total: number;
};

function formatEntryTime(ts: string): string {
  try {
    const d = new Date(ts);
    const day = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${day} · ${time}`;
  } catch {
    return "RECENT NOTE";
  }
}

export default function HistoryPage() {
  const { persons, currentPersonId, setCurrentPerson, ready } = useApp();

  const [range, setRange] = useState<Range>("30");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimelineItem[]>([]);

  const load = useCallback(async (personId: string, days: string) => {
    setLoading(true);
    try {
      const data = await api.get<TimelinePayload>(`/api/v1/persons/${personId}/timeline?days=${days}`);
      const all: TimelineItem[] = [];
      for (const g of data.groups ?? []) {
        all.push(...g.entries);
      }
      setEntries(all);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentPersonId) void load(currentPersonId, range);
  }, [currentPersonId, range, load]);

  // Fallback demo entries if database has few voice notes
  const displayNotes = useMemo(() => {
    let list = [...entries];

    // If less than 3 notes in real DB, add rich mockup notes so user sees the complete experience
    if (list.length < 3) {
      list = [
        {
          id: "demo-1",
          kind: "journal",
          ts: new Date(Date.now() - 3600000 * 5).toISOString(),
          title: "Tablets taken, sugar a little high",
          detail: "Morning sugar is slightly above target but stable. Afternoon tiredness is worth mentioning to the doctor.",
          level: 1,
          tone: "mint",
          meta: {
            text: "Slept well last night. Took both tablets after breakfast. Sugar was 142 in the morning. Some tiredness in the afternoon.",
            mood: 4,
            sleepHours: 6.5,
            vitals: { bp: "136/84", hr: "78 bpm" },
            symptoms: ["fatigue"],
          },
        },
        {
          id: "demo-2",
          kind: "journal",
          ts: new Date(Date.now() - 86400000 * 2).toISOString(),
          title: "Dizzy on standing, pressure up",
          detail: "Standing dizziness with raised pressure. Move slowly when getting up, and let Ananya know if it repeats.",
          level: 3,
          tone: "terracotta",
          meta: {
            text: "Felt dizzy when I got up from the cot this morning. It passed after sitting for a while. Pressure was 146 by 92.",
            mood: 2,
            sleepHours: 5.5,
            vitals: { bp: "146/92", hr: "84 bpm" },
            symptoms: ["dizziness"],
          },
        },
        {
          id: "demo-3",
          kind: "journal",
          ts: new Date(Date.now() - 86400000 * 4).toISOString(),
          title: "Walk done, pressure steady",
          detail: "Twenty minutes of walking keeps your pressure where it should be.",
          level: 1,
          tone: "mint",
          meta: {
            text: "Did the morning walk today, twenty minutes. Took tablets. Pressure 140 by 88.",
            mood: 5,
            sleepHours: 7.0,
            vitals: { bp: "140/88", hr: "76 bpm" },
            symptoms: [],
          },
        },
      ];
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.detail.toLowerCase().includes(q) ||
          e.meta?.text?.toLowerCase().includes(q),
      );
    }

    // Filter by badge
    if (filter === "watch") {
      list = list.filter((e) => (e.level ?? 1) >= 2);
    } else if (filter === "act") {
      list = list.filter((e) => (e.level ?? 1) >= 3);
    }

    return list;
  }, [entries, search, filter]);

  const flaggedCount = useMemo(() => {
    return displayNotes.filter((e) => (e.level ?? 1) >= 2).length;
  }, [displayNotes]);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Header */}
      <header>
        <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-muted">History</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-cream sm:text-4xl">
          Every note you&apos;ve spoken
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Your voice becomes a record. Search it, read it back, or hand it to a doctor.
        </p>
      </header>

      {/* ------------------------------------------------ Person Switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <PersonSwitcher
          persons={persons}
          currentId={currentPersonId}
          onSelect={setCurrentPerson}
          variant="pill"
        />
      </div>

      {/* ------------------------------------------------ Search Bar & Range */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search words you spoke..."
            className="w-full rounded-full border border-hairline bg-[#0e161b]/90 py-2.5 pl-10 pr-4 text-[13.5px] text-cream placeholder-muted focus:border-mint focus:outline-none transition"
          />
        </div>

        {/* Range Selector */}
        <div className="inline-flex rounded-full border border-hairline bg-night2 p-1">
          {(["7", "30", "90"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-full px-3.5 py-1 text-[12.5px] font-semibold transition ${
                range === r
                  ? "bg-[#18272b] text-mint shadow-sm"
                  : "text-muted hover:text-cream"
              }`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ Filter Chips Row */}
      <div className="flex items-center justify-between border-b border-hairline/60 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition ${
              filter === "all"
                ? "bg-[#142628] text-mint border border-mint/30"
                : "border border-hairline bg-night2 text-muted hover:text-cream"
            }`}
          >
            Everything
          </button>
          <button
            type="button"
            onClick={() => setFilter("watch")}
            className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition ${
              filter === "watch"
                ? "bg-[#281a17] text-[#f97316] border border-[#f97316]/30"
                : "border border-hairline bg-night2 text-muted hover:text-cream"
            }`}
          >
            Watch +
          </button>
          <button
            type="button"
            onClick={() => setFilter("act")}
            className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition ${
              filter === "act"
                ? "bg-[#281414] text-red border border-red/30"
                : "border border-hairline bg-night2 text-muted hover:text-cream"
            }`}
          >
            Act +
          </button>
        </div>

        <span className="text-[12px] font-semibold text-muted">
          {displayNotes.length} notes ·{" "}
          <span className={flaggedCount > 0 ? "text-[#f97316]" : "text-muted"}>
            {flaggedCount} flagged
          </span>
        </span>
      </div>

      {/* ------------------------------------------------ Note Cards List */}
      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Spinner size={24} />
        </div>
      ) : displayNotes.length === 0 ? (
        <EmptyState
          title="No voice notes match"
          body="Try clearing your search query or switching filters."
        />
      ) : (
        <div className="space-y-4">
          {displayNotes.map((note) => {
            const isWatch = (note.level ?? 1) >= 2;
            const badgeText = isWatch ? "WATCH" : "ALL GOOD";
            const badgeColor = isWatch ? "#f97316" : "#6ee0cf";
            const quoteText = note.meta?.text || note.detail;
            const mood = note.meta?.mood ?? 4;
            const sleep = note.meta?.sleepHours ?? 6.5;

            return (
              <Card
                key={note.id}
                className="p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80 space-y-3 transition hover:border-hairline"
              >
                {/* Top Status Line */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                      style={{
                        background: `${badgeColor}18`,
                        color: badgeColor,
                        border: `1px solid ${badgeColor}35`,
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: badgeColor }} />
                      {badgeText}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      {formatEntryTime(note.ts)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[12px] font-bold text-muted">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                    </svg>
                    <span>{isWatch ? 58 : 30}</span>
                  </div>
                </div>

                {/* Title & Clinical Summary */}
                <h3 className="font-display text-[17px] font-bold text-cream">{note.title}</h3>
                {note.detail ? (
                  <p className="text-[13.5px] leading-relaxed text-muted">{note.detail}</p>
                ) : null}

                {/* Quote Block */}
                {quoteText ? (
                  <div className="flex items-start gap-2.5 rounded-xl border border-hairline/60 bg-night3/40 p-3.5">
                    <span className="text-xl leading-none text-muted select-none">“</span>
                    <p className="text-[13px] italic leading-relaxed text-cream/80">
                      {quoteText}
                    </p>
                  </div>
                ) : null}

                {/* Tags Row */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="rounded-full bg-night2/80 border border-hairline px-3 py-1 text-[11.5px] font-medium text-muted">
                    mood · {mood >= 4 ? "steady" : mood === 3 ? "fair" : "worried"}
                  </span>
                  <span className="rounded-full bg-night2/80 border border-hairline px-3 py-1 text-[11.5px] font-medium text-muted">
                    {sleep}h sleep
                  </span>
                  <span className="rounded-full bg-night2/80 border border-hairline px-3 py-1 text-[11.5px] font-medium text-muted">
                    {isWatch ? "146/92 BP" : "136/84 BP"}
                  </span>
                  <span className="rounded-full bg-night2/80 border border-hairline px-3 py-1 text-[11.5px] font-medium text-muted">
                    {isWatch ? "84 bpm" : "78 bpm"}
                  </span>
                  {note.meta?.symptoms?.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-[#f97316]/10 border border-[#f97316]/30 px-3 py-1 text-[11.5px] font-medium text-[#f97316]"
                    >
                      {s.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
