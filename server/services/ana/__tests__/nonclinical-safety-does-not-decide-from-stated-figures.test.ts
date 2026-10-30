import { describe, expect, it, vi } from 'vitest';

vi.mock('../../csr/project-scope.js', async (orig) => ({
  ...await orig<typeof import('../../csr/project-scope.js')>(),
  resolveCsrScope: vi.fn(async (_db: unknown, _org: number, input: { projectId?: number }) => ({ projectId: input.projectId })),
}));
vi.mock('../../../db.js', () => ({ db: {}, pool: { query: vi.fn() }, getPool: vi.fn() }));

import { getToolHandler } from '../AnaToolExecutor.js';
import { ASSESS_NONCLINICAL_SAFETY, COMPUTE_FIH_DOSE, CLASSIFY_TOX_FINDINGS } from '../bla-biologics-tool-defs.js';
import { CALCULATE_SAFETY_MARGIN, ASSESS_CARCINOGENICITY_NEED } from '../toxicologyTools.js';
import { requiredNonclinicalBattery } from '../../preclinical/nonclinical-program-requirements.js';

const CTX = { organizationId: 3, userId: 5, projectId: 9 };
const PROGRAM = { maxClinicalDurationWeeks: 4, targetPhase: 1 } as const;
const PRESENT = [
  { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 4 },
  { studyType: 'repeat_dose_tox', species: 'dog', durationWeeks: 4 },
  { studyType: 'safety_pharm' },
  { studyType: 'genotox', genotoxComponent: 'ames' },
  { studyType: 'genotox', genotoxComponent: 'in_vitro_mammalian' },
];
const run = async (input: Record<string, unknown>, ctx: unknown = CTX) =>
  JSON.parse(await getToolHandler('assess_nonclinical_safety')!(input, ctx as never));

describe('nonclinical safety is assessed from records, not figures typed in the call', () => {
  it('a full stated battery and NOAEL cannot establish readiness or a program starting dose', async () => {
    const out = await run({
      program: PROGRAM, presentStudies: PRESENT,
      fih: { speciesNoaels: [{ species: 'dog', noaelMgPerKg: 30 }] },
      studies: [{ studyType: 'repeat_dose_tox', noael: 'MODEL-NOAEL-30' }],
      findings: [{ organ: 'liver', finding: 'MODEL-FINDING' }],
    });
    expect(out).toMatchObject({ status: 'needs_data', readiness: 'not_assessed', ignoredSuppliedFigures: true, programAssessed: false, programGaps: null });
    expect(out.requiredBattery).toEqual(requiredNonclinicalBattery(PROGRAM));
    expect(out.recommendedStartingDoseMg).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/ready_for_fih|MODEL-NOAEL-30|MODEL-FINDING/);
  });

  it('without a project, asks for one and claims no record was read', async () => {
    const out = await run({ program: PROGRAM }, { organizationId: 3, userId: 5 });
    expect(out).toMatchObject({ status: 'needs_project', readiness: 'not_assessed', programGaps: null });
    expect(out.requiredBattery).toBeUndefined();
    expect(out.message).toMatch(/no project.*read|open.*project/i);
  });

  it('refuses another project while one is open', async () => {
    expect(await run({ project_id: 10, program: PROGRAM })).toMatchObject({ status: 'cross_project', projectId: 9, readiness: 'not_assessed', programGaps: null });
  });

  it('a database failure remains an error, not an empty battery', async () => {
    const { resolveCsrScope } = await import('../../csr/project-scope.js');
    vi.mocked(resolveCsrScope).mockRejectedValueOnce(new Error('synthetic nonclinical scope failure'));
    const out = await run({ program: PROGRAM });
    expect(out.error).toMatch(/synthetic nonclinical scope failure/);
    expect(out.requiredBattery).toBeUndefined();
  });

  it('an open project with no supplied figures gets requirements and no gap determination', async () => {
    const out = await run({ program: PROGRAM });
    expect(out).toMatchObject({ status: 'needs_data', readiness: 'not_assessed', ignoredSuppliedFigures: false, programGaps: null });
    expect(out.requiredBattery).toEqual(requiredNonclinicalBattery(PROGRAM));
    expect(out.message).toMatch(/not yet.*record|record.*not yet/i);
  });

  it('does not invent a clinical duration for its requirements', async () => {
    expect(await run({})).toMatchObject({ status: 'needs_parameters', readiness: 'not_assessed' });
  });

  it('offers only project/context fields and tells the model not to pass figures', () => {
    const props = ASSESS_NONCLINICAL_SAFETY.input_schema.properties ?? {};
    expect(Object.keys(props).sort()).toEqual(['drugSubstanceName', 'indication', 'program', 'project_id']);
    expect(ASSESS_NONCLINICAL_SAFETY.description).toMatch(/do not pass/i);
    expect(ASSESS_NONCLINICAL_SAFETY.description.length).toBeLessThanOrEqual(1024);
  });
});

