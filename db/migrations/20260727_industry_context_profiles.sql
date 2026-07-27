-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — Industry-context tailoring (governed profiles)
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Persist the industry context that tailors one workspace — an
--          organization industry profile and a per-project override — so the
--          workspace self-tailors from governed, audited data instead of a
--          free-text column, a localStorage blob, and an onboarding mock.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (drives templates, study types, filing workflows).
--   - Integrity Risk Addressed: today the client's industry/specialization is
--     not a governed record, so regulated project behaviour (templates,
--     approval rigor, pathways) cannot be reliably or auditably tailored.
--
-- Determinism Contract:
--   - Additive tables only; nothing existing is rewritten. No spec version bump.
--
-- Notes:
--   - organization_industry_profiles: one governed profile per org.
--   - project_industry_profiles: keyed on program_id (regulatory_programs.id,
--     the canonical project id space that clinical_studies / rbm_* / cdisc_prm
--     already share), inheriting org defaults, overridable per project.
--   - Idempotent (IF NOT EXISTS). Markets/pathways stored as jsonb text arrays.
--
-- Rollback:
--   DROP TABLE IF EXISTS project_industry_profiles;
--   DROP TABLE IF EXISTS organization_industry_profiles;
-- =============================================================================

CREATE TABLE IF NOT EXISTS organization_industry_profiles (
  id                    SERIAL PRIMARY KEY,
  organization_id       INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  -- medical_device_diagnostics | biotech_pharma | cro | regulatory_consulting | academic_research
  primary_industry      TEXT NOT NULL,
  -- medical_device | ivd_diagnostics | both | samd | companion_diagnostic | combination_product
  mdx_specialization    TEXT,
  default_markets       JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_pathways      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- single_reviewer | regulated_dual_review | qa_lock | signoff_required
  default_approval_rigor TEXT,
  effective_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_industry_profiles (
  id                    SERIAL PRIMARY KEY,
  program_id            UUID NOT NULL UNIQUE,   -- regulatory_programs.id (canonical project key)
  organization_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vertical              TEXT,                    -- mdx | biopharma
  specialization        TEXT,                    -- same domain as mdx_specialization
  product_type          TEXT,
  lifecycle_stage       TEXT,
  target_markets        JSONB NOT NULL DEFAULT '[]'::jsonb,
  regulatory_pathways   JSONB NOT NULL DEFAULT '[]'::jsonb,
  filing_types          JSONB NOT NULL DEFAULT '[]'::jsonb,
  inherited_from_org    BOOLEAN NOT NULL DEFAULT true,
  updated_by            INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- organization_id (org table) and program_id (project table) are UNIQUE and
-- therefore already indexed by Postgres; only the project org_id needs one.
CREATE INDEX IF NOT EXISTS pip_org_idx ON project_industry_profiles (organization_id);
