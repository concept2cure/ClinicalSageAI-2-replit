// ANA-SUMMARY S4 browser acceptance at 1440x900 on the private instance (:5086)
// with the scratch stand-in model (:8809, plays in ../stand-in-s4-plays.diff).
// Drives the real app as the seeded user: a Balanced turn whose Summary is
// opened live from its Summary button; the settled Summary and its footer; the
// same Summary after a reload; a thinking turn (a message over 240 characters)
// whose notes still arrive (decision 3, A); a stopped turn; and a colleague in
// the same organisation reading the Summary while the full record is refused.
// Every SSE frame is recorded from inside the page (a fetch tee).
import fs from 'node:fs';
import path from 'node:path';
import { chromium, signIn, sleep, BASE, OUT, watchedPage, writeLog } from '../../../../QA-2026-10-08/rate-limits/scripts/lib.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const JM = { email: 'jm.smith@concept2cure.pro', password: process.env.QA_PASSWORD };
const COLLEAGUE = { email: process.env.QA_COLLEAGUE_EMAIL, password: process.env.QA_COLLEAGUE_PASSWORD };
const shots = path.join(OUT, 'screens');
fs.mkdirSync(shots, { recursive: true });
let n = 0;
const shot = async (page, name) => {
  n += 1;
  await page.screenshot({ path: path.join(shots, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false }).catch(() => {});
};

// Tee every /api/ana-ri/stream body into window.__s4Frames, frame by frame.
const TEE = `
  (() => {
    window.__s4Frames = [];
    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await orig(...args);
      const url = String(args[0] && args[0].url ? args[0].url : args[0]);
      if (!/\\/api\\/ana-ri\\/stream/.test(url) || !res.body) return res;
      const [a, b] = res.body.tee();
      (async () => {
        const reader = b.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\\n\\n')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i + 2);
            if (f.startsWith('data: ')) { try { window.__s4Frames.push({ at: Date.now(), ...JSON.parse(f.slice(6)) }); } catch {} } } }
      })();
      return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  })();`;

/** The open Summary, as a person reads it: header, each row's words, the footer. */
const READ_SUMMARY = (root) => {
  const el = document.querySelector(root);
  const s = el && el.querySelector('.ana-summary');
  if (!s) return null;
  const words = (li) => {
    const parts = [];
    const walk = document.createTreeWalker(li, 4);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) if (!t.parentElement.closest('.ana-activity-detail')) parts.push(t.textContent);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };
  return {
    head: s.querySelector('.ana-summary-head')?.innerText ?? null,
    rows: [...s.querySelectorAll('.ana-summary-list > li')].map(words),
    foot: [...s.querySelectorAll('.ana-summary-foot')].map((f) => f.innerText.replace(/\s+/g, ' ').trim()),
  };
};

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await signIn(browser, JM);
await ctx.addInitScript(TEE);
const log = [];
const page = await watchedPage(ctx, log);
const result = { turns: [] };

async function openProject() {
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await sleep(1500);
  await page.getByText('Vorelinib · KIT-mutant GIST', { exact: false }).first().click();
  await sleep(4500);
}

const lastSummaryButton = () => page.locator('button.ana-activity-summary').last();
const summaryIn = (sel = '.ct-side') => page.evaluate(READ_SUMMARY, sel);

/** Send a message, open its Summary from the live turn, sample the Summary while it runs, return its frames. */
async function turn(text, tag, { stopAfterMs = 0 } = {}) {
  const before = await page.evaluate(() => window.__s4Frames.length);
  const box = page.locator('textarea:visible').last();
  await box.fill(text);
  await box.press('Enter');
  const samples = [];
  let opened = false;
  for (let i = 0; i < 160; i++) {
    await sleep(150);
    if (!opened && (await lastSummaryButton().count()) > 0) {
      await lastSummaryButton().click().catch(() => {});
      opened = true;
      await sleep(300);
      await shot(page, `${tag}-live`);
    }
    if (opened) {
      const s = await summaryIn();
      if (s) samples.push(s.rows.join(' | '));
    }
    if (stopAfterMs && i * 150 >= stopAfterMs) {
      await page.locator('button.ana-runctl-btn.is-stop').first().click().catch(() => {});
      stopAfterMs = 0;
    }
    const closed = await page.evaluate((b) => window.__s4Frames.slice(b).some((f) => f.type === 'post_done' || f.type === 'error'), before);
    if (closed && i > 6) break;
  }
  await sleep(2500);
  const frames = await page.evaluate((b) => window.__s4Frames.slice(b), before);
  result.turns.push({
    tag,
    text,
    timeline: frames.filter((f) => f.type === 'timeline').map((f) => f.event),
    thinkingFrames: frames.filter((f) => f.type === 'thinking').length,
    liveSamples: [...new Set(samples)].slice(0, 16),
  });
  return frames;
}

