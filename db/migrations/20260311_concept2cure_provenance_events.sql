-- Migration: concept2cure_provenance_events
-- Date: 2026-03-11
-- Purpose: Document provenance lineage tracking for regulatory traceability
--
-- Tracks source inputs, generation lineage, transformations, exports,
-- and dossier placement for every artifact. Append-only by policy.

CREATE TABLE IF NOT EXISTS concept2cure_provenance_events (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  artifact_version_id INTEGER REFERENCES concept2cure_artifact_versions(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),

  -- Event classification
  event_type TEXT NOT NULL,     -- source_input, generation, transformation, edit, approval, export, placement
  event_action TEXT NOT NULL,   -- ai_generate, human_edit, template_apply, docx_export, cmc_data_load, etc.

  -- Actor
  actor_id INTEGER REFERENCES users(id),
  actor_name TEXT,
  actor_email TEXT,

  -- Flexible structured details
  details JSONB NOT NULL DEFAULT '{}',

  -- Source tracking
  source_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  source_description TEXT,

  -- Backend provenance
  backend_route TEXT,
  backend_service TEXT,

  -- Network context
  ip_address VARCHAR(45),

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for efficient provenance queries
CREATE INDEX IF NOT EXISTS c2c_prov_artifact_idx ON concept2cure_provenance_events(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_prov_event_type_idx ON concept2cure_provenance_events(event_type);
CREATE INDEX IF NOT EXISTS c2c_prov_org_idx ON concept2cure_provenance_events(organization_id);
CREATE INDEX IF NOT EXISTS c2c_prov_created_at_idx ON concept2cure_provenance_events(created_at);
