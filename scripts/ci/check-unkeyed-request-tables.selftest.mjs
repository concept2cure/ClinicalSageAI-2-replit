#!/usr/bin/env node
/**
 * Self-test for check-unkeyed-request-tables.mjs.
 *
 * A gate that has only ever been seen to pass has not been tested. This
 * constructs the real case in a scratch directory — a migration creating a
 * table with no tenant column, and a server file reading it — runs the gate,
 * and asserts it goes red. Then it constructs the same case WITH a tenant
 * column and asserts it goes green, because a gate that fails on everything is
 * not a smaller bug than one that fails on nothing.
 *
 * Four cases, matching the four ways this gate can be wrong:
 *
 *   1. new unkeyed table, read by a route      → must FAIL   (the whole point)
 *   2. same table, but with organization_id    → must PASS   (no false positive)
 *   3. same table, keyed by a later ALTER      → must PASS   (two-stage parse)
 *   4. unkeyed table nothing reads             → must PASS   (per-request only)
 *
 * Case 3 is here because an earlier gate in this repo
 * (check-model-migration-agreement.mjs) shipped with an ALTER regex that read
 * only the FIRST ADD COLUMN of a comma-separated statement. The same mistake
 * here would report a keyed table as unkeyed.
 *
 * Usage: node scripts/ci/check-unkeyed-request-tables.selftest.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(repoRoot, 'scripts', 'ci', 'check-unkeyed-request-tables.mjs');

// Written into the real trees the gate walks, then removed. The names are
// deliberately absurd so a leftover file after a crash is obviously debris.
const SQL = path.join(repoRoot, 'db', 'migrations', '29990101_selftest_unkeyed_probe.sql');
const TS = path.join(repoRoot, 'server', 'routes', '__selftest_unkeyed_probe.ts');

const cleanup = () => {
  for (const f of [SQL, TS]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* already gone */
    }
  }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));

const run = () => spawnSync(process.execPath, [GATE], { cwd: repoRoot, encoding: 'utf8' });

const READER = `
// Self-test fixture. Removed by check-unkeyed-request-tables.selftest.mjs.
export async function probe(pool: { query: (q: string) => Promise<unknown> }) {
  return pool.query('SELECT * FROM selftest_unkeyed_probe WHERE id = $1');
}
`;

const CASES = [
  {
    name: 'new unkeyed table read by a route',
    sql: `CREATE TABLE IF NOT EXISTS selftest_unkeyed_probe (
            id UUID PRIMARY KEY,
            payload JSONB
          );`,
    reader: true,
    expectFail: true,
  },
  {
    name: 'same table WITH organization_id',
    sql: `CREATE TABLE IF NOT EXISTS selftest_unkeyed_probe (
            id UUID PRIMARY KEY,
            organization_id INTEGER NOT NULL,
            payload JSONB
          );`,
    reader: true,
    expectFail: false,
  },
  {
    name: 'keyed by a later ALTER, second of several ADD COLUMNs',
    sql: `CREATE TABLE IF NOT EXISTS selftest_unkeyed_probe (
            id UUID PRIMARY KEY,
            payload JSONB
          );
          ALTER TABLE selftest_unkeyed_probe
            ADD COLUMN IF NOT EXISTS note TEXT,
            ADD COLUMN IF NOT EXISTS tenant_id INTEGER,
            ADD COLUMN IF NOT EXISTS extra TEXT;`,
    reader: true,
    expectFail: false,
  },
  {
    name: 'unkeyed table that no per-request path reads',
    sql: `CREATE TABLE IF NOT EXISTS selftest_unkeyed_probe (
            id UUID PRIMARY KEY,
            payload JSONB
          );`,
    reader: false,
    expectFail: false,
  },
];

let failures = 0;

// A dirty starting state would make every result meaningless.
const before = run();
if (before.status !== 0) {
  console.error('[selftest] the gate is ALREADY failing before any fixture was written.');
  console.error('           Fix that first — these cases cannot be interpreted otherwise.');
  console.error((before.stdout || '') + (before.stderr || ''));
  process.exit(1);
}

for (const c of CASES) {
  cleanup();
  fs.writeFileSync(SQL, `-- self-test fixture\n${c.sql}\n`);
  if (c.reader) fs.writeFileSync(TS, READER);

  const res = run();
  const failed = res.status !== 0;
  const ok = failed === c.expectFail;

  console.log(
    `${ok ? '  ✓' : '  ✗'} ${c.name} — expected ${c.expectFail ? 'FAIL' : 'PASS'}, got ${failed ? 'FAIL' : 'PASS'}`,
  );

  if (!ok) {
    failures++;
    console.error((res.stdout || '').split('\n').slice(0, 12).join('\n'));
    console.error((res.stderr || '').split('\n').slice(0, 12).join('\n'));
  }

  // Case 1 must fail FOR THE RIGHT REASON. A gate that goes red because the
  // fixture broke its SQL parser would pass this suite while detecting nothing.
  if (c.expectFail && failed && !(res.stderr || '').includes('selftest_unkeyed_probe')) {
    failures++;
    console.error('  ✗ it failed, but did not name selftest_unkeyed_probe — wrong reason.');
    console.error((res.stderr || '').split('\n').slice(0, 12).join('\n'));
  }
}

cleanup();

const after = run();
if (after.status !== 0) {
  console.error('[selftest] the gate is still failing after cleanup — a fixture leaked.');
  failures++;
}

if (failures) {
  console.error(`\n[selftest] ${failures} case(s) wrong. The gate does not do what it claims.\n`);
  process.exit(1);
}
console.log('\n[selftest] ✅ the gate fails on the case it exists to catch, and only on that case.\n');
