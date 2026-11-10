// P-92 C2 evidence: settling a held FDA send from its Dispatch tab, in the running app, on the walk's throwaway
// database (seed.sql), never against FDA. 1440x900 and 390x844, light and dark. Adapted from
// docs/evidence/D7-SEQUENCE-RETIREMENT/2026-11-09/06-screen/capture.cjs.
//
// Two people of one organisation: WALK_EMAIL created the held sequences (the server refuses them the signature: S4),
// and WALK_SIGNER is independent of them. The signer's password is read from WALK_SIGNER_PW_FILE and typed into the
// signature dialog; it is never printed or written out.
//
// Phases, so a step after an irreversible act can be run again on its own:
//   upload   the creator adds a clearly labelled stand-in for FDA's Ack2 to the project's Vault (POST /api/vault/ingest);
//   before   S0, S2 (both held sends), S2a (FDA's document chosen), S6 unsigned, and S4 as the creator, every size/theme;
//   proof    0001 released on the platform's own proof, signed once (1440, light): S6 signed, S8;
//   received 0002 recorded as received on the Ack2 stand-in, signed once (1440, light): S8;
//   after    both sequences' Dispatch tabs and Gateway transmittals (S9), every size and theme;
//   declare  the Sequences tab's "Declare sequences filed before this platform", closed and open, every size and theme.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5100';
const CREATOR = process.env.WALK_EMAIL;
const SIGNER = process.env.WALK_SIGNER;
const PROGRAM = process.env.WALK_PROGRAM;
const SUBMISSION = process.env.WALK_SUBMISSION;
const SEQ = { proof: process.env.WALK_SEQ_PROOF, document: process.env.WALK_SEQ_DOCUMENT };
const PASSWORD = fs.readFileSync(process.env.WALK_SIGNER_PW_FILE, 'utf8').trim();
const OUT = process.argv[2];
const PHASES = new Set((process.env.WALK_PHASES || 'upload,before,proof,received,after').split(','));
const ACK2_TITLE = 'Walk stand-in for FDA Ack2, sequence 0002 (not an FDA document)';
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
  // Visible means hit: the element under its own centre is it or inside it. Off-screen is 'offscreen'.
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
  const door = document.querySelector('[data-testid="held-send"]');
  const dialog = document.querySelector('[role="dialog"]');
  const buttons = (root) => [...(root?.querySelectorAll('button') ?? [])].map((b) => ({ text: squash(b.textContent), className: b.className, hit: hit(b) }));
  const notice = [...document.querySelectorAll('[role="status"]')].map((n) => squash(n.textContent))
    .find((t) => /held send is released|is recorded as received by FDA/.test(t)) ?? null;
  return {
    door: door ? { open: door.open, className: door.className, summary: squash(door.querySelector('summary')?.textContent), summaryHit: hit(door.querySelector('summary')), text: squash(door.textContent), buttons: buttons(door) } : null,
    dialog: dialog ? { text: squash(dialog.textContent), meanings: [...dialog.querySelectorAll('[role="radio"]')].map((r) => squash(r.textContent)), statement: squash(dialog.querySelector('[data-testid="held-send-statement"] q')?.textContent) || null, buttons: buttons(dialog) } : null,
    notice,
    declare: [...document.querySelectorAll('button')].filter((b) => /^(Declare sequences filed before this platform|Sign declaration|Cancel)$/.test(squash(b.textContent)))
      .map((b) => ({ text: squash(b.textContent), className: b.className, hit: hit(b) })),
    // A record key ("ectd-sequence:12") is not a reader's word, anywhere on the page.
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

/** The creator adds the Ack2 stand-in to the project's Vault, as a person would, through the Vault's own upload. */
async function uploadStandIn(auth) {
  const form = new FormData();
  form.set('programId', PROGRAM);
  form.set('documentCode', 'WALK-P92-ACK2-0002');
  form.set('documentTitle', ACK2_TITLE);
  form.set('documentType', 'CORRESPONDENCE');
  form.set('version', '1');
  form.set('file', new Blob([standInPdf('Walk stand-in for FDA Ack2 for sequence 0002. This is not an FDA document.')], { type: 'application/pdf' }), 'walk-ack2-0002.pdf');
  const res = await fetch(`${BASE}/api/vault/ingest`, { method: 'POST', headers: { Authorization: `Bearer ${auth.accessToken}` }, body: form });
  const body = await res.json().catch(() => null);
  return { status: res.status, documentId: body?.document?.id ?? body?.documentId ?? body?.id ?? null, title: ACK2_TITLE };
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
  const door = () => page.getByTestId('held-send');
  const open = async (which) => {
    await page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}&submissionId=${SUBMISSION}&sequenceId=${SEQ[which]}&ws=dispatch`, { waitUntil: 'networkidle' });
    await door().waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    await door().scrollIntoViewIfNeeded();
  };
  const openDoor = async () => {
    await door().locator('summary').click();
    await page.waitForFunction(() => !/Checking how this send/.test(document.querySelector('[data-testid="held-send"]')?.textContent || ''), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await door().scrollIntoViewIfNeeded();
  };
  const chooseStandIn = async () => {
    await door().getByLabel("Find FDA's document in this project's Vault").fill('Walk stand-in for FDA Ack2');
    await door().getByRole('button', { name: 'Search Vault' }).click();
    await door().getByRole('button', { name: 'Select document' }).first().click();
  };
  const stated = (signName) => door().getByRole('button', { name: signName }).waitFor({ timeout: 30000 });
  return { door, open, openDoor, chooseStandIn, stated };
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
    await s.open('proof');
    await s.shot('s0-held-closed');
    await s.openDoor();
    await s.shot('s2-offered-platform-proof');
    await s.open('document');
    await s.openDoor();
    await s.shot('s2-offered-documents');
    await s.door().getByRole('button', { name: 'Record as received' }).click();
    await s.chooseStandIn();
    await s.door().getByLabel('Ack2: FDA unpacked it and delivered it to the center').check();
    await s.stated('Sign: record sequence 0002 as received');
    await s.door().scrollIntoViewIfNeeded();
    await s.shot('s2a-received-stated');
    await s.door().getByRole('button', { name: 'Sign: record sequence 0002 as received' }).click();
    await s.page.getByRole('dialog').waitFor({ timeout: 30000 });
    await s.page.waitForTimeout(400);
    await s.shot('s6-signing-received');
    await s.ctx.close();
    const c = await session('creator', combo);
    await c.open('document');
    await c.openDoor();
    await c.shot('s4-creator');
    await c.ctx.close();
  }
}

async function actProof(session, results) {
  const s = await session('signer', COMBOS[0]);
  await s.open('proof');
  await s.openDoor();
  await s.door().getByRole('button', { name: 'Release as not received' }).click();
  await s.stated("Sign: release sequence 0001's send");
  await s.shot('s2a-release-proof-stated');
  await s.door().getByRole('button', { name: "Sign: release sequence 0001's send" }).click();
  await sign(s.page, 'Our record shows no AS2 message was formed; nothing reached FDA.');
  await s.shot('s6-signed-release');
  await s.page.keyboard.press('Escape');
  await s.page.waitForFunction(() => /held send is released/.test(document.body.textContent || ''), null, { timeout: 30000 });
  await s.page.evaluate(() => window.scrollTo(0, 0));
  await s.page.waitForTimeout(700);
  results.checks.release = await s.shot('s8-released');
  await s.ctx.close();
}

async function actReceived(session, results) {
  const s = await session('signer', COMBOS[0]);
  await s.open('document');
  await s.openDoor();
  await s.door().getByRole('button', { name: 'Record as received' }).click();
  await s.chooseStandIn();
  await s.door().getByLabel('Ack2: FDA unpacked it and delivered it to the center').check();
  await s.stated('Sign: record sequence 0002 as received');
  await s.door().getByRole('button', { name: 'Sign: record sequence 0002 as received' }).click();
  await sign(s.page, 'The Ack2 shows FDA unpacked sequence 0002 and delivered it to the center.');
  await s.shot('s6-signed-received');
  await s.page.keyboard.press('Escape');
  await s.page.waitForFunction(() => /is recorded as received by FDA/.test(document.body.textContent || ''), null, { timeout: 30000 });
  await s.page.evaluate(() => window.scrollTo(0, 0));
  await s.page.waitForTimeout(700);
  results.checks.received = await s.shot('s8-received');
  await s.ctx.close();
}

async function after(session) {
  for (const combo of COMBOS) {
    const s = await session('signer', combo);
    for (const which of ['proof', 'document']) {
      await s.page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}&submissionId=${SUBMISSION}&sequenceId=${SEQ[which]}&ws=dispatch`, { waitUntil: 'networkidle' });
      await s.page.getByRole('region', { name: 'Transmissions and acknowledgements' }).waitFor({ timeout: 60000 });
      await s.page.waitForTimeout(800);
      await s.page.getByRole('region', { name: 'Transmissions and acknowledgements' }).scrollIntoViewIfNeeded();
      await s.shot(`s9-dispatch-${which}`);
    }
    await s.page.goto(`${BASE}/concept2cure/gateway-transmittals`, { waitUntil: 'networkidle' });
    await s.page.getByTestId('held-send-settlement-note').first().waitFor({ timeout: 60000 });
    await s.page.getByTestId('held-send-settlement-note').first().scrollIntoViewIfNeeded();
    await s.shot('s9-gateway-transmittals');
    await s.ctx.close();
  }
}

