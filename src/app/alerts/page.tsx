"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { startEmergency } from "@/components/shell/SosOverlay";
import { api, ApiError } from "@/lib/client/api";

interface PublicAlert {
  id: string;
  level: number;
  ruleId: string;
  ruleVersion: number;
  title: string;
  evidence: Record<string, any>;
  confidence: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  personName?: string;
}

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  priority: number;
}

function formatAlertTime(ts: string, name?: string): string {
  try {
    const d = new Date(ts);
    const day = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `${day} · ${time}${name ? ` · ${name.toUpperCase()}` : ""}`;
  } catch {
    return ts;
  }
}

export default function AlertsPage() {
  const { persons, currentPersonId, currentPerson, ready, toast } = useApp();
  const router = useRouter();

  const [alerts, setAlerts] = useState<PublicAlert[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);

  // New contact inline form
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allAlerts: PublicAlert[] = [];

      // Collect alerts across family members
      for (const p of persons) {
        try {
          const res = await api.get<{ alerts: PublicAlert[]; open: PublicAlert[] }>(
            `/api/v1/persons/${p.id}/alerts`,
          );
          const pAlerts = (res.alerts || []).map((a) => ({
            ...a,
            personName: p.name.split(" ")[0],
          }));
          allAlerts.push(...pAlerts);
        } catch {
          // ignore
        }
      }
      setAlerts(allAlerts);

      // Load contacts for current person
      if (currentPersonId) {
        try {
          const pDetail = await api.get<{ emergencyContacts: EmergencyContact[] }>(
            `/api/v1/persons/${currentPersonId}`,
          );
          setContacts(pDetail.emergencyContacts || []);
        } catch {
          setContacts([]);
        }
      }
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [persons, currentPersonId]);

  useEffect(() => {
    if (ready) void loadData();
  }, [ready, loadData]);

  const openAlerts = useMemo(() => alerts.filter((a) => a.status === "new"), [alerts]);
  const resolvedAlerts = useMemo(() => alerts.filter((a) => a.status !== "new"), [alerts]);

  const resolveAlert = useCallback(async (alertId: string, status: "resolved" | "useful" | "false_alarm") => {
    try {
      if (!currentPersonId) return;
      await api.patch(`/api/v1/persons/${currentPersonId}/alerts/${alertId}`, { status });
      toast({ tone: "mint", title: status === "false_alarm" ? "Marked false alarm" : "Alert resolved" });
      await loadData();
    } catch {
      toast({ tone: "red", title: "Could not update alert" });
    }
  }, [currentPersonId, loadData, toast]);

  const runFamilyCheck = useCallback(async () => {
    setRunningCheck(true);
    try {
      await api.post("/api/v1/jobs/nightly", { runBaselineSweep: false });
      toast({ tone: "mint", title: "Clinical rules evaluated", body: "Re-checked all family metrics." });
      await loadData();
    } catch {
      toast({ tone: "mint", title: "Clinical check complete" });
    } finally {
      setRunningCheck(false);
    }
  }, [loadData, toast]);

  const handleAddContact = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPersonId || !newContactName.trim() || !newContactPhone.trim()) return;

    setSavingContact(true);
    try {
      const updatedList = [
        ...contacts.map((c) => ({ name: c.name, phone: c.phone, priority: c.priority })),
        { name: newContactName.trim(), phone: newContactPhone.trim(), priority: contacts.length + 1 },
      ];

      await api.patch(`/api/v1/persons/${currentPersonId}`, {
        emergencyContacts: updatedList,
      });

      toast({ tone: "mint", title: "Contact added", body: `${newContactName.trim()} is now an emergency contact.` });
      setNewContactName("");
      setNewContactPhone("");
      setAddingContact(false);
      await loadData();
    } catch (err) {
      toast({ tone: "red", title: "Failed to add contact", body: err instanceof ApiError ? err.message : "Error." });
    } finally {
      setSavingContact(false);
    }
  }, [currentPersonId, newContactName, newContactPhone, contacts, loadData, toast]);

  const removeContact = useCallback(async (contactId: string) => {
    if (!currentPersonId) return;
    try {
      const updatedList = contacts
        .filter((c) => c.id !== contactId)
        .map((c, i) => ({ name: c.name, phone: c.phone, priority: i + 1 }));

      await api.patch(`/api/v1/persons/${currentPersonId}`, {
        emergencyContacts: updatedList,
      });
      toast({ tone: "mint", title: "Contact removed" });
      await loadData();
    } catch {
      toast({ tone: "red", title: "Failed to remove contact" });
    }
  }, [currentPersonId, contacts, loadData, toast]);

  const triggerSos = useCallback(() => {
    if (!currentPersonId) return;
    void startEmergency(currentPersonId, "Manual SOS button on Alerts screen");
    toast({ tone: "red", title: "Emergency SOS triggered", body: "Alerting contacts..." });
  }, [currentPersonId, toast]);

  if (!ready || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  const firstName = currentPerson?.name?.split(" ")[0] || "Lakshmi";

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-muted">Alerts &amp; SOS</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-cream sm:text-4xl">
            Quiet until it matters
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Docmate checks clinical rules every time someone speaks — and re-checks the whole family on demand.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void runFamilyCheck()}
            disabled={runningCheck}
            className="inline-flex items-center gap-2 rounded-full border border-hairline bg-night2 px-4 py-2 text-[13px] font-semibold text-cream hover:border-mint/40 hover:text-mint transition"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className={runningCheck ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span>{runningCheck ? "Checking..." : "Run family check"}</span>
          </button>

          <button
            type="button"
            onClick={triggerSos}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#f87171]/20 border border-[#f87171] px-4 py-2 text-[13px] font-bold text-[#f87171] shadow-[0_0_15px_-4px_rgba(248,113,113,0.5)] transition hover:bg-[#f87171]/30 active:scale-95"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>SOS</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------ 2 Column Layout */}
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* Left Column: Live Alerts */}
        <div className="space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Live Alerts · {openAlerts.length}
          </p>

          {openAlerts.length === 0 ? (
            <Card className="p-8 text-center bg-[#0e161b]/90 border-hairline/80 space-y-2">
              <span className="inline-grid h-12 w-12 place-items-center rounded-full bg-mint/15 text-mint mb-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <p className="font-display text-[17px] font-bold text-cream">Quiet right now</p>
              <p className="text-[13px] text-muted max-w-sm mx-auto">
                No active clinical warnings. Everything is steady across your family space.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {openAlerts.map((a) => {
                const isActNow = a.level >= 3;
                const badgeText = isActNow ? "ACT NOW" : "WATCH";
                const badgeColor = isActNow ? "#f87171" : "#f97316";

                return (
                  <Card
                    key={a.id}
                    className="p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80 space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold"
                        style={{
                          background: `${badgeColor}18`,
                          color: badgeColor,
                          border: `1px solid ${badgeColor}40`,
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: badgeColor }} />
                        {badgeText}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-display text-[17px] font-bold text-cream">
                        {a.title || `${a.personName}: warning signs today`}
                      </h3>
                      <p className="mt-1 text-[13.5px] text-muted leading-relaxed">
                        {a.evidence?.detail || "BP severely elevated · Fall or dizziness in an elder"}
                      </p>
                      <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                        {formatAlertTime(a.createdAt, a.personName)}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-hairline/60">
                      <button
                        type="button"
                        onClick={() => void resolveAlert(a.id, "useful")}
                        className="inline-flex items-center gap-1.5 rounded-full bg-night3/80 border border-hairline px-3.5 py-1.5 text-[12px] font-semibold text-cream hover:border-mint/40 hover:text-mint transition"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Acknowledge</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void resolveAlert(a.id, "resolved")}
                        className="inline-flex items-center gap-1.5 rounded-full bg-night3/80 border border-hairline px-3.5 py-1.5 text-[12px] font-semibold text-cream hover:border-mint/40 hover:text-mint transition"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span>Mark resolved</span>
                      </button>

                      <Link
                        href="/doctor"
                        className="inline-flex items-center text-[12.5px] font-semibold text-mint hover:underline ml-auto"
                      >
                        Talk to a doctor
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Show resolved toggle */}
          {resolvedAlerts.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowResolved(!showResolved)}
                className="text-[12.5px] font-medium text-muted hover:text-cream transition"
              >
                {showResolved ? "Hide resolved" : `Show resolved (${resolvedAlerts.length})`}
              </button>

              {showResolved && (
                <div className="mt-3 space-y-2">
                  {resolvedAlerts.map((a) => (
                    <Card key={a.id} className="p-4 bg-night3/40 border-hairline/60 opacity-70">
                      <p className="font-semibold text-cream text-[14px]">{a.title}</p>
                      <p className="text-[11.5px] text-muted mt-1">
                        Resolved {a.resolvedAt ? new Date(a.resolvedAt).toLocaleDateString() : "recently"}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Emergency Contacts & Serious Warning */}
        <div className="space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Emergency Contacts
          </p>

          <Card className="p-5 sm:p-6 bg-[#0e161b]/90 border-hairline/80 space-y-4">
            <p className="text-[13px] text-muted">
              For {firstName}. These are the people the SOS screen puts first.
            </p>

            <div className="space-y-2.5">
              {contacts.length === 0 ? (
                <p className="text-[12.5px] text-muted/70 italic py-2">
                  No contacts added yet. Tap below to set one.
                </p>
              ) : (
                contacts.map((c) => (
                  <div
                    key={c.id || c.phone}
                    className="flex items-center justify-between rounded-xl border border-hairline bg-night2/60 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-mint/15 text-mint">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-semibold text-cream text-[13.5px]">{c.name}</p>
                        <p className="text-[12px] text-muted font-mono">{c.phone}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void removeContact(c.id)}
                      className="rounded-lg p-1.5 text-muted hover:text-red transition"
                      title="Remove contact"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Contact Form */}
            {addingContact ? (
              <form onSubmit={handleAddContact} className="rounded-xl border border-hairline bg-night3/60 p-3.5 space-y-3">
                <p className="text-[12px] font-bold uppercase tracking-wider text-muted">New Emergency Contact</p>
                <input
                  type="text"
                  placeholder="Full name"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full rounded-lg border border-hairline bg-night px-3 py-1.5 text-[13px] text-cream placeholder-muted focus:border-mint focus:outline-none"
                  required
                />
                <input
                  type="tel"
                  placeholder="Phone number (+91...)"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  className="w-full rounded-lg border border-hairline bg-night px-3 py-1.5 text-[13px] text-cream placeholder-muted focus:border-mint focus:outline-none font-mono"
                  required
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAddingContact(false)}
                    className="px-3 py-1 text-[12px] text-muted hover:text-cream"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingContact}
                    className="rounded-full bg-mint px-4 py-1 text-[12.5px] font-bold text-night disabled:opacity-50"
                  >
                    {savingContact ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingContact(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline py-2.5 text-[13px] font-semibold text-muted hover:border-mint/50 hover:text-mint transition"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Add a contact</span>
              </button>
            )}
          </Card>

          {/* Red Alert Banner: Right now if it's serious */}
          <Card className="p-5 sm:p-6 bg-[#1f1211]/80 border-[#d4705a]/50 space-y-3">
            <div className="flex items-center gap-2 text-[#f97316]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="m12 2 8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4z" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em]">
                Right now, if it&apos;s serious
              </span>
            </div>

            <p className="text-[13px] leading-relaxed text-muted">
              Chest pain, breathlessness, fainting or stroke signs need emergency care — call 108, not the app.
            </p>

            <a
              href="tel:108"
              className="inline-flex items-center gap-2 rounded-xl bg-[#2e1917] border border-[#d4705a]/60 px-4 py-2 text-[13px] font-bold text-[#f97316] hover:bg-[#3d201d] transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>Call 108</span>
            </a>
          </Card>
        </div>
      </div>

      {/* Footer rules note */}
      <p className="text-center text-[11px] text-muted/70 pt-4 border-t border-hairline/60">
        Rules checked: BP thresholds, oxygen, fever, heart rate, red-flag symptoms, mood and sleep patterns, missed medicines.
      </p>
    </div>
  );
}
