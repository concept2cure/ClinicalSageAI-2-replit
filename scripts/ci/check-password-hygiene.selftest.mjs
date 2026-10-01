#!/usr/bin/env node
/**
 * Self-test for check-password-hygiene.mjs (ci:password-hygiene).
 *
 * The gate reports OK on the current tree, so its failure branch never fires in
 * normal use, and a guard whose failure branch has never been seen has not been
 * tested (CLAUDE.md, working agreement). It exists to stop a regression of
 * CRIT-04 (QC_AUDIT_REPORT_2026-02-13): a stored password compared in
 * plaintext, or hashed with something other than bcrypt, or written into auth
 * source as a literal.
 *
 * Each case writes a throwaway server/ tree into a temp directory, points a
 * patched copy of the gate at it (only its repoRoot and the import path of its
 * scan-roots helper change), runs it as a subprocess and checks the verdict:
 * every defect shape the gate's header names must fail AND be reported at the
 * right file:line with the right reason; the near-misses a sloppier gate would
 * flag (typeof guards, md5 checksums and a scrypt KDF outside auth code, sha256
 * token hashing inside it, comments, test fixtures) must stay quiet.
 *
 * The gate has no baseline file (ALLOWLIST_FILES is an empty in-source set),
 * so there are no baseline-semantics cases.
 *
 * SELFTEST_GATE_PATH=<file> runs the cases against another copy of the gate,
 * which is how a deliberately weakened gate is shown to fail this selftest.
 *
 * Usage: node scripts/ci/check-password-hygiene.selftest.mjs   (exit 0 = all cases held)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const TAG = '[ci:password-hygiene:selftest]';
const here = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.resolve(process.env.SELFTEST_GATE_PATH || path.join(here, 'check-password-hygiene.mjs'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'password-hygiene-selftest-'));

// ── The patched gate ──────────────────────────────────────────────────────────
// Two substitutions, each required to land: if either anchor has moved, the
// patched copy would scan the real repository (or fail to import) and every
// verdict below would be about the wrong tree.
const ROOT_ANCHOR = /const repoRoot = path\.resolve\(path\.dirname\(__filename\), '\.\.', '\.\.'\);/;
const LIB_ANCHOR = /from '\.\/lib\/scan-roots\.mjs'/;
const gateSrc = fs.readFileSync(GATE, 'utf8');
for (const [name, anchor] of [['repoRoot', ROOT_ANCHOR], ['scan-roots import', LIB_ANCHOR]]) {
  if (!anchor.test(gateSrc)) {
    console.error(`${TAG} cannot patch ${GATE}: its ${name} line no longer matches ${anchor}. Update the selftest.`);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(2);
  }
}
const libBesideGate = path.join(path.dirname(GATE), 'lib', 'scan-roots.mjs');
const lib = fs.existsSync(libBesideGate) ? libBesideGate : path.join(here, 'lib', 'scan-roots.mjs');
const patchedGate = path.join(tmp, 'gate.mjs');
fs.writeFileSync(
  patchedGate,
  gateSrc
    .replace(ROOT_ANCHOR, 'const repoRoot = process.env.PASSWORD_HYGIENE_SELFTEST_ROOT;')
    .replace(LIB_ANCHOR, `from ${JSON.stringify(pathToFileURL(lib).href)}`),
);

let caseSeq = 0;
/** Write `files` into a fresh fixture root and run the patched gate over it. */
function runGate(files, { withServer = true } = {}) {
  const root = path.join(tmp, `case-${++caseSeq}`);
  fs.mkdirSync(withServer ? path.join(root, 'server') : root, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  const res = spawnSync(process.execPath, [patchedGate], {
    encoding: 'utf8',
    env: { ...process.env, PASSWORD_HYGIENE_SELFTEST_ROOT: root },
  });
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

/** The gate's findings, as {site: 'server/x.ts:12', reason}. */
function parseFindings(out) {
  const found = [];
  const lines = out.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const site = /^ {2}(server\/\S+:\d+)$/.exec(lines[i]);
    const reason = /^ {4}→ (.*)$/.exec(lines[i + 2] ?? '');
    if (site && reason) found.push({ site: site[1], reason: reason[1] });
  }
  return found;
}

const R = {
  plaintext: 'plaintext password equality compare',
  scrypt: 'scrypt for password hashing is deprecated',
  weak: 'md5/sha1 are not acceptable password hashes',
  literal: 'hardcoded password literal in auth-relevant code',
};

/** The 1-based line of `needle` inside the fixture body for `file`. */
function at(files, file, needle) {
  const idx = files[file].split('\n').findIndex(l => l.includes(needle));
  if (idx < 0) throw new Error(`selftest bug: ${JSON.stringify(needle)} is not in ${file}`);
  return `${file}:${idx + 1}`;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

// CRIT-04: the stored password compared against the submitted one.
const LOGIN_PLAINTEXT = {
  'server/routes/auth.ts': `import { Router } from 'express';
import { findUserByEmail, issueSession } from '../services/auth-security-service';
export const router = Router();
router.post('/login', async (req, res) => {
  const user = await findUserByEmail(req.body.email);
  if (user && user.password === req.body.password) {
    return res.json(await issueSession(user));
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});
`,
};

// Rule 1 applies everywhere, not only in auth-scoped files.
const ADMIN_RESET_PLAINTEXT = {
  'server/services/admin/user-admin-service.ts': `export async function confirmReset(admin: { password: string }, submitted: string) {
  if (admin.password == submitted) return true;
  return false;
}
`,
};

// A master password compared as a literal.
const MASTER_PASSWORD = {
  'server/services/support-unlock.ts': `export function canUnlock(password: string): boolean {
  return password === 'Support!2026';
}
`,
};

// A typeof guard and a real compare on one line: the guard is exempt, the compare is not.
const GUARD_THEN_COMPARE = {
  'server/routes/ana-ri/seal-verified.ts': `export function verify(body: any, user: any) {
  const ok = typeof body.password === 'string' && user.password === body.password;
  return ok;
}
`,
};

// Rule 2 — scrypt (the scheme bcrypt replaced) on an auth path.
const SCRYPT_IN_AUTH = {
  'server/auth/index.ts': `import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return \`\${salt}:\${derived.toString('hex')}\`;
}
`,
  'server/middleware/authAdapter.ts': `import crypto from 'node:crypto';
export function legacyHash(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
`,
};

// Rule 2 — md5 / sha1 on auth paths, including an upper-case algorithm name.
const WEAK_HASH_IN_AUTH = {
  'server/routes/founder.ts': `import crypto from 'node:crypto';
export function founderHash(password: string) {
  return crypto.createHash('md5').update(password).digest('hex');
}
`,
  'server/services/emailOtpService.ts': `import { createHash } from 'node:crypto';
export const hashOtp = (code: string) => createHash("SHA1").update(code).digest('hex');
`,
};

// Rule 3 — a password written into auth source.
const HARDCODED_IN_AUTH = {
  'server/founder-bootstrap.ts': `export const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_PASSWORD = 'Concept2Cure!2026';
export function founderCredentials() {
  return { email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD };
}
`,
  'server/services/auth-seed.ts': `export async function seedAdmin(createUser: Function) {
  await createUser({ email: 'admin@example.com', password: 'ChangeMe123!' });
}
`,
};

// A file under each location AUTH_FILE_PATTERNS names, each holding an md5
// password hash. A location that falls out of scope shows up as a missing site.
const AUTH_SCOPE_PATHS = [
  'server/auth/password.ts',
  'server/auth.ts',
  'server/middleware/auth.ts',
  'server/middleware/tenantAuth.ts',
  'server/middleware/authAdapter.js',
  'server/routes/authEnterprise.ts',
  'server/routes/founder-admin.ts',
  'server/founder.ts',
  'server/services/auth-security-service.ts',
  'server/services/mfaService.ts',
  'server/services/emailOtpService.ts',
];
const AUTH_SCOPE = Object.fromEntries(
  AUTH_SCOPE_PATHS.map(p => [
    p,
    `import crypto from 'node:crypto';\nexport const h = (password) => crypto.createHash('md5').update(password).digest('hex');\n`,
  ]),
);

// ── Clean shapes ─────────────────────────────────────────────────────────────

const BCRYPT_LOGIN = {
  'server/routes/auth.ts': `import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
export async function login(req: any, user: any) {
  const ok = await bcrypt.compare(req.body.password, user.passwordHash);
  return ok;
}
export async function register(password: string) {
  return bcrypt.hash(password, 12);
}
export const hashRefreshToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const FOUNDER_PASSWORD = process.env.FOUNDER_PASSWORD;
export const founder = { password: FOUNDER_PASSWORD };
`,
};

// Verbatim shapes from the real tree (governed-esignature.ts, governed-signature-ceremony.ts).
const TYPEOF_GUARDS = {
  'server/routes/ana-ri/governed-esignature.ts': `export function read(body: any) {
  const password = typeof body.password === 'string' ? body.password : '';
  return password;
}
`,
  'server/services/part11/governed-signature-ceremony.ts': `export function asReauth(r: Record<string, unknown>) {
  return {
    ...(typeof r.password === 'string' ? { password: r.password } : {}),
  };
}
`,
};

const PRESENCE_CHECKS = {
  'server/routes/auth.ts': `export function requirePassword(req: any, res: any) {
  const { password } = req.body;
  if (password === undefined || password === null) return res.status(400).end();
  if (req.body.mfaOnly == true && req.body.password == null) return res.status(400).end();
}
`,
};

// md5 checksums and a scrypt KDF are legitimate outside auth code (real shapes:
// ectd/leaf-source-resolver.ts, connectors/connector-registry.ts).
const PRIMITIVES_OUTSIDE_AUTH = {
  'server/services/ectd/leaf-source-resolver.ts': `import { createHash } from 'node:crypto';
export const leafMd5 = (pdfBytes: Buffer) => ({ md5: createHash('md5').update(pdfBytes).digest('hex') });
export const etag = (s: string) => createHash('sha1').update(s).digest('hex');
`,
  'server/services/connectors/connector-registry.ts': `import crypto from 'node:crypto';
export function getDerivedKey(secret: string): Buffer {
  return crypto.scryptSync(secret, 'salt', 32);
}
`,
};

const CONFIRM_FIELD = {
  'server/routes/auth.ts': `export function confirmMatches(newPassword: string, confirmPassword: string) {
  return newPassword === confirmPassword;
}
`,
};

const COMMENTED = {
  'server/routes/auth.ts': `/**
 * CRIT-04 was: password === stored, and crypto.createHash('md5') for the hash.
 */
// legacy: if (user.password === req.body.password) { ... }
// const FOUNDER_PASSWORD = 'Concept2Cure!2026';
export const ok = true;
`,
};

const EXEMPT_PATHS = {
  'server/routes/__tests__/auth.test.ts': `const password = 'Password123!';\nexpect(user.password === password).toBe(false);\n`,
  'server/auth/login.test.ts': `if (user.password === 'Password123!') throw new Error();\n`,
  'server/services/auth-security-service.spec.ts': `crypto.createHash('md5').update(password);\n`,
  'server/_deprecated_auth/auth.ts': `if (user.password === req.body.password) {}\n`,
};

// ── Cases ────────────────────────────────────────────────────────────────────

const f = (files, file, needle, reason) => ({ site: at(files, file, needle), reason });

const cases = [
  {
    name: 'FAILS on CRIT-04 — a login route comparing the stored password in plaintext',
    files: LOGIN_PLAINTEXT,
    expectExit: 1,
    sites: [f(LOGIN_PLAINTEXT, 'server/routes/auth.ts', 'user.password ===', R.plaintext)],
  },
  {
    name: 'FAILS on a loose (==) plaintext compare outside auth scope — rule 1 holds everywhere',
    files: ADMIN_RESET_PLAINTEXT,
    expectExit: 1,
    sites: [f(ADMIN_RESET_PLAINTEXT, 'server/services/admin/user-admin-service.ts', '== submitted', R.plaintext)],
  },
  {
    name: 'FAILS on a password compared to a string literal (a master password)',
    files: MASTER_PASSWORD,
    expectExit: 1,
    sites: [f(MASTER_PASSWORD, 'server/services/support-unlock.ts', "=== 'Support!2026'", R.plaintext)],
  },
  {
    name: 'FAILS on a plaintext compare sharing a line with a typeof guard (the exemption is not line-wide)',
    files: GUARD_THEN_COMPARE,
    expectExit: 1,
    sites: [f(GUARD_THEN_COMPARE, 'server/routes/ana-ri/seal-verified.ts', 'user.password ===', R.plaintext)],
  },
  {
    name: 'FAILS on scryptAsync / scryptSync password hashing in auth code',
    files: SCRYPT_IN_AUTH,
    expectExit: 1,
    sites: [
      f(SCRYPT_IN_AUTH, 'server/auth/index.ts', 'await scryptAsync(', R.scrypt),
      f(SCRYPT_IN_AUTH, 'server/middleware/authAdapter.ts', 'scryptSync(', R.scrypt),
    ],
  },
  {
    name: "FAILS on md5 and sha1 (any case, any quote) password hashing in auth code",
    files: WEAK_HASH_IN_AUTH,
    expectExit: 1,
    sites: [
      f(WEAK_HASH_IN_AUTH, 'server/routes/founder.ts', "createHash('md5')", R.weak),
      f(WEAK_HASH_IN_AUTH, 'server/services/emailOtpService.ts', 'createHash("SHA1")', R.weak),
    ],
  },
  {
    name: 'FAILS on a hardcoded founder password and a seeded admin password literal in auth code',
    files: HARDCODED_IN_AUTH,
    expectExit: 1,
    sites: [
      f(HARDCODED_IN_AUTH, 'server/founder-bootstrap.ts', "FOUNDER_PASSWORD = '", R.literal),
      f(HARDCODED_IN_AUTH, 'server/services/auth-seed.ts', "password: 'ChangeMe123!'", R.literal),
    ],
  },
  {
    name: `FAILS in every auth-scoped location the gate names (${AUTH_SCOPE_PATHS.length} paths) — none drops out of scope`,
    files: AUTH_SCOPE,
    expectExit: 1,
    sites: AUTH_SCOPE_PATHS.map(p => f(AUTH_SCOPE, p, "createHash('md5')", R.weak)),
  },
  {
    name: 'FAILS closed when server/ is missing — no root is not a clean scan',
    files: {},
    withServer: false,
    expectExit: 1,
    sites: [],
    expectIn: ['required scan root(s) missing'],
  },
  {
    name: 'quiet — bcrypt compare/hash, sha256 token hashing and an env-read founder password in auth code',
    files: BCRYPT_LOGIN,
    expectExit: 0,
  },
  {
    name: "quiet — typeof x.password === 'string' runtime guards (verbatim real-tree shapes)",
    files: TYPEOF_GUARDS,
    expectExit: 0,
  },
  {
    name: 'quiet — presence checks against undefined / null / true',
    files: PRESENCE_CHECKS,
    expectExit: 0,
  },
  {
    name: 'quiet — md5/sha1 checksums and a scrypt KDF outside auth scope',
    files: PRIMITIVES_OUTSIDE_AUTH,
    expectExit: 0,
  },
  {
    name: 'quiet — a confirm-field match (newPassword === confirmPassword) is not a stored-password compare',
    files: CONFIRM_FIELD,
    expectExit: 0,
  },
  {
    name: 'quiet — violations in // and JSDoc comments',
    files: COMMENTED,
    expectExit: 0,
  },
  {
    name: 'quiet — __tests__/, *.test.ts, *.spec.ts and _deprecated_ paths are exempt',
    files: EXEMPT_PATHS,
    expectExit: 0,
  },
];

// ── Run ──────────────────────────────────────────────────────────────────────

let failed = 0;
for (const c of cases) {
  const { code, out } = runGate(c.files, { withServer: c.withServer ?? true });
  const problems = [];
  if (code !== c.expectExit) problems.push(`expected exit ${c.expectExit}, got ${code}`);

  const found = parseFindings(out);
  const expected = c.sites ?? [];
  for (const e of expected) {
    const hit = found.find(x => x.site === e.site);
    if (!hit) problems.push(`no finding at ${e.site}`);
    else if (!hit.reason.startsWith(e.reason)) problems.push(`${e.site} reported as "${hit.reason}", expected "${e.reason}…"`);
  }
  for (const x of found) {
    if (!expected.some(e => e.site === x.site)) problems.push(`unexpected finding at ${x.site} (${x.reason})`);
  }
  if (expected.length > 0 && !out.includes(`Total: ${expected.length} violation(s).`)) {
    problems.push(`output lacked "Total: ${expected.length} violation(s)."`);
  }
  if (c.expectExit === 0 && !out.includes('[ci:password-hygiene] OK')) problems.push('output lacked the OK line');
  for (const s of c.expectIn ?? []) if (!out.includes(s)) problems.push(`output lacked ${JSON.stringify(s)}`);

  console.log(`  ${problems.length ? '✗' : '✓'} ${c.name}`);
  if (problems.length) {
    failed++;
    for (const p of problems) console.log(`      ${p}`);
    console.log(out.trimEnd().split('\n').map(l => `      | ${l}`).join('\n'));
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold (gate: ${GATE})`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
