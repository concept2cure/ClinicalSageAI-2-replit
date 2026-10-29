-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A change-control record may name the project (product) it changes,
--          by key, and only a project of its own organization (founder decision
--          P-60, D2 / D6, 2026-10-29).
--
-- eCTD/CTD Context:
--   - Module(s): design changes (21 CFR 820.30(i)) and change control
--     (ISO 13485 §7.3.9, §7.3.10) as a product's Engineering screen reads them
--   - Integrity Risk Addressed: the change-control register held one list for
--     the whole organization, so a product's Engineering screen could not show
--     that product's design changes, and showed instead a writerless table.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261029l_qms_change_controls_program_key.sql
--
-- WHY. P-60 (docs/LAUNCH_DEFINITION_OF_DONE.md): a device or diagnostics
-- company runs several products, and their design changes are per product
-- (21 CFR 820.30(j), ISO 13485 §7.3.10). Engineering's change-request panel
-- (GET /api/mdx/engineering/:programId) read change_requests, which nothing
-- writes, by organization, and the screen hid it (EngineeringSurface.tsx
-- keyedToProject). The panel now reads the one change register,
-- qms_change_controls (db/migrations/20260724_qms_change_control_store.sql;
-- server/services/qms/changeControl.service.ts), by the project, so a change
-- has to be able to carry one. Evidence:
-- docs/evidence/D2-ONE-ANA/2026-10-29/engineering-per-product/.
--
-- WHAT. The form of 20261029d (the nonconformance log's key):
--   1. qms_change_controls.program_id UUID (the type of regulatory_programs.id),
--      nullable. Existing changes keep NULL. They are the organization's
--      records, which the Quality register still lists and no project reads. A
--      change names no product, and matching its title to one would be a guess.
--   2. idx_qms_change_org_program on (organization_id, program_id, created_at
--      DESC) WHERE program_id IS NOT NULL AND deleted_at IS NULL: the project
--      read, newest first.
--   3. regulatory_programs_id_org_uq when absent, the same statement 20260926b,
--      20261029, 20261029c and 20261029d use, so any of them may run first.
--   4. qms_change_controls_program_same_org_fk: (program_id, organization_id) →
--      regulatory_programs (id, organization_id), NOT VALID, ON DELETE SET NULL
--      (program_id). The writers (POST /api/mdx/qms/changes and AnA
--      qms_change_create, both through createChange) ask programInOrganization
--      before they write; the key holds every other writer to the same rule.
--      The column list matters: a tenant purge deletes regulatory_programs, and
--      a bare SET NULL would null organization_id too, which is NOT NULL, and
--      abort the purge (23502; ci:purge-coverage). NOT VALID scans no rows; the
--      column is new, so every row is NULL anyway. organization_id is NOT NULL,
--      so MATCH SIMPLE checks every row with a program and no CHECK is needed.
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent (to_regclass / pg_attribute / pg_constraint), so a replay executes
-- no DDL and takes no lock. Additive only: no DROP, no backfill, no COMMENT.
-- The table is in public with organization_id INTEGER NOT NULL, so the tenant
-- sweep at the tail of the set already polices it. Creates no table.
--
-- Pinned by tests/schema-contract/change-controls-program-key.pglite.test.ts.
-- =============================================================================

-- 1 and 2. The column and its index. Need only qms_change_controls.
DO $mig$
BEGIN
  IF to_regclass('public.qms_change_controls') IS NULL THEN
    RAISE NOTICE 'qms_change_controls absent - change-control program column skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.qms_change_controls'::regclass
                    AND attname = 'program_id' AND NOT attisdropped) THEN
    ALTER TABLE public.qms_change_controls ADD COLUMN program_id UUID;
  END IF;
  IF to_regclass('public.idx_qms_change_org_program') IS NULL THEN
    CREATE INDEX IF NOT EXISTS idx_qms_change_org_program
      ON public.qms_change_controls (organization_id, program_id, created_at DESC)
      WHERE program_id IS NOT NULL AND deleted_at IS NULL;
  END IF;
END
$mig$;

-- 3. The referenced key, as 20260926b creates it.
DO $mig$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'regulatory_programs absent - change-control program key skipped';
    RETURN;
  END IF;
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS regulatory_programs_id_org_uq
      ON public.regulatory_programs (id, organization_id);
  END IF;
END
$mig$;

-- 4. The same-organization key.
DO $mig$
BEGIN
  IF to_regclass('public.qms_change_controls') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'qms_change_controls or regulatory_programs_id_org_uq absent - change-control program key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qms_change_controls_program_same_org_fk'
                    AND conrelid = 'public.qms_change_controls'::regclass) THEN
    ALTER TABLE public.qms_change_controls
      ADD CONSTRAINT qms_change_controls_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id)
      NOT VALID;
  END IF;
END
$mig$;
