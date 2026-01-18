-- CERV2 workbench evidence, links, and audit tables

CREATE TABLE IF NOT EXISTS cerv2_evidence (
    id BIGSERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    program_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    name TEXT NOT NULL,
    evidence_type TEXT NOT NULL DEFAULT 'EVIDENCE',
    status TEXT NOT NULL DEFAULT 'inbox',
    hash TEXT,
    owner TEXT,
    tags TEXT[],
    file_path TEXT,
    mime_type TEXT,
    size_bytes BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS cerv2_evidence_unique
    ON cerv2_evidence (organization_id, program_id, evidence_id);

CREATE INDEX IF NOT EXISTS cerv2_evidence_org_program_idx
    ON cerv2_evidence (organization_id, program_id);

CREATE INDEX IF NOT EXISTS cerv2_evidence_status_idx
    ON cerv2_evidence (status);

CREATE INDEX IF NOT EXISTS cerv2_evidence_hash_idx
    ON cerv2_evidence (hash);

CREATE TABLE IF NOT EXISTS cerv2_evidence_links (
    id BIGSERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    program_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cerv2_evidence_links_unique
    ON cerv2_evidence_links (organization_id, program_id, evidence_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS cerv2_evidence_links_org_program_idx
    ON cerv2_evidence_links (organization_id, program_id);

CREATE TABLE IF NOT EXISTS cerv2_audit_events (
    id BIGSERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    program_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER,
    entity_type TEXT,
    entity_id TEXT,
    diff_summary TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cerv2_audit_org_program_idx
    ON cerv2_audit_events (organization_id, program_id, created_at);

CREATE INDEX IF NOT EXISTS cerv2_audit_type_idx
    ON cerv2_audit_events (organization_id, action, created_at);
