#!/usr/bin/env node
// seed-admin.mjs — Creates the admin account; on a database on this machine,
// resets it to the built-in development login.
// Usage: node scripts/seed-admin.mjs
//
// Uses DATABASE_URL / DATABASE_NEON_NEW_SECRET env var (falls back to local).
// Off this machine: ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_ORG_SLUG (the slug
// of an existing organisation the account joins); ADMIN_NAME is optional.
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { isLocalDatabase } from './seed/local-only.mjs';

const { Pool } = pg;

function getDbUrl() {
  const raw = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  if (raw) {
    let url = raw;
    if (url.startsWith('psql ')) url = url.substring(5);
    if ((url.startsWith("'") && url.endsWith("'")) || (url.startsWith('"') && url.endsWith('"'))) {
      url = url.slice(1, -1);
    }
    return url.trim();
  }
  return 'postgresql://postgres:postgres@127.0.0.1:5432/concept2cure-ri?sslmode=disable';
}

const dbUrl = getDbUrl();
const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
});

/* Credentials come from the environment so this script can seed a real local
   account instead of only ever minting one shared, committed password. The
   historical defaults are kept so existing local setups keep working, but a
   weak default is refused outside development — a script that resets an admin
   password to 'pass-word' must never be runnable against production. */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jm.smith@concept2cure.pro';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pass-word';
// The built-in name goes with the built-in identity only (2026-10-15): an
// account the operator named with no ADMIN_NAME was named "JM Smith", a real
// person. It is shown by the address the operator gave instead.
const ADMIN_NAME = process.env.ADMIN_NAME || (process.env.ADMIN_EMAIL ? ADMIN_EMAIL : 'JM Smith');

/* The built-in password, reset on every run, is for a database on this
   machine only. NODE_ENV alone let a UAT or customer database through
   (2026-10-15). With ADMIN_PASSWORD set this provisions an administrator
   anywhere — the compose stack documents it for that. */
const ON_THIS_MACHINE = process.env.NODE_ENV !== 'production' && isLocalDatabase(dbUrl);
if (!process.env.ADMIN_PASSWORD && !ON_THIS_MACHINE) {
  console.error(
    'seed-admin: refusing the built-in default password for a database that is not on this machine, ' +
      'or in production. Set ADMIN_PASSWORD. The default is a development convenience, not a credential.',
  );
  process.exit(1);
}

/* Off this machine it provisions, and only that (2026-10-15). It used to reset
   an existing account there too — password overwritten; lockout, disabled
   status and must-change-password cleared — with no audit record, and without
   ADMIN_EMAIL the account it wrote was the founder's. Now it names the account
   it creates and refuses one that exists. */
if (!process.env.ADMIN_EMAIL && !ON_THIS_MACHINE) {
  console.error(
    'seed-admin: name the account to create with ADMIN_EMAIL for a database that is not on this machine, ' +
      'or in production. The built-in identity is a development convenience, not an account.',
  );
  process.exit(1);
}

/* The organisation the account joins (2026-10-15). Off this machine it
   created a 'concept2cure' organisation on the target stack and attached the
   administrator to that instead of the stack's own. Now the operator names an
   existing one, or it refuses; on this machine the development organisation
   stays the default. */
const ADMIN_ORG_SLUG = (process.env.ADMIN_ORG_SLUG || '').trim();
if (!ADMIN_ORG_SLUG && !ON_THIS_MACHINE) {
  console.error(
    'seed-admin: name the organisation the account joins with ADMIN_ORG_SLUG (an existing organisation\'s slug) ' +
      'for a database that is not on this machine, or in production. No organisation is built in.',
  );
  process.exit(1);
}

