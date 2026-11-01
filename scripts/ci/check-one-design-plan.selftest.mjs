#!/usr/bin/env node
/**
 * ci:one-design-plan:selftest — the gate refuses each thing it exists to refuse,
 * and accepts work inside the plan (CLAUDE.md: "verify by making the check fail").
 *
 * Part 1 drives the pure core with the cases one by one. Part 2 builds a real git
 * repository in a temp directory — the ledger committed, then commits on top —
 * and runs the git layer, so the trailer, scope and new-screen checks are proven
 * on git history and not only on objects.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { anaToolNames, evaluateCommit, globToRegExp, run, ANA_TOOL_INVENTORY, LEDGER_PATH } from './check-one-design-plan.mjs';

let failed = 0;
const expect = (label, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failed += 1;
};

const ledger = {
  alwaysAllowed: ['**/__tests__/**', 'docs/evidence/**', '.design/**'],
  planFiles: ['docs/design/ONE_DESIGN_PLAN.md', LEDGER_PATH, 'CLAUDE.md', 'AGENTS.md'],
  packages: [
    { id: 'D0', status: 'open', dependsOn: [], paths: ['client/src/concept2cure/v2/styles/**', 'client/src/concept2cure/v2/ui/**'] },
    { id: 'D3', status: 'queued', dependsOn: ['D0'], paths: ['client/src/concept2cure/v2/surfaces/Project*.tsx'] },
    { id: 'F1', status: 'open', dependsOn: [], paths: ['**'] },
    { id: 'PLAN', status: 'open', dependsOn: [], paths: ['**'] },
  ],
  approvedAdditions: [{ kind: 'surface', name: 'approved-screen', package: 'F1' }],
};
const commit = (message, files, additions = [], extra = {}) => ({ sha: 'deadbeefcafe', message, files: files.map((p) => ({ status: 'M', path: p })), additions, ...extra });
const after6 = { completesRequired: true, completesMissing: [] };
const refused = (c, pattern) => evaluateCommit(ledger, c).some((f) => pattern.test(f.reason));
const accepted = (c) => evaluateCommit(ledger, c).length === 0;

console.log('Part 1 — the cases');
expect('globs: ** spans folders, * stays in one', globToRegExp('client/**').test('client/a/b/c.tsx') && !globToRegExp('client/*.tsx').test('client/a/b.tsx') && globToRegExp('a/**/x.ts').test('a/x.ts'));
expect('refuses a commit that names no package', refused(commit('Fix a thing', ['client/x.ts']), /names no package/));
expect('refuses a package the plan does not have', refused(commit('X\n\nPlan: Z9', ['client/x.ts']), /does not have/));
expect('refuses a queued package', refused(commit('X\n\nPlan: D3', ['client/src/concept2cure/v2/surfaces/ProjectHome.tsx']), /queued/));
expect('refuses files outside the package', refused(commit('X\n\nPlan: D0', ['client/src/concept2cure/v2/styles/a.css', 'server/routes/x.ts']), /outside package D0: server\/routes\/x\.ts/));
expect('accepts files inside the package, plus tests and evidence', accepted(commit('X\n\nPlan: D0', ['client/src/concept2cure/v2/styles/a.css', 'client/src/concept2cure/v2/__tests__/a.test.tsx', 'docs/evidence/DESIGN/D0/README.md'])));
expect('refuses a new screen the plan does not approve', refused(commit('X\n\nPlan: F1', ['shared/constants/ui-surface-registry.ts'], [{ kind: 'surface', name: 'brand-new-screen' }]), /adds a surface "brand-new-screen"/));
expect('refuses a new API mount the plan does not approve', refused(commit('X\n\nPlan: F1', ['server/bootstrap/x.ts'], [{ kind: 'mount', name: '/api/new-thing' }]), /adds a mount/));
expect('refuses a new table the plan does not approve', refused(commit('X\n\nPlan: F1', ['migrations/x.sql'], [{ kind: 'table', name: 'public.new_table' }]), /adds a table/));
expect('accepts an addition the plan approves under that package', accepted(commit('X\n\nPlan: F1', ['shared/constants/ui-surface-registry.ts'], [{ kind: 'surface', name: 'approved-screen' }])));
expect('refuses an approved addition under another package', refused(commit('X\n\nPlan: PLAN\nFounder-Decision: P-78', ['shared/constants/ui-surface-registry.ts'], [{ kind: 'surface', name: 'approved-screen' }]), /does not approve under PLAN/));
expect('refuses a plan change outside PLAN', refused(commit('X\n\nPlan: F1', ['CLAUDE.md']), /changes the plan/));
expect('refuses a plan change without a founder decision', refused(commit('X\n\nPlan: PLAN', ['docs/design/ONE_DESIGN_PLAN.md']), /Founder-Decision/));
expect('accepts a plan change under PLAN with a founder decision', accepted(commit('X\n\nPlan: PLAN\nFounder-Decision: P-78', ['docs/design/ONE_DESIGN_PLAN.md', LEDGER_PATH])));

