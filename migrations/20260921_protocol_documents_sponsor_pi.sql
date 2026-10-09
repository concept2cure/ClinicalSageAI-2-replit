-- ============================================================================
-- Protocol documents — sponsor and principal investigator (2026-09-21, WO)
-- ============================================================================
--
-- Additive, idempotent, replay-safe (CLAUDE.md RULE 1). Every deploy re-runs
-- every file in C2C_MIGRATION_FILES; this one only ADDs two nullable columns
-- with IF NOT EXISTS and carries no DROP, no backfill and no data rewrite, so
-- a second, tenth or hundredth run is a no-op.
--
-- Why: the Protocol development surface renders a sponsor and a principal
-- investigator in its header, and `pdev-view-assembler` returned '' for both
-- because protocol_documents never stored them (WI findings, 2026-09-21).
-- The study team (protocol_team_members, role = 'principal_investigator')
-- remains the governed roster; the two columns here are the DOCUMENT's own
-- cover-page values, which ICH M11 §1 lists on the title page independently
-- of the roster. The assembler prefers the column and falls back to the
-- roster's PI so a protocol seeded before this column still names its PI.
--
-- Creator of protocol_documents: migrations/20260621_protocol_development.sql,
-- which is on the install-fresh root-tree overlay and NOT in
-- C2C_MIGRATION_FILES. On a database provisioned by the set alone (the C-33
-- blank-database replay) the table does not exist, so the ALTER is guarded on
-- to_regclass and skips with a NOTICE rather than aborting the deploy. On
-- every provisioned database (install-fresh applied 20260621 first) the
-- columns are added once and then re-run as no-ops.
--
-- Rollback (manual, never automated here — RULE 1): amend this file in place;
-- do not append a DROP.
--
-- Schema note: shared/schema/protocol-development.ts is not amended by this
-- change — every reader and writer of these columns is raw SQL
-- (pdev-view-assembler, protocol-development-service); the Drizzle model is
-- unused for protocol_documents writes. Recorded so ci:model-migration-agreement
-- has the reason if it ever covers this table.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.protocol_documents') IS NULL THEN
    RAISE NOTICE 'protocol_documents does not exist on this database (created by the install-fresh overlay, migrations/20260621_protocol_development.sql); sponsor / principal_investigator not added here.';
    RETURN;
  END IF;
  ALTER TABLE public.protocol_documents ADD COLUMN IF NOT EXISTS sponsor TEXT;
  ALTER TABLE public.protocol_documents ADD COLUMN IF NOT EXISTS principal_investigator TEXT;
END
$$;
