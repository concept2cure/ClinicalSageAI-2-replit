-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: document span lineage — which characters of a document came from where
-- Date: 2026-08-03
--
-- WHY THIS EXISTS
-- The platform can already say, in several places, that a SECTION was drafted
-- from a source. It cannot say which WORDS were, and it cannot say it for a
-- document that has no sections. The rule this serves is stronger than anything
-- currently expressible: every span of every generated document must trace to
-- the Data Room source it came from, and record how that source was used.
--
-- WHAT ALREADY EXISTS, AND WHY NONE OF IT CAN CARRY THIS
-- Six primitives express some form of source→usage today. All are section- or
-- document-grained except one, and each is locked to its own source registry:
--
--   authoring_citations         section → cre_evidence_sources  (+ payload_sha256)
--   cmc_section_lineage         section → CMC module 3 objects  (source_hash_at_compile)
--   intelligent_docs.traceability_links
--                               section → intelligent_docs.source_documents
--   submission_evidence_links   section → polymorphic document ref
--   innovation.auto_trace_links section_path → text + hash
--   evidence_links              sentence → evidence_objects
--
-- `evidence_links` is the only one that reaches below a section, and it does so
-- by ENCODING the span into text: target_id = '<documentId>:s<n>' and
-- target_path = 'char:<start>-<end>'. A range packed into a string cannot be
-- queried — "what backs characters 120..180 of this document" is a LIKE scan
-- and a parse, and "which spans cite this source" cannot use an index at all.
-- It is also keyed to evidence_objects, a different registry from the canonical
-- Data Room sources, so a span cannot cite a cre_evidence_source through it.
--
-- So this is NOT a seventh way to say the same thing. It is the first table that
-- can state the sentence the rule requires — (document, char_start, char_end) →
-- source + how used — and it deliberately reuses the conventions already
-- established rather than inventing parallel ones:
--
--   • the citation convention from 20260726_authoring_citation_source_usage.sql:
--     `source` discriminates the reference kind, `reference_id` holds
--     cre_evidence_sources.id as text, and `payload_sha256` pins the source's
--     checksum AT THE MOMENT IT WAS CITED. That last column is what makes
--     propagation provable rather than recomputed: when a source's content
--     identity moves, every span still carrying the previous checksum is
--     against superseded content, recorded in the database.
--   • the polymorphic document reference from submission_evidence_links
--     (source_document_table + source_document_id), because no single
--     public.documents table exists and the rule covers every surface.
--
-- ORIGINAL PROSE IS NOT AN ABSENCE OF LINEAGE
-- A regulatory author writing their own analysis has no Data Room document to
-- point at, and forcing one would manufacture a false citation — the exact
-- failure this system exists to prevent. `provenance_kind = 'author_assertion'`
-- makes the author the source of record: their user id, the moment they
-- asserted it, and the e-signature that binds them to it. Honestly labelled,
-- and it satisfies the invariant instead of carving a hole in it.
--
-- THE CHECK CONSTRAINTS ARE THE POINT
-- `document_span_lineage_kind_shape` makes an empty lineage row impossible: a
-- cre_evidence_source row must carry a reference and a checksum, and an
-- author_assertion row must carry an author and a time. Without it the table
-- would happily accept a row that records the existence of a claim and nothing
-- about where it came from — which is worse than no row, because it counts.
--
-- IDEMPOTENCE IS DELIBERATE
-- The unique index exists so `ON CONFLICT DO NOTHING` actually does something.
-- evidence_links has that clause with no matching constraint, so re-persisting
-- a document duplicates every link instead of reconciling it. Re-persisting
-- here converges.
--
-- ORDERING
-- Registered in scripts/db/migration-set.mjs BEFORE
-- db/migrations/20260801_tenant_isolation_sweep.sql, which is required: the
-- sweep applies tenant isolation to what the set has created by the time it
-- runs, so a tenant-scoped table added after it would never be policied.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.document_span_lineage;
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.document_span_lineage (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── WHICH DOCUMENT ────────────────────────────────────────────────────────
  -- Polymorphic by necessity: coauthor_documents, ctd_onboarding_documents,
  -- unified_documents, vault_documents and the AnA artifacts are separate
  -- tables with separate key types, so the reference is (table, id-as-text)
  -- exactly as submission_evidence_links models it.
  document_table          TEXT        NOT NULL,
  document_id             TEXT        NOT NULL,
  document_version        TEXT,

  -- ── WHICH CHARACTERS ──────────────────────────────────────────────────────
  -- Half-open [char_start, char_end) over the document's canonical text, so
  -- adjacent spans meet without overlapping and an empty span is unrepresentable.
  -- Word-level and sentence-level are the same mechanism at different widths.
  char_start              INTEGER     NOT NULL,
  char_end                INTEGER     NOT NULL,

  -- The span's own text hash. Offsets alone rot silently when the document is
  -- edited above them; this is how a stale link is detected rather than trusted.
  span_text_sha256        TEXT        NOT NULL,

  -- ── WHERE IT CAME FROM ────────────────────────────────────────────────────
  provenance_kind         TEXT        NOT NULL,   -- cre_evidence_source | author_assertion

  -- Canonical-source citation, following the authoring_citations convention.
  source                  TEXT,                   -- discriminator, e.g. 'cre_evidence_source'
  reference_id            TEXT,                   -- cre_evidence_sources.id, as text
  payload_sha256          TEXT,                   -- that source's checksum when cited
  source_locator          TEXT,                   -- page / section / anchor inside the source

  -- Author assertion: the author IS the source of record.
  asserted_by             TEXT,                   -- authoring identity (matches authoring_citations.created_by)
  asserted_at             TIMESTAMPTZ,
  signature_id            TEXT,                   -- concept2cure_signatures reference, when e-signed

  -- ── HOW IT WAS USED IN THE BUILD ──────────────────────────────────────────
  -- Not merely THAT a source backs this span, but what was done to it. A
  -- verbatim quote and a computed figure carry different regulatory weight.
  usage                   TEXT        NOT NULL,   -- quoted|paraphrased|summarized|derived|computed|asserted
  confidence              REAL,

  -- ── TENANCY + AUDIT ───────────────────────────────────────────────────────
  organization_id         INTEGER     NOT NULL REFERENCES public.organizations(id),
  created_by              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ,

  CONSTRAINT document_span_lineage_span_valid
    CHECK (char_start >= 0 AND char_end > char_start),

  CONSTRAINT document_span_lineage_kind_valid
    CHECK (provenance_kind IN ('cre_evidence_source', 'author_assertion')),

  CONSTRAINT document_span_lineage_usage_valid
    CHECK (usage IN ('quoted', 'paraphrased', 'summarized', 'derived', 'computed', 'asserted')),

  -- Each kind must actually carry its own evidence. See the header.
  CONSTRAINT document_span_lineage_kind_shape
    CHECK (
      (provenance_kind = 'cre_evidence_source'
        AND reference_id IS NOT NULL
        AND payload_sha256 IS NOT NULL)
      OR
      (provenance_kind = 'author_assertion'
        AND asserted_by IS NOT NULL
        AND asserted_at IS NOT NULL)
    )
);

