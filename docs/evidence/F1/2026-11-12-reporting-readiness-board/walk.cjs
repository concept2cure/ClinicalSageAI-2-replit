// GA-DEMO-06 after the change: the readiness board at 1440 and 390, light and dark, and C2C-101's digest opened.
// Usage: node walk.cjs <out-dir>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', OUT = process.argv[2], PROGRAM = '1ca8c7c0-e05b-4fc1-97b3-7fd2b90ca6b8';
fs.mkdirSync(OUT, { recursive: true });
const readBoard = () => {
  const pg = document.querySelector('#c2c-page'); const first = document.querySelector('.ro-port-card');
  const colour = (sel) => { const el = first && first.querySelector(sel); return el ? window.getComputedStyle(el).color : null; };
  return { cards: [...document.querySelectorAll('.ro-port-card')].map((c) => ({ code: (c.querySelector('.ro-port-code') || {}).innerText, facts: (c.querySelector('.ro-port-filing') || {}).innerText,
      blockers: [...c.querySelectorAll('.ro-port-blocker')].map((b) => b.innerText), width: Math.round(c.getBoundingClientRect().width), height: Math.round(c.getBoundingClientRect().height),
      narrowestLine: Math.min(...[...c.querySelectorAll('.ro-port-blocker, .ro-port-b')].map((b) => Math.round(b.getBoundingClientRect().width))) })),
    blockerColour: colour('.ro-port-blocker'), factsColour: colour('.ro-port-filing'), cardBackground: first ? window.getComputedStyle(first).backgroundColor : null,
    overflow: pg ? pg.scrollWidth - pg.clientWidth : null };
};
const readDigest = () => ({ title: (document.querySelector('.ro-rep-title') || {}).innerText || null,
  tables: [...document.querySelectorAll('.ro-rep table, .ro-table')].map((t) => [...t.querySelectorAll('tr')].map((r) => [...r.querySelectorAll('th,td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()))).slice(0, 3),
  blockers: [...document.querySelectorAll('.ro-blockers li, .ro-blk li, [class*="blocker"] li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()).slice(0, 8),
  text: (document.querySelector('.ro-rep') || document.querySelector('[role="tabpanel"]')).innerText.replace(/\s+/g, ' ').slice(0, 1600) });
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const out = {};
  for (const [width, mobile] of [[1440, false], [390, true]]) for (const dark of [false, true]) {
    const ctx = await b.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    await ctx.addInitScript(([auth, isDark]) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', auth.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(auth.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: isDark, welcomeDismissed: true })); }, [a, dark]);
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e.message)));
    const key = `${width}-${dark ? 'dark' : 'light'}`;
    await p.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /Compare readiness across all my projects/ }).first().click(); await p.waitForTimeout(2500);
    out[`board-${key}`] = { ...(await p.evaluate(readBoard)), errors: [...errors] };
    await p.screenshot({ path: path.join(OUT, `board-${key}.png`), fullPage: true });
    if (!dark) {
      await p.getByRole('button', { name: /How ready is C2C-101 to file/ }).first().click(); await p.waitForTimeout(6000);
      out[`digest-${key}`] = { ...(await p.evaluate(readDigest)), errors: [...errors] };
      await p.screenshot({ path: path.join(OUT, `digest-${key}.png`), fullPage: true });
    }
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(out, null, 2));
  for (const [k, v] of Object.entries(out)) if (k.startsWith('board')) console.info(k, '| cards', v.cards.map((c) => `${c.width}x${c.height}`).join(' '), '| narrowest text', Math.min(...v.cards.map((c) => c.narrowestLine)), '| overflow', v.overflow, '| errors', v.errors.length);
  console.info(JSON.stringify(out['digest-1440-light'], null, 1).slice(0, 2600));
})().catch((e) => { console.error(e); process.exit(1); });
