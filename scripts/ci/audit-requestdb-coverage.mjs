#!/usr/bin/env node
/**
 * CI Guard: request-scoped DB adoption (RLS readiness).
 *
 * Multi-tenant isolation relies on Postgres Row-Level Security. RLS only
 * filters on a connection that has the tenant session vars set, and those
 * are only set on the request-scoped client exposed by `requestDb(req)`
 * (see server/db/requestDb.ts + server/middleware/lazyRequestDbClient.ts).
 *
 * A route handler that queries through the shared pool-bound `db` / `getDb()`
 * runs on a random idle connection with NO tenant context, so once
 * RLS_ENFORCE=on those queries either return zero rows (tenant tables) or —
 * worse, pre-enforcement — read across tenants. Every tenant-facing route
 * must move from `db` to `requestDb(req)` before the enforcement flip.
 *
 * This gate measures that migration and ratchets it: it fails when a NEW
 * route file reaches for the shared pool, so new code is forced onto the
 * request-scoped client while the existing backlog is tracked and can only
 * shrink. It does NOT (yet) fail on the existing backlog — that's the
 * baseline.
 *
 * What counts as "on the shared pool" (backlog) for a file under
 * server/routes:
 *   - imports the `db` binding from a db module (`import { db } from '../db'`),
 *     or
 *   - calls `getDb(` or `getPool(`.
 * A file that uses `requestDb(` is request-scoped. A file may appear in both
 * sets mid-migration; it leaves the backlog only when the shared-pool import
 * is gone.
 *
 * Allowlist: routes that legitimately run cross-tenant or before tenant
 * resolution (auth/login, admin tooling, Stripe webhooks). Kept in lock-step
 * with the RLS allowlist intent (server/db/rlsAllowlist.ts).
 *
 * Usage:
 *   node scripts/ci/audit-requestdb-coverage.mjs                  # report
 *   node scripts/ci/audit-requestdb-coverage.mjs --json
 *   node scripts/ci/audit-requestdb-coverage.mjs --write-baseline
 *   node scripts/ci/audit-requestdb-coverage.mjs --strict-no-regression
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const args = process.argv.slice(2);
const stdoutJson = args.includes('--json');
const writeBaseline = args.includes('--write-baseline');
const strictNoRegression = args.includes('--strict-no-regression');
const baselinePath = path.join(repoRoot, 'docs', 'reports', 'requestdb-coverage-baseline.json');

// ─── Allowlist ──────────────────────────────────────────────────────────────
// Routes that legitimately touch the shared pool: pre-tenant-resolution auth
// (the user row IS the tenant key), cross-tenant admin tooling, and webhook
// handlers that arrive without a tenant context. Mirrors the intent of
// server/db/rlsAllowlist.ts.
const ALLOWLIST_FILES = new Set([
  'server/routes/auth.ts',
  'server/routes/authEnterprise.ts',
  'server/routes/admin.ts',
  // First-run install setup: runs before any tenant/org exists, so it cannot
  // use the tenant-scoped requestDb. Self-closing once a user exists.
  'server/routes/setup.ts',
]);

const ROUTES_DIR = path.join(repoRoot, 'server', 'routes');

// ─── Detection ───────────────────────────────────────────────────────────────
// Shared pool-bound `db` import: `import { db } from '../db'` /'../../db'
// /'../db/runtime'`, including multi-binding forms like `{ db, pool }`.
const SHARED_DB_IMPORT_RE =
  /import\s*\{[^}]*\bdb\b[^}]*\}\s*from\s*['"](?:\.\.\/)+db(?:\/runtime)?['"]/;
const GETDB_RE = /\b(?:getDb|getPool)\s*\(/;
const REQUESTDB_RE = /\brequestDb\s*\(/;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...walk(full));
    } else if (entry.isFile() && full.endsWith('.ts')) {
      if (full.endsWith('.test.ts') || full.endsWith('.spec.ts') || full.endsWith('.d.ts')) {
        continue;
      }
      out.push(full);
    }
  }
  return out;
}

const onSharedPool = [];
const usingRequestDb = [];
let routeFilesTouchingDb = 0;

for (const file of walk(ROUTES_DIR)) {
  const rel = path.relative(repoRoot, file).replaceAll(path.sep, '/');
  const text = fs.readFileSync(file, 'utf8');

  const usesRequestDb = REQUESTDB_RE.test(text);
  const usesSharedPool = SHARED_DB_IMPORT_RE.test(text) || GETDB_RE.test(text);

  if (usesRequestDb) usingRequestDb.push(rel);
  if (usesRequestDb || usesSharedPool) routeFilesTouchingDb += 1;

  if (usesSharedPool && !ALLOWLIST_FILES.has(rel)) {
    onSharedPool.push(rel);
  }
}

onSharedPool.sort();
usingRequestDb.sort();

const summary = {
  generatedAt: new Date().toISOString(),
  routeFilesTouchingDb,
  usingRequestDb: usingRequestDb.length,
  onSharedPool: onSharedPool.length,
};

// ─── Output ────────────────────────────────────────────────────────────────
if (stdoutJson) {
  process.stdout.write(JSON.stringify({ summary, onSharedPool, usingRequestDb }, null, 2) + '\n');
} else {
  console.log('[ci:requestdb-coverage] RLS request-scoped DB adoption');
  console.log(`  route files touching the DB : ${routeFilesTouchingDb}`);
  console.log(`  using requestDb(req)        : ${usingRequestDb.length}`);
  console.log(`  still on the shared pool    : ${onSharedPool.length} (migration backlog)`);
}

// ─── Baseline + no-regression ────────────────────────────────────────────────
if (writeBaseline) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  const baseline = {
    generatedAt: summary.generatedAt,
    onSharedPool: onSharedPool.slice().sort(),
  };
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
    `[ci:requestdb-coverage] baseline written to ${path.relative(repoRoot, baselinePath)} ` +
      `(${baseline.onSharedPool.length} files on the shared pool)`
  );
  process.exit(0);
}

if (strictNoRegression) {
  if (!fs.existsSync(baselinePath)) {
    console.error(
      `[ci:requestdb-coverage] FAIL — baseline not found at ${path.relative(repoRoot, baselinePath)}. ` +
        'Run with --write-baseline first.'
    );
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const baselineSet = new Set(baseline.onSharedPool);
  const currentSet = new Set(onSharedPool);

  const newOffenders = [...currentSet].filter(f => !baselineSet.has(f));
  const resolved = [...baselineSet].filter(f => !currentSet.has(f));

  if (resolved.length > 0) {
    console.log(
      `[ci:requestdb-coverage] ${resolved.length} route(s) migrated off the shared pool — ` +
        're-run with --write-baseline to ratchet the backlog down.'
    );
  }
  if (newOffenders.length > 0) {
    console.error(
      `[ci:requestdb-coverage] FAIL — ${newOffenders.length} NEW route(s) on the shared pool above ` +
        `baseline of ${baselineSet.size}. New tenant-facing routes must use requestDb(req):`
    );
    for (const f of newOffenders) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `[ci:requestdb-coverage] OK — no new shared-pool routes ` +
      `(${currentSet.size} current, ${baselineSet.size} baseline)`
  );
  process.exit(0);
}

process.exit(0);
