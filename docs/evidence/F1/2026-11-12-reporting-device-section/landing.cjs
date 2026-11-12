// Sweep finding 94, re-checked: what Reporting's landing shows for a project, below the packs. 1440x900 and 390x844.
// Usage: node landing.cjs <program-uuid> <out-dir> <tag>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', PROGRAM = process.argv[2], OUT = process.argv[3], TAG = process.argv[4];
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const out = {};
  for (const [key, vp, mobile] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    await ctx.addInitScript((a) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e.message)));
    await p.goto(`${BASE}/concept2cure/insights${PROGRAM === 'none' ? '' : `?program=${PROGRAM}`}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    out[key] = await p.evaluate(() => {
      const panel = document.querySelector('[role="tabpanel"]'); const dev = document.querySelector('[data-testid="rc-device-portfolio"], .rc-device');
      const pg = document.querySelector('#c2c-page');
      return { packs: [...document.querySelectorAll('.rc-packs .pj-card, .rc-packs button, .rc-pack')].map((x) => x.innerText.replace(/\s+/g, ' ').slice(0, 160)).slice(0, 4),
        headerPrimary: (document.querySelector('.ph .btn.primary') || {}).innerText || null,
        device: dev ? dev.innerText.replace(/\s+/g, ' ').slice(0, 700) : null,
        panelTail: panel ? panel.innerText.replace(/\s+/g, ' ').slice(-600) : null, overflow: pg ? pg.scrollWidth - pg.clientWidth : null };
    });
    out[key].errors = errors;
    await p.screenshot({ path: path.join(OUT, `${TAG}-${key}.png`), fullPage: true });
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(path.join(OUT, `${TAG}-probes.json`), JSON.stringify(out, null, 2)); console.info(JSON.stringify(out['1440'], null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
