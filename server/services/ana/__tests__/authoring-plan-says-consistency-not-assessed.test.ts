/**
 * An authoring plan for a project with no consistency scan result on record
 * says its contradiction list was not assessed (2026-10-15, finding 7 at its
 * consumer).
 *
 * What the code used to do: such a project reached the plan as an empty
 * contradiction list, read exactly like a project that was scanned and found
 * clean. The readiness aggregate now names consistency in notAssessed; the
 * plan carries that as an info risk factor and in its summary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getProjectReadinessAggregate = vi.fn();
const listConsistencyAlerts = vi.fn();

vi.mock('../project-readiness-aggregator.js', () => ({
  getProjectReadinessAggregate: (...args: unknown[]) => getProjectReadinessAggregate(...args),
}));
vi.mock('../../intelligence/cross-artifact-consistency-scanner.js', () => ({
  listConsistencyAlerts: (...args: unknown[]) => listConsistencyAlerts(...args),
}));
vi.mock('../citation-graph.js', () => ({ getProjectCitationGraph: async () => null }));
vi.mock('../therapeutic-area-context.js', () => ({
  getProjectTherapeuticContext: async () => ({
    projectId: 1,
    organizationId: 100,
    therapeuticArea: null,
    profile: null,
    contextBlock: '',
    retrievalBoost: '',
  }),
}));
vi.mock('../../ragRouter.js', () => ({ ragRouter: { retrieve: vi.fn() } }));

import { generateAuthoringPlan } from '../authoring-plan-generator.js';

const OPTS = {
  projectId: 1,
  organizationId: 100,
  ctdSection: '3.2.P.5',
  submissionType: 'IND' as const,
  persist: false as const,
};

function readiness(notAssessed: Array<{ component: string; reason: string; detail: string }>) {
  return {
    projectId: 1,
    organizationId: 100,
    asOf: '2026-10-15T00:00:00.000Z',
    score: 60,
    measuredWeight: notAssessed.length ? 0.8 : 1,
    notAssessed,
    filingBlocking: false,
    components: {},
    nextActions: [],
    inputs: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listConsistencyAlerts.mockResolvedValue({ rows: [], total: 0 });
});

describe('generateAuthoringPlan with no consistency scan on record', () => {
  it('says the contradiction list was not assessed', async () => {
    getProjectReadinessAggregate.mockResolvedValue(
      readiness([
        {
          component: 'consistency',
          reason: 'no_scan_on_record',
          detail: 'Not assessed: no cross-artifact consistency scan result is on record for this project.',
        },
      ]),
    );
    const plan = await generateAuthoringPlan(OPTS);
    const factor = plan.riskFactors.find(r => r.id === 'consistency-not-assessed');
    expect(factor).toMatchObject({ source: 'consistency', severity: 'info' });
    expect(factor!.message).toMatch(/not because none exist/);
    expect(plan.summary).toContain('contradictions not assessed (no consistency scan result on record)');
    expect(plan.contradictions).toEqual([]);
  });

  it('adds nothing when consistency was assessed', async () => {
    getProjectReadinessAggregate.mockResolvedValue(readiness([]));
    const plan = await generateAuthoringPlan(OPTS);
    expect(plan.riskFactors.find(r => r.id === 'consistency-not-assessed')).toBeUndefined();
    expect(plan.summary).not.toMatch(/not assessed/);
  });
});
