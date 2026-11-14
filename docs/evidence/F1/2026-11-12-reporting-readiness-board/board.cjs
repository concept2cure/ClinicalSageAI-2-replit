// GA-DEMO-06 re-check: the readiness board in Reporting for the demo organisation, and the digest opened for C2C-101.
// Usage: node board.cjs <out-dir> <tag>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', OUT = process.argv[2], TAG = process.argv[3] || 'board', PROGRAM = '1ca8c7c0-e05b-4fc1-97b3-7fd2b90ca6b8';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const out = {};
  for (const [width, mobile] of [[1440, false], [390, true]]) {
    const ctx = await b.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    await ctx.addInitScript((auth) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', auth.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(auth.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e.message)));
    await p.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    const chip = p.getByRole('button', { name: /Compare readiness across all my projects/ });
    const chips = await p.evaluate(() => [...document.querySelectorAll('[data-work-area="insights"] button')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 80).slice(0, 40));
    let board = null;
    if (await chip.count()) {
      await chip.first().click(); await p.waitForTimeout(2500);
      board = await p.evaluate(() => ({ cards: [...document.querySelectorAll('.ro-port-card')].map((c) => ({ text: c.innerText.replace(/\s+/g, ' ').trim(), width: Math.round(c.getBoundingClientRect().width), height: Math.round(c.getBoundingClientRect().height) })), head: (document.querySelector('.ro-rep-head, .ro-dash-head, .ro-sec-h') || {}).innerText || null }));
      await p.screenshot({ path: path.join(OUT, `${TAG}-${width}.png`), fullPage: true });
    }
    out[width] = { chips, board, errors };
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(path.join(OUT, `${TAG}-probes.json`), JSON.stringify(out, null, 2));
  console.info(JSON.stringify(out[1440].board, null, 1)); console.info('chips', JSON.stringify(out[1440].chips));
})().catch((e) => { console.error(e); process.exit(1); });
