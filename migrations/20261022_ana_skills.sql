-- =============================================================================
-- 20261022 — AnA skills: an organization's own skills, and its on/off for the
-- platform library
-- =============================================================================
-- Lane ANA-SKILLS (founder-directed, 2026-10-22; moves no D-row).
-- Design docs/design/ANA_SKILLS_2026-10-22.md; evidence
-- docs/evidence/ANA-SKILLS/2026-10-22/.
--
-- 1. account_skill_bundles is the store that already held "how this account
--    does X" (shared/schema.ts). It was created only by drizzle push on
--    install-fresh, so it is created here too, in the drizzle shape, for a
--    database provisioned without it. Its bundles become the organization's
--    own AnA skills; the columns added below are the facets a skill is
--    selected on and what it does to a platform-library skill.
-- 2. organization_skill_settings is new: an administrator's on/off for each
--    platform-library skill, with the reason they stated. The reason and the
--    value before and after are also in the chained audit row written in the
--    same transaction (server/services/account-skill-bundles.ts).
--
-- Rule 1: every statement re-runs on every deploy. All of it is additive and
-- guarded; it drops nothing and replaces no constraint another file defines.
-- Both tables are in public with organization_id INTEGER NOT NULL, so the
-- tenant sweep at the tail of the set polices them.
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_skill_bundles (
  id                        SERIAL PRIMARY KEY,
  bundle_id                 TEXT NOT NULL UNIQUE,
  organization_id           INTEGER NOT NULL REFERENCES organizations(id),
  profile_id                INTEGER,
  name                      TEXT NOT NULL,
  description               TEXT,
  bundle_type               TEXT NOT NULL,
  submission_types          JSON,
  module_types              JSON,
  work_types                JSON,
  regulatory_regions        JSON,
  prompt_fragments          JSON DEFAULT '[]',
  output_structure          JSON,
  evidence_preferences      JSON,
  authority_response_style  JSON,
  policy_bindings           JSON DEFAULT '[]',
  artifact_defaults         JSON,
  reviewer_requirements     JSON,
  version                   INTEGER NOT NULL DEFAULT 1,
  status                    TEXT NOT NULL DEFAULT 'active',
  locked_at                 TIMESTAMP,
  locked_by_id              INTEGER REFERENCES users(id),
  metadata                  JSON,
  created_by_id             INTEGER REFERENCES users(id),
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS acct_bundle_org_idx ON account_skill_bundles (organization_id);
CREATE INDEX IF NOT EXISTS acct_bundle_id_idx ON account_skill_bundles (bundle_id);
CREATE INDEX IF NOT EXISTS acct_bundle_type_idx ON account_skill_bundles (bundle_type);
CREATE INDEX IF NOT EXISTS acct_bundle_status_idx ON account_skill_bundles (status);
CREATE INDEX IF NOT EXISTS acct_bundle_profile_idx ON account_skill_bundles (profile_id);

-- The facets an organization skill is selected on. An empty list means "any",
-- as in the platform library. Lists the bundle already had keep their columns:
-- module_types holds disciplines, work_types use cases, submission_types
-- registry ids and regulatory_regions regions.
ALTER TABLE account_skill_bundles
  ADD COLUMN IF NOT EXISTS extends_skill_key TEXT,
  ADD COLUMN IF NOT EXISTS extension_mode    TEXT,
  ADD COLUMN IF NOT EXISTS triggers          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS segments          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS therapeutic_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS surfaces          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS document_types    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tool_names        JSONB NOT NULL DEFAULT '[]'::jsonb;

-- A skill that extends a library skill names both the skill and what it does
-- to it; one that stands alone names neither. extension_mode IS NOT NULL is
-- stated, not implied by IN (...): NULL IN (...) is NULL, and a CHECK passes on
-- NULL, so without it a skill naming a library skill and no mode was accepted
-- (caught on PostgreSQL before this file first deployed; evidence
-- docs/evidence/ANA-SKILLS/2026-10-22/migration-postgres/).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'account_skill_bundles_extension_check'
       AND conrelid = 'public.account_skill_bundles'::regclass
  ) THEN
    ALTER TABLE account_skill_bundles
      ADD CONSTRAINT account_skill_bundles_extension_check CHECK (
        (extends_skill_key IS NULL AND extension_mode IS NULL)
        OR (extends_skill_key IS NOT NULL AND extension_mode IS NOT NULL AND extension_mode IN ('addendum', 'replace'))
      );
  END IF;
END $$;

-- At most one organization skill in force replaces a given library skill:
-- two would leave AnA to choose between them.
CREATE UNIQUE INDEX IF NOT EXISTS acct_bundle_one_replacement
  ON account_skill_bundles (organization_id, extends_skill_key)
  WHERE extension_mode = 'replace' AND status IN ('active', 'locked');

CREATE INDEX IF NOT EXISTS acct_bundle_extends_idx
  ON account_skill_bundles (organization_id, extends_skill_key)
  WHERE extends_skill_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS organization_skill_settings (
  id               SERIAL PRIMARY KEY,
  organization_id  INTEGER NOT NULL REFERENCES organizations(id),
  skill_key        TEXT NOT NULL,
  enabled          BOOLEAN NOT NULL,
  reason           TEXT NOT NULL,
  updated_by_id    INTEGER REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_skill_settings_org_key UNIQUE (organization_id, skill_key),
  CONSTRAINT organization_skill_settings_reason_check CHECK (length(btrim(reason)) >= 8)
);

CREATE INDEX IF NOT EXISTS organization_skill_settings_org_idx
  ON organization_skill_settings (organization_id);
