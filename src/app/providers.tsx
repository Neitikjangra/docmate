"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, track } from "@/lib/client/api";
import { flush, queueSize } from "@/lib/client/offline";
import { t as translate, type Lang } from "@/lib/i18n";

export type PersonCard = {
  id: string;
  name: string;
  relation: string | null;
  isManaged: boolean;
  dob: string | null;
  age: number | null;
  sex: string | null;
  role: "owner" | "family" | "doctor";
  avatarTone: string;
  score?: number | null;
};

export type Me = {
  accountId: string;
  phone: string | null;
  isDoctor: boolean;
  hasProfile: boolean;
  needsConsent: boolean;
  language: Lang;
  doctor?: { id: string; name: string; specialty: string } | null;
};

type Toast = { id: string; tone: "mint" | "terracotta" | "red"; title: string; body?: string };

type Ctx = {
  ready: boolean;
  me: Me | null;
  persons: PersonCard[];
  currentPersonId: string | null;
  currentPerson: PersonCard | null;
  language: Lang;
  online: boolean;
  pending: number;
  setCurrentPerson: (id: string) => void;
  setLanguage: (l: Lang) => void;
  refresh: () => Promise<void>;
  setMe: (m: Me | null) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  toast: (t: Omit<Toast, "id">) => void;
  toasts: Toast[];
  dismiss: (id: string) => void;
};

const AppCtx = createContext<Ctx | null>(null);

const STORE_PERSON = "docmate.person";
const STORE_LANG = "docmate.lang";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMeState] = useState<Me | null>(null);
  const [persons, setPersons] = useState<PersonCard[]>([]);
  const [currentPersonId, setCurrentPersonId] = useState<string | null>(null);
  const [language, setLanguageState] = useState<Lang>("en");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const toast = useCallback((tt: Omit<Toast, "id">) => {
    const id = `t${++toastSeq.current}`;
    setToasts((prev) => [...prev, { ...tt, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6200);
  }, []);

  const dismiss = useCallback((id: string) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ account: Me; persons: PersonCard[] }>("/api/v1/auth/me");
      setMeState(data.account);
      setPersons(data.persons ?? []);
      const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORE_PERSON) : null;
      const lang = (typeof localStorage !== "undefined" ? localStorage.getItem(STORE_LANG) : null) as Lang | null;
      if (lang) setLanguageState(lang);
      else if (data.account?.language) setLanguageState(data.account.language);
      const valid = data.persons?.some((p) => p.id === stored);
      setCurrentPersonId(valid ? stored : (data.persons?.[0]?.id ?? null));
    } catch {
      setMeState(null);
      setPersons([]);
      setCurrentPersonId(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    const tick = async () => {
      const n = await queueSize();
      setPending(n);
      if (n > 0 && (typeof navigator === "undefined" || navigator.onLine)) {
        const sent = await flush();
        if (sent > 0) {
          setPending(await queueSize());
          toast({ tone: "mint", title: `${sent} offline ${sent === 1 ? "entry" : "entries"} synced`, body: "Everything you said was saved." });
        }
      }
    };
    void tick();
    const id = window.setInterval(tick, 12000);
    const onOnline = () => void tick();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, [toast]);

  const setCurrentPerson = useCallback((id: string) => {
    setCurrentPersonId(id);
    try {
      localStorage.setItem(STORE_PERSON, id);
    } catch {
      /* ignore */
    }
    track("person_switched", { personId: id });
  }, []);

  const setLanguage = useCallback((l: Lang) => {
    setLanguageState(l);
    try {
      localStorage.setItem(STORE_LANG, l);
    } catch {
      /* ignore */
    }
    track("language_changed", {}, undefined, l);
    void api.patch("/api/v1/onboarding", { language: l }).catch(() => {});
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  );

  const value = useMemo<Ctx>(
    () => ({
      ready,
      me,
      persons,
      currentPersonId,
      currentPerson: persons.find((p) => p.id === currentPersonId) ?? null,
      language,
      online,
      pending,
      setCurrentPerson,
      setLanguage,
      refresh: load,
      setMe: setMeState,
      t,
      toast,
      toasts,
      dismiss,
    }),
    [ready, me, persons, currentPersonId, language, online, pending, setCurrentPerson, setLanguage, load, t, toast, toasts, dismiss],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
