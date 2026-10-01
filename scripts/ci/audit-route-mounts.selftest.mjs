#!/usr/bin/env node
/**
 * Self-test for scripts/ci/audit-route-mounts.mjs (ci:audit-route-mounts:*).
 *
 * On the current tree the gate reports 0 errors and 8 baselined warnings, so its
 * failure branch never fires in normal use, and a guard whose failure branch has
 * never been seen has not been tested (CLAUDE.md, working agreement).
 *
 * The defect it exists for is API-09 (docs/audit-2026-07/12-findings-register.md):
 * a second, UNGUARDED `app.get('/api/metrics', ...)` in
 * server/bootstrap/register-platform-routes.ts beside the guarded one in
 * server/startup/inline-endpoints.ts. Express answers with whichever registered
 * first, so moving one startup call flips /api/metrics to the copy without
 * requireMetricsAuth, on a path the auth boundary allowlists. Its second history
 * is the vacuous pass named in the gate's own header: scanning only
 * server/index.ts captured ~1 mount, so the register-*.ts files where routers
 * actually mount were never read.
 *
 * Each case builds a throwaway server/ tree (the gate's five default targets) in
 * a temp directory and runs the gate as a subprocess with that directory as its
 * cwd. The gate resolves its targets, --baseline and --owners against cwd, so the
 * command CI runs is the command under test; no copy of the gate is patched.
 *
 * SELFTEST_GATE_PATH points the cases at a different copy of the gate, so a
 * mutant can be shown to fail them.
 *
 * Not asserted, because the gate does not implement it (observed, not pinned):
 *   - --strict-no-regression fails OPEN when its --baseline cannot be read. A
 *     file that does not exist exits 0 even with errors present (no baseline
 *     means no "new" issues, and errors are not hard-failed in that mode). So
 *     does a file that exists but does not parse, the likelier trigger: a
 *     baseline left with merge-conflict markers (<<<<<<< / >>>>>>>) is
 *     swallowed by readJsonFileIfExists's catch and read as null, and the PR
 *     gate exits 0 with the errors printed and NO "Baseline delta" line (that
 *     line is printed only when a baseline loaded). This is a gate defect to
 *     raise, not behaviour to lock in, so no case pins it as passing.
 *   - If server/bootstrap/ is renamed so register-*.ts matches nothing while the
 *     fixed targets exist, the scan silently shrinks.
 *   - Baseline entries carry no reason, and a stale entry is not reported.
 *   - A mount on an Express instance not named `app` is not captured.
 *
 * Usage: node scripts/ci/audit-route-mounts.selftest.mjs   (exit 0 = every case held)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TAG = '[ci:audit-route-mounts:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.cwd(), process.env.SELFTEST_GATE_PATH)
  : path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit-route-mounts.mjs');

if (!fs.existsSync(GATE)) {
  console.error(`${TAG} gate not found: ${GATE}`);
  process.exit(1);
}

// ── Fixture tree ────────────────────────────────────────────────────────────
// The shape of the real mount sites: index.ts mounts the gateway prefix, the
// startup helpers own the diagnostic endpoints (the GUARDED /api/metrics), and
// two register-*.ts modules mount routers. 6 files, 8 app.* mounts, no issues
// ('/api' is mounted twice, which the gate allowlists as the shared gateway).

const INLINE_ENDPOINTS = `export function mountDiagnosticEndpoints(app) {
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/api/health/full', requireMetricsAuth, async (_req, res) => {
    res.json(await runHealthChecks());
  });
  app.get('/api/metrics', requireMetricsAuth, async (_req, res) => {
    res.type('text/plain').send(await registry.metrics());
  });
}
`;

const PLATFORM_ROUTES = `export async function registerPlatformRoutes(app) {
  app.use('/api/sso', ssoRouter);
  app.get('/api/time', (_req, res) => res.json({ now: Date.now() }));
}
`;

const DOCUMENT_ROUTES = `export async function registerDocumentRoutes(app) {
  app.use('/api/documents', authenticateToken, documentsRouter);
}
`;

const BASE = {
  'server/index.ts': `import express from 'express';
import { applyMiddleware } from './startup/middleware';
import { mountDiagnosticEndpoints } from './startup/inline-endpoints';
import { registerRoutes } from './startup/routes';

const app = express();
app.use('/api', express.json());

async function startServer() {
  applyMiddleware(app);
  mountDiagnosticEndpoints(app);
  await registerRoutes(app);
  app.listen(Number(process.env.PORT) || 5000);
}

startServer();
`,
  'server/startup/middleware.ts': `export function applyMiddleware(app) {
  app.use('/api', authBoundary);
}
`,
  'server/startup/inline-endpoints.ts': INLINE_ENDPOINTS,
  'server/startup/routes.ts': `export async function registerRoutes(app) {
  await registerPlatformRoutes(app);
  await registerDocumentRoutes(app);
}
`,
  'server/bootstrap/register-platform-routes.ts': PLATFORM_ROUTES,
  'server/bootstrap/register-document-routes.ts': DOCUMENT_ROUTES,
};

/** API-09 verbatim in shape: the dead copy, no requireMetricsAuth. */
const PLATFORM_WITH_UNGUARDED_METRICS = `export async function registerPlatformRoutes(app) {
  app.use('/api/sso', ssoRouter);
  app.get('/api/time', (_req, res) => res.json({ now: Date.now() }));
  app.get('/api/metrics', async (_req, res) => {
    res.type('text/plain').send(await registry.metrics());
  });
}
`;

