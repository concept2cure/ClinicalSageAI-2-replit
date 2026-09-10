-- Sprint 1-4: Stability Results and Exports Tables
-- Migration for comprehensive stability data management
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AMENDED IN PLACE 2026-09-10 (CLAUDE.md Rule 1, WO-1). Three things were
-- removed from this file. All three were replayed on EVERY deploy, because
-- applyMigrationFiles executes every entry of C2C_MIGRATION_FILES
-- unconditionally and this file is entry 600.
--
-- 1. `CREATE TABLE IF NOT EXISTS stab_results (...)` — a SECOND, incompatible
--    definition of a table db/migrations/022_stability_v2.sql already creates.
--    They shared a name and nothing else:
--
--      022 (canonical): result_id UUID PK, study_id/cond_id/tp_id/test_id UUID
--                       with FKs to stab_studies/conditions/timepoints/tests,
--                       value TEXT, remarks, raw_json JSONB
--      030 (removed)  : id SERIAL PK, study_id VARCHAR(50), test_name
--                       VARCHAR(100), condition/timepoint VARCHAR,
--                       value DECIMAL(10,3)
--
--    server/src/routes/stability.router.ts reads and writes the 022 shape —
--    result_id, cond_id, tp_id, test_id, remarks, raw_json. It got that shape
--    only because 022 sits at set position 598 and this file at 600, so 022
--    created the table first and the IF NOT EXISTS here silently no-opped.
--    Reordering the set would have swapped the schema under a live product and
--    broken every stability endpoint with a 42703. Removed so the surviving
--    column set is decided by the repository rather than by list position.
--
-- 2. The `INSERT INTO stab_results (...) VALUES ('STAB-001', 'Assay', ...)`
--    demo rows. Guarded on the existence of a `test_name` column, so they only
--    fired where the wrong definition above had won — dead once (1) is gone,
--    and fixture data in a governed path regardless.
--
-- 3. `INSERT INTO capa (...) VALUES ('STAB-001', 'Investigate Dissolution OOT
--    at ACC 3M', ..., 'Dr. Johnson', ...)` — TWO FABRICATED CAPA RECORDS,
--    INSERTED ON EVERY DEPLOY, FOREVER.
--
--    This one was not a duplication problem, it was a data-integrity one. The
--    statement had no DO-block guard, no WHERE NOT EXISTS and no ON CONFLICT,
--    and `capa.id` is SERIAL, so nothing could dedupe it: each deploy minted two
--    new rows with new ids. CAPA is a corrective-and-preventive-action record —
--    a regulated record — and one of these names a person who does not exist.
--    An estate that has deployed N times carries 2N of them.
--
--    REMOVING THE STATEMENT DOES NOT REMOVE THE ROWS ALREADY WRITTEN. Existing
--    databases need an audit before those rows are deleted, because a customer
--    may have edited or referenced one; that is an operator task with a human
--    decision in it, not something a replayed migration should do silently. See
--    the WO-1 outcome note.
--
-- Which change removed them: WO-1, schema authority. The canonical creator for
-- stab_results is and remains db/migrations/022_stability_v2.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- Exports table for P.8 push functionality
CREATE TABLE IF NOT EXISTS stab_exports (
  id SERIAL PRIMARY KEY,
  study_id VARCHAR(50) NOT NULL,
  export_type VARCHAR(20) NOT NULL, -- 'p8_push', 'pdf_export', etc.
  tokens JSONB NOT NULL,
  markdown TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- CAPA table for OOT/OOS management
CREATE TABLE IF NOT EXISTS capa (
  id SERIAL PRIMARY KEY,
  study_id VARCHAR(50),
  process_id VARCHAR(50),
  title VARCHAR(200) NOT NULL,
  why TEXT NOT NULL,
  owner VARCHAR(100) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'DONE'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Strategy P.3.4 exports table
CREATE TABLE IF NOT EXISTS strategy_p34_exports (
  id SERIAL PRIMARY KEY,
  process_id VARCHAR(50) NOT NULL,
  export_type VARCHAR(20) NOT NULL, -- 'p34_push', 'pdf_export', etc.
  tokens JSONB NOT NULL,
  markdown TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analytical method linking for cross-module integration
CREATE TABLE IF NOT EXISTS method_links (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL, -- 'stability_test', 'strategy_control'
  entity_id VARCHAR(50) NOT NULL,
  method_id INTEGER NOT NULL,
  linked_at TIMESTAMP DEFAULT NOW(),
  linked_by VARCHAR(100) NOT NULL
);

-- Add indexes for performance
--
-- The stab_results index keys on study_id, which BOTH definitions carried and
-- which the canonical 022 shape still has. The former idx_stab_results_test_condition
-- was dropped with the definition that introduced `test_name`: it was guarded on
-- that column existing, and no canonical stab_results has one.
DO $$
BEGIN
  IF to_regclass('public.stab_results') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_stab_results_study_id ON stab_results(study_id);
  END IF;
  IF to_regclass('public.stab_exports') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_stab_exports_study_id ON stab_exports(study_id);
  END IF;
  IF to_regclass('public.capa') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_capa_study_id ON capa(study_id);
    CREATE INDEX IF NOT EXISTS idx_capa_process_id ON capa(process_id);
  END IF;
  IF to_regclass('public.strategy_p34_exports') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_strategy_p34_exports_process_id ON strategy_p34_exports(process_id);
  END IF;
  IF to_regclass('public.method_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_method_links_entity ON method_links(entity_type, entity_id);
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE stab_exports IS 'Export records for P.8 push to authoring functionality';
COMMENT ON TABLE capa IS 'CAPA records linked to stability OOT/OOS investigations';
COMMENT ON TABLE strategy_p34_exports IS 'Strategy P.3.4 export records for push to authoring';
COMMENT ON TABLE method_links IS 'Cross-module analytical method linkages for Sprint 2 integration';
