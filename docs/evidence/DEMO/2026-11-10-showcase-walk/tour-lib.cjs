/* Shared by the showcase tours: sign in through "Demo access" as a person does, and record at each stop a
   screenshot, API responses >= 400, console errors, visible error wording, and text a client should not see
   (raw identifiers, ISO times, undefined/NaN, UUIDs). */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
const ERR_WORDS = /couldn.t load|could not be read|could not load|failed to load|something went wrong|did not load|unexpected error|internal server error|is not a function|undefined is not|cannot read prop|fetch failed|request failed|try again later/i;
const RAW = [
  ['iso-time', /\b20\d\d-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?Z?\b/],
  ['uuid', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['undefined', /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b(?! hypothesis)/],
  ['snake_case', /\b[a-z]{2,}(?:_[a-z0-9]+){1,}\b/],
  ['error-code', /\b[A-Z]{3,}(?:_[A-Z0-9]+){2,}\b/],
];

async function open(who, opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: opts.scale || 1,
    ...(opts.video ? { recordVideo: { dir: opts.video, size: { width: 1440, height: 900 } } } : {}) });
  const page = await context.newPage();
  const net = []; const cons = [];
  page.on('response', (res) => { const u = res.url(); if (u.includes('/api/') && res.status() >= 400) net.push(`${res.status()} ${res.request().method()} ${u.replace(BASE, '').slice(0, 150)}`); });
  page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 220)); });
  page.on('pageerror', (e) => cons.push('PAGEERROR ' + String(e).slice(0, 220)));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('button', { name: /demo access/i }).waitFor({ timeout: 120000 });
  if (who) await page.locator('select[aria-label="Demo person"]').selectOption(who);
  await page.getByRole('button', { name: /demo access/i }).click();
  await page.waitForSelector('.c2c-v2', { timeout: 120000 });
  await page.waitForTimeout(3000);
  return { browser, context, page, net, cons, results: [] };
}

async function read(page) {
  return page.evaluate(({ errSrc, raw }) => {
    const main = document.querySelector('main') || document.body;
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.width > 0; };
    const leaves = [...main.querySelectorAll('*')].filter((el) => el.children.length === 0 && visible(el) && (el.textContent || '').trim());
    const err = new RegExp(errSrc, 'i');
    const errorText = leaves.filter((el) => err.test(el.textContent)).map((el) => el.textContent.trim().slice(0, 180)).slice(0, 6);
    const alerts = [...main.querySelectorAll('[role="alert"]')].filter(visible).map((el) => el.textContent.trim().slice(0, 200)).slice(0, 6);
    const rawText = {};
    for (const [name, src] of raw) {
      const re = new RegExp(src[0], src[1]);
      const hits = leaves.filter((el) => !el.closest('code, pre, .mono, input, textarea') && re.test(el.textContent)).map((el) => el.textContent.trim().slice(0, 120));
      if (hits.length) rawText[name] = [...new Set(hits)].slice(0, 5);
    }
    const title = (main.querySelector('h1, .ph-title, .reg-title') || {}).textContent;
    return { title: title ? title.trim().slice(0, 90) : null, errorText, alerts, rawText,
      sideways: document.scrollingElement.scrollWidth > window.innerWidth + 1,
      words: (main.innerText || '').trim().split(/\s+/).length };
  }, { errSrc: ERR_WORDS.source, raw: RAW.map(([n, re]) => [n, [re.source, re.flags]]) });
}

/** What a stop's record flags, for the one-line log. */
function flagsOf(r) {
  const raw = r.rawText ? Object.keys(r.rawText) : [];
  return [r.error && 'ERROR', r.apiFailures.length && `api:${r.apiFailures.length}`, r.consoleErrors.length && `console:${r.consoleErrors.length}`,
    (r.errorText || []).length && `errText:${r.errorText.length}`, (r.alerts || []).length && `alerts:${r.alerts.length}`,
    raw.length && `raw:${raw.join(',')}`, r.sideways && 'sideways'].filter(Boolean);
}

async function stop(w, out, name, fn, settle = 2500) {
  const { page, net, cons, results } = w;
  const before = { net: net.length, cons: cons.length };
  const r = { stop: name };
  try {
    await fn();
    await page.waitForTimeout(settle);
    r.url = page.url().replace(BASE, '');
    Object.assign(r, await read(page));
    await page.screenshot({ path: `${out}/${name}.png` });
  } catch (e) { r.error = String(e).split('\n')[0].slice(0, 260); try { await page.screenshot({ path: `${out}/${name}-ERR.png` }); } catch { /* none */ } }
  r.apiFailures = net.slice(before.net);
  r.consoleErrors = cons.slice(before.cons).slice(0, 6);
  results.push(r);
  const flags = flagsOf(r);
  console.info(name.padEnd(44), flags.length ? flags.join(' ') : 'clean', '|', r.title || '');
  return r;
}
const rail = (page, name) => page.locator('.nav-item', { hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`) }).first();
module.exports = { open, stop, read, rail, BASE, fs };
