/**
 * The run's three remaining fixtures, after setup/identities.mjs:
 *
 *   node docs/evidence/W3/2026-11-10/setup/fixtures.mjs <identities.env> <out.env> <transcript.txt>
 *
 * 1. OQ-PROJ-18's platform administrator gets the platform role AS THE DATABASE OWNER (OWNER_DATABASE_URL): no
 *    product path grants the first platform role (VSR-001 §18, the same exception).
 * 2. OQ_FOREIGN_PROJECT_ID: a program in a second organisation, written AS THE DATABASE OWNER into organisation 1
 *    ("Default", which has no member to create one). It is another tenant's record the run identity must be refused.
 * 3. OQ_QMS_PROGRAM_ID: a program the run identity owns, created through the product (POST /api/c2c/projects), signed
 *    in with its password and authenticator code.
 */
import fs from 'node:fs';
import pg from 'pg';
import { totp } from '../../../../../tests/validation/lib/totp.mjs';

const BASE = (process.env.VALIDATION_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
const OWNER = process.env.OWNER_DATABASE_URL;
const [idsPath, outEnv, transcriptPath] = process.argv.slice(2);
if (!OWNER || !idsPath || !outEnv || !transcriptPath) {
  console.error('usage: OWNER_DATABASE_URL=… node fixtures.mjs <identities.env> <out.env> <transcript.txt>');
  process.exit(2);
}
const ids = Object.fromEntries(fs.readFileSync(idsPath, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const lines = [];
const say = (line) => { lines.push(line); console.info(line); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: BASE, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Sign in at the next TOTP step (the server refuses a step it has already accepted). */
async function signIn(email, password, secret) {
  const step = Math.floor(Date.now() / 30000);
  while (Math.floor(Date.now() / 30000) === step || 30 - (Math.floor(Date.now() / 1000) % 30) < 3) await sleep(1000);
  const login = await call('POST', '/api/auth/login', { email, password });
  const verified = await call('POST', '/api/auth/mfa/verify', { challengeId: login.body.challengeId, code: totp(secret), method: 'totp' });
  if (!verified.body.accessToken) throw new Error(`${email}: sign-in ${login.status}/${verified.status}`);
  return verified.body.accessToken;
}

const db = new pg.Client({ connectionString: OWNER });
await db.connect();
try {
  const platform = await db.query('SELECT id FROM users WHERE lower(email) = lower($1)', [ids.OQ_PLATFORM_ADMIN_EMAIL]);
  const platformId = platform.rows[0]?.id;
  if (!platformId) throw new Error('the platform administrator identity does not exist');
  const granted = await db.query(
    `INSERT INTO platform_role_grants (user_id, role, granted_by, reason)
     SELECT $1, 'platform_admin', 'database owner (VSR-001 §18 exception)', 'OQ-PROJ-18: the run''s platform administrator; no product path grants the first platform role'
     WHERE NOT EXISTS (SELECT 1 FROM platform_role_grants WHERE user_id = $1 AND role = 'platform_admin' AND revoked_at IS NULL)
     RETURNING id`, [platformId]);
  say(`platform role: user:${platformId} platform_admin ${granted.rowCount ? 'granted as the database owner' : 'already granted'}`);

  const foreign = await db.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, primary_agency, product_name)
     SELECT 1, 'OQ foreign tenant program', 'OQ-FOREIGN', 'ind', 'drug', 'FDA', 'FOREIGN-1'
     WHERE NOT EXISTS (SELECT 1 FROM regulatory_programs WHERE organization_id = 1 AND code = 'OQ-FOREIGN')
     RETURNING id`);
  const foreignId = foreign.rows[0]?.id
    ?? (await db.query(`SELECT id FROM regulatory_programs WHERE organization_id = 1 AND code = 'OQ-FOREIGN'`)).rows[0].id;
  say(`foreign program: organisation 1 ("Default"), ${foreign.rowCount ? 'written as the database owner' : 'already present'}`);

  const token = await signIn(ids.VALIDATION_USER_EMAIL, ids.VALIDATION_USER_PASSWORD, ids.VALIDATION_USER_TOTP_SECRET);
  const seen = await call('GET', `/api/c2c/projects/${foreignId}`, undefined, token);
  say(`the run identity reads the foreign program: ${seen.status} (expected a refusal)`);
  const made = await call('POST', '/api/c2c/projects', {
    name: 'OQ QMS program', productName: 'OQ-QMS-1', programType: 'ind', productType: 'drug', primaryAgency: 'FDA', priority: 'medium',
  }, token);
  const qmsId = made.body?.data?.id ?? made.body?.id;
  say(`QMS program created by the run identity through POST /api/c2c/projects: ${made.status}`);
  if (!qmsId) throw new Error(`QMS program: ${JSON.stringify(made.body).slice(0, 300)}`);
  fs.writeFileSync(outEnv, `OQ_FOREIGN_PROJECT_ID=${foreignId}\nOQ_QMS_PROGRAM_ID=${qmsId}\n`, { mode: 0o600 });
} finally {
  await db.end();
}
fs.appendFileSync(transcriptPath, `${lines.join('\n')}\n`);
