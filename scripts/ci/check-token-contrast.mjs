#!/usr/bin/env node
/**
 * WCAG 2.2 AA contrast for the design tokens, computed — not asserted.
 *
 * ── Why a guard here is worth having ────────────────────────────────────────
 * Contrast is arithmetic on two hex values. Unlike "is this data fabricated",
 * there is no semantic judgement to get wrong, so this check cannot drift into
 * the false positives that make a baseline unreadable. If it says a pair is
 * below 4.5:1, that pair is below 4.5:1.
 *
 * What it caught when first run: `--error` was never declared for dark mode, so
 * the light red (#b93a3a) cascaded onto the dark page at 2.69:1 — under even
 * the 3:1 non-text floor. An error message no one can read, on a platform whose
 * users are told to act on error messages.
 *
 * ── The exceptions are real, and they are design decisions ──────────────────
 * Three light-mode pairs sit below AA and are NOT changed here: they involve the
 * brand colour and the muted-text ramp, whose blast radius is 59 files and whose
 * resolution is a design call, not a lint fix. They are listed with their
 * measured ratios so the number is visible instead of implied, and the guard
 * fails if any of them gets WORSE. Silence would imply compliance this palette
 * does not have.
 */
import fs from 'node:fs';
import path from 'node:path';
/* The WCAG arithmetic — luminance, ratio, and the oklch the palette is authored
   in — lives in one module shared with scripts/visual-qa/check-contrast.mjs.
   It used to be written out in both, which is two implementations of one
   capability: a correction to either would have applied to half the product. */
import { contrastRatio, measurable, parseColor } from '../lib/wcag.mjs';

const TOKENS = path.join(process.cwd(), 'design-system', 'colors_and_type.css');
const AA_NORMAL = 4.5;

