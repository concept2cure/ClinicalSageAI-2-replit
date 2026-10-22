// ANA-SUMMARY S5 browser acceptance at 1440x900 on the private instance (:5087)
// with a scratch stand-in model (:8811, plays in ./stand-in-s5-plays.diff).
// Drives the real app as the seeded user: a four-part request whose Summary
// must show four "Added task" rows and then Started and Completed in order;
// each task opened lists its steps; the task AnA completed although both of
// its steps failed shows the fact; the task completed with no step says so.
// The same Summary is read again after a reload. Every SSE frame is recorded
// from inside the page (a fetch tee).
import fs from 'node:fs';
import path from 'node:path';
import { chromium, signIn, sleep, say, BASE, OUT, watchedPage, writeLog } from '../../../../QA-2026-10-08/rate-limits/scripts/lib.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const JM = { email: 'jm.smith@concept2cure.pro', password: process.env.QA_PASSWORD };
const ASK = 's5 tasks: find the stability reports, list the project documents, read the two archived reports, and summarise the shelf-life claims';
const shots = path.join(OUT, 'screens');
fs.mkdirSync(shots, { recursive: true });
let n = 0;
const shot = async (page, name) => {
  n += 1;
  await page.screenshot({ path: path.join(shots, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false }).catch(() => {});
};

// Tee every /api/ana-ri/stream body into window.__s5Frames, frame by frame.
const TEE = `
  (() => {
    window.__s5Frames = [];
    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await orig(...args);
      const url = String(args[0] && args[0].url ? args[0].url : args[0]);
      if (!/\\/api\\/ana-ri\\/stream/.test(url) || !res.body) return res;
      const [a, b] = res.body.tee();
      (async () => {
        try {
          const reader = b.getReader(); const dec = new TextDecoder(); let buf = '';
          for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
            let i; while ((i = buf.indexOf('\\n\\n')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i + 2);
              if (f.startsWith('data: ')) { try { window.__s5Frames.push({ at: Date.now(), ...JSON.parse(f.slice(6)) }); } catch {} } } }
        } catch {}
      })();
      return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  })();`;

/** The open Summary, as a person reads it: header, each row's words (closed details excluded), and every opened detail. */
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
  const items = [...s.querySelectorAll('.ana-summary-list > li')];
  return {
    head: s.querySelector('.ana-summary-head')?.innerText ?? null,
    rows: items.map(words),
    details: items.map((li) => {
      const d = li.querySelector('.ana-activity-detail:not([hidden])');
      return d ? d.innerText.replace(/\n+/g, ' / ') : null;
    }),
    foot: [...s.querySelectorAll('.ana-summary-foot')].map((f) => f.innerText.replace(/\s+/g, ' ').trim()),
  };
};

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await signIn(browser, JM);
await ctx.addInitScript(TEE);
const log = [];
const page = await watchedPage(ctx, log);
const result = {};

const lastSummaryButton = () => page.locator('button.ana-activity-summary').last();
const summaryIn = () => page.evaluate(READ_SUMMARY, '.ct-side');

/** Open every task row's chevron in the open Summary and read it. */
async function readWithTasksOpen(tag) {
  const taskRows = page.locator('.ct-side .ana-summary-list > li').filter({ hasText: /^(Added task|Started|Completed)/ });
  const count = await taskRows.count();
  for (let i = 0; i < count; i++) await taskRows.nth(i).locator('button.ana-activity-row').first().click().catch(() => {});
  await sleep(400);
  const s = await summaryIn();
  const archived = page.locator('.ct-side .ana-summary-list > li').filter({ hasText: /^Completed\s*Read the two archived reports/ }).first();
  await archived.scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, `${tag}-archived-task-open`);
  return s;
}

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await sleep(1500);
await page.getByText('Vorelinib · KIT-mutant GIST', { exact: false }).first().click();
await sleep(4500);

// 1. The four-part request, Balanced (under 240 characters, thinking off).
const box = page.locator('textarea:visible').last();
await box.fill(ASK);
await box.press('Enter');
const samples = [];
let opened = false;
for (let i = 0; i < 200; i++) {
  await sleep(150);
  if (!opened && (await lastSummaryButton().count()) > 0) {
    await lastSummaryButton().click().catch(() => {});
    opened = true;
    await sleep(300);
    await shot(page, 'live');
  }
  if (opened) {
    const s = await summaryIn();
    if (s) samples.push(s.rows.join(' | '));
  }
  const closed = await page.evaluate(() => window.__s5Frames.some((f) => f.type === 'post_done' || f.type === 'error'));
  if (closed && i > 6) break;
}
await sleep(3000);
const frames = await page.evaluate(() => window.__s5Frames);
result.timeline = frames.filter((f) => f.type === 'timeline').map((f) => f.event);
result.liveSamples = [...new Set(samples)].slice(-6);

// 2. The settled Summary: open it at the turn, open each task.
await lastSummaryButton().click().catch(() => {});
await sleep(2000);
await shot(page, 'settled');
result.settled = await readWithTasksOpen('settled');
result.threadUrl = page.url();

// 3. After a reload, read back from the record.
await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await sleep(5000);
await lastSummaryButton().click().catch(() => {});
await sleep(2500);
result.afterReload = await readWithTasksOpen('after-reload');

// What the acceptance asks, computed from the rows as read.
const taskRows = (rows) => rows.filter((r) => /^(Added task|Started|Completed|Removed task) /.test(r));
const rowsOf = result.afterReload?.rows ?? [];
const tasks = taskRows(rowsOf);
const detailOf = (re) => {
  const i = rowsOf.findIndex((r) => re.test(r));
  return i >= 0 ? result.afterReload.details[i] : null;
};
result.checks = {
  firstFourAreAdded: tasks.slice(0, 4).every((r) => r.startsWith('Added task')),
  taskRowOrder: tasks,
  findDetail: detailOf(/^Completed Find the stability reports/),
  archivedRow: rowsOf.find((r) => /^Completed Read the two archived reports/.test(r)) ?? null,
  archivedDetail: detailOf(/^Completed Read the two archived reports/),
  summariseRow: rowsOf.find((r) => /^Completed Summarise the shelf-life claims/.test(r)) ?? null,
  sameAfterReload: JSON.stringify(result.settled?.rows) === JSON.stringify(result.afterReload?.rows),
  stepTasks: result.timeline.filter((e) => e.kind === 'step' && e.phase === 'finished').map((e) => `${e.label} → ${e.task}`),
};

fs.writeFileSync(path.join(OUT, 's5-tasks.json'), JSON.stringify(result, null, 2));
writeLog('s5-tasks-errors', log);
await browser.close();
say(JSON.stringify({ events: result.timeline.length, checks: { ...result.checks, taskRowOrder: result.checks.taskRowOrder.length }, errors: log.length }));