console.log('Part 1b — RULE 6: nothing new, finish what exists');
expect('refuses a commit that names nothing it completes', refused(commit('X\n\nPlan: F1', ['client/x.ts'], [], after6), /names nothing it completes/));
expect('refuses a Completes trailer naming nothing that existed', refused(commit('X\n\nPlan: F1\nCompletes: client/gone.ts', ['client/x.ts'], [], { completesRequired: true, completesMissing: ['client/gone.ts'] }), /names nothing that existed/));
expect('accepts a commit that names what it completes', accepted(commit('X\n\nPlan: F1\nCompletes: client/x.ts', ['client/x.ts'], [], after6)));
expect('a PLAN commit needs no Completes trailer', accepted(commit('X\n\nPlan: PLAN\nFounder-Decision: P-80', [LEDGER_PATH], [], after6)));
expect('a commit before RULE 6 is not asked for one', accepted(commit('X\n\nPlan: F1', ['client/x.ts'])));
expect('refuses a new route file', refused(commit('X\n\nPlan: F1\nCompletes: server/routes', ['server/routes/new-thing.ts'], [{ kind: 'route', name: 'server/routes/new-thing.ts' }], after6), /adds a route "server\/routes\/new-thing\.ts"/));
expect('refuses a new service', refused(commit('X\n\nPlan: F1\nCompletes: server/services', ['server/services/new-engine/a.ts'], [{ kind: 'service', name: 'server/services/new-engine' }], after6), /adds a service/));
expect('refuses a new AnA tool', refused(commit('X\n\nPlan: F1\nCompletes: server/services/ana', [ANA_TOOL_INVENTORY], [{ kind: 'ana-tool', name: 'brand_new_tool' }], after6), /adds a ana-tool "brand_new_tool"/));
expect('reads every AnA tool name, in scope and held', [...anaToolNames(JSON.stringify({ tools: { inScope: ['a'], hiddenApp: [{ surfaces: ['s'], names: ['b'] }] } }))].sort().join() === 'a,b');

