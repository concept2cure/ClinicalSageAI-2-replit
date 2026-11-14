// Source words, after the change: C2C-101's Executive Readiness Digest opened, and a saved run's evidence table.
// Usage: node walk.cjs <out-dir>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', OUT = process.argv[2], PROGRAM = '1ca8c7c0-e05b-4fc1-97b3-7fd2b90ca6b8';
fs.mkdirSync(OUT, { recursive: true });
const readTables = () => ({ title: (document.querySelector('.ro-rep-title') || {}).innerText || null,
  headings: [...document.querySelectorAll('.ro-sec-h')].map((h) => h.innerText),
  tables: [...document.querySelectorAll('.ro-rep table, table.ro-table')].map((t) => [...t.querySelectorAll('tr')].map((r) => [...r.querySelectorAll('th,td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()))).slice(0, 4),
  rawIds: (document.querySelector('[role="tabpanel"]') || document.body).innerText.match(/\b(artifact_state|artifact_approval|submission_readiness|regional_package_manifest|module1_content|market_support)\b/g) || [],
  overflow: (() => { const x = document.querySelector('#c2c-page'); return x ? x.scrollWidth - x.clientWidth : null; })() });
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const H = { Authorization: `Bearer ${a.accessToken}` };
  const b = await chromium.launch(); const out = {};
  for (const [width, mobile] of [[1440, false], [390, true]]) {
    const ctx = await b.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    await ctx.addInitScript((auth) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', auth.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(auth.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e.message)));
    await p.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /How ready is C2C-101 to file/ }).first().click(); await p.waitForTimeout(6000);
    out[`digest-${width}`] = { ...(await p.evaluate(readTables)), errors: [...errors] };
    const sec = p.locator('.ro-sec', { hasText: 'Source readiness' }).first();
    if (await sec.count()) { await sec.scrollIntoViewIfNeeded(); await sec.screenshot({ path: path.join(OUT, `digest-sources-${width}.png`) }); }
    await ctx.close();
  }
  await b.close();
  // The saved run's evidence rows, as the route sends them.
  const runs = await (await fetch(`${BASE}/api/report-os/runs?limit=3`, { headers: H })).json();
  const list = runs.data?.runs || runs.data || [];
  const run = list.find((r) => r.reportTypeId === 'readiness.executive_digest') || list[0];
  if (run) { const d = await (await fetch(`${BASE}/api/report-os/runs/${run.id}/dependencies`, { headers: H })).json(); out.dependencies = { runId: run.id, rows: (d.data || []).map((r) => ({ provider: r.provider, sourceLabel: r.sourceLabel, status: r.status })) }; }
  fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(out, null, 2));
  console.info(JSON.stringify({ d1440: out['digest-1440'], d390: { tables: out['digest-390'].tables.length, rawIds: out['digest-390'].rawIds, overflow: out['digest-390'].overflow, errors: out['digest-390'].errors }, dependencies: out.dependencies }, null, 1).slice(0, 2600));
})().catch((e) => { console.error(e); process.exit(1); });
