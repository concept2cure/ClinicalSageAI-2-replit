/**
 * End-to-end workflow integration test for the nonclinical pipeline.
 *
 * The unit suites test each engine in isolation. This test proves the *handoff*
 * the load_nonclinical_program tool promises: that the loader's row→shape
 * mappers produce arrays that flow correctly into the M2.4 / M2.6 composers, the
 * study-program gap engine, the FIH dose engine, and the integrated safety
 * assessment — the exact sequence ANA runs on a real program. It is mock-free:
 * it drives the pure mappers directly with fixture rows, so a shape mismatch
 * anywhere in the chain fails here rather than at runtime.
 */

import { describe, it, expect } from 'vitest';

import {
  mapRowToStudyInput,
  mapRowToPresentStudy,
  mapRowToSpeciesNoael,
  type NonclinicalRow,
} from '../nonclinical-program-loader';
import { buildEnrichedM24 } from '../nonclinical-m24-adapter';
import { buildM26NonclinicalSummaries } from '../m26-nonclinical-summaries';
import { assessNonclinicalProgram } from '../nonclinical-program-requirements';
import { computeFirstInHumanDose } from '../fih-dose-engine';
import { assessNonclinicalSafety } from '../nonclinical-safety-assessment';

// A small but complete Phase-1-ready program, as it would come back from
// ctd_nonclinical_studies.
const programRows: NonclinicalRow[] = [
  { id: 1, studyType: 'repeat_dose_tox', studyTitle: '4-week rat tox', species: 'rat', durationWeeks: 4, glpCompliant: true, noael: '50 mg/kg/day', keyFindings: 'Hepatocellular hypertrophy at high dose.' },
  { id: 2, studyType: 'repeat_dose_tox', studyTitle: '4-week dog tox', species: 'dog', durationWeeks: 4, glpCompliant: true, noael: '10 mg/kg/day', keyFindings: 'No adverse findings.' },
  { id: 3, studyType: 'safety_pharm', studyTitle: 'CV/CNS/resp core battery', species: 'dog', glpCompliant: true, noael: null, keyFindings: 'No effects.' },
  { id: 4, studyType: 'genotox', studyTitle: 'Ames bacterial reverse mutation', glpCompliant: true, noael: null, genotoxicityResults: 'Negative.' },
  { id: 5, studyType: 'genotox', studyTitle: 'in vitro micronucleus CHO', glpCompliant: true, noael: null, genotoxicityResults: 'Negative.' },
  { id: 6, studyType: 'pk', studyTitle: 'rat ADME', species: 'rat', noael: '999 mg/kg', keyFindings: 'Linear PK.' },
];

describe('nonclinical workflow: loader shapes flow through every engine', () => {
  const studies = programRows.map(mapRowToStudyInput);
  const present = programRows.map(mapRowToPresentStudy);
  const speciesNoaels = programRows.map(mapRowToSpeciesNoael).filter((s): s is NonNullable<typeof s> => s !== null);

  it('maps the program into the three engine input shapes', () => {
    expect(studies).toHaveLength(6);
    // FIH NOAELs come only from the two general-tox studies (not safety_pharm/genotox/pk).
    expect(speciesNoaels.map(s => s.species).sort()).toEqual(['dog', 'rat']);
  });

  it('feeds the M2.4 overview and M2.6 summaries', () => {
    const m24 = buildEnrichedM24({ studies, drugSubstanceName: 'BX-115' });
    expect(m24.summary.sectionKey).toBe('2.4');

    const m26 = buildM26NonclinicalSummaries({ studies, drugSubstanceName: 'BX-115' });
    expect(m26.sectionKey).toBe('2.6');
    // Pharmacology(safety_pharm), PK, and toxicology tables should all populate.
    expect(m26.tables.map(t => t.title)).toEqual(
      expect.arrayContaining([
        '2.6.3 Pharmacology Tabulated Summary',
        '2.6.5 Pharmacokinetics Tabulated Summary',
        '2.6.7 Toxicology Tabulated Summary',
      ]),
    );
  });

  it('feeds the gap engine — a complete Phase 1 battery shows no gaps', () => {
    const assessment = assessNonclinicalProgram({ maxClinicalDurationWeeks: 2, targetPhase: 1 }, present);
    expect(assessment.adequate).toBe(true);
    expect(assessment.gaps).toHaveLength(0);
  });

  it('feeds the FIH dose engine — the dog (lowest HED) governs', () => {
    const fih = computeFirstInHumanDose({ speciesNoaels });
    // dog HED = 10 * 20/37 = 5.405 mg/kg; rat HED = 50 * 6/37 = 8.108 → dog is most sensitive.
    expect(fih.mrsd.selectedSpecies).toBe('dog');
    expect(fih.recommendedStartingDoseMg).toBeGreaterThan(0);
  });

  it('composes into the integrated safety assessment with a ready verdict', () => {
    const safety = assessNonclinicalSafety({
      drugSubstanceName: 'BX-115',
      fih: { speciesNoaels },
      program: { maxClinicalDurationWeeks: 2, targetPhase: 1 },
      presentStudies: present,
      studies,
    });
    expect(safety.programGaps?.adequate).toBe(true);
    expect(safety.readiness).toBe('ready_for_fih');
    expect(safety.fihDose?.mrsd.selectedSpecies).toBe('dog');
  });
});
