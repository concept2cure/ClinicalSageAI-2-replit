/**
 * ICH M7 classes, alert matching and limit text say what the repository's own
 * record (server/services/cmc/knowledge/cmc-regulatory-record.json) holds.
 *
 * Until 2026-10-15:
 * - an alerting impurity with a negative Ames result was Class 4; the record
 *   defines Class 4 as an alert shared with the API (or a related compound)
 *   shown non-mutagenic, and Class 5 as no alert OR adequate data showing no
 *   mutagenicity. A nitrosamine was cleared on a negative Ames alone, which the
 *   record says regulators no longer accept;
 * - the alert matcher split category keys on '_' and tested substrings, so
 *   'n', 'aromatic', 'compounds', 'acids', 'azo' and 'organic' matched almost
 *   any input ("phenol" was an N-nitroso and N-oxide alert);
 * - a nitrosamine missing from the AI table got the 18 ng/day default while
 *   the text said "Compound-specific AI for X: 18 ng/day";
 * - the Phase 1 staging text listed 60 μg/day for >1-3 months, 20 for >3-6,
 *   10 for >6-12 — bands that are in neither the module's Table 2 nor the record;
 * - the combined-intake sentence was presented as a quotation of M7 although the
 *   record marks the Table 3 totals "not re-verified";
 * - assessRecordedImpurity classed an unrecorded cohort of concern as "not CoC"
 *   and returned cohortOfConcern:false for Class 4/5.
 */
import { describe, expect, it } from 'vitest';

import {
  assessStructuralAlerts,
  calculateTTC,
  classifyMutagenicImpurity,
  controlMutagenicImpurity,
  type ClassifyInput,
} from '../mutagenic-impurity-knowledge';
import { assessRecordedImpurity } from '../../cmc/impurity-assessment';

const STATED: ClassifyInput = {
  amesMutagenicity: 'negative',
  structuralAlertsPresent: 'yes',
  carcinogenicityData: 'not_tested',
  impurityRelationship: 'process_related',
  cohortOfConcernStructure: false,
};

describe('classification follows the record’s Class 4 / Class 5 definitions', () => {
  it('an alert with a negative Ames result is Class 5 (adequate negative data)', () => {
    expect(classifyMutagenicImpurity(STATED).impurityClass).toBe(5);
  });

  it('is Class 4 only when the alert is stated to be shared with the API', () => {
    expect(classifyMutagenicImpurity({ ...STATED, alertSharedWithApi: true }).impurityClass).toBe(4);
  });

  it('does not clear a nitrosamine on a negative Ames result alone', () => {
    const r = classifyMutagenicImpurity({ ...STATED, cohortOfConcernStructure: true, specificStructuralAlerts: ['N-nitroso'] });
    expect(r.impurityClass).toBe(3);
    expect(r.classDescription).toMatch(/no longer accept a negative standard or enhanced Ames/);
  });

  it('refuses a cohort-of-concern alert with a negative Ames result when the cohort is not identified', () => {
    expect(() => classifyMutagenicImpurity({ ...STATED, cohortOfConcernStructure: true })).toThrow(/specificStructuralAlerts/);
  });
});

describe('structural-alert matching uses whole phrases', () => {
  it('does not match inputs that only share a letter or a generic word with a category', () => {
    for (const group of ['phenol', 'aromatic ring', 'imidazole', 'carboxylic acids', 'organic acid', 'nitrogen heterocycle', 'heterocyclic compounds']) {
      const r = assessStructuralAlerts({ functionalGroupsPresent: [group] });
      expect(r.identifiedAlerts.filter(a => a.matched).map(a => a.alertCategory), group).toEqual([]);
      expect(r.overallAssessment, group).toBe('inconclusive');
    }
  });

  it('still matches the alerts it names', () => {
    const cases: Array<[string, string]> = [
      ['aromatic amine', 'aromatic_amines'],
      ['N-nitroso', 'n_nitroso'],
      ['NDMA', 'n_nitroso'],
      ['epoxide', 'epoxides'],
      ['alkyl halide', 'alkyl_halides'],
      ['methyl methanesulfonate', 'sulfonates'],
    ];
    for (const [group, category] of cases) {
      const r = assessStructuralAlerts({ functionalGroupsPresent: [group] });
      expect(r.identifiedAlerts.filter(a => a.matched).map(a => a.alertCategory), group).toEqual([category]);
    }
  });
});

describe('limit text', () => {
  it('says no compound-specific AI is on file when the nitrosamine is not in the table', () => {
    const r = calculateTTC({ treatmentDuration: 'lifetime', route: 'oral', compoundClass: 'CoC_nitrosamine', nitrosamineIdentity: 'NXYZ' });
    expect(r.acceptableIntakeNgPerDay).toBe(18);
    expect(r.cocConsiderations).not.toMatch(/Compound-specific AI for NXYZ/);
    expect(r.cocConsiderations).toMatch(/No compound-specific AI is on file for NXYZ/);
    expect(r.calculationBasis).not.toMatch(/compound-specific AI: Default/);
  });

  it('restates the Table 2 bands as the module holds them', () => {
    const r = controlMutagenicImpurity({
      impurityClass: 2, drugProductType: 'tablet', maxDailyDoseG: 1, treatmentDuration: 'up_to_1_month',
      developmentPhase: 'clinical_phase1', compoundClass: 'not_coc',
    });
    expect(r.phaseSpecificConsiderations.limits).not.toMatch(/60 μg\/day/);
    expect(r.phaseSpecificConsiderations.limits).toMatch(/>1 to 12 months continuous treatment: 20 μg\/day/);
    expect(r.phaseSpecificConsiderations.limits).toMatch(/>1 to 10 years continuous treatment: 10 μg\/day/);
  });

  it('labels the combined-intake rule as recalled, not quoted', () => {
    const r = calculateTTC({ treatmentDuration: 'lifetime', route: 'oral', compoundClass: 'not_coc', numberOfMutagenicImpurities: 3 });
    expect(r.multipleImpurityConsideration).not.toMatch(/states that "/);
    expect(r.multipleImpurityConsideration).toMatch(/not re-verified/);
  });
});

describe('assessRecordedImpurity — an unrecorded cohort of concern is not "not CoC"', () => {
  it('refuses a Class 4/5 record whose cohort of concern is not recorded', () => {
    const r = assessRecordedImpurity(
      { impurityName: 'X', impurityType: 'mutagenic', amesResult: 'negative', structuralAlert: 'yes' },
      'drug_substance',
    );
    expect(r.ok, JSON.stringify(r)).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('COHORT_OF_CONCERN_NOT_RECORDED');
  });
});
