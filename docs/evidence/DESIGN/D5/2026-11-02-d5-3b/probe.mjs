/**
 * D5-3b in the running app: the design assessment and the governed documents.
 *
 * Opened against a REAL persisted study design (seeded through the governed
 * route `POST /api/study-design/persist`, as the Create-design drawer does),
 * because the demo database had none and without one the assessment section
 * does not render at all. Every figure the probe reads back is the engine's:
 * 137 subjects, 90% power, "inadequate", 4 of 10 checks, and the gate codes
 * EST-001 / PWR-003 / PWR-006 / MTH-001 / MIS-002 / POP-001.
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
const email = page.locator('input[type="email"], input[name="email"]').first();
if (await email.count()) {
  await email.fill('jm.smith@concept2cure.pro');
  await page.locator('input[type="password"]').first().fill('Dev-Shots-2026!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(6000);
}
await page.goto(`http://127.0.0.1:5000/concept2cure/biostatistics?program=${PROG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(9000);
if (THEME === 'dark') {
  await page.evaluate(() => { document.querySelector('.c2c-v2')?.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); });
  await page.waitForTimeout(600);
}
// The design must be the selected one for the assessment to render.
const row = page.locator('.bs-side .sp-row').first();
if (await row.count() && (await row.getAttribute('aria-pressed')) !== 'true') {
  await row.click();
  await page.waitForTimeout(7000);
}
await page.screenshot({ path: `${OUT}/biostat-${TAG}.png`, fullPage: false });
await page.screenshot({ path: `${OUT}/biostat-full-${TAG}.png`, fullPage: true });

const probe = await page.evaluate(() => {
  const root = document.querySelector('[data-work-area]');
  if (!root) return { error: 'no [data-work-area] on the page' };
  const cs = (el) => globalThis.getComputedStyle(el);
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const norm = (c) => { const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d); const v = cs(d).color; d.remove(); return v; };
  const want = norm(cs(document.querySelector('.c2c-v2')).getPropertyValue('--accent-strong').trim());
  const assess = root.querySelector('.bs-assess');
  const gov = [...root.querySelectorAll('.pj-sec')].find((s) => /Statistical documents/.test(txt(s.querySelector('h2'))));
  const pg = document.querySelector('.page') || document.scrollingElement;
  /* Only text a reader can see. `<details>` content is in the document whether
     it is open or shut, and a `title` is not on the face of the screen, so
     neither counts towards "printed on screen". */
  const visible = [...root.querySelectorAll('*')]
    .filter((el) => el.children.length === 0 && !el.closest('details:not([open])') && cs(el).display !== 'none')
    .map((el) => txt(el)).join(' | ');
  return {
    primaryFills: [...root.querySelectorAll('button, a, .btn')].filter((el) => cs(el).backgroundColor === want).map((el) => txt(el).slice(0, 40)),
    uppercase: [...root.querySelectorAll('*')].filter((el) => cs(el).textTransform === 'uppercase' && txt(el)).map((el) => txt(el).slice(0, 40)),
    assessHeading: txt(assess?.querySelector('.pj-sec-h h2')),
    assessSummary: txt(assess?.querySelector('.pj-sec-h .sec-sub')),
    assessHeadActs: [...(assess?.querySelectorAll('.pj-sec-h .pj-sec-acts button') || [])].map((el) => `${txt(el)}${el.disabled ? ' [disabled]' : ''}`),
    assessDoors: [...(assess?.querySelectorAll('.bs-assess-b > .pj-sec-acts button') || [])].map((el) => txt(el)),
    assessFrame: assess ? `${cs(assess).backgroundColor} / border ${cs(assess).borderTopWidth} / padding ${cs(assess).padding} / margin-top ${cs(assess).marginTop}` : null,
    disclosureSummary: txt(assess?.querySelector('.pj-more > summary')),
    disclosureBody: txt(assess?.querySelector('.pj-more')).slice(0, 400),
    engineLineTitle: [...root.querySelectorAll('[title]')].map((el) => el.getAttribute('title')).find((t) => /input record/.test(t || '')) || null,
    gateTitles: [...root.querySelectorAll('td[title]')].map((el) => el.getAttribute('title')),
    govHeading: txt(gov?.querySelector('h2')),
    govSub: txt(gov?.querySelector('.sec-sub')),
    govRows: [...(gov?.querySelectorAll('.sp-row') || [])].map((el) => ({ face: txt(el).slice(0, 70), title: el.getAttribute('title') })),
    govEmpty: txt(gov?.querySelector('.c2c-empty-state')).slice(0, 120),
    hashOnScreen: (visible.match(/\b[0-9a-f]{12,}\b/g) || []).slice(0, 5),
    gateCodeOnScreen: (visible.match(/\b[A-Z]{3}-\d{3}\b/g) || []).slice(0, 8),
    snakeOnScreen: (visible.match(/\b[a-z]+_[a-z_]+\b/g) || []).slice(0, 8),
    sidewaysOverflow: pg.scrollWidth - pg.clientWidth,
    sectionGaps: [...root.querySelectorAll('.pj-sec')].map((s) => `${txt(s.querySelector('h2')).slice(0, 28)}: mt ${cs(s).marginTop}`),
  };
});
console.info(`\n=== ${TAG} ===\n` + JSON.stringify(probe, null, 1));

// The disclosure, opened — the standards and the filing sentence are inside it.
const more = page.locator('.bs-assess .pj-more > summary');
if (await more.count()) {
  await more.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/biostat-disclosure-${TAG}.png`, fullPage: false });
}
await b.close();
