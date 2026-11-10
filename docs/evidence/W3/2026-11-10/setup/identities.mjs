/**
 * The run's identities, created the way a customer creates them (as VSR-001 §18 did on 2026-09-27, where this
 * step was run by hand and only its transcripts were kept).
 *
 *   node docs/evidence/W3/2026-11-10/setup/identities.mjs <out.env> <transcript.txt>
 *
 * Needs: the qualification server on VALIDATION_BASE_URL (development posture, LOG_LEVEL=debug, so the emailed
 * sign-in code an unconfigured SMTP cannot send is logged), its log at VALIDATION_SERVER_LOG, and the run identity
 * `npm run up` seeded: VALIDATION_USER_EMAIL and VALIDATION_USER_PASSWORD.
 *
 * 1. The run identity signs in. The server asks for the emailed code; it is read from the server log, as a person
 *    would read it from the mailbox. It then enrols a TOTP authenticator (setup, enable with a current code).
 * 2. The run identity adds each other identity through user administration (POST /api/tenant-users), with the
 *    role its protocols need. Each sets its own password through the activation link the product hands the admin,
 *    and a second use of a link is refused. Each then enrols its own authenticator the same way.
 * 3. Writes every credential to <out.env> (outside the repository; the caller keeps it private) and a transcript
 *    with no password, code, secret or token to <transcript.txt>.
 *
 * The platform administrator's platform role is not granted here: no product path grants the first platform role
 * (VSR-001 §18), so the caller grants it as the database owner and records that.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { totp } from '../../../../../tests/validation/lib/totp.mjs';

const BASE = (process.env.VALIDATION_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
const LOG = process.env.VALIDATION_SERVER_LOG;
const RUN = { email: (process.env.VALIDATION_USER_EMAIL || '').toLowerCase(), password: process.env.VALIDATION_USER_PASSWORD || '' };
const [outEnv, transcriptPath] = process.argv.slice(2);
if (!LOG || !RUN.email || !RUN.password || !outEnv || !transcriptPath) {
  console.error('usage: VALIDATION_SERVER_LOG=… VALIDATION_USER_EMAIL=… VALIDATION_USER_PASSWORD=… node identities.mjs <out.env> <transcript.txt>');
  process.exit(2);
}

/* Each identity a protocol reads, by its environment prefix, and the role it is added with. Signing authority comes
   with admin, approver or reviewer (P-18; OQ-003 §1). The signer is an approver, not an admin: OQ-006 v0.8 §1 names it
   the QMS approver, which an organisation that designates none admits by the Approver role, and OQ-003 v0.5 (d)
   needs a reviewer whose organisation role is not an administrator's (an admin passes the object gate). This run first
   added it as an admin, as OQ-001 §1 v0.9 said, and changed the role through user administration
   (transcripts/user-administration.transcript.txt). */
const OTHERS = [
  { prefix: 'OQ_SIGNER', email: 'oq-signer@validation.local', name: 'OQ Signer', role: 'approver' },
  { prefix: 'OQ_APPROVER', email: 'oq-approver@validation.local', name: 'OQ Approver', role: 'admin' },
  { prefix: 'OQ_PLATFORM_ADMIN', email: 'oq-platform@validation.local', name: 'OQ Platform', role: 'member' },
  { prefix: 'OQ_STANDING', email: 'oq-standing@validation.local', name: 'OQ Standing', role: 'member' },
  { prefix: 'OQ_MEMBER', email: 'oq-member@validation.local', name: 'OQ Member', role: 'member' },
  { prefix: 'OQ_VIEWER', email: 'oq-viewer@validation.local', name: 'OQ Viewer', role: 'viewer' },
];

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

/** The newest emailed sign-in code the server logged for this address after `since` bytes of the log. The logger
 *  masks the address ("o***@validation.local"), so the line is matched on the masked form, and identities are
 *  enrolled one at a time so the newest line after the mark is this sign-in's. */
