-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Provision the conversation-OS accepted-artifact-version durability store, integer-tenant-keyed.
--
-- eCTD/CTD Context:
--   - Module(s): all (cross-cutting AI/governance evidence)
--   - Integrity Risk Addressed: accepted-artifact provenance recorded with a TEXT org key while the route carries an integer org id
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Tenant identity MUST be the canonical INTEGER organizations.id (C-38).
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS conversation_os_accepted_artifact_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  proposal_version_id TEXT,
  user_id TEXT NOT NULL,
  organization_id INTEGER NOT NULL,
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
