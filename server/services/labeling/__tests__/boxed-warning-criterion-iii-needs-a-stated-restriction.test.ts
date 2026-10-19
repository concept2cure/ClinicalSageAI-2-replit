/**
 * assessBoxedWarning (AnA tool assess_boxed_warning) does not infer criterion
 * (iii) from the safety signal (2026-10-15).
 *
 * Criterion (iii) is a fact about the approval: FDA approved the drug with
 * restrictions on distribution or use to ensure safe use (e.g. a REMS with
 * ETASU). The engine inferred it from the signal: met for a life-threatening
 * teratogenicity, PML or cytokine-release signal ("suggest that restricted
 * distribution or use conditions are appropriate"), not met for anything else.
 * So a 'significant' signal on a drug approved with ETASU was reported as
 * meeting no criterion (meetsBoxedWarningCriteria: false), and nobody had said
 * anything about restrictions either way.
 */
import { describe, expect, it } from 'vitest';
import { assessBoxedWarning, type AssessBoxedWarningInput } from '../labeling-intelligence-knowledge';
import { ASSESS_BOXED_WARNING } from '../../ana/labelingIntelligenceTools';

const boxed = (p: unknown) => assessBoxedWarning(p as AssessBoxedWarningInput);
const SIGNIFICANT = { safetySignalType: 'teratogenicity', severity: 'significant', riskMitigationAvailable: true };

describe('assessBoxedWarning criterion (iii)', () => {
  it('does not infer restrictions on use from a life-threatening PML signal', () => {
    const r = boxed({ safetySignalType: 'pml', severity: 'life_threatening', riskMitigationAvailable: true });
    expect(r.criteriaAssessment[2].met, 'criterion (iii) with approvedWithRestrictions unstated').toBeNull();
    expect(r.criteriaAssessment[2].rationale).toMatch(/approvedWithRestrictions\) was not stated/);
    // Criterion (i) is met by the stated severity, so the overall answer still is.
    expect(r.meetsBoxedWarningCriteria).toBe(true);
  });

  it('gives no overall verdict when only the unstated criterion (iii) could be met', () => {
    const r = boxed(SIGNIFICANT);
    expect(r.criteriaAssessment[2].met).toBeNull();
    expect(r.meetsBoxedWarningCriteria, 'overall verdict that turns on criterion (iii)').toBeNull();
  });

  it('takes criterion (iii) from a stated approval with or without restrictions', () => {
    const yes = boxed({ ...SIGNIFICANT, approvedWithRestrictions: true });
    expect(yes.criteriaAssessment[2].met).toBe(true);
    expect(yes.meetsBoxedWarningCriteria).toBe(true);
    expect(yes.remsRelationship).toMatch(/Criterion \(iii\)/);
    const no = boxed({ ...SIGNIFICANT, approvedWithRestrictions: false });
    expect(no.criteriaAssessment.map((c) => c.met)).toEqual([false, false, false]);
    expect(no.meetsBoxedWarningCriteria).toBe(false);
  });

  it('is offered to AnA with that input, and with the three criteria it assesses', () => {
    expect(ASSESS_BOXED_WARNING.input_schema.properties).toHaveProperty('approvedWithRestrictions');
    expect(ASSESS_BOXED_WARNING.description).not.toMatch(/four FDA criteria/);
    // Within the 1024 characters OpenAI keeps of a tool description.
    expect(ASSESS_BOXED_WARNING.description.slice(0, 1024)).toMatch(/approvedWithRestrictions, never inferred from the signal/);
  });
});
