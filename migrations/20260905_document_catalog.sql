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

-- ── Amended in place 2026-09-24: row-level security (row D3) ──────────────────
-- As first written, both tables below had NO row-level security and NO policy.
-- Neither carries a tenant column — ownership is document_id → vault.documents,
-- which IS policied — so isolation rested entirely on every application query
-- remembering to join through vault.documents. Reproduced on real PostgreSQL as
-- the production runtime role with sponsor A's tenant settings: A read sponsor
-- B's comprehension record (summary and key_data), overwrote it, forged a
-- 'cataloged' row for B's uncatalogued document, planted a full-coverage read
-- receipt on B's document — the proof completeCatalog trusts before accepting a
-- comprehension record — and deleted B's receipt.
--
-- The fix is the policy set vault.document_chunks has carried since
-- 20260905b: ENABLE plus one policy per command, each an EXISTS through
-- vault.documents with core.can_access_program / core.can_write_program. The
-- EXISTS is itself subject to vault.documents' own policy for the querying
-- role, so another tenant's document is simply not there to match. A parent-
-- scoped policy, not an organization_id column: duplicating the tenant onto a
-- child creates a second copy of the truth that can drift (the same reasoning
-- as db/migrations/20260813_child_table_parent_scoped_rls.sql).
--
-- Amended here rather than in a new file (CLAUDE.md Rule 1): every file in the
-- set re-runs on every deploy, the policies are DROP POLICY IF EXISTS / CREATE,
-- and putting them beside the CREATE TABLE keeps the table's protection in the
-- file a reader opens to learn what the table is. Proof, red then green:
-- tests/db/vault-catalog-tenant-isolation.dbtest.ts;
-- evidence docs/evidence/D3/2026-09-24-vault-catalog/.

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

  -- RLS (amended 2026-09-24, see header): the vault.document_chunks policy set,
  -- scoped through the parent document. ENABLE is unconditional; the policies
  -- need the program-access functions, which a database without the identity
  -- layer (the PGlite schema contract) legitimately lacks.
  EXECUTE 'ALTER TABLE vault.document_catalog ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE vault.document_read_receipts ENABLE ROW LEVEL SECURITY';
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'core' AND p.proname = 'can_access_program') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_catalog_select ON vault.document_catalog';
    EXECUTE $p$CREATE POLICY rls_vault_catalog_select ON vault.document_catalog FOR SELECT
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_catalog_insert ON vault.document_catalog';
    EXECUTE $p$CREATE POLICY rls_vault_catalog_insert ON vault.document_catalog FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_catalog_update ON vault.document_catalog';
    EXECUTE $p$CREATE POLICY rls_vault_catalog_update ON vault.document_catalog FOR UPDATE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_catalog_delete ON vault.document_catalog';
    EXECUTE $p$CREATE POLICY rls_vault_catalog_delete ON vault.document_catalog FOR DELETE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;

    EXECUTE 'DROP POLICY IF EXISTS rls_vault_receipts_select ON vault.document_read_receipts';
    EXECUTE $p$CREATE POLICY rls_vault_receipts_select ON vault.document_read_receipts FOR SELECT
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_receipts_insert ON vault.document_read_receipts';
    EXECUTE $p$CREATE POLICY rls_vault_receipts_insert ON vault.document_read_receipts FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_receipts_update ON vault.document_read_receipts';
    EXECUTE $p$CREATE POLICY rls_vault_receipts_update ON vault.document_read_receipts FOR UPDATE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_receipts_delete ON vault.document_read_receipts';
    EXECUTE $p$CREATE POLICY rls_vault_receipts_delete ON vault.document_read_receipts FOR DELETE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;
  END IF;
END
$document_catalog$;
