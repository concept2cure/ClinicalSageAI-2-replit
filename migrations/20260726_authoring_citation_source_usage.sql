-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: source usage — which authored section was drafted from which source
-- Date: 2026-07-26
--
-- WHY THIS EXISTS
-- The Data Room now holds canonical source identities, and the authoring loop
-- holds sections. Nothing connected them: a section could be written from a
-- protocol and the platform kept no record of it, so two questions had no
-- answer at all —
--
--   "which documents is this source used in?"      (the back-reference)
--   "this source changed; what does that affect?"  (propagation)
--
-- NO NEW TABLE. `authoring_citations` already is the section→source link, and
-- adding a second one would fragment the very thing the canonical source object
-- exists to unify. What was missing is a CONVENTION and the index to read it by.
--
-- ─── The convention ──────────────────────────────────────────────────────────
-- A citation of a canonical source is written as:
--
--   source          = 'cre_evidence_source'   -- discriminates the reference kind
--   reference_id    = cre_evidence_sources.id (as text)
--   payload_sha256  = that source's `checksum` AT THE MOMENT IT WAS CITED
--
-- `payload_sha256` is what makes propagation durable rather than a guess. When a
-- source's content identity moves, every citation still carrying the previous
-- checksum is provably against superseded content — recorded in the database, not
-- recomputed in whichever browser session happens to look. The column was already
-- declared and READ in six places (including printed into assembled documents as
-- `payload_sha256 || 'PENDING'`) but written NOWHERE, so it had no meaning to
-- conflict with; it has one now.
--
-- Citations that are not canonical-source references are untouched: this
-- migration adds no constraint on `source`, so the data-token flow and free-text
-- citations keep working exactly as before.
--
-- PRIOR ART, deliberately followed rather than reinvented: `cmc_section_lineage`
-- (db/migrations/20260401_cmc_convergence_os.sql) stores `source_hash_at_compile`
-- per (section, source object), and `intelligent_docs.traceability_links`
-- (20260129) stores `source_hash` + a `verification_status` it recomputes. Both
-- are the same primitive, each locked to its own source registry — CMC module 3
-- objects and intelligent_docs.source_documents respectively — so neither can
-- express a citation of a canonical CRE source. This adds the primitive where the
-- canonical sources actually live instead of a fourth registry.
--
-- ─── What this migration actually does ───────────────────────────────────────
-- One index. The back-reference reads in the OPPOSITE direction from every
-- existing query: `authoring_citations_section_idx` covers "citations of this
-- section", while the Data Room asks "sections citing this source". Without an
-- index that is a full table scan per source per render.
--
-- SELF-GUARDING. `authoring_citations` is created by
-- db/migrations/20260725_authoring_document_loop_tables.sql, which is in the
-- manifest but — like the CRE spine before #1109 — was not on any path that
-- reaches a real database. It is now listed in scripts/db/apply-c2c-migrations.mjs
-- immediately before this file. The to_regclass guard means that when this file
-- runs somewhere the table is genuinely absent (preview_db_test applies only the
-- migrations a PR adds), it emits a NOTICE and no-ops instead of failing the run.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS authoring_citations_reference_idx;
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.authoring_citations') IS NULL THEN
    RAISE NOTICE 'authoring_citations is absent; skipping the source-usage index. Apply db/migrations/20260725_authoring_document_loop_tables.sql first.';
    RETURN;
  END IF;

  -- "Which sections cite this source?" — tenant first (every read is org-scoped),
  -- then the reference kind, then the source id.
  CREATE INDEX IF NOT EXISTS authoring_citations_reference_idx
    ON authoring_citations (tenant_id, source, reference_id);

  COMMENT ON COLUMN authoring_citations.reference_id IS
    'Identity of the cited thing within the kind named by `source`. For source = ''cre_evidence_source'' this is cre_evidence_sources.id as text.';

  COMMENT ON COLUMN authoring_citations.payload_sha256 IS
    'Content identity the citation was resolved against. For source = ''cre_evidence_source'' this is the cited source''s checksum at cite time; a difference from the source''s current checksum means this section was written against superseded content.';
END $$;
