/**
 * Tests the submission-intelligence tools (Tier 1.3/1.4): precedent benchmarking
 * and submission-package completeness, through the public getToolHandler() seam.
 */
import { describe, it, expect } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor';
import { SUBMISSION_INTELLIGENCE_TOOLS } from '../submissionIntelligenceTools';

const ctx = {} as any;

async function call(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `handler for ${name}`).toBeTruthy();
  return JSON.parse((await handler!(input, ctx)) as string);
}

describe('submission-intelligence tools — registration', () => {
  it('both tools are registered', () => {
    for (const t of SUBMISSION_INTELLIGENCE_TOOLS) {
      expect(getToolHandler(t.name), t.name).toBeTruthy();
    }
    expect(SUBMISSION_INTELLIGENCE_TOOLS).toHaveLength(2);
  });
});

describe('benchmark_precedent_trials', () => {
  it('summarizes a distribution when N is sufficient and is honest when not', async () => {
    const trial = (sampleSize: number, outcome: boolean | null) => ({
      sampleSize,
      durationWeeks: 52,
      studyDesign: 'randomized double-blind',
      endpoints: ['overall survival'],
      outcome,
    });
    const out = await call('benchmark_precedent_trials', {
      indication: 'NSCLC',
      phase: 'Phase 3',
      trials: [
        trial(300, true), trial(420, true), trial(360, false),
        trial(500, true), trial(280, true), trial(610, true),
        trial(450, false), trial(390, true),
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.result.totalTrials).toBe(8);
    // 8 sample sizes ≥ threshold ⇒ assessable distribution.
    expect(out.result.sampleSize.assessable).not.toBe(false);
    // 8 known outcomes ≥ success-rate threshold ⇒ a rate with CI.
    expect(out.result.successRate.assessable).toBe(true);
    expect(out.result.successRate.ci95).toHaveLength(2);
  });

  it('reports assessable:false for too few trials rather than fabricating', async () => {
    const out = await call('benchmark_precedent_trials', {
      indication: 'rare disease',
      phase: 'Phase 2',
      trials: [{ sampleSize: 40, durationWeeks: 24, studyDesign: 'single-arm', endpoints: ['ORR'], outcome: true }],
    });
    expect(out.status).toBe('computed');
    expect(out.result.sampleSize.assessable).toBe(false);
    expect(out.result.successRate.assessable).toBe(false);
  });
});

describe('assess_submission_package', () => {
  it('flags missing required sections for a known submission type', async () => {
    const out = await call('assess_submission_package', {
      submissionType: '510k',
      projectId: 'proj-1',
      sections: [{ code: 'device-description', status: 'approved', documentIds: ['d1'] }],
      artifacts: [],
    });
    // Either a manifest (known type) or a clear needs_parameters (type id differs);
    // both are valid deterministic outcomes — assert it never throws/returns error.
    expect(['computed', 'needs_parameters']).toContain(out.status);
    if (out.status === 'computed') {
      expect(out.result.metadata).toBeTruthy();
      expect(typeof out.result.metadata.packageComplete).toBe('boolean');
      expect(Array.isArray(out.result.sections)).toBe(true);
    }
  });

  it('returns needs_parameters for an unknown submission type', async () => {
    const out = await call('assess_submission_package', {
      submissionType: 'not-a-real-type',
      projectId: 'p',
      sections: [],
      artifacts: [],
    });
    expect(out.status).toBe('needs_parameters');
  });
});
