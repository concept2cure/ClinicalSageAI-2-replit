#!/usr/bin/env node
/**
 * [visual-qa] Do the converged surfaces actually receive CSS?
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * PR #1271 is a draft for one stated reason: "jsdom does not evaluate the CSS
 * cascade. The render tests prove all 24 converged surfaces draw, inside their
 * scope root, with the kit's content measure intact — they cannot prove the
 * result *looks* right."
 *
 * That cannot be fixed with more jsdom tests. jsdom parses stylesheets but does
 * not cascade or lay them out, so `getComputedStyle` returns defaults no matter
 * what is loaded. A surface whose stylesheet stopped matching when the kits were
 * rescoped renders byte-identically in jsdom whether it is styled or not — the
 * one failure mode the convergence could plausibly have introduced is the exact
 * one the existing tests are blind to.
 *
 * ── How it decides, without an arbitrary threshold ────────────────────────────
 * Each surface's real markup (captured by dump-surface-markup.spec.tsx) is
 * loaded in real Chromium TWICE: once with the built stylesheets linked, once
 * with none. Then every element's computed style is compared between the two.
 *
 * If a surface is genuinely styled, hundreds of properties differ. If its CSS
 * no longer matches, the two renders are IDENTICAL — and that is the signal,
 * with no "how many rules is enough" judgement call anywhere in it. A styled
 * surface cannot look like an unstyled one.
 *
 * Layout is checked in the same pass: horizontal overflow at a fixed viewport,
 * and a scope root that has actually laid out to a non-zero box.
 *
 * ── What it does NOT prove ────────────────────────────────────────────────────
 * That the design is right. This answers "is the cascade reaching this surface",
 * not "does a regulatory reviewer find this legible". Screenshots are written to
 * .visual-qa/shots/ for a human to page through; that judgement stays human.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './playwright.mjs';
import { assertCaptureIsFresh } from './capture-freshness.mjs';
import { builtStylesheets, styleTags } from './built-css.mjs';

const TAG = '[visual-qa]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKUP = path.join(REPO, '.visual-qa/markup');
const SHOTS = path.join(REPO, '.visual-qa/shots');

const VIEWPORT = { width: 1440, height: 900 };

// Every built stylesheet, resolved and read once — see built-css.mjs for why
// all of them rather than the four this file used to name.
const SHEETS = builtStylesheets(TAG);
const STYLES = styleTags(SHEETS);

/**
 * The surface as the shell actually mounts it: inside `<div class="c2c-v2 shell">`
 * (V2App.tsx:336). Getting this wrapper wrong would silently change every
 * `.c2c-v2 …` rule's applicability and make the whole run meaningless.
 *
 * The CSS is INLINED rather than linked. The first version of this script used
 * `<link href="file://…">`, and every one of the 24 surfaces came back
 * "receives NO css" — because `page.setContent` gives the document an
 * `about:blank` origin, from which Chromium refuses to load `file://`
 * subresources ("Not allowed to load local resource"). Nothing loaded in either
 * render, so the styled and unstyled snapshots were trivially identical and the
 * check reported a total failure that was entirely its own.
 *
 * A result where 100% of cases fail the same way is the instrument, not the
 * subject. Inlining removes the origin question altogether. `url()` references
 * inside the CSS no longer resolve, which does not matter: fonts and background
 * images are not what is being measured.
 */
function page(markup, styles = STYLES) {
  return `<!doctype html><html><head><meta charset="utf-8">${styles}</head>
<body><div class="c2c-v2 shell">${markup}</div></body></html>`;
}

/** Every element's computed style, flattened to a comparable string. */
const SNAPSHOT = () => {
  const out = [];
  const els = document.querySelectorAll('.c2c-v2 *');
  for (let i = 0; i < els.length; i++) {
    const cs = getComputedStyle(els[i]);
    out.push(
      [
        cs.display, cs.position, cs.color, cs.backgroundColor, cs.fontFamily,
        cs.fontSize, cs.fontWeight, cs.padding, cs.margin, cs.border,
        cs.borderRadius, cs.gridTemplateColumns, cs.flexDirection, cs.gap,
        cs.overflow, cs.width, cs.height,
      ].join('|'),
    );
  }
  return out;
};

const METRICS = () => {
  const root = document.querySelector('.c2c-v2');
  const r = root ? root.getBoundingClientRect() : { width: 0, height: 0 };
  return {
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    rootWidth: Math.round(r.width),
    rootHeight: Math.round(r.height),
    elementCount: document.querySelectorAll('.c2c-v2 *').length,
  };
};

const files = fs.existsSync(MARKUP)
  ? fs.readdirSync(MARKUP).filter((f) => f.endsWith('.html')).sort()
  : [];
