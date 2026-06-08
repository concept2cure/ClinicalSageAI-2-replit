-- 21 CFR Part 11 §11.10(e): soft-delete for regulated eCTD documents.
--
-- coauthor_documents is the canonical eCTD document table. Its delete handlers
-- (server/routes/ectd-documents.ts, server/routes/coauthor.ts) previously
-- HARD-deleted the row with no audit trail. They now set deleted_at and write
-- an audit_events row in the same transaction (atomic, fail-closed). Reads
-- filter on `deleted_at IS NULL`.

ALTER TABLE coauthor_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Reads exclude soft-deleted rows; index the tombstone for the common filter.
CREATE INDEX IF NOT EXISTS coauthor_document_deleted_at_idx
  ON coauthor_documents (deleted_at);
