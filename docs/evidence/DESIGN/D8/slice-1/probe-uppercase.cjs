// For each rule of mdx/app.css that sets uppercase: the texts it styles on the twelve device screens, as the markup wrote them.
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE, EMAIL, STOPS, OUT] = process.argv.slice(2);
const css = fs.readFileSync('/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/mdx/app.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = [];
for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (/text-transform:\s*uppercase/.test(m[2])) for (const s of m[1].split(',')) selectors.push(s.trim());
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 2400 } })).newPage();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(async (email) => { const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); } }, EMAIL);
  const found = {};
  for (const stop of JSON.parse(fs.readFileSync(STOPS, 'utf8'))) {
    await p.goto(BASE + stop.url, { waitUntil: 'domcontentloaded' }); await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2000);
    const got = await p.evaluate((sels) => { const out = {}; for (const sel of sels) { let els; try { els = [...document.querySelectorAll(sel)]; } catch { continue; } const texts = [...new Set(els.map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 6); if (texts.length) out[sel] = texts; } return out; }, selectors);
    for (const [sel, texts] of Object.entries(got)) (found[sel] ||= {})[stop.name] = texts;
  }
  await p.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}));
  await b.close();
  fs.writeFileSync(OUT, JSON.stringify({ selectors, found }, null, 1));
  console.info(`${selectors.length} uppercase selectors; ${Object.keys(found).length} style something on these screens`);
})();
