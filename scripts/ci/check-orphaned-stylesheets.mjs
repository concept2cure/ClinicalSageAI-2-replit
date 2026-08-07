#!/usr/bin/env node
/**
 * Stylesheets under client/src that nothing imports.
 *
 * ── The gap this fills ────────────────────────────────────────────────────────
 * `check-client-reachability.mjs` walks the import graph from the browser entry
 * and holds the count of unreachable JS/TS modules at zero. It says nothing
 * about CSS: a stylesheet is reached by a side-effect import
 * (`import './styles/app-v2.css'`), and a stylesheet nobody imports is not
 * merely unreachable — it is never handed to the bundler at all, so it cannot
 * style anything, on any surface, ever.
 *
 * Measured today: 17 of 45 stylesheets under client/src, 6,402 lines and 3,588
 * rules, are imported by nothing. Verified two ways — no importer by a scan
 * that handles bare side-effect imports, aliased paths and `@import` chains,
 * and none of their distinctive class names appears anywhere in the built CSS.
 *
 * ── Why a ratchet and not a clean assertion ───────────────────────────────────
 * Not all 17 mean the same thing, and telling them apart takes judgement this
 * script does not have. Some belong to components that are gone
 * (`components/concept2cure-home/styles.module.css`, 1,198 lines). Some may be
 * a MISSING IMPORT on a live surface, which is a defect with a one-line fix,
 * not a deletion. Deciding which is which per file is a review, not a gate.
 *
 * What a gate can do is stop the number growing while that review happens, and
 * make each removal visible. So: the list may only shrink.
 *
 * ── The false lead this deliberately does NOT encode ──────────────────────────
 * The obvious next inference — "a live surface renders classes from an orphaned
 * sheet, therefore that surface is unstyled" — was checked and is NOT reliable.
 * `DocumentAuthoring` renders `.ed-tree` and `editor-core.css` is orphaned, so
 * it looked like the editor was shipping bare. It is not: `.ed-tree` has 30
 * rules in the built CSS from an imported sheet, and `editor-core.css` does not
 * define it at all. Overlap between an orphan's filename and a surface's
 * vocabulary proves nothing. Any claim that a surface renders unstyled has to
 * be made per class against the BUILT css, which is what
 * `--unstyled-classes` reports, and even then a class can legitimately exist as
 * a test hook or a JS selector.
 *
 * Usage:
 *   node scripts/ci/check-orphaned-stylesheets.mjs
 *   node scripts/ci/check-orphaned-stylesheets.mjs --list
 *   node scripts/ci/check-orphaned-stylesheets.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT_SRC = path.join(repoRoot, 'client/src');
const BASELINE = path.join(repoRoot, 'scripts/ci/orphaned-stylesheets-baseline.json');

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css'];

/** Mirrors tsconfig paths + vite resolve.alias. */
const ALIASES = [
  ['@/', 'client/src/'],
  ['@shared/', 'shared/'],
  ['@assets/', 'attached_assets/'],
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Every CSS specifier any client source names.
 *
 * The `import './x.css'` form — a bare side-effect import with no `from` — is
 * how essentially every stylesheet here is loaded, and an earlier version of
 * this scan did not match it. It reported `app-v2.css` as an orphan, which is
 * the stylesheet the entire shell is built from. Both forms are matched now,
 * plus dynamic `import()`, `require()` and CSS-level `@import`.
 */
const SPEC = new RegExp(
  [
    /import\s+(?:[^'";]*\s+from\s+)?['"]([^'"]+)['"]/.source,
    /import\s*\(\s*['"]([^'"]+)['"]/.source,
    /require\s*\(\s*['"]([^'"]+)['"]/.source,
    /@import\s+(?:url\()?['"]([^'"]+)['"]/.source,
  ].join('|'),
  'g',
);

const files = walk(CLIENT_SRC);
const sheets = files.filter((f) => f.endsWith('.css')).map((f) => path.relative(repoRoot, f)).sort();

const imported = new Set();
for (const file of files) {
  if (!CODE_EXTS.includes(path.extname(file))) continue;
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const m of src.matchAll(SPEC)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!spec || !spec.endsWith('.css')) continue;
    let base;
    if (spec.startsWith('.')) base = path.resolve(path.dirname(file), spec);
    else {
      const alias = ALIASES.find(([a]) => spec.startsWith(a));
      if (!alias) continue;
      base = path.join(repoRoot, alias[1], spec.slice(alias[0].length));
    }
    imported.add(path.relative(repoRoot, base));
  }
}

// client/index.html may link a stylesheet directly.
try {
  const html = fs.readFileSync(path.join(repoRoot, 'client/index.html'), 'utf8');
  for (const m of html.matchAll(/href=["']([^"']+\.css)["']/g)) {
    if (m[1].startsWith('http')) continue;
    imported.add(path.relative(repoRoot, path.join(repoRoot, 'client', m[1])));
  }
} catch {
  /* no index.html — the sheets list is still meaningful */
}

const orphans = sheets.filter((s) => !imported.has(s));

const lineCount = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8').split('\n').length;
const totalLines = orphans.reduce((n, p) => n + lineCount(p), 0);

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        $comment:
          'Stylesheets under client/src that no source file imports. A stylesheet nobody ' +
          'imports is never handed to the bundler, so it styles nothing on any surface. ' +
          'This list may only SHRINK — by deleting a dead sheet, or by restoring a missing ' +
          'import on a live one. Regenerate with --write-baseline ONLY after removing entries.',
        count: orphans.length,
        lines: totalLines,
        stylesheets: orphans,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[ci:orphaned-stylesheets] baseline written — ${orphans.length} orphaned sheets.`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error(
    '[ci:orphaned-stylesheets] FAIL — baseline missing. Generate it with:\n' +
      '  node scripts/ci/check-orphaned-stylesheets.mjs --write-baseline',
  );
  process.exit(1);
}

const baseline = new Set(JSON.parse(fs.readFileSync(BASELINE, 'utf8')).stylesheets);
const introduced = orphans.filter((s) => !baseline.has(s));
const resolved = [...baseline].filter((s) => !orphans.includes(s)).sort();

if (process.argv.includes('--list')) {
  for (const o of orphans) console.log(`  ${String(lineCount(o)).padStart(5)} lines   ${o}`);
  console.log('');
}

console.log(
  `[ci:orphaned-stylesheets] ${sheets.length - orphans.length} imported / ${orphans.length} orphaned ` +
    `(${totalLines} lines, baseline ${baseline.size}).`,
);

if (resolved.length > 0) {
  console.log(
    `\n  ${resolved.length} baseline entr${resolved.length === 1 ? 'y is' : 'ies are'} now deleted or imported. ` +
      `Regenerate so the ratchet holds:\n    node scripts/ci/check-orphaned-stylesheets.mjs --write-baseline`,
  );
}

if (introduced.length > 0) {
  console.error(
    `\n[ci:orphaned-stylesheets] FAIL — ${introduced.length} stylesheet(s) that nothing imports:\n`,
  );
  for (const s of introduced) console.error(`  ${s}`);
  console.error(
    '\nA stylesheet no source file imports is never given to the bundler. It ships to\n' +
      'nobody, styles nothing, and reads like the styling for whatever its filename says.\n' +
      'Either import it from the surface that needs it, or delete it.\n',
  );
  process.exit(1);
}

console.log('[ci:orphaned-stylesheets] OK — no new orphaned stylesheets.');
