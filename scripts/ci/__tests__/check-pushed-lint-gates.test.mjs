/**
 * ci:pushed-lint-gates runs CI's Lint-job gates at push time and refuses only
 * what the push brings (scripts/ci/check-pushed-lint-gates.mjs; MR-02,
 * 2026-11-12). Its blame rule runs each red gate again on the base.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  attribute, decide, gateCommands, gateFiles, hookCommands, namedPaths, resolveBase, restoreReports, runsHere, selectGates,
} from '../check-pushed-lint-gates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const step = (name, run) => ({ name, run });
const workflow = (...steps) => ({ jobs: { lint: { steps } } });
const red = (name, output, files = []) => ({ name, ok: false, output, files });

test('a step is a gate only when every line is a plain npm script or scripts/ci node command', () => {
  assert.deepEqual(gateCommands('npm run ci:a\nnpm run --silent ci:b').map((c) => c.id), ['ci:a', 'ci:b']);
  assert.deepEqual(gateCommands('node scripts/ci/check-x.mjs --strict').map((c) => c.id), ['scripts/ci/check-x.mjs']);
  assert.equal(gateCommands('npm run ci:a | tee out.txt'), null);
  assert.equal(gateCommands('if [ -f x ]; then npm run ci:a; fi'), null);
  assert.equal(gateCommands('# only a comment'), null);
});

test('selftests, test suites, slow tools and what the hook runs are left out, command by command', () => {
  const gates = selectGates(workflow(
    step('A', 'npm run ci:a'),
    step('A with selftest', 'npm run ci:a2:selftest\nnpm run ci:a2'),
    step('runtime', 'node scripts/ci/check-node-runtime.mjs\nnode scripts/ci/check-node-runtime.mjs --self-test'),
    step('suite', 'npm run test:proof-tier'),
    step('tests', 'npm run test:ci-scripts'),
    step('doctor', 'npm run codespaces:doctor:test'),
    step('ratchet', 'npm run ci:eslint-ratchet'),
    step('tsc', 'npm run ci:typecheck:no-regression'),
    step('in hook', 'npm run ci:hooked'),
    { name: 'checkout', uses: 'actions/checkout@x' },
  ), 'npm run --silent ci:hooked');
  assert.deepEqual(gates.map((g) => [g.name, g.commands.map((c) => c.line)]), [
    ['A', ['npm run ci:a']],
    ['A with selftest', ['npm run ci:a2']],
    ['runtime', ['node scripts/ci/check-node-runtime.mjs']],
  ]);
  assert.equal(runsHere({ id: 'scripts/ci/check-node-runtime.mjs', line: 'node scripts/ci/check-node-runtime.mjs --selftest' }, new Set()), false);
});

test('no Lint job is not "no gates": it is null, which the CLI refuses', () => {
  assert.equal(selectGates({ jobs: {} }, ''), null);
});

test('a gate the hook only mentions in a comment, or whose name prefixes one it runs, is still run here', () => {
  const hook = '# audit:repo-health:no-regression compares against the baseline\nnpm run --silent ci:tenant-isolation:no-regression\n';
  assert.deepEqual([...hookCommands(hook)], ['ci:tenant-isolation:no-regression']);
  const gates = selectGates(workflow(step('repo', 'npm run audit:repo-health:no-regression'), step('ti', 'npm run ci:tenant-isolation'),
    step('ti-nr', 'npm run ci:tenant-isolation:no-regression')), hook);
  assert.deepEqual(gates.map((g) => g.name), ['repo', 'ti']);
});

test('on the real ci.yml it runs the gates that went red on trunk unseen, and none CI must keep', () => {
  const yaml = createRequire(path.join(ROOT, 'package.json'))('yaml');
  const real = yaml.parse(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'));
  const hook = fs.readFileSync(path.join(ROOT, '.husky/pre-push'), 'utf8');
  const commands = selectGates(real, hook).flatMap((g) => g.commands);
  const ids = commands.map((c) => c.id);
  for (const id of ['ci:error-envelope', 'ci:internals-in-copy', 'ci:empty-state-honesty', 'ci:success-before-ok', 'ci:tenant-isolation:no-regression', 'ci:launch-scope']) {
    assert.ok(ids.includes(id), `${id} is not run at push time`);
  }
  for (const id of ['test:proof-tier', 'ci:typecheck:no-regression', 'ci:eslint-ratchet', 'test:ci-scripts', 'ci:launch-scope:selftest']) assert.ok(!ids.includes(id), `${id} should be CI's`);
  assert.ok(!commands.some((c) => /--self-?test\b/.test(c.line)), 'a --self-test command is selected');
  const ran = hookCommands(hook);
  for (const id of ids) assert.ok(!ran.has(id), `${id} is in the hook already`);
});

test('the paths a gate names are read with or without a line, relative to client/src, and with roots stripped', () => {
  const out = [
    '[ci:error-envelope] FAIL — 2 new hand-rolled error-envelope read(s):',
    '  concept2cure/v2/surfaces/help/SupportRequests.tsx:46  [envelope-error-dot-message]',
    '   shared/constants/ui-surface-registry.ui-v2.ts:85  [source file]',
    '  server/services/qms/change-regulatory-impact.ts#7574bc7b5d52:users',
    '  /tmp/c2c-x/base/server/a/b.ts:3',
    'see https://claude.ai/code for help',
  ].join('\n');
  const paths = namedPaths(out, ['/tmp/c2c-x/base']);
  assert.ok(paths.includes('concept2cure/v2/surfaces/help/SupportRequests.tsx'));
  assert.ok(paths.includes('shared/constants/ui-surface-registry.ui-v2.ts'));
  assert.ok(paths.includes('server/services/qms/change-regulatory-impact.ts'));
  assert.ok(paths.includes('server/a/b.ts'));
  assert.ok(!paths.some((p) => p.includes('claude.ai')));
  assert.deepEqual(attribute(paths, ['client/src/concept2cure/v2/surfaces/help/SupportRequests.tsx', 'docs/x.md']),
    ['client/src/concept2cure/v2/surfaces/help/SupportRequests.tsx']);
});

test('a red that is green on the base is the push\'s, whatever it names (a deleted file, a root file, or none)', () => {
  const r = red('ratchet', 'route ownership drifted (no file named)');
  const { refuse, trunk } = decide([r, { name: 'green', ok: true, output: '', files: [] }],
    { onBase: new Map([['ratchet', { ok: true, output: '' }]]), changed: [] });
  assert.equal(refuse.length, 1);
  assert.match(refuse[0].why, /green before this push, red after it/);
  assert.equal(trunk.length, 0);
});

test("a red that is red on the base with the same paths is trunk's, even when the push touches a named file", () => {
  const out = 'concept2cure/v2/B.tsx:3 [x]\nlisting: docs/proof/a.md, docs/proof/b.md';
  const { refuse, trunk } = decide([red('envelope', out)],
    { onBase: new Map([['envelope', { ok: false, output: out }]]), changed: ['client/src/concept2cure/v2/B.tsx', 'docs/proof/a.md'] });
  assert.equal(refuse.length, 0);
  assert.deepEqual(trunk.map((r) => r.name), ['envelope']);
});

test('a red on both that now names a file it did not name before is the push\'s', () => {
  const before = 'concept2cure/v2/B.tsx:3 [x]';
  const after = 'concept2cure/v2/B.tsx:3 [x]\nconcept2cure/v2/A.tsx:9 [x]';
  const { refuse } = decide([red('envelope', after)],
    { onBase: new Map([['envelope', { ok: false, output: before }]]), changed: [], known: (p) => p.endsWith('A.tsx') || p.endsWith('B.tsx') });
  assert.equal(refuse.length, 1);
  assert.match(refuse[0].why, /now also names concept2cure\/v2\/A\.tsx/);
});

test('a path only one run printed, that is no tracked or changed file (a temp dir), blames nobody', () => {
  const { refuse, trunk } = decide([red('g', 'wrote /tmp/c2c-run-1/out.json')],
    { onBase: new Map([['g', { ok: false, output: 'wrote /tmp/c2c-run-2/out.json' }]]), changed: [], known: () => false });
  assert.equal(refuse.length, 0);
  assert.equal(trunk.length, 1);
});

test('the base paths are compared with each tree\'s own root stripped', () => {
  const { refuse } = decide([red('g', '/repo/server/a.ts:1 bad')],
    { onBase: new Map([['g', { ok: false, output: '/tmp/base/server/a.ts:1 bad' }]]), changed: [], roots: ['/repo', '/tmp/base'] });
  assert.equal(refuse.length, 0);
});

test('without the base run, a red is the push\'s when it names a changed file or the push changes the gate or ci.yml', () => {
  const named = red('e', 'concept2cure/v2/A.tsx:3', ['scripts/ci/check-a.mjs']);
  assert.equal(decide([named], { changed: ['client/src/concept2cure/v2/A.tsx'] }).refuse.length, 1);
  assert.equal(decide([named], { changed: ['docs/x.md'] }).refuse.length, 0);
  const crashed = red('g', 'it crashed', ['scripts/ci/check-a.mjs']);
  assert.equal(decide([crashed], { changed: ['scripts/ci/check-a.mjs'] }).refuse.length, 1);
  assert.equal(decide([crashed], { changed: ['.github/workflows/ci.yml'] }).refuse.length, 1);
});

test('with no base at all, every red is refused', () => {
  assert.equal(decide([red('g', 'concept2cure/v2/B.tsx')], { changed: null }).refuse.length, 1);
});

test('a detached HEAD, or a branch with no upstream, lands on origin/concept2cure-v2 (RULE 0)', () => {
  assert.equal(resolveBase([], { pushBase: () => null, exists: (r) => r === 'origin/concept2cure-v2' }), 'origin/concept2cure-v2');
  assert.equal(resolveBase([], { pushBase: () => 'origin/x', exists: () => true }), 'origin/x');
  assert.equal(resolveBase([], { pushBase: () => null, exists: () => false }), null);
});

test("a gate's script files are found through package.json", () => {
  assert.deepEqual(gateFiles([{ id: 'ci:a' }, { id: 'scripts/ci/check-b.mjs' }], { 'ci:a': 'node scripts/ci/check-a.mjs --strict' }),
    ['scripts/ci/check-a.mjs', 'scripts/ci/check-b.mjs']);
});

test('reports are written back exactly as they were, a pusher\'s own edit included; unchanged ones are not touched', () => {
  const disk = new Map([['docs/reports/a.json', Buffer.from('gate wrote this')], ['docs/reports/b.json', Buffer.from('same')]]);
  const snap = new Map([['docs/reports/a.json', Buffer.from('pusher draft, uncommitted')], ['docs/reports/b.json', Buffer.from('same')]]);
  const written = [];
  const restored = restoreReports(snap, { read: (f) => disk.get(f), write: (f, b) => { written.push(f); disk.set(f, b); } });
  assert.deepEqual(restored, ['docs/reports/a.json']);
  assert.deepEqual(written, ['docs/reports/a.json']);
  assert.equal(disk.get('docs/reports/a.json').toString(), 'pusher draft, uncommitted');
});
