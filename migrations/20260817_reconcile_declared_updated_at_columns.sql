-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: add timestamp columns that one provisioning path declares and the
--          other never created, so both paths converge on the same shape.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (submission orchestration + governed artifact
--     registry), Module 2/5 via cerv2_section_versions.
--   - Integrity Risk Addressed: a column present on one provisioning path and
--     absent on the other. PostgreSQL rejects an unknown column at PLAN time
--     (42703), so the affected statements failed 100% of the time on one kind of
--     database and passed on the other — governed export placement, CERv2
--     section creation, and (added 2026-09-10) advancing a submission
--     orchestrator run past its first write.
--
-- Determinism Contract:
--   - Additive only. No column is dropped, retyped or renamed, so existing
--     evidence pointers keep resolving.
--   - ADD COLUMN IF NOT EXISTS with a non-volatile DEFAULT: idempotent under
--     CLAUDE.md RULE 1 replay, and on PG11+ a catalog-only change rather than a
--     table rewrite.
--
-- Notes:
--   - Each table is guarded on its own existence: deploy-migrate runs with
--     stopOnFirstFailure, so an environment provisioned without one of these
--     bundles must no-op rather than abort the whole run.
--   - Header added 2026-09-10. This file predates require-migration-headers.sh
--     covering the root migrations/ tree, so it was never in that gate's
--     changed-files scope until it was next edited.
-- =============================================================================

-- Reconcile two `updated_at` columns the declared schema has and the SQL
-- lineage never created.
--
-- ── The split this closes ─────────────────────────────────────────────────────
-- This repo provisions databases two ways, and they disagreed:
--
--   drizzle push        derives the schema from shared/schema.ts
--   deploy-migrate      applies scripts/db/migration-set.mjs, in order
--
-- Deployment runs the SECOND one. `shared/schema.ts` declares
--
--     concept2cure_artifact_versions.updated_at   (timestamp, defaultNow, nullable)
--     cerv2_section_versions.updated_at           (timestamp, defaultNow, nullable)
--
-- and raw INSERTs enumerate both, but no migration in either lineage creates
-- them — not migrations/0000_sweet_joseph.sql, not
-- db/migrations/20260128_concept2cure_foundation.sql, not
-- db/migrations/20260311_concept2cure_artifacts.sql.
--
-- PostgreSQL rejects an unknown column at PLAN time (42703), so those statements
-- failed 100% of the time on a migration-provisioned database while passing on a
-- drizzle-push one. What that cost, concretely:
--
--   • Every governed export that reached artifact-registry placement — 510(k),
--     CER and IND-form alike — rolled back with 500 GOVERNED_EXPORT_FAILED.
--     Fail-closed, so nothing was half-registered, but the governed artifact
--     registry could not be written AT ALL.
--   • Every POST /api/cerv2-sections answered 500 "Failed to create section".
--
-- The device-510(k) golden journey found both and granted the columns as
-- TEST-ONLY sql so the rest of the journey could run, recording that
-- "reconciliation is a schema decision, not a test fix". This is that decision;
-- the test-only grants are removed in the same change, so the journey now
-- proves the deploy path provides these columns rather than papering over it.
--
-- ── Why this direction ────────────────────────────────────────────────────────
-- Two divergences were found and they are NOT the same defect, so they are not
-- fixed the same way:
--
--   Declared in shared/schema.ts, missing from SQL  → the lineage is behind.
--     Add the column. That is this file.
--
--   Named by code but declared NOWHERE — not in SQL, not in drizzle
--     (concept2cure_provenance_events.updated_at, and
--     regulatory_audit_logs.created_at/.updated_at) → the CODE is wrong.
--     Those column lists were corrected instead; adding the columns would have
--     made an append-only provenance row look mutable, which is the opposite of
--     what it is.
--
-- ── Shape ─────────────────────────────────────────────────────────────────────
-- ADD COLUMN IF NOT EXISTS, nullable, DEFAULT now(): additive, idempotent, and
-- safe on tables that already hold rows — the default backfills them and no
-- existing statement breaks. Matches the drizzle declarations exactly (neither
-- is NOT NULL), so the two provisioning paths converge instead of diverging in a
-- new direction.
--
-- Each table is guarded on its own existence: deploy-migrate runs with
-- stopOnFirstFailure, so an environment provisioned without one of these bundles
-- must no-op rather than abort the whole run.

