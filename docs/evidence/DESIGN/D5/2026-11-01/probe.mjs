import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.argv[2];
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const THEME = process.argv[5] || 'light';
const TAG = `${W}-${THEME}`;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: W, height: H }, hasTouch: W < 800 });
await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
const email = page.locator('input[type="email"], input[name="email"]').first();
if (await email.count()) {
  await email.fill('jm.smith@concept2cure.pro');
  await page.locator('input[type="password"]').first().fill('Dev-Shots-2026!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(6000);
}
const URL = 'http://127.0.0.1:5000/concept2cure/cmc?program=585ae9b6-d8f7-474e-bd99-797f7551df4e';
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
if (THEME === 'dark') {
  await page.evaluate(() => { document.querySelector('.c2c-v2')?.classList.add('dark'); document.documentElement.setAttribute('data-theme','dark'); });
  await page.waitForTimeout(600);
}
await page.screenshot({ path: `${OUT}/cmc-overview-${TAG}.png`, fullPage: false });
await page.screenshot({ path: `${OUT}/cmc-overview-full-${TAG}.png`, fullPage: true });

// ── The probe §WA.6 asks for ──
const probe = await page.evaluate(() => {
  const root = document.querySelector('[data-work-area]');
  if (!root) return { error: 'no [data-work-area] on the page' };
  const cs = (el) => globalThis.getComputedStyle(el);
  const upper = [...root.querySelectorAll('*')].filter((el) => cs(el).textTransform === 'uppercase'
    && (el.textContent || '').trim().length > 0);
  const accent = cs(document.querySelector('.c2c-v2')).getPropertyValue('--accent-strong').trim();
  const norm = (c) => { const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d); const v = globalThis.getComputedStyle(d).color; d.remove(); return v; };
  const want = norm(accent);
  const fills = [...root.querySelectorAll('button, a, .btn')].filter((el) => cs(el).backgroundColor === want);
  const h1 = root.querySelectorAll('h1.ph-title');
  const pg = document.querySelector('.page') || document.scrollingElement;
  return {
    workAreaClass: root.className,
    maxWidth: cs(root).maxWidth,
    padding: cs(root).padding,
    uppercase: upper.map((el) => (el.textContent || '').trim().slice(0, 48)),
    accentStrong: accent,
    orangeFills: fills.map((el) => (el.textContent || '').trim().slice(0, 40)),
    h1Count: h1.length,
    h1Text: h1[0] ? h1[0].textContent : null,
    h1Font: h1[0] ? cs(h1[0]).fontFamily + ' / ' + cs(h1[0]).fontSize : null,
    subText: root.querySelector('.ph-sub')?.textContent ?? null,
    backText: root.querySelector('.pj-back')?.textContent?.trim() ?? null,
    starters: [...root.querySelectorAll('.sp-starters[data-layout="row"] .sp-starter')].map((el) => el.textContent.trim()),
    segs: [...root.querySelectorAll('.seg .seg-b')].map((el) => `${el.textContent.trim()}${el.getAttribute('aria-pressed') === 'true' ? ' *' : ''}`),
    tabs: [...root.querySelectorAll('[role="tablist"] [role="tab"]')].map((el) => `${el.textContent.trim()}${el.getAttribute('aria-selected') === 'true' ? ' *' : ''}`),
    retiredText: ['What to do now', 'flows into', 'Linked to', 'come from', 'later release', 'comes later', 'NEXT STEP']
      .filter((t) => (root.textContent || '').includes(t)),
    answerLeads: root.querySelectorAll('.al-lead:not([data-emphasis="verdict"])').length,
    sidewaysOverflow: pg.scrollWidth - pg.clientWidth,
    pageHeight: root.scrollHeight,
  };
});
console.info(`\n=== ${TAG} ===\n` + JSON.stringify(probe, null, 1));

// ── Study records half, then Stability ──
await page.getByRole('button', { name: 'Study records', exact: true }).click();
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/cmc-records-${TAG}.png`, fullPage: false });
const matHeight = await page.evaluate(() => document.querySelector('[data-work-area]').scrollHeight);
console.info(`Substance & product page height: ${matHeight}px`);
await page.getByRole('tab', { name: 'Stability', exact: true }).click();
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/cmc-stability-${TAG}.png`, fullPage: true });
const stab = await page.evaluate(() => {
  const root = document.querySelector('[data-work-area]');
  const tbl = root.querySelector('.reg-tbl');
  return {
    tabs: [...root.querySelectorAll('[role="tab"]')].map((e) => `${e.textContent.trim()}${e.getAttribute('aria-selected') === 'true' ? ' *' : ''}`),
    tableOverflow: tbl ? tbl.scrollWidth - tbl.clientWidth : 'no table',
    rowActions: [...root.querySelectorAll('.reg-tbl tbody tr:first-child button')].map((e) => e.textContent.trim()),
  };
});
console.info('stability: ' + JSON.stringify(stab, null, 1));
// Back to Module 3, then back to Study records: should reopen on Stability.
await page.getByRole('button', { name: 'Module 3', exact: true }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Study records', exact: true }).click();
await page.waitForTimeout(1500);
const came = await page.evaluate(() => [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map((e) => e.textContent.trim()));
console.info('reopened Study records on: ' + JSON.stringify(came));
await b.close();
