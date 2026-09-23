/**
 * Self-test for the db-test-isolation guard (scripts/ci/check-db-test-isolation.mjs).
 *
 * The guard's check #3 asks one question of every `*.dbtest.ts` file: does it
 * load `tests/setup.ts`, the setup that installs `vi.mock('pg')`? An earlier
 * version answered it with a regex over the whole file — "any quoted string
 * ending in `/setup`" — and got it wrong in both directions:
 *
 *   • it flagged tests/db/second-factor-binding.dbtest.ts and
 *     tests/db/sign-in-posture.dbtest.ts, which import `../setup.db` exactly as
 *     they should, because they POST to the route `'/api/auth/mfa/setup'`. A
 *     URL is not a module specifier. That false alarm held CI red.
 *   • it passed `import '../setup.ts'` and `import '../setup.js'`, because the
 *     quoted string has to END at `setup`. Those load the mock just as surely.
 *
 * So every case below is either a shape a real db test has (and must not be
 * flagged for), or a spelling of loading the mocking setup (and must be). All
 * of them run against synthetic sources and a synthetic tree in a temp dir;
 * nothing here reads the repo's own tests, so the suite cannot go red because a
 * db test was renamed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkDbTestIsolation, mockingSetupImports } from '../check-db-test-isolation.mjs';

const specifiersFlagged = (source, importer = 'tests/db/example.dbtest.ts') =>
  mockingSetupImports(source, importer).map(ref => ref.specifier);

// The shape of tests/db/second-factor-binding.dbtest.ts and
// tests/db/sign-in-posture.dbtest.ts — the two files the regex flagged.
const ROUTE_TEST = `/**
 * POST /api/auth/mfa/setup issued a new TOTP secret to any signed-in session.
 * (A db test must never write: import '../setup';)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { runWithTenantScope } from '../../server/db/tenantStore';

// Through the functions /api/auth/mfa/setup, /enable and /disable call.
describe('a signed-in session cannot take over an enrolled second factor', () => {
  it('refuses', async () => {
    const res = await request(app).post('/api/auth/mfa/setup').set(auth).send({});
    const ent = await request(app).post('/api/auth/enterprise/mfa/setup').set(auth).send({});
    const tmpl = await request(app).post(\`/api/auth/\${kind}/setup\`).send({});
    const redirect = { location: '../setup', label: "./setup" };
    expect(await recorded(m)).toContain('user_mfa_setup|failure|already_enrolled');
  });
});
`;

test('a db test that POSTs to /api/auth/mfa/setup is not flagged (the false positive that held CI red)', () => {
  assert.deepEqual(specifiersFlagged(ROUTE_TEST), []);
});

test('string literals that merely LOOK like the specifier are not flagged outside an import position', () => {
  const source = [
    "const route = '/api/auth/mfa/setup';",
    "const where = '../setup';",
    'const tmpl = `../setup`;',
    "expect(path.basename('tests/setup')).toBe('setup');",
    "logger.info('require(\\'../setup\\')');",
  ].join('\n');
  assert.deepEqual(specifiersFlagged(source), []);
});

test('mentions in comments are not flagged', () => {
  const source = [
    "// import '../setup';",
    "/* require('../setup') */",
    '/**',
    " * vi.mock('../setup')",
    ' */',
    "import { databaseUrl } from '../setup.db'; // not '../setup'",
  ].join('\n');
  assert.deepEqual(specifiersFlagged(source), []);
});

test('the real-database setup, and modules that are not tests/setup, are not flagged', () => {
  const source = [
    "import { databaseUrl } from '../setup.db';",
    "import { databaseUrl as u2 } from '../setup.db.ts';",
    "import { a } from '../../server/routes/setup';", // server/routes/setup — a different module
    "import { b } from './setup';", // tests/db/setup — not tests/setup
    "import c from 'setup';", // a package, not a path
    "import { d } from '@/setup';", // client/src/setup via the @ alias
    "import { e } from '../setup-helpers';",
    "import { f } from '../fixtures/setup';",
  ].join('\n');
  assert.deepEqual(specifiersFlagged(source), []);
});

