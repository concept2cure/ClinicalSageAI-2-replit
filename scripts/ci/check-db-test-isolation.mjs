#!/usr/bin/env node
/**
 * CI Guard: the real-database test project must never inherit the `pg` mock.
 *
 * ── What this protects ───────────────────────────────────────────────────────
 * `tests/setup.ts` installs a process-wide `vi.mock('pg')`, and it is the setup
 * file for the default vitest project — all ~1,600 test files. That is correct
 * for unit tests. It was NOT correct for the CI job named "Integration Tests",
 * which provisions a real PostgreSQL service, applies migrations to it, and
 * then ran the suite under that same mock: `new Pool().query(...)` resolved to
 * `{ rows: [], rowCount: 0 }` without a packet ever leaving the process. The
 * job proved nothing about the schema, the tenant predicates, or the SQL the
 * routes issue — and reported green while doing it. Every empty result read as
 * "no rows", which is indistinguishable from "the query never ran".
 *
 * The fix is structural: real-database tests are named `*.dbtest.ts`, run under
 * `vitest.db.config.ts` with `tests/setup.db.ts`, and are EXCLUDED from every
 * mocked config. That separation is only worth as much as its enforcement —
 * a single `exclude` entry deleted in a merge would silently restore the
 * original defect, with the tests still present and still green. Hence a guard.
 *
 * ── What it checks ───────────────────────────────────────────────────────────
 *   1. every config whose setupFiles include the mocking setup excludes the
 *      db-test glob;
 *   2. `tests/setup.db.ts` does not itself mock `pg`;
 *   3. no `*.dbtest.ts` file imports the mocking setup (which would reinstate
 *      the mock from inside the unmocked project);
 *   4. at least one `*.dbtest.ts` file exists, so the guard cannot pass by
 *      guarding nothing — the failure mode of every "0 violations" check.
 *
 * The runtime backstop lives in tests/setup.db.ts, which throws if `pg` is
 * mocked when the suite boots. This guard is the static half: it fails the PR
 * that would cause that, instead of the deploy that discovers it.
 *
 * Usage:
 *   node scripts/ci/check-db-test-isolation.mjs
 *   node scripts/ci/check-db-test-isolation.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[ci:db-test-isolation]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const asJson = process.argv.includes('--json');

/** The setup file that installs `vi.mock('pg')`. */
const MOCKING_SETUP = 'tests/setup.ts';
/** The setup file for the real-database project. */
const DB_SETUP = 'tests/setup.db.ts';
/** The exclude entry every mocked config must carry. */
const REQUIRED_EXCLUDE = '**/*.dbtest.ts';
/** Suffix identifying a real-database test. */
const DB_TEST_SUFFIX = '.dbtest.ts';

/** Vitest configs to inspect. A config not listed here is not checked. */
const CONFIGS = ['vitest.config.ts', 'vitest.workspace.ts', 'vitest.db.config.ts'];

/** Roots a test file may live under (mirrors scripts/ci/check-unrun-tests.mjs). */
const ROOTS = ['tests', 'server', 'client', 'shared'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '_archive', '_deprecated', '.git', 'coverage']);

const failures = [];
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');

/**
 * Strip comments before inspecting a file.
 *
 * Every file this guard reads DESCRIBES the pattern it is looking for — that is
 * the point of their headers. Without this, `tests/setup.db.ts` fails its own
 * check because its opening paragraph explains what `vi.mock('pg')` does, and
 * `vitest.db.config.ts` reads as a mocking config because it says it is not
 * one. A guard that cannot tell code from the comment explaining the code
 * generates exactly the false alarms that get guards disabled.
 *
 * Stripping is LINE-BASED on purpose. The obvious implementation —
 * `source.replace(/\/\*[\s\S]*?\*\//g, '')` — is wrong here, because the very
 * globs this guard searches for are made of the same characters as comment
 * delimiters: `'**\/*.dbtest.ts'` contains both an opener and a closer. That
 * regex paired the `/*` inside `'tests/e2e/**'` with the `*\/` inside
 * `'**\/*.dbtest.ts'` and deleted the glob it was supposed to find, so the
 * guard reported the exclude entry missing while it sat two lines above. A
 * line-based filter cannot reach inside a string literal at all.
 */
function stripComments(source) {
  return source
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      // Whole-line comments only: `//…`, and the `/**`, ` *`, ` */` of a JSDoc
      // block. Code lines — including any containing a glob — are untouched.
      return !/^(\/\/|\/\*|\*)/.test(trimmed);
    })
    .join('\n');
}

