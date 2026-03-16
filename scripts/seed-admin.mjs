// seed-admin.js — sets a known password for the admin user
// Run: node seed-admin.js
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/clinicalsage?sslmode=disable' });

const ADMIN_EMAIL = 'jm.smith@concept2cure.pro';
const ADMIN_PASSWORD = 'ClinicalSage2026';

async function run() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const res = await pool.query(
    `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email, name`,
    [hash, ADMIN_EMAIL]
  );
  if (res.rows.length === 0) {
    // Insert if not found
    const orgRes = await pool.query(`SELECT id FROM organizations WHERE slug = 'concept2cure' LIMIT 1`);
    const orgId = orgRes.rows[0]?.id || 1;
    await pool.query(
      `INSERT INTO users (email, name, password_hash, default_organization_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [ADMIN_EMAIL, 'JM Smith', hash, orgId]
    );
    console.log('User created/updated:', ADMIN_EMAIL);
  } else {
    console.log('Password updated for:', res.rows[0].email, '(id:', res.rows[0].id + ')');
  }

  // Also set it in auth_users for the enterprise auth system
  await pool.query(
    `INSERT INTO auth_users (email, username, password_hash, is_active, email_verified)
     VALUES ($1, $2, $3, true, true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true`,
    [ADMIN_EMAIL, 'jmsmith', hash]
  );
  console.log('auth_users synced for:', ADMIN_EMAIL);
  console.log('');
  console.log('=== LOGIN CREDENTIALS ===');
  console.log('Email   :', ADMIN_EMAIL);
  console.log('Password: ClinicalSage2026');
  console.log('URL     : http://localhost:5000/auth');
  console.log('=========================');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
