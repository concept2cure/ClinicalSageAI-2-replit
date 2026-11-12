/* GA walk: every launch-catalog screen, signed in, with the production access gate on.
   Usage: node walk.cjs <outDir> <baseUrl> <pwFile> */
const { chromium } = require('playwright');
const fs = require('fs');

const [, , OUT, BASE, PW_FILE] = process.argv;
const DRUG = '2d6292f3-eeb0-4ae1-9b3c-e68e89c197ad'; // C2C-201, small molecule IND
const BIO = 'af5db78f-529b-45a2-a1f0-fede3f15181b'; // LMN-201, biologic IND, Quality data
const DEVICE = '747737b6-7d3a-431d-9082-3b8a102b771f'; // NEUR, 510(k)

const SCREENS = [
  ['home', null], ['projects', null], ['project-home', DRUG], ['project-home', BIO], ['project-home', DEVICE],
  ['tasks', DRUG], ['communication-center', DRUG], ['vault', DRUG], ['document-authoring', DRUG], ['review', DRUG],
  ['protocol-dev', DRUG], ['submission-center', DRUG], ['ectd-compile', DRUG], ['gateway-transmittals', DRUG],
  ['ind-checklist', DRUG], ['dispatch-readiness', DRUG], ['quality', BIO], ['quality', null], ['cmc', DRUG], ['cmc', BIO],
  ['rbm', BIO], ['biostatistics', DRUG], ['insights', null], ['compliance-reports', null], ['audit-trail', null],
  ['apps', null], ['admin-console', null], ['usage', null], ['licensing', null], ['access-requests', null],
  ['identity-console', null], ['onboarding', null],
  ['device-510k', DEVICE], ['device-pma', DEVICE], ['device-cer', DEVICE], ['device-diagnostics', DEVICE],
  ['device-clinical-studies', DEVICE], ['device-software', DEVICE], ['device-engineering', DEVICE], ['device-udi', DEVICE],
  ['device-postmarket', DEVICE], ['device-presub', DEVICE], ['human-factors', DEVICE], ['labeling', DEVICE],
];

const FAIL_TEXT = /(couldn[’']t (load|read)|could not be (read|loaded|verified)|failed to load|something went wrong|didn[’']t load|not available on your plan|not included in your subscription|is locked|LAUNCH_SCOPE|\[object Object\])/i;
const FAIL_STRICT = /\b(NaN|undefined|null)\b/;

function failHits(text) {
  const soft = (text.match(new RegExp(FAIL_TEXT.source, 'gi')) || []).map((x) => x.toLowerCase());
  const strict = text.match(new RegExp(FAIL_STRICT.source, 'g')) || [];
  return [...new Set([...soft, ...strict])];
}

