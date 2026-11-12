/**
 * ci:pushed-lint-gates runs CI's Lint-job gates at push time and refuses only
 * what the push brings (scripts/ci/check-pushed-lint-gates.mjs; MR-02,
 * 2026-11-12).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { attribute, decide, gateCommands, gateFiles, namedPaths, rewrittenByGates, selectGates } from '../check-pushed-lint-gates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const step = (name, run) => ({ name, run });
const workflow = (...steps) => ({ jobs: { lint: { steps } } });

test('a step is a gate only when every line is a plain npm script or scripts/ci node command', () => {
  assert.deepEqual(gateCommands('npm run ci:a\nnpm run --silent ci:b').map((c) => c.id), ['ci:a', 'ci:b']);
  assert.deepEqual(gateCommands('node scripts/ci/check-x.mjs --strict').map((c) => c.id), ['scripts/ci/check-x.mjs']);
  assert.equal(gateCommands('npm run ci:a | tee out.txt'), null);
  assert.equal(gateCommands('if [ -f x ]; then npm run ci:a; fi'), null);
  assert.equal(gateCommands('# only a comment'), null);
});

test('selftests, test suites, slow tools and what the hook already runs are left to CI', () => {
  const gates = selectGates(workflow(
    step('A', 'npm run ci:a'),
    step('A selftest', 'npm run ci:a:selftest\nnpm run ci:a'),
    step('suite', 'npm run test:proof-tier'),
    step('tests', 'npm run test:ci-scripts'),
    step('doctor', 'npm run codespaces:doctor:test'),
    step('ratchet', 'npm run ci:eslint-ratchet'),
    step('tsc', 'npm run ci:typecheck:no-regression'),
    step('in hook', 'npm run ci:hooked'),
    { name: 'checkout', uses: 'actions/checkout@x' },
  ), 'npm run --silent ci:hooked');
  assert.deepEqual(gates.map((g) => g.name), ['A']);
});

test('no Lint job is not "no gates": it is null, which the CLI refuses', () => {
  assert.equal(selectGates({ jobs: {} }, ''), null);
});

test('on the real ci.yml it runs the gates that went red on trunk unseen, and none CI must keep', () => {
  const yaml = createRequire(path.join(ROOT, 'package.json'))('yaml');
  const real = yaml.parse(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'));
  const hook = fs.readFileSync(path.join(ROOT, '.husky/pre-push'), 'utf8');
  const ids = selectGates(real, hook).flatMap((g) => g.commands.map((c) => c.id));
  for (const id of ['ci:error-envelope', 'ci:internals-in-copy', 'ci:empty-state-honesty', 'ci:success-before-ok', 'ci:tenant-isolation:no-regression']) {
    assert.ok(ids.includes(id), `${id} is not run at push time`);
  }
  for (const id of ['test:proof-tier', 'ci:typecheck:no-regression', 'ci:eslint-ratchet', 'test:ci-scripts']) assert.ok(!ids.includes(id), `${id} should be CI's`);
  for (const id of ids) assert.ok(!hook.includes(id), `${id} is in the hook already`);
});

test('the paths a gate names are read with or without a line, and relative to client/src', () => {
  const out = [
    '[ci:error-envelope] FAIL — 2 new hand-rolled error-envelope read(s):',
    '  concept2cure/v2/surfaces/help/SupportRequests.tsx:46  [envelope-error-dot-message]',
    '   shared/constants/ui-surface-registry.ui-v2.ts:85  [source file]',
    "  server/services/qms/change-regulatory-impact.ts#7574bc7b5d52:users",
    'see https://claude.ai/code for help',
  ].join('\n');
  const paths = namedPaths(out);
  assert.ok(paths.includes('concept2cure/v2/surfaces/help/SupportRequests.tsx'));
  assert.ok(paths.includes('shared/constants/ui-surface-registry.ui-v2.ts'));
  assert.ok(paths.includes('server/services/qms/change-regulatory-impact.ts'));
  assert.ok(!paths.some((p) => p.includes('claude.ai')));
  assert.deepEqual(
    attribute(paths, ['client/src/concept2cure/v2/surfaces/help/SupportRequests.tsx', 'docs/x.md']),
    ['client/src/concept2cure/v2/surfaces/help/SupportRequests.tsx'],
  );
});

test("a red that names a file the push changes is the push's: refused", () => {
  const red = { name: 'error-envelope', ok: false, output: 'concept2cure/v2/A.tsx:3 [x]', files: ['scripts/ci/check-a.mjs'] };
  const { refuse, trunk } = decide([red, { name: 'green', ok: true, output: 'client/src/concept2cure/v2/A.tsx', files: [] }], ['client/src/concept2cure/v2/A.tsx']);
  assert.equal(refuse.length, 1);
  assert.match(refuse[0].why, /names client\/src\/concept2cure\/v2\/A\.tsx/);
  assert.equal(trunk.length, 0);
});

test("a red that names only other files is trunk's: named, not refused", () => {
  const red = { name: 'error-envelope', ok: false, output: 'concept2cure/v2/B.tsx:3 [x]', files: ['scripts/ci/check-a.mjs'] };
  const { refuse, trunk } = decide([red], ['client/src/concept2cure/v2/A.tsx']);
  assert.equal(refuse.length, 0);
  assert.deepEqual(trunk.map((r) => r.name), ['error-envelope']);
});

test('a push that changes a red gate itself, or ci.yml, owns the red even when it names no file', () => {
  const red = { name: 'g', ok: false, output: 'it crashed', files: ['scripts/ci/check-a.mjs'] };
  assert.equal(decide([red], ['scripts/ci/check-a.mjs']).refuse.length, 1);
  assert.equal(decide([red], ['.github/workflows/ci.yml']).refuse.length, 1);
  assert.equal(decide([red], ['docs/x.md']).refuse.length, 0);
});

test('with no upstream to compare with, every red is refused', () => {
  const red = { name: 'g', ok: false, output: 'concept2cure/v2/B.tsx', files: [] };
  assert.equal(decide([red], null).refuse.length, 1);
});

test("a gate's script files are found through package.json", () => {
  assert.deepEqual(gateFiles([{ id: 'ci:a' }, { id: 'scripts/ci/check-b.mjs' }], { 'ci:a': 'node scripts/ci/check-a.mjs --strict' }),
    ['scripts/ci/check-a.mjs', 'scripts/ci/check-b.mjs']);
});

test("a report a gate rewrites is put back; any other change is named, never reverted", () => {
  const before = new Set(['client/src/mine.tsx']);
  const after = new Set(['client/src/mine.tsx', 'docs/reports/orphan-endpoints-latest.json', 'client/src/edited-meanwhile.tsx']);
  assert.deepEqual(rewrittenByGates(before, after), {
    restore: ['docs/reports/orphan-endpoints-latest.json'],
    other: ['client/src/edited-meanwhile.tsx'],
  });
});
