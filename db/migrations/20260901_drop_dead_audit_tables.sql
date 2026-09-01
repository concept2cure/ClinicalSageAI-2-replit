-- ═══════════════════════════════════════════════════════════════════════════
-- Drop the audit-shaped tables that survived a from-scratch liveness re-check,
-- and ONLY those — refusing, per table, to drop one that holds rows.
--
-- ── What this closes ───────────────────────────────────────────────────────
-- docs/AUDIT_STORE_INVENTORY_2026-08.md §5.1 published a 43-row "delete list
-- for a later slice". This is that slice. It does not execute the published
-- list: the list was re-derived from scratch against the tree as it stands and
-- 24 of the 43 rows FAILED re-verification. Those 24 are named in §5.1 with the
-- evidence, and are deliberately absent from the array below.
--
-- The re-check that overturned them is the one §5.1 did not run: the inventory
-- grepped TypeScript and JavaScript, and these tables are written and read from
-- PL/pgSQL. `compliance.audit_trail` is the clearest case — §5.1 recorded "its
-- only writer is the in-migration function ... `grep -rn log_audit_event server`
-- returns nothing", but the function is named `compliance.write_audit_entry`,
-- server/services/cortexComplianceService.ts:166 calls it on every governed
-- write, and 080_gcc_21cfr_part11_compliance.sql:631 is the INSERT it performs.
-- A grep for the wrong identifier is not evidence of absence.
--
-- ── Safety posture: EMPTY-ONLY, and it fails soft ──────────────────────────
-- These are 21 CFR Part 11-shaped tables. Static analysis over this repo can
-- prove that nothing HERE writes them; it cannot prove that nothing ever did.
-- A retired writer, a one-off backfill, an out-of-repo job, or a restore from a
-- database older than the code all produce the same thing: an audit table with
-- real records and no live writer. Dropping that is a records-retention
-- incident, not a cleanup.
--
-- So the drop is conditional on the only fact a migration can actually
-- establish at run time — whether the table has rows. Each table is dropped
-- only when ALL of these hold on the database in front of it:
--
--   1. it exists and is an ordinary or partitioned table;
--   2. `count(*) = 0`;
--   3. no OTHER table has a foreign key pointing at it;
--   4. nothing else depends on it (view, matview, or any other object) — the
--      DROP is RESTRICT, and a dependency makes it fail rather than cascade.
--
-- Anything that fails a condition is SKIPPED with a NOTICE naming the reason,
-- and the migration still exits 0. A non-empty table therefore survives this
-- migration and needs owner sign-off plus a follow-up before it can go. That is
-- the intended outcome, not a gap: a rerun after the records are dispositioned
-- picks it up with no edit.
--
-- Consequently this file is idempotent by construction. Every table is already
-- guarded by `to_regclass(...) IS NULL -> skip`, so a second run is a no-op,
-- and a run against a database that never had these tables is a no-op too.
--
-- ── Ordering ───────────────────────────────────────────────────────────────
-- Registered in C2C_MIGRATION_FILES immediately before the two tenant-isolation
-- steps that must stay last (check-migration-set-order.mjs pins that pair). It
-- has to sit AFTER every creator in the same set — 081_grdhe (index 112),
-- 20260211_phase6_6e_proof_pack_exports (115) and 20260524_program_workbench
-- (1) all create tables named below — because the set is replayed whole on each
-- deploy and `CREATE TABLE IF NOT EXISTS` would otherwise re-materialise a table
-- this file had already dropped.
--
-- ── The tables that are NOT here, and why ──────────────────────────────────
-- Six survivors are also withheld: document_audit_log, ai_audit_log,
-- qmp_audit_trail, coauthor_import_history, coauthor_status_history and
-- csr_extraction_log are dead in every code path, but each is declared as a
-- `pgTable` on the drizzle push surface (shared/schema.ts and the modules it
-- re-exports). `drizzle-kit push` recreates them on every fresh install, so a
-- SQL-only DROP produces a table that comes back — the deletion that does not
-- delete. Removing them needs the pgTable declarations and their `relations()`
-- entries to go in the same change; that is a typed edit with its own
-- verification and it is tracked in §5.1 rather than half-done here.
--
-- The guard that keeps this true is scripts/ci/check-dead-audit-tables.mjs.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  qualified   text;
  reg         regclass;
  kind        "char";
  n_rows      bigint;
  fk_owner    text;
  dropped     int := 0;
  skipped     int := 0;
  absent      int := 0;