async function emailedCode(email, since) {
  const [local, domain] = email.split('@');
  const masked = `${local[0]}***@${domain}`;
  for (let i = 0; i < 40; i += 1) {
    const text = fs.readFileSync(LOG).subarray(since).toString('utf8'); // `since` is a byte offset
    const hits = text.split('\n').filter((l) => l.includes('Dev OTP code') && (l.includes(masked) || l.includes(email)));
    const code = hits.length ? /"code":"?(\d{6})/.exec(hits[hits.length - 1])?.[1] : null;
    if (code) return code;
    await sleep(250);
  }
  throw new Error(`no emailed code logged for ${email}`);
}

/** A code from a time step no earlier call used: the server refuses a step it has already accepted (replay
 *  protection, users.mfa_totp_last_step), so after the enable the next sign-in waits for the next 30-second step. */
let lastStep = Math.floor(Date.now() / 30000); // a run never reuses the step an earlier process may have just used
async function freshCode(secret) {
  for (;;) {
    const step = Math.floor(Date.now() / 30000);
    const left = 30 - (Math.floor(Date.now() / 1000) % 30);
    if (step > lastStep && left >= 3) { lastStep = step; return totp(secret); }
    await sleep((left + 1) * 1000);
  }
}

/** Sign in with the emailed code, then enrol a TOTP authenticator. Returns its secret. */
async function enrol({ email, password }) {
  const mark = fs.statSync(LOG).size;
  const login = await call('POST', '/api/auth/login', { email, password });
  if (login.status !== 200 || !login.body.mfaRequired) throw new Error(`${email}: sign-in ${login.status} ${JSON.stringify(login.body).slice(0, 160)}`);
  const methods = (login.body.mfaMethods ?? []).map((m) => m?.type ?? m);
  const code = await emailedCode(email, mark);
  const verified = await call('POST', '/api/auth/mfa/verify', { challengeId: login.body.challengeId, code, method: 'email' });
  if (verified.status !== 200 || !verified.body.accessToken) throw new Error(`${email}: emailed code ${verified.status}`);
  const setup = await call('POST', '/api/auth/mfa/setup', {}, verified.body.accessToken);
  const secret = setup.body.secret;
  if (setup.status !== 200 || !secret) throw new Error(`${email}: authenticator setup ${setup.status}`);
  keep(`# ${email} authenticator secret, issued before enable: ${secret}`);
  const enable = await call('POST', '/api/auth/mfa/enable', { code: await freshCode(secret) }, verified.body.accessToken);
  if (enable.status !== 200) throw new Error(`${email}: authenticator enable ${enable.status} ${JSON.stringify(enable.body).slice(0, 160)}`);
  say(`${email}: sign-in ${login.status} (challenge offers ${JSON.stringify(methods)}), emailed code ${verified.status}, authenticator setup ${setup.status}, enable ${enable.status}, backup codes ${(enable.body.backupCodes ?? []).length}`);
  return secret;
}

/** A fresh session for an identity with an enrolled authenticator. */
async function session({ email, password }, secret) {
  const login = await call('POST', '/api/auth/login', { email, password });
  const verified = await call('POST', '/api/auth/mfa/verify', { challengeId: login.body.challengeId, code: await freshCode(secret), method: 'totp' });
  if (!verified.body.accessToken) throw new Error(`${email}: TOTP sign-in ${verified.status}`);
  return verified.body.accessToken;
}

/** The activation token in the link the product handed the admin, wherever the response carries it. */
function activationToken(body) {
  const text = JSON.stringify(body);
  const link = /https?:\/\/[^"\s]*password-reset\?token=([^"&\s]+)/.exec(text);
  return link ? decodeURIComponent(link[1]) : null;
}

/* Each credential is written as soon as it exists, so a failure part-way never strands an enrolled authenticator
   whose secret nobody kept. */
/* Resumable: a credential file from an earlier, interrupted run is read back, and an identity already enrolled is
   not enrolled again. */
const env = fs.existsSync(outEnv) ? fs.readFileSync(outEnv, 'utf8').split('\n').filter(Boolean) : [];
const kept = (key) => env.find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1) ?? null;
const keep = (...entries) => { env.push(...entries); fs.writeFileSync(outEnv, `${env.join('\n')}\n`, { mode: 0o600 }); };
if (!kept('VALIDATION_USER_EMAIL')) keep(`VALIDATION_USER_EMAIL=${RUN.email}`, `VALIDATION_USER_PASSWORD=${RUN.password}`, `OQ_RUN_PASSWORD=${RUN.password}`, `OQ_AUTHOR_EMAIL=${RUN.email}`);
let runSecret = kept('VALIDATION_USER_TOTP_SECRET');
if (!runSecret) { runSecret = await enrol(RUN); keep(`VALIDATION_USER_TOTP_SECRET=${runSecret}`); }
const admin = await session(RUN, runSecret);

