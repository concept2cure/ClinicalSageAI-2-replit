#!/usr/bin/env node
/**
 * CI Guard: theme aliases frozen to their light values.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * A custom property is substituted where it is DECLARED, not where it is used.
 * So this, at `:root`:
 *
 *     :root { --ink: var(--text-100); }
 *
 * captures whatever `--text-100` is ON :ROOT. The dark palette in
 * design-system/colors_and_type.css is declared as `.dark, [data-theme="dark"]`
 * and the app puts those on the SHELL element (V2App renders
 * `class="c2c-v2 shell dark" data-theme="dark"`), never on <html>. :root is
 * therefore never dark, and `--ink` keeps the LIGHT value for the whole dark
 * theme — while every `var(--ink)` call site looks perfectly theme-aware.
 *
 * Nothing errors. Light mode is flawless. The tokens the alias points at are
 * correctly themed. Only the pixels are wrong, and only in dark.
 *
 * ── Why this is a gate and not a note ─────────────────────────────────────────
 * This exact shape was found FIVE times in one session, in four different
 * files, by four different people-equivalents:
 *
 *   1. app-v2.css      --accent-000/100/200 -> --accent-main-*   (272 elements)
 *   2. colors_and_type --ink, --ink-*, --canvas, --canvas-*,
 *                        --info, --info-muted, --accent-hover     (30 elements)
 *   3. index.css       --color-text-code -> a #141413 literal      (3 elements)
 *   4. index.css       the "fix" for (3), re-pointed at
 *                        var(--text-200) — still at :root, so still frozen,
 *                        just to a different wrong colour
 *   5. surface-text-ramp keyed its dark block on [data-theme] only
 *
 * (4) is the one that argues for a gate: the trap catches you again while you
 * are in the middle of fixing it. A reviewer cannot see this by reading a diff
 * — the declaration looks identical whether it is in the right scope or not.
 *
 * ── What it flags ─────────────────────────────────────────────────────────────
 * A declaration in a :root block whose value contains `var(--X)`, where --X is
 * re-declared in the dark block, and the alias itself is NOT re-declared in the
 * dark block. Literal values are ignored: a hard-coded colour is theme-frozen
 * by intent, and --black in app-v2.css documents exactly that case.
 *
 * Usage:
 *   node scripts/ci/check-frozen-theme-aliases.mjs
 *   node scripts/ci/check-frozen-theme-aliases.mjs --list
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[ci:frozen-theme-aliases]';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Stylesheets that declare a :root block AND a dark block worth checking. */
const SHEETS = [
  'design-system/colors_and_type.css',
  'client/src/index.css',
  'client/src/concept2cure/v2/styles/app-v2.css',
  'client/src/concept2cure/mdx/app.css',
  'client/src/concept2cure/pdev/app.css',
];

/* Selectors that establish the dark palette. `.dark` and `[data-theme="dark"]`
   are the canonical pair; `.c2c-v2.dark` is the v2 shell's own scoped block. */
const DARK_SELECTOR = /(^|,)\s*(:root)?(\.[a-z0-9-]+)?\.dark\b|\[data-theme=["']?dark["']?\]/i;
const ROOT_SELECTOR = /(^|,)\s*:root\s*(,|$)/;

const DECL = /(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g;
const VAR_REF = /var\(\s*(--[A-Za-z0-9-]+)/g;

/** Split a stylesheet into {selector, body} blocks, ignoring comments. */
function blocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

function declsOf(body) {
  const out = new Map();
  let m;
  DECL.lastIndex = 0;
  while ((m = DECL.exec(body))) out.set(m[1], m[2].trim());
  return out;
}

/* Two passes, because the alias and the token it points at are often in
   DIFFERENT files: app-v2.css aliases --accent-200 -> --accent-main-200, and
   --accent-main-200's dark value is declared over in colors_and_type.css. A
   per-file scan sees the alias, fails to find a dark counterpart in the same
   file, and waves it through — which is exactly the defect it exists to catch.
   So: collect every dark-declared token name across ALL sheets first. */
const darkGlobal = new Map();
const perSheet = [];

for (const rel of SHEETS) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) continue;
  const bs = blocks(fs.readFileSync(abs, 'utf8'));
  const rootDecls = new Map();
  const darkDecls = new Map();
  for (const b of bs) {
    if (DARK_SELECTOR.test(b.selector)) {
      for (const [k, v] of declsOf(b.body)) { darkDecls.set(k, v); darkGlobal.set(k, v); }
    } else if (ROOT_SELECTOR.test(b.selector)) {
      for (const [k, v] of declsOf(b.body)) rootDecls.set(k, v);
    }
  }
  perSheet.push({ rel, rootDecls, darkDecls });
}

const findings = [];
const scanned = [];

for (const { rel, rootDecls, darkDecls } of perSheet) {
  if (!rootDecls.size) continue;
  scanned.push(`${rel} (${rootDecls.size} root / ${darkDecls.size} dark)`);

  for (const [name, value] of rootDecls) {
    if (!value.includes('var(')) continue;   // a literal is frozen by intent
    if (darkDecls.has(name)) continue;       // explicitly re-resolved in this sheet
    VAR_REF.lastIndex = 0;
    const refs = [];
    let m;
    while ((m = VAR_REF.exec(value))) refs.push(m[1]);
    const themed = refs.filter((r) => darkGlobal.has(r));
    if (!themed.length) continue;            // points only at theme-stable tokens
    findings.push({
      file: rel,
      alias: name,
      value,
      themed,
      light: themed.map((r) => rootDecls.get(r) ?? '?').join(' '),
      dark: themed.map((r) => darkGlobal.get(r) ?? '?').join(' '),
    });
  }
}

if (!scanned.length) {
  console.error(`${TAG} no stylesheet declared both a :root and a dark block — the scan did not run.`);
  process.exit(2);
}

console.log(`${TAG} scanned ${scanned.length} stylesheet(s): ${scanned.join(', ')}`);

if (process.argv.includes('--list') || findings.length) {
  for (const f of findings) {
    console.error('');
    console.error(`  ${f.file}`);
    console.error(`    ${f.alias}: ${f.value}`);
    console.error(`    -> ${f.themed.join(', ')} is re-declared for dark, but ${f.alias} is not.`);
    console.error(`       In dark this still resolves to the LIGHT value ${f.light} instead of ${f.dark}.`);
  }
}

if (findings.length) {
  console.error('');
  console.error(`${TAG} FAIL — ${findings.length} alias(es) frozen to their light values.`);
  console.error('');
  console.error('  A custom property is substituted where it is DECLARED. :root is never .dark,');
  console.error('  so an alias declared there captures the light value permanently, while every');
  console.error('  call site still reads var(--alias) and looks theme-aware.');
  console.error('');
  console.error('  Two ways out:');
  console.error('    1. Re-declare the alias inside the dark block, with the SAME right-hand side.');
  console.error('       It is the same indirection evaluated in a scope where dark is in view —');
  console.error('       not a second palette to keep in step.');
  console.error('    2. Drop the indirection and use the themed token at the point of use.');
  console.error('');
  process.exit(1);
}

console.log(`${TAG} OK — no :root alias is frozen against its dark counterpart.`);
