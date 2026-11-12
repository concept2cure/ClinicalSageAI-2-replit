/**
 * Measure each device screen's header in the running app: the host's context line, the title, the description
 * and each action, and whether any action is cut off at the screen's edge.
 *
 *   node probe-header.cjs <base-url> <email> <program-id> <out.json> [width] [height]
 */
/* global getComputedStyle, innerWidth -- `measure` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');

const [BASE_ARG, EMAIL, PROGRAM, OUT, W = '390', H = '844'] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const SCREENS = ['device-clinical-studies', 'device-software', 'device-engineering', 'device-udi', 'device-postmarket', 'device-presub'];

const measure = () => {
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const box = (e) => { const r = e.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; };
  const lines = (e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight));
  const nav = document.querySelector('.mdx-shell nav.page-actions');
  const head = document.querySelector('.mdx-shell .page-header');
  if (!head) return { error: 'no .page-header' };
  const title = head.querySelector('.page-title');
  const text = head.firstElementChild;
  const actions = [...head.querySelectorAll('.page-actions button, .page-actions a')].map((b) => {
    const r = box(b);
    return { name: clean(b.innerText), ...r, cutOff: r.right > innerWidth || r.left < 0 };
  });
  return {
    viewport: innerWidth,
    contextLine: nav ? { height: box(nav).height, parts: [...nav.children].map((c) => ({ text: clean(c.innerText).slice(0, 60), width: box(c).width, height: box(c).height })) } : null,
    header: box(head),
    textBlockWidth: box(text).width,
    title: { text: clean(title.innerText), fontSize: getComputedStyle(title).fontSize, lines: lines(title), ...box(title) },
    descriptions: [...head.querySelectorAll('.page-sub')].map((d) => ({ width: box(d).width, height: box(d).height })),
    actions,
    actionsCutOff: actions.filter((a) => a.cutOff).map((a) => a.name),
    firstTileTop: (() => { const t = document.querySelector('.mdx-shell .metric-card'); return t ? box(t).top : null; })(),
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: Number(W), height: Number(H) }, hasTouch: Number(W) < 500 })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const ok = await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    if (!r.ok) return `dev-login ${r.status}`;
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    return 'ok';
  }, EMAIL);
  if (ok !== 'ok') throw new Error(ok);
  const out = {};
  for (const screen of SCREENS) {
    await page.goto(`${BASE}/concept2cure/${screen}?program=${PROGRAM}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const m = await page.evaluate(measure);
    out[screen] = m;
    if (m.error) { console.info(`${screen} @${W}: ${m.error}`); continue; }
    console.info(`${screen} @${W}: context ${m.contextLine ? m.contextLine.height + 'px' : 'none'} | text block ${m.textBlockWidth}px | title ${m.title.fontSize} on ${m.title.lines} line(s) | actions ${m.actions.map((a) => `"${a.name}" ${a.left}-${a.right}`).join(', ') || 'none'} | cut off: ${m.actionsCutOff.join(', ') || 'none'} | first tile at ${m.firstTileTop} | page overflow ${m.pageOverflow}`);
  }
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}));
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
