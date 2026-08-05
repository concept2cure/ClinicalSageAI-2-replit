#!/usr/bin/env node
/**
 * [ci:unrun-tests] Every test file must be reachable by a runner.
 *
 * ── What this catches ─────────────────────────────────────────────────────────
 * A test file whose name does not match any include glob is not reported as
 * skipped. It is not reported at all. `vitest run` prints a healthy green
 * summary and the file sits in the tree looking exactly like coverage,
 * indefinitely.
 *
 * That is not hypothetical here. `vitest.config.ts` lists, for a client
 * `__tests__` directory, `*.test.ts` and `*.test.tsx` — and not `*.test.jsx`.
 * `client/src/__tests__/FileContext.test.jsx` had therefore never executed once,
 * despite covering `FileContext`, which is live and imported by
 * `client/src/main.tsx`. When it was finally run it failed three ways: no DOM
 * environment declared, and two `toBeInTheDocument` matchers this repo does not
 * load. A test that cannot pass and cannot fail is worse than no test, because
 * the absence is invisible.
 *
 * It surfaced by accident: a new `.spec.ts` was written next to the other client
 * tests and silently did not run. Nothing would have reported that either.
 *
 * ── How it decides ────────────────────────────────────────────────────────────
 * Read the include globs straight out of `vitest.config.ts` rather than
 * restating them — a guard with its own copy of the list is a guard that agrees
 * with itself and not with the runner. Then walk the four source roots for
 * anything named like a test and check it against those globs, plus the extra
 * runners declared in package.json (`test:ops-audits` runs
 * `tests/ops/*.test.mjs` under `node --test`, which vitest never sees).
 *
 * Files that genuinely should not run are listed in ALLOWLIST with a reason.
 * This is a two-sided ratchet: fixing one without removing its entry fails, so
 * the list cannot rot into a pile of stale excuses.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[ci:unrun-tests]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Roots a test file may live under. Anything outside these is not our problem. */
const ROOTS = ['tests', 'server', 'client', 'shared'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '_archive', '_deprecated', '.git', 'coverage']);

/**
 * Test files that are known not to run, each with the reason. Every entry is a
 * defect that has been looked at and deliberately left, NOT a file that is fine.
 */
const ALLOWLIST = {
  'server/test/assemblyLine.test.ts':
    'Lives in server/test/, not server/**/__tests__/. Requires a real AI provider: ' +
    'without a key the gateway answers "## AnA Response (Demo Mode)" and the ' +
    'assertions on generated text fail. Needs to become a mocked unit test or ' +
    'move to an integration job that has credentials.',
  'server/test/test-assembly.routes.test.ts':
    'Same directory and same reason as assemblyLine.test.ts — asserts on real ' +
    'model output that Demo Mode does not produce.',
  'tests/integration/api/vault.test.js':
    'Contains JSX in a .js file, so esbuild cannot even parse it ' +
    '("Failed to parse source for import analysis"). Renaming to .jsx is not ' +
    'enough — the tests/** globs cover .ts/.tsx only. Needs porting, not a rename.',
};

/**
 * Match one path segment against a pattern that may contain `*`.
 *
 * Deliberately a character walk rather than a built RegExp. `new RegExp(glob)`
 * is a non-literal regex — Semgrep's `detect-non-literal-regexp` flags it, and
 * the objection is reasonable even though the globs here come from this repo's
 * own vitest config rather than from a request: a guard that constructs
 * patterns at runtime is a guard whose own behaviour depends on data. This
 * version cannot backtrack catastrophically. It is the classic linear wildcard
 * matcher: remember the last `*` and the input position it started at, and on a
 * mismatch resume from one character further along.
 *
 * Also avoids taking a glob library as a dependency. picomatch, minimatch and
 * micromatch are all present in node_modules, but only transitively — a CI
 * guard that breaks when someone else's dependency tree shifts is worse than
 * twenty lines of matching.
 */
function segMatch(pat, s) {
  let pi = 0;
  let si = 0;
  let star = -1;
  let mark = 0;
  while (si < s.length) {
    if (pi < pat.length && pat[pi] === s[si]) { pi++; si++; }
    else if (pi < pat.length && pat[pi] === '*') { star = pi++; mark = si; }
    else if (star >= 0) { pi = star + 1; si = ++mark; }
    else return false;
  }
  while (pi < pat.length && pat[pi] === '*') pi++;
  return pi === pat.length;
}

