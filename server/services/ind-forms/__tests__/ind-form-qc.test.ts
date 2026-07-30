/**
 * Module 1 forms cross-validation — presence, completeness, identity
 * consistency, structure, and the honest-by-construction verdict.
 */

import { describe, it, expect } from 'vitest';
import { runM1FormsQc } from '../ind-form-qc';
import type { BuiltForm } from '../ind-form-data-builders';

function form(formId: string, fields: Record<string, string | boolean> = {}, missingRequired: string[] = []): BuiltForm {
  return { formId, fields, missingRequired, requiredFields: [], validationErrors: [] };
}

const sponsor = 'Acme Therapeutics';
const drug = 'C2C-001';

const fullSet = (): BuiltForm[] => [
  form('FDA_1571', { sponsor_name: sponsor, drug_name: drug }),
  form('FDA_1572', { sponsor_name: sponsor, drug_name: drug, investigator_name: 'Dr. Smith' }),
  form('FDA_3674', { sponsor_name: sponsor, drug_name: drug }),
];

describe('runM1FormsQc — verdict', () => {
  it('ready for a complete, consistent original-IND form set', () => {
    const res = runM1FormsQc({ forms: fullSet() });
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.present).toEqual(['FDA_1571', 'FDA_1572', 'FDA_3674']);
    expect(res.missingForms).toEqual([]);
  });
});

describe('runM1FormsQc — presence', () => {
  it('errors when a required form is missing', () => {
    const res = runM1FormsQc({ forms: fullSet().filter((f) => f.formId !== 'FDA_3674') });
    expect(res.ready).toBe(false);
    expect(res.missingForms).toEqual(['FDA_3674']);
    expect(res.findings.some((f) => f.code === 'PRESENCE' && f.formId === 'FDA_3674')).toBe(true);
  });

  it('honors a custom required-forms set', () => {
    const res = runM1FormsQc({ forms: [form('FDA_1571', { sponsor_name: sponsor, drug_name: drug })], requiredForms: ['FDA_1571'] });
    expect(res.ready).toBe(true);
  });
});

describe('runM1FormsQc — completeness', () => {
  it('errors on a required field still missing on a form', () => {
    const set = fullSet();
    set[0] = form('FDA_1571', { sponsor_name: sponsor, drug_name: drug }, ['indication']);
    const res = runM1FormsQc({ forms: set });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'COMPLETENESS' && f.message.includes('indication'))).toBe(true);
  });
});

describe('runM1FormsQc — consistency', () => {
  it('errors when sponsor_name diverges across forms', () => {
    const set = fullSet();
    set[2] = form('FDA_3674', { sponsor_name: 'Acme Bio', drug_name: drug });
    const res = runM1FormsQc({ forms: set });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'CONSISTENCY' && f.message.includes('sponsor_name'))).toBe(true);
  });

  it('treats identity values case-insensitively (no false positive)', () => {
    const set = fullSet();
    set[1].fields.sponsor_name = sponsor.toUpperCase();
    const res = runM1FormsQc({ forms: set });
    expect(res.findings.some((f) => f.code === 'CONSISTENCY')).toBe(false);
  });

  it('ignores forms that do not carry a shared field (empty is not a divergence)', () => {
    const set = fullSet();
    set[2] = form('FDA_3674', { drug_name: drug }); // no sponsor_name
    const res = runM1FormsQc({ forms: set });
    expect(res.findings.some((f) => f.code === 'CONSISTENCY')).toBe(false);
  });
});

describe('runM1FormsQc — structure', () => {
  it('allows multiple 1572s (per-investigator)', () => {
    const set = [
      ...fullSet(),
      form('FDA_1572', { sponsor_name: sponsor, drug_name: drug, investigator_name: 'Dr. Jones' }),
    ];
    const res = runM1FormsQc({ forms: set });
    expect(res.findings.some((f) => f.code === 'DUPLICATE')).toBe(false);
    expect(res.ready).toBe(true);
  });

  it('errors on a duplicated non-1572 form', () => {
    const set = [...fullSet(), form('FDA_1571', { sponsor_name: sponsor, drug_name: drug })];
    const res = runM1FormsQc({ forms: set });
    expect(res.findings.some((f) => f.code === 'DUPLICATE' && f.formId === 'FDA_1571')).toBe(true);
    expect(res.ready).toBe(false);
  });
});
