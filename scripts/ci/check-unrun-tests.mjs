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
/* `scripts` is here because it was not, and that blind spot hid two dead files.
   `scripts/visual-qa/*.spec.tsx` are real vitest specs, named in a real npm
   script — and vitest matches a filter against its `include` globs first, which
   covered tests|server|client|shared and not scripts. Both were silently
   filtered out, so `npm run visual-qa:capture` exited "No test files found" and
   the documented `npm run visual-qa` entry point died at step one. This guard
   reported "every test file is reachable" the whole time, because it never
   walked the directory they live in. A guard that does not look somewhere
   cannot report on it, and reporting a clean result over unexamined ground is
   the failure this file exists to prevent. */
const ROOTS = ['tests', 'server', 'client', 'shared', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '_archive', '_deprecated', '.git', 'coverage']);

/**
 * Test files that are known not to run, each with the reason. Every entry is a
 * defect that has been looked at and deliberately left, NOT a file that is fine.
 */
const ALLOWLIST = {
  // EMPTY, and that is the point.
  //
  // It held three entries. Two — server/test/assemblyLine.test.ts and
  // server/test/test-assembly.routes.test.ts — were live tests of live code
  // (server/services/AssemblyLine.ts, server/routes/test-assembly.ts) sitting in
  // a directory no include glob covers. They are now under server/__tests__/
  // with the AI gateway mocked, because their real defect was asserting on
  // polish()'s FALLBACK text while letting the live gateway run: without a
  // provider key it answers "## AnA Response (Demo Mode)…", a success with
  // content, so the fallback never fires and the assertion could not pass.
  //
  // The third — tests/integration/api/vault.test.js — was deleted. It is a Jest
  // test in a Vitest repo that dynamically imports server/routes/vaultApi.js,
  // which does not exist, mounted at /api/vault, which nothing serves. Subject
  // gone, so the test goes with it.
  //
  // Adding an entry here is a decision to ship a test that cannot run. Write
  // down why, and expect to be asked.
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

/**
 * Vitest configs whose include globs count as "this file runs".
 *
 * There are two runners, not one. `vitest.db.config.ts` owns the real-database
 * project (`*.dbtest.ts`), which is deliberately EXCLUDED from vitest.config.ts
 * so it cannot inherit that project's `vi.mock('pg')`. Reading only the first
 * config would report every database test as unrun; reading only the second
 * would miss everything else. Both are read for the same reason the original
 * parser read the config at all: a guard with its own copy of the list agrees
 * with itself and not with the runner.
 */
const VITEST_CONFIGS = ['vitest.config.ts', 'vitest.db.config.ts', 'vitest.visual-qa.config.ts'];

/** Pull the `include:` array out of a vitest config as written. */
function readVitestIncludes(configFile) {
  const src = fs.readFileSync(path.join(REPO, configFile), 'utf8');
  const m = /include:\s*\[([\s\S]*?)\]/.exec(src);
  if (!m) {
    console.error(`${TAG} could not find an \`include:\` array in ${configFile}.`);
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

const includes = VITEST_CONFIGS.flatMap(readVitestIncludes);
const extras = readExtraRunnerGlobs();
const globs = [...includes, ...extras];
// tests/e2e is excluded from vitest by config and driven by its own script.
const excluded = ['tests/e2e/'];

const found = [];
for (const root of ROOTS) {
  for (const abs of walk(path.join(REPO, root))) {
    const rel = path.relative(REPO, abs).split(path.sep).join('/');
    // `dbtest` is listed explicitly: `.dbtest.ts` does NOT match `\.test\.`
    // (there is no dot before `test`), so without it every real-database test
    // was invisible to this guard — which is precisely the "a test that cannot
    // pass and cannot fail" condition the file header describes.
    if (!/\.(dbtest|test|spec)\.(m?[jt]sx?)$/.test(rel)) continue;
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
