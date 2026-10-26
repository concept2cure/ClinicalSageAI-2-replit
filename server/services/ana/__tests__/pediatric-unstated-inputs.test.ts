/** S5a: pediatric worksheets preserve unanswered facts and validate their context. */
import { describe, expect, it } from 'vitest';
import {
  classifyPediatricAge, designPIP, assessExtrapolation, selectFormulation,
  selectPediatricDose, assessPediatricRequirements,
} from '../../pediatric/pediatric-knowledge';
import { getToolHandler } from '../AnaToolExecutor';

const age = { ageValue: 5, ageUnit: 'years' } satisfies Parameters<typeof classifyPediatricAge>[0];
const plan = {
  drugName: 'Synthetic Drug', therapeuticArea: 'respiratory', indication: 'asthma',
  targetAgeBands: ['child'], isOrphan: false, adultApprovalStatus: 'approved', routeOfAdministration: 'oral',
} satisfies Parameters<typeof designPIP>[0];
const extrapolation = {
  indication: 'asthma', therapeuticArea: 'respiratory', targetAgeBands: ['child'],
  diseaseProgressionSimilar: true, drugResponseSimilar: true, adultEfficacyEstablished: true, biomarkerAvailable: true,
} satisfies Parameters<typeof assessExtrapolation>[0];
const formulation = {
  targetAgeBands: ['child'], routeOfAdministration: 'oral',
  drugProperties: { tasteProfile: 'bitter' }, proposedExcipients: ['ethanol'],
} satisfies Parameters<typeof selectFormulation>[0];
const dose = {
  targetAgeBand: 'adolescent', adultDose: 100, adultDoseUnit: 'mg', adultWeight: 70,
  childWeight: 50, primaryEliminationRoute: 'renal', narrowTherapeuticIndex: false, pbpkAvailable: false,
} satisfies Parameters<typeof selectPediatricDose>[0];
const requirements = {
  drugName: 'Synthetic Drug', therapeuticArea: 'respiratory', indication: 'asthma',
  targetAgeBands: ['child'], isOrphan: false, isNewMolecularEntity: true, hasAdultApproval: false,
  targetJurisdictions: ['FDA', 'EMA'],
} satisfies Parameters<typeof assessPediatricRequirements>[0];

const families = [
  { tool: 'design_pediatric_investigation', compute: designPIP, input: plan, flags: ['isOrphan'] },
  { tool: 'assess_pediatric_extrapolation', compute: assessExtrapolation, input: extrapolation,
    flags: ['diseaseProgressionSimilar', 'drugResponseSimilar', 'adultEfficacyEstablished', 'biomarkerAvailable'] },
  { tool: 'select_pediatric_dose', compute: selectPediatricDose, input: dose,
    flags: ['narrowTherapeuticIndex', 'pbpkAvailable'] },
  { tool: 'assess_pediatric_requirements', compute: assessPediatricRequirements, input: requirements,
    flags: ['isOrphan', 'isNewMolecularEntity', 'hasAdultApproval'] },
];

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101, userId: 7 } as never));
}

