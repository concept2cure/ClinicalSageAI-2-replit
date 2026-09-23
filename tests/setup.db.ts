/**
 * Test setup for the REAL-DATABASE suite (`*.dbtest.ts`, vitest.db.config.ts).
 *
 * ── Why this file exists, and why it is not tests/setup.ts ───────────────────
 * `tests/setup.ts` installs a process-wide `vi.mock('pg')` for every one of the
 * ~1,600 files in the default project. That mock is correct there — unit tests
 * should not need a database — but it was also in force in the CI job that
 * stands up a real PostgreSQL service and calls itself "Integration Tests".
 * In that job `new Pool().query(...)` resolved to `{ rows: [], rowCount: 0 }`
 * without a packet ever reaching the server, so the suite proved nothing about
 * the schema, the tenant predicates, or the SQL the routes actually issue —
 * while reporting green. Every empty result read as "no rows", which is
 * indistinguishable from "the query was never run".
 *
 * So the mock is not weakened here; it is SCOPED. Real-database tests live in a
 * separate vitest project with a separate setup file (this one), and every
 * `*.dbtest.ts` file is excluded from the mocked project so the two can never
 * overlap. `scripts/ci/check-db-test-isolation.mjs` fails the build if that
 * separation is ever undone.
 *
 * ── Fail closed, never skip ──────────────────────────────────────────────────
 * The failure mode this suite exists to prevent is a database test that quietly
 * does not run. A `describe.skipIf(!process.env.DATABASE_URL)` would reproduce
 * exactly that: green output, zero coverage, no signal. So an unreachable or
 * placeholder database is a hard error here, not a skip.
 *
 * ── RLS_ENFORCE=on by default ────────────────────────────────────────────────
 * Production hard-requires `RLS_ENFORCE=on`, and until this project existed no
 * CI job ran a single test in that mode. This suite defaults to it, so the mode
 * production mandates is the mode the database tests exercise.
 */

import { Pool } from 'pg';
import { vi, beforeAll, afterAll } from 'vitest';

/**
 * The placeholder `tests/setup.ts` assigns when DATABASE_URL is unset. Nothing
 * listens on it; against the mocked pool that never mattered. Reaching this
 * suite with the sentinel still set means the environment was not configured,
 * which must be an error rather than a connection timeout 30 seconds later.
 */
const SENTINEL_DATABASE_URLS = new Set([
  'postgresql://test:test@localhost:5432/test',
  'postgres://user:pass@localhost:5432/testdb',
]);

/** Resolve the owner/admin URL these tests provision and clean up with. */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = (env.TEST_DATABASE_URL || env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error(
      '[db-suite] TEST_DATABASE_URL (or DATABASE_URL) must point at a real, disposable ' +
        'PostgreSQL database. This suite runs real SQL; it has no mock to fall back to.'
    );
  }
  if (SENTINEL_DATABASE_URLS.has(url)) {
    throw new Error(
      `[db-suite] DATABASE_URL is still the unit-test placeholder ("${url}"). That value ` +
        'exists so the mocked pool can be constructed; nothing listens on it. Point this ' +
        'suite at a real database.'
    );
  }
  return url;
}

// The URL must resolve before any test module is imported — a missing value is
// a configuration error, and it should read as one rather than as 40 identical
// connection failures.
const databaseUrl = resolveTestDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// The mode production mandates. Explicit rather than inherited so a test that
// asserts enforcement behavior cannot pass because the runner happened to be
// invoked with it unset.
process.env.RLS_ENFORCE = process.env.RLS_ENFORCE || 'on';

// server/db/runtime.ts opens a pool at import time and, without this, runs a
// startup connectivity probe that is not this suite's subject.
process.env.SKIP_DB_STARTUP_TEST = process.env.SKIP_DB_STARTUP_TEST || 'true';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-db-tests-min-32-chars-long';
// verifyJwtWithRotation prefers JWT_SECRET_DEV over JWT_SECRET when
// NODE_ENV=test. A developer's .env (loaded lazily by server imports, which
// never override already-set vars) typically carries a different
// JWT_SECRET_DEV, so without pinning it here every token a db suite mints
// with JWT_SECRET fails verification as a blanket 401. tests/setup.ts already
// pins it for unit tests; the db lane needs the same.
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET_DEV || process.env.JWT_SECRET;

beforeAll(async () => {
  // ── The load-bearing assertion of this whole project ──────────────────────
  // If `vi.mock('pg')` ever reaches these files — a stray import of
  // tests/setup.ts, a merged vitest config, a globalSetup — every test below
  // would pass against `{ rows: [], rowCount: 0 }` and prove nothing. That is
  // the exact defect this suite was built to end, so it is checked before any
  // test runs rather than left to a CI guard alone.
  if (vi.isMockFunction(Pool)) {
    throw new Error(
      '[db-suite] `pg` is MOCKED in the real-database project. Every query below would ' +
        'return an empty result set and pass. Check that vitest.db.config.ts does not load ' +
        'tests/setup.ts and that no test file imports it.'
    );
  }

  // Prove the database is genuinely reachable once, with a clear message,
  // instead of letting each test fail separately on a connection timeout.
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  try {
    const result = await pool.query('SELECT 1 AS ok');
    if (result.rows[0]?.ok !== 1) {
      throw new Error(
        `[db-suite] SELECT 1 returned ${JSON.stringify(result.rows)} — the pool is not ` +
          'talking to a real PostgreSQL server.'
      );
    }
  } catch (error) {
    await pool.end().catch(() => {/* already broken */});
    throw new Error(
      `[db-suite] cannot reach the test database. This suite fails rather than skips, ` +
        `because a database test that silently does not run is the defect it exists to ` +
        `prevent. Underlying error: ${(error as Error).message}`,
      { cause: error }
    );
  }

  /* ── The role must be able to MINT the runtime role ────────────────────────
     Checked AFTER reachability and outside its catch, because the database is
     reachable in this case — reporting it as "cannot reach the test database"
     would send the reader after the wrong fault.

     createScratchSchema (tests/db/harness.ts) provisions a throwaway
     non-superuser login role through the real provision-app-role.mjs, because
     a harness that re-implements the thing under test agrees with itself and
     not with production. That needs CREATEROLE.

     Without this check the suite does not fail with one configuration error:
     22 of its 41 files die at import with a serialized pg object whose only
     readable part is `code: '42501'`, and the run still reports 149 passing —
     which reads like a mostly-working suite rather than one that could not
     start. Measured on a container whose DATABASE_URL role owned the tables
     but was not a superuser (2026-09-23). It matters because this is the lane
     that catches what a mocked pool cannot: the regression that motivated the
     check reached main while this lane looked half-green. */
  try {
    const { rows } = await pool.query<{ role: string; canCreateRole: boolean }>(
      `SELECT current_user AS role,
              (rolsuper OR rolcreaterole) AS "canCreateRole"
         FROM pg_roles WHERE rolname = current_user`,
    );
    const role = rows[0];
    if (role && !role.canCreateRole) {
      throw new Error(
        `[db-suite] the database role "${role.role}" has neither SUPERUSER nor CREATEROLE, so ` +
          'the harness cannot mint the throwaway non-superuser runtime role every ' +
          'tenant-isolation test connects as. Point TEST_DATABASE_URL at a role that can — ' +
          'the owner/admin credentials the migrations run under — and leave DATABASE_URL as ' +
          'the application role:\n' +
          '  TEST_DATABASE_URL=postgresql://<admin>:<pw>@<host>/<db> npm run test:db',
      );
    }
  } finally {
    await pool.end();
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

export { databaseUrl };
