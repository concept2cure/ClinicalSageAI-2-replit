// P-99 C2 evidence: putting a sent sequence's record back from the package it sent, from its Dispatch tab, in the running
// app, on the walk's throwaway database (seed.sql; the package is a real one from the canonical packager, kept by
// keep-package.ts, its documents labelled walk stand-ins), never against an agency. 1440x900 and 390x844, light and dark.
// Adapted from ../../../D7-HELD-SEND-SETTLEMENT/2026-11-09/11-reopen/screen/capture.cjs.
//
// One person, the project's author (WALK_EMAIL): the read-back is unsigned (design §3.1.3 R8: a governed writer).
//
// Phases:
//   before  sequence A (bytes kept, read from its compiles: S0') closed and opened (S2), sequence B (no bytes kept,
//           nothing on record: S0) closed and opened (the statement path, not here yet), every size and theme;
//   act     recorded once (1440, light) on sequence A: the reason, the button, the notice (S9), the door gone;
//   after   sequence A's Dispatch tab (no door) and its eCTD Compile "On file at the agency" card (S10), every size/theme.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5100';
const WHO = process.env.WALK_EMAIL;
const PROGRAM = process.env.WALK_PROGRAM;
const SEQS = {
  a: { sub: process.env.WALK_SUB_A, id: process.env.WALK_SEQ_A, n: process.env.WALK_SEQ_A_N || '0000' },
  b: { sub: process.env.WALK_SUB_B, id: process.env.WALK_SEQ_B, n: process.env.WALK_SEQ_B_N || '0001' },
};
const OUT = process.argv[2];
const PHASES = new Set((process.env.WALK_PHASES || 'before,act,after').split(','));
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  { key: '1440', viewport: { width: 1440, height: 900 } },
  { key: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const COMBOS = SIZES.flatMap((size) => ['light', 'dark'].map((theme) => ({ size, theme })));

/* Measured in the page; every value is read, none assumed. */
function probe() {
  const squash = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const label = (el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''}`;
  const hit = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return 'no-box';
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return 'offscreen';
    const top = document.elementFromPoint(x, y);
    return top && (top === el || el.contains(top)) ? 'hit' : `covered by ${top ? label(top) : 'nothing'}`;
  };
  const door = document.querySelector('[data-testid="sent-record"]');
  const card = document.querySelector('[data-testid="ectd-filed-state"]');
  const buttons = (root) => [...(root?.querySelectorAll('button') ?? [])].map((b) => ({ text: squash(b.textContent), className: b.className, disabled: b.disabled, hit: hit(b) }));
  return {
    lineBeforeDoor: door ? squash(door.previousElementSibling?.textContent) : null,
    door: door ? { open: door.open, className: door.className, summary: squash(door.querySelector('summary')?.textContent), summaryHit: hit(door.querySelector('summary')),
      text: squash(door.textContent), items: [...door.querySelectorAll('li')].map((l) => squash(l.textContent)), buttons: buttons(door),
      reasonLabel: squash(door.querySelector('label')?.textContent) || null } : null,
    notice: [...document.querySelectorAll('[role="status"]')].map((n) => squash(n.textContent)).find((t) => /record was read back from the package it sent/.test(t)) ?? null,
    card: card ? squash(card.textContent).slice(0, 1200) : null,
    recordKeyOnScreen: /\b[a-z][a-z-]*:\d+\b/.test(document.body.innerText || ''),
    shaOnScreen: /\b[0-9a-f]{64}\b/.test(document.body.innerText || ''),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
}

async function authOf(email) {
  const login = await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  if (!login.ok) throw new Error(`dev-login ${login.status}`);
  return login.json();
}

function sessionFactory(browser, auth, results) {
  return async ({ size, theme }) => {
    const ctx = await browser.newContext({ viewport: size.viewport, isMobile: !!size.isMobile, hasTouch: !!size.hasTouch, deviceScaleFactor: 1 });
    await ctx.addInitScript(({ a, dark }) => {
      const expiry = new Date(Date.now() + (a.expiresIn || 86400) * 1000).toISOString();
      for (const store of [localStorage, sessionStorage]) {
        store.setItem('trialsage_access_token', a.accessToken);
        store.setItem('trialsage_refresh_token', a.refreshToken || '');
        store.setItem('trialsage_token_expiry', expiry);
        store.setItem('trialsage_user', JSON.stringify(a.user || {}));
      }
      localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark, railCollapsed: false, anaOpen: false, anaMode: 'standard', segment: 'biopharma', welcomeDismissed: true }));
    }, { a: auth, dark: theme === 'dark' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    const shot = async (name) => {
      const key = `${name}-${size.key}-${theme}`;
      await page.screenshot({ path: path.join(OUT, `${key}.png`) });
      results.screens[key] = { file: `${key}.png`, ...(await page.evaluate(probe)), pageErrors: [...errors] };
      return results.screens[key];
    };
    return { ctx, page, shot, ...doorActions(page) };
  };
}

function doorActions(page) {
  const door = () => page.getByTestId('sent-record');
  const dispatch = (which) => page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}&submissionId=${SEQS[which].sub}&sequenceId=${SEQS[which].id}&ws=dispatch`, { waitUntil: 'networkidle' });
  const open = async (which) => {
    await dispatch(which);
    await door().waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    await door().scrollIntoViewIfNeeded();
  };
  const openDoor = async () => {
    await door().locator('summary').click();
    await page.waitForFunction(() => !/Checking how sequence/.test(document.querySelector('[data-testid="sent-record"]')?.textContent || ''), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await door().scrollIntoViewIfNeeded();
  };
  return { door, dispatch, open, openDoor };
}

async function before(session) {
  for (const combo of COMBOS) {
    const s = await session(combo);
    for (const which of ['a', 'b']) {
      await s.open(which);
      await s.shot(`c2-closed-${which}`);
      await s.openDoor();
      await s.shot(`c2-opened-${which}`);
    }
    await s.ctx.close();
  }
}

async function act(session, results) {
  const s = await session(COMBOS[0]);
  await s.open('a');
  await s.openDoor();
  const button = s.door().getByRole('button', { name: `Record what sequence ${SEQS.a.n} sent` });
  results.checks.disabledBeforeReason = await button.isDisabled();
  await s.door().getByLabel('Why you are recording this').fill(`Sequence ${SEQS.a.n}'s send has no record of what it carried; read it back from the package the platform kept (walk).`);
  await s.shot('c2-reason');
  await button.click();
  await s.page.waitForFunction(() => /record was read back from the package it sent/.test(document.body.textContent || ''), null, { timeout: 60000 });
  await s.page.waitForTimeout(1200);
  const notice = s.page.getByText(/record was read back from the package it sent/);
  await notice.scrollIntoViewIfNeeded();
  results.checks.recorded = await s.shot('c2-recorded');
  results.checks.doorAfterRecord = await s.door().count();
  await s.ctx.close();
}

async function after(session) {
  for (const combo of COMBOS) {
    const s = await session(combo);
    await s.dispatch('a');
    await s.page.waitForTimeout(2500);
    await s.shot('c2-dispatch-after');
    const compile = s.page.getByRole('button', { name: /Validate and compile this sequence|Compile & export/ }).first();
    await compile.scrollIntoViewIfNeeded();
    await compile.click();
    const card = s.page.getByTestId('ectd-filed-state');
    await card.waitFor({ timeout: 60000 });
    await s.page.waitForFunction(() => !/Loading what is on file/.test(document.querySelector('[data-testid="ectd-filed-state"]')?.textContent || ''), null, { timeout: 30000 });
    await s.page.waitForTimeout(600);
    await card.scrollIntoViewIfNeeded();
    await s.shot('c2-card');
    await s.ctx.close();
  }
}

(async () => {
  const auth = await authOf(WHO);
  const browser = await chromium.launch();
  const results = { base: BASE, who: WHO, program: PROGRAM, sequences: SEQS, browser: browser.version(), screens: {}, checks: {} };
  const session = sessionFactory(browser, auth, results);
  if (PHASES.has('before')) await before(session);
  if (PHASES.has('act')) await act(session, results);
  if (PHASES.has('after')) await after(session);
  await browser.close();
  fs.writeFileSync(path.join(OUT, `probes-c2-${[...PHASES].join('-')}.json`), JSON.stringify(results, null, 2));
  console.info('captured', Object.keys(results.screens).length);
})().catch((e) => { console.error(e); process.exit(1); });
