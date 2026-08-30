-- ═══════════════════════════════════════════════════════════════════════════
-- concept2cure_artifact_versions.updated_at — the column the writer names and
-- no migration creates (GA ledger L38).
--
-- server/services/ana/artifactVersionStore.ts inserts it, twice:
--
--     INSERT INTO concept2cure_artifact_versions (
--       artifact_id, version, content, content_hash,
--       change_description, created_by_id, created_at, updated_at)
--
-- and shared/schema.ts declares it — `updatedAt: timestamp('updated_at')
-- .defaultNow()`. But none of the three migrations that create this table
-- (migrations/0000_sweet_joseph.sql, db/migrations/20260128_concept2cure_foundation.sql,
-- db/migrations/20260311_concept2cure_artifacts.sql) mention it. Note the
-- contrast with its parent: all three DO create updated_at on
-- concept2cure_artifacts. It is only the versions table that was missed, which
-- is why this survived — the neighbouring table looks right.
--
-- So the column exists on a database built by drizzle-push (install-fresh) and
-- does NOT exist on one built from migrations alone, and the failure lands on
-- the second kind — the long-lived deployments, the ones that matter. Verified
-- by dropping the column from a freshly provisioned database and replaying the
-- writer's own column list:
--
--     ERROR: column "updated_at" of relation "concept2cure_artifact_versions"
--            does not exist            (42703)
--
-- That is a governed write: it is the row recording a new version of a filed
-- artifact, so the failure mode is an artifact version that cannot be written
-- at all.
--
-- The ledger states the choice as "either the column joins the migrations or
-- the writer stops naming it". The column joins the migrations, because
-- shared/schema.ts is the canonical schema source on this branch (it is what
-- install-fresh pushes) and it declares the column; making the migrations agree
-- converges the two provisioning paths, whereas removing the writer would leave
-- drizzle-push databases with a column nothing maintains.
--
-- Type, nullability and default are copied from the drizzle model exactly —
-- `timestamp without time zone`, NULL allowed, DEFAULT now() — so a
-- migration-provisioned database ends up with the same shape a pushed one
-- already has, rather than merely a column of the same name.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.concept2cure_artifact_versions') IS NULL THEN
    RAISE NOTICE '[artifact-versions] table not present — nothing to align.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'concept2cure_artifact_versions'
       AND column_name  = 'updated_at'
  ) THEN
    RETURN; -- already aligned (a drizzle-push database, or a re-run)
  END IF;

  ALTER TABLE public.concept2cure_artifact_versions
    ADD COLUMN updated_at timestamp DEFAULT now();

  RAISE NOTICE '[artifact-versions] added updated_at to match shared/schema.ts.';
END $$;
