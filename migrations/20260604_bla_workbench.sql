-- ============================================================================
-- BLA 351(a) workbench — biologics assessment store
-- ============================================================================
--
-- Persists the runs of the three biologics science engines:
--   analytical_similarity (FDA Tier 1/2/3), comparability (ICH Q5E), and
--   immunogenicity (ADA/NAb tiered assay + risk classification).
--
-- One flexible table holds any of the three assessment kinds with its full
-- input snapshot and computed result, so a reviewer can reproduce or sign off
-- the conclusion. Org-scoped and program-scoped; FK to regulatory_programs(id)
-- (uuid) which is proven safe in preview. No FK to users (per the mutation-
-- primitives convention); created_by / signed_by carry users.id by value.
--
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS c2c_bla_assessments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              INTEGER NOT NULL,
    program_id          UUID REFERENCES regulatory_programs(id) ON DELETE CASCADE,

    -- analytical_similarity | comparability | immunogenicity
    kind                TEXT NOT NULL,

    title               TEXT,
    modality            TEXT,
    reference_product   TEXT,
    target_agency       TEXT,

    -- draft | final | signed
    status              TEXT NOT NULL DEFAULT 'draft',
    -- top-level conclusion / risk tier, denormalized for fast listing
    verdict             TEXT,

    input               JSONB NOT NULL DEFAULT '{}'::jsonb,
    result              JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_by          INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 21 CFR Part 11 sign-off (governed via recordGovernedAction)
    signed_by           INTEGER,
    signed_at           TIMESTAMPTZ,
    signature_reason    TEXT,

    tenant_id           TEXT
);

-- Guard the closed enum without a hard CHECK that would block legacy rows.
ALTER TABLE c2c_bla_assessments
  ADD COLUMN IF NOT EXISTS reference_product TEXT;
ALTER TABLE c2c_bla_assessments
  ADD COLUMN IF NOT EXISTS signature_reason TEXT;

CREATE INDEX IF NOT EXISTS c2c_bla_assessments_org_idx
  ON c2c_bla_assessments (org_id);
CREATE INDEX IF NOT EXISTS c2c_bla_assessments_program_idx
  ON c2c_bla_assessments (program_id);
CREATE INDEX IF NOT EXISTS c2c_bla_assessments_kind_idx
  ON c2c_bla_assessments (org_id, kind);
CREATE INDEX IF NOT EXISTS c2c_bla_assessments_status_idx
  ON c2c_bla_assessments (org_id, status);
