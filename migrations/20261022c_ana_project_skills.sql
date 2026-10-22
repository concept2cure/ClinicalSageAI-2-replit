-- =============================================================================
-- 20261022c — AnA skills in a project: deployed there, turned off there, or
-- written for it
-- =============================================================================
-- Lane ANA-SKILLS (founder-directed, 2026-10-22; moves no D-row).
-- Design docs/design/ANA_SKILLS_2026-10-22.md §9; evidence
-- docs/evidence/ANA-SKILLS/2026-10-22/skills-in-use/.
--
-- 1. project_skill_settings: a project's own setting for one skill (a library
--    skill key or an organization skill's org:<bundle_id> key). 'always' loads
--    it on every AnA turn in the project; 'off' never loads it there. The
--    organization-level on/off (organization_skill_settings, 20261022) is the
--    same shape one level up. A setting is written with a stated reason and a
--    chained audit row in the same transaction
--    (server/services/ana/skills/project-skills.ts). The cap on 'always' is
--    enforced by that writer under an advisory lock, not here.
-- 2. account_skill_bundles.project_id: an organization skill written for one
--    project. Selected only on that project's turns.
--
-- Not projects.settings: that column is normalized for sharing
-- (normalizeProjectSettings) and holds no per-entry reason; a skill setting
-- needs its own reason and audit row, as the organization setting does.
--
-- Rule 1: every statement re-runs on every deploy. All of it is additive and
-- guarded; it drops nothing and replaces no constraint another file defines.
-- The table is in public with organization_id INTEGER NOT NULL, so the tenant
-- sweep at the tail of the set polices it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_skill_settings (
  id               SERIAL PRIMARY KEY,
  organization_id  INTEGER NOT NULL REFERENCES organizations(id),
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  skill_key        TEXT NOT NULL,
  state            TEXT NOT NULL,
  reason           TEXT NOT NULL,
  updated_by_id    INTEGER REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_skill_settings_project_key UNIQUE (project_id, skill_key),
  CONSTRAINT project_skill_settings_state_check CHECK (state IN ('always', 'off')),
  CONSTRAINT project_skill_settings_reason_check CHECK (length(btrim(reason)) >= 8)
);

CREATE INDEX IF NOT EXISTS project_skill_settings_org_project_idx
  ON project_skill_settings (organization_id, project_id);

ALTER TABLE account_skill_bundles
  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS acct_bundle_project_idx
  ON account_skill_bundles (organization_id, project_id)
  WHERE project_id IS NOT NULL;
