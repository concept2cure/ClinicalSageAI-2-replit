-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A design input names the project it belongs to, by key, and a
--          design input or an ISO 14971 risk item can name only a project of
--          its own organization (D2, fold F1 slice A, 2026-10-29).
--
-- eCTD/CTD Context:
--   - Module(s): the device design history file (ISO 13485 §7.3, 21 CFR 820)
--     and the ISO 14971 risk management file
--   - Integrity Risk Addressed: GET /api/design-controls read the organization's
--     whole design-input store, with no way to read one project's; and a risk
--     item could be anchored to another organization's project.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261029c_design_controls_and_risk_items_program_keys.sql
--
-- WHY. c2c_design_controls (db/migrations/20260717_design_controls_store.sql)
-- has no project column, so a project screen could only be shown the
-- organization's whole design history file. risk_items
-- (migrations/20260507_mdx_beta_surfaces.sql) has program_id, but its key, where
-- it exists, proves only that the project exists, not that it is the risk's
-- organization's; and a database provisioned by drizzle push (shared/schema.ts
-- riskItems) has no key on it at all. The routes now ask programInOrganization
-- first (server/lib/admit-project.ts); the keys hold every other writer (the AnA
-- create_risk_item tool, the demo seed, a later one) to the same rule, as
-- 20260926b and 20261029_hf_engineering_files_program_key.sql do. Evidence:
-- docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/.
--
-- WHAT.
--   1. c2c_design_controls.program_id UUID (the type of regulatory_programs.id),
--      nullable. Existing design inputs keep NULL. They are the organization's
--      unscoped inputs. No project read returns them, and nothing guesses one
--      into a project.
--   2. idx_c2c_design_controls_org_program on (organization_id, program_id, id)
--      WHERE program_id IS NOT NULL: the project read, ORDER BY id.
--   3. regulatory_programs_id_org_uq when absent, the same statement 20260926b,
--      20261001c and 20261029 use, so any of them may run first.
--   4. c2c_design_controls_program_same_org_fk: (program_id, organization_id) →
--      regulatory_programs (id, organization_id), NOT VALID, ON DELETE SET NULL
--      (program_id). The column list matters: a tenant purge deletes
--      regulatory_programs, and a bare SET NULL would null organization_id too,
--      which is NOT NULL and part of the primary key. NOT VALID scans no rows;
--      the column is new, so every row is NULL anyway.
--   5. risk_items_program_same_org_fk: (program_id, organization_id) →
--      regulatory_programs (id, organization_id), NOT VALID. Its delete action
--      follows the key the table already has, because two keys with opposite
--      delete actions on one column resolve by RI trigger-name order, so a
--      program delete would un-anchor on one database and refuse on another
--      (20260926b, the c2c_documents block):
--        * the 20260507 lineage has risk_items.program_id REFERENCES
--          regulatory_programs(id), NO ACTION. The new key is NO ACTION too. A
--          program delete with risks anchored to it is refused, as it already is.
--        * the drizzle lineage has no key on program_id. The new key is ON DELETE
--          SET NULL (program_id), the hf pattern. A program delete un-anchors its
--          risks and keeps their organization, as it leaves them today.
--      NOT VALID: legacy rows are not scanned, so a legacy cross-organization row
--      does not fail the deploy; it keeps accepting updates that leave its key
--      alone (scripts/db/program-same-org-preflight.mjs lists such rows). Every
--      row inserted, and every row whose program or organization changes, is
--      checked from here on. organization_id is NOT NULL, so MATCH SIMPLE checks
--      every row with a program and no CHECK is needed. risk_items already has
--      (organization_id, program_id) and (program_id) indexes.
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent (to_regclass / pg_attribute / pg_constraint), so a replay executes
-- no DDL and takes no lock. The delete-action choice in 5 is made once, when the
-- key is created, and never revisited. Additive only: no DROP, no backfill, no
-- COMMENT. Both tables are in public with organization_id INTEGER NOT NULL, so
-- the tenant sweep at the tail of the set already polices them. Creates no table.
--
-- Pinned by tests/schema-contract/design-controls-risk-items-program-keys.pglite.test.ts.
-- =============================================================================

-- 1 and 2. The column and its index. Need only c2c_design_controls.
DO $mig$
BEGIN
  IF to_regclass('public.c2c_design_controls') IS NULL THEN
    RAISE NOTICE 'c2c_design_controls absent - design-input program column skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.c2c_design_controls'::regclass
                    AND attname = 'program_id' AND NOT attisdropped) THEN
    ALTER TABLE public.c2c_design_controls ADD COLUMN program_id UUID;
  END IF;
  IF to_regclass('public.idx_c2c_design_controls_org_program') IS NULL THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_design_controls_org_program
      ON public.c2c_design_controls (organization_id, program_id, id)
      WHERE program_id IS NOT NULL;
  END IF;
END
$mig$;

-- 3. The referenced key, as 20260926b creates it.
DO $mig$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'regulatory_programs absent - design-input and risk program keys skipped';
    RETURN;
  END IF;
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS regulatory_programs_id_org_uq
      ON public.regulatory_programs (id, organization_id);
  END IF;
END
$mig$;

-- 4. The design input's same-organization key.
DO $mig$
BEGIN
  IF to_regclass('public.c2c_design_controls') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'c2c_design_controls or regulatory_programs_id_org_uq absent - design-input program key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_design_controls_program_same_org_fk'
                    AND conrelid = 'public.c2c_design_controls'::regclass) THEN
    ALTER TABLE public.c2c_design_controls
      ADD CONSTRAINT c2c_design_controls_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id)
      NOT VALID;
  END IF;
END
$mig$;

-- 5. The risk item's same-organization key, with the delete action of the key
--    it already has.
DO $mig$
BEGIN
  IF to_regclass('public.risk_items') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'risk_items or regulatory_programs_id_org_uq absent - risk program key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.risk_items'::regclass
                    AND attname = 'program_id' AND NOT attisdropped) THEN
    RAISE NOTICE 'risk_items.program_id absent - risk program key skipped';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risk_items_program_same_org_fk'
                AND conrelid = 'public.risk_items'::regclass) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.risk_items'::regclass
                AND confrelid = 'public.regulatory_programs'::regclass
                AND contype = 'f'
                AND confdeltype IN ('a', 'r')) THEN
    ALTER TABLE public.risk_items
      ADD CONSTRAINT risk_items_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE NO ACTION
      NOT VALID;
  ELSE
    ALTER TABLE public.risk_items
      ADD CONSTRAINT risk_items_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id)
      NOT VALID;
  END IF;
END
$mig$;
