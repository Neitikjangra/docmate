"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { api } from "@/lib/client/api";
import { HeartbeatLine } from "./HeartbeatLine";

type SosRow = {
  id: string;
  person_id: string;
  trigger: string;
  reason: string | null;
  started_at: string;
  outcome: string | null;
};

type Contact = { name: string; phone: string; priority: number };

export const SOS_REFRESH = "docmate:sos-refresh";

/** Ask the overlay to re-read state right now (used after a start/escalate). */
export function refreshSos(): void {
  try {
    window.dispatchEvent(new Event(SOS_REFRESH));
  } catch {
    /* ignore */
  }
}

/** Start an SOS from anywhere (PRD 8.4) — the screen opens without waiting. */
export async function startEmergency(personId: string, reason?: string): Promise<void> {
  try {
    await api.post(`/api/v1/persons/${personId}/sos`, { action: "start", trigger: "button", reason });
  } catch {
    /* the overlay reads server truth; a failure here is surfaced there */
  }
  refreshSos();
}

/**
 * Full-screen red takeover with a 15-second countdown (PRD 8.4).
 * The countdown is owned by the client so it works on a weak network; the row
 * is already written server-side before the screen appears.
 */
export function SosOverlay() {
  const { currentPersonId, t, toast } = useApp();
  const [sos, setSos] = useState<SosRow | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [left, setLeft] = useState(15);
  const [notified, setNotified] = useState<{ name: string; phone: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const escalatedFor = useRef<string | null>(null);

  const read = useCallback(async () => {
    if (!currentPersonId) return;
    try {
      const data = await api.get<{ active: SosRow | null; contacts: Contact[]; countdownSeconds: number }>(
        `/api/v1/persons/${currentPersonId}/sos`,
      );
      setContacts(data.contacts ?? []);
      setSos(data.active ?? null);
      if (data.active) {
        const elapsed = (Date.now() - new Date(data.active.started_at).getTime()) / 1000;
        setLeft(Math.max(0, Math.round((data.countdownSeconds || 15) - elapsed)));
      }
    } catch {
      /* keep the last known state */
    }
  }, [currentPersonId]);

  useEffect(() => {
    void read();
    const id = window.setInterval(read, 4000);
    window.addEventListener(SOS_REFRESH, read);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(SOS_REFRESH, read);
    };
  }, [read]);

  // Countdown tick.
  useEffect(() => {
    if (!sos || sos.outcome === "escalated" || sos.outcome === "cancelled" || sos.outcome === "resolved") return;
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(id);
  }, [sos, left]);

  const escalate = useCallback(async () => {
    if (!sos || escalatedFor.current === sos.id) return;
    escalatedFor.current = sos.id;
    setBusy(true);
    try {
      const res = await api.post<{ escalation: { notified: { name: string; phone: string }[] } | null }>(
        `/api/v1/persons/${sos.person_id ?? currentPersonId}/sos`,
        { action: "escalate", id: sos.id },
      );
      setNotified(res.escalation?.notified ?? []);
      setSos((s) => (s ? { ...s, outcome: "escalated" } : s));
    } catch {
      /* SMS fallback lives behind the adapter; retry on the next poll */
    } finally {
      setBusy(false);
    }
  }, [sos, currentPersonId]);

  useEffect(() => {
    if (sos && left <= 0 && escalatedFor.current !== sos.id) void escalate();
  }, [sos, left, escalate]);

  const cancel = useCallback(async () => {
    if (!sos) return;
    setBusy(true);
    try {
      await api.post(`/api/v1/persons/${currentPersonId}/sos`, { action: "cancel", id: sos.id });
      setSos(null);
      setNotified(null);
      escalatedFor.current = null;
      toast({ tone: "mint", title: t("sos.cancelled") });
    } catch {
      toast({ tone: "terracotta", title: "Could not reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }, [sos, currentPersonId, toast, t]);

  if (!sos) return null;

  const counting = left > 0 && sos.outcome !== "escalated";
  const primary = contacts[0];

  return (
    <div
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-between px-6 py-10 text-white ${
        counting ? "animate-sos-flash" : "bg-[#8E1F1B]"
      }`}
      role="alertdialog"
      aria-modal
    >
      <div className="w-full max-w-md text-center">
        <p className="font-display text-[13px] font-bold uppercase tracking-[0.22em] text-white/80">
          {t("sos.countdown_title")}
        </p>
        <div className="mx-auto mt-6 grid h-[150px] w-[150px] place-items-center rounded-full border-2 border-white/40">
          <span className="font-display text-[62px] font-bold leading-none">{counting ? left : "!"}</span>
        </div>
        <p className="mt-5 text-[16px] font-semibold">{counting ? t("sos.countdown_body") : t("sos.sending")}</p>
        <p className="mt-1 text-[13px] text-white/80">
          {t("sos.reason")}: {sos.reason ?? "Emergency"}
        </p>
        <div className="mt-3 opacity-70">
          <HeartbeatLine tone="red" height={34} />
        </div>
      </div>

      <div className="w-full max-w-md space-y-3">
        {notified?.length ? (
          <div className="rounded-2xl border border-white/25 bg-black/20 p-3 text-left">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">{t("sos.notified")}</p>
            <ul className="mt-1.5 space-y-1">
              {notified.map((n) => (
                <li key={n.phone} className="text-[13px]">
                  {n.name} · <span className="mono">{n.phone}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : contacts.length ? (
          <p className="text-center text-[12.5px] text-white/75">
            {contacts.length} emergency {contacts.length === 1 ? "contact" : "contacts"} on file
            {primary ? ` · first call: ${primary.name}` : ""}
          </p>
        ) : (
          <p className="text-center text-[12.5px] text-white/80">
            No emergency contact on this profile yet — add one in Profile to alert family automatically.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <a href="tel:108" className="btn bg-white text-[#8E1F1B] hover:brightness-95">
            {t("sos.call_108")}
          </a>
          <a
            href={
              primary
                ? `tel:${primary.phone}`
                : "https://www.google.com/maps/search/hospital+near+me"
            }
            target={primary ? undefined : "_blank"}
            rel="noreferrer"
            className="btn border border-white/40 bg-white/10 text-white hover:bg-white/20"
          >
            {primary ? `Call ${primary.name}` : t("sos.nearest")}
          </a>
        </div>

        <button type="button" onClick={cancel} disabled={busy} className="btn w-full bg-black/30 text-white hover:bg-black/45">
          {t("sos.cancel")}
        </button>
      </div>
    </div>
  );
}
