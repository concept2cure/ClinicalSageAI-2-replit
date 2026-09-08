/**
 * The one computation behind `IndFormPdfResult.requiredFieldsLeftBlank`, and in
 * particular what it does with input it was not expecting.
 *
 * This helper is the thing every render path now trusts to answer "which
 * required boxes are empty on the document I just produced". Every wrong answer
 * it can give in the LENIENT direction is a fabricated clean form, so each
 * degenerate input below is checked for over-reporting, never under-reporting.
 */
import { describe, it, expect } from 'vitest';

import { isValuePresent, requiredFieldsLeftBlankOn } from '../required-box-report';
import { buildForm3674 } from '../ind-form-data-builders';
import type { BuiltForm } from '../ind-form-data-builders';

function built(partial: Partial<BuiltForm>): BuiltForm {
  return {
    formId: 'TEST',
    fields: {},
    missingRequired: [],
    requiredFields: [],
    qcOnlyFields: [],
    validationErrors: [],
    ...partial,
  } as BuiltForm;
}

describe('isValuePresent fails closed on anything that is not a value', () => {
  it('accepts only a non-blank string or a true boolean', () => {
    expect(isValuePresent('Acme Bio')).toBe(true);
    expect(isValuePresent(true)).toBe(true);
    expect(isValuePresent('')).toBe(false);
    expect(isValuePresent('   ')).toBe(false);
    expect(isValuePresent('\n\t')).toBe(false);
    expect(isValuePresent(false)).toBe(false);
  });

  it('treats undefined, null and non-string scalars as a blank box, not a filled one', () => {
    // A `true` here would turn "we cannot tell" into "we looked and it is fine"
    // — the exact substitution this whole change removes.
    for (const v of [undefined, null, 0, 42, NaN, {}, [], () => {}]) {
      expect(isValuePresent(v), String(v)).toBe(false);
    }
  });
});

describe('requiredFieldsLeftBlankOn', () => {
  it('names a required field whose value is absent, even though the render wrote it', () => {
    // The AcroForm case: `setText('')` succeeds, so the id IS in the written
    // set. The box is still empty on the page.
    const b = built({ fields: { a: '', c: 'Acme' }, requiredFields: ['a', 'c'] });
    expect(requiredFieldsLeftBlankOn(b, new Set(['a', 'c']))).toEqual(['a']);
  });

  it('names a required field the render did not write, even though the value was supplied', () => {
    // The XFA case: ind_type has a value and no reviewed mapping.
    const b = built({ fields: { a: 'Commercial IND' }, requiredFields: ['a'] });
    expect(requiredFieldsLeftBlankOn(b, new Set())).toEqual(['a']);
  });

  it('names an unticked required checkbox and not a ticked one', () => {
    const b = built({ fields: { off: false, on: true }, requiredFields: ['off', 'on'] });
    expect(requiredFieldsLeftBlankOn(b, new Set(['off', 'on']))).toEqual(['off']);
  });

  it('names a required id that has no entry in fields at all', () => {
    const b = built({ fields: {}, requiredFields: ['ghost'] });
    expect(requiredFieldsLeftBlankOn(b, new Set(['ghost']))).toEqual(['ghost']);
  });

  it('THROWS when requiredFields is not an array — it never answers "none"', () => {
    // An unassessable BuiltForm must not produce a clean report. Returning []
    // here would be a form claiming completeness it never checked.
    for (const bad of [undefined, null, 'sponsor_name', { 0: 'a' }]) {
      const b = { formId: 'TEST', fields: {}, missingRequired: [], qcOnlyFields: [], validationErrors: [], requiredFields: bad } as unknown as BuiltForm;
      expect(() => requiredFieldsLeftBlankOn(b, new Set()), String(bad)).toThrow(/requiredFields/);
    }
  });

  it('survives a BuiltForm with no fields object at all, reporting every required id blank', () => {
    const b = { formId: 'TEST', missingRequired: [], qcOnlyFields: [], validationErrors: [], requiredFields: ['a', 'b'] } as unknown as BuiltForm;
    expect(requiredFieldsLeftBlankOn(b, new Set(['a', 'b']))).toEqual(['a', 'b']);
  });

  it('never names a derived QC gate, because the builder keeps them out of requiredFields', () => {
    // FDA 3674's `certification_selected` is a completeness verdict, not a box.
    const real = buildForm3674({ sponsorName: 'Acme Bio', drugName: 'ACM-1' });
    expect(real.qcOnlyFields).toContain('certification_selected');
    expect(real.missingRequired).toContain('certification_selected');
    const named = requiredFieldsLeftBlankOn(real, new Set(Object.keys(real.fields)));
    expect(named).not.toContain('certification_selected');
  });

  /** POSITIVE CONTROL — a complete, fully written form reports nothing. */
  it('reports an empty list when every required box carries a written value', () => {
    const b = built({ fields: { a: 'x', b: true }, requiredFields: ['a', 'b'] });
    expect(requiredFieldsLeftBlankOn(b, new Set(['a', 'b']))).toEqual([]);
  });
});
