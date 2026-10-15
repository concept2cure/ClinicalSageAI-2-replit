#!/usr/bin/env node
// P1-12 fix round: each mutant is a one-line bypass of a property the P1-12
// contract tests claim to pin. It is applied to a COPY of .github/workflows and
// the suite is run over the copy (CI_CONTRACT_WORKFLOWS_DIR). A mutant the suite
// does not fail is a property the suite does not pin.
//
//   node mutants.mjs <suite-root> [<vitest-config>]
//
// <suite-root> holds tests/ci/{ci-honesty,deploy-refuses-unproven-sha}.contract.test.ts
// and the harness they import: the repository root for the suite as it is now,
// or a copy of the suite as it was, to show the mutants surviving it.
// Exit 0 only when the unmutated workflows pass and every mutant is killed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const SUITE = path.resolve(process.argv[2] ?? REPO);
const CONFIG = process.argv[3] ? path.resolve(process.argv[3]) : null;
const FILES = ['tests/ci/ci-honesty.contract.test.ts', 'tests/ci/deploy-refuses-unproven-sha.contract.test.ts'];

const say = (line) => process.stdout.write(`${line}\n`);
const after = (anchor, line) => ({ from: anchor, to: `${anchor}${line}` });
const PUSH_STEP_IF = "        id: api-push\n        if: ${{ github.event.inputs.deploy_api != 'false' }}\n";
const SCAN_IF = "        # a reason and an expiry, not a blanket flag.\n        if: ${{ !cancelled() && github.event.inputs.deploy_api != 'false' }}\n";
const VERDICT_STEP = '      - name: Require a green CI, Semgrep and CodeQL run for this SHA\n';
const BLOCKING = '      - name: Blocking scan — nothing the baseline commit did not already have\n';
const SEMGREP_PUSH = "  push:\n    branches: ['concept2cure-v2', 'main', 'master']\n";

// [id, file, what the bypass does, edit]
const MUTANTS = [
  ['a1-blocking-scan-pr-only', 'semgrep.yml', 'Blocking scan skipped on every push',
    after(BLOCKING, "        if: github.event_name == 'pull_request'\n")],
  ['a2-blocking-scan-push-only', 'semgrep.yml', 'Blocking scan skipped on every pull request',
    after(BLOCKING, "        if: github.event_name == 'push'\n")],
  ['a3-semgrep-job-pr-only', 'semgrep.yml', 'the whole Semgrep job skipped on every push',
    after('    name: Analyze (Semgrep)\n', "    if: github.event_name != 'push'\n")],
  ['a4-blocking-scan-continue', 'semgrep.yml', 'Blocking scan failure ignored',
    after(BLOCKING, '        continue-on-error: true\n')],
  ['b1-gate-or-true', 'ci.yml', '`|| true` after ci:upload-guards',
    { from: '          npm run ci:upload-guards\n', to: '          npm run ci:upload-guards || true\n' }],
  ['b2-single-gate-or-true', 'ci.yml', '`|| true` after ci:server-error-leaks',
    { from: '        run: npm run ci:server-error-leaks\n', to: '        run: npm run ci:server-error-leaks || true\n' }],
  ['b3-set-plus-e', 'ci.yml', '`set +e` at the top of the pre-push gates step',
    { from: '          npm run ci:unauthenticated-fetch:selftest\n', to: '          set +e\n          npm run ci:unauthenticated-fetch:selftest\n' }],
  ['b4-gate-piped', 'ci.yml', 'ci:migration-drop-safety piped into tee (bash -e has no pipefail)',
    { from: '          npm run ci:migration-drop-safety\n', to: '          npm run ci:migration-drop-safety | tee /dev/null\n' }],
  ['c1-verdict-job-continue', 'deploy-aws.yml', 'ci-verdict job continue-on-error',
    after('    name: CI passed for this commit\n', '    continue-on-error: true\n')],
  ['c2-verdict-step-continue', 'deploy-aws.yml', 'ci-verdict github-script step continue-on-error',
    after(VERDICT_STEP, '        continue-on-error: true\n')],
  ['c3-verdict-step-skipped', 'deploy-aws.yml', 'ci-verdict step skipped (a skipped step passes the job)',
    after(VERDICT_STEP, "        if: github.event_name == 'pull_request'\n")],
  ['c4-build-push-always', 'deploy-aws.yml', 'build-push runs after a red ci-verdict',
    { from: "    if: ${{ github.event.inputs.deploy_api == 'true' || startsWith(github.ref, 'refs/tags/v') }}\n",
      to: "    if: ${{ always() && (github.event.inputs.deploy_api == 'true' || startsWith(github.ref, 'refs/tags/v')) }}\n" }],
  ['c5-deploy-frontend-always', 'deploy-aws.yml', 'deploy-frontend runs after a red ci-verdict',
    { from: "    if: ${{ github.event.inputs.deploy_frontend != 'false' }}\n",
      to: "    if: ${{ always() && github.event.inputs.deploy_frontend != 'false' }}\n" }],
  ['d1-push-always', 'deploy-aws.yml', 'push step runs after a failed scan (always())',
    { from: PUSH_STEP_IF, to: "        id: api-push\n        if: ${{ always() && github.event.inputs.deploy_api != 'false' }}\n" }],
  ['d2-push-not-cancelled', 'deploy-aws.yml', 'push step runs after a failed scan (!cancelled())',
    { from: PUSH_STEP_IF, to: "        id: api-push\n        if: ${{ !cancelled() && github.event.inputs.deploy_api != 'false' }}\n" }],
  ['d3-scan-skipped', 'deploy-aws.yml', 'image scan skipped, push runs unscanned',
    { from: SCAN_IF, to: "        # a reason and an expiry, not a blanket flag.\n        if: github.event_name == 'pull_request'\n" }],
  ['e1-semgrep-no-pull-request', 'semgrep.yml', 'semgrep.yml no longer triggers on pull requests',
    { from: "  pull_request:\n    branches: ['concept2cure-v2', 'main', 'master']\n", to: '' }],
  ['e2-semgrep-push-paths', 'semgrep.yml', 'semgrep.yml push filtered to server/**',
    after(SEMGREP_PUSH, "    paths: ['server/**']\n")],
  ['e3-semgrep-push-paths-ignore', 'semgrep.yml', 'semgrep.yml push ignores *.ts',
    after(SEMGREP_PUSH, "    paths-ignore: ['**/*.ts']\n")],
];

