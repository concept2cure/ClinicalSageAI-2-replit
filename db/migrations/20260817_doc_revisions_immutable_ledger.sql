-- eCTD REGULATORY AUDIT CONTEXT
-- Purpose: Make doc_revisions a tamper-evident, append-only ledger instead of
--   an ordinary table that happens to only be INSERTed. Two halves:
--   (1) ledger columns — per-revision content hash, hash-chain link to the
--       previous revision, the write path that produced it (origin), and a
--       frozen snapshot of the section's citation inputs at save time; written
--       by createRevision (server/routes/authoring.router.ts) and verified by
--       server/services/authoring/revision-ledger.ts;
--   (2) append-only triggers — UPDATE, DELETE and TRUNCATE on doc_revisions
--       are refused by the ENGINE, so §11.10(e) "protection of records" is a
--       database property, not a code-review promise.
-- Author: Concept2Cure remediation
-- Date: 2026-08-17
-- Reviewed: authoring-ledger.pglite.integration.test.ts (applies this file to
--   a real Postgres engine, proves the triggers refuse tampering, erasure and
--   whole-table truncation, proves the chain columns land)
-- Rollback: DROP TRIGGER trg_doc_revisions_append_only ON doc_revisions;
--   DROP TRIGGER trg_doc_revisions_no_truncate ON doc_revisions;
--   DROP FUNCTION doc_revisions_append_only(); ALTER TABLE doc_revisions
--   DROP COLUMN for the five columns below (all additive and nullable).
--
-- Pre-existing rows keep NULL chain columns: the ledger begins at adoption,
-- and verification reports those rows as pre-ledger rather than pretending
-- the chain always existed. Backfilling hashes for old rows would assert an
-- integrity history nobody recorded at the time — exactly the kind of
-- retroactive claim this ledger exists to prevent.

ALTER TABLE IF EXISTS doc_revisions
  ADD COLUMN IF NOT EXISTS content_sha256    TEXT,
  ADD COLUMN IF NOT EXISTS prev_chain_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS chain_sha256      TEXT,
  ADD COLUMN IF NOT EXISTS origin            TEXT,
  ADD COLUMN IF NOT EXISTS inputs            JSONB;

-- The chain-head read (latest revision per section) and the verify walk both
-- order by (created_at, id); give them an index that serves it.
CREATE INDEX IF NOT EXISTS idx_doc_revisions_section_chain
  ON doc_revisions (section_id, created_at, id);

-- Append-only, enforced by the engine. SECURITY note: deliberately NO
-- bypass parameter and no role carve-out — cleanup of a mis-written revision
-- is a new compensating revision, never an edit of history.
--
-- TG_LEVEL branch: the same authority serves both triggers below. A row-level
-- trigger names the revision it protected; a statement-level TRUNCATE trigger
-- has no OLD row to name, so it reports the whole-table erasure it refused.
CREATE OR REPLACE FUNCTION doc_revisions_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_LEVEL = 'ROW' THEN
    RAISE EXCEPTION 'doc_revisions is an append-only ledger: % refused (revision %)',
      TG_OP, COALESCE(OLD.id::text, '?')
      USING ERRCODE = 'raise_exception',
            HINT = 'History is corrected by appending a new revision, not by editing one.';
  END IF;
  RAISE EXCEPTION 'doc_revisions is an append-only ledger: % refused (whole table)',
    TG_OP
    USING ERRCODE = 'raise_exception',
          HINT = 'History is corrected by appending a new revision, not by erasing the ledger.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doc_revisions_append_only ON doc_revisions;
CREATE TRIGGER trg_doc_revisions_append_only
  BEFORE UPDATE OR DELETE ON doc_revisions
  FOR EACH ROW EXECUTE FUNCTION doc_revisions_append_only();

-- A row-level trigger does NOT fire on TRUNCATE: without this second,
-- STATEMENT-level trigger a single `TRUNCATE doc_revisions` erases every
-- revision of every section silently, past the row guard above — the largest
-- erasure the ledger exists to refuse, and the one the row trigger cannot see.
-- Proven by making the check fail first: the integration test truncates and is
-- refused, and no code path in this repo truncates this table.
DROP TRIGGER IF EXISTS trg_doc_revisions_no_truncate ON doc_revisions;
CREATE TRIGGER trg_doc_revisions_no_truncate
  BEFORE TRUNCATE ON doc_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION doc_revisions_append_only();
