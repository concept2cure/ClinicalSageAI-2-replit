#!/usr/bin/env node
/**
 * UI kit validator — static integrity checks for the hi-fi prototypes in ui_kits/.
 *
 * The kits are browser-rendered React prototypes (CDN React + Babel standalone,
 * JSX loaded as <script> tags in load order). Full browser rendering requires the
 * unpkg.com CDN, which is not reachable in CI/sandbox environments, so this script
 * validates everything that CAN be checked statically:
 *
 *   1. index.html exists for every kit
 *   2. every local file referenced by index.html (scripts, styles, icons) exists
 *   3. every JSX/JS script parses (via esbuild, which the kits' Babel also accepts)
 *   4. no shared-scope collisions — the kits' sibling <script> tags share one
 *      global scope, so the same `const {..} = React` in two scripts throws at
 *      runtime and the kit renders nothing (catch it statically; fix with `var`).
 *
 * Full offline browser rendering (vendoring React from node_modules and driving
 * headless chromium over CDP) confirmed all 9 kits render after these fixes; that
 * harness needs a chromium binary so it is not part of this CI-friendly check.
 *
 * Usage: node scripts/validate-ui-kits.mjs [--strict]
 *   --strict exits non-zero on any issue (for CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const KITS_DIR = path.join(ROOT, 'ui_kits');
const strict = process.argv.includes('--strict');

if (!fs.existsSync(KITS_DIR)) {
  console.error('No ui_kits/ directory found.');
  process.exit(strict ? 1 : 0);
}

// A leading underscore marks a directory that is NOT a kit — `_shared` holds
// rail.jsx, the navigation rail six kits <script src>-include. It has no
// index.html because it is not a page, and reporting that as "NO index.html"
// was one of this gate's ten issues: a permanent failure for a file that is
// correct as it is. A gate that cannot be satisfied stops being read.
const kits = fs
  .readdirSync(KITS_DIR)
  .filter((d) => !d.startsWith('_'))
  .filter((d) => fs.statSync(path.join(KITS_DIR, d)).isDirectory());

let totalIssues = 0;
const esbuild = path.join(ROOT, 'node_modules', '.bin', 'esbuild');

for (const kit of kits) {
  const dir = path.join(KITS_DIR, kit);
  const issues = [];
  const indexPath = path.join(dir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    console.log(`[${kit}] ✗ NO index.html`);
    totalIssues++;
    continue;
  }
  const html = fs.readFileSync(indexPath, 'utf8');

  // 1. every local referenced file (src / href) exists
  const refRe = /(?:src|href)\s*=\s*"([^"]+)"/g;
  const scripts = [];
  let m;
  while ((m = refRe.exec(html)) !== null) {
    let ref = m[1];
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#')) continue;
    ref = ref.split('?')[0];
    const target = path.join(dir, ref);
    if (!fs.existsSync(target)) {
      issues.push(`references missing file: ${ref}`);
    } else if (/\.(jsx?|mjs)$/.test(ref)) {
      scripts.push(target);
    }
  }

  // 2. every script parses
  for (const f of scripts) {
    try {
      execFileSync(esbuild, [f, '--loader:.js=jsx', '--loader:.jsx=jsx', '--bundle=false'], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (e) {
      const msg = (e.stderr?.toString() || e.message).split('\n').find((l) => l.includes('ERROR')) || 'parse error';
      issues.push(`parse error in ${path.relative(dir, f)}: ${msg.trim()}`);
    }
  }

  // 3. shared-scope collision check. The kits load their scripts as sibling
  //    <script> tags, which share ONE global lexical scope — so the same
  //    `const { ...hooks } = React;` declared at top level in two scripts throws
  //    "Identifier 'X' has already been declared" and the kit renders nothing.
  //    (Found in the authoring + intelligence kits; fixed by using `var`.) Use
  //    `var` for top-level React-hook destructures shared across a kit's scripts.
  //    The rule counts EVERY declaration form, not just `const`, because the
  //    hazard is not "two consts" — it is one lexical binding meeting any other
  //    declaration of the same name:
  //
  //      var  + var    legal, redeclaration is allowed
  //      var  + const  SyntaxError
  //      const+ const  SyntaxError
  //      const+ let    SyntaxError
  //
  //    Counting only `const` missed the mixed case. That is not hypothetical:
  //    after the six colliding kits were converted to `var`, `_shared/rail.jsx`
  //    was reverted to `const` as a test and this gate stayed green — one const
  //    among vars still throws at load and breaks all six kits that include the
  //    rail. So a collision is now: the same bound name declared more than once
  //    across a kit's scripts, with at least one of those declarations lexical.
  const hookDecls = new Map(); // bound name -> { count, lexical }
  for (const f of scripts) {
    const src = fs.readFileSync(f, 'utf8');
    for (const line of src.split('\n')) {
      const cm = line.match(/^\s*(const|let|var)\s*\{([^}]*)\}\s*=\s*React\s*;?\s*$/);
      if (!cm) continue;
      const lexical = cm[1] !== 'var';
      for (let part of cm[2].split(',')) {
        // The collision is on the BOUND name: for `useState: useStateExt` the
        // binding is `useStateExt`, so aliasing avoids the clash (as home does).
        const bound = (part.includes(':') ? part.split(':')[1] : part).trim();
        if (!bound) continue;
        const prev = hookDecls.get(bound) || { count: 0, lexical: false };
        hookDecls.set(bound, { count: prev.count + 1, lexical: prev.lexical || lexical });
      }
    }
  }
  const collisions = [...hookDecls.entries()]
    .filter(([, d]) => d.count > 1 && d.lexical)
    .map(([k]) => k);
  if (collisions.length > 0) {
    issues.push(
      `shared-scope collision: ${collisions.join(', ')} declared more than once across this kit's scripts with at least one \`const\`/\`let\` (use \`var\` for top-level React-hook destructures)`
    );
  }

  if (issues.length === 0) {
    console.log(`[${kit}] ✓ OK (${scripts.length} scripts)`);
  } else {
    console.log(`[${kit}] ✗ ${issues.length} issue(s)`);
    for (const i of issues) console.log(`    - ${i}`);
    totalIssues += issues.length;
  }
}

console.log(`\nTotal issues: ${totalIssues}`);
if (strict && totalIssues > 0) process.exit(1);
