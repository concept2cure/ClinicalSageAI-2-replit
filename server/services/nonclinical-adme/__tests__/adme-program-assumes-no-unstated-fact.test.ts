/**
 * designADMEProgram (AnA tool design_adme_program) states only the facts it was
 * given (2026-10-15).
 *
 * Unstated inputs were filled in. isNewChemicalEntity defaulted to true for a
 * small molecule, so the FIH checklist said "This is a new chemical entity".
 * metabolicClearanceExpected defaulted to false for an ADC ("Metabolic clearance
 * is not expected to dominate", reaction phenotyping 'recommended') and to true
 * for a small molecule (reaction phenotyping 'required'). ddiPotentialExpected
 * defaulted to false, grading transporter inhibition 'recommended'. An unstated
 * or unknown developmentStage was read as lead_optimization ("at undefined: 2
 * required studies"), an unstated route printed "(undefined)", and an unstated
 * modality threw a TypeError.
 */
import { describe, expect, it } from 'vitest';
import {
  designADMEProgram,
  type DesignADMEProgramParams,
  type DesignADMEProgramResult,
} from '../nonclinical-adme-knowledge';
import { DESIGN_ADME_PROGRAM } from '../../ana/nonclinicalAdmeTools';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../../ana/AnaToolExecutor';

const design = (p: unknown) => designADMEProgram(p as DesignADMEProgramParams);
const study = (r: DesignADMEProgramResult, id: string) => r.studies.find((s) => s.studyId === id);
const SM = { modality: 'small_molecule', developmentStage: 'ind_enabling', route: 'oral' };
const ADC = { modality: 'adc', developmentStage: 'ind_enabling', route: 'iv' };

describe('designADMEProgram', () => {
  it('does not call a small molecule a new chemical entity when nobody said so', () => {
    const checklist = design(SM).fihReadinessChecklist.join('\n');
    expect(checklist, 'FIH checklist with isNewChemicalEntity unstated').not.toMatch(/This is a new chemical entity/);
    expect(checklist).toMatch(/isNewChemicalEntity\) was not stated/);
  });

  it('says so when it was stated', () => {
    expect(design({ ...SM, isNewChemicalEntity: true }).fihReadinessChecklist.join('\n')).toMatch(/This is a new chemical entity/);
    expect(design({ ...SM, isNewChemicalEntity: false }).fihReadinessChecklist.join('\n')).not.toMatch(/new chemical entity/i);
  });

  it('does not say metabolic clearance is minor for an ADC when nobody said so', () => {
    const r = design(ADC);
    expect(r.strategyNotes.join(' '), 'ADC strategy notes with metabolicClearanceExpected unstated').not.toMatch(/not expected to dominate/);
    const rp = study(r, 'reaction_phenotyping');
    expect(rp?.necessity).toBe('conditional');
    expect(rp?.conditionalOn).toMatch(/metabolicClearanceExpected/);
  });

  it('does not assume metabolic clearance dominates for a small molecule either', () => {
    expect(study(design(SM), 'reaction_phenotyping')?.necessity).toBe('conditional');
  });

  it('grades reaction phenotyping from a stated clearance route', () => {
    expect(study(design({ ...SM, metabolicClearanceExpected: true }), 'reaction_phenotyping')?.necessity).toBe('required');
    const minor = design({ ...ADC, metabolicClearanceExpected: false });
    expect(study(minor, 'reaction_phenotyping')?.necessity).toBe('recommended');
    expect(minor.strategyNotes.join(' ')).toMatch(/not expected to dominate/);
  });

  it('leaves transporter inhibition conditional while DDI potential is unstated', () => {
    const ti = study(design(SM), 'transporter_inhibition');
    expect(ti?.necessity, 'transporter inhibition with ddiPotentialExpected unstated').toBe('conditional');
    expect(ti?.conditionalOn).toMatch(/ddiPotentialExpected/);
    expect(study(design({ ...SM, ddiPotentialExpected: true }), 'transporter_inhibition')?.necessity).toBe('required');
    expect(study(design({ ...SM, ddiPotentialExpected: false }), 'transporter_inhibition')?.necessity).toBe('recommended');
  });

  it('lists a conditional pre-FIH study with the input it turns on, and counts it in the summary', () => {
    const r = design(SM);
    expect(r.fihReadinessChecklist.join('\n')).toMatch(/transporter inhibition.*conditional on ddiPotentialExpected/i);
    expect(r.summary).toMatch(/2 conditional on an input not stated/);
    const stated = design({ ...SM, metabolicClearanceExpected: true, ddiPotentialExpected: true });
    expect(stated.studies.some((s) => s.necessity === 'conditional')).toBe(false);
    expect(stated.summary).not.toMatch(/conditional/);
  });

  it('refuses to grade studies for a stage, modality or route nobody stated', () => {
    expect(() => design({ modality: 'small_molecule', route: 'oral' }), 'design with developmentStage unstated').toThrow(/developmentStage/);
    expect(() => design({ ...SM, developmentStage: 'preclinical' })).toThrow(/developmentStage/);
    expect(() => design({ modality: 'small_molecule', developmentStage: 'phase1' })).toThrow(/route/);
    expect(() => design({})).toThrow(/modality.*developmentStage.*route/);
  });

  it('reaches AnA as a request for the missing input, not as a design', async () => {
    const reply = await getToolHandler('design_adme_program')!({ modality: 'small_molecule', route: 'oral' }, { organizationId: 1, userId: 1 } as never);
    const out = JSON.parse(reply) as Record<string, unknown>;
    expect(out).toMatchObject({ status: 'needs_parameters', field: 'developmentStage' });
    expect(out).not.toHaveProperty('result');
  });

  it('tells AnA that these inputs are not assumed', () => {
    // Within the 1024 characters OpenAI keeps of a tool description.
    expect(DESIGN_ADME_PROGRAM.description.slice(0, 1024)).toMatch(/"conditional" and its conditionalOn names that input/);
    const props = DESIGN_ADME_PROGRAM.input_schema.properties as Record<string, { description: string }>;
    for (const k of ['isNewChemicalEntity', 'metabolicClearanceExpected', 'ddiPotentialExpected']) {
      expect(props[k].description, k).not.toMatch(/Defaults to/);
      expect(props[k].description, k).toMatch(/not assumed/i);
    }
  });
});
