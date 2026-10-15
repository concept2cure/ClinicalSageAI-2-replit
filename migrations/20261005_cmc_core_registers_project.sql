-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure CMC — Module 3 source registers
-- Compliance: 21 CFR Part 11 (record integrity, traceability), ALCOA+ (attributable, original)
-- Purpose: File each core CMC register record under the program it belongs to.
--
-- eCTD/CTD Context:
--   - Module(s): Module 3 — 3.2.S.1–3.2.S.7, 3.2.P.1–3.2.P.8 (the sections these registers feed)
--   - Integrity Risk Addressed: one program's drug substance, drug product,
--     stability study, analytical method, process validation or change control
--     composing into another program's Module 3.
--
-- Determinism Contract:
--   - Additive only: a nullable column, an index, and a backfill that writes
--     only rows whose project is NULL and unambiguous. Replay-safe on every
--     deploy (CLAUDE.md RULE 1): the second run finds nothing NULL to fill
--     that the first could fill, and drops nothing.
-- =============================================================================

-- ── The defect (CMC/Module 3 lane, 2026-10-05; discovery map
--    cmc-cross-program-write-through, core-registers-not-project-scoped) ──────
-- drug_substances, drug_products, stability_studies, analytical_methods,
-- process_validation and cmc_change_control carried no program. Their lists
-- were organisation-wide, and a save took its program from the request body.
-- Editing substance #12 (filed under program A) while program B was open
-- upserted cmc_source_objects (B, drug_substance, 'drug_substance:12'), so
-- B's §3.2.S.1/S.3 composed from A's material while A kept a stale copy, and
-- the project's contradiction sweep read every program's methods and
-- stability. The other registers (specifications, batches, container
-- closures, ...) already carry project_id; these six now do too.
--
-- text, as on qc_testing and cmc_source_objects: the program id a write-through
-- keys the canonical layer on.

ALTER TABLE IF EXISTS drug_substances    ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE IF EXISTS drug_products      ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE IF EXISTS stability_studies  ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE IF EXISTS analytical_methods ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE IF EXISTS process_validation ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE IF EXISTS cmc_change_control ADD COLUMN IF NOT EXISTS project_id text;

CREATE INDEX IF NOT EXISTS idx_drug_substances_org_project    ON drug_substances (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_drug_products_org_project      ON drug_products (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_stability_studies_org_project  ON stability_studies (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_analytical_methods_org_project ON analytical_methods (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_process_validation_org_project ON process_validation (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_cmc_change_control_org_project ON cmc_change_control (organization_id, project_id);

-- ── Backfill: the program a record was already filed under ────────────────────
-- A row's canonical source object records the program it was linked into
-- (source_key '<type>:<row id>'). Where exactly ONE program holds a source
-- object for the row, that is its program. Where two do, the row was already
-- forked by the defect above: it is left NULL (unfiled) rather than guessed,
-- and the register shows it as unfiled until someone files it. Only integer
-- keys are read — cmc_change_control.id is an integer, and a uuid-keyed
-- change_control source object belongs to the other change-control store.
DO $$
DECLARE
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('drug_substances', 'drug_substance'),
      ('drug_products', 'drug_product'),
      ('stability_studies', 'stability'),
      ('analytical_methods', 'method'),
      ('process_validation', 'process_validation'),
      ('cmc_change_control', 'change_control')
    ) AS v(tbl, source_type)
  LOOP
    IF to_regclass('public.' || pair.tbl) IS NULL OR to_regclass('public.cmc_source_objects') IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      $sql$
      UPDATE public.%1$I AS t
         SET project_id = one.project_id
        FROM (
          SELECT organization_id,
                 split_part(source_key, ':', 2)::int AS row_id,
                 min(project_id) AS project_id
            FROM public.cmc_source_objects
           WHERE source_type = %2$L
             AND split_part(source_key, ':', 2) ~ '^[0-9]+$'
           GROUP BY organization_id, split_part(source_key, ':', 2)::int
          HAVING count(DISTINCT project_id) = 1
        ) AS one
       WHERE t.project_id IS NULL
         AND t.organization_id = one.organization_id
         AND t.id = one.row_id
      $sql$,
      pair.tbl, pair.source_type
    );
  END LOOP;
END $$;
