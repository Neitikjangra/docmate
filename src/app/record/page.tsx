"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { HeartbeatLine } from "@/components/shell/HeartbeatLine";
import { MicButton, type MicState } from "@/components/shell/MicButton";
import { ResultCard } from "@/components/shell/ResultCard";
import { PersonSwitcher } from "@/components/shell/PersonSwitcher";
import { refreshSos } from "@/components/shell/SosOverlay";
import { Card, EmptyState, Pill, SectionTitle } from "@/components/ui";
import { api, ApiError, track } from "@/lib/client/api";
import { enqueue, newClientId } from "@/lib/client/offline";
import { asrLocale, LANGS } from "@/lib/i18n";
import { speak, speechSupported, startListening, stopSpeaking, type ListenHandle } from "@/lib/client/speech";
import { extractAcoustics, speakingRate } from "@/lib/client/voice";
import type { Verdict } from "@/lib/verdict";

/* ------------------------------------------------------------------ types */

type LogResponse = {
  verdict: Verdict;
  saved: { symptoms: number; vitals: number; medicines: number; journal: boolean };
  extraction: {
    intent: string;
    language: string;
    symptoms: { key: string; label: string; severity: string }[];
    vitals: { type: string; value: Record<string, any>; unit: string }[];
    mood: number | null;
    sleepHours: number | null;
    stress: number | null;
    activityMinutes: number | null;
    redFlags: string[];
    foodTags: string[];
    medicineEvents: { name: string | null; status: string }[];
  };
  distress: number | null;
  acousticQuality: string | null;
  alert: { id: string; level: number; title: string } | null;
  sos: { id: string; countdown: number; trigger: string } | null;
  recordingId: string;
};

type Mode = "voice" | "typed";

const VITALS_HINT = "e.g. “BP 150 over 95” or “sugar 180 today”";

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Docmate could not reach the server.";
}

function isOfflineish(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof ApiError) return err.status >= 500;
  return true;
}

function vitalText(v: { type: string; value: Record<string, any>; unit: string }): string {
  if (v.type === "bp") return `BP ${v.value.systolic}/${v.value.diastolic} mmHg`;
  if (typeof v.value?.value === "number") return `${v.type.replace(/_/g, " ")} ${v.value.value} ${v.unit ?? ""}`.trim();
  return v.type.replace(/_/g, " ");
}

/* ------------------------------------------------------------------- page */