console.log('Part 2 — real git history');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-design-plan-'));
const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
try {
  g('init', '-q'); g('config', 'user.email', 'selftest@example.test'); g('config', 'user.name', 'selftest'); g('config', 'commit.gpgsign', 'false');
  write('README.md', 'base\n'); g('add', '.'); g('commit', '-q', '-m', 'Before the plan: not judged');
  const base = g('rev-parse', 'HEAD').trim();
  write(LEDGER_PATH, JSON.stringify(ledger)); g('add', '.'); g('commit', '-q', '-m', 'The plan\n\nPlan: PLAN\nFounder-Decision: P-78');
  write('client/src/concept2cure/v2/styles/a.css', '.x{}\n'); g('add', '.'); g('commit', '-q', '-m', 'Inside the plan\n\nPlan: D0');
  let r = run({ cwd: dir, range: `${base}..HEAD` });
  expect('git: commits inside the plan pass (the intro itself is not judged)', r.findings.length === 0 && r.checked === 1);

  write('server/routes/x.ts', 'export {};\n'); g('add', '.'); g('commit', '-q', '-m', 'Untrailered work');
  r = run({ cwd: dir, range: `${base}..HEAD` });
  expect('git: an untrailered commit is refused', r.findings.some((f) => /names no package/.test(f.reason)));
  g('reset', '-q', '--hard', 'HEAD~1');

  write('shared/constants/ui-surface-registry.ts', "export const UI_SURFACES = [\n  {\n    id: 'brand-new-screen',\n  },\n];\n"); g('add', '.'); g('commit', '-q', '-m', 'A new screen\n\nPlan: F1');
  r = run({ cwd: dir, range: `${base}..HEAD` });
  expect('git: a new UI_SURFACES id is read from history and refused', r.findings.some((f) => /adds a surface "brand-new-screen"/.test(f.reason)));
  g('reset', '-q', '--hard', 'HEAD~1');

  write('migrations/20990101_new.sql', 'CREATE TABLE IF NOT EXISTS public.brand_new (id int);\n'); g('add', '.'); g('commit', '-q', '-m', 'A new table\n\nPlan: F1');
  r = run({ cwd: dir, range: `${base}..HEAD` });
  expect('git: a new table in a new migration is refused', r.findings.some((f) => /adds a table "public.brand_new"/.test(f.reason)));
  g('reset', '-q', '--hard', 'HEAD~1');

  // RULE 6 starts at the commit that puts "completesRequired" into the ledger.
  // Work that existed before RULE 6, including a new service, is judged by the rules of its own time.
  write('server/services/vault/existing.ts', 'export {};\n'); write(ANA_TOOL_INVENTORY, JSON.stringify({ tools: { inScope: ['old_tool'], hiddenApp: [] } }));
  g('add', '.'); g('commit', '-q', '-m', 'Existing work\n\nPlan: F1');
  write(LEDGER_PATH, JSON.stringify({ ...ledger, completesRequired: true })); g('add', '.'); g('commit', '-q', '-m', 'RULE 6\n\nPlan: PLAN\nFounder-Decision: P-80');
  r = run({ cwd: dir, range: `${base}..HEAD` });
  expect('git: commits before RULE 6, and RULE 6 itself, are not asked to name what they complete', r.findings.length === 0);

  const attempt = (label, files, message, pattern) => {
    for (const [file, text] of Object.entries(files)) write(file, text);
    g('add', '.'); g('commit', '-q', '-m', message);
    const res = run({ cwd: dir, range: `${base}..HEAD` });
    expect(label, pattern ? res.findings.some((f) => pattern.test(f.reason)) : res.findings.length === 0);
    g('reset', '-q', '--hard', 'HEAD~1');
  };
  attempt('git: after RULE 6, a commit that names nothing it completes is refused', { 'server/services/vault/existing.ts': 'export const a = 1;\n' }, 'Work\n\nPlan: F1', /names nothing it completes/);
  attempt('git: a Completes trailer naming a path that did not exist is refused', { 'server/services/vault/existing.ts': 'export const a = 1;\n' }, 'Work\n\nPlan: F1\nCompletes: server/services/vault/ghost.ts', /names nothing that existed/);
  attempt('git: finishing an existing file, named, is accepted', { 'server/services/vault/existing.ts': 'export const a = 1;\n' }, 'Work\n\nPlan: F1\nCompletes: server/services/vault/existing.ts', null);
  attempt('git: a new file inside an existing service folder is accepted', { 'server/services/vault/split.ts': 'export {};\n' }, 'Split\n\nPlan: F1\nCompletes: server/services/vault', null);
  attempt('git: a new route file is refused', { 'server/routes/new-thing.ts': 'export {};\n' }, 'Route\n\nPlan: F1\nCompletes: README.md', /adds a route "server\/routes\/new-thing\.ts"/);
  attempt('git: a new service folder is refused', { 'server/services/new-engine/a.ts': 'export {};\n' }, 'Engine\n\nPlan: F1\nCompletes: README.md', /adds a service "server\/services\/new-engine"/);
  attempt('git: a new AnA tool in the inventory is refused', { [ANA_TOOL_INVENTORY]: JSON.stringify({ tools: { inScope: ['old_tool', 'brand_new_tool'], hiddenApp: [] } }) }, 'Tool\n\nPlan: F1\nCompletes: README.md', /adds a ana-tool "brand_new_tool"/);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error(`\nci:one-design-plan:selftest: ${failed} case(s) did not behave.`);
  process.exit(1);
}
console.log('\nci:one-design-plan:selftest: every case behaves.');
