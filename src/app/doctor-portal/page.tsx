"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/app/providers";
import { Card, EmptyState, Pill, SectionTitle, Sheet, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

/* ------------------------------------------------------------------ types */

type DoctorLink = {
  id: string;
  personId: string;
  personName: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  scope: string[];
  status: string;
  startsAt: string;
  endsAt: string | null;
  revokedAt: string | null;
  isPatient: boolean;
  createdAt: string;
};

type DoctorResp = { doctors: unknown[]; specialties: string[]; links: DoctorLink[]; linkCategories: string[] };

type Consultation = {
  id: string;
  personId: string;
  personName: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  slot: string;
  mode: string;
  status: string;
  amountInr: number;
  paymentRef: string;
  createdAt: string;
};

type ConsultResp = { consultations: Consultation[]; asDoctor: boolean; modes: string[] };

type SummaryPayload = {
  personName: string;
  ageYears: number | null;
  sexAtBirth: string | null;
  conditions: string[];
  medicines: string[];
  rangeFrom: string;
  rangeTo: string;
  score: number | null;
  bandWord: string;
  vitals: { label: string; value: string; date: string }[];
  symptoms: { label: string; count: number; last: string }[];
  alerts: { level: number; title: string; ruleId: string; date: string }[];
  predictions: { label: string; detail: string; confidence: string; dataDays: number }[];
  categories: string[];
  omitted: string[];
  physicianNote: string;
};

type SummaryResp = { summary: SummaryPayload; role: string };

/* ---------------------------------------------------------------- helpers */

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong. Please try again.";
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/* ------------------------------------------------------------------- page */

export default function DoctorPortalPage() {
  const { ready, me, t } = useApp();

  const [data, setData] = useState<DoctorResp | null>(null);
  const [consults, setConsults] = useState<ConsultResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summaryPerson, setSummaryPerson] = useState<{ id: string; name: string } | null>(null);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const isDoctor = !!me?.isDoctor;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, c] = await Promise.all([
        api.get<DoctorResp>("/api/v1/doctor-links"),
        api.get<ConsultResp>("/api/v1/consultations"),
      ]);
      setData(d);
      setConsults(c);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!isDoctor) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, isDoctor, load]);

  const patients = useMemo(() => (data?.links ?? []).filter((l) => !l.isPatient), [data]);
  const activePatients = useMemo(
    () => patients.filter((l) => l.status === "active" && !l.revokedAt && (!l.endsAt || new Date(l.endsAt).getTime() > Date.now())),
    [patients],
  );

  const openSummary = useCallback(async (personId: string, name: string) => {
    setSummaryPerson({ id: personId, name });
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(true);
    try {
      const res = await api.get<SummaryResp>(`/api/v1/persons/${personId}/summary?format=json&days=30`);
      setSummary(res.summary);
    } catch (e) {
      setSummaryError(errMsg(e));
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  /* -------------------------------------------------------------- shell */

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted">
        <Spinner size={22} />
      </div>
    );
  }

  /* --------------------------------------------------- not a doctor gate */

  if (!isDoctor) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Docmate clinical desk</p>
          <h1 className="mt-1 font-display text-[24px] font-semibold text-cream">This portal is for verified doctors</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            The doctor portal shows only the patients who have granted you a time-boxed, consented view — never the raw
            journal. Sign in with a verified doctor account to continue.
          </p>

          <Card className="mt-5 p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Sign in as a doctor</p>
            <p className="mt-1.5 text-[13.5px] text-cream">
              Demo doctor account · <span className="mono tone-mint">9000000001</span>
            </p>
            <p className="mt-2 text-[12px] leading-snug text-muted">
              Use the OTP shown on the sign-in screen. Docmate is not an emergency service — in an emergency call 108.
            </p>
          </Card>

          <Link href="/" className="btn-ghost mt-5">
            Back to the family app
          </Link>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- loading */

  if (loading) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl items-center justify-center px-6 text-muted">
        <div className="flex items-center gap-3">
          <Spinner size={20} />
          <span className="text-[13px]">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <Card tone="terracotta" className="p-5">
          <p className="text-[13px] font-semibold text-cream">{error ?? "Could not load the portal."}</p>
          <button type="button" className="btn-ghost mt-3" onClick={() => { setLoading(true); void load(); }}>
            {t("common.retry")}
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-7">
      {/* header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Docmate clinical desk</p>
          <h1 className="mt-1 font-display text-[22px] font-semibold text-cream">
            {me?.doctor?.name ?? "Doctor"}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">{me?.doctor?.specialty ?? "General practice"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="mint">Verified doctor</Pill>
          <Link href="/" className="btn-ghost">
            Back to app
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* patients */}
        <section>
          <SectionTitle hint="Only patients who granted you access appear here — nothing else is readable.">
            Patients
          </SectionTitle>
          {patients.length === 0 ? (
            <EmptyState title="No patients yet" body="A patient connects you by your doctor code to open their 30-day summary." />
          ) : (
            <div className="space-y-3">
              {patients.map((l) => {
                const live = l.status === "active" && !l.revokedAt && (!l.endsAt || new Date(l.endsAt).getTime() > Date.now());
                return (
                  <Card key={l.id} className="p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-cream">{l.personName}</p>
                        <p className="mt-0.5 text-[12px] text-muted">
                          Consent window · {shortDate(l.startsAt)} → {l.endsAt ? shortDate(l.endsAt) : "until revoked"}
                        </p>
                      </div>
                      {live ? <Pill tone="mint">Active</Pill> : <Pill tone="terracotta">{l.revokedAt ? "Revoked" : "Expired"}</Pill>}
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {l.scope.map((s) => (
                        <span key={s} className="chip">{s.replace(/_/g, " ")}</span>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={!live}
                        onClick={() => void openSummary(l.personId, l.personName)}
                      >
                        Open 30-day summary
                      </button>
                      <a
                        className="btn-ghost"
                        href={`/api/v1/persons/${l.personId}/summary?format=pdf&days=30`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download PDF
                      </a>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* connected via code */}
          <div className="mt-6">
            <SectionTitle hint="Patients who connected you by your doctor code.">Connected via code</SectionTitle>
            <Card className="divide-y divide-hairline">
              {activePatients.length === 0 ? (
                <p className="p-3.5 text-[12.5px] text-muted">No active code-granted access right now.</p>
              ) : (
                activePatients.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-cream">{l.personName}</p>
                      <p className="text-[11.5px] text-muted">{l.scope.length} categor{l.scope.length === 1 ? "y" : "ies"} shared</p>
                    </div>
                    <span className="text-[11.5px] text-muted">{shortDate(l.createdAt)}</span>
                  </div>
                ))
              )}
            </Card>
          </div>
        </section>

        {/* consult requests */}
        <section>
          <SectionTitle hint="Bookings paid through the simulated payment gateway.">Consult requests</SectionTitle>
          {(consults?.consultations ?? []).length === 0 ? (
            <EmptyState title="No requests" body="New tele-consult bookings will appear here." />
          ) : (
            <div className="space-y-3">
              {(consults?.consultations ?? []).map((c) => (
                <Card key={c.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-cream">{c.personName}</p>
                      <p className="mt-0.5 text-[11.5px] text-muted">{new Date(c.slot).toLocaleString()}</p>
                    </div>
                    <Pill tone={c.status === "booked" ? "mint" : "muted"}>{c.status}</Pill>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
                    <span className="chip capitalize">{c.mode}</span>
                    <span className="mono text-muted">{c.paymentRef}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* summary panel */}
      <Sheet
        open={!!summaryPerson}
        onClose={() => setSummaryPerson(null)}
        title={summaryPerson ? `30-day summary · ${summaryPerson.name}` : "30-day summary"}
        size="lg"
        footer={
          summaryPerson ? (
            <a
              className="btn-primary"
              href={`/api/v1/persons/${summaryPerson.id}/summary?format=pdf&days=30`}
              target="_blank"
              rel="noreferrer"
            >
              Download PDF
            </a>
          ) : null
        }
      >
        {summaryLoading ? (
          <div className="flex items-center gap-3 py-8 text-muted">
            <Spinner size={18} /> Generating summary…
          </div>
        ) : summaryError ? (
          <p className="py-6 text-[13px] tone-terracotta">{summaryError}</p>
        ) : summary ? (
          <div className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="kpi-value">{summary.score == null ? "—" : Math.round(summary.score)}</span>
              <span className="text-[13px] text-muted">{summary.bandWord}</span>
              <span className="ml-auto text-[12px] text-muted">{summary.rangeFrom} → {summary.rangeTo}</span>
            </div>

            <div className="flex flex-wrap gap-2 text-[12px] text-muted">
              <span>{summary.personName}</span>
              {summary.ageYears != null ? <span>· {summary.ageYears} yrs</span> : null}
              {summary.sexAtBirth ? <span className="capitalize">· {summary.sexAtBirth}</span> : null}
            </div>

            <div>
              <p className="label">Vitals</p>
              {summary.vitals.length === 0 ? (
                <p className="text-[13px] text-muted">Not included in the consented scope.</p>
              ) : (
                <div className="overflow-hidden rounded-xl2 border border-hairline">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-night3/70 text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Reading</th>
                        <th className="px-3 py-2 font-semibold">Value</th>
                        <th className="px-3 py-2 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.vitals.slice(0, 12).map((v, i) => (
                        <tr key={i} className="border-t border-hairline">
                          <td className="px-3 py-2 text-cream/90">{v.label}</td>
                          <td className="mono px-3 py-2">{v.value}</td>
                          <td className="px-3 py-2 text-muted">{v.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="label">Symptom counts</p>
              {summary.symptoms.length === 0 ? (
                <p className="text-[13px] text-muted">Not included in the consented scope.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {summary.symptoms.map((s) => (
                    <span key={s.label} className="chip">{s.label} · {s.count} · last {s.last}</span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="label">Alerts</p>
              {summary.alerts.length === 0 ? (
                <p className="text-[13px] text-muted">No alerts in the window.</p>
              ) : (
                <ul className="space-y-1.5">
                  {summary.alerts.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px]">
                      <span className={a.level >= 4 ? "tone-red font-bold" : a.level === 3 ? "tone-terracotta font-bold" : "tone-muted"}>
                        L{a.level}
                      </span>
                      <span className="text-cream/90">{a.title} <span className="text-muted">· {a.ruleId} · {a.date}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="label">Predictions</p>
              {summary.predictions.length === 0 ? (
                <p className="text-[13px] text-muted">No predictions available.</p>
              ) : (
                <ul className="space-y-1.5">
                  {summary.predictions.map((p, i) => (
                    <li key={i} className="text-[13px] text-cream/90">
                      <span className="font-semibold">{p.label}</span>
                      {p.detail ? <span className="text-muted"> — {p.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Card tone="raised" className="p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Not shared</p>
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
                {summary.omitted.length
                  ? `Omitted from this summary: ${summary.omitted.map((o) => o.replace(/_/g, " ")).join(", ")}.`
                  : "Everything in the consented scope was included."}
              </p>
              <p className="mt-2 text-[12px] text-muted">{summary.physicianNote}</p>
            </Card>
          </div>
        ) : null}
      </Sheet>

      <p className="mt-8 text-[11.5px] text-muted">
        Docmate is not an emergency service. In an emergency call 108.
      </p>
    </div>
  );
}
