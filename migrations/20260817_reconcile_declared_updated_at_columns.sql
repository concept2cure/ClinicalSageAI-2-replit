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
END
$do$;
