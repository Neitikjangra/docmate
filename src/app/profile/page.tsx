"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers";
import { api, ApiError } from "@/lib/client/api";
import { LANGS, type Lang } from "@/lib/i18n";

/* ------------------------------------------------------------------ types */

type PersonProfile = {
  id: string;
  name: string;
  dob: string | null;
  age: number | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  relation: string | null;
  isManaged: boolean;
  work_status: string | null;
  work_hours: string | null;
  exercise_level: string | null;
  sleep_band: string | null;
  diet: string | null;
  tobacco: string | null;
  alcohol: string | null;
  preferred_voice: string | null;
  checkin_time: string | null;
  retention_days: number;
  completeness: number;
  onboarded: boolean;
  blood_group?: string;
  bp_top?: number;
  bp_bottom?: number;
};

type PersonDetailResp = {
  person: PersonProfile;
  role: string;
  categories: string[];
  conditions: { id: string; name: string; since: string | null }[];
  medicines: { id: string; name: string; dosage_text: string | null; active: number }[];
  allergies: { id: string; name: string }[];
  emergencyContacts: { id: string; name: string; phone: string; priority: number }[];
  latestJournal: unknown;
  alertCount: number;
  audit: { id: string; source: string; category: string; ts: string }[];
};

type NotifSettings = {
  person_id: string;
  level3_enabled: number;
  level4_enabled: number;
  detailed_preview: number;
  quiet_start: string;
  quiet_end: string;
  daily_reminder: number;
  reminder_time: string;
};

/* ---------------------------------------------------------------- icons */

function MoonIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function SunIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function TranslateIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
    </svg>
  );
}

function ChevronDownIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function PhoneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function ShieldLockIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function TrashIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

/* ------------------------------------------------------------------- page */

