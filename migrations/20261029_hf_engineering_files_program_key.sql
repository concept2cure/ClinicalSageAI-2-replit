-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: An IEC 62366-1 HFE/UE file names the project it belongs to, by key,
--          and only a project of its own organization (D2, 2026-10-29).
--
-- eCTD/CTD Context:
--   - Module(s): the device HFE/UE report and the usability summary it supports
--   - Integrity Risk Addressed: a project's human-factors screen read the
--     organization's first HFE/UE file, which may be another project's.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261029_hf_engineering_files_program_key.sql
--
-- WHY. hf_engineering_files (db/migrations/20260801_hf_files_store.sql) has no
-- project column. GET /api/human-factors returned the organization's first
-- file, and the v2 HumanFactors screen hid that file's panels because it
-- could not tie it to the open project. The screen now reads by project, so
-- the file has to carry one. Evidence:
-- docs/evidence/D2-ONE-ANA/2026-10-29/device-features-human-factors/.
--
-- WHAT.
--   1. hf_engineering_files.program_id UUID (the type of regulatory_programs.id),
--      nullable. Existing files keep NULL. They are the organization's
--      unscoped files. No project ever reads them, and nothing guesses one
--      into a project. A file carries only a device name, and matching that
--      to a project would be a guess.
--   2. regulatory_programs_id_org_uq when absent, the same statement 20260926b
--      and 20261001c use, so any of the three may run first.
--   3. hf_engineering_files_program_same_org_fk: (program_id, organization_id)
--      → regulatory_programs (id, organization_id), NOT VALID, ON DELETE SET
--      NULL (program_id). The route asks programInOrganization before it
--      writes; the key holds every other writer (the demo seed, a later one)
--      to the same rule, as 20260926b does for the five stores it keys. The
--      column list matters: a tenant purge deletes regulatory_programs, and a
--      bare SET NULL would null organization_id too, which is NOT NULL. NOT
--      VALID scans no rows; the column is new, so every row is NULL anyway.
--      organization_id is NOT NULL, so no CHECK is needed for MATCH SIMPLE.
--   4. idx_hf_engineering_files_org_program on (organization_id, program_id,
--      created_at DESC) for live, keyed files: the project read
--      (hf-files-service.ts listHfFiles with a programId).
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent (to_regclass / pg_attribute / pg_constraint), so a replay executes
-- no DDL and takes no lock. Additive only: no DROP, no backfill, no COMMENT.
-- The table is in public with organization_id INTEGER NOT NULL, so the tenant
-- sweep at the tail of the set already polices it. Creates no table.
--
-- Pinned by tests/schema-contract/hf-engineering-files-program-key.pglite.test.ts.
-- =============================================================================

-- 1 and 4. The column and its index. Need only hf_engineering_files.
DO $mig$
BEGIN
  IF to_regclass('public.hf_engineering_files') IS NULL THEN
    RAISE NOTICE 'hf_engineering_files absent - HFE/UE program column skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.hf_engineering_files'::regclass
                    AND attname = 'program_id' AND NOT attisdropped) THEN
    ALTER TABLE public.hf_engineering_files ADD COLUMN program_id UUID;
  END IF;
  IF to_regclass('public.idx_hf_engineering_files_org_program') IS NULL THEN
    CREATE INDEX IF NOT EXISTS idx_hf_engineering_files_org_program
      ON public.hf_engineering_files (organization_id, program_id, created_at DESC)
      WHERE deleted_at IS NULL AND program_id IS NOT NULL;
  END IF;
END
$mig$;

-- 2. The referenced key, as 20260926b creates it.
DO $mig$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'regulatory_programs absent - HFE/UE program key skipped';
    RETURN;
  END IF;
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS regulatory_programs_id_org_uq
      ON public.regulatory_programs (id, organization_id);
  END IF;
END
$mig$;

-- 3. The same-organization key.
DO $mig$
BEGIN
  IF to_regclass('public.hf_engineering_files') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'hf_engineering_files or regulatory_programs_id_org_uq absent - HFE/UE program key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hf_engineering_files_program_same_org_fk'
                    AND conrelid = 'public.hf_engineering_files'::regclass) THEN
    ALTER TABLE public.hf_engineering_files
      ADD CONSTRAINT hf_engineering_files_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id)
      NOT VALID;
  END IF;
END
$mig$;
