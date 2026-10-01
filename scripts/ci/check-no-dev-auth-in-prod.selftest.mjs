#!/usr/bin/env node
/**
 * Self-test for check-no-dev-auth-in-prod.mjs (npm run ci:no-dev-auth-in-prod).
 *
 * The gate reports OK on the current tree, so its failure branch never fires in
 * normal use, and a guard whose failure branch has never been seen has not been
 * tested (CLAUDE.md, "verify by making the check fail").
 *
 * This builds a fixture server/ tree in a temp directory, writes a copy of the
 * gate whose repoRoot is that tree, runs it as a subprocess, and asserts its
 * verdict per case — exit code, and the exact `file:line` it names.
 *
 *  - FAILS, naming the site, on the shapes the gate's history describes:
 *      • the MFA skip, /dev-login and mock-admin shortcuts gated on the single
 *        variable `NODE_ENV !== 'production'` (what the gate was written for);
 *      • server/routes/sso.ts as it was: `const isDev = NODE_ENV ===
 *        'development'` in front of an SSO callback that signed a 24-hour JWT
 *        without verifying `code`. That file matched none of the name patterns
 *        and used the positive spelling, so it exercises BOTH later fixes at
 *        once; the next two cases isolate each fix, so reverting either one is
 *        caught on its own;
 *      • token-minting modules outside the name patterns (users, setup, a
 *        top-level server/ file), each minting through one of the three
 *        recognised calls — scope by behaviour, not name;
 *      • every spelling the pattern claims (!= / !== production, == / ===
 *        development, single and double quotes, with and without spaces);
 *      • every name-scoped path, including the nested server/auth/ walk and the
 *        non-recursive top-level server/ walk;
 *      • a copy of the allowlisted helper at any other path — the allowlist is
 *        one exact file, not a prefix;
 *      • a missing scan root (lib/scan-roots.mjs) — a broken scan, not a clean
 *        one;
 *      • with `--strict` and without it: the gate has no lenient mode, and the
 *        deploy callers that omit the flag rely on that.
 *  - PASSES on the near-misses a sloppy gate would flag, each also present as
 *    background in every failing case, which therefore asserts an exact count:
 *    sso.ts as it is now (isDevAuthAllowed(), with comment lines that quote
 *    both forbidden spellings); the helper itself; dev gates the header puts out
 *    of scope (rate-limit relaxation, mock-route registration, feature flags)
 *    in files that neither handle auth nor mint tokens; fail-closed spellings
 *    (=== 'production', !== 'development', !== 'test') inside an auth file;
 *    and test files, __tests__/, node_modules/ and non-source files.
 *
 * The gate has no baseline file — only its one-entry allowlist, covered above —
 * so there are no baseline cases.
 *
 * Fixture sources import only packages (no relative specifiers), so
 * ci:untracked-imports reads nothing in this file as an import. The real gate
 * scans server/ only, so its verdict on the real tree is unchanged by this file.
 *
 * Not asserted, because the gate does not do it today (a selftest asserting it
 * would fail): files under server/ directories other than auth/, middleware/
 * and routes/ are never read, so a token-minting module in server/services/ or
 * server/utils/ is out of scope whatever it contains; and the comparison must be
 * written `process.env.NODE_ENV <op> '<literal>'` — reversed operands,
 * `process.env['NODE_ENV']` or a destructured NODE_ENV are not matched.
 *
 * SELFTEST_GATE_PATH runs the cases against another copy of the gate (a
 * mutant, for the mutation check). It defaults to the real gate.
 *
 * Usage: node scripts/ci/check-no-dev-auth-in-prod.selftest.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:no-dev-auth-in-prod:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-no-dev-auth-in-prod.mjs');
const LIB_DIR_URL = pathToFileURL(path.join(repoRoot, 'scripts', 'ci', 'lib') + path.sep).href;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no-dev-auth-'));
const tree = path.join(tmp, 'repo');
const OK_LINE = '[ci:no-dev-auth-in-prod] OK — no leaky dev-auth gates found';
const REQUIRED_ROOTS = ['server', 'server/auth', 'server/middleware', 'server/routes'];

// ── Fixture tree ──────────────────────────────────────────────────────────────

function resetTree({ omitRoot } = {}) {
  fs.rmSync(tree, { recursive: true, force: true });
  for (const r of REQUIRED_ROOTS) {
    if (r !== omitRoot) fs.mkdirSync(path.join(tree, r), { recursive: true });
  }
}

function put(rel, content) {
  const full = path.join(tree, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** 1-based line of the first occurrence of `needle` in `content`. */
