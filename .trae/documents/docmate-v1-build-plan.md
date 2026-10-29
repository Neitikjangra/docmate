# Docmate v1 — Complete Product Build Plan

## 1. Summary

Build **Docmate v1**, a voice-first health guardian for Indian families, as a **production-grade, fully working product** — not a mock. Every feature in the PRD is implemented end-to-end with real logic: real phone-OTP auth, real per-person data isolation, real deterministic rule engine, real health scoring, real multilingual voice capture and analysis in the browser, real alerts with cap/quiet-hours/dedupe, real family sharing grants, real doctor consent + summary PDF, and a real SOS state machine.

Third-party services that need paid API keys (SMS, Indic ASR cloud API, LLM, TTS cloud, payment gateway, ambulance dispatch) are implemented behind a **swappable adapter layer** with working **simulated drivers** that surface in a visible **Simulation Console**. No feature is stubbed to fake behaviour: the logic, data, state machine and UI are real; only the external wire is simulated.

**Definition of done:** `npm run dev` → open `http://localhost:3000` → complete the entire demo script (section 15) with zero console errors, and `npm test` passes (scoring golden tests, rule-engine tests, isolation tests).

---

## 2. Source documents

- PRD: `C:\Users\neiti\Downloads\StartUp --\Docmate v1 — Product Requirements Document (1).pdf` (41 pages, sections 1–17)
- Blueprint: `C:\Users\neiti\Downloads\StartUp --\Docmate — Product Design & System Blueprint.pdf` (11 pages)

