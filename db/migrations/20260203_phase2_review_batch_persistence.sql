-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Persist review batch requests + per-document results for deterministic
--          async processing, idempotency, and audit trail continuity.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (Administrative) / Module 5 (Clinical Review)
--   - Integrity Risk Addressed: orphaned async batches, missing audit trail,
--     non-deterministic reprocessing
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================

-- Ensure vault schema exists
CREATE SCHEMA IF NOT EXISTS vault;

-- ============================================================================
-- Table: vault.review_batches
-- ============================================================================
-- Stores batch-level metadata for review requests.
-- Supports idempotency via (program_id, idempotency_key) uniqueness.
-- ============================================================================

CREATE TABLE IF NOT EXISTS vault.review_batches (
    batch_id            UUID PRIMARY KEY,
    program_id          UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status              TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    mode                TEXT NOT NULL CHECK (mode IN ('sync', 'async')),
    ruleset_version     TEXT NOT NULL,
    extractor_version   TEXT NOT NULL,
    response_mode       TEXT NOT NULL CHECK (response_mode IN ('summary', 'full')),
    idempotency_key     TEXT NULL,
    request_digest      CHAR(64) NOT NULL,
    documents_total     INT NOT NULL,
    documents_succeeded INT NOT NULL DEFAULT 0,
    documents_failed    INT NOT NULL DEFAULT 0,
    findings_total      INT NOT NULL DEFAULT 0,
    by_severity         JSONB NOT NULL DEFAULT '{}'::JSONB,
    started_at          TIMESTAMPTZ NULL,
    completed_at        TIMESTAMPTZ NULL,
    error_summary       JSONB NOT NULL DEFAULT '[]'::JSONB
);

-- Idempotency constraint: same program + key = same batch
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_batches_idempotency
    ON vault.review_batches (program_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Query patterns: recent batches by program, batches by status
CREATE INDEX IF NOT EXISTS idx_review_batches_program_created
    ON vault.review_batches (program_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_batches_program_status
    ON vault.review_batches (program_id, status);

-- ============================================================================
-- Table: vault.review_batch_docs
-- ============================================================================
-- Stores per-document results within a batch.
-- Composite PK ensures one row per (batch, doc).
-- ============================================================================

CREATE TABLE IF NOT EXISTS vault.review_batch_docs (
    batch_id         UUID NOT NULL,
    doc_id           UUID NOT NULL,
    program_id       UUID NOT NULL,
    filename         TEXT NULL,
    content_hash     CHAR(64) NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
    errors           JSONB NOT NULL DEFAULT '[]'::JSONB,
    findings_count   INT NOT NULL DEFAULT 0,
    findings_digest  CHAR(64) NOT NULL DEFAULT REPEAT('0', 64),
    findings_preview JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (batch_id, doc_id),
    FOREIGN KEY (batch_id) REFERENCES vault.review_batches (batch_id) ON DELETE CASCADE
);

-- Query patterns: docs by program+batch, docs by program+doc
CREATE INDEX IF NOT EXISTS idx_review_batch_docs_program_batch
    ON vault.review_batch_docs (program_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_review_batch_docs_program_doc
    ON vault.review_batch_docs (program_id, doc_id);

-- ============================================================================
-- Row-Level Security (RLS)
-- ============================================================================
-- Program isolation: users can only access batches/docs for their program.
-- Follows existing vault.anchors / vault.cross_references pattern.
-- ============================================================================

ALTER TABLE vault.review_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.review_batch_docs ENABLE ROW LEVEL SECURITY;

-- Policy: review_batches - program isolation
DROP POLICY IF EXISTS review_batches_program_isolation ON vault.review_batches;
CREATE POLICY review_batches_program_isolation ON vault.review_batches
    FOR ALL
    USING (program_id = current_setting('app.current_program_id', true)::UUID)
    WITH CHECK (program_id = current_setting('app.current_program_id', true)::UUID);

-- Policy: review_batch_docs - program isolation
DROP POLICY IF EXISTS review_batch_docs_program_isolation ON vault.review_batch_docs;
CREATE POLICY review_batch_docs_program_isolation ON vault.review_batch_docs
    FOR ALL
    USING (program_id = current_setting('app.current_program_id', true)::UUID)
    WITH CHECK (program_id = current_setting('app.current_program_id', true)::UUID);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE vault.review_batches IS 'Batch review requests with idempotency support';
COMMENT ON COLUMN vault.review_batches.batch_id IS 'Deterministic UUID5 from program_id + request_digest';
COMMENT ON COLUMN vault.review_batches.status IS 'Batch lifecycle: queued → running → completed|failed';
COMMENT ON COLUMN vault.review_batches.mode IS 'sync = wait for results, async = return 202 immediately';
COMMENT ON COLUMN vault.review_batches.request_digest IS 'SHA256 of normalized request (for idempotency fallback)';
COMMENT ON COLUMN vault.review_batches.by_severity IS 'Aggregated findings count by severity level';

COMMENT ON TABLE vault.review_batch_docs IS 'Per-document results within a batch';
COMMENT ON COLUMN vault.review_batch_docs.content_hash IS 'SHA256 of document content for deduplication';
COMMENT ON COLUMN vault.review_batch_docs.findings_digest IS 'SHA256 of canonical findings JSON for change detection';
COMMENT ON COLUMN vault.review_batch_docs.findings_preview IS 'First N findings (bounded, never full list)';

-- ============================================================================
-- Migration complete
-- ============================================================================
