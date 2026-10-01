-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A governed record can name a project only of its OWN organization,
--          enforced by the database (project-first plan PF-04, D3).
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (the project every governed record starts at)
--   - Integrity Risk Addressed: tenant isolation — a record of organization A
--     anchored to organization B's project is listed in B's project, placed in
--     B's filing, and counted in B's readiness.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20260926b_program_same_org_keys.sql
--
-- WHY. Five tables carry a project key (a `regulatory_programs` UUID) beside
-- their own organization column, and none held the two together. The writers
-- now check ownership first (LX-20, PF-02, PF-07, PF-14), but a check in code
-- covers only the writers that make it: a legacy branch, a hand-run backfill
-- (db/migrations/20260727_prm_program_link.sql sets program_id from
-- protocol_id with no organization check) or the next writer can still anchor
-- a record to another organization's project. Measured before this file:
--   * projects.regulatory_program_id — written unchecked 2026-08-14..09-24;
--   * authoring_documents.client_program_id — /docs/from-draft checked shape
--     only until PF-07;
--   * cre_evidence_sources.client_program_id — the one INSERT site takes the
--     caller's word (canonical-source-identity test writes org 2 + org 1's
--     program, and it succeeded);
--   * c2c_documents.project_id — its own key proves the program exists, not
--     that it is the document's organization's;
--   * cdisc_prm_studies.program_id — any organization's program until PF-14.
--
-- WHAT. One composite key per table, (key, org) → regulatory_programs (id,
-- organization_id), on the unique index 20260925b introduced (created here too
-- when absent: 20260925b returns before creating it on a lineage without
-- `submissions`, and ADD FOREIGN KEY would then fail with 42830).
--   * NOT VALID — existing rows are not scanned, so a legacy cross-organization
--     row does not fail the deploy. Every row inserted, and every row whose key
--     or organization changes, is checked from here on. A legacy row keeps
--     accepting non-key updates. scripts/db/program-same-org-preflight.mjs lists
--     the legacy rows; clear their keys before any VALIDATE CONSTRAINT.
--   * ON DELETE SET NULL (key) on four stores — the column list, PostgreSQL 15+ (every
--     environment runs 15, see 20260925b). A tenant purge deletes
--     regulatory_programs (server/services/tenant/tenant-offboarding.ts
--     PURGE_CHILD_TABLES) and rethrows anything but 42P01/42703, so a NO ACTION
--     key would abort the purge at the first anchored record. A bare SET NULL
--     would null the organization column too: it is NOT NULL on four tables,
--     and on cre_evidence_sources NULL means GLOBAL_PUBLIC. c2c_documents is
--     the exception: NO ACTION, matching the key it already has (see its
--     block), so a purge must delete c2c_documents first — it already had to.
--   * ON UPDATE NO ACTION (the default) — a program referenced by another
--     organization's records cannot be moved to another organization.
--   * cre_evidence_sources also gets CHECK (client_program_id IS NULL OR
--     organization_id IS NOT NULL): a GLOBAL_PUBLIC source (NULL organization)
--     belongs to no project, and MATCH SIMPLE would never check a NULL-org key.
--   * cdisc_prm_studies.program_id and prm_program_idx are added when absent.
--     A fresh install gets the column from drizzle push (shared/schema.ts); an
--     existing database got it only from db/migrations/20260727_prm_program_link.sql,
--     which is on no applier, and the study-design writer (PF-14) writes it.
--
-- NOT KEYED HERE, deliberately:
--   * vault.documents — program_id is NOT NULL, so only NO ACTION is possible,
--     and in the purge's system scope the vault delete policy matches no rows:
--     the key would make every purge of a tenant with vault documents fail.
--     Handed to D6 (docs/work-orders/README.md).
--   * submission_transmittals — its writers take programId from the request
--     unchecked; a key now turns a cross-organization transmit into a 500.
--     PF-12 carries it with the writer fix.
--
-- RULE 1: replayed on every deploy. Each statement runs only when its object
-- is absent (to_regclass / pg_attribute / pg_constraint), so a replay executes
-- no DDL and takes no lock. One DO block per table, so one table's absence
-- never skips another. No DROP; no COMMENT (the creating files carry the
-- comments, amended in place 2026-09-26 — two replayed writers of one comment
-- would fight).
--
-- Pinned by tests/schema-contract/program-same-org-keys.pglite.test.ts.
-- =============================================================================

DO $mig$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'regulatory_programs absent - PF-04 same-org keys skipped';
    RETURN;
  END IF;
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS regulatory_programs_id_org_uq
      ON public.regulatory_programs (id, organization_id);
  END IF;
END
$mig$;

