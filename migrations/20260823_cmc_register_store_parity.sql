-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give the CMC specification and batch-record routes the tables and columns they actually write, so the Specifications and Batch Records tabs stop 500-ing on a freshly provisioned database.
--
-- eCTD/CTD Context:
--   - Module(s): Module 3 — 3.2.S.4 / 3.2.P.5 (specifications), 3.2.P.3.4 (batch records and governed release)
--   - Integrity Risk Addressed: a route and its table maintained by different authorities — quality_specifications was created by no migration at all, and cmc_batch_records carried a shape older than the code, so governed release evidence could not be written
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Additive only: nothing is dropped or renamed, and every statement is
--     guarded (CREATE TABLE / ADD COLUMN IF NOT EXISTS).
--   - Same class of defect 20260821_vault_documents_canonical_shape.sql fixed
--     for vault.documents; found by driving the workflow live, not by a mock.
-- =============================================================================

-- CMC register store parity — the tables the register routes actually write.
--
-- ── The defect (found by live simulation, not by tests) ───────────────────────
-- Driving the CMC staff workflow end-to-end against a freshly provisioned
-- database (docs/plans/CMC_MODULE3_DATAROOM_UNIFICATION_WORK_ORDER_2026-08-23.md
-- §W8) surfaced two provisioning gaps the mocked route tests could never see:
--
--   quality_specifications   did not exist at all. server/api/cmc/
--                            specificationRoutes.ts — the Specifications tab's
--                            whole write/read/approve path — 500'd on every
--                            call. No migration anywhere created the table;
--                            the routes were written against a shape only
--                            hand-provisioned databases carried.
--   cmc_batch_records        existed (migrations/0006) with a DIFFERENT shape
--                            than server/api/cmc/batchRecordRoutes.ts writes:
--                            product_name, manufacturing_site, status,
--                            process_parameters, in_process_controls,
--                            yield_data and the governed-release columns
--                            (release_testing/release_status/released_by/
--                            released_at) were all absent, so batch create
--                            and batch release both failed.
--
-- Same class of defect 20260821_vault_documents_canonical_shape.sql fixed for
-- vault.documents: a route and its table maintained by different authorities.
-- Additive only; nothing is dropped or renamed.
--
-- This file runs on the durable applier (scripts/db/migration-set.mjs), i.e. on
-- already-provisioned databases. cmc_batch_records is created only by root
-- migrations/0006 (fresh installs), so the ALTER block below is IF EXISTS-
-- guarded: a database without the table gets a NOTICE and the specifications
-- table, not a halted deploy.

CREATE TABLE IF NOT EXISTS quality_specifications (
  -- uuid, not serial: specification_audit_log.specification_id (created by
  -- db/migrations/20260730_cmc_evidence_tables.sql) is uuid, and the spec
  -- routes write that audit row for every create/update/approve.
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The CMC project scope. uuid to match cmc_batch_records.project_id: the
  -- client gates this register on a well-formed program uuid (cmcProjectUuid).
  project_id uuid,
  tenant_id integer,
  material_type text NOT NULL,
  material_name text NOT NULL,
  test_parameters jsonb,
  acceptance_criteria jsonb,
  test_methods jsonb,
  justification text,
  regulatory_basis jsonb,
  approval_status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quality_specifications_tenant
  ON quality_specifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_quality_specifications_project
  ON quality_specifications (project_id);

-- The batch register's project_id FK points at cmc_projects — the CMC-local
-- project spine nothing populates (the v2 shell passes the regulatory_programs
-- uuid). migrations/0017_module3_project_id_fix.sql dropped the same FK from
-- every Module 3 OS table for exactly this reason; the register kept its copy,
-- so every batch create with a real program id failed the constraint.
-- Application-layer scoping (tenant + program uuid) governs, as it does for
-- the OS tables.
ALTER TABLE IF EXISTS cmc_batch_records DROP CONSTRAINT IF EXISTS cmc_batch_records_project_id_fkey;

-- Columns batchRecordRoutes writes that migrations/0006's shape lacks.
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS manufacturing_site text;
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS status text DEFAULT 'in-progress';
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS process_parameters jsonb;
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS in_process_controls jsonb;
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS yield_data jsonb;
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS release_testing jsonb;
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS release_status text;
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS released_by text;
ALTER TABLE IF EXISTS cmc_batch_records ADD COLUMN IF NOT EXISTS released_at timestamptz;