async function run() {
  if (!ON_THIS_MACHINE) {
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [ADMIN_EMAIL]);
    if (existing.rows.length > 0) {
      throw new Error(
        `seed-admin: ${ADMIN_EMAIL} already exists in this database. Off this machine seed-admin creates ` +
          "an account and never resets one; nothing was changed. Use the product's password reset.",
      );
    }
  }
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  let orgId;
  if (ADMIN_ORG_SLUG) {
    // The operator's organisation must already exist; none is created for it.
    const named = await pool.query('SELECT id FROM organizations WHERE slug = $1 LIMIT 1', [ADMIN_ORG_SLUG]);
    orgId = named.rows[0]?.id;
    if (orgId == null) {
      throw new Error(
        `seed-admin: no organisation with slug "${ADMIN_ORG_SLUG}" in this database; nothing was changed. ` +
          'Name an existing organisation: seed-admin creates none.',
      );
    }
  } else {
    // This machine only (refused above otherwise): the development organisation.
    await pool.query(`
      INSERT INTO organizations (name, slug, industry_mode, tier, status)
      VALUES ('Concept2Cure Therapeutics', 'concept2cure', 'biotech', 'enterprise', 'active')
      ON CONFLICT (slug) DO NOTHING
    `);
    const orgRes = await pool.query(`SELECT id FROM organizations WHERE slug = 'concept2cure' LIMIT 1`);
    // No fallback to organization 1 (2026-10-15): that is somebody's tenant.
    orgId = orgRes.rows[0]?.id;
    if (orgId == null) throw new Error("seed-admin: organization 'concept2cure' is not readable after it was ensured");
  }

  // On this machine an existing account is reset; off it, one was refused
  // above and DO NOTHING leaves an account created meanwhile untouched. No
  // title or department (2026-10-15): every account it created was titled
  // 'Chief Science Officer', 'Executive Leadership', which nobody stated.
  const res = await pool.query(
    ON_THIS_MACHINE
      ? `INSERT INTO users (email, name, password_hash, status,
           default_organization_id, failed_login_attempts, password_changed_at)
         VALUES ($1, $4, $2, 'active', $3, 0, NOW())
         ON CONFLICT (email) DO UPDATE SET
           password_hash = $2,
           failed_login_attempts = 0,
           locked_until = NULL,
           must_change_password = FALSE,
           status = 'active'
         RETURNING id, email, name`
      : `INSERT INTO users (email, name, password_hash, status,
           default_organization_id, failed_login_attempts, password_changed_at)
         VALUES ($1, $4, $2, 'active', $3, 0, NOW())
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, name`,
    [ADMIN_EMAIL, hash, orgId, ADMIN_NAME]
  );
  if (res.rows.length === 0) {
    throw new Error(`seed-admin: ${ADMIN_EMAIL} was created by someone else while this ran; nothing was changed.`);
  }
  console.log('User upserted:', res.rows[0].email, '(id:', res.rows[0].id + ')');

  // Ensure admin membership
  await pool.query(`
    INSERT INTO organization_users (organization_id, user_id, role)
    VALUES ($1, $2, 'admin')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin'
  `, [orgId, res.rows[0].id]);

  // Sync to auth_users if table exists
  try {
    await pool.query(
      ON_THIS_MACHINE
        ? `INSERT INTO auth_users (email, username, password_hash, is_active, email_verified)
           VALUES ($1, $2, $3, true, true)
           ON CONFLICT (email) DO UPDATE SET password_hash = $3, is_active = true`
        : `INSERT INTO auth_users (email, username, password_hash, is_active, email_verified)
           VALUES ($1, $2, $3, true, true)
           ON CONFLICT (email) DO NOTHING`,
      [ADMIN_EMAIL, 'jmsmith', hash]
    );
    console.log('auth_users synced for:', ADMIN_EMAIL);
  } catch {
    // auth_users may not exist
  }

  console.log('');
  console.log('=== LOGIN CREDENTIALS ===');
  console.log('Email   :', ADMIN_EMAIL);
  // A password the operator chose is not echoed into a console or CI log
  // (2026-10-15); only the built-in development one is printed.
  console.log('Password:', process.env.ADMIN_PASSWORD ? '(the ADMIN_PASSWORD you set)' : ADMIN_PASSWORD);
  console.log('=========================');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