function lineOf(content, needle) {
  const at = content.indexOf(needle);
  if (at < 0) throw new Error(`selftest bug: ${JSON.stringify(needle)} not in fixture`);
  return content.slice(0, at).split('\n').length;
}

/** The two bullet lines the gate prints for a finding: `file:line`, then the trimmed source line. */
function site(rel, content, needle) {
  const line = lineOf(content, needle);
  return `  ${rel}:${line}\n    ${content.split('\n')[line - 1].trim()}\n`;
}

// ── Fixtures: the defect shapes ──────────────────────────────────────────────

/** The MFA skip: a second factor that is not required wherever NODE_ENV is not literally 'production'. */
const MFA_SKIP = `import type { Request, Response, NextFunction } from 'express';

/** Second-factor check on every authenticated request. */
export function requireSecondFactor(req: Request, res: Response, next: NextFunction) {
  // Local convenience: no authenticator app on a laptop.
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  if (!req.session?.mfaVerified) {
    return res.status(401).json({ error: 'MFA_REQUIRED' });
  }
  return next();
}
`;

/**
 * server/routes/sso.ts before the fix: a single-factor POSITIVE gate in front
 * of a callback that signs a genuine 24-hour token for userId 1 / org 2 without
 * ever verifying `code`. The file name matches no AUTH_FILE_PATTERN.
 */
const SSO_LEAKY = `import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();
const isDev = process.env.NODE_ENV === 'development';

router.get('/:provider/callback', async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code } = req.query;

  if (isDev) {
    // TODO: exchange \`code\` with the provider. Until then, sign the dev user in.
    const token = jwt.sign(
      { userId: '1', organizationId: '2', role: 'client_user', provider, type: 'access' },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );
    return res.redirect(302, \`/auth/callback#token=\${token}\`);
  }

  res.status(501).json({ success: false, error: 'SSO_NOT_IMPLEMENTED', code });
});

export default router;
`;

/** /dev-login in an auth-named route file, gated on the positive spelling only. */
const DEV_LOGIN_POSITIVE = `import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

router.post('/dev-login', (req, res) => {
  if (process.env.NODE_ENV === "development") {
    const token = jwt.sign({ userId: 1, role: 'admin' }, process.env.JWT_SECRET as string, { expiresIn: '8h' });
    return res.json({ token });
  }
  return res.status(404).end();
});

export default router;
`;

/** Token minting via signJwt( in a file named for something else. */
const USERS_SIGNJWT = `import { Router } from 'express';
import { signJwt } from '@c2c/tokens';

const router = Router();

router.post('/users/:id/impersonate', async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    return res.json({ token: signJwt({ userId: Number(req.params.id), role: 'admin' }) });
  }
  return res.status(403).json({ error: 'FORBIDDEN' });
});

export default router;
`;

/** Token minting via generateToken( during first-run setup. */
const SETUP_GENERATETOKEN = `import { Router } from 'express';
import { generateToken } from '@c2c/tokens';

const router = Router();

router.post('/setup/bootstrap-admin', async (_req, res) => {
  const skipInviteCheck = process.env.NODE_ENV != "production";
  if (skipInviteCheck) {
    return res.json({ token: generateToken({ userId: 1, role: 'super_admin' }) });
  }
  return res.status(409).json({ error: 'ALREADY_INITIALISED' });
});

export default router;
`;

