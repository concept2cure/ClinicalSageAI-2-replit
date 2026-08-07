#!/usr/bin/env node
/**
 * CI Guard: phantom design tokens.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `var(--some-token, #fallback)` where `--some-token` is declared nowhere in the
 * repository. The CSS is valid, nothing errors, and the fallback renders — every
 * time, forever. The `var()` is decoration. The style looks token-driven in
 * review and is a hardcoded literal at runtime, which is the worst of both: it
 * passes a "do we use tokens" reading of the diff while being immune to any
 * change to the token layer.
 *
 * The repo already named this pattern. docs/design/WORK_ORDER_doc-type-detection.md:
 *   "Banned pattern, for reference: var(--ana-accent, #5b6af5) — phantom token,
 *    off-brand fallback. This is the archetype being eliminated."
 * That specific one was fixed. 33 others were not.
 *
 * What it costs, concretely:
 *   --danger    45 uses across SIX different fallback reds (#b4541f, #b91c1c,
 *               #a03028, #dc2626, #e5484d …). The canonical token is --error
 *               (#b93a3a) and none of the six equals it. One concept, six
 *               colours, zero of them the brand's.
 *   --ana-w     one use, and a real bug: the launcher offset computed
 *               calc(var(--ana-w,400px) + 22px) against a 380px dock, parking it
 *               20px inside the page. Fixed in the same change that added this
 *               gate; the gate is what stops the next one.
 *
 * ── Why a gate and not a sweep ────────────────────────────────────────────────
 * Rewriting 153 call sites means choosing a real token for each, and several map
 * to a token the canonical layer does not have — there is no "ink on warning"
 * or "ink on error" token, which is precisely why authors invented their own.
 * A linter picking those would be a large uncontrolled visual change. So this
 * freezes the set and lets it shrink.
 *
 * ── Deliberately narrow ───────────────────────────────────────────────────────
 * Only `var(--x, …)` with a fallback is checked. A bare `var(--x)` with no
 * fallback renders as nothing and is a visible bug that surfaces on its own;
 * this gate is for the invisible kind.
 *
 * Usage:
 *   node scripts/ci/check-phantom-tokens.mjs
 *   node scripts/ci/check-phantom-tokens.mjs --list
 *   node scripts/ci/check-phantom-tokens.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_FILE = path.join(repoRoot, 'scripts/ci/phantom-tokens-baseline.json');

/** Where styles are authored and where tokens may be declared. */
const SCAN_ROOTS = ['client/src', 'design-system', 'shared'];
const SCAN_EXT = new Set(['.css', '.scss', '.ts', '.tsx', '.js', '.jsx']);

function walk(rel) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const full = path.join(e.parentPath ?? e.path, e.name);
    if (SCAN_EXT.has(path.extname(full))) out.push(full);
  }
  return out;
}

const files = SCAN_ROOTS.flatMap(walk);

// Every custom property DECLARED anywhere — `--x:` in CSS, or in a JS style
// object / template. Deliberately generous: a token declared in any form counts
// as existing, so this gate can only ever under-report.
const declared = new Set();
const DECL = /(--[A-Za-z0-9_-]+)\s*:/g;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = DECL.exec(src)) !== null) declared.add(m[1]);
}

// Every `var(--x, <fallback>)` USE.
const USE = /var\(\s*(--[A-Za-z0-9_-]+)\s*,/g;
const uses = new Map(); // token -> [{file, line}]
for (const f of files) {
  const rel = path.relative(repoRoot, f);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    let m;
    USE.lastIndex = 0;
    while ((m = USE.exec(line)) !== null) {
      const tok = m[1];
      if (!uses.has(tok)) uses.set(tok, []);
      uses.get(tok).push({ file: rel, line: i + 1 });
    }
  });
}

const phantoms = [...uses.entries()]
  .filter(([tok]) => !declared.has(tok))
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

const totalSites = phantoms.reduce((n, [, sites]) => n + sites.length, 0);

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        $comment:
          'CSS custom properties used as var(--x, fallback) but declared nowhere, so the ' +
          'fallback always renders. This list may only SHRINK. Adding a name means a new ' +
          'un-anchored style shipped. Fix by pointing at a real token from ' +
          'design-system/colors_and_type.css — or, if none fits, add the token there first.',
        $generated: new Date().toISOString().slice(0, 10),
        tokenCount: phantoms.length,
        siteCount: totalSites,
        tokens: phantoms.map(([t]) => t).sort(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `[ci:phantom-tokens] baseline written — ${phantoms.length} phantom token(s), ${totalSites} site(s).`,
  );
  process.exit(0);
}

if (!fs.existsSync(BASELINE_FILE)) {
  console.error(
    '[ci:phantom-tokens] FAIL — baseline missing. Generate it with:\n' +
      '  node scripts/ci/check-phantom-tokens.mjs --write-baseline',
  );
  process.exit(1);
}

const baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).tokens);
const currentNames = new Set(phantoms.map(([t]) => t));
const introduced = phantoms.filter(([t]) => !baseline.has(t));
const resolved = [...baseline].filter((t) => !currentNames.has(t)).sort();

if (process.argv.includes('--list')) {
  for (const [tok, sites] of phantoms) {
    console.log(`  ${tok}  (${sites.length} site${sites.length === 1 ? '' : 's'})`);
    for (const s of sites.slice(0, 8)) console.log(`      ${s.file}:${s.line}`);
    if (sites.length > 8) console.log(`      … ${sites.length - 8} more`);
  }
  console.log('');
}

console.log(
  `[ci:phantom-tokens] ${phantoms.length} phantom token(s) across ${totalSites} site(s) ` +
    `(baseline ${baseline.size}).`,
);

if (resolved.length > 0) {
  console.log(
    `\n  ${resolved.length} baseline token(s) now resolve: ${resolved.slice(0, 12).join(', ')}` +
      `${resolved.length > 12 ? ', …' : ''}\n` +
      '  Regenerate so the ratchet holds:\n' +
      '    node scripts/ci/check-phantom-tokens.mjs --write-baseline',
  );
}

if (introduced.length > 0) {
  console.error('\n[ci:phantom-tokens] FAIL — new phantom token(s):\n');
  for (const [tok, sites] of introduced) {
    console.error(`  ${tok}  — declared nowhere, ${sites.length} use(s):`);
    for (const s of sites.slice(0, 10)) console.error(`      ${s.file}:${s.line}`);
  }
  console.error(
    '\nThis renders the fallback every time — the var() is decoration, and the style is\n' +
      'immune to any change in the token layer while reading as token-driven in review.\n' +
      'Point it at a real token from design-system/colors_and_type.css. If no token fits,\n' +
      'add one there first: an invented local literal is how one concept ends up with six\n' +
      'different colours (see --danger).\n',
  );
  process.exit(1);
}

console.log('[ci:phantom-tokens] OK — no new phantom tokens.');