Both were extracted and read in full (they are CID-encoded subset-font PDFs; a pure-Python extractor was used because the files exceed the Read tool's 64 KB limit).

---

## 3. Decisions locked (from user)

| Decision | Choice |
|---|---|
| Stack | Next.js 15 PWA + SQLite, one process, one command |
| Integrations | Real internal logic + simulated externals behind adapters, visible Simulation Console |
| First run | Rich seeded demo family (Self + Father + Mother, ~90 days of history) **and** full onboarding from scratch still works |

---

## 4. Current state

`c:\Users\neiti\Desktop\Docmate_product` is **empty**. This is a greenfield build.

Verified environment:

- Node **v22.16.0**, npm **10.9.2**, git **2.49.0**
- `npm` registry reachable (PONG 442 ms)
- Python 3.13.4 present (only used for the PDF extraction above; not part of the product)

---

## 5. Architecture

Single Next.js 15 app (App Router, TypeScript, Tailwind) that is both frontend and backend.

```
Browser (mobile-first PWA)
 ├─ Web Speech API          → real-time ASR: en-IN, hi-IN, bn-IN, ta-IN + Hinglish
 ├─ Web Audio API           → real acoustic features from the recorded buffer
 ├─ SpeechSynthesis API     → real spoken replies in the user's language
 ├─ Service Worker + IndexedDB → offline dashboard cache + offline recording queue
 └─ fetch /api/v1/*         → JSON API
        │
        ▼
Next.js Route Handlers (Node runtime)
 ├─ auth        OTP + signed HTTP-only session cookie
 ├─ scope       withPerson(personId, session) → resolves ownership OR sharing grant, else 403
 ├─ engine      rules · score · extract · verdict · predict · alerts · sos
 ├─ adapters    sms · push · call · payment · tts   (simulated drivers, swappable)
 └─ store       better-sqlite3, migrations, audit log
```

**No LLM decides anything.** Severity comes only from the versioned rule store. Extraction is a deterministic multilingual lexicon/grammar engine. Card text is chosen from templates and **structurally cannot** change severity, name a medicine, or give a dose — satisfying PRD 15.3 and 17.3.

### Data access rule (PRD 13.1, blueprint §8)

Every table that holds health data carries `person_id`. The service layer refuses to build a query without one. The API resolves `person_id → ownership or sharing_grant` **before** any module sees data. A dedicated isolation test suite (section 14) proves no cross-person and no cross-family read succeeds.

---

## 6. Data model (SQLite)

Implemented as `src/db/schema.sql`, one file, migrations applied on boot.

Tables mirror PRD 13.2: `accounts`, `persons`, `conditions`, `medicines`, `allergies`, `emergency_contacts`, `recordings`, `transcripts`, `acoustic_features`, `journal_entries`, `symptoms`, `vitals`, `medicine_events`, `reports`, `cycle_entries`, `daily_features`, `baselines`, `health_scores`, `rules`, `alerts`, `notifications`, `sos_events`, `predictions`, `memory_vectors`, `graph_nodes`, `graph_edges`, `families`, `family_members`, `sharing_grants`, `access_audit`, `doctors`, `doctor_links`, `consultations`, `consents`, `devices`, `jobs`, `outbox` (simulated externals).

DL15 data rules applied: transcripts/journal text/reports marked as sensitive columns; family codes stored only as `code_hash`; every alert and card stores `rule_id`, `rule_version`, `evidence_json`; audio rows carry `expires_at` + `deleted_at` and are purged by a nightly job.

---

## 7. Repository layout

```
c:\Users\neiti\Desktop\Docmate_product\
├─ package.json  next.config.ts  tsconfig.json  tailwind.config.ts  postcss.config.mjs
├─ .env.local                     (SESSION_SECRET etc., generated on first boot)
├─ README.md                      (run instructions + demo script)
├─ public/  manifest.webmanifest · sw.js · icons
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx  globals.css  page.tsx
│  │  ├─ onboarding/        6 steps + add-member + join-code
│  │  ├─ home/              dashboard
│  │  ├─ record/            mic overlay + result card
│  │  ├─ timeline/  alerts/  score/[personId]/  log/[id]/
│  │  ├─ family/            folder, code, members, privacy, access log
│  │  ├─ doctor/            directory, connect, consent, summary, consult
│  │  ├─ profile/           edit, retention, export, delete, consent history
│  │  ├─ doctor-portal/     doctor web view (phone OTP login)
│  │  ├─ console/           Simulation Console
│  │  └─ api/v1/…           route handlers (section 8)
│  ├─ components/           ScoreRing · Mic button · HeartbeatLine · ResultCard · KpiTile
│  │                        PersonSwitcher · SeverityBar · Card · Sheet · IosToggle …
│  ├─ lib/
│  │  ├─ db.ts  schema.sql  migrate.ts
│  │  ├─ session.ts  otp.ts  scope.ts  audit.ts
│  │  ├─ extract.ts          multilingual extraction engine
│  │  ├─ verdict.ts          severity → card (constrained writer)
│  │  ├─ score.ts            individual + family score
│  │  ├─ predictions.ts
│  │  ├─ rules/              engine.ts + rules.json (versioned store)
│  │  ├─ alerts.ts           notification policy
│  │  ├─ sos.ts              SOS state machine
│  │  ├─ adapters/           sms.ts push.ts call.ts payment.ts tts.ts + index.ts
│  │  ├─ seed.ts             90-day demo family
│  │  ├─ pdf.ts              one-page 30-day summary (pdf-lib)
│  │  └─ i18n/               index.ts + en.json hi.json bn.json ta.json
│  └─ tests/                 score · rules · extract · isolation
```

---

## 8. Feature implementation map

Each row: PRD section → what is built → where → acceptance check.

### 8.1 Foundation (PRD 16.1, 14, 13.1)
- Phone-OTP auth: `POST /api/v1/auth/otp/request|verify|refresh|logout`. 6-digit code, 5-minute TTL, resend after 30 s, **5 failed attempts locks the number for 15 minutes**. Code delivered through the Simulation Console (and written to the server log). Session = HMAC-signed HTTP-only cookie, 15-minute access token + rotating refresh, matching PRD 14.
- `withPerson()` scope guard used by every person-scoped route → `403 {code, message, requestId}` when no ownership or grant.
- Cursor pagination + consistent JSON error envelope with `requestId`.
- Audit log written on every cross-person read (family view, doctor view).

### 8.2 Onboarding & profile (PRD 4)
Six steps, one question group each, voice or tap, target < 90 s: **language → phone/OTP → consent → about you → lifestyle → health background**, then "add a family member" or "join with a code" → dashboard.
- Language switch applies instantly to UI, voice replies and greeting (hi/bn/ta/en).
- Consent screen stores `consent_version`, `consent_at`, `language` **before any health row is written**; one "I agree" button.
- Validation exactly per PRD 4.2: DOB required, age derived, minimum 13; under-18 creates a managed profile owned by an adult; height/weight optional with derived BMI; conditions as multi-chips incl. "Other (free text)"; medicines with optional schedule; allergies; **emergency contact strongly prompted**; preferred voice; daily check-in time (default 21:00).
- Resume-on-quit: every completed step is persisted server-side; reload continues at the last completed step.
- Completeness ring (informational, never blocking).
- Learning after onboarding: conditions/medicines proposed from conversation and from report uploads, each requiring explicit user confirmation.

### 8.3 Dashboard (PRD 5)
Top to bottom exactly as specified: person switcher circles (+), two score rings (person + family), one plain-language status line, swipeable KPI strip, large centre-bottom mic with animated heartbeat, "or type" link, bottom bar (Home, Family, Doctor, Profile) and timeline entry points.
- Switching person re-renders every tile from that person's data only.
- Empty state: dotted ring + "Starting", status "Tell me how you feel today."; < 3 days → "Still learning" tag; offline → cached data + "offline" tag.
- KPI tiles (only those with data, otherwise a "Log it" prompt); cycle KPI appears only for `sex_at_birth = Female`.

### 8.4 Voice engine (PRD 6)
- Capture: Web Audio, 16 kHz mono; VAD trims silence; max 120 s (symptom) / 180 s (journal); live partial transcript; live heartbeat waveform; mic permission denied → typing fallback with enable instructions.
- Pipeline: store audio (encrypted column, `storage_ref`) → ASR (Web Speech API) → acoustic features (F0 mean/variability, jitter, shimmer, HNR-proxy, speech rate, pause ratio, breath cadence, loudness variability, tremor) → distress 0–100 + confidence → intent classification (`symptom_check | daily_journal | vital_log | question | emergency`) → structured JSON extraction → rule engine → card → TTS → persist everything under one `log_id`.
- Acoustic scoring is conservative, per-person baseline after 7 logs (median/spread), labelled "calibrating" before that, and **can never trigger SOS alone**.
- Result card: verdict (≤12 words, "looks like"/"worth checking"), personal "why" line, guardrail line ("Checked against doctor-reviewed rules. Not a diagnosis."), up to 3 action buttons by severity; "Read this to me" and "Share with doctor" in the overflow menu; never scrolls on a phone.
- Intent handling incl. `vital_log` ("BP 140 by 90") and `question` (answered only inside safety rules, otherwise escalate to a doctor).
- Retention: 30 / 90 / keep-until-deleted (default 90), nightly purge job; owner-only audio playback; "Delete this recording" / "Delete all my audio".

### 8.5 Daily journal & predictions (PRD 7)
- One quiet reminder at the user's chosen time (never marketing); free speech 15–180 s; **max 2 short voice follow-ups** only for missing profile-critical facts; one-line confirmation card; missed days are never punished (no streaks, no guilt copy).
- Extraction of mood(1–5), energy(1–5), sleep hours + quality, symptoms, food/water, activity minutes, medicines taken/missed, stress(1–5), vitals mentioned, voice signals — each shown as **editable chips** on the day's timeline entry; corrections re-trigger the rule engine.
- Storage: transcript, extracted JSON, acoustic features, per-person vector (cosine recall over this person's past entries only), and one `daily_features` row per person per day.
- Predictions (PRD 7.4): vitals trend forecast (robust linear over 14–30 days with confidence band), symptom recurrence with triggers, mood/sleep slide vs own baseline, adherence risk, next-7-day risk flag. Every prediction shows its pattern, `data_days` and a low/medium/high confidence tag; `< 14 days` ⇒ low confidence and never used for an urgent alert.

### 8.6 Rule engine, alerts, SOS (PRD 8)
- Data-driven versioned rule **store** (JSON with `id`, `version`, `level`, `min_data`, `reviewed_by`, `reviewed_at`), never hard-coded thresholds.
- Rule types: threshold, streak, trend (significance-checked slope), frequency, co-occurrence, absence.
- Engines: **on-log** (fast rules after each log) + **nightly** per person (30–90-day window, baselines, all active rules).
- Entry-error gate: implausible readings (e.g. sugar 1800) are held for user confirmation and excluded from rules.
- Notification policy: L3/L4 may notify; **≤1 pattern notification per person per day** (L4 exempt); **quiet hours 22:00–07:00** (L3 waits until morning, L4 always sends); 72 h dedupe unless it worsens by a defined step; recipients per PRD 8.1; generic lock-screen text; per-person L3 on/off (L4 non-disableable when an emergency contact exists); every alert has **Useful / False alarm** buttons that tune per-person thresholds.
- SOS (L4): trigger = L4 rule, SOS button, or red flag + distress above threshold (85, configurable) — acoustic alone never triggers. Full-screen red takeover, 15-second countdown "Calling for help. Tap if you are okay.", cancel path logs "cancelled SOS" + one follow-up, else SMS + push + automated call to contacts with name/time/last location/reason, nearest hospital + 108 one-tap, keeps recording until stopped, post-event timeline summary offered to the doctor. Works with weak network: SMS fallback and the SOS screen opens without waiting for the server.

### 8.7 Family space (PRD 9)
- Folder: family name + family score ring, member cards (score, arrow, status word, last activity, red dot only for an active urgent alert), member read-only view limited to shared categories, family insights card (≤2 lines), "Invite member" + "Family code".
- Code: 8 characters from a no-look-alike alphabet, `code_expires_at` 7 days, regenerate/revoke, shareable link/QR; join → pick profile → admin approval (or 24 h auto-approve) → consent preview → link. **5 wrong attempts per hour per user**; ≤3 families per person; ≤12 members per family.
- Connected family graph: relation edges (parent of / spouse of / sibling of) + shared-context edges (same household, shared meals, shared triggers); family context used only for opted-in members; individual rules never depend on family data; hereditary chip and lowered screening thresholds only with the parent's category consent.
- Privacy MUSTs: per-category toggles (score, alerts, vitals, reports, family-insights participation); journal audio, journal text and cycle data are **not shareable with family**; "Pause sharing" 24 h / 7 days; "Who can see my data" screen; leave-anytime with immediate removal from all caches and insights; audit log visible to the profile owner; under-18 handling.

### 8.8 Doctor connect (PRD 10)
- Directory by specialty (General physician, Cardiologist, Diabetologist, Gynaecologist, Paediatrician, Psychiatrist), language, availability — **seeded dummy doctors as instructed by PRD 17.4**, each with a registration number, council and verification timestamp.
- Connect by doctor code/QR; "Talk to a doctor" on L2/L3 cards.
- Consent scope before sharing (score, vitals, journal summaries, reports, alerts) and duration (single visit / 30 days / until revoked); **audio never shared by default**, needs a separate explicit per-recording confirmation.
- Auto-generated one-page 30-day summary, rendered in-app and **exported as a real PDF** (`pdf-lib`), containing only the chosen categories, generated in well under 10 s.
- Tele-consult booking (audio/video slot) with simulated gateway payment (UPI-style reference, idempotency key), consultation notes and prescriptions stored in the person's reports; follow-up reminders added **only as the doctor wrote them** — Docmate never edits medicines or doses.
- Doctor web view at `/doctor-portal`: phone-OTP login, connected patients, consented summary, chat-style reply box, hard scope + expiry enforcement, every access audited to the patient.
- Regulatory copy on the Doctor tab: "Docmate is not an emergency service. In an emergency call 108."

### 8.9 Health score (PRD 11)
- `H = 100 · Σwᵢcᵢ / Σwᵢ − P`, clamped 0–100, renormalised over components that have data; fewer than 2 components with data ⇒ "Starting" (dotted ring), no number.
- Components/weights/windows exactly per PRD 11.1: Vitals 0.30 / 14 d · Sleep 0.20 / 7 d · Mood & voice 0.20 / 7 d · Activity 0.15 / 7 d · Medicine adherence 0.15 / 7 d.
- Penalty P: L2 = 3, L3 = 8, L4 = 20, capped at 25, over unresolved alerts in the last 7 days.
- Recompute after every log and nightly at 02:00 local; display smoothed with a 3-day EMA; L4 bypasses smoothing; per-day history + component breakdown stored.
- Words/colour: 80–100 Steady (mint) · 60–79 Okay, keep watching (light mint) · 40–59 Slipping (terracotta) · <40 Needs attention (strong terracotta). **Red is never used for a score.**
- Family score: `F = 0.7·mean(H_shared) + 0.3·min(H_shared)`; single sharer ⇒ F = that member's score, labelled "1 member"; family breakdown names who pulls it down most.
- Breakdown sheet shows component bars + the single biggest mover this week + "what may move your score next week"; **the breakdown always sums to the displayed score** (penalty and smoothing shown as separate lines).

### 8.10 Privacy, security, compliance (PRD 15)
- Consent history with version/timestamp/language; plain-language notice in all four languages; withdraw consent as easy as giving it; in-app rights: view, correct, export (JSON+PDF), delete, withdraw, nominate, grievance contact.
- Minors: managed profile + recorded parental consent.
- Isolation enforced twice (API scope + DB access helper); automated cross-person/cross-family read tests fail the build if any succeeds.
- No health content in logs; PII-scrubbed structured logs; rate limits on OTP and family-code attempts.
- Sensitive columns encrypted at rest; audio in a private store with 5-minute signed-URL semantics; retention + purge jobs honouring `expires_at`.
- Deletion: person delete removes all `person_id` rows, audio and vectors immediately (demo) with a 30-day SLA statement in the UI.

### 8.11 Localisation & accessibility (PRD 16.4, 2.4.1)
- **All** UI text, cards, notifications and audio replies externalised in `en/hi/bn/ta` JSON — adding a language needs no code change. Demo-critical strings are fully translated (not machine-placeholder) for onboarding, dashboard, mic, result card, severity words, actions, SOS and alerts.
- Indian conventions: dd/mm/yyyy, mmHg, mg/dL, kg, cm.
- Minimum tap target 56 px, contrast ≥ 4.5:1, font scaling to 200 %, spoken icon labels, audio auto-play (toggleable), colour never the only signal (text label + icon shape always accompany severity).

### 8.12 Simulation Console (`/console`) — the only "fake" surface
A real, inspected view of the adapter layer so nothing is hidden:
- **OTP inbox** (phone → code, TTL, attempt counter, lockout state)
- **SMS outbox** (SOS alerts, family invites) with payload and delivery time
- **Push outbox** (level, rule ID, generic-vs-detailed preview, suppressed reason: cap / quiet hours / dedupe / toggle off)
- **Voice-call log** (automated SOS call to first contact)
- **Payments** (consult bookings, UPI reference, idempotency key)
- **Job queue** (analysis jobs, nightly run trigger, audio purge)
- **Adapter status** (which driver is active per service; a key dropped into `.env.local` flips the driver to real with no code change)

---

## 9. Rule store contents (PRD 8.2, marked "starting points for clinical review")

| ID | Pattern | Min data | Level |
|---|---|---|---|
| BP-01 | Home BP ≥ 180/120 once **with** symptoms, or 3 readings in 7 days ≥ 160/100 for a hypertensive profile | 1–3 readings | 4 / 3 |
| SUG-01 | Fasting sugar rising on 3 consecutive readings and > 20 % above personal baseline | 3 readings | 3 |
| SUG-02 | Random sugar < 70 mg/dL with weakness, sweating or confusion mentioned | 1 reading + symptom | 4 |
| SYM-01 | Same symptom (chest discomfort, severe headache, persistent vomiting) logged ≥ 3 times in 7 days | 3 logs | 3 |
| SYM-02 | New red-flag symptom with high voice distress | 1 log | 4 |
| SLP-01 | Sleep < 5 h for ≥ 5 nights together with rising BP or mood drop | 5 days | 3 |
| MED-01 | Chronic-condition medicine missed ≥ 3 times in 7 days with rising vitals | 7 days | 3 |
| MIS-01 | No BP log for 10 days for a hypertensive profile who previously logged weekly | 10 days | 2 (in-app only) |
| MOOD-01 | Mood very low for 7 days with sleep and appetite drop and voice distress above baseline | 7 days | 3 |

Red-flag lexicon (recall ≥ 0.98 target): chest pain/discomfort, cannot breathe, breathlessness, fainting, severe bleeding, stroke signs (face droop, slurred speech, one-sided weakness). Launch languages + Hinglish variants.

---

## 10. Build phases

Each phase ends in a runnable app; verification is listed per phase.

1. **Scaffold & design system** — Next.js 15 + TS + Tailwind + PostCSS, app shell, dark night theme with the exact token palette, severity ladder, fonts (Space Grotesk / Manrope / JetBrains Mono loaded via `<link>` with system fallbacks so the build never depends on font download), Card/Sheet/Button/ScoreRing/HeartbeatLine components, PWA manifest + service worker shell. *Verify: app boots, `/` renders, tokens visible, Lighthouse-installable.*
2. **Data layer, auth, scope** — `schema.sql`, migrations, seed of rules + dummy doctors, OTP flow, sessions, `withPerson()` scope guard, audit log, error envelope, pagination helper. *Verify: OTP request/verify works from the Console; a person-scoped route returns 403 cross-account.*
3. **Onboarding & profile** — 6 steps, consent capture, managed profiles, age rules, completeness ring, resume, profile editing, emergency contacts, retention + delete/export controls. *Verify: fresh account reaches dashboard; consent row exists before any health row; quitting mid-way resumes.*
4. **Voice core** — mic overlay, real-time ASR, acoustic feature extraction, extraction engine, verdict + card writer, TTS reply, corrections, retention job. *Verify: speak → card in seconds with transcript, features, distress, JSON, rule ID and log ID all linked.*
5. **Journal, vitals, reports** — daily journal flow with ≤2 follow-ups and editable chips, typed/voice vitals, photo/PDF report upload with extracted values requiring confirmation, cycle entries. *Verify: PRD 7.2 fields extracted and editable; edits re-run the engine.*
6. **Score & dashboard** — score engine, EMA smoothing, breakdown sheet, KPI strip, status line, person switcher, empty/offline states, timeline. *Verify: golden score tests reproduce expected numbers exactly; breakdown sums to the displayed score.*
7. **Rules, alerts, SOS** — nightly + on-log engines, notification policy, alerts list with feedback, SOS state machine, alarm flow with countdown. *Verify: seeded patterns trigger the right rule/level/recipient; no notification for L1/L2; cap + quiet hours + dedupe proven with fake time; SOS countdown → contacts notified in Console → timeline summary.*
8. **Family space** — create/join/approve, grants, family graph, family score, folder, privacy controls, pause sharing, access log, leave. *Verify: revoking a category removes it from other members' screens within 5 s incl. caches; leaver leaves no residue.*
9. **Doctor connect** — directory, doctor code, consent scope, 30-day summary + real PDF, tele-consult + simulated payment, follow-up reminders, doctor portal with scope/expiry enforcement. *Verify: L3 card → booked consult with summary attached (≤3 taps); doctor sees nothing outside scope or after expiry.*
10. **Predictions, hardening, polish** — predictions surfaced on dashboard/breakdown/summary, isolation test suite, analytics events (no health content), localisation sweep, accessibility pass, README + demo script. *Verify: `npm test` green, `npm run build` green, full demo script runs offline-with-cache.*

---

## 11. Testing & verification

- `npm test` (vitest, no native deps):
  - `score.test.ts` — golden cases per component + penalty + EMA + family formula.
  - `rules.test.ts` — one case per launch rule, plus fake-clock tests for the daily cap, quiet hours and 72 h dedupe.
  - `extract.test.ts` — symptom/vital/mood/sleep/activity phrases in en, hi, bn, ta and Hinglish.
  - `isolation.test.ts` — cross-person and cross-family reads on every person-scoped route must return 403; family/doctor reads outside a grant must return 403; expired grants must return 403.
- `npm run build` must complete with no type errors.
- Manual: the 3-minute demo script (PRD/blueprint) run end-to-end with the browser console clean.

### Demo script used as the acceptance walkthrough
1. Open in Hindi, add "Father", complete onboarding in < 90 s.
2. Speak *"Pet me bahut tez aithan ho rahi hai"* → symptom card, Level 1/2, personal "why" line drawn from last week's log.
3. Switch to "Mother", say something similar → **different** card, because her history differs (proves memory + zero leakage).
4. Play the distressed + red-flag clip → screen turns red, 15 s countdown, contacts receive SMS in the Console.
5. Open Family → family score, member cards, insights; revoke a category → it disappears for the other member.
6. Level-3 alert → "Talk to a doctor" → booked consult with the 30-day PDF attached.
7. Close on the guardrail line, and the Simulation Console showing every external message that was emitted.

---

## 12. Assumptions & risks

- **Assumption:** `better-sqlite3` installs from a prebuilt binary on Node 22 / Windows x64. *Fallback if the native build fails:* switch `src/lib/db.ts` to `sql.js` (pure WASM) — same thin interface, no schema change.
- **Assumption:** the reviewer uses Chrome or Edge, where the Web Speech API exists. *Fallback:* typed entry and the transcript-correction path are first-class, so every flow works without ASR; a banner explains the browser requirement.
- **Risk:** ASR quality for bn/ta in-browser. Mitigation: the PRD's own rule — low-confidence transcripts are shown for correction and never silently guessed; the correction path is part of the demo.
- **Risk:** scope size. Mitigation: phases are independently runnable; Must-have flows (onboarding, mic, card, memory, SOS, family, doctor) are built first and are never left half-working.
- **Risk:** fonts/icons from CDN offline. Mitigation: `<link>` with system fallbacks; icons are inline SVG.

## 13. Out of scope (PRD 1.5)
Diagnosis, prescribing, doses, real ambulance dispatch, wearable/insurance/pharmacy/lab checkout integrations, and a full web admin portal beyond the doctor summary viewer.
