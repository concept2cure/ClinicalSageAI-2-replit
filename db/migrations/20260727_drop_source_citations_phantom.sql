-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: drop the phantom `source_citations` table wherever it exists
-- Date: 2026-07-27
--
-- WHY THIS EXISTS
-- `source_citations` was a drizzle-only definition in shared/schema.ts with no
-- CREATE TABLE anywhere in this repository's migration lineages. On every
-- deployed database it never existed: the AI-edit writer's INSERT was swallowed
-- by its own 42P01 guard, and the Source Tracer's read returned 503.
--
-- The definition has now been removed from shared/schema.ts (see the tombstone
-- note there) because the table was incoherent by construction, not merely
-- unprovisioned: the writer inserted `concept2cure_artifacts` ids into
-- `document_id` while the declared FK and the only reader joined
-- `documents.id` — two unrelated serial sequences. Any copy of this table that
-- DOES exist (a development database someone once `db:push`ed against) holds
-- rows keyed on that mismatch: junk by construction, never read successfully by
-- anything. This migration removes such copies so no environment quietly
-- diverges from the schema the code now declares.
--
-- Recorded section→source lineage lives in `authoring_citations`
-- (migrations/20260726_authoring_citation_source_usage.sql); model-asserted
-- claim support lives in the ai-trace-chain tables, labelled as inference.
--
-- IDEMPOTENT and safe on databases where the table never existed (all known
-- ones): both statements are IF EXISTS. The enum type is dropped only when no
-- column still depends on it — RESTRICT is the default, and the guard swallows
-- a dependency error into a NOTICE rather than failing the run.
--
-- ROLLBACK: none. Restoring an incoherent store is not a supported state; the
-- replacement read-model is served from authoring_citations.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS source_citations;

DO $$
BEGIN
  DROP TYPE IF EXISTS source_type;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'enum type source_type is still in use elsewhere; leaving it in place';
END $$;
