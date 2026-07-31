/**
 * Regression guard for the registry conditionalLogic evaluator
 * (FDAFormGenerator.validateEditableValues, exercised via prepareEditableDraft).
 *
 * Historically FDA_3455 declared `when` as a STRING expression
 * ('investigators[].financial.hasDisclosableInterest == true'). That was both a
 * compile error against FDAFormDefinition.conditionalLogic and — at runtime —
 * a silent always-true rule: reading `.fieldId`/`.operator` off a string yields
 * undefined, the operator ternary falls through to the `falsy` branch, and
 * `values[undefined]` is blank, so the rule fired for EVERY draft and made
 * disclosure_details unconditionally required.
 *
 * These tests pin the corrected, typed behaviour: disclosure_details is required
 * only when the in-form trigger field `has_disclosable_interest` is truthy.
 */
import { describe, expect, it } from 'vitest';
import FDAFormGenerator from '../FDAFormGenerator';

const gen = new FDAFormGenerator();

// Every non-conditional required 3455 field, satisfied, so the only variable
// under test is whether disclosure_details is demanded by the rule.
const base3455 = {
  sponsor_name: 'Acme Therapeutics',
  drug_name: 'C2C-001',
  disclosure_descriptions_complete: true,
  authorized_rep_name: 'Dana Sponsor',
};

describe('FDA_3455 conditionalLogic (typed, non-executable)', () => {
  it('does NOT require disclosure_details when no investigator has a disclosable interest', () => {
    const result: any = gen.prepareEditableDraft({
      formId: 'FDA_3455',
      values: { ...base3455, has_disclosable_interest: false },
    });
    expect(result.status).toBe('generated'); // trigger field is accepted, not UNKNOWN_FIELDS
    expect(result.missingRequired).not.toContain('disclosure_details');
  });

  it('DOES require disclosure_details once an investigator has a disclosable interest', () => {
    const result: any = gen.prepareEditableDraft({
      formId: 'FDA_3455',
      values: { ...base3455, has_disclosable_interest: true }, // disclosure_details left blank
    });
    expect(result.status).toBe('generated');
    expect(result.missingRequired).toContain('disclosure_details');
  });

  it('is satisfied when the disclosable interest is accompanied by details', () => {
    const result: any = gen.prepareEditableDraft({
      formId: 'FDA_3455',
      values: {
        ...base3455,
        has_disclosable_interest: true,
        disclosure_details: 'Dr. Roe: equity interest in the sponsor (>5%).',
      },
    });
    expect(result.status).toBe('generated');
    expect(result.missingRequired).not.toContain('disclosure_details');
  });
});

describe('FDA_356H conditionalLogic still evaluates (equals operator)', () => {
  const base356h = {
    applicant_name: 'Acme Therapeutics',
    applicant_address: '1 Main St, Boston MA',
    proprietary_established_name: 'C2C-001 / example',
    dosage_form: 'Tablet',
    route_of_administration: 'Oral',
    indication: 'NSCLC',
    authorized_rep_name: 'Dana Sponsor',
  };

  it('requires application_number for a Supplement', () => {
    const result: any = gen.prepareEditableDraft({
      formId: 'FDA_356H',
      values: { ...base356h, application_type: 'Supplement' },
    });
    expect(result.status).toBe('generated');
    expect(result.missingRequired).toContain('application_number');
  });

  it('does not require application_number for an original NDA', () => {
    const result: any = gen.prepareEditableDraft({
      formId: 'FDA_356H',
      values: { ...base356h, application_type: 'NDA' },
    });
    expect(result.status).toBe('generated');
    expect(result.missingRequired).not.toContain('application_number');
  });
});
