#!/usr/bin/env node
/**
 * pilot-go-no-go.mjs — Pre-human-testing go/no-go gate verification.
 *
 * Verifies the operational gates that must hold before real human testers are
 * put on Concept2Cure.RI / TrialSage for the first time (see
 * PRODUCT_READINESS_ASSESSMENT.md → "Go / No-Go checklist"). It checks the live
 * state of a DATABASE_URL + the current process.env, prints a PASS/FAIL table,
 * and exits non-zero if any HARD gate fails.
 *
 * Design contract:
 *   • Each check FAILS SOFT — a check that throws reports FAIL with the reason
 *     rather than crashing the whole run, so one broken probe never hides the
 *     others. A missing/unreachable database does NOT abort the run: the env /
 *     filesystem gates still report.
 *   • Only HARD gate failures drive the exit code (process.exit(1)). SOFT gates
 *     are advisory: they surface posture (WARN) but never block on their own.
 *   • A gate declares a DEFAULT severity at registration but may return its own
 *     `severity` to override it, so a gate whose blast radius depends on live
 *     state (gate 2 below) can escalate itself from SOFT to HARD. The declared
 *     default is what a thrown error falls back to — i.e. a probe that breaks
 *     can never silently escalate into a NO-GO.
 *   • Secret VALUES are never printed — only which vars are set/missing and,
 *     for entropy-checked secrets, their length. (SMTP_PORT is echoed: it is a
 *     TCP port, not a credential, and it decides the TLS mode.)
 *
 * Gates:
 *   1. Schema provisioned            (HARD) — core tables exist + pg_policies > 0
 *   2. RLS enforcement posture       (HARD when the database holds MORE THAN ONE
 *                                     organization and RLS_ENFORCE is not 'on' —
 *                                     that combination is a live cross-tenant
 *                                     read; SOFT while a single org exists)
 *   3. No known-password demo admin  (HARD) — seed demo-admin row absent + flag off
 *   4. Boot secrets present          (HARD) — fail-closed boot secrets set
 *   5. SMTP / login-OTP delivery     (HARD) — email OTP is mandatory 2FA, so an
 *                                     unusable SMTP transport means NO tester
 *                                     can log in at all
 *   6. Monitoring (Sentry)           (SOFT) — SENTRY_DSN present
 *   7. PDF export capability         (SOFT) — chromium + veraPDF available
 *
 * Usage:
 *   DATABASE_URL='postgres://…' node scripts/ops/pilot-go-no-go.mjs
 *   npm run pilot:go-no-go
 *
 * Run it with the SAME env the app will boot with (notably NODE_ENV) — the boot
 * secrets and RLS posture gates are env-sensitive.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const JWT_SECRET_MIN_LENGTH = 32; // mirrors server/config/environment.ts

// ── DATABASE_URL resolution ────────────────────────────────────────────────
// Same fallback + de-wrapping pattern as scripts/db/apply-c2c-migrations.mjs
// (DATABASE_URL / DATABASE_NEON_NEW_SECRET / NEON_DATABASE_URL, strips an
// accidental `psql '…'` wrapper and surrounding quotes). Deliberate deviation:
// returns null instead of throwing when none is set, so the run can continue
// and the DB-backed gates fail soft rather than crashing the whole script.
function getDatabaseUrl() {
  for (const name of ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'NEON_DATABASE_URL']) {
    const v = process.env[name];
    if (v) return v.replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
  }
  return null;
}

/** Redact a connection string down to host + database for display (no creds). */
function redactDbUrl(url) {
  if (!url) return '(none)';
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname || ''}`;
  } catch {
    return '(unparseable url)';
  }
}

// ── small shell / fs helpers ────────────────────────────────────────────────
function whichSync(bin) {
  try {
    const r = spawnSync('which', [bin], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) return r.stdout.trim().split('\n')[0];
  } catch {
    /* `which` unavailable — treat as not found */
  }
  return null;
}

function hasChromiumUnder(dir) {
  try {
    return fs.readdirSync(dir).some((e) => /chrom|headless/i.test(e));
  } catch {
    return false;
  }
}

// ── demo-admin identity discovery ───────────────────────────────────────────
// How the demo/seed admin is identified: the canonical seed
// (server/db/bootstrap/seed-default-org.ts) and scripts/seed-admin.mjs assign a
// literal email to a DEMO_EMAIL / ADMIN_EMAIL constant. Discover it from source
// rather than hardcoding, so this gate tracks the seed if the address changes.
function walkSeedFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '__tests__', '.git', 'dist'].includes(e.name)) continue;
      walkSeedFiles(full, out);
    } else if (/seed/i.test(e.name) && /\.(ts|js|mjs|cjs)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function discoverDemoAdminEmails() {
  const emails = new Set();
  const files = new Set([
    path.join(repoRoot, 'server', 'db', 'bootstrap', 'seed-default-org.ts'),
    path.join(repoRoot, 'scripts', 'seed-admin.mjs'),
    ...walkSeedFiles(path.join(repoRoot, 'server')),
  ]);
  // A literal email assigned to a *_EMAIL constant named DEMO/ADMIN/SEED/FOUNDER.
  const re = /(?:DEMO|ADMIN|SEED|FOUNDER)[A-Z_]*EMAIL\s*[:=]\s*['"`]([^'"`\s]+@[^'"`\s]+)['"`]/g;
  for (const f of files) {
    let src;
    try {
      src = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    let m;
    while ((m = re.exec(src)) !== null) emails.add(m[1].toLowerCase());
  }
  // Fail-safe default so the row check always runs even if discovery misses.
  if (emails.size === 0) emails.add('jm.smith@concept2cure.pro');
  return [...emails];
}

// ── RLS_ENFORCE resolution (mirrors server/db/rlsEnforcement.ts) ─────────────
function resolveRlsMode(raw) {
  const v = (raw ?? '').trim().toLowerCase();
  if (['on', 'enforce', 'true', '1'].includes(v)) return 'on';
  if (v === 'shadow') return 'shadow';
  return 'off';
}

// ── capability detection (gate 6) ───────────────────────────────────────────
function detectChromium() {
  // 1. explicit executable path env vars
  for (const e of [
    'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
    'PUPPETEER_EXECUTABLE_PATH',
    'CHROMIUM_PATH',
    'CHROME_BIN',
  ]) {
    const p = process.env[e];
    if (p && fs.existsSync(p)) return { found: true, via: `${e}=${p}` };
  }
  // 2. PLAYWRIGHT_BROWSERS_PATH directory holding a chromium build
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pw && fs.existsSync(pw) && hasChromiumUnder(pw)) {
    return { found: true, via: `PLAYWRIGHT_BROWSERS_PATH=${pw}` };
  }
  // 3. conventional container location
  if (fs.existsSync('/opt/pw-browsers/chromium')) {
    return { found: true, via: '/opt/pw-browsers/chromium' };
  }
  if (fs.existsSync('/opt/pw-browsers') && hasChromiumUnder('/opt/pw-browsers')) {
    return { found: true, via: '/opt/pw-browsers' };
  }
  // 4. a chromium/chrome binary on PATH
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome']) {
    const w = whichSync(bin);
    if (w) return { found: true, via: `PATH:${w}` };
  }
  return { found: false, via: '' };
}

function detectVeraPdf() {
  const cmd = process.env.VERAPDF_COMMAND || 'verapdf';
  if (cmd.includes('/') && fs.existsSync(cmd)) return { found: true, via: `VERAPDF_COMMAND=${cmd}` };
  const w = whichSync(cmd);
  if (w) return { found: true, via: `PATH:${w}` };
  for (const p of ['/opt/verapdf/verapdf', '/usr/local/bin/verapdf', '/usr/bin/verapdf']) {
    if (fs.existsSync(p)) return { found: true, via: p };
  }
  return { found: false, via: '' };
}

// ════════════════════════════════════════════════════════════════════════════
// Gates. Each returns { status: 'PASS'|'FAIL'|'WARN', detail: string }.
// Throwing is fine — runGate() converts a thrown error into a soft FAIL.
// ════════════════════════════════════════════════════════════════════════════

// 1 · Schema provisioned (HARD)
async function gateSchema(db) {
  if (!db.ok) return { status: 'FAIL', detail: `database unavailable — ${db.reason}` };
  const CORE = ['organizations', 'users', 'regulatory_programs', 'c2c_documents', 'authoring_documents'];
  const tables = await db.pool.query(
    `SELECT t AS name, to_regclass('public.' || t) IS NOT NULL AS present FROM unnest($1::text[]) AS t`,
    [CORE],
  );
  const missing = tables.rows.filter((r) => !r.present).map((r) => r.name);
  const policies = await db.pool.query('SELECT count(*)::int AS n FROM pg_policies');
  const policyCount = policies.rows[0].n;

  const parts = [`core tables ${CORE.length - missing.length}/${CORE.length}`, `RLS policies ${policyCount}`];
  if (missing.length) parts.push(`missing tables: ${missing.join(', ')}`);
  if (policyCount === 0) parts.push('no RLS policies (pg_policies = 0)');

  const ok = missing.length === 0 && policyCount > 0;
  return { status: ok ? 'PASS' : 'FAIL', detail: parts.join('; ') };
}

// 2 · RLS enforcement posture (SOFT by default, escalates to HARD)
//
// Severity is conditional on how much tenancy actually exists. Policies that are
// provisioned but compiled to a no-op (RLS_ENFORCE != 'on') are harmless while a
// single organization owns every row — there is no other tenant to leak to. The
// moment a SECOND organization exists, that same posture is a live cross-tenant
// read of another customer's regulatory data, which is a pilot-stopping defect,
// not an advisory. So: > 1 org and not enforcing ⇒ HARD FAIL; 0–1 orgs and not
// enforcing ⇒ SOFT WARN that flipping the switch is a precondition for tenant #2.
//
// The org count is read defensively: a missing organizations table or an
// unreachable database yields a SOFT FAIL carrying the reason, never a crash and
// never an escalation — we refuse to declare NO-GO on evidence we could not read.
async function gateRls(db) {
  const raw = (process.env.RLS_ENFORCE ?? '').trim();
  const mode = resolveRlsMode(raw);
  const enforceStr = `RLS_ENFORCE=${raw || '(unset)'} → ${mode}${mode === 'on' ? ' (filtering rows)' : ' (NOT filtering)'}`;

  if (!db.ok) {
    return {
      status: 'FAIL',
      severity: 'SOFT',
      detail: `database unavailable — ${db.reason}; ${enforceStr}; tenant count unknown, so this gate cannot judge cross-tenant exposure`,
    };
  }

  const forced = await db.pool.query(
    `SELECT count(*)::int AS n
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity`,
  );
  const forcedCount = forced.rows[0].n;

  // Probe a known RLS-forced table (all four carry a tenant column, so 0021
  // enables + FORCEs RLS on them); report the first that exists.
  const CANDIDATES = ['regulatory_programs', 'c2c_documents', 'authoring_documents', 'adverse_events'];
  const probe = await db.pool.query(
    `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND relname = ANY($1)
      ORDER BY array_position($1::text[], relname)`,
    [CANDIDATES],
  );
  const probed = probe.rows.find((r) => r.relforcerowsecurity) || probe.rows[0];
  const probeStr = probed
    ? `${probed.relname}: rowsecurity=${probed.relrowsecurity} force=${probed.relforcerowsecurity}`
    : 'no candidate RLS table present';

  // Tenancy: how many organizations actually share this database? Read in its
  // own try/catch — an absent organizations table must degrade this gate, not
  // abort it, and must never be mistaken for "0 tenants" (which would look SAFE).
  let orgCount = null;
  let orgReason = '';
  try {
    const orgs = await db.pool.query('SELECT count(*)::int AS n FROM organizations');
    orgCount = orgs.rows[0].n;
  } catch (err) {
    orgReason = err?.message || String(err);
  }

  const noForce = forcedCount === 0 && !(probed && probed.relforcerowsecurity);
  const tenancyStr =
    orgCount === null ? `organizations: UNREADABLE (${orgReason})` : `organizations: ${orgCount}`;

  const parts = [`${forcedCount} FORCE-RLS table(s)`, probeStr, enforceStr, tenancyStr];
  if (noForce) parts.push('no FORCE ROW LEVEL SECURITY tables found');
  const detail = parts.join('; ');

  if (mode === 'on') {
    // Enforcing. Still advisory-WARN if there is nothing to enforce on: the flag
    // is set but no table carries FORCE ROW LEVEL SECURITY, so it filters nothing.
    if (noForce) {
      return {
        status: 'WARN',
        severity: 'SOFT',
        detail: `${detail} — RLS_ENFORCE=on but no table FORCEs row security, so the switch currently filters nothing`,
      };
    }
    return { status: 'PASS', severity: 'SOFT', detail };
  }

  // Not enforcing from here down. Severity depends on whether a second tenant exists.
  if (orgCount === null) {
    return {
      status: 'FAIL',
      severity: 'SOFT',
      detail: `${detail} — cannot determine tenant count, so cross-tenant exposure is UNVERIFIED; re-run with a readable organizations table before treating this as safe`,
    };
  }

  if (orgCount > 1) {
    return {
      status: 'FAIL',
      severity: 'HARD',
      detail:
        `${detail} — ${orgCount} organizations share this database while RLS is NOT enforcing: ` +
        'every tenant can read every other tenant\'s rows. Set RLS_ENFORCE=on (and restart) before any human tester touches this deployment.',
    };
  }

  return {
    status: 'WARN',
    severity: 'SOFT',
    detail:
      `${detail} — policies provisioned but not enforcing. Tolerable at ${orgCount} organization(s) (no second tenant to leak to), ` +
      'but RLS_ENFORCE=on is REQUIRED before a second organization is created — this gate turns HARD the moment one is.',
  };
}

// 3 · No known-password demo admin (HARD)
async function gateDemoAdmin(db) {
  const emails = discoverDemoAdminEmails();
  const raw = (process.env.SEED_DEMO_USER ?? '').trim();
  const seedOn = ['true', '1', 'yes', 'on'].includes(raw.toLowerCase());

  const notes = [`demo identity: ${emails.join(', ')}`, `SEED_DEMO_USER=${raw || '(unset)'}`];
  if (seedOn) notes.push('SEED_DEMO_USER is ON — a known-password admin would be (re)seeded on boot');

  if (!db.ok) return { status: 'FAIL', detail: `database unavailable — ${db.reason}; ${notes.join('; ')}` };

  const found = await db.pool.query(`SELECT email FROM users WHERE lower(email) = ANY($1::text[])`, [emails]);
  const rowExists = found.rowCount > 0;
  notes.push(rowExists ? `FOUND demo admin row(s): ${found.rows.map((r) => r.email).join(', ')}` : 'no demo admin row present');

  const ok = !rowExists && !seedOn;
  return { status: ok ? 'PASS' : 'FAIL', detail: notes.join('; ') };
}

// 4 · Boot secrets present (HARD)
// The fail-closed boot secrets: DATABASE_URL + a JWT signing secret always
// (server/startup/env.ts validateEnvironment); refresh-token secret in
// staging/prod, MFA + audit-seal keys in production (server/config/environment.ts).
// Never prints values — only which var satisfied a group, or its length.
function gateBootSecrets() {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const isProd = nodeEnv === 'production';
  const isStaging = nodeEnv === 'staging';

  // Resolve a secret the way server/config/environment.ts does: the
  // environment-specific variable FIRST, then the generic one. Checking the
  // generic first would pass this gate on a valid JWT_SECRET while the server
  // picks a short JWT_SECRET_PROD and refuses to boot — a false GO.
  const suffix = isProd ? 'PROD' : isStaging ? 'STAGING' : 'DEV';
  const resolveOrdered = (names) => names.find((n) => (process.env[n] ?? '').trim() !== '');

  const groups = [
    { label: 'database URL', names: ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET'], required: true },
    {
      label: 'JWT signing secret',
      names: [`JWT_SECRET_${suffix}`, 'JWT_SECRET'],
      required: true,
      minLen: JWT_SECRET_MIN_LENGTH,
    },
    {
      label: 'refresh-token secret',
      names: [`REFRESH_TOKEN_SECRET_${suffix}`, 'REFRESH_TOKEN_SECRET'],
      required: isProd || isStaging,
      minLen: JWT_SECRET_MIN_LENGTH,
    },
    { label: 'MFA encryption key', names: ['MFA_ENCRYPTION_KEY'], required: isProd, minLen: JWT_SECRET_MIN_LENGTH },
    {
      label: 'audit HMAC seal key',
      names: ['AUDIT_HMAC_KEY'],
      required: isProd,
      // assertAuditSealPostureForProduction() rejects a key under 32 chars even
      // when the unsealed opt-out is set, so a non-blank value is not enough.
      minLen: JWT_SECRET_MIN_LENGTH,
      // Explicit accepted-risk opt-out documented in server config.
      optOut: () => (process.env.AUDIT_SEAL_ACCEPT_UNSEALED ?? '').trim().toLowerCase() === 'true',
    },
  ];

  const problems = [];
  const okParts = [];
  for (const g of groups) {
    const via = resolveOrdered(g.names);
    if (!g.required) {
      okParts.push(`${g.label}: ${via ? 'set' : 'not required for NODE_ENV=' + nodeEnv}`);
      continue;
    }
    if (!via) {
      if (g.optOut && g.optOut()) {
        okParts.push(`${g.label}: unset but AUDIT_SEAL_ACCEPT_UNSEALED=true (accepted risk)`);
      } else {
        problems.push(`${g.label} MISSING (set one of: ${g.names.join(' | ')})`);
      }
      continue;
    }
    if (g.minLen && (process.env[via] || '').length < g.minLen) {
      problems.push(`${g.label} set via ${via} but too short (${(process.env[via] || '').length} chars; need >= ${g.minLen})`);
      continue;
    }
    okParts.push(`${g.label}: set`);
  }

  // getRefreshTokenSecret() refuses to boot in staging/production when the
  // refresh secret equals the JWT secret (a JWT disclosure would otherwise also
  // forge refresh tokens). Compare the RESOLVED values, or this gate reports GO
  // for an environment guaranteed to fail startup.
  if (isProd || isStaging) {
    const jwtVia = resolveOrdered([`JWT_SECRET_${suffix}`, 'JWT_SECRET']);
    const refreshVia = resolveOrdered([`REFRESH_TOKEN_SECRET_${suffix}`, 'REFRESH_TOKEN_SECRET']);
    if (jwtVia && refreshVia && process.env[jwtVia] === process.env[refreshVia]) {
      problems.push(
        `refresh-token secret (${refreshVia}) is IDENTICAL to the JWT signing secret (${jwtVia}) — the server refuses to boot; they must be distinct`,
      );
    }
  }

  const detail = `NODE_ENV=${nodeEnv}; ${problems.length ? problems.join('; ') : okParts.join('; ')}`;
  return { status: problems.length ? 'FAIL' : 'PASS', detail };
}

// 5 · SMTP / login-OTP delivery (HARD)
//
// Readiness blocker #3: email OTP is the mandatory second factor, so a login
// cannot complete unless mail actually reaches the tester. This gate mirrors
// getTransporter() in server/services/emailService.ts exactly — no aliases, no
// fallbacks, because the app has none:
//
//   SMTP_HOST  required   (no default; absent ⇒ transport is null)
//   SMTP_USER  required   (no default; auth.user)
//   SMTP_PASS  required   (no default; auth.pass)
//   SMTP_PORT  optional   defaults to '465'; `secure` is `port === 465`, so the
//                         port alone decides implicit TLS vs STARTTLS
//   SMTP_FROM  optional   defaults to a literal noreply@ address
//
// getTransporter() returns null unless HOST *and* USER *and* PASS are all set,
// and every sender then degrades to a log line: sendLoginOtpEmail() logs an
// error in production and returns, so the tester waits forever for a code that
// was never sent. That is a total login outage, hence HARD.
//
// Values are never printed — only set/MISSING. SMTP_PORT is echoed because it is
// a TCP port rather than a credential and it silently changes the TLS mode.
function gateSmtp() {
  const isSet = (n) => (process.env[n] ?? '').trim() !== '';
  const REQUIRED = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const missing = REQUIRED.filter((n) => !isSet(n));

  const rawPort = (process.env.SMTP_PORT ?? '').trim();
  const port = rawPort === '' ? 465 : Number.parseInt(rawPort, 10);
  const portValid = Number.isInteger(port) && port > 0 && port <= 65535;
  const portStr = rawPort === ''
    ? 'SMTP_PORT: unset → 465 (implicit TLS)'
    : `SMTP_PORT: ${rawPort}${portValid ? (port === 465 ? ' (implicit TLS)' : ' (STARTTLS)') : ' — NOT A VALID TCP PORT'}`;

  const state = [
    ...REQUIRED.map((n) => `${n}: ${isSet(n) ? 'set' : 'MISSING'}`),
    portStr,
    `SMTP_FROM: ${isSet('SMTP_FROM') ? 'set' : 'unset → noreply@concept2cure.pro default'}`,
  ];

  const problems = [];
  if (missing.length) {
    problems.push(
      `${missing.join(' + ')} MISSING — getTransporter() returns null, so login OTP emails are never sent and NO tester can complete a login`,
    );
  }
  if (!portValid) {
    problems.push(`SMTP_PORT='${rawPort}' does not parse to a usable TCP port — nodemailer cannot open a connection`);
  }

  // Configuration is necessary but NOT sufficient: credentials can be wrong, the
  // relay can reject the sender domain, or mail can land in spam. Only a real
  // send proves delivery.
  const proof =
    'NOTE: configuration present != mail delivered — wrong credentials, a rejected sender domain, or spam filtering all still block login. ' +
    'Prove real end-to-end delivery with `npm run pilot:verify-otp -- <address>` (the `--` is required to forward the address) before opening the pilot.';

  // The per-variable state is reported unconditionally (not just on success) —
  // an operator debugging a failure needs to see which vars ARE set, not only
  // which are missing.
  const detail = [state.join('; '), ...problems, proof].join('; ');
  return { status: problems.length ? 'FAIL' : 'PASS', detail };
}

// 6 · Monitoring — SENTRY_DSN present (SOFT)
function gateMonitoring() {
  const present = (process.env.SENTRY_DSN ?? '').trim() !== '';
  return present
    ? { status: 'PASS', detail: 'SENTRY_DSN is set (confirm a test exception actually pages someone)' }
    : { status: 'WARN', detail: 'SENTRY_DSN not set — error monitoring / paging unavailable (recommended before pilot)' };
}

// 7 · PDF export capability (SOFT, best-effort)
function gatePdf() {
  const chromium = detectChromium();
  const vera = detectVeraPdf();
  const detail =
    `chromium: ${chromium.found ? `available (${chromium.via})` : 'not found'}; ` +
    `veraPDF: ${vera.found ? `available (${vera.via})` : 'not found'}`;
  return { status: chromium.found && vera.found ? 'PASS' : 'WARN', detail };
}

// ── runner / rendering ──────────────────────────────────────────────────────
// `severity` is the gate's DEFAULT. A gate may return its own `severity` to
// override it when its blast radius depends on live state (gate 2). A gate that
// THROWS keeps the declared default — a broken probe must never be able to
// escalate itself into a HARD failure and manufacture a NO-GO.
async function runGate(num, name, severity, fn) {
  try {
    const res = await fn();
    const effective = res.severity === 'HARD' || res.severity === 'SOFT' ? res.severity : severity;
    return { num, name, severity: effective, status: res.status, detail: res.detail };
  } catch (err) {
    return { num, name, severity, status: 'FAIL', detail: `check errored: ${err?.message || err}` };
  }
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
function color(s, code) {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}
function statusColor(padded, status) {
  if (status === 'PASS') return color(padded, '32');
  if (status === 'FAIL') return color(padded, '31');
  return color(padded, '33');
}
function padEndTrunc(s, w) {
  s = String(s);
  if (s.length > w) return s.slice(0, w - 1) + '…';
  return s.padEnd(w);
}
function padCenter(s, w) {
  s = String(s);
  if (s.length >= w) return s.slice(0, w);
  const left = Math.floor((w - s.length) / 2);
  return ' '.repeat(left) + s + ' '.repeat(w - s.length - left);
}

function printHeader(db) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  PILOT GO / NO-GO — pre-human-testing gate verification                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`  Time:      ${new Date().toISOString()}`);
  console.log(`  NODE_ENV:  ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Database:  ${db.ok ? redactDbUrl(db.url) : `UNAVAILABLE — ${db.reason}`}`);
  console.log('');
}

function printTable(results) {
  const W = { num: 3, name: 30, sev: 4, res: 6 };
  const bar = (l, m, r) =>
    l + '─'.repeat(W.num + 2) + m + '─'.repeat(W.name + 2) + m + '─'.repeat(W.sev + 2) + m + '─'.repeat(W.res + 2) + r;
  const row = (a, b, c, d) =>
    `│ ${a} │ ${b} │ ${c} │ ${d} │`;

  console.log(bar('┌', '┬', '┐'));
  console.log(row(padEndTrunc('#', W.num), padEndTrunc('Gate', W.name), padEndTrunc('Sev', W.sev), padCenter('Result', W.res)));
  console.log(bar('├', '┼', '┤'));
  for (const r of results) {
    console.log(
      row(
        padEndTrunc(r.num, W.num),
        padEndTrunc(r.name, W.name),
        padEndTrunc(r.severity, W.sev),
        statusColor(padCenter(r.status, W.res), r.status),
      ),
    );
  }
  console.log(bar('└', '┴', '┘'));
}

function printDetails(results) {
  console.log('\nDetails');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '⚠';
    console.log(`  ${statusColor(icon, r.status)} [${r.severity}] ${r.num}. ${r.name}`);
    console.log(`      ${r.detail}`);
  }
}

function printSummary(results, hardFailures) {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const softIssues = results.filter((r) => r.severity === 'SOFT' && r.status !== 'PASS').length;
  console.log('\n── Summary ──');
  console.log(`  Gates passing:    ${pass}/${results.length}`);
  console.log(`  HARD failures:    ${hardFailures}`);
  console.log(`  SOFT advisories:  ${softIssues}`);

  if (hardFailures > 0) {
    console.log(`\n  ${color('VERDICT: NO-GO', '31')} — ${hardFailures} hard gate(s) failing. Do not open the pilot.`);
  } else if (softIssues > 0) {
    console.log(`\n  ${color('VERDICT: GO', '32')} (with advisories) — no hard blockers; review the ${softIssues} SOFT item(s) above.`);
  } else {
    console.log(`\n  ${color('VERDICT: GO', '32')} — all gates green.`);
  }
  console.log('');
}

async function main() {
  const url = getDatabaseUrl();
  let db = { ok: false, reason: 'DATABASE_URL not set (DATABASE_URL / DATABASE_NEON_NEW_SECRET / NEON_DATABASE_URL)', pool: null, url };
  if (url) {
    // Bounded connect/query timeouts so an unreachable DB fails SOFT within
    // seconds instead of hanging the go/no-go check indefinitely.
    // SSL only where the target actually speaks it. Managed Postgres (Neon and
    // friends) requires it, but a local/CI server rejects the handshake outright
    // ("the server does not support SSL connections") — which would fail every
    // database gate and report a false NO-GO. An explicit sslmode=disable wins.
    const wantsSsl =
      !/sslmode=disable/i.test(url) &&
      (/sslmode=(require|prefer|verify-ca|verify-full)/i.test(url) ||
        /\.neon\.tech|\.rds\.amazonaws\.com|\.supabase\.|\.azure\.com/i.test(url));
    // TLS is VERIFIED against the trusted CA store. Managed Postgres (Neon,
    // RDS, Supabase) presents a publicly-trusted certificate, so verification
    // succeeds — and a tool whose job is to certify a pilot is safe has no
    // business disabling transport security to do it. A self-signed/internal CA
    // deployment can opt out explicitly with PILOT_DB_SSL_NO_VERIFY=true, which
    // is reported in the output so it can never be an invisible downgrade.
    const noVerify = (process.env.PILOT_DB_SSL_NO_VERIFY ?? '').trim().toLowerCase() === 'true';
    if (noVerify) {
      console.warn(
        '  ⚠ PILOT_DB_SSL_NO_VERIFY=true — database TLS certificate verification is DISABLED for this run.',
      );
    }
    const pool = new Pool({
      connectionString: url,
      ...(wantsSsl ? { ssl: noVerify ? { rejectUnauthorized: false } : true } : {}),
      connectionTimeoutMillis: 10000,
      query_timeout: 15000,
      statement_timeout: 15000,
    });
    try {
      await pool.query('SELECT 1');
      db = { ok: true, pool, url };
    } catch (err) {
      db = { ok: false, reason: `connection failed: ${err?.message || err}`, pool, url };
    }
  }

  printHeader(db);

  const results = [];
  results.push(await runGate(1, 'Schema provisioned', 'HARD', () => gateSchema(db)));
  // Gate 2 declares SOFT as its fallback only; it returns HARD itself when the
  // database is genuinely multi-tenant and RLS is not enforcing.
  results.push(await runGate(2, 'RLS enforcement posture', 'SOFT', () => gateRls(db)));
  results.push(await runGate(3, 'No known-password demo admin', 'HARD', () => gateDemoAdmin(db)));
  results.push(await runGate(4, 'Boot secrets present', 'HARD', () => gateBootSecrets()));
  results.push(await runGate(5, 'SMTP / login-OTP delivery', 'HARD', () => gateSmtp()));
  results.push(await runGate(6, 'Monitoring (Sentry)', 'SOFT', () => gateMonitoring()));
  results.push(await runGate(7, 'PDF export capability', 'SOFT', () => gatePdf()));

  if (db.pool) await db.pool.end().catch(() => {});

  printTable(results);
  printDetails(results);

  const hardFailures = results.filter((r) => r.severity === 'HARD' && r.status === 'FAIL').length;
  printSummary(results, hardFailures);

  process.exit(hardFailures ? 1 : 0);
}

main().catch((err) => {
  // Framework-level crash (gates themselves fail soft). A crash is itself a no-go.
  console.error(`\nFATAL: pilot go/no-go runner crashed: ${err?.message || err}`);
  process.exit(1);
});
