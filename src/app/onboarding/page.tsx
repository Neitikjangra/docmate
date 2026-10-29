"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, type PersonCard } from "@/app/providers";
import { api, ApiError, track } from "@/lib/client/api";
import { Card, SectionTitle, Sheet, Segmented, Spinner, Pill } from "@/components/ui";
import { LANGS, type Lang } from "@/lib/i18n";
import { Wordmark } from "@/components/shell/SignIn";

/* ------------------------------------------------------------------ model */

const STEPS = ["language", "phone", "consent", "about", "lifestyle", "health"] as const;
type StepName = (typeof STEPS)[number];
type Phase = "flow" | "done";

type Option = { value: string; label: string };

type Form = {
  name: string;
  dob: string;
  sex: string;
  relation: string;
  height: string;
  weight: string;
  work_status: string;
  work_hours: string;
  exercise_level: string;
  sleep_band: string;
  diet: string;
  tobacco: string;
  alcohol: string;
  preferred_voice: string;
  checkin_time: string;
  conditions: string[];
  conditionOther: string;
  medicines: { name: string; dosage: string }[];
  allergies: string[];
  allergyInput: string;
  ecName: string;
  ecPhone: string;
};

const INITIAL: Form = {
  name: "",
  dob: "",
  sex: "",
  relation: "self",
  height: "",
  weight: "",
  work_status: "",
  work_hours: "",
  exercise_level: "",
  sleep_band: "",
  diet: "",
  tobacco: "",
  alcohol: "",
  preferred_voice: "",
  checkin_time: "21:00",
  conditions: [],
  conditionOther: "",
  medicines: [{ name: "", dosage: "" }],
  allergies: [],
  allergyInput: "",
  ecName: "",
  ecPhone: "",
};

const SEX_OPTIONS: Option[] = [
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
  { value: "Other", label: "Other" },
];

const WORK_STATUS = ["Student", "Desk job", "Field work", "Business", "Homemaker", "Retired"];
const WORK_HOURS = ["Day", "Night", "Shifts", "Irregular"];
const EXERCISE = ["None", "Light", "Moderate", "Active"];
const SLEEP = ["Under 5h", "5-6h", "6-7h", "7h+"];
const DIET = ["Veg", "Non-veg", "Mixed", "Jain"];
const SUBSTANCE = ["Never", "Occasionally", "Daily"];
const VOICE = ["Female voice", "Male voice", "No preference"];
const CONDITION_CHIPS = [
  "Diabetes",
  "Hypertension",
  "Heart disease",
  "Asthma",
  "Thyroid",
  "Arthritis",
  "Cancer",
  "None of these",
  "Other",
];

type OnboardingResume = {
  step: number;
  data: Record<string, unknown>;
  language: string;
  consentGiven: boolean;
};
type PersonCreateRes = { person: PersonCard; created: boolean };

