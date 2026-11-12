// Crop the device section out of a page for a close look. Usage: node crop.cjs <program|none> <out.png> <width> [dark]
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', PROGRAM = process.argv[2], OUT = process.argv[3], W = Number(process.argv[4] || 1440), DARK = process.argv[5] === 'dark';
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const mobile = W < 600;
  const ctx = await b.newContext({ viewport: { width: W, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  await ctx.addInitScript(([a, dark]) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark, welcomeDismissed: true })); }, [a, DARK]);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/concept2cure/insights${PROGRAM === 'none' ? '' : `?program=${PROGRAM}`}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const el = p.locator('[data-testid="rc-device-portfolio"]');
  if (await el.count()) { await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: OUT }); console.info('cropped', OUT, JSON.stringify(await el.boundingBox())); }
  else console.info('no device section on this page');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
