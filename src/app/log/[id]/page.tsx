"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { Card, EmptyState, Pill, SectionTitle } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { asrLocale } from "@/lib/i18n";
import { speak, stopSpeaking } from "@/lib/client/speech";

interface LogEntry {
  id: string;
  kind: string;
  createdAt: string;
  durationS: number | null;
  quality: string | null;
  text: string | null;
  language: string | null;
  distress: number | null;
  calibrating: boolean;
  hasAudio: boolean;
}

const KIND_LABEL: Record<string, string> = {
  voice: "Voice note",
  typed: "Typed note",
  quick: "Quick log",
};

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}

function formatWhen(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function distressColor(value: number | null): string {
  if (value == null) return "#3F8C82";
  if (value >= 85) return "#D83F3A";
  if (value >= 45) return "#D4705A";
  return "#6EE0CF";
}

export default function LogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentPersonId, language, t } = useApp();
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const load = useCallback(async () => {
    if (!currentPersonId) {
      setEntry(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ entries: LogEntry[] }>(
        `/api/v1/persons/${currentPersonId}/log?limit=100`,
      );
      setEntry(data.entries.find((e) => e.id === id) ?? null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [currentPersonId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => stopSpeaking(), []);

  const readAloud = useCallback(() => {
    if (!entry?.text) return;
    setSpeaking(true);
    speak(entry.text, asrLocale(entry.language ?? language), () => setSpeaking(false));
  }, [entry, language]);

  const stop = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const backLink = (
    <Link href="/timeline" className="link text-[13px]">
      Back to timeline
    </Link>
  );

  return (
    <div className="animate-rise space-y-4">
      <div>{backLink}</div>

      {loading ? (
        <div className="space-y-3" aria-hidden>
          <div className="surface-2 h-24 animate-pulse" />
          <div className="surface-2 h-40 animate-pulse" />
          <div className="surface-2 h-20 animate-pulse" />
        </div>
      ) : error ? (
        <Card tone="terracotta" className="p-4">
          <p className="text-[14px] leading-relaxed text-cream">{error}</p>
          <button type="button" onClick={() => void load()} className="btn-ghost mt-3">
            {t("common.retry")}
          </button>
        </Card>
      ) : !entry ? (
        <EmptyState
          title="Recording not found"
          body="This recording may have been removed, or it belongs to a different profile."
          action={backLink}
        />
      ) : (
        <>
          <SectionTitle
            hint={formatWhen(entry.createdAt)}
            action={<Pill tone="muted">{KIND_LABEL[entry.kind] ?? entry.kind}</Pill>}
          >
            Recording
          </SectionTitle>

          <Card className="p-4">
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">Kind</dt>
                <dd className="mt-0.5 text-cream">{KIND_LABEL[entry.kind] ?? entry.kind}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">Duration</dt>
                <dd className="mt-0.5 text-cream">
                  {entry.durationS != null ? `${entry.durationS} seconds` : "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">Language</dt>
                <dd className="mt-0.5 text-cream">{(entry.language ?? "en").toUpperCase()}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-muted">When</dt>
                <dd className="mt-0.5 text-cream">{formatWhen(entry.createdAt)}</dd>
              </div>
            </dl>
            {entry.quality === "poor" || entry.calibrating ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {entry.quality === "poor" ? <span className="chip tone-terracotta">quality: poor</span> : null}
                {entry.calibrating ? <Pill tone="muted">Calibrating</Pill> : null}
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted">What was said</span>
              {entry.text ? (
                speaking ? (
                  <button type="button" onClick={stop} className="chip hover:border-terracotta/40 hover:text-cream">
                    Stop reading
                  </button>
                ) : (
                  <button type="button" onClick={readAloud} className="chip hover:border-mint/40 hover:text-cream">
                    Read this to me
                  </button>
                )
              ) : null}
            </div>
            {entry.text ? (
              <p className="mt-3 font-display text-[18px] leading-relaxed text-cream">{entry.text}</p>
            ) : (
              <p className="mt-3 text-[14px] text-muted">No transcript was saved for this recording.</p>
            )}
          </Card>

          <div className="surface-2 p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              <span>Voice distress</span>
              <span className="mono text-cream">
                {entry.distress == null ? "—" : `${Math.round(entry.distress)}/100`}
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-night3">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${entry.distress == null ? 0 : Math.max(0, Math.min(100, entry.distress))}%`,
                  background: distressColor(entry.distress),
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>0</span>
              <span>100</span>
            </div>
            {entry.calibrating ? (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Still calibrating to this person's own voice — treat the reading gently.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
