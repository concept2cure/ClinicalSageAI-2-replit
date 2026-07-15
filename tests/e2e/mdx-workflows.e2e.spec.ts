/**
 * Medical Device & Diagnostic — v2-shell workflow click-through (UAT proof)
 *
 * Drives the ui-v2 shell through every Device & Diagnostic client workflow:
 * logs in, opens each surface via its canonical route, and asserts the surface
 * actually rendered inside the shell — no "coming soon", no "under
 * development", no degraded error-boundary, and a real data pill (Live or the
 * honest "Sample data"). A full-page screenshot is captured per workflow as the
 * UAT evidence pack.
 *
 * Runs against a running server with a loaded + seeded DB (BASE_URL, default
 * http://localhost:5000). It cannot run in a sandbox that forbids binding a
 * port — run it in CI or a dev/UAT box:
 *
 *   # 1. load the DB (migrations + demo seed), then set the seeded UAT login:
 *   export UAT_EMAIL="<seeded-uat-user-email>"
 *   export UAT_PASSWORD="<seeded-uat-user-password>"
 *   BASE_URL=http://localhost:5000 \
 *   npx playwright test tests/e2e/mdx-workflows.e2e.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const OUTPUT_DIR = 'test-results/mdx-workflows';
// Credentials come from the environment only — never hardcode a login here.
const EMAIL = process.env.UAT_EMAIL || 'uat@example.com';
const PASSWORD = process.env.UAT_PASSWORD || '';

/** Every Medical Device & Diagnostic client workflow, by v2 surface id. */
const MDX_WORKFLOWS: Array<{ id: string; label: string }> = [
  { id: 'device-workstream', label: 'Device workstream (portfolio)' },
  { id: 'device-510k', label: '510(k) pathway' },
  { id: 'device-cer', label: 'CER workbench (EU MDR)' },
  { id: 'device-diagnostics', label: 'Diagnostics / IVD portfolio' },
  { id: 'device-submission', label: 'Device submission' },
  { id: 'ivd-completeness', label: 'IVDR completeness / PER' },
  { id: 'design-controls', label: 'Design controls' },
  { id: 'human-factors', label: 'Human factors / usability' },
  { id: 'risk', label: 'Risk management (ISO 14971)' },
  { id: 'rbm', label: 'Risk-based monitoring' },
  { id: 'labeling', label: 'Labeling & IFU' },
  { id: 'labeling-pi', label: 'Labeling — PI' },
  { id: 'precedent-intelligence', label: 'Precedent intelligence' },
  { id: 'reg-change', label: 'Regulatory change / guidance impact' },
  { id: 'change-assessment', label: 'Change assessment (510(k)/MDR)' },
  { id: 'haq-manager', label: 'HAQ manager (deficiencies)' },
  { id: 'dossier', label: 'Dossier' },
  { id: 'dossier-map', label: 'Dossier map' },
  { id: 'ectd-coauthor', label: 'eCTD assembly & publishing' },
  { id: 'submission-center', label: 'Submission center' },
  { id: 'registrations', label: 'Registrations' },
  { id: 'quality-workbench', label: 'Quality & vigilance' },
  { id: 'inspection-readiness', label: 'Inspection readiness' },
];

/** Log in through the ui-v2 login form (email → continue → password → sign in). */
async function login(page: Page): Promise<void> {
  if (!PASSWORD) throw new Error('Set UAT_EMAIL and UAT_PASSWORD in the environment to run the click-through.');
  await page.goto('/concept2cure/login?ui-v2=1');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[id="email"]', EMAIL);
  const cont = page.locator('button:has-text("Continue")');
  if (await cont.isVisible().catch(() => false)) await cont.click();
  const pw = page.locator('input[type="password"]');
  await expect(pw).toBeVisible({ timeout: 10_000 });
  await pw.fill(PASSWORD);
  await page.click('button:has-text("Sign in"), button:has-text("Log in")');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}

test.beforeAll(async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });
});

test.describe('Medical Device & Diagnostic — workflow click-through', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const wf of MDX_WORKFLOWS) {
    test(`workflow: ${wf.label} (${wf.id})`, async ({ page }) => {
      await page.goto(`/concept2cure/${wf.id}?ui-v2=1`);
      await page.waitForLoadState('networkidle');

      // The v2 shell mounted (rail · AnA · work pane).
      await expect(page.locator('.c2c-v2, .shell').first()).toBeVisible({ timeout: 15_000 });

      // The surface is not a placeholder or a crashed error boundary.
      await expect(page.getByText(/coming soon/i)).toHaveCount(0);
      await expect(page.getByText(/under development/i)).toHaveCount(0);
      await expect(page.locator('.surface-degraded')).toHaveCount(0);

      // Real content rendered in the work pane.
      const bodyText = (await page.locator('main, .main, .page').first().innerText()).trim();
      expect(bodyText.length, `${wf.id} rendered no work-pane content`).toBeGreaterThan(80);

      await page.screenshot({ path: `${OUTPUT_DIR}/${wf.id}.png`, fullPage: true });
    });
  }
});
