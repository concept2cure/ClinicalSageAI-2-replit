/**
 * D5-4 in the running app: the design calculators as a work area.
 *
 * §WA.6 and §B.6.1 at 1440 light and dark and 390 hasTouch. The one figure
 * this slice turns on is the count of filled primaries: there were four
 * (the defensibility assessment, Compute, the chosen engine of twenty-nine,
 * and "Open plan" in the adaptive-monitoring panel), and §B.6.1 asks for one.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.argv[2];
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
const THEME = process.argv[5] || 'light';
const TAG = `${W}-${THEME}`;
const PROG = '585ae9b6-d8f7-474e-bd99-797f7551df4e';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: W, height: H }, hasTouch: W < 800 });
await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
const email = page.locator('input[type="email"]').first();
if (await email.count()) {
  await email.fill('jm.smith@concept2cure.pro');
  await page.locator('input[type="password"]').first().fill('Dev-Shots-2026!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(6000);
}
await page.goto(`http://127.0.0.1:5000/concept2cure/biostat-workbench?program=${PROG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
if (THEME === 'dark') {
  await page.evaluate(() => { document.querySelector('.c2c-v2')?.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); });
  await page.waitForTimeout(600);
}
await page.screenshot({ path: `${OUT}/workbench-${TAG}.png`, fullPage: false });
await page.screenshot({ path: `${OUT}/workbench-full-${TAG}.png`, fullPage: true });

const probe = await page.evaluate(() => {
  const cs = (el) => globalThis.getComputedStyle(el);
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const all = (el, sel) => [...(el?.querySelectorAll(sel) || [])];
  const accentFill = () => {
    const d = document.createElement('div');
    d.style.color = cs(document.querySelector('.c2c-v2')).getPropertyValue('--accent-strong').trim();
    document.body.appendChild(d);
    const v = cs(d).color;
    d.remove();
    return v;
  };
  const visibleText = (root) => all(root, '*')
    .filter((el) => el.children.length === 0 && !el.closest('details:not([open])') && cs(el).display !== 'none')
    .map(txt).join(' | ');
  const root = document.querySelector('[data-work-area="biostat-workbench"]');
  if (!root) return { error: 'no biostat-workbench work area on the page' };
  const want = accentFill();
  const visible = visibleText(root);
  const pills = all(root, '.wb-engines .btn');
  const pg = document.querySelector('.page') || document.scrollingElement;
  return {
    maxWidth: cs(root).maxWidth,
    backText: txt(root.querySelector('.pj-back')),
    h1: all(root, 'h1.ph-title').map(txt),
    sub: txt(root.querySelector('.ph-sub')),
    sections: all(root, '.pj-sec').map((s) => txt(s.querySelector('h2'))),
    cardsLeft: all(root, '.pj-card').length,
    primaryFills: all(root, 'button, a, .btn').filter((el) => cs(el).backgroundColor === want).map((el) => txt(el).slice(0, 40)),
    uppercase: all(root, '*').filter((el) => cs(el).textTransform === 'uppercase' && txt(el)).map((el) => txt(el).slice(0, 40)),
    engines: pills.length,
    enginePressed: pills.filter((el) => el.getAttribute('aria-pressed') === 'true').map(txt),
    enginePressedBg: pills.filter((el) => el.getAttribute('aria-pressed') === 'true').map((el) => cs(el).backgroundColor),
    inputHeights: [...new Set(all(root, '.c2c-input').map((el) => cs(el).height))],
    hashOnScreen: (visible.match(/\b[0-9a-f]{12,}\b/g) || []).slice(0, 5),
    sidewaysOverflow: pg.scrollWidth - pg.clientWidth,
  };
});
console.info(`\n=== ${TAG} ===\n` + JSON.stringify(probe, null, 1));
await b.close();
