/** S5a: dose-optimization worksheets keep unanswered facts not_stated and their conclusions unassessed. */
import { describe, expect, it } from 'vitest';
import {
  selectDoseFindingDesign, assessProjectOptimusAlignment, designRandomizedDoseComparison,
  selectRP2D, designBackfillStrategy, assessDoseExposureResponse,
} from '../../dose-optimization/dose-optimization-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { DOSE_OPTIMIZATION_TOOLS } from '../doseOptimizationTools';

const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const finding = {
  modality: 'small_molecule_targeted', mechanismClass: 'molecularly_targeted', numberOfDoseLevels: 5,
  targetToxicityRate: 0.25, dltWindowDays: 21, lateOnsetToxicityExpected: false,
  realTimeStatisticianAvailable: false, optimalBiologicalDoseSought: true,
} satisfies Parameters<typeof selectDoseFindingDesign>[0];
const optimus = {
  modality: 'small_molecule_targeted', developmentStage: 'phase2', doseSelectedByMtdAlone: false,
  randomizedDoseComparisonConducted: true, dosesInRandomizedComparison: 2,
  exposureResponseEfficacyCharacterized: true, exposureResponseSafetyCharacterized: true, pkCharacterized: true,
  pdOrTargetEngagementCharacterized: true, longitudinalTolerabilityAssessed: true,
  patientReportedOutcomesCollected: true, optimizationBeforeMarketingApplication: true,
  intendedSetting: 'advanced_refractory',
} satisfies Parameters<typeof assessProjectOptimusAlignment>[0];
const comparison = {
  candidateDoses: [80, 160], doseUnit: 'mg', primaryActivityEndpoint: 'ORR',
  goalNonInferiorActivityLowerDose: false, timing: 'pre_registration', tolerabilityCoPrimary: true,
} satisfies Parameters<typeof designRandomizedDoseComparison>[0];
const rp2d = {
  doseUnit: 'mg', mtd: 400, modality: 'small_molecule_targeted', mechanismClass: 'molecularly_targeted',
  activityPlateauObserved: true,
  doseLevels: [
    { dose: 100, toxicityProbability: 0.05, targetExposureAchieved: false, targetEngagementSaturated: false,
      activitySignal: 0, longitudinalTolerabilityAcceptable: true },
    { dose: 200, toxicityProbability: 0.1, targetExposureAchieved: true, targetEngagementSaturated: true,
      activitySignal: 0.3, longitudinalTolerabilityAcceptable: true },
    { dose: 400, toxicityProbability: 0.25, targetExposureAchieved: true, targetEngagementSaturated: true,
      activitySignal: 0.32, longitudinalTolerabilityAcceptable: false },
  ],
} satisfies Parameters<typeof selectRP2D>[0];
const backfill = {
  clearedDoseLevels: [50, 100], doseUnit: 'mg', objectives: ['pk', 'pd', 'preliminary_activity'],
  modality: 'small_molecule_targeted', biopsyFeasible: true, escalationOngoing: true,
} satisfies Parameters<typeof designBackfillStrategy>[0];
const er = {
  exposureMetric: 'AUC',
  efficacyExposureResponse: [{ exposure: 10, response: 0.4 }, { exposure: 20, response: 0.42 }, { exposure: 40, response: 0.44 }],
  safetyExposureResponse: [{ exposure: 10, response: 0.1 }, { exposure: 20, response: 0.2 }, { exposure: 40, response: 0.35 }],
} satisfies Parameters<typeof assessDoseExposureResponse>[0];

