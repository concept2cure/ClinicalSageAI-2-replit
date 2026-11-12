// Projects, "Which projects are at risk this week": opened in the running app after the change. Usage: node screen.cjs <out-dir>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const out = {};
  for (const [width, mobile] of [[1440, false], [390, true]]) {
    const ctx = await b.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    await ctx.addInitScript((auth) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', auth.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(auth.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e.message)));
    await p.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    const ask = p.getByRole('button', { name: /at risk/i }).first();
    const offered = await ask.count();
    if (offered) { await ask.click(); await p.waitForTimeout(2500); }
    out[width] = await p.evaluate(() => { const s = document.querySelector('#pj-risk'); return { answer: s ? s.innerText.replace(/\s+/g, ' ').slice(0, 1400) : null, namesDeletedProject: s ? /DELETE-PROBE/.test(s.innerText) : null, projectsListed: [...document.querySelectorAll('.pj-card .pj-title, .pj-row .pj-name, [data-testid="project-card"]')].length }; });
    out[width].offered = offered; out[width].errors = errors;
    await p.screenshot({ path: path.join(OUT, `projects-at-risk-${width}.png`), fullPage: false });
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(path.join(OUT, 'screen-probes.json'), JSON.stringify(out, null, 2));
  console.info(JSON.stringify(out, null, 1).slice(0, 2400));
})().catch((e) => { console.error(e); process.exit(1); });
