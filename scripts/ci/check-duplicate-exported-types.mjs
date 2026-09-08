#!/usr/bin/env node
/**
 * ci:duplicate-exported-types — hold the number of exported type names that
 * mean more than one thing.
 *
 * ── Why this gate exists ─────────────────────────────────────────────────────
 * Ledger L50 recorded "two document-template registries, one of which calls
 * itself canonical". There were four. `DocumentTemplate` was exported by
 * `intelligence/template-registry.ts` (DB-backed resolution — WHICH template),
 * `docx/templateRegistry.ts` (static DOCX blueprints — what it LOOKS LIKE),
 * `regulatory/templateCatalog.ts` (metadata — which are OFFERED) and
 * `ana-ri/document-actions.ts` (a quick-action heading outline). Four shapes,
 * one name, and a docstring asserting canonicality that the file next to it
 * falsified.
 *
 * This is the same defect class L47 hit from the other side: there, two modules
 * exported `generateStructuredResponse` and `analyzeText` with OPPOSITE
 * governance, and which one an import resolved to was decided by directory
 * depth. A shared name is not a naming preference — it is how a reader, and a
 * `grep`, end up at the wrong module and never learn it.
 *
 * The sibling gates ask whether a module is unimported, whether a model call
 * escapes the gateway, whether a canonicalizer exists twice. None of them asks
 * whether a TYPE means two things. This one asks.
 *
 * ── Policy ───────────────────────────────────────────────────────────────────
 * The baseline may only SHRINK. Resolving a collision means giving each module's
 * type the name of what it actually is — not aliasing, and not moving one out of
 * scope. Regenerate with --write-baseline only after a real reduction; adding an
 * entry by hand is a regression, not a fix.
 *
 * Scope is `server/services/**` deliberately: that is where the collisions with
 * consequences live (governance, resolution, provenance), and a repo-wide sweep
 * would drown the signal in DTO shapes that legitimately repeat per boundary.
 *
 * Usage:
 *   node scripts/ci/check-duplicate-exported-types.mjs
 *   node scripts/ci/check-duplicate-exported-types.mjs --write-baseline
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_ROOT = path.join(repoRoot, 'server', 'services');
const baselinePath = path.join(repoRoot, 'scripts', 'ci', 'duplicate-exported-types-baseline.json');

/** `export interface X` / `export type X` at a line start — declarations, not re-exports. */
const DECL = /^export (?:interface|type) ([A-Za-z_][A-Za-z0-9_]*)/gm;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(p, out);
    } else if (/\.ts$/.test(entry) && !/\.(test|spec)\.ts$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

function collisions() {
  const byName = new Map();
  for (const file of walk(SCAN_ROOT)) {
    const rel = path.relative(repoRoot, file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(DECL)) {
      const name = m[1];
      if (!byName.has(name)) byName.set(name, new Set());
      byName.get(name).add(rel);
    }
  }
  const out = {};
  for (const [name, files] of byName) {
    if (files.size > 1) out[name] = [...files].sort();
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

const current = collisions();
const currentNames = Object.keys(current);

if (process.argv.includes('--write-baseline')) {
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        $comment:
          'Exported type names declared in more than one module under server/services. ' +
          'A shared name is how a reader, and a grep, end up at the wrong module and never learn it. ' +
          'This list may only SHRINK: rename each module\'s type to what it actually is, then regenerate ' +
          'with npm run ci:duplicate-exported-types:write-baseline. Adding an entry by hand is a regression.',
        generatedBy: 'scripts/ci/check-duplicate-exported-types.mjs --write-baseline',
        count: currentNames.length,
        names: currentNames,
      },
      null,
      2
    ) + '\n'
  );
  console.info(`[ci:duplicate-exported-types] baseline written — ${currentNames.length} colliding name(s).`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const baselined = new Set(baseline.names);
const added = currentNames.filter((n) => !baselined.has(n));

if (added.length > 0) {
  console.error(
    `\n🚫 [ci:duplicate-exported-types] ${added.length} NEW exported type name(s) now mean more than one thing:\n`
  );
  for (const name of added) {
    console.error(`  ${name}`);
    for (const f of current[name]) console.error(`      ${f}`);
  }
  console.error(
    '\nGive each module\'s type the name of what it actually is. A reader who greps the noun\n' +
      'must land on the module that owns it — that is the difference between a canonical\n' +
      'claim and a canonical fact.\n'
  );
  process.exit(1);
}

if (currentNames.length > baseline.count) {
  console.error(
    `\n🚫 [ci:duplicate-exported-types] count rose ${baseline.count} → ${currentNames.length}.\n`
  );
  process.exit(1);
}

console.info(
  `[ci:duplicate-exported-types] OK — ${currentNames.length} colliding name(s), baseline ${baseline.count} (shrink-only).`
);