/** The newest password link the server logged for this address after `since` bytes (development, no SMTP). */
async function emailedResetToken(email, since) {
  const [local, domain] = email.split('@');
  const masked = `${local[0]}***@${domain}`;
  for (let i = 0; i < 40; i += 1) {
    const text = fs.readFileSync(LOG).subarray(since).toString('utf8');
    const hits = text.split('\n').filter((l) => l.includes('Dev reset link') && (l.includes(masked) || l.includes(email)));
    const token = hits.length ? /token=([^"&\s]+)/.exec(hits[hits.length - 1])?.[1] : null;
    if (token) return decodeURIComponent(token);
    await sleep(250);
  }
  throw new Error(`no password link logged for ${email}`);
}

let reuseChecked = false;
for (const who of OTHERS) {
  if (kept(`${who.prefix}_TOTP_SECRET`)) continue;
  let token;
  const added = await call('POST', '/api/tenant-users', { email: who.email, name: who.name, role: who.role }, admin);
  if (added.status === 400 && /USER_EXISTS/.test(JSON.stringify(added.body))) {
    /* Added by an interrupted run and never activated: the product's own path, "forgot password", issues a link. */
    const mark = fs.statSync(LOG).size;
    const forgot = await call('POST', '/api/auth/forgot-password', { email: who.email });
    token = await emailedResetToken(who.email, mark);
    say(`${who.email} already added and not activated: forgot-password ${forgot.status}; password link emailed`);
  } else {
    token = activationToken(added.body);
    say(`add ${who.email} as ${who.role}: ${added.status}; activation link ${token ? 'handed to the admin' : 'NOT in the response'} (keys: ${Object.keys(added.body.data ?? added.body).join(', ')})`);
    /* 201 for a new member; 200 with `reissued` for one added earlier who never activated (the product re-issues). */
    if ((added.status !== 201 && !(added.status === 200 && added.body.reissued)) || !token) throw new Error(`${who.email}: ${JSON.stringify(added.body).slice(0, 300)}`);
  }
  const password = `oq-${crypto.randomBytes(12).toString('base64url')}`;
  const set = await call('POST', '/api/auth/reset-password', { token, newPassword: password });
  if (set.status === 200) keep(`${who.prefix}_EMAIL=${who.email}`, `${who.prefix}_PASSWORD=${password}`);
  if (!reuseChecked) {
    /* Once per run: a used link is refused. Each refusal counts against the network's limit on bad links, so it is
       not repeated for every identity (2026-11-10: repeating it locked out the seventh activation). */
    const again = await call('POST', '/api/auth/reset-password', { token, newPassword: `${password}x` });
    say(`  activation: set own password ${set.status}; the same link again: ${again.status} ${again.body?.error?.code ?? again.body?.code ?? ''}`);
    reuseChecked = true;
  } else {
    say(`  activation: set own password ${set.status}`);
  }
  if (set.status !== 200) throw new Error(`${who.email}: activation ${set.status} ${JSON.stringify(set.body).slice(0, 200)}`);
  const secret = await enrol({ email: who.email, password });
  keep(`${who.prefix}_TOTP_SECRET=${secret}`);
}

const members = await call('GET', '/api/tenant-users', undefined, admin);
const rows = members.body.data ?? members.body.users ?? members.body;
say(`members of the run organisation: ${members.status}`);
for (const m of Array.isArray(rows) ? rows : []) say(`  user:${m.id ?? m.userId} ${m.email} role=${m.role} status=${m.status ?? m.membershipStatus ?? ''}`);

fs.appendFileSync(transcriptPath, `${lines.join('\n')}\n`);
console.info(`\ncredentials: ${outEnv} (private) · transcript: ${transcriptPath}`);
