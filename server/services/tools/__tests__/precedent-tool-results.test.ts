/**
 * The cortex precedent tools say what the engine found, and nothing more.
 *
 * precedent.risk_analysis printed "Risk: LOW (score 0%) ... No risk factors
 * identified." for an analysis that read nothing; precedent.strategy assumed a
 * 510(k), recommended "Standard submission approach" with no precedent behind
 * it, printed a share of approved precedents as "% success rate", and read an
 * empty list as "Standard testing requirements." / "No major risks identified."
 */
import { describe, it, expect } from 'vitest';
import { riskNotAssessedResult, STRATEGY_NEEDS_TYPE, strategyToolResult } from '../precedent-tool-results';

const strategy = (over: Record<string, unknown>) => ({
  basis: 'precedents', recommendedStrategy: 'Traditional', confidence: 0.5, supportingPrecedents: [{}, {}],
  alternativeStrategies: [], testingRequirements: [], estimatedTimeline: null, keyRisks: [], ...over,
}) as never;

describe('precedent.risk_analysis', () => {
  it('answers "not assessed" when no source could be read', () => {
    const r = riskNotAssessedResult({
      overallRisk: 'not_assessed', riskScore: null,
      sources: { adversarialPrecedents: { notRead: 'store unreadable' }, safetySignals: 'read', toxicPredicates: { notRead: 'not a 510(k)' } },
    } as never);
    expect(r.ok).toBe(false);
    expect(r.message.content).toBe('Risk analysis not assessed — no source could be read (store unreadable; not a 510(k)).');
  });
});

describe('precedent.strategy', () => {
  it('asks for the submission type', () => {
    expect(STRATEGY_NEEDS_TYPE.ok).toBe(false);
    expect(STRATEGY_NEEDS_TYPE.message.content).toMatch(/^Which submission type\?/);
  });

  it('recommends nothing when no approved precedent recorded a strategy', () => {
    const r = strategyToolResult(strategy({ basis: 'no-precedents', recommendedStrategy: null, confidence: null }));
    expect(r.summary).toBe('No approved precedent that records a strategy matched, so no strategy is recommended.');
    expect(r.message.content).not.toMatch(/Standard|Confidence/);
  });

  it('calls a share a share, and an empty list "none recorded"', () => {
    const r = strategyToolResult(strategy({
      alternativeStrategies: [{ strategy: 'Special', precedentCount: 1, shareOfApprovedPrecedents: 1 / 3, description: '' }],
    }));
    expect(r.message.content).toMatch(/33% of approved precedents/);
    expect(r.message.content).not.toMatch(/success rate|Standard testing requirements|No major risks identified/);
    expect(r.message.content).toMatch(/None recorded in the supporting precedents/);
    expect(r.message.content).toMatch(/Estimated Timeline:\*\* not estimated/);
  });
});
