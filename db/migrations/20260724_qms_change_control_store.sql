-- QMS change-control store — the governed change-management process ICH Q10
-- (Pharmaceutical Quality System, §3.2.3) and EU GMP Annex 15 (Qualification &
-- Validation) require, and that 21 CFR 820.30/820.70 + ISO 13485 §7 expect for
-- devices. Backs the Quality & Assurance module's Change Control surface and the
-- /api/mdx/qms/changes/* routes (server/routes/mdx-qms.ts). Read alongside the
-- qms_* document/training tables (migration 20260511_qms_and_labeling.sql).
--
--   qms_change_controls — the change-control register / log. One row per change
--     request, carried through the controlled lifecycle:
--       proposed → under_assessment → approved | rejected
--                → in_implementation → verification → closed   (or cancelled)
--     with the impact assessment, risk/impact classification, segregation-of-
--     duties approval (approver differs from proposer), implementation and
--     effectiveness verification captured on the row.
--
--   qms_change_links — the cross-reference tying each change to the quality
--     records it connects to: deviations, CAPAs, validation protocols and
--     controlled documents. A polymorphic soft-link (link_type + linked_ref)
--     because those records live in heterogeneous subsystems with different key
--     spaces (protocol_deviations.id integer, capa_records.id uuid,
--     process_validation, qms_documents.id) — the register records the governed
--     reference, it does not own those tables.
--
-- Org-scoped (organization_id INTEGER NOT NULL, enforced at the service layer),
-- schema-only, idempotent. Follows the FK-free c2c_*/_store convention; the one
-- FK is intra-file (a link belongs to its change, cascade on delete). 21 CFR
-- Part 11: every lifecycle transition is written to the audit trail by the
-- service layer. Until an org has real rows, the reads fail closed to an honest
-- empty list and the surface renders its typed fixtures.

-- ─── Change-control register ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qms_change_controls (
  id                          SERIAL      PRIMARY KEY,
  organization_id             INTEGER     NOT NULL,
  change_number               TEXT        NOT NULL,              -- e.g. CC-2026-001
  title                       TEXT        NOT NULL,
  description                 TEXT,
  -- What kind of change (drives the impact assessment + which records to link).
  change_type                 TEXT        NOT NULL DEFAULT 'other',
                              -- document | process | equipment | material | supplier
                              -- | method | facility | computer_system | specification | other
  -- Impact/risk classification per Annex 15 change control (minor changes may be
  -- handled under the quality system; major/critical need prior assessment).
  classification              TEXT        NOT NULL DEFAULT 'minor',   -- minor | major | critical
  risk_level                  TEXT,                                    -- low | medium | high
  status                      TEXT        NOT NULL DEFAULT 'proposed',
                              -- proposed | under_assessment | approved | rejected
                              -- | in_implementation | verification | closed | cancelled
  reason                      TEXT,                        -- reason for change (Part 11)
  impact_assessment           TEXT,                        -- the impact-assessment narrative
  implementation_plan         TEXT,
  proposed_by                 INTEGER,                     -- users.id (soft)
  assessed_by                 INTEGER,
  approved_by                 INTEGER,                     -- must differ from proposed_by
  approved_at                 TIMESTAMPTZ,
  target_implementation_date  DATE,
  implemented_at              TIMESTAMPTZ,
  verified_by                 INTEGER,
  verified_at                 TIMESTAMPTZ,
  effectiveness_review        TEXT,                        -- effectiveness-check outcome
  closed_at                   TIMESTAMPTZ,
  qms_document_id             INTEGER,                     -- the controlled change-control form/record (soft)
  metadata                    JSONB       DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_change_org_number_uniq
  ON qms_change_controls (organization_id, change_number)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS qms_change_org_idx    ON qms_change_controls (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qms_change_status_idx ON qms_change_controls (organization_id, status);

-- ─── Change ↔ quality-record cross-reference ───────────────────────────
CREATE TABLE IF NOT EXISTS qms_change_links (
  id                SERIAL      PRIMARY KEY,
  organization_id   INTEGER     NOT NULL,
  change_id         INTEGER     NOT NULL REFERENCES qms_change_controls(id) ON DELETE CASCADE,
  -- Which subsystem the linked record lives in.
  link_type         TEXT        NOT NULL,
                    -- deviation | capa | validation | document | sop | supplier | risk | other
  -- The linked record's business reference (its number/id in its own space),
  -- e.g. DEV-2026-014, CAPA-88, VP-7, SOP-820-50.
  linked_ref        TEXT        NOT NULL,
  linked_label      TEXT,                            -- human title for display
  linked_id         INTEGER,                         -- numeric id when in a known space (e.g. qms_documents.id)
  -- How the change relates to the linked record.
  relationship      TEXT        NOT NULL DEFAULT 'references',
                    -- triggered_by | addresses | requires | impacts | references
  note              TEXT,
  created_by        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qms_change_link_org_idx    ON qms_change_links (organization_id);
CREATE INDEX IF NOT EXISTS qms_change_link_change_idx ON qms_change_links (change_id);
CREATE INDEX IF NOT EXISTS qms_change_link_type_idx   ON qms_change_links (organization_id, link_type);