export default function RecordPage() {
  const { t, language, persons, currentPersonId, currentPerson, setCurrentPerson, toast, refresh } = useApp();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("voice");
  const [micState, setMicState] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<LogResponse | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRef = useRef<ListenHandle | null>(null);
  const framesRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const finalRef = useRef("");
  const partialRef = useRef("");
  const startedAtRef = useRef(0);
  const modeRef = useRef<Mode>("voice");

  // Query flags: `/record?typed=1` from the dashboard, `/record?mode=vitals`
  // from a result card that wants a reading.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "vitals") {
      setMode("typed");
      setNote(VITALS_HINT);
    } else if (params.get("typed") === "1") {
      setMode("typed");
    }
    if (!speechSupported()) {
      setMode("typed");
      setNote(t("mic.fallback_note"));
    }
    return () => {
      handleRef.current?.abort();
      stopSpeaking();
    };
  }, [t]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Elapsed timer while the mic is hot.
  useEffect(() => {
    if (micState !== "listening") return;
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [micState]);

  const submit = useCallback(
    async (text: string, how: Mode) => {
      if (!currentPersonId) return;
      const clean = text.trim();
      if (!clean) {
        setMicState("idle");
        setSendError(how === "voice" ? "I did not catch any words. Try again, or type instead." : "Type something first.");
        return;
      }

      setBusy(true);
      setMicState("processing");
      setSendError(null);

      const durationS = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const acoustic =
        how === "voice" && framesRef.current.length
          ? {
              ...extractAcoustics(framesRef.current, sampleRateRef.current, durationS),
              speechRateWps: speakingRate(clean, durationS),
            }
          : undefined;
      const clientId = newClientId();

      try {
        const res = await api.post<LogResponse>(`/api/v1/persons/${currentPersonId}/log`, {
          transcript: clean,
          lang: language,
          mode: how,
          duration_s: durationS,
          clientId,
          acoustic,
        });
        setResult(res);
        setLevel(0);
        setMicState("idle");
        track("log_saved", { level: res.verdict.level, mode: how }, "/record", language);
        void refresh();
        if (res.sos) {
          refreshSos();
          toast({ tone: "red", title: t("sos.countdown_title"), body: t("sos.countdown_body") });
        } else if (res.verdict.level >= 3) {
          toast({ tone: "terracotta", title: res.verdict.title, body: res.verdict.why });
        } else {
          toast({ tone: "mint", title: t("card.saved"), body: t("card.journal_saved") });
        }
      } catch (err) {
        if (isOfflineish(err)) {
          await enqueue({
            clientId,
            personId: currentPersonId,
            transcript: clean,
            lang: language,
            mode: how,
            durationS,
            acoustic: acoustic ? { ...acoustic } : undefined,
            queuedAt: new Date().toISOString(),
          });
          setMicState("idle");
          setLevel(0);
          toast({
            tone: "terracotta",
            title: "Saved on your phone",
            body: "You are offline. This entry syncs by itself the moment you are back.",
          });
        } else {
          setMicState("idle");
          setSendError(errorText(err));
        }
      } finally {
        setBusy(false);
      }
    },
    [currentPersonId, language, t, toast],
  );

  const startVoice = useCallback(async () => {
    if (!currentPersonId) return;
    setSendError(null);
    setResult(null);
    setTranscript("");
    setLevel(0);
    finalRef.current = "";
    partialRef.current = "";
    framesRef.current = [];
    startedAtRef.current = Date.now();
    modeRef.current = "voice";
    setMicState("listening");

    const handle = await startListening({
      locale: asrLocale(language),
      onLevel: (v) => setLevel(v),
      onPartial: (txt) => {
        partialRef.current = txt;
        setTranscript(txt);
      },
      onFinal: (txt) => {
        finalRef.current = txt;
        setTranscript(txt);
      },
      onFrames: (frame, sampleRate) => {
        sampleRateRef.current = sampleRate;
        if (framesRef.current.length < 1200) framesRef.current.push(frame);
      },
      onError: (message) => {
        const blocked = /blocked|unavailable|denied/i.test(message);
        setNote(message);
        if (blocked) {
          setMicState("blocked");
          setMode("typed");
        }
      },
      onEnd: () => {
        // The recogniser stops on its own after a pause; if the user has not
        // pressed stop we simply wait for them to.
      },
    });
    handleRef.current = handle;
  }, [currentPersonId, language]);

  const stopAndSend = useCallback(async () => {
    handleRef.current?.stop();
    handleRef.current = null;
    const text = finalRef.current.trim() || partialRef.current.trim();
    await submit(text, "voice");
  }, [submit]);

  const onMic = useCallback(() => {
    if (micState === "listening") void stopAndSend();
    else void startVoice();
  }, [micState, startVoice, stopAndSend]);

  const readAloud = useCallback(() => {
    if (!result) return;
    speak(result.verdict.speak, asrLocale(language));
    track("verdict_spoken", { level: result.verdict.level }, "/record", language);
  }, [result, language]);

  const languageName = LANGS.find((l) => l.code === language)?.native ?? "English";

  if (!currentPersonId) {
    return (
      <EmptyState
        title="Choose a person first"
        body="Pick a profile at the top of the screen, then hold the button and speak."
        action={
          <Link href="/onboarding?add=1" className="btn-primary">
            {t("ob.add_member")}
          </Link>
        }
      />
    );
  }

  const heartTone = micState === "listening" ? (level > 0.75 ? "terracotta" : "mint") : "mint";

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------- header */}
      <header>
        <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-muted">Voice Log</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-cream sm:text-4xl">
          Tell Docmate about today
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Speak in the language you think in. Mood, sleep, medicines, any pain — say whatever is true today.
        </p>
      </header>

      {/* ---------------------------------------------------- person switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <PersonSwitcher
          persons={persons}
          currentId={currentPersonId}
          onSelect={setCurrentPerson}
          variant="pill"
        />
      </div>

      {/* ------------------------------------------------------------ main hero */}
      <Card className="relative overflow-hidden p-6 sm:p-8 bg-[#0e161b]/90 border-hairline/80">
        <div className="flex items-center justify-between border-b border-hairline/60 pb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {mode === "voice" ? "Speak your note" : "Type your note"}
          </span>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "voice" ? "typed" : "voice");
              setSendError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-night3/60 px-3 py-1.5 text-[12px] font-semibold text-muted hover:border-mint/40 hover:text-cream transition"
          >
            <span>{mode === "voice" ? "⌨ Type instead" : "🎤 Speak instead"}</span>
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-6">
          {mode === "voice" ? (
            <>
              <div className="relative">
                <MicButton
                  state={micState}
                  level={level}
                  onPress={onMic}
                  size={124}
                  disabled={busy}
                  label={micState === "listening" ? t("mic.stop") : t("mic.tap")}
                />
              </div>

              <p className="mt-5 text-[14px] font-medium text-muted">
                {micState === "listening"
                  ? `Listening... ${elapsed}s (tap to stop)`
                  : micState === "processing"
                    ? "Processing your voice note..."
                    : "Tap and talk for 20–30 seconds"}
              </p>

              {/* Audio Wave Line */}
              <div className="mt-4 w-full max-w-md">
                <HeartbeatLine tone="mint" height={36} active={micState === "listening"} />
              </div>
            </>
          ) : (
            <div className="w-full max-w-xl space-y-4">
              <textarea
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={5}
                placeholder={note === VITALS_HINT ? VITALS_HINT : 'e.g. "Slept well last night. Took both tablets after breakfast. Sugar was 142 in the morning. Some tiredness in the afternoon."'}
                className="field resize-none w-full text-[14.5px] leading-relaxed p-4"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={busy || !typed.trim()}
                  onClick={() => void submit(typed, "typed")}
                  className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-2 text-[13.5px] font-bold text-night shadow-[0_4px_14px_rgba(110,224,207,0.3)] transition hover:bg-[#8bf3e4] disabled:opacity-50"
                >
                  {busy ? <Spinner size={16} /> : null}
                  {busy ? t("common.loading") : t("common.save")}
                </button>
                <span className="text-[12px] text-muted">
                  Typing runs the same clinical rules as voice.
                </span>
              </div>
            </div>
          )}
        </div>

        {note ? (
          <p className="mt-3 rounded-xl border border-hairline bg-night3/60 p-3 text-[12.5px] text-muted">
            {note}
          </p>
        ) : null}
      </Card>

      {/* ------------------------------------------------------ live transcript */}
      {mode === "voice" && (transcript || micState === "listening") ? (
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">What I heard</span>
            {micState === "listening" ? <Pill tone="mint">live</Pill> : null}
          </div>
          <p className="mt-2 min-h-[40px] text-[15px] leading-relaxed text-cream">
            {transcript || <span className="text-muted">Listening... speak into your microphone.</span>}
          </p>
          {transcript && micState !== "listening" ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void submit(transcript, "voice")}
                className="btn-primary"
              >
                Analyze &amp; Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setTyped(transcript);
                  setMode("typed");
                }}
                className="chip hover:border-mint/40 hover:text-cream"
              >
                {t("card.edit")}
              </button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------ 3 Helper Tip Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="font-display text-[14px] font-bold text-cream">Say the numbers</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            <span className="text-cream/90">&ldquo;Pressure was 130 by 85&rdquo;</span> — Docmate reads it and stores it.
          </p>
        </Card>
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="font-display text-[14px] font-bold text-cream">Name the ache</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            <span className="text-cream/90">&ldquo;Knee hurts while climbing stairs&rdquo;</span> becomes a tracked symptom.
          </p>
        </Card>
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="font-display text-[14px] font-bold text-cream">It remembers</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Patterns across days raise the flag, not one bad morning.
          </p>
        </Card>
      </div>

      {sendError ? (
        <Card className="p-3.5" tone="terracotta">
          <p className="text-[13px] font-semibold text-cream">{sendError}</p>
        </Card>
      ) : null}

      {/* -------------------------------------------------------------- result */}
      {result ? (
        <section className="space-y-3">
          <ResultCard
            verdict={result.verdict}
            distress={result.distress}
            acousticQuality={result.acousticQuality}
            onSpeak={readAloud}
            onShare={() => router.push("/doctor")}
            onEdit={() => {
              setTyped(transcript);
              setMode("typed");
              setResult(null);
            }}
          />

          <Card className="p-4">
            <SectionTitle hint="Exactly what Docmate took from your words">What I understood</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {result.extraction.symptoms.map((s) => (
                <Pill key={s.key} tone={s.severity === "severe" ? "terracotta" : "mint"}>
                  {s.label}
                </Pill>
              ))}
              {result.extraction.vitals.map((v, i) => (
                <Pill key={`${v.type}-${i}`} tone="sage">
                  {vitalText(v)}
                </Pill>
              ))}
              {result.extraction.redFlags.length ? (
                <Pill tone="red">red flag: {result.extraction.redFlags.join(", ").replace(/_/g, " ")}</Pill>
              ) : null}
              {result.extraction.mood != null ? <Pill tone="mint">mood {result.extraction.mood}/5</Pill> : null}
              {result.extraction.sleepHours != null ? (
                <Pill tone="mint">sleep {result.extraction.sleepHours}h</Pill>
              ) : null}
              {result.extraction.stress != null ? <Pill tone="sage">stress {result.extraction.stress}/5</Pill> : null}
              {result.extraction.activityMinutes != null ? (
                <Pill tone="mint">activity {result.extraction.activityMinutes} min</Pill>
              ) : null}
              {result.extraction.foodTags.map((f) => (
                <Pill key={f} tone="muted">
                  {f.replace(/_/g, " ")}
                </Pill>
              ))}
              {!result.extraction.symptoms.length &&
              !result.extraction.vitals.length &&
              result.extraction.mood == null &&
              result.extraction.sleepHours == null ? (
                <p className="text-[12.5px] text-muted">
                  Nothing clinical in this one — it is saved as a journal entry for the day.
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-3 text-[12px] text-muted sm:grid-cols-4">
              <span>{result.saved.symptoms} symptoms</span>
              <span>{result.saved.vitals} vitals</span>
              <span>{result.saved.medicines} doses</span>
              <span>{result.saved.journal ? "journal saved" : "no journal"}</span>
            </div>

            {result.alert ? (
              <div className="mt-3 rounded-2xl border border-hairline bg-night3/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Alert raised</p>
                <p className="mt-1 text-[13px] font-semibold text-cream">{result.alert.title}</p>
                <Link href="/alerts" className="link mt-1 inline-block text-[12.5px]">
                  {t("alert.title")} →
                </Link>
              </div>
            ) : null}
          </Card>

          <div className="flex flex-wrap gap-2">
            <Link href="/" className="btn-primary">
              {t("nav.home")}
            </Link>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setTranscript("");
                setTyped("");
                setNote(null);
                void startVoice();
              }}
              className="btn-ghost"
            >
              {t("mic.tap")}
            </button>
            <Link href={`/score/${currentPersonId}`} className="btn-ghost">
              {t("home.person_score")}
            </Link>
          </div>
        </section>
      ) : null}

      <div className="flex justify-center pb-2">
        <button
          type="button"
          onClick={() => void startVoice()}
          className="text-[12.5px] font-semibold text-muted underline decoration-hairline underline-offset-4 hover:text-cream"
        >
          {t("mic.or_type")}
        </button>
      </div>
    </div>
  );
}
