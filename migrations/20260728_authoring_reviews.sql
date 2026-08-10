-- authoring_reviews: the document review/approval ledger the router has always
-- written and no migration ever created.
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- server/routes/authoring.router.ts implements a complete review cycle:
--
--   GET  /documents/:id/reviews        list reviews + pending/approved/rejected
--                                      counts, and the canApprove verdict
--   POST /documents/:id/review         submit or update this reviewer's verdict
--   POST /documents/:id/request-review request review from named reviewers
--
-- The table exists nowhere: not in migrations/, not in db/migrations/, not in
-- shared/schema.ts, and not among the router's own runtime CREATE TABLE
-- helpers. PostgreSQL rejects an unknown relation at plan time, so all three
-- endpoints were unconditional 42P01 failures — document review has never once
-- worked. Found by tests/schema-contract/authoring-router-columns.contract.test.ts,
-- which PREPAREs every statement in the router against the real schema.
--
-- ── Why create it rather than delete the feature ─────────────────────────────
-- Seven of the eight tables that gate scanned as missing were resolved the
-- other way in this change — deleted, or repointed at a ledger that does exist
-- — because their endpoints had no caller and, in the AI-scoring cases,
-- persisted numbers derived from keyword regexes. This one is different on both
-- counts. Review-and-approve is not optional in a regulated authoring product;
-- it is the control that makes an approval attributable. And the handler code
-- is complete and already correct on the properties that matter: the reviewer's
-- identity comes from the verified JWT (never a header or the body), and every
-- statement is tenant-scoped. Only the DDL is missing.
--
-- No UI reaches these endpoints yet. That is stated plainly rather than papered
-- over: this migration makes the server side real and attributable; wiring a
-- review panel is separate work.
--
-- ── Column derivation ────────────────────────────────────────────────────────
-- Code-derived, like 20260725_authoring_audit_trail.sql. Every column below
-- appears in the router's own INSERT column lists or its full-column SELECT:
--
--   SELECT id, doc_id, reviewer_id, reviewer_name, reviewer_email,
--          review_status, review_comments, reviewed_at, requested_at,
--          requested_by, created_at, updated_at, tenant_id
--
-- reviewer_id is TEXT, not uuid: it holds getActorId(req)'s string on the
-- submit path and a caller-supplied reviewer id on the request path, and a uuid
-- column would turn a non-uuid id into a 22P02 cast error rather than a row.
--
-- requested_at carries a default because the submit path INSERTs without it
-- while the list endpoint orders by it; a NULL there would sort unpredictably.
--
-- ── The unique key is a security boundary, not a convenience ─────────────────
-- POST /documents/:id/request-review upserts with
-- `ON CONFLICT (doc_id, reviewer_id, tenant_id)`. Uniqueness is what ON CONFLICT
-- arbitrates against, so the key must include tenant_id — an org-blind key would
-- let one tenant's upsert land on another tenant's review row, which is the
-- exact defect migrations/20260728_cmc_module3_org_scoped_uniqueness.sql exists
-- to fix elsewhere in this schema. It is stated here so the constraint is never
-- "simplified" to (doc_id, reviewer_id).
--
-- ── Safety ───────────────────────────────────────────────────────────────────
-- New table, starts empty, no backfill. Guarded on authoring_documents: the
-- deploy applier runs with stopOnFirstFailure, so an unguarded FK to a table
-- that is absent on a database without the authoring bundle would abort the
-- whole migration set rather than skipping one file.
--
-- Rollback: DROP TABLE IF EXISTS authoring_reviews;

DO $$
BEGIN
  IF to_regclass('public.authoring_documents') IS NULL THEN
    RAISE NOTICE 'authoring_documents absent; skipping authoring_reviews';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.authoring_reviews (
    id              uuid PRIMARY KEY,
    doc_id          uuid NOT NULL
                      REFERENCES public.authoring_documents(id) ON DELETE CASCADE,
    -- Reviewer identity. reviewer_id is the verified actor on the submit path.
    reviewer_id     text NOT NULL,
    reviewer_name   text,
    reviewer_email  text,
    -- The four values the list endpoint counts, plus nothing else: an
    -- unrecognised status would silently vanish from every tally it computes.
    review_status   text NOT NULL DEFAULT 'pending'
                      CHECK (review_status IN
                             ('pending', 'approved', 'rejected', 'changes_requested')),
    review_comments text,
    reviewed_at     timestamptz,
    requested_at    timestamptz NOT NULL DEFAULT now(),
    requested_by    text,
    tenant_id       integer NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
  );

  -- Tenant-scoped, for the reason set out above.
  CREATE UNIQUE INDEX IF NOT EXISTS authoring_reviews_doc_reviewer_tenant_key
    ON public.authoring_reviews (doc_id, reviewer_id, tenant_id);

  -- The list endpoint's access pattern: this document's reviews, newest
  -- request first, always within a tenant.
  CREATE INDEX IF NOT EXISTS authoring_reviews_doc_idx
    ON public.authoring_reviews (doc_id, tenant_id, requested_at DESC);
END $$;
