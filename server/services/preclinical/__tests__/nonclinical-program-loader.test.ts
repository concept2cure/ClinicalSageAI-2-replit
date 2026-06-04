/**
 * Unit tests for the nonclinical program loader.
 *
 * The row→shape mappers are pure and tested directly with fixture rows. The DB
 * fetch is exercised only on its flag-off path (PRECLINICAL_REVIEWER_ENABLED is
 * unset by default), which returns undefined without touching the database.
 */

import { describe, it, expect } from 'vitest';

import {
  mapRowToStudyInput,
  deriveGenotoxComponent,
  mapRowToPresentStudy,
  mapRowToSpeciesNoael,
  loadNonclinicalProgram,
  type NonclinicalRow,
} from '../nonclinical-program-loader';

const toxRow: NonclinicalRow = {
  id: 7,
  studyType: 'repeat_dose_tox',
  studyTitle: '13-week rat tox',
  species: 'rat',
  durationWeeks: 13,
  glpCompliant: true,
  noael: '50 mg/kg/day',
  keyFindings: 'Hepatocellular hypertrophy at high dose.',
};

describe('mapRowToStudyInput', () => {
  it('maps a row to the composer study shape with the right section', () => {
    const s = mapRowToStudyInput(toxRow);
    expect(s.studyId).toBe('7');
    expect(s.studyType).toBe('repeat_dose_tox');
    expect(s.reportSection).toBe('4.2.3.2');
    expect(s.noael).toBe('50 mg/kg/day');
  });
});

describe('deriveGenotoxComponent', () => {
  it('classifies the genotox battery component from row text', () => {
    expect(deriveGenotoxComponent({ studyType: 'genotox', studyTitle: 'Ames bacterial reverse mutation' })).toBe('ames');
    expect(deriveGenotoxComponent({ studyType: 'genotox', studyTitle: 'in vitro micronucleus CHO' })).toBe('in_vitro_mammalian');
    expect(deriveGenotoxComponent({ studyType: 'genotox', studyTitle: 'in vivo comet assay' })).toBe('in_vivo');
    expect(deriveGenotoxComponent(toxRow)).toBeUndefined();
  });
});

describe('mapRowToPresentStudy', () => {
  it('carries the genotox component for the gap engine', () => {
    const p = mapRowToPresentStudy({ studyType: 'genotox', studyTitle: 'Ames test' });
    expect(p.studyType).toBe('genotox');
    expect(p.genotoxComponent).toBe('ames');
  });
});

describe('mapRowToSpeciesNoael', () => {
  it('extracts a species NOAEL when the dose is parseable', () => {
    expect(mapRowToSpeciesNoael(toxRow)).toEqual({ species: 'rat', noaelMgPerKg: 50, studyRef: '13-week rat tox' });
  });
  it('returns null without a parseable NOAEL or species', () => {
    expect(mapRowToSpeciesNoael({ studyType: 'repeat_dose_tox', species: 'rat', noael: 'not reported' })).toBeNull();
    expect(mapRowToSpeciesNoael({ studyType: 'repeat_dose_tox', noael: '50 mg/kg/day' })).toBeNull();
  });
});

describe('loadNonclinicalProgram (flag-off path)', () => {
  it('returns undefined when PRECLINICAL_REVIEWER_ENABLED is unset', async () => {
    expect(await loadNonclinicalProgram(123)).toBeUndefined();
  });
});
