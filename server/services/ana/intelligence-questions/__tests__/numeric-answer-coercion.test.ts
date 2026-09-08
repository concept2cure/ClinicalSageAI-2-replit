/**
 * number-field answers reach the flow engine as a real number from the UI but
 * as a string ('4') from the AnA tool surface. Before the fix, gt/lt required
 * `typeof actual === 'number'`, so a string answer silently made every numeric
 * gate return false — defeating critical filing gates (evaluator experience,
 * vigilance-report count, trial arms), and the validator's min/max range check
 * was skipped for the same string form. These fail on the pre-fix engine.
 */
import { describe, it, expect } from 'vitest';
import { evaluatePredicate } from '../engine';
import { validateAnswers } from '../validators';

describe('evaluatePredicate — numeric gates fire on string-encoded number answers', () => {
  it('a string "7" satisfies `gt 10`? no — but "12" does (the vigilance-report gate fires)', () => {
    expect(evaluatePredicate({ field: 'vigilance_reports', operator: 'gt', value: 10 } as any, { vigilance_reports: '7' })).toBe(false);
    expect(evaluatePredicate({ field: 'vigilance_reports', operator: 'gt', value: 10 } as any, { vigilance_reports: '12' })).toBe(true);
  });

  it('a string "3" satisfies `lt 5` (evaluator-underqualified gate fires)', () => {
    expect(evaluatePredicate({ field: 'evaluator_years_experience', operator: 'lt', value: 5 } as any, { evaluator_years_experience: '3' })).toBe(true);
    expect(evaluatePredicate({ field: 'evaluator_years_experience', operator: 'lt', value: 5 } as any, { evaluator_years_experience: '8' })).toBe(false);
  });

  it('the real number path is unchanged', () => {
    expect(evaluatePredicate({ field: 'arms', operator: 'gt', value: 3 } as any, { arms: 4 })).toBe(true);
    expect(evaluatePredicate({ field: 'arms', operator: 'gt', value: 3 } as any, { arms: 2 })).toBe(false);
  });

  it('a non-numeric or empty answer never triggers a numeric gate (no false positive)', () => {
    expect(evaluatePredicate({ field: 'arms', operator: 'gt', value: 3 } as any, { arms: 'abc' })).toBe(false);
    expect(evaluatePredicate({ field: 'arms', operator: 'gt', value: 3 } as any, { arms: '' })).toBe(false);
    expect(evaluatePredicate({ field: 'arms', operator: 'lt', value: 5 } as any, {})).toBe(false);
  });
});

describe('validateAnswers — min/max is enforced on a number field answered as a string', () => {
  const node: any = {
    id: 'n',
    fields: [
      { id: 'dose', label: 'Dose', type: 'number', validation: { min: 1, max: 100 } },
    ],
  };

  it('flags a string "200" as exceeding max', () => {
    const errors = validateAnswers(node, { dose: '200' });
    expect(errors.some((e: any) => e.fieldId === 'dose' && /at most 100/i.test(e.message))).toBe(true);
  });

  it('flags a string "0" as below min', () => {
    const errors = validateAnswers(node, { dose: '0' });
    expect(errors.some((e: any) => e.fieldId === 'dose' && /at least 1/i.test(e.message))).toBe(true);
  });

  it('accepts a string "50" within range', () => {
    const errors = validateAnswers(node, { dose: '50' });
    expect(errors.some((e: any) => e.fieldId === 'dose')).toBe(false);
  });

  it('still accepts a real number within range (unchanged path)', () => {
    expect(validateAnswers(node, { dose: 50 }).some((e: any) => e.fieldId === 'dose')).toBe(false);
    expect(validateAnswers(node, { dose: 200 }).some((e: any) => e.fieldId === 'dose')).toBe(true);
  });
});
