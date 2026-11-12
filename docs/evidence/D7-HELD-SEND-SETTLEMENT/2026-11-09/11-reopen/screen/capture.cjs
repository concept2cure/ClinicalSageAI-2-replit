// P-92 C3 evidence: re-opening a settlement on FDA's verified answer from the Dispatch tab, in the running app, on the
// walk's throwaway database (seed.sql: FDA's answers are labelled walk stand-ins), never against FDA. 1440x900 and
// 390x844, light and dark. Adapted from ../../10-technical-rejection/screen/capture.cjs.
//
// Two people of one organisation: WALK_EMAIL created the sequences (the server refuses them the signature), and
// WALK_SIGNER is independent of them. The signer's password is read from WALK_SIGNER_PW_FILE and typed into the
// signature dialog; it is never printed or written out.
//
// Phases:
//   before  0001's door closed and opened (the statement), the dialog unsigned, and the creator, every size and theme;
//   act     re-opened once each (1440, light): 0001 (a release FDA received) and 0004 or 0005 ("received" FDA refused);
//   after   both sequences' transmissions rows and Gateway transmittals, every size and theme.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5100';
const CREATOR = process.env.WALK_EMAIL;
const SIGNER = process.env.WALK_SIGNER;
const PROGRAM = process.env.WALK_PROGRAM;
const SUBMISSION = process.env.WALK_SUBMISSION;
// The released send (arm a) and the send recorded as received (arm b), by id and number (seed.sql; the second walk's
// arm b is seed-0005.sql). WALK_ARMS picks the arms the act and after phases walk; WALK_PREFIX names the screens.
const SEQS = { a: { id: process.env.WALK_SEQ_A, n: process.env.WALK_SEQ_A_N || '0001' }, b: { id: process.env.WALK_SEQ_B, n: process.env.WALK_SEQ_B_N || '0004' } };
const ARMS = (process.env.WALK_ARMS || 'a,b').split(',');
const P = process.env.WALK_PREFIX || 'c3';
const PASSWORD = fs.readFileSync(process.env.WALK_SIGNER_PW_FILE, 'utf8').trim();
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
  const door = document.querySelector('[data-testid="held-send-reopen"]');
  const dialog = document.querySelector('[role="dialog"]');
  const rows = document.querySelector('[aria-label="Transmissions and acknowledgements"]');
  const buttons = (root) => [...(root?.querySelectorAll('button') ?? [])].map((b) => ({ text: squash(b.textContent), className: b.className, hit: hit(b) }));
  return {
    door: door ? { open: door.open, className: door.className, summary: squash(door.querySelector('summary')?.textContent), summaryHit: hit(door.querySelector('summary')), text: squash(door.textContent), buttons: buttons(door) } : null,
    dialog: dialog ? { text: squash(dialog.textContent), meanings: [...dialog.querySelectorAll('[role="radio"]')].map((r) => squash(r.textContent)), statement: squash(dialog.querySelector('[data-testid="held-send-reopen-statement"] q')?.textContent) || null } : null,
    notice: [...document.querySelectorAll('[role="status"]')].map((n) => squash(n.textContent)).find((t) => /is recorded as (received|rejected) by FDA, on FDA's signed/.test(t)) ?? null,
    rows: rows ? squash(rows.textContent).slice(0, 1500) : null,
    recordKeyOnScreen: /\b[a-z][a-z-]*:\d+\b/.test(document.body.innerText || ''),
    signatureIdInPage: /act_[0-9a-f-]{8,}/.test(document.body.innerHTML),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
}

async function authOf(email) {
  const login = await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  if (!login.ok) throw new Error(`dev-login ${login.status}`);
  return login.json();
}

function sessionFactory(browser, auth, results) {
  return async (who, { size, theme }) => {
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
    }, { a: auth[who], dark: theme === 'dark' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    const shot = async (name) => {
      const key = `${name}-${size.key}-${theme}`;
      await page.screenshot({ path: path.join(OUT, `${key}.png`) });
      results.screens[key] = { file: `${key}.png`, who, ...(await page.evaluate(probe)), pageErrors: [...errors] };
      return results.screens[key];
    };
    return { ctx, page, shot, ...doorActions(page) };
  };
}

function doorActions(page) {
  const door = () => page.getByTestId('held-send-reopen');
  const dispatch = (which) => page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}&submissionId=${SUBMISSION}&sequenceId=${SEQS[which].id}&ws=dispatch`, { waitUntil: 'networkidle' });
  const open = async (which) => {
    await dispatch(which);
    await door().waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    await door().scrollIntoViewIfNeeded();
  };
  const openDoor = async () => {
    await door().locator('summary').click();
    await page.waitForFunction(() => !/Checking whether the settlement/.test(document.querySelector('[data-testid="held-send-reopen"]')?.textContent || ''), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await door().scrollIntoViewIfNeeded();
  };
  const signButton = (which) => door().getByRole('button', { name: `Sign: re-open sequence ${SEQS[which].n}'s settlement` });
  return { door, dispatch, open, openDoor, signButton };
}

