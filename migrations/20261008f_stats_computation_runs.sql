-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ "original",
--             ICH E9 (sample size justification), ICH E3 §9.7.2
-- Purpose: A computed figure names the stored, reproducible run that produced
--          it (D2, Data Room catalog S5b;
--          docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
--
-- eCTD/CTD Context:
--   - Module(s): 5.3.5 (protocol and SAP sample-size justification), 2.7.3
--   - Integrity Risk Addressed: a planned sample size in a study design and
--     its SAP that no record could reproduce: the statistics engine's
--     provenance (inputs SHA-256, seed, engine version) was returned to the
--     caller and kept nowhere, so the figure's inputs were unrecoverable.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261008f_stats_computation_runs.sql
--
-- WHAT. public.stats_computation_runs, one row per engine run whose figure is
-- used in a design or a document: the inputs as computed and their SHA-256,
-- the outputs and theirs, the method, engine and version, and the seed. The
-- run is written in the transaction that applies its figure
-- (biostatistics-bridge applySampleSizeToDesign) and is never updated: a
-- re-apply is a new run. Re-running the stored inputs reproduces the stored
-- outputs (server/services/stats/computation-runs.ts reproduceComputationRun).
--   * organization_id INTEGER NOT NULL: the tenant sweeps (which run last)
--     give it RLS like every public table with an integer organization column.
--   * program_id and study_ref are keyed to records of the SAME organization,
--     (program_id, organization_id) -> regulatory_programs (id, organization_id)
--     and (study_ref, organization_id) -> cdisc_prm_studies (id, tenant_id),
--     each ON DELETE SET NULL of its own column only: deleting a design or a
--     project detaches the run and keeps it, with what it computed.
--
-- RULE 1: replayed on every deploy. CREATE TABLE / INDEX IF NOT EXISTS; no
-- DROP; no ALTER of another file's object.
-- =============================================================================

DO $mig$
BEGIN
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL
     OR to_regclass('public.cdisc_prm_studies_id_tenant_uq') IS NULL THEN
    RAISE NOTICE 'same-organization keys absent - stats_computation_runs skipped';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.stats_computation_runs (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  INTEGER NOT NULL REFERENCES public.organizations(id),
    program_id       UUID,
    study_ref        INTEGER,
    method           TEXT NOT NULL,
    method_version   TEXT,
    engine           TEXT NOT NULL,
    engine_version   TEXT NOT NULL,
    seed             BIGINT,
    inputs           JSONB NOT NULL,
    inputs_sha256    TEXT NOT NULL CHECK (inputs_sha256 ~ '^[0-9a-f]{64}$'),
    outputs          JSONB NOT NULL,
    outputs_sha256   TEXT NOT NULL CHECK (outputs_sha256 ~ '^[0-9a-f]{64}$'),
    purpose          TEXT NOT NULL,
    created_by       INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stats_computation_runs_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id),
    CONSTRAINT stats_computation_runs_study_same_org_fk
      FOREIGN KEY (study_ref, organization_id)
      REFERENCES public.cdisc_prm_studies (id, tenant_id)
      ON DELETE SET NULL (study_ref)
  );

  IF to_regclass('public.idx_stats_runs_study') IS NULL THEN
    CREATE INDEX idx_stats_runs_study ON public.stats_computation_runs (organization_id, study_ref, created_at DESC);
  END IF;
  IF to_regclass('public.idx_stats_runs_program') IS NULL THEN
    CREATE INDEX idx_stats_runs_program ON public.stats_computation_runs (organization_id, program_id, created_at DESC);
  END IF;
END
$mig$;
