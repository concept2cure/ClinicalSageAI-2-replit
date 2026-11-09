/* global getComputedStyle */
/**
 * D0-16's frame probe: the page title's left x, the frame root, sideways scroll and anything past the viewport or its
 * card, per work area at 1440 and 390, on the walk-1109 stack (the D0-15 recipe). Split into small functions so the
 * repo's lint holds; it measures exactly what the first version measured, and frame-after.json is this script's run.
 */
const fs = require('fs');

const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const P = 'c2ed888d-2958-4332-b186-e81482f2ceec';
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/frame-after';
const SCREENS = [
  ['projects', '/concept2cure/projects'],
  ['project', `/concept2cure/project-home?program=${P}`],
  ['submission-center', `/concept2cure/submission-center?program=${P}`],
  ['tasks', `/concept2cure/tasks?program=${P}`],
  ['review', `/concept2cure/review?program=${P}`],
  ['communication', `/concept2cure/communication-center?program=${P}`],
  ['rbm', `/concept2cure/rbm?program=${P}`],
  ['ind-lifecycle', `/concept2cure/ind-lifecycle?program=${P}`],
  ['vault', `/concept2cure/vault?program=${P}`],
  ['etmf', `/concept2cure/etmf?program=${P}`],
];
const SIZES = [{ w: 1440, h: 900 }, { w: 390, h: 844, mobile: true }];

/** Runs in the page. Every helper is declared inside, because page.evaluate serialises one function. */
function probePage() {
  const cs = (e) => getComputedStyle(e);
  const vis = (e) => {
    if (!e || !e.getClientRects().length) return false;
    const s = cs(e);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  const box = (e) => e.getBoundingClientRect();
  const firstVisible = (sel) => [...document.querySelectorAll(sel)].find(vis) || null;
  /** 'inside-scroller' when the nearest scrolling ancestor holds it; such an element moves only its own row. */
  const scrollerOf = (el, stop) => {
    for (let a = el.parentElement; a && a !== stop; a = a.parentElement) {
      if (cs(a).overflowX !== 'visible') return a;
    }
    return null;
  };
  const pastViewport = () => {
    const out = [];
    const W = window.innerWidth;
    for (const el of document.querySelectorAll('.page *')) {
      const r = box(el);
      if (out.length >= 5 || !vis(el) || r.width < 1 || r.right <= W + 1) continue;
      const sc = scrollerOf(el, document.body);
      if (sc && r.right > box(sc).right + 1) continue;
      out.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 40), right: Math.round(r.right) });
    }
    return out;
  };
  const pastCard = () => {
    const out = [];
    for (const card of document.querySelectorAll('.page .pj-card, .page .card, .page .de, .page .pj-sec')) {
      if (out.length >= 5 || !vis(card)) continue;
      const cr = box(card);
      for (const el of card.querySelectorAll('*')) {
        const r = box(el);
        if (out.length >= 5 || !vis(el) || r.width < 1 || r.right <= cr.right + 1 || scrollerOf(el, card)) continue;
        out.push({ card: String(card.className).slice(0, 30), tag: el.tagName, cls: String(el.className || '').slice(0, 40), over: Math.round(r.right - cr.right) });
      }
    }
    return out;
  };
  const title = firstVisible('.ph-title, .reg-title, .surface-head h1, .pj-title, .page h1, .page h2');
  const root = firstVisible('.page-inner, .pj-index, .sp');
  const pg = document.querySelector('.page');
  const rbm = document.querySelector('.rbm-content');
  const ana = document.querySelector('.rbm-ana');
  return {
    title: title ? { text: title.textContent.trim().slice(0, 50), left: Math.round(box(title).left) } : null,
    root: root ? { cls: String(root.className || '').slice(0, 50), left: Math.round(box(root).left), width: Math.round(box(root).width), padL: cs(root).paddingLeft, maxW: cs(root).maxWidth } : null,
    page: pg ? { scrollWidth: pg.scrollWidth, clientWidth: pg.clientWidth, sideways: pg.scrollWidth > pg.clientWidth } : null,
    docSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    pastViewport: pastViewport(),
    pastCard: pastCard(),
    rbm: rbm ? { contentWidth: Math.round(box(rbm).width), anaOpen: !!ana && vis(ana), anaWidth: ana ? Math.round(box(ana).width) : null } : null,
  };
}

async function openScreen(page, url) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.c2c-v2', { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

async function measureSize(browser, size, res) {
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, isMobile: !!size.mobile, hasTouch: !!size.mobile,
    storageState: S + '/walk-1109-capture/work/state.json',
  });
  const page = await ctx.newPage();
  for (const [key, url] of SCREENS) {
    try {
      await openScreen(page, url);
    } catch (e) {
      res[`${key}-${size.w}`] = { error: String(e).slice(0, 200) };
      continue;
    }
    res[`${key}-${size.w}`] = await page.evaluate(probePage);
    if (size.w === 1440) await page.screenshot({ path: `${OUT}/${key}-1440-light.png` });
  }
  await ctx.close();
}

function line(key, v) {
  if (v.error) return `${key.padEnd(24)} ERR ${v.error}`;
  const t = v.title ? `${v.title.left} (${v.title.text.slice(0, 24)})` : '-';
  const r = v.root ? `${v.root.cls.slice(0, 22)} L${v.root.left} W${v.root.width} pad ${v.root.padL}` : '-';
  return `${key.padEnd(24)} title ${t} root ${r} | sideways ${v.page?.sideways}/${v.docSideways} past ${v.pastViewport.length} card ${v.pastCard.length}`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--disable-gpu', '--no-sandbox'] });
  const res = {};
  try {
    for (const size of SIZES) await measureSize(browser, size, res);
  } finally {
    await browser.close();
  }
  fs.writeFileSync(OUT + '/frame-after.json', JSON.stringify(res, null, 1));
  for (const [k, v] of Object.entries(res)) console.info(line(k, v));
}

main().catch((e) => {
  console.error('ERR', String(e).slice(0, 600));
  process.exit(1);
});
