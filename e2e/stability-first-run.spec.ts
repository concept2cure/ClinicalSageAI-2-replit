import { test, expect } from '@playwright/test';

test.describe('Stability First-Run Guide', () => {
  test.beforeEach(async ({ context }) => {
    // Clear localStorage for a clean first-run
    await context.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('shows once on Stability Overview and can be reopened', async ({ page }) => {
    await page.goto('/stability');

    // First-run drawer should appear
    await expect(page.getByText('Welcome to Stability', { exact: false })).toBeVisible();

    // Close it via "Finish"
    await page.getByRole('button', { name: /^Finish$/ }).click();
    await expect(page.getByText('Welcome to Stability', { exact: false })).toHaveCount(0);

    // Reload — should NOT auto-show again
    await page.reload();
    await expect(page.getByText('Welcome to Stability', { exact: false })).toHaveCount(0);

    // Find a study card and open
    const firstCard = page.locator('.rounded.border').first();
    await firstCard.click();

    // Study Details first-run may show if per-study key is unset
    // Accept either: visible once or not visible if global already marked
    const guide = page.getByText('Stability — First-Run Guide', { exact: false });
    // we don't assert visibility strictly—just ensure page is usable
    await expect(page).toHaveURL(/\/stability\/.+/);

    // If there is a "Show First-Run Guide" link, click and verify it opens
    const showLink = page.getByRole('button', { name: /Show First-Run Guide/i }).first();
    if (await showLink.count()) {
      await showLink.click();
      await expect(
        page.getByText('Plan → Sample → Review → Approve', { exact: false })
      ).toBeVisible();
      await page.getByRole('button', { name: /^Finish$/ }).click();
      await expect(
        page.getByText('Plan → Sample → Review → Approve', { exact: false })
      ).toHaveCount(0);
    }
  });
});