DO $do$
BEGIN
  IF to_regclass('public.concept2cure_artifact_versions') IS NOT NULL THEN
    ALTER TABLE concept2cure_artifact_versions
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
  ELSE
    RAISE NOTICE 'concept2cure_artifact_versions absent — skipping updated_at reconciliation';
  END IF;

  IF to_regclass('public.cerv2_section_versions') IS NOT NULL THEN
    ALTER TABLE cerv2_section_versions
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
  ELSE
    RAISE NOTICE 'cerv2_section_versions absent — skipping updated_at reconciliation';
  END IF;

  -- ── 2026-09-10: A THIRD DIRECTION, and it is the reverse of the two above ──
  -- The header lists two cases: the SQL lineage behind the drizzle declaration
  -- (this file's original subject), and code naming a column declared nowhere
  -- (fixed in the code). `submission_orchestrator_runs` is neither.
  --
  -- Here BOTH SQL definitions declare the columns —
  -- db/migrations/20260725_submission_orchestrator_store_port.sql:74 and
  -- migrations/0018_submission_orchestrator.sql — and `shared/schema/submissions.ts`
  -- omitted them. So DRIZZLE PUSH was behind, and push runs at install-fresh
  -- step 2, BEFORE the overlay. Push therefore created the table without the
  -- columns and both `CREATE TABLE IF NOT EXISTS` statements became no-ops,
  -- which is why every freshly provisioned database has a 13-column table while
  -- the files that describe it declare 15.
  --
  -- WHAT THAT BROKE, reproduced on a database built from empty by
  -- scripts/db/provision-test-db.sh:
  --
  --     INSERT INTO submission_orchestrator_runs (...) VALUES (...);   -- INSERT 0 1
  --     UPDATE submission_orchestrator_runs SET status='complete' ...;
  --     ERROR:  record "new" has no field "updated_at"
  --     CONTEXT: PL/pgSQL assignment "NEW.updated_at = NOW()"
  --              PL/pgSQL function submission_orchestrator_runs_set_updated_at()
  --
  -- 0018 installs `trg_orchestrator_runs_updated_at` on a table push created
  -- without the column the trigger writes. The trigger is BEFORE UPDATE only, so
  -- the first INSERT succeeds — but persistRun
  -- (server/services/submission-package-orchestrator.ts:1014) uses
  -- ON CONFLICT (run_id) DO UPDATE, which every step-write and every resume
  -- takes, and 42703 is in its own SCHEMA_SHAPE_ERROR_CODES so it re-throws.
  -- A submission orchestrator run could be STARTED and never advanced or
  -- completed. The C-19 contract test could not see it: it applies the port to a
  -- bare PGlite and never applies push, so it only ever exercises the shape that
  -- works.
  --
  -- shared/schema/submissions.ts now declares both columns, which fixes future
  -- fresh installs at the push step. This ALTER is what converges the databases
  -- that already exist — per CLAUDE.md's convergence rule, editing a
  -- CREATE TABLE repairs nothing that is already there.
  --
  -- TIMESTAMPTZ NOT NULL DEFAULT now() to match the two SQL definitions exactly
  -- rather than the nullable TIMESTAMP used above; on PG11+ ADD COLUMN with a
  -- non-volatile default is a catalog-only change, so this does not rewrite the
  -- table.
  IF to_regclass('public.submission_orchestrator_runs') IS NOT NULL THEN
    ALTER TABLE submission_orchestrator_runs
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  ELSE
    RAISE NOTICE 'submission_orchestrator_runs absent — skipping timestamp reconciliation';
  END IF;
END
$do$;
