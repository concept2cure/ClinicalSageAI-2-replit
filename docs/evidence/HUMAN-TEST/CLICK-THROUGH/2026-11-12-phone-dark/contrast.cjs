// Measure the contrast of named elements on a few screens, light and dark, against the nearest opaque background.
const { chromium } = require('playwright');
const [BASE, EMAIL, OUT] = process.argv.slice(2);
const SCREENS = [
  ['/concept2cure/tasks', null, ['.tb-empty', '.pj-act-n']],
  ['/concept2cure/rbm?program=f4d76507-eb0a-4830-8dd7-92014aa8c755', 'Monitoring plan', ['.rbm-col-empty', '.rbm-rowedit']],
  ['/concept2cure/rbm?program=f4d76507-eb0a-4830-8dd7-92014aa8c755', 'Quality tolerance limits', ['.rbm-rowedit']],
  ['/concept2cure/protocol-dev?program=f9650c58-e3c9-444f-b607-a57f51b55017', null, ['.pd-tree-opt', '.pd-soa-vw']],
  ['/concept2cure/project-home?program=f4d76507-eb0a-4830-8dd7-92014aa8c755', 'Plan', ['.py-over', '.py-cov-row .n', '.pj-act-n']],
];
const measure = (sels) => {
  const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = rgb(window.getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const out = {};
  for (const sel of sels) {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0);
    if (!els.length) { out[sel] = 'not on screen'; continue; }
    const e = els[0]; const cs = window.getComputedStyle(e); const fg = rgb(cs.color);
    const a = lum(fg); const b = lum(bgOf(e));
    out[sel] = `${((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)}:1 (${els.length}) "${(e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
  }
  return out;
};
(async () => {
  for (const dark of [false, true]) {
    const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async ({ email, dark }) => { const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const j = await r.json(); for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user)); } if (dark) localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: true })); }, { email: EMAIL, dark });
    try {
      for (const [path, tab, sels] of SCREENS) {
        await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
        if (tab) { const t = page.getByRole('tab', { name: tab, exact: true }).or(page.locator('main button.pj-lc-stage').filter({ hasText: new RegExp('^' + tab) })).first(); await t.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1500); }
        console.info(dark ? 'dark ' : 'light', path.replace('/concept2cure/', '').split('?')[0], tab || '', JSON.stringify(await page.evaluate(measure, sels)));
      }
      await page.screenshot({ path: `${OUT}-${dark ? 'dark' : 'light'}.png` });
    } finally {
      await page.evaluate(async () => { const t = localStorage.getItem('trialsage_access_token'); await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); }).catch(() => {});
      await b.close();
    }
  }
})();
