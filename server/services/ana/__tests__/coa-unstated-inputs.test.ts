/** S5a: absent COA facts are questions, not evidence of either answer. */
import { describe, expect, it } from 'vitest';
import {
  assessCOAValidation, assessCOAFitForPurpose, positionCOAEndpoint,
  planCOADevelopment, determineMeaningfulChange, selectCOAType,
} from '../../clinical-outcome-assessment/coa-knowledge';
import { getToolHandler } from '../AnaToolExecutor';

const validation = {
  coaType: 'PRO', contentValidityEstablished: true, contentValidityInTargetPopulation: true,
  constructValidityConfirmed: true, testRetestICC: 0.8, cronbachAlpha: 0.8,
  isMultiItem: true, abilityToDetectChangeDemonstrated: true,
} as const;
const fit = {
  coaType: 'PRO', conceptOfInterest: 'pain', population: 'adult_cognitively_intact',
  intendedEndpointPosition: 'primary', contentValidityInContextOfUse: true,
  conceptMatchesClaim: true, meaningfulChangeDefined: true, recallPeriodAppropriate: true,
  modeOfAdministrationValidated: true,
} as const;
const endpoint = {
  coaType: 'PRO', conceptOfInterest: 'pain', isCoreToFeelFunctionSurvive: true,
  fitForPurpose: true, meaningfulChangeDefined: true, blinded: true,
  otherKeyEndpointsCount: 1, labelClaimSought: true,
} as const;
const development = {
  coaType: 'PRO', conceptOfInterest: 'pain', population: 'adult_cognitively_intact',
  existingInstrumentAvailable: true, existingHasContentValidityInPopulation: true,
  modificationPlanned: false, seekingQualificationOrClaim: true,
} as const;

const families = [
  { tool: 'assess_coa_validation', compute: assessCOAValidation, input: validation,
    flags: ['contentValidityEstablished', 'contentValidityInTargetPopulation', 'constructValidityConfirmed', 'isMultiItem', 'abilityToDetectChangeDemonstrated'] },
  { tool: 'assess_coa_fit_for_purpose', compute: assessCOAFitForPurpose, input: fit,
    flags: ['contentValidityInContextOfUse', 'conceptMatchesClaim', 'meaningfulChangeDefined', 'recallPeriodAppropriate', 'modeOfAdministrationValidated'] },
  { tool: 'position_coa_endpoint', compute: positionCOAEndpoint, input: endpoint,
    flags: ['isCoreToFeelFunctionSurvive', 'fitForPurpose', 'meaningfulChangeDefined', 'blinded', 'labelClaimSought'] },
  { tool: 'plan_coa_development', compute: planCOADevelopment, input: development,
    flags: ['existingInstrumentAvailable', 'existingHasContentValidityInPopulation', 'modificationPlanned', 'seekingQualificationOrClaim'] },
];

async function run(tool: string, input: Record<string, unknown>) {
  return JSON.parse(await getToolHandler(tool)!(input, { organizationId: 101, userId: 7 } as never));
}

describe('COA conclusions require their deciding facts', () => {
  it('does not call content validity inadequate when the target population was not stated', () => {
    const out = assessCOAValidation({ ...validation, contentValidityInTargetPopulation: undefined });
    expect(out.properties.find(p => p.property === 'Content validity')?.grade).toBe('not_assessed');
    expect(out.overallAdequacy).toBe('not_assessed');
    expect(out.gaps.join(' ')).not.toMatch(/is not established|was not established/);
  });

  it('does not invent a single-item instrument or a positive validation roll-up', () => {
    const out = assessCOAValidation({ ...validation, isMultiItem: undefined });
    const property = out.properties.find(p => p.property === 'Internal consistency')!;
    expect(property.grade).toBe('not_assessed');
    expect(property.finding).not.toMatch(/Single-item instrument/);
    expect(out.overallAdequacy).toBe('not_assessed');
  });

  it('leaves a wholly unstated validation unassessed rather than failed', () => {
    expect(assessCOAValidation({ coaType: 'PRO' }).overallAdequacy).toBe('not_assessed');
  });

  it('recognizes explicit single-item non-applicability without penalizing the roll-up', () => {
    expect(assessCOAValidation({ ...validation, isMultiItem: false }).overallAdequacy).toBe('adequate');
  });

  it('keeps a known failed validation even when other evidence was not stated', () => {
    expect(assessCOAValidation({ coaType: 'PRO', contentValidityEstablished: false }).overallAdequacy).toBe('inadequate');
  });
});

