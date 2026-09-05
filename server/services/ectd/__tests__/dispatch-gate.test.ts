/**
 * Unit tests for the deterministic dispatch gate (spec §6.8 / §7).
 *
 * These prove the hard pre-transmit rule WITHOUT a model in the loop: nothing
 * dispatches while there is an open error-severity validation finding or an
 * unacknowledged Shadow Review critical.
 */
import { describe, it, expect } from 'vitest';
import { evaluateDispatchGate, mergeDispatchGates } from '../dispatch-gate';

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

  /**
   * This asserted the OPPOSITE — that a non-finite count is "no spurious
   * blocker" and clears the gate. NaN is what an arithmetic failure leaves
   * behind and undefined is what a read that never happened leaves behind;
   * coercing either to zero made "we could not determine whether there are
   * blockers" indistinguishable from "there are none", in the one function
   * documented as the provable pre-transmit rule, and sent the sequence to the
   * agency.
   *
   * No caller can reach it today — AnaToolExecutor rejects a non-finite count
   * before calling, the /dispatch-qc route parses with z.number().int().min(0),
   * and assess-dispatch-readiness counts in SQL — so this is the direction of a
   * defensive default rather than a live defect. It is pinned because the old
   * assertion would have defended the open direction against anyone who later
   * tried to close it. Fail closed, never fabricate.
   */
  it('BLOCKS on a count it could not determine — unknown is not zero', () => {
    const nanErrors = evaluateDispatchGate({
      validationErrors: Number.NaN,
      unacknowledgedShadowCriticals: 0,
    });
    expect(nanErrors.cleared).toBe(false);
    expect(nanErrors.blockers.join(' ')).toMatch(/could not be determined/i);

    const missingCriticals = evaluateDispatchGate({
      validationErrors: 0,
      unacknowledgedShadowCriticals: undefined as unknown as number,
    });
    expect(missingCriticals.cleared).toBe(false);

    // Both undetermined — both named, so the operator learns what is unknown
    // rather than only that something is.
    const neither = evaluateDispatchGate({
      validationErrors: Number.NaN,
      unacknowledgedShadowCriticals: Number.POSITIVE_INFINITY,
    });
    expect(neither.cleared).toBe(false);
    expect(neither.blockers).toHaveLength(2);
  });

  it('still clears on genuine zeros — the gate has not been welded shut', () => {
    const result = evaluateDispatchGate({ validationErrors: 0, unacknowledgedShadowCriticals: 0 });
    expect(result.cleared).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('is pure — the same input yields the same result', () => {
    const input = { validationErrors: 5, unacknowledgedShadowCriticals: 4 };
    expect(evaluateDispatchGate(input)).toEqual(evaluateDispatchGate(input));
  });
});

describe('mergeDispatchGates', () => {
  it('clears only when every composed gate clears', () => {
    const a = { cleared: true, blockers: [] };
    const b = { cleared: true, blockers: [] };
    expect(mergeDispatchGates(a, b)).toEqual({ cleared: true, blockers: [] });
  });

  it('blocks (and unions blockers, order-preserved) when any gate blocks', () => {
    const structural = { cleared: false, blockers: ['structural-1'] };
    const external = { cleared: false, blockers: ['external-1', 'external-2'] };
    const merged = mergeDispatchGates(structural, external);
    expect(merged.cleared).toBe(false);
    expect(merged.blockers).toEqual(['structural-1', 'external-1', 'external-2']);
  });

  it('a clean structural gate is blocked by a failing external gate (P0-4 fail-closed)', () => {
    const merged = mergeDispatchGates(
      { cleared: true, blockers: [] },
      { cleared: false, blockers: ['external eValidator did not run'] },
    );
    expect(merged.cleared).toBe(false);
    expect(merged.blockers).toEqual(['external eValidator did not run']);
  });

  it('handles a single gate', () => {
    expect(mergeDispatchGates({ cleared: true, blockers: [] })).toEqual({ cleared: true, blockers: [] });
  });
});
