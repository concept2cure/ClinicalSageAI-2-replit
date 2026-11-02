// Drive the running app: sign in (dev login, stored as ZenLogin stores it), open Compile & export for each project, read the card.
const { chromium } = require('/opt/node-tools/node_modules/playwright-core');
const fs = require('fs');
const L = __dirname;
const seed = JSON.parse(fs.readFileSync(L + '/seed.json', 'utf8'));
const BASE = 'http://127.0.0.1:5077';
(async () => {
  const exe = fs.readdirSync('/opt/pw-browsers/chromium-1194').map((d) => `/opt/pw-browsers/chromium-1194/${d}/chrome`).find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = { console: [], pageErrors: [], failed: [] };
  page.on('console', (m) => { if (m.type() === 'error') errors.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.pageErrors.push(String(e).slice(0, 300)));
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) errors.failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  await page.goto(BASE + '/auth', { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async (email) => {
    const res = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email }) });
    const data = await res.json();
    const expiry = new Date(Date.now() + (data.expiresIn || 86400) * 1000).toISOString(); // as ZenLogin stores it
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', data.accessToken); s.setItem('trialsage_refresh_token', data.refreshToken || '');
      s.setItem('trialsage_token_expiry', expiry); s.setItem('trialsage_user', JSON.stringify(data.user || {}));
    }
    return { status: res.status, success: data.success };
  }, seed.email);
  await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded' }); // as ZenLogin navigates after sign-in
  await page.waitForTimeout(3000);
  const out = { login, landedAt: page.url().replace(BASE, ''), runs: [] };
  for (const [name, program] of [['mixed', seed.mixed], ['unrecorded', seed.unrecorded]]) {
    const url = `/concept2cure/ectd-compile?program=${program}`;
    const filed = page.waitForResponse((r) => r.url().includes('/filed-state'), { timeout: 60000 }).catch(() => null);
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    const resp = await filed;
    const card = page.getByTestId('ectd-filed-state');
    try { await card.waitFor({ timeout: 45000 }); } catch (e) { await page.screenshot({ path: `${L}/debug-${name}.png` }); console.info('URL', page.url(), 'filed-state resp', resp && resp.status()); console.info((await page.locator('body').innerText()).slice(0, 2500)); console.info(JSON.stringify(errors)); throw e; }
    await page.waitForFunction(() => { const t = document.querySelector('[data-testid="ectd-filed-state"]')?.textContent ?? ''; return !t.includes('Loading what is on file') && !/On file at the agency…/.test(t); }, null, { timeout: 30000 });
    await card.scrollIntoViewIfNeeded();
    const header = await card.locator('.pj-card-h').innerText();
    const lead = await card.locator('p').first().innerText().catch(() => null);
    const tables = await card.locator('table').evaluateAll((ts) => ts.map((t) => ({ label: t.getAttribute('aria-label'), rows: [...t.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((d) => d.innerText.replace(/\s+/g, ' ').trim())) })));
    await card.screenshot({ path: `${L}/card-${name}.png` });
    out.runs.push({ project: name, url, filedStateStatus: resp ? resp.status() : null, header, lead, tables });
  }
  out.errors = errors;
  fs.writeFileSync(L + '/live-check.json', JSON.stringify(out, null, 1));
  console.info(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
