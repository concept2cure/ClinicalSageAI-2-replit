#!/usr/bin/env node
/**
 * Client reachability ratchet: files the browser can never load.
 *
 * ── Why a second gate, next to check-unreferenced-modules.mjs ─────────────────
 * That gate asks "does anything NAME this file?" and is deliberately loose,
 * because the SERVER mounts routes from manifests of path strings
 * (`{ path: '/api', mod: '../routes/chat-actions' }`) that no import-anchored
 * scanner can see. Being loose there is correct: it can call a dead file live,
 * never a live file dead.
 *
 * The cost of that looseness shows up on the client. A file counts as
 * "referenced" if a TEST imports it, or if another DEAD file imports it — so
 * dead clusters keep each other alive and stay invisible. Measured today:
 * 447 client files are unreachable from the browser entry point and that gate
 * reports 76 of them. It sees 17%.
 *
 * The client has no manifest mounting to defeat tracing — there is no
 * `import.meta.glob` or `require.context` anywhere under client/src, and
 * client/index.html has exactly one script entry. So for the client, and only
 * the client, reachability from the entry point is answerable directly.
 *
 * ── What this gate asserts ────────────────────────────────────────────────────
 * A file under client/src that is not in the transitive import closure of
 * client/src/main.tsx cannot execute in the browser. Its components never mount,
 * its handlers never fire, its bugs are unreachable. It is weight — and worse,
 * weight that reads like product to anyone grepping for a capability. Five dead
 * editor shells currently sit inside the LIVE surfaces directory for exactly
 * that reason.
 *
 * ── Deliberately conservative in one direction ────────────────────────────────
 * `import type { X } from './y'` and `import('./y').X` erase at build time, so a
 * file reached only that way ships no runtime code. This tracer counts them as
 * REACHABLE anyway. That under-reports — the true dead set is larger than what
 * this prints — and that is the right way to be wrong: a gate that recommends
 * deleting a live file is worth less than no gate. The number here is a floor.
 *
 * It deletes nothing and changes no behaviour. It records the current dead set
 * as a baseline that may only SHRINK, so the debt cannot grow while it is being
 * paid down.
 *
 * Usage:
 *   node scripts/ci/check-client-reachability.mjs
 *   node scripts/ci/check-client-reachability.mjs --list
 *   node scripts/ci/check-client-reachability.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT_SRC = path.join(repoRoot, 'client/src');
const BASELINE_FILE = path.join(repoRoot, 'scripts/ci/client-reachability-baseline.json');

/**
 * Roots of the reachability walk.
 *
 * `main.tsx` is the browser entry and the reason this gate can be exact. It is
 * NOT the only way a client file legitimately runs, and treating it as the only
 * root cost a red CI: `client/src/setupTests.js` is named by
 * `client/jest.config.js` in `setupFilesAfterEach`, is imported by nothing, and
 * was therefore reported unreachable and deleted. Jest then refused to start —
 * "Module <rootDir>/src/setupTests.js in the setupFilesAfterEnv option was not
 * found" — which failed `npm test` before a single test ran, taking both the
 * Test and Integration Tests jobs down with it.
 *
 * The lesson generalises: a harness entry point is referenced by CONFIGURATION,
 * not by an import, so an import-graph walk cannot see it. Anything in that
 * position belongs here, with a note saying who reaches it and how — the same
 * standard this gate's own failure message demands of everyone else.
 */
const ENTRY_POINTS = [
  // The browser. One <script> in client/index.html.
  path.join(CLIENT_SRC, 'main.tsx'),
  // Jest. Named by client/jest.config.js → setupFilesAfterEnv.
  path.join(CLIENT_SRC, 'setupTests.js'),
];
const ENTRY = ENTRY_POINTS[0];

/** Mirrors tsconfig paths + vite resolve.alias. */
const ALIASES = [
  ['@/', 'client/src/'],
  ['@shared/', 'shared/'],
  ['@server/', 'server/'],
  ['@assets/', 'attached_assets/'],
];

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

const isTestPath = (p) =>
  /(^|[\\/])__tests__[\\/]/.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