// Every way a db test can load the mocking setup. `importer` is where the file
// sits, because a relative specifier only means tests/setup from the right place.
const LOADS_MOCKING_SETUP = [
  // static imports, every clause shape
  ['tests/db/a.dbtest.ts', "import '../setup';", '../setup'],
  ['tests/db/a.dbtest.ts', 'import "../setup";', '../setup'],
  ['tests/db/a.dbtest.ts', "import '../setup.ts';", '../setup.ts'],
  ['tests/db/a.dbtest.ts', "import '../setup.js';", '../setup.js'],
  ['tests/db/a.dbtest.ts', "import '../setup.mjs';", '../setup.mjs'],
  ['tests/db/a.dbtest.ts', "import { x } from '../setup';", '../setup'],
  ['tests/db/a.dbtest.ts', "import * as setup from '../setup';", '../setup'],
  ['tests/db/a.dbtest.ts', "import setup, { y } from '../setup.ts';", '../setup.ts'],
  ['tests/db/a.dbtest.ts', "import type { T } from '../setup';", '../setup'],
  ['tests/db/a.dbtest.ts', "import {\n  a,\n  b,\n} from '../setup';", '../setup'],
  ['tests/db/a.dbtest.ts', "import setup = require('../setup');", '../setup'],
  // re-exports
  ['tests/db/a.dbtest.ts', "export * from '../setup';", '../setup'],
  ['tests/db/a.dbtest.ts', "export { z } from '../setup.js';", '../setup.js'],
  // runtime loads
  ['tests/db/a.dbtest.ts', "const s = require('../setup');", '../setup'],
  ['tests/db/a.dbtest.ts', "beforeAll(async () => { await import('../setup'); });", '../setup'],
  ['tests/db/a.dbtest.ts', 'await import(`../setup.ts`);', '../setup.ts'],
  ['tests/db/a.dbtest.ts', "type S = typeof import('../setup');", '../setup'],
  // vitest's module APIs — an automock or importActual evaluates the module
  ['tests/db/a.dbtest.ts', "vi.mock('../setup');", '../setup'],
  ['tests/db/a.dbtest.ts', "vi.doMock('../setup', () => ({}));", '../setup'],
  ['tests/db/a.dbtest.ts', "const real = await vi.importActual('../setup');", '../setup'],
  ['tests/db/a.dbtest.ts', "const auto = await vi.importMock('../setup');", '../setup'],
  // every path that reaches tests/setup from wherever the file sits
  ['tests/a.dbtest.ts', "import './setup';", './setup'],
  ['tests/a.dbtest.ts', "import './setup.ts';", './setup.ts'],
  ['tests/db/a.dbtest.ts', "import '../../tests/setup';", '../../tests/setup'],
  ['tests/db/a.dbtest.ts', "import '../db/../setup';", '../db/../setup'],
  ['tests/db/nested/a.dbtest.ts', "import '../../setup';", '../../setup'],
  ['server/db/__tests__/a.dbtest.ts', "import '../../../tests/setup.ts';", '../../../tests/setup.ts'],
  ['tests/db/a.dbtest.ts', "import '/tests/setup';", '/tests/setup'],
  ['tests/db/a.dbtest.ts', "import 'tests/setup';", 'tests/setup'],
];

for (const [importer, source, specifier] of LOADS_MOCKING_SETUP) {
  test(`flags ${importer}: ${source.replace(/\n\s*/g, ' ')}`, () => {
    assert.deepEqual(specifiersFlagged(source, importer), [specifier]);
  });
}

