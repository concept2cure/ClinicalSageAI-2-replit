/**
 * Unit tests for the deterministic dispatch gate (spec §6.8 / §7).
 *
 * These prove the hard pre-transmit rule WITHOUT a model in the loop: nothing
 * dispatches while there is an open error-severity validation finding or an
 * unacknowledged Shadow Review critical.
 */
import { describe, it, expect } from 'vitest';
import { evaluateDispatchGate } from '../dispatch-gate';

describe('evaluateDispatchGate', () => {
  it('clears when there are zero validation errors and zero shadow criticals', () => {
    const result = evaluateDispatchGate({ validationErrors: 0, unacknowledgedShadowCriticals: 0 });
    expect(result.cleared).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('blocks when there is an open error-severity validation finding', () => {
    const result = evaluateDispatchGate({ validationErrors: 3, unacknowledgedShadowCriticals: 0 });
    expect(result.cleared).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain('3 open error-severity validation finding');
  });

  it('blocks when there is an unacknowledged Shadow Review critical', () => {
    const result = evaluateDispatchGate({ validationErrors: 0, unacknowledgedShadowCriticals: 2 });
    expect(result.cleared).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain('2 unacknowledged Shadow Review critical');
  });

  it('reports both blockers when both counts are positive', () => {
    const result = evaluateDispatchGate({ validationErrors: 1, unacknowledgedShadowCriticals: 1 });
    expect(result.cleared).toBe(false);
    expect(result.blockers).toHaveLength(2);
  });

  it('treats non-finite counts as zero (no spurious blocker)', () => {
    const result = evaluateDispatchGate({
      validationErrors: Number.NaN,
      unacknowledgedShadowCriticals: Number.POSITIVE_INFINITY,
    });
    expect(result.cleared).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('is pure — the same input yields the same result', () => {
    const input = { validationErrors: 5, unacknowledgedShadowCriticals: 4 };
    expect(evaluateDispatchGate(input)).toEqual(evaluateDispatchGate(input));
  });
});
