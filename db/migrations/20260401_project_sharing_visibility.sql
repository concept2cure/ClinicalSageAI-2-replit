-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Add project-level sharing and visibility controls for Concept2Cure Projects.
--
-- eCTD/CTD Context:
--   - Module(s): Platform governance and collaboration controls
--   - Integrity Risk Addressed: unauthorized project access and unmanaged collaboration scope
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_visibility_settings (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'private',
  updated_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_visibility_mode
    CHECK (visibility IN ('private', 'org_public')),
  CONSTRAINT uq_project_visibility_settings
    UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_visibility_org
  ON project_visibility_settings (organization_id, visibility);

CREATE TABLE IF NOT EXISTS project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  invited_by_id INTEGER REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_member_role
    CHECK (role IN ('owner', 'edit', 'use')),
  CONSTRAINT chk_project_member_status
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT uq_project_member
    UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_org_project
  ON project_members (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_project_members_user
  ON project_members (organization_id, user_id, status);
