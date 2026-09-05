/**
 * Tests for the authoring-plan generator's fail-closed handling of a
 * failed readiness / consistency fetch (CLAUDE.md: "Fail closed, never
 * fabricate. An error is never rendered as an empty result.").
 *
 * A DB hiccup during either fetch must NOT collapse to the same shape
 * as "assessed, found nothing" — that is indistinguishable from a
 * genuinely clean project and would let a transient outage silently
 * produce a confident, filing-ready-looking plan with a normal
 * passing score.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getProjectReadinessAggregate = vi.fn();
const listConsistencyAlerts = vi.fn();
const getProjectCitationGraph = vi.fn();
const getProjectTherapeuticContext = vi.fn();
const ragRetrieve = vi.fn();

vi.mock('../project-readiness-aggregator.js', () => ({
  getProjectReadinessAggregate: (...args: unknown[]) =>
    getProjectReadinessAggregate(...args),
}));
vi.mock('../../intelligence/cross-artifact-consistency-scanner.js', () => ({
  listConsistencyAlerts: (...args: unknown[]) => listConsistencyAlerts(...args),
}));
vi.mock('../citation-graph.js', () => ({
  getProjectCitationGraph: (...args: unknown[]) => getProjectCitationGraph(...args),
}));
vi.mock('../therapeutic-area-context.js', () => ({
  getProjectTherapeuticContext: (...args: unknown[]) =>
    getProjectTherapeuticContext(...args),
}));
vi.mock('../../ragRouter.js', () => ({
  ragRouter: { retrieve: (...args: unknown[]) => ragRetrieve(...args) },
}));

import { generateAuthoringPlan } from '../authoring-plan-generator.js';

const BASE_OPTS = {
  projectId: 1,
  organizationId: 100,
  // No organizationUuid → retrieval is skipped entirely, so this test
  // exercises only the readiness/consistency fetch handling.
  ctdSection: '3.2.P.5',
  submissionType: 'IND' as const,
  persist: false as const,
};

function emptyTherapeuticContext() {
  return {
    projectId: 1,
    organizationId: 100,
    therapeuticArea: null,
    profile: null,
    contextBlock: '',
    retrievalBoost: '',
  };
}

describe('generateAuthoringPlan — fail-closed on a failed risk assessment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectTherapeuticContext.mockResolvedValue(emptyTherapeuticContext());
    getProjectCitationGraph.mockResolvedValue(null);
  });

  it('does NOT report a normal passing score with zero risks when the readiness fetch throws', async () => {
    getProjectReadinessAggregate.mockRejectedValue(new Error('ECONNRESET'));
    listConsistencyAlerts.mockResolvedValue({ rows: [], total: 0 });

    const plan = await generateAuthoringPlan(BASE_OPTS);

    // The defect this guards: a caught fetch failure must not be
    // silently rendered as "assessed, nothing found".
    expect(plan.incompleteAssessment).toBe(true);
    expect(plan.assessmentFailures).toContain('readiness');
    expect(plan.score).toBeNull();

    // An explicit risk factor must say the check FAILED — not that the
    // project is clean.
    const failureRisk = plan.riskFactors.find(
      r => r.id === 'incomplete-readiness-assessment'
    );
    expect(failureRisk).toBeTruthy();
    expect(failureRisk!.severity).toBe('critical');
    expect(failureRisk!.message).toMatch(/fail|FAILED/i);
    expect(plan.riskFactors.length).toBeGreaterThan(0);

    // The summary must call out the incomplete assessment, not read as
    // a clean pass.
    expect(plan.summary).toMatch(/INCOMPLETE ASSESSMENT/);
    expect(plan.summary).toMatch(/FAILED/);
    expect(plan.summary).not.toMatch(/no risks detected/i);
  });

  it('does NOT report a normal passing score when the consistency fetch throws', async () => {
    getProjectReadinessAggregate.mockResolvedValue({
      projectId: 1,
      organizationId: 100,
      asOf: new Date().toISOString(),
      score: 90,
      filingBlocking: false,
      components: {} as any,
      nextActions: [],
      inputs: {} as any,
    });
    listConsistencyAlerts.mockRejectedValue(new Error('pool timeout'));

    const plan = await generateAuthoringPlan(BASE_OPTS);

    expect(plan.incompleteAssessment).toBe(true);
    expect(plan.assessmentFailures).toContain('consistency');
    expect(plan.score).toBeNull();

    const failureRisk = plan.riskFactors.find(
      r => r.id === 'incomplete-consistency-assessment'
    );
    expect(failureRisk).toBeTruthy();
    expect(failureRisk!.severity).toBe('critical');

    // Contradictions must not be fabricated as "none found" without the
    // accompanying failure signal — the array is empty AND the plan is
    // explicitly marked incomplete (not silently clean).
    expect(plan.contradictions).toEqual([]);
    expect(plan.summary).toMatch(/INCOMPLETE ASSESSMENT/);
  });

  it('reports a normal clean state when both fetches succeed with nothing found', async () => {
    getProjectReadinessAggregate.mockResolvedValue({
      projectId: 1,
      organizationId: 100,
      asOf: new Date().toISOString(),
      score: 95,
      filingBlocking: false,
      components: {} as any,
      nextActions: [],
      inputs: {} as any,
    });
    listConsistencyAlerts.mockResolvedValue({ rows: [], total: 0 });

    const plan = await generateAuthoringPlan(BASE_OPTS);

    // The two states are now distinguishable: a genuinely clean project
    // gets a real numeric score and no incomplete-assessment markers.
    expect(plan.incompleteAssessment).toBe(false);
    expect(plan.assessmentFailures).toEqual([]);
    expect(typeof plan.score).toBe('number');
    expect(plan.score).not.toBeNull();
    expect(
      plan.riskFactors.find(r => r.id === 'incomplete-readiness-assessment')
    ).toBeUndefined();
    expect(
      plan.riskFactors.find(r => r.id === 'incomplete-consistency-assessment')
    ).toBeUndefined();
    expect(plan.summary).not.toMatch(/INCOMPLETE ASSESSMENT/);
  });
});
