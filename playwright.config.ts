import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5000',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  timeout: 60_000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  outputDir: 'test-results/e2e',
});
