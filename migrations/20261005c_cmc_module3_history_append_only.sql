-- ============================================================================
-- 20261005c_cmc_module3_history_append_only.sql
--
-- 21 CFR Part 11 §11.10(e) / §11.70; EU Annex 11 §9: the Module 3 signed
-- section snapshots and the Module 3 provenance trail are append-only in the
-- database, not by convention.
--
-- WHY (GA security review 2026-10-05, DP-84; rows D2, D5, D6; evidence
-- docs/evidence/CMC-M3-GA/2026-10-05/19-module3-history-append-only/):
--   cmc_module3_section_versions holds the snapshot a section approval signs
--   (its content digest is what the electronic_signatures row binds), and
--   cmc_provenance_events holds who compiled, approved, placed, linked and
--   resolved what. Neither carried a trigger, and the runtime role holds
--   UPDATE and DELETE on every public table. Reproduced on PostgreSQL 16 as
--   app_service (NOSUPERUSER NOBYPASSRLS), under RLS, in its own tenant:
--   UPDATE 1 and DELETE 1 on a signed snapshot and on a provenance event.
--
--   table                         created by
--   cmc_module3_section_versions  db/migrations/20260401_cmc_convergence_os.sql
--   cmc_provenance_events         db/migrations/20260401_cmc_convergence_os.sql
--
-- POLICY: strictly append-only. UPDATE and DELETE refused per row, TRUNCATE
-- per statement, for every role. A correction is a new row: a recompile writes
-- a new section version, a resolution writes a new provenance event.
--
-- NO DOOR, BECAUSE NO PATH NEEDS ONE. Census of 2026-10-05 (server/, shared/,
-- scripts/, both appliers' files): every writer INSERTs and nothing else —
--   cmc_module3_section_versions  api/cmc/module3OperatingSystemRoutes.ts (section approval)
--   cmc_provenance_events         api/cmc/module3OperatingSystemRoutes.ts (approval),
--                                 services/cmc/module3-compile.ts (compile),
--                                 services/cmc-write-through.ts (register write-through),
--                                 services/cmc/contradiction-lifecycle.ts (resolution),
--                                 services/cmc/place-module3-into-submission.ts (placement),
--                                 services/module3-convergence-service.ts (two)
-- No UPDATE, DELETE, TRUNCATE, upsert or FOR UPDATE of either; no migration on
-- either applier mutates their rows; the tenant purge (PURGE_CHILD_TABLES,
-- server/services/tenant/tenant-offboarding.ts) lists neither. Only test
-- fixtures delete them. A purge that must remove them gets a door then, as the
-- turn records' did (06152498), not a hole now.
--
-- CASCADE. cmc_module3_section_versions.section_id → cmc_module3_sections
-- ON DELETE CASCADE. Nothing deletes a section. With this trigger, deleting a
-- section that HAS signed versions is refused with them: the snapshot outlives
-- the section row, as 20260929 applies to an artifact's signatures.
--
-- Reuses public.domain_history_append_only() from
-- migrations/20261001_domain_history_append_only.sql (earlier in this set): one
-- refusal for every append-only domain store, with the table's name in it.
--
-- Idempotent and replay-safe (CLAUDE.md Rule 1): per table DROP TRIGGER IF
-- EXISTS of this file's own names, then CREATE TRIGGER, so each deploy also
-- re-arms a trigger someone disabled. Each table guarded with to_regclass.
-- Creates no table and drops nothing another file creates.
-- The runtime role's ceiling (SELECT, INSERT) is APPEND_ONLY_TABLES in
-- scripts/db/provision-app-role.mjs.
-- Pinned by tests/db/cmc-module3-history-append-only.dbtest.ts.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.domain_history_append_only()') IS NULL THEN
    RAISE EXCEPTION '[cmc-m3-append-only] public.domain_history_append_only() is missing: 20261001_domain_history_append_only.sql must run first.';
  END IF;
END;
$$;

-- ── cmc_module3_section_versions ────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.cmc_module3_section_versions') IS NULL THEN
    RAISE NOTICE '[cmc-m3-append-only] public.cmc_module3_section_versions not present — nothing to protect.';
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_cmc_module3_section_versions_append_only ON public.cmc_module3_section_versions;
  CREATE TRIGGER trg_cmc_module3_section_versions_append_only
    BEFORE UPDATE OR DELETE ON public.cmc_module3_section_versions
    FOR EACH ROW EXECUTE FUNCTION public.domain_history_append_only();
  DROP TRIGGER IF EXISTS trg_cmc_module3_section_versions_no_truncate ON public.cmc_module3_section_versions;
  CREATE TRIGGER trg_cmc_module3_section_versions_no_truncate
    BEFORE TRUNCATE ON public.cmc_module3_section_versions
    FOR EACH STATEMENT EXECUTE FUNCTION public.domain_history_append_only();
END;
$$;

-- ── cmc_provenance_events ───────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.cmc_provenance_events') IS NULL THEN
    RAISE NOTICE '[cmc-m3-append-only] public.cmc_provenance_events not present — nothing to protect.';
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_cmc_provenance_events_append_only ON public.cmc_provenance_events;
  CREATE TRIGGER trg_cmc_provenance_events_append_only
    BEFORE UPDATE OR DELETE ON public.cmc_provenance_events
    FOR EACH ROW EXECUTE FUNCTION public.domain_history_append_only();
  DROP TRIGGER IF EXISTS trg_cmc_provenance_events_no_truncate ON public.cmc_provenance_events;
  CREATE TRIGGER trg_cmc_provenance_events_no_truncate
    BEFORE TRUNCATE ON public.cmc_provenance_events
    FOR EACH STATEMENT EXECUTE FUNCTION public.domain_history_append_only();
END;
$$;
