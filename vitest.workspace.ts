import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // Server + integration tests — need pg mock and setup
  {
    resolve: {
      alias: {
        '@': './client/src',
        '@shared': './shared',
      },
    },
    test: {
      name: 'server',
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
      ],
      exclude: ['node_modules', 'dist', '_archive', '_deprecated', 'tests/e2e/**'],
      testTimeout: 10000,
      hookTimeout: 10000,
    },
  },
  // Client unit tests — no server mocks, clean ESM
  {
    resolve: {
      alias: {
        '@': './client/src',
        '@shared': './shared',
      },
    },
    test: {
      name: 'client',
      globals: true,
      environment: 'node',
      include: ['client/**/__tests__/**/*.test.ts'],
      exclude: ['node_modules', 'dist', '_archive', '_deprecated'],
      testTimeout: 10000,
      hookTimeout: 10000,
    },
  },
]);
