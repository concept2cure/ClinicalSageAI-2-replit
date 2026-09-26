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

type Step = { name?: string; uses?: string; if?: string; run?: string; with?: Record<string, unknown> };
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

/**
 * What the scans may leave out is named file by file. DS002 (image runs as root)
 * was suppressed for the whole tree in `.trivyignore`, for the sake of one
 * vendored image that is never built; it now skips that file alone. A wider
 * skip (a directory, a glob) hides every finding under it, including the next
 * Dockerfile or Terraform module added there. The exception checks run in the
 * same job: an inline `#trivy:ignore` moved off its block applied to nothing
 * after abc1c99a5, and only CI's Trivy noticed.
 */
const ALLOWED_SKIP_DIRS = ['node_modules'];
const ALLOWED_SKIP_FILES = ['.claude/skills/gstack/.github/docker/Dockerfile.ci'];

function jobSteps(file: string): Array<{ job: string; steps: Step[] }> {
  const wf = loadYaml(fs.readFileSync(path.join(ROOT, file), 'utf8')) as Workflow;
  return Object.entries(wf.jobs).map(([job, def]) => ({ job, steps: def.steps ?? [] }));
}

const list = (v: unknown) =>
  String(v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

describe('Trivy exceptions are narrow and checked', () => {
  for (const file of WORKFLOWS) {
    it(`${file}: the scans skip only the named directories and files`, () => {
      for (const { job, step } of trivySteps(file)) {
        for (const d of list(step.with?.['skip-dirs'])) {
          expect(ALLOWED_SKIP_DIRS, `${file} › ${job} › "${step.name}" skips directory ${d}`).toContain(d);
        }
        for (const f of list(step.with?.['skip-files'])) {
          expect(ALLOWED_SKIP_FILES, `${file} › ${job} › "${step.name}" skips file ${f}`).toContain(f);
          expect(fs.existsSync(path.join(ROOT, f)), `${f} is skipped but no longer exists; drop the exception`).toBe(true);
        }
      }
    });

    it(`${file}: a job that runs a Trivy scan checks the exceptions first`, () => {
      for (const { job, steps } of jobSteps(file)) {
        const firstScan = steps.findIndex((s) => (s.uses ?? '').startsWith('aquasecurity/trivy-action'));
        if (firstScan < 0) continue;
        const before = steps.slice(0, firstScan).map((s) => s.run ?? '').join('\n');
        for (const cmd of [
          'check-trivy-inline-ignores.mjs --selftest',
          'check-trivy-inline-ignores.mjs\n',
          'check-trivyignore-hygiene.mjs --selftest',
          'check-trivyignore-hygiene.mjs\n',
        ]) {
          expect(`${before}\n`, `${file} › ${job} does not run "${cmd.trim()}" before its scans`).toContain(cmd);
        }
      }
    });
  }
});
