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

const TAG = '[visual-qa]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKUP = path.join(REPO, '.visual-qa/markup');
const SHOTS = path.join(REPO, '.visual-qa/shots');
const ASSETS = path.join(REPO, 'dist/public/assets');

const VIEWPORT = { width: 1440, height: 900 };

/** Resolve the content-hashed bundles by prefix, so a rebuild doesn't break this. */
function asset(prefix) {
  const hit = fs.readdirSync(ASSETS).find((f) => f.startsWith(prefix) && f.endsWith('.css'));
  if (!hit) {
    console.error(`${TAG} no built stylesheet matching ${prefix}*.css in dist/public/assets.`);
    console.error(`${TAG} Run \`npm run build\` first — this checks the SHIPPED css, not source.`);
    process.exit(1);
  }
  return path.join(ASSETS, hit);
}

const ENTRY_CSS = asset('index-');   // design tokens + Tailwind; everything else uses its vars
const V2_CSS = asset('V2App-');      // the shell, including the `.c2c-v2 { … }` nested surface sheets
const MDX_CSS = asset('MdxSurfaceHost-');
const PDEV_CSS = asset('PdevRoute-');

const sheetsFor = (name) =>
  name.startsWith('mdx__') ? [ENTRY_CSS, V2_CSS, MDX_CSS] : [ENTRY_CSS, V2_CSS, PDEV_CSS];

// Read once — these are up to a few hundred KB each and every surface needs them.
const cssCache = new Map();
const cssText = (p) => {
  if (!cssCache.has(p)) cssCache.set(p, fs.readFileSync(p, 'utf8'));
  return cssCache.get(p);
};

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
function page(markup, sheets) {
  const styles = sheets.map((p) => `<style>${cssText(p)}</style>`).join('\n');
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

/**
 * One probe per stylesheet this run can load, each asserting a declaration that
 * exists in that sheet and nowhere else.
 *
 * Prove the harness before trusting a word it says. The first version of this
 * script reported all 24 surfaces unstyled because it could not load any CSS at
 * all, and a checker that cannot distinguish "everything is broken" from "I am
 * broken" is worse than no checker.
 *
 * The self-check that followed had the same shape of fault it was written to
 * catch. It probed `.rc-ana` for `display:flex`, on the stated belief that
 * "V2App's bundle carries it". V2App's bundle does not: `insights-v2.css` is
 * imported by `Insights.tsx`, which Vite splits into its own lazily-loaded
 * chunk, so the rule ships in `Insights-*.css` and the probe asked two loaded
 * sheets about a third. It computed to `block`, the check exited 2 before
 * measuring a single surface, and because `npm run visual-qa` chains on `&&`,
 * the a11y, contrast and overflow steps behind it never ran either.
 *
 * A self-check for the wrong sheet fails exactly like a broken cascade, so the
 * failure it was designed to make legible is the one it made unreadable. One
 * probe per sheet is what distinguishes them: a missing sheet now names itself.
 */
const PROBES = [
  // Tailwind utility — only the entry bundle carries these.
  { css: ENTRY_CSS, label: 'index (tokens + Tailwind)',
    markup: '<div class="pointer-events-none"></div>', sel: '.pointer-events-none',
    prop: 'pointerEvents', want: 'none' },
  // The shell grid. `.c2c-v2.shell` is the wrapper `page()` builds, and its
  // columns resolve through --rail/--ana, so this covers the tokens too.
  { css: V2_CSS, label: 'V2App (shell + v2 surfaces)',
    markup: '', sel: '.c2c-v2.shell',
    prop: 'gridTemplateColumns', want: '264px', startsWith: true },
  { css: MDX_CSS, label: 'MdxSurfaceHost',
    markup: '<div class="mdx-shell"><div class="page-inner"></div></div>', sel: '.page-inner',
    prop: 'maxWidth', want: '1280px' },
  { css: PDEV_CSS, label: 'PdevRoute',
    markup: '<div class="pdev-shell"></div>', sel: '.pdev-shell',
    prop: 'display', want: 'grid' },
];

{
  const failed = [];
  let total = 0;
  for (const pr of PROBES) {
    const probe = await ctx.newPage();
    await probe.setContent(page(pr.markup, [pr.css]), { waitUntil: 'load' });
    const got = await probe.evaluate(({ sel, prop }) => {
      let rules = 0;
      try { for (const s of document.styleSheets) rules += s.cssRules.length; } catch { rules = -1; }
      const el = document.querySelector(sel);
      return { rules, value: el ? getComputedStyle(el)[prop] : '(element not found)' };
    }, { sel: pr.sel, prop: pr.prop });
    await probe.close();
    total += Math.max(got.rules, 0);
    const ok = got.rules > 0 &&
      (pr.startsWith ? String(got.value).startsWith(pr.want) : got.value === pr.want);
    if (!ok) failed.push({ ...pr, ...got });
  }

  if (failed.length > 0) {
    console.error(`${TAG} SELF-CHECK FAILED — the harness is not applying CSS, so its verdict would be meaningless.`);
    for (const f of failed) {
      console.error(`${TAG}   ${f.label}: ${f.sel} ${f.prop}=${f.value} (expected ${f.startsWith ? f.want + '…' : f.want}), rules=${f.rules}`);
    }
    console.error(`${TAG} Fix the harness before reading anything below. Each line names one bundle:`);
    console.error(`${TAG} either that sheet moved or stopped being built, or the rule it is probed by`);
    console.error(`${TAG} changed. This is a harness bug, not a surface bug.`);
    await browser.close();
    process.exit(2);
  }
  console.log(`${TAG} self-check OK — ${PROBES.length} bundles applying CSS, ${total} rules in total.`);
}

const failures = [];
const rows = [];

for (const file of files) {
  const name = file.replace(/\.html$/, '');
  const markup = fs.readFileSync(path.join(MARKUP, file), 'utf8');

  const p = await ctx.newPage();

  // Styled.
  await p.setContent(page(markup, sheetsFor(name)), { waitUntil: 'load' });
  const styled = await p.evaluate(SNAPSHOT);
  const metrics = await p.evaluate(METRICS);
  await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

  // Unstyled — same markup, same wrapper, no stylesheets.
  await p.setContent(page(markup, []), { waitUntil: 'load' });
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
