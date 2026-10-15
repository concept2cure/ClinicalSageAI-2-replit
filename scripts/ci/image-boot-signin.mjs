#!/usr/bin/env node
/**
 * image-boot-signin.mjs — a real person signs in to the running production
 * image, second factor included (launch row D1; evidence
 * docs/evidence/W2/2026-10-01-image-boot/).
 *
 * Run by ci.yml's `production-image-boot` job INSIDE the production image
 * (`docker run … -w /app -v this:/app/image-boot-signin.mjs`), so it uses the
 * image's own `pg` and `bcryptjs` and needs no install on the runner.
 *
 *   1. As the database owner: an organisation, an active member with a
 *      password, and an authenticator enrolled the way mfaService stores one
 *      (a base32 secret, AES-256-GCM under sha256(MFA_ENCRYPTION_KEY), stored
 *      as iv:tag:ciphertext hex). Production sign-in always asks for a second
 *      factor, and an emailed code cannot be read here, so the authenticator is
 *      the factor this proves.
 *   2. POST /api/auth/login  → a second-factor challenge, never a session.
 *   3. POST /api/auth/mfa/verify with the current RFC 6238 code → an access token.
 *   4. GET  /api/auth/me with that token → the member, in the organisation.
 *   5. A wrong code is refused, so step 3 is not passing on anything.
 *
 * Env: DATABASE_URL (owner), BASE_URL, MFA_ENCRYPTION_KEY, SIGNIN_ORIGIN. Exit 0 only when all
 * five hold; every refusal prints the status and body it got.
 */
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5199';
const KEY = process.env.MFA_ENCRYPTION_KEY;
// What the browser sends, through the load balancer: its own origin (one the
// deployment lists in ALLOWED_ORIGINS, or the CSRF check refuses the request)
// and the scheme TLS was terminated with (or production redirects to https).
const ORIGIN = process.env.SIGNIN_ORIGIN;
const EMAIL = 'image-boot-signin@example.invalid';
const PASSWORD = `Image-Boot-${crypto.randomBytes(9).toString('base64url')}!7`;

function fail(step, detail) {
  console.error(`::error::image sign-in FAILED at ${step}: ${detail}`);
  process.exit(1);
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function encryptSecret(plaintext) {
  const key = crypto.createHash('sha256').update(KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct}`;
}

function totp(secret, offsetSteps = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'x-forwarded-proto': 'https',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* reported below as text */
  }
  return { status: res.status, json, text: text.slice(0, 400) };
}

async function enrol() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const org = await db.query(
      `INSERT INTO organizations (name, slug) VALUES ('Image boot sponsor', 'image-boot-sponsor')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const secret = crypto.randomBytes(20);
    const user = await db.query(
      `INSERT INTO users (email, name, password_hash, status, mfa_enabled, mfa_method, mfa_secret)
       VALUES ($1, 'Image Boot', $2, 'active', true, 'totp', $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
         mfa_enabled = true, mfa_method = 'totp', mfa_secret = EXCLUDED.mfa_secret,
         failed_login_attempts = 0, locked_until = NULL
       RETURNING id`,
      [EMAIL, await bcrypt.hash(PASSWORD, 10), encryptSecret(base32(secret))],
    );
    await db.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'member'`,
      [org.rows[0].id, user.rows[0].id],
    );
    return { secret, orgId: Number(org.rows[0].id), userId: Number(user.rows[0].id) };
  } finally {
    await db.end();
  }
}

if (!KEY || KEY.length < 32) fail('setup', 'MFA_ENCRYPTION_KEY (>= 32 chars, the one the server runs with) is required.');
if (!ORIGIN) fail('setup', 'SIGNIN_ORIGIN (an origin in the server\'s ALLOWED_ORIGINS) is required.');

const { secret, orgId, userId } = await enrol();
console.log(`enrolled user ${userId} in organisation ${orgId}, authenticator on`);

const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
if (login.status !== 200 || login.json?.mfaRequired !== true || !login.json?.challengeId) {
  fail('login', `expected 200 with a second-factor challenge; got ${login.status} ${login.text}`);
}
if (login.json.accessToken) fail('login', 'a session token was issued before the second factor.');
console.log('POST /api/auth/login → 200, second factor required (authenticator)');

const wrong = await call('POST', '/api/auth/mfa/verify', {
  challengeId: login.json.challengeId,
  code: String((Number(totp(secret)) + 500_000) % 1_000_000).padStart(6, '0'),
  method: 'totp',
});
if (wrong.status === 200 || wrong.json?.accessToken) fail('wrong code', `a wrong code was accepted: ${wrong.status} ${wrong.text}`);
console.log(`POST /api/auth/mfa/verify with a wrong code → ${wrong.status}, refused`);

// A fresh challenge: the wrong attempt above may count against this one.
const again = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
if (again.status !== 200 || !again.json?.challengeId) fail('login (second)', `${again.status} ${again.text}`);
const verify = await call('POST', '/api/auth/mfa/verify', { challengeId: again.json.challengeId, code: totp(secret), method: 'totp' });
if (verify.status !== 200 || !verify.json?.accessToken) {
  fail('second factor', `expected 200 with an access token; got ${verify.status} ${verify.text}`);
}
console.log('POST /api/auth/mfa/verify with the authenticator code → 200, access token issued');

const me = await call('GET', '/api/auth/me', null, verify.json.accessToken);
const meText = JSON.stringify(me.json ?? {});
if (me.status !== 200 || !meText.includes(EMAIL)) fail('/api/auth/me', `${me.status} ${me.text}`);
console.log(`GET /api/auth/me → 200, signed in as ${EMAIL}`);
console.log('image sign-in: OK');
