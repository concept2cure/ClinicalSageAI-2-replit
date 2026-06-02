/**
 * Tests for evidence-validation — the semantic grounding check that decides
 * whether AnA's claims are backed by [KNOWN]/[INFERRED]/[MISSING] evidence
 * labels, or whether she is confabulating. This is the verdict surfaced to the
 * client as the grounding strip, so its counts and validated flag are
 * load-bearing for the anti-hallucination signal.
 */
import { describe, it, expect } from 'vitest';
import { validateEvidence, quickEvidenceCheck } from '../evidence-validation.js';

describe('validateEvidence — short responses', () => {
  it('passes short responses without analysis', () => {
    const v = validateEvidence('Looks good to me.');
    expect(v.attempted).toBe(true);
    expect(v.validated).toBe(true);
    expect(v.source_count).toBe(0);
    expect(v.grounded_claim_count).toBe(0);
  });

  it('tags the verdict with the provider', () => {
    expect(validateEvidence('short', 'fallback').provider).toBe('fallback');
  });
});

describe('validateEvidence — grounded response', () => {
  it('validates a response whose claims sit next to evidence labels', () => {
    const response = [
      '## Overall Assessment',
      '[KNOWN] The submission must include a clinical evaluation report.',
      '[KNOWN] The data shows the endpoint was met in 120 patients.',
      '[KNOWN] FDA requires a post-market surveillance plan for this device class under the applicable framework.',
    ].join('\n');
    const v = validateEvidence(response);
    expect(v.validated).toBe(true);
    expect(v.source_count).toBe(3); // three [KNOWN] labels
    expect(v.grounded_claim_count).toBeGreaterThan(0);
    expect(v.weak_or_ungrounded_claim_count).toBe(0);
    expect(v.source_types).toContain('regulatory_reference');
  });
});

describe('validateEvidence — ungrounded response', () => {
  it('fails a substantive response that makes claims with no evidence labels', () => {
    const response = [
      '## Overall Assessment',
      'The device poses a significant risk to patients in routine clinical use.',
      'The available data is insufficient for the primary endpoint analysis.',
      'FDA requires additional clinical data in at least 50 patients before this submission can proceed.',
    ].join('\n');
    const v = validateEvidence(response);
    expect(v.validated).toBe(false);
    expect(v.source_count).toBe(0);
    expect(v.weak_or_ungrounded_claim_count).toBeGreaterThan(0);
    expect(typeof v.reviewer_risk_summary).toBe('string');
  });
});

describe('validateEvidence — contradiction detection', () => {
  it('surfaces an internal contradiction in the risk summary', () => {
    const response = [
      '## Overall Assessment',
      'The device poses a significant risk in some configurations.',
      'There is no significant risk in routine use, however.',
      'The data is sufficient for the primary endpoint, though the data is insufficient for the secondary endpoint.',
      'A reviewer would want clarity before relying on this analysis for any decision.',
    ].join('\n');
    const v = validateEvidence(response);
    expect(v.reviewer_risk_summary).toMatch(/contradiction/i);
  });
});

describe('quickEvidenceCheck', () => {
  it('flags a long substantive response with no labels as needing attention', () => {
    const partial =
      'The device poses a significant risk and FDA requires additional data in 50 patients. '.repeat(4);
    const r = quickEvidenceCheck(partial);
    expect(r.hasSubstantiveClaims).toBe(true);
    expect(r.hasLabels).toBe(false);
    expect(r.needsAttention).toBe(true);
  });

  it('does not flag when labels are present', () => {
    const partial =
      '[KNOWN] The device poses a significant risk and FDA requires additional data in 50 patients. '.repeat(4);
    const r = quickEvidenceCheck(partial);
    expect(r.hasLabels).toBe(true);
    expect(r.needsAttention).toBe(false);
  });

  it('does not flag a short partial response', () => {
    expect(quickEvidenceCheck('too short to judge').needsAttention).toBe(false);
  });
});
