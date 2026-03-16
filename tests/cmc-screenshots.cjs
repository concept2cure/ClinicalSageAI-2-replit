/**
 * CMC Meeting Screenshot Package
 * Takes high-quality screenshots of the best CMC tabs for the meeting
 */
const { chromium } = require('playwright');

const SCREENSHOT_TABS = [
  { id: 'dashboard', label: 'Dashboard', file: 'cmc-01-dashboard' },
  { id: 'analytical', label: 'Analytical', file: 'cmc-02-analytical' },
  { id: 'process', label: 'Process', file: 'cmc-03-process' },
  { id: 'stability', label: 'Stability', file: 'cmc-04-stability' },
  { id: 'quality', label: 'Quality', file: 'cmc-05-quality' },
  { id: 'regulatory', label: 'Regulatory', file: 'cmc-06-regulatory' },
  { id: 'manufacturing', label: 'Manufacturing', file: 'cmc-07-manufacturing' },
  { id: 'supply-chain', label: 'Supply Chain', file: 'cmc-08-supply-chain' },
  { id: 'intelligence', label: 'AI Intelligence', file: 'cmc-09-intelligence' },
  { id: 'risk', label: 'Risk Management', file: 'cmc-10-risk' },
  { id: 'audit', label: 'Audit & Docs', file: 'cmc-11-audit' },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Login
  console.log('Logging in...');
  await page.goto('http://localhost:5000/concept2cure/login', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.locator('button:has-text("Quick Demo Access")').click();
  await page.waitForURL('**/concept2cure**', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Screenshot: Shell navigation (before entering CMC)
  await page.screenshot({ path: '/tmp/cmc-00-shell-nav.png' });
  console.log('  Saved: cmc-00-shell-nav.png');

  // Navigate to CMC
  await page.locator('button:has-text("CMC Platform")').first().click();
  await page.waitForSelector('[data-testid="cmc-comprehensive-tabs"]', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Screenshot each tab
  for (const tab of SCREENSHOT_TABS) {
    await page.locator(`[data-testid="tab-${tab.id}"]`).first().scrollIntoViewIfNeeded();
    await page.locator(`[data-testid="tab-${tab.id}"]`).first().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `/tmp/${tab.file}.png` });
    console.log(`  Saved: ${tab.file}.png`);
  }

  // Dashboard full-page screenshot (scrolled)
  await page.locator('[data-testid="tab-dashboard"]').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/cmc-12-dashboard-full.png', fullPage: true });
  console.log('  Saved: cmc-12-dashboard-full.png (full page)');

  await browser.close();
  console.log('\nAll screenshots saved to /tmp/cmc-*.png');
  console.log('Total: 13 screenshots');
})();
