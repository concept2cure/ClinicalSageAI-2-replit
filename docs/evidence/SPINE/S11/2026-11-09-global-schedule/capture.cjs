// S11 step 6b evidence: the global schedule in Reporting & analytics, in the running app,
// 1440x900 and 390x844 (mobile), light and dark. Usage: node capture.cjs <out-dir>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', PROGRAM = 'e89b7009-bb05-4060-8bc0-6da509648e95', OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

function probe() {
  const fig = document.querySelector('[data-testid="global-schedule"]');
  const rows = [...document.querySelectorAll('[data-testid="global-schedule-row"]')].map((r) => ({
    text: r.innerText.replace(/\s+/g, ' ').trim(),
    marks: [...r.querySelectorAll('.py-line-dot')].map((d) => `${d.getAttribute('data-kind')}: ${d.getAttribute('aria-label')}`),
    clock: Boolean(r.querySelector('.py-line-clock')),
    today: r.querySelector('.py-line-today') ? r.querySelector('.py-line-today').style.left : null,
  }));
  const pg = document.querySelector('#c2c-page');
  const orange = [...document.querySelectorAll('button, a')].filter((el) => {
    const bg = window.getComputedStyle(el).backgroundColor; const m = bg.match(/\d+/g);
    return m && Number(m[0]) > 150 && Number(m[1]) < 120 && Number(m[2]) < 90 && el.getBoundingClientRect().width > 0;
  }).length;
  return {
    result: (document.querySelector('[data-testid="rc-find-result"]') || {}).innerText || null,
    title: (document.querySelector('.ro-dash h2') || {}).textContent || null,
    rows, caption: fig && fig.querySelector('figcaption') ? fig.querySelector('figcaption').innerText : null,
    off: (document.querySelector('[data-testid="global-schedule-off"]') || {}).innerText || null,
    overflow: pg ? pg.scrollWidth - pg.clientWidth : null, docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    orange,
  };
}

async function signIn(ctx, a, dark) {
  await ctx.addInitScript(([a, dark]) => {
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_refresh_token', a.refreshToken || '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {}));
    }
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark, welcomeDismissed: true }));
  }, [a, dark]);
}

async function view(b, a, { key, vp, mobile, dark }) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
  await signIn(ctx, a, dark);
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e.message)));
  const failed = []; p.on('response', (r) => { if (r.status() >= 500) failed.push(`${r.status()} ${r.url()}`); });
  await p.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await p.getByRole('group', { name: 'Find suggestions' }).getByRole('button', { name: 'When does each project file?' }).click();
  await p.locator('[data-testid="global-schedule-row"]').first().waitFor({ timeout: 60000 });
  await p.waitForTimeout(600);
  await p.locator('.ro-dash').scrollIntoViewIfNeeded();
  const theme = dark ? 'dark' : 'light';
  await p.screenshot({ path: path.join(OUT, `schedule-${key}-${theme}.png`), fullPage: false });
  const out = { ...(await p.evaluate(probe)), errors, failed };
  return { ctx, p, out };
}

(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const out = {};
  const sizes = [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, true]];
  for (const [key, vp, mobile] of sizes) {
    for (const dark of [false, true]) {
      const { ctx, p, out: o } = await view(b, a, { key, vp, mobile, dark });
      if (!dark) {
        // The find field reaches it too, and a row's name opens that project.
        const field = p.locator('.rc-find input'); await field.fill('show the filing timeline'); await field.press('Enter');
        await p.locator('[data-testid="global-schedule-row"]').first().waitFor({ timeout: 30000 });
        o.fromField = await p.locator('.ro-dash h2').textContent();
        await p.locator('.py-gs-open', { hasText: 'C2C-101' }).click();
        await p.waitForURL(/project-home/, { timeout: 30000 }); await p.waitForLoadState('networkidle');
        o.opened = { url: p.url().replace(BASE, ''), back: await p.locator('.pj-back, h1').first().innerText().catch(() => null) };
        await p.screenshot({ path: path.join(OUT, `opened-${key}-light.png`), fullPage: false });
      }
      out[`${key}-${dark ? 'dark' : 'light'}`] = o;
      await ctx.close();
    }
  }
  await b.close(); fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(out, null, 2)); console.info('done');
})().catch((e) => { console.error(e); process.exit(1); });
