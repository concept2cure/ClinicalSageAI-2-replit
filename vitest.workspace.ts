import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Alias targets MUST be absolute. A relative value like './client/src' is
// re-resolved relative to the importing file, so `@/utils/authToken` from
// client/src/concept2cure/.../useAnaChat.ts became
// client/src/concept2cure/.../client/src/utils/authToken and failed to
// resolve — breaking any test that transitively imports client code via `@`.
const alias = {
  '@': path.resolve(__dirname, 'client/src'),
  '@shared': path.resolve(__dirname, 'shared'),
};

export default defineWorkspace([
  // Server + integration tests — need pg mock and setup
  {
    resolve: {
      alias,
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
      alias,
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