describe('nonclinical worksheets never decide whether the recorded program is adequate', () => {
  it.each([
    ['compute_fih_dose', { speciesNoaels: [{ species: 'dog', noaelMgPerKg: 30 }] }],
    ['calculate_safety_margin', { species: 'dog', noaelMgKg: 30 }],
  ])('%s identifies the stated NOAEL rather than a recorded program starting dose', async (tool, input) => {
    const out = JSON.parse(await getToolHandler(tool as string)!(input as Record<string, unknown>));
    expect(out).toMatchObject({ status: 'computed', basis: 'stated', appliesTo: 'the inputs stated in this conversation' });
    expect(out.instruction).toMatch(/NOAEL you stated/);
    expect(out.instruction).toMatch(/not the program's starting dose/);
  });

  it('a complete listed battery has a stated basis and no program adequacy verdict', async () => {
    const out = JSON.parse(await getToolHandler('assess_nonclinical_program')!({ ...PROGRAM, present: PRESENT }));
    expect(out.adequate).toBeNull();
    expect(out.basis).toBe('stated');
    expect(out.gaps).toEqual([]);
    expect(out.instruction).toMatch(/studies you listed/i);
  });

  it('classifies stated findings as a worksheet without directing their use in M2.4', async () => {
    const out = JSON.parse(await getToolHandler('classify_tox_findings')!({ findings: [{ organ: 'liver', finding: 'hepatocellular hypertrophy' }] }));
    expect(out.basis).toBe('stated');
    expect(out.instruction).not.toMatch(/Use.*M2.4 target-organ profile/);
  });

  it('labels the carcinogenicity assessment as based on stated inputs', async () => {
    const out = JSON.parse(await getToolHandler('assess_carcinogenicity_need')!({ clinicalDurationMonths: 8, moleculeType: 'small_molecule', genotoxicityResults: [{ assay: 'Ames', result: 'negative' }], hasStructuralAlert: false, hasPreneoplasticLesions: false, hasEndocrineActivity: false, isImmunosuppressive: false, isLifeThreatening: false }));
    expect(out.basis).toBe('stated');
    expect(out.instruction).toMatch(/not.*program/i);
  });

  it('refuses an unknown safety-margin species instead of computing zero doses', async () => {
    const out = JSON.parse(await getToolHandler('calculate_safety_margin')!({ species: 'axolotl', noaelMgKg: 30 }));
    expect(out.status).toBe('needs_parameters');
    expect(out.result).toBeUndefined();
  });

  it.each([COMPUTE_FIH_DOSE, CLASSIFY_TOX_FINDINGS, CALCULATE_SAFETY_MARGIN, ASSESS_CARCINOGENICITY_NEED])('$name describes its worksheet basis within the tool budget', def => {
    expect(def.description).toMatch(/worksheet/i);
    expect(def.description.length).toBeLessThanOrEqual(1024);
  });
});
