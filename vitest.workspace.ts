import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Aliases MUST be absolute. Relative aliases ('./client/src') are not rewritten
// when resolving imports from deeply-nested modules, so a client component
// importing '@/utils/authToken' failed to resolve and broke the client smoke
// tests. (vitest: "Use absolute paths instead.")
const alias = {
  '@': path.resolve(rootDir, 'client/src'),
  '@shared': path.resolve(rootDir, 'shared'),
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
