-- ============================================================================
-- document_span_lineage — a fourth provenance kind: machine_draft
-- (a machine drafted it; NOBODY has accepted it)
-- ============================================================================
--
-- WHAT 20260907 LEFT OPEN
-- That migration added `accepted_machine_draft` for the case a human accepted
-- a suggestion in the editor. It left the worse case untouched: AnA's own tool
-- writes, where no human has accepted anything at all.
--
--   • write_q_sub_section inserts the row with draft_source = 'ana',
--     accepted_at = NULL, and returns "Awaiting human accept" — and then
--     recorded every clause as an author_assertion by the REQUESTING user, in
--     the SAME transaction. One transaction, two records, flatly contradicting
--     each other about whether a person had stood behind the words.
--   • save_document_to_vault and update_vault_document write an artifact
--     provenance row saying eventAction = 'ai_generate', then recorded the same
--     prose as that user's assertion.
--   • AnA's drafting writeback (artifactVersionStore, from the AnA-RI
--     post-processing stream) saves a draft the user has not yet seen.
--
-- Asking AnA to draft a section is not asserting its contents. In a §11.10(e)
-- record the difference is the whole point: an assertion is a person putting
-- their name behind words; a draft request is not.
--
-- THE KIND
-- `machine_draft` carries machine_author_id (a key of the server's own closed
-- MACHINE_AUTHOR_IDS vocabulary) and — deliberately — NO asserter. The
-- kind_shape CHECK requires asserted_by AND asserted_at to be NULL, so the
-- "nobody has accepted this" half cannot be quietly overwritten by a later
-- caller filling the column in. Who ASKED is still recorded, in created_by,
-- which is a different claim and a true one.
--
-- THE ONE TRANSITION THAT MAY ADD AN ASSERTER
-- A human accepting the draft. The accept path re-records those clauses as
-- `accepted_machine_draft` naming the acceptor (20260907), and the unaccepted
-- rows are retired. There is no other way for an asserter to appear, because
-- there is no other event that means a person stood behind the words.
--
-- RULE 1 (CLAUDE.md): the two CHECKs are replaced with the repo's idempotent
-- DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT idiom, as 20260907 and 20260806b
-- do. A CHECK holds no data, so re-running is a no-op that converges on the
-- same definition. This file must run AFTER 20260907, whose definitions it
-- supersedes; both are registered in that order in C2C_MIGRATION_FILES.
--
-- NOTHING IS BACKFILLED. A clause recorded as an author assertion before this
-- kind existed stays as it was recorded: this migration cannot know which of
-- those the machine wrote, and guessing would replace one false attribution
-- with another.
--
-- ROLLBACK
--   Retire the rows first (UPDATE … SET deleted_at = now() WHERE
--   provenance_kind = 'machine_draft'), then restore the 20260907 CHECK
--   definitions. Not reversible without losing the attribution those rows
--   carry.
-- ============================================================================

BEGIN;

DO $mig$
BEGIN
  IF to_regclass('public.document_span_lineage') IS NULL THEN
    RAISE NOTICE 'document_span_lineage absent — machine_draft kind skipped';
    RETURN;
  END IF;

  -- 20260907 adds this column; guarded so this file is also correct on a
  -- database where the two are applied together for the first time.
  ALTER TABLE public.document_span_lineage
    ADD COLUMN IF NOT EXISTS machine_author_id TEXT;

  ALTER TABLE public.document_span_lineage
    DROP CONSTRAINT IF EXISTS document_span_lineage_kind_valid;
  ALTER TABLE public.document_span_lineage
    ADD CONSTRAINT document_span_lineage_kind_valid
      CHECK (provenance_kind IN (
        'cre_evidence_source',
        'author_assertion',
        'accepted_machine_draft',
        'machine_draft'
      ));

  ALTER TABLE public.document_span_lineage
    DROP CONSTRAINT IF EXISTS document_span_lineage_kind_shape;
  ALTER TABLE public.document_span_lineage
    ADD CONSTRAINT document_span_lineage_kind_shape
      CHECK (
        (provenance_kind = 'cre_evidence_source'
          AND reference_id IS NOT NULL
          AND payload_sha256 IS NOT NULL)
        OR
        (provenance_kind = 'author_assertion'
          AND asserted_by IS NOT NULL
          AND asserted_at IS NOT NULL)
        OR
        (provenance_kind = 'accepted_machine_draft'
          AND machine_author_id IS NOT NULL
          AND asserted_by IS NOT NULL
          AND asserted_at IS NOT NULL)
        OR
        -- Nobody has accepted this. The NULLs are the assertion.
        (provenance_kind = 'machine_draft'
          AND machine_author_id IS NOT NULL
          AND asserted_by IS NULL
          AND asserted_at IS NULL)
      );
END
$mig$;

COMMIT;
