/**
 * Sweep defect D3 (a) in the running app: clicking the Filing card's market row ("Dispatch blocked") must open Submit
 * at that market without moving the app shell. Before the fix the whole document scrolled by 48px and the top bar left
 * the screen: the row's screen-reader text (`.pj-sr`, position:absolute) had no positioned ancestor, so it hung off
 * the document, made the document itself scrollable, and the row's scrollIntoView scrolled it.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-sweep-fixes/d3-filing-card/walk.cjs [base-url] [programId] [label]
 *
 * With label "row-only", the page is given `.pj-mkt-verdict{position:static}` before the click: only the Filing row's
 * host is contained, the Submit verdict's is not. It shows why both hosts are positioned (the verdict's own `.pj-sr`
 * is the span that hangs off the document once Submit opens).
 *
 * Vite serves project-home-v2.css from source, so a CSS change is live without a restart. Read-only: nothing is
 * written to the project. Log: ./walk-<label>.json; shot: ./screenshots/<label>.png.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3] || '6065271c-d4b0-4936-aad1-02855423a738';
const LABEL = process.argv[4] || 'run';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');

async function signIn(page) {
  await page.goto(BASE + '/');
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
  });
}

/** Where the shell is: the document's scroll, the top bar's top edge and the abspos `.pj-sr` spans that hang off the document. */
const measure = (page) => page.evaluate(() => {
  const se = document.scrollingElement;
  const bar = document.querySelector('header.topbar, .topbar, [data-testid="topbar"], .c2c-v2 > header, header');
  const loose = Array.from(document.querySelectorAll('.pj-sr')).filter((n) => {
    const op = n.offsetParent;
    return !op || op === document.body || op === document.documentElement;
  }).length;
  return {
    scrollTop: se.scrollTop,
    scrollHeight: se.scrollHeight,
    clientHeight: se.clientHeight,
    headerTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
    headerClass: bar ? bar.className : null,
    looseSrSpans: loose,
    stage: document.querySelector('.pj-lc-stage[aria-current="step"]')?.textContent?.trim() ?? null,
    verdictTop: (() => { const v = document.querySelector('[data-testid="pj-markets"] .pj-mkt-verdict'); return v ? Math.round(v.getBoundingClientRect().top) : null; })(),
    focused: document.activeElement?.className ?? null,
  };
});

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const log = { base: BASE, program: PROGRAM, label: LABEL, startedAt: new Date().toISOString() };
  const browser = await chromium.launch();
  let failed = false;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
    const row = page.locator('[aria-labelledby="pj-filing-h"] [data-testid="pj-status-market"]').first();
    await row.waitFor({ timeout: 30000 });
    if (LABEL === 'row-only') await page.addStyleTag({ content: '.c2c-v2 .pj-mkt-verdict{position:static !important}' });
    log.row = (await row.textContent()).replace(/\s+/g, ' ').trim();
    log.before = await measure(page);
    await row.click();
    /* openMarketOnSubmit scrolls smoothly on the next frame; let it settle. */
    await page.waitForTimeout(1500);
    log.after = await measure(page);
    await page.screenshot({ path: path.join(SHOTS, `${LABEL}.png`) });
    log.assertions = {
      'document.scrollingElement.scrollTop === 0': log.after.scrollTop === 0,
      'top bar top >= 0': log.after.headerTop !== null && log.after.headerTop >= 0,
      'Submit is the open step': log.after.stage === 'Submit',
      "the market's verdict is on screen and focused": log.after.verdictTop !== null && log.after.verdictTop >= 0
        && log.after.verdictTop < 900 && /pj-mkt-verdict/.test(log.after.focused ?? ''),
    };
    failed = Object.values(log.assertions).some((v) => !v);
  } catch (e) {
    log.error = String(e && e.stack || e);
    failed = true;
  } finally {
    await browser.close();
    log.finishedAt = new Date().toISOString();
    log.result = failed ? 'FAIL' : 'PASS';
    fs.writeFileSync(path.join(HERE, `walk-${LABEL}.json`), JSON.stringify(log, null, 2));
    console.info(JSON.stringify(log, null, 2));
    process.exit(failed ? 1 : 0);
  }
})();
