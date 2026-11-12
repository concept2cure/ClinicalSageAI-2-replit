// The report pack ZIP with a legal original: Bundles → a pack → Choose legal companions → pick the letter → download.
// 1440x900, light. Usage: node zip.cjs <out-dir>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', PROGRAM = 'e89b7009-bb05-4060-8bc0-6da509648e95', OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript((a) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
  const p = await ctx.newPage(); const log = { errors: [], http: [] }; const out = {};
  p.on('pageerror', (e) => log.errors.push(String(e.message)));
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) log.http.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  await p.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Bundles' }).click();
  const card = p.locator('.rl-card, [data-testid="rl-bundle"]', { hasText: 'Re-walk pack' }).first();
  await card.waitFor({ timeout: 30000 });
  await card.getByRole('button', { name: 'Choose legal companions for ZIP' }).click();
  await p.getByText('Letter of Authorization (US agent)').first().waitFor({ timeout: 30000 });
  out.chooser = await card.evaluate((c) => (c.querySelector('fieldset') || c).innerText.replace(/\s+/g, ' ').slice(0, 700));
  out.optionText = await card.locator('label', { hasText: 'Letter of Authorization (US agent)' }).first().innerText();
  const box = card.locator('label', { hasText: 'Letter of Authorization (US agent)' }).locator('input[type="checkbox"]');
  if (await box.isDisabled()) { await p.screenshot({ path: path.join(OUT, 'zip-chooser-disabled-1440.png') }); console.info(JSON.stringify(out, null, 1)); await b.close(); return; }
  await box.check();
  const zipButton = card.getByRole('button', { name: /\(ZIP\)/ });
  out.zipButton = { text: await zipButton.textContent(), disabled: await zipButton.isDisabled() };
  await p.screenshot({ path: path.join(OUT, 'zip-chooser-picked-1440.png') });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }), zipButton.click()]);
  const f = path.join(OUT, await dl.suggestedFilename()); await dl.saveAs(f);
  out.zip = { name: path.basename(f), bytes: fs.statSync(f).size };
  await p.waitForTimeout(1500);
  out.after = await p.evaluate(() => [...document.querySelectorAll('[role="status"],[role="alert"]')].map((x) => x.innerText.slice(0, 200)).filter(Boolean));
  out.log = log; await b.close();
  fs.writeFileSync(path.join(OUT, 'zip-probes.json'), JSON.stringify(out, null, 2)); console.info(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
