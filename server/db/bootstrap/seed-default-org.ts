/**
 * The GA demo admin user, outside production only.
 *
 * The two seeded organisations ('default', 'concept2cure') were seeded here at
 * every boot, on the owner connection, until 2026-10-22. They are now
 * migrations/20261022_auth_schema_and_seeded_organizations.sql, which
 * deploy-migrate applies (MR-03 Stage 3, OPS-16); the API no longer holds the
 * owner credential that seed needed. What remains is a development
 * convenience: the demo admin on the 'concept2cure' organisation, which
 * production never seeds.
 *
 * The caller (`seedDemoAdminOutsideProduction`, ./index.ts) owns BEGIN /
 * COMMIT / ROLLBACK. The inserts use ON CONFLICT, so re-running is a no-op.
 */

import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('database');

// Production never seeds the demo user (demoUserSeedDisabled below). Outside
// production, when the seed is enabled, an operator-supplied DEMO_USER_PASSWORD is hashed at
// startup. Without one, a fresh account receives a non-recoverable random
// credential: development token-based helpers still work, but the repository
// no longer publishes a password that can authenticate as an administrator.
//
// The account is the one DEMO_USER_EMAIL names, read when the seed runs
// (2026-10-15): it defaulted to a real person's personal address, named
// "JM Smith" and titled "Chief Science Officer". No identity is built in.
function demoUserEmail(): string | null {
  return (process.env.DEMO_USER_EMAIL ?? '').trim().toLowerCase() || null;
}
const DEMO_PASSWORD_ROUNDS = 12;

/**
 * Whether to seed the GA demo admin. This is a privileged convenience
 * identity, so it must never appear on a real production deployment by
 * accident.
 *
 * Production never seeds it, whatever SEED_DEMO_USER says (MR-03 Stage 3):
 * a privileged identity created by a boot flag has no place on a deployment
 * that serves customers, and the production boot no longer has the owner
 * connection the seed ran on. SEED_DEMO_USER=true there is named in the log
 * and ignored.
 *
 * Non-production keeps the convenience default: seed unless explicitly
 * disabled (false/0/no/off), so local dev and demo environments are unchanged.
 */
function demoUserSeedDisabled(): boolean {
  const raw = (process.env.SEED_DEMO_USER ?? '').trim().toLowerCase();
  if (process.env.NODE_ENV === 'production') {
    if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') {
      logger.warn('demo admin: SEED_DEMO_USER is set in production and ignored; production never seeds the demo admin');
    }
    return true;
  }
  return raw === 'false' || raw === '0' || raw === 'no' || raw === 'off';
}

/**
 * Resolve the password hash to seed onto the demo admin.
 *
 * When DEMO_USER_PASSWORD is set to a non-blank value, hash that operator-held
 * credential. With no override, hash a cryptographically random value and
 * discard the plaintext. That leaves password login unavailable for a fresh
 * demo account until an operator deliberately configures it, while token-based
 * development helpers can still exercise the seeded identity.
 *
 * Note this only decides what a *fresh* seed writes: the INSERT below keeps its
 * existing ON CONFLICT semantics and never overwrites a password already on the
 * row, so operators must rotate credentials in any environment initialized by
 * an earlier release.
 */
async function resolveDemoPasswordHash(demoEmail: string): Promise<string> {
  const override = (process.env.DEMO_USER_PASSWORD ?? '').trim();
  if (override) {
    logger.info(
      `demo admin: demo admin password sourced from DEMO_USER_PASSWORD (${demoEmail})`
    );
    return bcrypt.hash(override, DEMO_PASSWORD_ROUNDS);
  }

  logger.warn(
    `demo admin: DEMO_USER_PASSWORD is unset; a fresh ${demoEmail} account ` +
      `will receive a random, non-recoverable password. Set DEMO_USER_PASSWORD ` +
      `to enable deliberate password login, or SEED_DEMO_USER=false to skip the account.`
  );
  const nonRecoverablePassword = crypto.randomBytes(32).toString('base64url');
  return bcrypt.hash(nonRecoverablePassword, DEMO_PASSWORD_ROUNDS);
}

/**
 * Seed the GA demo admin user on the Concept2Cure org. No-op if the org
 * wasn't created (some test environments strip the seed) or if demo seeding
 * is disabled via SEED_DEMO_USER.
 */
export async function seedGaDemoUser(client: PoolClient): Promise<void> {
  if (demoUserSeedDisabled()) {
    logger.info('demo admin: demo admin seed disabled (SEED_DEMO_USER=false)');
    return;
  }

  const demoEmail = demoUserEmail();
  if (!demoEmail) {
    logger.warn(
      'demo admin: demo admin not seeded: DEMO_USER_EMAIL is unset and no identity is built in. ' +
        'Set DEMO_USER_EMAIL to the account to seed, or SEED_DEMO_USER=false to skip it.'
    );
    return;
  }

  const c2cOrg = await client.query(
    `SELECT id FROM organizations WHERE slug = 'concept2cure' LIMIT 1`
  );
  const c2cOrgId: number | undefined = c2cOrg.rows[0]?.id;

  if (!c2cOrgId) {
    return;
  }

  const demoPasswordHash = await resolveDemoPasswordHash(demoEmail);

  // Named by the address the operator gave, with no title or department
  // (2026-10-15: "JM Smith", "Chief Science Officer", "Executive Leadership").
  await client.query(
    `
    INSERT INTO users (email, name, password_hash, status, default_organization_id, password_changed_at)
    VALUES ($1, $2, $3, 'active', $4, NOW())
    ON CONFLICT (email) DO UPDATE SET
      password_hash = CASE WHEN users.password_hash IS NULL OR users.password_hash = '' THEN $3 ELSE users.password_hash END,
      default_organization_id = COALESCE(users.default_organization_id, $4),
      status = 'active'
    `,
    [demoEmail, demoEmail, demoPasswordHash, c2cOrgId]
  );

  const demoUser = await client.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [
    demoEmail,
  ]);
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

  logger.info(`demo admin: GA demo user verified (${demoEmail})`);
}