function parseBlocks(src) {
  // Light is the :root block declaring --bg-000: #faf9f5; dark is the one
  // declaring #262624. Matching on the VALUE rather than the selector because
  // the dark selector has changed shape before (.dark, [data-theme=dark]).
  const blocks = [...src.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  const read = (b) =>
    Object.fromEntries(
      [...b.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
  const light = {};
  const dark = {};
  for (const b of blocks) {
    const t = read(b);
    if ((t['bg-000'] || '').toLowerCase() === '#faf9f5') Object.assign(light, t);
    if ((t['bg-000'] || '').toLowerCase() === '#262624') Object.assign(dark, t);
  }
  return { light, dark };
}

/**
 * Resolve a single level of `var(--x)` aliasing.
 *
 * Half the border family is declared as an alias — `--border-strong:
 * var(--bg-300)`, `--border-focus: var(--accent-main-100)`, `--border-subtle:
 * var(--sidebar-border)` — and the checks below need a colour literal on both
 * sides. So those three could not be registered here at all, and the palette's
 * least-contrasty tokens were the ones the contrast gate could not see. One
 * level covers every alias in this file; a chain needing two is a smell worth
 * failing on.
 *
 * This stays here rather than in `lib/wcag.mjs`: it is about how THIS palette
 * is written, not about WCAG.
 */
function deref(palette, name) {
  const v = palette[name];
  if (typeof v !== 'string') return v;
  const m = v.match(/^var\(\s*--([a-z0-9-]+)\s*\)$/i);
  return m ? palette[m[1]] : v;
}

/** Pairs that must meet AA for normal text, in BOTH themes. */
const ENFORCED = [
  ['text-100', 'bg-000'],
  ['text-200', 'bg-000'],
  ['text-300', 'bg-000'],
  ['text-300', 'bg-100'],
  ['error', 'bg-000'],
  ['error', 'bg-100'],
  ['error', 'error-muted'],
  ['success', 'bg-000'],
  ['success', 'success-muted'],
  ['warning', 'bg-000'],
  ['warning', 'warning-muted'],
];

/**
 * Pairs that must meet SC 1.4.11's 3:1 for NON-TEXT contrast, in both themes.
 *
 * This tier did not exist. The file carried a single threshold — 4.5 — and its
 * own header referred to "the 3:1 non-text floor" in prose while no code ever
 * applied one. So the boundary of every input in the product was 1.34:1 and
 * nothing measured it; the failure lived in a comment above one CSS rule.
 *
 * SC 1.4.11 covers "visual information required to identify user interface
 * components and states" — a control's edge and its focus indicator. It does
 * NOT cover dividers, row rules or card edges, which is why `--border` is not
 * in this list and `--border-control` is.
 */
const NON_TEXT = [
  ['border-control', 'bg-000'],
  ['border-control', 'bg-100'],
  ['border-control', 'bg-200'],
];
const NON_TEXT_MIN = 3.0;

/**
 * Divider tokens, which fail by being too LOUD rather than too quiet.
 *
 * Every other check here is a floor. This one is a ceiling, and it exists
 * because the defect it catches is invisible to a floor: `--sidebar-border` was
 * declared `oklch(0.9401 0 0)` — #ebebeb — in BOTH theme blocks, so the light
 * value cascaded onto the #262624 dark page as a near-white 1px rule at
 * 12.72:1. Not a subtle divider; a glaring line.
 *
 * That is the same shape as the `--error` bug this file's header describes
 * ("never declared for dark, so the light value cascaded"), and it survived
 * because a contrast gate built entirely out of minimums cannot see it — 12.72
 * passes every floor in the file. A hairline that separates two regions should
 * be barely there; anything above this is a token that forgot a theme.
 */
const SUBTLE = [
  ['sidebar-border', 'bg-000'],
  ['border-subtle', 'bg-000'],
  ['border', 'bg-000'],
];
const SUBTLE_MAX = 2.5;

/**
 * Known below AA, deliberately unchanged, and allowed only to IMPROVE.
 * `min` is the measured ratio at the time of recording.
 */
const EXCEPTIONS = [
  { theme: 'light', fg: 'accent-main-100', bg: 'bg-000', min: 2.96,
    why: 'the brand orange itself; changing it is a design decision, not a lint fix' },
  { theme: 'light', fg: 'text-400', bg: 'bg-000', min: 3.37,
    why: 'muted-text ramp used in 59 files; passes AA for large text only' },
  { theme: 'light', fg: 'text-500', bg: 'bg-000', min: 2.11,
    why: 'faintest ramp step, 22 files; verify each use is disabled/decorative' },
  { theme: 'dark', fg: 'text-400', bg: 'bg-000', min: 4.27,
    why: 'same ramp, dark side' },
  { theme: 'dark', fg: 'text-500', bg: 'bg-000', min: 2.76,
    why: 'same ramp, dark side' },

  /* Below are NON-TEXT (3:1) facts, recorded so the number is visible rather
     than implied. They are listed as exceptions, not failures, because each is
     a design decision that has not been taken — but they can now only improve. */
  { theme: 'light', fg: 'border-focus', bg: 'bg-000', min: 2.96, nonText: true,
    why: 'the focus ring IS the brand orange (--accent-main-100); SC 1.4.11 and 2.4.11 both want 3:1 and it is 2.96. Changing it is the same decision as the accent exception above' },
  { theme: 'light', fg: 'border', bg: 'bg-000', min: 1.34, nonText: true,
    why: 'the structural divider token. NOT a control boundary — SC 1.4.11 does not reach dividers — but pinned so it cannot drift further while ~964 sites still use it' },
  { theme: 'dark', fg: 'border', bg: 'bg-000', min: 1.41, nonText: true,
    why: 'same token, dark side' },
  { theme: 'light', fg: 'border-strong', bg: 'bg-000', min: 1.49, nonText: true,
    why: 'the review recorded this as 1.70, which is the DARK figure; in light it aliases --bg-300 and is 1.49. Some controls still use it — those are the migration target' },
  { theme: 'dark', fg: 'border-strong', bg: 'bg-000', min: 1.70, nonText: true,
    why: 'same token, dark side' },
];

if (!fs.existsSync(TOKENS)) {
  console.error(`❌ token-contrast: ${path.relative(process.cwd(), TOKENS)} not found — the scan did not run.`);
  process.exit(1);
}
const { light, dark } = parseBlocks(fs.readFileSync(TOKENS, 'utf8'));
if (!light['bg-000'] || !dark['bg-000']) {
  console.error('❌ token-contrast: could not resolve both theme blocks — refusing to report success.');
  process.exit(1);
}

const failures = [];
const regressions = [];
let checked = 0;

for (const [themeName, palette] of [['light', light], ['dark', dark]]) {
  for (const [name, pairs] of [['divider', SUBTLE]]) {
    for (const [fg, bg] of pairs) {
      const a = deref(palette, fg);
      const b = deref(palette, bg);
      if (!measurable(a) || !measurable(b)) {
        failures.push(`${themeName}: --${fg} on --${bg} — one side is not a measurable colour (${a ?? 'undefined'} / ${b ?? 'undefined'})`);
        continue;
      }
      checked += 1;
      const r = contrastRatio(parseColor(a), parseColor(b));
      if (r > SUBTLE_MAX) {
        failures.push(
          `${themeName}: --${fg} (${a}) on --${bg} (${b}) = ${r.toFixed(2)}:1, ABOVE the ${name} ceiling ${SUBTLE_MAX}:1 — ` +
          `a hairline this loud usually means the token was not declared for this theme`,
        );
      }
    }
  }
  for (const [tier, pairs, min] of [['AA', ENFORCED, AA_NORMAL], ['non-text', NON_TEXT, NON_TEXT_MIN]]) {
    for (const [fg, bg] of pairs) {
      const a = deref(palette, fg);
      const b = deref(palette, bg);
      if (!measurable(a) || !measurable(b)) {
        failures.push(`${themeName}: --${fg} on --${bg} — one side is not a measurable colour (${a ?? 'undefined'} / ${b ?? 'undefined'})`);
        continue;
      }
      checked += 1;
      const r = contrastRatio(parseColor(a), parseColor(b));
      if (r < min) {
        failures.push(`${themeName}: --${fg} (${a}) on --${bg} (${b}) = ${r.toFixed(2)}:1, below ${tier} ${min}:1`);
      }
    }
  }
}

for (const e of EXCEPTIONS) {
  const palette = e.theme === 'light' ? light : dark;
  const a = deref(palette, e.fg);
  const b = deref(palette, e.bg);
  if (!measurable(a) || !measurable(b)) continue;
  checked += 1;
  const r = contrastRatio(parseColor(a), parseColor(b));
  // Rounded to the recorded precision so a no-op reformat cannot trip it.
  if (Number(r.toFixed(2)) < e.min) {
    regressions.push(`${e.theme}: --${e.fg} on --${e.bg} fell to ${r.toFixed(2)}:1 (was ${e.min}:1)`);
  }
}

if (checked === 0) {
  console.error('❌ token-contrast: nothing was checked — the scan did not run.');
  process.exit(1);
}

if (failures.length || regressions.length) {
  if (failures.length) {
    console.error('❌ token-contrast: pairs below their WCAG floor:');
    for (const f of failures) console.error(`  - ${f}`);
  }
  if (regressions.length) {
    console.error('❌ token-contrast: a known-below-AA pair got WORSE:');
    for (const r of regressions) console.error(`  - ${r}`);
  }
  process.exit(1);
}

console.log(`✅ token-contrast: ${checked} pairs checked — text ≥ ${AA_NORMAL}:1, non-text ≥ ${NON_TEXT_MIN}:1.`);
console.log(`   ${EXCEPTIONS.length} documented exceptions (brand, muted-text ramp, structural borders) held at or above their recorded ratios.`);
