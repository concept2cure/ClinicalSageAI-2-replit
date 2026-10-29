-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure regulatory evidence and governed workflow platform
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: The organisation's saved queries: precedent searches and Vault saved
--          views (personal or organisation-wide). A row stores search parameters
--          only. It is not a governed record and changes none.
--
-- eCTD/CTD Context:
--   - Module(s): none directly. A Vault view re-reads Module 1-5 documents through
--     the governed Vault search, under the reader's current access, when applied.
--   - Integrity Risk Addressed: a saved view caching results or counts
--     (spq_vault_view_shape); a project view naming another organisation's
--     project (spq_program_same_org_fk).
--
-- Determinism Contract:
--   - Replay-safe: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, and type
--     changes, constraints and indexes applied only when absent. Nothing is dropped.
--   - Existing precedent rows keep their content and read as surface 'precedent',
--     visibility 'org_public' (what they already are: every member sees them).
--
-- Notes:
--   - AMENDED IN PLACE 2026-10-29 (D2, Vault saved views, P-46;
--     docs/design/VAULT_SAVED_VIEWS_2026-10-29.md), under CLAUDE.md Rule 1:
--       * put on the deploy path (C2C_MIGRATION_FILES); it was install-fresh only;
--       * adds surface, visibility, program_id, updated_by;
--       * scope json -> jsonb, and created_at/updated_at/last_run_at -> timestamptz
--         read as UTC, each only where the column still has the old type
--         (install-fresh's drizzle push made scope json and the timestamps naive);
--       * adds spq_surface_known, spq_visibility_known, spq_precedent_shape,
--         spq_vault_view_shape, spq_program_same_org_fk and spq_vault_list_idx;
--       * removes nothing.
--   - spq_precedent_shape fixes precedent rows to visibility 'org_public' and no
--     project. Widening it is a replacement conditional on pg_get_constraintdef
--     (Rule 1, first corollary), never an unconditional DROP/ADD.
--   - This file is the only creator of the CHECKs and the project key (the Drizzle
--     model declares none), so a developer push that drops one is undone by the
--     next run of the set.
--   - Ordering: install-fresh's overlay reaches this file before
--     20260524_program_workbench_schema.sql. The key block raises 42P01 while
--     regulatory_programs is absent, which the overlay defers to its next pass.
-- =============================================================================
-- Originally (2026-05-05): mirrors shared/schema.ts savedPrecedentQueries; backs
-- the PrecedentSurface "Saved queries" panel.

BEGIN;

CREATE TABLE IF NOT EXISTS saved_precedent_queries (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id),
  user_id          integer REFERENCES users(id),
  label            text NOT NULL,
  query            text NOT NULL,
  scope            jsonb,
  hits             integer NOT NULL DEFAULT -1,
  last_run_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  surface          text NOT NULL DEFAULT 'precedent',
  visibility       text NOT NULL DEFAULT 'org_public',
  program_id       uuid,
  updated_by       integer
);

CREATE INDEX IF NOT EXISTS spq_org_idx  ON saved_precedent_queries (organization_id);
CREATE INDEX IF NOT EXISTS spq_user_idx ON saved_precedent_queries (user_id);

ALTER TABLE saved_precedent_queries ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'precedent';
ALTER TABLE saved_precedent_queries ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'org_public';
ALTER TABLE saved_precedent_queries ADD COLUMN IF NOT EXISTS program_id uuid;
ALTER TABLE saved_precedent_queries ADD COLUMN IF NOT EXISTS updated_by integer;

DO $spq_types$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'saved_precedent_queries'
                AND column_name = 'scope' AND data_type = 'json') THEN
    ALTER TABLE public.saved_precedent_queries ALTER COLUMN scope TYPE jsonb USING scope::jsonb;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'saved_precedent_queries'
                AND column_name = 'created_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE public.saved_precedent_queries
      ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'saved_precedent_queries'
                AND column_name = 'updated_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE public.saved_precedent_queries
      ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'saved_precedent_queries'
                AND column_name = 'last_run_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE public.saved_precedent_queries
      ALTER COLUMN last_run_at TYPE timestamptz USING last_run_at AT TIME ZONE 'UTC';
  END IF;
END
$spq_types$;

DO $spq_keys$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE EXCEPTION 'relation "public.regulatory_programs" does not exist (saved views project key); apply its creator first'
      USING ERRCODE = 'undefined_table';
  END IF;
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX regulatory_programs_id_org_uq
      ON public.regulatory_programs (id, organization_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_surface_known') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_surface_known CHECK (surface IN ('precedent', 'vault'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_visibility_known') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_visibility_known CHECK (visibility IN ('private', 'org_public'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_precedent_shape') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_precedent_shape
      CHECK (surface <> 'precedent' OR (visibility = 'org_public' AND program_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_vault_view_shape') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_vault_view_shape CHECK (surface <> 'vault' OR (
            user_id IS NOT NULL
        AND hits = -1
        AND last_run_at IS NULL
        AND COALESCE(jsonb_typeof(scope), '') = 'object'
        AND COALESCE(jsonb_typeof(scope -> 'filters'), '') = 'object'
        AND COALESCE(jsonb_typeof(scope -> 'includeSuperseded'), '') = 'boolean'
        AND COALESCE((scope - 'v' - 'filters' - 'includeSuperseded') = '{}'::jsonb, false)
        AND COALESCE(((scope -> 'filters') - 'documentType' - 'classification' - 'evidenceKind'
                      - 'folderId' - 'placementStatus' - 'ctdSection' - 'lifecycleStage') = '{}'::jsonb, false)
        AND (program_id IS NOT NULL OR NOT COALESCE((scope -> 'filters') ? 'folderId', false))
        AND btrim(label) <> ''
        AND char_length(label) <= 120
        AND char_length(query) <= 500));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_program_same_org_fk') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.spq_vault_list_idx') IS NULL THEN
    CREATE INDEX spq_vault_list_idx
      ON public.saved_precedent_queries (organization_id, surface, program_id);
  END IF;
END
$spq_keys$;

COMMIT;
