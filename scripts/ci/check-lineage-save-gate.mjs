#!/usr/bin/env node
/**
 * Guard: content-writing paths must not persist text without its lineage.
 *
 * WHY A CI CHECK AND NOT ONLY A TEST
 * The gate is a few lines in a 6,000-line router. A refactor that moves the
 * UPDATE, an "optimisation" that drops the transaction, or a merge that takes
 * the wrong side of a conflict all remove it silently — and nothing fails,
 * because saves keep working. That is exactly the failure this system exists to
 * prevent: the loss is invisible until an inspector asks where a sentence came
 * from and the answer is missing for the period after the gate was removed.
 *
 * So the shape is asserted structurally. For every guarded write path this
 * requires, in the same file:
 *
 *   1. a transaction (pool.connect + BEGIN/COMMIT/ROLLBACK)
 *   2. the lineage write enlisted in it (replaceAuthorSpans)
 *   3. the coverage assertion (assertLineageCoversContent)
 *
 * A path that legitimately does not write prose can be removed from GUARDED,
 * which is a visible, reviewable change rather than a silent one.
 *
 * Usage: node scripts/ci/check-lineage-save-gate.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * Write paths that persist authored prose and must therefore gate on lineage.
 *
 * Add a surface here when it starts writing document text. The list is the
 * enforcement perimeter — a surface absent from it is unguarded by definition,
 * so absence should be a deliberate, reviewed choice.
 */
const GUARDED = [
  {
    file: 'server/routes/authoring.router.ts',
    why: 'PATCH /sections/:sectionId writes authored section content',
  },
];

/**
 * The argument list of `name(...)`, found by matching parentheses.
 *
 * A regex cannot do this: a lazy `[\s\S]{0,N}?` scanning for a trailing
 * argument happily runs past the call's own closing paren and matches the
 * argument of a LATER call, so a check written that way passes after the thing
 * it guards has been removed. That exact false pass was observed while building
 * this script, which is why it counts parens instead.
 */
function callArgs(src, name) {
  const out = [];
  const needle = `${name}(`;
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at === -1) return out;
    let depth = 0;
    let end = -1;
    for (let i = at + needle.length - 1; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) return out;
    out.push(src.slice(at + needle.length, end));
    from = end + 1;
  }
}

/** Whether some call to `name` passes `client` as its final argument. */
function passesClient(src, name) {
  return callArgs(src, name).some((args) => {
    // Split only at top-level commas so object literals do not confuse the tail.
    let depth = 0;
    let last = '';
    for (const ch of args) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) last = '';
      else last += ch;
    }
    return last.trim() === 'client';
  });
}

const REQUIRED = [
  {
    id: 'transaction',
    test: (src) =>
      src.includes('pool.connect()') &&
      src.includes("client.query('BEGIN')") &&
      src.includes("client.query('COMMIT')") &&
      src.includes("client.query('ROLLBACK')"),
    message:
      'no transaction around the content write — content and lineage must commit together, ' +
      'or a failed lineage write leaves saved text with no provenance',
  },
  {
    id: 'lineage-write',
    test: (src) => /replaceAuthorSpans\s*\(/.test(src),
    message:
      'no call to replaceAuthorSpans — nothing records where the saved text came from',
  },
  {
    id: 'lineage-enlisted',
    test: (src) => passesClient(src, 'replaceAuthorSpans'),
    message:
      'replaceAuthorSpans is not passed the transaction client — lineage written on the pool ' +
      'is a separate commit that can fail on its own',
  },
  {
    id: 'coverage-gate',
    test: (src) => /assertLineageCoversContent\s*\(/.test(src),
    message:
      'no call to assertLineageCoversContent — nothing verifies the lineage actually covers ' +
      'the content before it commits',
  },
  {
    id: 'gate-enlisted',
    test: (src) => passesClient(src, 'assertLineageCoversContent'),
    message:
      'assertLineageCoversContent is not passed the transaction client — it would read ' +
      'committed state and miss what this save is about to write',
  },
];

let failures = 0;

for (const target of GUARDED) {
  const abs = path.join(ROOT, target.file);
  if (!fs.existsSync(abs)) {
    console.error(`[ci:lineage-save-gate] MISSING FILE ${target.file}`);
    console.error(`  It is listed as a guarded write path. If it moved, update GUARDED.`);
    failures++;
    continue;
  }

  const src = fs.readFileSync(abs, 'utf8');
  const missing = REQUIRED.filter((r) => !r.test(src));

  if (missing.length === 0) {
    console.log(`[ci:lineage-save-gate] ok  ${target.file}`);
    continue;
  }

  failures++;
  console.error(`\n[ci:lineage-save-gate] FAIL ${target.file}`);
  console.error(`  ${target.why}`);
  for (const m of missing) {
    console.error(`  ✗ ${m.id}: ${m.message}`);
  }
}

if (failures > 0) {
  console.error(
    `\n[ci:lineage-save-gate] ${failures} guarded path(s) no longer enforce lineage on save.\n` +
      `Documents saved through them would carry no record of where their text came from,\n` +
      `and nothing at runtime would report it. Restore the gate, or — if the path genuinely\n` +
      `no longer writes prose — remove it from GUARDED in this script with a reason.\n`,
  );
  process.exit(1);
}

console.log(`[ci:lineage-save-gate] OK — ${GUARDED.length} guarded path(s) enforce lineage on save.`);
