/**
 * The production-posture jobs run when a guardrail is red.
 *
 * Integration Tests (the real-database suites, RLS on), Blank DB Provisioning,
 * Production Boot Smoke (RLS on, non-superuser role), Coverage, AnA Readiness
 * and AIOS Audit Assets each `needs: lint` for ordering. With no `if:`, a single
 * red guardrail step in Lint SKIPPED every one of them, and a skipped job
 * reports neither pass nor fail. With a dozen lanes adding guardrails, some
 * guardrail was red on every completed trunk run read on 2026-10-01
 * (12708–12726), and in run 12726 all six showed `skipped`: trunk carried no
 * automatic production-shape proof at all. The connector could not issue a
 * grant under enforced RLS from 2026-09-20 until 3bdb50458, and these are the
 * jobs where that class of defect is first visible.
 *
 * `test` already ran after a red Lint, for the reason its comment gives. This
 * pins the same for every job that orders itself after Lint — derived from the
 * workflow, so a job added later with a bare `needs: lint` fails here too —
 * while the jobs that AGGREGATE verdicts stay strict: Build and the release
 * evidence must still refuse when anything they need failed.
 *
 * `!cancelled()` rather than `always()`: it runs after a failure, not after
 * someone cancels the run.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';

const ROOT = path.resolve(__dirname, '..', '..');
const CI = path.join(ROOT, '.github/workflows/ci.yml');

type Job = { name?: string; needs?: string | string[]; if?: string };
const jobs = (loadYaml(fs.readFileSync(CI, 'utf8')) as { jobs: Record<string, Job> }).jobs;

const needsOf = (j: Job) => (Array.isArray(j.needs) ? j.needs : j.needs ? [j.needs] : []);
const runsAfterFailure = (j: Job) => /!\s*cancelled\(\)|always\(\)/.test(String(j.if ?? ''));

/** Jobs whose verdict is the conjunction of others: they must stay strict. */
const AGGREGATES = ['build', 'assemble-release-evidence', 'release-evidence-gate'];

/** The jobs this contract exists for, named so a rename cannot empty the population unnoticed. */
const POSTURE_JOBS = [
  'test',
  'integration-tests',
  'blank-db-provisioning',
  'production-boot-smoke',
  'production-image-boot',
  'coverage',
  'ana-readiness-tests',
  'aios-audit-assets',
];

describe('a red guardrail does not skip the production-posture jobs', () => {
  it('the jobs this contract names still exist, and each orders itself after lint', () => {
    for (const k of POSTURE_JOBS) {
      expect(jobs[k], `${k} is gone from ci.yml; has it been renamed?`).toBeDefined();
      expect(needsOf(jobs[k]), `${k} no longer needs lint`).toContain('lint');
    }
  });

  it('every job that needs lint runs after a red lint, unless it aggregates verdicts', () => {
    const afterLint = Object.entries(jobs).filter(([k, j]) => needsOf(j).includes('lint') && !AGGREGATES.includes(k));
    expect(afterLint.length).toBeGreaterThanOrEqual(POSTURE_JOBS.length);
    const skipped = afterLint.filter(([, j]) => !runsAfterFailure(j)).map(([k, j]) => `${k} (${j.name})`);
    expect(skipped, `a red guardrail would skip: ${skipped.join(', ')}`).toEqual([]);
  });

  it('the aggregates stay strict: Build and the release evidence still refuse on any failure', () => {
    for (const k of AGGREGATES) {
      expect(jobs[k], `${k} is gone from ci.yml`).toBeDefined();
      expect(runsAfterFailure(jobs[k]), `${k} would now run after a failed dependency`).toBe(false);
    }
    expect(needsOf(jobs.build)).toEqual(expect.arrayContaining(['lint', 'test', 'integration-tests']));
    expect(needsOf(jobs['assemble-release-evidence'])).toEqual(
      expect.arrayContaining(['blank-db-provisioning', 'production-boot-smoke', 'build']),
    );
  });
});