async function sign(page, reason) {
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 30000 });
  await dialog.getByLabel('Reason for this action').fill(reason);
  await dialog.getByLabel(/Password/).fill(PASSWORD);
  await dialog.getByRole('button', { name: /Sign and commit/ }).click();
  await page.getByText('Signature applied').waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
}

async function before(session) {
  for (const combo of COMBOS) {
    const s = await session('signer', combo);
    await s.open('a');
    await s.shot(`${P}-closed`);
    await s.openDoor();
    await s.shot(`${P}-offered`);
    await s.signButton('a').click();
    await s.page.getByRole('dialog').waitFor({ timeout: 30000 });
    await s.page.waitForTimeout(400);
    await s.shot(`${P}-signing`);
    await s.ctx.close();
    const c = await session('creator', combo);
    await c.open('a');
    await c.openDoor();
    await c.shot(`${P}-creator`);
    await c.ctx.close();
  }
}

async function act(session, results) {
  const reasons = {
    a: `FDA's signed receipt (a labelled walk stand-in) shows it received sequence ${SEQS.a.n}'s send.`,
    b: `FDA's signed answer (a labelled walk stand-in) refuses sequence ${SEQS.b.n}'s send.`,
  };
  for (const which of ARMS) {
    const reason = reasons[which];
    const s = await session('signer', COMBOS[0]);
    await s.open(which);
    await s.openDoor();
    await s.signButton(which).click();
    await sign(s.page, reason);
    await s.shot(`${P}-signed-${which}`);
    await s.page.keyboard.press('Escape');
    await s.page.waitForFunction(() => /is recorded as (received|rejected) by FDA, on FDA's signed/.test(document.body.textContent || ''), null, { timeout: 30000 });
    await s.page.evaluate(() => window.scrollTo(0, 0));
    await s.page.waitForTimeout(700);
    results.checks[`reopened-${which}`] = await s.shot(`${P}-reopened-${which}`);
    await s.ctx.close();
  }
}

async function after(session) {
  for (const combo of COMBOS) {
    const s = await session('signer', combo);
    for (const which of ARMS) {
      await s.dispatch(which);
      const rows = s.page.getByRole('region', { name: 'Transmissions and acknowledgements' });
      await rows.waitFor({ timeout: 60000 });
      await s.page.waitForTimeout(800);
      await rows.scrollIntoViewIfNeeded();
      await s.shot(`${P}-row-${which}`);
    }
    await s.page.goto(`${BASE}/concept2cure/gateway-transmittals`, { waitUntil: 'networkidle' });
    await s.page.getByTestId('held-send-settlement-note').first().waitFor({ timeout: 60000 });
    await s.page.getByTestId('held-send-settlement-note').first().scrollIntoViewIfNeeded();
    await s.shot(`${P}-gateway`);
    await s.ctx.close();
  }
}

(async () => {
  const auth = { creator: await authOf(CREATOR), signer: await authOf(SIGNER) };
  const browser = await chromium.launch();
  const results = { base: BASE, creator: CREATOR, signer: SIGNER, program: PROGRAM, submission: SUBMISSION, sequences: SEQS, browser: browser.version(), screens: {}, checks: {} };
  const session = sessionFactory(browser, auth, results);
  if (PHASES.has('before')) await before(session);
  if (PHASES.has('act')) await act(session, results);
  if (PHASES.has('after')) await after(session);
  await browser.close();
  fs.writeFileSync(path.join(OUT, `probes-${P}-${[...PHASES].join('-')}.json`), JSON.stringify(results, null, 2));
  console.info('captured', Object.keys(results.screens).length);
})().catch((e) => { console.error(e); process.exit(1); });
