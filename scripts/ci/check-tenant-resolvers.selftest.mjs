#!/usr/bin/env node
/**
 * Self-test for scripts/ci/check-tenant-resolvers.mjs (ci:tenant-resolvers).
 *
 * The gate reports OK on the current tree — every local resolver is baselined —
 * so in normal use its failure branch never fires, and a guard whose failure
 * branch has never been seen has not been tested (CLAUDE.md, working agreement:
 * "verify by making the check fail").
 *
 * Each case builds a throwaway git repository in a temp directory (the gate
 * enumerates files with `git ls-files`, so the fixture files are staged, never
 * committed), writes a copy of the REAL gate whose `repoRoot` and `baselinePath`
 * constants point at that tree, and runs it as a subprocess — so what is tested
 * is the gate CI runs, not a re-implementation of it. If either constant cannot
 * be patched, the selftest refuses to run rather than letting the copy scan the
 * real repository.
 *
 * The failing fixtures are the shapes the gate's header and ledger L58 name,
 * copied from the files where they live today:
 *   - the 35-file majority copy of `resolveOrgId` — `tenantId ?? organizationId
 *     ?? user.organizationId`, the canonical order reversed (server/routes/rim.ts);
 *   - "the next one will be called something else": `const getOrgId = (req) =>`
 *     reading `(req as any).organizationId` (server/routes/account-intelligence.ts);
 *   - the cast-and-branch `getOrganizationId` (server/routes/ai-actions.ts);
 *   - the middleware `resolveOrganizationId` (server/middleware/storageQuotaGuard.ts);
 *   - the `resolvedOrganizationId`-first loop (server/services/entitlements/
 *     require-entitlement.ts), three directories deep;
 *   - a wrapper that calls the shared getSecureOrgId AND falls back to a raw
 *     `req.tenantId` — a second precedence order hidden behind a delegating call,
 *     which the gate's delegate exemption must not swallow;
 *   - a resolver at a path that merely RESEMBLES the canonical home — the
 *     exemption is the exact path server/types/auth-request.ts, nothing else.
 *
 * The clean fixtures, including the near-miss that the gate's own history fixed:
 *   - routes that import resolveOrgId / resolveUserId from the canonical home;
 *   - the canonical home itself, which reads the raw fields by design;
 *   - NEAR-MISS: server/routes/cmc-module3-board.routes.ts's `resolveTenantId`,
 *     a wrapper that delegates to getSecureOrgId and names a LOCAL `tenantId` —
 *     three such wrappers were once counted because a gate matching the word
 *     `tenantId` cannot tell it from a read of `req.tenantId`;
 *   - server/routes/regulatorySubmissions.ts's `getTenantContext`, which
 *     delegates the org and reads only the user id off the request;
 *   - a resolver-NAMED function whose organizationId is a parameter, not a
 *     request field (server/auth.ts's `getUserRole(userId, organizationId)`);
 *   - test files and declaration files, which the gate scopes out.
 *
 * Baseline semantics asserted: a baselined module suppresses; a baseline entry
 * for one module does not suppress a new resolver in another; a baselined module
 * that no longer defines one is reported for regeneration (exit 0 — the ratchet
 * notice, not a failure); --write-baseline lists exactly the modules found,
 * sorted, drops a stale entry, and the gate then passes on what it wrote.
 *
 * KNOWN GAPS in the gate (each reproduced by hand against this harness on
 * 2026-10-01; reported, deliberately NOT encoded as passing cases, because a
 * case that expects a defect to pass would pin the defect):
 *   - The file list is `git ls-files -- 'server/**' + '/*.ts'` (split here only
 *     to keep this comment open), a plain pathspec in which `*` also matches
 *     `/`, so it needs at least one directory below server/: the top-level
 *     server/*.ts files (28 on 2026-10-01 — server/auth.ts,
 *     server/socketServer.ts, ...) are never scanned, and the majority copy at
 *     server/new-entry.ts passes.
 *   - The header says the gate matches "on the field reads rather than on the
 *     function name", but a line is only examined when it declares
 *     `function|const (resolve|get)(Org|Organization|Tenant|User)…`. The majority
 *     copy named `callerOrg`, `requireTenantId` or `orgIdFrom`, or written as a
 *     class method (`private resolveOrgId(req) {`), passes.
 *   - The baseline is per MODULE, so a second resolver with a different
 *     precedence order added to any already-baselined file passes.
 *   - "Adding an entry by hand is a regression" is policy only: a hand-added
 *     module suppresses exactly like a generated one, and `count` is never
 *     compared with `modules`.
 *   - The body is the 16 lines from the declaration: a resolver whose first raw
 *     read sits on line 17 or later is not counted.
 *
 * Usage:
 *   node scripts/ci/check-tenant-resolvers.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-tenant-resolvers.selftest.mjs
 *     (run the cases against a different copy of the gate — the mutation check)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:tenant-resolvers:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-tenant-resolvers.mjs');

/**
 * Inherited GIT_* variables would point the fixture's `git` at the real
 * repository — and inside a husky pre-push hook, GIT_DIR is set. Strip them.
 */
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-resolvers-selftest-'));

