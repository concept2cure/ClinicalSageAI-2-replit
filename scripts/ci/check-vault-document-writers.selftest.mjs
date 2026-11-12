#!/usr/bin/env node
/**
 * Selftest for check-vault-document-writers.mjs: the gate fails on the cases it
 * exists to catch, and only on them. Builds throwaway trees in the OS temp
 * directory and runs the real gate against them.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ALLOWED_BYTE_DELETERS, ALLOWED_WRITERS } from './check-vault-document-writers.mjs';

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-vault-document-writers.mjs');

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-writers-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

const WRITE = "await client.query(`UPDATE vault.documents SET folder_id = $1 WHERE id = $2`, [f, id]);\n";
const UPSERT = "await client.query(`INSERT INTO vault.documents (id) VALUES ($1) ON CONFLICT (id) DO UPDATE SET processing_status = 'PENDING'`, [id]);\n";
// The byte store's delete: a version and an organization (server/services/storage/storage-provider.ts).
const STORE_DELETE = 'await getStorageProvider().delete(versionId, orgId);\n';
const S3_DELETE = 'await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));\n';
const named = {
  ...Object.fromEntries([...ALLOWED_WRITERS.keys()].map((f) => [f, WRITE])),
  ...Object.fromEntries([...ALLOWED_BYTE_DELETERS.keys()].map((f) => [f, STORE_DELETE])),
};

const cases = [
  { name: 'every named writer, nothing else', files: named, expect: 0 },
  {
    name: 'a named ingestion writer uses an upsert without a direct UPDATE statement',
    files: { ...named, 'server/services/vault/vault-ingest.service.ts': UPSERT },
    expect: 0,
  },
  {
    name: 'an unnamed upsert mutates a recorded version',
    files: { ...named, 'server/services/vault/sneaky.ts': UPSERT },
    expect: 1,
  },
  {
    name: 'an insert that does nothing on conflict is not an update writer',
    files: { ...named, 'server/services/vault/insert.ts': UPSERT.replace("DO UPDATE SET processing_status = 'PENDING'", 'DO NOTHING') },
    expect: 0,
  },
  {
    name: 'an unnamed service file writes vault.documents',
    files: { ...named, 'server/services/vault/sneaky.ts': "await pool.query(`UPDATE vault.documents SET classification = 'PUBLIC'`);\n" },
    expect: 1,
  },
  {
    name: 'a named writer no longer writes (stale allowlist)',
    files: { ...named, 'server/jobs/retentionCron.ts': '// archives only now\n' },
    expect: 1,
  },
  {
    name: 'a test file writing it is not a finding',
    files: { ...named, 'server/services/vault/__tests__/x.test.ts': WRITE, 'tests/db/y.dbtest.ts': WRITE },
    expect: 0,
  },
  // The bytes: who may delete from the byte store (P-107 item 3, retention FD3 (c)).
  {
    name: "an unnamed file deletes a version's bytes from the byte store",
    files: { ...named, 'server/jobs/retentionPurge.ts': STORE_DELETE },
    expect: 1,
  },
  {
    name: 'an unnamed store delete written over several lines, its organization a call',
    files: { ...named, 'server/jobs/retentionPurge.ts': 'await storage.delete(\n  row.vault_version_id,\n  Number(row.organization_id),\n);\n' },
    expect: 1,
  },
  {
    name: 'an unnamed file sends an S3 delete',
    files: { ...named, 'server/services/vault/purge.ts': S3_DELETE },
    expect: 1,
  },
  {
    name: 'a named deleter sends an S3 delete in place of a store delete',
    files: { ...named, 'server/services/storage/s3-provider.ts': S3_DELETE },
    expect: 0,
  },
  {
    name: 'a named deleter no longer deletes (stale allowlist)',
    files: { ...named, 'server/services/ana/upload-object-store.ts': '// keeps every object now\n' },
    expect: 1,
  },
  {
    name: 'a route registration, a Map delete, a one-table delete and an HTTP delete of a templated address are not store deletes',
    files: {
      ...named,
      'server/routes/x.ts':
        "router.delete('/thread/:threadId', deleteThread);\nrouter.delete(\n  '/folders/:id',\n  requireAuth,\n  remove,\n);\n" +
        'seen.delete(key);\nawait db.delete(folders).where(and(eq(folders.id, id), eq(folders.organizationId, org)));\n' +
        'cache.delete(keyOf(a, b));\nawait http.delete(`${base}/items/${id}`, { headers });\n',
    },
    expect: 0,
  },
  {
    name: 'a test file deleting stored bytes is not a finding',
    files: { ...named, 'server/services/vault/__tests__/x.test.ts': STORE_DELETE, 'tests/db/y.dbtest.ts': S3_DELETE },
    expect: 0,
  },
];

let failed = 0;
for (const c of cases) {
  const root = tree(c.files);
  const r = spawnSync(process.execPath, [GATE, '--root', root], { encoding: 'utf8' });
  fs.rmSync(root, { recursive: true, force: true });
  const ok = r.status === c.expect;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name} — expected exit ${c.expect}, got ${r.status}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`[selftest] ✗ ${failed} case(s) wrong: the gate does not fail exactly where it should.`);
  process.exit(1);
}
console.log('[selftest] ✅ the gate fails on an unnamed writer, an unnamed deleter of stored bytes and a stale entry, and only there.');
