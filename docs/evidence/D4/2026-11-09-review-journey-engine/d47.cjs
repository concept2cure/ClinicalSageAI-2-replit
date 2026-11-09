/* global getComputedStyle */
/* D4-7 walk: the review board, the document journey and the authoring engine on D0's page pattern.
   Review board 1440 light/dark and 390; journey 1440 light/dark (and its "Open in editor" lands on its document);
   engine 1440 light. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const P = 'c2ed888d-2958-4332-b186-e81482f2ceec';
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/d47';

function measurePage() {
  const root = document.querySelector('.page-inner, .reg-wrap, .ae') || document.body;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const upper = [...root.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent.trim() && vis(el) && getComputedStyle(el).textTransform === 'uppercase').map((el) => el.textContent.trim().slice(0, 40));
  const se = document.scrollingElement;
  return {
    eyebrow: !!document.querySelector('.ph-eyebrow, .reg-eyebrow'),
    title: document.querySelector('.ph .ph-title')?.textContent.trim() ?? null,
    primaries: [...document.querySelectorAll('.btn.primary')].filter(vis).map((b) => b.textContent.trim()),
    uppercase: upper.slice(0, 12),
    sideScroll: se.scrollWidth > window.innerWidth + 1,
  };
}

function measureReview() {
  const seg = (name) => {
    const g = document.querySelector(`[role="group"][aria-label="${name}"]`);
    if (!g) return null;
    return {
      cls: g.className,
      items: [...g.querySelectorAll('button')].map((b) => ({ t: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), title: b.getAttribute('title'), bg: getComputedStyle(b).backgroundColor })),
      scroll: [g.scrollWidth, g.clientWidth],
      right: Math.round(g.getBoundingClientRect().right),
    };
  };
  const h = document.querySelector('.pj-sec-h h2');
  return { scopes: seg('Show reviews'), projects: seg('Projects'), inboxHeading: h?.textContent.trim() ?? null, inboxCounts: document.querySelector('.pj-sec-h .sec-sub')?.textContent.trim() ?? null, inboxTransform: h ? getComputedStyle(h).textTransform : null, accent: getComputedStyle(document.querySelector('.c2c-v2')).getPropertyValue('--accent-strong').trim() };
}

function measureJourney() {
  const kpis = [...document.querySelectorAll('.reg-kpi')].map((k) => { const cs = getComputedStyle(k); return { l: k.querySelector('.reg-kpi-l')?.textContent.trim(), v: k.querySelector('.reg-kpi-v')?.textContent.trim(), border: cs.borderTopWidth + ' ' + cs.borderTopStyle, bg: cs.backgroundColor }; });
  const p = document.querySelector('.dj-page .dj-page-p');
  const pc = p ? getComputedStyle(p) : null;
  return { kpis, docTitle: document.querySelector('.dj-doc-title')?.textContent.trim() ?? null, prose: pc ? { family: pc.fontFamily, size: pc.fontSize, lh: pc.lineHeight, color: pc.color } : null, ask: document.querySelector('.ph-acts .btn.ghost')?.textContent.trim() ?? null };
}

function measureEngine() {
  const b = document.querySelector('.ae-badge');
  const cs = b ? getComputedStyle(b) : null;
  const ask = [...document.querySelectorAll('.ph-acts button')].map((x) => ({ t: x.textContent.trim(), cls: x.className, bg: getComputedStyle(x).backgroundColor }));
  return { badge: cs ? { border: cs.borderTopWidth + ' ' + cs.borderTopStyle, radius: cs.borderTopLeftRadius, size: cs.fontSize, bg: cs.backgroundColor } : null, headerActions: ask };
}

async function ctxFor(browser, dark, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, storageState: S + '/walk-1109-capture/work/state.json' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate((d) => { try { const k = 'c2c-v2-prefs'; const p = JSON.parse(localStorage.getItem(k) || '{}'); p.dark = d; localStorage.setItem(k, JSON.stringify(p)); } catch { /* none */ } }, dark);
  return { ctx, page };
}

