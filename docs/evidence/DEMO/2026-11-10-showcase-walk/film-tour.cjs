/* The platform tour, filmed: the Lumen account as its lead, at a pace a person can follow. Screens only. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2];
const BASE = 'http://127.0.0.1:5000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } });
  const page = await context.newPage();
  const errors = [];
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 100)}`); });
  const rail = (name) => page.locator('.nav-item', { hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`) }).first();
  const tab = async (name, wait = 4500) => { const t = page.locator('main [role="tab"]', { hasText: name }).first(); if (await t.count()) { await t.click(); await sleep(wait); } else console.info('no tab', name); };
  const scroll = async (dy, steps = 6, pause = 350) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(pause); } };
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const scene = async (name, fn) => { try { await fn(); await shot(name); console.info('scene', name, 'ok'); } catch (e) { console.info('scene', name, 'FAILED', String(e).split('\n')[0].slice(0, 200)); } };
  const project = async () => {
    await rail('Projects').click(); await sleep(1500);
    await page.getByText(/LMN-201 — prevention of recurrent/).first().click();
    await page.getByRole('heading', { level: 1, name: /LMN-201/ }).waitFor({ timeout: 30000 });
  };

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('button', { name: /demo access/i }).waitFor({ timeout: 120000 });
  await sleep(2500);
  await scene('01-sign-in', async () => { await page.getByRole('button', { name: /demo access/i }).click(); await page.waitForSelector('.c2c-v2', { timeout: 120000 }); await sleep(5000); });
  await page.mouse.move(720, 500);
  await scene('02-projects', async () => { await rail('Projects').click(); await sleep(4500); });
  await scene('03-lmn201', async () => { await project(); await sleep(5000); await scroll(500); await sleep(2500); });
  await scene('04-plan', async () => { await page.locator('main button', { hasText: /^\s*Plan\s*$/ }).first().click(); await sleep(2000); await scroll(450); await sleep(3500); });
  await scene('05-author', async () => { await page.locator('main button', { hasText: /^\s*Author\s*$/ }).first().click(); await sleep(4500); });
  await scene('06-vault', async () => { await rail('Vault').click(); await sleep(7000); await tab(/^Uploads/); await tab('Required documents'); await tab('Seals'); });
  await scene('07-protocol', async () => { await project(); await sleep(1500); const b = page.locator('main button', { hasText: /^\s*Study & Protocol Design\s*$/ }).first(); await b.scrollIntoViewIfNeeded(); await b.click(); await sleep(7000); await scroll(400); await sleep(2500); });
  await scene('08-biostatistics', async () => { await rail('Biostatistics').click(); await sleep(7000); await scroll(500); await sleep(2500); });
  await scene('09-rbm', async () => { await rail('Risk-based monitoring').click(); await sleep(7000); await tab('Key risk indicators'); await tab('Patient profiles'); await tab('Risk assessment'); });
  await scene('10-quality', async () => { await rail('Quality').click(); await sleep(6000); await tab('CAPA'); await tab('Deviations'); await tab('Change control'); });
  await scene('11-communication', async () => { await rail('Communication').click(); await sleep(6500); });
  await scene('12-submission-center', async () => { await rail('Submission Center').click(); await sleep(6000); await tab('Sequences'); await tab('Required deliverables'); });
  await scene('13-reporting', async () => { await rail('Reporting & analytics').click(); await sleep(6000); await tab('Run history'); });
  await scene('14-tasks', async () => { await rail('Tasks').click(); await sleep(6500); });
  await scene('15-csr', async () => {
    await project(); await sleep(1500);
    await page.locator('main button', { hasText: /^\s*Author\s*$/ }).first().click(); await sleep(1500);
    await page.getByRole('button', { name: /^Open .*Clinical Study Report — SYNTHETIC/ }).first().click();
    await page.waitForSelector('.ed', { timeout: 60000 }); await sleep(4000);
    const panel = page.locator('details[aria-label="Build from the study’s data"]');
    if (!(await panel.evaluate((d) => d.open))) await panel.locator('summary').click();
    await sleep(5000); await scroll(520, 8); await sleep(2500);
    const read = panel.getByRole('button', { name: 'Read saved section text' }).nth(1);
    await read.scrollIntoViewIfNeeded(); await read.click(); await sleep(6500);
  });
  await scene('16-document', async () => {
    const panel = page.locator('details[aria-label="Build from the study’s data"]');
    await panel.locator('summary').first().scrollIntoViewIfNeeded(); await panel.locator('summary').first().click(); await sleep(1500);
    await page.locator('main').getByText(/^Introduction$/).filter({ visible: true }).first().click(); await sleep(6500);
    const doc = page.getByRole('button', { name: /^Document$/ }).first(); if (await doc.count()) { await doc.click(); await sleep(6000); await scroll(700, 8); await sleep(3000); }
  });
  const video = page.video();
  await context.close();
  const file = path.join(OUT, 'platform-tour.webm');
  fs.renameSync(await video.path(), file);
  console.info(`Recorded ${file} (${Math.round(fs.statSync(file).size / 1024)} KB). Server errors: ${JSON.stringify(errors.slice(0, 8))}`);
  await browser.close();
})().catch((e) => { console.error('FAILED', String(e).slice(0, 500)); process.exit(1); });
