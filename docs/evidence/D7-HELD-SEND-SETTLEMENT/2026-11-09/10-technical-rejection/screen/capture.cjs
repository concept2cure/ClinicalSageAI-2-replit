// P-92 C4 evidence: recording FDA's failed Ack3 on a sequence from its Dispatch tab, in the running app, on the walk's
// throwaway database (C2's seed and walk: sequence 0002 was recorded as received on a labelled Ack2 stand-in), never
// against FDA. 1440x900 and 390x844, light and dark. Adapted from ../07-screen/capture.cjs.
//
// Two people of one organisation: WALK_EMAIL created the sequence (the server refuses them the signature), and
// WALK_SIGNER is independent of them. The signer's password is read from WALK_SIGNER_PW_FILE and typed into the
// signature dialog; it is never printed or written out.
//
// Phases, so a step after the irreversible act can be run again on its own:
//   upload  the creator adds a clearly labelled stand-in for FDA's Ack3 to the project's Vault (POST /api/vault/ingest);
//   before  the door closed and opened, the stand-in chosen and the statement, the dialog unsigned, and the creator,
//           every size and theme;
//   act     recorded once (1440, light): the dialog signed, then the page's notice;
//   after   the Dispatch tab (the row, the transmit line, the retirement refusal) and Gateway transmittals, every size
//           and theme.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5100';
const CREATOR = process.env.WALK_EMAIL;
const SIGNER = process.env.WALK_SIGNER;
const PROGRAM = process.env.WALK_PROGRAM;
const SUBMISSION = process.env.WALK_SUBMISSION;
const SEQ = process.env.WALK_SEQ;
// The sequence's number and the screens' prefix: 0002 for the first walk, 0003 for the second (after the error-column fix).
const NUMBER = process.env.WALK_NUMBER || '0002';
const PREFIX = process.env.WALK_PREFIX || 'c4';
const PASSWORD = fs.readFileSync(process.env.WALK_SIGNER_PW_FILE, 'utf8').trim();
const OUT = process.argv[2];
const PHASES = new Set((process.env.WALK_PHASES || 'upload,before,act,after').split(','));
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  { key: '1440', viewport: { width: 1440, height: 900 } },
  { key: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const COMBOS = SIZES.flatMap((size) => ['light', 'dark'].map((theme) => ({ size, theme })));

const ACK3_TITLE = `Walk stand-in for FDA Ack3 for sequence ${NUMBER} (not an FDA document)`;

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
  const door = document.querySelector('[data-testid="technical-rejection"]');
  const dialog = document.querySelector('[role="dialog"]');
  const note = document.querySelector('[data-testid="technical-rejection-note"]');
  const buttons = (root) => [...(root?.querySelectorAll('button') ?? [])].map((b) => ({ text: squash(b.textContent), className: b.className, hit: hit(b) }));
  return {
    door: door ? { open: door.open, className: door.className, summary: squash(door.querySelector('summary')?.textContent), summaryHit: hit(door.querySelector('summary')), text: squash(door.textContent), buttons: buttons(door) } : null,
    dialog: dialog ? { text: squash(dialog.textContent), meanings: [...dialog.querySelectorAll('[role="radio"]')].map((r) => squash(r.textContent)), statement: squash(dialog.querySelector('[data-testid="technical-rejection-statement"] q')?.textContent) || null, buttons: buttons(dialog) } : null,
    notice: [...document.querySelectorAll('[role="status"]')].map((n) => squash(n.textContent)).find((t) => /is recorded as rejected by FDA/.test(t)) ?? null,
    note: note ? { text: squash(note.textContent), color: window.getComputedStyle(note).color, inline: note.style.color } : null,
    retire: squash(document.querySelector('[data-testid="retire-sequence"]')?.textContent) || null,
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

/** A one-page PDF that says what it is: the Vault takes PDFs, and the walk never pretends to hold FDA's own file. */
function standInPdf(text) {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** The creator adds the Ack3 stand-in to the project's Vault, as a person would, through the Vault's own upload. */
async function uploadStandIn(auth) {
  const form = new FormData();
  form.set('programId', PROGRAM);
  form.set('documentCode', `WALK-P92-ACK3-${NUMBER}`);
  form.set('documentTitle', ACK3_TITLE);
  form.set('documentType', 'CORRESPONDENCE');
  form.set('version', '1');
  form.set('file', new Blob([standInPdf(`Walk stand-in for FDA Ack3 for sequence ${NUMBER}. This is not an FDA document.`)], { type: 'application/pdf' }), `walk-ack3-${NUMBER}.pdf`);
  const res = await fetch(`${BASE}/api/vault/ingest`, { method: 'POST', headers: { Authorization: `Bearer ${auth.accessToken}` }, body: form });
  const body = await res.json().catch(() => null);
  return { status: res.status, documentId: body?.document?.id ?? body?.documentId ?? body?.id ?? null, title: ACK3_TITLE };
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
  const door = () => page.getByTestId('technical-rejection');
  const dispatch = () => page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}&submissionId=${SUBMISSION}&sequenceId=${SEQ}&ws=dispatch`, { waitUntil: 'networkidle' });
  const open = async () => {
    await dispatch();
    await door().waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    await door().scrollIntoViewIfNeeded();
  };
  const openDoor = async () => {
    await door().locator('summary').click();
    await page.waitForFunction(() => !/Checking whether FDA/.test(document.querySelector('[data-testid="technical-rejection"]')?.textContent || ''), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await door().scrollIntoViewIfNeeded();
  };
  const chooseStandIn = async () => {
    await door().getByLabel("Find FDA's Ack3 in this project's Vault").fill(`Walk stand-in for FDA Ack3 for sequence ${NUMBER}`);
    await door().getByRole('button', { name: 'Search Vault' }).click();
    await door().getByRole('button', { name: 'Select document' }).first().click();
    await door().getByRole('button', { name: `Sign: record sequence ${NUMBER} as rejected by FDA` }).waitFor({ timeout: 30000 });
    await door().scrollIntoViewIfNeeded();
  };
  return { door, dispatch, open, openDoor, chooseStandIn };
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
    await s.open();
    await s.shot(`${PREFIX}-closed`);
    await s.openDoor();
    await s.shot(`${PREFIX}-offered`);
    await s.chooseStandIn();
    await s.shot(`${PREFIX}-stated`);
    await s.door().getByRole('button', { name: `Sign: record sequence ${NUMBER} as rejected by FDA` }).click();
    await s.page.getByRole('dialog').waitFor({ timeout: 30000 });
    await s.page.waitForTimeout(400);
    await s.shot(`${PREFIX}-signing`);
    await s.ctx.close();
    const c = await session('creator', combo);
    await c.open();
    await c.openDoor();
    await c.shot(`${PREFIX}-creator`);
    await c.ctx.close();
  }
}

async function act(session, results) {
  const s = await session('signer', COMBOS[0]);
  await s.open();
  await s.openDoor();
  await s.chooseStandIn();
  await s.door().getByRole('button', { name: `Sign: record sequence ${NUMBER} as rejected by FDA` }).click();
  await sign(s.page, `FDA's Ack3 (the walk's labelled stand-in) reports the center did not accept sequence ${NUMBER}.`);
  await s.shot(`${PREFIX}-signed`);
  await s.page.keyboard.press('Escape');
  await s.page.waitForFunction(() => /is recorded as rejected by FDA/.test(document.body.textContent || ''), null, { timeout: 30000 });
  await s.page.evaluate(() => window.scrollTo(0, 0));
  await s.page.waitForTimeout(700);
  results.checks.recorded = await s.shot(`${PREFIX}-recorded`);
  await s.ctx.close();
}

async function after(session) {
  for (const combo of COMBOS) {
    const s = await session('signer', combo);
    await s.dispatch();
    const rows = s.page.getByRole('region', { name: 'Transmissions and acknowledgements' });
    await rows.waitFor({ timeout: 60000 });
    await s.page.waitForTimeout(800);
    await rows.scrollIntoViewIfNeeded();
    await s.shot(`${PREFIX}-dispatch-row`);
    const retire = s.page.getByTestId('retire-sequence');
    await retire.scrollIntoViewIfNeeded();
    await retire.locator('summary').click();
    await s.page.waitForFunction(() => /rejected by FDA/.test(document.querySelector('[data-testid="retire-sequence"]')?.textContent || ''), null, { timeout: 30000 });
    await s.shot(`${PREFIX}-retire`);
    await s.page.goto(`${BASE}/concept2cure/gateway-transmittals`, { waitUntil: 'networkidle' });
    await s.page.getByTestId('technical-rejection-note').first().waitFor({ timeout: 60000 });
    await s.page.getByTestId('technical-rejection-note').first().scrollIntoViewIfNeeded();
    await s.shot(`${PREFIX}-gateway`);
    await s.ctx.close();
  }
}

(async () => {
  const auth = { creator: await authOf(CREATOR), signer: await authOf(SIGNER) };
  const browser = await chromium.launch();
  const results = { base: BASE, creator: CREATOR, signer: SIGNER, program: PROGRAM, submission: SUBMISSION, sequence: SEQ, browser: browser.version(), screens: {}, checks: {} };
  const session = sessionFactory(browser, auth, results);
  if (PHASES.has('upload')) results.checks.upload = await uploadStandIn(auth.creator);
  if (PHASES.has('before')) await before(session);
  if (PHASES.has('act')) await act(session, results);
  if (PHASES.has('after')) await after(session);
  await browser.close();
  fs.writeFileSync(path.join(OUT, `probes-${PREFIX}-${[...PHASES].join('-')}.json`), JSON.stringify(results, null, 2));
  console.info('captured', Object.keys(results.screens).length);
})().catch((e) => { console.error(e); process.exit(1); });
