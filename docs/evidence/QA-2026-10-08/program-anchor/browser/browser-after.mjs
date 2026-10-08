// P-19 browser after-check on a PRIVATE instance (:5081) over a pg_dump copy of
// c2c_qa that deploy-migrate has run on. Signs in as raj.patel (manager).
//   1. BX-256 and Vorelinib project homes: the Plan / schedule panel.
//   2. One program created through the New Project wizard, then its project home.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, signIn, watchedPage, snap, sleep, say, BASE, OUT, writeLog } from '../../rate-limits/scripts/lib.mjs';

const RAJ = { email: 'raj.patel@concept2cure.pro', password: process.env.QA_TEAM_PASSWORD };
if (!RAJ.password) throw new Error('QA_TEAM_PASSWORD not set');
const PROGRAMS = {
  'BX-256': '099991d1-dac8-43c5-b88a-8baab26194ee',
  'Vorelinib (BX-512)': '50c41bb6-5796-4dc6-a848-72e4d1246ebd',
};
const NO_RECORD = 'This program has no schedule record';
const results = [];
const log = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await signIn(browser, RAJ);
const page = await watchedPage(ctx, log);

async function projectHome(label, programId) {
  const sched = page.waitForResponse((r) => r.url().includes(`/projects/${programId}/schedule-of-events`), { timeout: 90000 }).catch(() => null);
  await page.goto(`${BASE}/concept2cure/project-home?program=${programId}`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  // The schedule of events sits under the Plan tab.
  await page.locator('button, [role="tab"]', { hasText: /^\s*Plan\s*$/ }).first().click({ timeout: 60000 });
  const res = await sched;
  await sleep(6000);
  const text = await page.evaluate(() => document.body?.innerText ?? '');
  const shot = await snap(page, `${label}-project-home`);
  const scheduleIdx = text.search(/Schedule of events|schedule of events/);
  const r = {
    program: label,
    programId,
    scheduleOfEventsStatus: res ? res.status() : 'no request seen',
    saysNoScheduleRecord: text.includes(NO_RECORD),
    schedulePanelExcerpt: scheduleIdx >= 0 ? text.slice(scheduleIdx, scheduleIdx + 240).replace(/\s+/g, ' ') : '(panel heading not found)',
    screenshot: path.basename(shot),
  };
  say(JSON.stringify(r));
  results.push(r);
}

for (const [label, id] of Object.entries(PROGRAMS)) await projectHome(label, id);

if (process.env.ONLY_HOMES) { fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2)); writeLog('browser-log', log); await browser.close(); process.exit(0); }
// ── 2. A new program through the wizard ─────────────────────────────────────
await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pj-card', { timeout: 90000 });
await page.locator('button', { hasText: 'New project' }).first().click(); await sleep(3000);
await page.locator('button').filter({ hasText: 'Investigational New Drug Application' }).nth(0).click({ timeout: 15000 });
await sleep(500);
await page.locator('button', { hasText: /^Continue$/ }).first().click(); await sleep(1200);
const name = `P19-ANCHOR — Investigational New Drug Application (QA-FIX p19 ${new Date().toISOString().slice(11, 19)})`;
await page.getByRole('textbox', { name: /project name/i }).fill(name);
await page.getByPlaceholder('e.g. BX-204', { exact: true }).fill('P19-ANCHOR');
await page.locator('button', { hasText: /^Continue$/ }).first().click(); await sleep(1500);
await snap(page, 'wizard-review');
const posted = page.waitForResponse((r) => r.url().endsWith('/api/c2c/projects') && r.request().method() === 'POST', { timeout: 60000 });
await page.locator('button', { hasText: 'Create project' }).last().click();
const created = await posted;
const body = await created.json().catch(() => ({}));
const createdId = body?.data?.id;
const createResult = {
  createStatus: created.status(),
  programId: createdId,
  code: body?.data?.code,
  projectAnchorId: body?.meta?.projectAnchorId ?? null,
  projectAnchorCreated: body?.meta?.projectAnchorCreated ?? null,
};
say(JSON.stringify(createResult));
results.push(createResult);
await sleep(6000);
await snap(page, 'wizard-after-create');
if (createdId) await projectHome('new-wizard-program', createdId);

writeLog('browser-log', log);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
await browser.close();