function runSuite(dir) {
  const out = path.join(dir, 'result.json');
  const args = ['run', ...(CONFIG ? ['--config', CONFIG] : []), '--root', SUITE, ...FILES, '--reporter=json', `--outputFile=${out}`];
  spawnSync(path.join(REPO, 'node_modules/.bin/vitest'), args, {
    cwd: SUITE, encoding: 'utf8', env: { ...process.env, CI_CONTRACT_WORKFLOWS_DIR: dir },
  });
  if (!fs.existsSync(out)) return { failed: NaN, passed: NaN, names: ['(vitest wrote no result)'] };
  const r = JSON.parse(fs.readFileSync(out, 'utf8'));
  const names = r.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed').map((a) => a.title));
  return { failed: r.numFailedTests, passed: r.numPassedTests, names };
}

function withWorkflows(edit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-12-mutant-'));
  fs.cpSync(path.join(REPO, '.github/workflows'), dir, { recursive: true });
  if (edit) {
    const file = path.join(dir, edit.file);
    const text = fs.readFileSync(file, 'utf8');
    const count = text.split(edit.from).length - 1;
    if (count !== 1) throw new Error(`${edit.id}: anchor found ${count} times in ${edit.file}`);
    fs.writeFileSync(file, text.replace(edit.from, edit.to));
  }
  try {
    return runSuite(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

say(`suite: ${SUITE}${CONFIG ? ` (config ${CONFIG})` : ''}\nworkflows: ${REPO}/.github/workflows, mutated per row\n`);
const base = withWorkflows(null);
say(`unmutated: ${base.failed} failed, ${base.passed} passed${base.failed ? ` — ${base.names.join(' | ')}` : ''}\n`);
let survived = 0;
for (const [id, file, why, edit] of MUTANTS) {
  const r = withWorkflows({ id, file, ...edit });
  const killed = r.failed > 0;
  if (!killed) survived += 1;
  say(`${killed ? 'KILLED  ' : 'SURVIVED'} ${id.padEnd(30)} ${file.padEnd(15)} ${String(r.failed).padStart(3)} failed ${String(r.passed).padStart(3)} passed — ${why}`);
  for (const n of r.names.slice(0, 4)) say(`           ✗ ${n}`);
  if (r.names.length > 4) say(`           … and ${r.names.length - 4} more`);
}
say(`\n${MUTANTS.length - survived}/${MUTANTS.length} mutants killed; ${survived} survived.`);
process.exit(base.failed === 0 && survived === 0 ? 0 : 1);
