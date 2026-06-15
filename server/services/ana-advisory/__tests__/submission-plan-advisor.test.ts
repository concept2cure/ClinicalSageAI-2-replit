import { describe, it, expect } from 'vitest';
import { adviseGlobalSubmissionPlan, SUBMISSION_PLAN_TOOL_SPEC } from '../submission-plan-advisor';

const profile = { name: 'Acme Analyzer', isIvd: true, availableArtifacts: [] as string[] };

describe('adviseGlobalSubmissionPlan', () => {
  it('plans across multiple markets with an honest headline', () => {
    const advice = adviseGlobalSubmissionPlan({ profile, targetMarkets: ['us-fda', 'eu-mdr-ivdr', 'jp-pmda'] as any });
    expect(advice.markets).toHaveLength(3);
    expect(advice.headline).toMatch(/cannot transmit to any authority/i);
    expect(advice.provenance.modules).toContain('mdx-submission-planner/planner');
  });

  it('each market line carries authority, dossier standard, readiness band', () => {
    const advice = adviseGlobalSubmissionPlan({ profile, targetMarkets: ['us-fda'] as any });
    const line = advice.markets[0];
    expect(line.marketId).toBe('us-fda');
    expect(typeof line.authority).toBe('string');
    expect(typeof line.dossierStandard).toBe('string');
    expect(typeof line.readinessBand).toBe('string');
  });

  it('reports unknown markets by their requested id (not objects)', () => {
    const advice = adviseGlobalSubmissionPlan({ profile, targetMarkets: ['not-a-market'] as any });
    expect(advice.unknownMarkets).toContain('not-a-market');
    expect(advice.markets).toHaveLength(0);
  });

  it('handles an empty target list honestly', () => {
    const advice = adviseGlobalSubmissionPlan({ profile, targetMarkets: [] });
    expect(advice.markets).toHaveLength(0);
    expect(advice.headline).toMatch(/No target markets/i);
  });

  it('surfaces global blockers and markets needing work', () => {
    const advice = adviseGlobalSubmissionPlan({ profile, targetMarkets: ['us-fda', 'cn-nmpa'] as any });
    expect(Array.isArray(advice.blockers)).toBe(true);
    expect(advice.marketsNeedingWork.length).toBeGreaterThan(0);
  });

  it('exposes a well-formed tool spec', () => {
    expect(SUBMISSION_PLAN_TOOL_SPEC.name).toBe('advise_global_submission_plan');
    expect(SUBMISSION_PLAN_TOOL_SPEC.input_schema.type).toBe('object');
    expect(SUBMISSION_PLAN_TOOL_SPEC.input_schema.properties).toHaveProperty('profile');
    expect(SUBMISSION_PLAN_TOOL_SPEC.input_schema.properties).toHaveProperty('targetMarkets');
  });
});
