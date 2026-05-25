-- ============================================================================
-- Program Workbench & Evidence schema — backfill for shared/schema/programs.ts
-- ============================================================================
--
-- The five tables defined in shared/schema/programs.ts (regulatory_programs,
-- evidence_objects, evidence_links, program_milestones, program_activity_log)
-- never had a SQL migration. drizzle.config.ts points only at
-- shared/schema.ts, which does not re-export ./schema/programs, so these
-- tables are invisible to both `drizzle-kit push` and the migration set —
-- yet services import them directly (PDEV provenance/evidence,
-- regulatory-programs service, contradiction trace, q-sub bridge).
--
-- This migration creates them idempotently so a fresh database can serve the
-- PDEV surfaces (program selector, readiness, evidence picker, provenance
-- trace) and any other consumer of the regulatory_programs UUID.
--
-- Column definitions mirror the drizzle table builders verbatim. JSON columns
-- use `json` (not jsonb) to match the drizzle `json(...)` calls. Defaults that
-- drizzle expresses as `.default([])` map to a JSON empty-array literal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- regulatory_programs — top-level submission-effort container
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS regulatory_programs (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           INTEGER NOT NULL,

    name                      TEXT NOT NULL,
    code                      VARCHAR(50) NOT NULL,
    description               TEXT,

    program_type              TEXT NOT NULL,
    product_type              TEXT NOT NULL,
    device_class              TEXT,
    regulatory_path           TEXT,

    primary_agency            TEXT NOT NULL,
    target_agencies           JSON DEFAULT '[]'::json,

    product_name              TEXT NOT NULL,
    product_code              VARCHAR(50),
    indication                TEXT,
    intended_use              TEXT,

    predicate_devices         JSON DEFAULT '[]'::json,
    equivalent_devices        JSON DEFAULT '[]'::json,

    status                    TEXT NOT NULL DEFAULT 'draft',
    phase                     TEXT DEFAULT 'planning',
    priority                  TEXT DEFAULT 'medium',

    target_submission_date    TIMESTAMP,
    actual_submission_date    TIMESTAMP,
    approval_date             TIMESTAMP,

    progress_percent          INTEGER DEFAULT 0,
    completed_milestones      INTEGER DEFAULT 0,
    total_milestones          INTEGER DEFAULT 0,

    lead_user_id              INTEGER,
    team_members              JSON DEFAULT '[]'::json,

    settings                  JSON,
    metadata                  JSON,
    tags                      JSON DEFAULT '[]'::json,

    created_by                TEXT,
    updated_by                TEXT,
    deleted_at                TIMESTAMP,
    created_at                TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                TIMESTAMP NOT NULL DEFAULT now()
);

-- Older databases created regulatory_programs before deleted_at existed
-- (the column is assumed by mdx-search and other soft-delete filters).
ALTER TABLE regulatory_programs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS reg_programs_org_idx    ON regulatory_programs (organization_id);
CREATE INDEX IF NOT EXISTS reg_programs_status_idx ON regulatory_programs (status);
CREATE INDEX IF NOT EXISTS reg_programs_type_idx   ON regulatory_programs (program_type);
CREATE UNIQUE INDEX IF NOT EXISTS reg_programs_code_idx ON regulatory_programs (organization_id, code);

