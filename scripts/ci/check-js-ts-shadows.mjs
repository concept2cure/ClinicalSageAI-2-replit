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
  // why: shim for the '.js'-suffixed imports under vitest. Eight live importers,
  // among them server/middleware/tenantContext.ts, server/socketServer.ts and
  // server/routes/authEnterprise.ts. (This comment used to name routes/leaves.js
  // first; that file was deleted 2026-09-10 and the entry stands on the rest.)
  'server/utils/jwtVerify.js',
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

/**
 * Ancestor shadows that are accepted. Format: repo-relative .js path.
 * Add only with a documented reason, and only after checking whether any file
 * in the .js file's OWN directory writes the bare "./<name>" specifier — if one
 * does, it is already resolving to the .js and the entry needs a fix, not a note.
 */
const ALLOWED_ANCESTOR_SHADOWS = new Set([
  // why: `index` is the most collided basename in the tree (70 .ts files carry
  //      it). These two are API sub-barrels; nothing in server/api/cmc/ or
  //      server/api/validation/ writes './index', and a bare './index' from
  //      those directories would be self-referential rather than an attempt to
  //      reach server/index.ts, which is the process entrypoint. Latent by
  //      construction rather than by luck.
  'server/api/cmc/index.js',
  'server/api/validation/index.js',
  // why: server/db.ts is the governed pool. Nothing in server/lib/ writes
  //      './db' today (checked 2026-09-10), so the ambiguity is latent — but
  //      this is the highest-consequence pair in the list, because a module
  //      that got the wrong `db` would be querying outside the request-scoped
  //      handle that carries tenant context. Resolve it by deleting or
  //      renaming server/lib/db.js rather than by keeping this note forever.
  'server/lib/db.js',
  // why: server/auth.ts vs server/middleware/auth.js. The .js is already an
  //      allowlisted same-directory shim (see above) for the ~26 routes that
  //      import '../middleware/auth.js' explicitly. Nothing in
  //      server/middleware/ writes './auth', so the ancestor ambiguity is
  //      latent. Same caveat as db.js: this is an authentication module, and
  //      the right end state is one file, not a durable note.
  'server/middleware/auth.js',
]);

/**
 * ANCESTOR SHADOWS, added 2026-09-10.
 *
 * The same-directory check below is necessary and not sufficient. A `.js` in a
 * CHILD directory whose basename matches a `.ts` in an ANCESTOR is the same
 * hazard reached by a different route: from `server/services/`, the specifier
 * `'./huggingface-service'` resolves to `server/services/huggingface-service.js`
 * while `'../huggingface-service'` resolves to `server/huggingface-service.ts`.
 * One character decides which module runs, and the two are not substitutable —
 * that pair's classes share only the exported NAME. The `.js` constructor takes
 * no arguments and silently drops the API key its callers pass, and every method
 * its seven `.ts` callers invoke is `undefined` on it.
 *
 * Verified with esbuild rather than argued: an import written `./huggingface-service`
 * from inside `server/services/` resolves to the `.js` file.
 *
 * WHY THE RULE IS "ANCESTOR" AND NOT "ANYWHERE". Matching any same-basename
 * `.ts` anywhere under server/ is unusable: `index.js` matches 70 files,
 * `types.js` 41, `routes.js` 9, `client.js` 13 — none of them reachable from one
 * another by a plain relative specifier, so every one is a false positive. Only
 * an ancestor twin is genuinely ambiguous from the `.js` file's own directory.
 * That narrows 15 cross-directory basename collisions to 5 real ones.
 */
function walk(rel, acc = []) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return acc;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const childRel = path.join(rel, entry.name).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.includes('backup')) continue;
      walk(childRel, acc);
    } else if (entry.isFile()) {
      acc.push(childRel);
    }
  }
  return acc;
}

const ALL_FILES = walk('server');
const HAS = new Set(ALL_FILES);

/** `server/x/foo.js` where `server/foo.ts` (or any ancestor's) also exists. */
function ancestorShadows() {
  const out = [];
  for (const f of ALL_FILES) {
    if (!f.endsWith('.js')) continue;
    const base = f.slice(f.lastIndexOf('/') + 1, -'.js'.length);
    let dir = f.slice(0, f.lastIndexOf('/'));
    while (dir.includes('/')) {
      dir = dir.slice(0, dir.lastIndexOf('/'));
      for (const ext of ['.ts', '.tsx']) {
        const twin = `${dir}/${base}${ext}`;
        if (HAS.has(twin)) out.push({ js: f, twin });
      }
    }
  }
  return out;
}

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

// ── Ancestor shadows ────────────────────────────────────────────────────────
const ancestors = ancestorShadows();
const ancestorViolations = ancestors.filter((p) => !ALLOWED_ANCESTOR_SHADOWS.has(p.js));
const staleAncestors = [...ALLOWED_ANCESTOR_SHADOWS].filter(
  (rel) => !ancestors.some((p) => p.js === rel),
);

if (staleAncestors.length) {
  console.warn('[ci:js-ts-shadows] stale ancestor allowlist entries (pair no longer exists — remove them):');
  for (const rel of staleAncestors) console.warn(`  ${rel}`);
}

if (ancestorViolations.length) {
  console.error(
    `[ci:js-ts-shadows] ${ancestorViolations.length} .js file(s) shadow a same-basename .ts module in an ANCESTOR directory:`,
  );
  for (const p of ancestorViolations) console.error(`  ${p.js}  (ancestor twin: ${p.twin})`);
  console.error('');
  console.error('  From the .js file\'s own directory, "./<name>" resolves to the .js and');
  console.error('  "../<name>" resolves to the .ts. One character decides which module runs,');
  console.error('  and nothing in the type system or the tests will tell you which one you got.');
  console.error('  Delete the .js twin after proving nothing resolves to it, or add it to');
  console.error('  ALLOWED_ANCESTOR_SHADOWS with a "why" note.');
  process.exit(1);
}

console.log(
  `[ci:js-ts-shadows] OK — ${shadows.length} same-directory pair(s) and ${ancestors.length} ancestor pair(s), all allowlisted with justification`,
);
