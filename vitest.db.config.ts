/// <reference types="vitest" />
/**
 * Vitest project for tests that run against a REAL PostgreSQL server.
 *
 * Separate from vitest.config.ts for one reason: that config's setup file
 * installs a process-wide `vi.mock('pg')`, which turned the DB-backed CI job
 * into a suite that never opened a socket (see tests/setup.db.ts for the full
 * account). Configs are the only place vitest lets a mock be scoped by file, so
 * the split is structural rather than conditional: every `*.dbtest.ts` file is
 * excluded from the mocked config and included only here.
 *
 * Run:  npm run test:db   (requires TEST_DATABASE_URL or DATABASE_URL)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // server/middleware/auth WAS a live .js/.ts shadow pair (KNOWN_ISSUES_LEDGER
      // M-5): Vite's extension order preferred the legacy auth.js while tsx and
      // esbuild ran auth.ts, so this lane carried an alias pinning the extensionless
      // import to auth.ts. The M-5 consolidation made auth.js a pure re-export shim
      // of auth.ts, so every resolver — this one included — executes the canonical
      // middleware and the alias is gone. If the WO-03 proof ever fails with
      // REQUEST_DB_CONTEXT_REQUIRED again, suspect auth.js regrowing logic.
      { find: '@', replacement: path.resolve(__dirname, 'client/src') },
      { find: '@shared', replacement: path.resolve(__dirname, 'shared') },
      { find: 'shared', replacement: path.resolve(__dirname, 'shared') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    // NOT tests/setup.ts. That file mocks pg; loading it here would defeat the
    // entire purpose of this project.
    setupFiles: ['./tests/setup.db.ts'],
    // Written as a literal, not a shared const: scripts/ci/check-unrun-tests.mjs
    // parses the `include:` array straight out of this file so it can tell
    // whether a `*.dbtest.ts` is reachable by any runner. A const reference
    // would read as an empty glob list there and make every database test look
    // unrun — or, worse, look fine while being neither run nor reported.
    include: ['tests/db/**/*.dbtest.ts', 'server/**/__tests__/**/*.dbtest.ts'],
    exclude: ['node_modules', 'dist', '_archive', '_deprecated'],
    // Real round-trips, role provisioning and DDL are slower than a stub, and a
    // cold connection to a container-hosted Postgres can take a few seconds.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // These tests create and drop roles, which are CLUSTER-global (not
    // schema-scoped), so two files running at once would fight over them.
    // `fileParallelism: false` is the Vitest 4 spelling; `poolOptions.forks
    // .singleFork` was removed in v4 and is silently ignored there.
    pool: 'forks',
    fileParallelism: false,
    reporters: ['verbose'],
    watch: false,
  },
});
