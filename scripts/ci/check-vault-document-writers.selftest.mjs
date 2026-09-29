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
import { ALLOWED_WRITERS } from './check-vault-document-writers.mjs';

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
const named = Object.fromEntries([...ALLOWED_WRITERS.keys()].map((f) => [f, WRITE]));

const cases = [
  { name: 'every named writer, nothing else', files: named, expect: 0 },
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
console.log('[selftest] ✅ the gate fails on an unnamed writer and on a stale entry, and only there.');
