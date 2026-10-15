/**
 * The default policy never auto-promotes a rule-bearing revision on the model's own confidence.
 *
 * Until 2026-10-15 DEFAULT_POLICY.autoPromoteChangeKinds was
 * ['effective_date', 'press', 'revision']. A new revision of a standard is the
 * change that alters a rule, yet it auto-promoted whenever the distilling
 * model reported confidence >= 0.85 and its summary passed a 40% token-overlap
 * check. The policy's own header says rule changes are held for a human.
 */
import { describe, it, expect } from 'vitest';

import { decidePromotion, DEFAULT_POLICY, policyFromEnv } from '../promotion-policy';

describe('default promotion policy', () => {
  it('queues a high-confidence, grounded revision for review', () => {
    const out = decidePromotion({ changeKind: 'revision', confidence: 0.99, grounded: true });
    expect(out.decision).toBe('review');
  });

  it('does not list revision as auto-promotable, by default or from an unset environment', () => {
    expect(DEFAULT_POLICY.autoPromoteChangeKinds).not.toContain('revision');
    const prior = process.env.HORIZON_AUTOPROMOTE_KINDS;
    delete process.env.HORIZON_AUTOPROMOTE_KINDS;
    try {
      expect(policyFromEnv().autoPromoteChangeKinds).not.toContain('revision');
    } finally {
      if (prior !== undefined) process.env.HORIZON_AUTOPROMOTE_KINDS = prior;
    }
  });

  it('still auto-promotes the non-rule-bearing kinds it names', () => {
    expect(decidePromotion({ changeKind: 'effective_date', confidence: 0.95, grounded: true }).decision).toBe(
      'auto_promote',
    );
    expect(decidePromotion({ changeKind: 'press', confidence: 0.95, grounded: true }).decision).toBe('auto_promote');
  });

  it('does not claim an "active knowledge" that quarantine holds cards out of', () => {
    // Nothing reads promoted cards into AnA's answers. A reason that says a card
    // was "held out of active knowledge" describes a store that does not exist.
    const out = decidePromotion({ changeKind: 'press', confidence: 0.99, grounded: false });
    expect(out.decision).toBe('quarantine');
    expect(out.reason).not.toMatch(/active knowledge/i);
  });
});
