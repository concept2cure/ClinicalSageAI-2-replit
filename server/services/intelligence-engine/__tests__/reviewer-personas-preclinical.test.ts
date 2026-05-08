/**
 * Tests for the preclinical toxicologist + GLP auditor personas.
 *
 * Pure unit tests — no DB. Each rule has an "off" case (no question fires)
 * and an "on" case (the rule fires with the right severity + trigger code).
 */

import { describe, expect, test } from 'vitest';

import {
  REVIEWER_PERSONAS,
  type NonclinicalIntelFacts,
  type PersonaInputs,
  type PersonaProgramFacts,
} from '../reviewer-personas';

const indProgram = (overrides: Partial<PersonaProgramFacts> = {}): PersonaProgramFacts => ({
  programType: 'IND',
  productType: 'drug',
  deviceClass: null,
  primaryAgency: 'FDA',
  developmentStage: 'ind_enabling',
  clinicalPhase: 1,
  ...overrides,
});

const baseIntel = {
  contradictionCount: 0,
  orphanClaimCount: 0,
  unsupportedClaimCount: 0,
  defensibilityScore: null,
  missingSections: [],
};

const baseGenotoxOk = { ames: true, inVitroMammalian: true, inVivo: true };

const make = (
  nonclinical: NonclinicalIntelFacts | undefined,
  programOverrides: Partial<PersonaProgramFacts> = {},
): PersonaInputs => ({
  program: indProgram(programOverrides),
  packet: null,
  intel: { ...baseIntel, nonclinical },
});

const tox = REVIEWER_PERSONAS.preclinical_toxicologist;
const glp = REVIEWER_PERSONAS.glp_auditor;

describe('preclinical_toxicologist appliesTo', () => {
  test('applies to IND/NDA/BLA programs', () => {
    expect(tox.appliesTo(indProgram())).toBe(true);
    expect(tox.appliesTo(indProgram({ programType: 'NDA' }))).toBe(true);
    expect(tox.appliesTo(indProgram({ programType: 'BLA' }))).toBe(true);
  });
  test('applies to drug/biologic productType regardless of program', () => {
    expect(
      tox.appliesTo({
        ...indProgram(),
        programType: '510K',
        productType: 'drug',
      }),
    ).toBe(true);
  });
  test('does not apply to a vanilla 510(k) device', () => {
    expect(
      tox.appliesTo({
        programType: '510K',
        productType: 'device',
        deviceClass: 'II',
        primaryAgency: 'FDA',
      }),
    ).toBe(false);
  });
});

