/**
 * CMC Meeting Hardening — Full Tab Smoke Test v2
 * Clicks each of the 12 main tabs, checks:
 * - No crash (page stays alive)
 * - Content renders (enough visible text)
 * - Screenshots each tab
 */
const { chromium } = require('playwright');

const MAIN_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'analytical', label: 'Analytical' },
  { id: 'process', label: 'Process' },
  { id: 'stability', label: 'Stability' },
  { id: 'quality', label: 'Quality' },
  { id: 'regulatory', label: 'Regulatory' },
  { id: 'document-authoring', label: 'Document Authoring' },
  { id: 'manufacturing', label: 'Manufacturing' },
  { id: 'supply-chain', label: 'Supply Chain' },
  { id: 'intelligence', label: 'AI Intelligence' },
  { id: 'risk', label: 'Risk Management' },
  { id: 'audit', label: 'Audit & Docs' },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Track errors per tab
  let currentTab = 'login';
  const tabErrors = {};
  page.on('console', msg => {
    if (msg.type() === 'error') {
      if (!tabErrors[currentTab]) tabErrors[currentTab] = [];
      const text = msg.text().slice(0, 200);
      // Skip common noise
      if (text.includes('status of 500') || text.includes('status of 404')) {
        tabErrors[currentTab].push(text.slice(0, 80));
      } else {
        tabErrors[currentTab].push(text);
      }
    }
  });

  // Track uncaught page errors (React crashes)
  const pageErrors = {};
  page.on('pageerror', err => {
    if (!pageErrors[currentTab]) pageErrors[currentTab] = [];
    pageErrors[currentTab].push(err.message.slice(0, 200));
  });

  // 1) Login
  console.log('=== CMC TAB SMOKE TEST v2 ===\n');
  console.log('1. Logging in...');
  await page.goto('http://localhost:5000/concept2cure/login', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.locator('button:has-text("Quick Demo Access")').click();
  await page.waitForURL('**/concept2cure**', { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log('   Logged in OK\n');

  // 2) Navigate to CMC
  console.log('2. Opening CMC Platform...');
  await page.locator('button:has-text("CMC Platform")').first().click();
  await page.waitForSelector('[data-testid="cmc-comprehensive-tabs"]', { timeout: 15000 });
  await page.waitForTimeout(1500);
  console.log('   CMC Platform loaded\n');

  // 3) Test each tab
  console.log('3. Testing each tab:\n');
  const results = [];

  for (const tab of MAIN_TABS) {
    currentTab = tab.id;
    tabErrors[tab.id] = [];
    pageErrors[tab.id] = [];

    const testId = `tab-${tab.id}`;
    const tabBtn = page.locator(`[data-testid="${testId}"]`);
    const exists = await tabBtn.count();

    if (exists === 0) {
      console.log(`   [SKIP] ${tab.label.padEnd(20)} — button not found`);
      results.push({ ...tab, status: 'SKIP', reason: 'Button not found', chars: 0 });
      continue;
    }

    try {
      // Scroll tab into view and click
      await tabBtn.first().scrollIntoViewIfNeeded();
      await tabBtn.first().click();
      await page.waitForTimeout(2500); // Let content load + API calls

      // Check if page is still alive (no crash)
      const alive = await page.evaluate(() => document.body !== null).catch(() => false);
      if (!alive) {
        console.log(`   [CRASH] ${tab.label.padEnd(20)} — page crashed`);
        results.push({ ...tab, status: 'CRASH', reason: 'Page unresponsive', chars: 0 });
        continue;
      }

      // Get full visible content in the main area (below tabs)
      const contentInfo = await page.evaluate(() => {
        // Find the tab content container — below the tab list
        const tabList = document.querySelector('[data-testid="cmc-comprehensive-tabs"]');
        if (!tabList)
          return { text: '', chars: 0, hasCards: false, hasTable: false, hasSvg: false };

        // Get parent and find text below tab list
        const parent = tabList.closest('.flex-1') || tabList.parentElement;
        const allText = parent ? parent.textContent || '' : '';

        // Check for UI indicators
        const hasCards =
          document.querySelectorAll('.rounded-lg, .rounded-xl, .border, [class*="card"]').length >
          5;
        const hasTable = document.querySelectorAll('table, [role="grid"]').length > 0;
        const hasSvg = document.querySelectorAll('svg:not([class*="lucide"])').length > 0; // Charts
        const hasButtons = document.querySelectorAll('button').length;

        return {
          text: allText.slice(0, 300),
          chars: allText.trim().length,
          hasCards,
          hasTable,
          hasSvg,
          buttonCount: hasButtons,
        };
      });

      // Take screenshot
      await page.screenshot({ path: `/tmp/cmc-tab-${tab.id}.png`, fullPage: false });

      const hasReactError = (pageErrors[tab.id] || []).length > 0;
      const hasError =
        contentInfo.text.includes('Something went wrong') ||
        contentInfo.text.includes('Unhandled') ||
        hasReactError;

      if (hasReactError) {
        const errMsg = pageErrors[tab.id][0].slice(0, 80);
        console.log(`   [FAIL] ${tab.label.padEnd(20)} — React error: ${errMsg}`);
        results.push({
          ...tab,
          status: 'FAIL',
          reason: `React error: ${errMsg}`,
          chars: contentInfo.chars,
        });
      } else if (hasError) {
        console.log(`   [FAIL] ${tab.label.padEnd(20)} — Error boundary triggered`);
        results.push({
          ...tab,
          status: 'FAIL',
          reason: 'Error boundary',
          chars: contentInfo.chars,
        });
      } else if (contentInfo.chars > 100) {
        console.log(
          `   [PASS] ${tab.label.padEnd(20)} — ${contentInfo.chars} chars, cards=${contentInfo.hasCards}, table=${contentInfo.hasTable}`
        );
        results.push({
          ...tab,
          status: 'PASS',
          reason: `${contentInfo.chars} chars`,
          chars: contentInfo.chars,
        });
      } else {
        console.log(`   [WARN] ${tab.label.padEnd(20)} — Low content (${contentInfo.chars} chars)`);
        results.push({
          ...tab,
          status: 'WARN',
          reason: `Only ${contentInfo.chars} chars`,
          chars: contentInfo.chars,
        });
      }
    } catch (err) {
      console.log(`   [FAIL] ${tab.label.padEnd(20)} — ${err.message.slice(0, 100)}`);
      results.push({ ...tab, status: 'FAIL', reason: err.message.slice(0, 100), chars: 0 });
    }
  }

  // 4) Summary
  console.log('\n=== MEETING READINESS REPORT ===\n');
  console.log('Tab                  | Status | Content');
  console.log('---------------------|--------|--------');
  for (const r of results) {
    const tab = r.label.padEnd(20);
    const status = r.status.padEnd(6);
    console.log(`${tab} | ${status} | ${r.reason}`);
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL' || r.status === 'CRASH').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const skipCount = results.filter(r => r.status === 'SKIP').length;

  console.log(
    `\n✓ PASS: ${passCount}  ✗ FAIL: ${failCount}  ⚠ WARN: ${warnCount}  ○ SKIP: ${skipCount}  Total: ${results.length}`
  );

  // Meeting assessment
  console.log('\n=== MEETING CLASSIFICATION ===\n');
  console.log('SAFE TO DEMO:');
  results.filter(r => r.status === 'PASS').forEach(r => console.log(`  ✓ ${r.label}`));

  console.log('\nCAUTION (may look empty):');
  results.filter(r => r.status === 'WARN').forEach(r => console.log(`  ⚠ ${r.label}: ${r.reason}`));

  console.log('\nDO NOT CLICK:');
  results
    .filter(r => r.status === 'FAIL' || r.status === 'CRASH')
    .forEach(r => console.log(`  ✗ ${r.label}: ${r.reason}`));

  // React errors
  const totalReactErrors = Object.values(pageErrors).flat().length;
  if (totalReactErrors > 0) {
    console.log('\n=== REACT ERRORS (page crashes) ===');
    for (const [tab, errs] of Object.entries(pageErrors)) {
      if (errs.length > 0) {
        console.log(`  ${tab}:`);
        errs.forEach(e => console.log(`    - ${e}`));
      }
    }
  }

  // HTTP errors summary
  console.log('\n=== HTTP ERRORS BY TAB ===');
  for (const tab of MAIN_TABS) {
    const errs = (tabErrors[tab.id] || []).filter(e => e.includes('500') || e.includes('404'));
    if (errs.length > 0) {
      console.log(`  ${tab.label}: ${errs.length} HTTP errors`);
    }
  }

  await browser.close();
  console.log('\nScreenshots: /tmp/cmc-tab-*.png');
})();
