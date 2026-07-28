-- authoring_comments: add the eight columns the comments API has always
-- referenced but which no migration ever created.
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- server/routes/authoring.router.ts implements threaded, resolvable, attributed
-- comments — replies via parent_comment_id, author identity via
-- user_name/user_email, resolution via resolution_note/resolved_by/resolved_at,
-- and positional anchoring via position_data. The table
-- (db/migrations/20260725_authoring_document_loop_tables.sql) has none of them:
-- id, section_id, doc_id, body, anchor, status, created_by, tenant_id,
-- created_at, and nothing else.
--
-- PostgreSQL rejects an unknown column at PLAN time, so this was not a
-- degraded feature — GET /docs/:id/comments and its reply sub-query were
-- unconditional 42703 failures on every request. Found by
-- tests/schema-contract/authoring-router-columns.contract.test.ts, which
-- PREPAREs every statement in the router against the real schema.
--
-- ── Why add the columns rather than strip the feature ────────────────────────
-- The code is complete and coherent — it filters top-level comments with
-- `parent_comment_id IS NULL`, fetches replies per thread, and already tolerates
-- a null author name via COALESCE(c.user_name, c.created_by). Nothing about it
-- is speculative; only the DDL is missing. Deleting working feature code to
-- match an incomplete table would be the wrong direction.
--
-- The one comment path that DOES work today — POST /sections/:id/comment, which
-- the live editor uses — inserts only pre-existing columns and is unaffected.
--
-- ── Safety ───────────────────────────────────────────────────────────────────
-- Every column is nullable and additive, so existing rows stay valid and no
-- backfill is required. updated_at defaults to now() for new rows and stays
-- NULL on historical ones, which is honest: we do not know when they were last
-- touched and inventing a value would be worse than an absent one.
--
-- Guarded on the table existing: deploy-migrate runs with stopOnFirstFailure,
-- so an unguarded reference on a database without the authoring bundle would
-- abort the entire migration set.

DO $$
BEGIN
  IF to_regclass('public.authoring_comments') IS NULL THEN
    RAISE NOTICE 'authoring_comments absent; skipping threading columns';
    RETURN;
  END IF;

  ALTER TABLE public.authoring_comments
    ADD COLUMN IF NOT EXISTS user_name         text,
    ADD COLUMN IF NOT EXISTS user_email        text,
    ADD COLUMN IF NOT EXISTS parent_comment_id uuid,
    ADD COLUMN IF NOT EXISTS position_data     jsonb,
    ADD COLUMN IF NOT EXISTS resolution_note   text,
    ADD COLUMN IF NOT EXISTS resolved_by       text,
    ADD COLUMN IF NOT EXISTS resolved_at       timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at        timestamptz;

  -- Self-reference for threading. NOT VALID would be pointless here (the column
  -- is brand new, so every existing row has NULL and trivially satisfies it),
  -- and ON DELETE CASCADE matches how the rest of this bundle treats parentage:
  -- deleting a comment removes its replies rather than orphaning them.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'authoring_comments_parent_fkey'
  ) THEN
    ALTER TABLE public.authoring_comments
      ADD CONSTRAINT authoring_comments_parent_fkey
      FOREIGN KEY (parent_comment_id)
      REFERENCES public.authoring_comments (id) ON DELETE CASCADE;
  END IF;

  -- The threaded read filters top-level comments and then fetches replies per
  -- thread, so this is the access path that query actually uses.
  CREATE INDEX IF NOT EXISTS authoring_comments_parent_idx
    ON public.authoring_comments (parent_comment_id);
END $$;