/** Open the Summary of the latest turn, every chevron in it, and read it. */
async function readLatestSummary(tag) {
  await lastSummaryButton().click().catch(() => {});
  await sleep(1500);
  const rows = page.locator('.ct-side .ana-summary button.ana-activity-row');
  for (let i = 0; i < (await rows.count()); i++) await rows.nth(i).click().catch(() => {});
  await sleep(400);
  const s = await summaryIn();
  const details = await page.evaluate(() => [...document.querySelectorAll('.ct-side .ana-summary .ana-activity-detail:not([hidden])')].map((d) => d.innerText));
  await page.locator('.ct-side .ana-summary').first().scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, `${tag}-summary-open`);
  return { ...s, details };
}

await page.setViewportSize({ width: 1440, height: 900 });
await openProject();

// 1. The main request: Balanced, under 240 characters, so thinking is off.
await turn('s4 summary: find every stability report in this project, read them, and list the shelf-life claims', 'balanced');
result.balanced = await readLatestSummary('balanced');
result.threadUrl = page.url();

// 2. After a reload, the same rows, read back from the record.
await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await sleep(5000);
result.afterReload = await readLatestSummary('after-reload');

// 3. A thinking turn: a message over 240 characters turns reasoning on, and
//    under decision 3 (A) its tool rounds still return her notes as her words.
const long = 's4 summary: find every stability report in this project, read each one in full, and list every shelf-life claim it makes, with the storage condition and the time point each claim rests on, so that I can compare them against the protocol before the meeting.';
await turn(long, 'thinking');
result.thinking = await readLatestSummary('thinking');

// 3b. A Thorough turn: reasoning on, and served by the model that returns her
//     notes as thinking blocks — decision 3 (A) is what keeps them her words.
await page.getByRole('button', { name: /Engine:/ }).first().click().catch(() => {});
await sleep(400);
await page.getByRole('radio', { name: /Thorough/ }).first().click().catch(() => {});
await sleep(400);
await page.keyboard.press('Escape').catch(() => {});
await turn('s4 summary thorough: find every stability report in this project, read them, and list the shelf-life claims', 'thorough');
result.thorough = await readLatestSummary('thorough');
await page.getByRole('button', { name: /Engine:/ }).first().click().catch(() => {});
await sleep(400);
await page.getByRole('radio', { name: /Balanced/ }).first().click().catch(() => {});
await sleep(400);
await page.keyboard.press('Escape').catch(() => {});

// 4. A stopped turn: Stop while the stand-in holds the second round.
await turn('s4 stop', 'stopped', { stopAfterMs: 4000 });
await sleep(6000);
result.stopped = await readLatestSummary('stopped');

fs.writeFileSync(path.join(OUT, 's4-desktop.json'), JSON.stringify(result, null, 2));

// 5. A colleague in the same organisation opens the same conversation.
if (COLLEAGUE.email && COLLEAGUE.password) {
  const cctx = await signIn(browser, COLLEAGUE);
  const clog = [];
  const cpage = await watchedPage(cctx, clog);
  await cpage.setViewportSize({ width: 1440, height: 900 });
  await cpage.goto(result.threadUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await sleep(5000);
  const buttons = cpage.locator('button.ana-activity-summary');
  const colleague = { buttons: await buttons.count() };
  if (colleague.buttons > 0) {
    await buttons.first().click().catch(() => {});
    await sleep(2500);
    colleague.summary = await cpage.evaluate(READ_SUMMARY, '.ct-side');
    const recorded = cpage.locator('.ct-side .ana-summary-foot button.ana-activity-row');
    if ((await recorded.count()) > 0) {
      await recorded.first().click().catch(() => {});
      await sleep(300);
      await cpage.locator('.ct-side .ana-summary-foot').getByText('Download the record for inspection').first().click().catch(() => {});
      await sleep(3000);
      colleague.download = await cpage.evaluate(() => [...document.querySelectorAll('.ct-side .ana-summary-foot [role=status]')].map((e) => e.innerText));
    }
    await cpage.screenshot({ path: path.join(shots, `${String(++n).padStart(2, '0')}-colleague-summary.png`) }).catch(() => {});
  }
  result.colleague = colleague;
  writeLog('s4-colleague-errors', clog);
  fs.writeFileSync(path.join(OUT, 's4-desktop.json'), JSON.stringify(result, null, 2));
}

writeLog('s4-desktop-errors', log);
await browser.close();
console.info(JSON.stringify({ turns: result.turns.map((t) => ({ tag: t.tag, events: t.timeline.length })), errors: log.length }));
