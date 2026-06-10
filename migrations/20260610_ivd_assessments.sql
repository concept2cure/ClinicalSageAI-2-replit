-- ============================================================================
-- IVD assessment persistence — the "saved calculator result" spine + generated
-- post-market documents.
-- ============================================================================
--
-- Closes the UI/DB-readiness audit's #1 gap: the IVD lifecycle calculators
-- (CDx pairing, study design, reviewer simulation, analytical/software/change/
-- registration/authoring engines) are pure/stateless, but a regulated product
-- must persist every governed computation with an audit trail (who/when/inputs/
-- result/corpus version) per 21 CFR Part 11 / ISO 13485 record-keeping.
--
-- Tenant model mirrors ivd_performance / design_risk / qms: organization_id is
-- mandatory and program_id is an optional link into regulatory_programs.
-- Service: server/services/regulatory/ivd-assessments.service.ts
-- Routes:  server/routes/ivd-assessments.ts (/api/ivd-assessments)
-- ============================================================================

-- ─── Universal saved-assessment record ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ivd_assessments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  integer NOT NULL REFERENCES organizations(id),
  program_id       uuid,
  -- e.g. cdx_pairing | study_design | reviewer_simulation | ivdr_classification
  --      analytical_stability | analytical_carryover | analytical_cutoff
  --      software_safety_class | change_510k | change_eu_significant
  --      process_validation | signal_disproportionality | registration_fda
  --      registration_eu | declaration_of_conformity | scientific_validity
  assessment_type  text NOT NULL,
  title            text,
  inputs           jsonb NOT NULL DEFAULT '{}'::jsonb,
  result           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- coarse outcome for list filtering (e.g. class A/B/C/D, pass/fail, verdict)
  verdict          text,
  -- knowledge-corpus snapshot that informed the computation (reproducibility)
  corpus_version   text,
  engine_version   text,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS ivd_assessments_org_idx     ON ivd_assessments (organization_id);
CREATE INDEX IF NOT EXISTS ivd_assessments_type_idx    ON ivd_assessments (organization_id, assessment_type);
CREATE INDEX IF NOT EXISTS ivd_assessments_program_idx ON ivd_assessments (program_id);

-- ─── Generated post-market / conformity documents ───────────────────────────
CREATE TABLE IF NOT EXISTS ivd_generated_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  integer NOT NULL REFERENCES organizations(id),
  program_id       uuid,
  -- emdr | mir | fsn | psur | declaration_of_conformity
  doc_type         text NOT NULL,
  title            text,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- draft | final | transmitted | superseded
  status           text NOT NULL DEFAULT 'draft',
  artifact_id      integer,            -- optional link into the artifact/vault store
  corpus_version   text,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS ivd_gendocs_org_idx     ON ivd_generated_documents (organization_id);
CREATE INDEX IF NOT EXISTS ivd_gendocs_type_idx    ON ivd_generated_documents (organization_id, doc_type);
CREATE INDEX IF NOT EXISTS ivd_gendocs_program_idx ON ivd_generated_documents (program_id);
