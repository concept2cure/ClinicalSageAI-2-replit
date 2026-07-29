/* Live-backend PDEV verification. Real DB, real /api/pdev routes,
 * real Chrome. Walk every PDEV surface + drive a state-change mutation
 * through the ConfirmDialog end-to-end. */
const { chromium } = require('/home/user/ClinicalSageAI-2-replit/.claude/skills/gstack/node_modules/playwright');
const BASE = 'http://127.0.0.1:5000';
const MOCK_AUTH = {
  user: { id: 1, email: 'test@c2c.io', firstName: 'Jordan', lastName: 'Chen',
          organizationId: 1, organizationName: 'Test', roles: ['admin'], permissions: ['*'] },
  accessToken: 'test', refreshToken: 'test',
  tokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  const browser = await chromium.launch({
    executablePath: '/tmp/chrome/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const allErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') allErrors.push({ from: 'console', text: m.text() }); });
  page.on('pageerror', (e) => allErrors.push({ from: 'pageerror', text: e.message }));

  // Seed auth + visit
  await page.goto(BASE + '/concept2cure/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((auth) => {
    for (const [k, v] of Object.entries({
      'trialsage_access_token': auth.accessToken,
      'trialsage_refresh_token': auth.refreshToken,
      'trialsage_token_expiry': auth.tokenExpiry,
      'trialsage_user': JSON.stringify(auth.user),
    })) { sessionStorage.setItem(k, v); localStorage.setItem(k, v); }
    localStorage.setItem('currentOrganizationId', '1');
  }, MOCK_AUTH);

  console.log('═══ PDEV with LIVE backend + 3 seeded IND programs ═══');
  await page.goto(BASE + '/concept2cure/?nav=pdev', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const overview = await page.evaluate(() => ({
    isPdevShell: !!document.querySelector('.pdev-shell'),
    programOptions: Array.from(document.querySelectorAll('.pdev-rail-program-select option')).map(o => o.textContent?.trim()),
    workstreamCards: Array.from(document.querySelectorAll('.pdev-workstream-card')).map(c => ({
      name: c.querySelector('.pdev-workstream-name')?.textContent?.trim(),
      readiness: c.querySelector('.pdev-workstream-readiness')?.textContent?.trim(),
    })),
    readinessScore: document.querySelector('.pdev-readiness-num')?.textContent?.trim(),
    pageTitle: document.querySelector('.pdev-page-title')?.textContent?.trim(),
  }));
  console.log('Overview state:', JSON.stringify(overview, null, 2));
  await page.screenshot({ path: '/tmp/c2c-pdev-LIVE-overview.png' });

  // Walk through PDEV nav with real data
  console.log('\n--- clicking workstreams ---');
  for (const ws of ['CMC', 'Nonclinical', 'Clinical', 'Regulatory']) {
    const before = allErrors.length;
    const btn = page.locator(`.pdev-nav-item:has-text("${ws}")`).first();
    await btn.click();
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => ({
      title: document.querySelector('.pdev-page-title')?.textContent?.trim(),
      activityCards: document.querySelectorAll('.pdev-activity-card, .pdev-activity-list-row').length,
      stageNodes: document.querySelectorAll('.pdev-stage-node').length,
    }));
    const newErrors = allErrors.length - before;
    console.log(`  ${ws.padEnd(12)} title="${info.title}" activities=${info.activityCards} stages=${info.stageNodes} +${newErrors} errors`);
  }
  await page.screenshot({ path: '/tmp/c2c-pdev-LIVE-cmc.png' });

  console.log('\n--- IND assembly + FDA + contradictions ---');
  for (const surface of ['IND assembly', 'FDA interactions', 'Contradictions']) {
    const before = allErrors.length;
    const btn = page.locator(`.pdev-nav-item:has-text("${surface}")`).first();
    await btn.click();
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => ({
      title: document.querySelector('.pdev-page-title')?.textContent?.trim(),
      sections: document.querySelectorAll('.pdev-section').length,
      bodyStart: (document.body.innerText || '').slice(0, 100).replace(/\n/g, ' | '),
    }));
    const newErrors = allErrors.length - before;
    console.log(`  ${surface.padEnd(18)} title="${info.title}" sections=${info.sections} +${newErrors} errors`);
  }
  await page.screenshot({ path: '/tmp/c2c-pdev-LIVE-assembly.png' });

  console.log('\n--- Activity detail sheet + state-change mutation ---');
  // Go back to CMC workstream
  await page.locator('.pdev-nav-item:has-text("CMC")').first().click();
  await page.waitForTimeout(1500);
  const cards = await page.locator('.pdev-activity-card').count();
  console.log(`  activity cards: ${cards}`);
  if (cards > 0) {
    await page.locator('.pdev-activity-card').first().click();
    await page.waitForTimeout(1200);
    const sheet = await page.evaluate(() => ({
      sheetOpen: !!document.querySelector('.pdev-sheet'),
      title: document.querySelector('.pdev-sheet-title')?.textContent?.trim(),
      tabs: Array.from(document.querySelectorAll('.pdev-sheet-tab')).map(t => t.textContent?.replace(/\s+/g, ' ').trim()),
      stateChips: document.querySelectorAll('.pdev-state-chip').length,
    }));
    console.log('  sheet:', JSON.stringify(sheet, null, 2));
    await page.screenshot({ path: '/tmp/c2c-pdev-LIVE-activity-sheet.png' });

    // Click a state chip (NOT the current one) to trigger ConfirmDialog
    console.log('\n--- triggering state-change ConfirmDialog ---');
    const beforeMutation = allErrors.length;
    const stateChip = page.locator('.pdev-state-chip:not(:disabled):not(.on)').first();
    const chipCount = await stateChip.count();
    console.log(`  available state chips to click: ${chipCount}`);
    if (chipCount > 0) {
      await stateChip.click();
      await page.waitForTimeout(800);
      const dialog = await page.evaluate(() => ({
        open: !!document.querySelector('.pdev-confirm'),
        title: document.querySelector('.pdev-confirm-title')?.textContent?.trim(),
        target: document.querySelector('.pdev-confirm-target')?.textContent?.trim(),
        confirmWord: document.querySelector('.pdev-confirm-word')?.textContent?.trim(),
      }));
      console.log('  dialog:', JSON.stringify(dialog));
      await page.screenshot({ path: '/tmp/c2c-pdev-LIVE-confirm-open.png' });

      // Fill the reason + confirm word
      await page.fill('.pdev-confirm-field textarea', 'End-to-end live verification — testing the governed state-change mutation through to audit chain');
      await page.fill('.pdev-confirm-input', 'yes');
      await page.waitForTimeout(400);
      await page.screenshot({ path: '/tmp/c2c-pdev-LIVE-confirm-filled.png' });

      // Click "Confirm and log"
      const submitBtn = page.locator('.pdev-confirm-foot button.pdev-btn.primary');
      console.log('  submitting...');
      await submitBtn.click();
      await page.waitForTimeout(2500);

      // What happened?
      const afterMutation = await page.evaluate(() => ({
        dialogStillOpen: !!document.querySelector('.pdev-confirm'),
        sheetStillOpen: !!document.querySelector('.pdev-sheet'),
        hasError: !!document.querySelector('.pdev-confirm-error')?.textContent,
        errorText: document.querySelector('.pdev-confirm-error')?.textContent?.trim() ?? null,
      }));
      console.log('  after submit:', JSON.stringify(afterMutation));
      await page.screenshot({ path: '/tmp/c2c-pdev-LIVE-after-confirm.png' });

      const mutationErrors = allErrors.length - beforeMutation;
      console.log(`  errors during mutation: ${mutationErrors}`);
    }
  }

  // Filter known noise
  const KNOWN = [/ERR_CERT_AUTHORITY_INVALID/, /TenantContext/, /HTTP 404|404 \(Not Found\)/i, /Failed to load resource.*404/i, /the server responded with a status of 404/, /Unexpected token '<'/, /Manifest.*could not be fetched|robots\.txt/, /\/api\/mdx\//]; // MDX API still 404
  const realErrors = allErrors.filter((e) => !KNOWN.some((re) => re.test(e.text)));
  console.log('\n═══ ERROR SUMMARY ═══');
  console.log('Total observed:', allErrors.length);
  console.log('Real:', realErrors.length);
  realErrors.slice(0, 15).forEach((e, i) => console.log(`  E${i + 1} [${e.from}]`, e.text.slice(0, 240)));

  await browser.close();
  process.exit(realErrors.length > 0 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
