-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Reconcile tables that ALREADY EXIST on provisioned databases with a
--          non-canonical uuid identity, so the corrected definitions can land.
--
-- eCTD/CTD Context:
--   - Module(s): all (data atoms and AI provenance underpin cited evidence)
--   - Integrity Risk Addressed: a corrected CREATE TABLE IF NOT EXISTS is a
--     NO-OP on a database where the table already exists in the broken shape —
--     the fix ships and changes nothing
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - NEVER destroy populated audit data to satisfy a type change.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================
--
-- Ledger C-40. MUST run BEFORE the two migrations it unblocks.
--
-- THE GAP THIS CLOSES. C-36 corrected the enhanced-cortex atom keys (uuid →
-- integer, matching the canonical `serial` lumen_data_atoms.id) and C-38 did the
-- same for ai_provider_audit_log. Both fixes are expressed as
-- `CREATE TABLE IF NOT EXISTS` — which is exactly right for a database that does
-- not have the table, and does NOTHING for one that does.
--
-- And at least one real database does. reports/phase0/db_inventory.txt (a
-- snapshot of `neondb`) lists ai_provider_audit_log, lumen_knowledge_graph_edges
-- and lumen_atom_versions among its public tables. On that database the corrected
-- migrations are silent no-ops: the uuid columns survive, the foreign keys still
-- cannot be created, and the services still cannot join or insert. The fix would
-- have shipped and changed nothing — the same "merged, green, never applied"
-- shape this whole ledger is about, one level deeper.
--
-- WHY DROP-AND-RECREATE, AND WHY ONLY WHEN EMPTY.
-- uuid → integer has no meaningful cast: the stored uuids do not correspond to
-- any integer atom or organization id, so they carry no recoverable information.
-- The columns also sit under indexes and (for the audit log) a view and a
-- function, so an in-place ALTER would need those torn down and rebuilt.
--
-- Dropping a table is only acceptable when it holds nothing, so every branch here
-- is guarded on `NOT EXISTS (SELECT 1 FROM <table> LIMIT 1)`:
--   • EMPTY  → DROP ... CASCADE. The very next migrations recreate it with the
--              canonical shape. No data is lost because there is none.
--   • POPULATED → leave it exactly as it is and RAISE a loud NOTICE naming the
--              table. ai_provider_audit_log is an AUDIT table; silently nulling
--              or discarding its attribution to satisfy a type change is precisely
--              what 21 CFR Part 11 §11.10(e) forbids. A human decides that, with a
--              reviewed data-migration — not a deploy script at 3am.
--
-- Deliberately NOT a rollback of anything: on a database with the correct shape
-- already (or none at all) every branch is skipped and this file is a no-op.

DO $$
DECLARE
  -- table_name, column_name, the type it must NOT be
  rec        RECORD;
  is_empty   BOOLEAN;
  cur_type   TEXT;
  dropped    INT := 0;
  preserved  INT := 0;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      -- C-36: atom references must match lumen_data_atoms.id (serial/integer)
      ('lumen_knowledge_graph_edges', 'source_atom_id'),
      ('lumen_atom_versions',         'atom_id'),
      ('lumen_atom_citations',        'atom_id'),
      ('lumen_atom_conflicts',        'atom_a_id'),
      ('lumen_atom_quality_scores',   'atom_id'),
      ('embedding_audit_log',         'atom_id'),
      -- C-38: AI provenance must match organizations.id / users.id / projects.id
      ('ai_provider_audit_log',       'organization_id')
    ) AS t(tbl, col)
  LOOP
    SELECT data_type INTO cur_type
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = rec.tbl AND column_name = rec.col;

    -- Absent table, or already the canonical integer shape: nothing to do.
    CONTINUE WHEN cur_type IS NULL OR cur_type IN ('integer', 'bigint', 'smallint');

    EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM public.%I LIMIT 1)', rec.tbl) INTO is_empty;

    IF is_empty THEN
      -- CASCADE also removes the dependent view/function/indexes; the migrations
      -- that follow recreate every one of them in the canonical shape.
      EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', rec.tbl);
      dropped := dropped + 1;
      RAISE NOTICE '[c2c/C-40] % had non-canonical %.% (%) and was EMPTY — dropped for recreation with the canonical integer key',
        rec.tbl, rec.tbl, rec.col, cur_type;
    ELSE
      preserved := preserved + 1;
      RAISE WARNING '[c2c/C-40] % has non-canonical %.% (%) and CONTAINS ROWS — left untouched. Its writers/joins will keep failing until a reviewed data migration converts it. Deliberate: discarding populated audit attribution to satisfy a type change is not something a deploy may do (21 CFR Part 11 §11.10(e)).',
        rec.tbl, rec.tbl, rec.col, cur_type;
    END IF;
  END LOOP;

  RAISE NOTICE '[c2c/C-40] identity reconciliation: % empty table(s) dropped for recreation, % populated table(s) preserved for human review',
    dropped, preserved;
END $$;
