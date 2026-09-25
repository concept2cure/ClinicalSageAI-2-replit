/**
 * The blocking Trivy scans run even when an earlier step in their job failed.
 *
 * Security audit 2026-09-24, INF-08 (plan P0-16, the `if: always()` half): the
 * fs and config scans had no condition, so any earlier failed step skipped
 * them (observed in CI run 35850422925). A red job then reported one failure
 * and hid whether the image or the infrastructure also carried a HIGH or
 * CRITICAL finding. That is the answer the deploy's security gate exists to
 * give before build-push.
 *
 * `!cancelled()` rather than `always()`: it runs after a failure, and not after
 * someone cancels the run.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';

const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/deploy-aws.yml'];

type Step = { name?: string; uses?: string; if?: string };
type Workflow = { jobs: Record<string, { steps?: Step[] }> };

function trivySteps(file: string): Array<{ job: string; step: Step }> {
  const wf = loadYaml(fs.readFileSync(path.join(ROOT, file), 'utf8')) as Workflow;
  return Object.entries(wf.jobs).flatMap(([job, def]) =>
    (def.steps ?? []).filter((s) => (s.uses ?? '').startsWith('aquasecurity/trivy-action')).map((step) => ({ job, step })),
  );
}

describe('Trivy scans are not skipped by an earlier failure', () => {
  for (const file of WORKFLOWS) {
    it(`${file}: every Trivy step runs unless the run was cancelled`, () => {
      const steps = trivySteps(file);
      expect(steps.length, `${file} has no Trivy step; has the scan moved?`).toBeGreaterThan(0);
      for (const { job, step } of steps) {
        const cond = String(step.if ?? '');
        expect(
          /!\s*cancelled\(\)|always\(\)/.test(cond),
          `${file} › ${job} › "${step.name}" has no if: !cancelled() — an earlier failed step skips it`,
        ).toBe(true);
      }
    });
  }
});
