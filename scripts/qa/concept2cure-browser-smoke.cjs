/* eslint-disable */
const { chromium } = require('/home/user/ClinicalSageAI-2-replit/.claude/skills/gstack/node_modules/playwright');
const BASE = 'http://127.0.0.1:5173';
const MOCK_AUTH = {
  user: { id: 'u-test', email: 'test@c2c.io', firstName: 'Jordan', lastName: 'Chen',
          organizationId: 1, organizationName: 'Test', roles: ['admin'], permissions: ['*'] },
  accessToken: 'test', refreshToken: 'test',
  tokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
};

async function seedAuth(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((auth) => {
    for (const [k, v] of Object.entries({
      'trialsage_access_token': auth.accessToken,
      'trialsage_refresh_token': auth.refreshToken,
      'trialsage_token_expiry': auth.tokenExpiry,
      'trialsage_user': JSON.stringify(auth.user),
    })) { sessionStorage.setItem(k, v); localStorage.setItem(k, v); }
    localStorage.setItem('currentOrganizationId', String(auth.user.organizationId));
    localStorage.setItem('currentOrganizationName', auth.user.organizationName);
  }, MOCK_AUTH);
}

const KNOWN_NOISE = [
  /ERR_CERT_AUTHORITY_INVALID/, /TenantContext/, /HTTP 404|404 \(Not Found\)|Failed to load resource.*404/i,
  /the server responded with a status of 404/, /Unexpected token '<', "<!DOCTYPE "/,
  /Manifest.*could not be fetched|robots\.txt/,
];
function filterErrors(arr) {
  return arr.filter((e) => !KNOWN_NOISE.some((re) => re.test(e.text)));
}

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

  await seedAuth(page);

  // ──────────────────────────────────────────────────────────────────
  // PHASE 1: PDEV
  // ──────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════');
  console.log(' PDEV (Phase 7) — full end-to-end');
  console.log('═══════════════════════════════════════');
  const pdevStart = allErrors.length;
  await page.goto(BASE + '/concept2cure/?nav=pdev', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  const pdevState = await page.evaluate(() => {
    const isPdevShell = !!document.querySelector('.pdev-shell');
    return {
      isPdevShell,
      pageTitle: document.querySelector('.pdev-page-title, .page-title')?.textContent?.trim() ?? null,
      visibleRailItems: Array.from(document.querySelectorAll('.pdev-nav-item .lbl')).map(e => e.textContent?.trim()),
      anaDockOpen: !!document.querySelector('.pdev-ana'),
      bodyTextStart: (document.body.innerText || '').slice(0, 200).replace(/\n+/g, ' | '),
    };
  });
  console.log(JSON.stringify(pdevState, null, 2));
  await page.screenshot({ path: '/tmp/c2c-pdev-overview.png', fullPage: false });

  // Click each PDEV rail item
  console.log('\nWalking PDEV nav items...');
  const pdevSurfaces = ['Overview', 'CMC', 'Nonclinical', 'Clinical', 'Regulatory', 'IND assembly', 'Contradictions', 'FDA interactions'];
  const pdevResults = {};
  for (const surface of pdevSurfaces) {
    const before = allErrors.length;
    const navBtn = page.locator(`.pdev-nav-item:has-text("${surface}")`).first();
    if ((await navBtn.count()) === 0) { pdevResults[surface] = 'NAV NOT FOUND'; continue; }
    try {
      await navBtn.click({ timeout: 2000 });
      await page.waitForTimeout(1000);
      const info = await page.evaluate(() => ({
        title: document.querySelector('.pdev-page-title')?.textContent?.trim() ?? null,
        sections: document.querySelectorAll('.pdev-section').length,
      }));
      const newErrors = allErrors.length - before;
      const realNew = filterErrors(allErrors.slice(before)).length;
      pdevResults[surface] = `title="${info.title}" sections=${info.sections} +${realNew}/${newErrors} errors`;
    } catch (e) {
      pdevResults[surface] = `THREW: ${e.message.slice(0, 80)}`;
    }
  }
  console.log('\n=== PDEV SURFACE RESULTS ===');
  for (const [k, v] of Object.entries(pdevResults)) {
    const ok = v.includes('+0/') && !v.includes('THREW') && !v.includes('NOT FOUND');
    console.log(`  ${ok ? '✓' : '⚠'} ${k.padEnd(22)} ${v}`);
  }
  await page.screenshot({ path: '/tmp/c2c-pdev-final.png', fullPage: false });

  // Activity detail — click first activity card in the cmc workstream
  console.log('\nOpening activity detail sheet...');
  await page.locator('.pdev-nav-item:has-text("CMC")').first().click();
  await page.waitForTimeout(1000);
  const firstCard = page.locator('.pdev-activity-card, .pdev-activity-list-row').first();
  if ((await firstCard.count()) > 0) {
    await firstCard.click();
    await page.waitForTimeout(1000);
    const sheetOpen = await page.evaluate(() => !!document.querySelector('.pdev-sheet'));
    console.log('  activity-detail sheet rendered:', sheetOpen);
    await page.screenshot({ path: '/tmp/c2c-pdev-activity-detail.png', fullPage: false });
  } else {
    console.log('  no activity cards present (likely empty CMC data)');
  }

  // Confirm dialog — click a state pill to trigger ConfirmDialog
  console.log('\nTrying to trigger PdevConfirmDialog...');
  const stateChip = page.locator('.pdev-state-chip:not(:disabled)').first();
  if ((await stateChip.count()) > 0) {
    await stateChip.click();
    await page.waitForTimeout(800);
    const confirmOpen = await page.evaluate(() => !!document.querySelector('.pdev-confirm'));
    console.log('  confirm dialog opened:', confirmOpen);
    if (confirmOpen) {
      await page.screenshot({ path: '/tmp/c2c-pdev-confirm.png', fullPage: false });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // PHASE 2: MDX (full sweep)
  // ──────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log(' MDX (Phase 4 + 5 + 6 + 8)');
  console.log('═══════════════════════════════════════');
  await page.goto(BASE + '/concept2cure/?nav=mdx', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/c2c-mdx-overview.png', fullPage: false });

  const mdxSurfaces = [
    'Device Engineering', 'UDI and Labeling', 'Post-market Vigilance', 'Quality System',
    'Document Vault', 'Templates',
    'IVD Pathway', 'EU IVDR', 'Companion Diagnostic', 'LDT Compliance',
    'Analytics', 'AnA Memory', 'AnA Conversations',
    'Global Search', 'Notifications', 'Audit Log', 'Onboarding', 'Admin and Access',
  ];
  console.log('\nWalking MDX nav items...');
  const mdxResults = {};
  for (const surface of mdxSurfaces) {
    const before = allErrors.length;
    const navBtn = page.locator(`.nav-item:has-text("${surface}"), button:has-text("${surface}")`).first();
    if ((await navBtn.count()) === 0) { mdxResults[surface] = 'NAV NOT FOUND'; continue; }
    try {
      await navBtn.click({ timeout: 2000 });
      await page.waitForTimeout(800);
      const info = await page.evaluate(() => ({
        title: document.querySelector('.page-title')?.textContent?.trim() ?? null,
        sections: document.querySelectorAll('.section').length,
      }));
      const realNew = filterErrors(allErrors.slice(before)).length;
      const totalNew = allErrors.length - before;
      mdxResults[surface] = `title="${info.title}" sections=${info.sections} +${realNew}/${totalNew} errors`;
    } catch (e) {
      mdxResults[surface] = `THREW: ${e.message.slice(0, 80)}`;
    }
  }
  console.log('\n=== MDX SURFACE RESULTS ===');
  for (const [k, v] of Object.entries(mdxResults)) {
    const ok = v.includes('+0/') && !v.includes('THREW') && !v.includes('NOT FOUND');
    console.log(`  ${ok ? '✓' : '⚠'} ${k.padEnd(25)} ${v}`);
  }
  await page.screenshot({ path: '/tmp/c2c-mdx-final.png', fullPage: false });

  // ──────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────
  const realErrors = filterErrors(allErrors);
  console.log('\n═══════════════════════════════════════');
  console.log(' FINAL SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log('Total console + page errors observed:', allErrors.length);
  console.log('After filtering known noise:', realErrors.length);
  if (realErrors.length > 0) {
    console.log('Unfiltered errors:');
    realErrors.slice(0, 20).forEach((e, i) => console.log(`  E${i + 1} [${e.from}]`, e.text.slice(0, 240)));
  }

  await browser.close();
  process.exit(realErrors.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
