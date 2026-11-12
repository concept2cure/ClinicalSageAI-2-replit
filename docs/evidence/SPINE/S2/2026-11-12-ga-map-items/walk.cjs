const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5000';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const bad = []; page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 100)}`); });
  await page.goto(BASE + '/');
  const ids = await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json(); const exp = new Date(Date.now() + 86_400_000).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
    const p = await (await fetch('/api/c2c/projects', { headers: { Authorization: `Bearer ${j.accessToken}` } })).json();
    return (p.projects ?? p.data ?? p).map((x) => ({ id: x.id, name: x.name ?? x.title }));
  }, process.env.EMAIL || 'lumen.lead@lumen-demo.example');
  const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => 0); await page.waitForFunction(() => !document.querySelector('.pf-list[aria-busy="true"]'), null, { timeout: 45000 }).catch(() => 0); await page.waitForTimeout(800); };
  const nav = page.getByRole('navigation');
  // GA-S2-07: the Vault with no project open, from a fresh sign-in.
  await page.goto(`${BASE}/concept2cure`); await settle();
  await nav.getByRole('button', { name: 'Vault', exact: true }).or(nav.getByRole('link', { name: 'Vault', exact: true })).first().click(); await settle();
  await page.getByRole('heading', { name: 'Vault' }).first().waitFor({ timeout: 60000 }).catch(() => 0); await settle();
  console.info('no project open: url', page.url().replace(BASE, ''), '| tabs', JSON.stringify(await page.getByRole('tab').allTextContents()));
  console.info('  says:', (await page.locator('main, [role="main"]').first().textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 420));
  await page.screenshot({ path: `${process.argv[2]}/vault-no-project.png` });
  const cat = page.getByRole('tab', { name: 'Data catalog' });
  if (await cat.count()) { await cat.click(); await settle(); console.info('  data catalog tab says:', (await page.getByRole('tabpanel').first().textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)); await page.screenshot({ path: `${process.argv[2]}/vault-no-project-catalog.png` }); }
  // GA-S2-05: the Uploads tab's data room strip on a project.
  const p = ids.find((x) => /LMN-201|C2C-101/.test(x.name));
  await page.goto(`${BASE}/concept2cure/project-home?program=${p.id}`); await settle();
  await nav.getByRole('button', { name: 'Vault', exact: true }).or(nav.getByRole('link', { name: 'Vault', exact: true })).first().click(); await settle();
  const tabs = await page.getByRole('tab').allTextContents();
  console.info('project', p.name.slice(0, 30), '| tabs', JSON.stringify(tabs));
  await page.getByRole('tab', { name: /^Uploads/ }).click(); await settle();
  console.info('  uploads tab says:', (await page.getByRole('tabpanel').first().textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 700));
  await page.screenshot({ path: `${process.argv[2]}/vault-uploads.png`, fullPage: true });
  console.info('api >= 400:', JSON.stringify(bad));
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => 0); });
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
