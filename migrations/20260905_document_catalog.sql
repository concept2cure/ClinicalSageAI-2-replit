-- Document catalog — what each uploaded file IS, what is inside it, and the
-- proof AnA actually read it before claiming to know.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- A client uploads a file into the project vault and it is classified from its
-- FILENAME, its title, and the first 4,000 characters of text
-- (vault-filing.service.ts) — nothing ever produces a durable record of what
-- the document actually contains: no summary, no purpose, no extracted data,
-- no comprehension of any kind. And AnA has no tool that can even LIST
-- vault.documents, so a file uploaded in one session is invisible in the
-- next. The observed failure mode is exactly what these two tables exist to
-- stop: the agent forgets the file is there, never re-opens it, and when it
-- does look, it samples a page instead of consuming the document.
--
-- ── What this adds ──────────────────────────────────────────────────────────
-- vault.document_catalog — one row per vault document, two tiers:
--   • the EXTRACTION tier, written at ingest: how text was extracted (method /
--     OCR confidence / char + word counts), or the recorded reason extraction
--     FAILED. A failure is a row that says so — never an absent row that
--     renders as "nothing to see here".
--   • the COMPREHENSION tier, written by AnA only after she has read the
--     WHOLE document: document_kind, purpose, summary, key_data (the studies,
--     dates, doses, endpoints, N's inside), plus an embedding so the record
--     is semantically retrievable. catalog_status='cataloged' is the claim
--     "this file has been read in full and understood".
--
-- vault.document_read_receipts — the proof behind that claim. Every read AnA
-- performs records the exact character span served, keyed to the content hash
-- it was served from. The catalog write REFUSES unless the union of receipts
-- covers the entire extracted text — a sampled page can never be laundered
-- into "reviewed". A re-upload changes the content hash and voids old
-- receipts by construction.
--
-- catalog_status vocabulary (TEXT, app-enforced like placement_status):
--   extracted          text extracted at ingest; comprehension outstanding
--   extraction_failed  extraction produced nothing; extraction_error says why
--   cataloged          AnA read 100% of the text and recorded comprehension
--
-- Additive only, same guard discipline as
-- migrations/20260823_vault_document_placement.sql: a database with no vault
-- schema is legitimate and this file stays silent there. The embedding column
-- is added only where pgvector is actually installed (PGlite in the contract
-- test cannot load it); application code records embedding_status honestly
-- instead of assuming the column.

DO $document_catalog$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS vault.document_catalog (
    document_id           UUID PRIMARY KEY REFERENCES vault.documents(id) ON DELETE CASCADE,
    -- The bytes this record describes. A re-upload (new hash) makes the
    -- existing comprehension visibly stale rather than silently wrong.
    content_hash          CHAR(64) NOT NULL,
    catalog_status        TEXT NOT NULL,
    -- Extraction tier (ingest-time, deterministic)
    extraction_method     TEXT,
    extraction_confidence REAL,
    extraction_error      TEXT,
    char_count            INTEGER NOT NULL DEFAULT 0,
    word_count            INTEGER,
    page_count            INTEGER,
    -- Comprehension tier (AnA, after a full read)
    document_kind         TEXT,
    purpose               TEXT,
    summary               TEXT,
    key_data              JSONB,
    embedding_status      TEXT,
    cataloged_by          INTEGER,
    cataloged_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS vault.document_read_receipts (
    id           BIGSERIAL PRIMARY KEY,
    document_id  UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    content_hash CHAR(64) NOT NULL,
    char_start   INTEGER NOT NULL CHECK (char_start >= 0),
    char_end     INTEGER NOT NULL CHECK (char_end >= char_start),
    read_by      INTEGER,
    thread_id    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Coverage is computed per document against the CURRENT content hash.
  CREATE INDEX IF NOT EXISTS document_read_receipts_doc_idx
    ON vault.document_read_receipts (document_id, content_hash);

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE vault.document_catalog ADD COLUMN IF NOT EXISTS embedding vector(1536)';
  END IF;
END
$document_catalog$;
