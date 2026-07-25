-- Clinical Regulatory Evidence spine — Phase 1 of the FDA CRL + CSR + Study
-- Design evidence architecture (docs/architecture/CLINICAL_REGULATORY_EVIDENCE_
-- DISCOVERY.md). The shared, source-agnostic evidence layer that links —
-- non-destructively — to the existing corpus (csr_reports, csr_studies,
-- precedent.regulatory_precedents, innovation.submission_outcomes) rather than
-- replacing it.
--
-- Naming: the work order names entities evidence_sources / clinical_studies /
-- regulatory_findings / regulatory_outcomes / evidence_relationships /
-- design_lessons, but evidence_sources, clinical_studies and regulatory are
-- ALREADY TAKEN by unrelated tables. This domain therefore prefixes every table
-- with cre_ (Clinical Regulatory Evidence) — the DISCOVERY doc §2 maps each to
-- its reuse/adapter target. study_design_features and study_result_observations
-- are intentionally NOT tables here: they are READ ADAPTERS over the existing
-- csr_endpoints / csr_endpoint_results / csr_statistical_analyses (Phase 2), so
-- we never duplicate the corpus.
--
-- Tenancy (§13): organization_id INTEGER, NULL = GLOBAL_PUBLIC (the shared FDA
-- CRL corpus, identical for every tenant), non-NULL = tenant-owned — the
-- precedent NULL-org idiom (db/migrations/20260617_precedent_org_isolation.sql).
-- visibility_class carries the three-value label the work order requires.
-- Queried as (organization_id IS NULL OR organization_id = $org); the service
-- layer enforces it and Phase-1 tests prove the boundary.
--
-- Extensibility (§3): type/status/category columns are TEXT with a documented
-- value set (validated in the service via Zod), NOT Postgres enums — the work
-- order forbids a CRL-only worldview, and TEXT admits new source types without
-- an ALTER TYPE. Idempotent (CREATE ... IF NOT EXISTS); org-scoped; soft-delete
-- where mutation is expected.

