import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const OUTPUT_DIR = 'test-results/beta-founder-path';

test('510(k) founder beta path: login redirect -> intake -> predicate -> equivalence -> compliance -> editor -> export', async ({
  page,
}) => {
  await mkdir(OUTPUT_DIR, { recursive: true });

  await page.goto('/concept2cure/login?returnTo=%2Fconcept2cure%2Fproject%2Fdemo-510k%2F510k');
  await page.waitForLoadState('networkidle');

  await page.goto('/concept2cure/project/demo-510k/510k');
  await page.waitForLoadState('networkidle');

  const tabs = [
    'device-intake',
    'predicates',
    'equivalence',
    'compliance',
    'document-editor',
    'submission',
  ] as const;

  for (const tab of tabs) {
    await expect(page.getByTestId(`tab-${tab}`)).toBeVisible();
    await page.getByTestId(`tab-${tab}`).click();
    await page.waitForTimeout(250);
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
    await expect(page.getByText(/under development/i)).toHaveCount(0);
    await page.screenshot({
      path: `${OUTPUT_DIR}/founder-path-${tab}.png`,
      fullPage: true,
    });
  }

  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
});
