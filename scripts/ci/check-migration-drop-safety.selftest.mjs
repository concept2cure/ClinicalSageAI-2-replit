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
const ORPHAN_DROP = fixture('orphan.sql', `DROP TABLE IF EXISTS public.abandoned_demo_table;`);
// The blind spot found 2026-09-19. stripNoise keeps dollar-quoted DO bodies on
// purpose but strips single-quoted strings, and dynamic DDL inside a DO block
// HAS to be a string — so every EXECUTE-issued drop was invisible. 16 of the
// 285 files in the real set do this. A dynamic DROP TABLE destroys rows and must
// be reasoned about; a dynamic DROP POLICY carries no data and is only counted.
const DYN_TABLE_DROP = fixture(
  'dynamic-table.sql',
  `DO $blind$
   DECLARE t text;
   BEGIN
     FOR t IN SELECT unnest(ARRAY['some_table']) LOOP
       EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
     END LOOP;
   END
   $blind$;`
);
const DYN_POLICY_DROP = fixture(
  'dynamic-policy.sql',
  `DO $pol$
   DECLARE t text;
   BEGIN
     FOR t IN SELECT unnest(ARRAY['some_table']) LOOP
       EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
       EXECUTE format('CREATE POLICY tenant_isolation_policy ON public.%I USING (true)', t);
     END LOOP;
   END
   $pol$;`
);

// NARROWED (found 2026-09-25 on three real constraints). Two files each replace
// the same CHECK, the later one wider. ADD CONSTRAINT validates existing rows, so
// replaying the earlier one over a row only the later one admits fails the deploy.
const replace = list =>
  `ALTER TABLE public.gadgets DROP CONSTRAINT IF EXISTS gadgets_kind_check;
   ALTER TABLE public.gadgets ADD CONSTRAINT gadgets_kind_check CHECK (kind IN (${list}));`;
const WIDEN_EARLY = fixture('widen-early.sql', replace(`'a','b'`));
const WIDEN_LATE = fixture('widen-late.sql', replace(`'a','b','c'`));
const guardedBy = name =>
  `DO $g$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = 'public.gadgets'::regclass AND conname = '${name}'
                       AND pg_get_constraintdef(oid) LIKE '%''b''%') THEN
       ${replace(`'a','b'`)}
     END IF;
   END $g$;`;
const WIDEN_EARLY_GUARDED = fixture('widen-early-guarded.sql', guardedBy('gadgets_kind_check'));
// Must still trip: a guard for a DIFFERENT constraint does not protect this one.
const WIDEN_EARLY_WRONG_GUARD = fixture(
  'widen-early-wrong-guard.sql',
  guardedBy('gadgets_other_check')
);
// Must still trip: the guard described in a comment is not a guard.
const WIDEN_EARLY_COMMENT_GUARD = fixture(
  'widen-early-comment-guard.sql',
  `-- guarded: IF NOT EXISTS (… conname = 'gadgets_kind_check' … pg_get_constraintdef(oid) …)
   ${replace(`'a','b'`)}`
);

/**
 * Run the gate with C2C_MIGRATION_FILES replaced by `files`, via a shim module
 * that re-exports the real set's other bindings.
 */
function runGate(files, baselineAllow = [], baselineAllowDynamic = []) {
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
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ allow: baselineAllow, allowDynamic: baselineAllowDynamic })
  );
  const patched = gateSrc.replace(
    /const BASELINE = [^;]+;/,
    `const BASELINE = ${JSON.stringify(baselinePath)};`
  );

  const gatePath = path.join(
    tmp,
    `gate-${Math.abs(hash(files.join() + baselineAllow.length + baselineAllowDynamic.length))}.mjs`
  );
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
  {
    name: 'NARROWED — an earlier file re-imposes a narrower CHECK a later file widened',
    files: [WIDEN_EARLY, WIDEN_LATE],
    expectExit: 1,
    expectIn: ['NARROWED', 'constraint:public.gadgets.gadgets_kind_check', 'widen-early.sql'],
  },
  {
    name: 'quiet — the earlier replacement is conditional on the current definition',
    files: [WIDEN_EARLY_GUARDED, WIDEN_LATE],
    expectExit: 0,
    expectIn: ['OK', '1 constraint replacement(s) a later file redefines, all conditional'],
  },
  {
    name: 'NARROWED — a guard that names a different constraint does not count',
    files: [WIDEN_EARLY_WRONG_GUARD, WIDEN_LATE],
    expectExit: 1,
    expectIn: ['NARROWED', 'widen-early-wrong-guard.sql'],
  },
  {
    name: 'NARROWED — a guard that exists only in a comment does not count',
    files: [WIDEN_EARLY_COMMENT_GUARD, WIDEN_LATE],
    expectExit: 1,
    expectIn: ['NARROWED', 'widen-early-comment-guard.sql'],
  },
  {
    name: 'dynamic — an EXECUTE-issued DROP TABLE is caught, not silently skipped',
    files: [DYN_TABLE_DROP],
    expectExit: 1,
    expectIn: ['unreviewed dynamic', 'DROP TABLE issued through EXECUTE', 'destroys rows'],
  },
  {
    name: 'dynamic — an EXECUTE-issued DROP POLICY is counted, not failed (carries no data)',
    files: [DYN_POLICY_DROP],
    expectExit: 0,
    expectIn: ['OK', '1 dynamic DROP(s)'],
  },
  {
    name: 'dynamic — a reviewed allowDynamic entry suppresses the data-bearing case',
    files: [DYN_TABLE_DROP],
    baselineDynamic: [{ dropper: DYN_TABLE_DROP, object: 'table', reason: 'selftest fixture' }],
    expectExit: 0,
    expectIn: ['OK', '1 reviewed'],
  },
];

let failed = 0;
for (const c of cases) {
  const { code, out } = runGate(c.files, c.baseline ?? [], c.baselineDynamic ?? []);
  const missing = c.expectIn.filter(s => !out.includes(s));
  const ok = code === c.expectExit && missing.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  if (!ok) {
    failed++;
    if (code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${code}`);
    for (const s of missing) console.log(`      output did not contain: ${JSON.stringify(s)}`);
    console.log(
      out
        .split('\n')
        .map(l => `      | ${l}`)
        .join('\n')
    );
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) wrong.`);
  process.exit(1);
}
console.log(
  `\n${TAG} OK — ${cases.length}/${cases.length} cases; the gate fires on all three replay modes and on an EXECUTE-issued table drop, and stays quiet on the safe shapes.`
);
