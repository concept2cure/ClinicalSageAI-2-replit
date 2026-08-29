/**
 * yes_no answers reach the flow engine as a real boolean from the UI but as a
 * string ('yes'/'no') from the AnA tool surface. A strict `'no' === false` is
 * always false, which silently defeats every boolean predicate — including the
 * critical GSPR-mapping conformity gate (`eq false`) that keeps an unmapped CER
 * from reporting "ready to proceed" to a Notified Body.
 *
 * These fail on the pre-fix strict-equality engine.
 */
import { describe, it, expect } from 'vitest';
import { evaluatePredicate } from '../engine';

describe('evaluatePredicate — yes_no answers coerce against boolean predicates', () => {
  it('a string "no" satisfies the critical gate `eq false` (gate fires)', () => {
    expect(evaluatePredicate(
      { field: 'gspr_mapping_completed', operator: 'eq', value: false } as any,
      { gspr_mapping_completed: 'no' },
    )).toBe(true);
  });

  it('a string "yes" does NOT satisfy `eq false` (gate does not fire when mapping is done)', () => {
    expect(evaluatePredicate(
      { field: 'gspr_mapping_completed', operator: 'eq', value: false } as any,
      { gspr_mapping_completed: 'yes' },
    )).toBe(false);
  });

  it('a string "yes" satisfies a visibility predicate `eq true`', () => {
    expect(evaluatePredicate(
      { field: 'common_specs_applicable', operator: 'eq', value: true } as any,
      { common_specs_applicable: 'yes' },
    )).toBe(true);
  });

  it('the real boolean path is unchanged (false eq false, true eq true)', () => {
    expect(evaluatePredicate({ field: 'f', operator: 'eq', value: false } as any, { f: false })).toBe(true);
    expect(evaluatePredicate({ field: 'f', operator: 'eq', value: true } as any, { f: true })).toBe(true);
    expect(evaluatePredicate({ field: 'f', operator: 'eq', value: true } as any, { f: false })).toBe(false);
  });

  it('non-boolean eq predicates keep strict identity (no accidental coercion)', () => {
    expect(evaluatePredicate({ field: 'route', operator: 'eq', value: 'annex_ii' } as any, { route: 'annex_ii' })).toBe(true);
    expect(evaluatePredicate({ field: 'route', operator: 'eq', value: 'annex_ii' } as any, { route: 'no' })).toBe(false);
  });
});
