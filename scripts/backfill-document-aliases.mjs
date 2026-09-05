#!/usr/bin/env node
/**
 * Backfill the document alias map for one tenant (ledger L10).
 *
 * Dry-run unless --apply is passed: the dry run does the same analysis and
 * writes nothing, so the report can be read before any row is created.
 *
 * It records an authoring document as its own identity, and a coauthor
 * snapshot under the authoring document its OWN metadata names — never a
 * guess. Rows with no recorded source, rows naming a document this tenant does
 * not have, and rows that would fork an identity are listed and left alone.
 *
 * Usage:
 *   node scripts/backfill-document-aliases.mjs --org 42
 *   node scripts/backfill-document-aliases.mjs --org 42 --apply
 */
import process from 'node:process';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const orgId = Number(arg('org'));
const apply = process.argv.includes('--apply');
if (!Number.isInteger(orgId) || orgId <= 0) {
  console.error('Usage: node scripts/backfill-document-aliases.mjs --org <id> [--apply]');
  console.error('  --org is required and must be a positive integer (one tenant per run).');
  process.exit(2);
}

const { pool } = await import('../server/db/index.ts');
const { backfillDocumentAliases } = await import('../server/services/c2c/document-alias-backfill.ts');

console.log(`[backfill-document-aliases] org=${orgId} mode=${apply ? 'APPLY' : 'dry-run'}`);
const r = await backfillDocumentAliases(pool, { organizationId: orgId, apply });
console.log('');
if (r.relationAbsent) {
  console.log('  c2c_document_aliases is not on this database. Apply');
  console.log('  migrations/20260814d_document_alias_map.sql first; nothing was examined.');
  process.exit(1);
}
const verb = apply ? 'recorded' : 'would record';
console.log(`  authoring documents  examined ${r.authoring.examined}, ${verb} ${r.authoring.toRecord}, already recorded ${r.authoring.alreadyRecorded}`);
console.log(`    bound c2c documents ${verb} ${r.authoring.boundToRecord}, already recorded ${r.authoring.boundAlreadyRecorded}`);
console.log(`  coauthor documents   examined ${r.coauthor.examined}, ${verb} ${r.coauthor.toRecord}, already recorded ${r.coauthor.alreadyRecorded}`);
console.log(`    no recorded source  ${r.coauthor.sourceless}  (left unaliased — an alias is a claim, not a guess)`);
if (r.coauthor.sourceMissing.length > 0) {
  console.log(`    source not in org   ${r.coauthor.sourceMissing.length}`);
  for (const m of r.coauthor.sourceMissing.slice(0, 20)) console.log(`      - coauthor ${m.coauthorId} names ${m.namedSource}`);
  if (r.coauthor.sourceMissing.length > 20) console.log(`      … and ${r.coauthor.sourceMissing.length - 20} more`);
}
if (r.forks.length > 0) {
  console.log('');
  console.log(`  ${r.forks.length} row(s) would fork an identity and were left alone:`);
  for (const f of r.forks.slice(0, 20)) console.log(`    - ${f.store} ${f.nativeId} → ${f.canonicalId}: ${f.message}`);
}
console.log('');
if (!apply) console.log('  Dry run — nothing was written. Re-run with --apply to write.');
await pool.end?.().catch(() => {});
process.exit(0);
