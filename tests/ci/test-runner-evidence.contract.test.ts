/** Full-suite evidence must survive unavailable GitHub log downloads. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import config from '../../vitest.config';
import { readWorkflow, stepNamed } from './workflow-harness';
import { evaluateIf } from './workflow-expression';

const root = path.resolve(__dirname, '..', '..');
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
const workflow = readWorkflow('ci.yml');

describe('bounded test execution and retained CI evidence', () => {
  it('uses the supported Vitest 4 worker controls, not removed pool options', () => {
    expect(config.test?.pool).toBe('forks');
    expect(config.test?.maxWorkers).toBe(1);
    expect(config.test?.fileParallelism).toBe(false);
    expect(config.test).not.toHaveProperty('poolOptions');
  });

  it('retains both runners in npm test and writes structured results without masking failures', () => {
    expect(scripts.test).toMatch(/^mkdir -p test-results && jest /);
    expect(scripts.test).toContain('jest --config scripts/jest.config.js');
    expect(scripts.test).toContain('--json --outputFile=test-results/jest.json');
    expect(scripts.test).toContain('&&');
    expect(scripts.test).toContain('vitest run --config vitest.config.ts');
    expect(scripts.test).toContain('--reporter=verbose --reporter=json');
    expect(scripts.test).toContain('--outputFile=test-results/vitest.json');
    expect(scripts.test).not.toMatch(/\|\|\s*true|exit\s+0/);
  });

  // MR-02 Stage 3: the suite runs in four shards, each the same `npm test` with
  // Vitest's --shard (and, since 2026-11-10, three files at a time in CI only:
  // the config above stays one at a time), and the `test` job is their verdict.
  it('each Test shard runs npm test on its shard and saves results even when it fails', () => {
    const shard = workflow.jobs['test-shard'];
    expect(shard.strategy?.matrix?.shard).toEqual([1, 2, 3, 4]);
    expect(shard.strategy?.['fail-fast']).toBe(false);
    const run = stepNamed(workflow, 'test-shard', 'Run tests');
    expect(run.run).toBe('npm test -- --shard=${{ matrix.shard }}/4 --maxWorkers=3 --fileParallelism');
    expect(run['continue-on-error']).not.toBe(true);
    const upload = stepNamed(workflow, 'test-shard', 'Upload shard test results');
    expect(upload.if).toBe('always()');
    expect(upload.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
    expect(upload.with?.name).toBe('test-results-shard-${{ matrix.shard }}');
    expect(upload.with?.path).toBe('test-results/');
  });

  it('Test is green only through the shard merge, which reads every shard and the shard jobs\' result', () => {
    const job = workflow.jobs.test;
    expect(job.name).toBe('Test');
    expect(job.needs).toEqual(expect.arrayContaining(['lint', 'test-shard']));
    const merge = stepNamed(workflow, 'test', 'Every collected file ran once and every shard passed');
    expect(merge.run).toBe('node scripts/ci/merge-test-shards.mjs --shards 4 --dir shards --out test-results');
    expect(merge.env?.SHARD_JOBS_RESULT).toBe('${{ needs.test-shard.result }}');
    expect(merge['continue-on-error']).not.toBe(true);
    // The merge's --shards must equal the matrix, or a shard is never read.
    expect(merge.run).toContain(`--shards ${workflow.jobs['test-shard'].strategy.matrix.shard.length} `);
    const upload = stepNamed(workflow, 'test', 'Upload core test results');
    expect(upload.if).toBe('always()');
    expect(upload.with?.name).toBe('test-results');
    expect(upload.with?.path).toBe('test-results/');
  });

  it('integration-tests runs the files RUN_INTEGRATION_TESTS enables, not the Test suite again, and saves results', () => {
    const run = stepNamed(workflow, 'integration-tests', 'Run integration tests');
    expect(run.run).not.toMatch(/^npm test/m);
    expect(run.run).toContain('process\\.env\\.RUN_INTEGRATION_TESTS');
    expect(run.run).toContain('vitest run --config vitest.config.ts --reporter=verbose --reporter=json --outputFile=test-results/vitest.json');
    expect(run.run).toMatch(/-eq 0 \]; then[\s\S]*exit 1/);
    expect(run.env?.RUN_INTEGRATION_TESTS).toBe('true');
    expect(run['continue-on-error']).not.toBe(true);
    const upload = stepNamed(workflow, 'integration-tests', 'Upload integration test results');
    expect(upload.if).toBe('always()');
    expect(upload.with?.name).toBe('integration-tests-results');
    expect(upload.with?.path).toBe('test-results/');
  });

  // MR-02 Stage 3, 2026-11-12: the re-render re-lints the whole tree (about 2
  // minutes), and with `if: failure()` it ran whenever ANY earlier Lint step
  // had failed — on every push while any guardrail was red.
  it('re-renders ESLint findings only when ESLint itself failed', () => {
    const eslint = stepNamed(workflow, 'lint', 'Run ESLint');
    const render = stepNamed(workflow, 'lint', 'Render ESLint findings (failure only)');
    expect(eslint.id).toBe('eslint');
    const at = (anyFailed: boolean, eslintOutcome: string) =>
      evaluateIf(render.if, {
        status: { success: !anyFailed, failure: anyFailed, cancelled: false },
        contexts: { steps: { eslint: { outcome: eslintOutcome, conclusion: eslintOutcome } } },
      });
    expect(at(true, 'failure')).toBe(true);
    expect(at(true, 'success')).toBe(false);
    expect(at(false, 'success')).toBe(false);
  });

  it('retains coverage test verdicts while leaving the coverage ratchet strict', () => {
    const measure = stepNamed(workflow, 'coverage', 'Measure coverage');
    // Nightly since 2026-10-30: the eight shards' blobs, merged, then the ratchet.
    expect(measure.run).toContain('--merge-reports');
    expect(workflow.jobs.coverage.needs).toEqual(expect.arrayContaining(['lint', 'coverage-shard']));
    expect(stepNamed(workflow, 'coverage-shard', 'Measure coverage (shard)').run).toContain('--shard=${{ matrix.shard }}/8 --reporter=blob --coverage');
    expect(measure.run).toContain('--reporter=verbose --reporter=json');
    expect(measure.run).toContain('--outputFile=test-results/vitest-coverage.json');
    const gate = stepNamed(workflow, 'coverage', 'Coverage may not go down');
    expect(gate.run).toBe('npm run ci:coverage-ratchet');
    expect(gate['continue-on-error']).not.toBe(true);
    const upload = stepNamed(workflow, 'coverage', 'Upload coverage report');
    expect(upload.if).toBe('always()');
    expect(upload.with?.path).toContain('coverage/');
    expect(upload.with?.path).toContain('test-results/');
  });
});
