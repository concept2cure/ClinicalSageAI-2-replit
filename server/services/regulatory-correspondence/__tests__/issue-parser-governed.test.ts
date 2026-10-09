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

/**
 * The taxonomy is a list of UNANCHORED regular expressions tested against the
 * whole letter, so any rule whose keyword happens to be a substring of an
 * ordinary word fires on every letter containing that word.
 *
 * `/format/` is the one that matters: "format" is a substring of
 * "in-FORMAT-ion", so EVERY letter carrying the word "information" — which is
 * every regulatory letter, and definitionally every Request for Additional
 * Information — was classified `ectd_technical_formatting` and mapped to
 * `module_index`. The existing suite could not see it: its multi-topic case
 * asserts only `issues.length > 0`, and a spurious extra issue raises that
 * number rather than lowering it.
 *
 * Measured 2026-09-20 across the whole taxonomy: four accidents, one common
 * ("information"/"informational") and three rare ("asterisk" → risk,
 * "equality" → quality).
 */
describe('the taxonomy matches words, not substrings of other words', () => {
  const INNOCENT = [
    // word,          the rule it must NOT trigger
    ['information', 'ectd_technical_formatting'],
    ['informational', 'ectd_technical_formatting'],
    ['asterisk', 'clinical_safety_issue'],
    ['equality', 'cmc_quality_issue'],
  ] as const;

  for (const [word, mustNotBe] of INNOCENT) {
    it(`"${word}" alone is not a ${mustNotBe}`, () => {
      const r = runGovernedIssueParser(`Please provide the ${word} requested.`, 'c');
      expect(r.issues.map((i) => i.category)).not.toContain(mustNotBe);
    });
  }

  it('an Additional Information request is not an eCTD formatting issue', () => {
    /* The letter FDA actually sends. Nothing in it is about eCTD formatting. */
    const r = runGovernedIssueParser(
      'ADDITIONAL INFORMATION REQUEST\nWe require additional information before we can ' +
        'complete our review of your submission.',
      'c',
    );
    expect(r.issues.map((i) => i.category)).not.toContain('ectd_technical_formatting');
    expect(r.issues.flatMap((i) => i.mappedCtdSections)).not.toContain('module_index');
  });

  /* The other half of the contract: narrowing must not lose a true match. */
  const REAL = [
    ['The eCTD format of your submission is incorrect.', 'ectd_technical_formatting'],
    ['Formatting errors were found in the backbone.', 'ectd_technical_formatting'],
    ['A technical validation error was reported.', 'ectd_technical_formatting'],
    ['Stability data are incomplete.', 'cmc_quality_issue'],
    ['The specification is not justified.', 'cmc_quality_issue'],
    ['Quality of the drug substance is not established.', 'cmc_quality_issue'],
    ['An adverse event was not reported.', 'clinical_safety_issue'],
    ['The risk analysis is incomplete.', 'clinical_safety_issue'],
    ['We refuse to file this application.', 'filing_acceptance_issue'],
    ['The submission was rejected.', 'filing_acceptance_issue'],
    ['A deficiency was noted.', 'missing_information_clarification'],
  ] as const;

  for (const [text, expected] of REAL) {
    it(`still classifies: ${JSON.stringify(text)}`, () => {
      const r = runGovernedIssueParser(text, 'c');
      expect(r.issues.map((i) => i.category)).toContain(expected);
    });
  }
});
