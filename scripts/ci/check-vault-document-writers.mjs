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
]);

const SCAN_DIRS = ['server', 'scripts'];
const EXT = /\.(ts|tsx|js|mjs|cjs)$/;
const EXCLUDED = /(__tests__|\.test\.|\.spec\.|\.dbtest\.|node_modules|\/dist\/)/;
const WRITE = /\bUPDATE\s+vault\.documents\b/i;

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

/** Every non-test file under root that writes vault.documents, repo-relative. */
export function findWriters(root) {
  const files = [];
  for (const d of SCAN_DIRS) walk(path.join(root, d), files);
  return files
    .map((f) => path.relative(root, f).split(path.sep).join('/'))
    // The gate and its selftest name the statement they look for; they write nothing.
    .filter((rel) => !EXCLUDED.test(rel) && !rel.startsWith('scripts/ci/check-vault-document-writers'))
    .filter((rel) => WRITE.test(fs.readFileSync(path.join(root, rel), 'utf8')))
    .sort();
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
  const { unnamed, stale } = evaluate(writers);
  console.log(`[ci:vault-document-writers] ${writers.length} file(s) write vault.documents; ${ALLOWED_WRITERS.size} named.`);
  if (unnamed.length === 0 && stale.length === 0) {
    console.log('[ci:vault-document-writers] OK: every writer is a named one.');
    return 0;
  }
  for (const f of unnamed) {
    console.error(`  ✗ ${f} issues UPDATE vault.documents and is not a named writer.`);
  }
  for (const f of stale) {
    console.error(`  ✗ ${f} is named as a writer but no longer writes vault.documents; remove it from ALLOWED_WRITERS.`);
  }
  console.error(
    '\n  A writer of vault.documents changes a recorded Vault version. The record guard\n' +
      '  (migrations/20260926_vault_documents_record_immutability.sql) stops identity, hash and\n' +
      "  lineage changes; everything else is up to the writer, which must record its change in\n" +
      '  the chained audit trail. Route the change through a named writer, or add this file to\n' +
      '  ALLOWED_WRITERS with what it writes and where that is recorded.',
  );
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
