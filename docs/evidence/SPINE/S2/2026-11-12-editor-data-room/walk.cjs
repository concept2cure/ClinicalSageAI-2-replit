const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5000';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const bad = [], cons = [];
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').slice(0, 110)}`); });
  page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 160)); });
  page.on('request', (r) => { if (/\/sources\?|\/evidence$/.test(r.url())) console.log('  >', r.method(), r.url().replace(BASE, '').slice(0, 120)); });
  page.on('response', async (r) => { if (/\/sources\?/.test(r.url())) console.log('  <', r.status(), r.url().replace(BASE, '').slice(40, 130), (await r.text().catch(() => '')).slice(0, 160)); });
  page.on('requestfailed', (r) => { if (/\/sources\?/.test(r.url())) console.log('  x FAILED', r.failure()?.errorText, r.url().replace(BASE, '').slice(40, 120)); });
  page.on('requestfinished', (r) => { if (/\/sources\?limit=50&offset=0$/.test(r.url())) console.log('  = finished', r.url().slice(-30)); });
  await page.goto(BASE + '/');
  const id = await page.evaluate(async (pick) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana.author@concept2cure.pro' }) });
    const j = await r.json(); const exp = new Date(Date.now() + 86_400_000).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
    const p = await (await fetch('/api/c2c/projects', { headers: { Authorization: `Bearer ${j.accessToken}` } })).json();
    return (p.projects ?? p.data ?? p).find((x) => new RegExp(pick).test(x.name ?? x.title)).id;
  }, process.env.PICK || 'CDISCPILOT01');
  const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => 0); await page.waitForFunction(() => !document.querySelector('.pf-list[aria-busy="true"]'), null, { timeout: 45000 }).catch(() => 0); await page.waitForTimeout(700); };
  const shot = (n) => page.screenshot({ path: `${process.argv[2]}/${n}.png` });
  await page.goto(`${BASE}/concept2cure/project-home?program=${id}`); await settle();
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Author/ }).click(); await settle();
  const docs = await page.getByRole('button', { name: /^Open / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.textContent.trim()));
  console.log('documents:', JSON.stringify(docs.slice(0, 6)));
  await page.getByRole('button', { name: docs[0], exact: true }).first().click();
  await page.waitForURL(/document-authoring/, { timeout: 30000 }); await settle();
  await page.getByTestId('ed-more').waitFor({ timeout: 60000 }); await settle();
  await shot('editor');
  await page.getByTestId('ed-more').click();
  await page.getByTestId('vault-rail-open').click(); await settle();
  const lane = page.getByRole('group', { name: 'Document sources' }).getByRole('button', { name: 'Data room' });
  console.log('data room lane:', await lane.count());
  if (await lane.count()) {
    await lane.click(); const t0 = Date.now();
    const room = page.getByTestId('editor-data-room');
    await room.getByTestId('data-room-entry').first().or(room.getByText('No sources in this project yet')).or(room.getByText('could not be read')).first().waitFor({ timeout: 20000 }).catch(() => 0);
    console.log('room answered in ms:', Date.now() - t0);
    console.log('this project  :', JSON.stringify({ entries: await room.getByTestId('data-room-entry').count(), status: await room.locator('.pf-count[role="status"]').first().textContent().catch(() => null), empty: await room.getByText('No sources in this project yet').count() }));
    await shot('editor-data-room');
    await room.getByRole('button', { name: 'All my projects', exact: true }).click(); await settle();
    console.log('all projects  :', JSON.stringify({ entries: await room.getByTestId('data-room-entry').count(), vault: await room.getByTestId('data-room-vault-entry').count(), status: await room.locator('.pf-count[role="status"]').first().textContent().catch(() => null),
      groups: await room.getByTestId('data-room-group').evaluateAll((els) => els.map((e) => e.querySelector('p').textContent.trim())), sideways: await room.evaluate((el) => el.scrollWidth > el.clientWidth + 1) }));
    await room.getByRole('button', { name: 'This project', exact: true }).click();
    await room.getByTestId('data-room-entry').first().or(room.getByText('No sources in this project yet')).first().waitFor({ timeout: 20000 }).catch(() => 0);
    console.log('back to this project:', JSON.stringify({ entries: await room.getByTestId('data-room-entry').count(), loading: await room.getByText('Loading project sources').count() }));
    await room.getByRole('button', { name: 'Refresh sources' }).click(); await page.waitForTimeout(6000);
    console.log('after Refresh       :', JSON.stringify({ entries: await room.getByTestId('data-room-entry').count(), loading: await room.getByText('Loading project sources').count() }));
    const v = room.getByTestId('data-room-vault-entry').first();
    if (await v.count()) { await v.locator('summary').click(); await v.scrollIntoViewIfNeeded(); }
    await shot('editor-data-catalog');
  }
  // The CSR's study-data chooser, in the same editor.
  const build = page.getByText('Build from the study’s data').first();
  console.log('study-data section:', await build.count());
  if (await build.count()) {
    await build.scrollIntoViewIfNeeded(); await settle();
    const sel = page.locator('select').filter({ has: page.locator('option', { hasText: /xpt|json|manifest|csv/i }) }).first();
    console.log('study sources:', JSON.stringify(await sel.locator('option').allTextContents().catch(() => [])).slice(0, 600));
    await shot('editor-study-data');
  }
  console.log('api >= 400:', JSON.stringify(bad), 'console:', cons.length, JSON.stringify(cons.slice(0, 3)));
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => 0); });
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
