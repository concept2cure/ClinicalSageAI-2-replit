#!/usr/bin/env node
/**
 * ci:canonicalizers — hold the number of deterministic JSON serializers.
 *
 * A canonicalizer is a function that sorts an object's keys and serializes the
 * result, so that equal content hashes equally. The codebase had nine of them
 * (ledger L46) and they do not agree: one mapped `null` to the empty string and
 * therefore emitted output that is not valid JSON, another wrote an explicit
 * `null` for a key that others dropped. Nothing was mismatched at the time only
 * because each write path and its verify path happened to use the same copy —
 * that is agreement by coincidence, and it is one careless edit away from a
 * chain that no longer verifies.
 *
 * The other gates in this directory catch a module nothing imports, or a model
 * call outside the gateway. None of them asks whether a small load-bearing
 * helper exists twice, which is exactly where that defect class lives. This one
 * asks.
 *
 * Policy: the baseline may only shrink. Re-point a call site at
 * `shared/canonical-json.ts` and regenerate — but read that module's migration
 * note first, because changing a call site's serializer changes the digests it
 * produces, and any stored hash written by the old copy stops reproducing.
 * Adding an entry by hand is a regression, not a fix.
 *
 * Usage:
 *   node scripts/ci/check-canonicalizers.mjs
 *   node scripts/ci/check-canonicalizers.mjs --write-baseline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselinePath = path.join(repoRoot, 'scripts', 'ci', 'canonicalizers-baseline.json');

/** The canonical module itself, and this guard, are allowed to look like one. */
const EXEMPT = new Set([
  'shared/canonical-json.ts',
  'scripts/ci/check-canonicalizers.mjs',
  'scripts/ci/canonicalizers-baseline.json',
]);

/**
 * A canonicalizer is recognized by shape, not by name — the nine copies were
 * called `stableStringify`, `canonicalizeObject`, `canonicalizeReport` and
 * `sortObjectKeys`, so a name list would have missed some and would miss the
 * tenth. The shape is: sort the keys of an object, then serialize.
 */
function findCanonicalizers(source) {
  const hits = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/Object\.keys\s*\([^)]*\)\s*\.sort\s*\(/.test(lines[i])) continue;
    // Serialization within a short window of the sort — the two halves of the
    // shape. A sort with no serialization nearby is ordinary key iteration.
    const window = lines.slice(Math.max(0, i - 12), i + 14).join('\n');
    if (/JSON\.stringify|['"`]\{['"`]|join\s*\(\s*['"`],['"`]\s*\)/.test(window)) {
      hits.push(i + 1);
    }
  }
  return hits;
}

function trackedSourceFiles() {
  const out = execSync("git ls-files -- 'server/**/*.ts' 'shared/**/*.ts' 'client/**/*.ts' 'client/**/*.tsx'", {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter(Boolean)
    .filter(f => !f.includes('__tests__') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .filter(f => !EXEMPT.has(f));
}

const found = [];
for (const rel of trackedSourceFiles()) {
  let src;
  try {
    src = readFileSync(path.join(repoRoot, rel), 'utf8');
  } catch {
    continue;
  }
  const lineNos = findCanonicalizers(src);
  if (lineNos.length > 0) found.push(rel);
}
found.sort();

if (process.argv.includes('--write-baseline')) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        $comment:
          'Modules defining their own deterministic JSON serializer instead of importing shared/canonical-json.ts. This list may only shrink. Re-point the call site, then regenerate with npm run ci:canonicalizers:write-baseline — but read the migration note in shared/canonical-json.ts first: changing a call site\'s serializer changes the digests it produces, so any stored hash written by the old copy stops reproducing. Adding an entry by hand is a regression, not a fix.',
        generatedBy: 'scripts/ci/check-canonicalizers.mjs --write-baseline',
        count: found.length,
        modules: found,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Wrote ${found.length} local canonicalizer(s) to scripts/ci/canonicalizers-baseline.json`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const allowed = new Set(baseline.modules ?? []);

console.log(`Local canonicalizers: ${found.length} (baseline ${allowed.size})`);

const added = found.filter(f => !allowed.has(f));
const removed = [...allowed].filter(f => !found.includes(f));

if (removed.length > 0) {
  console.log(`\n${removed.length} baselined module(s) no longer define one — regenerate the baseline:`);
  for (const f of removed) console.log(`  - ${f}`);
}

if (added.length > 0) {
  console.error(
    `\nFAIL: ${added.length} new deterministic JSON serializer(s). Import { stableStringify } from shared/canonical-json.ts instead:`,
  );
  for (const f of added) console.error(`  - ${f}`);
  console.error(
    '\nA second canonicalizer is a second answer to "what does this content hash to".',
  );
  process.exit(1);
}

console.log('\nOK: no new canonicalizers.');
