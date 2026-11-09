/**
 * D2-2b in the running app: the New project wizard's filing step (the registry picker) at 1440 and 390, light and
 * dark. The chosen tab has an ink underline; the chosen card has an ink ring (an inset box-shadow) on --bg-050, not
 * orange; a chosen filter chip is ink; nothing in the picker is drawn in the accent colour; no sideways scroll at 390.
 *
 *   node docs/evidence/DESIGN/D2/D2-2b/walk.cjs [base-url]
 *
 * Log: ./walk.json; shots: ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
const ok = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function signIn(page, dark) {
  await page.goto(BASE + '/');
  await page.evaluate(async (dark) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark }));
  }, dark);
}

/** The picker's computed look: the chosen tab, the chosen card, any chosen filter chip, and any accent in use. */
function measure() {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const probe = document.createElement('span');
  probe.style.color = 'var(--text-100)'; document.body.appendChild(probe);
  const ink = getComputedStyle(probe).color;
  probe.style.color = 'var(--accent-200)';
  const accent = getComputedStyle(probe).color; probe.remove();
  const tab = cs(document.querySelector('.rpk-tab[data-on]'));
  const card = cs(document.querySelector('.rpk-type[data-on]'));
  const fchip = cs(document.querySelector('.rpk-fchip.on'));
  const accented = Array.from(document.querySelectorAll('[class*="rpk-"]')).filter((el) => {
    const s = getComputedStyle(el);
    return [s.color, s.borderTopColor, s.borderBottomColor, s.backgroundColor].includes(accent);
  }).map((el) => el.className).slice(0, 5);
  return { ink, accent, tab: tab && { color: tab.color, underline: tab.borderBottomColor }, card: card && { shadow: card.boxShadow, border: card.borderTopColor },
    fchip: fchip && { color: fchip.color, border: fchip.borderTopColor }, accented };
}

async function openPicker(page) {
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New project/ }).first().click();
  await page.locator('.rpk-type').first().waitFor({ timeout: 30000 });
}

async function run(browser, { width, height, dark, tag }) {
  const ctx = await browser.newContext(width < 500 ? { viewport: { width, height }, hasTouch: true } : { viewport: { width, height } });
  const page = await ctx.newPage();
  await signIn(page, dark);
  await openPicker(page);
  await page.locator('.rpk-type').first().click();
  const chip = page.locator('.rpk-fchip').first();
  if (await chip.count()) await chip.click();
  await page.waitForTimeout(300);
  const m = await page.evaluate(measure);
  expect(m.tab && m.tab.color === m.ink && m.tab.underline === m.ink, `the chosen tab is ink, underlined in ink (${JSON.stringify(m.tab)} vs ${m.ink})`);
  expect(m.card && /inset/.test(m.card.shadow) && m.card.border === m.ink, `the chosen card has an ink ring (${JSON.stringify(m.card)})`);
  if (m.fchip) expect(m.fchip.color === m.ink, `a chosen filter chip is ink (${JSON.stringify(m.fchip)})`);
  expect(m.accented.length === 0, `nothing in the picker is drawn in the accent colour (${m.accented.join(', ')})`);
  await page.locator('.rpk-type[data-on]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, `filing-step-${tag}.png`) });
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (width < 500) expect(hScroll <= 1, `no sideways scroll at ${width} (${hScroll})`);
  ok(`the filing step at ${tag}`, { tab: m.tab, card: m.card, fchip: m.fchip, hScroll });
  await ctx.close();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    await run(browser, { width: 1440, height: 900, dark: false, tag: '1440-light' });
    await run(browser, { width: 1440, height: 900, dark: true, tag: '1440-dark' });
    await run(browser, { width: 390, height: 844, dark: false, tag: '390-light' });
    await run(browser, { width: 390, height: 844, dark: true, tag: '390-dark' });
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
