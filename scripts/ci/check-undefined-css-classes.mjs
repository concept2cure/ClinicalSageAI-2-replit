#!/usr/bin/env node
/**
 * CI gate: a className in a v2 surface must be defined in a v2 stylesheet.
 *
 * ── THE INCIDENT ─────────────────────────────────────────────────────────────
 * A filing dialog shipped with six invented class names — `de-backdrop`,
 * `de-dialog`, `de-head`, `de-title`, `de-foot`, `de-ok` — where the shared
 * vocabulary is `de-bd`, `de`, `de-h`, `de-h-t`, `de-f`, `de-gov`. None of the
 * six is in any stylesheet, so the dialog rendered with no backdrop, no dialog
 * box, no header and no footer.
 *
 * Every test passed. That is the point of this gate: a test that drives a form
 * fills fields and asserts a request, and never asks whether the form was
 * visible. Type checking does not help either — `className` takes any string.
 * There is no other automated signal between "green" and "unusable".
 *
 * ── WHAT IT CHECKS ───────────────────────────────────────────────────────────
 * Every STATIC `className="..."` literal in client/src/concept2cure/v2, minus:
 *   - names defined in any v2 stylesheet (or the global app stylesheets),
 *   - library-owned namespaces (lucide-*), which the library styles,
 *   - reviewed exceptions in undefined-css-classes-baseline.json.
 *
 * Static literals only. A template literal or a conditional expression would
 * need evaluation, and guessing at it would produce noise — the cost is that a
 * dynamically-composed class is not covered, which is stated rather than hidden.
 *
 * ── WHY A BASELINE AND NOT A HARD FAIL ───────────────────────────────────────
 * A class with no rule is not always a defect. It can be a semantic hook on an
 * element styled entirely inline, or a modifier whose sibling is styled and
 * which is deliberately neutral. Both exist in this repo and both are correct.
 * What is NOT correct is an element that was meant to be styled and is not, and
 * no scanner can tell those apart. So known-harmless names are listed WITH THE
 * REASON, and anything new fails until someone looks at it.
 *
 * Usage:
 *   node scripts/ci/check-undefined-css-classes.mjs
 *   node scripts/ci/check-undefined-css-classes.mjs --list
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V2_DIR = path.join(repoRoot, 'client/src/concept2cure/v2');
const STYLE_DIR = path.join(V2_DIR, 'styles');
const BASELINE = path.join(repoRoot, 'scripts/ci/undefined-css-classes-baseline.json');
const GLOBAL_SHEETS = ['client/src/index.css', 'client/src/App.css'];

/** Namespaces owned by a library, which ships its own CSS. */
const LIBRARY_OWNED = /^(lucide$|lucide-|tw-)/;

function definedClasses() {
  const names = new Set();
  const add = (css) => {
    for (const m of css.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) names.add(m[1]);
  };
  if (fs.existsSync(STYLE_DIR)) {
    for (const f of fs.readdirSync(STYLE_DIR).filter((n) => n.endsWith('.css'))) {
      add(fs.readFileSync(path.join(STYLE_DIR, f), 'utf8'));
    }
  }
  for (const rel of GLOBAL_SHEETS) {
    const p = path.join(repoRoot, rel);
    if (fs.existsSync(p)) add(fs.readFileSync(p, 'utf8'));
  }
  return names;
}

function surfaceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'styles') out.push(...surfaceFiles(p));
    } else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

export function scan() {
  const defined = definedClasses();
  const hits = new Map(); // class -> Set<relative file>
  for (const file of surfaceFiles(V2_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/className="([^"{}]+)"/g)) {
      for (const c of m[1].split(/\s+/).filter(Boolean)) {
        if (defined.has(c) || LIBRARY_OWNED.test(c)) continue;
        if (!hits.has(c)) hits.set(c, new Set());
        hits.get(c).add(path.relative(repoRoot, file));
      }
    }
  }
  return hits;
}

const args = process.argv.slice(2);
const hits = scan();

if (args.includes('--list')) {
  for (const [c, files] of [...hits].sort()) {
    console.log(`${c}\n  ${[...files].join('\n  ')}`);
  }
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error(`[ci:undefined-css-classes] missing baseline file ${BASELINE}`);
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const allowed = new Map((baseline.allow ?? []).map((e) => [e.className, e]));

const missingReason = (baseline.allow ?? []).filter((e) => !e.reason || !String(e.reason).trim());
if (missingReason.length > 0) {
  console.error('[ci:undefined-css-classes] baseline entries without a reason:');
  for (const e of missingReason) console.error(`  ${e.className}`);
  console.error('  An entry without a written reason is the thing this file exists to prevent.');
  process.exit(1);
}

const unexpected = [...hits].filter(([c]) => !allowed.has(c)).sort();
const stale = [...allowed.keys()].filter((c) => !hits.has(c)).sort();

if (unexpected.length > 0) {
  console.error('[ci:undefined-css-classes] FAIL — class names no stylesheet defines:');
  for (const [c, files] of unexpected) {
    console.error(`  ${c}`);
    for (const f of files) console.error(`    ${f}`);
  }
  console.error('');
  console.error('  These style NOTHING. The element renders unstyled and no test will say so.');
  console.error('  Either use the existing vocabulary (grep the v2 styles/ folder for the');
  console.error('  shape you want) or, if the class is a deliberate semantic hook with no');
  console.error('  rule, add it to scripts/ci/undefined-css-classes-baseline.json WITH A REASON.');
  process.exit(1);
}

if (stale.length > 0) {
  console.error('[ci:undefined-css-classes] FAIL — baseline entries that no longer occur:');
  for (const c of stale) console.error(`  ${c}`);
  console.error('  Remove them; a baseline that outlives its cases stops describing the tree.');
  process.exit(1);
}

console.log(
  `[ci:undefined-css-classes] OK — every static className in v2 is defined, ` +
    `${allowed.size} reviewed exception(s).`,
);
