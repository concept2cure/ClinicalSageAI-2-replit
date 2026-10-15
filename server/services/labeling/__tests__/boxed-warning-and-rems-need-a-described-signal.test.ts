/**
 * assessBoxedWarning and designREMS (AnA tools assess_boxed_warning and
 * design_rems) assess only a safety signal someone described (2026-10-15).
 *
 * assessBoxedWarning({}) answered meetsBoxedWarningCriteria: false, with
 * criterion (i) 'classified as "undefined" which ... does not independently meet
 * the threshold' and criterion (iii) met: false. designREMS({}) recommended a
 * Medication Guide because "The identified risk (undefined, severity:
 * undefined) warrants patient-directed risk communication". And a stated
 * serious signal with riskMitigationAvailable unstated got criterion (ii) "No
 * risk mitigation measures have been identified", with no met value at all.
 */
import { describe, expect, it } from 'vitest';
import {
  assessBoxedWarning,
  designREMS,
  type AssessBoxedWarningInput,
  type DesignREMSInput,
} from '../labeling-intelligence-knowledge';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../../ana/AnaToolExecutor';

const boxed = (p: unknown) => assessBoxedWarning(p as AssessBoxedWarningInput);
const rems = (p: unknown) => designREMS(p as DesignREMSInput);

describe('assessBoxedWarning', () => {
  it('refuses to assess a signal with no type or severity', () => {
    expect(() => boxed({}), 'a boxed-warning verdict on no signal').toThrow(/safetySignalType.*severity/);
    expect(() => boxed({ safetySignalType: 'hepatotoxicity' })).toThrow(/severity/);
    expect(() => boxed({ severity: 'serious' })).toThrow(/safetySignalType/);
    expect(() => boxed({ safetySignalType: 'liver', severity: 'serious' })).toThrow(/safetySignalType/);
  });

  it('leaves criterion (ii) open while risk mitigation is unstated', () => {
    const r = boxed({ safetySignalType: 'hepatotoxicity', severity: 'serious' });
    expect(r.criteriaAssessment[1].met).toBeNull();
    expect(r.criteriaAssessment[1].rationale).toMatch(/not stated/i);
    expect(r.criteriaAssessment[1].rationale).not.toMatch(/have been identified/);
    // Criterion (i) is decided by the stated severity, so the overall answer is too.
    expect(r.meetsBoxedWarningCriteria).toBe(true);
  });

  it('still assesses a described signal', () => {
    // approvedWithRestrictions is stated: criterion (iii) was inferred from the signal until 2026-10-15
    // (boxed-warning-criterion-iii-needs-a-stated-restriction.test.ts).
    const r = boxed({ safetySignalType: 'hepatotoxicity', severity: 'significant', riskMitigationAvailable: true, approvedWithRestrictions: false });
    expect(r.meetsBoxedWarningCriteria).toBe(false);
    expect(r.criteriaAssessment.map((c) => c.met)).toEqual([false, false, false]);
    const met = boxed({ safetySignalType: 'pml', severity: 'life_threatening', riskMitigationAvailable: true, approvedWithRestrictions: true });
    expect(met.criteriaAssessment.map((c) => c.met)).toEqual([true, true, true]);
  });

  it('reaches AnA as a request for the missing input, not as a verdict', async () => {
    const reply = await getToolHandler('assess_boxed_warning')!({}, { organizationId: 1, userId: 1 } as never);
    const out = JSON.parse(reply) as Record<string, unknown>;
    expect(out).toMatchObject({ status: 'needs_parameters', field: 'safetySignalType' });
    expect(out).not.toHaveProperty('result');
  });
});

describe('designREMS', () => {
  it('refuses to design a REMS for a risk with no type or severity', () => {
    expect(() => rems({}), 'REMS elements for an undescribed risk').toThrow(/safetySignalType/);
    expect(() => rems({ safetySignalType: 'teratogenicity' })).toThrow(/riskSeverity/);
  });

  it('names the risk it designs for', () => {
    const r = rems({ identifiedRisk: 'embryo-fetal toxicity', safetySignalType: 'teratogenicity', productType: 'prescription_drug', riskSeverity: 'high' });
    expect(JSON.stringify(r.recommendedElements)).not.toMatch(/undefined/);
    expect(r.recommendedElements.map((e) => e.element)).toEqual(['medication_guide', 'communication_plan', 'etasu', 'implementation_system']);
  });
});