-- projects (regulatory_program_id, organization_id)
DO $mig$
BEGIN
  IF to_regclass('public.projects') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'projects or regulatory_programs_id_org_uq absent - projects key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.projects'::regclass
                    AND attname = 'regulatory_program_id' AND NOT attisdropped) THEN
    RAISE NOTICE 'projects.regulatory_program_id absent - projects key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_regulatory_program_same_org_fk'
                    AND conrelid = 'public.projects'::regclass) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_regulatory_program_same_org_fk
      FOREIGN KEY (regulatory_program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (regulatory_program_id)
      NOT VALID;
  END IF;
END
$mig$;

-- authoring_documents (client_program_id, tenant_id). The table comes from the
-- authoring subsystem, which deploy-migrate applies before this set.
DO $mig$
BEGIN
  IF to_regclass('public.authoring_documents') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'authoring_documents or regulatory_programs_id_org_uq absent - authoring key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.authoring_documents'::regclass
                    AND attname = 'client_program_id' AND NOT attisdropped) THEN
    RAISE NOTICE 'authoring_documents.client_program_id absent - authoring key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'authoring_documents_program_same_org_fk'
                    AND conrelid = 'public.authoring_documents'::regclass) THEN
    ALTER TABLE public.authoring_documents
      ADD CONSTRAINT authoring_documents_program_same_org_fk
      FOREIGN KEY (client_program_id, tenant_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (client_program_id)
      NOT VALID;
  END IF;
END
$mig$;

-- cre_evidence_sources (client_program_id, organization_id), plus the CHECK.
DO $mig$
BEGIN
  IF to_regclass('public.cre_evidence_sources') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'cre_evidence_sources or regulatory_programs_id_org_uq absent - cre key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.cre_evidence_sources'::regclass
                    AND attname = 'client_program_id' AND NOT attisdropped) THEN
    RAISE NOTICE 'cre_evidence_sources.client_program_id absent - cre key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cre_evidence_sources_program_same_org_fk'
                    AND conrelid = 'public.cre_evidence_sources'::regclass) THEN
    ALTER TABLE public.cre_evidence_sources
      ADD CONSTRAINT cre_evidence_sources_program_same_org_fk
      FOREIGN KEY (client_program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (client_program_id)
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cre_evidence_sources_program_needs_org'
                    AND conrelid = 'public.cre_evidence_sources'::regclass) THEN
    ALTER TABLE public.cre_evidence_sources
      ADD CONSTRAINT cre_evidence_sources_program_needs_org
      CHECK (client_program_id IS NULL OR organization_id IS NOT NULL)
      NOT VALID;
  END IF;
END
$mig$;

-- c2c_documents (project_id, org_id). The column comes from its creator
-- (20260528), which also keeps its own key proving the program exists. That
-- key is NO ACTION, so this one is too: two keys with OPPOSITE delete actions
-- on one column resolve by RI trigger-name order (RI_ConstraintTrigger_a_<oid>,
-- compared as text), so a program delete would un-anchor on one database and
-- refuse on another. A purge deletes c2c_documents before the programs (D6).
-- (Found by review, 2026-09-26, before this file shipped.)
DO $mig$
BEGIN
  IF to_regclass('public.c2c_documents') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'c2c_documents or regulatory_programs_id_org_uq absent - c2c key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_documents_project_same_org_fk'
                    AND conrelid = 'public.c2c_documents'::regclass) THEN
    ALTER TABLE public.c2c_documents
      ADD CONSTRAINT c2c_documents_project_same_org_fk
      FOREIGN KEY (project_id, org_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE NO ACTION
      NOT VALID;
  END IF;
END
$mig$;

-- cdisc_prm_studies (program_id, tenant_id). The column and its index reach the
-- deploy path here; the hand-run link file's unchecked backfill is not carried.
DO $mig$
BEGIN
  IF to_regclass('public.cdisc_prm_studies') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'cdisc_prm_studies or regulatory_programs_id_org_uq absent - study-design key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.cdisc_prm_studies'::regclass
                    AND attname = 'program_id' AND NOT attisdropped) THEN
    ALTER TABLE public.cdisc_prm_studies ADD COLUMN program_id uuid;
  END IF;
  IF to_regclass('public.prm_program_idx') IS NULL THEN
    CREATE INDEX IF NOT EXISTS prm_program_idx ON public.cdisc_prm_studies (program_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cdisc_prm_studies_program_same_org_fk'
                    AND conrelid = 'public.cdisc_prm_studies'::regclass) THEN
    ALTER TABLE public.cdisc_prm_studies
      ADD CONSTRAINT cdisc_prm_studies_program_same_org_fk
      FOREIGN KEY (program_id, tenant_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id)
      NOT VALID;
  END IF;
END
$mig$;
