#!/usr/bin/env node
/**
 * Unreferenced-module ratchet: source files nothing can reach.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * `npm run audit:dead-code` (knip) was supposed to cover this and does not. Two
 * config-load failures — drizzle.config.ts needs DATABASE_URL, and
 * vitest.workspace.ts calls a `defineWorkspace` that no longer exists — abort
 * knip's analysis before it builds a module graph. It then reports ZERO
 * unreferenced files and 188 "unused dependencies", among them @anthropic-ai/sdk,
 * which three server files import. One of its three configured entry points,
 * client/src/concept2cure/ZenApp.tsx, does not exist either. And the script runs
 * with --no-exit-code, so the job reports success no matter what it found.
 *
 * A gate that cannot fail, fed by an analysis that did not run, is worse than no
 * gate: it is a standing claim that the repo is clean. This check is small enough
 * to be obviously correct and is verified by tests against the two resolution
 * quirks that make naive versions wrong (see below).
 *
 * ── What "unreferenced" means here ────────────────────────────────────────────
 * A module under server/ or client/src/ that NO other file in the repository
 * names in a module-path string literal. Not "unused export" — unreachable file.
 * Nothing imports it, so nothing it does can happen, so its routes are unmounted,
 * its tables unwritten and its bugs unreachable. It is weight, and worse, it is
 * weight that reads like product when someone greps for a capability.
 *
 * ── The two ways a naive scanner gets this wrong in THIS repo ─────────────────
 * Both were observed producing false "dead" verdicts, and both are pinned by
 * tests/ci/unreferenced-modules.contract.test.ts:
 *
 *   1. ESM-style specifiers name .js for a .ts file.
 *        server/services/ana/submission-chat-handler.ts:21
 *          import { ensureGateway } from '../../routes/chat/shared.js';
 *      resolves to server/routes/chat/shared.TS. Matching the literal extension
 *      marks all 8 files in server/routes/chat dead. They are live.
 *
 *   2. Routes also mount from a MANIFEST of path strings, not import literals.
 *        server/bootstrap/register-advanced-platform-routes.ts:290
 *          { path: '/api', mod: '../routes/chat-actions', name: 'Chat Actions' }
 *      A regex anchored on `import`/`require` never sees `mod:`, so it marks
 *      61 mounted routers dead — including chat-actions, whose INSERT is the
 *      reason db/migrations/20260728_artifacts_table.sql exists.
 *
 * So the matcher deliberately accepts ANY string literal shaped like a relative
 * or aliased module path, and compares with the extension stripped from both
 * sides. That is a deliberate over-match: it can only ever call a dead file live,
 * never a live file dead. For a ratchet whose failure mode is "someone deletes
 * working code", erring that direction is the whole point.
 *
 * ── Ratchet semantics ─────────────────────────────────────────────────────────
 * Default run: fails if any module NOT in the baseline is unreferenced, i.e. new
 * dead code cannot land. Deleting or wiring up a baselined module and
 * regenerating shrinks the baseline; the count is monotonically non-increasing.
 * --strict fails on any unreferenced module at all, baselined or not.
 *
 * Usage:
 *   node scripts/ci/check-unreferenced-modules.mjs                 # ratchet
 *   node scripts/ci/check-unreferenced-modules.mjs --strict        # zero tolerance
 *   node scripts/ci/check-unreferenced-modules.mjs --write-baseline
 *   node scripts/ci/check-unreferenced-modules.mjs --json          # machine readable
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_PATH = path.join(REPO_ROOT, 'scripts/ci/unreferenced-modules-baseline.json');

/** Trees whose files are candidates for being called dead. */
export const SCAN_ROOTS = ['server', 'client/src'];

/**
 * Trees searched for references. Wider than SCAN_ROOTS on purpose: a module used
 * only by a test or a script is not dead, it is just not used in production, and
 * deleting it would break the thing that uses it.
 */
export const REFERENCE_ROOTS = ['server', 'client/src', 'shared', 'scripts', 'tests', 'db'];

/**
 * Files that are reached without anyone importing them, so absence of a
 * reference proves nothing. Process entry points and build config only.
 */
export const ENTRY_POINTS = [
  'server/index.ts',
  'client/src/main.tsx',
  // Reached without an import specifier this scanner can see: its source is
  // fs.readFileSync-pinned (repo-root-relative paths, not module paths) by the
  // regulatory-honesty contracts in tests/fda-submission-honesty.contract.test.ts
  // and tests/audit-medium-fabrication-attribution.test.ts, which assert the
  // service never fabricates an FDA transmission. Its only RUNTIME consumer
  // (server/routes/medical-device-routes.js) was deleted in the Phase 1
  // consolidation; deleting this file is deferred until those honesty pins are
  // re-homed, because deleting it today would break the tests that read it.
  'server/services/medicalDeviceService.ts',
];

