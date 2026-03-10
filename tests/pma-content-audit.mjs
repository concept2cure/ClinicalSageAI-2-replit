/**
 * PMA content audit: scrape the PMA path and find all visible 510(k)-specific text.
 * This is a diagnostic tool, not a pass/fail test.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:5000';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-key';
const PROJECT_ID = 'pma-audit-1';

const token = jwt.sign(
  { userId: '1', email: 'dev@trialsage.ai', organizationId: '1', role: 'admin' },
  SECRET,
  { expiresIn: '1h' }
);

const FORBIDDEN_PATTERNS = [
  /510\s*\(\s*k\s*\)/gi,
  /510k/gi,
  /eSTAR/gi,
  /estar/gi,
  /substantial\s+equivalence/gi,
  /predicate\s+device/gi,
  /predicate\s+finder/gi,
  /clearance/gi,
];

function findForbidden(text) {
  const hits = [];
  for (const pat of FORBIDDEN_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      // Get context: 40 chars before and after
      const start = Math.max(0, m.index - 40);
      const end = Math.min(text.length, m.index + m[0].length + 40);
      const context = text.slice(start, end).replace(/\n/g, ' ');
      hits.push({ match: m[0], context });
    }
  }
  // Deduplicate by context
  const seen = new Set();
  return hits.filter(h => {
    const key = h.context.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
        deviceName: 'PMA Audit Device',
        deviceType: '510k',
        manufacturer: 'AuditCo',
        deviceClass: 'III',
        intendedUse: 'PMA content audit',
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

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await seedAuth(page);

  // Navigate to PMA embedded path
  await page.goto(`${BASE}/concept2cure/project/${PROJECT_ID}/510k?mode=pma`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  console.log('URL:', page.url());

  // Scrape visible text
  const pageText = await page.evaluate(() => document.body.innerText);

  const hits = findForbidden(pageText);

  console.log(`\n=== PMA PATH: DEFAULT VIEW (device-intake tab) ===`);
  console.log(`Found ${hits.length} forbidden 510(k)-specific text instances:\n`);

  for (const h of hits) {
    console.log(`  ❌ "${h.match}" → ...${h.context}...`);
  }

  // Now click through each PMA stage's first tab to check visible content
  const tabsToCheck = [
    'predicates',
    'pathway-analyzer',
    'se-strategy',
    'bench-testing',
    'biocompatibility',
    'clinical-evidence',
    'builder',
    'document-editor',
    'preview',
    'rta-check',
    'export',
  ];

  for (const tabId of tabsToCheck) {
    // Try clicking the tab via JS
    await page.evaluate(tid => {
      // Look for a tab button or similar element
      const btns = document.querySelectorAll('[role="tab"], button');
      for (const b of btns) {
        if (
          b.dataset?.tabId === tid ||
          b.textContent?.toLowerCase().includes(tid.replace('-', ' '))
        ) {
          b.click();
          return true;
        }
      }
      return false;
    }, tabId);

    await page.waitForTimeout(1500);

    const tabText = await page.evaluate(() => document.body.innerText);
    const tabHits = findForbidden(tabText);

    if (tabHits.length > 0) {
      console.log(`\n=== TAB: ${tabId} ===`);
      console.log(`  ${tabHits.length} forbidden strings:`);
      for (const h of tabHits) {
        console.log(`    ❌ "${h.match}" → ...${h.context}...`);
      }
    }
  }

  console.log('\n=== AUDIT COMPLETE ===');
  await browser.close();
}

run().catch(err => {
  console.error('Audit crashed:', err.message);
  process.exit(2);
});