/** Match a `/`-separated path against a glob. `**` spans any number of segments. */
function globMatch(glob, filePath) {
  const g = glob.split('/');
  const p = filePath.split('/');
  const walk = (gi, pi) => {
    if (gi === g.length) return pi === p.length;
    if (g[gi] === '**') {
      // Zero or more segments, so `a/**/b.ts` matches `a/b.ts` too.
      for (let k = pi; k <= p.length; k++) if (walk(gi + 1, k)) return true;
      return false;
    }
    if (pi >= p.length) return false;
    return segMatch(g[gi], p[pi]) && walk(gi + 1, pi + 1);
  };
  return walk(0, 0);
}

/** Pull the `include:` array out of vitest.config.ts as written. */
function readVitestIncludes() {
  const src = fs.readFileSync(path.join(REPO, 'vitest.config.ts'), 'utf8');
  const m = /include:\s*\[([\s\S]*?)\]/.exec(src);
  if (!m) {
    console.error(`${TAG} could not find an \`include:\` array in vitest.config.ts.`);
    console.error(`${TAG} This guard reads the runner's own globs; if the config's shape`);
    console.error(`${TAG} changed, update the parser rather than hard-coding the list.`);
    process.exit(1);
  }
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

/** Extra runners that are not vitest. Read from package.json so they stay honest. */
function readExtraRunnerGlobs() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const globs = [];
  for (const cmd of Object.values(pkg.scripts ?? {})) {
    // e.g. `node --test tests/ops/*.test.mjs`
    if (!/\bnode\b[^&|]*--test\b/.test(cmd)) continue;
    for (const tok of cmd.split(/\s+/)) {
      if (/[*?]/.test(tok) && /\.(m?[jt]sx?)$/.test(tok)) globs.push(tok);
    }
  }
  return globs;
}

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const includes = readVitestIncludes();
const extras = readExtraRunnerGlobs();
const globs = [...includes, ...extras];
// tests/e2e is excluded from vitest by config and driven by its own script.
const excluded = ['tests/e2e/'];

const found = [];
for (const root of ROOTS) {
  for (const abs of walk(path.join(REPO, root))) {
    const rel = path.relative(REPO, abs).split(path.sep).join('/');
    if (!/\.(test|spec)\.(m?[jt]sx?)$/.test(rel)) continue;
    if (excluded.some((prefix) => rel.startsWith(prefix))) continue;
    found.push(rel);
  }
}

const unrun = found.filter((rel) => !globs.some((g) => globMatch(g, rel)));
const allowed = Object.keys(ALLOWLIST);

const unexpected = unrun.filter((f) => !allowed.includes(f));
// The other half of the ratchet: an allowlisted file that now RUNS must leave
// the list, or the list slowly becomes a record of things that used to be true.
const fixedButListed = allowed.filter((f) => !unrun.includes(f));

console.log(
  `${TAG} ${found.length} test files · ${includes.length} vitest globs · ` +
    `${extras.length} non-vitest runner globs · ${unrun.length} unrun ` +
    `(${allowed.length} allowlisted).`,
);

let bad = false;

if (unexpected.length) {
  bad = true;
  console.error(`\n${TAG} FAIL — ${unexpected.length} test file(s) no runner will execute:\n`);
  for (const f of unexpected) console.error(`  ${f}`);
  console.error(
    `\n  These do not show up as skipped. They do not show up at all — the suite\n` +
      `  reports green and the file looks like coverage forever.\n\n` +
      `  Fix by making it run: match an include glob in vitest.config.ts (and\n` +
      `  vitest.workspace.ts, which has its own copy), or rename the file to a\n` +
      `  covered extension. If it genuinely must not run, add it to ALLOWLIST in\n` +
      `  ${path.relative(REPO, fileURLToPath(import.meta.url))} with the reason.\n`,
  );
}

if (fixedButListed.length) {
  bad = true;
  console.error(`\n${TAG} FAIL — ${fixedButListed.length} allowlisted file(s) now run:\n`);
  for (const f of fixedButListed) console.error(`  ${f}`);
  console.error(
    `\n  Good news, but remove them from ALLOWLIST so the list keeps meaning\n` +
      `  "known broken" rather than "was broken once".\n`,
  );
}

if (bad) process.exit(1);
console.log(`${TAG} OK — every test file is reachable by a runner, or explained.`);
