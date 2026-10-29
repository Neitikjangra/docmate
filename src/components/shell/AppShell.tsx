"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { Spinner, Toasts } from "@/components/ui";
import { api } from "@/lib/client/api";
import { LanguagePicker } from "./LanguagePicker";
import { SignIn, Wordmark } from "./SignIn";
import { SosOverlay } from "./SosOverlay";

type IconName = "home" | "mic" | "clock" | "trends" | "users" | "bell" | "cross" | "stethoscope" | "cog" | "terminal";

function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z" />
        </svg>
      );
    case "mic":
      return (
        <svg {...common}>
          <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "trends":
      return (
        <svg {...common}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" />
          <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.6c2 .5 3.2 2 3.2 4.4" />
        </svg>
      );
    case "stethoscope":
    case "cross":
      return (
        <svg {...common}>
          <path d="M4.5 3v5a4.5 4.5 0 0 0 9 0V3" />
          <path d="M6 3H3" />
          <path d="M15 3h-3" />
          <path d="M9 12.5a5 5 0 0 0 5 5h1a4 4 0 0 0 4-4v-1.5" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      );
    case "cog":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z" />
          <path d="M10 18.5a2 2 0 0 0 4 0" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
          <path d="m7.5 10 2.5 2.5-2.5 2.5M12.5 15H16" />
        </svg>
      );
    default:
      return null;
  }
}

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Today", icon: "home" },
  { href: "/record", label: "Voice log", icon: "mic" },
  { href: "/history", label: "History", icon: "clock" },
  { href: "/trends", label: "Trends", icon: "trends" },
  { href: "/family", label: "Family", icon: "users" },
  { href: "/alerts", label: "Alerts", icon: "bell" },
  { href: "/doctor", label: "Doctors", icon: "stethoscope" },
  { href: "/profile", label: "Settings", icon: "cog" },
];

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Today", icon: "home" },
  { href: "/history", label: "History", icon: "clock" },
  { href: "/trends", label: "Trends", icon: "trends" },
  { href: "/family", label: "Family", icon: "users" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, me, persons, currentPersonId, online, pending, toasts, dismiss, t, refresh } = useApp();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [openAlerts, setOpenAlerts] = useState(0);
  const [nightMode, setNightMode] = useState(true);

  const onOnboarding = pathname.startsWith("/onboarding");
  const onPortal = pathname.startsWith("/doctor-portal");
  const bare = onOnboarding || onPortal;

  useEffect(() => {
    if (!ready || !me) return;
    if (me.isDoctor && !me.hasProfile) {
      if (!onPortal) router.replace("/doctor-portal");
      return;
    }
    if ((!me.hasProfile || me.needsConsent) && !onOnboarding && !onPortal) router.replace("/onboarding");
  }, [ready, me, onOnboarding, onPortal, router]);

  useEffect(() => {
    if (!currentPersonId) {
      setOpenAlerts(0);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const data = await api.get<{ open: unknown[] }>(`/api/v1/persons/${currentPersonId}/alerts`);
        if (alive) setOpenAlerts(data.open?.length ?? 0);
      } catch {
        if (alive) setOpenAlerts(0);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentPersonId, pathname]);

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-night">
        <div className="flex flex-col items-center gap-4 text-muted">
          <Wordmark size="lg" />
          <Spinner size={24} />
          <p className="text-[13px]">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!me) return <SignIn />;

  if (bare) {
    return (
      <>
        {children}
        <Toasts toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/history") return pathname === "/history" || pathname === "/timeline";
    return pathname.startsWith(href);
  };

  return (
    <div className={`min-h-dvh bg-night ${nightMode ? "dark" : ""}`}>
      {/* ---------------------------------------------------------- desktop rail */}
      <aside className="fixed left-0 top-0 hidden h-full w-[240px] flex-col justify-between border-r border-hairline/80 bg-[#0b1014] px-4 py-6 backdrop-blur md:flex z-40">
        <div className="space-y-6">
          <Link href="/" className="flex items-center px-2">
            <Wordmark size="md" />
          </Link>

          <nav className="flex flex-col gap-1.5">
            {NAV.map((n) => {
              const active = isActive(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`group relative flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition-all ${
                    active
                      ? "bg-[#142325] text-cream shadow-sm"
                      : "text-muted hover:bg-[#10191e] hover:text-cream"
                  }`}
                >
                  {active ? (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-mint shadow-[0_0_8px_rgba(110,224,207,0.8)]" />
                  ) : null}
                  <span className={`transition-colors ${active ? "text-mint" : "text-muted group-hover:text-cream"}`}>
                    <Icon name={n.icon} />
                  </span>
                  <span>{n.label}</span>
                  {n.href === "/alerts" && openAlerts > 0 ? (
                    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-alertred px-1 text-[10.5px] font-bold text-white">
                      {openAlerts}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 pt-4 border-t border-hairline/60">
          <button
            type="button"
            onClick={() => setNightMode(!nightMode)}
            className="flex w-full items-center justify-between rounded-xl border border-hairline bg-night2/80 px-3.5 py-2 text-[12.5px] font-medium text-cream hover:border-mint/30 transition-all"
          >
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
              <span>Night</span>
            </span>
            <span className="rounded bg-night3/80 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">
              MODE
            </span>
          </button>

          <div className="flex items-center justify-between px-1">
            <StatusRow online={online} pending={pending} />
            <button
              type="button"
              onClick={async () => {
                await api.post("/api/v1/auth/logout").catch(() => {});
                await refresh();
              }}
              className="text-[11.5px] font-semibold text-muted hover:text-cream transition"
            >
              {t("profile.sign_out")}
            </button>
          </div>

          <div className="px-1 text-[11px] leading-relaxed text-muted/80">
            <p>Docmate is a companion, not a doctor.</p>
            <p className="mt-0.5">Urgent symptoms need real medical care.</p>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------- content */}
      <div className="md:pl-[240px]">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 border-b border-hairline bg-night/90 backdrop-blur md:hidden">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/">
              <Wordmark size="sm" />
            </Link>
            <div className="flex items-center gap-2">
              {!online ? <span className="chip tone-terracotta">Offline</span> : null}
              {pending > 0 ? <span className="chip tone-mint">{pending} queued</span> : null}
              <Link
                href="/alerts"
                className="relative grid h-8 w-8 place-items-center rounded-full border border-hairline bg-night2 text-muted"
                aria-label="Alerts"
              >
                <Icon name="bell" size={16} />
                {openAlerts > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-alertred text-[9px] font-bold text-white">
                    {openAlerts}
                  </span>
                ) : null}
              </Link>
              <LanguagePicker compact />
            </div>
          </div>
        </header>

        {/* Main Content Area - wide layout fixing previous squished alignment */}
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 pb-32 md:pb-16">
          {children}
        </main>
      </div>

      {/* ------------------------------------------------------ mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-night2/95 backdrop-blur md:hidden">
        <div className="safe-bottom mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-1.5">
          {TABS.slice(0, 2).map((n) => (
            <TabButton key={n.href} n={n} active={isActive(n.href)} label={n.label} />
          ))}
          <div className="flex justify-center pb-1">
            <Link
              href="/record"
              aria-label="Record"
              className="grid h-13 w-13 -translate-y-2 place-items-center rounded-full text-night shadow-[0_8px_20px_-6px_rgba(110,224,207,0.8)]"
              style={{
                background: "radial-gradient(circle at 32% 28%, #9FF0E3, #6EE0CF 48%, #3F8C82 100%)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#06211E" strokeWidth="2.2" strokeLinecap="round">
                <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" />
              </svg>
            </Link>
          </div>
          {TABS.slice(2).map((n) => (
            <TabButton key={n.href} n={n} active={isActive(n.href)} label={n.label} />
          ))}
        </div>
      </nav>

      <Toasts toasts={toasts} onDismiss={dismiss} />
      <SosOverlay />
    </div>
  );
}

function TabButton({ n, active, label }: { n: { href: string; icon: IconName }; active: boolean; label: string }) {
  return (
    <Link
      href={n.href}
      className={`flex flex-col items-center gap-1 rounded-xl px-1 pb-2 pt-1 text-[11px] font-medium transition ${
        active ? "text-mint font-semibold" : "text-muted"
      }`}
    >
      <Icon name={n.icon} size={20} />
      {label}
    </Link>
  );
}

function StatusRow({ online, pending }: { online: boolean; pending: number }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px] font-semibold text-muted">
      <span className={`h-2 w-2 rounded-full ${online ? "bg-mint shadow-[0_0_6px_rgba(110,224,207,0.8)]" : "bg-terracotta"}`} />
      <span>{online ? "Online" : "Offline"}</span>
      {pending > 0 ? <span className="ml-1 text-mint">({pending})</span> : null}
    </div>
  );
}