-- Forward: "what backs this part of this document" — the click-through read.
CREATE INDEX IF NOT EXISTS document_span_lineage_span_idx
  ON public.document_span_lineage (document_table, document_id, char_start, char_end);

-- Backward: "where is this source used" — the Data Room read, which runs in the
-- opposite direction from the forward one and would otherwise scan.
CREATE INDEX IF NOT EXISTS document_span_lineage_reference_idx
  ON public.document_span_lineage (reference_id)
  WHERE reference_id IS NOT NULL;

-- Propagation: "this source moved; which spans are now against stale content".
CREATE INDEX IF NOT EXISTS document_span_lineage_payload_idx
  ON public.document_span_lineage (payload_sha256)
  WHERE payload_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_span_lineage_org_idx
  ON public.document_span_lineage (organization_id);

-- Makes ON CONFLICT DO NOTHING meaningful, so re-persisting a document
-- reconciles instead of duplicating. COALESCE because reference_id is NULL for
-- author assertions and NULLs would otherwise compare distinct.
CREATE UNIQUE INDEX IF NOT EXISTS document_span_lineage_unique_link
  ON public.document_span_lineage (
    organization_id,
    document_table,
    document_id,
    char_start,
    char_end,
    provenance_kind,
    COALESCE(reference_id, ''),
    COALESCE(asserted_by, '')
  )
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.document_span_lineage IS
  'Character-span lineage: which characters of which document came from which Data Room source, and how that source was used. Anchored to cre_evidence_sources via the authoring_citations convention (source/reference_id/payload_sha256). provenance_kind=author_assertion records original expert prose against its author rather than forcing a false citation.';
