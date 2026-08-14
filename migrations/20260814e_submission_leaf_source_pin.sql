-- ============================================================================
-- Submission leaf source pin — submission_leaves.document_content_sha256
-- (GA ledger L23 — "a filed leaf does not pin what it shipped")
-- ============================================================================
--
-- THE GAP. `submission_leaves` records WHERE a document lives
-- (`document_table` + `document_id`) and the MD5 of the leaf's RENDERED bytes
-- (`checksum`, which exists to satisfy the eCTD index-md5 contract). Neither
-- says anything about what the SOURCE document contained at the moment it was
-- filed.
--
-- So the traceability question a reviewer actually asks — "this leaf went to
-- the agency; is the document behind it still what went?" — had no answer.
-- `document_id` resolves to the document as it is NOW. Editing it after filing
-- leaves every column on the leaf unchanged, because none of them describe the
-- content. And the rendered-bytes checksum cannot stand in: it is computed over
-- a generated PDF, is MD5 by eCTD requirement, and is absent entirely on leaves
-- that were never rendered.
--
-- The IND path makes this concrete. `ind-lifecycle-persistence.ts` creates
-- leaves with no document pointer at all — only a section code, a title, and a
-- checksum when one is available — so from a filed IND leaf there is no path
-- back to a document, let alone to the source data behind it.
--
-- THE PIN. `document_content_sha256` is the digest of the SOURCE document's
-- content as it stood when the leaf was written, and `document_pinned_at` is
-- when that was taken. Both nullable, because a leaf legitimately may carry no
-- document pointer (a placeholder for a section not yet authored), and NULL is
-- the honest representation of that — not a zero digest, and not the digest of
-- an empty string, either of which would look like a pin that had been taken.
--
-- ── Why SHA-256 here when `checksum` is MD5 ─────────────────────────────────
-- They answer different questions and must not be conflated. `checksum` is a
-- packaging value: MD5 because ICH eCTD specifies MD5 for the index, computed
-- over rendered output. This is an evidentiary value: SHA-256 over the stored
-- source content, re-derivable by an inspector from the document row. Reusing
-- one column for both would make "does this match?" ambiguous at exactly the
-- moment someone needs it to be precise.
--
-- ── Why no backfill ─────────────────────────────────────────────────────────
-- Deliberately none. A pin's whole value is that it was taken AT filing time.
-- Computing one now from a document's CURRENT content would manufacture
-- agreement for every existing leaf — including any whose document has since
-- been edited, which is precisely the case the column exists to detect. Every
-- pre-existing leaf therefore reports "not pinned", which is true, and a
-- reader must treat that as unknown rather than as unchanged.
--
-- ROLLBACK
--   ALTER TABLE submission_leaves DROP COLUMN IF EXISTS document_content_sha256;
--   ALTER TABLE submission_leaves DROP COLUMN IF EXISTS document_pinned_at;
-- Rollback loses only the pin; no leaf, sequence or document row is touched.
-- ============================================================================

ALTER TABLE IF EXISTS submission_leaves
  ADD COLUMN IF NOT EXISTS document_content_sha256 TEXT;

ALTER TABLE IF EXISTS submission_leaves
  ADD COLUMN IF NOT EXISTS document_pinned_at TIMESTAMPTZ;

DO $do$
BEGIN
  IF to_regclass('public.submission_leaves') IS NULL THEN
    RAISE NOTICE 'submission_leaves absent — leaf source pin skipped';
    RETURN;
  END IF;

  EXECUTE $q$COMMENT ON COLUMN submission_leaves.document_content_sha256 IS
    'SHA-256 of the SOURCE document content at the moment this leaf was written. NULL = no pin was taken (no document pointer, or the leaf predates this column) and must be read as unknown, never as unchanged. Distinct from `checksum`, which is the MD5 of the leaf''s RENDERED bytes for the eCTD index (GA ledger L23).'$q$;

  EXECUTE $q$COMMENT ON COLUMN submission_leaves.document_pinned_at IS
    'When document_content_sha256 was computed. NULL whenever the pin is NULL.'$q$;
END
$do$;