const SOURCE_EXT = ['.ts', '.tsx', '.js', '.jsx'];
const REFERENCE_EXT = [...SOURCE_EXT, '.mjs', '.cjs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const TEST_SUFFIX = /\.(test|spec)\.(tsx?|jsx?)$/;
const DECL_SUFFIX = /\.d\.ts$/;

/**
 * Any string literal shaped like a module path: relative, or one of the three
 * tsconfig aliases. Extension-agnostic by design — see quirk (1) above.
 */
const MODULE_PATH_LITERAL = /['"`]((?:\.{1,2}\/|@\/|@shared\/|@server\/)[^'"`\s)]+)['"`]/g;

const ALIASES = [
  ['@/', 'client/src/'],
  ['@shared/', 'shared/'],
  ['@server/', 'server/'],
];

/** Drop a module extension so `x.js`, `x.ts` and `x` compare equal. */
export function stripModuleExtension(p) {
  return p.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
}

function walk(root, extensions) {
  const out = [];
  const abs = path.join(REPO_ROOT, root);
  if (!fs.existsSync(abs)) return out;
  const stack = [abs];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (extensions.some(e => entry.name.endsWith(e))) {
        out.push(path.relative(REPO_ROOT, full));
      }
    }
  }
  return out.sort();
}

/**
 * Every module path named anywhere in REFERENCE_ROOTS, normalised to a
 * repo-relative, extension-free key.
 *
 * A directory specifier (`./foo`) is also recorded as `./foo/index`, because
 * that is the file it resolves to.
 */
export function collectReferencedPaths(readFile = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')) {
  const referenced = new Set();
  for (const root of REFERENCE_ROOTS) {
    for (const file of walk(root, REFERENCE_EXT)) {
      let source;
      try {
        source = readFile(file);
      } catch {
        continue;
      }
      const dir = path.dirname(file);
      for (const match of source.matchAll(MODULE_PATH_LITERAL)) {
        const spec = match[1];
        let target = null;
        if (spec.startsWith('.')) {
          target = path.join(dir, spec);
        } else {
          const alias = ALIASES.find(([prefix]) => spec.startsWith(prefix));
          if (alias) target = path.join(alias[1], spec.slice(alias[0].length));
        }
        if (target === null) continue;
        const key = stripModuleExtension(path.normalize(target));
        referenced.add(key);
        referenced.add(path.join(key, 'index'));
      }
    }
  }
  return referenced;
}

/** Source modules that no reference names. */
export function findUnreferencedModules() {
  const referenced = collectReferencedPaths();
  const entryPoints = new Set(ENTRY_POINTS.map(stripModuleExtension));
  const unreferenced = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root, SOURCE_EXT)) {
      if (DECL_SUFFIX.test(file) || TEST_SUFFIX.test(file)) continue;
      if (file.includes('__tests__/')) continue;
      const key = stripModuleExtension(file);
      if (entryPoints.has(key)) continue;
      if (referenced.has(key)) continue;
      unreferenced.push(file);
    }
  }
  return unreferenced.sort();
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { modules: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return { modules: Array.isArray(parsed.modules) ? parsed.modules : [] };
  } catch (error) {
    console.error(`Could not read baseline at ${path.relative(REPO_ROOT, BASELINE_PATH)}: ${error.message}`);
    process.exit(1);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const strict = argv.includes('--strict');
  const write = argv.includes('--write-baseline');
  const asJson = argv.includes('--json');

  const unreferenced = findUnreferencedModules();

  if (write) {
    const payload = {
      $comment:
        'Modules under server/ or client/src/ that nothing in the repository references. ' +
        'This list may only shrink: delete the module, or wire it up, then regenerate with ' +
        'npm run ci:unreferenced-modules:write-baseline. Adding an entry by hand is a ' +
        'regression, not a fix.',
      generatedBy: 'scripts/ci/check-unreferenced-modules.mjs --write-baseline',
      count: unreferenced.length,
      modules: unreferenced,
    };
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Wrote ${unreferenced.length} unreferenced modules to ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    return;
  }

  const baseline = new Set(readBaseline().modules);
  const introduced = unreferenced.filter(m => !baseline.has(m));
  const resolved = [...baseline].filter(m => !unreferenced.includes(m)).sort();

  if (asJson) {
    console.log(JSON.stringify({ unreferenced, introduced, resolved, baselineCount: baseline.size }, null, 2));
  } else {
    console.log(`Unreferenced modules: ${unreferenced.length} (baseline ${baseline.size})`);
    if (resolved.length > 0) {
      console.log(`\n${resolved.length} baselined module(s) no longer unreferenced — regenerate the baseline:`);
      for (const m of resolved.slice(0, 20)) console.log(`  - ${m}`);
      if (resolved.length > 20) console.log(`  … and ${resolved.length - 20} more`);
    }
    if (introduced.length > 0) {
      console.log(`\n${introduced.length} NEW unreferenced module(s):`);
      for (const m of introduced) console.log(`  + ${m}`);
    }
  }

  if (introduced.length > 0) {
    console.error(
      '\nFAIL: new unreachable source file(s). Nothing imports these, so nothing they ' +
        'contain can run — their routes are unmounted and their code paths are dead. ' +
        'Either wire the module up, or delete it. If it is genuinely reached in a way ' +
        'this scanner cannot see, add the reaching path to ENTRY_POINTS with a comment ' +
        'explaining how it is reached.',
    );
    process.exit(1);
  }

  if (strict && unreferenced.length > 0) {
    console.error(`\nFAIL (--strict): ${unreferenced.length} unreferenced module(s) remain.`);
    process.exit(1);
  }

  console.log('\nOK: no new unreachable modules.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
