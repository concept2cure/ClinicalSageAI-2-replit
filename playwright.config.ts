import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.e2e.ts', '**/*.spec.ts'],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  outputDir: 'test-results/e2e',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        },
      },
    },
  ],
});