-- ─── Canonical evidence source (§4.1) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS cre_evidence_sources (
  id                        SERIAL      PRIMARY KEY,
  organization_id           INTEGER,                         -- NULL = GLOBAL_PUBLIC
  visibility_class          TEXT        NOT NULL DEFAULT 'tenant_private', -- global_public | tenant_private | project_private
  client_workspace_id       INTEGER,                         -- project scope (project_private)
  source_type               TEXT        NOT NULL,            -- csr | protocol | sap | fda_crl | fda_review_memo | fda_approval_package | trial_registry | publication | client_document
  agency                    TEXT,                            -- FDA | EMA | PMDA | ...
  source_record_identifier  TEXT,                            -- the source's own id (e.g. application no., DOI, NCT)
  title                     TEXT,
  sponsor                   TEXT,
  product                   TEXT,
  indication                TEXT,
  therapeutic_area          TEXT,
  phase                     TEXT,
  application_type          TEXT,                            -- NDA | BLA | ANDA | 510k | PMA | ...
  application_number        TEXT,
  trial_registry_identifier TEXT,                            -- NCT........
  document_date             DATE,
  official_url              TEXT,
  stored_artifact_ref       TEXT,                            -- pointer to the stored blob/artifact
  checksum                  TEXT,
  version                   TEXT,
  provenance                JSONB       DEFAULT '{}'::jsonb,
  ingestion_status          TEXT        NOT NULL DEFAULT 'pending',  -- pending | ingested | failed
  extraction_status         TEXT        NOT NULL DEFAULT 'pending',  -- pending | extracted | reconciled | verified | failed
  -- Non-destructive soft links into the existing corpus (no hard cross-schema FK).
  linked_csr_report_id      INTEGER,                         -- csr_reports.id
  linked_precedent_id       UUID,                            -- precedent.regulatory_precedents.id
  metadata                  JSONB       DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cre_src_org_idx        ON cre_evidence_sources (organization_id);
CREATE INDEX IF NOT EXISTS cre_src_type_idx       ON cre_evidence_sources (source_type);
CREATE INDEX IF NOT EXISTS cre_src_visibility_idx ON cre_evidence_sources (visibility_class);
CREATE INDEX IF NOT EXISTS cre_src_app_idx        ON cre_evidence_sources (application_number);
CREATE INDEX IF NOT EXISTS cre_src_indication_idx ON cre_evidence_sources (indication);

-- ─── Canonical study identity (§4.2) ───────────────────────────────────
-- A cross-source study identity (protocol/SAP/CSR/registry/publication/
-- application/CRL/approval may all point at one study). NOT every CRL links to a
-- study — application-level findings are supported (regulatory_findings without
-- a related study).
CREATE TABLE IF NOT EXISTS cre_clinical_studies (
  id                    SERIAL      PRIMARY KEY,
  organization_id       INTEGER,                             -- NULL = GLOBAL_PUBLIC
  visibility_class      TEXT        NOT NULL DEFAULT 'tenant_private',
  client_workspace_id   INTEGER,
  canonical_study_key   TEXT        NOT NULL,                -- our stable canonical id
  nct_id                TEXT,
  registry_ids          JSONB       DEFAULT '[]'::jsonb,     -- other registry ids
  sponsor_study_id      TEXT,
  protocol_number       TEXT,
  indication            TEXT,
  phase                 TEXT,
  product               TEXT,
  modality              TEXT,
  sponsor               TEXT,
  study_status          TEXT,
  provenance_confidence REAL,
  linked_csr_study_id   INTEGER,                             -- csr_studies.id (rich CSR detail)
  metadata              JSONB       DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS cre_study_key_uniq ON cre_clinical_studies (organization_id, canonical_study_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cre_study_org_idx   ON cre_clinical_studies (organization_id);
CREATE INDEX IF NOT EXISTS cre_study_nct_idx   ON cre_clinical_studies (nct_id);
CREATE INDEX IF NOT EXISTS cre_study_indic_idx ON cre_clinical_studies (indication);

-- ─── Regulatory findings — the net-new normalized deficiency (§4.5) ─────
-- FDA CRL deficiencies (and later review findings), normalized per finding.
-- Reconciles with regulatory_intel.crl_trajectory_records.deficiency_details and
-- innovation.submission_outcomes.deficiencies_detail (the pattern/ledger grains).
CREATE TABLE IF NOT EXISTS cre_regulatory_findings (
  id                          SERIAL      PRIMARY KEY,
  organization_id             INTEGER,                       -- NULL = GLOBAL_PUBLIC (public FDA CRLs)
  visibility_class            TEXT        NOT NULL DEFAULT 'global_public',
  source_id                   INTEGER     NOT NULL REFERENCES cre_evidence_sources(id) ON DELETE CASCADE,
  application_identifier      TEXT,
  related_study_ids           JSONB       DEFAULT '[]'::jsonb,  -- cre_clinical_studies ids where identifiable
  finding_domain              TEXT,                          -- clinical | cmc | nonclinical | biostatistics | clinical_pharmacology | labeling | safety | facility | other
  finding_category            TEXT,
  finding_subcategory         TEXT,
  fda_review_discipline       TEXT,
  finding_text                TEXT,
  normalized_summary          TEXT,
  requested_action            TEXT,
  severity                    TEXT,                          -- consequence/severity band
  affected_ctd_section        TEXT,
  affected_ich_e3_section     TEXT,
  affected_protocol_element   TEXT,
  affected_sap_element        TEXT,
  affected_study_design_feature TEXT,
  source_page                 INTEGER,
  source_excerpt              TEXT,
  explicit_or_inferred        TEXT        NOT NULL DEFAULT 'explicit',   -- explicit | inferred
  extraction_confidence       REAL,
  verification_status         TEXT        NOT NULL DEFAULT 'unverified', -- unverified | verified | disputed
  metadata                    JSONB       DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cre_finding_org_idx    ON cre_regulatory_findings (organization_id);
CREATE INDEX IF NOT EXISTS cre_finding_source_idx ON cre_regulatory_findings (source_id);
CREATE INDEX IF NOT EXISTS cre_finding_domain_idx ON cre_regulatory_findings (finding_domain);
CREATE INDEX IF NOT EXISTS cre_finding_app_idx    ON cre_regulatory_findings (application_identifier);

-- ─── Regulatory outcomes (§4.6) ────────────────────────────────────────
-- For outcomes carried by an ingested external source (e.g. a public FDA CRL and
-- its later resubmission/approval) that have NO innovation.submission_outcomes
-- row. Internal submissions REUSE innovation.submission_outcomes via the service
-- adapter — this table is not their duplicate. Never uses trial completion as a
-- proxy for regulatory success.
CREATE TABLE IF NOT EXISTS cre_regulatory_outcomes (
  id                          SERIAL      PRIMARY KEY,
  organization_id             INTEGER,                       -- NULL = GLOBAL_PUBLIC
  visibility_class            TEXT        NOT NULL DEFAULT 'global_public',
  source_id                   INTEGER     REFERENCES cre_evidence_sources(id) ON DELETE SET NULL,
  application_identifier      TEXT,
  outcome_type                TEXT        NOT NULL,          -- application_submitted | refuse_to_file | information_request | major_amendment | crl | resubmission | approval | withdrawal | discontinuation | unresolved
  outcome_date                DATE,
  approval_date               DATE,
  time_to_resolution_days     INTEGER,
  evidence_note               TEXT,
  verification_status         TEXT        NOT NULL DEFAULT 'unverified',
  linked_submission_outcome_id TEXT,                         -- innovation.submission_outcomes.id (internal)
  linked_precedent_id         UUID,                          -- precedent.regulatory_precedents.id
  metadata                    JSONB       DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cre_outcome_org_idx  ON cre_regulatory_outcomes (organization_id);
CREATE INDEX IF NOT EXISTS cre_outcome_type_idx ON cre_regulatory_outcomes (outcome_type);
CREATE INDEX IF NOT EXISTS cre_outcome_app_idx  ON cre_regulatory_outcomes (application_identifier);

-- ─── Typed evidence relationships (§4.7) ───────────────────────────────
-- Polymorphic edges across the spine. POTENTIALLY_RELATED edges MUST set
-- is_inferred = true and carry confidence.
CREATE TABLE IF NOT EXISTS cre_evidence_relationships (
  id                SERIAL      PRIMARY KEY,
  organization_id   INTEGER,                                 -- NULL = GLOBAL_PUBLIC
  from_entity_type  TEXT        NOT NULL,                    -- source | study | finding | outcome | design_feature | result_observation | design_lesson | atom
  from_entity_id    TEXT        NOT NULL,                    -- id in that entity's own space
  to_entity_type    TEXT        NOT NULL,
  to_entity_id      TEXT        NOT NULL,
  relationship_type TEXT        NOT NULL,                    -- describes_study | reports_result | supports_application | reviewed_in_application | deficiency_applies_to_study | deficiency_applies_to_design_feature | deficiency_applies_to_endpoint | deficiency_applies_to_analysis | requests_additional_study | requests_reanalysis | requests_safety_data | requests_cmc_remediation | resolved_by_evidence | potentially_related
  is_inferred       BOOLEAN     NOT NULL DEFAULT false,
  confidence        REAL,
  provenance        JSONB       DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cre_rel_org_idx  ON cre_evidence_relationships (organization_id);
CREATE INDEX IF NOT EXISTS cre_rel_from_idx ON cre_evidence_relationships (from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS cre_rel_to_idx   ON cre_evidence_relationships (to_entity_type, to_entity_id);
CREATE INDEX IF NOT EXISTS cre_rel_type_idx ON cre_evidence_relationships (relationship_type);

-- ─── Design lessons — governed derived intelligence (§4.8) ─────────────
-- Never published from a single source as a generalized rule (min_evidence_count
-- + human_review_status gate this in the service). Lessons derived partly from
-- tenant data stay tenant-private (visibility_class) and must not leak globally.
CREATE TABLE IF NOT EXISTS cre_design_lessons (
  id                      SERIAL      PRIMARY KEY,
  organization_id         INTEGER,                           -- NULL = GLOBAL_PUBLIC (only for lessons from public evidence)
  visibility_class        TEXT        NOT NULL DEFAULT 'tenant_private',
  lesson_statement        TEXT        NOT NULL,
  applicable_population    TEXT,
  applicable_phase        TEXT,
  modality                TEXT,
  endpoint_type           TEXT,
  supporting_source_ids   JSONB       DEFAULT '[]'::jsonb,
  contradicting_source_ids JSONB      DEFAULT '[]'::jsonb,
  minimum_evidence_count  INTEGER,
  evidence_quality_score  REAL,
  confidence_interval     JSONB,
  derivation_method       TEXT,
  model_version           TEXT,
  human_review_status     TEXT        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  last_recalculated_at    TIMESTAMPTZ,
  metadata                JSONB       DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cre_lesson_org_idx     ON cre_design_lessons (organization_id);
CREATE INDEX IF NOT EXISTS cre_lesson_review_idx  ON cre_design_lessons (human_review_status);
CREATE INDEX IF NOT EXISTS cre_lesson_phase_idx   ON cre_design_lessons (applicable_phase);
