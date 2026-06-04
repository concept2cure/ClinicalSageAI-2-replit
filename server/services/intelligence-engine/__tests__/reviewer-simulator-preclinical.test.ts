/**
 * Tests for the preclinical wiring of the reviewer simulator.
 * Mocks the preclinical-intel-loader so the test runs without a DB.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../../../db', () => ({
  db: {
    insert: () => ({
      values: () => ({ returning: () => Promise.resolve([{ id: 'sim-run-pc-1' }]) }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  },
}));

const loadPreclinicalIntelMock = vi.fn();
vi.mock('../../preclinical/preclinical-intel-loader', () => ({
  loadPreclinicalIntel: (...args: unknown[]) => loadPreclinicalIntelMock(...args),
}));

import { runReviewerSimulation } from '../reviewer-simulator.service';
import type { PersonaProgramFacts } from '../reviewer-personas';

const ORG = 7;
const PROGRAM = '00000000-0000-0000-0000-000000000002';

const indProgram: PersonaProgramFacts = {
  programType: 'IND',
  productType: 'drug',
  deviceClass: null,
  primaryAgency: 'FDA',
  developmentStage: 'ind_enabling',
  clinicalPhase: 1,
};

const baseIntel = {
  contradictionCount: 0,
  orphanClaimCount: 0,
  unsupportedClaimCount: 0,
  defensibilityScore: null,
  missingSections: [],
};

beforeEach(() => {
  loadPreclinicalIntelMock.mockReset();
});

describe('runReviewerSimulation — preclinical wiring', () => {
  test('does not call loader when ctdProgramId is omitted', async () => {
    const result = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: indProgram,
      intel: baseIntel,
      dryRun: true,
    });
    expect(loadPreclinicalIntelMock).not.toHaveBeenCalled();
    expect(result.personaScope).toContain('preclinical_toxicologist');
    // Persona applies but had no nonclinical intel → emits info stub
    const stub = result.questions.find(q => q.trigger === 'nonclinical_intel_missing');
    expect(stub?.severity).toBe('info');
  });

  test('calls loader when ctdProgramId is provided and merges nonclinical intel', async () => {
    loadPreclinicalIntelMock.mockResolvedValueOnce({
      studies: [
        { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 26, glpCompliant: false, noael: '5', pivotal: true },
      ],
      genotoxBattery: { ames: true, inVitroMammalian: true, inVivo: true },
    });

    const result = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: indProgram,
      intel: baseIntel,
      ctdProgramId: 42,
      dryRun: true,
    });

    expect(loadPreclinicalIntelMock).toHaveBeenCalledTimes(1);
    expect(loadPreclinicalIntelMock).toHaveBeenCalledWith(42, ORG, expect.any(Object));
    // GLP rule should fire because pivotal study has glpCompliant=false
    const glpHit = result.questions.find(r => r.trigger === 'NC_GLP_PIVOTAL_MISSING');
    expect(glpHit?.severity).toBe('critical');
  });

  test('inputsHash is stable across two runs with the same loaded nonclinical fixture', async () => {
    const fixture = {
      studies: [
        { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
        { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
      ],
      genotoxBattery: { ames: true, inVitroMammalian: true, inVivo: true },
    };
    loadPreclinicalIntelMock.mockResolvedValue(fixture);

    const a = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: indProgram,
      intel: baseIntel,
      ctdProgramId: 42,
      dryRun: true,
    });
    const b = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: { ...indProgram },
      intel: { ...baseIntel },
      ctdProgramId: 42,
      dryRun: true,
    });
    expect(a.inputsHash).toBe(b.inputsHash);
    expect(a.inputsHash.length).toBe(64);
  });

  test('inputsHash differs when nonclinical fixture differs', async () => {
    loadPreclinicalIntelMock.mockResolvedValueOnce({
      studies: [
        { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '5', pivotal: true },
      ],
      genotoxBattery: { ames: true, inVitroMammalian: true, inVivo: true },
    });
    const a = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: indProgram,
      intel: baseIntel,
      ctdProgramId: 42,
      dryRun: true,
    });

    loadPreclinicalIntelMock.mockResolvedValueOnce({
      studies: [
        { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: false, noael: '5', pivotal: true },
      ],
      genotoxBattery: { ames: true, inVitroMammalian: true, inVivo: true },
    });
    const b = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: indProgram,
      intel: baseIntel,
      ctdProgramId: 42,
      dryRun: true,
    });

    expect(a.inputsHash).not.toBe(b.inputsHash);
  });

  test('falls back to info stub when loader returns undefined (flag off)', async () => {
    loadPreclinicalIntelMock.mockResolvedValueOnce(undefined);
    const result = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: indProgram,
      intel: baseIntel,
      ctdProgramId: 42,
      dryRun: true,
    });
    const stub = result.questions.find(q => q.trigger === 'nonclinical_intel_missing');
    expect(stub?.severity).toBe('info');
  });

  test('preclinical persona is NOT scoped for a vanilla 510(k) device', async () => {
    const result = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: {
        programType: '510K',
        productType: 'device',
        deviceClass: 'II',
        primaryAgency: 'FDA',
      },
      intel: baseIntel,
      dryRun: true,
    });
    expect(result.personaScope).not.toContain('preclinical_toxicologist');
    expect(result.personaScope).not.toContain('glp_auditor');
  });
});
