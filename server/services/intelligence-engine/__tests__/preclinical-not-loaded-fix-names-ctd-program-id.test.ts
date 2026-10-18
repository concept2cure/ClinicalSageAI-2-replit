/**
 * When no nonclinical studies were loaded, the preclinical reviewer's fix says
 * how to load them: ingest the reports and run the simulation with ctdProgramId.
 *
 * What the code used to say: "…or attach nonclinical facts to the simulator
 * request", and docs/preclinical-module4.md said other dosing bases "need to be
 * supplied via the simulator request". The simulator sets caller-supplied facts
 * aside (2026-10-15) and reads nonclinical facts only from the program's
 * ctd_nonclinical_studies, so following that advice changed nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REVIEWER_PERSONAS, type PersonaInputs } from '../reviewer-personas';

const inputs: PersonaInputs = {
  program: { programType: 'IND', productType: 'drug', deviceClass: null, primaryAgency: 'FDA', developmentStage: 'ind_enabling' },
  packet: null,
  intel: { contradictionCount: 0, orphanClaimCount: 0, unsupportedClaimCount: 0, defensibilityScore: null, missingSections: [] },
};

describe('preclinical reviewer: the "not loaded" fix is one that loads the data', () => {
  it('tells the caller to run the simulation with ctdProgramId, not to attach facts to the request', () => {
    const notLoaded = REVIEWER_PERSONAS.preclinical_toxicologist
      .rules(inputs)
      .find(q => q.trigger === 'nonclinical_intel_missing');
    expect(notLoaded?.recommendedFix, 'the fix pointed at caller-attached facts the simulator sets aside').not.toMatch(
      /attach nonclinical facts/i,
    );
    expect(notLoaded?.recommendedFix).toBe(
      'Ingest the preclinical study reports via /api/preclinical/ingest and run the simulation with ctdProgramId.',
    );
  });

  it('the Module 4 doc does not say facts are supplied via the simulator request', () => {
    const doc = readFileSync(join(__dirname, '../../../../docs/preclinical-module4.md'), 'utf8');
    expect(doc, 'the doc still sends facts through the simulator request').not.toMatch(/supplied via the simulator request/i);
  });
});
