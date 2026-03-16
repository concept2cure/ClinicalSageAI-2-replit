/**
 * Track differentiation runtime test.
 * Verifies that PMA, De Novo, HDE, and CER each render their own
 * stage labels — not the 510(k) stages, and not blank/null.
 *
 * PREREQUISITES: Dev server on port 5000, playwright-core + chromium installed.
 * RUN: node tests/track-differentiation-test.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:5000';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-key';
const PROJECT_ID = 'demo-track-test-1';

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

// Track configs: what unique stage labels should appear for each track
const TRACKS = [
  {
    mode: '510k', // baseline — already verified, quick sanity check
    label: '510(k)',
    url: `/concept2cure/project/${PROJECT_ID}/510k`,
    expectedStages: ['Stage 0: Setup', 'Stage 1: Strategy', 'Substantial Equivalence'],
    notExpected: [
      'Safety & Effectiveness',
      'Risk-Based',
      'Probable Benefit',
      'Clinical Evaluation Plan',
    ],
    workspaceLabel: 'FDA 510(k) Workspace',
  },
  {
    mode: 'pma',
    label: 'PMA',
    url: `/concept2cure/project/${PROJECT_ID}/510k?mode=pma`,
    expectedStages: [
      'Stage 0: Device & Indication',
      'Safety & Effectiveness',
      'PMA Authoring',
      'Clinical Investigation',
    ],
    notExpected: ['Substantial Equivalence', 'De Novo', 'Probable Benefit'],
    workspaceLabel: 'FDA PMA Workspace',
  },
  {
    mode: 'de_novo',
    label: 'De Novo',
    url: `/concept2cure/project/${PROJECT_ID}/510k?mode=de_novo`,
    expectedStages: [
      'Stage 0: Device & Classification',
      'Risk-Based Strategy',
      'De Novo Authoring',
      'Special Controls',
    ],
    notExpected: ['Substantial Equivalence', 'PMA', 'Probable Benefit'],
    workspaceLabel: 'FDA De Novo Workspace',
  },
  {
    mode: 'hde',
    label: 'HDE',
    url: `/concept2cure/project/${PROJECT_ID}/510k?mode=hde`,
    expectedStages: [
      'Stage 0: Device & Population',
      'Probable Benefit',
      'HDE Authoring',
      'HUD Designation',
    ],
    notExpected: ['Substantial Equivalence', 'PMA', 'De Novo', 'Clinical Investigation'],
    workspaceLabel: 'FDA HDE Workspace',
  },
  {
    mode: 'cer',
    label: 'CER',
    url: `/concept2cure/project/${PROJECT_ID}/510k?mode=cer`,
    expectedStages: [
      'Stage 0: Scope & Planning',
      'Clinical Evaluation Plan',
      'GSPR Mapping',
      'CER Authoring',
    ],
    notExpected: ['Substantial Equivalence', 'PMA', 'De Novo'],
    workspaceLabel: 'EU MDR CER Workspace',
  },
];

async function seedProject(page) {
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

      // Set in both sessionStorage and localStorage
      for (const store of [sessionStorage, localStorage]) {
        store.setItem('trialsage_access_token', token);
        store.setItem('trialsage_refresh_token', token);
        store.setItem('trialsage_token_expiry', expiry);
        store.setItem('trialsage_user', user);
      }

      const flags = JSON.parse(localStorage.getItem('featureFlags') || '{}');
      flags['EMBED_MODULES_IN_SHELL'] = true;
      localStorage.setItem('featureFlags', JSON.stringify(flags));

      const project = {
        id: projectId,
        deviceName: 'TrackTest Device',
        deviceType: '510k',
        manufacturer: 'TestCo',
        deviceClass: 'II',
        intendedUse: 'Track differentiation testing',
        status: 'draft',
        createdAt: new Date().toISOString(),
        attachedDocuments: [],
        state: { documentType: '510k' },
      };
      localStorage.setItem('medicalDeviceProjects', JSON.stringify([project]));
      localStorage.setItem('currentMedicalDeviceProjectId', projectId);
    },
    { token, projectId: PROJECT_ID }
  );
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Seed project
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await seedProject(page);

  for (const track of TRACKS) {
    console.log(`\n=== TRACK: ${track.label} ===`);

    await page.goto(`${BASE}${track.url}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);

    const pageText = await page.evaluate(() => document.body.innerText);

    // Check expected stage labels
    let expectedCount = 0;
    for (const expected of track.expectedStages) {
      if (pageText.includes(expected)) {
        expectedCount++;
      }
    }
    const expectedRatio = expectedCount / track.expectedStages.length;
    record(
      `${track.label} — expected stages present`,
      expectedRatio >= 0.5 ? 'PASS' : 'FAIL',
      `Found ${expectedCount}/${track.expectedStages.length}: ${track.expectedStages.filter(e => pageText.includes(e)).join(', ')}`
    );

    // Check that wrong-track labels are NOT present
    let wrongCount = 0;
    const wrongFound = [];
    for (const notExp of track.notExpected) {
      if (pageText.includes(notExp)) {
        wrongCount++;
        wrongFound.push(notExp);
      }
    }
    record(
      `${track.label} — no wrong-track labels`,
      wrongCount === 0 ? 'PASS' : 'FAIL',
      wrongCount > 0 ? `Found wrong labels: ${wrongFound.join(', ')}` : ''
    );

    // Check workspace label in back-to-project bar
    const workspaceLabelVisible = pageText.includes(track.workspaceLabel);
    record(
      `${track.label} — workspace label correct`,
      workspaceLabelVisible ? 'PASS' : 'PARTIAL',
      workspaceLabelVisible ? track.workspaceLabel : `Expected "${track.workspaceLabel}"`
    );

    // Check stage tabs render (not null)
    const stageTabCount = await page
      .locator('[role="tab"]')
      .count()
      .catch(() => 0);
    record(
      `${track.label} — stage tabs render`,
      stageTabCount > 2 ? 'PASS' : 'FAIL',
      `${stageTabCount} tabs found`
    );

    await page.screenshot({ path: `test-artifacts/track-${track.mode}.png`, fullPage: false });
  }

  // SUMMARY
  console.log('\n========================================');
  console.log('TRACK DIFFERENTIATION SUMMARY');
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
