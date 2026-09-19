// Drive the two governed write-backs from the UI: the reason form, the POST,
// and what the surface says afterwards.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5000';
const OUT = process.env.OUT ?? path.resolve('shots-biostat-writes');
const PID = 'ab75896b-d316-49f9-b6a9-229ee3359e0e';
fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${BASE}/api/auth/dev-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@concept2cure.pro' }),
}).then((r) => r.json());

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const expiry = new Date(Date.now() + (login.expiresIn || 86400) * 1000).toISOString();
await ctx.addInitScript(([a, r, u, x, pid]) => {
  for (const st of [localStorage, sessionStorage]) {
    st.setItem('trialsage_access_token', a); st.setItem('trialsage_refresh_token', r || '');
    st.setItem('trialsage_token_expiry', x); st.setItem('trialsage_user', JSON.stringify(u || {}));
  }
  sessionStorage.setItem('c2c.shell-project', JSON.stringify({ id: pid, title: 'BX-301 Oncology IND' }));
}, [login.accessToken, login.refreshToken, login.user, expiry, PID]);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const posts = [];
page.on('response', async (r) => {
  if (r.request().method() === 'POST' && r.url().includes('/api/biostat-bridge')) {
    let body = null; try { body = (await r.text()).slice(0, 260); } catch {}
    posts.push({ url: r.url().replace(BASE, ''), status: r.status(), body });
  }
});

const out = { errors, posts: {} };
await page.goto(`${BASE}/concept2cure/biostatistics`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.c2c-v2.shell', { timeout: 30000 });
await page.waitForTimeout(4500);

// Open a design: the assessment panel (and its governed actions) only exists
// once one is selected.
const pick = page.locator('button:has(.rd-chip)').first();
out.designPicked = (await pick.count()) > 0;
if (out.designPicked) { await pick.click(); await page.waitForTimeout(4000); }
out.panelOpen = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /Apply sample size|Raise tasks/.test(t)));

async function runGoverned(label, reason) {
  const btn = page.locator(`button:has-text("${label}")`).first();
  const state = { found: (await btn.count()) > 0, disabled: null, formFields: [], toast: null };
  if (!state.found) return state;
  state.disabled = await btn.isDisabled();
  if (state.disabled) return state;
  await btn.click();
  await page.waitForTimeout(1200);
  state.formFields = await page.evaluate(() =>
    [...document.querySelectorAll('form textarea, form input, .c2c-form textarea, .c2c-form input')]
      .map((n) => n.getAttribute('placeholder') || n.getAttribute('name') || n.getAttribute('aria-label')).filter(Boolean).slice(0, 5));
  const ta = page.locator('form textarea, .c2c-form textarea, textarea').last();
  if (await ta.count()) { await ta.click(); await ta.type(reason, { delay: 5 }); }
  await page.screenshot({ path: path.join(OUT, `${label.replace(/\W+/g, '-')}-form.png`) });
  const submit = page.locator('form button[type="submit"], button:has-text("Confirm"), button:has-text("Apply"), button:has-text("Raise")').last();
  if (await submit.count()) { await submit.click(); await page.waitForTimeout(4000); }
  state.toast = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[class*="toast" i]')];
    return nodes.map((n) => n.textContent.trim().slice(0, 140)).filter(Boolean).slice(0, 3);
  });
  state.panelNumbers = await page.evaluate(() => {
    const panel = document.querySelector('.bs-side, .sp-card, main') || document.body;
    const t = panel.textContent || '';
    return {
      plannedSubjects: (t.match(/(\d+)\s*planned subjects/) || [])[1] ?? null,
      readinessChips: [...document.querySelectorAll('.rd-chip')].map((n) => n.textContent.trim()).slice(0, 4),
      raiseTasksLabel: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).find((x) => /^Raise tasks/.test(x)) ?? null,
    };
  });
  await page.screenshot({ path: path.join(OUT, `${label.replace(/\W+/g, '-')}-after.png`) });
  return state;
}

out.before = await page.evaluate(() => ({
  plannedSubjects: (document.body.textContent.match(/(\d+)\s*planned subjects/) || [])[1] ?? null,
  readinessChips: [...document.querySelectorAll('.rd-chip')].map((n) => n.textContent.trim()).slice(0, 4),
  raiseTasksLabel: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).find((x) => /^Raise tasks/.test(x)) ?? null,
}));

out.raiseTasks = await runGoverned('Raise tasks', 'Raise the statistical work items for the IND filing');
await page.waitForTimeout(1500);
out.posts.afterTasks = posts.slice();
out.applySampleSize = await runGoverned('Apply sample size to design', 'Re-apply the computed size after the assumption review');
out.posts.all = posts.slice();

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
