/**
 * Idempotent schema repair for the auth tables.
 *
 * Extracted from the original `ensureAuthTables()` in server/db.ts. This
 * module handles schema-level operations only — column adds, constraint
 * adds, table creates. Data seeding (default org, demo user) lives in
 * `seed-default-org.ts`.
 *
 * All statements are `IF NOT EXISTS` / `ON CONFLICT` / guarded `DO $$`
 * blocks, so the function is safe to re-run on every boot.
 *
 * Designed to be called inside a single client transaction; the caller
 * (`ensureAuthTables`) owns BEGIN / COMMIT / ROLLBACK.
 */

import type { PoolClient } from 'pg';

export async function applyAuthSchemaMigrations(client: PoolClient): Promise<void> {
  // ── organizations: add columns the schema expects ──────────────────
  await client.query(`
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
      ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT NOW() NOT NULL
  `);

  // back-fill slug for any rows that lack one, then upgrade to NOT NULL
  await client.query(`
    UPDATE organizations SET slug = lower(replace(name, ' ', '-'))
    WHERE slug IS NULL
  `);
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM organizations WHERE slug IS NULL) THEN
        EXECUTE 'ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL';
      END IF;
    END $$
  `);

  // ── users: add columns the auth routes expect ──────────────────────
  await client.query(`
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
      ADD COLUMN IF NOT EXISTS failed_login_attempts    INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until             TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_failed_login        TIMESTAMP,
      ADD COLUMN IF NOT EXISTS password_changed_at      TIMESTAMP,
      ADD COLUMN IF NOT EXISTS password_history         JSONB,
      ADD COLUMN IF NOT EXISTS must_change_password     BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS reset_token              TEXT,
      ADD COLUMN IF NOT EXISTS reset_token_expires_at   TIMESTAMP
  `);

  // unique constraint on email (needed for ON CONFLICT during seeding)
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
      END IF;
    END $$
  `);

  // ── organization_users junction table ───────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS organization_users (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      user_id         INTEGER NOT NULL REFERENCES users(id),
      role            TEXT DEFAULT 'member' NOT NULL,
      permissions     JSONB,
      created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at      TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(organization_id, user_id)
    )
  `);
  // Back-fill permissions column on junction tables created before it was added
  await client.query(`
    ALTER TABLE organization_users
      ADD COLUMN IF NOT EXISTS permissions JSONB
  `);
}

/**
 * Module-subscription schema creation. Previously bundled into
 * `ensureAuthTables` but logically it's the module-catalog surface, not
 * auth. Kept here (called alongside auth-schema) to preserve the original
 * single-transaction bootstrap contract.
 */
export async function applyModuleCatalogSchema(client: PoolClient): Promise<void> {
  await client.query(`
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
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS module_subscriptions (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      module_id       TEXT NOT NULL,
      enabled         BOOLEAN DEFAULT true,
      created_at      TIMESTAMP DEFAULT NOW(),
      UNIQUE(organization_id, module_id)
    )
  `);
}
