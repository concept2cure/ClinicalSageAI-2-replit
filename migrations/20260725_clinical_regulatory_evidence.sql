-- ═══════════════════════════════════════════════════════════════════════════
-- Clinical-Regulatory Intelligence Graph — phase 1 shared evidence contracts
--
-- Work order §4. Mirrors the Drizzle tables at the end of shared/schema.ts.
-- See docs/architecture/CLINICAL_REGULATORY_INTELLIGENCE_GRAPH_DISCOVERY.md.
--
-- NON-DESTRUCTIVE. Additive only: csr_reports, csr_details and lumen_data_atoms
-- are untouched. The CSR adapter (phase 2) PROJECTS from those tables into this
-- model; the corpus writer's NCT-idempotent upsert keeps working unchanged.
--
-- ── Visibility (§14) ──────────────────────────────────────────────────────
-- organization_id IS NULL exactly for globally-readable public evidence
-- (official FDA letters). Tenant evidence always carries an org id. Retrieval
-- filters as:
--     (organization_id IS NULL AND visibility = 'public') OR organization_id = :org
-- so public evidence is shared and one tenant's private CSR can never enter
-- another tenant's retrieval or a global benchmark.
--
-- ── Rollback ──────────────────────────────────────────────────────────────
-- Every object here is new. To roll back, drop in reverse dependency order:
--     DROP TABLE IF EXISTS design_lessons, evidence_relationships,
--       regulatory_application_outcomes, regulatory_findings, regulatory_applications,
--       study_result_observations, clinical_study_identities, clinical_evidence_sources
--       CASCADE;
-- No existing data is modified, so rollback loses only graph data.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinical_evidence_sources (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    INTEGER REFERENCES organizations(id),
  project_id         INTEGER,
  source_type        TEXT NOT NULL,
  visibility         TEXT NOT NULL DEFAULT 'tenant_private',
  title              TEXT,
  official_url       TEXT,
  checksum           TEXT,
  version            INTEGER NOT NULL DEFAULT 1,
  document_date      TIMESTAMP,
  ingestion_status   TEXT NOT NULL DEFAULT 'pending',
  extraction_method  TEXT,
  provenance         JSON,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cre_src_checksum_uniq UNIQUE (checksum, version),
  -- Public evidence is global and must not be tenant-owned; tenant-private
  -- evidence must always carry an owner. Enforced here so no application bug
  -- can create a tenant-owned "public" row that leaks into a global benchmark.
  CONSTRAINT cre_src_visibility_scope CHECK (
    (visibility = 'public' AND organization_id IS NULL)
    OR (visibility <> 'public' AND organization_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS cre_src_org_idx  ON clinical_evidence_sources (organization_id);
CREATE INDEX IF NOT EXISTS cre_src_type_idx ON clinical_evidence_sources (source_type, visibility);

CREATE TABLE IF NOT EXISTS clinical_study_identities (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    INTEGER REFERENCES organizations(id),
  nct_id             TEXT,
  sponsor_study_id   TEXT,
  protocol_number    TEXT,
  product            TEXT,
  indication         TEXT,
  phase              TEXT,
  sponsor            TEXT,
  modality           TEXT,
  linkage_status     TEXT NOT NULL DEFAULT 'inferred',
  linkage_rationale  TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cre_study_linkage_status CHECK (linkage_status IN ('explicit', 'inferred')),
  -- An inferred linkage without a rationale is an unfalsifiable claim.
  CONSTRAINT cre_study_inferred_needs_rationale CHECK (
    linkage_status <> 'inferred' OR linkage_rationale IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS cre_study_nct_idx        ON clinical_study_identities (nct_id);
CREATE INDEX IF NOT EXISTS cre_study_org_idx        ON clinical_study_identities (organization_id);
CREATE INDEX IF NOT EXISTS cre_study_indication_idx ON clinical_study_identities (indication, phase);

CREATE TABLE IF NOT EXISTS study_result_observations (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id               INTEGER REFERENCES organizations(id),
  source_id                     UUID NOT NULL REFERENCES clinical_evidence_sources(id),
  study_id                      UUID REFERENCES clinical_study_identities(id),
  endpoint                      TEXT NOT NULL,
  population                    TEXT,
  effect_measure                TEXT,
  value                         REAL,
  se                            REAL,
  ci_low                        REAL,
  ci_high                       REAL,
  p_value                       REAL,
  n                             INTEGER,
  timepoint                     TEXT,
  transformations               TEXT[],
  benefit_direction_normalized  BOOLEAN NOT NULL DEFAULT FALSE,
  method                        TEXT,
  source_excerpt                TEXT,
  source_page                   INTEGER,
  verification                  TEXT NOT NULL DEFAULT 'extracted_unreviewed',
  created_at                    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cre_obs_src_idx      ON study_result_observations (source_id);
CREATE INDEX IF NOT EXISTS cre_obs_study_idx    ON study_result_observations (study_id);
CREATE INDEX IF NOT EXISTS cre_obs_endpoint_idx ON study_result_observations (endpoint, verification);
CREATE INDEX IF NOT EXISTS cre_obs_org_idx      ON study_result_observations (organization_id);

CREATE TABLE IF NOT EXISTS regulatory_applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     INTEGER REFERENCES organizations(id),
  application_type    TEXT NOT NULL,
  application_number  TEXT NOT NULL,
  sponsor             TEXT,
  product             TEXT,
  indication          TEXT,
  submitted_at        TIMESTAMP,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cre_app_number_uniq UNIQUE (application_type, application_number)
);
CREATE INDEX IF NOT EXISTS cre_app_org_idx ON regulatory_applications (organization_id);

CREATE TABLE IF NOT EXISTS regulatory_findings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        INTEGER REFERENCES organizations(id),
  source_id              UUID NOT NULL REFERENCES clinical_evidence_sources(id),
  application_id         UUID REFERENCES regulatory_applications(id),
  study_id               UUID REFERENCES clinical_study_identities(id),
  finding                TEXT NOT NULL,
  requested_action       TEXT,
  severity               TEXT NOT NULL DEFAULT 'medium',
  discipline             TEXT NOT NULL,
  category               TEXT,
  applicability          TEXT NOT NULL DEFAULT 'unknown',

  -- Mapping value and its epistemic status are separate columns, so an inferred
  -- mapping is structurally incapable of being stored as source-explicit (§7.2).
  ctd_section            TEXT,
  ctd_section_status     TEXT,
  ich_e3_section         TEXT,
  ich_e3_section_status  TEXT,
  design_node_type       TEXT,
  design_node_status     TEXT,
  deficiency_id          TEXT,

  epistemic_status       TEXT NOT NULL DEFAULT 'inferred',
  verification           TEXT NOT NULL DEFAULT 'extracted_unreviewed',
  reviewed_at            TIMESTAMP,
  reviewed_by            INTEGER REFERENCES users(id),
  conflict               BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_note          TEXT,

  source_excerpt         TEXT,
  source_page            INTEGER,
  source_locator         TEXT,

  extraction_method      TEXT,
  model_version          TEXT,
  prompt_version         TEXT,
  created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT cre_find_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT cre_find_applicability CHECK (
    applicability IN ('study', 'application', 'facility', 'product', 'cmc', 'labeling', 'unknown')
  ),
  CONSTRAINT cre_find_epistemic CHECK (epistemic_status IN ('explicit', 'inferred')),
  CONSTRAINT cre_find_verification CHECK (
    verification IN (
      'source_verified', 'extracted_unreviewed', 'inferred_mapping',
      'potential_study_link', 'insufficient_evidence', 'stale_recalculate'
    )
  ),
  -- A finding attributed to a study MUST be study-level. This is the database
  -- refusing the single most consequential fabrication in the domain: silently
  -- pinning a facility or CMC deficiency onto a clinical trial (§6.2).
  CONSTRAINT cre_find_study_requires_study_level CHECK (
    study_id IS NULL OR applicability = 'study'
  ),
  -- 'source_verified' is a claim about human review; it requires the timestamp
  -- that proves one happened.
  CONSTRAINT cre_find_verified_needs_review CHECK (
    verification <> 'source_verified' OR reviewed_at IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS cre_find_src_idx         ON regulatory_findings (source_id);
CREATE INDEX IF NOT EXISTS cre_find_app_idx         ON regulatory_findings (application_id);
CREATE INDEX IF NOT EXISTS cre_find_study_idx       ON regulatory_findings (study_id);
CREATE INDEX IF NOT EXISTS cre_find_org_idx         ON regulatory_findings (organization_id);
-- The §8.1 constraint set. These run BEFORE semantic ranking, so similarity
-- reorders an already-correct candidate set rather than widening it.
CREATE INDEX IF NOT EXISTS cre_find_constraint_idx  ON regulatory_findings (discipline, category, verification, applicability);
CREATE INDEX IF NOT EXISTS cre_find_ctd_idx         ON regulatory_findings (ctd_section);
CREATE INDEX IF NOT EXISTS cre_find_e3_idx          ON regulatory_findings (ich_e3_section);
CREATE INDEX IF NOT EXISTS cre_find_design_node_idx ON regulatory_findings (design_node_type);
CREATE INDEX IF NOT EXISTS cre_find_conflict_idx    ON regulatory_findings (conflict);

CREATE TABLE IF NOT EXISTS regulatory_application_outcomes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     INTEGER REFERENCES organizations(id),
  application_id      UUID NOT NULL REFERENCES regulatory_applications(id),
  source_id           UUID REFERENCES clinical_evidence_sources(id),
  outcome             TEXT NOT NULL,
  outcome_date        TIMESTAMP,
  resubmission_state  TEXT,
  verified_at         TIMESTAMP,
  verified_by         INTEGER REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cre_outcome_kind CHECK (
    outcome IN ('crl', 'resubmission', 'approval', 'withdrawal', 'unresolved')
  ),
  -- A resolved outcome must carry the verification that resolved it. 'unresolved'
  -- is the only state that may exist without one — and it is the honest default,
  -- not a gap. Trial completion can never satisfy this constraint (§4.2).
  CONSTRAINT cre_outcome_resolved_needs_verification CHECK (
    outcome = 'unresolved' OR verified_at IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS cre_outcome_app_idx ON regulatory_application_outcomes (application_id);
CREATE INDEX IF NOT EXISTS cre_outcome_org_idx ON regulatory_application_outcomes (organization_id);

CREATE TABLE IF NOT EXISTS evidence_relationships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   INTEGER REFERENCES organizations(id),
  from_type         TEXT NOT NULL,
  from_id           TEXT NOT NULL,
  to_type           TEXT NOT NULL,
  to_id             TEXT NOT NULL,
  relationship      TEXT NOT NULL,
  epistemic_status  TEXT NOT NULL DEFAULT 'inferred',
  rationale         TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cre_rel_epistemic CHECK (epistemic_status IN ('explicit', 'inferred')),
  -- §4.1: POTENTIALLY_RELATED must ALWAYS be marked inferred and carry a
  -- rationale. A speculative edge that looks like an asserted one is how a
  -- guess becomes a citation.
  CONSTRAINT cre_rel_potential_is_inferred CHECK (
    relationship <> 'POTENTIALLY_RELATED'
    OR (epistemic_status = 'inferred' AND rationale IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS cre_rel_from_idx ON evidence_relationships (from_type, from_id);
CREATE INDEX IF NOT EXISTS cre_rel_to_idx   ON evidence_relationships (to_type, to_id);
CREATE INDEX IF NOT EXISTS cre_rel_kind_idx ON evidence_relationships (relationship);
CREATE INDEX IF NOT EXISTS cre_rel_org_idx  ON evidence_relationships (organization_id);

CREATE TABLE IF NOT EXISTS design_lessons (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           INTEGER REFERENCES organizations(id),
  project_id                INTEGER,
  lesson                    TEXT NOT NULL,
  applicability             JSON,
  derivation_method         TEXT NOT NULL,
  minimum_evidence          JSON,
  supporting_source_ids     TEXT[],
  contradicting_source_ids  TEXT[],
  coverage                  JSON,
  confidence_method         TEXT,
  version                   INTEGER NOT NULL DEFAULT 1,
  review_state              TEXT NOT NULL DEFAULT 'draft',
  reviewed_at               TIMESTAMP,
  reviewed_by               INTEGER REFERENCES users(id),
  recalculate_after         TIMESTAMP,
  retired_at                TIMESTAMP,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT cre_lesson_review_state CHECK (
    review_state IN ('draft', 'extracted', 'human_reviewed')
  ),
  -- A human-reviewed lesson must record who reviewed it and when. §12.1: a
  -- derived lesson is not a source fact, and client-facing influence requires
  -- a real review, not a state someone set.
  CONSTRAINT cre_lesson_reviewed_needs_reviewer CHECK (
    review_state <> 'human_reviewed' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS cre_lesson_org_idx    ON design_lessons (organization_id);
CREATE INDEX IF NOT EXISTS cre_lesson_review_idx ON design_lessons (review_state);
