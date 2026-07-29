import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT_ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * Jest and Vitest both live in this repo, and a test file written for Vitest
 * (`import { describe, it, vi } from 'vitest'`) cannot be loaded by Jest at all —
 * it fails the whole SUITE, not just the test.
 *
 * This used to be handled by a hand-maintained list of paths and filenames below.
 * That list is inherently one commit behind: adding a Vitest-flavored test in a
 * directory nobody thought to list turns the entire Jest run red. That is exactly
 * what happened — client/src/concept2cure/quality/__tests__/ChangeControl.test.tsx
 * landed in a new directory, and CI's Test job failed on every commit after it
 * while 122 Jest tests passed around it.
 *
 * So the list is now derived instead of remembered: any test file that imports
 * from 'vitest' is skipped by Jest, because Vitest already picks it up through
 * its own `client/**` include in vitest.config.ts. Nothing to keep in sync, and a
 * new Vitest test can never again break the Jest suite.
 */
function vitestFlavoredTests(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      vitestFlavoredTests(full, acc);
    } else if (/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(e.name)) {
      try {
        if (/from\s+['"]vitest['"]/.test(fs.readFileSync(full, 'utf8'))) acc.push(full);
      } catch {
        /* unreadable — leave it to Jest to report */
      }
    }
  }
  return acc;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VITEST_FLAVORED = vitestFlavoredTests(path.join(CLIENT_ROOT, 'src')).map(
  (f) => `${escapeRegExp(f)}$`,
);

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
    '/portal-v2/',
    // Every Vitest-flavored test, detected by content rather than listed by
    // hand — see vitestFlavoredTests() above for why.
    ...VITEST_FLAVORED,
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
