-- Regulatory Graph Foundation
-- Migration: 20260429_regulatory_graph.sql
--
-- Extends the existing canonical claims + standards tables with the
-- governance fields needed for cross-program traceability, and adds the
-- single net-new table (standards_applicability).
--
-- Canonical tables this enhances (does NOT duplicate):
--   evidence_claims        (already in shared/schema.ts)
--   device_test_standards  (already in shared/schema.ts)
--
-- New table:
--   standards_applicability  per-program decision: which standards apply,
--                            with what conformance method, and which evidence
--                            object demonstrates conformance.
--
-- Compliance touch points:
--   - 21 CFR Part 11 §11.10(b),(c),(e)  immutable audit + traceable evidence
--   - EU MDR Annex II                    technical documentation traceability
--   - ISO 13485:2016 §4.2.4              control of records

-- ═══════════════════════════════════════════════════════════════════════════════
-- evidence_claims — governance + lifecycle fields
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE evidence_claims
  ADD COLUMN IF NOT EXISTS code                     varchar(80),
  ADD COLUMN IF NOT EXISTS status                   varchar(30) NOT NULL DEFAULT 'proposed',
  ADD COLUMN IF NOT EXISTS superseded_by_claim_id   integer,
  ADD COLUMN IF NOT EXISTS risk_level               varchar(20),
  ADD COLUMN IF NOT EXISTS risk_rationale           text,
  ADD COLUMN IF NOT EXISTS population               text,
  ADD COLUMN IF NOT EXISTS anatomical_site          text,
  ADD COLUMN IF NOT EXISTS use_environment          text,
  ADD COLUMN IF NOT EXISTS source_document          text,
  ADD COLUMN IF NOT EXISTS source_path              text,
  ADD COLUMN IF NOT EXISTS tags                     jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS evidence_claims_status_idx
  ON evidence_claims (status);
CREATE INDEX IF NOT EXISTS evidence_claims_code_idx
  ON evidence_claims (organization_id, code);

-- ═══════════════════════════════════════════════════════════════════════════════
-- device_test_standards — governance + applicability fields
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE device_test_standards
  ADD COLUMN IF NOT EXISTS domain                       text,
  ADD COLUMN IF NOT EXISTS applies_to                   text[],
  ADD COLUMN IF NOT EXISTS fda_recognition_number       varchar(32),
  ADD COLUMN IF NOT EXISTS fda_recognized               boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS eu_harmonized                boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS jurisdictions                text[],
  ADD COLUMN IF NOT EXISTS status                       varchar(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS superseded_by_standard_id    integer,
  ADD COLUMN IF NOT EXISTS withdrawn_at                 timestamp,
  ADD COLUMN IF NOT EXISTS summary                      text,
  ADD COLUMN IF NOT EXISTS source_url                   text;

CREATE INDEX IF NOT EXISTS device_test_standards_domain_idx
  ON device_test_standards (domain);
CREATE INDEX IF NOT EXISTS device_test_standards_status_idx
  ON device_test_standards (status);
CREATE INDEX IF NOT EXISTS device_test_standards_fda_recognized_idx
  ON device_test_standards (fda_recognized);

-- ═══════════════════════════════════════════════════════════════════════════════
-- standards_applicability  (NEW)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS standards_applicability (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          integer NOT NULL,
  program_id               uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,
  standard_id              integer NOT NULL REFERENCES device_test_standards(id) ON DELETE RESTRICT,

  applicability            text NOT NULL,
  rationale                text,

  conformance_method       text,
  conformance_status       text NOT NULL DEFAULT 'not_started',

  primary_evidence_id      uuid REFERENCES evidence_objects(id) ON DELETE SET NULL,
  gap_description          text,

  decided_by               text,
  decided_at               timestamp,
  reviewed_by              text,
  reviewed_at              timestamp,

  metadata                 json,

  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS standards_applicability_program_idx
  ON standards_applicability (program_id);
CREATE INDEX IF NOT EXISTS standards_applicability_standard_idx
  ON standards_applicability (standard_id);
CREATE INDEX IF NOT EXISTS standards_applicability_status_idx
  ON standards_applicability (conformance_status);
CREATE UNIQUE INDEX IF NOT EXISTS standards_applicability_pair_idx
  ON standards_applicability (program_id, standard_id);
