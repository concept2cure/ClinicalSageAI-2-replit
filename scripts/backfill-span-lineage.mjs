#!/usr/bin/env node
/**
 * Backfill span lineage for one tenant's authoring sections.
 *
 * Dry-run unless --apply is passed. The dry run does the same analysis and
 * writes nothing, so the report below can be read and argued with before any
 * row is created.
 *
 * It attributes a section ONLY when doc_revisions proves who wrote the exact
 * text currently in it. Sections it cannot prove are listed as unattributable
 * and left alone — see the service module for why inventing an author is worse
 * than a visible gap.
 *
 * Usage:
 *   node scripts/backfill-span-lineage.mjs --org 42
 *   node scripts/backfill-span-lineage.mjs --org 42 --apply
 *   node scripts/backfill-span-lineage.mjs --org 42 --limit 500 --apply
 */

import process from 'node:process';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const orgId = Number(arg('org'));
const limit = Number(arg('limit', '200'));
const apply = process.argv.includes('--apply');

if (!Number.isInteger(orgId) || orgId <= 0) {
  console.error('Usage: node scripts/backfill-span-lineage.mjs --org <id> [--limit N] [--apply]');
  console.error('  --org is required and must be a positive integer (one tenant per run).');
  process.exit(2);
}

const { backfillSectionLineage } = await import(
  '../server/services/clinical-regulatory-evidence/span-lineage-backfill.ts'
);

console.log(
  `[backfill-span-lineage] org=${orgId} limit=${limit} mode=${apply ? 'APPLY' : 'dry-run'}`,
);

const r = await backfillSectionLineage(orgId, { apply, limit });

console.log('');
console.log(`  examined         ${r.examined}`);
console.log(`  attributed       ${r.attributed}  (${r.spansWritten} spans)`);
console.log(`  unattributable   ${r.unattributable}`);

if (r.unattributable > 0) {
  console.log('');
  console.log('  These sections have no revision proving who wrote their current text,');
  console.log('  so they were left without lineage rather than attributed to a guess.');
  console.log('  They will report "no recorded origin" until someone re-saves them:');
  for (const id of r.unattributableIds.slice(0, 20)) console.log(`    - ${id}`);
  if (r.unattributableIds.length > 20) {
    console.log(`    … and ${r.unattributableIds.length - 20} more`);
  }
}

console.log('');
if (!apply) {
  console.log('  Dry run — nothing was written. Re-run with --apply to write.');
} else {
  console.log('  Applied. Re-run to continue if `examined` equalled the limit.');
}

process.exit(0);
