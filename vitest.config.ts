/// <reference types="vitest" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Suites that require a real, migrated Postgres database (pool init,
// schema, seed). They run green in the DB-backed `Integration Tests` CI
// job (which sets DATABASE_URL and applies migrations) but fail in the
// no-DB unit `Test` job with "Database connection not available". When no
// DATABASE_URL is present we exclude them so the unit lane stays a clean
// signal; the DB lane still runs them, so nothing is hidden.
const DB_BACKED_SUITES = [
  'server/__tests__/services/cortexPrimeService.test.ts',
  'server/__tests__/routes/cortex-threads.runtime.test.ts',
  'server/__tests__/routes/smoke.test.ts',
  'server/services/ana-ri/__tests__/mdx-agent-audit-contract.test.ts',
  'server/services/ana-ri/__tests__/mdx-command-handlers.test.ts',
  'server/services/ana-ri/__tests__/mdx-explain-audit-row.test.ts',
  'tests/document-stack/pdfValidationAttachment.test.ts',
];

const hasDatabaseUrl = Boolean(
  process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_NEON_NEW_SECRET ||
    process.env.NEON_DATABASE_URL
);

const baseExclude = ['node_modules', 'dist', '_archive', '_deprecated', 'tests/e2e/**'];

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
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
    ],
    exclude: hasDatabaseUrl ? baseExclude : [...baseExclude, ...DB_BACKED_SUITES],
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
    testTimeout: 10000,
    hookTimeout: 10000,
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
