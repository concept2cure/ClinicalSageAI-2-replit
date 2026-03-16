import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:5000';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-key';
const PROJECT_ID = 'cer-audit-1';

const token = jwt.sign(
  { userId: '1', email: 'dev@trialsage.ai', organizationId: '1', role: 'admin' },
  SECRET,
  { expiresIn: '1h' }
);

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
        deviceName: 'CER Test Device',
        deviceType: '510k',
        manufacturer: 'TestCo',
        deviceClass: 'III',
        intendedUse: 'CER audit',
        status: 'draft',
        createdAt: new Date().toISOString(),
        attachedDocuments: [],
        state: { documentType: 'cer' },
      };
      localStorage.setItem('medicalDeviceProjects', JSON.stringify([p]));
      localStorage.setItem('currentMedicalDeviceProjectId', projectId);
    },
    { token, projectId: PROJECT_ID }
  );
}

const FORBIDDEN = [
  { pat: /510\s*\(\s*k\s*\)/gi, label: '510(k)' },
  { pat: /(?<!\w)510k(?!\w)/gi, label: '510k' },
  { pat: /\beSTAR\b/gi, label: 'eSTAR' },
  { pat: /\bsubstantial\s+equivalence\b/gi, label: 'substantial equivalence' },
  { pat: /\bpredicate\s+device\b/gi, label: 'predicate device' },
  { pat: /\bpredicate\s+finder\b/gi, label: 'predicate finder' },
  { pat: /\bclearance\b/gi, label: 'clearance' },
  { pat: /\bFDA\s+submission\b/gi, label: 'FDA submission' },
  { pat: /\bFDA\s+510/gi, label: 'FDA 510' },
];

function findForbidden(text) {
  const hits = [];
  for (const { pat, label } of FORBIDDEN) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const start = Math.max(0, m.index - 40);
      const end = Math.min(text.length, m.index + m[0].length + 40);
      const ctx = text.substring(start, end).replace(/\n/g, ' ').trim();
      hits.push({ label, match: m[0], context: ctx });
    }
  }
  return hits;
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await seedAuth(page);

  console.log('=== CER PATH AUDIT ===');
  await page.goto(BASE + '/concept2cure/project/' + PROJECT_ID + '/510k?mode=cer', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  // Get all visible text on default view
  const defaultText = await page.evaluate(() => document.body.innerText);
  const defaultHits = findForbidden(defaultText);
  console.log('\n--- DEFAULT VIEW ---');
  console.log('Forbidden hits:', defaultHits.length);
  for (const h of defaultHits) {
    console.log(`  [${h.label}] "${h.match}" → ...${h.context}...`);
  }

  // Check for CER-specific content
  const cerExpected = [
    'CER',
    'Clinical Evaluation',
    'EU MDR',
    'Literature',
    'Post-Market',
    'Risk-Benefit',
    'Clinical Data',
    'CER Workspace',
    'CER Submission',
  ];
  console.log('\n--- CER CONTENT CHECK ---');
  for (const exp of cerExpected) {
    console.log(`  ${defaultText.includes(exp) ? '✅' : '❌'} "${exp}"`);
  }

  // Get list of all tabs
  const tabs = await page.locator('[role="tab"]').allTextContents();
  console.log('\n--- TABS (' + tabs.length + ') ---');
  for (const t of tabs) console.log('  ' + t);

  // Click each tab (force-click to bypass disabled gating) and check for forbidden content
  const allTabHits = [];
  const tabElements = await page.locator('[role="tab"]').all();
  console.log('\n--- TAB-BY-TAB AUDIT ---');
  for (let i = 0; i < Math.min(tabElements.length, 30); i++) {
    try {
      const tabName = (await tabElements[i].textContent())
        .replace(/READY|TODO|Required/g, '')
        .trim();
      // Force-click even disabled tabs via JS dispatch
      await tabElements[i].dispatchEvent('click');
      await page.waitForTimeout(2000);
      const tabText = await page.evaluate(() => {
        // Get only the main content area, not sidebar/chrome
        const main =
          document.querySelector('[role="tabpanel"]') ||
          document.querySelector('main') ||
          document.body;
        return main.innerText;
      });
      const hits = findForbidden(tabText);
      if (hits.length > 0) {
        console.log(`  Tab "${tabName}": ${hits.length} hits`);
        for (const h of hits) {
          console.log(`    [${h.label}] "${h.match}" → ...${h.context}...`);
          allTabHits.push({ tab: tabName, ...h });
        }
      } else {
        console.log(`  Tab "${tabName}": clean`);
      }
    } catch (e) {
      console.log(
        `  Tab ${i} (${await tabElements[i]?.textContent?.().catch(() => '?')}): error - ${e.message.split('\n')[0]}`
      );
    }
  }

  // Get stage groups from sidebar
  console.log('\n--- STAGE GROUPS ---');
  const buttons = await page.locator('button').allTextContents();
  const stages = buttons.filter(b => b.includes('Stage'));
  for (const s of stages) console.log('  ' + s);

  console.log('\n=== SUMMARY ===');
  console.log('Default view forbidden hits:', defaultHits.length);
  console.log('Tab-by-tab total forbidden hits:', allTabHits.length);
  console.log('Unique forbidden tabs:', [...new Set(allTabHits.map(h => h.tab))].join(', '));

  await browser.close();
}

run().catch(err => {
  console.error('Crashed:', err.message);
  process.exit(2);
});
