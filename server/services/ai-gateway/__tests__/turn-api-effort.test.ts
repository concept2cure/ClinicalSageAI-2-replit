/**
 * The API effort a turn runs at, with the high-stakes floor (MC-RL-5, AnA
 * reasoning round 4, 2026-10-05).
 *
 * The high-stakes floor was a thinking BUDGET (reasoning.ts, 12,000 tokens),
 * which only the legacy thinking surface reads. The flagship's thinking is
 * adaptive and self-budgets, so a high-stakes turn on it reasoned at the
 * person's effort and no deeper: the floor never reached it. The lever an
 * adaptive model answers to is the API effort, so the floor is applied there.
 */
import { describe, expect, it } from 'vitest';

import { EFFORT_TO_API_EFFORT, resolveTurnApiEffort } from '../effort';

describe('the API effort a turn runs at', () => {
  it('is the effort the person chose, as before', () => {
    expect(resolveTurnApiEffort({ effort: 'fast', riskTier: 'low', policyPinned: false })).toBe('low');
    expect(resolveTurnApiEffort({ effort: 'balanced', riskTier: 'medium', policyPinned: false })).toBe('medium');
    expect(resolveTurnApiEffort({ effort: 'thorough', riskTier: 'low', policyPinned: false })).toBe('high');
  });

  it('is not sent when a kernel-pinned strategy is in force, as before', () => {
    expect(resolveTurnApiEffort({ effort: 'balanced', riskTier: 'medium', policyPinned: true })).toBeUndefined();
  });

  it('a high-stakes turn runs at high or above, pinned strategy or not: the floor reaches an adaptive model', () => {
    expect(resolveTurnApiEffort({ effort: 'balanced', riskTier: 'high', policyPinned: false })).toBe('high');
    expect(resolveTurnApiEffort({ effort: 'balanced', riskTier: 'high', policyPinned: true })).toBe('high');
    expect(resolveTurnApiEffort({ effort: 'thorough', riskTier: 'high', policyPinned: false })).toBe('high');
  });

  it('the floor only ever raises: no effort maps above high (revisit the floor before adding one)', () => {
    expect(Object.values(EFFORT_TO_API_EFFORT).every((e) => e === 'low' || e === 'medium' || e === 'high')).toBe(true);
  });

  it('Fast stays Fast, as the thinking floor does (resolveThinkingConfig)', () => {
    expect(resolveTurnApiEffort({ effort: 'fast', riskTier: 'high', policyPinned: false })).toBe('low');
  });
});
