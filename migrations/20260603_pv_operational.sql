-- Pharmacovigilance operational tables — reconcile schema with the PV service.
--
-- pharmacovigilanceService.ts reads/writes UNPREFIXED tables (adverse_events,
-- icsrs, safety_signals, risk_management_plans, periodic_safety_reports) with
-- TEXT (UUID) ids, but the only PV tables created previously were pv_-prefixed
-- with SERIAL ids (migration 20260317). The service therefore always hit the
-- 42P01 fallback and silently degraded to in-memory — PV was wired but NOT
-- persistent. This migration creates the tables the service actually uses, so
-- PV becomes genuinely operational with NO service-logic change, and adds the
-- E2B(R3) / MedDRA / triage-workflow fields + a structured benefit-risk table.
--
-- Idempotent. FK-free (consistent with repo migration convention). JSONB-bearing
-- columns are TEXT because the service round-trips them via JSON.stringify/parse.

-- ── Cases / ICSR adverse events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS adverse_events (
  id                            TEXT PRIMARY KEY,
  organization_id               TEXT NOT NULL,
  project_id                    TEXT,
  event_type                    TEXT NOT NULL,
  patient_id                    TEXT,
  event_description             TEXT NOT NULL,
  onset_date                    TIMESTAMPTZ,
  report_date                   TIMESTAMPTZ,
  seriousness_criteria          TEXT,
  causality                     TEXT,
  outcome                       TEXT,
  reporter_type                 TEXT,
  country_of_occurrence         TEXT,
  regulatory_reporting_deadline TIMESTAMPTZ,
  reported_to_authorities       BOOLEAN DEFAULT FALSE,
  expedited_report_required     BOOLEAN DEFAULT FALSE,
  created_at                    TIMESTAMPTZ DEFAULT NOW()
);

-- E2B(R3) / MedDRA / triage-workflow fields (added idempotently so an existing
-- table is upgraded in place).
ALTER TABLE adverse_events
  ADD COLUMN IF NOT EXISTS reaction_pt              TEXT,
  ADD COLUMN IF NOT EXISTS reaction_pt_code         TEXT,
  ADD COLUMN IF NOT EXISTS reaction_soc             TEXT,
  ADD COLUMN IF NOT EXISTS reaction_soc_code        TEXT,
  ADD COLUMN IF NOT EXISTS suspect_product          TEXT,
  ADD COLUMN IF NOT EXISTS suspect_product_strength TEXT,
  ADD COLUMN IF NOT EXISTS suspect_product_route    TEXT,
  ADD COLUMN IF NOT EXISTS suspect_product_dose     TEXT,
  ADD COLUMN IF NOT EXISTS expectedness             TEXT,  -- expected | unexpected | unknown (vs RSI)
  ADD COLUMN IF NOT EXISTS rsi_reference            TEXT,
  ADD COLUMN IF NOT EXISTS reporter_name            TEXT,
  ADD COLUMN IF NOT EXISTS reporter_contact         TEXT,
  ADD COLUMN IF NOT EXISTS reporter_organization    TEXT,
  ADD COLUMN IF NOT EXISTS narrative                TEXT,
  ADD COLUMN IF NOT EXISTS case_status              TEXT DEFAULT 'draft',  -- draft | submitted_to_triage | triaged | closed
  ADD COLUMN IF NOT EXISTS created_by               TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by             TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at             TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ae_org ON adverse_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_ae_project ON adverse_events(project_id);
CREATE INDEX IF NOT EXISTS idx_ae_deadline ON adverse_events(regulatory_reporting_deadline)
  WHERE reported_to_authorities = FALSE;
CREATE INDEX IF NOT EXISTS idx_ae_case_status ON adverse_events(case_status);
CREATE INDEX IF NOT EXISTS idx_ae_reaction_pt ON adverse_events(reaction_pt_code);

