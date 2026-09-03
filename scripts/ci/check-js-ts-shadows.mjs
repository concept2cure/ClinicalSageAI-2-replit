#!/usr/bin/env node
/**
 * CI gate against .js files shadowing same-basename .ts modules in server/.
 *
 * Why this gate exists: the repo's runtimes disagree about which twin a
 * specifier loads when both `x.js` and `x.ts` exist (verified empirically,
 * 2026-07-06, tsx 4.x / esbuild 0.25 / vitest 4.x):
 *
 *   importer  specifier   tsx (dev)   esbuild (prod)   vitest (vite)
 *   .ts       './x.js'    x.ts        x.js             x.js
 *   .ts       './x'       x.ts        x.ts             x.js
 *   .js       './x.js'    x.js        x.js             x.js
 *   .js       './x'       x.ts        x.ts             x.js
 *
 * So a stray `.js` twin can silently swap implementations between dev,
 * prod, and tests (a prior audit found a production auth middleware that
 * differed from the one exercised in dev). Every shadow pair must either
 * be deleted or allowlisted below with a reason the next reader can
 * challenge.
 *
 * Usage:
 *   node scripts/ci/check-js-ts-shadows.mjs
 *
 * Allowlist: add a repo-relative .js path to ALLOWED_SHADOWS with a
 * one-line `// why:` comment. Pure re-export shims (`export * from
 * './x.ts'`) are behaviorally safe — every runtime ends up executing the
 * .ts code. Content-diverged pairs are only acceptable while a tracked
 * consolidation item is open.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

// Directories under server/ that never feed any runtime resolver.
const SKIP_DIRS = new Set(['node_modules', '_archive', '_deprecated', 'dist', 'coverage']);

// Format: repo-relative .js path. Add only with a documented reason.
const ALLOWED_SHADOWS = new Set([
  // -- Pure re-export shims (`export * from './x.ts'`): zero divergence; kept
  //    because vite/vitest resolves explicit '.js' specifiers from .js
  //    importers to the literal .js file and will not fall back to .ts.
  'server/config/environment.js', // why: shim for auth.js + monitoring.js '.js' imports under vitest.
  'server/middleware/errorHandler.js', // why: shim for routes/folder-management.js under vitest.
  'server/services/auditService.js', // why: shim for api/enterprise/rbac-routes.js under vitest.
  'server/services/roleBasedAccess.js', // why: shim for api/enterprise/{rbac-routes,routes}.js under vitest.
  'server/utils/authedOrgId.js', // why: shim for phase3-routes.js/enterprise routes '.js' imports under vitest.
  'server/utils/jwtVerify.js', // why: shim for routes/leaves.js + other '.js' imports under vitest.
  'server/middleware/auth.js', // why: shim for the ~26 .ts routes + .js API modules importing '../middleware/auth.js' explicitly (ledger M-5 consolidation, 2026-08-28).
  'server/data-importer.js', // why: shim for server/scripts/import_*.js '.js' imports.
  'server/data-importer-v2.js', // why: shim for server/scripts/import_lumen_bio_trials.js.
  'server/utils/textProcessing.js', // why: shim for services/unifiedDocumentIngestion.js.
  // -- Content-diverged pairs (consolidation tracked; see
  //    docs/audits/DUPLICATE_BASENAMES_AND_CANONICAL_MAP.md and
  //    docs/proof/KNOWN_ISSUES_LEDGER.md M-5). Deleting or repointing these
  //    CHANGES PRODUCTION BEHAVIOR — do not touch without an owner decision.
  'server/db.js', // why: compat wrapper (dbStatus/pool proxy/retrying query); prod bundles it for 312 explicit '.js' imports.
  'server/utils/logger.js', // why: hand-synced console mirror of pino logger.ts; prod bundles it for 178 explicit '.js' imports.
]);

function walkJsWithTsTwin(rel) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const childRel = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.includes('backup')) continue;
      out.push(...walkJsWithTsTwin(childRel));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const stem = childRel.slice(0, -'.js'.length);
      if (fs.existsSync(path.join(repoRoot, `${stem}.ts`)) || fs.existsSync(path.join(repoRoot, `${stem}.tsx`))) {
        out.push(childRel.split(path.sep).join('/'));
      }
    }
  }
  return out;
}

const shadows = walkJsWithTsTwin('server');
const violations = shadows.filter(rel => !ALLOWED_SHADOWS.has(rel));
const staleAllowlist = [...ALLOWED_SHADOWS].filter(rel => !shadows.includes(rel));

if (staleAllowlist.length) {
  console.warn('[ci:js-ts-shadows] stale allowlist entries (pair no longer exists — remove them):');
  for (const rel of staleAllowlist) console.warn(`  ${rel}`);
}

if (violations.length) {
  console.error(
    `[ci:js-ts-shadows] ${violations.length} .js file(s) shadow a same-basename .ts module in server/:`
  );
  for (const rel of violations) console.error(`  ${rel}  (twin: ${rel.replace(/\.js$/, '.ts')})`);
  console.error('');
  console.error('  tsx (dev), esbuild (prod) and vitest resolve these pairs differently,');
  console.error('  so dev, prod and tests can execute different code for the same import.');
  console.error('  Either delete the .js twin (after proving nothing resolves to it), or');
  console.error('  replace it with a pure re-export shim of the .ts twin and add it to');
  console.error('  ALLOWED_SHADOWS in this script with a "why" note.');
  process.exit(1);
}

console.log(
  `[ci:js-ts-shadows] OK — ${shadows.length} shadow pair(s), all allowlisted with justification`
);
