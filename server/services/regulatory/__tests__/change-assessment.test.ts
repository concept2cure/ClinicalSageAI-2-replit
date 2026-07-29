/**
 * Change-management decision engine tests.
 */

import { describe, it, expect } from 'vitest';
import { assessFdaChange, assessEuSignificantChange } from '../change-assessment';

const noChange = {
  affectsIndicationsForUse: false,
  couldSignificantlyAffectSafetyOrEffectiveness: false,
  changesControlMechanismOrOperatingPrinciple: false,
  changesPatientContactingMaterials: false,
  softwareChangeAffectsRisk: false,
  riskAssessmentShowsNewOrModifiedRisk: false,
  verificationDemonstratesEquivalence: true,
};

describe('assessFdaChange', () => {
  it('letter-to-file when no trigger met', () => {
    const r = assessFdaChange(noChange);
    expect(r.decision).toBe('letter_to_file');
  });

  it('intended-use change escalates beyond 510(k)', () => {
    const r = assessFdaChange({ ...noChange, affectsIndicationsForUse: true });
    expect(r.decision).toBe('pma_supplement_or_de_novo');
  });

  it('new 510(k) when S&E affected without demonstrated equivalence', () => {
    const r = assessFdaChange({
      ...noChange,
      couldSignificantlyAffectSafetyOrEffectiveness: true,
      verificationDemonstratesEquivalence: false,
    });
    expect(r.decision).toBe('new_510k');
  });

  it('letter-to-file when triggers exist but equivalence demonstrated', () => {
    const r = assessFdaChange({
      ...noChange,
      changesPatientContactingMaterials: true,
      verificationDemonstratesEquivalence: true,
    });
    expect(r.decision).toBe('letter_to_file');
    expect(r.triggers.length).toBeGreaterThan(0);
  });
});

describe('assessEuSignificantChange', () => {
  it('significant when intended purpose changes', () => {
    const r = assessEuSignificantChange({
      changesIntendedPurpose: true,
      changesDesignOrPerformanceOutsideSpec: false,
      changesSterilisationOrMaterials: false,
      significantSoftwareChange: false,
      newOperatingPrinciple: false,
    });
    expect(r.significant).toBe(true);
  });

  it('non-significant when no criterion met', () => {
    const r = assessEuSignificantChange({
      changesIntendedPurpose: false,
      changesDesignOrPerformanceOutsideSpec: false,
      changesSterilisationOrMaterials: false,
      significantSoftwareChange: false,
      newOperatingPrinciple: false,
    });
    expect(r.significant).toBe(false);
  });
});
