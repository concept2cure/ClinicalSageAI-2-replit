/**
 * Seed data for orgs and the GA demo admin user.
 *
 * Extracted from the original `ensureAuthTables()` in server/db.ts. This
 * module handles seed data only — the schema migrations live in
 * `auth-schema.ts`.
 *
 * Runs inside the same client transaction as the schema migrations; the
 * caller (`ensureAuthTables`) owns BEGIN / COMMIT / ROLLBACK. All inserts
 * use ON CONFLICT so re-running is a safe no-op.
 */

import type { PoolClient } from 'pg';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('database');

// bcrypt hash of "pass-word" with 12 rounds (pre-computed for startup speed).
// Seeded onto the GA demo user. Production deployments that don't want this
// demo user can delete the user row after startup; the seed is idempotent.
const DEMO_EMAIL = 'jm.smith@concept2cure.pro';
const DEMO_NAME = 'JM Smith';
const DEMO_PASSWORD_HASH = '$2b$12$ZE1acJqmLIAbDLl2h2eUiOeXLXCunsidscRZDA7Wt4.kiYBiNgFnu';

export async function seedOrganizations(client: PoolClient): Promise<void> {
  // Guarantee at least one org exists.
  await client.query(`
    INSERT INTO organizations (name, slug)
    VALUES ('Default', 'default')
    ON CONFLICT DO NOTHING
  `);

  // Ensure the Concept2Cure Therapeutics org exists with the expected shape.
  await client.query(`
    INSERT INTO organizations (name, slug, industry_mode, tier, status, max_users, max_projects, max_storage)
    VALUES ('Concept2Cure Therapeutics', 'concept2cure', 'biotech', 'enterprise', 'active', 25, 50, 100)
    ON CONFLICT (slug) DO UPDATE SET
      industry_mode = COALESCE(NULLIF(organizations.industry_mode, ''), 'biotech'),
      tier = 'enterprise'
  `);
}

/**
 * Whether to seed the GA demo admin. The demo user carries a publicly-known
 * password hash (bcrypt of "pass-word"), so it must never appear on a real
 * production deployment by accident.
 *
 * Production is FAIL-CLOSED: the seed runs only when SEED_DEMO_USER is
 * explicitly truthy (true/1/yes/on). Unset or blank disables it — so a
 * hand-configured prod deploy that forgets the flag does NOT get a
 * known-password admin over real data.
 *
 * Non-production keeps the convenience default: seed unless explicitly
 * disabled (false/0/no/off), so local dev and demo environments are unchanged.
 */
function demoUserSeedDisabled(): boolean {
  const raw = (process.env.SEED_DEMO_USER ?? '').trim().toLowerCase();
  const explicitlyOff = raw === 'false' || raw === '0' || raw === 'no' || raw === 'off';
  if (explicitlyOff) return true;

  if (process.env.NODE_ENV === 'production') {
    const explicitlyOn = raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
    return !explicitlyOn; // prod: disabled unless explicitly opted in
  }

  return false; // non-prod: seed unless explicitly disabled
}

/**
 * Seed the GA demo admin user on the Concept2Cure org. No-op if the org
 * wasn't created (some test environments strip the seed) or if demo seeding
 * is disabled via SEED_DEMO_USER.
 */
export async function seedGaDemoUser(client: PoolClient): Promise<void> {
  if (demoUserSeedDisabled()) {
    logger.info('ensureAuthTables: demo admin seed disabled (SEED_DEMO_USER=false)');
    return;
  }

  const c2cOrg = await client.query(
    `SELECT id FROM organizations WHERE slug = 'concept2cure' LIMIT 1`
  );
  const c2cOrgId: number | undefined = c2cOrg.rows[0]?.id;

  if (!c2cOrgId) {
    return;
  }

  await client.query(
    `
    INSERT INTO users (email, name, password_hash, title, department, status, default_organization_id, password_changed_at)
    VALUES ($1, $2, $3, 'Chief Science Officer', 'Executive Leadership', 'active', $4, NOW())
    ON CONFLICT (email) DO UPDATE SET
      password_hash = CASE WHEN users.password_hash IS NULL OR users.password_hash = '' THEN $3 ELSE users.password_hash END,
      default_organization_id = COALESCE(users.default_organization_id, $4),
      status = 'active'
    `,
    [DEMO_EMAIL, DEMO_NAME, DEMO_PASSWORD_HASH, c2cOrgId]
  );

  const demoUser = await client.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [DEMO_EMAIL]
  );
  if (demoUser.rows[0]) {
    await client.query(
      `
      INSERT INTO organization_users (organization_id, user_id, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin'
      `,
      [c2cOrgId, demoUser.rows[0].id]
    );
  }

  logger.info(`ensureAuthTables: GA demo user verified (${DEMO_EMAIL})`);
}