const pillars = [
  { field: 'randomizedDoseComparisonConducted', pillar: 'Randomized multi-dose comparison', gap: 'OPT-NO-RANDOMIZED' },
  { field: 'exposureResponseEfficacyCharacterized', pillar: 'Exposure-response (efficacy)', gap: 'OPT-NO-ER-EFF' },
  { field: 'exposureResponseSafetyCharacterized', pillar: 'Exposure-response (safety)', gap: 'OPT-NO-ER-SAFETY' },
  { field: 'pkCharacterized', pillar: 'PK / exposure', gap: 'OPT-NO-PK' },
  { field: 'pdOrTargetEngagementCharacterized', pillar: 'PD / target engagement', gap: 'OPT-NO-PD' },
  { field: 'longitudinalTolerabilityAssessed', pillar: 'Longitudinal tolerability', gap: 'OPT-NO-LONGITUDINAL' },
  { field: 'optimizationBeforeMarketingApplication', pillar: 'Pre-marketing timing', gap: 'OPT-TIMING' },
];

const families = [
  { tool: 'select_dose_finding_design', compute: selectDoseFindingDesign, input: finding,
    flags: ['lateOnsetToxicityExpected', 'realTimeStatisticianAvailable', 'optimalBiologicalDoseSought'] },
  { tool: 'assess_project_optimus_alignment', compute: assessProjectOptimusAlignment, input: optimus,
    flags: ['doseSelectedByMtdAlone', 'patientReportedOutcomesCollected', ...pillars.map(p => p.field)] },
  { tool: 'design_randomized_dose_comparison', compute: designRandomizedDoseComparison, input: comparison,
    flags: ['goalNonInferiorActivityLowerDose', 'tolerabilityCoPrimary'] },
  { tool: 'select_rp2d', compute: selectRP2D, input: rp2d, flags: ['activityPlateauObserved'] },
  { tool: 'design_backfill_strategy', compute: designBackfillStrategy, input: backfill,
    flags: ['biopsyFeasible', 'escalationOngoing'] },
];

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101, userId: 7 } as never));
}

describe('all six existing dose-optimization tools still compute from stated inputs', () => {
  const cases = [
    { tool: 'select_dose_finding_design', input: finding, result: { recommendedDesign: 'BOIN', designFamily: 'model_assisted' } },
    { tool: 'assess_project_optimus_alignment', input: optimus, result: { alignmentScore: 100, alignmentTier: 'strong' } },
    { tool: 'design_randomized_dose_comparison', input: comparison,
      result: { numberOfArms: 2, illustrativePerArmSize: 30, illustrativeTotalSize: 60 } },
    { tool: 'select_rp2d', input: rp2d, result: { recommendedRP2D: 200 } },
    { tool: 'design_backfill_strategy', input: backfill, result: { totalBackfillPatients: 24 } },
    { tool: 'assess_dose_exposure_response', input: er,
      result: { efficacyResponseFlat: true, safetyRisesWithExposure: true, therapeuticWindow: 'narrow' } },
  ];
  it.each(cases)('$tool reaches its canonical engine with a stated basis', async ({ tool, input, result }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', basis: 'stated', appliesTo: 'the inputs stated in this conversation', result,
    });
  });
});

