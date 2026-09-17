#!/usr/bin/env node
/**
 * Self-test for scripts/ci/check-governed-export-consequence-shape.mjs.
 *
 * That gate had none, which is how it came to be believed to have one. Its
 * whole value is in the refusal — a route that stops returning the governed
 * consequence, or a wrapper that REPLACES it instead of adding beside it —
 * and on a healthy tree the gate only ever prints a tick. A guard whose failure
 * branch has never been seen to fire has not been tested (CLAUDE.md).
 *
 * So this copies the real repository into a scratch tree, breaks it in the four
 * ways the gate exists to catch, and requires a non-zero exit for each — then
 * requires exit 0 on the tree untouched. The gate under test is the real file,
 * run as a child process against a fabricated `cwd`.
 *
 * Usage: node scripts/ci/check-governed-export-consequence-shape.selftest.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(repoRoot, 'scripts', 'ci', 'check-governed-export-consequence-shape.mjs');

const FILES = [
  'server/services/export/governedExportConsequence.ts',
  'server/routes/510k-estar-routes.ts',
  'server/routes/cerv2-export-routes.ts',
];

/** Build a scratch tree holding only the files the gate reads. */
function makeTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gec-shape-'));
  for (const rel of FILES) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, rel), dest);
  }
  return dir;
}

function runGate(cwd) {
  const r = spawnSync(process.execPath, [GATE], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/**
 * Rewrite EVERY occurrence, not the first.
 *
 * The gate asks whether a token is present in a file, so a break that leaves
 * one copy behind — the interface declaration while the return statement loses
 * it, say — is not the regression it looks like: the gate passes and the
 * self-test wrongly reports a hole. `replaceAll` makes each case mean what its
 * name says: the token is GONE.
 */
function edit(dir, rel, from, to) {
  const p = path.join(dir, rel);
  const src = fs.readFileSync(p, 'utf8');
  if (!src.includes(from)) {
    throw new Error(
      `self-test is stale: ${rel} no longer contains ${JSON.stringify(from.slice(0, 80))}`,
    );
  }
  fs.writeFileSync(p, src.replaceAll(from, to));
}

/**
 * Each case is a REAL regression, written the way it would actually appear.
 * The gate must reject all four; a case the gate accepts is a hole in it.
 */
const CASES = [
  {
    name: 'the official route stops returning the governed consequence',
    break: (dir) =>
      edit(
        dir,
        'server/routes/510k-estar-routes.ts',
        'withOfficialExtras(consequence, fieldReport, retention',
        'withOfficialExtras({ ok: true }, fieldReport, retention',
      ),
  },
  {
    name: 'the wrapper REPLACES the consequence instead of spreading it',
    break: (dir) =>
      edit(
        dir,
        'server/routes/510k-estar-routes.ts',
        'return {\n    ...body,',
        'return {\n    body,',
      ),
  },
  {
    name: 'the delivered-bytes hash is dropped from the consequence',
    break: (dir) =>
      edit(
        dir,
        'server/services/export/governedExportConsequence.ts',
        'provenance_ref:',
        'provenanceRef:',
      ),
  },
  {
    name: 'a cerv2 export route stops declaring its backend route',
    break: (dir) =>
      edit(
        dir,
        'server/routes/cerv2-export-routes.ts',
        "backendRoute: 'POST /api/cerv2/export/docx'",
        "backendRoute: 'POST /api/cerv2/export/word'",
      ),
  },
];

let failures = 0;

{
  const dir = makeTree();
  const { code, out } = runGate(dir);
  if (code !== 0) {
    console.error(`❌ the gate rejects the UNMODIFIED tree — it is broken, not the code\n${out}`);
    failures++;
  } else {
    console.log('✅ passes on the unmodified tree');
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

for (const c of CASES) {
  const dir = makeTree();
  try {
    c.break(dir);
    const { code } = runGate(dir);
    if (code === 0) {
      console.error(`❌ the gate ACCEPTED a tree where ${c.name}`);
      failures++;
    } else {
      console.log(`✅ rejected: ${c.name}`);
    }
  } catch (err) {
    console.error(`❌ ${c.name}: ${err instanceof Error ? err.message : String(err)}`);
    failures++;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`\nGoverned export consequence shape SELF-TEST failed with ${failures} issue(s).`);
  process.exit(1);
}
console.log('\n✅ Governed export consequence shape self-test passed.');
