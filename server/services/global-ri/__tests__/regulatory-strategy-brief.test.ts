/**
 * Regulatory strategy brief — cross-market orchestration over the global-RI
 * services (pathway, designations, expedited programs, meetings, Module 1).
 */

import { describe, it, expect } from 'vitest';
import { buildStrategyBrief, type StrategyBriefInput } from '../regulatory-strategy-brief';

function input(over: Partial<StrategyBriefInput> = {}): StrategyBriefInput {
  return {
    productType: 'biologic',
    targetMarkets: ['US', 'EU'],
    nextMilestone: 'pre_ind',
    disease: { usPrevalence: 150000, euPrevalencePer10k: 4, seriousOrLifeThreatening: true, noSatisfactoryTreatment: true, unmetMedicalNeed: true },
    pediatricDevelopment: true,
    ...over,
  };
}

describe('buildStrategyBrief', () => {
  it('produces one market section per target market, in order', () => {
    const brief = buildStrategyBrief(input());
    expect(brief.markets.map((m) => m.market)).toEqual(['US', 'EU']);
    expect(brief.summary.marketCount).toBe(2);
  });

  it('maps each market to its agency and a pathway', () => {
    const brief = buildStrategyBrief(input());
    const us = brief.markets[0];
    expect(us.agency).toBe('FDA');
    expect(us.pathway.marketingApplication).toBeTruthy();
    const eu = brief.markets[1];
    expect(eu.agency).toBe('EMA');
  });

  it('assesses orphan designation eligibility for FDA/EMA from the disease profile', () => {
    const brief = buildStrategyBrief(input());
    const us = brief.markets[0];
    expect(us.designations?.orphan.eligible).toBe(true); // US prevalence < 200k
    expect(brief.summary.orphanEligibleMarkets).toContain('FDA');
  });

  it('matches expedited programs for the serious/unmet-need profile', () => {
    const brief = buildStrategyBrief(input());
    expect(brief.summary.totalExpeditedPrograms).toBeGreaterThan(0);
    expect(brief.markets[0].expeditedPrograms?.count).toBeGreaterThan(0);
  });

  it('recommends HA meetings for the next milestone and a Module 1 checklist', () => {
    const brief = buildStrategyBrief(input({ nextMilestone: 'pre_ind' }));
    expect(brief.markets[0].recommendedMeetings.length).toBeGreaterThan(0);
    expect(brief.markets[0].module1Checklist.length).toBeGreaterThan(0);
  });

  it('handles a market without designation modeling (AU) gracefully', () => {
    const brief = buildStrategyBrief(input({ targetMarkets: ['AU'] }));
    const au = brief.markets[0];
    expect(au.agency).toBe('TGA');
    expect(au.designations).toBeNull(); // TGA orphan not modeled here
    expect(au.module1Checklist.length).toBeGreaterThan(0); // TGA Module 1 is modeled
  });

  it('is deterministic', () => {
    expect(buildStrategyBrief(input())).toEqual(buildStrategyBrief(input()));
  });
});
