/**
 * One "refuse unless stated" helper (2026-10-15).
 *
 * The labeling and nonclinical-ADME knowledge engines each carried their own
 * copy of the same refusal: name every required input not stated in a readable
 * form, missing_input when none of them was given, else invalid_input. Both now
 * call refuseUnlessStated, next to ComputationRefusal. (The GMP and
 * mutagenic-impurity engines word and code their refusals differently, so they
 * keep their own.)
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ComputationRefusal, refuseUnlessStated, type RequiredInputCheck } from '../computation-engine';

const check = (field: string, value: unknown, ok: boolean): RequiredInputCheck => ({ field, value, ok, expected: 'one of a, b' });

function refusal(inputs: RequiredInputCheck[]): ComputationRefusal {
  try {
    refuseUnlessStated('fn', inputs, 'assessed');
  } catch (err) {
    if (err instanceof ComputationRefusal) return err;
    throw err;
  }
  throw new Error('did not refuse');
}

describe('refuseUnlessStated', () => {
  it('passes when every input is readable', () => {
    expect(() => refuseUnlessStated('fn', [check('x', 'a', true)], 'assessed')).not.toThrow();
  });

  it('names every unreadable input, and what it got', () => {
    const r = refusal([check('x', undefined, false), check('y', 'c', false), check('z', 'a', true)]);
    expect(r.message).toBe('fn: required and not stated: x (one of a, b); y (one of a, b; got "c"). Nothing is assessed without them.');
    expect(r.field).toBe('x');
  });

  it('is missing_input only when none of them was given', () => {
    expect(refusal([check('x', null, false)]).code).toBe('missing_input');
    expect(refusal([check('x', undefined, false), check('y', 'c', false)]).code).toBe('invalid_input');
  });

  it('is the only copy in the engines that use it', () => {
    for (const f of ['server/services/labeling/labeling-intelligence-knowledge.ts', 'server/services/nonclinical-adme/nonclinical-adme-knowledge.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} assembles its own refusal`).not.toMatch(/required and not stated/);
      expect(src).toMatch(/refuseUnlessStated\(/);
    }
  });
});
