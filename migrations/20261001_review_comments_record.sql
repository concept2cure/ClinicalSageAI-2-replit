-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 §11.10(c), (e); EU Annex 11 §9; ALCOA+
-- Purpose: A review comment's words, author and place are fixed once it is
--          posted. A retraction is recorded, never a rewrite or a removal.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (the Review surface's threads on artifacts)
--   - Integrity Risk Addressed: a reviewer's comment, or a change request,
--     rewritten or removed after the fact with no record of what it said
--
-- Determinism Contract:
--   - Additive and idempotent: CREATE OR REPLACE functions, triggers only when
--     absent. No DROP (CLAUDE.md Rule 1).
--
-- Notes:
--   - Rows D5, 2026-10-01. Evidence:
--     docs/evidence/D5-ANA-RECORD/2026-10-01-review-comments/.
-- =============================================================================
--
-- What existed before this file. concept2cure_thread_comments holds the
-- comments and change requests on review threads, the Review launch surface
-- (client/src/concept2cure/v2/surfaces/ReviewThreads.tsx). The runtime role
-- could rewrite a comment's body (PATCH /api/concept2cure/review-comments/:id
-- overwrote it and set edited_at). It could soft-delete one. The GDPR erasure
-- overwrote every comment a person had written. No trigger stopped any of it,
-- nothing kept the earlier words, and no act on a comment was chained.
--
-- Policy, the authoring comments' policy (20260730_authoring_comments_router_columns.sql):
--   * Fixed once posted: the words (body), who wrote them (author_id,
--     author_name, author_role), what kind (kind), where (comment_id, org_id,
--     thread_id, artifact_id, version_id, parent_comment_id) and when
--     (created_at, edited_at).
--   * deleted_at is set once, NULL to a time: a retraction. It hides the comment
--     from the thread and keeps its words. The writer records it on the chain.
--   * A comment cannot be deleted on its own, by any role: a direct DELETE is
--     refused, and so is TRUNCATE. It goes only with what it belongs to, by the
--     ON DELETE CASCADE from its thread, its artifact or their project
--     (pg_trigger_depth() > 1: the referential action's DELETE runs inside the
--     parent's trigger). Those deletes are governed where they happen. A
--     project whose artifacts carry review comments holds records and is not
--     hard-deleted (server/services/c2c/project-retention.ts, PF-08). The
--     tenant purge removes the tenant's projects. And the comment's words and
--     hash are on its chained audit_logs row, which outlives all of them.
--   * A correction is a reply. The record is the sequence of comments.
--
-- The writer: server/routes/c2c/review-comment-record.ts. Each comment and each
-- retraction commits with a chained audit_logs row carrying the words and their
-- sha256. The GDPR erasure keeps these comments under Art. 17(3)(b), as it keeps
-- the artifacts they are about (command-executor.ts, GDPR_RETENTION_LEGAL_BASIS).
-- The triggers are on EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS: a production boot
-- refuses without them, and the daily sweep alarms.
-- =============================================================================

DO $review$
BEGIN
  IF to_regclass('public.concept2cure_thread_comments') IS NULL THEN
    RAISE NOTICE 'concept2cure_thread_comments not present - review comment guard not installed';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.c2c_review_comment_record_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    o jsonb;
    n jsonb;
    col text;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      -- The cascade from the comment's thread, artifact or project: allowed.
      IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review comment % is part of the review record and cannot be deleted (21 CFR 11.10(c)). Retract it instead.', OLD.comment_id
        USING ERRCODE = 'raise_exception';
    END IF;
    o := to_jsonb(OLD);
    n := to_jsonb(NEW);
    FOREACH col IN ARRAY ARRAY['comment_id', 'org_id', 'thread_id', 'artifact_id', 'version_id',
                               'parent_comment_id', 'author_id', 'author_name', 'author_role',
                               'body', 'kind', 'created_at', 'edited_at'] LOOP
      IF o ? col AND (o -> col) IS DISTINCT FROM (n -> col) THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review comment %''s % is fixed once posted (21 CFR 11.10(e)). Post a reply with the correction.', OLD.comment_id, col
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: review comment % is already retracted (21 CFR 11.10(e)).', OLD.comment_id
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.c2c_review_comment_truncate_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: concept2cure_thread_comments holds the review record and cannot be truncated (21 CFR 11.10(c)).'
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.concept2cure_thread_comments'::regclass
       AND tgname = 'trg_c2c_review_comment_record_guard'
  ) THEN
    CREATE TRIGGER trg_c2c_review_comment_record_guard
      BEFORE UPDATE OR DELETE ON public.concept2cure_thread_comments
      FOR EACH ROW EXECUTE FUNCTION public.c2c_review_comment_record_guard();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.concept2cure_thread_comments'::regclass
       AND tgname = 'trg_c2c_review_comment_no_truncate'
  ) THEN
    CREATE TRIGGER trg_c2c_review_comment_no_truncate
      BEFORE TRUNCATE ON public.concept2cure_thread_comments
      FOR EACH STATEMENT EXECUTE FUNCTION public.c2c_review_comment_truncate_guard();
  END IF;
END
$review$;