describe('COA fit, endpoint and development conclusions need deciding facts', () => {
  it('does not turn missing meaningful-change evidence into a confirmed blocking failure', () => {
    const out = assessCOAFitForPurpose({ ...fit, meaningfulChangeDefined: undefined });
    expect(out.fitForPurpose).toBe('not_assessed');
    expect(out.criteria.find(c => /Meaningful/.test(c.criterion))?.status).toBe('not_stated');
    expect(out.blockingIssues).toEqual([]);
  });

  it('retains a confirmed fit-for-purpose blocker when other facts are missing', () => {
    expect(assessCOAFitForPurpose({ ...fit, contentValidityInContextOfUse: false,
      meaningfulChangeDefined: undefined }).fitForPurpose).toBe('not_fit');
  });

  it('does not assume a nonconfirmatory endpoint when its position was not stated', () => {
    const out = assessCOAFitForPurpose({ ...fit, intendedEndpointPosition: undefined, meaningfulChangeDefined: false });
    expect(out.fitForPurpose).toBe('not_assessed');
    expect(out.recommendations.join(' ')).toMatch(/intendedEndpointPosition.*not stated/);
  });

  it.each(['isCoreToFeelFunctionSurvive', 'fitForPurpose', 'meaningfulChangeDefined', 'blinded'])(
    'withholds a subjective endpoint position with %s unstated', field => {
      const out = positionCOAEndpoint({ ...endpoint, [field]: undefined });
      expect(out.recommendedPosition).toBe('not_assessed');
      expect(out.labelClaimFeasibility).toBe('not_assessed');
    },
  );

  it('does not read missing claim intent as no claim sought', () => {
    const out = positionCOAEndpoint({ ...endpoint, labelClaimSought: undefined });
    expect(out.recommendedPosition).toBe('primary');
    expect(out.labelClaimFeasibility).toBe('not_assessed');
    expect(out.rationale.join(' ')).not.toMatch(/No label claim is sought/);
  });

  it('can place a known unfit instrument as exploratory without inventing other facts', () => {
    const out = positionCOAEndpoint({ coaType: 'PRO', conceptOfInterest: 'pain', fitForPurpose: false });
    expect(out.recommendedPosition).toBe('exploratory');
    expect(out.labelClaimFeasibility).toBe('not_assessed');
  });

  it('does not require a blinding answer for an objective PerfO placement', () => {
    expect(positionCOAEndpoint({ ...endpoint, coaType: 'PerfO', blinded: undefined }).recommendedPosition).toBe('primary');
  });

  it('does not withhold an already determined supportive position for missing blinding', () => {
    expect(positionCOAEndpoint({ ...endpoint, isCoreToFeelFunctionSurvive: false,
      blinded: undefined }).recommendedPosition).toBe('key_secondary');
  });

  it('does not read an unstated endpoint count as zero', () => {
    const out = positionCOAEndpoint({ ...endpoint, otherKeyEndpointsCount: undefined });
    expect(out.multiplicityConsiderations.join(' ')).toMatch(/otherKeyEndpointsCount.*not stated/);
  });

  it.each([
    { existingInstrumentAvailable: undefined },
    { existingHasContentValidityInPopulation: undefined },
    { modificationPlanned: undefined },
  ])('withholds the instrument strategy when the deciding flag is unstated: %j', missing => {
    const out = planCOADevelopment({ ...development, ...missing });
    expect(out.strategy).toBe('not_assessed');
    expect(out.totalEstimatedDurationMonths).toBeNull();
    expect(out.steps.some(s => /Phase 3/.test(s.phase))).toBe(false);
  });

  it('can plan de novo work when no existing instrument is explicitly stated', () => {
    const out = planCOADevelopment({ ...development, existingInstrumentAvailable: false,
      existingHasContentValidityInPopulation: undefined, modificationPlanned: undefined });
    expect(out.strategy).toBe('develop_de_novo');
    expect(out.totalEstimatedDurationMonths).toBe(29);
  });

  it('can plan modification from a stated modification decision without guessing content validity', () => {
    expect(planCOADevelopment({ ...development, modificationPlanned: true,
      existingHasContentValidityInPopulation: undefined }).strategy).toBe('modify_existing');
  });

  it('does not call FDA engagement optional when the qualification/claim goal was not stated', () => {
    const out = planCOADevelopment({ ...development, seekingQualificationOrClaim: undefined });
    expect(out.fdaEngagementPlan.join(' ')).toMatch(/seekingQualificationOrClaim.*not stated/);
    expect(out.fdaEngagementPlan.join(' ')).not.toMatch(/engagement optional/);
  });

  it('preserves explicit positive conclusions and known false blinding/claim intent', () => {
    expect(assessCOAValidation(validation).overallAdequacy).toBe('adequate');
    expect(assessCOAFitForPurpose(fit).fitForPurpose).toBe('fit');
    expect(positionCOAEndpoint(endpoint)).toMatchObject({ recommendedPosition: 'primary', labelClaimFeasibility: 'feasible' });
    expect(positionCOAEndpoint({ ...endpoint, blinded: false }).recommendedPosition).toBe('key_secondary');
    expect(positionCOAEndpoint({ ...endpoint, labelClaimSought: false }).labelClaimFeasibility).toBe('not_feasible');
    expect(planCOADevelopment(development).strategy).toBe('select_existing');
  });
});

