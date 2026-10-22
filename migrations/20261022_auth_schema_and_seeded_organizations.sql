-- ============================================================================
-- The auth schema and the two seeded organisations, from the migration set
-- instead of the API's boot (MR-03 Stage 3, OPS-16; MR-05 Stage 2, DATA-03)
-- ============================================================================
--
-- WHAT MOVED HERE, 2026-10-22. Until this file, every API start ran these
-- statements and seeds on the OWNER connection (DATABASE_URL, the RDS master
-- credential), from server/db/bootstrap/auth-schema.ts
-- (applyAuthSchemaMigrations, applyModuleCatalogSchema) and
-- server/db/bootstrap/seed-default-org.ts (seedOrganizations). That is why the
-- API task carried the owner credential: ALTER TABLE needs ownership even when
-- every column already exists, and the seed's upsert is refused to the runtime
-- role. They are now the deploy's work. deploy-migrate applies this file as the
-- owner; the API boots as app_service and only verifies the result
-- (server/db/bootstrap/index.ts). The statements are the boot's, unchanged.
--
-- ── Re-runnable, per CLAUDE.md RULE 1 ───────────────────────────────────────
-- Every entry of C2C_MIGRATION_FILES executes on every deploy. Everything here
-- is additive and guarded: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT
-- EXISTS, a catalog-guarded constraint, ON CONFLICT seeds. It drops nothing.
-- On a database install-fresh provisioned (drizzle push) every object already
-- exists and the DDL is a no-op; it matters for a database the boot used to
-- keep in step.
--
-- ── Placement ───────────────────────────────────────────────────────────────
-- Immediately before migrations/20260923_organization_default_client_workspace.sql,
-- so the two seeded organisations get their default client workspace in the
-- same deploy. The boot seed created it with them
-- (ensureOrganizationDefaultWorkspace); that sweep creates it for every
-- organisation that has none.
--
-- ── Seed rows ───────────────────────────────────────────────────────────────
-- A transcription error in a seed cannot be corrected in place (CLAUDE.md
-- RULE 1, seed data), so the seed ends with a row-count assertion: a deploy
-- that leaves either organisation missing fails here, not later.
-- ============================================================================

-- ── organizations: the columns the schema expects ───────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS uuid          UUID DEFAULT gen_random_uuid() NOT NULL,
  ADD COLUMN IF NOT EXISTS slug          TEXT,
  ADD COLUMN IF NOT EXISTS domain        TEXT,
  ADD COLUMN IF NOT EXISTS logo          TEXT,
  ADD COLUMN IF NOT EXISTS industry_mode TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS settings      JSONB,
  ADD COLUMN IF NOT EXISTS api_key       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS seats_purchased INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS tier          TEXT DEFAULT 'standard' NOT NULL,
  ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'active'   NOT NULL,
  ADD COLUMN IF NOT EXISTS max_users     INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_projects  INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_storage   INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT NOW() NOT NULL;

-- Back-fill slug for any row that lacks one, then require it.
UPDATE organizations SET slug = lower(replace(name, ' ', '-'))
WHERE slug IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE slug IS NULL) THEN
    EXECUTE 'ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL';
  END IF;
END $$;

-- ── users: the columns the auth routes expect ───────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash            TEXT,
  ADD COLUMN IF NOT EXISTS title                    TEXT,
  ADD COLUMN IF NOT EXISTS department               TEXT,
  ADD COLUMN IF NOT EXISTS avatar                   TEXT,
  ADD COLUMN IF NOT EXISTS bio                      TEXT,
  ADD COLUMN IF NOT EXISTS status                   TEXT DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS last_login               TIMESTAMP,
  ADD COLUMN IF NOT EXISTS default_organization_id  INTEGER REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS preferences              JSONB,
  ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMP DEFAULT NOW() NOT NULL,
  ADD COLUMN IF NOT EXISTS mfa_enabled              BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_secret               TEXT,
  ADD COLUMN IF NOT EXISTS mfa_backup_codes         JSONB,
  ADD COLUMN IF NOT EXISTS mfa_method               TEXT DEFAULT 'totp',
  ADD COLUMN IF NOT EXISTS mfa_verified_at          TIMESTAMP,
  ADD COLUMN IF NOT EXISTS mfa_totp_last_step       BIGINT,
  ADD COLUMN IF NOT EXISTS email_otp_resends        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_login_attempts    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until             TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_failed_login        TIMESTAMP,
  ADD COLUMN IF NOT EXISTS password_changed_at      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS password_history         JSONB,
  ADD COLUMN IF NOT EXISTS must_change_password     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reset_token              TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires_at   TIMESTAMP;

-- A unique e-mail (sign-in and seeding key on it). Added only when no
-- constraint of that name exists, so a re-run never re-validates it.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;

-- ── organization_users: the membership junction ─────────────────────────────
CREATE TABLE IF NOT EXISTS organization_users (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id         INTEGER NOT NULL REFERENCES users(id),
  role            TEXT DEFAULT 'member' NOT NULL,
  permissions     JSONB,
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(organization_id, user_id)
);

ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS permissions JSONB,
  ADD COLUMN IF NOT EXISTS persona     TEXT;

-- ── The module catalog ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS available_modules (
  id          SERIAL PRIMARY KEY,
  module_id   TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT,
  icon        TEXT,
  path        TEXT,
  sort_order  INTEGER DEFAULT 0,
  metadata    JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS module_subscriptions (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  module_id       TEXT NOT NULL,
  enabled         BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, module_id)
);

-- ── The two organisations the boot seeded ───────────────────────────────────
-- At least one organisation exists.
INSERT INTO organizations (name, slug)
VALUES ('Default', 'default')
ON CONFLICT DO NOTHING;

-- The Concept2Cure Therapeutics organisation, with the shape the boot gave it.
INSERT INTO organizations (name, slug, industry_mode, tier, status, max_users, max_projects, max_storage)
VALUES ('Concept2Cure Therapeutics', 'concept2cure', 'biotech', 'enterprise', 'active', 25, 50, 100)
ON CONFLICT (slug) DO UPDATE SET
  industry_mode = COALESCE(NULLIF(organizations.industry_mode, ''), 'biotech'),
  tier = 'enterprise';

DO $$
DECLARE
  seeded INTEGER;
BEGIN
  SELECT count(*) INTO seeded FROM organizations WHERE slug IN ('default', 'concept2cure');
  IF seeded <> 2 THEN
    RAISE EXCEPTION 'seeded organisations: expected 2 (default, concept2cure), found %', seeded;
  END IF;
END $$;
