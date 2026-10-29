"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers";
import { PersonSwitcher } from "@/components/shell/PersonSwitcher";
import { Card, EmptyState, Sheet, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  languages: string;
  availability: string;
  feeInr: number;
  rating: number;
  experienceYears: number;
  bio: string;
  registrationNo: string;
  council: string;
  code: string;
  verified: boolean;
};

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

type DoctorResp = { doctors: Doctor[]; specialties: string[]; links: DoctorLink[]; linkCategories: string[] };
type ConsultResp = { consultations: Consultation[]; asDoctor: boolean; modes: string[] };

const SPECIALTY_TAGS = [
  "All",
  "Geriatrics",
  "Cardiology",
  "Pulmonology",
  "Internal Medicine",
  "Family Medicine",
  "Endocrinology",
  "Mental Health",
];

const CLINIC_MAP: Record<string, string> = {
  "Dr. Arun Prakash": "Apollo Clinic · Delhi",
  "Dr. Kavitha Menon": "Fortis Hospital · Bengaluru",
  "Dr. Rajesh Iyer": "Max Healthcare · Mumbai",
  "Dr. Sunita Rao": "Manipal Hospital · Bengaluru",
  "Dr Sanjay Banerjee": "AMRI · Kolkata",
  "Dr Arjun Deshmukh": "Ruby Hall · Pune",
  "Dr Nithin Rao": "Manipal Hospital · Bengaluru",
  "Dr Meera Krishnan": "Apollo Clinic · Chennai",
  "Dr Kavya Reddy": "CARE Hospitals · Hyderabad",
  "Dr Fatima Shaikh": "Lilavati · Mumbai",
  "Dr Priya Malhotra": "Max Saket · New Delhi",
  "Dr Rahul Nair": "Mindfirst · Kochi",
};