test('an absolute path into the repo names tests/setup; one outside it does not', () => {
  const importer = 'tests/db/a.dbtest.ts';
  assert.deepEqual(mockingSetupImports("import '/repo/tests/setup.ts';", importer, '/repo').length, 1);
  assert.deepEqual(mockingSetupImports("import '/elsewhere/tests/setup.ts';", importer, '/repo'), []);
});

test('a flagged reference carries its line and how it was loaded', () => {
  const source = "import express from 'express';\n\nimport { x } from '../setup';\n";
  const [ref] = mockingSetupImports(source, 'tests/db/a.dbtest.ts');
  assert.equal(ref.line, 3);
  assert.equal(ref.kind, 'import');
});

test('every load in a file is reported, not only the first', () => {
  const source = "import '../setup';\nconst s = require('../setup.js');\nvi.mock('../setup.ts');\n";
  assert.deepEqual(specifiersFlagged(source), ['../setup', '../setup.js', '../setup.ts']);
});

// ── End to end: the checks as wired, against a synthetic tree ────────────────
const MOCKED_CONFIG = `import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    exclude: ['node_modules', '**/*.dbtest.ts'],
  },
});
`;
const DB_CONFIG = `/**
 * Deliberately does NOT load tests/setup.ts.
 */
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { setupFiles: ['./tests/setup.db.ts'], include: ['tests/db/**/*.dbtest.ts'] },
});
`;
const DB_SETUP = `/** If vi.mock('pg') ever reaches this file, throw. */
import { Pool } from 'pg';
export const databaseUrl = process.env.TEST_DATABASE_URL;
`;

function fixtureTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-isolation-'));
  const all = {
    'vitest.config.ts': MOCKED_CONFIG,
    'vitest.workspace.ts': 'export default [];\n',
    'vitest.db.config.ts': DB_CONFIG,
    'tests/setup.ts': "import { vi } from 'vitest';\nvi.mock('pg');\n",
    'tests/setup.db.ts': DB_SETUP,
    ...files,
  };
  for (const [rel, content] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

test('end to end: a tree whose db tests POST to /setup routes passes', () => {
  const root = fixtureTree({
    'tests/db/second-factor-binding.dbtest.ts': ROUTE_TEST,
    'tests/db/sign-in-posture.dbtest.ts': ROUTE_TEST,
  });
  const { dbTests, failures } = checkDbTestIsolation(root);
  assert.equal(dbTests.length, 2);
  assert.deepEqual(failures, []);
});

test('end to end: a db test that loads the mocking setup fails, named by file and line', () => {
  const root = fixtureTree({
    'tests/db/fine.dbtest.ts': ROUTE_TEST,
    'tests/db/mocked.dbtest.ts': `import { it } from 'vitest';\nimport '../setup.ts';\nit('x', () => {});\n`,
  });
  const { failures } = checkDbTestIsolation(root);
  assert.deepEqual(
    failures.map(f => [f.check, f.where]),
    [['db-test-imports-mocking-setup', 'tests/db/mocked.dbtest.ts:2']]
  );
});

test('end to end: tests/setup.db.ts loading the mocking setup fails', () => {
  const root = fixtureTree({
    'tests/db/fine.dbtest.ts': ROUTE_TEST,
    'tests/setup.db.ts': `${DB_SETUP}import './setup';\n`,
  });
  const { failures } = checkDbTestIsolation(root);
  assert.deepEqual(failures.map(f => f.check), ['db-setup-imports-mocking-setup']);
});

test('end to end: the other checks still fire (missing exclude, pg mocked in db setup, no db tests)', () => {
  const root = fixtureTree({
    'vitest.config.ts': MOCKED_CONFIG.replace(", '**/*.dbtest.ts'", ''),
    'tests/setup.db.ts': `${DB_SETUP}vi.mock('pg');\n`,
  });
  const { failures } = checkDbTestIsolation(root);
  assert.deepEqual(failures.map(f => f.check).sort(), ['db-setup-mocks-pg', 'missing-exclude', 'no-db-tests']);
});
