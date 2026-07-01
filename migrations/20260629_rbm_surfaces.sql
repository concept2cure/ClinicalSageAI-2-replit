-- Risk-Based Monitoring (RBM / RBQM) surfaces — ICH E6(R3) + E8(R1).
--
-- Adds the conduct-layer monitoring tables that close the gap between the
-- study-design phase (protocol / SAP / CRF) and the submission phase. Mirrors
-- the risk_items convention exactly: integer organization_id tenant column,
-- nullable uuid program_id (the canonical project id space CMC / labeling /
-- risk scope on), jsonb metadata, soft-delete deleted_at, org + program indexes.
--
-- Entities:
--   rbm_risk_assessments   — the RACT container (one per program / cycle).
--   rbm_risk_items         — Critical-to-Quality (CtQ) factors / RACT rows.
--   rbm_kris               — Key Risk Indicators (KRI) with amber/red thresholds.
--   rbm_qtls               — Quality Tolerance Limits (study-level, E6(R3)).
--   rbm_signals            — central / statistical monitoring signals & alerts.
--   rbm_site_risk_scores   — per-site risk snapshot (consumes site_intel).
--   rbm_monitoring_plans   — the integrated monitoring strategy.
--   rbm_monitoring_actions — issue / CAPA / visit / query / escalation actions.
--
-- Idempotent: safe to re-run.