function git(cwd, args) {
  const res = spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed in fixture: ${res.stderr}`);
}

/** The real gate, with its two path constants pointed at the fixture tree. */
function patchedGate(root, baselinePath) {
  const src = fs.readFileSync(GATE, 'utf8');
  let patchedRoot = 0;
  let patchedBaseline = 0;
  const out = src
    .replace(/const repoRoot = [^;]+;/, () => {
      patchedRoot++;
      return `const repoRoot = ${JSON.stringify(root)};`;
    })
    .replace(/const baselinePath = [^;]+;/, () => {
      patchedBaseline++;
      return `const baselinePath = ${JSON.stringify(baselinePath)};`;
    });
  if (patchedRoot !== 1 || patchedBaseline !== 1) {
    // An unpatched copy would scan the REAL tree and report its verdict as the
    // fixture's. Refuse instead.
    throw new Error(
      `${TAG} could not point ${GATE} at the fixture (repoRoot patched ${patchedRoot}x, baselinePath ${patchedBaseline}x)`,
    );
  }
  return out;
}

let fixtureSeq = 0;

/** Build a fixture repo: files staged, baseline written, patched gate beside it. */
function buildTree(files, baselineModules) {
  const root = path.join(scratch, `tree-${++fixtureSeq}`);
  fs.mkdirSync(root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  const baselinePath = path.join(root, 'scripts', 'ci', 'tenant-resolvers-baseline.json');
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify({ count: baselineModules.length, modules: baselineModules }, null, 2)}\n`,
  );
  git(root, ['-c', 'init.defaultBranch=main', 'init', '-q']);
  git(root, ['add', '-A', '--', 'server']);
  // The gate copy lives OUTSIDE the fixture repo so it is never itself staged.
  const gatePath = path.join(scratch, `gate-${fixtureSeq}.mjs`);
  fs.writeFileSync(gatePath, patchedGate(root, baselinePath));
  return { root, baselinePath, gatePath };
}

