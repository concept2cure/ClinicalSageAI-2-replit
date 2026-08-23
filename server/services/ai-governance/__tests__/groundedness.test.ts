import { describe, it, expect } from 'vitest';
import { hasCitation, citationCoverage, resolveGroundedness } from '../groundedness';
import { evaluateAcceptGate } from '../review-policy';

describe('hasCitation', () => {
  it('recognises common regulatory citation markers', () => {
    expect(hasCitation('The endpoint was met [12].')).toBe(true);
    expect(hasCitation('Per the predicate K123456 the device is equivalent.')).toBe(true);
    expect(hasCitation('See doi:10.1000/abc for details.')).toBe(true);
    expect(hasCitation('Trial NCT01234567 reported the result.')).toBe(true);
    expect(hasCitation('Smith et al. 2020 found a similar effect (Smith, 2020).')).toBe(true);
    expect(hasCitation('The device is safe and effective.')).toBe(false);
  });
});

describe('citationCoverage', () => {
  it('scores the fraction of claim sentences that carry a citation', () => {
    const content =
      'The device demonstrated substantial equivalence to its predicate [1]. ' +
      'Performance testing confirmed accuracy across the measuring range [2]. ' +
      'The device is widely regarded as the best available option.';
    const c = citationCoverage(content);
    expect(c.claims).toBe(3);
    expect(c.cited).toBe(2);
    expect(c.coverage).toBeCloseTo(2 / 3);
  });

  it('returns null coverage when there are no substantive claims', () => {
    expect(citationCoverage('Device description:').coverage).toBeNull();
    expect(citationCoverage('Overview').coverage).toBeNull();
  });

  it('scores fully-uncited claims as 0', () => {
    const c = citationCoverage('This device is proven safe for all patients in every setting.');
    expect(c.coverage).toBe(0);
  });
});

describe('resolveGroundedness', () => {
  it('prefers an explicit score and always enforces it', () => {
    const r = resolveGroundedness({ groundednessScore: 0.42, content: 'x y z a b c [1]' });
    expect(r.source).toBe('explicit');
    expect(r.score).toBe(0.42);
    expect(r.enforce).toBe(true);
  });

  /**
   * Enforcement flipped ON by default on 2026-08-13. Before that, coverage was
   * computed on every accept, written to the ledger, and ignored — a
   * measurement, not a control. These expectations invert deliberately.
   */
  it('computes from content and enforces by default', () => {
    const content = 'The endpoint was met in the pivotal study and no further work is required here.';
    const byDefault = resolveGroundedness({ content });
    expect(byDefault.source).toBe('computed');
    expect(byDefault.score).toBe(0); // no citation
    expect(byDefault.enforce).toBe(true);

    // The per-call opt-in still forces enforcement on regardless of the env.
    const explicit = resolveGroundedness({ content, enforceGroundedness: true });
    expect(explicit.enforce).toBe(true);
  });

  it('can be turned off per deployment via AI_GROUNDEDNESS_ENFORCE=0', () => {
    const content = 'The endpoint was met in the pivotal study and no further work is required here.';
    const saved = process.env.AI_GROUNDEDNESS_ENFORCE;
    try {
      process.env.AI_GROUNDEDNESS_ENFORCE = '0';
      expect(resolveGroundedness({ content }).enforce).toBe(false);
      // ...but an explicit per-call opt-in still wins over the deployment default.
      expect(resolveGroundedness({ content, enforceGroundedness: true }).enforce).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.AI_GROUNDEDNESS_ENFORCE;
      else process.env.AI_GROUNDEDNESS_ENFORCE = saved;
    }
  });

  it('is "none" when neither a score nor content is present', () => {
    const r = resolveGroundedness({ status: 'ready' });
    expect(r.source).toBe('none');
    expect(r.score).toBeNull();
    expect(r.enforce).toBe(false);
  });
});

describe('evaluateAcceptGate with computed groundedness', () => {
  const lowContent = 'This device is proven effective and requires no further validation in any setting.';

  it('records a computed score AND blocks by default', () => {
    const g = evaluateAcceptGate({ capabilityKey: 'draft-csr', category: 'drafting', content: lowContent });
    const verdict = g.enrichedPayload.aiGovernance as Record<string, unknown>;
    expect(verdict.groundednessSource).toBe('computed');
    expect(verdict.groundednessScore).toBe(0);
    // 0 coverage against drafting's 0.80 threshold, with no human ack.
    expect(g.blocked).toBe(true);
    expect(g.gate).toBe('review_required');
  });

  it('lets a human acknowledgement through — enforcement is a gate, not a wall', () => {
    // This is what keeps the default humane: a person can still accept
    // low-citation content, and the ledger records that they took
    // responsibility for it. That is the Part 11 posture.
    const g = evaluateAcceptGate({
      capabilityKey: 'draft-csr',
      category: 'drafting',
      content: lowContent,
      groundednessReviewAck: true,
    });
    expect(g.blocked).toBe(false);
    const verdict = g.enrichedPayload.aiGovernance as Record<string, unknown>;
    expect(verdict.reviewAcknowledged).toBe(true);
  });

  it('blocks low computed groundedness when enforcement is opted in and no ack', () => {
    const g = evaluateAcceptGate({
      capabilityKey: 'draft-csr',
      category: 'drafting',
      content: lowContent,
      enforceGroundedness: true,
    });
    expect(g.blocked).toBe(true);
    expect(g.gate).toBe('review_required');
  });

  it('a well-cited draft passes the computed gate even when enforced', () => {
    const cited =
      'The device demonstrated substantial equivalence to predicate K123456 [1]. ' +
      'Bench testing met all acceptance criteria across the range [2]. ' +
      'Biocompatibility was evaluated per ISO 10993 [3].';
    const g = evaluateAcceptGate({
      capabilityKey: 'draft-csr',
      category: 'drafting',
      content: cited,
      enforceGroundedness: true,
    });
    const verdict = g.enrichedPayload.aiGovernance as Record<string, unknown>;
    expect(verdict.groundednessScore).toBe(1);
    expect(g.blocked).toBe(false);
  });
});