describe.each(families)('$tool boolean input states', ({ tool, compute, input, flags }) => {
  it.each(flags)('%s is not_stated when omitted or null, and never coerced from a string', async field => {
    for (const missing of [undefined, null]) {
      const out = (compute as (p: object) => unknown)({ ...input, [field]: missing });
      expect(out).toMatchObject({ inputStates: { [field]: 'not_stated' } });
    }
    for (const malformed of ['false', 0, 1]) {
      const out = await run(tool, { ...input, [field]: malformed });
      expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
      expect(out).not.toHaveProperty('basis');
    }
  });

  it('reaches the corrected engine through the stated-input tool envelope', async () => {
    const out = await run(tool, input);
    expect(out.status).toBe('computed');
    expect(out.basis).toBe('stated');
    expect(out.result.inputStates).toBeDefined();
    for (const field of flags) expect(out.result.inputStates[field]).toBe(input[field as keyof typeof input]);
  });
});

describe('required COA decisions do not take an implicit enum branch', () => {
  const cases = [
    { tool: 'select_coa_type', input: { conceptOfInterest: 'pain', conceptObservability: 'patient_subjective', population: 'infant_toddler' },
      fields: ['conceptOfInterest', 'conceptObservability', 'population'] },
    { tool: 'assess_coa_validation', input: validation, fields: ['coaType'] },
    { tool: 'assess_coa_fit_for_purpose', input: fit, fields: ['coaType', 'conceptOfInterest', 'population'] },
    { tool: 'position_coa_endpoint', input: endpoint, fields: ['coaType', 'conceptOfInterest'] },
    { tool: 'plan_coa_development', input: development, fields: ['coaType', 'conceptOfInterest', 'population'] },
    { tool: 'determine_meaningful_change', input: { improvementDirection: 'decrease',
      anchorEstimates: [{ anchorLabel: 'PGIC', meanChangeInImprovedGroup: -4, anchorCorrelation: 0.6 }] },
      fields: ['improvementDirection'] },
  ];
  for (const { tool, input, fields } of cases) {
    it.each(fields)(`${tool} requires %s at runtime`, async field => {
      for (const missing of [undefined, null]) {
        expect(await run(tool, { ...input, [field]: missing })).toMatchObject({
          status: 'needs_parameters', code: 'missing_input', field,
        });
      }
      expect(await run(tool, { ...input, [field]: 42 })).toMatchObject({
        status: 'needs_parameters', code: 'invalid_input', field,
      });
      if (field === 'coaType' || field === 'population') {
        expect(await run(tool, { ...input, [field]: [input[field as keyof typeof input]] })).toMatchObject({
          status: 'needs_parameters', code: 'invalid_input', field,
        });
      }
    });
  }
});

