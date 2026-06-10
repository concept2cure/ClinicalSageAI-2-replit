import { describe, it, expect } from 'vitest';
import { governanceFor, composeIntendedUse } from '../risk-tiers';
import { evaluateReviewRequirement, evaluateAcceptGate } from '../review-policy';

describe('governanceFor', () => {
  it('assigns high risk + review + GxP to drafting', () => {
    const g = governanceFor('draft-csr', 'drafting', {
      name: 'Draft CSR',
      description: 'Generate ICH E3 CSR sections.',
    });
    expect(g.riskTier).toBe('high');
    expect(g.humanOversight).toBe('requires_review');
    expect(g.groundednessThreshold).toBeCloseTo(0.8);
    expect(g.gxpApplicable).toBe(true);
    expect(g.intendedUse).toContain('decision support');
  });

  it('applies per-capability override (predicate-comparison → high, 0.85)', () => {
    const g = governanceFor('predicate-comparison', 'analysis');
    expect(g.riskTier).toBe('high');
    expect(g.groundednessThreshold).toBeCloseTo(0.85);
  });

  it('escalates the human-approval action to requires_approval', () => {
    const g = governanceFor('authoring-approve', 'workflow');
    expect(g.humanOversight).toBe('requires_approval');
  });

  it('treats formatting/knowledge as low risk, non-GxP', () => {
    expect(governanceFor('render-with-template', 'formatting').gxpApplicable).toBe(false);
    expect(governanceFor('cortex-semantic-search', 'knowledge').riskTier).toBe('low');
  });

  it('falls back to a complete default contract for unknown capabilities', () => {
    const g = governanceFor('mystery', 'nope');
    expect(g.riskTier).toBe('moderate');
    expect(g.humanOversight).toBe('requires_review');
    expect(g.groundednessThreshold).toBeCloseTo(0.75);
    expect(g.intendedUse.length).toBeGreaterThan(0);
  });

  it('composeIntendedUse states the oversight mode and the decision-support boundary', () => {
    const s = composeIntendedUse({
      name: 'X',
      description: 'Do X.',
      humanOversight: 'requires_review',
    });
    expect(s).toContain('review before approval');
    expect(s).toContain('not to make autonomous regulatory determinations');
  });
});

describe('evaluateReviewRequirement', () => {
  const drafting = governanceFor('draft-csr', 'drafting');

  it('requires review when groundedness is below threshold', () => {
    const r = evaluateReviewRequirement({ governance: drafting, groundednessScore: 0.6 });
    expect(r.requiresHumanReview).toBe(true);
    expect(r.gate).toBe('review_required');
  });

  it('normalizes a 0..100 score to 0..1', () => {
    const r = evaluateReviewRequirement({ governance: drafting, groundednessScore: 95 });
    expect(r.groundednessScore).toBeCloseTo(0.95);
  });

  it('still requires review for a requires_review capability even above threshold', () => {
    const r = evaluateReviewRequirement({ governance: drafting, groundednessScore: 0.99 });
    expect(r.gate).toBe('review_required');
  });

  it('approval_required dominates over a high score', () => {
    const g = governanceFor('submission-readiness', 'submission');
    const r = evaluateReviewRequirement({ governance: g, groundednessScore: 0.99 });
    expect(r.gate).toBe('approval_required');
  });

  it('marks groundedness not assessed when score is absent', () => {
    const r = evaluateReviewRequirement({ governance: drafting });
    expect(r.groundednessAssessed).toBe(false);
    expect(r.groundednessScore).toBeNull();
  });
});

describe('evaluateAcceptGate', () => {
  it('blocks a low-groundedness accept without an ack', () => {
    const g = evaluateAcceptGate({
      capabilityKey: 'draft-csr',
      category: 'drafting',
      groundednessScore: 0.5,
    });
    expect(g.blocked).toBe(true);
    expect(g.gate).toBe('review_required');
    expect((g.enrichedPayload.aiGovernance as Record<string, unknown>).groundednessScore).toBeCloseTo(0.5);
  });

  it('allows a low-groundedness accept WITH a human-review acknowledgement', () => {
    const g = evaluateAcceptGate({
      capabilityKey: 'draft-csr',
      category: 'drafting',
      groundednessScore: 0.5,
      groundednessReviewAck: true,
    });
    expect(g.blocked).toBe(false);
    expect((g.enrichedPayload.aiGovernance as Record<string, unknown>).reviewAcknowledged).toBe(true);
  });

  it('does not block when no score is supplied (non-breaking) but records not-assessed', () => {
    const g = evaluateAcceptGate({ capabilityKey: 'draft-csr', category: 'drafting' });
    expect(g.blocked).toBe(false);
    expect((g.enrichedPayload.aiGovernance as Record<string, unknown>).groundednessAssessed).toBe(false);
  });

  it('blocks compliance content scored below the 0.85 compliance threshold', () => {
    const g = evaluateAcceptGate({
      capabilityKey: 'compliance-scan-fda',
      category: 'compliance',
      confidence: 0.8,
    });
    expect(g.blocked).toBe(true);
  });

  it('accepts an empty payload without throwing', () => {
    const g = evaluateAcceptGate(undefined);
    expect(g.blocked).toBe(false);
    expect(g.enrichedPayload.aiGovernance).toBeTruthy();
  });
});
