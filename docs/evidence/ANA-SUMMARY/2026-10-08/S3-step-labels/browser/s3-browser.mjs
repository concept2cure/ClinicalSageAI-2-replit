// ANA-SUMMARY S3 browser acceptance on the private instance (:5085) with the
// scratch stand-in model (:8798). Drives the real app as the seeded user,
// records every SSE frame of each turn from inside the page (a fetch tee), and
// captures the inline turn record at desktop and at 390x844.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, signIn, sleep, BASE, OUT, watchedPage, writeLog } from '../qa/lib.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const JM = { email: 'jm.smith@concept2cure.pro', password: process.env.QA_PASSWORD };
const shots = path.join(OUT, 'screens');
fs.mkdirSync(shots, { recursive: true });
let n = 0;
const shot = async (page, name) => {
  n += 1;
  const base = path.join(shots, `${String(n).padStart(2, '0')}-${name}`);
  await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => {});
  return base;
};

// Tee every /api/ana-ri/stream body into window.__s3Frames, frame by frame.
const TEE = `
  (() => {
    window.__s3Frames = [];
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
            if (f.startsWith('data: ')) { try { window.__s3Frames.push({ at: Date.now(), ...JSON.parse(f.slice(6)) }); } catch {} } } }
      })();
      return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  })();`;

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

/** Send one message from wherever the composer is, sample the live record, and return the turn's frames. */
async function turn(text, tag) {
  const before = await page.evaluate(() => window.__s3Frames.length);
  const box = page.locator('textarea:visible').last();
  await box.fill(text);
  await box.press('Enter');
  const live = [];
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('.ana-activity-step')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
    );
    if (rows.length) live.push(rows.join(' | '));
    const doneFrame = await page.evaluate((b) => window.__s3Frames.slice(b).some((f) => f.type === 'done' || f.type === 'post_done'), before);
    if (doneFrame && i > 6) break;
  }
  await sleep(1500);
  const frames = await page.evaluate((b) => window.__s3Frames.slice(b), before);
  const steps = frames
    .filter((f) => f.type === 'tool_use' || f.type === 'tool_result' || f.type === 'step')
    .map((f) => (f.type === 'step'
      ? { type: f.type, plan: f.plan }
      : { type: f.type, label: f.label, source: f.source, preview: f.preview, facts: f.facts, usedModel: f.usedModel, status: f.status, message: f.message }));
  const liveDistinct = [...new Set(live)];
  result.turns.push({ tag, text, steps, liveSamples: liveDistinct.slice(0, 12) });
  await shot(page, `${tag}-settled`);
  return frames;
}

/** Open the latest turn's record and every chevron in it; return the record's text and each detail's text. */
async function openLatestRecord(tag) {
  const toggles = page.locator('button.ana-activity-toggle');
  const count = await toggles.count();
  if (count > 0) {
    const t = toggles.nth(count - 1);
    if ((await t.getAttribute('aria-expanded')) === 'false') await t.click();
  }
  await sleep(400);
  const lists = page.locator('.ana-activity-list');
  const lastList = lists.nth((await lists.count()) - 1);
  const rows = lastList.locator('button.ana-activity-row');
  for (let i = 0; i < (await rows.count()); i++) await rows.nth(i).click().catch(() => {});
  await sleep(300);
  const record = await lastList.evaluate((el) => ({
    text: el.innerText,
    details: [...el.querySelectorAll('.ana-activity-detail:not([hidden])')].map((d) => d.innerText),
    previews: [...el.querySelectorAll('.ana-activity-preview')].map((d) => d.innerText),
    glyphs: [...el.querySelectorAll('.ana-activity-step')].map((li) => ({
      row: li.querySelector('.ana-activity-row')?.textContent?.trim(),
      glyph: li.querySelector('.ana-activity-glyph')?.innerHTML?.slice(0, 120),
    })),
  }));
  await lastList.scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, `${tag}-record-open`);
  return record;
}

await page.setViewportSize({ width: 1440, height: 900 });
await openProject();
await shot(page, 'desktop-project-home');

const asks = [
  ['s3 search stability', 'search'],
  ['s3 read the vault document stability protocol in full', 'read'],
  ['s3 validate', 'validate'],
  ['s3 draft', 'draft'],
];
result.records = {};
for (const [text, tag] of asks) {
  await turn(text, tag);
  result.records[tag] = await openLatestRecord(tag);
}

// Phone: the same conversation at 390x844.
await page.setViewportSize({ width: 390, height: 844 });
await sleep(1200);
const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
result.phone = { overflow };
await shot(page, 'phone-390-record');
await turn('s3 search stability', 'phone-search');
result.records['phone-search'] = await openLatestRecord('phone-search');
result.phone.after = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));

fs.writeFileSync(path.join(OUT, 's3-browser.json'), JSON.stringify(result, null, 2));
writeLog('s3-browser-errors', log);
await browser.close();
console.log(JSON.stringify({ turns: result.turns.map((t) => ({ tag: t.tag, steps: t.steps.length })), errors: log.length }, null, 0));
