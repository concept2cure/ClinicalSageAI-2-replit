#!/usr/bin/env node
/**
 * Token cascade CI gate.
 *
 * Per design-system/CLAUDE.md, every var(--*) reference in client-side CSS
 * must resolve against the canonical design-system/colors_and_type.css
 * (plus any sanctioned shim in client/src/index.css). When a kit is mirrored
 * and its inline :root tokens are stripped (the contract), missing aliases
 * silently render the brand as muted/grey — the 2026-04-26 regression class.
 *
 * This script statically resolves every var() reference in every CSS file
 * under client/src/concept2cure/ and client/src/styles/. Build fails if
 * any var() does not resolve.
 *
 * Skipped:
 *   - client/src/components/{canvas,dashboard,navigation,timeline,predicate}/
 *     (legacy v2 UI being deleted; uses its own --color-primary / --space-*
 *      namespace, not the canonical surface)
 *   - client/src/toast.css (react-toastify supplies --toastify-* at runtime)
 *
 * Exit codes: 0 = clean, 1 = unresolved vars found.
 *
 * Usage:
 *   node scripts/ci/check-token-cascade.mjs                      # default
 *   node scripts/ci/check-token-cascade.mjs --include-legacy     # also legacy
 *   node scripts/ci/check-token-cascade.mjs --json               # machine output
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const CANONICAL  = path.join(ROOT, 'design-system', 'colors_and_type.css');
const INDEX_SHIM = path.join(ROOT, 'client', 'src', 'index.css');
const ZEN_CSS    = path.join(ROOT, 'client', 'src', 'concept2cure', 'design', 'zen.css');

const args = process.argv.slice(2);
const includeLegacy = args.includes('--include-legacy');
const jsonOut       = args.includes('--json');

const SCAN_DIRS = [
  'client/src/concept2cure',
  'client/src/styles',
];
const ALWAYS_SKIP = [
  'client/src/components/canvas',
  'client/src/components/dashboard',
  'client/src/components/navigation',
  'client/src/components/timeline',
  'client/src/components/predicate',
  'client/src/toast.css',
];

// ─── Helpers ───────────────────────────────────────────────────────────

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

function extractRoot(css, label) {
  const decls = {};
  const stripped = stripComments(css);
  // :root | .dark | [data-theme=...] | :global(:root) | :global(.dark)
  const re = /(?::global\(\s*:root\s*\)|:global\(\s*\.dark\s*\)|:root|\.dark|\[data-theme=[^\]]*\])\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    m[1].split(';').forEach(seg => {
      const trimmed = seg.trim();
      if (!trimmed) return;
      const colon = trimmed.indexOf(':');
      if (colon < 0) return;
      const name = trimmed.slice(0, colon).trim();
      if (!/^--/.test(name)) return;
      const val = trimmed.slice(colon + 1).trim().replace(/\s+/g, ' ');
      decls[name] = { val, from: label };
    });
  }
  return decls;
}

function buildGlobalCascade() {
  const canonical = fs.readFileSync(CANONICAL,  'utf8');
  const indexCss  = fs.readFileSync(INDEX_SHIM, 'utf8');
  const zenCss    = fs.readFileSync(ZEN_CSS,    'utf8');
  return {
    ...extractRoot(canonical, 'canonical'),
    ...extractRoot(zenCss,    'zen'),
    ...extractRoot(indexCss,  'index-shim'),
  };
}

function makeResolver(cascade) {
  return function resolve(name, seen = new Set()) {
    if (seen.has(name)) return { kind: 'circular' };
    seen.add(name);
    const e = cascade[name];
    if (!e) return { kind: 'undefined' };
    const m = e.val.match(/^var\((--[a-zA-Z0-9-]+)/);
    if (m) return resolve(m[1], seen);
    return { kind: 'value', val: e.val, from: e.from };
  };
}

function listCssFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listCssFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

function isSkipped(rel) {
  if (includeLegacy) return false;
  return ALWAYS_SKIP.some(p => rel === p || rel.startsWith(p + '/') || rel.startsWith(p + path.sep));
}

function auditFile(file, globalCascade) {
  const css = fs.readFileSync(file, 'utf8');
  const local = extractRoot(css, 'local');
  const cascade = { ...globalCascade, ...local };
  const resolve = makeResolver(cascade);

  // Strip own :root-equivalent blocks before scanning so self-aliases don't count.
  let scan = stripComments(css).replace(
    /(?::global\(\s*:root\s*\)|:global\(\s*\.dark\s*\)|:root|\.dark|\[data-theme=[^\]]*\])\s*\{[\s\S]*?\}/g,
    '',
  );

  const used = new Map(); // name → { hasFallback }
  const re = /var\((--[a-zA-Z0-9-]+)(\s*,[^)]+)?\)/g;
  let m;
  while ((m = re.exec(scan)) !== null) {
    const name = m[1];
    const hasFallback = !!m[2];
    if (!used.has(name)) used.set(name, { hasFallback });
    else if (!hasFallback) used.get(name).hasFallback = false;
  }

  const missing = [];
  let ok = 0;
  for (const [v, meta] of used) {
    const r = resolve(v);
    if (r.kind === 'undefined' || r.kind === 'circular') {
      // Soft-pass when every reference has an inline fallback.
      if (meta.hasFallback) ok++;
      else missing.push(v);
    } else {
      ok++;
    }
  }
  return { ok, missing, total: used.size };
}

// ─── Main ──────────────────────────────────────────────────────────────

function main() {
  const globalCascade = buildGlobalCascade();

  // Verify the canonical surface itself first.
  const resolve = makeResolver(globalCascade);
  for (const probe of ['--accent-100', '--bg-000', '--text-100']) {
    const r = resolve(probe);
    if (r.kind !== 'value') {
      console.error(`[token-cascade] CRITICAL: canonical ${probe} does not resolve (${r.kind}).`);
      process.exit(1);
    }
  }

  const files = SCAN_DIRS.flatMap(d => listCssFiles(path.join(ROOT, d)))
    .map(f => path.relative(ROOT, f))
    .filter(rel => !isSkipped(rel))
    .filter(rel => /var\(--/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')))
    .sort();

  const results = [];
  let totalMissing = 0;
  for (const rel of files) {
    const r = auditFile(path.join(ROOT, rel), globalCascade);
    results.push({ file: rel, ...r });
    totalMissing += r.missing.length;
  }

  if (jsonOut) {
    process.stdout.write(JSON.stringify({ ok: totalMissing === 0, results }, null, 2) + '\n');
    process.exit(totalMissing === 0 ? 0 : 1);
  }

  for (const r of results) {
    const status = r.missing.length === 0 ? 'ok  ' : 'FAIL';
    const line = `  ${status} ${r.file.padEnd(80)} ${(r.ok + '/' + r.total).padEnd(8)} ${r.missing.join(', ')}`;
    console.log(line);
  }
  console.log('');
  if (totalMissing === 0) {
    console.log(`[token-cascade] PASS — all ${files.length} stylesheets resolve cleanly.`);
    process.exit(0);
  } else {
    console.error(`[token-cascade] FAIL — ${totalMissing} unresolved var() reference(s) across ${files.length} stylesheets.`);
    console.error('  Fix by adding the missing alias to client/src/index.css :root shim or design-system/colors_and_type.css.');
    process.exit(1);
  }
}

main();
