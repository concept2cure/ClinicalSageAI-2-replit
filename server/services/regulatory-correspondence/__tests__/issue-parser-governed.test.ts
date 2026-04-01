import { runGovernedIssueParser } from '../issue-parser';

describe('governed issue parser', () => {
  it('returns structured operating extraction data', () => {
    const result = runGovernedIssueParser(
      'Deficiency noted: missing information on stability data and safety signal follow-up',
      'corr-1'
    );

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.metadata.modelAssistedReasoningUsed).toBe(false);
    expect(result.metadata.deterministicSignals.length).toBeGreaterThan(0);
    expect(result.issues[0].structuredExtraction?.recommendedOwnerFunction).toBeDefined();
    expect(result.issues[0].structuredExtraction?.confidenceTrace.length).toBeGreaterThan(0);
  });
});
