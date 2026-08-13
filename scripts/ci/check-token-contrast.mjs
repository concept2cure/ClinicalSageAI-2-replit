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

const toRgb = (hex) => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [la, lb] = [luminance(toRgb(a)), luminance(toRgb(b))];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

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
  for (const [fg, bg] of ENFORCED) {
    const a = palette[fg];
    const b = palette[bg];
    if (!a?.startsWith('#') || !b?.startsWith('#')) {
      failures.push(`${themeName}: --${fg} on --${bg} — one side is not a hex token (${a ?? 'undefined'} / ${b ?? 'undefined'})`);
      continue;
    }
    checked += 1;
    const r = contrast(a, b);
    if (r < AA_NORMAL) {
      failures.push(`${themeName}: --${fg} (${a}) on --${bg} (${b}) = ${r.toFixed(2)}:1, below AA ${AA_NORMAL}:1`);
    }
  }
}

for (const e of EXCEPTIONS) {
  const palette = e.theme === 'light' ? light : dark;
  const a = palette[e.fg];
  const b = palette[e.bg];
  if (!a?.startsWith('#') || !b?.startsWith('#')) continue;
  checked += 1;
  const r = contrast(a, b);
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
    console.error('❌ token-contrast: pairs below WCAG AA for normal text:');
    for (const f of failures) console.error(`  - ${f}`);
  }
  if (regressions.length) {
    console.error('❌ token-contrast: a known-below-AA pair got WORSE:');
    for (const r of regressions) console.error(`  - ${r}`);
  }
  process.exit(1);
}

console.log(`✅ token-contrast: ${checked} pairs checked, all enforced pairs ≥ ${AA_NORMAL}:1.`);
console.log(`   ${EXCEPTIONS.length} documented exceptions (brand + muted-text ramp) held at or above their recorded ratios.`);
