import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkspace([
  // Server + integration tests — need pg mock and setup
  {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'client/src'),
        '@shared': path.resolve(__dirname, 'shared'),
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
        '@': path.resolve(__dirname, 'client/src'),
        '@shared': path.resolve(__dirname, 'shared'),
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
