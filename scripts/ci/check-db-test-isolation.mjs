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
 *   2. `tests/setup.db.ts` does not itself mock `pg`, or import the mocking
 *      setup;
 *   3. no `*.dbtest.ts` file imports the mocking setup (which would reinstate
 *      the mock from inside the unmocked project);
 *   4. at least one `*.dbtest.ts` file exists, so the guard cannot pass by
 *      guarding nothing — the failure mode of every "0 violations" check.
 *
 * The runtime backstop lives in tests/setup.db.ts, which throws if `pg` is
 * mocked when the suite boots. This guard is the static half: it fails the PR
 * that would cause that, instead of the deploy that discovers it.
 *
 * Self-test: scripts/ci/__tests__/db-test-isolation.test.mjs (npm run test:ci-scripts).
 *
 * Usage:
 *   node scripts/ci/check-db-test-isolation.mjs
 *   node scripts/ci/check-db-test-isolation.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const TAG = '[ci:db-test-isolation]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

// ── Which modules does a file load? ──────────────────────────────────────────
//
// Checks 2 and 3 ask whether a file loads tests/setup. That is a question about
// MODULE SPECIFIERS, so it is answered from the parsed syntax tree, not from the
// text. The version before this matched "any quoted string ending in /setup"
// and was wrong both ways: it failed tests/db/second-factor-binding.dbtest.ts
// and tests/db/sign-in-posture.dbtest.ts — which import '../setup.db' exactly
// as they should — because they POST to '/api/auth/mfa/setup', and it passed
// `import '../setup.ts'`, which loads the mock, because that string does not
// END at `setup`. A parser knows an import from a URL and a comment from code,
// so neither mistake is available to it.

/** `vi.<name>(specifier, …)` calls that load, or automock, the named module. */
const VI_MODULE_CALLS = new Set(['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock']);

/** Extensions a specifier may spell out and still mean the same module. */
const MODULE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** tests/setup.ts as a module id: repo-relative, extensionless. */
const MOCKING_SETUP_MODULE = MOCKING_SETUP.replace(MODULE_EXTENSION, '');

function scriptKindFor(fileName) {
  if (/\.tsx$/.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * Every module specifier `source` names, with how and where it names it:
 * static `import … from` and side-effect `import`, `export … from`,
 * `import x = require()`, `require()`, dynamic `import()`, `typeof import()`,
 * and vitest's `vi.mock` / `vi.doMock` / `vi.unmock` / `vi.doUnmock` /
 * `vi.importActual` / `vi.importMock`. Only literal specifiers are returned — a
 * computed one cannot be resolved statically, and the runtime backstop in
 * tests/setup.db.ts is what catches the mock arriving that way.
 */
export function moduleSpecifiers(source, fileName = 'module.ts') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, scriptKindFor(fileName));
  const found = [];
  const add = (node, kind) => {
    if (!node || !(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    found.push({ specifier: node.text, kind, line: line + 1 });
  };
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, 'import');
    } else if (ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, 'export-from');
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, 'import-require');
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, 'import-type');
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const [first] = node.arguments;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        add(first, 'dynamic-import');
      } else if (ts.isIdentifier(callee) && callee.text === 'require') {
        add(first, 'require');
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        (callee.expression.text === 'vi' || callee.expression.text === 'vitest') &&
        VI_MODULE_CALLS.has(callee.name.text)
      ) {
        add(first, `vi.${callee.name.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * Does `specifier`, written in the repo-relative file `importerRel`, name
 * tests/setup? Relative specifiers resolve against the importer's directory, so
 * `'./setup'` means tests/setup only from a file in tests/ — from tests/db/ it
 * is tests/db/setup, a different module. `/tests/setup` (Vite's root-relative
 * form) and a bare `tests/setup` (what a tsconfig `paths` or `baseUrl` entry
 * would make of it) are treated as repo-relative. Any spelled-out extension is
 * the same module, and a `?query` suffix does not change which file it is.
 */
export function namesMockingSetup(specifier, importerRel, repoRoot = REPO) {
  const request = specifier.replace(/[?#].*$/, '');
  const importerDir = path.posix.dirname(importerRel.split(path.sep).join('/'));
  let target;
  if (request.startsWith('./') || request.startsWith('../')) target = path.posix.join(importerDir, request);
  else if (path.isAbsolute(request) && request.startsWith(`${repoRoot}${path.sep}`)) target = path.relative(repoRoot, request).split(path.sep).join('/');
  else target = path.posix.normalize(request.replace(/^\/+/, ''));
  return target.replace(MODULE_EXTENSION, '') === MOCKING_SETUP_MODULE;
}

/** Every reference in `source` (the repo-relative file `importerRel`) that loads tests/setup. */
export function mockingSetupImports(source, importerRel, repoRoot = REPO) {
  return moduleSpecifiers(source, importerRel).filter(ref => namesMockingSetup(ref.specifier, importerRel, repoRoot));
}

/** Every file under ROOTS whose name ends in the db-test suffix. */
function findDbTests(repoRoot) {
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
      else if (entry.name.endsWith(DB_TEST_SUFFIX)) found.push(path.relative(repoRoot, full));
    }
  };
  for (const root of ROOTS) walk(path.join(repoRoot, root));
  return found.sort();
}

/**
 * Run every check against the tree rooted at `repoRoot`. Returns the db-test
 * files found and the violations; it neither prints nor exits, so the self-test
 * can drive it against a synthetic tree.
 */
export function checkDbTestIsolation(repoRoot = REPO) {
  const failures = [];
  const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

  // ── 1. Mocked configs must exclude the db tests ────────────────────────────
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

  // ── 2. The db-project setup must not mock pg ───────────────────────────────
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
    // Same question as check 3, same answer. The literal this used to look for,
    // './tests/setup.ts', is not how tests/setup.db.ts would ever name its
    // sibling ('./setup'), so the check could not fire.
    for (const ref of source === null ? [] : mockingSetupImports(source, DB_SETUP, repoRoot)) {
      failures.push({
        check: 'db-setup-imports-mocking-setup',
        where: `${DB_SETUP}:${ref.line}`,
        detail:
          `${DB_SETUP} loads ${MOCKING_SETUP} via ${ref.kind} '${ref.specifier}', which would ` +
          'reinstall the pg mock.',
      });
    }
  }

  // ── 3. No db test may import the mocking setup ─────────────────────────────
  const dbTests = findDbTests(repoRoot);
  for (const file of dbTests) {
    // Parsed, not pattern-matched: see moduleSpecifiers above for why.
    for (const ref of mockingSetupImports(read(file), file, repoRoot)) {
      failures.push({
        check: 'db-test-imports-mocking-setup',
        where: `${file}:${ref.line}`,
        detail:
          `${file} loads tests/setup (the mocking setup) via ${ref.kind} '${ref.specifier}'. ` +
          'Loading it executes its `vi.mock(\'pg\')`, so every query in this file would hit a ' +
          `stub. Import '${DB_SETUP}' instead.`,
      });
    }
  }

  // ── 4. The guard must be guarding something ────────────────────────────────
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

  return { dbTests, failures };
}

// ── Report ───────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { dbTests, failures } = checkDbTestIsolation(REPO);
  if (process.argv.includes('--json')) {
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
}