describe('meaningful-change anchors need a stated correlation', () => {
  it.each([undefined, null])('does not derive a responder threshold from correlation %j', async correlation => {
    const out = await run('determine_meaningful_change', {
      improvementDirection: 'decrease', anchorEstimates: [{ anchorLabel: 'PGIC',
        meanChangeInImprovedGroup: -4, anchorCorrelation: correlation }],
      distributionEstimate: { baselineSD: 6 },
    });
    expect(out.result.method).toBe('distribution_based_supportive_only');
    expect(out.result.usableAnchors[0]).toMatchObject({ usable: 'not_stated', thresholdContribution: null });
    expect(out.result).not.toHaveProperty('recommendedThreshold');
    expect(out.result).not.toHaveProperty('responderDefinition');
  });

  it('uses only anchors with sufficient stated correlation', () => {
    const out = determineMeaningfulChange({ improvementDirection: 'decrease', anchorEstimates: [
      { anchorLabel: 'unknown', meanChangeInImprovedGroup: -100 },
      { anchorLabel: 'weak', meanChangeInImprovedGroup: -80, anchorCorrelation: 0.1 },
      { anchorLabel: 'valid', meanChangeInImprovedGroup: -4, anchorCorrelation: -0.6 },
    ] });
    expect(out.method).toBe('anchor_based_primary');
    expect(out.recommendedThreshold).toBe(-4);
  });

  it('reports supplied but unassessed anchors as no usable evidence', () => {
    const out = determineMeaningfulChange({ improvementDirection: 'decrease', anchorEstimates: [
      { anchorLabel: 'PGIC', meanChangeInImprovedGroup: -4 },
    ] });
    expect(out.method).toBe('insufficient_evidence');
    expect(out.cautions.join(' ')).toMatch(/No usable/);
    expect(out.cautions.join(' ')).not.toMatch(/Neither.*was provided/);
  });

  it('refuses a malformed correlation through the existing parameter-refusal boundary', async () => {
    expect(await run('determine_meaningful_change', { improvementDirection: 'decrease', anchorEstimates: [
      { anchorLabel: 'PGIC', meanChangeInImprovedGroup: -4, anchorCorrelation: 2 },
    ] })).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'anchorEstimates[0].anchorCorrelation' });
  });

  it.each([undefined, null, NaN, Infinity, '4'])('refuses an unreadable required anchor mean: %j', async mean => {
    expect(await run('determine_meaningful_change', { improvementDirection: 'decrease', anchorEstimates: [
      { anchorLabel: 'PGIC', meanChangeInImprovedGroup: mean, anchorCorrelation: 0.6 },
    ] })).toMatchObject({ status: 'needs_parameters', field: 'anchorEstimates[0].meanChangeInImprovedGroup' });
  });

  it.each(['baselineSD', 'sem'])('does not compute supportive estimates from an invalid %s', async field => {
    for (const value of [-1, Infinity, NaN, '2']) {
      expect(await run('determine_meaningful_change', { improvementDirection: 'decrease',
        distributionEstimate: { [field]: value } })).toMatchObject({
        status: 'needs_parameters', code: 'invalid_input', field: `distributionEstimate.${field}`,
      });
    }
  });

  it('retains the reference-only COA type lookup', () => {
    expect(selectCOAType({ conceptOfInterest: 'pain', conceptObservability: 'patient_subjective',
      population: 'adult_cognitively_intact' }).primaryRecommendation).toBe('PRO');
  });
});

describe('COA measurement-property values must be interpretable', () => {
  it.each(['testRetestICC', 'cronbachAlpha', 'interRaterICC'])('refuses invalid %s without assigning an adequacy grade', async field => {
    for (const value of [-0.1, 1.2, NaN, Infinity, '0.8']) {
      expect(await run('assess_coa_validation', { ...validation, coaType: 'ClinRO', [field]: value })).toMatchObject({
        status: 'needs_parameters', code: 'invalid_input', field,
      });
    }
  });
});