if (files.length === 0) {
  console.error(`${TAG} no captured markup in .visual-qa/markup.`);
  console.error(`${TAG} Run the capture step first (scripts/visual-qa/dump-surface-markup.spec.tsx).`);
  process.exit(1);
}

assertCaptureIsFresh(TAG, MARKUP, REPO);

fs.mkdirSync(SHOTS, { recursive: true });

const browser = await launchChromium({ args: ['--no-sandbox', '--allow-file-access-from-files'] });
const ctx = await browser.newContext({ viewport: VIEWPORT });

/*
 * Prove the harness before trusting a word it says.
 *
 * The first version of this script reported all 24 surfaces unstyled because it
 * could not load any CSS at all. A checker that cannot distinguish "everything
 * is broken" from "I am broken" is worse than no checker, so it now demonstrates
 * on a known-styled element that the cascade is reaching the page, and refuses
 * to report anything if it is not.
 */
{
  const probe = await ctx.newPage();
  await probe.setContent(
    page('<div class="rc-ana"><span class="rc-ana-mark">*</span></div>'),
    { waitUntil: 'load' },
  );
  const ok = await probe.evaluate(() => {
    const sheets = document.styleSheets.length;
    let rules = 0;
    try { for (const s of document.styleSheets) rules += s.cssRules.length; } catch { rules = -1; }
    // `.rc-ana` is `display:flex` in insights-v2.css, which V2App's bundle carries.
    const display = getComputedStyle(document.querySelector('.rc-ana')).display;
    return { sheets, rules, display };
  });
  await probe.close();
  if (ok.rules <= 0 || ok.display !== 'flex') {
    console.error(`${TAG} SELF-CHECK FAILED — the harness is not applying CSS, so its verdict would be meaningless.`);
    console.error(`${TAG}   stylesheets=${ok.sheets} rules=${ok.rules} .rc-ana display=${ok.display} (expected flex)`);
    console.error(`${TAG} Fix the harness before reading anything below. Did the built CSS move, or did`);
    console.error(`${TAG} .rc-ana stop being display:flex? Either way this is a harness bug, not a surface bug.`);
    await browser.close();
    process.exit(2);
  }
  console.log(`${TAG} self-check OK — ${ok.rules} rules applied, .rc-ana computes to ${ok.display}.`);
}

const failures = [];
const rows = [];

for (const file of files) {
  const name = file.replace(/\.html$/, '');
  const markup = fs.readFileSync(path.join(MARKUP, file), 'utf8');

  const p = await ctx.newPage();

  // Styled.
  await p.setContent(page(markup), { waitUntil: 'load' });
  const styled = await p.evaluate(SNAPSHOT);
  const metrics = await p.evaluate(METRICS);
  await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

  // Unstyled — same markup, same wrapper, no stylesheets.
  await p.setContent(page(markup, ''), { waitUntil: 'load' });
  const bare = await p.evaluate(SNAPSHOT);

  await p.close();

  const differing = styled.reduce((n, s, i) => (s === bare[i] ? n : n + 1), 0);
  const overflow = metrics.docScrollWidth - metrics.docClientWidth;

  const problems = [];
  // The decisive check: a styled surface cannot render identically to an
  // unstyled one. Zero differing elements means no rule matched anything.
  if (differing === 0) problems.push('receives NO css — identical to the unstyled render');
  if (metrics.elementCount === 0) problems.push('rendered no elements at all');
  if (metrics.rootHeight === 0) problems.push('scope root laid out to zero height');
  // >1px of horizontal scroll on a 1440px desktop viewport is a broken layout,
  // not a design choice.
  if (overflow > 1) problems.push(`page scrolls horizontally by ${overflow}px at ${VIEWPORT.width}px`);

  rows.push({ name, els: metrics.elementCount, differing, h: metrics.rootHeight, overflow });
  if (problems.length) failures.push({ name, problems });
}

await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(`${TAG} ${files.length} converged surfaces, real Chromium ${VIEWPORT.width}x${VIEWPORT.height}, shipped stylesheets.\n`);
console.log(`  ${pad('surface', 34)} ${pad('els', 6)} ${pad('styled', 8)} ${pad('height', 8)} overflow`);
for (const r of rows) {
  console.log(`  ${pad(r.name, 34)} ${pad(r.els, 6)} ${pad(r.differing, 8)} ${pad(r.h, 8)} ${r.overflow}`);
}
console.log(`\n${TAG} screenshots: ${path.relative(REPO, SHOTS)}/`);

if (failures.length) {
  console.error(`\n${TAG} FAIL — ${failures.length} surface(s):\n`);
  for (const f of failures) {
    console.error(`  ${f.name}`);
    for (const p of f.problems) console.error(`    · ${p}`);
  }
  process.exit(1);
}
console.log(`${TAG} OK — every converged surface receives the cascade, lays out, and does not overflow.`);
