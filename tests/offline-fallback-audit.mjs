/**
 * Browser-runtime verification of offline fallback behavior
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:5000';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-key';
const token = jwt.sign(
  { userId: '1', email: 'dev@trialsage.ai', organizationId: '2', role: 'admin' },
  SECRET, { expiresIn: '1h' }
);

async function seedAuth(page) {
  await page.evaluate(({ token }) => {
    const expiry = new Date(Date.now() + 3600000).toISOString();
    const user = JSON.stringify({
      id: '1', email: 'dev@trialsage.ai', role: 'admin',
      organizationId: '2', permissions: [], name: 'Dev User',
    });
    for (const s of [sessionStorage, localStorage]) {
      s.setItem('trialsage_access_token', token);
      s.setItem('trialsage_refresh_token', token);
      s.setItem('trialsage_token_expiry', expiry);
      s.setItem('trialsage_user', user);
      s.setItem('token', token);
      s.setItem('authToken', token);
      s.setItem('auth_token', token);
    }
    const f = JSON.parse(localStorage.getItem('featureFlags') || '{}');
    f['EMBED_MODULES_IN_SHELL'] = true;
    localStorage.setItem('featureFlags', JSON.stringify(f));
    localStorage.removeItem('medicalDeviceProjects_migrated');
    localStorage.removeItem('medicalDeviceProjects');
    localStorage.removeItem('currentMedicalDeviceProjectId');
  }, { token });
}

const results = [];
function log(test, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL';
  results.push({ test, status, detail });
  console.log(`  [${status}] ${test}${detail ? ' -- ' + detail : ''}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('\n=== OFFLINE FALLBACK BROWSER-RUNTIME AUDIT ===\n');

  // Seed auth on the base URL first
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await seedAuth(page);
  // Navigate to standalone route (embedded=false) so project selector is visible
  await page.goto(BASE + '/medical-device', {
    waitUntil: 'networkidle', timeout: 30000,
  });
  await page.waitForTimeout(4000);

  const pageUrl = page.url();
  console.log('  [INFO] Page URL: ' + pageUrl);
  const bodySnippet = await page.evaluate(() => document.body?.innerText?.substring(0, 200) || '');
  console.log('  [INFO] Body: ' + bodySnippet.replace(/\n/g, ' ').substring(0, 150));

  // Open project selector
  const selectorBtn = page.locator('[data-testid="button-project-selector"]');
  if (await selectorBtn.count() > 0) {
    await selectorBtn.click();
    await page.waitForTimeout(500);
    log('PROJECT-SELECTOR-OPEN', true, 'Opened project selector');
  } else {
    console.log('  [INFO] No project-selector button found');
  }

  // Intercept POST to simulate server down
  await page.route('**/api/device-projects', route => {
    if (route.request().method() === 'POST') {
      return route.abort('connectionrefused');
    }
    return route.continue();
  });

  // Click Create New Project
  const createBtn = page.locator('[data-testid="button-create-new-project"]');
  if (await createBtn.count() > 0) {
    await createBtn.click();
    await page.waitForTimeout(1000);
    log('NEW-PROJECT-DIALOG', true, 'Opened new project dialog');
  } else {
    const altBtn = page.locator('[data-testid="button-new-device-submission"]');
    if (await altBtn.count() > 0) {
      await altBtn.click();
      await page.waitForTimeout(1000);
      log('NEW-PROJECT-DIALOG', true, 'Opened via alt button');
    } else {
      log('NEW-PROJECT-DIALOG', false, 'Could not find create new project button');
      await browser.close();
      printSummary();
      return;
    }
  }

  // Fill form
  const nameInput = page.locator('[data-testid="input-project-device-name"]');
  const mfgInput = page.locator('[data-testid="input-project-manufacturer"]');
  if (await nameInput.count() > 0) {
    await nameInput.fill('Offline Test Widget');
    log('FORM-DEVICE-NAME', true, 'Filled device name');
  } else {
    const fallback = page.locator('#deviceName').first();
    if (await fallback.count() > 0) {
      await fallback.fill('Offline Test Widget');
      log('FORM-DEVICE-NAME', true, 'Filled via fallback');
    } else {
      log('FORM-DEVICE-NAME', false, 'No device name input');
    }
  }
  if (await mfgInput.count() > 0) {
    await mfgInput.fill('OfflineCo');
  }

  // Submit
  const submitBtn = page.locator('[data-testid="button-submit-new-project"]');
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    await page.waitForTimeout(4000);
    log('FORM-SUBMITTED', true, 'Clicked submit');
  } else {
    log('FORM-SUBMITTED', false, 'Submit button not found');
  }

  // Check localStorage for local-* project
  const localProjects = await page.evaluate(() => {
    const raw = localStorage.getItem('medicalDeviceProjects');
    if (!raw) return [];
    try { return JSON.parse(raw).filter(p => String(p.id).startsWith('local-')); }
    catch { return []; }
  });
  log('LOCAL-PROJECT-CREATED', localProjects.length > 0,
    localProjects.length > 0
      ? 'Found ' + localProjects.length + ' local project(s): ' + localProjects.map(p => p.id.substring(0, 25)).join(', ')
      : 'No local-* projects in localStorage');

  // Check Offline badge
  const selectorBtn2 = page.locator('[data-testid="button-project-selector"]');
  if (await selectorBtn2.count() > 0) {
    await selectorBtn2.click();
    await page.waitForTimeout(1000);
  }
  const offlineBadge = page.locator('text=Offline');
  const hasOfflineBadge = await offlineBadge.count();
  log('OFFLINE-BADGE-VISIBLE', hasOfflineBadge > 0,
    hasOfflineBadge > 0 ? 'Orange "Offline" badge rendered' : 'No Offline badge in DOM');

  await browser.close();
  printSummary();
}

function printSummary() {
  console.log('\n=== SUMMARY ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const total = results.length;
  console.log(passed + '/' + total + ' checks passed');
  results.forEach(r => console.log('  ' + r.status + ': ' + r.test));
  const critical = results.find(r => r.test === 'LOCAL-PROJECT-CREATED');
  if (critical && critical.status === 'FAIL') {
    console.log('\nCRITICAL: Offline fallback did not create a local-* project');
    process.exit(1);
  }
  process.exit(0);
}

run().catch(err => { console.error('FATAL:', err); process.exit(2); });
