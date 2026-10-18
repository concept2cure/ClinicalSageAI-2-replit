/**
 * designADMEProgram (AnA tool design_adme_program) grades the human
 * radiolabeled mass-balance study from the stated NCE status (2026-10-15).
 *
 * The study's grade rests on the program being a new chemical entity ("Required
 * for an NCE program"), yet it was 'required' from Phase 1 on whatever
 * isNewChemicalEntity said: a program stated not to be an NCE was graded as
 * one, and so was a program whose NCE status nobody stated (while the FIH
 * checklist said that status "is not assumed"). One stage earlier it was
 * 'recommended' on the same premise.
 */
import { describe, expect, it } from 'vitest';
import {
  designADMEProgram,
  type DesignADMEProgramParams,
  type DesignADMEProgramResult,
} from '../nonclinical-adme-knowledge';
import { DESIGN_ADME_PROGRAM } from '../../ana/nonclinicalAdmeTools';

const design = (p: unknown) => designADMEProgram(p as DesignADMEProgramParams);
const massBalance = (r: DesignADMEProgramResult) => r.studies.find((s) => s.studyId === 'human_mass_balance');
const PHASE1 = { modality: 'small_molecule', developmentStage: 'phase1', route: 'oral' };
const IND = { ...PHASE1, developmentStage: 'ind_enabling' };

describe('designADMEProgram human mass balance', () => {
  it('is not required of a program stated not to be a new chemical entity, and says why', () => {
    const hm = massBalance(design({ ...PHASE1, isNewChemicalEntity: false }));
    expect(hm?.necessity, 'human mass balance with isNewChemicalEntity: false').toBe('conditional');
    expect(hm?.conditionalOn).toMatch(/isNewChemicalEntity is false \(stated\)/);
    expect(hm?.conditionalOn).toMatch(/already characterized/);
  });

  it('is required of a stated new chemical entity', () => {
    expect(massBalance(design({ ...PHASE1, isNewChemicalEntity: true }))?.necessity).toBe('required');
  });

  it('turns on NCE status when nobody stated it', () => {
    const hm = massBalance(design(PHASE1));
    expect(hm?.necessity, 'human mass balance with isNewChemicalEntity unstated').toBe('conditional');
    expect(hm?.conditionalOn).toMatch(/isNewChemicalEntity \(not stated\)/);
  });

  it('is recommended a stage ahead only for a stated new chemical entity', () => {
    expect(massBalance(design({ ...IND, isNewChemicalEntity: true }))?.necessity).toBe('recommended');
    expect(massBalance(design({ ...IND, isNewChemicalEntity: false }))?.necessity).toBe('conditional');
    expect(massBalance(design(IND))?.necessity).toBe('conditional');
  });

  it('carries the condition into the FIH checklist and the summary count', () => {
    const r = design({ ...PHASE1, isNewChemicalEntity: false, metabolicClearanceExpected: true, ddiPotentialExpected: true });
    expect(r.fihReadinessChecklist.join('\n')).toMatch(/\(14C\) mass-balance .* conditional on isNewChemicalEntity is false/);
    expect(r.summary).toMatch(/1 conditional on an input not stated/);
    const nce = design({ ...PHASE1, isNewChemicalEntity: true, metabolicClearanceExpected: true, ddiPotentialExpected: true });
    expect(nce.fihReadinessChecklist.join('\n')).not.toMatch(/conditional/);
  });

  it('tells AnA what NCE status decides', () => {
    const props = DESIGN_ADME_PROGRAM.input_schema.properties as Record<string, { description: string }>;
    expect(props.isNewChemicalEntity.description).toMatch(/human mass-balance study/);
  });
});