describe('each definition tells the model about not_stated, within the trimmed description length', () => {
  it.each(DOSE_OPTIMIZATION_TOOLS)('$name', tool => {
    expect(tool.description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    expect(tool.description).toMatch(/not_stated/);
  });
});

describe.each(families)('$tool preserves boolean answers', ({ tool, compute, input, flags }) => {
  it.each(flags)('%s distinguishes absence, true, false and malformed input', async field => {
    for (const absent of [undefined, null]) {
      expect(compute(changed(input, { [field]: absent }))).toMatchObject({ inputStates: { [field]: 'not_stated' } });
    }
    for (const answer of [true, false]) {
      expect(compute(changed(input, { [field]: answer }))).toMatchObject({ inputStates: { [field]: answer } });
    }
    for (const malformed of ['false', 0, 1]) {
      const out = await run(tool, changed(input, { [field]: malformed }));
      expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
      expect(out).not.toHaveProperty('basis');
    }
  });
});

describe('a dose-finding design is not chosen from an unanswered deciding fact', () => {
  const unassessed = { recommendedDesign: 'not_assessed', recommendedDesignProfile: null, designFamily: null,
    rankedAlternatives: [], operatingCharacteristicTradeoffs: [] };
  it.each([undefined, null])('recommends no design with realTimeStatisticianAvailable %j', realTimeStatisticianAvailable => {
    expect(selectDoseFindingDesign(changed(finding, { realTimeStatisticianAvailable }))).toMatchObject(unassessed);
  });
  it('recommends no design when nothing states or indicates late-onset toxicity', () => {
    expect(selectDoseFindingDesign(changed(finding, { lateOnsetToxicityExpected: undefined }))).toMatchObject(unassessed);
  });
  it('a late-onset modality decides on a TITE design but not which one', () => {
    const out = selectDoseFindingDesign(changed(finding, { modality: 'antibody_drug_conjugate',
      lateOnsetToxicityExpected: undefined, realTimeStatisticianAvailable: undefined }));
    expect(out).toMatchObject(unassessed);
    expect(out.rationale.join(' ')).toMatch(/late-onset toxicity: true; real-time statistician: not_stated/);
    expect(out.rationale.join(' ')).toMatch(/TITE-CRM.*TITE-BOIN/);
  });
  it.each([
    { late: false, statistician: false, design: 'BOIN' }, { late: false, statistician: true, design: 'CRM' },
    { late: true, statistician: false, design: 'TITE-BOIN' }, { late: true, statistician: true, design: 'TITE-CRM' },
  ])('keeps the stated branch: late onset $late, statistician $statistician', ({ late, statistician, design }) => {
    const out = selectDoseFindingDesign({ ...finding, lateOnsetToxicityExpected: late, realTimeStatisticianAvailable: statistician });
    expect(out.recommendedDesign).toBe(design);
    expect(out.rankedAlternatives.length).toBeGreaterThan(0);
  });
  it('keeps a DLT window that indicates late onset', () => {
    expect(selectDoseFindingDesign(changed(finding, { lateOnsetToxicityExpected: undefined, dltWindowDays: 42,
      realTimeStatisticianAvailable: true })).recommendedDesign).toBe('TITE-CRM');
  });
  it.each([undefined, null])('discloses the 0.25 target toxicity default when the rate is %j', targetToxicityRate => {
    const out = selectDoseFindingDesign(changed(finding, { targetToxicityRate }));
    expect(out.targetToxicityRate).toBe(0.25);
    expect(out.rationale.join(' ')).toMatch(/No target toxicity rate supplied; defaulting to 0\.25/);
    expect(out.warnings.join(' ')).not.toMatch(/Target toxicity rate/);
  });
  it('applies a stated target toxicity rate and warns outside the usual range', () => {
    const out = selectDoseFindingDesign({ ...finding, targetToxicityRate: 0.45 });
    expect(out.targetToxicityRate).toBe(0.45);
    expect(out.warnings.join(' ')).toMatch(/Target toxicity rate 0\.45 is outside the usual/);
  });
  it.each(['0.3', 0, 1, 1.5, NaN])('refuses a malformed target toxicity rate %j instead of replacing it with 0.25', async targetToxicityRate => {
    expect(await run('select_dose_finding_design', changed(finding, { targetToxicityRate })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'targetToxicityRate' });
  });
  it('lists no 3+3 fallback and names no chosen design when none is recommended', () => {
    const out = selectDoseFindingDesign(changed(finding, { realTimeStatisticianAvailable: undefined }));
    expect(out.warnings.join(' ')).toMatch(/3\+3 design is discouraged/);
    expect(out.warnings.join(' ')).not.toMatch(/listed only as a fallback/);
    expect(out.rationale.join(' ')).toMatch(/seeks an optimal biological dose/);
    expect(out.rationale.join(' ')).not.toMatch(/chosen toxicity-finding design/);
  });
  it('keeps the fallback and chosen-design sentences when a design is recommended', () => {
    const out = selectDoseFindingDesign(finding);
    expect(out.warnings.join(' ')).toMatch(/It is listed only as a fallback for resource-constrained contexts\./);
    expect(out.rationale.join(' ')).toMatch(/The chosen toxicity-finding design should be paired with backfill cohorts/);
  });
});

describe('Project Optimus alignment does not score or gap an unanswered pillar', () => {
  const status = (out: ReturnType<typeof assessProjectOptimusAlignment>, pillar: string) =>
    out.pillarStatus.find(p => p.pillar === pillar)?.status;
  it.each([undefined, null])('an unanswered doseSelectedByMtdAlone (%j) is not met and earns no 20 points', doseSelectedByMtdAlone => {
    const out = assessProjectOptimusAlignment(changed(optimus, { doseSelectedByMtdAlone }));
    expect(out).toMatchObject({ alignmentScore: null, alignmentTier: 'not_assessed',
      inputStates: { doseSelectedByMtdAlone: 'not_stated' } });
    expect(status(out, 'Selection beyond MTD')).toBe('not_stated');
    expect(out.strengths.join(' ')).not.toMatch(/not selected by MTD alone/);
    expect(out.gaps.map(g => g.id)).not.toContain('OPT-MTD-ALONE');
  });
  it.each(pillars)('an unanswered $field is not a $gap gap', ({ field, pillar, gap }) => {
    const out = assessProjectOptimusAlignment(changed(optimus, { [field]: undefined }));
    expect(status(out, pillar)).toBe('not_stated');
    expect(out.gaps.map(g => g.id)).not.toContain(gap);
    expect(out).toMatchObject({ alignmentScore: null, alignmentTier: 'not_assessed' });
  });
  it('names the unanswered pillars and asks for them', () => {
    const out = assessProjectOptimusAlignment(changed(optimus, { doseSelectedByMtdAlone: undefined, pkCharacterized: undefined }));
    expect(out.recommendations.join(' ')).toMatch(/State doseSelectedByMtdAlone, pkCharacterized:/);
  });
  it('does not tell a phase 3 program it lacks a randomized comparison it never described', () => {
    const out = assessProjectOptimusAlignment(changed(optimus, { developmentStage: 'phase3',
      randomizedDoseComparisonConducted: undefined }));
    expect(out.recommendations.join(' ')).not.toMatch(/without a randomized dose comparison/);
    expect(assessProjectOptimusAlignment({ ...optimus, developmentStage: 'phase3', randomizedDoseComparisonConducted: false })
      .recommendations.join(' ')).toMatch(/without a randomized dose comparison/);
  });
  it('keeps the score and every gap for stated negative answers', () => {
    const out = assessProjectOptimusAlignment(changed(optimus, { doseSelectedByMtdAlone: true,
      ...Object.fromEntries(pillars.map(p => [p.field, false])) }));
    expect(out).toMatchObject({ alignmentScore: 0, alignmentTier: 'non_aligned' });
    expect(out.gaps.map(g => g.id)).toEqual(expect.arrayContaining(['OPT-MTD-ALONE', ...pillars.map(p => p.gap)]));
  });
  it('reads a stated true randomized comparison as >= 2 doses, and a stated count of 1 as partial', () => {
    expect(assessProjectOptimusAlignment(changed(optimus, { dosesInRandomizedComparison: undefined })).alignmentScore).toBe(100);
    const partial = assessProjectOptimusAlignment({ ...optimus, dosesInRandomizedComparison: 1 });
    expect(status(partial, 'Randomized multi-dose comparison')).toBe('partial');
    expect(partial).toMatchObject({ alignmentScore: 80, alignmentTier: 'strong' });
  });
  it.each(['3', 2.5, -1])('refuses a malformed dose count %j', async dosesInRandomizedComparison => {
    expect(await run('assess_project_optimus_alignment', changed(optimus, { dosesInRandomizedComparison })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'dosesInRandomizedComparison' });
  });
});

describe('a randomized dose comparison is not sized or framed from an unanswered goal', () => {
  it.each([undefined, null])('gives no illustrative size with goalNonInferiorActivityLowerDose %j', goal => {
    const out = designRandomizedDoseComparison(changed(comparison, { goalNonInferiorActivityLowerDose: goal }));
    expect(out).toMatchObject({ illustrativePerArmSize: null, illustrativeTotalSize: null });
    expect(out.sampleSizeConsiderations.join(' ')).toMatch(/goalNonInferiorActivityLowerDose was not stated/);
  });
  it('does not cap a size it never computed', () => {
    const out = designRandomizedDoseComparison(changed(comparison, { goalNonInferiorActivityLowerDose: undefined,
      feasibleSampleSize: 20 }));
    expect(out).toMatchObject({ illustrativePerArmSize: null, illustrativeTotalSize: null });
    expect(out.warnings.join(' ')).not.toMatch(/constrains the design/);
  });
  it.each([undefined, null])('leaves the tolerability endpoint role not assessed with tolerabilityCoPrimary %j', role => {
    const [first] = designRandomizedDoseComparison(changed(comparison, { tolerabilityCoPrimary: role }))
      .endpointStrategy.coPrimaryOrKey;
    expect(first).toMatch(/not assessed/);
    expect(first).not.toMatch(/^(Key secondary|Tolerability co-primary):/);
  });
  it('keeps the stated branches', () => {
    expect(designRandomizedDoseComparison({ ...comparison, goalNonInferiorActivityLowerDose: true }))
      .toMatchObject({ illustrativePerArmSize: 60, illustrativeTotalSize: 120 });
    expect(designRandomizedDoseComparison({ ...comparison, tolerabilityCoPrimary: false })
      .endpointStrategy.coPrimaryOrKey[0]).toMatch(/^Key secondary:/);
    expect(designRandomizedDoseComparison({ ...comparison, anticipatedResponseRateHighDose: 0.35 }))
      .toMatchObject({ illustrativePerArmSize: 52, illustrativeTotalSize: 104 });
    expect(designRandomizedDoseComparison({ ...comparison, candidateDoses: [200, 50, 100, 100] }))
      .toMatchObject({ numberOfArms: 3, recommendedDoses: [50, 100, 200], allocationRatio: '1:1:1' });
  });
  it.each(['0.35', 35, 1.5, 0, NaN])('refuses a malformed anticipated response rate %j instead of sizing 30 per arm', async anticipatedResponseRateHighDose => {
    expect(await run('design_randomized_dose_comparison', changed(comparison, { anticipatedResponseRateHighDose })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'anticipatedResponseRateHighDose' });
  });
  it.each([{ candidateDoses: undefined }, { candidateDoses: null }, { candidateDoses: [] }, { candidateDoses: [100] },
    { candidateDoses: [100, 100] }])('refuses candidateDoses $candidateDoses: fewer than 2 distinct doses compare nothing', async ({ candidateDoses }) => {
    expect(await run('design_randomized_dose_comparison', changed(comparison, { candidateDoses })))
      .toMatchObject({ status: 'needs_parameters', code: 'missing_input', field: 'candidateDoses' });
  });
  it.each([
    { candidateDoses: ['100', 200], field: 'candidateDoses[0]' },
    { candidateDoses: [100, -5], field: 'candidateDoses[1]' },
    { candidateDoses: [100, NaN, 200], field: 'candidateDoses[1]' },
    { candidateDoses: [100, null, 200], field: 'candidateDoses[1]' },
    { candidateDoses: '100,200', field: 'candidateDoses' },
  ])('refuses a malformed dose list at $field instead of dropping the entry', async ({ candidateDoses, field }) => {
    expect(await run('design_randomized_dose_comparison', changed(comparison, { candidateDoses })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
  });
});

describe('RP2D selection needs stated tolerability and effect evidence', () => {
  const tolerable = (dose: number, extra: Record<string, unknown> = {}) =>
    ({ dose, toxicityProbability: 0.1, longitudinalTolerabilityAcceptable: true, ...extra });
  it('a dose-only row is insufficient_data, never viable or selected', () => {
    const out = selectRP2D(changed(rp2d, { doseLevels: [{ dose: 100 }, { dose: 200 }, { dose: 300 }] }));
    expect(out.recommendedRP2D).toBeUndefined();
    expect(out.doseEvaluations.map(e => e.verdict)).toEqual(['insufficient_data', 'insufficient_data', 'insufficient_data']);
    expect(out.doseEvaluations[0].note).toMatch(/longitudinalTolerabilityAcceptable not stated/);
  });
  it('without an MTD an unanswered toxicity probability is insufficient_data', () => {
    const out = selectRP2D(changed(rp2d, { mtd: undefined, doseLevels: [{ dose: 100, longitudinalTolerabilityAcceptable: true }] }));
    expect(out.recommendedRP2D).toBeUndefined();
    expect(out.doseEvaluations[0]).toMatchObject({ verdict: 'insufficient_data', note: expect.stringMatching(/toxicityProbability/) });
  });
  it('selects no RP2D from tolerable doses with no stated effect evidence', () => {
    const out = selectRP2D(changed(rp2d, { doseLevels: [tolerable(100), tolerable(200)] }));
    expect(out.recommendedRP2D).toBeUndefined();
    expect(out.doseEvaluations.map(e => e.verdict)).toEqual(['viable', 'viable']);
    expect(out.selectionRationale.join(' ')).toMatch(/active range is not established/);
  });
  const effective = [tolerable(100, { targetExposureAchieved: true }), tolerable(200, { targetExposureAchieved: true })];
  const cytotoxic = { modality: 'cytotoxic', mechanismClass: 'classical_cytotoxic', doseLevels: effective };
  it('does not take the highest effective dose from an unanswered plateau', () => {
    const out = selectRP2D(changed(rp2d, { ...cytotoxic, activityPlateauObserved: undefined }));
    expect(out.recommendedRP2D).toBeUndefined();
    expect(out.selectionRationale.join(' ')).toMatch(/activityPlateauObserved was not stated/);
  });
  it('keeps a stated or class-indicated plateau, a stated absence, and a single effective dose', () => {
    expect(selectRP2D(changed(rp2d, { ...cytotoxic, activityPlateauObserved: false })).recommendedRP2D).toBe(200);
    expect(selectRP2D(changed(rp2d, { ...cytotoxic, modality: 'monoclonal_antibody', activityPlateauObserved: undefined }))
      .recommendedRP2D).toBe(100);
    expect(selectRP2D(changed(rp2d, { ...cytotoxic, activityPlateauObserved: undefined,
      doseLevels: [tolerable(100), tolerable(200, { targetExposureAchieved: true })] })).recommendedRP2D).toBe(200);
  });
  it('reports each row\'s stated answers', () => {
    const out = selectRP2D(changed(rp2d, { doseLevels: [tolerable(100, { targetExposureAchieved: true })] }));
    expect(out.doseEvaluations[0]).toMatchObject({ verdict: 'selected', inputStates: {
      targetExposureAchieved: true, targetEngagementSaturated: 'not_stated', longitudinalTolerabilityAcceptable: true } });
  });
  it('does not say a stated-tolerable sub-therapeutic dose lacks tolerability evidence', () => {
    const out = selectRP2D(changed(rp2d, { doseLevels: [
      tolerable(100, { targetExposureAchieved: false, activitySignal: 0 }), { dose: 200 }] }));
    expect(out.recommendedRP2D).toBeUndefined();
    expect(out.doseEvaluations.map(e => e.verdict)).toEqual(['sub_therapeutic', 'insufficient_data']);
    expect(out.warnings.join(' ')).toMatch(/each insufficient_data row names what was not stated/);
  });
  it.each([0, -10])('refuses a dose of %j by its row', async dose => {
    expect(await run('select_rp2d', changed(rp2d, { doseLevels: [tolerable(100), tolerable(dose, { targetExposureAchieved: true })] })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'doseLevels[1].dose' });
  });
  it('a dose bounded by a stated MTD is tolerable on the MTD, not on a stated toxicity', () => {
    const out = selectRP2D(changed(rp2d, { doseLevels: [{ dose: 200, longitudinalTolerabilityAcceptable: true }, tolerable(300)] }));
    expect(out.doseEvaluations.map(e => e.note)).toEqual([
      'Tolerable on the stated MTD and longitudinal-tolerability evidence; candidate RP2D.',
      'Tolerable on the stated toxicity and longitudinal-tolerability evidence; candidate RP2D.',
    ]);
  });
  it('recommends confirming an RP2D only when one is selected', () => {
    expect(selectRP2D(changed(rp2d, { doseLevels: [{ dose: 100 }, { dose: 200 }] })).recommendations).toEqual([]);
    expect(selectRP2D(rp2d).recommendations.join(' ')).toMatch(/^Confirm the selected RP2D/);
  });
  it('a dose sub-therapeutic on its stated evidence is not insufficient_data, whatever else is unstated', () => {
    expect(selectRP2D(changed(rp2d, { mtd: undefined, doseLevels: [{ dose: 10, targetExposureAchieved: false,
      targetEngagementSaturated: false }] })).doseEvaluations.map(e => e.verdict)).toEqual(['sub_therapeutic']);
  });
  it('names a malformed row by its index as sent, before sorting', async () => {
    expect(await run('select_rp2d', changed(rp2d, { doseLevels: [tolerable(300), { dose: 100, targetExposureAchieved: 'yes' }] })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'doseLevels[1].targetExposureAchieved' });
  });
  it.each([
    ...['toxicityProbability', 'activitySignal'].flatMap(field => ['0.2', 1.5, -0.1, NaN].map(value => ({ field, value }))),
    ...['targetExposureAchieved', 'targetEngagementSaturated', 'longitudinalTolerabilityAcceptable']
      .flatMap(field => ['true', 0].map(value => ({ field, value }))),
  ])('refuses doseLevels[0].$field = $value', async ({ field, value }) => {
    expect(await run('select_rp2d', changed(rp2d, { doseLevels: [tolerable(100, { [field]: value })] })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: `doseLevels[0].${field}` });
  });
});

describe('backfill does not read an unanswered biopsy fact as "biopsy not feasible"', () => {
  const sizes = (out: ReturnType<typeof designBackfillStrategy>) => out.cohortPlans.map(p => p.recommendedPatients);
  it.each([undefined, null])('leaves cohort sizes and the biopsy plan unassessed with biopsyFeasible %j', biopsyFeasible => {
    const out = designBackfillStrategy(changed(backfill, { biopsyFeasible }));
    expect(sizes(out)).toEqual([null, null]);
    expect(out.totalBackfillPatients).toBeNull();
    const collected = out.cohortPlans.flatMap(p => p.dataToCollect).join(' ');
    expect(collected).not.toMatch(/biopsy not feasible/);
    expect(collected).toMatch(/biopsyFeasible was not stated/);
    expect(out.warnings.join(' ')).toMatch(/state biopsyFeasible/);
  });
  it('a biomarker objective alone also waits for the biopsy fact', () => {
    expect(designBackfillStrategy(changed(backfill, { objectives: ['biomarker'], biopsyFeasible: undefined }))
      .totalBackfillPatients).toBeNull();
  });
  it('does not cap a size it never computed', () => {
    const out = designBackfillStrategy(changed(backfill, { biopsyFeasible: undefined, maxBackfillPatients: 4 }));
    expect(out.totalBackfillPatients).toBeNull();
    expect(out.warnings.join(' ')).not.toMatch(/constrains cohorts/);
  });
  it.each([
    { field: 'clearedDoseLevels[0]', clearedDoseLevels: ['10', 20] },
    { field: 'clearedDoseLevels[1]', clearedDoseLevels: [10, 0] },
    { field: 'objectives[0]', objectives: ['PD', 'pk'], biopsyFeasible: undefined },
    { field: 'objectives[1]', objectives: ['pk', null] },
  ])('refuses $field instead of dropping it or sizing around it', async ({ field, ...overrides }) => {
    expect(await run('design_backfill_strategy', changed(backfill, overrides)))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
  });
  it('keeps the stated branches and objectives that do not need a biopsy', () => {
    const infeasible = designBackfillStrategy({ ...backfill, biopsyFeasible: false });
    expect(sizes(infeasible)).toEqual([8, 8]);
    expect(infeasible.cohortPlans[0].dataToCollect).toContain('Peripheral PD / target-engagement markers (biopsy not feasible).');
    expect(sizes(designBackfillStrategy(backfill))).toEqual([12, 12]);
    expect(designBackfillStrategy(changed(backfill, { objectives: ['pk', 'tolerability'], biopsyFeasible: undefined })))
      .toMatchObject({ totalBackfillPatients: 12 });
  });
});

describe('exposure-response reports an unmeasured curve as not_assessed, never flat or 0', () => {
  it('one efficacy point measures no efficacy trend', () => {
    expect(assessDoseExposureResponse(changed(er, { efficacyExposureResponse: [{ exposure: 10, response: 0.4 }] })))
      .toMatchObject({ efficacyResponseFlat: 'not_assessed', safetyRisesWithExposure: true, therapeuticWindow: 'indeterminate',
        metrics: { efficacyResponseRangeAbsolute: null, efficacyRelativeGainAcrossRange: null,
          efficacySlopeSign: 'not_assessed', safetySlopeSign: 'positive' } });
  });
  it('no safety points measure no safety trend', () => {
    expect(assessDoseExposureResponse(changed(er, { safetyExposureResponse: [] })))
      .toMatchObject({ safetyRisesWithExposure: 'not_assessed', efficacyResponseFlat: true, therapeuticWindow: 'indeterminate',
        metrics: { safetyResponseRangeAbsolute: null, safetySlopeSign: 'not_assessed', efficacySlopeSign: 'flat' } });
  });
  it('two points at one exposure measure no trend', () => {
    expect(assessDoseExposureResponse(changed(er, { efficacyExposureResponse: [{ exposure: 20, response: 0.4 },
      { exposure: 20, response: 0.41 }] }))).toMatchObject({ efficacyResponseFlat: 'not_assessed',
      therapeuticWindow: 'indeterminate', metrics: { efficacyResponseRangeAbsolute: null, efficacySlopeSign: 'not_assessed' } });
  });
  it('reads tied exposures at their mean response, whatever the order of the input', () => {
    const tied = [{ exposure: 10, response: 0.1 }, { exposure: 10, response: 0.3 }, { exposure: 40, response: 0.1 },
      { exposure: 40, response: 0.3 }];
    for (const safetyExposureResponse of [tied, [...tied].reverse(), [tied[3], tied[0], tied[2], tied[1]]]) {
      expect(assessDoseExposureResponse(changed(er, { safetyExposureResponse }))).toMatchObject({
        safetyRisesWithExposure: false, metrics: { safetySlopeSign: 'flat', safetyResponseRangeAbsolute: 0 } });
    }
  });
  it.each([
    { curve: 'efficacyExposureResponse', at: 0, response: 30 },
    { curve: 'efficacyExposureResponse', at: 1, response: -0.5 },
    { curve: 'safetyExposureResponse', at: 2, response: 1.2 },
  ] as const)('refuses $curve[$at].response = $response, a probability outside 0-1', async ({ curve, at, response }) => {
    const points = er[curve].map((p, i) => (i === at ? { ...p, response } : p));
    expect(await run('assess_dose_exposure_response', changed(er, { [curve]: points })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: `${curve}[${at}].response` });
  });
});
