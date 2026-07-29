/**
 * Unit tests for the nonclinical study-program requirements & gap engine.
 * Pure module — no mocks.
 */

import { describe, it, expect } from 'vitest';

import {
  requiredRepeatDoseToxDuration,
  requiredNonclinicalBattery,
  assessNonclinicalProgram,
  type PresentStudy,
} from '../nonclinical-program-requirements';

describe('requiredRepeatDoseToxDuration (ICH M3(R2) Table 1)', () => {
  it('maps clinical duration to required tox duration', () => {
    expect(requiredRepeatDoseToxDuration(2)).toEqual({ rodent: 2, nonRodent: 2 });
    expect(requiredRepeatDoseToxDuration(13)).toEqual({ rodent: 13, nonRodent: 13 });
    expect(requiredRepeatDoseToxDuration(52)).toEqual({ rodent: 26, nonRodent: 39 });
  });
});

describe('requiredNonclinicalBattery', () => {
  it('requires the core battery before FIH and relaxes genotox under oncology', () => {
    const std = requiredNonclinicalBattery({ maxClinicalDurationWeeks: 2, targetPhase: 1 });
    expect(std.find(s => s.key === 'safety_pharm')?.requirement).toBe('required');
    expect(std.find(s => s.key === 'genotox_ames')?.requirement).toBe('required');

    const onc = requiredNonclinicalBattery({ maxClinicalDurationWeeks: 2, targetPhase: 1, oncology: true });
    expect(onc.find(s => s.key === 'genotox_ames')?.requirement).toBe('conditional');
  });

  it('adds local tolerance for a non-oral route and carcinogenicity for chronic marketing', () => {
    const iv = requiredNonclinicalBattery({ maxClinicalDurationWeeks: 4, route: 'intravenous' });
    expect(iv.find(s => s.key === 'local_tolerance')?.requirement).toBe('required');

    const carc = requiredNonclinicalBattery({ maxClinicalDurationWeeks: 52, chronicUse: true, marketingApplication: true });
    expect(carc.find(s => s.key === 'carcinogenicity')?.requirement).toBe('required');
  });
});

describe('assessNonclinicalProgram', () => {
  const phase1Present: PresentStudy[] = [
    { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 2 },
    { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 2 },
    { studyType: 'safety_pharm' },
    { studyType: 'genotox', genotoxComponent: 'ames' },
    { studyType: 'genotox', genotoxComponent: 'in_vitro_mammalian' },
  ];

  it('is adequate for a 2-week Phase 1 trial with the core battery', () => {
    const a = assessNonclinicalProgram({ maxClinicalDurationWeeks: 2, targetPhase: 1 }, phase1Present);
    expect(a.adequate).toBe(true);
    expect(a.gaps).toHaveLength(0);
  });

  it('flags the missing in-vivo genotox assay at Phase 2', () => {
    const a = assessNonclinicalProgram({ maxClinicalDurationWeeks: 2, targetPhase: 2 }, phase1Present);
    expect(a.adequate).toBe(false);
    expect(a.gaps.some(g => g.key === 'genotox_in_vivo')).toBe(true);
  });

  it('flags a missing non-rodent species', () => {
    const present = phase1Present.filter(p => p.species !== 'dog');
    const a = assessNonclinicalProgram({ maxClinicalDurationWeeks: 2, targetPhase: 1 }, present);
    expect(a.gaps.some(g => g.reason.includes('non-rodent'))).toBe(true);
  });

  it('flags an insufficient repeat-dose duration for a longer trial', () => {
    const a = assessNonclinicalProgram({ maxClinicalDurationWeeks: 26, targetPhase: 2 }, phase1Present);
    // 2-week studies cannot support 26-week dosing.
    expect(a.gaps.some(g => g.key === 'repeat_dose_tox')).toBe(true);
  });

  it('does not gate genotox for an oncology (ICH S9) program', () => {
    const present: PresentStudy[] = [
      { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 4 },
      { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 4 },
      { studyType: 'safety_pharm' },
    ];
    const a = assessNonclinicalProgram({ maxClinicalDurationWeeks: 4, targetPhase: 2, oncology: true }, present);
    expect(a.gaps.some(g => g.key.startsWith('genotox'))).toBe(false);
  });

  it('requires EFD before Phase 3 when WOCBP are enrolled', () => {
    const a = assessNonclinicalProgram(
      { maxClinicalDurationWeeks: 13, targetPhase: 3, includesWocbp: true },
      phase1Present,
    );
    expect(a.gaps.some(g => g.key === 'dart_efd')).toBe(true);
  });
});