-- ── ICSR (E2B(R3)) ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS icsrs (
  id                  TEXT PRIMARY KEY,
  adverse_event_id    TEXT,
  icsr_type           TEXT NOT NULL,
  sender_type         TEXT DEFAULT 'sponsor',
  receiver_type       TEXT DEFAULT 'regulatory_authority',
  transmission_date   TIMESTAMPTZ,
  e2b_version         TEXT DEFAULT 'R3',
  worldwide_unique_id TEXT,
  report_type         TEXT,
  seriousness         TEXT,
  organization_id     TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_icsr_org ON icsrs(organization_id);
CREATE INDEX IF NOT EXISTS idx_icsr_ae ON icsrs(adverse_event_id);

-- ── Periodic aggregate reports (PSUR/PBRER/DSUR/PADER) ────────────────────────
CREATE TABLE IF NOT EXISTS periodic_safety_reports (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id      TEXT,
  report_type     TEXT NOT NULL,
  period_start    TIMESTAMPTZ,
  period_end      TIMESTAMPTZ,
  status          TEXT DEFAULT 'draft',
  submitted_to    TEXT DEFAULT '[]',  -- JSON array (service round-trips via JSON.stringify/parse)
  due_date        TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
-- Aggregate-reporting scheduling fields (DLP = data lock point).
ALTER TABLE periodic_safety_reports
  ADD COLUMN IF NOT EXISTS data_lock_point TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frequency_months INTEGER;  -- recurrence (e.g. 6, 12)
CREATE INDEX IF NOT EXISTS idx_psr_org ON periodic_safety_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_psr_due ON periodic_safety_reports(due_date);

-- ── Safety signals ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_signals (
  id                     TEXT PRIMARY KEY,
  organization_id        TEXT NOT NULL,
  project_id             TEXT,
  signal_source          TEXT,
  description            TEXT NOT NULL,
  detected_at            TIMESTAMPTZ DEFAULT NOW(),
  evaluation_status      TEXT DEFAULT 'new',
  action                 TEXT,
  risk_benefit_assessment TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);
-- Disproportionality statistics (computed by the signal engine; nullable until run).
ALTER TABLE safety_signals
  ADD COLUMN IF NOT EXISTS prr  NUMERIC,
  ADD COLUMN IF NOT EXISTS ror  NUMERIC,
  ADD COLUMN IF NOT EXISTS eb05 NUMERIC,
  ADD COLUMN IF NOT EXISTS reaction_pt_code TEXT;  -- join key to adverse_events
CREATE INDEX IF NOT EXISTS idx_signal_org ON safety_signals(organization_id);

-- ── Risk management plans (GVP Module V) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_management_plans (
  id                           TEXT PRIMARY KEY,
  organization_id              TEXT NOT NULL,
  project_id                   TEXT,
  version                      TEXT DEFAULT '1.0',
  identified_risks             TEXT DEFAULT '[]',
  potential_risks              TEXT DEFAULT '[]',
  missing_information          TEXT DEFAULT '[]',
  pharmacovigilance_activities TEXT DEFAULT '{}',
  risk_minimization_measures   TEXT DEFAULT '{}',
  status                       TEXT DEFAULT 'draft',
  region                       TEXT,
  created_at                   TIMESTAMPTZ DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rmp_org ON risk_management_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_rmp_project ON risk_management_plans(project_id);

-- ── Structured benefit-risk assessments (PSUR §16 / PBRER) ────────────────────
CREATE TABLE IF NOT EXISTS pv_benefit_risk_assessments (
  id                 TEXT PRIMARY KEY,
  organization_id    TEXT NOT NULL,
  project_id         TEXT,
  periodic_report_id TEXT,              -- links to periodic_safety_reports.id
  benefit_summary    TEXT,
  risk_summary       TEXT,
  overall_conclusion TEXT,
  favourable         BOOLEAN,
  assessed_by        TEXT,
  assessed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_br_org ON pv_benefit_risk_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_br_report ON pv_benefit_risk_assessments(periodic_report_id);

-- MedDRA lookup performance (table created in 0006_regulatory_atoms.sql).
-- Guarded so the migration does not fail where the dictionary table is absent.
DO $$
BEGIN
  IF to_regclass('public.meddra_term_reference') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_meddra_pt_name ON meddra_term_reference(pt_name);
  END IF;
END $$;
