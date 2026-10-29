-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A nonconforming-product record may name the project it belongs to,
--          by key, and only a project of its own organization (D2 / D6,
--          2026-10-29).
--
-- eCTD/CTD Context:
--   - Module(s): the device quality record (ISO 13485:2016 §8.3, 21 CFR 820.10
--     / formerly 820.90) as the project's Engineering screen reads it
--   - Integrity Risk Addressed: a project's Engineering screen could only be
--     shown the organization's whole nonconformance log, which holds other
--     projects' records, so it hid the panel.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261029d_nonconforming_products_program_key.sql
--
-- WHY. qms_nonconforming_products (migrations/20260511_qms_and_labeling.sql;
-- shared/schema.ts qmsNonconformingProducts) has no project column. GET
-- /api/mdx/engineering/:programId read it by organization and reported the
-- panel 'organization', and the Engineering screen hides such a panel
-- (EngineeringSurface.tsx keyedToProject). The panel now reads the project's
-- own records, so a record has to be able to carry one. Evidence:
-- docs/evidence/D2-ONE-ANA/2026-10-29/engineering-panels-keyed/.
--
-- WHAT.
--   1. qms_nonconforming_products.program_id UUID (the type of
--      regulatory_programs.id), nullable. Existing records keep NULL. They are
--      the organization's unscoped records, which the Quality register still
--      lists and no project reads. A record carries only a free-text product
--      name, and matching that to a project would be a guess.
--   2. idx_qms_nc_org_program on (organization_id, program_id, detected_at
--      DESC) WHERE program_id IS NOT NULL: the project read, newest first.
--   3. regulatory_programs_id_org_uq when absent, the same statement 20260926b,
--      20261001c, 20261029 and 20261029c use, so any of them may run first.
--   4. qms_nonconforming_products_program_same_org_fk: (program_id,
--      organization_id) → regulatory_programs (id, organization_id), NOT VALID,
--      ON DELETE SET NULL (program_id). The writers (POST
--      /api/mdx/qms/nonconforming and AnA log_nonconforming_product) ask
--      programInOrganization before they write; the key holds every other
--      writer to the same rule, as 20260926b does. The column list matters: a
--      tenant purge deletes regulatory_programs, and a bare SET NULL would null
--      organization_id too, which is NOT NULL. NOT VALID scans no rows; the
--      column is new, so every row is NULL anyway. organization_id is NOT NULL,
--      so MATCH SIMPLE checks every row with a program and no CHECK is needed.
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent (to_regclass / pg_attribute / pg_constraint), so a replay executes
-- no DDL and takes no lock. Additive only: no DROP, no backfill, no COMMENT.
-- The table is in public with organization_id INTEGER NOT NULL, so the tenant
-- sweep at the tail of the set already polices it. Creates no table.
--
-- Pinned by tests/schema-contract/nonconforming-products-program-key.pglite.test.ts.
-- =============================================================================

-- 1 and 2. The column and its index. Need only qms_nonconforming_products.
DO $mig$
BEGIN
  IF to_regclass('public.qms_nonconforming_products') IS NULL THEN
    RAISE NOTICE 'qms_nonconforming_products absent - nonconformance program column skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.qms_nonconforming_products'::regclass
                    AND attname = 'program_id' AND NOT attisdropped) THEN
    ALTER TABLE public.qms_nonconforming_products ADD COLUMN program_id UUID;
  END IF;
  IF to_regclass('public.idx_qms_nc_org_program') IS NULL THEN
    CREATE INDEX IF NOT EXISTS idx_qms_nc_org_program
      ON public.qms_nonconforming_products (organization_id, program_id, detected_at DESC)
      WHERE program_id IS NOT NULL;
  END IF;
END
$mig$;

-- 3. The referenced key, as 20260926b creates it.
DO $mig$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'regulatory_programs absent - nonconformance program key skipped';
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
  IF to_regclass('public.qms_nonconforming_products') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'qms_nonconforming_products or regulatory_programs_id_org_uq absent - nonconformance program key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qms_nonconforming_products_program_same_org_fk'
                    AND conrelid = 'public.qms_nonconforming_products'::regclass) THEN
    ALTER TABLE public.qms_nonconforming_products
      ADD CONSTRAINT qms_nonconforming_products_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id)
      NOT VALID;
  END IF;
END
$mig$;
