#!/usr/bin/env node
/**
 * Does anything spill sideways out of the box it is given?
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * A fix to AnA's work record moved a failure sentence onto its own line with
 * `flex-basis:100%` and an 18px `margin-left`. That is 100% PLUS 18px. At the
 * width the component actually gets — `--ana: 380px` less 12px of `.ana-body`
 * padding a side, so 356px — the step row measured 361px inside a 343px box and
 * the rail scrolled horizontally.
 *
 * Nothing caught it. 2,153 tests passed, every CSS gate passed, CI went green,
 * and the commit shipped. jsdom parses the cascade but does not lay it out, so
 * `getByText` returns the same answer whether an element fits or overflows; the
 * design gates read stylesheets as text and cannot know what 100% resolves to.
 * Only a browser at the right width can answer this, which is what this does.
 *
 * ── Why the width matters more than the check ────────────────────────────────
 * The defect was in fact "verified" before it shipped — by rendering the
 * component at 460px, where it fits. A layout inspected at a width it never
 * receives is not inspected. So every fragment is measured at the width its own
 * capture declares in `_viewports.json`, and a fragment with no declared width
 * is measured at the desktop viewport the surface captures assume.
 *
 * ── Why the cascade matters as much as the width ─────────────────────────────
 * Every `.c2c-v2 …` rule needs that class on an ancestor, and the surface
 * captures write `container.innerHTML` — the surface WITHOUT the shell element
 * that carries it. Measured bare, the whole v2 stylesheet is inert: `.pe-f`
 * stops being a column flex container, `box-sizing:border-box` stops applying,
 * and what gets measured is unstyled markup the product never renders. The
 * three sibling checks all wrap for this reason; `check-surface-styling.mjs`
 * says so in as many words. This one did not, so its findings were artifacts
 * and its silence was not evidence.
 *
 * `.c2c-v2` alone, not `.c2c-v2.shell`: the shell is
 * `display:grid; grid-template-columns:var(--rail) 1fr var(--ana)`, which would
 * lay a surface fragment out in the 60px nav rail. That is the wrapper
 * `dump-ana-rail.spec.tsx` already embeds in its own captures, which is why the
 * rail measurements were real while the surface ones were not.
 *
 * ── Ratchet, not a cliff ─────────────────────────────────────────────────────
 * Run over captured surfaces this will find pre-existing overflows that are not
 * this change's to fix. The baseline records what was already true; the check
 * fails only on a COUNT above it, and prints anything new by name. A baseline
 * that shrinks is written back on --write-baseline, so the number can fall and
 * never silently rise.
 *
 * Usage:
 *   npm run visual-qa:overflow
 *   npm run visual-qa:overflow -- --write-baseline
 *
 * @module scripts/visual-qa/check-overflow
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './playwright.mjs';
import { assertCaptureIsFresh } from './capture-freshness.mjs';
import { builtStylesheets, styleTags } from './built-css.mjs';
import { browserSource } from './overflow-rule.mjs';

const TAG = '[visual-qa:overflow]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKUP = path.join(REPO, '.visual-qa/markup');
const BASELINE = path.join(REPO, 'scripts/visual-qa/overflow-baseline.json');

/**
 * Width used for fragments whose capture declared none — the surface captures.
 *
 * NOT the 1440px viewport: a surface never gets the viewport. The shell is
 * `grid-template-columns: var(--rail) 1fr var(--ana)` — 264px of nav and 380px
 * of AnA rail — so at a 1440 window the middle column a surface actually
 * receives is 796px. Measuring at 1440 would let a surface pass on 644px of
 * room it does not have, which is the same mistake, in the same direction, as
 * inspecting the AnA rail at 460px when it renders at 356.
 */
const DESKTOP = 1440 - 264 - 380;
/** Sub-pixel rounding: a 0.5px difference is layout noise, not a defect. */
const TOLERANCE = 1;

const WRITE = process.argv.includes('--write-baseline');

// Every built stylesheet, in load order — see built-css.mjs.
//
// This file first loaded ENTRY and V2 only, which silently omitted the MDX
// sheet for `mdx__` fragments: a fix applied to `.mdx-shell .cer-tabbar` moved
// the numbers not at all, which reads exactly like a fix that does not work.
// The narrower repair — a local `sheetsFor()` copied from check-contrast.mjs —
// still missed sixteen further chunks, fourteen of which style classes present
// in the captured markup. One shared module answers it for every check instead,
// and there is no second copy of the judgement to drift.
const SHEETS = builtStylesheets(TAG, { soft: true });
const STYLES = styleTags(SHEETS);

