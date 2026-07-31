-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Provision the real, org-scoped per-section USPI (PLLR / 21 CFR 201.57) labeling store with a live write path.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (1.14 labeling) — the USPI / prescribing information
--     that accompanies the application
--   - Integrity Risk Addressed: labeling content presented without a real, tenant-scoped writer; tenant isolation on regulated label text
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================
-- Labeling / prescribing-information store (REAL, org-scoped, with a write path).
--
-- The per-section USPI worklist the v2 LabelingPi surface renders: one row per
-- section of the structured product label (PLLR / 21 CFR 201.57 — 'HL', 'BW',
-- '1'..'17'), carrying its authoring status (draft | review | negotiation |
-- approved | na), whether the agency has proposed an edit (flag = 'agency'),
-- the rendered label text (`content` JSONB: { heading, body[], hl?, warn? }),
-- and the end-of-cycle labeling negotiation (`negotiation` JSONB: { round,
-- cycle, sponsor, agency, rationale } — the sponsor-vs-agency redline). Both
-- JSONB payloads rehydrate straight into the surface's render shape. `program`
-- is a display/provenance identifier ("BX-204 (rezatinib)") — the worklist
-- itself is ORG-scoped: one live row per (organization_id, section_no), which
-- is exactly the surface's contract (it renders the org's single label
-- worklist, no program dimension in the row shape). Document order is DERIVED
-- from section_no on read (HL, BW, then numeric) — no stored seq.
--
-- This replaces the seed-only c2c_labeling_pi blob (20260717_labeling_pi_store.sql):
-- unlike that blob, this table has a real writer — labeling-pi-service.ts
-- (upsertLabelingPiSection, via POST /api/labeling-pi) — so a live tenant
-- populates it by recording/authoring sections, not only the demo seed. Read by
-- GET /api/labeling-pi. Org-scoped, soft-delete aware, audited at the route
-- layer. FK-free (repo migration convention).
--
-- Rejected alternatives (do not re-litigate):
--   * labeling.spl_sections (039_gcc_label_impact_simulator.sql) — document/
--     program-scoped (FK to labeling.spl_documents, no organization_id),
--     LOINC-keyed, carries no authoring status/flag/negotiation, and its only
--     writer is schema-drifted/non-functional. Different contract entirely.
--   * labeling_documents (20260511_qms_and_labeling.sql) — device labeling
--     (IFU / operator manual / UDI-DI), a different regulatory domain from the
--     drug USPI this surface renders.

CREATE TABLE IF NOT EXISTS labeling_pi_sections (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id INTEGER     NOT NULL,
  section_no      TEXT        NOT NULL,               -- 'HL' | 'BW' | '1'..'17' (rehydrates as `n`)
  label           TEXT        NOT NULL,               -- display: "Indications and usage"
  status          TEXT        NOT NULL DEFAULT 'draft', -- draft | review | negotiation | approved | na (rehydrates as `st`)
  flag            TEXT,                               -- 'agency' (FDA proposed an edit) | NULL
  program         TEXT,                               -- display/provenance: "BX-204 (rezatinib)"
  content         JSONB,                              -- { heading, body[], hl?, warn? } — the rendered label text
  negotiation     JSONB,                              -- { round, cycle, sponsor, agency, rationale } — the agency redline
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  PRIMARY KEY (id)
);

-- One LIVE row per section per org (soft-deleted rows may repeat a section_no);
-- also the upsert target of labeling-pi-service.ts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_labeling_pi_sections_org_section
  ON labeling_pi_sections (organization_id, section_no)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_labeling_pi_sections_org
  ON labeling_pi_sections (organization_id)
  WHERE deleted_at IS NULL;
