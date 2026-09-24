/**
 * Self-test for the pre-push typecheck trigger and the shared push-range helper.
 *
 * The trigger's whole job is one decision — does this push need a typecheck —
 * and it can go wrong in two directions with very different costs. Skipping a
 * push that changed a type is how a red typecheck reaches trunk (it happened
 * twice on 2026-09-19, which is why this exists). Running on a docs-only push
 * costs a contributor ~45 s. So every case below that must RUN is a way the
 * skip branch could be wrong, and those are the ones that matter most:
 *
 *   • a DELETED .ts file — the shared helper defaults to ACMR (no deletions),
 *     which is right for lint and wrong here; deleting a module breaks every
 *     importer and a trigger that inherited the default would skip it;
 *   • a .json under an included root — tsconfig sets resolveJsonModule, so
 *     imported JSON is typed;
 *   • an unresolvable base — "could not tell what changed" must never read as
 *     "nothing changed".
 *
 * Decisions are exercised end to end with --dry-run against throwaway git
 * repositories, so no case depends on this repo's history or runs tsc.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { isTypeRelevant } from '../check-pushed-typecheck.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TRIGGER = path.resolve(here, '..', 'check-pushed-typecheck.mjs');
const HELPER = path.resolve(here, '..', 'lib', 'push-range.mjs');

function sh(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** A scratch repo with one base commit; returns { dir, base, commit(files) }. */
function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushed-typecheck-'));
  sh(dir, 'git', ['init', '-q', '-b', 'main']);
  sh(dir, 'git', ['config', 'user.email', 'selftest@example.invalid']);
  sh(dir, 'git', ['config', 'user.name', 'selftest']);
  const write = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  };
  write('server/keep.ts', 'export const keep = 1;\n');
  write('docs/readme.md', '# base\n');
  sh(dir, 'git', ['add', '-A']);
  sh(dir, 'git', ['commit', '-qm', 'base']);
  const base = sh(dir, 'git', ['rev-parse', 'HEAD']);
  return {
    dir,
    base,
    write,
    remove: rel => fs.rmSync(path.join(dir, rel)),
    commit: msg => {
      sh(dir, 'git', ['add', '-A']);
      sh(dir, 'git', ['commit', '-qm', msg]);
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function decide(dir, base) {
  const r = spawnSync(process.execPath, [TRIGGER, '--dry-run', '--base', base], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const WOULD_RUN = /would run typecheck-no-regression/;
const SKIPPED = /skipped — none of the/;

test('isTypeRelevant: source, config and dependency manifests count', () => {
  for (const f of [
    'server/a.ts',
    'client/src/b.tsx',
    'shared/c.mts',
    'server/d.cts',
    'shared/types/e.d.ts',
    'tsconfig.json',
    'tsconfig.beta-slice.json',
    'package.json',
    'package-lock.json',
    'shared/data/regions.json', // resolveJsonModule
    'server/fixtures/x.json',
  ]) {
    assert.equal(isTypeRelevant(f), true, f);
  }
});

test('isTypeRelevant: docs, SQL, scripts and JSON outside the included roots do not', () => {
  for (const f of [
    'docs/work-orders/WO-3.md',
    'migrations/20260919_x.sql',
    'scripts/ci/check-x.mjs', // not in tsconfig include, and allowJs is off
    'server/legacy.js', // allowJs is off, so tsc never reads it
    'docs/data.json', // outside every included root
    '.github/workflows/ci.yml',
    'CLAUDE.md',
  ]) {
    assert.equal(isTypeRelevant(f), false, f);
  }
});

test('a docs-only push SKIPS, and says why', t => {
  const repo = scratchRepo();
  t.after(repo.cleanup);
  repo.write('docs/readme.md', '# edited\n');
  repo.write('migrations/001.sql', 'select 1;\n');
  repo.commit('docs and sql');
  const r = decide(repo.dir, repo.base);
  assert.equal(r.code, 0);
  assert.match(r.out, SKIPPED);
  assert.doesNotMatch(r.out, WOULD_RUN);
});

test('a .ts edit RUNS', t => {
  const repo = scratchRepo();
  t.after(repo.cleanup);
  repo.write('server/keep.ts', 'export const keep = 2;\n');
  repo.commit('edit ts');
  assert.match(decide(repo.dir, repo.base).out, WOULD_RUN);
});

test('a DELETED .ts file RUNS — the case the helper default would miss', t => {
  const repo = scratchRepo();
  t.after(repo.cleanup);
  repo.remove('server/keep.ts');
  repo.commit('delete a module');
  const r = decide(repo.dir, repo.base);
  assert.match(r.out, WOULD_RUN);
  assert.match(r.out, /server\/keep\.ts/);
});

test('a typed JSON file under an included root RUNS; one outside does not', t => {
  const inRoot = scratchRepo();
  t.after(inRoot.cleanup);
  inRoot.write('shared/data/regions.json', '{"a":1}\n');
  inRoot.commit('typed json');
  assert.match(decide(inRoot.dir, inRoot.base).out, WOULD_RUN);

  const outRoot = scratchRepo();
  t.after(outRoot.cleanup);
  outRoot.write('docs/data.json', '{"a":1}\n');
  outRoot.commit('untyped json');
  assert.match(decide(outRoot.dir, outRoot.base).out, SKIPPED);
});

test('an unresolvable base RUNS — unknown is not "nothing changed"', t => {
  const repo = scratchRepo();
  t.after(repo.cleanup);
  const r = decide(repo.dir, 'no-such-ref-anywhere');
  assert.match(r.out, /pushed files are unknown/);
  assert.match(r.out, WOULD_RUN);
});

test('push-range: changedSince returns null, never [], when git fails', async t => {
  const repo = scratchRepo();
  t.after(repo.cleanup);
  const prev = process.cwd();
  process.chdir(repo.dir);
  t.after(() => process.chdir(prev));
  const { changedSince } = await import(HELPER);
  // [] would mean "nothing changed" and let every push-scoped gate pass over
  // files it never examined — the `?? ''` both original gates used to have.
  assert.equal(changedSince('no-such-ref-anywhere'), null);
  assert.deepEqual(changedSince(repo.base), []);
});

test("push-range: the diff filter is the caller's — ACMR drops deletions, ACMRD keeps them", async t => {
  const repo = scratchRepo();
  t.after(repo.cleanup);
  repo.remove('server/keep.ts');
  repo.commit('delete');
  const prev = process.cwd();
  process.chdir(repo.dir);
  t.after(() => process.chdir(prev));
  const { changedSince } = await import(HELPER);
  assert.deepEqual(changedSince(repo.base), []); // the lint gates' default
  assert.deepEqual(changedSince(repo.base, { diffFilter: 'ACMRD' }), ['server/keep.ts']);
});
