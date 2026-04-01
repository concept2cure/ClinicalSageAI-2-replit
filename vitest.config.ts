/// <reference types="vitest" />
export default {
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
    exclude: ['node_modules', 'dist', '_archive', '_deprecated', 'tests/e2e/**'],
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
};
