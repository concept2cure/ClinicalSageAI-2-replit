-- Migration: 20260604_submission_core_canonical
-- Purpose:  Canonical, region-agnostic submission core (Phase 1, WO-1.1).
--           Stands up the lifecycle-aware submission object, its per-region
--           projections, the eCTD sequence ledger, and the doc->CTD-leaf map
--           that the Phase-2 Builder tree and Phase-4 Shadow Review depend on.
--
-- Reconcile (RECONCILE.md, WO-1.0):
--   * submissions / submission_regions / ectd_sequences / submission_leaves
--     did not exist in the repo — all CREATE-NEW. The work order's "binding
--     decision" assumed ectd_sequences already named the backbone; it did not
--     (ectd_modules is only a static module tree, not the lifecycle ledger).
--   * There is NO public.documents table. submission_leaves therefore references
--     a document polymorphically (document_table + document_id), mirroring the
--     existing document_atom_provenance precedent in shared/schema/regulatory-atoms.ts.
--
-- IDs are SERIAL integers. Every table carries the 6 mandatory columns and
-- indexes every FK. Snake_case here matches camelCase in shared/schema/submissions.ts.

-- Up:

-- ── submissions ──────────────────────────────────────────────────────────────
-- The living, lifecycle-aware submission object (region-agnostic core).
CREATE TABLE IF NOT EXISTS public.submissions (
  id               SERIAL PRIMARY KEY,
  title            TEXT NOT NULL,
  product_name     TEXT,
  application_type TEXT NOT NULL,                       -- ind|nda|bla|anda|maa|510k|de_novo|pma|cta|...
  client_type      TEXT NOT NULL,                       -- pharma|biotech|mdx|ivd
  primary_region   TEXT NOT NULL,                       -- fda|eu|jp
  status           TEXT NOT NULL DEFAULT 'planning',    -- planning|active|submitted|archived
  lifecycle_stage  TEXT NOT NULL DEFAULT 'planning',    -- planning|original|amendment|response|variation|annual|withdrawal
  organization_id  INTEGER NOT NULL REFERENCES public.organizations(id),
  created_by       INTEGER NOT NULL REFERENCES public.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_submissions_organization_id ON public.submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_by      ON public.submissions(created_by);

-- ── submission_regions ───────────────────────────────────────────────────────
-- Per-region projection of a submission: which pathway/profile this region uses.
CREATE TABLE IF NOT EXISTS public.submission_regions (
  id                         SERIAL PRIMARY KEY,
  submission_id              INTEGER NOT NULL REFERENCES public.submissions(id),
  region                     TEXT NOT NULL,             -- fda|eu|jp
  pathway                    TEXT NOT NULL,             -- ectd_v322|ectd_v40|estar|mdr|ivdr|ctis
  module_profile_version     TEXT,
  validation_profile_version TEXT,
  organization_id            INTEGER NOT NULL REFERENCES public.organizations(id),
  created_by                 INTEGER NOT NULL REFERENCES public.users(id),
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW(),
  deleted_at                 TIMESTAMPTZ,
  CONSTRAINT uq_submission_regions_submission_region UNIQUE (submission_id, region)
);
CREATE INDEX IF NOT EXISTS idx_subregions_submission_id   ON public.submission_regions(submission_id);
CREATE INDEX IF NOT EXISTS idx_subregions_organization_id ON public.submission_regions(organization_id);

-- ── ectd_sequences ───────────────────────────────────────────────────────────
-- Immutable-ish lifecycle ledger: 0000 (original) -> amendments/responses/...
CREATE TABLE IF NOT EXISTS public.ectd_sequences (
  id                SERIAL PRIMARY KEY,
  submission_id     INTEGER NOT NULL REFERENCES public.submissions(id),
  region            TEXT NOT NULL,                       -- fda|eu|jp
  sequence_number   TEXT NOT NULL,                       -- '0000', '0001', ...
  type              TEXT NOT NULL DEFAULT 'original',     -- original|amendment|response|variation|annual|withdrawal
  status            TEXT NOT NULL DEFAULT 'draft',        -- draft|assembling|validated|frozen|dispatched
  validation_status TEXT,                                 -- pending|passed|failed
  dispatch_status   TEXT,                                 -- pending|sent|acknowledged|rejected
  frozen_at         TIMESTAMPTZ,
  organization_id   INTEGER NOT NULL REFERENCES public.organizations(id),
  created_by        INTEGER NOT NULL REFERENCES public.users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ectd_sequences_submission_id   ON public.ectd_sequences(submission_id);
CREATE INDEX IF NOT EXISTS idx_ectd_sequences_organization_id ON public.ectd_sequences(organization_id);

-- ── submission_leaves ────────────────────────────────────────────────────────
-- Canonical doc->CTD-leaf mapping with granularity + eCTD lifecycle operator.
-- document_table + document_id are a POLYMORPHIC reference (no single
-- public.documents table exists) — see RECONCILE.md §2.
CREATE TABLE IF NOT EXISTS public.submission_leaves (
  id               SERIAL PRIMARY KEY,
  sequence_id      INTEGER NOT NULL REFERENCES public.ectd_sequences(id),
  section_code     TEXT NOT NULL,                        -- e.g. "2.5", "3.2.S.4.2", "m1.us.cover"
  title            TEXT NOT NULL,
  granularity      TEXT,                                 -- region granularity-annex node
  lifecycle_op     TEXT NOT NULL DEFAULT 'new',          -- new|replace|append|delete (eCTD v3.2.2)
  document_table   TEXT,                                 -- coauthor_documents|ctd_onboarding_documents|unified_documents|vault_documents
  document_id      INTEGER,                              -- polymorphic id within document_table (no hard FK)
  leaf_guid        TEXT,                                 -- stable eCTD leaf GUID
  parent_leaf_id   INTEGER REFERENCES public.submission_leaves(id),
  checksum         TEXT,
  organization_id  INTEGER NOT NULL REFERENCES public.organizations(id),
  created_by       INTEGER NOT NULL REFERENCES public.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_subleaves_sequence_id      ON public.submission_leaves(sequence_id);
CREATE INDEX IF NOT EXISTS idx_subleaves_document         ON public.submission_leaves(document_table, document_id);
CREATE INDEX IF NOT EXISTS idx_subleaves_organization_id  ON public.submission_leaves(organization_id);
CREATE INDEX IF NOT EXISTS idx_subleaves_parent_leaf_id   ON public.submission_leaves(parent_leaf_id);

-- Down:
-- DROP TABLE IF EXISTS public.submission_leaves;
-- DROP TABLE IF EXISTS public.ectd_sequences;
-- DROP TABLE IF EXISTS public.submission_regions;
-- DROP TABLE IF EXISTS public.submissions;
