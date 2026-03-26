BEGIN;

CREATE TABLE IF NOT EXISTS conversation_os_accepted_artifact_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  proposal_version_id TEXT,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  artifact_external_id TEXT NOT NULL,
  artifact_version INTEGER NOT NULL,
  artifact_status TEXT NOT NULL,
  placement_state TEXT,
  provenance_event_id TEXT,
  audit_id TEXT,
  governance_state TEXT NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, artifact_external_id, artifact_version)
);

CREATE INDEX IF NOT EXISTS conversation_os_accepted_versions_conv_idx
  ON conversation_os_accepted_artifact_versions (project_id, conversation_id, created_at DESC);

COMMIT;
