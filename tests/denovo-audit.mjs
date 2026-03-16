import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:5000';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-key';
const PROJECT_ID = 'denovo-audit-1';
const token = jwt.sign(
  { userId: '1', email: 'dev@trialsage.ai', organizationId: '1', role: 'admin' },
  SECRET,
  { expiresIn: '1h' }
);

async function seedAuth(page) {
  const projectId = PROJECT_ID;
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
      localStorage.setItem(
        'medicalDeviceProjects',
        JSON.stringify([
          {
            id: projectId,
            deviceName: 'De Novo Test',
            deviceType: '510k',
            manufacturer: 'TestCo',
            deviceClass: 'II',
            intendedUse: 'De Novo audit',
            status: 'draft',
            createdAt: new Date().toISOString(),
            attachedDocuments: [],
            state: { documentType: 'de_novo' },
          },
        ])
      );
      localStorage.setItem('currentMedicalDeviceProjectId', projectId);
    },
    { token, projectId }
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
];

function findForbidden(text) {
  const hits = [];
  for (const { pat, label } of FORBIDDEN) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text)) !== null) {
      const start = Math.max(0, m.index - 50);
      const end = Math.min(text.length, m.index + m[0].length + 50);
      hits.push({
        label,
        match: m[0],
        context: text.substring(start, end).replace(/\n/g, ' ').trim(),
      });
    }
  }
  return hits;
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await seedAuth(page);
  await page.goto(BASE + '/concept2cure/project/' + PROJECT_ID + '/510k?mode=de_novo', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  const tabElements = await page.locator('[role="tab"]').all();
  const tabCount = tabElements.length;
  console.log('=== DE NOVO DEEP TAB AUDIT (' + tabCount + ' tabs) ===\n');

  let lastHash = '';
  const allHits = [];

  for (let i = 0; i < tabCount; i++) {
    const tabName = (await tabElements[i].textContent()).replace(/READY|TODO|Required/g, '').trim();
    await page.evaluate(idx => {
      const tabs = document.querySelectorAll('[role="tab"]');
      const tab = tabs[idx];
      if (tab) {
        tab.removeAttribute('disabled');
        tab.removeAttribute('aria-disabled');
        tab.click();
      }
    }, i);
    await page.waitForTimeout(2000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const hash = bodyText.substring(0, 200);
    const switched = hash !== lastHash;
    lastHash = hash;

    const hits = findForbidden(bodyText);
    if (hits.length > 0) {
      console.log(
        '❌ Tab ' +
          i +
          ': "' +
          tabName +
          '" — ' +
          hits.length +
          ' hits ' +
          (switched ? '(content switched)' : '(same panel)')
      );
      for (const h of hits) {
        console.log('   [' + h.label + '] ...' + h.context + '...');
        allHits.push({ tab: tabName, tabIdx: i, ...h });
      }
    } else {
      console.log(
        '✅ Tab ' +
          i +
          ': "' +
          tabName +
          '" — clean ' +
          (switched ? '(content switched)' : '(same panel)')
      );
    }
  }

  // De Novo expected content check
  const bodyFull = await page.evaluate(() => document.body.innerText);
  const expected = ['De Novo', 'Classification', 'Special Controls', 'De Novo Workspace'];
  console.log('\n--- DE NOVO CONTENT CHECK ---');
  for (const e of expected) {
    console.log('  ' + (bodyFull.includes(e) ? '✅' : '❌') + ' "' + e + '"');
  }

  console.log('\n=== SUMMARY ===');
  console.log('Total tabs: ' + tabCount);
  console.log('Total forbidden hits: ' + allHits.length);
  if (allHits.length > 0) {
    const byTab = {};
    for (const h of allHits) {
      if (!byTab[h.tab]) byTab[h.tab] = [];
      byTab[h.tab].push(h);
    }
    console.log('\nContaminated tabs:');
    for (const [tab, hits] of Object.entries(byTab)) {
      console.log('  "' + tab + '": ' + [...new Set(hits.map(h => h.label))].join(', '));
    }
  }

  await browser.close();
  process.exit(allHits.length > 0 ? 1 : 0);
}
run().catch(e => {
  console.error('Crashed:', e.message);
  process.exit(2);
});
