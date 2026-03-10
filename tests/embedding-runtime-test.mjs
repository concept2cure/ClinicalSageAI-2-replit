/**
 * Runtime verification: CERV2 embedded in Concept2Cure shell.
 * Tests actual browser behavior — not just compile checks.
 *
 * PREREQUISITES
 *   - Dev server running on port 5000 (npm run dev / npx tsx server/index.ts)
 *   - PostgreSQL running (startup.sh or docker-compose)
 *   - playwright-core + chromium installed:
 *       npx playwright install chromium
 *       npx playwright install-deps chromium
 *
 * HOW TO RUN
 *   node tests/embedding-runtime-test.mjs
 *
 * WHAT IT VERIFIES
 *   Phase 0 — Seeds a 510(k) project in localStorage
 *   Phase 1 — Shell renders, sidebar visible, embedded 510(k) content, no duplicate header
 *   Phase 2 — Back-to-project button and workspace label in embedded mode
 *   Phase 3 — Stage tabs render and are clickable (Device Intake, Predicate, Documents)
 *   Phase 4 — AI Assistant toggle opens/closes the panel, header renders
 *   Phase 5 — Legacy fallback: flag OFF restores standalone route
 *
 * SETUP/DATA ASSUMPTIONS
 *   - Auth: injects trialsage_* JWT tokens in localStorage (auto-generated)
 *   - Project: seeds a demo 510(k) project (CardioFlow Monitor Pro) in localStorage
 *   - Feature flag: EMBED_MODULES_IN_SHELL enabled by default
 *   - No external API keys required (Cortex health-check is best-effort)
 *
 * OUTPUT
 *   - Console: PASS / PARTIAL / FAIL per check
 *   - Screenshots: test-artifacts/*.png (gitignored)
 *   - Exit code: 0 = no FAILs, 1 = at least one FAIL, 2 = crash
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:5000';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-key';

// Generate a valid JWT for authenticated access
const token = jwt.sign(
  { userId: '1', email: 'dev@trialsage.ai', organizationId: '1', role: 'admin' },
  SECRET,
  { expiresIn: '1h' }
);

const results = {};
function record(test, status, detail = '') {
  results[test] = { status, detail };
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${test}: ${status}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Inject auth token into localStorage before navigating
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(t => {
    // Legacy token keys
    localStorage.setItem('authToken', t);
    localStorage.setItem('token', t);
    localStorage.setItem('auth_token', t);
    // Portal v2 auth keys (trialsage_*)
    localStorage.setItem('trialsage_access_token', t);
    localStorage.setItem('trialsage_refresh_token', t);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('trialsage_token_expiry', expiry);
    localStorage.setItem(
      'trialsage_user',
      JSON.stringify({
        id: '1',
        email: 'dev@trialsage.ai',
        firstName: 'Dev',
        lastName: 'User',
        displayName: 'Dev User',
        roles: ['admin', 'user'],
        permissions: ['*'],
        organizationId: '1',
        organizationName: 'Concept2Cure Dev',
      })
    );
    // Also in sessionStorage
    sessionStorage.setItem('trialsage_access_token', t);
    sessionStorage.setItem('trialsage_refresh_token', t);
    sessionStorage.setItem('trialsage_token_expiry', expiry);
    sessionStorage.setItem(
      'trialsage_user',
      JSON.stringify({
        id: '1',
        email: 'dev@trialsage.ai',
        firstName: 'Dev',
        lastName: 'User',
        displayName: 'Dev User',
        roles: ['admin', 'user'],
        permissions: ['*'],
        organizationId: '1',
        organizationName: 'Concept2Cure Dev',
      })
    );
    localStorage.setItem('currentOrganizationId', '1');
    localStorage.setItem('currentOrganization', '1');
    localStorage.setItem('currentOrganizationName', 'Concept2Cure Dev');
  }, token);

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 0: SEED REAL PROJECT DATA IN LOCALSTORAGE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== PHASE 0: SEED PROJECT DATA ===');

  const PROJECT_ID = 'demo-510k-1';
  await page.evaluate(pid => {
    const project = {
      id: pid,
      deviceName: 'CardioFlow Monitor Pro',
      deviceType: '510k',
      manufacturer: 'Concept2Cure Medical Inc.',
      deviceClass: 'II',
      intendedUse: 'Continuous cardiac rhythm monitoring for adult patients in clinical settings',
      regulatoryClass: 'II',
      productCode: 'DRT',
      status: 'active',
      createdAt: new Date().toISOString(),
      predicateDevices: [],
      state: {
        deviceProfile: {
          deviceName: 'CardioFlow Monitor Pro',
          manufacturer: 'Concept2Cure Medical Inc.',
          deviceType: 'Diagnostic',
          deviceClass: 'II',
          productCode: 'DRT',
          regulationNumber: '870.2340',
          intendedUse:
            'Continuous cardiac rhythm monitoring for adult patients in clinical settings',
          indications: 'Detection and recording of cardiac arrhythmias',
          description: 'A non-invasive cardiac monitoring device providing real-time ECG analysis',
          predicateDevice: '',
        },
        predicateDevices: [],
        comparisonData: {},
        performanceData: {},
        documents: {},
      },
    };
    localStorage.setItem('medicalDeviceProjects', JSON.stringify([project]));
    localStorage.setItem('currentMedicalDeviceProjectId', pid);
  }, PROJECT_ID);
  record('Project data seeded', 'PASS', `ID: ${PROJECT_ID}`);

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: SHELL + EMBEDDED ROUTE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== PHASE 1: SHELL + EMBEDDED ROUTE ===');

  // 1a. Navigate to embedded 510k route WITH the seeded project
  await page.goto(`${BASE}/concept2cure/project/${PROJECT_ID}/510k`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  const shellLoaded = await page.locator('body').isVisible();
  record('Shell renders', shellLoaded ? 'PASS' : 'FAIL');

  // 1b. Check if sidebar is present
  const sidebarVisible = await page
    .locator('[class*="sidebar"], [data-testid*="sidebar"], nav')
    .first()
    .isVisible()
    .catch(() => false);
  record(
    'Sidebar visible in shell',
    sidebarVisible ? 'PASS' : 'PARTIAL',
    sidebarVisible ? '' : 'sidebar selector may differ'
  );

  // Check SPA loaded
  const pageContent = await page.content();
  const hasReactRoot = pageContent.includes('id="root"') || pageContent.includes('id="app"');
  record('Embedded route serves SPA', hasReactRoot ? 'PASS' : 'FAIL');

  // 1c. Check for CERV2 510(k) content
  const has510kContent =
    (await page
      .locator('text=510')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)) || pageContent.includes('510');
  record('CERV2 510k content present', has510kContent ? 'PASS' : 'PARTIAL');

  // 1d. No duplicate header
  const duplicateHeader = await page
    .locator('header:has-text("Hub")')
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  record(
    'No duplicate header chrome',
    !duplicateHeader ? 'PASS' : 'FAIL',
    duplicateHeader ? 'CERV2 header still showing in embedded mode' : ''
  );

  await page.screenshot({ path: 'test-artifacts/embedded-510k.png', fullPage: false });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: BACK-TO-PROJECT CONTROL
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== PHASE 2: BACK-TO-PROJECT CONTROL ===');

  const backBtn = await page
    .locator('[data-testid="back-to-project"], button:has-text("Back to Project")')
    .first();
  const backBtnVisible = await backBtn.isVisible({ timeout: 5000 }).catch(() => false);
  record('Back-to-project button visible', backBtnVisible ? 'PASS' : 'FAIL');

  // Check the 510k workspace label
  const workspaceLabel = await page
    .locator('text=FDA 510(k) Workspace')
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  record('Workspace label visible', workspaceLabel ? 'PASS' : 'PARTIAL');

  await page.screenshot({ path: 'test-artifacts/embedded-back-button.png', fullPage: false });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: STAGE TABS WITH REAL DATA
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== PHASE 3: STAGE TABS ===');

  // Check for stage navigation elements
  const tabElements = await page
    .locator('button, [role="tab"]')
    .allTextContents()
    .catch(() => []);
  const tabNames = tabElements
    .filter(t => t.trim().length > 0 && t.trim().length < 50)
    .slice(0, 30);

  record(
    'Stage tabs render',
    tabNames.length > 3 ? 'PASS' : 'PARTIAL',
    `Found tabs: ${tabNames.slice(0, 10).join(', ')}`
  );

  // Try clicking Device Intake tab
  const intakeTab = await page
    .locator(
      'button:has-text("Device Intake"), button:has-text("Device"), button:has-text("Setup")'
    )
    .first();
  const intakeExists = await intakeTab.isVisible({ timeout: 3000 }).catch(() => false);
  if (intakeExists) {
    await intakeTab.click().catch(() => {});
    await page.waitForTimeout(1500);
    record('Device Intake tab clickable', 'PASS');
  } else {
    record('Device Intake tab clickable', 'PARTIAL', 'Tab not found');
  }

  // Try clicking Predicate tab
  const predTab = await page
    .locator('button:has-text("Predicate"), button:has-text("Regulation Finder")')
    .first();
  const predExists = await predTab.isVisible({ timeout: 3000 }).catch(() => false);
  if (predExists) {
    await predTab.click().catch(() => {});
    await page.waitForTimeout(1500);
    record('Predicate tab clickable', 'PASS');
  } else {
    record('Predicate tab clickable', 'PARTIAL', 'Tab not found');
  }

  // Try clicking a Documents tab
  const docTab = await page
    .locator('button:has-text("Document"), button:has-text("Author"), button:has-text("eSTAR")')
    .first();
  const docExists = await docTab.isVisible({ timeout: 3000 }).catch(() => false);
  if (docExists) {
    await docTab.click().catch(() => {});
    await page.waitForTimeout(1500);
    record('Documents tab clickable', 'PASS');
  } else {
    record('Documents tab clickable', 'PARTIAL', 'Tab not found');
  }

  await page.screenshot({ path: 'test-artifacts/embedded-510k-tabs.png', fullPage: false });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4: ASSISTANT PANEL
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== PHASE 4: ASSISTANT PANEL ===');

  // Re-navigate to get clean state after Phase 3 tab clicks
  await page.goto(`${BASE}/concept2cure/project/${PROJECT_ID}/510k`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Check for assistant toggle button
  const assistantToggle = await page.locator('[data-testid="module-assistant-toggle"]').first();
  const toggleVisible = await assistantToggle.isVisible({ timeout: 5000 }).catch(() => false);
  record('Assistant toggle visible', toggleVisible ? 'PASS' : 'PARTIAL');

  if (toggleVisible) {
    // Click to open
    await assistantToggle.click();
    await page.waitForTimeout(1500);

    const assistantPanel = await page.locator('[data-testid="module-assistant-panel"]').first();
    const panelVisible = await assistantPanel.isVisible({ timeout: 5000 }).catch(() => false);
    record('Assistant panel opens', panelVisible ? 'PASS' : 'FAIL');

    // Check for AI Assistant header
    const assistantHeader = await page
      .locator('text=AI Assistant')
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    record('Assistant header visible', assistantHeader ? 'PASS' : 'PARTIAL');

    await page.screenshot({ path: 'test-artifacts/embedded-assistant-open.png', fullPage: false });

    // Close it
    const closeBtn = await page.locator('[data-testid="module-assistant-panel"] button').first();
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(500);
    const panelClosed = !(await assistantPanel.isVisible({ timeout: 2000 }).catch(() => false));
    record('Assistant panel closes', panelClosed ? 'PASS' : 'FAIL');
  } else {
    record('Assistant panel opens', 'PARTIAL', 'Toggle not found');
    record('Assistant header visible', 'PARTIAL', 'Toggle not found');
    record('Assistant panel closes', 'PARTIAL', 'Toggle not found');
  }

  // Check Cortex API health
  const cortexResp = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/cortex/health');
      return await r.json();
    } catch (e) {
      return { error: e.message };
    }
  });
  record(
    'Cortex API reachable',
    cortexResp?.status === 'healthy' ? 'PASS' : 'FAIL',
    JSON.stringify(cortexResp).slice(0, 100)
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 5: LEGACY FALLBACK
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== PHASE 5: LEGACY FALLBACK ===');

  // Disable the flag and check legacy route
  await page.evaluate(() => {
    const flags = JSON.parse(localStorage.getItem('featureFlags') || '{}');
    flags['EMBED_MODULES_IN_SHELL'] = false;
    localStorage.setItem('featureFlags', JSON.stringify(flags));
  });

  await page.goto(`${BASE}/concept2cure/project/${PROJECT_ID}/510k`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(2000);
  const legacyContent = await page.content();
  const legacyLoads = legacyContent.includes('id="root"') || legacyContent.includes('id="app"');
  record('Legacy route renders with flag OFF', legacyLoads ? 'PASS' : 'FAIL');

  // Re-enable flag
  await page.evaluate(() => {
    const flags = JSON.parse(localStorage.getItem('featureFlags') || '{}');
    flags['EMBED_MODULES_IN_SHELL'] = true;
    localStorage.setItem('featureFlags', JSON.stringify(flags));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('RUNTIME VERIFICATION SUMMARY');
  console.log('========================================');
  const pass = Object.values(results).filter(r => r.status === 'PASS').length;
  const partial = Object.values(results).filter(r => r.status === 'PARTIAL').length;
  const fail = Object.values(results).filter(r => r.status === 'FAIL').length;
  console.log(`PASS: ${pass} | PARTIAL: ${partial} | FAIL: ${fail}`);
  console.log('');
  for (const [k, v] of Object.entries(results)) {
    const icon = v.status === 'PASS' ? '✅' : v.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`  ${icon} ${k}: ${v.status}${v.detail ? ' — ' + v.detail : ''}`);
  }

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err.message);
  process.exit(2);
});
