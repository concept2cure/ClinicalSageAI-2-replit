#!/usr/bin/env node
/**
 * Backfill the vault passage index for one tenant's un-chunked documents.
 *
 * Chunking runs at ingest, so documents uploaded before `ana.vault_chunking`
 * was enabled for the tenant sit outside passage retrieval. This sweep indexes
 * them through the same writer the ingest path uses.
 *
 * Dry-run unless --apply is passed. The dry run lists what would be indexed and
 * what cannot be, and spends nothing on embeddings, so the report below can be
 * read and argued with before any row is written.
 *
 * Resumable: anything already indexed drops out of the candidate set, so a
 * rerun continues the backlog. Documents whose extraction failed are reported
 * as skipped with that reason and are never counted as done — only re-ingesting
 * them can make them indexable.
 *
 * Usage:
 *   node scripts/backfill-vault-chunks.mjs --org 42
 *   node scripts/backfill-vault-chunks.mjs --org 42 --apply
 *   node scripts/backfill-vault-chunks.mjs --org 42 --limit 200 --apply
 *   node scripts/backfill-vault-chunks.mjs --org 42 --retry-failed --apply
 */

import process from 'node:process';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const orgId = Number(arg('org'));
const limit = Number(arg('limit', '50'));
const apply = process.argv.includes('--apply');
const retryFailed = process.argv.includes('--retry-failed');

if (!Number.isInteger(orgId) || orgId <= 0) {
  console.error('Usage: node scripts/backfill-vault-chunks.mjs --org <id> [--limit N] [--retry-failed] [--apply]');
  console.error('  --org is required and must be a positive integer (one tenant per run).');
  process.exit(2);
}

const { backfillVaultChunks } = await import(
  '../server/services/vault/document-chunking-backfill.service.ts'
);

console.log(
  `[backfill-vault-chunks] org=${orgId} limit=${limit} retryFailed=${retryFailed} mode=${apply ? 'APPLY' : 'dry-run'}`,
);

const r = await backfillVaultChunks(orgId, { apply, limit, retryFailed });

console.log('');
console.log(`  examined         ${r.examined}`);
console.log(`  indexed          ${r.indexed}  (${r.chunksWritten} chunks)`);
console.log(`  skipped          ${r.skipped.length}`);
console.log(`  failed           ${r.failed.length}`);

if (r.skipped.length > 0) {
  console.log('');
  console.log('  These documents have no text to index. Chunking cannot fix that —');
  console.log('  re-ingest them so extraction (and OCR, for scans) runs again:');
  for (const s of r.skipped.slice(0, 20)) {
    console.log(`    - ${s.fileName ?? s.documentId}: ${s.reason}`);
  }
  if (r.skipped.length > 20) console.log(`    … and ${r.skipped.length - 20} more`);
}

if (r.failed.length > 0) {
  console.log('');
  console.log('  These were indexable but failed; each carries chunk_failed and its');
  console.log('  reason on the catalog ledger, and --retry-failed picks them up again:');
  for (const f of r.failed.slice(0, 20)) {
    console.log(`    - ${f.fileName ?? f.documentId}: ${f.reason}`);
  }
  if (r.failed.length > 20) console.log(`    … and ${r.failed.length - 20} more`);
}

console.log('');
if (!apply) {
  console.log('  Dry run — nothing was written and no embeddings were spent.');
  console.log('  Re-run with --apply to index.');
} else {
  console.log('  Applied. Re-run to continue if `examined` equalled the limit.');
}

process.exit(0);