/** API-09's sibling: the dead /api/health/full copy that echoed err.message. */
const OPS_WITH_UNGUARDED_HEALTH = `export async function registerOpsRoutes(app) {
  app.get("/api/health/full", async (_req, res) => {
    try {
      res.json(await runHealthChecks());
    } catch (err) {
      res.status(500).json({ status: 'error', message: err?.message });
    }
  });
}
`;

/** A second, non-gateway prefix mounted twice: a warning, not an error. */
const CMC_TWICE = {
  'server/bootstrap/register-core-routes.ts': `export async function registerCoreRoutes(app) {
  app.use('/api/cmc', authenticateToken, cmcRouter);
}
`,
  'server/bootstrap/register-advanced-platform-routes.ts': `export async function registerAdvancedRoutes(app) {
  app.use('/api/cmc', authenticateToken, cmcAnalyticsRouter);
}
`,
};

/**
 * A different non-gateway prefix mounted twice, and no /api/cmc duplicate: the
 * PR that pays one recorded warning down and adds another. The count is
 * unchanged, so only the per-issue fingerprint can catch it.
 */
const ECTD_TWICE = {
  'server/bootstrap/register-submission-routes.ts': `export async function registerSubmissionRoutes(app) {
  app.use('/api/ectd', authenticateToken, ectdRouter);
}
`,
  'server/bootstrap/register-ectd-routes.ts': `export async function registerEctdRoutes(app) {
  app.use('/api/ectd', authenticateToken, ectdValidationRouter);
}
`,
};

/**
 * API-09 on a destructive method: the guarded DELETE in the document routes, and
 * a second, unguarded copy in another register-*.ts. Whichever registers first
 * answers; if it is this one, anyone can delete a document.
 */
const DOCUMENT_ROUTES_WITH_DELETE = `export async function registerDocumentRoutes(app) {
  app.use('/api/documents', authenticateToken, documentsRouter);
  app.delete('/api/documents/:id', authenticateToken, requireRole('admin'), deleteDocument);
}
`;
const VAULT_WITH_UNGUARDED_DELETE = `export async function registerVaultRoutes(app) {
  app.delete('/api/documents/:id', async (req, res) => {
    await vault.remove(req.params.id);
    res.status(204).end();
  });
}
`;

