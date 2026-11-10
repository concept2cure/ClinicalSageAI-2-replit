/**
 * The inbox's "Draft response with AnA" in the running app: a quiet button on the project's Respond step and in
 * Communication, with the step's only orange the composer's send (plan §2, one primary per view).
 *
 *   node docs/evidence/F1/2026-11-10-inbox-draft-button-quiet/walk.cjs [base-url] [programId]
 *
 * Needs one open letter that requires a response on the project (the walk logged one through the inbox's own
 * POST /api/concept2cure/projects/:id/agency-communications). Log: ./walk.json, shots: ./*.png.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const HERE = __dirname;
const log = { base: BASE, program: PROGRAM, startedAt: new Date().toISOString(), steps: [] };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function signIn(page) {
  await page.goto(BASE + '/');
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken);
      s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 86_400_000).toISOString());
      s.setItem('trialsage_user', JSON.stringify(j.user));
    }
  });
}

/** Every visible element with the strong orange as its background, and the draft button's own background. */
const oranges = (page) => page.evaluate(() => {
  const strong = window.getComputedStyle(document.querySelector('.c2c-v2')).getPropertyValue('--accent-strong').trim();
  const probe = document.createElement('i'); probe.style.color = strong; document.body.appendChild(probe);
  const rgb = window.getComputedStyle(probe).color; probe.remove();
  const filled = Array.from(document.querySelectorAll('button')).filter((b) => b.offsetParent && window.getComputedStyle(b).backgroundColor === rgb)
    .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40));
  const draft = Array.from(document.querySelectorAll('button')).find((b) => /Draft response with AnA/.test(b.textContent || ''));
  return { filled, draftClass: draft?.className ?? null, draftBackground: draft ? window.getComputedStyle(draft).backgroundColor : null };
});

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })).newPage();
    await signIn(page);
    await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
    await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Respond/ }).click();
    const draft = page.getByRole('button', { name: /Draft response with AnA/ }).first();
    await draft.waitFor({ timeout: 20000 });
    await draft.scrollIntoViewIfNeeded();
    const respond = await oranges(page);
    await page.screenshot({ path: path.join(HERE, 'respond-1440.png') });
    expect(respond.draftClass && !/\bprimary\b/.test(respond.draftClass), 'the draft button is not primary on Respond');
    log.steps.push({ name: 'Respond step', ...respond, shot: 'respond-1440.png' });
    await page.goto(`${BASE}/concept2cure/communication-center`, { waitUntil: 'networkidle' });
    const card = page.locator('.cc-comm-foot').getByRole('button', { name: /Draft response with AnA/ }).first();
    await card.waitFor({ timeout: 20000 });
    await card.scrollIntoViewIfNeeded();
    const comm = await oranges(page);
    await page.screenshot({ path: path.join(HERE, 'communication-1440.png') });
    log.steps.push({ name: 'Communication', ...comm, shot: 'communication-1440.png' });
    log.result = 'pass';
  } catch (e) {
    log.result = 'fail'; log.error = String((e && e.stack) || e); console.error(e); process.exitCode = 1;
  } finally {
    await browser.close();
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2) + '\n');
  }
})();
