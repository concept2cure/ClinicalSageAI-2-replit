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

const kits = fs
  .readdirSync(KITS_DIR)
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
