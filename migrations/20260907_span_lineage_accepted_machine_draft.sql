-- ============================================================================
-- document_span_lineage — a third provenance kind: accepted_machine_draft
-- ============================================================================
--
-- THE FALSEHOOD THIS REMOVES
-- The lineage table could say two things about a clause: it came from a Data
-- Room source (cre_evidence_source), or the author asserted it
-- (author_assertion). Every governed write re-derives the clause spans of the
-- saved content and records each one it cannot tie to a source as the human
-- actor's assertion — including the clauses AnA drafted and the human merely
-- accepted. The Data Origins panel and its PDF therefore read "Author
-- assertion · Asserted by the author" over prose a model produced, and the
-- §11.10(e) record named a person as the author of words they never wrote.
-- The revision ledger already knew (origin 'ai-draft-accept', draft_source
-- 'ana'), but at save grain; the clause grain is what this table exists for.
--
-- THE KIND
-- `accepted_machine_draft` states both halves of the true fact: which machine
-- author drafted the words (machine_author_id — a key of the server's own
-- closed MACHINE_AUTHOR_IDS vocabulary, never a client-supplied name) and
-- which human accepted them (asserted_by / asserted_at, exactly as an author
-- assertion names its author). The kind_shape CHECK requires all three, so a
-- row cannot claim machine authorship without naming the machine, or
-- acceptance without naming who accepted. signature_id binds the accepting
-- human's e-signature to it the same way it binds an assertion.
--
-- HOW ROWS OF THIS KIND ARE MADE (lineage-gate.ts / machine-attribution.ts)
-- Only by verbatim match: a clause is recorded as the machine's only when its
-- text is inside text the human accepted from that machine in the editor —
-- checked by the server against the saved content, so a client cannot
-- attribute words to a machine that were never saved. Across later saves the
-- attribution follows the clause by its text hash and is retired the moment a
-- human edits the words. Nothing is inferred and nothing is backfilled: a
-- clause recorded before this kind existed stays as it was recorded.
--
-- RULE 1 (CLAUDE.md): the two CHECKs are replaced with the repo's idempotent
-- DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT idiom (as 20260806b widened
-- c2c_documents_doc_type_check). A CHECK holds no data, so re-running is a
-- no-op that converges on the same definition; the column is ADD COLUMN IF NOT
-- EXISTS. db/migrations/20260803 creates the table with CREATE TABLE IF NOT
-- EXISTS, so on a provisioned database it never revisits the constraints —
-- which is why they are widened here rather than amended in place.
--
-- ROLLBACK
--   Retire the rows first (UPDATE … SET deleted_at = now() WHERE
--   provenance_kind = 'accepted_machine_draft'), then restore the 20260803
--   CHECK definitions and DROP COLUMN machine_author_id. Not reversible
--   without losing the attribution those rows carry.
-- ============================================================================

BEGIN;

DO $mig$
BEGIN
  IF to_regclass('public.document_span_lineage') IS NULL THEN
    RAISE NOTICE 'document_span_lineage absent — accepted_machine_draft kind skipped';
    RETURN;
  END IF;

  ALTER TABLE public.document_span_lineage
    ADD COLUMN IF NOT EXISTS machine_author_id TEXT;

  EXECUTE $q$COMMENT ON COLUMN public.document_span_lineage.machine_author_id IS
    'For provenance_kind = accepted_machine_draft: the machine author that drafted the span (a MACHINE_AUTHOR_IDS key, e.g. ana). NULL for every other kind. asserted_by / asserted_at name the human who accepted it.'$q$;

  ALTER TABLE public.document_span_lineage
    DROP CONSTRAINT IF EXISTS document_span_lineage_kind_valid;
  ALTER TABLE public.document_span_lineage
    ADD CONSTRAINT document_span_lineage_kind_valid
      CHECK (provenance_kind IN ('cre_evidence_source', 'author_assertion', 'accepted_machine_draft'));

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
      );
END
$mig$;

COMMIT;
