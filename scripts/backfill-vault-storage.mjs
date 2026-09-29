#!/usr/bin/env node
/**
 * Move one tenant's vault bytes onto the canonical storage provider.
 *
 * Vault ingest used to write bytes to uploads/vault/{programId}/{hash} and keep
 * that relative path in s3_key, bypassing server/services/storage/. It writes
 * through the provider now, but NO BYTES WERE MOVED when that changed — the
 * read path is a dual read, so older rows keep working by path. This sweep is
 * what lets them join the new path, which is what the eCTD packager can fetch.
 *
 * Dry-run unless --apply. The dry run does the same reads and the same hash
 * verification and writes nothing, so the report can be read and argued with
 * before a byte moves.
 *
 * A document is migrated only when the bytes on disk hash to the value the
 * record already claims. Mismatches and missing files are reported and left
 * alone — never counted as done. The old file is NEVER deleted; reclaiming it
 * is a separate decision.
 *
 * Resumable: rows that already carry a storage_version_id are not candidates,
 * so a rerun continues a partial run and a second full run finds nothing.
 *
 * Usage (tsx, because it imports the server's TypeScript):
 *   npm run db:backfill-vault-storage -- --org 42
 *   npm run db:backfill-vault-storage -- --org 42 --apply
 *   npm run db:backfill-vault-storage -- --org 42 --limit 200 --apply
 */
import process from 'node:process';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const orgId = Number(arg('org'));
const limit = Number(arg('limit', '50'));
const apply = process.argv.includes('--apply');

if (!Number.isInteger(orgId) || orgId <= 0) {
  console.error('Usage: npm run db:backfill-vault-storage -- --org <id> [--limit N] [--apply]');
  console.error('  --org is required and must be a positive integer (one tenant per run).');
  process.exit(2);
}

/* Imported AFTER the argument check, so a usage error needs no database.
   The paths are the ones tsx resolves (`.js` → the `.ts` source), as in
   scripts/tenant-storage-report.ts. This first shipped importing
   '../server/db/index.ts' — a module that has never existed — so the script
   could not start at all, and the service's own tests stayed green because
   they never ran this entry point. server/services/vault/__tests__/
   backfill-vault-storage-cli.test.ts runs it now. */
const { pool } = await import('../server/db.js');
const { getStorageProvider } = await import('../server/services/storage/index.js');
const { migrateVaultStorage } = await import('../server/services/vault/storage-migration.service.js');

/* Prove the database is there before examining anything. server/db.js's
   `pool` is a lazy proxy — never null, so a null check cannot see a missing
   database; the first use throws "Database connection not available" instead.
   Use it once, and say what that means rather than printing a stack trace. */
try {
  await pool.query('SELECT 1');
} catch (err) {
  const why = /Database connection not available/.test(String(err?.message ?? err))
    ? 'No database is configured (DATABASE_URL / APP_DATABASE_URL, or .env.local / .env in the working directory).'
    : `The database could not be reached: ${err?.message ?? err}`;
  console.error(`[backfill-vault-storage] ${why} Nothing was examined.`);
  process.exit(1);
}

console.log(`[backfill-vault-storage] org=${orgId} limit=${limit} mode=${apply ? 'APPLY' : 'dry-run'}`);

let r;
try {
  r = await migrateVaultStorage(pool, getStorageProvider(), {
    organizationId: orgId,
    apply,
    limit,
  });
} catch (err) {
  if (err && err.code === '42P01') {
    console.error('');
    console.error('  vault.documents is not on this database, or it has no storage_version_id');
    console.error('  column. Apply migrations/20260917_vault_documents_storage_version.sql');
    console.error('  first; nothing was examined.');
    process.exit(1);
  }
  throw err;
}

const verb = apply ? 'migrated' : 'would migrate';
console.log('');
console.log(`  examined ${r.examined} path-addressed document(s)`);
console.log(`  ${verb} ${r.migrated}`);
if (r.migratedUnverified > 0) {
  console.log(`    of which ${r.migratedUnverified} had NO recorded hash to check against —`);
  console.log('    moved, but nothing proved the bytes are the ones the record means.');
}

if (r.skipped.length > 0) {
  const by = new Map();
  for (const s of r.skipped) by.set(s.reason, [...(by.get(s.reason) ?? []), s]);
  console.log('');
  console.log(`  ${r.skipped.length} left alone:`);
  const why = {
    hash_mismatch:
      'bytes on disk do not match the hash the record claims — copying them would launder the contradiction into a clean-looking new record',
    bytes_missing: 'the file the row points at is not there — a real problem, kept visible as one',
    no_storage_key: 'the row carries no storage key at all',
    key_escapes_root: 'the storage key resolves outside the uploads root and was not followed',
    unattributed: 'the program does not resolve to an organization, so there is no tenant to store under',
  };
  for (const [reason, rows] of by) {
    console.log(`    ${reason} (${rows.length}) — ${why[reason] ?? 'see the service'}`);
    for (const s of rows.slice(0, 10)) {
      console.log(`      - ${s.documentId}${s.detail ? `: ${s.detail}` : ''}`);
    }
    if (rows.length > 10) console.log(`      … and ${rows.length - 10} more`);
  }
}

console.log('');
if (!apply) {
  console.log('  Dry run — nothing was written. Re-run with --apply to move the bytes.');
} else {
  console.log('  The original files were NOT deleted. Reclaiming them is a separate decision.');
}

await pool.end?.();