/** Token minting via jwt.sign( in a top-level server/ file (the non-recursive walk). */
const TOPLEVEL_JWT = `import jwt from 'jsonwebtoken';

export function previewSessionToken(orgId: number): string | null {
  if (process.env.NODE_ENV !== 'production') {
    return jwt.sign({ userId: 1, organizationId: orgId, role: 'admin' }, process.env.JWT_SECRET as string);
  }
  return null;
}
`;

/** The mock-admin session shortcut, written every way the pattern claims to catch. */
const MOCK_ADMIN_SPELLINGS = `import type { Request, Response, NextFunction } from 'express';

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  if (process.env.NODE_ENV != "production" && !req.user) {
    req.user = { id: 1, role: 'admin', organizationId: 1 };
  }
  if (process.env.NODE_ENV  ==  'development' && req.headers['x-dev-user']) {
    req.user = { id: Number(req.headers['x-dev-user']), role: 'admin', organizationId: 1 };
  }
  const relaxed = process.env.NODE_ENV!=='production';
  if (relaxed && req.query.as) req.user = { id: Number(req.query.as), role: 'admin', organizationId: 1 };
  return next();
}
`;

const NAME_SCOPED_PATHS = [
  'server/auth.ts',
  'server/auth.js',
  'server/founder-login.ts',
  'server/auth/providers/local.ts',
  'server/middleware/auth.ts',
  'server/middleware/authz.js',
  'server/middleware/tenantAuth.ts',
  'server/routes/authEnterprise.ts',
  'server/routes/founder-console.ts',
];

/** A dev shortcut with no token issuance: in scope only because of where it lives. */
const NAME_SCOPED_BODY = `export function devShortcut(req: { user?: unknown }) {
  if (process.env.NODE_ENV !== 'production') {
    req.user = { id: 1, role: 'admin' };
  }
}
`;

/** server/auth/dev-auth-policy.ts as it is: the one allowlisted file. */
const HELPER = `/**
 * Dev-auth policy gate.
 *
 * Hard rule: dev-auth shortcuts are NEVER allowed unless BOTH of the
 * following are true:
 *
 *   1. process.env.NODE_ENV === 'development'
 *   2. process.env.ALLOW_DEV_AUTH === '1'
 */

export function isDevAuthAllowed(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.ALLOW_DEV_AUTH === '1'
  );
}

export function devAuthDenialReason(): string {
  if (process.env.NODE_ENV !== 'development') {
    return \`dev-auth disabled (NODE_ENV=\${process.env.NODE_ENV ?? 'unset'})\`;
  }
  if (process.env.ALLOW_DEV_AUTH !== '1') {
    return 'dev-auth disabled (ALLOW_DEV_AUTH not set to "1")';
  }
  return 'dev-auth allowed';
}
`;

// ── Fixtures: the clean shapes ───────────────────────────────────────────────

/**
 * server/routes/sso.ts as it is now: the callback gated on isDevAuthAllowed(),
 * and a header comment that quotes both forbidden spellings — as the real one
 * does — in block-comment and line-comment form.
 */
const SSO_FIXED = `import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isDevAuthAllowed } from '@c2c/dev-auth-policy';

/**
 * This was \`process.env.NODE_ENV === 'development'\` — ONE environment variable
 * in front of a credential-minting callback. Do not write the negative spelling
 * either:
 *   process.env.NODE_ENV !== 'production'
 */
// Never again: const isDev = process.env.NODE_ENV === 'development';
const router = Router();

router.get('/:provider/callback', async (req: Request, res: Response) => {
  const { provider } = req.params;
  if (isDevAuthAllowed()) {
    const token = jwt.sign(
      { userId: '1', organizationId: '2', role: 'client_user', provider, type: 'access' },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );
    return res.redirect(302, \`/auth/callback#token=\${token}\`);
  }
  res.status(501).json({ success: false, error: 'SSO_NOT_IMPLEMENTED' });
});

export default router;
`;

