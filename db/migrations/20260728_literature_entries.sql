-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Back the CER literature corpus table (literature_entries) that the
--          regulatory-programs service reads and the MDx seed writes.
--
-- eCTD/CTD Context:
--   - Module(s): Module 2.5 / Module 4-5 (clinical evaluation literature evidence)
--   - Integrity Risk Addressed: the literature-density chart and the portfolio
--     corpus insight read a table nothing created, so they silently reported ZERO
--     literature — a false negative on EU MDR Article 61 sufficient-evidence
--     signalling rather than a visible error.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Tenant isolation: organization_id NOT NULL, filtered by every live query.
--   - Migration is idempotent (IF NOT EXISTS; trigger DROP-then-CREATE).
-- =============================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: literature_entries — CER literature corpus (G-02 canonicalization)
-- Date: 2026-07-28
--
-- WHY THIS EXISTS
-- server/services/regulatory-programs.service.ts reads literature_entries for the
-- CER literature-density chart and the portfolio "literature corpus" insight, and
-- scripts/seed-mdx-content.mjs writes it, but the ONLY CREATE TABLE lived in the
-- ARCHIVED db/migrations/_consolidated/20250512_literature_entries.sql — a directory
-- the schema scanners deliberately exclude, and which no durable apply path runs
-- (the on-demand server/db/setupLiterature.ts points at a root migrations/… file
-- that does not exist). So on a fresh database the table is absent: the reads fall
-- into their `42P01 → zero buckets` tolerance and the chart silently shows nothing,
-- and the table sat on the unbacked-tables baseline.
--
-- CANONICAL SHAPE — derived from the live code, not the archive:
--   * organization_id TEXT NOT NULL is the tenant key. BOTH live consumers agree on
--     it: the service filters `WHERE organization_id::text = $1::text` and the seed
--     inserts organization_id. (server/db/performance_indexes.sql mentions a
--     tenant_id/topic index for a different, never-provisioned shape; it is on no
--     apply path and is intentionally not reproduced here.)
--   * Columns are exactly those the service SELECTs (title, abstract,
--     publication_date, organization_id) and the seed INSERTs (id, source_name,
--     source_id, title, abstract, publication_date, journal, organization_id,
--     created_at, updated_at), plus the archived nullable metadata (authors, doi,
--     url, relevance_score) so the full corpus row round-trips.
--   * The pgvector `embedding vector(1536)` column + ivfflat index from the archived
--     file are INTENTIONALLY OMITTED: no live code path writes embeddings, they
--     require the pgvector extension (absent on the durable applier's baseline), and
--     semantic search remains the legacy setupLiterature.ts concern to provision
--     separately behind `CREATE EXTENSION vector` when it is wired up. Backing the
--     shape the code actually uses is the G-02 mandate.
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS; trigger DROP-then-CREATE) for the
-- applier's re-run contract.
--
-- ROLLBACK: DROP TABLE IF EXISTS literature_entries;
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS literature_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  authors            TEXT[],
  abstract           TEXT,
  publication_date   DATE,
  journal            TEXT,
  doi                TEXT,
  url                TEXT,
  source_name        TEXT NOT NULL,
  source_id          TEXT,
  relevance_score    DOUBLE PRECISION,
  organization_id    TEXT NOT NULL,  -- multi-tenant: filtered by `WHERE organization_id::text = $1::text`
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Tenant isolation + the two live read shapes: the portfolio count filters on
-- organization_id alone; the year-bucket chart filters organization_id + a
-- publication_date window, so a composite (organization_id, publication_date) index
-- serves it directly.
CREATE INDEX IF NOT EXISTS idx_literature_entries_org_id ON literature_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_literature_entries_org_pubdate ON literature_entries(organization_id, publication_date);

-- Shared updated_at trigger. CREATE OR REPLACE is idempotent; the trigger is
-- DROP-then-CREATE so the whole file is safe to re-run on the applier path.
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS literature_entries_updated ON literature_entries;
CREATE TRIGGER literature_entries_updated
  BEFORE UPDATE ON literature_entries
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