-- ----------------------------------------------------------------------------
-- evidence_objects — atomic units of proof supporting regulatory claims
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS evidence_objects (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           INTEGER NOT NULL,
    program_id                UUID REFERENCES regulatory_programs(id) ON DELETE SET NULL,

    title                     TEXT NOT NULL,
    code                      VARCHAR(100),
    description               TEXT,

    evidence_type             TEXT NOT NULL,
    evidence_category         TEXT NOT NULL,
    evidence_level            TEXT,

    source_type               TEXT NOT NULL,
    source_reference          TEXT,
    source_citation           TEXT,

    document_id               INTEGER,
    document_version          TEXT,
    page_range                TEXT,
    excerpt                   TEXT,

    quality_score             DECIMAL(3, 2),
    relevance_score           DECIMAL(3, 2),
    valid_from                TIMESTAMP,
    valid_until               TIMESTAMP,
    is_verified               BOOLEAN DEFAULT false,
    verified_by               TEXT,
    verified_at               TIMESTAMP,

    authors                   JSON,
    publication_date          TIMESTAMP,
    journal                   TEXT,
    doi                       TEXT,
    pmid                      TEXT,
    abstract                  TEXT,

    test_type                 TEXT,
    test_lab                  TEXT,
    test_date                 TIMESTAMP,
    test_results              JSON,

    status                    TEXT NOT NULL DEFAULT 'pending',

    metadata                  JSON,
    tags                      JSON DEFAULT '[]'::json,

    created_by                TEXT,
    updated_by                TEXT,
    created_at                TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_objects_org_idx      ON evidence_objects (organization_id);
CREATE INDEX IF NOT EXISTS evidence_objects_program_idx  ON evidence_objects (program_id);
CREATE INDEX IF NOT EXISTS evidence_objects_type_idx     ON evidence_objects (evidence_type);
CREATE INDEX IF NOT EXISTS evidence_objects_category_idx ON evidence_objects (evidence_category);
CREATE INDEX IF NOT EXISTS evidence_objects_status_idx   ON evidence_objects (status);

-- ----------------------------------------------------------------------------
-- evidence_links — traceability from claims/sections back to evidence
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS evidence_links (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           INTEGER NOT NULL,

    evidence_id               UUID NOT NULL
                              REFERENCES evidence_objects(id) ON DELETE CASCADE,

    target_type               TEXT NOT NULL,
    target_id                 TEXT NOT NULL,
    target_path               TEXT,

    link_type                 TEXT NOT NULL DEFAULT 'supports',
    strength                  TEXT DEFAULT 'moderate',
    rationale                 TEXT,

    is_verified               BOOLEAN DEFAULT false,
    verified_by               TEXT,
    verified_at               TIMESTAMP,

    created_by                TEXT,
    created_at                TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_links_evidence_idx ON evidence_links (evidence_id);
CREATE INDEX IF NOT EXISTS evidence_links_target_idx   ON evidence_links (target_type, target_id);
CREATE INDEX IF NOT EXISTS evidence_links_org_idx      ON evidence_links (organization_id);

-- ----------------------------------------------------------------------------
-- program_milestones — key deliverables/milestones per program
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS program_milestones (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id                UUID NOT NULL
                              REFERENCES regulatory_programs(id) ON DELETE CASCADE,

    name                      TEXT NOT NULL,
    description               TEXT,
    category                  TEXT NOT NULL,

    target_date               TIMESTAMP,
    actual_date               TIMESTAMP,
    duration_days             INTEGER,

    status                    TEXT NOT NULL DEFAULT 'pending',
    progress                  INTEGER DEFAULT 0,

    depends_on                JSON DEFAULT '[]'::json,

    assignee_id               INTEGER,
    assignee_name             TEXT,

    deliverables              JSON DEFAULT '[]'::json,

    notes                     TEXT,

    created_by                TEXT,
    updated_by                TEXT,
    created_at                TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS program_milestones_program_idx ON program_milestones (program_id);
CREATE INDEX IF NOT EXISTS program_milestones_status_idx  ON program_milestones (status);
CREATE INDEX IF NOT EXISTS program_milestones_target_idx  ON program_milestones (target_date);

-- ----------------------------------------------------------------------------
-- program_activity_log — audit/timeline trail of program activities
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS program_activity_log (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id                UUID NOT NULL
                              REFERENCES regulatory_programs(id) ON DELETE CASCADE,
    organization_id           INTEGER NOT NULL,

    activity_type             TEXT NOT NULL,
    entity_type               TEXT,
    entity_id                 TEXT,

    title                     TEXT NOT NULL,
    description               TEXT,
    details                   JSON,

    user_id                   INTEGER,
    user_name                 TEXT,
    user_role                 TEXT,

    timestamp                 TIMESTAMP NOT NULL DEFAULT now(),
    ip_address                TEXT
);

CREATE INDEX IF NOT EXISTS program_activity_program_idx   ON program_activity_log (program_id);
CREATE INDEX IF NOT EXISTS program_activity_timestamp_idx ON program_activity_log (timestamp);
CREATE INDEX IF NOT EXISTS program_activity_type_idx      ON program_activity_log (activity_type);
