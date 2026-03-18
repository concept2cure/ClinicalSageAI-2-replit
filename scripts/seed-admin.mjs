#!/usr/bin/env node
// seed-admin.mjs — Resets the GA admin password
// Usage: node scripts/seed-admin.mjs
//
// Uses DATABASE_URL / DATABASE_NEON_NEW_SECRET env var (falls back to local).
import bcrypt from 'bcryptjs';
import pg from 'pg';

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
  return 'postgresql://postgres:postgres@127.0.0.1:5432/clinicalsage?sslmode=disable';
}

const dbUrl = getDbUrl();
const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
});

const ADMIN_EMAIL = 'jm.smith@concept2cure.pro';
const ADMIN_PASSWORD = 'pass-word';

async function run() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // Ensure org exists
  await pool.query(`
    INSERT INTO organizations (name, slug, industry_mode, tier, status)
    VALUES ('Concept2Cure Therapeutics', 'concept2cure', 'biotech', 'enterprise', 'active')
    ON CONFLICT (slug) DO NOTHING
  `);

  const orgRes = await pool.query(`SELECT id FROM organizations WHERE slug = 'concept2cure' LIMIT 1`);
  const orgId = orgRes.rows[0]?.id || 1;

  // Upsert user
  const res = await pool.query(
    `INSERT INTO users (email, name, password_hash, title, department, status,
       default_organization_id, failed_login_attempts, password_changed_at)
     VALUES ($1, 'JM Smith', $2, 'Chief Science Officer', 'Executive Leadership',
       'active', $3, 0, NOW())
     ON CONFLICT (email) DO UPDATE SET
       password_hash = $2,
       failed_login_attempts = 0,
       locked_until = NULL,
       must_change_password = FALSE,
       status = 'active'
     RETURNING id, email, name`,
    [ADMIN_EMAIL, hash, orgId]
  );
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
      `INSERT INTO auth_users (email, username, password_hash, is_active, email_verified)
       VALUES ($1, $2, $3, true, true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3, is_active = true`,
      [ADMIN_EMAIL, 'jmsmith', hash]
    );
    console.log('auth_users synced for:', ADMIN_EMAIL);
  } catch {
    // auth_users may not exist
  }

  console.log('');
  console.log('=== LOGIN CREDENTIALS ===');
  console.log('Email   :', ADMIN_EMAIL);
  console.log('Password:', ADMIN_PASSWORD);
  console.log('=========================');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