const pageFor = (markup) =>
  `<!doctype html><html><head><meta charset="utf-8">${STYLES}` +
  // The measured box is the fragment's own width and nothing wider, so a
  // fragment cannot be rescued by a viewport it will never have.
  `<style>html,body{margin:0;padding:0}#box{overflow:hidden}</style>` +
  // `c2c-v2` for scope, on the box itself so the width lands on the same
  // element that scopes the cascade — and deliberately NOT `shell`.
  //
  // Two wrong wrappers came before this one, and each produced a confident
  // number. A bare `<div id="box">` applies no product CSS at all — every rule
  // is scoped `.c2c-v2 …` and the surface captures do not carry that class
  // themselves — so 124 fragments were measured essentially unstyled and the
  // two "overflows" it found were artifacts. Adding `shell` to match
  // check-contrast.mjs then swung it the other way: `.c2c-v2.shell` is
  // `grid-template-columns: var(--rail) 1fr var(--ana)`, so a surface fragment
  // landed in the 264px LEFT RAIL column and 525 elements "overflowed" a box
  // the product never puts them in. Contrast can wrap in `shell` harmlessly —
  // colour does not depend on width. Overflow is the one check for which the
  // container is the measurement.
  `</head><body><div id="box" class="c2c-v2">${markup}</div></body></html>`;

/**
 * The measurement itself lives in `overflow-rule.mjs`, shared with the live
 * check so one judgement call has one definition. It is handed to the page as
 * source below, because Playwright serialises an evaluated function and a
 * serialised function cannot close over an import.
 */
const MEASURE = (tolerance) => window.__measureOverflow(tolerance, '#box');


const files = fs.existsSync(MARKUP)
  ? fs.readdirSync(MARKUP).filter((f) => f.endsWith('.html')).sort()
  : [];
if (files.length === 0) {
  console.error(`${TAG} no captured markup in .visual-qa/markup — run \`npm run visual-qa:capture\` first.`);
  process.exit(1);
}
if (SHEETS.length === 0) {
  console.error(`${TAG} no built CSS in dist/public/assets — run \`npm run build\` first.`);
  console.error(`${TAG} Measuring against source CSS instead would test a cascade the product never serves.`);
  process.exit(1);
}

const viewports = fs.existsSync(path.join(MARKUP, '_viewports.json'))
  ? JSON.parse(fs.readFileSync(path.join(MARKUP, '_viewports.json'), 'utf8'))
  : {};

assertCaptureIsFresh(TAG, MARKUP, REPO);

const browser = await launchChromium();

/**
 * A `.c2c-v2`-scoped rule with a value no global reset supplies, asserted on
 * markup this check builds itself. The first version of this probe asked for
 * `box-sizing:border-box` and passed with the wrapper deliberately removed —
 * the entry sheet's global reset already sets it, so the probe measured
 * nothing. A self-check that cannot fail is worse than none: it signs off.
 *
 * `.c2c-v2 button{text-align:left;cursor:pointer}` is a base-sheet reset over
 * the UA's `center`/`default`, so both halves are wrong together only if the
 * scoped cascade is genuinely absent. It is deliberately not a surface class:
 * if it is ever renamed this fails loudly, which is the right direction.
 */
const CASCADE_PROBE = { markup: '<button id="cascade-probe">probe</button>', textAlign: 'left', cursor: 'pointer' };

/**
 * Two seeded fragments, one of each kind. `sc-spill` is the shape of the defect
 * this check was written for — in-flow content wider than the box it is given.
 * `sc-decoration` is the shape of `.ae-pstage` — an absolutely positioned
 * `::after` in the element's own right margin, which is correct CSS.
 *
 * The false-positive half is the one that matters. A check that reports correct
 * markup gets its baseline raised until it reports nothing at all.
 */
const SEEDED = [
  { id: 'sc-spill', found: true, markup: '<div id="sc-spill" style="width:120px"><div style="width:200px">spill</div></div>' },
  {
    id: 'sc-decoration',
    found: false,
    markup:
      '<style>#sc-decoration::after{content:"→";position:absolute;right:-17px;top:0}</style>' +
      '<div id="sc-decoration" style="width:120px;position:relative;margin-right:22px">deco</div>',
  },
];

