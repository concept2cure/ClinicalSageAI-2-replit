-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: The Data Room keeps the text it read from each captured file, and
--          can be searched by it (D2, Data Room catalog S2;
--          docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (the evidence every module is written from)
--   - Integrity Risk Addressed: completeness. A captured file the platform has
--     read but cannot find is evidence an author or AnA writes around.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped; the capture record's
--     frozen and write-once columns (VR-16) are untouched.
-- =============================================================================
-- 20261008c_data_room_source_text.sql
--
-- WHY. A Data Room source (cre_evidence_sources, source_type 'client_document')
-- recorded that its file was read (extraction_status) but not what was read.
-- The text lived only in a 16,000-character retrieval-atom prefix and in the
-- Vault copy, if the file was ever filed. So the Data Room had no search
-- beyond a client-side title match over 200 rows, and a source adopted from a
-- conversation was never read at all (extraction_status stayed 'pending').
--
-- WHAT.
--   * extracted_text, char_count, page_count, text_extracted_at: the derived
--     text and its measure, written by the one processing step
--     (server/services/clinical-regulatory-evidence/data-room-processing.ts).
--     Derived data, not the record: the capture guard leaves them mutable, so
--     a source can be re-read when the extractor improves. The checksum of
--     the original bytes is the record, and stays write-once.
--   * A GIN full-text index over the same definition of "searchable text" the
--     Vault uses (vault.document_search_vector: title weighted A, body D),
--     over a bounded slice of the body (a tsvector over 1 MB cannot be
--     indexed), for client documents only. The query that reads it names the
--     same expression and predicate.
--
-- RULE 1: replayed on every deploy. ADD COLUMN IF NOT EXISTS and CREATE INDEX
-- IF NOT EXISTS, each only when its prerequisite exists, so a replay runs no
-- DDL. No DROP. cre_evidence_sources is public with organization_id INTEGER
-- and its RLS policies already exist; nothing new for the sweeps to reach.
--
-- Pinned by tests/db/data-room-processing.dbtest.ts.
-- =============================================================================

DO $mig$
BEGIN
  IF to_regclass('public.cre_evidence_sources') IS NULL THEN
    RAISE NOTICE 'cre_evidence_sources absent - Data Room source text skipped';
    RETURN;
  END IF;
  ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS extracted_text TEXT;
  ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS char_count INTEGER;
  ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS page_count INTEGER;
  ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS text_extracted_at TIMESTAMPTZ;
END
$mig$;

DO $mig$
BEGIN
  IF to_regclass('public.cre_evidence_sources') IS NULL
     OR to_regprocedure('vault.document_search_vector(text,text,text)') IS NULL THEN
    RAISE NOTICE 'cre_evidence_sources or vault.document_search_vector absent - Data Room full-text index skipped';
    RETURN;
  END IF;
  IF to_regclass('public.idx_cre_sources_client_fts') IS NULL THEN
    CREATE INDEX idx_cre_sources_client_fts ON public.cre_evidence_sources
      USING gin (vault.document_search_vector(title, NULL::text, left(extracted_text, 900000)))
      WHERE source_type = 'client_document';
  END IF;
END
$mig$;
