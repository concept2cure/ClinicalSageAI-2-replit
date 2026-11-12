/**
 * On a pathway screen's Audit trail tab: how many event rows draw their event code over the person's name.
 *   node probe-audit-rows.cjs <base-url> <email> <path-and-query> [width]
 */
/* global getComputedStyle -- the row check runs in the page, not in Node. */
const { chromium } = require('playwright');
const [BASE_ARG, EMAIL, URL_PATH, W = '1440'] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: Number(W), height: 900 } })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
  }, EMAIL);
  await page.goto(BASE + URL_PATH, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.locator('.mdx-shell .pwt-btn').nth(1).click();
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.mdx-shell .audit-row')];
    let over = 0; let clipped = 0; const examples = [];
    for (const row of rows) {
      const chip = row.querySelector('.audit-chip'); const actor = row.querySelector('.audit-actor');
      if (!chip || !actor) continue;
      const range = document.createRange(); range.selectNodeContents(chip);
      const inkRight = range.getBoundingClientRect().right; // where the chip's text ends, drawn or not
      const chipRight = chip.getBoundingClientRect().right; const actorLeft = actor.getBoundingClientRect().left;
      const drawnRight = getComputedStyle(chip).overflow === 'visible' ? Math.max(chipRight, inkRight) : chipRight;
      if (drawnRight > actorLeft + 1) { over++; if (examples.length < 2) examples.push(chip.innerText.trim()); }
      if (chip.scrollWidth > chip.clientWidth + 1) clipped++;
    }
    return { rows: rows.length, overlapping: over, clippedWithEllipsis: clipped, examples };
  });
  console.info(`${URL_PATH.split('?')[0]} @${W}: ${r.rows} rows, ${r.overlapping} draw the event code over the name, ${r.clippedWithEllipsis} wider than their space (shortened with an ellipsis once clipped) ${r.examples.length ? '(e.g. ' + r.examples.join('; ') + ')' : ''}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
