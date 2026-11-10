/**
 * Shared helpers for the J3 human-test walk (authoring, review, e-signature and freeze for document types other
 * than the CSR). Sign-in is the CSR lifecycle walk's (docs/evidence/DEMO/2026-11-05-csr-lifecycle/walk-common.cjs).
 *   node docs/evidence/HUMAN-TEST/J3/<script>.cjs http://127.0.0.1:5200
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5200').replace(/\/$/, '');
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const PEOPLE = {
  author: { email: process.env.J3_AUTHOR_EMAIL || 'jm.smith@concept2cure.pro' },
  reviewer: { email: process.env.J3_REVIEWER_EMAIL || 'rhea.reviewer@concept2cure.pro', password: process.env.J3_SIGNER_PASSWORD },
  approver: { email: process.env.J3_APPROVER_EMAIL || 'ava.approver@concept2cure.pro', password: process.env.J3_SIGNER_PASSWORD },
};
const apiErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn(browser, who, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) apiErrors.push(`${who} ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`);
  });
  await page.goto(BASE + '/');
  const res = await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json();
    const exp = new Date(Date.now() + 86_400_000).toISOString();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken);
      s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', exp);
      s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    return { status: r.status, email: j.user?.email ?? null };
  }, PEOPLE[who].email);
  if (res.status !== 200) throw new Error(`dev-login ${who}: ${JSON.stringify(res)}`);
  return page;
}

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(SHOTS, name), ...opts });
  return `screenshots/${name}`;
}

function api(page, method, url, body) {
  return page.evaluate(async ([m, u, b]) => {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` },
      body: b === undefined ? undefined : JSON.stringify(b) });
    const t = await r.text();
    try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t.slice(0, 400) }; }
  }, [method, url, body]);
}

/** Visible text of the main region, trimmed, for the walk log. */
const mainText = (page, sel = 'main') => page.locator(sel).first().innerText().then((t) => t.replace(/\n{2,}/g, '\n').slice(0, 4000)).catch(() => '');

module.exports = { chromium, fs, path, BASE, SHOTS, PEOPLE, apiErrors, sleep, signIn, shot, api, mainText };
