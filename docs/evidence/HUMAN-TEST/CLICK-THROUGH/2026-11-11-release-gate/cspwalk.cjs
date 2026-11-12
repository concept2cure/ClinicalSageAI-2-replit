// Opens every stop a click-through reached on the BUILT client (the app started with SKIP_VITE=1 after `npm run
// build`), under the content security policy a release enforces, and records what the browser refused, every
// uncaught error and every script or stylesheet that failed to load.
//
//   node cspwalk.cjs <base> <email> <stops.json> <out.jsonl>
//
// A development process sends its policy report-only and looser (server/middleware/enterprise-security.ts,
// securityHeaders). This rewrites each page's header into the enforcing policy of the same file's production branch:
// script-src loses 'unsafe-eval'; style-src-elem loses 'unsafe-inline' and gains the fonts stylesheet host; font-src,
// connect-src and object-src are the production lists. upgrade-insecure-requests is left out: the sandbox has no TLS.
// The nonce is the server's own, per request. Keep the two lists below in step with that file.
const fs = require('fs');
const { chromium } = require('playwright');
const [BASE, EMAIL, STOPS, OUT] = process.argv.slice(2);
const TAB_SEL = '[role="tab"], button.pj-lc-stage';
const TAB_ON = '[role="tab"][aria-selected="true"], button.pj-lc-stage[aria-current="step"]';
const stops = JSON.parse(fs.readFileSync(STOPS, 'utf8'));
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).key; } catch { return null; } }) : []);
const keyOf = (s) => s.url + '#' + (s.tabs || []).join('>');

function releasePolicy(reportOnly) {
  const d = Object.fromEntries(reportOnly.split(';').map((p) => p.trim()).filter(Boolean).map((p) => { const [k, ...v] = p.split(/\s+/); return [k, v]; }));
  const nonce = (d['script-src'] || []).find((v) => v.startsWith("'nonce-"));
  d['script-src'] = (d['script-src'] || []).filter((v) => v !== "'unsafe-eval'");
  d['style-src-elem'] = ["'self'", nonce, 'https://fonts.googleapis.com'].filter(Boolean);
  d['font-src'] = ["'self'", 'https://fonts.gstatic.com'];
  d['connect-src'] = ["'self'", 'https://api.openai.com', 'https://*.neon.tech', 'wss:'];
  d['object-src'] = ["'none'"];
  delete d['report-uri']; delete d['report-to'];
  return Object.entries(d).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}

async function login(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
  }, EMAIL);
}

async function openStop(page, stop) {
  await page.goto(BASE + stop.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const selected = await page.$$eval(TAB_ON, (ts) => ts.filter((t) => t.getBoundingClientRect().width > 2).map((t) => (t.getAttribute('aria-label') || t.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
  for (const tab of [...(stop.selected || []).filter((t) => !selected.includes(t)), ...(stop.tabs || [])]) {
    const byName = page.getByRole('tab', { name: tab, exact: true }).first();
    const target = (await byName.count()) ? byName : page.locator(TAB_SEL).filter({ hasText: tab }).first();
    if (await target.count()) { await target.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(900); }
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

(async () => {
  const todo = stops.filter((s) => !done.has(keyOf(s)));
  for (let i = 0; i < todo.length; i += 20) {
    const up = await fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false);
    if (!up) { fs.appendFileSync(OUT, JSON.stringify({ kind: 'fatal', error: 'the app did not answer /healthz' }) + '\n'); process.exit(1); }
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let policySeen = '';
    await context.route('**/*', async (route) => {
      const req = route.request();
      if (req.resourceType() !== 'document' || req.frame().parentFrame()) return route.continue();
      const res = await route.fetch();
      const headers = { ...res.headers() };
      const ro = headers['content-security-policy-report-only'];
      if (ro) { policySeen = releasePolicy(ro); headers['content-security-policy'] = policySeen; delete headers['content-security-policy-report-only']; }
      await route.fulfill({ response: res, headers });
    });
    await context.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.effectiveDirective} | ${String(e.blockedURI).slice(0, 90)} | ${String(e.sourceFile || '').split('/').slice(-1)[0].slice(0, 50)}:${e.lineNumber} | ${String(e.sample || '').slice(0, 60)}`));
    });
    const page = await context.newPage();
    let errors = []; let failed = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message || e).slice(0, 240)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 240)); });
    page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && /\.(js|css|woff2?|ttf|svg|png)(\?|$)/.test(u)) failed.push(`${r.status()} ${u.replace(BASE, '').slice(0, 120)}`); });
    page.on('requestfailed', (r) => { const u = r.url(); if (!u.includes('/api/')) failed.push(`failed ${u.replace(BASE, '').slice(0, 120)} ${r.failure()?.errorText || ''}`); });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await login(page);
    for (const stop of todo.slice(i, i + 20)) {
      errors = []; failed = [];
      await page.evaluate(() => { window.__csp = []; }).catch(() => {});
      await openStop(page, stop);
      const csp = await page.evaluate(() => [...new Set(window.__csp || [])]).catch(() => ['(could not read)']);
      const main = await page.evaluate(() => ((document.querySelector('main') || document.body).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200)).catch(() => '');
      fs.appendFileSync(OUT, JSON.stringify({ kind: 'stop', key: keyOf(stop), stop, csp, errors: [...new Set(errors)].slice(0, 12), failed: [...new Set(failed)].slice(0, 12), enforced: !!policySeen, main }) + '\n');
    }
    if (i === 0) fs.appendFileSync(OUT, JSON.stringify({ kind: 'policy', policy: policySeen.replace(/'nonce-[^']+'/g, "'nonce-…'") }) + '\n');
    await page.evaluate(async () => { const t = localStorage.getItem('trialsage_access_token'); await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(() => {}); }).catch(() => {});
    await browser.close();
  }
  fs.appendFileSync(OUT, JSON.stringify({ kind: 'end', stops: stops.length }) + '\n');
})().catch((e) => { fs.appendFileSync(OUT, JSON.stringify({ kind: 'fatal', error: String(e.message || e) }) + '\n'); process.exit(1); });
