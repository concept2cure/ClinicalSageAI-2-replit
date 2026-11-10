#!/usr/bin/env node
/**
 * CI gate: the code sites that may UPDATE vault.documents are named.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * VR-06 (docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md, row D5) put a row
 * trigger on vault.documents
 * (migrations/20260926_vault_documents_record_immutability.sql): a version's
 * identity, bytes pointer, hash and lineage cannot change, whatever the path.
 * The trigger leaves the record's mutable state (title, type, classification,
 * filing, processing) to the code that writes it, and each of those writers
 * records its change in the chained audit trail. A NEW writer of those columns
 * would pass the trigger and could write with no audit row and no reason. This
 * gate makes a new writer a reviewed decision: every file outside tests that
 * issues `UPDATE vault.documents` must be listed below with the reason it may.
 *
 * A listed file that no longer writes the table is a finding too, so the list
 * cannot drift into pre-approving a file nobody reviewed.
 *
 * ── The bytes (added 2026-11-10; P-107 item 3, retention FD3 (c)) ────────────
 * "No version is destroyed during a tenant's life; retention may only
 * tombstone." The database half holds: the record guard refuses a delete or a
 * re-pointed version, and the retention sweep tombstones. The bytes sit outside
 * the database, in the byte store (server/services/storage/storage-provider.ts),
 * and nothing named who may delete them there. A new caller of the store's
 * `delete` could destroy a recorded version's file and leave its record
 * pointing at nothing, with every database control passing.
 *
 * So the files that can delete stored bytes are named too: every non-test file
 * that calls a `delete` with a version and an organization (the store's
 * signature), or sends an S3 delete. Each entry says why the bytes it deletes
 * are not a recorded version's, or under which ceremony they go. What this
 * cannot see: a file removed from the local store's directory with `fs`
 * directly. The local provider's own `delete` is reached only through the
 * callers named here.
 *
 * Usage: node scripts/ci/check-vault-document-writers.mjs [--root <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The named writers, each with what it writes and where that is recorded. */
export const ALLOWED_WRITERS = new Map([
  ['server/services/vault/vault-ingest.service.ts',
    "the same-bytes retry (ON CONFLICT DO UPDATE): processing state, write-once fields NULL → value, a legacy record's storage adoption; its changes are a chained vault.document.reupload row"],
  ['server/services/vault/vault-placement.service.ts',
    'filing (folder, evidence kind, CTD section, placement): chained vault.document.file row with from/to'],
  ['server/services/vault/vault-metadata-edit.service.ts',
    'Edit details (title, type, classification) with a reason: chained vault.document.metadata_edit row'],
  ['server/services/vault/storage-migration.service.ts',
    "storage adoption: a record with no storage handle takes one, hash unchanged; audited by the migration's own report"],
  ['server/services/authoring/authoring-file-to-vault.ts',
    'compensation soft delete (deleted_at NULL → now) of a filing whose authoring half failed: chained authoring.document.file_to_vault.reverted row'],
  ['server/jobs/retentionCron.ts',
    'retention soft delete (deleted_at NULL → now) after archiving: chained retention audit row'],
  ['server/jobs/vaultProcessingSweep.ts',
    "a pending version's text read after upload (extracted_text, word_count, page_count NULL → value; MR-08 Stage 3): chained vault.document.extracted row in the same transaction"],
]);

/** The named deleters of stored bytes, each with which bytes and why they are not a recorded version's. */
export const ALLOWED_BYTE_DELETERS = new Map([
  ['server/services/vault/vault-ingest-discard.ts',
    'the bytes of an upload the Vault refused or failed to record: deleted only after the database says no record points at the version, and kept when that cannot be answered'],
  ['server/services/tenant/tenant-offboarding.ts',
    "a tenant's bytes at offboarding, each from the store it was saved in, after the purge has committed and never before: the one ceremony that ends a tenant's records"],
  ['server/routes/moduleIntegrationRoutes.ts',
    "compensation: an attachment's bytes whose record was not written"],
  ['server/services/ectd/rendered-leaf-files.ts',
    "compensation: a rendered leaf's bytes whose row was not inserted, so nothing could find them"],
  ['server/services/ai-gateway/providers/org-placement-writer.ts',
    "compensation: an encrypted derivative's object whose custody change rolled back; kept when the commit's outcome is unknown"],
  ['server/services/ana/upload-object-store.ts',
    "compensation: an AnA upload's object whose rows were never committed"],
  ['server/services/storage/s3-provider.ts',
    "the S3 byte store's own delete, reached only through the callers named here; it refuses another organization's object"],
  ['server/services/submission-bundle-storage.ts',
    'a bundle zip that was never stored on its package (an assembly discarded while it was built); a stored bundle is the record and is never deleted'],
  ['server/services/s3-storage.ts',
    "deleteDocument of the earlier evidence-store helper (S3_VAULT_BUCKET, vault-raw, vault-processed and vault-redacted keys); it has no caller"],
  ['server/services/anthropic-files.ts',
    "not the byte store: the copy of a file this platform uploaded to the model provider's Files API, removed there"],
]);