BEGIN
  FOREACH qualified IN ARRAY ARRAY[
    -- public schema
    'public.assumption_history',
    'public.auth_password_history',
    'public.doc_activity_log',
    'public.ind_protocol_history',
    'public.program_activity_log',
    'public.qc_compliance_history',
    'public.relation_extraction_log',
    'public.strategy_audit',
    -- named in §5.1 as a phantom: no DDL anywhere in the repo, referenced only
    -- as a target by three _consolidated/ helper scripts. Listed so a database
    -- that acquired it out of band is cleaned up too; on every database this
    -- repo provisions it is simply absent and this is a no-op.
    'public.vault_document_audit_logs',
    -- non-public schemas
    'audit.request_correlations',
    'cortex.confidence_history',
    'predicate.proof_pack_audit_events',
    'regulatory_harmonization.mapping_rule_history'
  ] LOOP

    reg := to_regclass(qualified);

    IF reg IS NULL THEN
      absent := absent + 1;
      CONTINUE;
    END IF;

    SELECT c.relkind INTO kind FROM pg_class c WHERE c.oid = reg;

    -- 'r' ordinary, 'p' partitioned. Anything else under this name is not the
    -- table the inventory judged, so leave it alone and say so.
    IF kind NOT IN ('r', 'p') THEN
      RAISE NOTICE
        '[dead-audit-drop] keeping % — relkind is %, not a table. Nothing here judged that object.',
        qualified, kind;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- ── The Part 11 condition. Rows mean records, and records have a
    --    retention obligation that no amount of "nothing writes it" discharges.
    EXECUTE format('SELECT count(*) FROM %s', reg::text) INTO n_rows;

    IF n_rows > 0 THEN
      RAISE NOTICE
        '[dead-audit-drop] KEEPING % — % row(s) present. An audit table with records is '
        'evidence under 21 CFR Part 11 §11.10(e), not debris. It needs owner sign-off and a '
        'retention disposition before any drop; re-run this migration afterwards and it will '
        'be picked up with no edit.',
        qualified, n_rows;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- ── Inbound foreign keys. A live table pointing at this one means the
    --    inventory's "zero references" finding is wrong on this database.
    SELECT string_agg(DISTINCT con.conrelid::regclass::text, ', ')
      INTO fk_owner
      FROM pg_constraint con
     WHERE con.confrelid = reg
       AND con.contype   = 'f'
       AND con.conrelid <> reg;   -- a self-FK dies with the table

    IF fk_owner IS NOT NULL THEN
      RAISE NOTICE
        '[dead-audit-drop] keeping % — foreign key(s) from % point at it.',
        qualified, fk_owner;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- ── RESTRICT, never CASCADE. A view, matview, trigger on another relation
    --    or anything else we did not anticipate must stop this table's drop,
    --    not be silently destroyed with it. The handler turns that into a
    --    skip so one surprise cannot abort the whole migration.
    BEGIN
      EXECUTE format('DROP TABLE %s RESTRICT', reg::text);
      dropped := dropped + 1;
    EXCEPTION WHEN dependent_objects_still_exist OR feature_not_supported OR insufficient_privilege THEN
      RAISE NOTICE '[dead-audit-drop] keeping % — DROP RESTRICT refused: %', qualified, SQLERRM;
      skipped := skipped + 1;
    END;

  END LOOP;

  RAISE NOTICE
    '[dead-audit-drop] dropped %, kept % (rows / dependencies / wrong relkind), % already absent.',
    dropped, skipped, absent;
END $$;