// Prove the cascade before trusting a single measurement. Measured without the
// wrapper the whole v2 stylesheet is inert, and unstyled markup is what this
// check reported on until now — indistinguishable, in its output, from clean.
{
  const ctx = await browser.newContext({ viewport: { width: 400, height: 200 } });
  await ctx.addInitScript({ content: browserSource() });
  const p = await ctx.newPage();
  await p.setContent(pageFor(CASCADE_PROBE.markup), { waitUntil: 'load' });
  const got = await p.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('cascade-probe'));
    return { textAlign: cs.textAlign, cursor: cs.cursor };
  });
  await ctx.close();
  if (got.textAlign !== CASCADE_PROBE.textAlign || got.cursor !== CASCADE_PROBE.cursor) {
    console.error(`${TAG} SELF-CHECK FAILED — a button inside .c2c-v2 computes`);
    console.error(`${TAG}   text-align:${got.textAlign} (want ${CASCADE_PROBE.textAlign}), cursor:${got.cursor} (want ${CASCADE_PROBE.cursor}).`);
    console.error(`${TAG} The v2 stylesheet is not reaching the measured markup, so every`);
    console.error(`${TAG} number below would describe unstyled markup the product never renders.`);
    console.error(`${TAG} Rebuild (\`npm run build\`) or fix the wrapper before reading anything.`);
    await browser.close();
    process.exit(2);
  }
  console.log(`${TAG} self-check OK — the .c2c-v2 cascade reaches the measured box.`);
}

// Prove the measurement itself: it must find the seeded spill AND leave the
// seeded decoration alone.
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 400 } });
  await ctx.addInitScript({ content: browserSource() });
  const p = await ctx.newPage();
  await p.setContent(pageFor(SEEDED.map((c) => c.markup).join('')), { waitUntil: 'load' });
  const hits = new Set((await p.evaluate(MEASURE, TOLERANCE)).map((h) => h.id));
  await ctx.close();
  const wrong = SEEDED.filter((c) => hits.has(c.id) !== c.found);
  if (wrong.length > 0) {
    for (const c of wrong) {
      console.error(
        `${TAG} SELF-CHECK FAILED — ${c.id} was ${hits.has(c.id) ? 'reported' : 'missed'}, ` +
          `and it must be ${c.found ? 'reported' : 'left alone'}.`,
      );
    }
    console.error(`${TAG} The measurement does not separate a real spill from correct CSS.`);
    console.error(`${TAG} Nothing below can be trusted in either direction.`);
    await browser.close();
    process.exit(2);
  }
  console.log(`${TAG} self-check OK — seeded spill found, seeded decoration left alone.`);
}

const findings = [];

for (const file of files) {
  const width = viewports[file] ?? DESKTOP;
  const ctx = await browser.newContext({ viewport: { width: Math.max(width, 320), height: 900 } });
  await ctx.addInitScript({ content: browserSource() });
  const p = await ctx.newPage();
  await p.setContent(pageFor(fs.readFileSync(path.join(MARKUP, file), 'utf8')), { waitUntil: 'load' });
  await p.evaluate((w) => { document.getElementById('box').style.width = `${w}px`; }, width);
  // Open every disclosure: a record nobody expanded hides most of its rows.
  for (const t of await p.locator('[aria-expanded="false"]').all()) {
    await t.click().catch(() => {});
  }
  const hits = await p.evaluate(MEASURE, TOLERANCE);
  for (const h of hits) findings.push({ file, width, ...h });
  await ctx.close();
}
await browser.close();

const baseline = fs.existsSync(BASELINE)
  ? JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  : { count: 0, known: [] };

const key = (f) => `${f.file} ${f.selector}`;
const known = new Set(baseline.known ?? []);
const fresh = findings.filter((f) => !known.has(key(f)));

console.log(`${TAG} ${files.length} fragment(s) measured · ${findings.length} overflowing · baseline ${baseline.count}`);
for (const f of findings) {
  const mark = known.has(key(f)) ? ' ' : '+';
  console.log(`  ${mark} ${f.file} @${f.width}px  ${f.selector}  ${f.scrollWidth} > ${f.clientWidth}`);
}

if (WRITE) {
  const next = { count: findings.length, known: [...new Set(findings.map(key))].sort() };
  fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`${TAG} baseline written: ${next.count}`);
  process.exit(0);
}

if (fresh.length > 0 || findings.length > baseline.count) {
  console.error(`\n${TAG} FAILED — ${fresh.length} new overflow(s), ${findings.length} total against a baseline of ${baseline.count}.`);
  console.error(`${TAG} An element wider than its own box makes the column scroll sideways.`);
  console.error(`${TAG} If this is deliberate, give the element its own overflow-x rule rather than baselining it.`);
  process.exit(1);
}
if (findings.length < baseline.count) {
  console.log(`${TAG} OK — and ${baseline.count - findings.length} fewer than the baseline. Re-run with --write-baseline to lower it.`);
  process.exit(0);
}
console.log(`${TAG} OK — nothing overflows its box beyond the recorded baseline.`);
