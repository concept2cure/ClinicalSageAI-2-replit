import {
  sourceSelectionPolicy,
  sourceSelectionDecision,
} from '../services/research-intelligence/sourceSelectionPolicy';

describe('research intelligence routing policy', () => {
  test('prefers literature route for biomarker questions', () => {
    expect(sourceSelectionPolicy('Find biomarker clinical evidence in PubMed')).toBe('literature_first');
  });

  test('falls back when no external material improvement expected', () => {
    expect(sourceSelectionPolicy('Summarize our last answer')).toBe('no_external_needed');
  });

  test('returns route rationale with confidence', () => {
    const decision = sourceSelectionDecision('Find predicate device IFU evidence');
    expect(decision.route).toBe('device_diagnostics');
    expect(typeof decision.reason).toBe('string');
    expect(decision.confidence).toBeGreaterThan(0.5);
  });

  test('routes commercial claim prompts correctly', () => {
    const decision = sourceSelectionDecision('Compare competitor brochure claims for sensitivity');
    expect(decision.route).toBe('commercial_claims');
  });
});
