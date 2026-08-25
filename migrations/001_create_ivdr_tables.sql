-- IVDR Module Database Schema
-- EU 2017/746 In Vitro Diagnostic Regulation support tables
-- Migration: 001_create_ivdr_tables.sql
--
-- D11d IVDR consolidation (2026-08-13): this file's rival CREATE TABLE for
-- ivdr_classifications (the legacy "shape 1": classification / is_cdx /
-- is_self_test / is_near_patient, no program_id) is DELETED. The table is
-- created canonically by migrations/20260508_ivd_diagnostic_surfaces.sql
-- (mirroring shared/schema.ts), and legacy databases are reconciled by
-- migrations/20260813c_ivdr_schema_reconciliation.sql. Removing the rival
-- definition is also what lets THIS file apply on fresh installs — its old
-- CREATE INDEX over the shape-1 `classification` column failed against the
-- canonical table, so install-fresh classified-skipped the whole file and the
-- four module tables below never existed on a fresh database.
--
-- The module tables below carry their audit-hardening columns inline
-- (evidence_documents / acceptance_criteria / pass_fail_status, history
-- `reason`, clinical population fields, CDx intended-use fields) so a fresh
-- creation matches what the routes write; 20260813c adds the same columns
-- idempotently on databases created before this consolidation.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ANALYTICAL VALIDATIONS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ivdr_analytical_validations (
  id                  SERIAL PRIMARY KEY,
  classification_id   INTEGER REFERENCES ivdr_classifications(id),
  device_name         TEXT NOT NULL,
  analyte_name        TEXT NOT NULL,
  validation_type     VARCHAR(50) DEFAULT 'quantitative',
  status              VARCHAR(30) DEFAULT 'in_progress',
  -- Analytical parameters
  lod                 NUMERIC,          -- Limit of Detection
  loq                 NUMERIC,          -- Limit of Quantitation
  precision_cv        NUMERIC,          -- Overall CV %
  within_run_cv       NUMERIC,
  between_run_cv      NUMERIC,
  between_day_cv      NUMERIC,
  reproducibility_cv  NUMERIC,
  interference_study  JSONB,            -- { substances: [...], results: [...] }
  stability           JSONB,            -- { realTime: {...}, accelerated: {...}, freezeThaw: {...} }
  sensitivity         NUMERIC,          -- True positive rate
  specificity         NUMERIC,          -- True negative rate
  linearity           JSONB,            -- { rangeLow, rangeHigh, rSquared, unit }
  accuracy            NUMERIC,          -- Bias %
  carry_over          NUMERIC,          -- %
  hook_effect         JSONB,            -- { detected: boolean, threshold: numeric }
  reference_range     JSONB,            -- { lower, upper, unit, method }
  evidence_documents  JSONB DEFAULT '[]',  -- [{ type, title, url, version }]
  acceptance_criteria JSONB DEFAULT '{}',  -- { paramKey: { min?, max?, unit } }
  pass_fail_status    JSONB DEFAULT '{}',  -- { paramKey: 'pass'|'fail'|'pending'|'recorded' }
  organization_id     INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ivdr_val_org ON ivdr_analytical_validations(organization_id);
CREATE INDEX IF NOT EXISTS idx_ivdr_val_class ON ivdr_analytical_validations(classification_id);

-- Immutable parameter change history
CREATE TABLE IF NOT EXISTS ivdr_validation_parameter_history (
  id              SERIAL PRIMARY KEY,
  validation_id   INTEGER NOT NULL REFERENCES ivdr_analytical_validations(id),
  parameters      JSONB NOT NULL,
  updated_by      VARCHAR(255) NOT NULL DEFAULT 'system',
  reason          TEXT,               -- 21 CFR Part 11 §11.10(e) change reason
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ivdr_vph_val ON ivdr_validation_parameter_history(validation_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. CLINICAL EVIDENCE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ivdr_clinical_evidence (
  id                      SERIAL PRIMARY KEY,
  classification_id       INTEGER REFERENCES ivdr_classifications(id),
  validation_id           INTEGER REFERENCES ivdr_analytical_validations(id),
  study_title             TEXT NOT NULL,
  study_type              VARCHAR(50) NOT NULL,
  registry_id             VARCHAR(100),     -- ClinicalTrials.gov / ISRCTN
  sample_size             INTEGER,
  -- 2x2 Contingency Table
  true_positive           INTEGER,
  false_positive          INTEGER,
  true_negative           INTEGER,
  false_negative          INTEGER,
  -- Calculated Performance
  calculated_sensitivity  NUMERIC,
  calculated_specificity  NUMERIC,
  calculated_ppv          NUMERIC,
  calculated_npv          NUMERIC,
  calculated_accuracy     NUMERIC,
  -- Additional
  performance_claims      JSONB,
  comparison_method       TEXT,
  conclusion_text         TEXT,
  population_definition   TEXT,
  inclusion_criteria      TEXT,
  exclusion_criteria      TEXT,
  source_documents        JSONB DEFAULT '[]',
  status                  VARCHAR(30) DEFAULT 'planned',
  organization_id         INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ivdr_ce_org ON ivdr_clinical_evidence(organization_id);
CREATE INDEX IF NOT EXISTS idx_ivdr_ce_class ON ivdr_clinical_evidence(classification_id);

-- Immutable result change history
CREATE TABLE IF NOT EXISTS ivdr_evidence_result_history (
  id            SERIAL PRIMARY KEY,
  evidence_id   INTEGER NOT NULL REFERENCES ivdr_clinical_evidence(id),
  results       JSONB NOT NULL,
  updated_by    VARCHAR(255) NOT NULL DEFAULT 'system',
  reason        TEXT,               -- 21 CFR Part 11 §11.10(e) change reason
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ivdr_erh_ev ON ivdr_evidence_result_history(evidence_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. CDx (COMPANION DIAGNOSTIC) WORKFLOWS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ivdr_cdx_workflows (
  id                      SERIAL PRIMARY KEY,
  classification_id       INTEGER REFERENCES ivdr_classifications(id),
  medicinal_product_name  TEXT NOT NULL,
  active_substance        TEXT,
  therapeutic_indication  TEXT,
  biomarker               TEXT NOT NULL,
  treatment_decision      TEXT,
  regulatory_reference    TEXT,
  notified_body_id        VARCHAR(100),
  status                  VARCHAR(50) DEFAULT 'initiation',
  intended_use_statement  TEXT,              -- IVDR Art 2(2) intended use
  biomarker_type          VARCHAR(50),       -- protein | gene | mutation | ...
  clinical_evidence_ids   INTEGER[] DEFAULT '{}',
  organization_id         INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ivdr_cdx_org ON ivdr_cdx_workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_ivdr_cdx_class ON ivdr_cdx_workflows(classification_id);

-- Immutable CDx status history
CREATE TABLE IF NOT EXISTS ivdr_cdx_status_history (
  id            SERIAL PRIMARY KEY,
  workflow_id   INTEGER NOT NULL REFERENCES ivdr_cdx_workflows(id),
  status        VARCHAR(50) NOT NULL,
  notes         TEXT,
  updated_by    VARCHAR(255) NOT NULL DEFAULT 'system',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ivdr_csh_wf ON ivdr_cdx_status_history(workflow_id);
