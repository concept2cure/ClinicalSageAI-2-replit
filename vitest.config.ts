/// <reference types="vitest" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
      // Bare `shared/...` imports (used by 14+ server modules) resolve via
      // tsconfig `baseUrl` for tsc; mirror that here so vitest can import them.
      shared: path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.spec.ts',
      'tests/**/*.test.tsx',
      'tests/**/*.spec.tsx',
      'server/**/__tests__/**/*.test.ts',
      'server/**/__tests__/**/*.spec.ts',
      'client/**/__tests__/**/*.test.ts',
      'client/**/__tests__/**/*.test.tsx',
      'client/**/__tests__/**/*.test.jsx',
      'shared/**/__tests__/**/*.test.ts',
    ],
    // `*.dbtest.ts` belongs to vitest.db.config.ts, which runs against a real
    // PostgreSQL server. This config's setupFiles mock `pg` process-wide, so a
    // database test picked up here would query a stub that answers
    // `{ rows: [], rowCount: 0 }` and pass without opening a socket — the exact
    // defect the split exists to end. Pinned by ci:db-test-isolation.
    exclude: [
      'node_modules',
      'dist',
      '_archive',
      '_deprecated',
      'tests/e2e/**',
      '**/*.dbtest.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        '_archive',
        '_deprecated',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        '**/index.ts',
      ],
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 70,
        statements: 70,
      },
    },
    // testTimeout stays tight ON PURPOSE. Most of the suite is fast unit tests
    // where a 10s test really is a defect, and the 39 PGlite files that need
    // longer already pass an explicit per-test timeout (`it(..., 60_000)`).
    testTimeout: 10000,

    // ── hookTimeout is the one that had to move, and only it ─────────────────
    // 113 test files boot a PGlite (WASM Postgres) instance and apply real
    // migrations, and they do it in `beforeAll`/`beforeEach` — where a per-test
    // `it(..., 60_000)` does NOT apply. 112 of those 113 left their hooks on this
    // default, so the expensive half of every PGlite suite was running on a 10s
    // budget regardless of what its tests declared.
    //
    // That is invisible until the suite gets big. `singleFork` below runs every
    // file in ONE long-lived process, so PGlite instances accumulate and later
    // files boot more slowly — which makes a failure depend on how many OTHER
    // files are in the run rather than on the test itself. Observed: a 75-file
    // run failed two schema-contract files whose boot hook ran ~10.8s and
    // ~12.4s; a 141-file run failed two DIFFERENT route files with an explicit
    // "Hook timed out in 10000ms"; both sets passed in isolation and in a
    // 49-file run. Different files each time is the signature of a budget that
    // is too tight, not of a defect.
    //
    // 60s gives real headroom on slower CI hardware while staying far below
    // anything that reads as "hung" — and a genuinely hung hook is caught by the
    // CI job timeout, which is the right layer for "this never finishes".
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    reporters: ['verbose'],
    watch: false,
  },
});
