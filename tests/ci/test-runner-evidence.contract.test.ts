/** Full-suite evidence must survive unavailable GitHub log downloads. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import config from '../../vitest.config';
import { readWorkflow, stepNamed } from './workflow-harness';

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

  it.each(['test', 'integration-tests'])('%s saves results even when the test step fails', (job) => {
    const steps = workflow.jobs[job].steps ?? [];
    const run = steps.find((step) => /Run (integration )?tests/.test(step.name ?? ''));
    expect(run?.run).toBe('npm test');
    expect(run?.['continue-on-error']).not.toBe(true);
    const upload = steps.find((step) => step.with?.name === `${job}-results`);
    expect(upload?.if).toBe('always()');
    expect(upload?.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
    expect(upload?.with?.path).toBe('test-results/');
  });

  it('retains coverage test verdicts while leaving the coverage ratchet strict', () => {
    const measure = stepNamed(workflow, 'coverage', 'Measure coverage');
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