/** Dev gates the header puts out of scope: no auth, no token minting. */
const OUT_OF_SCOPE = {
  'server/routes/rate-limit.ts': `import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV !== 'production' ? 10_000 : 300,
});
`,
  'server/routes/mock-agency.ts': `import { Router } from 'express';

export const mockAgencyRouter = Router();
if (process.env.NODE_ENV === 'development') {
  mockAgencyRouter.post('/esg/ack', (_req, res) => res.json({ simulated: true }));
}
`,
  'server/middleware/requestLogger.ts': `export const verbose = process.env.NODE_ENV != "production";
`,
  'server/feature-flags.ts': `export const SHOW_DEBUG_PANEL = process.env.NODE_ENV == 'development';
`,
};

/** Fail-closed spellings inside an auth file: none is a single-factor dev gate. */
const FAIL_CLOSED = `import jwt from 'jsonwebtoken';
import { isDevAuthAllowed } from '@c2c/dev-auth-policy';

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === "production" ? 'strict' : 'lax',
};

export function devLoginToken(): string | null {
  if (process.env.NODE_ENV !== 'development') return null;
  if (!isDevAuthAllowed()) return null;
  return jwt.sign({ userId: 1, role: 'admin' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
}

export const auditToStdout = process.env.NODE_ENV !== 'test';
`;

/** Files the gate deliberately does not read, each carrying the leaky gate. */
const NOT_READ = {
  'server/auth/mfa-gate.test.ts': MFA_SKIP,
  'server/routes/auth.test.js': DEV_LOGIN_POSITIVE,
  'server/routes/__tests__/sso.ts': SSO_LEAKY,
  'server/auth/__tests__/helpers.ts': MFA_SKIP,
  'server/routes/node_modules/dev-login/index.js': DEV_LOGIN_POSITIVE,
  'server/auth/NOTES.md': `Never write \`if (process.env.NODE_ENV !== 'production')\` here.\n`,
  'server/routes/auth-fixtures.json': `{ "gate": "process.env.NODE_ENV === 'development'" }\n`,
};

/** Every clean shape at once: present in every failing case so its count is exact. */
function background() {
  put('server/routes/sso.ts', SSO_FIXED);
  put('server/auth/dev-auth-policy.ts', HELPER);
  for (const [rel, body] of Object.entries(OUT_OF_SCOPE)) put(rel, body);
  put('server/auth/session.ts', FAIL_CLOSED);
  for (const [rel, body] of Object.entries(NOT_READ)) put(rel, body);
}

// ── Running the gate ─────────────────────────────────────────────────────────