async function review(browser, dark, width, results) {
  const { ctx, page } = await ctxFor(browser, dark, width);
  const name = `review-${width}-${dark ? 'dark' : 'light'}`;
  const boardCalls = [];
  page.on('request', (r) => { if (r.url().includes('/api/review/board')) boardCalls.push(r.url().replace(BASE, '')); });
  await page.goto(BASE + `/concept2cure/review?program=${P}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[role="group"][aria-label="Show reviews"]', { timeout: 60000 }); await page.waitForTimeout(2500);
  const r = { case: name, page: await page.evaluate(measurePage), review: await page.evaluate(measureReview) };
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  if (width === 1440 && !dark) {
    const before = boardCalls.length;
    await page.locator('[role="group"][aria-label="Show reviews"] button', { hasText: 'Requested by me' }).click();
    await page.waitForTimeout(2000);
    r.afterRequested = { pressed: await page.locator('[role="group"][aria-label="Show reviews"] button', { hasText: 'Requested by me' }).getAttribute('aria-pressed'), newBoardCalls: boardCalls.slice(before) };
  }
  results.push(r);
  await ctx.close();
}

async function journey(browser, dark, results) {
  const { ctx, page } = await ctxFor(browser, dark, 1440);
  const name = `journey-1440-${dark ? 'dark' : 'light'}`;
  await page.goto(BASE + '/concept2cure/doc-journey', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.reg-wrap', { timeout: 60000 }); await page.waitForTimeout(3500);
  const r = { case: name, page: await page.evaluate(measurePage), journey: await page.evaluate(measureJourney) };
  await page.screenshot({ path: `${OUT}/${name}.png` });
  if (!dark) {
    const open = page.locator('.ph-acts .btn.primary', { hasText: 'Open in editor' });
    if (await open.count()) {
      await open.click();
      await page.waitForSelector('.ed', { timeout: 30000 }); await page.waitForTimeout(3000);
      r.afterOpen = await page.evaluate(() => ({ url: location.pathname + location.search, barTitle: document.querySelector('.dcv-bar-t, .ed-bar-id')?.textContent.trim() ?? null, placement: document.querySelector('.dcv-expanded')?.getAttribute('data-placement') ?? 'page' }));
      await page.screenshot({ path: `${OUT}/journey-open-in-editor.png` });
    } else r.afterOpen = 'no Open in editor button';
  }
  results.push(r);
  await ctx.close();
}

async function engine(browser, results) {
  const { ctx, page } = await ctxFor(browser, false, 1440);
  await page.goto(BASE + '/concept2cure/authoring-engine', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.ae', { timeout: 60000 }); await page.waitForTimeout(2500);
  results.push({ case: 'engine-1440-light', page: await page.evaluate(measurePage), engine: await page.evaluate(measureEngine) });
  await page.screenshot({ path: `${OUT}/engine-1440-light.png` });
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--disable-gpu', '--no-sandbox'] });
  const results = [];
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const step = async (label, fn) => { if (only.length && !only.some((o) => label.startsWith(o))) return; try { await fn(); } catch (e) { results.push({ case: label, error: String(e).slice(0, 300) }); } };
  try {
    await step('review-1440-light', () => review(browser, false, 1440, results));
    await step('review-1440-dark', () => review(browser, true, 1440, results));
    await step('review-390-light', () => review(browser, false, 390, results));
    await step('journey-1440-light', () => journey(browser, false, results));
    await step('journey-1440-dark', () => journey(browser, true, results));
    await step('engine-1440-light', () => engine(browser, results));
  } finally { await browser.close(); }
  fs.writeFileSync(OUT + (process.env.ONLY ? '/d47-' + process.env.ONLY.replace(/,/g, '-') + '.json' : '/d47.json'), JSON.stringify(results, null, 1));
  console.info(JSON.stringify(results, null, 1));
})().catch((e) => { console.error('ERR', String(e).slice(0, 600)); process.exit(1); });
