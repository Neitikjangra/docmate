-- Docmate v1 — SQLite schema (mirrors PRD 13.2)
-- Every health-bearing table carries person_id. The service layer refuses to
-- build a query without a person scope (PRD 13.1).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id                TEXT PRIMARY KEY,
  phone             TEXT NOT NULL UNIQUE,
  language          TEXT NOT NULL DEFAULT 'en',
  consent_version   TEXT,
  consent_at        TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  is_doctor         INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS persons (
  id                      TEXT PRIMARY KEY,
  account_id              TEXT NOT NULL,
  claimed_by_account_id   TEXT,
  name                    TEXT NOT NULL,
  dob                     TEXT,
  sex_at_birth            TEXT,
  height_cm               REAL,
  weight_kg               REAL,
  work_status             TEXT,
  work_hours              TEXT,
  exercise_level          TEXT,
  sleep_band              TEXT,
  diet                    TEXT,
  tobacco                 TEXT,
  alcohol                 TEXT,
  relation_to_owner       TEXT,
  is_managed              INTEGER NOT NULL DEFAULT 0,
  preferred_voice         TEXT,
  checkin_time            TEXT NOT NULL DEFAULT '21:00',
  retention_days          INTEGER NOT NULL DEFAULT 90,
  completeness            INTEGER NOT NULL DEFAULT 0,
  onboarded               INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_persons_account ON persons(account_id);

CREATE TABLE IF NOT EXISTS conditions (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'confirmed',
  source     TEXT NOT NULL DEFAULT 'user',
  since      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conditions_person ON conditions(person_id);

CREATE TABLE IF NOT EXISTS medicines (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL,
  name          TEXT NOT NULL,
  dosage_text   TEXT,
  schedule_json TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_medicines_person ON medicines(person_id);

CREATE TABLE IF NOT EXISTS allergies (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_allergies_person ON allergies(person_id);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  priority    INTEGER NOT NULL DEFAULT 1,
  verified_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ec_person ON emergency_contacts(person_id);

CREATE TABLE IF NOT EXISTS recordings (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL,
  kind          TEXT NOT NULL,
  storage_ref   TEXT,
  duration_s    REAL NOT NULL DEFAULT 0,
  language      TEXT,
  quality_flag  TEXT,
  snr_db        REAL,
  expires_at    TEXT,
  deleted_at    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recordings_person ON recordings(person_id);

CREATE TABLE IF NOT EXISTS transcripts (
  id             TEXT PRIMARY KEY,
  recording_id   TEXT NOT NULL,
  person_id      TEXT NOT NULL,
  text           TEXT NOT NULL,
  language        TEXT,
  confidence     REAL,
  edited_by_user INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcripts_person ON transcripts(person_id);

CREATE TABLE IF NOT EXISTS acoustic_features (
  id             TEXT PRIMARY KEY,
  recording_id   TEXT,
  person_id      TEXT NOT NULL,
  features_json  TEXT NOT NULL,
  distress_0_100 REAL NOT NULL,
  confidence     REAL NOT NULL,
  model_version  TEXT NOT NULL,
  calibrating    INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_acoustic_person ON acoustic_features(person_id);

CREATE TABLE IF NOT EXISTS journal_entries (
  id               TEXT PRIMARY KEY,
  person_id        TEXT NOT NULL,
  date             TEXT NOT NULL,
  recording_id     TEXT,
  mood             REAL,
  energy           REAL,
  sleep_hours      REAL,
  sleep_quality    TEXT,
  stress           REAL,
  activity_minutes REAL,
  activity_type    TEXT,
  food_tags        TEXT,
  hydration        TEXT,
  summary_json     TEXT,
  edit_source      TEXT NOT NULL DEFAULT 'extraction',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_person_date ON journal_entries(person_id, date);

CREATE TABLE IF NOT EXISTS symptoms (
  id             TEXT PRIMARY KEY,
  person_id      TEXT NOT NULL,
  recording_id   TEXT,
  symptom        TEXT NOT NULL,
  body_part      TEXT,
  onset          TEXT,
  duration       TEXT,
  severity_words TEXT,
  red_flag       INTEGER NOT NULL DEFAULT 0,
  ts             TEXT NOT NULL,
  resolved_at    TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_symptoms_person ON symptoms(person_id, ts);

CREATE TABLE IF NOT EXISTS vitals (
  id           TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL,
  ts           TEXT NOT NULL,
  type         TEXT NOT NULL,
  value_json   TEXT NOT NULL,
  unit         TEXT,
  source       TEXT NOT NULL DEFAULT 'typed',
  confirmed    INTEGER NOT NULL DEFAULT 1,
  held         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vitals_person ON vitals(person_id, ts);

CREATE TABLE IF NOT EXISTS medicine_events (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL,
  medicine_id TEXT,
  name        TEXT,
  ts          TEXT NOT NULL,
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mevents_person ON medicine_events(person_id, ts);

CREATE TABLE IF NOT EXISTS reports (
  id                    TEXT PRIMARY KEY,
  person_id             TEXT NOT NULL,
  file_ref              TEXT,
  file_name             TEXT,
  kind                  TEXT NOT NULL DEFAULT 'lab',
  extracted_values_json TEXT,
  report_date           TEXT,
  confirmed             INTEGER NOT NULL DEFAULT 0,
  source                TEXT NOT NULL DEFAULT 'upload',
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_person ON reports(person_id);

CREATE TABLE IF NOT EXISTS cycle_entries (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL,
  date          TEXT NOT NULL,
  phase         TEXT,
  symptoms_json TEXT,
  created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cycle_person_date ON cycle_entries(person_id, date);

CREATE TABLE IF NOT EXISTS daily_features (
  person_id        TEXT NOT NULL,
  date             TEXT NOT NULL,
  sleep_hours      REAL,
  mood             REAL,
  energy           REAL,
  stress           REAL,
  activity_minutes REAL,
  adherence        REAL,
  symptom_count    INTEGER,
  vitals_json      TEXT,
  distress         REAL,
  features_json    TEXT,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (person_id, date)
);

CREATE TABLE IF NOT EXISTS baselines (
  person_id  TEXT NOT NULL,
  signal     TEXT NOT NULL,
  median     REAL,
  spread     REAL,
  n          INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (person_id, signal)
);

CREATE TABLE IF NOT EXISTS health_scores (
  id              TEXT PRIMARY KEY,
  person_id       TEXT NOT NULL,
  date            TEXT NOT NULL,
  score           REAL NOT NULL,
  raw_score       REAL NOT NULL,
  components_json TEXT NOT NULL,
  penalty         REAL NOT NULL DEFAULT 0,
  rule_version    TEXT,
  created_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_score_person_date ON health_scores(person_id, date);

CREATE TABLE IF NOT EXISTS rules (
  id              TEXT PRIMARY KEY,
  version         TEXT NOT NULL,
  title           TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  level           INTEGER NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  reviewed_by     TEXT,
  reviewed_at     TEXT,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL,
  rule_id       TEXT NOT NULL,
  rule_version  TEXT NOT NULL,
  level         INTEGER NOT NULL,
  title         TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  confidence    TEXT NOT NULL DEFAULT 'medium',
  status        TEXT NOT NULL DEFAULT 'new',
  dedupe_key    TEXT,
  created_at    TEXT NOT NULL,
  resolved_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_person ON alerts(person_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id                  TEXT PRIMARY KEY,
  alert_id            TEXT,
  person_id           TEXT NOT NULL,
  recipient_account_id TEXT,
  recipient_label     TEXT,
  channel             TEXT NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  meta_json           TEXT,
  sent_at             TEXT,
  suppressed_reason   TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_person ON notifications(person_id, created_at);

CREATE TABLE IF NOT EXISTS notification_settings (
  person_id          TEXT PRIMARY KEY,
  level3_enabled     INTEGER NOT NULL DEFAULT 1,
  level4_enabled     INTEGER NOT NULL DEFAULT 1,
  detailed_preview   INTEGER NOT NULL DEFAULT 0,
  quiet_start        TEXT NOT NULL DEFAULT '22:00',
  quiet_end          TEXT NOT NULL DEFAULT '07:00',
  daily_reminder     INTEGER NOT NULL DEFAULT 1,
  reminder_time      TEXT NOT NULL DEFAULT '21:00'
);

CREATE TABLE IF NOT EXISTS sos_events (
  id                    TEXT PRIMARY KEY,
  person_id             TEXT NOT NULL,
  trigger               TEXT NOT NULL,
  reason                TEXT,
  started_at            TEXT NOT NULL,
  cancelled_at          TEXT,
  contacts_notified_json TEXT,
  location_json         TEXT,
  outcome               TEXT,
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sos_person ON sos_events(person_id, started_at);

CREATE TABLE IF NOT EXISTS predictions (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL,
  kind          TEXT NOT NULL,
  horizon_days  INTEGER,
  value_json    TEXT NOT NULL,
  confidence    TEXT NOT NULL,
  data_days     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predictions_person ON predictions(person_id);

CREATE TABLE IF NOT EXISTS memory_vectors (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id   TEXT,
  text        TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vectors_person ON memory_vectors(person_id);

CREATE TABLE IF NOT EXISTS graph_nodes (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL,
  type       TEXT NOT NULL,
  label      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_edges (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL,
  from_node  TEXT NOT NULL,
  to_node    TEXT NOT NULL,
  relation   TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS families (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  admin_account_id   TEXT NOT NULL,
  code_hash          TEXT NOT NULL,
  code_expires_at    TEXT,
  auto_approve_until TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS family_members (
  id         TEXT PRIMARY KEY,
  family_id  TEXT NOT NULL,
  person_id  TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',
  status     TEXT NOT NULL DEFAULT 'pending',
  relation   TEXT,
  joined_at  TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fm_family ON family_members(family_id);

CREATE TABLE IF NOT EXISTS sharing_grants (
  id                TEXT PRIMARY KEY,
  subject_person_id TEXT NOT NULL,
  viewer_account_id TEXT,
  family_id         TEXT,
  category          TEXT NOT NULL,
  granted           INTEGER NOT NULL DEFAULT 1,
  expires_at        TEXT,
  revoked_at        TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grants_subject ON sharing_grants(subject_person_id);
CREATE INDEX IF NOT EXISTS idx_grants_viewer ON sharing_grants(viewer_account_id);

CREATE TABLE IF NOT EXISTS access_audit (
  id                TEXT PRIMARY KEY,
  viewer_account_id TEXT NOT NULL,
  subject_person_id TEXT NOT NULL,
  category          TEXT NOT NULL,
  source            TEXT NOT NULL,
  ts                TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON access_audit(subject_person_id, ts);

CREATE TABLE IF NOT EXISTS doctors (
  id            TEXT PRIMARY KEY,
  account_id    TEXT,
  name          TEXT NOT NULL,
  registration_no TEXT NOT NULL,
  council       TEXT,
  specialty     TEXT NOT NULL,
  languages     TEXT NOT NULL,
  availability  TEXT,
  verified_at   TEXT,
  code          TEXT NOT NULL UNIQUE,
  phone         TEXT,
  fee_inr       INTEGER NOT NULL DEFAULT 500,
  rating        REAL NOT NULL DEFAULT 4.7,
  experience_years INTEGER NOT NULL DEFAULT 8,
  bio           TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doctor_links (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL,
  doctor_id  TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT,
  revoked_at TEXT,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dlinks_person ON doctor_links(person_id);

CREATE TABLE IF NOT EXISTS consultations (
  id                TEXT PRIMARY KEY,
  person_id         TEXT NOT NULL,
  doctor_id         TEXT NOT NULL,
  doctor_link_id    TEXT,
  slot              TEXT NOT NULL,
  mode              TEXT NOT NULL DEFAULT 'video',
  status            TEXT NOT NULL DEFAULT 'booked',
  payment_ref       TEXT,
  amount_inr        INTEGER,
  notes_ref         TEXT,
  prescription_ref  TEXT,
  summary_json      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doctor_messages (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT,
  person_id       TEXT NOT NULL,
  doctor_id       TEXT NOT NULL,
  author          TEXT NOT NULL,
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dmsg_person ON doctor_messages(person_id);

CREATE TABLE IF NOT EXISTS consents (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  person_id  TEXT,
  kind       TEXT NOT NULL,
  version    TEXT NOT NULL,
  language   TEXT,
  granted_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  push_token TEXT,
  platform   TEXT,
  last_seen  TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  person_id    TEXT,
  kind         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',
  payload_json TEXT,
  result_json  TEXT,
  created_at   TEXT NOT NULL,
  finished_at  TEXT
);

CREATE TABLE IF NOT EXISTS outbox (
  id           TEXT PRIMARY KEY,
  channel      TEXT NOT NULL,
  to_addr      TEXT,
  to_label     TEXT,
  subject      TEXT,
  body         TEXT NOT NULL,
  meta_json    TEXT,
  status       TEXT NOT NULL DEFAULT 'delivered',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_channel ON outbox(channel, created_at);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,
  phone       TEXT NOT NULL,
  code        TEXT NOT NULL,
  purpose     TEXT NOT NULL DEFAULT 'login',
  attempts    INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  expires_at  TEXT NOT NULL,
  consumed    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, created_at);

CREATE TABLE IF NOT EXISTS onboarding_state (
  account_id TEXT PRIMARY KEY,
  step       INTEGER NOT NULL DEFAULT 0,
  data_json  TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insights (
  id         TEXT PRIMARY KEY,
  person_id  TEXT,
  family_id  TEXT,
  kind       TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id         TEXT PRIMARY KEY,
  account_id TEXT,
  name       TEXT NOT NULL,
  screen     TEXT,
  language   TEXT,
  app_version TEXT,
  meta_json  TEXT,
  ts         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
