-- =============================================================================
-- Phase 6: DOCX Factory — Schema + Tables + RLS + Indexes
-- =============================================================================
-- Creates the "documents" schema with program-scoped RLS via GUC
-- (app.current_program_id) matching the Evidence Fabric pattern.
--
-- Tables:
--   documents.templates          — template registry
--   documents.template_versions  — immutable versioned snapshots
--   documents.renders            — render requests (status lifecycle)
--   documents.artifacts          — produced files (metadata + sha256)
--   documents.render_events      — append-only event log
-- =============================================================================

-- 1. Schema
CREATE SCHEMA IF NOT EXISTS documents;

-- =============================================================================
-- 2. Tables
-- =============================================================================

-- 2a. templates — one row per named template, program-scoped
CREATE TABLE IF NOT EXISTS documents.templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id      UUID NOT NULL,
    name            TEXT NOT NULL,
    doc_type        TEXT NOT NULL DEFAULT 'generic',
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2b. template_versions — immutable snapshots of a template file
CREATE TABLE IF NOT EXISTS documents.template_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES documents.templates(id) ON DELETE CASCADE,
    version         INT NOT NULL DEFAULT 1,
    storage_key     TEXT NOT NULL,
    sha256          TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_template_version UNIQUE (template_id, version)
);

-- 2c. renders — render requests with status lifecycle
CREATE TABLE IF NOT EXISTS documents.renders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id              UUID NOT NULL,
    template_version_id     UUID NOT NULL REFERENCES documents.template_versions(id) ON DELETE RESTRICT,
    inputs_json             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                  TEXT NOT NULL DEFAULT 'queued',
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    error                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2d. artifacts — produced files (metadata only; bytes live in blob store)
CREATE TABLE IF NOT EXISTS documents.artifacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    render_id       UUID NOT NULL REFERENCES documents.renders(id) ON DELETE CASCADE,
    file_type       TEXT NOT NULL DEFAULT 'docx',
    storage_key     TEXT NOT NULL,
    sha256          TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2e. render_events — append-only audit trail
CREATE TABLE IF NOT EXISTS documents.render_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    render_id       UUID NOT NULL REFERENCES documents.renders(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 3. Row-Level Security (RLS)
-- =============================================================================
-- Same GUC pattern as Evidence Fabric: program_id filtered by
-- current_setting('app.current_program_id') with bypass escape hatch.

ALTER TABLE documents.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents.renders ENABLE ROW LEVEL SECURITY;

-- templates policy
DO $$ BEGIN
CREATE POLICY documents_templates_program_isolation ON documents.templates
    USING (
        program_id::TEXT = current_setting('app.current_program_id', TRUE)
        OR current_setting('app.bypass_rls', TRUE) = 'true'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- renders policy
DO $$ BEGIN
CREATE POLICY documents_renders_program_isolation ON documents.renders
    USING (
        program_id::TEXT = current_setting('app.current_program_id', TRUE)
        OR current_setting('app.bypass_rls', TRUE) = 'true'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- template_versions: access controlled via FK to templates (no direct program_id)
-- artifacts / render_events: access controlled via FK to renders


-- =============================================================================
-- 4. Indexes
-- =============================================================================

-- templates: program lookup, ordered by recency
CREATE INDEX IF NOT EXISTS idx_documents_templates_program
    ON documents.templates (program_id, created_at DESC);

-- template_versions: lookup by template
CREATE INDEX IF NOT EXISTS idx_documents_template_versions_template
    ON documents.template_versions (template_id, version);

-- renders: program lookup, ordered by recency
CREATE INDEX IF NOT EXISTS idx_documents_renders_program
    ON documents.renders (program_id, created_at DESC);

-- renders: status filter for queue processing
CREATE INDEX IF NOT EXISTS idx_documents_renders_status
    ON documents.renders (status) WHERE status IN ('queued', 'running');

-- artifacts: lookup by render
CREATE INDEX IF NOT EXISTS idx_documents_artifacts_render
    ON documents.artifacts (render_id);

-- render_events: lookup by render, ordered chronologically
CREATE INDEX IF NOT EXISTS idx_documents_render_events_render
    ON documents.render_events (render_id, created_at);


-- =============================================================================
-- 5. Grants
-- =============================================================================

DO $$ BEGIN
    GRANT USAGE ON SCHEMA documents TO current_user;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA documents TO current_user;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Grant adjustments: %', SQLERRM;
END $$;
