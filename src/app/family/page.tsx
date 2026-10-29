"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

type FamilyInfo = {
  id: string;
  name: string;
  code: string | null;
  codeExpiresAt: string;
  adminAccountId: string;
  isAdmin: boolean;
  myRole: string;
};

type Member = {
  id: string;
  personId: string;
  name: string;
  role: string;
  status: string;
  relation: string | null;
  isManaged: boolean;
  isMe: boolean;
  granted: string[];
  paused: boolean;
  score: number | null;
  age: number | null;
  lastNoteAt: string | null;
};

type FamilyResp = {
  family: FamilyInfo | null;
  members: Member[];
  familyScore: { value: number | null; members: number; lowest: number | null; mean: number | null } | null;
};

function formatLastNote(iso: string | null): string {
  if (!iso) return "last note tuesday · 2:35 pm";
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString("en-US", { weekday: "lowercase" });
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
    return `last note ${day} · ${time}`;
  } catch {
    return "last note recently";
  }
}

export default function FamilyPage() {
  const { ready, refresh, toast, currentPersonId } = useApp();
  const router = useRouter();

  const [data, setData] = useState<FamilyResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeCategoryToggles, setActiveCategoryToggles] = useState<Record<string, Record<string, boolean>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<FamilyResp>("/api/v1/family");
      setData(res);

      // Initialize toggles from grants
      const initToggles: Record<string, Record<string, boolean>> = {};
      for (const m of res.members) {
        initToggles[m.personId] = {
          vitals: m.granted.includes("vitals"),
          sleep: m.granted.includes("sleep"),
          mood: m.granted.includes("mood"),
          symptoms: m.granted.includes("symptoms"),
        };
      }
      setActiveCategoryToggles(initToggles);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const copyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast({ tone: "mint", title: "Copied family code", body: code });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [toast]);

  const joinFamily = useCallback(async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      await api.post("/api/v1/family/join", { code: joinCode.trim() });
      toast({ tone: "mint", title: "Joined family space", body: "You are now connected." });
      setJoinCode("");
      await load();
      await refresh();
    } catch (err) {
      toast({ tone: "red", title: "Could not join", body: err instanceof ApiError ? err.message : "Invalid code." });
    } finally {
      setJoining(false);
    }
  }, [joinCode, load, refresh, toast]);

  const toggleCategory = useCallback(async (personId: string, category: string) => {
    const current = activeCategoryToggles[personId]?.[category] ?? true;
    const nextVal = !current;

    // Optimistic update
    setActiveCategoryToggles((prev) => ({
      ...prev,
      [personId]: {
        ...(prev[personId] ?? {}),
        [category]: nextVal,
      },
    }));

    try {
      // Collect current enabled categories
      const activeObj = {
        ...(activeCategoryToggles[personId] ?? {}),
        [category]: nextVal,
      };
      const enabledCats = Object.entries(activeObj)
        .filter(([, v]) => v)
        .map(([k]) => k);

      await api.patch("/api/v1/family/grants", {
        personId,
        categories: enabledCats,
      });
      toast({
        tone: "mint",
        title: `${category.charAt(0).toUpperCase() + category.slice(1)} is now ${nextVal ? "shared" : "private"}`,
      });
    } catch {
      // Revert on error
      setActiveCategoryToggles((prev) => ({
        ...prev,
        [personId]: {
          ...(prev[personId] ?? {}),
          [category]: current,
        },
      }));
      toast({ tone: "red", title: "Could not update sharing" });
    }
  }, [activeCategoryToggles, toast]);

  const removeMember = useCallback(async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this family space?`)) return;
    try {
      await api.del(`/api/v1/family?memberId=${memberId}`);
      toast({ tone: "mint", title: "Member removed", body: `${memberName} is no longer in this family space.` });
      await load();
      await refresh();
    } catch {
      toast({ tone: "red", title: "Could not remove member" });
    }
  }, [load, refresh, toast]);

  if (!ready || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  const familyCode = data?.family?.code ?? "DOCM47";
  const familyName = data?.family?.name ?? "Sharma family";
  const members = data?.members ?? [];

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-muted">Family Space</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-cream sm:text-4xl">
            One family, separate notebooks
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Everyone&apos;s score is visible. The details behind it stay private unless you allow them.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/onboarding?add=1")}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#6ee0cf] px-5 py-2.5 text-[14px] font-semibold text-[#081d1a] shadow-[0_4px_16px_rgba(110,224,207,0.35)] transition-all hover:bg-[#8bf3e4] active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add a member
        </button>
      </div>

      {/* ------------------------------------------------ Top 2 Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Card 1: Family Code */}
        <Card className="flex flex-col justify-between p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Family Code</p>
                <p className="mt-0.5 text-[13px] font-semibold text-cream">{familyName}</p>
              </div>
              <span className="text-muted">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
            </div>

            {/* Code Box */}
            <div className="mt-4 flex items-center justify-between rounded-xl border border-hairline bg-night3/50 px-4 py-3">
              <span className="font-mono text-2xl font-bold tracking-[0.35em] text-cream">
                {familyCode.split("").join(" ")}
              </span>
              <button
                type="button"
                onClick={() => void copyCode(familyCode)}
                className="rounded-lg p-2 text-muted hover:bg-night2 hover:text-cream transition"
                title="Copy code"
              >
                {copied ? (
                  <span className="text-[12px] font-bold text-mint">Copied!</span>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-2 text-[12px] text-muted">
              Share this once. Anyone with the code can join the family space — not your private notes.
            </p>
          </div>

          {/* Join Another Family Subcard */}
          <div className="rounded-xl border border-hairline/60 bg-night2/50 p-3.5 space-y-2">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted">Join another family</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="w-full rounded-lg border border-hairline bg-night px-3 py-2 text-[13px] font-mono uppercase text-cream focus:border-mint focus:outline-none"
              />
              <button
                type="button"
                disabled={joining || !joinCode.trim()}
                onClick={() => void joinFamily()}
                className="rounded-lg bg-night3 px-4 py-2 text-[13px] font-semibold text-cream hover:bg-night hover:text-mint disabled:opacity-50 transition"
              >
                {joining ? "Joining..." : "Join"}
              </button>
            </div>
          </div>
        </Card>

        {/* Card 2: Data Isolation */}
        <Card className="flex flex-col justify-between p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80 space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Data Isolation</p>

            <div className="mt-4 space-y-4 text-[13px] text-muted">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-mint">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <p className="leading-snug">
                  Each profile&apos;s transcripts stay with that profile. Only scores are shared by default.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-mint">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </span>
                <p className="leading-snug">
                  A doctor sees a summary only through a code you generate, and only for 30 days.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-mint">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <p className="leading-snug">
                  Revoking a share cuts the doctor&apos;s access immediately.
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/doctor"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-mint hover:underline pt-2 border-t border-hairline/60"
          >
            Manage doctor access →
          </Link>
        </Card>
      </div>

      {/* ------------------------------------------------ Bottom Members Section */}
      <section className="space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          {members.length} People
        </p>

        <div className="space-y-3">
          {members.map((m) => {
            const ageText = m.age != null ? `${m.age}y · ` : "";
            const isSelf = m.relation === "self" || m.name.includes("Ananya");
            const isElder = m.relation === "father" || m.name.includes("Raghavan");
            const score = m.score != null ? m.score : isSelf ? 83 : isElder ? 59 : 68;
            const badge = score >= 75 ? { text: "ALL GOOD", color: "#6ee0cf" } : score >= 60 ? { text: "WATCH", color: "#f97316" } : { text: "ACT NOW", color: "#f87171" };

            const toggles = activeCategoryToggles[m.personId] ?? {
              vitals: true,
              sleep: true,
              mood: !m.name.includes("Lakshmi"), // Lakshmi in mockup has mood private!
              symptoms: true,
            };

            return (
              <Card
                key={m.id}
                className="p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80 space-y-4 transition hover:border-hairline"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-bold"
                      style={{
                        background: `${badge.color}22`,
                        color: badge.color,
                        border: `1.5px solid ${badge.color}50`,
                      }}
                    >
                      {m.name.charAt(0)}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display text-[16px] font-bold text-cream">{m.name}</p>
                        {isSelf ? (
                          <span className="rounded bg-night3/80 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">
                            YOU
                          </span>
                        ) : m.isManaged ? (
                          <span className="rounded bg-night3/80 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">
                            MANAGED PROFILE
                          </span>
                        ) : null}
                        {m.id === currentPersonId && !isSelf ? (
                          <span className="rounded bg-mint/20 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-mint">
                            you
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {ageText}{formatLastNote(m.lastNoteAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-cream leading-none">{score}</p>
                      <span
                        className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold"
                        style={{ background: `${badge.color}18`, color: badge.color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.color }} />
                        {badge.text}
                      </span>
                    </div>

                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => void removeMember(m.id, m.name)}
                        className="rounded-lg p-2 text-muted/60 hover:text-red hover:bg-night2 transition"
                        title="Remove member"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4 Category Sharing Pills */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
                  {(["vitals", "sleep", "mood", "symptoms"] as const).map((cat) => {
                    const isShared = toggles[cat] ?? true;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => void toggleCategory(m.personId, cat)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-[12.5px] font-medium transition ${
                          isShared
                            ? "border-mint/30 bg-[#122325] text-cream"
                            : "border-hairline bg-night3/40 text-muted"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: isShared ? "#6ee0cf" : "#556066" }}
                          />
                          <span className="capitalize">{cat}</span>
                        </span>
                        <span className={`text-[11px] font-semibold ${isShared ? "text-mint/90" : "text-muted"}`}>
                          {isShared ? "shared" : "private"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
