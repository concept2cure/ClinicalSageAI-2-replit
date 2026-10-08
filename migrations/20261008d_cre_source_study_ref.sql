-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A Data Room capture can name the study it is about: one study of
--          its own organization, enforced by the database (D2, Data Room
--          catalog S3; docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
--
-- eCTD/CTD Context:
--   - Module(s): 2.5, 2.7, 5 (study reports and their sources are organized
--     by study; the STF and the clinical summaries are written per study)
--   - Integrity Risk Addressed: a study report filed under the wrong study,
--     or another organization's.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261008d_cre_source_study_ref.sql
--
-- WHY. A project's evidence could not be told apart by study: no column said
-- which study a CSR, a protocol amendment or a listing belonged to. The study
-- record already exists (cdisc_prm_studies, the study-design store, anchored to
-- the project since PF-14); the capture now points at it.
--
-- WHAT.
--   * study_ref INTEGER on cre_evidence_sources. Written by the Data Room
--     processing step only when the document names a protocol or study id
--     that matches exactly ONE study of the same project
--     (catalog-facts.ts matchStudy); otherwise it stays NULL, never guessed.
--   * A unique index cdisc_prm_studies (id, tenant_id) when absent (id is the
--     primary key, so it can never conflict), and a composite key
--     (study_ref, organization_id) → cdisc_prm_studies (id, tenant_id):
--     NOT VALID (no existing row can name a study yet), ON DELETE SET NULL
--     (study_ref) so deleting a study design detaches its sources and keeps
--     the capture record. The capture guard (VR-16) leaves study_ref mutable.
--   * scripts/db/program-same-org-preflight.mjs lists any row naming a foreign
--     or missing study.
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent; a replay runs no DDL. No DROP. Both tables are public with an
-- integer organization column and already policied.
--
-- Pinned by tests/db/data-room-catalog-facts.dbtest.ts.
-- =============================================================================

DO $mig$
BEGIN
  IF to_regclass('public.cre_evidence_sources') IS NULL THEN
    RAISE NOTICE 'cre_evidence_sources absent - study_ref skipped';
    RETURN;
  END IF;
  ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS study_ref INTEGER;
  IF to_regclass('public.idx_cre_sources_study_ref') IS NULL THEN
    CREATE INDEX idx_cre_sources_study_ref ON public.cre_evidence_sources (study_ref) WHERE study_ref IS NOT NULL;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF to_regclass('public.cdisc_prm_studies') IS NULL OR to_regclass('public.cre_evidence_sources') IS NULL THEN
    RAISE NOTICE 'cdisc_prm_studies or cre_evidence_sources absent - study key skipped';
    RETURN;
  END IF;
  IF to_regclass('public.cdisc_prm_studies_id_tenant_uq') IS NULL THEN
    CREATE UNIQUE INDEX cdisc_prm_studies_id_tenant_uq ON public.cdisc_prm_studies (id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cre_evidence_sources_study_same_org_fk'
                    AND conrelid = 'public.cre_evidence_sources'::regclass) THEN
    ALTER TABLE public.cre_evidence_sources
      ADD CONSTRAINT cre_evidence_sources_study_same_org_fk
      FOREIGN KEY (study_ref, organization_id)
      REFERENCES public.cdisc_prm_studies (id, tenant_id)
      ON DELETE SET NULL (study_ref)
      NOT VALID;
  END IF;
END
$mig$;
