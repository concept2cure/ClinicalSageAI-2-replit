/**
 * Medicare Coverage Analysis deterministic logic (C2C-15) — qualifying-trial
 * determination (NCD 310.1), per-item billing classifier, readiness gate, and
 * billing grid. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateQualifyingTrial,
  classifyCoverageItem,
  evaluateCoverageReadiness,
  buildBillingGrid,
  NCD_310_1,
  type ReadinessItemView,
  type BillingGridItemView,
} from '../coverage-logic';

describe('evaluateQualifyingTrial', () => {
  it('deems IND/IDE/federally-funded trials qualifying without the three criteria', () => {
    const r = evaluateQualifyingTrial({
      hasTherapeuticIntent: false,
      enrollsDiagnosisTreatment: false,
      hasMedicareBenefitCategory: false,
      deemedQualifying: true,
    });
    expect(r.determination).toBe('qualifying');
    expect(r.deemed).toBe(true);
    expect(r.unmetCriteria).toEqual([]);
    expect(r.rationale).toMatch(/NCD 310\.1/);
  });

  it('qualifies when all three required criteria are met', () => {
    const r = evaluateQualifyingTrial({
      hasTherapeuticIntent: true,
      enrollsDiagnosisTreatment: true,
      hasMedicareBenefitCategory: true,
    });
    expect(r.determination).toBe('qualifying');
    expect(r.deemed).toBe(false);
    expect(r.unmetCriteria).toEqual([]);
    expect(r.requiredCriteria).toHaveLength(3);
  });

  it('is non-qualifying when any required criterion is unmet', () => {
    const r = evaluateQualifyingTrial({
      hasTherapeuticIntent: true,
      enrollsDiagnosisTreatment: false,
      hasMedicareBenefitCategory: true,
    });
    expect(r.determination).toBe('non_qualifying');
    expect(r.unmetCriteria).toContain('diagnosis_treatment');
    expect(r.rationale).toMatch(/NCD 310\.1/);
  });

  it('clamps the advisory desirable-characteristics count to 0..7 and never blocks', () => {
    const r = evaluateQualifyingTrial({
      hasTherapeuticIntent: true,
      enrollsDiagnosisTreatment: true,
      hasMedicareBenefitCategory: true,
      desirableCharacteristicsCount: 99,
    });
    expect(r.desirableCharacteristicsCount).toBe(7);
    expect(r.determination).toBe('qualifying');
  });
});

describe('classifyCoverageItem', () => {
  it('sponsor-paid items bill the sponsor (anti double-billing) even in a qualifying trial', () => {
    const r = classifyCoverageItem({ trialQualifies: true, isStandardOfCare: false, sponsorPaidInBudget: true });
    expect(r.classification).toBe('research_paid');
    expect(r.billingDesignation).toBe('bill_sponsor');
    expect(r.citation).toMatch(/NCD 310\.1/);
  });

  it('standard-of-care items bill the usual payer when not sponsor-paid', () => {
    const r = classifyCoverageItem({ trialQualifies: true, isStandardOfCare: true, sponsorPaidInBudget: false });
    expect(r.classification).toBe('standard_of_care');
    expect(r.billingDesignation).toBe('bill_standard_of_care');
    expect(r.citation).toMatch(/NCD 310\.1/);
  });

  it('routine costs of a qualifying trial are billable to Medicare', () => {
    const r = classifyCoverageItem({ trialQualifies: true, isStandardOfCare: false, sponsorPaidInBudget: false });
    expect(r.classification).toBe('routine_cost');
    expect(r.billingDesignation).toBe('bill_medicare');
    expect(r.citation).toMatch(/NCD 310\.1/);
  });

  it('non-qualifying, non-SOC, non-sponsor items are held as unclear', () => {
    const r = classifyCoverageItem({ trialQualifies: false, isStandardOfCare: false, sponsorPaidInBudget: false });
    expect(r.classification).toBe('unclear');
    expect(r.billingDesignation).toBe('hold');
    expect(r.citation).toMatch(/NCD 310\.1/);
  });

  it('sponsor-paid takes priority over standard-of-care', () => {
    const r = classifyCoverageItem({ trialQualifies: true, isStandardOfCare: true, sponsorPaidInBudget: true });
    expect(r.billingDesignation).toBe('bill_sponsor');
  });
});

describe('evaluateCoverageReadiness', () => {
  const ok: ReadinessItemView = { classification: 'routine_cost', billingDesignation: 'bill_medicare', icd10Validated: true };

  it('blocks when the qualifying determination is still pending', () => {
    const r = evaluateCoverageReadiness({ qualifyingDetermination: 'pending', items: [ok] });
    expect(r.readyToFinalize).toBe(false);
    expect(r.blockers.some((b) => /determination/i.test(b))).toBe(true);
  });

  it('blocks when there are no items', () => {
    const r = evaluateCoverageReadiness({ qualifyingDetermination: 'qualifying', items: [] });
    expect(r.readyToFinalize).toBe(false);
    expect(r.blockers.some((b) => /No coverage items/i.test(b))).toBe(true);
  });

  it('blocks when any item is unclear / on hold', () => {
    const r = evaluateCoverageReadiness({
      qualifyingDetermination: 'qualifying',
      items: [ok, { classification: 'unclear', billingDesignation: 'hold', icd10Validated: true }],
    });
    expect(r.readyToFinalize).toBe(false);
    expect(r.unclassifiedCount).toBe(1);
  });

  it('warns (does not block) on unvalidated ICD-10 indications', () => {
    const r = evaluateCoverageReadiness({
      qualifyingDetermination: 'qualifying',
      items: [{ classification: 'routine_cost', billingDesignation: 'bill_medicare', icd10Validated: false }],
    });
    expect(r.readyToFinalize).toBe(true);
    expect(r.warnings.some((w) => /ICD-10/.test(w))).toBe(true);
  });
});

describe('buildBillingGrid', () => {
  it('summarizes rows by billing designation', () => {
    const items: BillingGridItemView[] = [
      { itemDescription: 'Screening CT', classification: 'routine_cost', billingDesignation: 'bill_medicare', ncdCitation: NCD_310_1 },
      { itemDescription: 'Investigational drug', classification: 'research_paid', billingDesignation: 'bill_sponsor' },
      { itemDescription: 'Routine bloods', classification: 'standard_of_care', billingDesignation: 'bill_standard_of_care' },
      { itemDescription: 'PK draws', classification: 'research_paid', billingDesignation: 'bill_sponsor' },
    ];
    const readiness = evaluateCoverageReadiness({
      qualifyingDetermination: 'qualifying',
      items: items.map((i) => ({ classification: i.classification, billingDesignation: i.billingDesignation, icd10Validated: true })),
    });
    const grid = buildBillingGrid(items, readiness);
    expect(grid.rows).toHaveLength(4);
    expect(grid.summary.bill_medicare).toBe(1);
    expect(grid.summary.bill_sponsor).toBe(2);
    expect(grid.summary.bill_standard_of_care).toBe(1);
    expect(grid.readiness.readyToFinalize).toBe(true);
  });
});
