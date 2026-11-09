// P-86 C3 evidence: retiring sequence 0000 from the foot of its Dispatch tab, in the running app, then starting 0000
// again. 1440x900 and 390x844, light and dark. Adapted from
// docs/evidence/DESIGN/D7/2026-11-09-sequence-workspaces-a2/capture.cjs.
//
// Two people of the same organisation: WALK_EMAIL created the sequence (so the server refuses them the signature:
// state S4), and WALK_SIGNER is independent of it (states S2, S6, S8). The signer's password is read from the file
// WALK_SIGNER_PW_FILE and typed into the signature dialog; it is never printed or written out.
//
// The retirement is signed once (1440, light); everything before it is captured at every size and theme, and so is
// everything after it.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5100';
const CREATOR = process.env.WALK_EMAIL;
const SIGNER = process.env.WALK_SIGNER;
const PROGRAM = process.env.WALK_PROGRAM;
const PASSWORD = fs.readFileSync(process.env.WALK_SIGNER_PW_FILE, 'utf8').trim();
const OUT = process.argv[2];
// Phases, so a step after the irreversible act can be run again on its own: before,sign,after,start,replacement.
const PHASES = new Set((process.env.WALK_PHASES || 'before,sign,after,start,replacement').split(','));
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  { key: '1440', viewport: { width: 1440, height: 900 } },
  { key: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const COMBOS = SIZES.flatMap((size) => ['light', 'dark'].map((theme) => ({ size, theme })));
const RECORD_KEY = /\b[a-z][a-z-]*:\d+\b/;

/* Measured in the page; every value is read, none assumed. */
function probe() {
  const style = (el) => (el ? window.getComputedStyle(el) : null);
  const squash = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const label = (el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''}`;
  const accentRgbOf = () => {
    const root = document.querySelector('.c2c-v2');
    const swatch = document.createElement('div');
    swatch.style.background = (root && style(root).getPropertyValue('--accent-strong').trim()) || 'transparent';
    document.body.appendChild(swatch);
    const rgb = style(swatch).backgroundColor;
    swatch.remove();
    return rgb;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const area = document.querySelector('[data-work-area]');
  const rgb = accentRgbOf();
  const disclosure = document.querySelector('[data-testid="retire-sequence"]');
  const dialog = document.querySelector('[role="dialog"]');
  const q = dialog?.querySelector('[data-testid="retire-statement"] q');
  const page = document.querySelector('#c2c-page');
  const notice = [...document.querySelectorAll('[role="status"]')].map((n) => squash(n.textContent)).find((t) => /is retired/.test(t)) ?? null;
  // Visible means hit: the element under its own centre is it or inside it (the coordinating session, 2026-11-09). A
  // clipped or covered element still measures by its box, so the box alone is not evidence. Off-screen is 'offscreen'.
  const hit = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (r.width === 0 || r.height === 0) return 'no-box';
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return 'offscreen';
    const top = document.elementFromPoint(x, y);
    return top && (top === el || el.contains(top)) ? 'hit' : `covered by ${top ? label(top) : 'nothing'}`;
  };
  // Each part is its own small function, so no one function carries every branch.
  const buttonIn = (root, re) => [...(root?.querySelectorAll('button') ?? [])].find((b) => re.test(b.textContent.trim()));
  const hitsOf = (d, dg, quote) => ({
    summary: hit(d?.querySelector('summary')),
    retireButton: hit(buttonIn(d, /^Retire sequence/)),
    disclosureNote: hit(d?.querySelector('[role="note"], [role="status"]')),
    // The <q> is inline across lines, so its box's centre can fall outside its text: test the paragraph it fills.
    statement: hit(quote?.closest('p')),
    signButton: hit(buttonIn(dg, /Sign and commit/)),
    notice: hit([...document.querySelectorAll('[role="status"]')].find((n) => /is retired/.test(n.textContent || ''))),
  });
  const disclosureFacts = (d) => (d
    ? {
      open: d.open,
      className: d.className,
      summary: squash(d.querySelector('summary')?.textContent),
      text: squash(d.textContent),
      roles: [...d.querySelectorAll('[role]')].map((el) => el.getAttribute('role')),
      buttons: [...d.querySelectorAll('button')].map((b) => `${b.className}: ${squash(b.textContent)}`),
      isLastOfDispatch: d.closest('.pj-sec')?.lastElementChild === d,
    }
    : null);
  const quoteMarks = (quote) => (quote
    ? [window.getComputedStyle(quote, '::before').content, window.getComputedStyle(quote, '::after').content]
    : null);
  const dialogFacts = (dg, quote) => (dg
    ? {
      text: squash(dg.textContent),
      meanings: [...dg.querySelectorAll('[role="radio"]')].map((r) => squash(r.textContent)),
      statement: quote ? squash(quote.textContent) : null,
      quoteMarks: quoteMarks(quote),
    }
    : null);
  const textOf = (sel) => squash(document.querySelector(sel)?.textContent) || null;
  const tabs = () => [...document.querySelectorAll('[role="tablist"] [role="tab"]')]
    .map((t) => `${t.textContent.trim()}${t.getAttribute('aria-selected') === 'true' ? ' (selected)' : ''}`);
  const fillsIn = (root) => (root
    ? [...root.querySelectorAll('*')].filter((el) => visible(el) && style(el).backgroundColor === rgb)
      .map((el) => `${label(el)} "${squash(el.textContent).slice(0, 50)}"`)
    : []);
  return {
    url: location.pathname + location.search,
    tabs: tabs(),
    context: textOf('[data-work-area] > .sc-context'),
    verdict: textOf('[data-testid="sc-dispatch-verdict"]'),
    disclosure: disclosureFacts(disclosure),
    dialog: dialogFacts(dialog, q),
    notice,
    hits: hitsOf(disclosure, dialog, q),
    orangeFills: fillsIn(area),
    horizontalOverflow: page ? page.scrollWidth - page.clientWidth : null,
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}

async function authOf(email) {
  const login = await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  if (!login.ok) throw new Error(`dev-login ${login.status}`);
  return login.json();
}

(async () => {
  const auth = { creator: await authOf(CREATOR), signer: await authOf(SIGNER) };
  const browser = await chromium.launch();
  const results = { base: BASE, creator: CREATOR, signer: SIGNER, program: PROGRAM, browser: browser.version(), screens: {}, checks: {} };

  const session = async (who, { size, theme }) => {
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
    const shot = async (name, { full = false } = {}) => {
      const key = `${name}-${size.key}-${theme}`;
      await page.screenshot({ path: path.join(OUT, `${key}.png`), fullPage: full });
      results.screens[key] = { file: `${key}.png`, who, ...(await page.evaluate(probe)), pageErrors: [...errors] };
      return results.screens[key];
    };
    const open = async (tab) => {
      await page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => /sequence/.test(document.querySelector('[data-testid="sc-state"]')?.textContent || ''), null, { timeout: 60000 });
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(700);
    };
    const disclosure = () => page.getByTestId('retire-sequence');
    const openDisclosure = async () => {
      await disclosure().scrollIntoViewIfNeeded();
      await disclosure().locator('summary').click();
      await page.waitForFunction(() => !/Checking whether/.test(document.querySelector('[data-testid="retire-sequence"]')?.textContent || ''), null, { timeout: 30000 });
      await page.waitForTimeout(300);
      await disclosure().scrollIntoViewIfNeeded();
    };
    const retireButton = () => disclosure().getByRole('button', { name: /^Retire sequence 0000$/ });
    return { ctx, page, shot, open, disclosure, openDisclosure, retireButton };
  };

  // ── Before: S0, S2 and S6 (unsigned) as the signer; S4 as the creator ──────────────────────────────────────────
  if (PHASES.has('before')) for (const combo of COMBOS) {
    const s = await session('signer', combo);
    await s.open('Dispatch');
    await s.disclosure().scrollIntoViewIfNeeded();
    await s.shot('s0-closed');
    await s.openDisclosure();
    await s.retireButton().waitFor({ timeout: 30000 });
    await s.shot('s2-offered');
    if (combo.size.key === '1440' && combo.theme === 'light') {
      // Keyboard: the summary takes focus, and Enter opens and closes it.
      await s.disclosure().locator('summary').click();
      await s.disclosure().locator('summary').focus();
      const focused = await s.page.evaluate(() => document.activeElement?.tagName);
      await s.page.keyboard.press('Enter');
      await s.retireButton().waitFor({ timeout: 30000 });
      results.checks.keyboard = { summaryFocusable: focused === 'SUMMARY', enterOpens: await s.retireButton().isVisible() };
    }
    await s.retireButton().click();
    await s.page.getByRole('dialog').waitFor({ timeout: 30000 });
    await s.page.waitForTimeout(400);
    await s.shot('s6-signing');
    await s.page.keyboard.press('Escape');
    await s.page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    await s.ctx.close();

    const c = await session('creator', combo);
    await c.open('Dispatch');
    await c.openDisclosure();
    await c.disclosure().getByRole('note').waitFor({ timeout: 30000 });
    await c.shot('s4-creator');
    await c.ctx.close();
  }

  // ── The act: signed once, by the signer, at 1440 in light ──────────────────────────────────────────────────────
  if (PHASES.has('sign')) {
    const s = await session('signer', COMBOS[0]);
    await s.open('Dispatch');
    await s.openDisclosure();
    await s.retireButton().click();
    const dialog = s.page.getByRole('dialog');
    await dialog.waitFor({ timeout: 30000 });
    await dialog.getByLabel('Reason for this action').fill('Sequence 0000 was started with the wrong leaves; a corrected 0000 replaces it.');
    await dialog.getByLabel(/Password/).fill(PASSWORD);
    await dialog.getByRole('button', { name: /Sign and commit/ }).click();
    await s.page.getByText('Signature applied').waitFor({ timeout: 60000 });
    await s.page.waitForTimeout(500);
    await s.shot('s6-signed');
    await s.page.keyboard.press('Escape');
    await s.page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    await s.page.evaluate(() => window.scrollTo(0, 0));
    await s.page.waitForFunction(() => /is retired/.test(document.body.textContent || ''), null, { timeout: 30000 });
    await s.page.waitForTimeout(700);
    const s8 = await s.shot('s8-retired');
    results.checks.notice = { text: s8.notice, recordKey: RECORD_KEY.test(s8.notice ?? ''), signatureId: /act_/.test(s8.notice ?? '') };
    results.checks.pageHtmlHasSignatureId = await s.page.evaluate(() => /act_[0-9a-f-]{8,}/.test(document.body.innerHTML));
    await s.ctx.close();
  }

  // ── After: the submission with no sequence, at every size and theme ────────────────────────────────────────────
  if (PHASES.has('after')) for (const combo of COMBOS) {
    const s = await session('signer', combo);
    await s.open('Dispatch');
    await s.shot('after-dispatch-no-sequence');
    await s.page.getByRole('tab', { name: 'Sequences' }).click();
    await s.page.getByRole('button', { name: /Start sequence 0000/ }).waitFor({ timeout: 30000 });
    await s.page.waitForTimeout(400);
    await s.shot('after-sequences-start-0000');
    await s.ctx.close();
  }

  // ── 0000 started again (1440, light), then its Dispatch tab at every size and theme ───────────────────────────
  if (PHASES.has('start')) {
    const s = await session('signer', COMBOS[0]);
    await s.open('Sequences');
    await s.page.getByRole('button', { name: /Start sequence 0000/ }).click();
    await s.page.waitForFunction(() => /0000/.test(document.querySelector('[data-testid="sc-state"]')?.textContent || '') && !/Creating/.test(document.body.textContent || ''), null, { timeout: 60000 });
    await s.page.waitForTimeout(800);
    await s.shot('replacement-started', { full: false });
    await s.ctx.close();
  }
  if (PHASES.has('replacement')) for (const combo of COMBOS) {
    const s = await session('signer', combo);
    await s.open('Dispatch');
    await s.page.waitForSelector('[data-testid="sc-dispatch-verdict"]', { timeout: 60000 }).catch(() => undefined);
    await s.openDisclosure();
    await s.shot('replacement-dispatch');
    await s.ctx.close();
  }

  await browser.close();
  const probes = path.join(OUT, `probes-${[...PHASES].join('-')}.json`);
  fs.writeFileSync(probes, JSON.stringify(results, null, 2));
  console.info('captured', Object.keys(results.screens).length);
})().catch((e) => { console.error(e); process.exit(1); });
