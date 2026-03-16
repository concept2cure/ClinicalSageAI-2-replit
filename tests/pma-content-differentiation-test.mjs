/**
 * PMA content differentiation runtime test.
 * Verifies that the PMA path shows PMA-correct content and
 * does NOT show 510(k)-specific language.
 *
 * Also runs a 510(k) regression check to confirm 510(k) still renders its own language.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:5000';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-key';
const PROJECT_ID = 'pma-verify-1';

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

async function seedAuth(page) {
  await page.evaluate(
    ({ token, projectId }) => {
      const expiry = new Date(Date.now() + 3600000).toISOString();
      const user = JSON.stringify({
        id: '1',
        email: 'dev@trialsage.ai',
        role: 'admin',
        organizationId: '1',
        permissions: [],
        name: 'Dev User',
      });
      for (const s of [sessionStorage, localStorage]) {
        s.setItem('trialsage_access_token', token);
        s.setItem('trialsage_refresh_token', token);
        s.setItem('trialsage_token_expiry', expiry);
        s.setItem('trialsage_user', user);
      }
      const f = JSON.parse(localStorage.getItem('featureFlags') || '{}');
      f['EMBED_MODULES_IN_SHELL'] = true;
      localStorage.setItem('featureFlags', JSON.stringify(f));
      const p = {
        id: projectId,
        deviceName: 'PMA Test Device',
        deviceType: '510k',
        manufacturer: 'TestCo',
        deviceClass: 'III',
        intendedUse: 'PMA content verification',
        status: 'draft',
        createdAt: new Date().toISOString(),
        attachedDocuments: [],
        state: { documentType: 'pma' },
      };
      localStorage.setItem('medicalDeviceProjects', JSON.stringify([p]));
      localStorage.setItem('currentMedicalDeviceProjectId', projectId);
    },
    { token, projectId: PROJECT_ID }
  );
}

const FORBIDDEN_ON_PMA = [
  /(?<!\w)510\s*\(\s*k\s*\)/i,
  /(?<!\w)510k(?!\w)/i,
  /\beSTAR\b/i,
  /\bsubstantial\s+equivalence\b/i,
  /\bpredicate\s+device\b/i,
];

function hasForbidden(text) {
  for (const pat of FORBIDDEN_ON_PMA) {
    pat.lastIndex = 0;
    if (pat.test(text)) return pat.source;
  }
  return null;
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await seedAuth(page);

  // ─── PMA PATH CHECKS ──────────────────────────────────────────────────────
  console.log('\n=== PMA CONTENT CHECKS ===');
  await page.goto(`${BASE}/concept2cure/project/${PROJECT_ID}/510k?mode=pma`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  const pmaText = await page.evaluate(() => document.body.innerText);

  // 1. No forbidden 510k language
  const forbiddenHit = hasForbidden(pmaText);
  record(
    'PMA — no 510(k) language visible',
    forbiddenHit ? 'FAIL' : 'PASS',
    forbiddenHit ? `Found pattern: ${forbiddenHit}` : ''
  );

  // 2. PMA-specific content present
  const pmaExpected = [
    'PMA Submission',
    'PMA Workspace',
    'Safety & Effectiveness',
    'Clinical Investigation',
    'PMA Authoring',
  ];
  let pmaFound = 0;
  for (const exp of pmaExpected) {
    if (pmaText.includes(exp)) pmaFound++;
  }
  record(
    'PMA — PMA-specific labels present',
    pmaFound >= 3 ? 'PASS' : 'FAIL',
    `Found ${pmaFound}/${pmaExpected.length}: ${pmaExpected.filter(e => pmaText.includes(e)).join(', ')}`
  );

  // 3. PMA stage navigation renders
  const pmaStages = ['Stage 0: Device & Indication', 'Stage 1: Safety & Effectiveness'];
  const pmaStageFound = pmaStages.filter(s => pmaText.includes(s)).length;
  record(
    'PMA — stage navigation renders',
    pmaStageFound >= 1 ? 'PASS' : 'FAIL',
    `${pmaStageFound}/${pmaStages.length} stages found`
  );

  // 4. PMA sidebar label correct
  record(
    'PMA — sidebar label correct',
    pmaText.includes('PMA Workspace') ? 'PASS' : 'FAIL',
    pmaText.includes('PMA Workspace') ? 'PMA Workspace visible' : 'Not found'
  );

  // 5. PMA page heading
  record(
    'PMA — page heading correct',
    pmaText.includes('PMA Submission Pipeline') || pmaText.includes('FDA PMA') ? 'PASS' : 'PARTIAL',
    ''
  );

  // 6. PMA tabs render (>5 means actual tabs, not zero)
  const pmaTabCount = await page
    .locator('[role="tab"]')
    .count()
    .catch(() => 0);
  record('PMA — tabs render', pmaTabCount > 5 ? 'PASS' : 'FAIL', `${pmaTabCount} tabs`);

  // ─── 510(k) REGRESSION ────────────────────────────────────────────────────
  console.log('\n=== 510(k) REGRESSION CHECKS ===');
  await page.goto(`${BASE}/concept2cure/project/${PROJECT_ID}/510k`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  const k510Text = await page.evaluate(() => document.body.innerText);

  // 7. 510(k) still has its language
  const k510Expected = ['510(k)', 'eSTAR', 'Substantial Equivalence'];
  let k510Found = 0;
  for (const exp of k510Expected) {
    if (k510Text.includes(exp)) k510Found++;
  }
  record(
    '510(k) — original language intact',
    k510Found >= 2 ? 'PASS' : 'FAIL',
    `Found ${k510Found}/${k510Expected.length}: ${k510Expected.filter(e => k510Text.includes(e)).join(', ')}`
  );

  // 8. 510(k) workspace label
  record(
    '510(k) — workspace label present',
    k510Text.includes('510(k) Workspace') ? 'PASS' : 'FAIL',
    ''
  );

  // 9. 510(k) tabs render
  const k510TabCount = await page
    .locator('[role="tab"]')
    .count()
    .catch(() => 0);
  record('510(k) — tabs render', k510TabCount > 15 ? 'PASS' : 'FAIL', `${k510TabCount} tabs`);

  // 10. 510(k) stage labels
  record(
    '510(k) — stage labels present',
    k510Text.includes('Stage 0: Setup') && k510Text.includes('Stage 1: Strategy') ? 'PASS' : 'FAIL',
    ''
  );

  // ─── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('PMA CONTENT DIFFERENTIATION SUMMARY');
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
  console.error('Test crashed:', err.message);
  process.exit(2);
});
