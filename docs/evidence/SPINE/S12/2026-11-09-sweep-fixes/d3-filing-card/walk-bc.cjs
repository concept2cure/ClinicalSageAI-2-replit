/**
 * Sweep defects D3 (b) and (c) in the running app (Vite serves the client from source, so ProjectHome.tsx and
 * programSequence.ts are live without a restart):
 *
 *  (b) the Filing card's Commitments row opens Respond with "Commitments to the agency" scrolled into view and focused,
 *      and the shell does not move;
 *  (c) the project header's byline names the filing as the project list does: "DMF", "Clinical study report",
 *      "IND amendment" (it printed "dmf" and "clinical study report").
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-sweep-fixes/d3-filing-card/walk-bc.cjs [base-url] [programWithCommitments]
 *
 * Read-only. Log: ./walk-bc.json (walk-bc-red.json is the first run, before .pj-stagebody was positioned: the row
 * landed, but the shell moved 48px on Respond); shots: ./screenshots/bc-*.png.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3] || '6065271c-d4b0-4936-aad1-02855423a738';
/* Local projects by stored program_type (GET /api/c2c/projects), each opened by its address. */
const FILINGS = [
  { id: 'aa9bf1c4-9b1a-4f04-87bf-f08dbe6d17a4', stored: 'dmf', words: 'DMF' },
  { id: '8835514e-ff8c-4b1c-9a23-c0049189780f', stored: 'csr', words: 'Clinical study report' },
  { id: 'deb50e36-2c9e-4ae2-ac2b-13827bb4ae0d', stored: 'ind_amendment', words: 'IND amendment' },
];
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

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const log = { base: BASE, program: PROGRAM, startedAt: new Date().toISOString(), b: {}, c: [] };
  const browser = await chromium.launch();
  let failed = false;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page);

    /* (b) */
    await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
    const row = page.locator('[aria-labelledby="pj-filing-h"] button.pj-k-row', { hasText: 'Commitments' }).first();
    await row.waitFor({ timeout: 30000 });
    log.b.row = await row.getAttribute('aria-label');
    await row.click();
    await page.waitForTimeout(1500);
    log.b.after = await page.evaluate(() => {
      const h = document.getElementById('pj-commitments-h');
      const r = h?.getBoundingClientRect();
      return {
        stage: document.querySelector('.pj-lc-stage[aria-current="step"]')?.textContent?.trim() ?? null,
        headingTop: r ? Math.round(r.top) : null,
        focusedId: document.activeElement?.id ?? null,
        scrollTop: document.scrollingElement.scrollTop,
        topbarTop: Math.round(document.querySelector('header.topbar')?.getBoundingClientRect().top ?? NaN),
      };
    });
    await page.screenshot({ path: path.join(SHOTS, 'bc-commitments.png') });
    log.b.assertions = {
      'Respond is the open step': log.b.after.stage === 'Respond',
      '"Commitments to the agency" is on screen': log.b.after.headingTop !== null && log.b.after.headingTop >= 0 && log.b.after.headingTop < 900,
      'it has focus': log.b.after.focusedId === 'pj-commitments-h',
      'the shell did not move': log.b.after.scrollTop === 0 && log.b.after.topbarTop >= 0,
    };

    /* The cause under (a) and (b): on no step is the document itself scrollable (each step's visually-hidden text is
       contained by its step body), so no scrollIntoView can move the shell. */
    log.steps = [];
    for (const label of (await page.locator('.pj-lc-stage').allTextContents()).map((t) => t.trim())) {
      await page.locator('.pj-lc-stage', { hasText: label }).first().click();
      await page.waitForTimeout(1200);
      log.steps.push({ step: label, ...await page.evaluate(() => ({ scrollHeight: document.scrollingElement.scrollHeight, clientHeight: document.scrollingElement.clientHeight })) });
    }
    log.b.assertions['no step makes the document scrollable'] = log.steps.length > 0 && log.steps.every((s) => s.scrollHeight === s.clientHeight);

    /* (c) */
    for (const f of FILINGS) {
      await page.goto(`${BASE}/concept2cure/project-home?program=${f.id}`, { waitUntil: 'networkidle' });
      const chip = page.locator('.pj-top .pj-tags .rd-chip').first();
      let shown = null;
      try { await chip.waitFor({ timeout: 20000 }); shown = (await chip.textContent()).trim(); } catch { shown = null; }
      await page.screenshot({ path: path.join(SHOTS, `bc-header-${f.stored}.png`), clip: { x: 0, y: 0, width: 1440, height: 260 } });
      log.c.push({ ...f, shown, ok: shown === f.words });
    }
    failed = Object.values(log.b.assertions).some((v) => !v) || log.c.some((c) => !c.ok);
  } catch (e) {
    log.error = String(e && e.stack || e);
    failed = true;
  } finally {
    await browser.close();
    log.finishedAt = new Date().toISOString();
    log.result = failed ? 'FAIL' : 'PASS';
    fs.writeFileSync(path.join(HERE, 'walk-bc.json'), JSON.stringify(log, null, 2));
    console.info(JSON.stringify(log, null, 2));
    process.exit(failed ? 1 : 0);
  }
})();