-- ── RACT container ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbm_risk_assessments (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  program_id      UUID,
  title           TEXT NOT NULL,
  framework       TEXT NOT NULL DEFAULT 'ich_e6r3',   -- ich_e6r3 | transcelerate_ract
  overall_risk    TEXT,                                -- low | medium | high
  status          TEXT NOT NULL DEFAULT 'draft',       -- draft | active | archived
  version         INTEGER NOT NULL DEFAULT 1,
  approved_by     INTEGER REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rbm_assessments_org_idx         ON rbm_risk_assessments (organization_id);
CREATE INDEX IF NOT EXISTS rbm_assessments_program_idx     ON rbm_risk_assessments (program_id);
CREATE INDEX IF NOT EXISTS rbm_assessments_org_program_idx ON rbm_risk_assessments (organization_id, program_id);

-- ── CtQ factors / RACT rows ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbm_risk_items (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  assessment_id   INTEGER REFERENCES rbm_risk_assessments(id) ON DELETE CASCADE,
  program_id      UUID,
  ref_code        TEXT,
  category        TEXT NOT NULL DEFAULT 'operational', -- safety | efficacy | data_integrity | compliance | operational
  ctq_factor      TEXT NOT NULL,
  risk_description TEXT,
  likelihood      INTEGER NOT NULL,                    -- 1..5
  impact          INTEGER NOT NULL,                    -- 1..5
  detectability   INTEGER,                             -- 1..5
  risk_score      INTEGER,                             -- likelihood × impact
  is_critical     BOOLEAN DEFAULT false,
  mitigation      TEXT,
  residual_likelihood INTEGER,
  residual_impact     INTEGER,
  residual_score      INTEGER,
  status          TEXT NOT NULL DEFAULT 'open',         -- open | mitigating | accepted | closed
  assigned_to     INTEGER REFERENCES users(id),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rbm_items_org_idx         ON rbm_risk_items (organization_id);
CREATE INDEX IF NOT EXISTS rbm_items_assessment_idx  ON rbm_risk_items (assessment_id);
CREATE INDEX IF NOT EXISTS rbm_items_org_program_idx ON rbm_risk_items (organization_id, program_id);

-- ── Key Risk Indicators ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbm_kris (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  program_id      UUID,
  assessment_id   INTEGER REFERENCES rbm_risk_assessments(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  metric_definition TEXT,
  data_source     TEXT DEFAULT 'manual',               -- edc | ctms | site_intel | central_stats | manual
  unit            TEXT,
  direction       TEXT DEFAULT 'higher_worse',          -- higher_worse | lower_worse
  threshold_amber NUMERIC(12,4),
  threshold_red   NUMERIC(12,4),
  current_value   NUMERIC(12,4),
  status          TEXT NOT NULL DEFAULT 'green',         -- green | amber | red
  evaluated_at    TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rbm_kris_org_idx         ON rbm_kris (organization_id);
CREATE INDEX IF NOT EXISTS rbm_kris_org_program_idx ON rbm_kris (organization_id, program_id);

-- ── Quality Tolerance Limits ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbm_qtls (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  program_id      UUID,
  parameter       TEXT NOT NULL,
  rationale       TEXT,
  threshold       NUMERIC(12,4),
  secondary_limit NUMERIC(12,4),                         -- 50–75% early-warning limit (TransCelerate)
  current_value   NUMERIC(12,4),
  breached        BOOLEAN DEFAULT false,
  breach_action_taken TEXT,
  status          TEXT NOT NULL DEFAULT 'within',         -- within | approaching | breached
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rbm_qtls_org_idx         ON rbm_qtls (organization_id);
CREATE INDEX IF NOT EXISTS rbm_qtls_org_program_idx ON rbm_qtls (organization_id, program_id);

-- ── Central / statistical monitoring signals ──────────────────────────────
CREATE TABLE IF NOT EXISTS rbm_signals (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  program_id      UUID,
  site_id         TEXT,                                  -- free-form link to a site (site_intel id / number)
  source          TEXT NOT NULL DEFAULT 'manual',        -- central_stat | kri | qtl | site_score | manual
  signal_type     TEXT,
  severity        TEXT NOT NULL DEFAULT 'medium',         -- low | medium | high | critical
  title           TEXT NOT NULL,
  detail          TEXT,
  statistic       JSONB DEFAULT '{}'::jsonb,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'new',            -- new | triaged | investigating | resolved | dismissed
  resolution_notes TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rbm_signals_org_idx         ON rbm_signals (organization_id);
CREATE INDEX IF NOT EXISTS rbm_signals_org_program_idx ON rbm_signals (organization_id, program_id);

-- ── Per-site risk snapshot (consumes site_intel) ──────────────────────────
CREATE TABLE IF NOT EXISTS rbm_site_risk_scores (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  program_id      UUID,
  site_id         TEXT,
  site_number     TEXT,
  site_name       TEXT,
  composite_risk  NUMERIC(6,2),
  enrollment_risk NUMERIC(6,2),
  quality_risk    NUMERIC(6,2),
  operational_risk NUMERIC(6,2),
  monitoring_tier TEXT NOT NULL DEFAULT 'standard',       -- reduced | standard | enhanced
  drivers         JSONB DEFAULT '[]'::jsonb,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rbm_site_risk_org_idx         ON rbm_site_risk_scores (organization_id);
CREATE INDEX IF NOT EXISTS rbm_site_risk_org_program_idx ON rbm_site_risk_scores (organization_id, program_id);

-- ── Monitoring plan + actions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbm_monitoring_plans (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  program_id      UUID,
  assessment_id   INTEGER REFERENCES rbm_risk_assessments(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  strategy        TEXT NOT NULL DEFAULT 'risk_based',      -- centralized | risk_based | on_site | hybrid
  status          TEXT NOT NULL DEFAULT 'draft',           -- draft | active | archived
  approved_by     INTEGER REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rbm_plans_org_idx         ON rbm_monitoring_plans (organization_id);
CREATE INDEX IF NOT EXISTS rbm_plans_org_program_idx ON rbm_monitoring_plans (organization_id, program_id);

CREATE TABLE IF NOT EXISTS rbm_monitoring_actions (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  plan_id         INTEGER REFERENCES rbm_monitoring_plans(id) ON DELETE CASCADE,
  risk_item_id    INTEGER REFERENCES rbm_risk_items(id) ON DELETE SET NULL,
  signal_id       INTEGER REFERENCES rbm_signals(id) ON DELETE SET NULL,
  action_type     TEXT NOT NULL DEFAULT 'issue',            -- issue | capa | site_visit | query | escalation
  description     TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'medium',           -- low | medium | high
  owner           INTEGER REFERENCES users(id),
  due_date        DATE,
  status          TEXT NOT NULL DEFAULT 'open',             -- open | in_progress | done
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rbm_actions_org_idx  ON rbm_monitoring_actions (organization_id);
CREATE INDEX IF NOT EXISTS rbm_actions_plan_idx ON rbm_monitoring_actions (plan_id);
