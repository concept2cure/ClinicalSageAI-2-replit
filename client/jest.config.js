export default {
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@assets/(.*)$': '<rootDir>/../attached_assets/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  testMatch: ['**/__tests__/**/*.(test|spec).{js,jsx,ts,tsx}'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/_archive/',
    '/__tests__/setup.js',
    '/_deprecated/',
    // Vitest-flavored test directories — these `import { vi, describe, it }`
    // from 'vitest', which Jest can't load (CommonJS/ESM mismatch). Vitest
    // already picks them up via its own `client/**/__tests__/**/*.test.ts`
    // include in vitest.config.ts. Adding a path here is the agreed convention
    // for keeping the suite green when a test is written for vitest.
    '/concept2cure/components/ana/__tests__/',
    '/concept2cure/components/shared/__tests__/',
    '/concept2cure/components/editor/__tests__/',
    '/concept2cure/components/projects/__tests__/',
    '/concept2cure/components/workspace/__tests__/',
    '/concept2cure/router/__tests__/',
    '/concept2cure/v2/__tests__/',
    '/concept2cure/insights/',
    '/i18n/__tests__/',
    '/portal-v2/',
    // Translation workspace client tests are vitest-flavored (import from
    // 'vitest'); vitest picks them up via its client/** include.
    '/concept2cure/translation/',
    // Individual vitest-flavored test files outside the listed dirs.
    // Each imports from 'vitest', which Jest can't load. Vitest picks
    // them up via vitest.config.ts's client/** include.
    'LockedModuleCard\\.test\\.tsx$',
    'schemaValidator\\.test\\.ts$',
    'cspNonce\\.test\\.ts$',
    'reportOsClient\\.test\\.ts$',
    'query-options\\.test\\.ts$',
    'LockedModuleCard\\.test\\.tsx$',
    // Auth-token store bridge unit test (utils/__tests__) — vitest + jsdom.
    'authToken\\.test\\.ts$',
  ],
  transformIgnorePatterns: ['/node_modules/(?!wouter)'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          ['@babel/preset-react', { runtime: 'automatic' }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
};
