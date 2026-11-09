/* The 1pm platform tour, walked on current trunk with no model key. Each stop: screenshot, console errors, API
   responses >= 400, and any visible error wording. Interactive stops: AnA asked a question, the editor opened. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/tour-' + (process.env.TAG || 'a');
const DARK = process.env.DARK === '1';

const ERR_WORDS = /couldn.t load|could not be read|failed to load|something went wrong|did not load|unexpected error|internal server error|is not a function|undefined is not|cannot read prop/i;

async function stop(page, name, results, net, cons, fn) {
  const before = { net: net.length, cons: cons.length };
  const r = { stop: name };
  try {
    await fn();
    await page.waitForTimeout(2500);
    r.url = page.url().replace(BASE, '');
    r.title = await page.evaluate(() => document.querySelector('.ph-title, .reg-title, h1')?.textContent.trim().slice(0, 80) ?? null);
    r.errorText = await page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      return [...document.querySelectorAll('[role="alert"], .es-title, .empty-title, .scaf-note, p, div')]
        .filter((el) => el.children.length === 0 && re.test(el.textContent || '') && el.getBoundingClientRect().height > 0)
        .map((el) => el.textContent.trim().slice(0, 160)).slice(0, 5);
    }, ERR_WORDS.source);
    r.sideways = await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth + 1);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  } catch (e) { r.error = String(e).slice(0, 300); try { await page.screenshot({ path: `${OUT}/${name}-ERR.png` }); } catch { /* none */ } }
  r.apiFailures = net.slice(before.net);
  r.consoleErrors = cons.slice(before.cons).slice(0, 6);
  results.push(r);
  console.info(name, r.error ? 'ERROR ' + r.error : 'ok', '| api>=400:', r.apiFailures.length, '| console:', r.consoleErrors.length, '| errText:', (r.errorText || []).length);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--disable-gpu', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, storageState: S + '/walk-1109-capture/work/state.json' });
  const page = await ctx.newPage();
  const net = []; const cons = [];
  page.on('response', (res) => { const u = res.url(); if (u.includes('/api/') && res.status() >= 400) net.push(`${res.status()} ${res.request().method()} ${u.replace(BASE, '').slice(0, 140)}`); });
  page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => cons.push('PAGEERROR ' + String(e).slice(0, 200)));
  const results = [];
  await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate((d) => { try { const k = 'c2c-v2-prefs'; const p = JSON.parse(localStorage.getItem(k) || '{}'); p.dark = d; localStorage.setItem(k, JSON.stringify(p)); } catch { /* none */ } }, DARK);

  await stop(page, '01-home', results, net, cons, async () => { await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.c2c-v2'); });
  await stop(page, '02-projects', results, net, cons, async () => { await page.goto(BASE + '/concept2cure/projects', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.c2c-v2'); });
  const projects = await page.evaluate(() => [...document.querySelectorAll('a, button, [role="link"]')].map((a) => a.textContent.trim()).filter((t) => /^\[Demo/.test(t)).slice(0, 12));
  results.push({ stop: 'projects-listed', projects });

  const C = 'c2ed888d-2958-4332-b186-e81482f2ceec', L = 'e00d4d40-5378-41dc-b85e-e49662afe6a6', M = '5b131ba8-f91e-4bfa-99b3-15f08e214e2d';
  const go = (url) => async () => { await page.goto(BASE + url, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.c2c-v2'); await page.waitForTimeout(2000); };
  const openDoc = (project, title) => async () => {
    await page.goto(BASE + `/concept2cure/project-home?program=${project}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.c2c-v2'); await page.waitForTimeout(3000);
    const row = page.locator('div, li').filter({ hasText: title }).filter({ has: page.locator('button', { hasText: /^\s*Open\s*$/ }) }).last();
    await row.locator('button', { hasText: /^\s*Open\s*$/ }).first().click();
    await page.waitForSelector('.ed', { timeout: 30000 }); await page.waitForTimeout(2500);
  };
  await stop(page, '03-c2c101-project', results, net, cons, go(`/concept2cure/project-home?program=${C}`));
  await stop(page, '04-clinical-overview', results, net, cons, openDoc(C, 'Module 2.5 Clinical Overview'));
  results[results.length - 1].bar = await page.evaluate(() => document.querySelector('.dcv-bar-t')?.textContent.trim() ?? null);
  await stop(page, '05-clinical-overview-document', results, net, cons, async () => { const d = page.getByRole('button', { name: /^Document$/ }).first(); if (await d.count()) await d.click(); });
  await stop(page, '06-vault', results, net, cons, go(`/concept2cure/vault?program=${C}`));
  await stop(page, '07-submission-center', results, net, cons, go(`/concept2cure/submission-center?program=${C}`));
  await stop(page, '08-cmc', results, net, cons, go(`/concept2cure/cmc?program=${C}`));
  await stop(page, '09-lmn201-project', results, net, cons, go(`/concept2cure/project-home?program=${L}`));
  await stop(page, '10-lmn201-rbm', results, net, cons, go(`/concept2cure/rbm?program=${L}`));
  await stop(page, '11-lmn201-quality', results, net, cons, go(`/concept2cure/quality?program=${L}`));
  await stop(page, '12-lmn201-tasks', results, net, cons, go(`/concept2cure/tasks?program=${L}`));
  await stop(page, '13-neuropanel-project', results, net, cons, go(`/concept2cure/project-home?program=${M}`));
  await stop(page, '14-neuropanel-510k-summary', results, net, cons, openDoc(M, '510(k) Summary'));
  await stop(page, '15-insights', results, net, cons, go('/concept2cure/insights'));
  await stop(page, '16-biostatistics', results, net, cons, go(`/concept2cure/biostatistics?program=${C}`));
  await browser.close();
  fs.writeFileSync(OUT + '/tour.json', JSON.stringify(results, null, 1));
})().catch((e) => { console.error('ERR', String(e).slice(0, 600)); process.exit(1); });