/* --------------------------------------------------------------- helpers */

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}
function arrOfStr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}
function toNum(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/* -------------------------------------------------------------- subviews */

function ChipGroup({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
                active
                  ? "border-mint/50 bg-tint-mint tone-mint"
                  : "border-hairline bg-night3/50 text-muted hover:border-mint/30 hover:text-cream"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {hint ? <p className="mt-1.5 text-[12px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div className="relative grid h-[148px] w-[148px] place-items-center">
      <svg width="148" height="148" viewBox="0 0 148 148" className="-rotate-90">
        <circle cx="74" cy="74" r={r} fill="none" stroke="#1E2A31" strokeWidth="11" />
        <circle
          cx="74"
          cy="74"
          r={r}
          fill="none"
          stroke="#6EE0CF"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="kpi-value tone-mint">{Math.round(pct)}%</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Complete</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- the flow */

function OnboardingFlow() {
  const { me, language, setLanguage, refresh, t, currentPerson, toast } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManaged = (searchParams?.get("add") ?? "") === "1";
  const firstStep = isManaged ? 3 : 0;

  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("flow");
  const [step, setStep] = useState<number>(firstStep);
  const [form, setForm] = useState<Form>(() => ({ ...INITIAL, relation: isManaged ? "father" : "self" }));
  const [personId, setPersonId] = useState<string | null>(null);
  const [pctDone, setPctDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);

  const prevManaged = useRef(isManaged);

  const set = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  /* ---------------------------------------------------------- resume state */

  const applyResume = useCallback(
    (res: OnboardingResume) => {
      const d = res.data ?? {};
      const medsRaw = Array.isArray(d.medicines) ? (d.medicines as unknown[]) : [];
      const ecsRaw = Array.isArray(d.emergencyContacts) ? (d.emergencyContacts as unknown[]) : [];
      const ec0 = ecsRaw[0] as { name?: unknown; phone?: unknown } | undefined;
      const conds = arrOfStr(d.conditions);
      const allergyList = arrOfStr(d.allergies);
      setForm((f) => ({
        ...f,
        name: str(d.name) || f.name,
        dob: str(d.dob) || f.dob,
        sex: str(d.sex) || f.sex,
        relation: str(d.relation) || f.relation,
        height: str(d.height_cm) || f.height,
        weight: str(d.weight_kg) || f.weight,
        work_status: str(d.work_status) || f.work_status,
        work_hours: str(d.work_hours) || f.work_hours,
        exercise_level: str(d.exercise_level) || f.exercise_level,
        sleep_band: str(d.sleep_band) || f.sleep_band,
        diet: str(d.diet) || f.diet,
        tobacco: str(d.tobacco) || f.tobacco,
        alcohol: str(d.alcohol) || f.alcohol,
        preferred_voice: str(d.preferred_voice) || f.preferred_voice,
        checkin_time: str(d.checkin_time) || f.checkin_time,
        conditions: conds.length ? conds : f.conditions,
        allergies: allergyList.length ? allergyList : f.allergies,
        medicines: medsRaw.length
          ? medsRaw.map((m) => {
              const o = m as { name?: unknown; dosage?: unknown };
              return { name: str(o.name), dosage: str(o.dosage) };
            })
          : f.medicines,
        ecName: str(ec0?.name) || f.ecName,
        ecPhone: str(ec0?.phone) || f.ecPhone,
      }));

      if (isManaged) {
        setStep(3);
        setPhase("flow");
        return;
      }
      if (res.step >= STEPS.length) {
        // The flow was finished in an earlier session — send them home.
        router.replace("/");
        return;
      }
      let start = res.step;
      if (res.consentGiven && start <= 2) start = 3;
      setStep(Math.max(0, Math.min(STEPS.length - 1, start)));
    },
    [isManaged, router],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await api.get<OnboardingResume>("/api/v1/onboarding");
        if (alive) applyResume(res);
      } catch {
        /* starting fresh is fine — the shell already knows who this is */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyResume]);

  /* switching into / out of managed mode resets the flow without a reload */
  useEffect(() => {
    if (prevManaged.current === isManaged) return;
    prevManaged.current = isManaged;
    setForm({ ...INITIAL, relation: isManaged ? "father" : "self" });
    setStep(isManaged ? 3 : 0);
    setPhase("flow");
    setPersonId(null);
    setErr(null);
  }, [isManaged]);

  /* -------------------------------------------------------------- derived */

  const bmi = useMemo(() => {
    const h = parseFloat(form.height);
    const w = parseFloat(form.weight);
    if (!h || !w || h <= 0) return null;
    return Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
  }, [form.height, form.weight]);

  const ecValid = form.ecName.trim().length >= 2 && onlyDigits(form.ecPhone).length === 10;

  const finalConditions = useMemo(() => {
    const picked = form.conditions.filter((c) => c !== "None of these" && c !== "Other");
    if (form.conditions.includes("Other") && form.conditionOther.trim()) picked.push(form.conditionOther.trim());
    return picked;
  }, [form.conditions, form.conditionOther]);

  const medicines = useMemo(
    () => form.medicines.filter((m) => m.name.trim().length > 0).map((m) => ({ name: m.name.trim(), dosage: m.dosage.trim() })),
    [form.medicines],
  );

  const stepName: StepName = STEPS[Math.max(0, Math.min(STEPS.length - 1, step))];
  const progress = phase === "done" ? 100 : Math.round(((step + 1) / STEPS.length) * 100);

  /* --------------------------------------------------------- step saving */

  const fieldsForStep = useCallback(
    (s: number): Record<string, unknown> => {
      if (s === 2) return { consentGiven: true };
      if (s === 3)
        return {
          name: form.name.trim(),
          dob: form.dob,
          sex: form.sex || null,
          relation: form.relation,
          isManaged,
          height_cm: toNum(form.height) ?? null,
          weight_kg: toNum(form.weight) ?? null,
        };
      if (s === 4)
        return {
          work_status: form.work_status || null,
          work_hours: form.work_hours || null,
          exercise_level: form.exercise_level || null,
          sleep_band: form.sleep_band || null,
          diet: form.diet || null,
          tobacco: form.tobacco || null,
          alcohol: form.alcohol || null,
          preferred_voice: form.preferred_voice || null,
          checkin_time: form.checkin_time || "21:00",
        };
      if (s === 5)
        return {
          conditions: finalConditions,
          medicines,
          allergies: form.allergies,
          emergencyContacts: ecValid ? [{ name: form.ecName.trim(), phone: onlyDigits(form.ecPhone) }] : [],
        };
      return {};
    },
    [form, isManaged, finalConditions, medicines, ecValid],
  );

  const validate = useCallback(
    (s: number): string | null => {
      if (s !== 3) return null;
      if (form.name.trim().length < 2) return "Please enter a name with at least 2 letters.";
      if (!form.dob) return "Please add the date of birth.";
      const age = ageFromDob(form.dob);
      if (age === null) return "That date of birth does not look right.";
      if (isManaged) {
        if (age < 0 || age > 120) return "Please check the date of birth.";
      } else {
        if (age < 13) return "Docmate is for people aged 13 and above. A parent or guardian can manage a profile instead.";
        if (age > 120) return "Please check the date of birth.";
      }
      return null;
    },
    [form.name, form.dob, isManaged],
  );

  const completeness = useCallback((): number => {
    const checks = [
      form.name.trim().length >= 2,
      !!form.dob,
      !!form.sex,
      !!form.relation,
      !!toNum(form.height),
      !!toNum(form.weight),
      !!form.work_status,
      !!form.work_hours,
      !!form.exercise_level,
      !!form.sleep_band,
      !!form.diet,
      !!form.tobacco,
      !!form.alcohol,
      !!form.preferred_voice,
      !!form.checkin_time,
      finalConditions.length > 0,
      medicines.length > 0,
      form.allergies.length > 0,
      ecValid,
    ];
    const filled = checks.filter(Boolean).length;
    return Math.round((filled / checks.length) * 100);
  }, [form, finalConditions, medicines, ecValid]);

  const finish = useCallback(async () => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      dob: form.dob,
      sex: form.sex || null,
      relation: form.relation,
      isManaged,
      height_cm: toNum(form.height) ?? null,
      weight_kg: toNum(form.weight) ?? null,
      work_status: form.work_status || null,
      work_hours: form.work_hours || null,
      exercise_level: form.exercise_level || null,
      sleep_band: form.sleep_band || null,
      diet: form.diet || null,
      tobacco: form.tobacco || null,
      alcohol: form.alcohol || null,
      preferred_voice: form.preferred_voice || null,
      checkin_time: form.checkin_time || "21:00",
      conditions: finalConditions,
      medicines,
      allergies: form.allergies,
      emergencyContacts: ecValid ? [{ name: form.ecName.trim(), phone: onlyDigits(form.ecPhone) }] : [],
    };

    const res = await api.post<PersonCreateRes>("/api/v1/persons", payload);
    setPersonId(res.person.id);

    const pct = completeness();
    setPctDone(pct);

    await api.patch("/api/v1/onboarding", { step: STEPS.length, data: fieldsForStep(5), language }).catch(() => {});
    await api.patch(`/api/v1/persons/${res.person.id}`, { onboarded: true, completeness: pct });

    track("onboarding_completed", { managed: isManaged });
    await refresh();
    setPhase("done");
  }, [form, isManaged, finalConditions, medicines, ecValid, completeness, fieldsForStep, language, refresh]);

  const goNext = useCallback(async () => {
    setErr(null);
    const problem = validate(step);
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    try {
      if (step === 5) {
        await finish();
        return;
      }
      const next = step + 1;
      await api.patch("/api/v1/onboarding", { step: next, data: fieldsForStep(step), language });
      track("onboarding_step", { step: next });
      setStep(next);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [step, validate, finish, fieldsForStep, language]);

  const goBack = useCallback(() => {
    setErr(null);
    setStep((s) => Math.max(firstStep, s - 1));
  }, [firstStep]);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await api.post("/api/v1/auth/logout");
      await refresh();
    } catch {
      /* the shell will fall back to the sign-in screen either way */
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const goDashboard = useCallback(async () => {
    await refresh();
    router.push("/");
  }, [refresh, router]);

  const joinFamily = useCallback(async () => {
    setJoinErr(null);
    const id = personId ?? currentPerson?.id ?? null;
    if (!id) {
      setJoinErr("Your profile is still being set up. Try again in a moment.");
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (code.length < 6) {
      setJoinErr("That join code does not look right.");
      return;
    }
    setJoinBusy(true);
    try {
      await api.post("/api/v1/family/join", { code, personId: id });
      toast({ tone: "mint", title: "Joined the family", body: "You can start sharing whenever you are ready." });
      setJoinOpen(false);
      await refresh();
      router.push("/");
    } catch (e) {
      setJoinErr(e instanceof ApiError ? e.message : "Could not join. Please try again.");
    } finally {
      setJoinBusy(false);
    }
  }, [personId, currentPerson, joinCode, toast, refresh, router]);

  /* ------------------------------------------------------------- renderers */

  const primaryLabel =
    step === 2 ? t("ob.consent_agree") : step === 5 ? t("common.done") : t("common.continue");

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4 text-muted">
          <Wordmark size="lg" />
          <Spinner size={22} />
          <p className="text-[13px]">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  let content: React.ReactNode = null;

  if (phase === "done") {
    content = (
      <div className="animate-rise space-y-6">
        <div className="flex flex-col items-center text-center">
          <Ring pct={pctDone} />
          <h1 className="mt-4 font-display text-[24px] font-semibold text-cream">{t("ob.complete")}</h1>
          <p className="mt-1 text-[13px] text-muted">{t("ob.completeness", { pct: pctDone })}</p>
          <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-muted">
            You can add this later — nothing here blocks you.
          </p>
        </div>

        <div className="space-y-2.5">
          <button type="button" className="btn-ghost w-full" onClick={() => router.push("/onboarding?add=1")}>
            {t("ob.add_member")}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => setJoinOpen(true)}>
            {t("ob.join_code")}
          </button>
          <button type="button" className="btn-primary w-full" onClick={() => void goDashboard()}>
            {t("ob.go_home")}
          </button>
        </div>
      </div>
    );
  } else if (step === 0) {
    content = (
      <div className="animate-rise space-y-4">
        <SectionTitle>{t("ob.lang_q")}</SectionTitle>
        <div className="space-y-2.5">
          {LANGS.map((l) => {
            const active = l.code === language;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => setLanguage(l.code as Lang)}
                className={`flex w-full items-center justify-between rounded-xl2 border px-4 py-3.5 text-left transition ${
                  active ? "border-mint/50 bg-tint-mint" : "border-hairline bg-night3/50 hover:border-mint/30"
                }`}
              >
                <span>
                  <span className="block font-display text-[17px] font-semibold text-cream">{l.native}</span>
                  <span className="text-[12px] text-muted">{l.label}</span>
                </span>
                {active ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6EE0CF" strokeWidth="2.2">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  } else if (step === 1) {
    content = (
      <div className="animate-rise space-y-4">
        <SectionTitle>{t("ob.step.phone")}</SectionTitle>
        <Card tone="mint" className="flex items-center justify-between p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Confirmed</p>
            <p className="mono mt-1 text-[18px] font-semibold text-cream">{me?.phone ? `+91 ${me.phone}` : "—"}</p>
          </div>
          <Pill tone="mint">Verified</Pill>
        </Card>
        <p className="text-[13px] text-muted">
          Not you?{" "}
          <button type="button" className="link" onClick={() => void signOut()} disabled={busy}>
            {t("profile.sign_out")}
          </button>
        </p>
      </div>
    );
  } else if (step === 2) {
    content = (
      <div className="animate-rise space-y-4">
        <SectionTitle>{t("ob.consent_title")}</SectionTitle>
        <Card className="p-5">
          <p className="text-[14px] leading-relaxed text-cream/90">{t("ob.consent_body")}</p>
        </Card>
      </div>
    );
  } else if (step === 3) {
    content = (
      <div className="animate-rise space-y-4">
        <SectionTitle hint={isManaged ? t("ob.managed_note") : undefined}>{t("ob.step.about")}</SectionTitle>
        <Card className="space-y-5 p-5">
          <div>
            <label className="label" htmlFor="ob-name">
              {t("ob.name")}
            </label>
            <input
              id="ob-name"
              className="field"
              autoComplete="name"
              maxLength={60}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="ob-dob">
              {t("ob.dob")}
            </label>
            <input
              id="ob-dob"
              type="date"
              className="field"
              value={form.dob}
              onChange={(e) => set("dob", e.target.value)}
            />
          </div>

          <div>
            <span className="label">{t("ob.sex")}</span>
            <Segmented value={form.sex} onChange={(v) => set("sex", v)} options={SEX_OPTIONS} />
          </div>

          <div>
            <span className="label">{t("ob.relation")}</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "self", label: t("ob.relation_self") },
                  { value: "father", label: t("ob.relation_father") },
                  { value: "mother", label: t("ob.relation_mother") },
                  { value: "other", label: t("ob.relation_other") },
                ] as Option[]
              ).map((o) => {
                const active = form.relation === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set("relation", o.value)}
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
                      active
                        ? "border-mint/50 bg-tint-mint tone-mint"
                        : "border-hairline bg-night3/50 text-muted hover:border-mint/30 hover:text-cream"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ob-height">
                {t("ob.height")}
              </label>
              <input
                id="ob-height"
                inputMode="decimal"
                className="field"
                placeholder="165"
                value={form.height}
                onChange={(e) => set("height", e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
            <div>
              <label className="label" htmlFor="ob-weight">
                {t("ob.weight")}
              </label>
              <input
                id="ob-weight"
                inputMode="decimal"
                className="field"
                placeholder="62"
                value={form.weight}
                onChange={(e) => set("weight", e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
          </div>

          {bmi !== null ? (
            <div className="flex items-center gap-2">
              <Pill tone="mint">{t("ob.bmi", { bmi })}</Pill>
              <span className="text-[12px] text-muted">Body mass index</span>
            </div>
          ) : null}
        </Card>
      </div>
    );
  } else if (step === 4) {
    content = (
      <div className="animate-rise space-y-4">
        <SectionTitle>{t("ob.step.lifestyle")}</SectionTitle>
        <Card className="space-y-5 p-5">
          <ChipGroup label="Work" value={form.work_status} options={WORK_STATUS} onChange={(v) => set("work_status", v)} />
          <ChipGroup label="Work hours" value={form.work_hours} options={WORK_HOURS} onChange={(v) => set("work_hours", v)} />
          <ChipGroup label="Exercise" value={form.exercise_level} options={EXERCISE} onChange={(v) => set("exercise_level", v)} />
          <ChipGroup label="Sleep" value={form.sleep_band} options={SLEEP} onChange={(v) => set("sleep_band", v)} />
          <ChipGroup label="Diet" value={form.diet} options={DIET} onChange={(v) => set("diet", v)} />
          <ChipGroup label="Tobacco" value={form.tobacco} options={SUBSTANCE} onChange={(v) => set("tobacco", v)} />
          <ChipGroup label="Alcohol" value={form.alcohol} options={SUBSTANCE} onChange={(v) => set("alcohol", v)} />
          <ChipGroup label="Preferred voice" value={form.preferred_voice} options={VOICE} onChange={(v) => set("preferred_voice", v)} />
          <div>
            <label className="label" htmlFor="ob-checkin">
              {t("ob.checkin")}
            </label>
            <input
              id="ob-checkin"
              type="time"
              className="field mono"
              value={form.checkin_time}
              onChange={(e) => set("checkin_time", e.target.value)}
            />
          </div>
        </Card>
      </div>
    );
  } else {
    content = (
      <div className="animate-rise space-y-4">
        <SectionTitle>{t("ob.step.health")}</SectionTitle>

        <Card className="space-y-5 p-5">
          <div>
            <span className="label">{t("ob.conditions")}</span>
            <div className="flex flex-wrap gap-2">
              {CONDITION_CHIPS.map((c) => {
                const active = form.conditions.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setForm((f) => {
                        const has = f.conditions.includes(c);
                        let next = has ? f.conditions.filter((x) => x !== c) : [...f.conditions, c];
                        if (!has && c === "None of these") return { ...f, conditions: ["None of these"], conditionOther: "" };
                        next = next.filter((x) => x !== "None of these");
                        return { ...f, conditions: next };
                      });
                    }}
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
                      active
                        ? "border-mint/50 bg-tint-mint tone-mint"
                        : "border-hairline bg-night3/50 text-muted hover:border-mint/30 hover:text-cream"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            {form.conditions.includes("Other") ? (
              <input
                className="field mt-2.5"
                placeholder="Name the condition"
                value={form.conditionOther}
                onChange={(e) => set("conditionOther", e.target.value)}
              />
            ) : null}
          </div>

          <div>
            <span className="label">{t("ob.medicines")}</span>
            <div className="space-y-2">
              {form.medicines.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="field"
                    placeholder="Medicine name"
                    value={m.name}
                    onChange={(e) =>
                      setForm((f) => {
                        const rows = [...f.medicines];
                        rows[i] = { ...rows[i], name: e.target.value };
                        return { ...f, medicines: rows };
                      })
                    }
                  />
                  <input
                    className="field w-28 shrink-0"
                    placeholder="Dosage"
                    value={m.dosage}
                    onChange={(e) =>
                      setForm((f) => {
                        const rows = [...f.medicines];
                        rows[i] = { ...rows[i], dosage: e.target.value };
                        return { ...f, medicines: rows };
                      })
                    }
                  />
                  {form.medicines.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Remove medicine"
                      onClick={() => setForm((f) => ({ ...f, medicines: f.medicines.filter((_, j) => j !== i) }))}
                      className="grid w-10 shrink-0 place-items-center rounded-2xl border border-hairline bg-night3/50 text-muted transition hover:text-cream"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <p className="text-[12px] leading-snug text-muted">{t("ob.medicines_hint")}</p>
              <button
                type="button"
                className="link shrink-0 text-[13px]"
                onClick={() => setForm((f) => ({ ...f, medicines: [...f.medicines, { name: "", dosage: "" }] }))}
              >
                {t("common.add")}
              </button>
            </div>
          </div>

          <div>
            <span className="label">{t("ob.allergies")}</span>
            {form.allergies.length ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {form.allergies.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, allergies: f.allergies.filter((x) => x !== a) }))}
                    className="chip hover:border-terracotta/40 hover:text-cream"
                  >
                    {a}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <input
                className="field"
                placeholder="e.g. Penicillin"
                value={form.allergyInput}
                onChange={(e) => set("allergyInput", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const v = form.allergyInput.trim();
                  if (!v) return;
                  setForm((f) =>
                    f.allergies.includes(v) ? { ...f, allergyInput: "" } : { ...f, allergies: [...f.allergies, v], allergyInput: "" },
                  );
                }}
              />
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => {
                  const v = form.allergyInput.trim();
                  if (!v) return;
                  setForm((f) =>
                    f.allergies.includes(v) ? { ...f, allergyInput: "" } : { ...f, allergies: [...f.allergies, v], allergyInput: "" },
                  );
                }}
              >
                {t("common.add")}
              </button>
            </div>
          </div>
        </Card>

        <Card tone={ecValid ? "plain" : "red"} className="space-y-4 p-5">
          <SectionTitle hint={t("ob.emergency_hint")}>{t("ob.emergency")}</SectionTitle>
          {!ecValid ? (
            <div className="rounded-2xl border border-alertred/40 bg-tint-red p-3.5">
              <p className="text-[13px] font-semibold tone-red">Add an emergency contact</p>
              <p className="mt-0.5 text-[12px] leading-snug text-muted">
                We strongly recommend adding one. It powers your SOS.
              </p>
            </div>
          ) : null}
          <div className="grid gap-3">
            <div>
              <label className="label" htmlFor="ob-ec-name">
                Name
              </label>
              <input
                id="ob-ec-name"
                className="field"
                autoComplete="name"
                value={form.ecName}
                onChange={(e) => set("ecName", e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="ob-ec-phone">
                Phone
              </label>
              <div className="flex items-center gap-2">
                <span className="chip h-[50px] shrink-0 px-3.5 text-[14px] text-cream">+91</span>
                <input
                  id="ob-ec-phone"
                  className="field mono"
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="98765 43210"
                  value={form.ecPhone}
                  onChange={(e) => set("ecPhone", e.target.value.replace(/[^\d\s]/g, ""))}
                />
              </div>
            </div>
          </div>
          <p className="text-[12px] leading-relaxed text-muted">
            When you trigger <span className="tone-mint">SOS</span>, Docmate calls this person and shares your location.
            Emergency numbers are never shared without your SOS.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-hairline bg-night/85 backdrop-blur">
        <div className="mx-auto w-full max-w-lg px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <Wordmark size="sm" />
            <span className="text-right leading-tight">
              <span className="block text-[12px] font-semibold text-cream">
                {phase === "done" ? t("ob.complete") : t(`ob.step.${stepName}`)}
              </span>
              {phase === "done" ? null : (
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Step {step + 1} of {STEPS.length}
                </span>
              )}
            </span>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-hairline">
            <div className="h-full rounded-full bg-mint transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-28 pt-6">
        {isManaged && phase !== "done" ? (
          <Card tone="mint" className="mb-4 flex items-start gap-3 p-4">
            <span className="tone-mint">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" />
                <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.6c2 .5 3.2 2 3.2 4.4" />
              </svg>
            </span>
            <p className="text-[12.5px] leading-snug text-cream/90">{t("ob.managed_note")}</p>
          </Card>
        ) : null}

        {content}

        {err ? <p className="mt-4 text-[13px] tone-terracotta">{err}</p> : null}
      </main>

      {phase !== "done" ? (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-night/90 backdrop-blur">
          <div className="safe-bottom mx-auto flex w-full max-w-lg items-center gap-3 px-5 py-3">
            {step > firstStep ? (
              <button type="button" className="btn-ghost" onClick={goBack} disabled={busy}>
                {t("common.back")}
              </button>
            ) : null}
            <button type="button" className="btn-primary ml-auto flex-1" onClick={() => void goNext()} disabled={busy}>
              {busy ? <Spinner /> : null}
              {primaryLabel}
            </button>
          </div>
        </footer>
      ) : null}

      <Sheet
        open={joinOpen}
        onClose={() => {
          setJoinOpen(false);
          setJoinErr(null);
        }}
        title={t("ob.join_code")}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setJoinOpen(false);
                setJoinErr(null);
              }}
            >
              {t("common.cancel")}
            </button>
            <button type="button" className="btn-primary" onClick={() => void joinFamily()} disabled={joinBusy}>
              {joinBusy ? <Spinner /> : null}
              {t("family.join")}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="ob-join-code">
          {t("family.code")}
        </label>
        <input
          id="ob-join-code"
          className="field mono uppercase tracking-[0.2em]"
          maxLength={12}
          placeholder="8 characters"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        />
        <p className="mt-2 text-[12px] leading-snug text-muted">{t("family.join_hint")}</p>
        {joinErr ? <p className="mt-3 text-[13px] tone-terracotta">{joinErr}</p> : null}
      </Sheet>
    </div>
  );
}

/* --------------------------------------------------------------- wrapper */

export default function OnboardingPage() {
  return (
    <React.Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center">
          <div className="flex flex-col items-center gap-4 text-muted">
            <Wordmark size="lg" />
            <Spinner size={22} />
          </div>
        </div>
      }
    >
      <OnboardingFlow />
    </React.Suspense>
  );
}