export default function SettingsPage() {
  const { ready, persons, currentPersonId, currentPerson, language, setLanguage, refresh, toast } = useApp();
  const router = useRouter();

  const [detail, setDetail] = useState<PersonDetailResp | null>(null);
  const [notif, setNotif] = useState<NotifSettings | null>(null);
  const [doctorSharesCount, setDoctorSharesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<"night" | "cream">("night");

  // Health Profile Form
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [conditions, setConditions] = useState("");
  const [medicines, setMedicines] = useState("");
  const [bpTop, setBpTop] = useState("");
  const [bpBottom, setBpBottom] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [clearingNotes, setClearingNotes] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load theme from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("docmate.theme") as "night" | "cream" | null;
      if (stored === "cream" || stored === "night") setTheme(stored);
    }
  }, []);

  const changeTheme = (newTheme: "night" | "cream") => {
    setTheme(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("docmate.theme", newTheme);
      if (newTheme === "cream") {
        document.documentElement.classList.add("theme-cream");
      } else {
        document.documentElement.classList.remove("theme-cream");
      }
    }
  };

  const loadData = useCallback(async () => {
    if (!currentPersonId) {
      setLoading(false);
      return;
    }
    try {
      const d = await api.get<PersonDetailResp>(`/api/v1/persons/${currentPersonId}`);
      setDetail(d);
      setName(d.person.name ?? "");
      setAge(d.person.age != null ? String(d.person.age) : "62");
      setConditions(d.conditions.map((c) => c.name).join(", "));
      setMedicines(d.medicines.map((m) => m.name).join(", "));
      setBpTop(d.person.bp_top != null ? String(d.person.bp_top) : "138");
      setBpBottom(d.person.bp_bottom != null ? String(d.person.bp_bottom) : "86");
      setBloodGroup(d.person.blood_group || "O+");

      // Load active doctor links count
      try {
        const linksData = await api.get<{ links: any[] }>("/api/v1/doctor-links");
        const active = (linksData.links ?? []).filter((l) => l.status === "active" && l.personId === currentPersonId);
        setDoctorSharesCount(active.length);
      } catch {
        setDoctorSharesCount(0);
      }

      // Load notif settings
      try {
        const n = await api.get<{ settings: NotifSettings }>(`/api/v1/persons/${currentPersonId}/notifications`);
        setNotif(n.settings);
      } catch {}
    } catch (e) {
      toast({ tone: "terracotta", title: "Could not load settings" });
    } finally {
      setLoading(false);
    }
  }, [currentPersonId, toast]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    void loadData();
  }, [ready, loadData]);

  const handleSaveHealthProfile = async () => {
    if (!currentPersonId) return;
    if (name.trim().length < 2) {
      toast({ tone: "terracotta", title: "Please enter a valid name" });
      return;
    }

    setSavingProfile(true);
    try {
      const condArray = conditions.split(",").map((s) => s.trim()).filter(Boolean);
      const medArray = medicines.split(",").map((s) => s.trim()).filter(Boolean);
      const topNum = Number(bpTop) || 120;
      const botNum = Number(bpBottom) || 80;
      const ageNum = Number(age) || undefined;

      await api.patch(`/api/v1/persons/${currentPersonId}`, {
        name: name.trim(),
        age: ageNum,
        conditions: condArray,
        medicines: medArray,
        bp_top: topNum,
        bp_bottom: botNum,
        blood_group: bloodGroup.trim() || "O+",
      });

      toast({ tone: "mint", title: "Changes saved successfully" });
      await refresh();
      await loadData();
    } catch (e) {
      toast({ tone: "terracotta", title: "Failed to save profile changes" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRevokeAllDoctorShares = async () => {
    if (!currentPersonId) return;
    try {
      await api.del(`/api/v1/doctor-links?all=true&personId=${currentPersonId}`);
      setDoctorSharesCount(0);
      toast({ tone: "mint", title: "Doctor share revoked" });
    } catch {
      toast({ tone: "terracotta", title: "Could not revoke doctor shares" });
    }
  };

  const handleDeleteAllNotes = async () => {
    if (!currentPersonId) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete all notes and recordings for ${name || "this profile"}? This cannot be undone.`);
    if (!confirmDelete) return;

    setClearingNotes(true);
    try {
      await api.del(`/api/v1/persons/${currentPersonId}/log`);
      toast({ tone: "mint", title: `All notes cleared for ${name || "profile"}` });
      await refresh();
      await loadData();
    } catch {
      toast({ tone: "terracotta", title: "Failed to clear notes" });
    } finally {
      setClearingNotes(false);
    }
  };

  const handleExportSummary = async () => {
    if (!currentPersonId) return;
    try {
      const res = await api.get<{ summary: unknown }>(`/api/v1/persons/${currentPersonId}/summary?format=json&days=90`);
      const blob = new Blob([JSON.stringify(res.summary, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `docmate-${(name || "me").replace(/\s+/g, "-").toLowerCase()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ tone: "mint", title: "Data exported" });
    } catch {
      toast({ tone: "terracotta", title: "Export failed" });
    }
  };

  const patchNotif = async (body: Record<string, unknown>) => {
    if (!currentPersonId) return;
    try {
      const res = await api.patch<{ settings: NotifSettings }>(`/api/v1/persons/${currentPersonId}/notifications`, body);
      setNotif(res.settings);
      toast({ tone: "mint", title: "Notification preference updated" });
    } catch {
      toast({ tone: "terracotta", title: "Failed to update notification setting" });
    }
  };

  if (!ready || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-neutral-400">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm">Loading controls...</p>
      </div>
    );
  }

  const p = detail?.person;
  const personName = p?.name ?? "Lakshmi";

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold mb-1">SETTINGS</p>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Your controls</h1>
        <p className="text-sm text-neutral-400">Language, appearance, what Docmate knows about you, and who gets to see it.</p>
      </div>

      {/* Card 1: APPEARANCE */}
      <div className="bg-[#0f1724]/90 border border-white/5 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-400">APPEARANCE</h3>
          <p className="text-xs text-neutral-400 mt-1">Night is the default — softer on the eyes in a dim room.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Night */}
          <div
            onClick={() => changeTheme("night")}
            className={`rounded-xl p-4 cursor-pointer transition border ${
              theme === "night"
                ? "bg-[#111927] border-emerald-500/60 shadow-lg shadow-emerald-500/10"
                : "bg-[#0b101b] border-white/5 hover:border-white/20"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MoonIcon className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-white">Night</span>
              </div>
              {theme === "night" && <CheckIcon className="w-4 h-4 text-emerald-400" />}
            </div>
            <div className="h-6 w-full bg-[#0a0f18] rounded-full p-1.5 flex items-center">
              <div className="w-1/3 h-2 rounded-full bg-emerald-400 mx-auto" />
            </div>
          </div>

          {/* Cream */}
          <div
            onClick={() => changeTheme("cream")}
            className={`rounded-xl p-4 cursor-pointer transition border ${
              theme === "cream"
                ? "bg-[#111927] border-emerald-500/60 shadow-lg shadow-emerald-500/10"
                : "bg-[#0b101b] border-white/5 hover:border-white/20"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SunIcon className="w-4 h-4 text-neutral-300" />
                <span className="text-sm font-medium text-white">Cream</span>
              </div>
              {theme === "cream" && <CheckIcon className="w-4 h-4 text-emerald-400" />}
            </div>
            <div className="h-6 w-full bg-[#FAF7EE] rounded-full p-1.5 flex items-center">
              <div className="w-1/4 h-2 rounded-full bg-emerald-500 mx-auto" />
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: LANGUAGE */}
      <div className="bg-[#0f1724]/90 border border-white/5 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-400">LANGUAGE</h3>
          <p className="text-xs text-neutral-400 mt-1">Docmate listens in the language you pick here.</p>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
            <TranslateIcon className="w-4 h-4" />
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Lang)}
            className="w-full bg-[#0b101b] border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white appearance-none focus:outline-none focus:border-emerald-500 transition cursor-pointer"
          >
            <option value="ta">தமிழ் - Tamil</option>
            <option value="hi">हिन्दी - Hindi</option>
            <option value="en">English</option>
            <option value="bn">বাংলা - Bengali</option>
            <option value="te">తెలుగు - Telugu</option>
            <option value="kn">ಕನ್ನಡ - Kannada</option>
            <option value="mr">मराठी - Marathi</option>
            <option value="ml">മലയാളം - Malayalam</option>
          </select>
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-neutral-400">
            <ChevronDownIcon className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Card 3: HEALTH PROFILE */}
      <div className="bg-[#0f1724]/90 border border-white/5 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-400">HEALTH PROFILE</h3>
          <p className="text-xs text-neutral-400 mt-1">The more Docmate knows, the sharper its rules.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">NAME</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Lakshmi"
                className="w-full bg-[#0b101b] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">AGE</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="62"
                className="w-full bg-[#0b101b] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">CONDITIONS (COMMA SEPARATED)</label>
            <input
              type="text"
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="Diabetes, High BP"
              className="w-full bg-[#0b101b] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">MEDICINES</label>
            <input
              type="text"
              value={medicines}
              onChange={(e) => setMedicines(e.target.value)}
              placeholder="Metformin 500mg, Amlodipine 5mg"
              className="w-full bg-[#0b101b] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">BP TOP</label>
              <input
                type="number"
                value={bpTop}
                onChange={(e) => setBpTop(e.target.value)}
                placeholder="138"
                className="w-full bg-[#0b101b] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">BP BOTTOM</label>
              <input
                type="number"
                value={bpBottom}
                onChange={(e) => setBpBottom(e.target.value)}
                placeholder="86"
                className="w-full bg-[#0b101b] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">BLOOD GROUP</label>
              <input
                type="text"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                placeholder="O+"
                className="w-full bg-[#0b101b] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={savingProfile}
            onClick={handleSaveHealthProfile}
            className="w-full py-3 bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-semibold rounded-xl transition shadow-lg shadow-emerald-500/10 active:scale-[0.99] disabled:opacity-50 text-sm mt-2"
          >
            {savingProfile ? "Saving changes..." : "Save changes"}
          </button>
        </div>
      </div>

      {/* Card 4: EMERGENCY CONTACTS */}
      <div className="bg-[#0f1724]/90 border border-white/5 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-400">EMERGENCY CONTACTS</h3>
          <p className="text-xs text-neutral-400 mt-1">The people who get called first for {personName}.</p>
        </div>
        <Link
          href="/alerts"
          className="flex items-center justify-between p-3.5 bg-[#0b101b] hover:bg-white/[0.04] border border-white/10 rounded-xl transition group"
        >
          <div className="flex items-center gap-3">
            <PhoneIcon className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-white group-hover:text-emerald-400 transition">Manage contacts</span>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-neutral-400 group-hover:translate-x-0.5 transition" />
        </Link>
      </div>

      {/* Card 5: SHARING & CONSENT */}
      <div className="bg-[#0f1724]/90 border border-white/5 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-400">SHARING & CONSENT</h3>
          <p className="text-xs text-neutral-400 mt-1">Revoking a code cuts the doctor's access immediately.</p>
        </div>
        <div className="p-4 bg-[#0b101b] border border-white/5 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Doctor shares</p>
            <p className="text-xs text-neutral-400 mt-0.5">{doctorSharesCount} active codes</p>
          </div>
          <button
            type="button"
            onClick={handleRevokeAllDoctorShares}
            className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition"
          >
            Revoke all
          </button>
        </div>
        <div className="flex items-start gap-2.5 pt-1 text-xs text-neutral-400">
          <ShieldLockIcon className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Your audio is never stored — only the transcript and the health values Docmate extracted. Family members see only the categories you allow on the Family page.
          </p>
        </div>
      </div>

      {/* Card 6: YOUR DATA */}
      <div className="bg-[#0f1724]/90 border border-white/5 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-400">YOUR DATA</h3>
          <p className="text-xs text-neutral-400 mt-1">Notes belong to you. You can erase them any time.</p>
        </div>
        <button
          type="button"
          onClick={handleDeleteAllNotes}
          disabled={clearingNotes}
          className="w-full flex items-center justify-center gap-2 py-3 bg-white/[0.03] hover:bg-rose-500/10 text-neutral-300 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 rounded-xl transition text-sm font-medium disabled:opacity-50"
        >
          <TrashIcon className="w-4 h-4" />
          <span>{clearingNotes ? "Erasing..." : `Delete all notes for ${personName}`}</span>
        </button>
      </div>

      {/* Advanced / Existing Preferences */}
      <div className="bg-[#0f1724]/60 border border-white/5 rounded-2xl p-5 space-y-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-left text-xs uppercase tracking-wider font-semibold text-neutral-400 hover:text-white transition"
        >
          <span>NOTIFICATION & LIFESTYLE PREFERENCES</span>
          <ChevronDownIcon className={`w-4 h-4 transition transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>

        {showAdvanced && (
          <div className="pt-4 space-y-4 border-t border-white/5 text-sm">
            {notif && (
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <div>
                    <p className="text-white font-medium">Daily check-in reminder</p>
                    <p className="text-xs text-neutral-400">Remind me to speak a note every day</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!notif.daily_reminder}
                    onChange={(e) => patchNotif({ daily_reminder: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 accent-emerald-400"
                  />
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <div>
                    <p className="text-white font-medium">Urgent health alert SMS</p>
                    <p className="text-xs text-neutral-400">Notify immediately when vitals cross thresholds</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!notif.level3_enabled}
                    onChange={(e) => patchNotif({ level3_enabled: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 accent-emerald-400"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Export health archive</p>
                <p className="text-xs text-neutral-400">Download complete structured JSON of your observations</p>
              </div>
              <button
                type="button"
                onClick={handleExportSummary}
                className="text-xs font-semibold px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 transition"
              >
                Export JSON
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-neutral-500 space-y-1 pt-6 pb-6">
        <p>Docmate · {persons.length || 3} profiles in this family space</p>
        <p className="max-w-md mx-auto text-[11px] text-neutral-600">
          A companion for noticing patterns, not a medical device. It cannot diagnose, and it will always tell you to reach a real clinician when something looks serious.
        </p>
      </div>
    </div>
  );
}
