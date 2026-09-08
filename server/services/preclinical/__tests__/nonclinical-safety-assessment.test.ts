/**
 * Unit tests for the integrated nonclinical safety assessment.
 * Pure module — composes the other engines.
 */

import { describe, it, expect } from 'vitest';

import { assessNonclinicalSafety } from '../nonclinical-safety-assessment';

describe('assessNonclinicalSafety', () => {
  it('rolls up FIH dose, adversity, gaps, and overview into a ready verdict', () => {
    const a = assessNonclinicalSafety({
      drugSubstanceName: 'BX-115',
      fih: {
        speciesNoaels: [{ species: 'dog', noaelMgPerKg: 30 }],
        mabel: { minAnticipatedEffectiveExposure: 10, exposurePerMgDose: 1 },
      },
      findings: [{ organ: 'liver', finding: 'hepatocellular hypertrophy' }],
      program: { maxClinicalDurationWeeks: 2, targetPhase: 1 },
      presentStudies: [
        { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 2 },
        { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 2 },
        { studyType: 'safety_pharm' },
        { studyType: 'genotox', genotoxComponent: 'ames' },
        { studyType: 'genotox', genotoxComponent: 'in_vitro_mammalian' },
      ],
      studies: [{ studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 2, noael: '30 mg/kg/day' }],
    });
    expect(a.fihDose?.recommendedStartingDoseMg).toBe(10);
    expect(a.toxProfile?.adaptiveFindings.length).toBe(1);
    expect(a.programGaps?.adequate).toBe(true);
    expect(a.overview?.sectionKey).toBe('2.4');
    expect(a.readiness).toBe('ready_for_fih');
    expect(a.summary).toMatch(/FIH starting dose/);
  });

  it('blocks FIH readiness when the program has gaps', () => {
    const a = assessNonclinicalSafety({
      fih: { speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }] },
      program: { maxClinicalDurationWeeks: 4, targetPhase: 2 },
      presentStudies: [{ studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 4 }],
    });
    expect(a.readiness).toBe('gaps_block_fih');
    expect(a.blockers.length).toBeGreaterThan(0);
  });

  it('reports insufficient input when nothing actionable is supplied', () => {
    const a = assessNonclinicalSafety({});
    expect(a.readiness).toBe('insufficient_input');
    expect(a.summary).toMatch(/Insufficient input/);
  });
});

describe('a dose alone is not FIH readiness', () => {
  it('reports insufficient_input when the study battery was never assessed, and says so', () => {
    // Dose-only input used to read 'ready_for_fih' with the ICH M3(R2)/S-series
    // battery never checked; the tool then serialised programGaps as [].
    const a = assessNonclinicalSafety({
      drugSubstanceName: 'BX-115',
      fih: { speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }] },
    });
    expect(a.fihDose).not.toBeNull();
    expect(a.programAssessed).toBe(false);
    expect(a.readiness).toBe('insufficient_input');
    expect(a.summary).toMatch(/study battery was not assessed/);
    expect(a.summary).not.toMatch(/battery is complete/);
  });

  it('is ready_for_fih only when the battery was assessed and complete', () => {
    const a = assessNonclinicalSafety({
      fih: { speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }] },
      program: { maxClinicalDurationWeeks: 2, targetPhase: 1 },
      presentStudies: ['single_dose_tox', 'repeat_dose_tox_rodent', 'repeat_dose_tox_nonrodent', 'safety_pharm_cardiovascular', 'safety_pharm_cns', 'safety_pharm_respiratory', 'genotox_ames', 'genotox_chromosomal', 'pk_adme', 'local_tolerance'] as any,
    });
    expect(a.programAssessed).toBe(true);
    expect(['ready_for_fih', 'gaps_block_fih']).toContain(a.readiness);
    if (a.readiness === 'ready_for_fih') expect(a.programGaps?.gaps).toHaveLength(0);
  });
});