/** Click every tab on the screen; record what each one fails on. */
async function clickTabs(page, id, program, findings, base) {
  const labels = await page.evaluate(() => [...document.querySelectorAll('main [role="tab"], main .tabs > button, main .tabs > .tab')]
    .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
  for (const label of [...new Set(labels)].slice(0, 14)) {
    const bad = []; const errors = [];
    const onResponse = async (r) => {
      if (r.status() < 400 || !r.url().includes('/api/')) return;
      let code = '';
      try { const b = await r.json(); code = b?.error?.code ?? b?.code ?? (typeof b?.error === 'string' ? b.error : ''); } catch { /* not JSON */ }
      bad.push(`${r.status()} ${r.request().method()} ${r.url().replace(base, '').slice(0, 130)} ${String(code).slice(0, 60)}`);
    };
    const onPageError = (e) => errors.push(`pageerror: ${String(e.message || e).slice(0, 300)}`);
    page.on('response', onResponse); page.on('pageerror', onPageError);
    let clicked = true;
    try {
      const tab = page.locator('main [role="tab"], main .tabs > button, main .tabs > .tab').filter({ hasText: label }).first();
      await tab.click({ timeout: 4000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(900);
    } catch { clicked = false; }
    const text = (await page.evaluate(() => (document.querySelector('main') || document.body).innerText)).replace(/\s+/g, ' ');
    page.off('response', onResponse); page.off('pageerror', onPageError);
    const failText = failHits(text);
    if (!clicked || bad.length || errors.length || failText.length) {
      findings.push({ id, program: program ? program.slice(0, 4) : null, tab: label, clicked, textLength: text.length, failText, errors: [...new Set(errors)].slice(0, 4), badResponses: [...new Set(bad)].slice(0, 8) });
    }
  }
  return labels.length;
}

async function signIn(page) {
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.fill('input[type=email], input[name=email]', 'rr5-author@example.test');
  await page.fill('input[type=password]', fs.readFileSync(PW_FILE, 'utf8').trim());
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(6000);
}

async function visit(page, id, program, findings) {
  const errors = [];
  const bad = [];
  const onConsole = (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); };
  const onPageError = (e) => errors.push(`pageerror: ${String(e.message || e).slice(0, 300)}`);
  const onResponse = async (r) => {
    const u = r.url();
    if (r.status() < 400 || !u.includes('/api/')) return;
    let code = '';
    try { const b = await r.json(); code = b?.error?.code ?? b?.code ?? (typeof b?.error === 'string' ? b.error : ''); } catch { /* not JSON */ }
    bad.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '').slice(0, 140)} ${String(code).slice(0, 60)}`);
  };
  page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResponse);
  const url = `${BASE}/concept2cure/${id}${program ? `?program=${program}` : ''}`;
  let gotoError = null;
  try { await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); } catch (e) { gotoError = String(e.message).slice(0, 120); }
  await page.waitForTimeout(2500);
  const text = (await page.evaluate(() => (document.querySelector('main') || document.body).innerText)).replace(/\s+/g, ' ');
  const hits = failHits(text);
  const landed = page.url().replace(BASE, '');
  const name = `${id}${program ? `-${program.slice(0, 4)}` : ''}`;
  await page.screenshot({ path: `${OUT}/shots/${name}.png` });
  page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResponse);
  const tabs = process.env.WALK_TABS ? await clickTabs(page, id, program, findings.tabs, BASE) : 0;
  findings.screens.push({
    tabs,
    id, program: program ? program.slice(0, 4) : null, landed: landed.slice(0, 90),
    redirected: !landed.startsWith(`/concept2cure/${id}`), gotoError,
    textLength: text.length, failText: hits, errors: [...new Set(errors)].slice(0, 6), badResponses: [...new Set(bad)].slice(0, 12),
    head: text.slice(0, 160),
  });
}

(async () => {
  fs.mkdirSync(`${OUT}/shots`, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const findings = { screens: [], tabs: [] };
  try {
    await signIn(page);
    for (const [id, program] of SCREENS) await visit(page, id, program, findings);
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
  }
  for (const t of findings.tabs) console.info(`✗ TAB ${t.id}${t.program ? `(${t.program})` : ''} › ${t.tab}: ${t.clicked ? '' : 'NOT CLICKABLE '}${t.failText.join('|')} ${t.errors.length ? `ERR:${t.errors.length}` : ''} ${t.badResponses.length ? `HTTP:${t.badResponses.length}` : ''}`);
  console.info(`tabs clicked across screens: ${findings.screens.reduce((n, x) => n + x.tabs, 0)}; tab findings: ${findings.tabs.length}`);
  for (const f of findings.screens) {
    const flags = [f.redirected ? `REDIRECT→${f.landed}` : '', f.gotoError ? 'TIMEOUT' : '', f.failText.length ? `TEXT:${f.failText.join('|')}` : '',
      f.errors.length ? `ERR:${f.errors.length}` : '', f.badResponses.length ? `HTTP:${f.badResponses.length}` : ''].filter(Boolean).join(' ');
    console.info(`${flags ? '✗' : '✓'} ${f.id}${f.program ? `(${f.program})` : ''} ${flags}`);
  }
})();
