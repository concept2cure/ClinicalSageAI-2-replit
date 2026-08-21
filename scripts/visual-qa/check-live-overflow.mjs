#!/usr/bin/env node
/**
 * Does anything spill sideways in the RUNNING APP?
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * `check-overflow.mjs` measures captured fragments, and a fragment has no
 * ancestors. That is what makes it cheap and what makes it blind.
 *
 * The register fix in ledger L97 gave each row an explicit `min-width` so its
 * columns stay aligned while the table scrolls. In a fragment that measured
 * exactly right: table 738 wide, content 1036, `overflow-x:auto`. In the app a
 * flex item's automatic minimum size is its MIN-CONTENT width, so that 1,036
 * propagated up: `.qms-shell` refused to shrink below 1,094 inside the 796px
 * surface pane, `.page` grew a horizontal scrollbar, and the WHOLE quality page
 * scrolled sideways instead of the table. The fragment gate reported clean
 * throughout and was not wrong — it was answering a different question.
 *
 * Measuring the right component in the wrong container is still not measuring
 * it. This runs the same rule (`overflow-rule.mjs`, one definition, two
 * runtimes) over the real shell.
 *
 * ── The trap, and why there is a self-check for it ───────────────────────────
 * A v2 surface does NOT get the window. The shell is
 * `grid-template-columns: var(--rail) 1fr var(--ana)`, and with the rail
 * expanded and the AnA panel open that is 264 + 796 + 380. But the stored
 * defaults are `railCollapsed:true, anaOpen:false`, which hand a surface
 * **1,352px** — 556 more than it really gets — and at that width essentially
 * nothing overflows.
 *
 * The first live run of this check was done at the defaults. It reported every
 * surface clean and that result was worthless. So the prefs are set before
 * navigating, and the pane width is ASSERTED before a single finding is
 * reported: wrong width, exit 2, report nothing. A check that can quietly
 * measure the roomy case is a check that will eventually be run that way.
 *
 * ── Requires a running app ───────────────────────────────────────────────────
 *   npm run dev          (or any server on $LIVE_BASE, default localhost:5000)
 * with ALLOW_DEV_AUTH=1, because it authenticates through /api/auth/dev-login.
 * Production refuses that endpoint, and correctly.
 *
 * Usage:
 *   npm run visual-qa:live
 *   LIVE_BASE=http://localhost:5000 LIVE_EMAIL=someone@example.com npm run visual-qa:live
 *
 * @module scripts/visual-qa/check-live-overflow
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './playwright.mjs';
import { browserSource } from './overflow-rule.mjs';

const TAG = '[visual-qa:live]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIEWS = path.join(REPO, 'client/src/concept2cure/v2/surfaceViews.ts');
const BASELINE = path.join(REPO, 'scripts/visual-qa/live-overflow-baseline.json');

const BASE = process.env.LIVE_BASE || 'http://localhost:5000';
const EMAIL = process.env.LIVE_EMAIL || 'jm.smith@concept2cure.pro';
const TOLERANCE = 1;
const WRITE = process.argv.includes('--write-baseline');

/** The pane a surface really gets, and the tolerance on asserting it. */
const EXPECTED_PANE = 1440 - 264 - 380;
const PANE_SLACK = 8;

/**
 * Surface ids, read from the renderer map itself rather than a list kept here.
 * A second list is a list that goes stale the first time a surface is added.
 */
function surfaceIds() {
  const src = fs.readFileSync(VIEWS, 'utf8');
  const body = src.slice(src.indexOf('SURFACE_VIEWS'));
  const ids = [...body.matchAll(/^ {2}'?([a-zA-Z0-9_-]+)'?:\s*\{/gm)].map((m) => m[1]);
  return [...new Set(ids)];
}

const ids = surfaceIds();
if (ids.length < 50) {
  console.error(`${TAG} read only ${ids.length} surface ids from surfaceViews.ts — the parse is wrong.`);
  console.error(`${TAG} Reporting on a fraction of the product and calling it a sweep is the failure this exits on.`);
  process.exit(2);
}

/** Authenticate the way the login screen's demo path does. */
const res = await fetch(`${BASE}/api/auth/dev-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL }),
}).catch((e) => ({ ok: false, statusText: String(e.message || e) }));

if (!res.ok) {
  console.error(`${TAG} could not authenticate against ${BASE} — ${res.statusText || res.status}.`);
  console.error(`${TAG} This check needs the app running with ALLOW_DEV_AUTH=1. Start it with \`npm run dev\`.`);
  process.exit(2);
}
const auth = await res.json();

const SEED = (a) => {
  const expiry = new Date(Date.now() + (a.expiresIn || 86400) * 1000).toISOString();
  for (const store of [localStorage, sessionStorage]) {
    store.setItem('trialsage_access_token', a.accessToken);
    store.setItem('trialsage_refresh_token', a.refreshToken || '');
    store.setItem('trialsage_token_expiry', expiry);
    store.setItem('trialsage_user', JSON.stringify(a.user || {}));
  }
  // The constrained shell. Without this a surface gets 1,352px and this whole
  // check reports nothing, convincingly.
  localStorage.setItem(
    'c2c-v2-prefs',
    JSON.stringify({
      dark: false, railCollapsed: false, anaOpen: true,
      anaMode: 'standard', segment: 'biopharma', welcomeDismissed: true,
    }),
  );
};

