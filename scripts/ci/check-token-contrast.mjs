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
  /* --bg-200 is the hover and sunken fill. It was never asserted against any
     text token, so every pair in this file answered "is this readable on the
     page" and none answered "is it readable on the fill the page puts under
     rows". This list applies to BOTH themes, and --text-300 on --bg-200 is
     4.90 in dark but 4.39 in light — so it cannot be enforced here without
     asserting something false about light. It is pinned in EXCEPTIONS instead,
     at the light figure, which is the honest split rather than the convenient
     one. */
  ['error', 'bg-000'],
  ['error', 'bg-100'],
  ['error', 'error-muted'],
  ['success', 'bg-000'],
  ['success', 'success-muted'],
  ['warning', 'bg-000'],
  ['warning', 'warning-muted'],

  /* The AnA persona blue. It was the seventh status tone and nothing here
     tracked it, which is why it sat at 2.35:1 on its own badge — the worst
     pairing in the palette — through two passes that fixed the other six. */
  ['ai', 'bg-000'],
  ['ai', 'ai-muted'],

  /* The accent as TEXT. `--accent-main-200` is not the brand hue; it is the
     accent's readable weight, and 427 of its 551 uses are `color:`. Untracked,
     it sat at 3.70:1 and was the largest single accessibility defect in the
     product: 371 failures, 75% of what remained after the muted ramp was
     fixed. Enforced on every light surface it can land on, not only the ones
     it happens to land on today. */
  ['accent-main-200', 'bg-000'],
  ['accent-main-200', 'bg-100'],
  /* Not `accent-main-000`: in dark it is `rgba(217,119,87,0.12)`, and a
     translucent ground has no ratio until it is composited over whatever is
     behind it — which this file, reading hex out of a stylesheet, cannot know.
     `visual-qa:contrast` composites and does measure it (4.69:1 in light).
     Asserting it here would mean asserting a number that does not exist. */

  /* The filled-accent pair — a primary button's label against its own ground.
     This is the pairing `--accent-main-100` could never satisfy (white on it
     is 3.12:1), and the reason a third accent token exists. Both halves flip
     by theme, so asserting the PAIR is what keeps them flipping together: a
     future edit that darkens the fill without darkening the label, or lightens
     one side only, fails here rather than in a customer's VPAT. */
  ['accent-on-strong', 'accent-strong'],
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
  /* A filled button's own ground against the page. Its label being readable is
     not enough — SC 1.4.11 wants the control's boundary discernible too, and
     that is the constraint that decided the fill must INVERT by theme rather
     than take one value: #ad5132 carries a white label fine on a dark page
     (5.25:1) but disappears into it at 2.89:1. */
  ['accent-strong', 'bg-000'],
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
    why: 'the brand orange itself, and it stays. 2026-08-21 resolved the design '
      + 'decision this line was waiting on by not taking it: --accent-100 is '
      + 'what the brand is SEEN in — rail indicator, borders, progress fills, '
      + 'focus ring — and 481 of its 607 uses are fill or border. Its readable '
      + 'weight is --accent-main-200 and its filled-label form is '
      + '--accent-strong, both now ENFORCED above. So this token no longer '
      + 'colours text anywhere and this exception records a hue that is not '
      + 'asked to be legible, rather than one that is failing to be' },
  { theme: 'light', fg: 'text-400', bg: 'bg-000', min: 4.50,
    why: 'muted-text ramp. Was 3.37 and excused as "passes AA for large text '
      + 'only" — measurement killed that premise: of 1,756 failing elements, '
      + 'ONE (0.1%) was large text, while this token alone caused 1,202 (68.5%). '
      + 'Now #75736d, 4.50:1, an AA pass on bg-000. It stays an exception '
      + 'because bg-100/bg-200 still fall short (4.13 / 3.84) — see '
      + '`npm run visual-qa:contrast-why`' },
  { theme: 'light', fg: 'text-500', bg: 'bg-000', min: 2.11,
    why: 'faintest ramp step. 2026-09-03 discharged the "verify each use is '
      + 'disabled/decorative" half: every separator class in the product used '
      + 'it (18 declarations across 11 stylesheets, one of which had already '
      + 'been moved to --text-400 on its own), so the ramp step was colouring '
      + 'breadcrumb and metadata glyphs at 2.11:1. All 18 now take --text-400 '
      + '(4.50:1) — subordinate to the --text-300 crumbs beside them at 5.21:1, '
      + 'and perceivable. What is left on --text-500 is genuinely disabled or '
      + 'ornamental' },

  /* The grounds this file did not look at until 2026-09-03.
     Every text pair here was asserted against --bg-000 alone, so a token could
     pass the gate and still fail AA on the sidebar (--bg-100) and the hover /
     sunken fill (--bg-200) — the two other surfaces text lands on. Measured,
     three of the six fall short. Recorded rather than enforced for the same
     reason the ramp above is: darkening the ramp again reaches every surface.
     Pinned so they can only improve, and so the number is visible.
     `visual-qa:contrast` measures what actually renders and finds no failing
     element in these pairs today — that is why they are exceptions and not
     failures, and it is a fact about which fills currently carry text, not a
     property of the tokens. */
  { theme: 'light', fg: 'text-400', bg: 'bg-100', min: 4.08,
    why: 'muted ramp on the sidebar fill; passes on --bg-000 (4.50) and not here' },
  { theme: 'light', fg: 'text-400', bg: 'bg-200', min: 3.79,
    why: 'muted ramp on the hover / sunken fill — the worst light text pair in the palette' },
  { theme: 'light', fg: 'text-300', bg: 'bg-200', min: 4.39,
    why: 'the body-muted step on the hover fill, 0.11 short; ENFORCED on --bg-000 and --bg-100' },
  { theme: 'dark', fg: 'text-400', bg: 'bg-100', min: 3.93,
    why: 'same ramp, dark side' },
  { theme: 'dark', fg: 'text-400', bg: 'bg-200', min: 3.24,
    why: 'same ramp, dark side — the worst text pair in either theme' },
  { theme: 'dark', fg: 'text-400', bg: 'bg-000', min: 4.50,
    why: 'same ramp, dark side; #8e8c84, raised from 4.27 to an AA pass' },
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
