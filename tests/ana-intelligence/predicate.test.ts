/**
 * evaluatePredicate — unit coverage for every operator + edge cases.
 *
 * evaluatePredicate is the branching/visibility/issue-check primitive used
 * throughout the engine. Each operator is exercised for the true path, the
 * false path, and the notable edge cases (missing field, type mismatch,
 * empty array, case-insensitivity).
 */
import { describe, it, expect } from 'vitest';
import { evaluatePredicate } from '../../server/services/ana/intelligence-questions/engine';
import type { FieldPredicate } from '../../shared/types/intelligence-questions';

const pred = (
  field: string,
  operator: FieldPredicate['operator'],
  value: FieldPredicate['value'],
): FieldPredicate => ({ field, operator, value });

describe('evaluatePredicate', () => {
  describe('eq', () => {
    it('matches strictly equal values', () => {
      expect(evaluatePredicate(pred('x', 'eq', 'oncology'), { x: 'oncology' })).toBe(true);
    });
    it('is false when values differ', () => {
      expect(evaluatePredicate(pred('x', 'eq', 'oncology'), { x: 'cardiology' })).toBe(false);
    });
    it('is false for a missing field', () => {
      expect(evaluatePredicate(pred('x', 'eq', 'oncology'), {})).toBe(false);
    });
    it('does not coerce number vs string', () => {
      // strict === means '3' !== 3
      expect(evaluatePredicate(pred('x', 'eq', 3), { x: '3' })).toBe(false);
    });
  });

  describe('neq', () => {
    it('is true when values differ', () => {
      expect(evaluatePredicate(pred('x', 'neq', 'oncology'), { x: 'cardiology' })).toBe(true);
    });
    it('is false when values are equal', () => {
      expect(evaluatePredicate(pred('x', 'neq', 'oncology'), { x: 'oncology' })).toBe(false);
    });
    it('is true for a missing field (undefined !== value)', () => {
      expect(evaluatePredicate(pred('x', 'neq', 'oncology'), {})).toBe(true);
    });
  });

  describe('in', () => {
    it('is true when the stringified actual is in the list', () => {
      expect(evaluatePredicate(pred('x', 'in', ['a', 'b', 'c']), { x: 'b' })).toBe(true);
    });
    it('is false when actual not in the list', () => {
      expect(evaluatePredicate(pred('x', 'in', ['a', 'b']), { x: 'z' })).toBe(false);
    });
    it('stringifies the actual value before comparison', () => {
      // pred value is a string list; actual is numeric 3 -> String(3) === '3'
      expect(evaluatePredicate(pred('x', 'in', ['3', '4']), { x: 3 })).toBe(true);
    });
    it('is false when the predicate value is not an array', () => {
      expect(evaluatePredicate(pred('x', 'in', 'a' as unknown as string[]), { x: 'a' })).toBe(false);
    });
    it('is false for a missing field', () => {
      // String(undefined) === 'undefined', not in list
      expect(evaluatePredicate(pred('x', 'in', ['a', 'b']), {})).toBe(false);
    });
  });

  describe('not_in', () => {
    it('is true when actual not in the list', () => {
      expect(evaluatePredicate(pred('x', 'not_in', ['a', 'b']), { x: 'z' })).toBe(true);
    });
    it('is false when actual is in the list', () => {
      expect(evaluatePredicate(pred('x', 'not_in', ['a', 'b']), { x: 'a' })).toBe(false);
    });
    it('is false when the predicate value is not an array', () => {
      expect(evaluatePredicate(pred('x', 'not_in', 'a' as unknown as string[]), { x: 'z' })).toBe(false);
    });
    it('is true for a missing field', () => {
      expect(evaluatePredicate(pred('x', 'not_in', ['a', 'b']), {})).toBe(true);
    });
  });

  describe('gt', () => {
    it('is true when actual number is greater', () => {
      expect(evaluatePredicate(pred('x', 'gt', 100), { x: 200 })).toBe(true);
    });
    it('is false when actual number is not greater', () => {
      expect(evaluatePredicate(pred('x', 'gt', 100), { x: 50 })).toBe(false);
    });
    it('is false for equal values (strictly greater)', () => {
      expect(evaluatePredicate(pred('x', 'gt', 100), { x: 100 })).toBe(false);
    });
    it('coerces a numeric-string answer (the AnA tool surface sends numbers as strings)', () => {
      // number-field answers arrive as strings from answer_intelligence_question;
      // a strict typeof check silently defeated every numeric filing gate.
      expect(evaluatePredicate(pred('x', 'gt', 100), { x: '200' })).toBe(true);
      expect(evaluatePredicate(pred('x', 'gt', 100), { x: '50' })).toBe(false);
      expect(evaluatePredicate(pred('x', 'gt', 100), { x: 'abc' })).toBe(false);
    });
    it('is false when the predicate value is non-numeric', () => {
      expect(evaluatePredicate(pred('x', 'gt', '100' as unknown as number), { x: 200 })).toBe(false);
    });
    it('is false for a missing field', () => {
      expect(evaluatePredicate(pred('x', 'gt', 100), {})).toBe(false);
    });
  });

  describe('lt', () => {
    it('is true when actual number is less', () => {
      expect(evaluatePredicate(pred('x', 'lt', 100), { x: 50 })).toBe(true);
    });
    it('is false when actual number is not less', () => {
      expect(evaluatePredicate(pred('x', 'lt', 100), { x: 200 })).toBe(false);
    });
    it('coerces a numeric-string answer (the AnA tool surface sends numbers as strings)', () => {
      expect(evaluatePredicate(pred('x', 'lt', 100), { x: '50' })).toBe(true);
      expect(evaluatePredicate(pred('x', 'lt', 100), { x: '200' })).toBe(false);
      expect(evaluatePredicate(pred('x', 'lt', 100), { x: 'abc' })).toBe(false);
    });
    it('is false for a missing field', () => {
      expect(evaluatePredicate(pred('x', 'lt', 100), {})).toBe(false);
    });
  });

  describe('contains', () => {
    it('is true when the actual string contains the substring', () => {
      expect(evaluatePredicate(pred('x', 'contains', 'onco'), { x: 'oncology' })).toBe(true);
    });
    it('is case-insensitive on both sides', () => {
      expect(evaluatePredicate(pred('x', 'contains', 'ONCO'), { x: 'Oncology' })).toBe(true);
      expect(evaluatePredicate(pred('x', 'contains', 'onco'), { x: 'ONCOLOGY' })).toBe(true);
    });
    it('is false when the substring is absent', () => {
      expect(evaluatePredicate(pred('x', 'contains', 'cardio'), { x: 'oncology' })).toBe(false);
    });
    it('is false when actual is not a string', () => {
      expect(evaluatePredicate(pred('x', 'contains', 'onc'), { x: 123 })).toBe(false);
    });
    it('is false when the predicate value is not a string', () => {
      expect(evaluatePredicate(pred('x', 'contains', 5 as unknown as string), { x: 'onc5ology' })).toBe(false);
    });
    it('is false for a missing field', () => {
      expect(evaluatePredicate(pred('x', 'contains', 'onc'), {})).toBe(false);
    });
  });

  describe('exists', () => {
    it('is true for a non-empty string', () => {
      expect(evaluatePredicate(pred('x', 'exists', true), { x: 'value' })).toBe(true);
    });
    it('is true for a number (including 0)', () => {
      expect(evaluatePredicate(pred('x', 'exists', true), { x: 0 })).toBe(true);
    });
    it('is false for null', () => {
      expect(evaluatePredicate(pred('x', 'exists', true), { x: null })).toBe(false);
    });
    it('is false for undefined / missing field', () => {
      expect(evaluatePredicate(pred('x', 'exists', true), { x: undefined })).toBe(false);
      expect(evaluatePredicate(pred('x', 'exists', true), {})).toBe(false);
    });
    it('is false for the empty string', () => {
      expect(evaluatePredicate(pred('x', 'exists', true), { x: '' })).toBe(false);
    });
    it('is false for an empty array', () => {
      expect(evaluatePredicate(pred('x', 'exists', true), { x: [] })).toBe(false);
    });
    it('is true for a non-empty array', () => {
      expect(evaluatePredicate(pred('x', 'exists', true), { x: ['a'] })).toBe(true);
    });
  });

  describe('unknown operator', () => {
    it('returns false for an unrecognized operator', () => {
      expect(
        evaluatePredicate(
          { field: 'x', operator: 'weird' as FieldPredicate['operator'], value: 1 },
          { x: 1 },
        ),
      ).toBe(false);
    });
  });
});
