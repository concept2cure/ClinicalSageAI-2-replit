#!/usr/bin/env node
/**
 * seed-founder.mjs — Provision the founder admin user.
 *
 * Replaces server/founder-login.js, which (a) lived under server/ where it
 * could be accidentally imported, (b) hardcoded a password literal in the
 * source tree, and (c) used scrypt instead of the platform-standard bcrypt.
 *
 * Usage:
 *   FOUNDER_EMAIL=founder@concept2cure.ai \
 *   FOUNDER_PASSWORD='<strong-password>' \
 *   node scripts/seed-founder.mjs
 *
 *   # In production, an explicit confirmation flag is required:
 *   node scripts/seed-founder.mjs --i-know-this-is-production
 *
 * Env:
 *   FOUNDER_EMAIL     — required
 *   FOUNDER_PASSWORD  — required, min 12 chars
 *   DATABASE_URL or DATABASE_NEON_NEW_SECRET — required
 *
 * The script uses bcryptjs at cost factor 12 to match the rest of the
 * platform (server/routes/auth.ts, server/auth.ts, scripts/seed-admin.mjs).
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limit access to authorized individuals
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const FORCE_PROD_FLAG = '--i-know-this-is-production';

function fail(msg) {
  console.error(`[seed-founder] ${msg}`);
  process.exit(1);
}

function getDbUrl() {
  const raw = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  if (!raw) fail('DATABASE_URL (or DATABASE_NEON_NEW_SECRET) is required');
  let url = raw;
  if (url.startsWith('psql ')) url = url.substring(5);
  if ((url.startsWith("'") && url.endsWith("'")) || (url.startsWith('"') && url.endsWith('"'))) {
    url = url.slice(1, -1);
  }
  return url.trim();
}

function readEmail() {
  const email = process.env.FOUNDER_EMAIL?.trim();
  if (!email) fail('FOUNDER_EMAIL env var is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`FOUNDER_EMAIL is not a valid address: ${email}`);
  return email.toLowerCase();
}

function readPassword() {
  const password = process.env.FOUNDER_PASSWORD;
  if (!password) fail('FOUNDER_PASSWORD env var is required');
  if (password.length < 12) fail('FOUNDER_PASSWORD must be at least 12 characters');
  return password;
}

function guardProduction() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes(FORCE_PROD_FLAG)) {
    fail(
      `Refusing to run in production without explicit ${FORCE_PROD_FLAG} flag. ` +
        'Provisioning the founder user in production should be a deliberate, ' +
        'logged action.'
    );
  }
}

async function run() {
  guardProduction();

  const email = readEmail();
  const password = readPassword();
  const dbUrl = getDbUrl();
  const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isNeon ? { rejectUnauthorized: false } : false,
  });

  try {
    const hash = await bcrypt.hash(password, 12);

    // Ensure org exists.
    await pool.query(`
      INSERT INTO organizations (name, slug, industry_mode, tier, status)
      VALUES ('Concept2Cure Therapeutics', 'concept2cure', 'biotech', 'enterprise', 'active')
      ON CONFLICT (slug) DO NOTHING
    `);
    const orgRes = await pool.query(
      `SELECT id FROM organizations WHERE slug = 'concept2cure' LIMIT 1`
    );
    const orgId = orgRes.rows[0]?.id;
    if (!orgId) fail('Could not resolve organization id after upsert');

    // Upsert user with bcrypt password_hash (matches schema in shared/schema.ts).
    const userRes = await pool.query(
      `INSERT INTO users (email, name, password_hash, title, department, status,
         default_organization_id, failed_login_attempts, password_changed_at)
       VALUES ($1, 'Founder', $2, 'Founder', 'Executive Leadership',
         'active', $3, 0, NOW())
       ON CONFLICT (email) DO UPDATE SET
         password_hash = $2,
         failed_login_attempts = 0,
         locked_until = NULL,
         must_change_password = FALSE,
         status = 'active'
       RETURNING id, email`,
      [email, hash, orgId]
    );
    const userId = userRes.rows[0].id;

    // Ensure admin membership.
    await pool.query(
      `INSERT INTO organization_users (organization_id, user_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin'`,
      [orgId, userId]
    );

    console.log(`[seed-founder] founder user provisioned: ${email} (id=${userId}, orgId=${orgId})`);
  } finally {
    await pool.end();
  }
}

run().catch(err => {
  console.error('[seed-founder] failed:', err);
  process.exit(1);
});