function runGate(gatePath, args = []) {
  const res = spawnSync(process.execPath, [gatePath, ...args], { env: ENV, encoding: 'utf8' });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

// ── Fixtures: the defect shapes, as they are written in the tree today ───────

const IMPORTS = `import { Router, type Request, type Response } from 'express';\n\nconst router = Router();\n`;

/** The 35-file majority copy (server/routes/rim.ts): the canonical order, reversed. */
const MAJORITY_COPY = `${IMPORTS}
function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

router.get('/products', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (orgId == null) return res.status(403).json({ error: 'Organization context required' });
  res.json(await listProducts(orgId, resolveUserId(req)));
});

export default router;
`;

/** server/routes/account-intelligence.ts — an arrow const called getOrgId. */
const ARROW_GET_ORG_ID = `${IMPORTS}
const getOrgId = (req: Request): number => {
  const orgId = (req as any).organizationId;
  if (!orgId || typeof orgId !== 'number') {
    const err = new Error('Organization ID not available from authenticated session');
    (err as any).statusCode = 403;
    throw err;
  }
  return orgId;
};

router.get('/canon', async (req: Request, res: Response) => {
  res.json(await listCanon(getOrgId(req)));
});

export default router;
`;

/** server/routes/ai-actions.ts — cast-and-branch, tenantContext first. */
const CAST_AND_BRANCH = `${IMPORTS}
function getOrganizationId(req: Request): number {
  if ((req as any).tenantContext?.organizationId) {
    const orgId = typeof (req as any).tenantContext.organizationId === 'number'
      ? (req as any).tenantContext.organizationId
      : parseInt((req as any).tenantContext.organizationId as string, 10);
    if (!isNaN(orgId)) return orgId;
  }
  if ((req as any).organizationId) {
    return typeof (req as any).organizationId === 'number'
      ? (req as any).organizationId
      : parseInt((req as any).organizationId as string, 10);
  }
  throw new Error('Organization context required');
}

router.post('/execute', async (req: Request, res: Response) => {
  res.json(await execute(getOrganizationId(req), req.body));
});

export default router;
`;

/** server/middleware/storageQuotaGuard.ts — JWT user first, API key, tenantContext last. */
const MIDDLEWARE_RESOLVER = `import type { NextFunction, Request, Response } from 'express';

function resolveOrganizationId(req: Request): number | null {
  const raw =
    req.user?.organizationId ??
    (req as Request & { apiOrganizationId?: number }).apiOrganizationId ??
    req.tenantContext?.organizationId;
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function quotaGuard(req: Request, res: Response, next: NextFunction) {
  const orgId = resolveOrganizationId(req);
  if (orgId == null) return res.status(403).json({ error: 'Organization context required' });
  next();
}
`;

/** server/services/entitlements/require-entitlement.ts — resolvedOrganizationId first. */
const RESOLVED_ORG_LOOP = `import type { Request } from 'express';

function resolveOrgId(req: Request): number | null {
  const r = req as unknown as {
    resolvedOrganizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
    tenantId?: unknown;
  };
  for (const candidate of [
    r.resolvedOrganizationId,
    r.tenantContext?.organizationId,
    r.user?.organizationId,
    r.tenantId,
  ]) {
    const n = Number(candidate);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

export function requireEntitlement(feature: string) {
  return (req: Request) => checkEntitlement(resolveOrgId(req), feature);
}
`;

/**
 * Delegates to the shared resolver — and then falls back to a raw read. That is
 * a second precedence order (JWT, then req.tenantId) wearing the shape of reuse.
 */
const DELEGATE_WITH_RAW_FALLBACK = `${IMPORTS}import { getSecureOrgId } from '../utils/tenantContext';

/** Resolve the JWT-derived org id, falling back to the tenant scope. */
function resolveTenantId(req: Request): number | null {
  const orgId = getSecureOrgId(req) ?? (req as any).tenantId;
  const tenantId = orgId == null ? NaN : Number(orgId);
  return Number.isFinite(tenantId) ? tenantId : null;
}

router.get('/board', async (req: Request, res: Response) => {
  res.json(await loadBoard(resolveTenantId(req)));
});

export default router;
`;

/** The canonical resolver, verbatim in shape (server/types/auth-request.ts). */
const CANONICAL_HOME = `import type { Request } from 'express';

export interface RequestWithAuthContext extends Request {
  organizationId?: number | string;
  tenantId?: number | string;
  tenantContext?: { organizationId?: number | string };
}

export function resolveOrgId(req: Request): number | null {
  const authReq = req as RequestWithAuthContext;
  const v =
    authReq.organizationId ??
    authReq.tenantContext?.organizationId ??
    authReq.user?.organizationId ??
    authReq.tenantId;
  if (v === undefined || v === null) return null;
  const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveUserId(req: Request): number | null {
  const raw = (req as RequestWithAuthContext).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
`;

/** The fix the gate asks for: import from the canonical home. */
const USES_CANONICAL = `${IMPORTS}import { resolveOrgId, resolveUserId } from '../types/auth-request';

router.get('/products', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (orgId == null) return res.status(403).json({ error: 'Organization context required' });
  const tenantId = orgId;
  res.json(await listProducts(tenantId, resolveUserId(req), req.query.status));
});

export default router;
`;

/** NEAR-MISS, verbatim from server/routes/cmc-module3-board.routes.ts. */
const DELEGATING_WRAPPER_LOCAL_TENANT_ID = `${IMPORTS}import { getSecureOrgId } from '../utils/tenantContext';

/** Resolve the JWT-derived org id as the integer tenant_id / organization_id, or null. */
function resolveTenantId(req: Request): number | null {
  const orgId = getSecureOrgId(req);
  const tenantId = orgId == null ? NaN : Number(orgId);
  return Number.isFinite(tenantId) ? tenantId : null;
}

router.get('/board', async (req: Request, res: Response) => {
  res.json(await loadBoard(resolveTenantId(req)));
});

export default router;
`;

/** NEAR-MISS, from server/routes/regulatorySubmissions.ts: delegates the org, reads only the user id. */
const DELEGATING_CONTEXT_READS_USER_ID = `${IMPORTS}import { getSecureOrgId } from '../utils/tenantContext';

async function getTenantContext(req: Request, res: Response) {
  const orgRaw = getSecureOrgId(req as any);
  const organizationId = orgRaw ? Number(orgRaw) : NaN;
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    res.status(401).json({ error: 'Organization context required' });
    return null;
  }
  const userIdRaw = (req as any).userId ?? (req as any).user?.id ?? 0;
  const userId = Number.isFinite(Number(userIdRaw)) ? Number(userIdRaw) : 0;
  return { organizationId, userId };
}

export default router;
`;

/** NEAR-MISS, the server/auth.ts shape: resolver-named, but the org id is a parameter. */
const ORG_ID_AS_PARAMETER = `import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { memberships } from '../../shared/schema';

/** The member's role within an already-resolved organization. */
export async function getUserRole(userId: number, organizationId: number): Promise<string> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)));
  return row?.role ?? 'viewer';
}
`;

// ── Cases ─────────────────────────────────────────────────────────────────────

const FAIL_HEAD = 'FAIL: 1 new local tenant resolver(s)';

const cases = [
  {
    name: 'FAILS on the 35-file majority copy — the canonical order reversed, in a new route',
    files: { 'server/routes/new-governed-module.ts': MAJORITY_COPY },
    expectExit: 1,
    expectIn: [FAIL_HEAD, '  - server/routes/new-governed-module.ts', 'Local tenant resolvers: 1 (baseline 0)'],
  },
  {
    name: 'FAILS on an arrow const named getOrgId reading (req as any).organizationId',
    files: { 'server/routes/new-intelligence.ts': ARROW_GET_ORG_ID },
    expectExit: 1,
    expectIn: [FAIL_HEAD, '  - server/routes/new-intelligence.ts'],
  },
  {
    name: 'FAILS on the cast-and-branch getOrganizationId, tenantContext first',
    files: { 'server/routes/new-ai-actions.ts': CAST_AND_BRANCH },
    expectExit: 1,
    expectIn: [FAIL_HEAD, '  - server/routes/new-ai-actions.ts'],
  },
  {
    name: 'FAILS on a middleware resolveOrganizationId (req.user?.organizationId first)',
    files: { 'server/middleware/new-quota-guard.ts': MIDDLEWARE_RESOLVER },
    expectExit: 1,
    expectIn: [FAIL_HEAD, '  - server/middleware/new-quota-guard.ts'],
  },
  {
    name: 'FAILS on the resolvedOrganizationId-first loop three directories deep',
    files: { 'server/services/entitlements/new-gate.ts': RESOLVED_ORG_LOOP },
    expectExit: 1,
    expectIn: [FAIL_HEAD, '  - server/services/entitlements/new-gate.ts'],
  },
  {
    name: 'FAILS on a getSecureOrgId wrapper that falls back to a raw req.tenantId (exemption must not swallow it)',
    files: { 'server/routes/new-board.routes.ts': DELEGATE_WITH_RAW_FALLBACK },
    expectExit: 1,
    expectIn: [FAIL_HEAD, '  - server/routes/new-board.routes.ts'],
  },
  {
    name: 'FAILS on a resolver at a path that only resembles the canonical home',
    files: {
      'server/types/auth-request-legacy.ts': CANONICAL_HOME,
      'server/routes/types/auth-request.ts': CANONICAL_HOME,
    },
    expectExit: 1,
    expectIn: [
      'FAIL: 2 new local tenant resolver(s)',
      '  - server/routes/types/auth-request.ts',
      '  - server/types/auth-request-legacy.ts',
    ],
  },
  {
    name: 'quiet — the canonical home defines it, and routes import it',
    files: {
      'server/types/auth-request.ts': CANONICAL_HOME,
      'server/routes/products.ts': USES_CANONICAL,
    },
    expectExit: 0,
    expectIn: ['Local tenant resolvers: 0 (baseline 0)', 'OK: no new local tenant resolvers.'],
  },
  {
    name: 'quiet — NEAR-MISS: a getSecureOrgId wrapper naming a LOCAL tenantId (cmc-module3-board)',
    files: { 'server/routes/cmc-module3-board.routes.ts': DELEGATING_WRAPPER_LOCAL_TENANT_ID },
    expectExit: 0,
    expectIn: ['Local tenant resolvers: 0 (baseline 0)', 'OK: no new local tenant resolvers.'],
  },
  {
    name: 'quiet — NEAR-MISS: getTenantContext delegates the org and reads only the user id (regulatorySubmissions)',
    files: { 'server/routes/regulatorySubmissions.ts': DELEGATING_CONTEXT_READS_USER_ID },
    expectExit: 0,
    expectIn: ['Local tenant resolvers: 0 (baseline 0)', 'OK: no new local tenant resolvers.'],
  },
  {
    name: 'quiet — NEAR-MISS: getUserRole(userId, organizationId) takes the org as a parameter',
    files: { 'server/services/membership-roles.ts': ORG_ID_AS_PARAMETER },
    expectExit: 0,
    expectIn: ['Local tenant resolvers: 0 (baseline 0)', 'OK: no new local tenant resolvers.'],
  },
  {
    name: 'quiet — test files and declaration files are out of scope',
    files: {
      'server/routes/__tests__/rim-harness.ts': MAJORITY_COPY,
      'server/routes/rim.test.ts': MAJORITY_COPY,
      'server/types/express-augment.d.ts': MAJORITY_COPY,
    },
    expectExit: 0,
    expectIn: ['Local tenant resolvers: 0 (baseline 0)', 'OK: no new local tenant resolvers.'],
  },
  {
    name: 'quiet — a baselined module stays baselined',
    files: { 'server/routes/rim.ts': MAJORITY_COPY },
    baseline: ['server/routes/rim.ts'],
    expectExit: 0,
    expectIn: ['Local tenant resolvers: 1 (baseline 1)', 'OK: no new local tenant resolvers.'],
    expectNotIn: ['no longer define one'],
  },
  {
    name: 'FAILS — a baseline entry for one module does not suppress a new one in another',
    files: {
      'server/routes/rim.ts': MAJORITY_COPY,
      'server/routes/new-governed-module.ts': MAJORITY_COPY,
    },
    baseline: ['server/routes/rim.ts'],
    expectExit: 1,
    expectIn: [FAIL_HEAD, '  - server/routes/new-governed-module.ts', 'Local tenant resolvers: 2 (baseline 1)'],
    expectNotIn: ['  - server/routes/rim.ts'],
  },
  {
    name: 'reports (exit 0) a baselined module that was re-pointed at the canonical resolver',
    files: {
      'server/types/auth-request.ts': CANONICAL_HOME,
      'server/routes/rim.ts': USES_CANONICAL,
    },
    baseline: ['server/routes/rim.ts'],
    expectExit: 0,
    expectIn: [
      '1 baselined module(s) no longer define one — regenerate the baseline:',
      '  - server/routes/rim.ts',
      'OK: no new local tenant resolvers.',
    ],
  },
  {
    name: '--write-baseline lists exactly the modules found, sorted, drops a stale entry, and then passes',
    files: {
      'server/types/auth-request.ts': CANONICAL_HOME,
      'server/routes/rim.ts': MAJORITY_COPY,
      'server/middleware/new-quota-guard.ts': MIDDLEWARE_RESOLVER,
      'server/routes/cmc-module3-board.routes.ts': DELEGATING_WRAPPER_LOCAL_TENANT_ID,
      'server/routes/products.ts': USES_CANONICAL,
    },
    baseline: ['server/routes/long-gone.ts'],
    args: ['--write-baseline'],
    expectExit: 0,
    expectIn: ['Wrote 2 local tenant resolver(s)'],
    then: ({ baselinePath, gatePath }) => {
      const problems = [];
      const written = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const want = ['server/middleware/new-quota-guard.ts', 'server/routes/rim.ts'];
      if (JSON.stringify(written.modules) !== JSON.stringify(want)) {
        problems.push(`baseline modules ${JSON.stringify(written.modules)}, expected ${JSON.stringify(want)}`);
      }
      if (written.count !== want.length) problems.push(`baseline count ${written.count}, expected ${want.length}`);
      const again = runGate(gatePath);
      if (again.code !== 0 || !again.out.includes('Local tenant resolvers: 2 (baseline 2)')) {
        problems.push(`gate on the regenerated baseline: exit ${again.code}\n${again.out}`);
      }
      return problems;
    },
  },
];

let failed = 0;
try {
  for (const c of cases) {
    const { baselinePath, gatePath } = buildTree(c.files, c.baseline ?? []);
    const { code, out } = runGate(gatePath, c.args ?? []);
    const problems = [];
    if (code !== c.expectExit) problems.push(`expected exit ${c.expectExit}, got ${code}`);
    for (const s of c.expectIn) if (!out.includes(s)) problems.push(`output lacked: ${JSON.stringify(s)}`);
    for (const s of c.expectNotIn ?? []) if (out.includes(s)) problems.push(`output had: ${JSON.stringify(s)}`);
    if (problems.length === 0 && c.then) problems.push(...c.then({ baselinePath, gatePath }));
    console.log(`  ${problems.length === 0 ? '✓' : '✗'} ${c.name}`);
    if (problems.length > 0) {
      failed++;
      for (const p of problems) console.log(`      ${p}`);
      console.log(out.split('\n').map(l => `      | ${l}`).join('\n'));
    }
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold against ${path.relative(repoRoot, GATE) || GATE}`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