/** The setupFiles entries a config actually loads (comments excluded). */
function setupFilesOf(source) {
  const code = stripComments(source);
  const entries = [];
  for (const match of code.matchAll(/setupFiles\s*:\s*\[([^\]]*)\]/g)) {
    for (const literal of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
      entries.push(literal[1].replace(/^\.\//, ''));
    }
  }
  return entries;
}

/** Every file under ROOTS whose name ends in the db-test suffix. */
function findDbTests() {
  const found = [];
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(DB_TEST_SUFFIX)) found.push(path.relative(REPO, full));
    }
  };
  for (const root of ROOTS) walk(path.join(REPO, root));
  return found.sort();
}

// ── 1. Mocked configs must exclude the db tests ──────────────────────────────
for (const config of CONFIGS) {
  let source;
  try {
    source = read(config);
  } catch {
    failures.push({
      check: 'config-missing',
      where: config,
      detail: `${config} is listed as a vitest config but does not exist. Update CONFIGS in this guard, or restore the file.`,
    });
    continue;
  }

  // A config is "mocking" when it actually LOADS the mocking setup, not when
  // it mentions it — vitest.db.config.ts names the file in order to say it
  // deliberately does not load it.
  if (!setupFilesOf(source).includes(MOCKING_SETUP)) continue;

  if (!stripComments(source).includes(REQUIRED_EXCLUDE)) {
    failures.push({
      check: 'missing-exclude',
      where: config,
      detail:
        `${config} loads ${MOCKING_SETUP} (which mocks \`pg\`) but does not exclude ` +
        `'${REQUIRED_EXCLUDE}'. Database tests picked up by this config would query a stub ` +
        `that answers { rows: [], rowCount: 0 } and pass without opening a socket.`,
    });
  }
}

// ── 2. The db-project setup must not mock pg ─────────────────────────────────
{
  let source = null;
  try {
    source = read(DB_SETUP);
  } catch {
    failures.push({
      check: 'db-setup-missing',
      where: DB_SETUP,
      detail: `${DB_SETUP} does not exist — the real-database project has no setup file.`,
    });
  }
  if (source !== null && /vi\.mock\(\s*['"]pg['"]/.test(stripComments(source))) {
    failures.push({
      check: 'db-setup-mocks-pg',
      where: DB_SETUP,
      detail:
        `${DB_SETUP} mocks \`pg\`. This file exists specifically so the real-database ` +
        'project does NOT mock the driver.',
    });
  }
  if (source !== null && stripComments(source).includes(`'./${MOCKING_SETUP}'`)) {
    failures.push({
      check: 'db-setup-imports-mocking-setup',
      where: DB_SETUP,
      detail: `${DB_SETUP} pulls in ${MOCKING_SETUP}, which would reinstall the pg mock.`,
    });
  }
}

// ── 3. No db test may import the mocking setup ───────────────────────────────
const dbTests = findDbTests();
for (const file of dbTests) {
  const source = stripComments(read(file));
  // Any quoted specifier ending in `/setup` — which covers `from '../setup'`,
  // the bare side-effect form `import '../setup'`, and `require('../setup')`
  // alike. Matching only the `from` spelling would miss the side-effect import,
  // and that is the form someone reaches for when they want the mock: it exists
  // to run the module, not to name anything from it. `../setup.db` does not
  // match, because the specifier must END at `setup`.
  if (/['"][^'"]*\/setup['"]/.test(source)) {
    failures.push({
      check: 'db-test-imports-mocking-setup',
      where: file,
      detail:
        `${file} imports tests/setup (the mocking setup). Importing it executes its ` +
        '`vi.mock(\'pg\')`, so every query in this file would hit a stub. Import ' +
        `'${DB_SETUP}' instead.`,
    });
  }
}

// ── 4. The guard must be guarding something ──────────────────────────────────
if (dbTests.length === 0) {
  failures.push({
    check: 'no-db-tests',
    where: ROOTS.join(', '),
    detail:
      `no ${DB_TEST_SUFFIX} files exist. A guard with nothing to check reports green ` +
      'forever, which is the failure mode it was written to prevent. If the real-database ' +
      'suite was deliberately removed, remove this guard and its CI step in the same change.',
  });
}

// ── Report ───────────────────────────────────────────────────────────────────
if (asJson) {
  process.stdout.write(`${JSON.stringify({ dbTests, failures }, null, 2)}\n`);
} else if (failures.length === 0) {
  console.log(
    `${TAG} OK — ${dbTests.length} real-database test file(s) run unmocked, and every ` +
      'mocked vitest config excludes them.'
  );
} else {
  console.error(`${TAG} FAIL — ${failures.length} violation(s):\n`);
  for (const f of failures) {
    console.error(`  ${f.where}  [${f.check}]`);
    console.error(`    ${f.detail}\n`);
  }
  console.error(
    '  Real-database tests (*.dbtest.ts) run under vitest.db.config.ts with tests/setup.db.ts.\n' +
      '  They must never be reachable from a config that mocks `pg` — a mocked database test\n' +
      '  passes against { rows: [], rowCount: 0 } and proves nothing while reporting green.\n'
  );
}

process.exit(failures.length === 0 ? 0 : 1);