describe('all six existing pediatric tools retain useful explicit results', () => {
  const cases = [
    { tool: 'classify_pediatric_age', input: age, result: { ageBand: 'child' } },
    { tool: 'design_pediatric_investigation', input: plan, result: { deferralWaiverAssessment: { type: 'none' } } },
    { tool: 'assess_pediatric_extrapolation', input: extrapolation,
      result: { feasibility: 'full_extrapolation', studyRequirements: { efficacyStudy: false }, bayesianBorrowing: { applicable: true } } },
    { tool: 'select_pediatric_formulation', input: formulation,
      result: { recommendedFormulations: expect.arrayContaining([expect.objectContaining({ formulation: 'mini_tablet', suitability: 'preferred' })]),
        excipientSafety: expect.arrayContaining([expect.objectContaining({ excipient: 'Ethanol', status: 'restricted' })]) } },
    { tool: 'select_pediatric_dose', input: dose,
      result: { recommendedMethod: 'linear_weight', tdmRecommendation: { recommended: false } } },
    { tool: 'assess_pediatric_requirements', input: requirements,
      result: { regulatoryObligations: { fdaPrea: { required: true } }, orphanConsiderations: { applicable: false } } },
  ];
  it.each(cases)('$tool reaches its canonical engine with a stated basis', async ({ tool, input, result }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', basis: 'stated', appliesTo: 'the inputs stated in this conversation', result,
    });
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

describe('pediatric investigation deferral uses stated deciding facts', () => {
  it.each([undefined, null])('does not rule out orphan-related deferral from %j', isOrphan => {
    const out = designPIP(changed(plan, { isOrphan }));
    expect(out.deferralWaiverAssessment.type).toBe('not_assessed');
    expect(out.deferralWaiverAssessment.justification).not.toMatch(/No waiver or deferral applicable/);
  });
  it('can defer for ongoing adult development without deciding orphan status', () => {
    expect(designPIP(changed(plan, { isOrphan: undefined, adultApprovalStatus: 'pre_approval' })))
      .toMatchObject({ deferralWaiverAssessment: { type: 'deferral' }, inputStates: { isOrphan: 'not_stated' } });
  });
  it('keeps the explicit orphan branch', () => {
    expect(designPIP({ ...plan, isOrphan: true }).deferralWaiverAssessment.type).toBe('deferral');
  });
  it.each(['chronic asthma', 'renal insufficiency'])('does not infer a class waiver from a shared first word: %s', indication => {
    const out = designPIP({ ...plan, indication });
    expect(out.deferralWaiverAssessment.type).not.toBe('class_waiver');
    expect(out).toMatchObject({ classWaiverReference: null });
  });
  it('reports an exact class-list match as reference information rather than a granted waiver', () => {
    expect(designPIP({ ...plan, indication: 'Prostate cancer', condition: 'Prostate cancer' }))
      .toMatchObject({ deferralWaiverAssessment: { type: 'not_assessed' },
        classWaiverReference: { condition: 'Prostate cancer', basis: 'reference_only' } });
  });
});

describe('pediatric extrapolation requires actual adult and pediatric evidence', () => {
  const unassessedStudies = { pkStudy: null, pdStudy: null, efficacyStudy: null, safetyStudy: null };
  it.each(['diseaseProgressionSimilar', 'drugResponseSimilar', 'adultEfficacyEstablished'])(
    'withholds extrapolation with %s unstated even for a known condition', field => {
      for (const absent of [undefined, null]) {
        const out = assessExtrapolation(changed(extrapolation, { [field]: absent }));
        expect(out).toMatchObject({ feasibility: 'not_assessed', studyRequirements: unassessedStudies,
          bayesianBorrowing: { applicable: null } });
        if (field === 'diseaseProgressionSimilar') expect(out.diseaseProgressionSimilarity).toBe('not_stated');
        if (field === 'drugResponseSimilar') expect(out.drugResponseSimilarity).toBe('not_stated');
      }
    },
  );
  it('keeps reference similarity separate from both unstated product facts', () => {
    const out = assessExtrapolation(changed(extrapolation, { diseaseProgressionSimilar: undefined, drugResponseSimilar: undefined }));
    expect(out).toMatchObject({ feasibility: 'not_assessed', diseaseProgressionSimilarity: 'not_stated',
      drugResponseSimilarity: 'not_stated', studyRequirements: unassessedStudies,
      conditionReference: { condition: 'asthma', basis: 'reference_only' } });
  });
  it.each(['adultEfficacyEstablished', 'diseaseProgressionSimilar', 'drugResponseSimilar'])(
    'retains known non-extrapolation when %s is false and other answers are absent', field => {
      const out = assessExtrapolation(changed(extrapolation, { adultEfficacyEstablished: undefined,
        diseaseProgressionSimilar: undefined, drugResponseSimilar: undefined, biomarkerAvailable: undefined, [field]: false }));
      expect(out).toMatchObject({ feasibility: 'no_extrapolation_full_program',
        studyRequirements: { efficacyStudy: true }, bayesianBorrowing: { applicable: false } });
    },
  );
  it.each([undefined, null, false])('does not invent a PK/PD bridge from biomarker availability %j', biomarkerAvailable => {
    expect(assessExtrapolation(changed(extrapolation, { drugResponseSimilar: undefined, biomarkerAvailable })))
      .toMatchObject({ feasibility: 'not_assessed', studyRequirements: unassessedStudies, bayesianBorrowing: { applicable: null } });
  });
  it('can fully extrapolate without inventing an irrelevant biomarker answer', () => {
    const out = assessExtrapolation(changed(extrapolation, { biomarkerAvailable: undefined }));
    expect(out).toMatchObject({ feasibility: 'full_extrapolation', inputStates: { biomarkerAvailable: 'not_stated' } });
    expect(out.evidenceNeeded.join(' ')).toMatch(/biomarker/i);
    expect(out.evidenceNeeded.join(' ')).toMatch(/not stated|unknown|not assessed/i);
  });
});

describe('pediatric dose methods and monitoring preserve uncertainty independently', () => {
  it.each(['pbpkAvailable', 'narrowTherapeuticIndex'])('does not choose a fallback with %s unstated', field => {
    for (const absent of [undefined, null]) {
      expect(selectPediatricDose(changed(dose, { [field]: absent }))).toMatchObject({
        recommendedMethod: 'not_assessed', doseRecommendation: null, doseBanding: { recommended: false },
      });
    }
  });
  it('does not call monitoring unnecessary from unstated narrow therapeutic index', () => {
    expect(selectPediatricDose(changed(dose, { narrowTherapeuticIndex: undefined })).tdmRecommendation.recommended).toBeNull();
  });
  it('can choose stated PBPK while leaving monitoring unknown', () => {
    expect(selectPediatricDose(changed(dose, { pbpkAvailable: true, narrowTherapeuticIndex: undefined })))
      .toMatchObject({ recommendedMethod: 'pbpk_predicted', tdmRecommendation: { recommended: null } });
  });
  it('can require monitoring from stated narrow therapeutic index despite unknown PBPK', () => {
    expect(selectPediatricDose(changed(dose, { pbpkAvailable: undefined, narrowTherapeuticIndex: true }))
      .tdmRecommendation.recommended).toBe(true);
  });
  it('can honor a stated non-PBPK method without inventing narrow therapeutic index', () => {
    expect(selectPediatricDose(changed(dose, { scalingMethodPreference: 'allometric_0.75',
      pbpkAvailable: undefined, narrowTherapeuticIndex: undefined })))
      .toMatchObject({ recommendedMethod: 'allometric_0.75', tdmRecommendation: { recommended: null } });
  });
  it('a stated TDM method determines monitoring even with both boolean facts missing', () => {
    expect(selectPediatricDose(changed(dose, { scalingMethodPreference: 'therapeutic_drug_monitoring',
      pbpkAvailable: undefined, narrowTherapeuticIndex: undefined })))
      .toMatchObject({ recommendedMethod: 'therapeutic_drug_monitoring', tdmRecommendation: { recommended: true } });
  });
  it.each([undefined, null, false])('does not honor a PBPK preference without a qualified model: %j', pbpkAvailable => {
    expect(selectPediatricDose(changed(dose, { scalingMethodPreference: 'pbpk_predicted', pbpkAvailable })))
      .toMatchObject({ recommendedMethod: 'not_assessed', doseRecommendation: null });
  });
  it('keeps explicit PBPK and narrow-index choices', () => {
    expect(selectPediatricDose({ ...dose, pbpkAvailable: true }).recommendedMethod).toBe('pbpk_predicted');
    expect(selectPediatricDose({ ...dose, narrowTherapeuticIndex: true }))
      .toMatchObject({ recommendedMethod: 'therapeutic_drug_monitoring', tdmRecommendation: { recommended: true } });
  });
  it('leaves child dose banding unknown when its method is unknown', () => {
    expect(selectPediatricDose(changed(dose, { targetAgeBand: 'child', pbpkAvailable: undefined })))
      .toMatchObject({ recommendedMethod: 'not_assessed', doseRecommendation: null, doseBanding: { recommended: null } });
  });
  it('can choose neonatal maturation with PBPK ruled out while leaving monitoring unknown', () => {
    expect(selectPediatricDose(changed(dose, { targetAgeBand: 'term_neonate', narrowTherapeuticIndex: undefined })))
      .toMatchObject({ recommendedMethod: 'allometric_maturation', doseBanding: { recommended: false },
        tdmRecommendation: { recommended: null } });
  });
});

describe('pediatric obligations do not infer unrepresented PREA triggers or orphan exceptions', () => {
  it.each([undefined, null])('leaves unstated orphan obligations and rewards unknown: %j', isOrphan => {
    const out = assessPediatricRequirements(changed(requirements, { isOrphan }));
    expect(out).toMatchObject({ orphanConsiderations: { applicable: null },
      regulatoryObligations: { fdaPrea: { required: null }, emaPdco: { rewards: null } } });
    expect(out.orphanConsiderations.incentives.join(' ')).not.toMatch(/product does not have orphan designation/);
  });
  it('does not conclude PREA is inapplicable from an existing adult non-NME alone', () => {
    expect(assessPediatricRequirements({ ...requirements, isNewMolecularEntity: false, hasAdultApproval: true })
      .regulatoryObligations.fdaPrea.required).toBeNull();
  });
  it('does not assume a PREA trigger from missing NME status and lack of adult approval', () => {
    expect(assessPediatricRequirements(changed(requirements, { isNewMolecularEntity: undefined }))
      .regulatoryObligations.fdaPrea.required).toBeNull();
  });
  it('can determine selected-FDA NME obligations while withholding unknown adult-stage timelines', () => {
    expect(assessPediatricRequirements(changed(requirements, { hasAdultApproval: undefined })))
      .toMatchObject({ regulatoryObligations: { fdaPrea: { required: true, timeline: null } },
        timeline: { pipPspSubmission: null, studyCompletion: null } });
  });
  it('does not apply FDA obligations to a solely EMA request', () => {
    expect(assessPediatricRequirements(changed(requirements, { targetJurisdictions: ['EMA'],
      isNewMolecularEntity: undefined, isOrphan: undefined, hasAdultApproval: undefined }))
      .regulatoryObligations.fdaPrea.required).toBe(false);
  });
  it('keeps a stated orphan answer and its EMA reward branch', () => {
    const out = assessPediatricRequirements({ ...requirements, isOrphan: true });
    expect(out.orphanConsiderations.applicable).toBe(true);
    expect(out.regulatoryObligations.emaPdco.rewards).toMatch(/Orphan pediatric/);
  });
});

describe('all pediatric tools validate required context at runtime', () => {
  const cases = [
    { tool: 'classify_pediatric_age', input: age, fields: ['ageValue', 'ageUnit'] },
    { tool: 'design_pediatric_investigation', input: plan,
      fields: ['drugName', 'therapeuticArea', 'indication', 'targetAgeBands', 'adultApprovalStatus', 'routeOfAdministration'] },
    { tool: 'assess_pediatric_extrapolation', input: extrapolation, fields: ['indication', 'therapeuticArea', 'targetAgeBands'] },
    { tool: 'select_pediatric_formulation', input: formulation, fields: ['targetAgeBands', 'routeOfAdministration'] },
    { tool: 'select_pediatric_dose', input: dose,
      fields: ['targetAgeBand', 'adultDose', 'adultDoseUnit', 'adultWeight', 'primaryEliminationRoute'] },
    { tool: 'assess_pediatric_requirements', input: requirements,
      fields: ['drugName', 'therapeuticArea', 'indication', 'targetAgeBands', 'targetJurisdictions'] },
  ];
  for (const { tool, input, fields } of cases) {
    it.each(fields)(`${tool} requires %s without taking a default branch`, async field => {
      for (const absent of [undefined, null]) {
        expect(await run(tool, changed(input, { [field]: absent })))
          .toMatchObject({ status: 'needs_parameters', code: 'missing_input', field });
      }
      expect(await run(tool, changed(input, { [field]: field === 'ageValue' || field === 'adultDose' || field === 'adultWeight' ? '100' : 42 })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
    });
  }
});

describe('pediatric enums, population arrays and preferences reject malformed values', () => {
  const cases = [
    { tool: 'classify_pediatric_age', input: age, field: 'ageUnit', invalid: ['decades', ['years']] },
    { tool: 'design_pediatric_investigation', input: plan, field: 'therapeuticArea', invalid: ['unrecognized', ['respiratory']] },
    { tool: 'design_pediatric_investigation', input: plan, field: 'adultApprovalStatus', invalid: ['unrecognized'] },
    { tool: 'assess_pediatric_extrapolation', input: extrapolation, field: 'therapeuticArea', invalid: ['unrecognized'] },
    { tool: 'select_pediatric_formulation', input: formulation, field: 'routeOfAdministration', invalid: ['unrecognized', ['oral']] },
    { tool: 'select_pediatric_dose', input: dose, field: 'targetAgeBand', invalid: ['adult', ['adolescent']] },
    { tool: 'select_pediatric_dose', input: dose, field: 'primaryEliminationRoute', invalid: ['unrecognized'] },
    { tool: 'select_pediatric_dose', input: dose, field: 'scalingMethodPreference', invalid: ['unrecognized', ['linear_weight']] },
    { tool: 'assess_pediatric_requirements', input: requirements, field: 'therapeuticArea', invalid: ['unrecognized'] },
    { tool: 'assess_pediatric_requirements', input: requirements, field: 'targetJurisdictions', invalid: [[], ['unrecognized'], 'FDA'] },
    ...[families[0], families[1], { tool: 'select_pediatric_formulation', input: formulation }, families[3]]
      .map(({ tool, input }) => ({ tool, input, field: 'targetAgeBands', invalid: [[], ['adult'], 'child'] })),
  ];
  it.each(cases)('$tool validates $field', async ({ tool, input, field, invalid }) => {
    for (const value of invalid) {
      expect(await run(tool, changed(input, { [field]: value })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
    }
  });
});

describe('pediatric age classification needs a pediatric age and neonatal gestation', () => {
  it.each([undefined, null])('does not assume a term neonate without gestationalAge: %j', gestationalAge => {
    expect(() => classifyPediatricAge(changed(age, { ageValue: 10, ageUnit: 'days', gestationalAge })))
      .toThrow(expect.objectContaining({ name: 'ComputationRefusal', code: 'missing_input', field: 'gestationalAge' }));
  });
  it('retains stated preterm and term classification', () => {
    expect(classifyPediatricAge({ ageValue: 10, ageUnit: 'days', gestationalAge: 32 }).ageBand).toBe('preterm_neonate');
    expect(classifyPediatricAge({ ageValue: 10, ageUnit: 'days', gestationalAge: 40 }).ageBand).toBe('term_neonate');
  });
  it.each([
    { ageValue: 18, ageUnit: 'years' }, { ageValue: 216, ageUnit: 'months' },
    { ageValue: 6575, ageUnit: 'days' }, { ageValue: -1, ageUnit: 'years' },
    { ageValue: NaN, ageUnit: 'years' }, { ageValue: Infinity, ageUnit: 'years' },
  ])('refuses a nonpediatric or invalid age: %j', async input => {
    expect(await run('classify_pediatric_age', input)).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'ageValue' });
  });
  it.each([0, -1, NaN, Infinity, '40'])('refuses invalid gestation %j', async gestationalAge => {
    expect(await run('classify_pediatric_age', { ageValue: 10, ageUnit: 'days', gestationalAge }))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'gestationalAge' });
  });
});

describe('pediatric dose inputs require finite positive quantities', () => {
  it.each(['adultDose', 'adultWeight', 'childWeight', 'childBSA'])('validates %s', async field => {
    for (const value of [0, -1, NaN, Infinity, '70']) {
      expect(await run('select_pediatric_dose', changed(dose, { [field]: value })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
    }
  });
  it.each([-1, 18, NaN, Infinity, '5'])('refuses invalid childAge %j', async childAge => {
    expect(await run('select_pediatric_dose', { ...dose, childAge }))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'childAge' });
  });
});

describe('supplemental pediatric regulatory guidance preserves its reference scope', () => {
  it('does not determine either jurisdiction applies from a PIP worksheet', () => {
    const out = designPIP(plan);
    expect(out.regulatoryFramework).toMatchObject({ fda: { applies: null }, ema: { applies: null } });
    for (const framework of [out.regulatoryFramework.fda, out.regulatoryFramework.ema]) {
      expect(framework.mechanism).toMatch(/reference/i);
      expect(framework.mechanism).toMatch(/trigger|scope|waiver/i);
    }
  });
  it('does not determine EMA application triggers just from a requested jurisdiction', () => {
    const out = assessPediatricRequirements(requirements);
    expect(out.regulatoryObligations.emaPdco.required).toBeNull();
    expect(out.regulatoryObligations.emaPdco.mechanism).toMatch(/reference/i);
    expect(out.regulatoryObligations.emaPdco.mechanism).toMatch(/trigger|waiver/i);
  });
  it('keeps unrequested EMA outside the assessed obligations', () => {
    expect(assessPediatricRequirements({ ...requirements, targetJurisdictions: ['FDA'] })
      .regulatoryObligations.emaPdco.required).toBe(false);
  });
  it('does not settle the FDA orphan exception merely from stated NME status', () => {
    const out = assessPediatricRequirements({ ...requirements, isOrphan: true });
    expect(out.regulatoryObligations.fdaPrea.required).toBeNull();
    expect(out.regulatoryObligations.fdaPrea.mechanism).toMatch(/reference/i);
    expect(out.regulatoryObligations.fdaPrea.mechanism).toMatch(/orphan|waiver/i);
  });
  it.each([true, false])('does not award exclusivity or rewards with orphan designation %j', isOrphan => {
    const out = assessPediatricRequirements({ ...requirements, isOrphan });
    expect(out.regulatoryObligations.fdaPrea.exclusivity).toMatch(/conditional.*reference/i);
    expect(out.regulatoryObligations.fdaPrea.exclusivity).toMatch(/eligibility.*not assessed/i);
    expect(out.regulatoryObligations.emaPdco.rewards).toMatch(/reference/i);
    expect(out.regulatoryObligations.emaPdco.rewards).toMatch(/eligibility|no product entitlement/i);
    if (isOrphan) expect(out.orphanConsiderations.incentives.join(' ')).toMatch(/does not determine entitlement/i);
  });
  it('does not turn an encoded no-deferral branch into a legal waiver or full-program determination', () => {
    const out = designPIP(plan);
    expect(out.deferralWaiverAssessment.type).toBe('none');
    expect(out.deferralWaiverAssessment.justification)
      .not.toMatch(/Full pediatric development required|No waiver or deferral applicable/i);
  });
  it('does not suggest borrowing adult efficacy after adult efficacy was explicitly ruled out', () => {
    const out = assessExtrapolation({ ...extrapolation, adultEfficacyEstablished: false });
    expect(out.bayesianBorrowing.applicable).toBe(false);
    expect(out.bayesianBorrowing.priorSource).not.toMatch(/Minimal adult data borrowing justified/i);
    expect(out.bayesianBorrowing.priorSource).toMatch(/no.*adult.*(?:efficacy|borrowing)|adult.*(?:efficacy|borrowing).*not supported/i);
  });
  it('attributes neonatal response similarity to the stated assessment rather than an unstated mechanism', () => {
    const out = assessExtrapolation({ ...extrapolation, targetAgeBands: ['term_neonate'] });
    expect(out.feasibility).toBe('partial_extrapolation_pk_efficacy');
    expect(out.rationale).not.toMatch(/based on mechanism of action/i);
    expect(out.rationale).toMatch(/(?:response|similarity).*stated|stated.*(?:response|similarity)/i);
  });
});

describe('supplemental pediatric formulation inputs preserve shape and evidence', () => {
  it.each([{ drugProperties: 'bitter' }, { drugProperties: 7 }, { drugProperties: false }, { drugProperties: [] }])(
    'refuses drugProperties that is not an object: $drugProperties', async ({ drugProperties }) => {
    const out = await run('select_pediatric_formulation', changed(formulation, { drugProperties }));
    expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'drugProperties' });
    expect(out).not.toHaveProperty('basis');
    },
  );
  it.each([
    { field: 'solubility', value: 'unknown' }, { field: 'stability', value: 0 },
    { field: 'tasteProfile', value: ['bitter'] },
  ])('refuses malformed drugProperties.$field', async ({ field, value }) => {
    expect(await run('select_pediatric_formulation', changed(formulation, { drugProperties: { [field]: value } })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: `drugProperties.${field}` });
  });
  it.each([{ proposedExcipients: 'ethanol' }, { proposedExcipients: [7] }, { proposedExcipients: [''] }])(
    'requires a list of nonempty excipient names: $proposedExcipients', async ({ proposedExcipients }) => {
      expect(await run('select_pediatric_formulation', changed(formulation, { proposedExcipients })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'proposedExcipients' });
    },
  );
  it.each([undefined, null, {}])('does not claim liquid palatability from unstated taste: %j', drugProperties => {
    const out = selectFormulation(changed(formulation, { drugProperties }));
    const liquid = out.recommendedFormulations.find(item => item.formulation === 'oral_solution');
    expect(liquid).toBeDefined();
    expect(liquid!.acceptabilityEvidence).toMatch(/tasteProfile.*not stated/);
    expect(liquid!.acceptabilityEvidence).toMatch(/palatability.*not assessed/);
    expect(liquid!.acceptabilityEvidence).not.toMatch(/generally well accepted/i);
  });
  it.each([undefined, null])('labels neonatal excipient cautions as references without a stated product list: %j', proposedExcipients => {
    const out = selectFormulation(changed(formulation, { targetAgeBands: ['term_neonate'], proposedExcipients }));
    expect(out.excipientSafety.length).toBeGreaterThan(0);
    const note = out.emaReflectionPaperGuidance.join(' ');
    expect(note).toMatch(/proposedExcipients.*not stated/);
    expect(note).toMatch(/reference information.*not an assessment of a product excipient list/);
  });
});
