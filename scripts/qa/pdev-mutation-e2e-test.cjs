/* Drive a state-change mutation end-to-end through the LIVE UI:
 * Browser → Workstream → click activity → Activity detail State tab →
 * click state chip → ConfirmDialog → fill reason + confirm word →
 * Submit → POST /api/pdev/.../state → row in pdev_program_activities */
const { chromium } = require('/home/user/ClinicalSageAI-2-replit/.claude/skills/gstack/node_modules/playwright');
const BASE = 'http://127.0.0.1:5000';
const AUTH = {
  user: { id: 1, organizationId: 1, email: 'test@c2c.io', firstName: 'Jordan', lastName: 'Chen',
          roles: ['admin'], permissions: ['*'] },
  accessToken: 'test', refreshToken: 'test',
  tokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  const browser = await chromium.launch({
    executablePath: '/tmp/chrome/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(['c', m.text()]); });
  page.on('pageerror', (e) => errs.push(['p', e.message]));

  // Seed auth
  await page.goto(BASE + '/concept2cure/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((a) => {
    for (const [k, v] of Object.entries({
      'trialsage_access_token': a.accessToken, 'trialsage_refresh_token': a.refreshToken,
      'trialsage_token_expiry': a.tokenExpiry, 'trialsage_user': JSON.stringify(a.user),
    })) { sessionStorage.setItem(k, v); localStorage.setItem(k, v); }
    localStorage.setItem('currentOrganizationId', '1');
  }, AUTH);

  console.log('1. Open PDEV');
  await page.goto(BASE + '/concept2cure/?nav=pdev', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('2. Click CMC workstream');
  await page.locator('.pdev-nav-item:has-text("CMC")').first().click();
  await page.waitForTimeout(2000);

  const cardsCount = await page.locator('.pdev-activity-card, .pdev-activity-list-row').count();
  console.log(`   activity cards: ${cardsCount}`);
  await page.screenshot({ path: '/tmp/mut-1-cmc.png' });

  console.log('3. Open activity detail sheet (first card)');
  // Find a NOT_STARTED card (one that doesn't have state pill "Approved"/"In review")
  // Just click the first one
  await page.locator('.pdev-activity-card, .pdev-activity-list-row').first().click();
  await page.waitForTimeout(1500);
  const sheet = await page.evaluate(() => ({
    open: !!document.querySelector('.pdev-sheet'),
    activityKey: document.querySelector('.pdev-sheet-eyebrow')?.textContent?.trim(),
    title: document.querySelector('.pdev-sheet-title')?.textContent?.trim(),
    currentState: document.querySelector('.pdev-sheet .pdev-state-pill')?.textContent?.trim(),
    tabsAvailable: Array.from(document.querySelectorAll('.pdev-sheet-tab[aria-current="page"], .pdev-sheet-tab')).map(t => t.textContent?.replace(/\s+/g, ' ').trim()),
  }));
  console.log(`   sheet:`, JSON.stringify(sheet));
  await page.screenshot({ path: '/tmp/mut-2-sheet.png' });

  console.log('4. Click a state chip (e.g. "In review")');
  // Find a state chip that's not the current one
  const targetChip = page.locator('.pdev-state-chip').filter({ hasText: 'In review' }).first();
  const targetCount = await targetChip.count();
  console.log(`   "In review" chip count: ${targetCount}`);
  if (targetCount === 0) {
    console.log('FAIL: no state chip found');
    await browser.close();
    process.exit(1);
  }
  await targetChip.click();
  await page.waitForTimeout(1000);

  console.log('5. ConfirmDialog should be open');
  const dialog = await page.evaluate(() => ({
    open: !!document.querySelector('.pdev-confirm'),
    title: document.querySelector('.pdev-confirm-title')?.textContent?.trim(),
    target: document.querySelector('.pdev-confirm-target')?.textContent?.trim(),
    reasonRequired: parseInt(document.querySelector('.pdev-confirm-count')?.textContent?.match(/\/ (\d+)/)?.[1] || '0'),
    confirmWord: document.querySelector('.pdev-confirm-word')?.textContent?.trim(),
  }));
  console.log(`   dialog:`, JSON.stringify(dialog));
  await page.screenshot({ path: '/tmp/mut-3-confirm-open.png' });
  if (!dialog.open) {
    console.log('FAIL: confirm dialog not open');
    await browser.close();
    process.exit(1);
  }

  console.log('6. Fill reason + confirm word');
  await page.fill('.pdev-confirm-field textarea', 'Live UI end-to-end verification driven by Playwright + real Chrome — promoting activity through the governed state pipeline to confirm the audit chain entry lands in pdev_program_activities + audit_logs.');
  await page.fill('.pdev-confirm-input', dialog.confirmWord || 'yes');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/mut-4-confirm-filled.png' });

  // Check submit button is enabled now
  const submitState = await page.evaluate(() => {
    const btn = document.querySelector('.pdev-confirm-foot .pdev-btn.primary');
    return { disabled: btn?.disabled, text: btn?.textContent?.trim() };
  });
  console.log(`   submit button:`, JSON.stringify(submitState));

  console.log('7. Click "Confirm and log"');
  const beforeCount = errs.length;
  // Capture the POST request
  const respPromise = page.waitForResponse((r) => r.url().includes('/api/pdev/') && r.url().includes('/state'), { timeout: 10000 }).catch(() => null);
  await page.locator('.pdev-confirm-foot .pdev-btn.primary').click();
  const resp = await respPromise;
  console.log(`   POST response: status=${resp ? resp.status() : 'TIMEOUT'} url=${resp ? resp.url() : 'n/a'}`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/mut-5-after-submit.png' });

  const after = await page.evaluate(() => ({
    dialogClosed: !document.querySelector('.pdev-confirm'),
    sheetState: document.querySelector('.pdev-sheet .pdev-state-pill')?.textContent?.trim(),
    confirmError: document.querySelector('.pdev-confirm-error')?.textContent?.trim() ?? null,
  }));
  console.log(`   after submit:`, JSON.stringify(after));

  const newErrs = errs.length - beforeCount;
  console.log(`\nNew errors during mutation: ${newErrs}`);
  errs.slice(beforeCount).forEach(([t, m]) => console.log(`   [${t}]`, m.slice(0, 200)));

  await browser.close();
  process.exit(resp && resp.status() < 400 && after.dialogClosed ? 0 : 1);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