export default function DoctorConnectPage() {
  const { ready, persons, currentPersonId, currentPerson, setCurrentPerson, toast } = useApp();
  const router = useRouter();

  const [data, setData] = useState<DoctorResp | null>(null);
  const [consults, setConsults] = useState<ConsultResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSpecialty, setActiveSpecialty] = useState("All");

  // Booking modal
  const [bookingDoctor, setBookingDoctor] = useState<Doctor | null>(null);
  const [bookingMode, setBookingMode] = useState("video");
  const [bookingSlot, setBookingSlot] = useState("Today, 4:00 PM");
  const [bookingBusy, setBookingBusy] = useState(false);

  // Share summary modal
  const [sharingDoctor, setSharingDoctor] = useState<Doctor | null>(null);
  const [shareDays, setShareDays] = useState<7 | 30 | 90>(30);
  const [shareNote, setShareNote] = useState("");
  const [shareConsent, setShareConsent] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);

  const openShareModal = useCallback((doc: Doctor) => {
    setSharingDoctor(doc);
    setShareDays(30);
    setShareNote("");
    setShareConsent(false);
    setGeneratedCode(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        api.get<DoctorResp>("/api/v1/doctor-links"),
        api.get<ConsultResp>("/api/v1/consultations"),
      ]);
      setData(d);
      setConsults(c);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const allDoctors = useMemo(() => {
    return data?.doctors || [];
  }, [data]);

  const filteredDoctors = useMemo(() => {
    if (activeSpecialty === "All") return allDoctors;
    return allDoctors.filter(
      (d) => d.specialty.toLowerCase().includes(activeSpecialty.toLowerCase()),
    );
  }, [allDoctors, activeSpecialty]);

  const activeLinks = useMemo(() => {
    return (data?.links || []).filter((l) => l.status === "active" && !l.revokedAt);
  }, [data]);

  const handleBook = useCallback(async () => {
    if (!bookingDoctor || !currentPersonId) return;
    setBookingBusy(true);
    try {
      await api.post("/api/v1/consultations", {
        doctorId: bookingDoctor.id,
        personId: currentPersonId,
        slot: new Date(Date.now() + 3600000 * 4).toISOString(),
        mode: bookingMode,
      });
      toast({ tone: "mint", title: "Consultation booked", body: `Confirmed with ${bookingDoctor.name}.` });
      setBookingDoctor(null);
      await load();
    } catch {
      toast({ tone: "terracotta", title: "Booking failed", body: "Could not reserve slot. Please try again." });
    } finally {
      setBookingBusy(false);
    }
  }, [bookingDoctor, currentPersonId, bookingMode, load, toast]);

  const handleShareSummary = useCallback(async () => {
    if (!sharingDoctor || !currentPersonId || !shareConsent) return;
    setSharingBusy(true);
    try {
      const res = await api.post<{ id: string; accessCode?: string }>("/api/v1/doctor-links", {
        doctorId: sharingDoctor.id,
        personId: currentPersonId,
        categories: ["score", "vitals", "alerts", "journal_summaries"],
        days: shareDays,
        note: shareNote.trim(),
      });
      const code = res.accessCode || `DOCM-${res.id.slice(-5).toUpperCase()}`;
      setGeneratedCode(code);
      toast({
        tone: "mint",
        title: `Summary shared (${shareDays} days)`,
        body: `Access code generated for ${sharingDoctor.name}.`,
      });
      await load();
    } catch {
      toast({ tone: "terracotta", title: "Sharing failed", body: "Could not create share code." });
    } finally {
      setSharingBusy(false);
    }
  }, [sharingDoctor, currentPersonId, shareConsent, shareDays, shareNote, load, toast]);

  const handleRevokeShare = useCallback(async (linkId: string) => {
    try {
      await api.del(`/api/v1/doctor-links?id=${linkId}`);
      toast({ tone: "mint", title: "Access revoked" });
      await load();
    } catch {
      toast({ tone: "red", title: "Could not revoke link" });
    }
  }, [load, toast]);

  if (!ready || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  const consultationsList = consults?.consultations || [];

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-muted">Doctor Connect</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-cream sm:text-4xl">
            A second pair of eyes
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Share a consented summary and talk to a verified doctor — the notes stay yours, the summary expires.
          </p>
        </div>

        <Link
          href="/doctor-portal"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-hairline bg-night2 px-4 py-2 text-[13px] font-semibold text-cream hover:border-mint/40 hover:text-mint transition"
        >
          <span>Doctor portal</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </Link>
      </div>

      {/* ------------------------------------------------ Person Switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <PersonSwitcher
          persons={persons}
          currentId={currentPersonId}
          onSelect={setCurrentPerson}
          variant="pill"
        />
      </div>

      {/* ------------------------------------------------ 3 Top Stat Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Active Shares</p>
          <p className="mt-2 text-2xl font-bold font-display text-cream">{activeLinks.length}</p>
        </Card>
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Upcoming Visits</p>
          <p className="mt-2 text-2xl font-bold font-display text-cream">
            {consultationsList.filter((c) => c.status !== "completed").length}
          </p>
        </Card>
        <Card className="p-4 bg-[#0e161b]/90 border-hairline/80">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Verified Doctors</p>
          <p className="mt-2 text-2xl font-bold font-display text-cream">{allDoctors.length}</p>
        </Card>
      </div>

      {/* ------------------------------------------------ Find a Doctor */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Find a Doctor
          </p>

          {/* Specialty Filter Chips */}
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-1">
            {SPECIALTY_TAGS.map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setActiveSpecialty(sp)}
                className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition shrink-0 ${
                  activeSpecialty === sp
                    ? "bg-[#142628] text-mint border border-mint/40"
                    : "border border-hairline bg-night2 text-muted hover:text-cream"
                }`}
              >
                {sp}
              </button>
            ))}
          </div>
        </div>

        {/* Doctor Cards 3-Column Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDoctors.map((doc) => {
            const clinic = CLINIC_MAP[doc.name] || `${doc.council || "General Hospital"} · Delhi`;
            const initial = doc.name.replace("Dr. ", "").replace("Dr ", "").charAt(0);

            return (
              <Card
                key={doc.id}
                className="flex flex-col justify-between p-4 bg-[#0e161b]/90 border-hairline/80 space-y-4 transition hover:border-hairline"
              >
                <div>
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mint/15 text-mint text-[12px] font-bold">
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-cream text-[14px] truncate">{doc.name}</p>
                        <span className="text-mint shrink-0">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                        </span>
                      </div>
                      <p className="text-[12px] text-muted">{doc.specialty}</p>
                      <p className="text-[11.5px] text-muted/80">{clinic}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted border-t border-hairline/50 pt-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[#f97316] font-bold">★ {doc.rating}</span>
                      <span>{doc.experienceYears} yrs</span>
                    </div>
                    <span className="font-bold text-cream font-mono">₹{doc.feeInr}</span>
                  </div>
                  <p className="mt-1 text-[10.5px] text-muted/70 truncate">{doc.languages}</p>
                </div>

                {/* Card Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setBookingDoctor(doc)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-mint px-3 py-1.5 text-[12px] font-bold text-night hover:bg-[#8bf3e4] transition"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                    <span>Book</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openShareModal(doc)}
                    className="inline-flex items-center justify-center rounded-xl border border-hairline bg-night2 px-3 py-1.5 text-[12px] font-semibold text-muted hover:border-mint/40 hover:text-cream transition"
                  >
                    Share summary
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------ Shared Summaries */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          Shared Summaries
        </p>

        {activeLinks.length === 0 ? (
          <Card className="p-6 text-center bg-[#0e161b]/90 border-hairline/80 text-[13px] text-muted">
            Nothing shared yet. Generate a code when a doctor needs the history.
          </Card>
        ) : (
          <div className="space-y-2">
            {activeLinks.map((link) => (
              <Card key={link.id} className="flex items-center justify-between p-4 bg-[#0e161b]/90 border-hairline/80">
                <div>
                  <p className="font-semibold text-cream text-[14px]">Shared with {link.doctorName}</p>
                  <p className="text-[12px] text-muted">
                    {link.specialty} · Expires {link.endsAt ? new Date(link.endsAt).toLocaleDateString() : "in 30 days"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevokeShare(link.id)}
                  className="rounded-lg border border-red/30 bg-red/10 px-3 py-1 text-[12px] font-semibold text-red hover:bg-red/20 transition"
                >
                  Revoke
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------ Consultations */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          Consultations
        </p>

        {consultationsList.length === 0 ? (
          <Card className="p-6 text-center bg-[#0e161b]/90 border-hairline/80 text-[13px] text-muted">
            No consultations yet. Book a visit with a doctor above.
          </Card>
        ) : (
          <div className="space-y-2">
            {consultationsList.map((con) => (
              <Card key={con.id} className="flex items-center justify-between p-4 bg-[#0e161b]/90 border-hairline/80">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-night3 text-muted">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4.5 3v5a4.5 4.5 0 0 0 9 0V3" />
                      <path d="M6 3H3" />
                      <path d="M15 3h-3" />
                      <path d="M9 12.5a5 5 0 0 0 5 5h1a4 4 0 0 0 4-4v-1.5" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </span>
                  <div>
                    <p className="font-semibold text-cream text-[13.5px]">{con.doctorName}</p>
                    <p className="text-[12px] text-muted">
                      {new Date(con.slot).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })},{" "}
                      {new Date(con.slot).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {con.mode} · {con.personName}
                    </p>
                  </div>
                </div>
                <span className="rounded bg-night3 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                  {con.status.toUpperCase()}
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------ Bottom Disclaimer & Portal Link */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-hairline/60 text-[12px] text-muted">
        <p className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>Doctors read summaries in a read-only portal. They cannot edit your records or see notes outside the window you chose.</span>
        </p>

        <Link href="/doctor-portal" className="inline-flex items-center gap-1 font-semibold text-mint hover:underline shrink-0">
          <span>Open portal</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </Link>
      </div>

      {/* Booking Sheet Modal */}
      {bookingDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-night/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-hairline bg-night2 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[18px] font-bold text-cream">Book Consultation</h3>
              <button onClick={() => setBookingDoctor(null)} className="text-muted hover:text-cream">✕</button>
            </div>
            <p className="text-[13px] text-muted">
              Schedule a private consultation with <strong className="text-cream">{bookingDoctor.name}</strong> ({bookingDoctor.specialty}).
            </p>
            <div className="space-y-3 text-[13px]">
              <div>
                <label className="text-[11px] font-bold uppercase text-muted">Mode</label>
                <div className="mt-1 flex gap-2">
                  {(["video", "audio", "chat"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBookingMode(m)}
                      className={`flex-1 rounded-lg border py-2 capitalize font-semibold ${bookingMode === m ? "border-mint bg-mint/15 text-mint" : "border-hairline bg-night3 text-muted"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-muted">Slot</label>
                <select
                  value={bookingSlot}
                  onChange={(e) => setBookingSlot(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-hairline bg-night3 p-2 text-cream focus:border-mint focus:outline-none"
                >
                  <option>Today, 4:00 PM</option>
                  <option>Tomorrow, 10:30 AM</option>
                  <option>Tomorrow, 5:00 PM</option>
                </select>
              </div>
              <div className="flex items-center justify-between border-t border-hairline pt-3 font-semibold text-cream">
                <span>Fee</span>
                <span className="font-mono text-mint">₹{bookingDoctor.feeInr}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setBookingDoctor(null)} className="px-4 py-2 text-[13px] text-muted hover:text-cream">Cancel</button>
              <button
                disabled={bookingBusy}
                onClick={() => void handleBook()}
                className="rounded-full bg-mint px-5 py-2 text-[13px] font-bold text-night disabled:opacity-50"
              >
                {bookingBusy ? "Booking..." : "Confirm & Pay"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Summary Consented Modal matching design */}
      {sharingDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d151e] p-7 shadow-2xl space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-neutral-400">CONSENTED SHARE</p>
                <h3 className="font-display text-2xl font-bold text-white mt-1">{sharingDoctor.name}</h3>
                <p className="text-[13px] text-neutral-400 mt-0.5">
                  {sharingDoctor.specialty} · {sharingDoctor.clinic || CLINIC_MAP[sharingDoctor.name] || "AMRI"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSharingDoctor(null)}
                className="rounded-full p-1 text-neutral-400 hover:text-white hover:bg-white/5 transition"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {generatedCode ? (
              <div className="space-y-4 py-2">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-2">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Access Code Created</p>
                  <p className="text-2xl font-mono font-bold tracking-widest text-white">{generatedCode}</p>
                  <p className="text-[11.5px] text-neutral-400">
                    Valid for {shareDays} days. Share this code with {sharingDoctor.name} to grant read-only summary access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(generatedCode);
                    }
                    toast({ tone: "mint", title: "Access code copied to clipboard" });
                    setSharingDoctor(null);
                  }}
                  className="w-full py-3.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 font-bold text-neutral-950 text-sm transition shadow-lg shadow-emerald-500/10"
                >
                  Copy code &amp; close
                </button>
              </div>
            ) : (
              <>
                {/* WINDOW */}
                <div>
                  <label className="text-[11px] font-bold tracking-[0.16em] uppercase text-neutral-400 block mb-2">
                    WINDOW
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {([7, 30, 90] as const).map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setShareDays(days)}
                        className={`py-2.5 rounded-xl text-[13.5px] font-semibold transition border ${
                          shareDays === days
                            ? "border-emerald-500/80 bg-emerald-500/15 text-emerald-400 shadow-sm"
                            : "border-white/10 bg-[#070d14] text-neutral-300 hover:border-white/20"
                        }`}
                      >
                        {days} days
                      </button>
                    ))}
                  </div>
                </div>

                {/* A NOTE FOR THE DOCTOR */}
                <div>
                  <label className="text-[11px] font-bold tracking-[0.16em] uppercase text-neutral-400 block mb-2">
                    A NOTE FOR THE DOCTOR
                  </label>
                  <textarea
                    value={shareNote}
                    onChange={(e) => setShareNote(e.target.value)}
                    placeholder="What do you want them to look at first?"
                    className="w-full bg-[#070d14] border border-white/10 rounded-xl p-3.5 text-[13.5px] text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 min-h-[95px] resize-none leading-relaxed transition"
                  />
                </div>

                {/* Consent Checkbox */}
                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-[#070d14]/70 cursor-pointer hover:border-white/20 transition group">
                  <input
                    type="checkbox"
                    checked={shareConsent}
                    onChange={(e) => setShareConsent(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-transparent text-emerald-500 focus:ring-0 accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-[12px] text-neutral-300 leading-normal select-none">
                    I consent to sharing {currentPerson?.name || "Lakshmi"}&apos;s {shareDays}-day voice-note summary and measurements with this doctor.
                  </span>
                </label>

                {/* Primary Action Button */}
                <button
                  type="button"
                  disabled={!shareConsent || sharingBusy}
                  onClick={() => void handleShareSummary()}
                  className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-[13.5px] transition shadow-lg ${
                    shareConsent && !sharingBusy
                      ? "bg-[#38857a] hover:bg-[#43968a] text-white shadow-emerald-500/20 active:scale-[0.99]"
                      : "bg-white/10 text-neutral-500 cursor-not-allowed"
                  }`}
                >
                  <svg className="w-4 h-4 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                  <span>{sharingBusy ? "Generating access code..." : "Generate access code"}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