/** The other two write methods, each mounted twice across register-*.ts files. */
const DOCUMENT_ROUTES_WITH_PUT_PATCH = `export async function registerDocumentRoutes(app) {
  app.use('/api/documents', authenticateToken, documentsRouter);
  app.put('/api/documents/:id', authenticateToken, replaceDocument);
  app.patch('/api/documents/:id/status', authenticateToken, setDocumentStatus);
}
`;
const VAULT_WITH_PUT_PATCH = `export async function registerVaultRoutes(app) {
  app.put('/api/documents/:id', vaultReplace);
  app.patch('/api/documents/:id/status', vaultSetStatus);
}
`;

const SITE = (file, content, needle) => {
  const idx = content.split('\n').findIndex(l => l.includes(needle));
  if (idx < 0) throw new Error(`fixture lacks ${needle} in ${file}`);
  return `${file}:${idx + 1} `;
};

// ── Runner ──────────────────────────────────────────────────────────────────

function materialize(root, overrides = {}) {
  for (const [rel, content] of Object.entries({ ...BASE, ...overrides })) {
    if (content == null) continue;
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function spawnGate(root, args) {
  const res = spawnSync(process.execPath, [GATE, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });
  return { code: res.status ?? 1, out: `${res.stdout ?? ''}\n${res.stderr ?? ''}${res.error ? `\n${res.error}` : ''}` };
}

/** A baseline the way it is really produced: the gate's own --write-baseline. */
function baselineFrom(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-mounts-baseline-'));
  try {
    materialize(root, files);
    spawnGate(root, ['--strict-no-regression', '--baseline', 'baseline.json', '--write-baseline']);
    const file = path.join(root, 'baseline.json');
    if (!fs.existsSync(file)) throw new Error('gate did not write a baseline with --write-baseline');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runCase({ files, args = [], baseline }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-mounts-selftest-'));
  try {
    materialize(root, files);
    if (baseline !== undefined) {
      fs.writeFileSync(path.join(root, 'baseline.json'), JSON.stringify(baseline, null, 2));
    }
    return spawnGate(root, args);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const NO_REGRESSION = ['--strict-no-regression', '--baseline', 'baseline.json'];

// ── Cases ───────────────────────────────────────────────────────────────────

const cases = [
  // The defect shapes.
  {
    name: 'FAILS on API-09 — an unguarded second app.get(/api/metrics) in a register-*.ts beside the guarded one',
    files: { 'server/bootstrap/register-platform-routes.ts': PLATFORM_WITH_UNGUARDED_METRICS },
    expectExit: 1,
    expectIn: [
      'Errors: 1',
      'Duplicate app.get mount for "/api/metrics"',
      SITE('server/startup/inline-endpoints.ts', INLINE_ENDPOINTS, "app.get('/api/metrics'"),
      SITE('server/bootstrap/register-platform-routes.ts', PLATFORM_WITH_UNGUARDED_METRICS, "app.get('/api/metrics'"),
    ],
  },
  {
    name: 'FAILS when the copy lands in a NEW register-*.ts file, in double quotes (the glob is live, not a fixed list)',
    files: { 'server/bootstrap/register-zz-ops-routes.ts': OPS_WITH_UNGUARDED_HEALTH },
    expectExit: 1,
    expectIn: [
      'Duplicate app.get mount for "/api/health/full"',
      SITE('server/bootstrap/register-zz-ops-routes.ts', OPS_WITH_UNGUARDED_HEALTH, '"/api/health/full"'),
    ],
  },
  {
    name: 'FAILS on a router mounted with app.use on the exact path of the guarded handler (shadow risk)',
    files: {
      'server/bootstrap/register-platform-routes.ts': PLATFORM_ROUTES.replace(
        "  app.use('/api/sso', ssoRouter);\n",
        "  app.use('/api/sso', ssoRouter);\n  app.use('/api/metrics', metricsRouter);\n",
      ),
    },
    expectExit: 1,
    expectIn: [
      'Path "/api/metrics" has both app.use and method handlers',
      "server/bootstrap/register-platform-routes.ts:3 app.use('/api/metrics')",
    ],
  },
  {
    name: 'FAILS on API-09 on a destructive method — an unguarded second app.delete(/api/documents/:id) in another register-*.ts',
    files: {
      'server/bootstrap/register-document-routes.ts': DOCUMENT_ROUTES_WITH_DELETE,
      'server/bootstrap/register-vault-routes.ts': VAULT_WITH_UNGUARDED_DELETE,
    },
    expectExit: 1,
    expectIn: [
      // Exactly one: /api/documents/:id is not the app.use('/api/documents') path, so no shadow-risk.
      'Errors: 1',
      'Duplicate app.delete mount for "/api/documents/:id"',
      SITE('server/bootstrap/register-document-routes.ts', DOCUMENT_ROUTES_WITH_DELETE, "app.delete('/api/documents/:id'"),
      SITE('server/bootstrap/register-vault-routes.ts', VAULT_WITH_UNGUARDED_DELETE, "app.delete('/api/documents/:id'"),
    ],
  },
  {
    name: 'FAILS on duplicate app.put and app.patch mounts too (every write method is captured, not only POST)',
    files: {
      'server/bootstrap/register-document-routes.ts': DOCUMENT_ROUTES_WITH_PUT_PATCH,
      'server/bootstrap/register-vault-routes.ts': VAULT_WITH_PUT_PATCH,
    },
    expectExit: 1,
    expectIn: [
      'Errors: 2',
      'Duplicate app.put mount for "/api/documents/:id"',
      'Duplicate app.patch mount for "/api/documents/:id/status"',
      SITE('server/bootstrap/register-vault-routes.ts', VAULT_WITH_PUT_PATCH, "app.put('/api/documents/:id'"),
      SITE('server/bootstrap/register-vault-routes.ts', VAULT_WITH_PUT_PATCH, "app.patch('/api/documents/:id/status'"),
    ],
  },

  // Clean shapes, including near misses a sloppier gate would flag.
  {
    name: 'quiet — the clean tree, and the scan is not vacuous (all 6 files read, all 8 mounts captured)',
    expectExit: 0,
    expectIn: ['Scanned files (6)', 'server/bootstrap/register-platform-routes.ts', 'Total captured mounts: 8', 'Errors: 0', 'Warnings: 0'],
  },
  {
    name: 'quiet — near miss: the same path under two DIFFERENT methods is not a duplicate',
    files: {
      'server/bootstrap/register-document-routes.ts': DOCUMENT_ROUTES.replace(
        '}\n',
        "  app.get('/api/documents/:id/export', authenticateToken, exportDocument);\n}\n",
      ),
      'server/startup/routes.ts': `export async function registerRoutes(app) {
  await registerPlatformRoutes(app);
  await registerDocumentRoutes(app);
  app.post('/api/documents/:id/export', authenticateToken, queueExport);
}
`,
    },
    expectExit: 0,
    expectIn: ['Total captured mounts: 10', 'Errors: 0', 'Warnings: 0'],
  },
  {
    name: 'quiet — near miss: /api/metrics and /api/metrics/detail share a prefix, not a path',
    files: {
      'server/bootstrap/register-platform-routes.ts': PLATFORM_ROUTES.replace(
        '}\n',
        "  app.get('/api/metrics/detail', requireMetricsAuth, metricsDetail);\n}\n",
      ),
    },
    expectExit: 0,
    expectIn: ['Total captured mounts: 9', 'Errors: 0', 'Warnings: 0'],
  },
  {
    name: 'quiet — near miss: two routers both declaring router.get(/status) are not app mounts',
    files: {
      'server/bootstrap/register-platform-routes.ts': `${PLATFORM_ROUTES}ssoRouter.get('/status', ssoStatus);\nrouter.get('/status', platformStatus);\n`,
      'server/bootstrap/register-document-routes.ts': `${DOCUMENT_ROUTES}router.get('/status', documentStatus);\n`,
    },
    expectExit: 0,
    expectIn: ['Total captured mounts: 8', 'Errors: 0'],
  },
  {
    name: 'quiet — the shared /api gateway prefix mounted by a third module is allowlisted',
    files: {
      'server/bootstrap/register-document-routes.ts': `${DOCUMENT_ROUTES}export function gate(app) {\n  app.use('/api', entitlementGate);\n}\n`,
    },
    expectExit: 0,
    expectIn: ['Total captured mounts: 9', 'Errors: 0', 'Warnings: 0'],
  },
  {
    name: 'warns, does not fail — a legacy allowlisted shadow path (/api/projects use + get)',
    files: {
      'server/bootstrap/register-project-routes.ts': `export async function registerProjectRoutes(app) {
  app.get('/api/projects', authenticateToken, listProjects);
  app.use('/api/projects', authenticateToken, projectsRouter);
}
`,
    },
    expectExit: 0,
    expectIn: ['Errors: 0', 'Warnings: 1', 'Path "/api/projects" has both app.use and method handlers'],
  },
  {
    name: 'warns, does not fail — a non-gateway prefix mounted twice (/api/cmc), named with both sites',
    files: CMC_TWICE,
    expectExit: 0,
    expectIn: [
      'Warnings: 1',
      'Prefix "/api/cmc" mounted via app.use 2 times',
      "server/bootstrap/register-advanced-platform-routes.ts:2 app.use('/api/cmc')",
      "server/bootstrap/register-core-routes.ts:2 app.use('/api/cmc')",
    ],
  },

  // full-strict (--max-warnings): the nightly debt ceiling.
  {
    name: 'full-strict FAILS when warnings exceed --max-warnings',
    files: CMC_TWICE,
    args: ['--max-warnings', '0'],
    expectExit: 1,
    expectIn: ['Route mount warning limit exceeded: 1 > 0'],
  },
  {
    name: 'full-strict passes at the ceiling',
    files: CMC_TWICE,
    args: ['--max-warnings', '1'],
    expectExit: 0,
    expectIn: ['Warnings: 1'],
  },
  {
    name: 'plain mode ignores the baseline: a recorded duplicate still FAILS',
    files: { 'server/bootstrap/register-platform-routes.ts': PLATFORM_WITH_UNGUARDED_METRICS },
    baseline: () => baselineFrom({ 'server/bootstrap/register-platform-routes.ts': PLATFORM_WITH_UNGUARDED_METRICS }),
    args: ['--baseline', 'baseline.json'],
    expectExit: 1,
    expectIn: ['Duplicate app.get mount for "/api/metrics"'],
  },

  // --strict-no-regression (the PR gate): baseline semantics.
  {
    name: 'no-regression FAILS on API-09 against a clean baseline, and names the site',
    files: { 'server/bootstrap/register-platform-routes.ts': PLATFORM_WITH_UNGUARDED_METRICS },
    baseline: () => baselineFrom({}),
    args: NO_REGRESSION,
    expectExit: 1,
    expectIn: [
      'Route mount regression detected',
      '1 new errors',
      SITE('server/bootstrap/register-platform-routes.ts', PLATFORM_WITH_UNGUARDED_METRICS, "app.get('/api/metrics'"),
    ],
  },
  {
    name: 'no-regression: a duplicate recorded by --write-baseline is suppressed (the written entry round-trips)',
    files: { 'server/bootstrap/register-platform-routes.ts': PLATFORM_WITH_UNGUARDED_METRICS },
    baseline: () => baselineFrom({ 'server/bootstrap/register-platform-routes.ts': PLATFORM_WITH_UNGUARDED_METRICS }),
    args: NO_REGRESSION,
    expectExit: 0,
    expectIn: ['Errors: 1', 'Baseline delta: +0 new errors, +0 new warnings'],
  },
  {
    name: 'no-regression FAILS on a second duplicate the baseline does not record',
    files: {
      'server/bootstrap/register-platform-routes.ts': PLATFORM_WITH_UNGUARDED_METRICS,
      'server/bootstrap/register-zz-ops-routes.ts': OPS_WITH_UNGUARDED_HEALTH,
    },
    baseline: () => baselineFrom({ 'server/bootstrap/register-platform-routes.ts': PLATFORM_WITH_UNGUARDED_METRICS }),
    args: NO_REGRESSION,
    expectExit: 1,
    expectIn: ['Route mount regression detected', '1 new errors', 'Duplicate app.get mount for "/api/health/full"'],
  },
  {
    name: 'no-regression FAILS on a new warning the baseline does not record',
    files: CMC_TWICE,
    baseline: () => baselineFrom({}),
    args: NO_REGRESSION,
    expectExit: 1,
    expectIn: ['Route mount regression detected', '0 new errors, 1 new warnings'],
  },
  {
    name: 'no-regression passes when the warning is recorded',
    files: CMC_TWICE,
    baseline: () => baselineFrom(CMC_TWICE),
    args: NO_REGRESSION,
    expectExit: 0,
    expectIn: ['Warnings: 1', 'Baseline delta: +0 new errors, +0 new warnings'],
  },
  // The real baseline holds 8 multi-use-prefix warnings. A PR that removes one
  // and adds another keeps the count at 8, so the count check passes it and
  // only the per-issue fingerprint (type + path) can fail it. The case above
  // that goes 0 -> 1 warning never isolates that: the count alone decides it.
  {
    name: 'no-regression FAILS on a warning SWAP — /api/cmc paid down, /api/ectd added, count unchanged at 1',
    files: ECTD_TWICE,
    baseline: () => baselineFrom(CMC_TWICE),
    args: NO_REGRESSION,
    expectExit: 1,
    expectIn: [
      'Warnings: 1',
      'Prefix "/api/ectd" mounted via app.use 2 times',
      'Baseline delta: +0 new errors, +1 new warnings',
      'Route mount regression detected',
      // The count is not what fails it: 1 is not above the baseline's 1.
      '1 warnings (baseline 1), 0 new errors, 1 new warnings',
    ],
  },
  // And the converse: the baseline's warning COUNT is a ceiling of its own. A
  // count ratcheted down by hand fails the PR gate even though every current
  // warning is recorded in issues, so the fingerprint check cannot be what fails it.
  {
    name: 'no-regression FAILS when warnings exceed the baseline count, even with every warning recorded',
    files: CMC_TWICE,
    baseline: () => ({ ...baselineFrom(CMC_TWICE), warnings: 0 }),
    args: NO_REGRESSION,
    expectExit: 1,
    expectIn: [
      'Baseline delta: +0 new errors, +0 new warnings',
      'Route mount regression detected',
      '1 warnings (baseline 0), 0 new errors, 0 new warnings',
    ],
  },

  // Fail closed rather than scan less.
  {
    name: 'FAILS closed when a default mount site is missing (a moved file cannot shrink the scan)',
    files: { 'server/startup/routes.ts': null },
    expectExit: 1,
    expectIn: ['Missing route mount target: server/startup/routes.ts'],
  },
  {
    name: 'FAILS closed when --target matches no file (0 mounts is not a pass)',
    args: ['--target', 'server/routers/register-*.ts'],
    expectExit: 1,
    expectIn: ['No route mount targets matched: server/routers/register-*.ts'],
  },
];

// ── Run ─────────────────────────────────────────────────────────────────────

const started = Date.now();
let failed = 0;
for (const c of cases) {
  let result;
  try {
    const baseline = typeof c.baseline === 'function' ? c.baseline() : c.baseline;
    result = runCase({ files: c.files, args: c.args, baseline });
  } catch (err) {
    result = { code: 'threw', out: String(err?.stack ?? err) };
  }
  const { code, out } = result;
  const missing = c.expectIn.filter(s => !out.includes(s));
  const ok = code === c.expectExit && missing.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  if (!ok) {
    failed++;
    if (code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${code}`);
    for (const s of missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
    console.log(out.trimEnd().split('\n').map(l => `      | ${l}`).join('\n'));
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} cases did not hold (gate: ${GATE}).`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch. (${secs}s)`);
