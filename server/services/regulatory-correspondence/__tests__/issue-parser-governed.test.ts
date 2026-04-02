import { runGovernedIssueParser, resolveIssueParserGovernanceConfig } from '../issue-parser';

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

  it('returns unclassified fallback for text with no keyword matches', () => {
    const result = runGovernedIssueParser(
      'Please confirm receipt of this letter.',
      'corr-no-match'
    );

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].category).toBe('other_unclassified');
    expect(result.issues[0].severity).toBe('low');
    expect(result.issues[0].blocker).toBe(false);
    expect(result.issues[0].confidence).toBeLessThan(0.5);
    expect(result.issues[0].structuredExtraction?.regulatorAskType).toBe('manual_triage_required');
    expect(result.metadata.matchedRuleCount).toBe(0);
  });

  it('handles empty input gracefully', () => {
    const result = runGovernedIssueParser('', 'corr-empty');

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].category).toBe('other_unclassified');
    expect(result.metadata.sourceTextDigest).toBeDefined();
    expect(result.metadata.matchedRuleCount).toBe(0);
  });

  it('matches multiple categories from multi-topic text', () => {
    const result = runGovernedIssueParser(
      'Refuse to file due to missing stability data and adverse event reporting gaps in eCTD format',
      'corr-multi'
    );

    // Should match: filing_acceptance, cmc_quality, clinical_safety, ectd_technical
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
    const categories = result.issues.map(i => i.category);
    expect(categories).toContain('filing_acceptance_issue');
    expect(categories).toContain('cmc_quality_issue');
    expect(categories).toContain('clinical_safety_issue');
    expect(result.metadata.matchedRuleCount).toBeGreaterThanOrEqual(3);
  });

  it('assigns higher confidence to blocker issues', () => {
    const result = runGovernedIssueParser(
      'Deficiency: missing CMC stability data',
      'corr-blocker'
    );

    const blockerIssues = result.issues.filter(i => i.blocker);
    const nonBlockerIssues = result.issues.filter(i => !i.blocker);

    if (blockerIssues.length > 0) {
      expect(blockerIssues[0].confidence).toBeGreaterThan(0.7);
    }
    if (nonBlockerIssues.length > 0) {
      expect(nonBlockerIssues[0].confidence).toBeLessThan(0.7);
    }
  });

  it('includes source text digest in metadata', () => {
    const text = 'Test input for digest';
    const result = runGovernedIssueParser(text, 'corr-digest');
    expect(result.metadata.sourceTextDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sets correspondenceId on all extracted issues', () => {
    const result = runGovernedIssueParser('Missing safety data and stability info', 'corr-id-check');
    for (const issue of result.issues) {
      expect(issue.correspondenceId).toBe('corr-id-check');
    }
  });
});

describe('issue parser governance config', () => {
  it('returns available when heuristic mode is configured', () => {
    const config = resolveIssueParserGovernanceConfig({
      REG_CORRESPONDENCE_ISSUE_PARSER_MODE: 'heuristic_v2',
      ENABLE_REG_CORRESPONDENCE_HEURISTIC_MODE: 'true',
    } as any);
    expect(config.available).toBe(true);
    expect(config.mode).toBe('heuristic_v2');
  });

  it('returns unavailable when mode is disabled', () => {
    const config = resolveIssueParserGovernanceConfig({
      REG_CORRESPONDENCE_ISSUE_PARSER_MODE: 'disabled',
    } as any);
    expect(config.available).toBe(false);
    expect(config.reason).toContain('disabled');
  });

  it('returns unavailable when heuristic mode is explicitly false', () => {
    const config = resolveIssueParserGovernanceConfig({
      REG_CORRESPONDENCE_ISSUE_PARSER_MODE: 'heuristic_v2',
      ENABLE_REG_CORRESPONDENCE_HEURISTIC_MODE: 'false',
    } as any);
    expect(config.available).toBe(false);
  });

  it('returns unavailable for unsupported modes', () => {
    const config = resolveIssueParserGovernanceConfig({
      REG_CORRESPONDENCE_ISSUE_PARSER_MODE: 'llm_v3',
    } as any);
    expect(config.available).toBe(false);
    expect(config.reason).toContain('Unsupported');
  });
});