let gateRuns = 0;
function runGate(args = []) {
  const src = fs.readFileSync(GATE, 'utf8');
  const rooted = src.replace(/const repoRoot = [^;]+;/, `const repoRoot = ${JSON.stringify(tree)};`);
  if (rooted === src) {
    throw new Error(`cannot point ${GATE} at the fixture tree: it has no "const repoRoot = …;" to patch`);
  }
  // The copy lives outside scripts/ci, so its relative helper imports are
  // re-anchored on the real lib directory.
  const patched = rooted.split("'./lib/").join(`'${LIB_DIR_URL}`);
  // Outside the fixture tree, so the gate never scans its own copy.
  const gatePath = path.join(tmp, `gate-${gateRuns++}.mjs`);
  fs.writeFileSync(gatePath, patched);
  try {
    const out = execFileSync(process.execPath, [gatePath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const total = (n) => `Total: ${n} occurrence(s).`;

// ── Cases ─────────────────────────────────────────────────────────────────────

const cases = [
  {
    name: "FAILS on the MFA skip in server/auth/ gated on NODE_ENV !== 'production' (the shape the gate was written for)",
    setup() {
      background();
      put('server/auth/mfa-gate.ts', MFA_SKIP);
      return {
        expectExit: 1,
        expectIn: [site('server/auth/mfa-gate.ts', MFA_SKIP, "process.env.NODE_ENV !== 'production'"), total(1)],
        expectNotIn: [OK_LINE],
      };
    },
  },
  {
    name: "FAILS on server/routes/sso.ts as it was: isDev = NODE_ENV === 'development' before an unverified jwt.sign",
    setup() {
      background();
      put('server/routes/sso.ts', SSO_LEAKY);
      return {
        expectExit: 1,
        expectIn: [site('server/routes/sso.ts', SSO_LEAKY, "const isDev = process.env.NODE_ENV === 'development'"), total(1)],
        expectNotIn: [OK_LINE],
      };
    },
  },
  {
    name: 'FAILS on the positive spelling alone, in an auth-named route (/dev-login, === "development")',
    setup() {
      background();
      put('server/routes/auth.ts', DEV_LOGIN_POSITIVE);
      return {
        expectExit: 1,
        expectIn: [site('server/routes/auth.ts', DEV_LOGIN_POSITIVE, 'process.env.NODE_ENV === "development"'), total(1)],
        expectNotIn: [OK_LINE],
      };
    },
  },
  {
    name: 'FAILS on token minters outside the name patterns: signJwt( in users.ts, generateToken( in setup.ts, jwt.sign( at server/ top level',
    setup() {
      background();
      put('server/routes/users.ts', USERS_SIGNJWT);
      put('server/routes/setup.ts', SETUP_GENERATETOKEN);
      put('server/preview-session.ts', TOPLEVEL_JWT);
      return {
        expectExit: 1,
        expectIn: [
          site('server/routes/users.ts', USERS_SIGNJWT, "process.env.NODE_ENV !== 'production'"),
          site('server/routes/setup.ts', SETUP_GENERATETOKEN, 'process.env.NODE_ENV != "production"'),
          site('server/preview-session.ts', TOPLEVEL_JWT, "process.env.NODE_ENV !== 'production'"),
          total(3),
        ],
        expectNotIn: [OK_LINE],
      };
    },
  },
  {
    name: 'FAILS on every spelling of the mock-admin gate: != "production", ==  \'development\', !==\'production\' (one site each)',
    setup() {
      background();
      put('server/middleware/authAdapter.ts', MOCK_ADMIN_SPELLINGS);
      return {
        expectExit: 1,
        expectIn: [
          site('server/middleware/authAdapter.ts', MOCK_ADMIN_SPELLINGS, 'process.env.NODE_ENV != "production"'),
          site('server/middleware/authAdapter.ts', MOCK_ADMIN_SPELLINGS, "process.env.NODE_ENV  ==  'development'"),
          site('server/middleware/authAdapter.ts', MOCK_ADMIN_SPELLINGS, "process.env.NODE_ENV!=='production'"),
          total(3),
        ],
        expectNotIn: [OK_LINE],
      };
    },
  },
  {
    name: `FAILS on a dev shortcut at every name-scoped path (${NAME_SCOPED_PATHS.length}, incl. nested server/auth/ and top-level server/)`,
    setup() {
      background();
      for (const rel of NAME_SCOPED_PATHS) put(rel, NAME_SCOPED_BODY);
      return {
        expectExit: 1,
        expectIn: [
          ...NAME_SCOPED_PATHS.map((rel) => site(rel, NAME_SCOPED_BODY, "process.env.NODE_ENV !== 'production'")),
          total(NAME_SCOPED_PATHS.length),
        ],
        expectNotIn: [OK_LINE],
      };
    },
  },
  {
    name: 'FAILS on a copy of the allowlisted helper at another path (the allowlist is one exact file)',
    setup() {
      background();
      put('server/auth/dev-auth-policy.legacy.ts', HELPER);
      return {
        expectExit: 1,
        expectIn: [
          site('server/auth/dev-auth-policy.legacy.ts', HELPER, "    process.env.NODE_ENV === 'development' &&"),
          total(1),
        ],
        expectNotIn: [OK_LINE, '  server/auth/dev-auth-policy.ts:'],
      };
    },
  },
  {
    name: 'FAILS with --strict as without it: there is no lenient mode',
    args: ['--strict'],
    setup() {
      background();
      put('server/auth/mfa-gate.ts', MFA_SKIP);
      return {
        expectExit: 1,
        expectIn: [site('server/auth/mfa-gate.ts', MFA_SKIP, "process.env.NODE_ENV !== 'production'"), total(1)],
        expectNotIn: [OK_LINE],
      };
    },
  },
  {
    name: 'FAILS closed when a scan root is missing (server/middleware absent), rather than reporting OK',
    setup() {
      resetTree({ omitRoot: 'server/middleware' });
      background();
      fs.rmSync(path.join(tree, 'server', 'middleware'), { recursive: true, force: true });
      return {
        expectExit: 1,
        expectIn: ['required scan root(s) missing', path.join(tree, 'server', 'middleware')],
        expectNotIn: [OK_LINE],
      };
    },
  },
  {
    name: 'quiet: sso.ts as it is now — isDevAuthAllowed() before jwt.sign, comment lines quoting both spellings',
    setup() {
      put('server/routes/sso.ts', SSO_FIXED);
      return { expectExit: 0, expectIn: [OK_LINE] };
    },
  },
  {
    name: 'quiet: the allowlisted helper server/auth/dev-auth-policy.ts itself',
    setup() {
      put('server/auth/dev-auth-policy.ts', HELPER);
      return { expectExit: 0, expectIn: [OK_LINE] };
    },
  },
  {
    name: 'quiet: out-of-scope dev gates (rate limit, mock agency route, request logger, feature flag) — no auth, no token minting',
    setup() {
      for (const [rel, body] of Object.entries(OUT_OF_SCOPE)) put(rel, body);
      return { expectExit: 0, expectIn: [OK_LINE] };
    },
  },
  {
    name: "quiet: fail-closed spellings in an auth file (=== 'production', !== 'development', !== 'test')",
    setup() {
      put('server/auth/session.ts', FAIL_CLOSED);
      return { expectExit: 0, expectIn: [OK_LINE] };
    },
  },
  {
    name: 'quiet: the leaky gate in *.test.*, __tests__/, node_modules/ and non-source files is not read',
    setup() {
      for (const [rel, body] of Object.entries(NOT_READ)) put(rel, body);
      return { expectExit: 0, expectIn: [OK_LINE] };
    },
  },
  {
    name: 'quiet: every clean shape at once, under --strict',
    args: ['--strict'],
    setup() {
      background();
      return { expectExit: 0, expectIn: [OK_LINE] };
    },
  },
];

if (process.env.SELFTEST_GATE_PATH) console.log(`${TAG} testing ${GATE} (SELFTEST_GATE_PATH)`);

let failed = 0;
try {
  for (const c of cases) {
    resetTree();
    const expected = c.setup();
    const { code, out } = runGate(c.args ?? []);
    const missing = expected.expectIn.filter((s) => !out.includes(s));
    const leaked = (expected.expectNotIn ?? []).filter((s) => out.includes(s));
    const ok = code === expected.expectExit && missing.length === 0 && leaked.length === 0;
    console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
    if (!ok) {
      failed++;
      if (code !== expected.expectExit) console.log(`      expected exit ${expected.expectExit}, got ${code}`);
      for (const s of missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
      for (const s of leaked) console.log(`      output should not have had: ${JSON.stringify(s)}`);
      console.log(out.trimEnd().split('\n').map((l) => `      | ${l}`).join('\n'));
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failed) {
  const shown = GATE.startsWith(repoRoot + path.sep) ? path.relative(repoRoot, GATE) : GATE;
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold against ${shown}.`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
