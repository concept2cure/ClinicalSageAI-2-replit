-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles,
--             ICH E6(R3) Appendix C (essential records)
-- Purpose: A Trial Master File filing names the study it belongs to: one
--          protocol-design study of its own organization, enforced by the
--          database; and a filing that is removed stays on record with who
--          removed it, when and why (D2, eTMF convergence slices E2 and E3;
--          docs/design/ETMF_CONVERGENCE_2026-10-30.md; founder decisions P-74
--          and P-75).
--
-- eCTD/CTD Context:
--   - Module(s): none directly. The TMF holds the essential records behind
--     Module 5's study reports; an inspector reads it per study.
--   - Integrity Risk Addressed: a TMF kept against a trial id typed by hand
--     and bound to nothing; a filing deleted with no record that it existed.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261110_tmf_filings_study_ref.sql
--
-- WHY. tmf_artifact_filings keyed a trial by trial_id TEXT, typed by hand in
-- the screen and bound to nothing, so a TMF belonged to no study and to no
-- project. The study record already exists (cdisc_prm_studies, the
-- protocol-design study, anchored to its project since PF-14; P-75 item 1);
-- a filing now points at it. And a filing was removed by DELETE, leaving only
-- an audit row written after the fact; a removal now stays on the row.
--
-- WHAT.
--   * study_ref INTEGER on tmf_artifact_filings. Written by the one filing
--     writer (server/services/etmf/tmf-artifact-persistence.ts) with the id
--     of the study the filing was made against; trial_id keeps that study's
--     own study_id string, so tmf_artifact_filings_unique (organization_id,
--     trial_id, artifact_code) still holds one row per study and artifact.
--     A row filed before this keeps study_ref NULL: it is not served as any
--     study's filing, and no link is inferred from its free text.
--   * A unique index cdisc_prm_studies (id, tenant_id) when absent (the one
--     20261008d creates; id is the primary key, so it can never conflict),
--     and a composite key (study_ref, organization_id) → cdisc_prm_studies
--     (id, tenant_id): NOT VALID (no existing row can name a study yet),
--     ON DELETE SET NULL (study_ref) so deleting a study design detaches its
--     filings and keeps them on record, as 20261008d does for captures.
--   * removed_at, removed_by and removal_reason: a removal is recorded on the
--     row, never a DELETE. Every reader skips a removed row. Filing the same
--     artifact for the same study again clears the three on the same row, in
--     the writer's transaction, and its audit row says which removal it
--     cleared; the unique key therefore needs no change.
--   * tmf_artifact_filings_removal_recorded_chk: a removed row carries a
--     reason of at least 8 characters, and a live row carries none of the
--     three. Added only when absent; every existing row has all three NULL.
--
-- AMENDED 2026-11-12 (P-124 item 5, the Vault parity lane): "not applicable",
-- with a reason, carried onto this store before admission. One more nullable
-- column, not_applicable_reason TEXT: a live row that carries it is a
-- declaration that the record does not apply to the study (who: created_by;
-- when: filed_at; why: this), counted as neither filed nor missing. A
-- declaration names no document, and its reason is at least 8 characters:
-- tmf_artifact_filings_not_applicable_chk, added only when absent (every
-- existing row has the column NULL, so it validates nothing). Withdrawing a
-- declaration is a removal (the three removal columns above); filing a
-- document over one clears the column on the same row, in the writer's
-- transaction. Written only by server/services/etmf/tmf-artifact-persistence.ts.
-- Amended in place, not appended (RULE 1): the journal records this as drift.
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent; a replay runs no DDL. No DROP. The table is public with an
-- integer organization column and already policied; cdisc_prm_studies too.
--
-- Pinned by tests/db/etmf-study-binding.dbtest.ts and
-- tests/db/etmf-governed-filing.dbtest.ts.
-- =============================================================================

DO $mig$
BEGIN
  IF to_regclass('public.tmf_artifact_filings') IS NULL THEN
    RAISE NOTICE 'tmf_artifact_filings absent - study_ref and removal columns skipped';
    RETURN;
  END IF;
  -- Each column only when absent, so a replay takes no lock on the table at
  -- all (ADD COLUMN IF NOT EXISTS would still take ACCESS EXCLUSIVE to look).
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.tmf_artifact_filings'::regclass
                    AND attname = 'study_ref' AND NOT attisdropped) THEN
    ALTER TABLE public.tmf_artifact_filings ADD COLUMN study_ref INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.tmf_artifact_filings'::regclass
                    AND attname = 'removed_at' AND NOT attisdropped) THEN
    ALTER TABLE public.tmf_artifact_filings ADD COLUMN removed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.tmf_artifact_filings'::regclass
                    AND attname = 'removed_by' AND NOT attisdropped) THEN
    ALTER TABLE public.tmf_artifact_filings ADD COLUMN removed_by INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.tmf_artifact_filings'::regclass
                    AND attname = 'removal_reason' AND NOT attisdropped) THEN
    ALTER TABLE public.tmf_artifact_filings ADD COLUMN removal_reason TEXT;
  END IF;
  IF to_regclass('public.tmf_artifact_filings_study_ref_idx') IS NULL THEN
    CREATE INDEX tmf_artifact_filings_study_ref_idx ON public.tmf_artifact_filings (study_ref) WHERE study_ref IS NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.tmf_artifact_filings'::regclass
                    AND attname = 'not_applicable_reason' AND NOT attisdropped) THEN
    ALTER TABLE public.tmf_artifact_filings ADD COLUMN not_applicable_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tmf_artifact_filings_not_applicable_chk'
                    AND conrelid = 'public.tmf_artifact_filings'::regclass) THEN
    ALTER TABLE public.tmf_artifact_filings
      ADD CONSTRAINT tmf_artifact_filings_not_applicable_chk
      CHECK (not_applicable_reason IS NULL
          OR (document_ref IS NULL AND char_length(btrim(not_applicable_reason)) >= 8));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tmf_artifact_filings_removal_recorded_chk'
                    AND conrelid = 'public.tmf_artifact_filings'::regclass) THEN
    ALTER TABLE public.tmf_artifact_filings
      ADD CONSTRAINT tmf_artifact_filings_removal_recorded_chk
      CHECK ((removed_at IS NULL AND removed_by IS NULL AND removal_reason IS NULL)
          OR (removed_at IS NOT NULL AND removal_reason IS NOT NULL AND char_length(btrim(removal_reason)) >= 8));
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF to_regclass('public.cdisc_prm_studies') IS NULL OR to_regclass('public.tmf_artifact_filings') IS NULL THEN
    RAISE NOTICE 'cdisc_prm_studies or tmf_artifact_filings absent - study key skipped';
    RETURN;
  END IF;
  IF to_regclass('public.cdisc_prm_studies_id_tenant_uq') IS NULL THEN
    CREATE UNIQUE INDEX cdisc_prm_studies_id_tenant_uq ON public.cdisc_prm_studies (id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tmf_artifact_filings_study_same_org_fk'
                    AND conrelid = 'public.tmf_artifact_filings'::regclass) THEN
    ALTER TABLE public.tmf_artifact_filings
      ADD CONSTRAINT tmf_artifact_filings_study_same_org_fk
      FOREIGN KEY (study_ref, organization_id)
      REFERENCES public.cdisc_prm_studies (id, tenant_id)
      ON DELETE SET NULL (study_ref)
      NOT VALID;
  END IF;
END
$mig$;