async function declare(session) {
  for (const combo of COMBOS) {
    const s = await session('signer', combo);
    await s.page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}&submissionId=${SUBMISSION}&ws=sequences`, { waitUntil: 'networkidle' });
    const open = s.page.getByRole('button', { name: 'Declare sequences filed before this platform' });
    await open.waitFor({ timeout: 60000 });
    await open.scrollIntoViewIfNeeded();
    await s.shot('declare-closed');
    await open.click();
    await s.page.getByRole('button', { name: 'Sign declaration' }).waitFor({ timeout: 30000 });
    await s.page.getByRole('button', { name: 'Sign declaration' }).scrollIntoViewIfNeeded();
    await s.shot('declare-open');
    await s.ctx.close();
  }
}

(async () => {
  const auth = { creator: await authOf(CREATOR), signer: await authOf(SIGNER) };
  const browser = await chromium.launch();
  const results = { base: BASE, creator: CREATOR, signer: SIGNER, program: PROGRAM, submission: SUBMISSION, sequences: SEQ, browser: browser.version(), screens: {}, checks: {} };
  const session = sessionFactory(browser, auth, results);
  if (PHASES.has('upload')) results.checks.upload = await uploadStandIn(auth.creator);
  if (PHASES.has('before')) await before(session);
  if (PHASES.has('proof')) await actProof(session, results);
  if (PHASES.has('received')) await actReceived(session, results);
  if (PHASES.has('after')) await after(session);
  if (PHASES.has('declare')) await declare(session);
  await browser.close();
  fs.writeFileSync(path.join(OUT, `probes-${[...PHASES].join('-')}.json`), JSON.stringify(results, null, 2));
  console.info('captured', Object.keys(results.screens).length);
})().catch((e) => { console.error(e); process.exit(1); });