const SCAN_DIRS = ['server', 'scripts'];
const EXT = /\.(ts|tsx|js|mjs|cjs)$/;
const EXCLUDED = /(__tests__|\.test\.|\.spec\.|\.dbtest\.|\.selftest\.|node_modules|\/dist\/)/;
const WRITE = /\bUPDATE\s+vault\.documents\b/i;
// An ingestion retry mutates the existing version through ON CONFLICT. Keep
// that writer reviewed even when its comments no longer spell out UPDATE.
// Stop at SQL/JS statement or template boundaries, so an unrelated later
// query's conflict clause cannot turn an insert into an update writer.
const UPSERT = /\bINSERT\s+INTO\s+vault\.documents\b[^;`]*\bON\s+CONFLICT\b[^;`]*\bDO\s+UPDATE\b/i;
// The byte store deletes by version and organization: `delete(vaultVersionId, orgId)`. A call of a `delete` with
// two or more arguments whose first is not a string literal is that signature. A Map, Set or cache `delete(key)`
// takes one; a route registration (`router.delete('/path', handler)`) starts with a string.
const STORE_DELETE = /\.delete\((?!\s*['"`])\s*[^(),]+(?:\([^()]*\))?[^(),]*,\s*[^\s)]/;
// A file that sends an S3 delete removes an object whatever interface it sits behind.
const S3_DELETE = /\bDeleteObjects?Command\b/;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every non-test file under root whose source matches, repo-relative. */
function findFiles(root, matches) {
  const files = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), files);
  return files
    .map((f) => path.relative(root, f).split(path.sep).join('/'))
    // The gate and its selftest name the statements they look for; they write and delete nothing.
    .filter((rel) => !EXCLUDED.test(rel) && !rel.startsWith('scripts/ci/check-vault-document-writers'))
    .filter((rel) => matches(fs.readFileSync(path.join(root, rel), 'utf8')))
    .sort();
}

/** Every non-test file under root that writes vault.documents, repo-relative. */
export function findWriters(root) {
  return findFiles(root, (source) => WRITE.test(source) || UPSERT.test(source));
}

/** Every non-test file under root that can delete stored bytes, repo-relative. */
export function findByteDeleters(root) {
  return findFiles(root, (source) => STORE_DELETE.test(source) || S3_DELETE.test(source));
}

/** The findings: unnamed writers, and named writers that no longer write. */
export function evaluate(writers, allowed = ALLOWED_WRITERS) {
  const unnamed = writers.filter((w) => !allowed.has(w));
  const stale = [...allowed.keys()].filter((a) => !writers.includes(a));
  return { unnamed, stale };
}

function main() {
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? path.resolve(process.argv[i + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const writers = findWriters(root);
  const deleters = findByteDeleters(root);
  const records = evaluate(writers);
  const bytes = evaluate(deleters, ALLOWED_BYTE_DELETERS);
  console.log(`[ci:vault-document-writers] ${writers.length} file(s) write vault.documents; ${ALLOWED_WRITERS.size} named.`);
  console.log(`[ci:vault-document-writers] ${deleters.length} file(s) can delete stored bytes; ${ALLOWED_BYTE_DELETERS.size} named.`);
  const recordsWrong = records.unnamed.length + records.stale.length > 0;
  const bytesWrong = bytes.unnamed.length + bytes.stale.length > 0;
  if (!recordsWrong && !bytesWrong) {
    console.log('[ci:vault-document-writers] OK: every writer and every deleter of stored bytes is a named one.');
    return 0;
  }
  for (const f of records.unnamed) {
    console.error(`  ✗ ${f} issues UPDATE vault.documents and is not a named writer.`);
  }
  for (const f of records.stale) {
    console.error(`  ✗ ${f} is named as a writer but no longer writes vault.documents; remove it from ALLOWED_WRITERS.`);
  }
  for (const f of bytes.unnamed) {
    console.error(`  ✗ ${f} can delete stored bytes (a store delete by version and organization, or an S3 delete) and is not a named deleter.`);
  }
  for (const f of bytes.stale) {
    console.error(`  ✗ ${f} is named as a deleter of stored bytes but no longer deletes any; remove it from ALLOWED_BYTE_DELETERS.`);
  }
  if (recordsWrong) {
    console.error(
      '\n  A writer of vault.documents changes a recorded Vault version. The record guard\n' +
        '  (migrations/20260926_vault_documents_record_immutability.sql) stops identity, hash and\n' +
        "  lineage changes; everything else is up to the writer, which must record its change in\n" +
        '  the chained audit trail. Route the change through a named writer, or add this file to\n' +
        '  ALLOWED_WRITERS with what it writes and where that is recorded.',
    );
  }
  if (bytesWrong) {
    console.error(
      '\n  No version is destroyed during a tenant\'s life (P-107 item 3, retention FD3 (c)): retention\n' +
        '  tombstones the record and keeps the bytes. The byte store sits outside the database, so a\n' +
        '  delete there passes every database control. Do not delete a recorded version\'s bytes. For\n' +
        '  bytes that no record names, add this file to ALLOWED_BYTE_DELETERS with which bytes it\n' +
        '  deletes and why they are not a recorded version\'s.',
    );
  }
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
