/**
 * The project's data room with Quality records in it (finding from the showcase walk, 2026-11-10).
 *   node walk.cjs [base-url]     Lumen lead, LMN-201 → Evidence. Writes walk.json and evidence-list.png. Signs out.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'lumen.lead@lumen-demo.example';
(async () => {
  const browser = await chromium.launch(); const out = { base: BASE, at: new Date().toISOString() };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
    await page.goto(BASE + '/');
    const who = await page.evaluate(async (email) => {
      const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json(); const exp = new Date(Date.now() + 86_400_000).toISOString();
      for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
        s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
      const p = await (await fetch('/api/c2c/projects', { headers: { Authorization: `Bearer ${j.accessToken}` } })).json();
      return { status: r.status, projects: (p.projects ?? p.data ?? p).map((x) => ({ id: x.id, name: x.name ?? x.title })) };
    }, EMAIL);
    const project = who.projects.find((p) => /LMN-201/.test(p.name)); out.project = project;
    await page.goto(`${BASE}/concept2cure/project-home?program=${project.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Evidence/ }).click({ timeout: 20000 });
    await page.locator('.pj-src').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    out.rows = await page.locator('.pj-src').evaluateAll((els) => els.map((el) => ({
      title: el.querySelector('span span')?.textContent.trim(), line: el.querySelector('.sec-sub')?.textContent.trim(),
      buttons: [...el.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.textContent).trim().replace(/ .*/, '…')),
    })));
    const quality = out.rows.filter((r) => /^Quality record/.test(r.line || ''));
    out.summary = { rows: out.rows.length, files: out.rows.length - quality.length, qualityRecords: quality.length,
      firstQualityAt: out.rows.findIndex((r) => /^Quality record/.test(r.line || '')),
      fileAfterQuality: out.rows.some((r, i) => !/^Quality record/.test(r.line || '') && i > out.rows.findIndex((x) => /^Quality record/.test(x.line || '')) && out.rows.findIndex((x) => /^Quality record/.test(x.line || '')) >= 0),
      qualityWithFileButtons: quality.filter((r) => r.buttons.length).length,
      titledByBareId: out.rows.filter((r) => /: ([0-9]+|[0-9a-f]{8}-[0-9a-f-]{27})$/.test(r.title || '')).map((r) => r.title) };
    await page.locator('.pj-src').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => { const m = document.querySelector('main') || document.scrollingElement; m.scrollBy(0, -160); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(__dirname, 'evidence-list.png') });
    const q = page.locator('.pj-src', { hasText: 'Quality record' }).first();
    if (await q.count()) { await q.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(__dirname, 'evidence-list-quality-records.png') }); }
    await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined); });
    console.info(JSON.stringify(out.summary, null, 1));
  } catch (e) { out.error = String(e && e.stack || e); console.error(out.error); process.exitCode = 1; }
  finally { fs.writeFileSync(path.join(__dirname, 'walk.json'), JSON.stringify(out, null, 2) + '\n'); await browser.close(); }
})();
