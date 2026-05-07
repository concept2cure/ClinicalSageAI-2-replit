#!/usr/bin/env node
/**
 * CI Guard: jwt.verify must pin the algorithm.
 *
 * The `jsonwebtoken` library's `verify(token, secret)` two-argument form
 * accepts ANY algorithm the token claims, including `none`. That's the
 * algorithm-confusion attack class (CVE-2015-9235 family): an attacker
 * can switch from HS256 to RS256 (mismatching key types) or send an
 * unsigned token with `alg: none` and have it pass.
 *
 * The fix is to always pass `{ algorithms: ['HS256'] }` (or whichever
 * algorithm the secret is for) as the third argument. This gate fails
 * the build if any new jwt.verify call appears without an algorithms
 * option in non-test code.
 *
 * Allowlist: tests are exempt because test fixtures occasionally need
 * to verify forged tokens to confirm the rejection path.
 *
 * Exit 0 — every production jwt.verify pins algorithms.
 * Exit 1 — at least one site missing algorithms pinning.
 *
 * Usage:
 *   node scripts/ci/check-jwt-verify-pinned.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const SCAN_ROOTS = [path.join(repoRoot, 'server'), path.join(repoRoot, 'client', 'src')];

function isTestPath(rel) {
  if (rel.includes('/__tests__/')) return true;
  if (rel.endsWith('.test.ts') || rel.endsWith('.test.js')) return true;
  if (rel.endsWith('.spec.ts') || rel.endsWith('.spec.js')) return true;
  if (rel.endsWith('.test.tsx')) return true;
  return false;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '_archive' ||
        entry.name === '_deprecated_migrations'
      ) continue;
      out.push(...walk(full));
    } else if (
      entry.isFile() &&
      (full.endsWith('.ts') || full.endsWith('.tsx') || full.endsWith('.js') || full.endsWith('.jsx'))
    ) {
      out.push(full);
    }
  }
  return out;
}

// Match a jwt.verify call that opens an argument list. We check whether
// the same call site mentions `algorithms` in a 200-char window after the
// opening paren. That's loose, but jwt.verify never spans more than ~200
// chars across its argument list in practice.
const VERIFY_OPEN = /\bjwt\.verify\s*\(/g;

const findings = [];

for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const rel = path.relative(repoRoot, file).replaceAll(path.sep, '/');
    if (isTestPath(rel)) continue;

    const text = fs.readFileSync(file, 'utf8');
    VERIFY_OPEN.lastIndex = 0;
    let m;
    while ((m = VERIFY_OPEN.exec(text)) !== null) {
      const window = text.slice(m.index, m.index + 400);
      if (/\balgorithms\b\s*:/.test(window)) continue;
      const lineNumber = text.slice(0, m.index).split('\n').length;
      const lineText = text.split('\n')[lineNumber - 1]?.trim().slice(0, 160) ?? '';
      findings.push({ file: rel, line: lineNumber, snippet: lineText });
    }
  }
}

if (findings.length === 0) {
  console.log(
    '[ci:jwt-verify-pinned] OK — every production jwt.verify call pins an algorithm'
  );
  process.exit(0);
}

console.error(
  `[ci:jwt-verify-pinned] FAIL — ${findings.length} jwt.verify call(s) missing algorithms pinning:\n`
);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.snippet}\n`);
}
console.error(
  'Fix: change `jwt.verify(token, secret)` to ' +
    "`jwt.verify(token, secret, { algorithms: ['HS256'] })` (or the correct algorithm). " +
    'Without this, the algorithm-confusion attack class (CVE-2015-9235) is exploitable.'
);
process.exit(1);
