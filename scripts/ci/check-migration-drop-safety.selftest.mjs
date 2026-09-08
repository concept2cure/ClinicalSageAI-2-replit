#!/usr/bin/env node
/**
 * Self-test for check-migration-drop-safety.mjs.
 *
 * Exists because the gate's whole value is in its failure branch, and on the
 * current set that branch does not fire — it reports OK. A guard that has only
 * ever been seen to pass has not been tested (CLAUDE.md, working agreement).
 *
 * So this constructs the exact situation the gate was written for — a migration
 * that DROPs a vault.documents column that migrations/20260823_vault_document_placement.sql
 * re-ADDs on every deploy — plus the ordering variant and the two shapes that
 * must NOT trip it, and asserts the gate's verdict on each.
 *
 * Fixtures are written into a temp dir and the gate is run against a patched
 * migration set, so nothing here touches the real set or the repo's migrations.
 *
 * Usage: node scripts/ci/check-migration-drop-safety.selftest.mjs
 * Exit 0 when the gate catches what it must and stays quiet on what it must not.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:migration-drop-safety:selftest]';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drop-safety-'));
const fixtureDir = path.join(tmp, 'migrations');
fs.mkdirSync(fixtureDir, { recursive: true });

/** Write a fixture migration and return its repo-relative path. */
function fixture(name, sql) {
  fs.writeFileSync(path.join(fixtureDir, name), sql);
  return path.relative(repoRoot, path.join(fixtureDir, name));
}

// The real shape: 20260823 re-adds these columns with ADD COLUMN IF NOT EXISTS.
const CREATOR = fixture(
  'creator.sql',
  `ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS folder_id TEXT;
   ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS ctd_section TEXT;`
);
const DROPPER = fixture(
  'dropper.sql',
  `ALTER TABLE vault.documents DROP COLUMN IF EXISTS folder_id;`
);
// Must NOT trip: drop-and-re-add of the same name in one file (the repo's
// idempotent re-create idiom).
const RECREATOR = fixture(
  'recreator.sql',
  `ALTER TABLE public.widgets DROP CONSTRAINT IF EXISTS widgets_kind_check;
   ALTER TABLE public.widgets ADD CONSTRAINT widgets_kind_check CHECK (kind IN ('a','b'));`
);
// Must NOT trip: a DROP whose object nothing in the set creates (the repo's
// existing, safe convention — see 20260823_drop_dead_c2c_cmc_changes.sql).
const ORPHAN_DROP = fixture(
  'orphan.sql',
  `DROP TABLE IF EXISTS public.abandoned_demo_table;`
);

/**
 * Run the gate with C2C_MIGRATION_FILES replaced by `files`, via a shim module
 * that re-exports the real set's other bindings.
 */
function runGate(files, baselineAllow = []) {
  const shim = path.join(tmp, `set-${Math.abs(hash(files.join()))}.mjs`);
  fs.writeFileSync(
    shim,
    `export const C2C_MIGRATION_FILES = ${JSON.stringify(files)};\n` +
      `export const TENANT_ISOLATION_SWEEP = '';\n` +
      `export const UUID_TENANT_ISOLATION_NONPUBLIC = '';\n`
  );

  const gateSrc = fs
    .readFileSync(path.join(repoRoot, 'scripts', 'ci', 'check-migration-drop-safety.mjs'), 'utf8')
    .replace("from '../db/migration-set.mjs'", `from ${JSON.stringify(shim)}`);

  const baselinePath = path.join(tmp, 'baseline.json');
  fs.writeFileSync(baselinePath, JSON.stringify({ allow: baselineAllow }));
  const patched = gateSrc.replace(
    /const BASELINE = [^;]+;/,
    `const BASELINE = ${JSON.stringify(baselinePath)};`
  );

  const gatePath = path.join(tmp, `gate-${Math.abs(hash(files.join() + baselineAllow.length))}.mjs`);
  fs.writeFileSync(gatePath, patched);

  try {
    const stdout = execFileSync(process.execPath, [gatePath], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const cases = [
  {
    name: 'REPEATED — dropper after creator (re-added and re-dropped every deploy)',
    files: [CREATOR, DROPPER],
    expectExit: 1,
    expectIn: ['REPEATED', 'vault.documents.folder_id', 'destroyed'],
  },
  {
    name: 'UNDONE — dropper before creator (the drop reverts on the next deploy)',
    files: [DROPPER, CREATOR],
    expectExit: 1,
    expectIn: ['UNDONE', 'vault.documents.folder_id'],
  },
  {
    name: 'quiet — drop-and-re-add of the same name in one file',
    files: [RECREATOR],
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — a DROP nothing in the set re-creates',
    files: [ORPHAN_DROP],
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — a reviewed baseline exception suppresses a real pairing',
    files: [CREATOR, DROPPER],
    baseline: [
      {
        dropper: DROPPER,
        object: 'column:vault.documents.folder_id',
        creator: CREATOR,
        reason: 'selftest fixture',
      },
    ],
    expectExit: 0,
    expectIn: ['reviewed exception'],
  },
];

let failed = 0;
for (const c of cases) {
  const { code, out } = runGate(c.files, c.baseline ?? []);
  const missing = c.expectIn.filter(s => !out.includes(s));
  const ok = code === c.expectExit && missing.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  if (!ok) {
    failed++;
    if (code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${code}`);
    for (const s of missing) console.log(`      output did not contain: ${JSON.stringify(s)}`);
    console.log(out.split('\n').map(l => `      | ${l}`).join('\n'));
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) wrong.`);
  process.exit(1);
}
console.log(`\n${TAG} OK — ${cases.length}/${cases.length} cases; the gate fires on both replay modes and stays quiet on the two safe shapes.`);
