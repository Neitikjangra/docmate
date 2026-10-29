"use client";

import React, { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { api, ApiError, track } from "@/lib/client/api";
import { Spinner } from "@/components/ui";
import { LanguagePicker } from "./LanguagePicker";

type StoredOtp = { code: string; to: string };

/**
 * Phone + OTP sign-in (PRD 4.1, 14). In this build the code is delivered by the
 * simulated SMS driver, so the screen reads it back from the Simulation Console
 * — which is exactly the seam a real gateway would replace.
 */
export function SignIn() {
  const { refresh, t, toast } = useApp();
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");
  const [demo, setDemo] = useState<StoredOtp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (stage === "code") codeRef.current?.focus();
  }, [stage]);

  async function pullDemoCode(last10: string) {
    try {
      const data = await api.get<{ outbox: any[] }>("/api/v1/console");
      const row = data.outbox.find((o) => o.channel === "otp" && String(o.to ?? "").endsWith(last10));
      const c = row?.meta?.code;
      if (c) setDemo({ code: String(c), to: last10 });
    } catch {
      /* the console is a convenience, not a requirement */
    }
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setErr(t("ob.phone_invalid"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/v1/auth/otp/request", { phone: digits, purpose: "login" });
      setStage("code");
      setCooldown(30);
      setDemo(null);
      await pullDemoCode(digits.slice(-10));
      track("otp_requested", {}, "signin");
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("ob.otp_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e?: React.FormEvent, overrideCode?: string) {
    e?.preventDefault();
    const val = overrideCode ?? code;
    const clean = val.replace(/\D/g, "");
    if (clean.length !== 6) {
      setErr(t("ob.otp_invalid"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/v1/auth/otp/verify", { phone: phone.replace(/\D/g, ""), code: clean, purpose: "login" });
      track("signed_in");
      toast({ tone: "mint", title: "Signed in", body: "Welcome to Docmate." });
      await refresh();
    } catch (e2) {
      if (e2 instanceof ApiError) {
        setErr(e2.message);
        if (e2.code === "locked") {
          setStage("phone");
          setCode("");
        }
      } else setErr(t("ob.otp_verify_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="flex items-center justify-between px-5 pt-6">
        <Wordmark />
        <LanguagePicker compact />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16">
        <p className="font-display text-[13px] font-semibold uppercase tracking-[0.2em] text-mintDim">Namaste</p>
        <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.1] text-cream">
          {stage === "phone" ? t("ob.phone_q") : t("ob.otp_q")}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {stage === "phone" ? t("ob.phone_hint") : t("ob.otp_sent", { phone: phone.replace(/\D/g, "").slice(-10) })}
        </p>

        {stage === "phone" ? (
          <form onSubmit={requestCode} className="mt-7 space-y-4">
            <div>
              <label className="label" htmlFor="phone">
                Mobile number
              </label>
              <div className="flex items-center gap-2">
                <span className="chip h-[50px] shrink-0 px-3.5 text-[14px] text-cream">+91</span>
                <input
                  id="phone"
                  className="field mono"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={13}
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ""))}
                />
              </div>
            </div>
            {err ? <p className="text-[13px] tone-terracotta">{err}</p> : null}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner /> : null}
              {t("ob.send_otp")}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-7 space-y-4">
            <div>
              <label className="label" htmlFor="code">
                {t("ob.otp_q")}
              </label>
              <input
                id="code"
                ref={codeRef}
                className="field mono text-center text-[26px] tracking-[0.5em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>

            {demo ? (
              <button
                type="button"
                onClick={() => {
                  setCode(demo.code);
                  void verify(undefined, demo.code);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-mint/30 bg-tint-mint px-4 py-3 text-left"
              >
                <span className="text-[13px] text-cream">
                  Simulated SMS · tap to fill the code
                  <span className="mono ml-2 text-[15px] font-bold">{demo.code}</span>
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-mintDim">Console</span>
              </button>
            ) : null}

            {err ? <p className="text-[13px] tone-terracotta">{err}</p> : null}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner /> : null}
              {t("ob.verify")}
            </button>

            <div className="flex items-center justify-between text-[13px]">
              <button
                type="button"
                onClick={requestCode}
                disabled={cooldown > 0 || busy}
                className="link disabled:no-underline disabled:opacity-50"
              >
                {cooldown > 0 ? `${t("ob.resend")} (${cooldown}s)` : t("ob.resend")}
              </button>
              <button type="button" onClick={() => setStage("phone")} className="text-muted hover:text-cream">
                {t("common.change")} number
              </button>
            </div>
          </form>
        )}

        <div className="mt-10 rounded-2xl border border-hairline bg-night2/60 p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Demo accounts</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              className="chip hover:border-mint/40 hover:text-cream"
              onClick={() => {
                setStage("phone");
                setPhone("9876543210");
                setErr(null);
              }}
            >
              Family · 9876543210
            </button>
            <button
              type="button"
              className="chip hover:border-mint/40 hover:text-cream"
              onClick={() => {
                setStage("phone");
                setPhone("9000000001");
                setErr(null);
              }}
            >
              Doctor · 9000000001
            </button>
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
            The demo family already holds ~90 days of history. A brand-new number starts the full onboarding.
          </p>
        </div>
      </div>
    </div>
  );
}

export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? 26 : size === "lg" ? 40 : 32;
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid place-items-center rounded-[10px]"
        style={{
          width: s,
          height: s,
          background: "radial-gradient(circle at 32% 26%, #9FF0E3, #6EE0CF 48%, #3F8C82 100%)",
          boxShadow: "0 8px 22px -12px rgba(110,224,207,.75)",
        }}
      >
        <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="#06211E" strokeWidth="2.2" strokeLinecap="round">
          <path d="M3 12h3l2-5 3 10 3-14 2.5 9H21" />
        </svg>
      </span>
      <span className="font-display text-[19px] font-semibold tracking-tight text-cream">Docmate</span>
    </div>
  );
}