describe('preclinical_toxicologist rules', () => {
  test('emits info stub when nonclinical intel is missing', () => {
    const result = tox.rules(make(undefined));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('info');
    expect(result[0].trigger).toBe('nonclinical_intel_missing');
    expect(result[0].citation).toBeTruthy();
  });

  test('NC_GLP_PIVOTAL_MISSING fires when a pivotal study is non-GLP', () => {
    const result = tox.rules(
      make({
        studies: [
          {
            studyType: 'repeat_dose_tox',
            species: 'rat',
            durationWeeks: 13,
            glpCompliant: false,
            noael: '50 mg/kg',
            pivotal: true,
          },
          {
            studyType: 'repeat_dose_tox',
            species: 'dog',
            durationWeeks: 13,
            glpCompliant: true,
            noael: '20 mg/kg',
            pivotal: true,
          },
        ],
        genotoxBattery: baseGenotoxOk,
      }),
    );
    const hit = result.find(r => r.trigger === 'NC_GLP_PIVOTAL_MISSING');
    expect(hit?.severity).toBe('critical');
    expect(hit?.citation).toContain('21 CFR Part 58');
  });

  test('NC_SPECIES_COVERAGE fires when chronic repeat-dose lacks non-rodent', () => {
    const result = tox.rules(
      make({
        studies: [
          {
            studyType: 'repeat_dose_tox',
            species: 'rat',
            durationWeeks: 26,
            glpCompliant: true,
            noael: '50 mg/kg',
            pivotal: true,
          },
        ],
        genotoxBattery: baseGenotoxOk,
      }),
    );
    const hit = result.find(r => r.trigger === 'NC_SPECIES_COVERAGE');
    expect(hit?.severity).toBe('critical');
    expect(hit?.citation).toContain('ICH M3');
  });

  test('NC_SPECIES_COVERAGE does NOT fire when both species present', () => {
    const result = tox.rules(
      make({
        studies: [
          { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 26, glpCompliant: true, noael: '50', pivotal: true },
          { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 26, glpCompliant: true, noael: '25', pivotal: true },
        ],
        genotoxBattery: baseGenotoxOk,
      }),
    );
    expect(result.find(r => r.trigger === 'NC_SPECIES_COVERAGE')).toBeUndefined();
  });

  test('NC_NOAEL_MARGIN_INSUFFICIENT critical at <2x and warning at <10x', () => {
    const critical = tox.rules(
      make({
        studies: [
          { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', safetyMarginMultiple: 1.5, pivotal: true },
          { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 13, glpCompliant: true, noael: '5', safetyMarginMultiple: 9, pivotal: true },
        ],
        genotoxBattery: baseGenotoxOk,
      }),
    );
    const c = critical.find(r => r.trigger === 'NC_NOAEL_MARGIN_INSUFFICIENT');
    expect(c?.severity).toBe('critical');

    const warn = tox.rules(
      make({
        studies: [
          { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', safetyMarginMultiple: 6, pivotal: true },
          { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 13, glpCompliant: true, noael: '5', safetyMarginMultiple: 8, pivotal: true },
        ],
        genotoxBattery: baseGenotoxOk,
      }),
    );
    const w = warn.find(r => r.trigger === 'NC_NOAEL_MARGIN_INSUFFICIENT');
    expect(w?.severity).toBe('warning');
  });

  test('NC_NOAEL_MARGIN_INSUFFICIENT does NOT fire when MRHD is unknown (no margins reported)', () => {
    const result = tox.rules(
      make({
        studies: [
          { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
          { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
        ],
        genotoxBattery: baseGenotoxOk,
      }),
    );
    expect(result.find(r => r.trigger === 'NC_NOAEL_MARGIN_INSUFFICIENT')).toBeUndefined();
  });

  test('NC_GENOTOX_BATTERY_INCOMPLETE lists missing components', () => {
    const result = tox.rules(
      make({
        studies: [
          { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
          { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
        ],
        genotoxBattery: { ames: true, inVitroMammalian: false, inVivo: false },
      }),
    );
    const hit = result.find(r => r.trigger === 'NC_GENOTOX_BATTERY_INCOMPLETE');
    expect(hit?.severity).toBe('critical');
    expect(hit?.question).toContain('in vitro mammalian');
    expect(hit?.question).toContain('in vivo');
  });

  test('NC_REPRO_TOX_STAGE_MISMATCH fires for phase ≥ 2 without DART', () => {
    const result = tox.rules(
      make(
        {
          studies: [
            { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
            { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
          ],
          genotoxBattery: baseGenotoxOk,
        },
        { clinicalPhase: 2 },
      ),
    );
    const hit = result.find(r => r.trigger === 'NC_REPRO_TOX_STAGE_MISMATCH');
    expect(hit?.severity).toBe('warning');
  });

  test('NC_CARC_REQUIRED_MISSING fires for chronic indication without carc', () => {
    const result = tox.rules(
      make(
        {
          studies: [
            { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
            { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
          ],
          genotoxBattery: baseGenotoxOk,
        },
        { indicationChronic: true },
      ),
    );
    const hit = result.find(r => r.trigger === 'NC_CARC_REQUIRED_MISSING');
    expect(hit?.severity).toBe('warning');
    expect(hit?.citation).toContain('ICH S1B');
  });

  test('every emitted question carries persona + citation', () => {
    const result = tox.rules(
      make(
        {
          studies: [
            { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 26, glpCompliant: false, noael: '5', safetyMarginMultiple: 1.5, pivotal: true },
          ],
          genotoxBattery: { ames: false, inVitroMammalian: true, inVivo: true },
        },
        { indicationChronic: true, clinicalPhase: 2 },
      ),
    );
    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect(r.persona).toBe('preclinical_toxicologist');
      expect(r.citation).toBeTruthy();
    }
  });
});

describe('glp_auditor rules', () => {
  test('NC_TK_DATA_MISSING fires when repeat-dose without TK', () => {
    const result = glp.rules(
      make({
        studies: [
          { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
        ],
        genotoxBattery: baseGenotoxOk,
      }),
    );
    const hit = result.find(r => r.trigger === 'NC_TK_DATA_MISSING');
    expect(hit?.severity).toBe('critical');
    expect(hit?.citation).toContain('ICH S3A');
  });

  test('NC_TK_DATA_MISSING does NOT fire when TK study is present', () => {
    const result = glp.rules(
      make({
        studies: [
          { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
          { studyType: 'tk', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: null, pivotal: false },
        ],
        genotoxBattery: baseGenotoxOk,
      }),
    );
    expect(result.find(r => r.trigger === 'NC_TK_DATA_MISSING')).toBeUndefined();
  });
});
