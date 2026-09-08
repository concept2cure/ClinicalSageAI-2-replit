#!/usr/bin/env node
/**
 * Design-system compliance CI gate.
 *
 * Enforces a subset of the Concept2Cure design-system non-negotiables on the
 * design-system surfaces under client/src/concept2cure/ — the rules that are
 * unambiguous and currently at zero violations, so this gate purely prevents
 * regression (no baseline needed):
 *
 *   1. Lucide icons only — no other icon library may be imported.
 *   2. 200ms ease-out motion — no Framer Motion spring/bounce (overshoot).
 *
 * Out of scope (documented in PRODUCT_QC_REVIEW for a designer-owned follow-up,
 * because they need a baseline / token decisions, not a regression guard):
 *   - hardcoded hex literals that should be tokens (token-cascade gate already
 *     covers the var() side; ~500 hex across the surface mix definitions and
 *     values and need per-occurrence design judgement);
 *   - emoji / exclamation / Title-Case copy review.
 *
 * Scope: all of client/src/concept2cure/ (no legacy carve-out).
 *
 * Exit codes: 0 = clean, 1 = violations found.
 * Usage:
 *   node scripts/ci/check-design-system-compliance.mjs          # gate
 *   node scripts/ci/check-design-system-compliance.mjs --json   # machine output
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const SURFACE = path.join(ROOT, 'client', 'src', 'concept2cure');

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');

// Out-of-scope subpaths (relative to SURFACE). None — the whole surface is enforced.
const EXCLUDED_PREFIXES = [];

const RULES = [
  {
    id: 'icon-library',
    description: 'Lucide icons only — no other icon library may be imported',
    // import ... from 'react-icons' | '@heroicons/*' | '@mui/icons-material' | 'phosphor-react' | '@fortawesome/*' | '@tabler/icons-react'
    re: /\bfrom\s+['"](?:react-icons|@heroicons\/|@mui\/icons|phosphor-react|phosphor-icons|@fortawesome\/|@tabler\/icons)/,
    exts: ['.tsx', '.jsx', '.ts'],
  },
  {
    id: 'motion-spring',
    description: '200ms ease-out motion — no spring/bounce (overshoot forbidden)',
    re: /\btype:\s*['"]spring['"]|\bbounce:\s*(?:true|[0-9])/,
    exts: ['.tsx', '.jsx'],
  },
  {
    id: 'inline-style-element',
    description:
      'Styles live in stylesheets — no <style> element rendered from a component. ' +
      'An inline block is invisible to the class-coverage, token-cascade and contrast gates ' +
      '(three components carried 90 rules that way, every value with a hex fallback beside its token — ledger L139)',
    re: /<style(?:\s[^>]*)?>\s*\{/,
    exts: ['.tsx', '.jsx'],
  },
];

/** Recursively collect files under dir with the given extensions, honoring exclusions. */
function collect(dir, exts, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(SURFACE, full);
    if (EXCLUDED_PREFIXES.some(p => rel === p || rel.startsWith(p + path.sep))) continue;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collect(full, exts, acc);
    } else if (exts.includes(path.extname(entry.name))) {
      acc.push(full);
    }
  }
  return acc;
}

const violations = [];
for (const rule of RULES) {
  for (const file of collect(SURFACE, rule.exts)) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, i) => {
      if (rule.re.test(line)) {
        violations.push({
          rule: rule.id,
          description: rule.description,
          file: path.relative(ROOT, file),
          line: i + 1,
          excerpt: line.trim().slice(0, 120),
        });
      }
    });
  }
}

if (jsonOut) {
  console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
} else if (violations.length === 0) {
  console.log('[design-system] OK — no icon-library, spring/bounce or inline <style> violations on live concept2cure surfaces.');
} else {
  console.error(`[design-system] FAIL — ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}] ${v.description}`);
    console.error(`    ${v.excerpt}`);
  }
  console.error('\nDesign-system non-negotiables: Lucide icons only; 200ms ease-out motion (no spring/bounce).');
}

process.exit(violations.length === 0 ? 0 : 1);