const READ = (tolerance) => {
  const de = document.documentElement;
  const shell = document.querySelector('.c2c-v2.shell');
  const main = document.querySelector('main.main');
  return {
    pane: main ? main.clientWidth : null,
    cols: shell ? getComputedStyle(shell).gridTemplateColumns : null,
    pageScrolls: de.scrollWidth > de.clientWidth + tolerance,
    // eslint-disable-next-line no-undef -- installed by addInitScript
    hits: window.__measureOverflow(tolerance, '.c2c-v2'),
    rendered: (main?.textContent || '').trim().length,
  };
};

/** Chromium dies on long sweeps; a dead browser must not read as a clean product. */
async function withBrowser(fn) {
  let browser = await launchChromium();
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript({ content: browserSource() });
  let page = await ctx.newPage();
  page.on('pageerror', () => {});
  const boot = async () => {
    await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(SEED, auth);
  };
  await boot();
  const restart = async () => {
    await browser.close().catch(() => {});
    browser = await launchChromium();
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript({ content: browserSource() });
    page = await ctx.newPage();
    page.on('pageerror', () => {});
    await boot();
  };
  try {
    return await fn(() => page, restart);
  } finally {
    await browser.close().catch(() => {});
  }
}

const findings = [];
const crashed = [];
let paneChecked = false;
let done = 0;
/** A sweep with no progress signal is indistinguishable from a hung one. */
const tick = (id, note) => {
  done += 1;
  process.stderr.write(`${TAG} ${String(done).padStart(3)}/${ids.length}  ${id}${note ? '  ' + note : ''}\n`);
};

await withBrowser(async (getPage, restart) => {
  for (const id of ids) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const page = getPage();
        await page.goto(`${BASE}/concept2cure/${id}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1100);
        const r = await page.evaluate(READ, TOLERANCE);

        // Assert the shell ONCE, on the first surface that renders one. Wrong
        // width means every number after it describes a layout nobody gets.
        if (!paneChecked && r.pane != null) {
          if (Math.abs(r.pane - EXPECTED_PANE) > PANE_SLACK) {
            console.error(`${TAG} SELF-CHECK FAILED — the surface pane is ${r.pane}px, expected ~${EXPECTED_PANE}.`);
            console.error(`${TAG}   shell columns: ${r.cols}`);
            console.error(`${TAG} The rail or the AnA panel is not open, so every surface is being measured`);
            console.error(`${TAG} with room it does not have. That reports clean and means nothing.`);
            process.exit(2);
          }
          console.log(`${TAG} self-check OK — pane ${r.pane}px, shell ${r.cols}.`);
          paneChecked = true;
        }

        for (const h of r.hits) {
          findings.push({ id, selector: h.selector, scrollWidth: h.scrollWidth, clientWidth: h.clientWidth });
        }
        if (r.pageScrolls) findings.push({ id, selector: '(the page scrolls sideways)', scrollWidth: 0, clientWidth: 0 });
        tick(id, r.hits.length ? `${r.hits.length} overflowing` : r.rendered < 40 ? 'rendered nothing' : '');
        break;
      } catch (e) {
        if (attempt === 0) { await restart(); continue; }
        crashed.push(`${id}: ${String(e.message || e).slice(0, 70)}`);
        tick(id, 'COULD NOT DRIVE');
      }
    }
  }
});

if (!paneChecked) {
  console.error(`${TAG} no surface ever rendered a shell — nothing was measured.`);
  process.exit(2);
}

const key = (f) => `${f.id} ${f.selector}`;
const baseline = fs.existsSync(BASELINE)
  ? JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  : { count: 0, known: [] };
const known = new Set(baseline.known ?? []);
const fresh = findings.filter((f) => !known.has(key(f)));

console.log(`${TAG} ${ids.length} surface(s) driven · ${findings.length} overflowing · baseline ${baseline.count}`);
for (const f of findings) {
  const mark = known.has(key(f)) ? ' ' : '+';
  const size = f.clientWidth ? `  ${f.scrollWidth} > ${f.clientWidth}` : '';
  console.log(`  ${mark} ${f.id}  ${f.selector}${size}`);
}

if (crashed.length > 0) {
  console.error(`\n${TAG} ${crashed.length} surface(s) could not be driven — this run did NOT cover them:`);
  for (const c of crashed) console.error(`    ${c}`);
  console.error(`${TAG} A partial sweep reported as a clean one is the failure this names rather than hides.`);
}

if (WRITE) {
  if (crashed.length > 0) {
    console.error(`${TAG} refusing to write a baseline from a partial sweep.`);
    process.exit(2);
  }
  const next = { count: findings.length, known: [...new Set(findings.map(key))].sort() };
  fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`${TAG} baseline written: ${next.count}`);
  process.exit(0);
}

if (crashed.length > 0) process.exit(2);
if (fresh.length > 0 || findings.length > baseline.count) {
  console.error(`\n${TAG} FAILED — ${fresh.length} new, ${findings.length} total against a baseline of ${baseline.count}.`);
  process.exit(1);
}
if (findings.length < baseline.count) {
  console.log(`${TAG} OK — and ${baseline.count - findings.length} fewer than the baseline. Re-run with --write-baseline to lower it.`);
  process.exit(0);
}
console.log(`${TAG} OK — nothing overflows in the running app beyond the recorded baseline.`);