/** Resolve a specifier to an on-disk file, or null if it is external/unresolvable. */
function resolve(spec, fromFile) {
  let base;
  if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    const alias = ALIASES.find(([a]) => spec.startsWith(a));
    if (!alias) return null; // bare package specifier — external
    base = path.join(repoRoot, alias[1], spec.slice(alias[0].length));
  }

  // Exact file.
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;

  // ESM specifiers name .js for a .ts source — the same quirk the sibling gate
  // documents. Probe the TypeScript sources before giving up.
  const swap = base.replace(/\.([cm]?)js$/, '');
  if (swap !== base) {
    for (const e of EXTS) if (fs.existsSync(swap + e)) return swap + e;
  }

  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  for (const e of EXTS) {
    const idx = path.join(base, 'index' + e);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

/**
 * Module specifiers in a source file.
 *
 * NO comment stripping. The first version of this stripped comments first, on
 * the reasoning that a commented-out import should not keep a file alive. That
 * is true and it is not worth it: regex cannot tell a comment from a string, and
 * client/src/App.jsx opens with a header comment containing a path with `/*` in
 * it. The block-comment pattern matched from there to the next `*​/` and ate 2,039
 * of the file's 3,659 characters — every import among them. The tracer reported
 * 14 reachable files instead of ~337, and every gate built on it would have been
 * confidently, catastrophically wrong.
 *
 * So specifiers are read from the raw source. A commented-out import now counts
 * as a reference, which over-reports REACHABLE — the safe direction for a gate
 * whose output implies "this can be deleted". Being wrong here costs a file that
 * stays; being wrong the other way costs a file that shouldn't have gone.
 */
function specifiers(src) {
  const code = src;
  const out = new Set();
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g, // import … from 'x' / export … from 'x'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('x')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('x')
    /\bimport\s+['"]([^'"]+)['"]/g, // bare side-effect import 'x'
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code)) !== null) out.add(m[1]);
  }
  return out;
}

function allClientSources() {
  const out = [];
  for (const e of fs.readdirSync(CLIENT_SRC, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const full = path.join(e.parentPath ?? e.path, e.name);
    if (!EXTS.includes(path.extname(full))) continue;
    if (full.endsWith('.d.ts')) continue;
    if (isTestPath(full)) continue;
    out.push(full);
  }
  return out;
}

// A missing entry point is a hard failure, not an empty walk that would report
// the whole client as dead. This is what would have caught the deletion of
// setupTests.js on the commit that made it, instead of one job later.
for (const e of ENTRY_POINTS) {
  if (!fs.existsSync(e)) {
    console.error(`[ci:client-reachability] FAIL — entry point missing: ${path.relative(repoRoot, e)}`);
    console.error('  Something a harness reaches by CONFIGURATION was deleted. Restore it, or');
    console.error('  remove it from ENTRY_POINTS and from whatever config names it.');
    process.exit(1);
  }
}

// BFS the import graph from every entry point.
const reachable = new Set();
const queue = [...ENTRY_POINTS];
while (queue.length > 0) {
  const file = queue.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const spec of specifiers(src)) {
    const target = resolve(spec, file);
    if (target && target.startsWith(repoRoot) && !reachable.has(target)) queue.push(target);
  }
}

const production = allClientSources();
const dead = production
  .filter((f) => !reachable.has(f))
  .map((f) => path.relative(repoRoot, f))
  .sort();

const liveCount = production.filter((f) => reachable.has(f)).length;

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        $comment:
          'Client files unreachable from client/src/main.tsx. This list may only SHRINK. ' +
          'Adding an entry means new code was written that the browser cannot load — that is a ' +
          'regression, not a fix. Regenerate with --write-baseline ONLY after removing entries. ' +
          'Type-only imports are counted as reachable, so the real dead set is larger than this.',
        $entry: 'client/src/main.tsx',
        $generated: new Date().toISOString().slice(0, 10),
        count: dead.length,
        modules: dead,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[ci:client-reachability] baseline written — ${dead.length} unreachable modules.`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE_FILE)) {
  console.error(
    `[ci:client-reachability] FAIL — baseline missing. Generate it with:\n` +
      `  node scripts/ci/check-client-reachability.mjs --write-baseline`,
  );
  process.exit(1);
}

const baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).modules);
const current = new Set(dead);
const introduced = dead.filter((m) => !baseline.has(m));
const resolved = [...baseline].filter((m) => !current.has(m)).sort();

if (process.argv.includes('--list')) {
  for (const m of dead) console.log(`  ${m}`);
  console.log('');
}

console.log(
  `[ci:client-reachability] ${liveCount} reachable / ${dead.length} unreachable ` +
    `(baseline ${baseline.size}) from client/src/main.tsx.`,
);

if (resolved.length > 0) {
  console.log(
    `\n  ${resolved.length} baseline entr${resolved.length === 1 ? 'y is' : 'ies are'} now gone or wired up. ` +
      `Regenerate the baseline so the ratchet holds:\n` +
      `    node scripts/ci/check-client-reachability.mjs --write-baseline`,
  );
}

if (introduced.length > 0) {
  console.error(
    `\n[ci:client-reachability] FAIL — ${introduced.length} new client module(s) the browser cannot reach:\n`,
  );
  for (const m of introduced) console.error(`  ${m}`);
  console.error(
    '\nNothing imports these from client/src/main.tsx, so they cannot mount, their handlers\n' +
      'never fire, and they will still read like product to the next person who greps for the\n' +
      'capability. Either wire it into a surface / route, or do not land it.\n' +
      '\nIf a file is genuinely reached by a mechanism this tracer does not model, say which\n' +
      'mechanism in the PR — do not add it to the baseline silently.\n',
  );
  process.exit(1);
}

console.log('[ci:client-reachability] OK — no new unreachable client modules.');
