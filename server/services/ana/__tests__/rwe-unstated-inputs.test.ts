/**
 * S5a: the RWE worksheets keep an unanswered fact not_stated, and refuse the context they cannot run without.
 *
 * What the code did before this change: every boolean was read as `!fact`, so an omitted fact was a stated
 * false. score_rwe_data_source scored "No validation study" and "No death linkage"; assess_rwe_bias_risk
 * reported "no active comparator" as a high risk and dropped the surveillance and self-report biases;
 * assess_rwe_regulatory_acceptability graded pre-registration and validation not_met and said no trial data
 * existed. The two selection worksheets fell through to a default branch, and an omitted enum or number
 * was either written up as a default or crashed the tool (studyQuestion, authority). The tool definitions
 * made all 21 booleans schema-required and said nothing of an omitted one.
 *
 * Review follow-up (2026-11-02): the acceptability grade counted a sensitivity-analysis requirement fixed at
 * partially_met, with no input behind it, and the data-source profile asserted lab, notes and pharmacy capture
 * whatever the flags said.
 */
import { describe, expect, it } from 'vitest';
import {
  designTargetTrial, scoreDataSource, designPropensityAnalysis, selectRWEDesign,
  assessBiasRisk, assessRegulatoryAcceptability,
} from '../../rwe/rwe-methodology-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import {
  ASSESS_RWE_BIAS_RISK, ASSESS_RWE_REGULATORY_ACCEPTABILITY, DESIGN_TARGET_TRIAL, SCORE_RWE_DATA_SOURCE,
} from '../rweMethodologyTools';

/** ai-gateway/gateway.ts trims a longer tool description to this many characters for OpenAI-compatible providers. */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const trial = {
  indication: 'type 2 diabetes mellitus', treatmentStrategy: 'sustained_use', comparator: 'sitagliptin',
  primaryOutcome: 'major adverse cardiovascular events', causalContrast: 'per_protocol', maxFollowUpMonths: 24,
} satisfies Parameters<typeof designTargetTrial>[0];
const source = {
  sourceType: 'linked_claims_ehr', studyQuestion: 'effectiveness', estimatedSampleSize: 20000, longitudinalYears: 8,
  deathLinkage: true, hasLabResults: true, hasClinicalNotes: true, hasPharmacyDispensing: true, hasProcedures: true,
  hasValidationStudy: true, continuousEnrollmentPct: 85, geographicCoverage: 'national',
} satisfies Parameters<typeof scoreDataSource>[0];
const propensity = {
  sampleSize: 4000, nConfounders: 20, treatmentPrevalence: 0.4, rareOutcome: false, clinicalEquipoise: true,
  targetEstimand: 'ate', timeVaryingConfounding: false,
} satisfies Parameters<typeof designPropensityAnalysis>[0];
const design = {
  questionType: 'treatment_effect', timeVaryingExposure: false, rareOutcome: false, acuteOutcome: false,
  naturalExperiment: false, withinPersonComparison: false, strongConfoundingConcern: false,
} satisfies Parameters<typeof selectRWEDesign>[0];
const bias = {
  studyDesign: 'new_user_active_comparator', exposureType: 'drug', dataSource: 'claims', selfReportedOutcome: false,
  differentialSurveillance: false, nUnmeasuredConfounders: 1, hasActiveComparator: true,
} satisfies Parameters<typeof assessBiasRisk>[0];
const acceptability = {
  purpose: 'label_expansion', authority: 'fda', studyDesign: 'new_user_active_comparator', dataSource: 'linked_claims_ehr',
  preRegistered: true, validatedOutcomes: true, existingTrialData: true, sensitivityAnalysesPlanned: true, sampleSize: 5000,
} satisfies Parameters<typeof assessRegulatoryAcceptability>[0];

const SOURCE_FLAGS = ['deathLinkage', 'hasLabResults', 'hasClinicalNotes', 'hasPharmacyDispensing', 'hasProcedures', 'hasValidationStudy'];
const BIAS_FLAGS = ['selfReportedOutcome', 'differentialSurveillance', 'hasActiveComparator'];
const ACCEPTABILITY_FLAGS = ['preRegistered', 'validatedOutcomes', 'existingTrialData', 'sensitivityAnalysesPlanned'];

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101, userId: 7 } as never));
}

describe('all six existing RWE tools keep their explicit results', () => {
  const cases = [
    { tool: 'design_target_trial', input: trial, result: { protocolComponents: expect.arrayContaining([expect.objectContaining({
      component: 'Causal Contrast', trialSpecification: 'Per-protocol: compare adherent patients in each arm.' })]) } },
    { tool: 'score_rwe_data_source', input: source, result: { overallScore: 95, fitnessForPurpose: 'high' } },
    { tool: 'design_propensity_analysis', input: propensity,
      result: { primaryRecommendation: { estimationMethod: 'logistic_regression', applicationMethod: 'iptw' } } },
    { tool: 'select_rwe_design', input: design, result: { primaryDesign: { design: 'new_user_active_comparator' } } },
    { tool: 'assess_rwe_bias_risk', input: bias, result: { overallBiasRisk: 'low' } },
    { tool: 'assess_rwe_regulatory_acceptability', input: acceptability, result: { overallAcceptability: 'high' } },
  ];
  it.each(cases)('$tool reaches its canonical engine with a stated basis', async ({ tool, input, result }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', basis: 'stated', appliesTo: 'the inputs stated in this conversation', result,
    });
  });
});

const statedFamilies = [
  { tool: 'score_rwe_data_source', compute: scoreDataSource, input: source, flags: SOURCE_FLAGS },
  { tool: 'assess_rwe_bias_risk', compute: assessBiasRisk, input: bias, flags: BIAS_FLAGS },
  { tool: 'assess_rwe_regulatory_acceptability', compute: assessRegulatoryAcceptability, input: acceptability,
    flags: ACCEPTABILITY_FLAGS },
];

describe('the tool definitions leave the optional facts optional and say what omission means', () => {
  it.each([
    { tool: 'score_rwe_data_source', def: SCORE_RWE_DATA_SOURCE, flags: SOURCE_FLAGS },
    { tool: 'assess_rwe_bias_risk', def: ASSESS_RWE_BIAS_RISK, flags: BIAS_FLAGS },
    { tool: 'assess_rwe_regulatory_acceptability', def: ASSESS_RWE_REGULATORY_ACCEPTABILITY, flags: ACCEPTABILITY_FLAGS },
  ])('$tool', ({ def, flags }) => {
    expect(def.description).toMatch(/left out remains not_stated/);
    for (const field of flags) {
      expect(def.input_schema.required).not.toContain(field);
      expect(def.input_schema.properties[field]).toMatchObject({
        type: 'boolean', description: expect.stringMatching(/Omitted or null stays not_stated/) });
    }
  });

  it.each([SCORE_RWE_DATA_SOURCE, ASSESS_RWE_BIAS_RISK, ASSESS_RWE_REGULATORY_ACCEPTABILITY])(
    '$name names its not_assessed result within the trimmed length', def => {
      expect(def.description.slice(0, OPENAI_MAX_TOOL_DESCRIPTION_CHARS - 1)).toMatch(/not_assessed/);
    });

  it('design_target_trial says therapeuticArea is not read', () => {
    expect(DESIGN_TARGET_TRIAL.input_schema.properties.therapeuticArea).toMatchObject({
      description: expect.stringMatching(/Not read: it does not change the protocol/) });
  });
});

describe.each(statedFamilies)('$tool preserves boolean answers', ({ tool, compute, input, flags }) => {
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

const choosingFamilies = [
  { tool: 'design_propensity_analysis', input: propensity, flags: ['rareOutcome', 'clinicalEquipoise', 'timeVaryingConfounding'] },
  { tool: 'select_rwe_design', input: design,
    flags: ['timeVaryingExposure', 'rareOutcome', 'acuteOutcome', 'naturalExperiment', 'withinPersonComparison', 'strongConfoundingConcern'] },
];

describe.each(choosingFamilies)('$tool chooses no branch from an unstated fact', ({ tool, input, flags }) => {
  it.each(flags)('%s left out is refused by name; malformed is invalid', async field => {
    for (const absent of [undefined, null]) {
      expect(await run(tool, changed(input, { [field]: absent })))
        .toMatchObject({ status: 'needs_parameters', code: 'missing_input', field });
    }
    for (const malformed of ['false', 0]) {
      expect(await run(tool, changed(input, { [field]: malformed })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
    }
  });
});

describe('context a worksheet cannot run without is refused, never read as a default', () => {
  it.each([
    { tool: 'design_target_trial', input: trial, field: 'causalContrast' },
    { tool: 'design_target_trial', input: trial, field: 'treatmentStrategy' },
    { tool: 'design_target_trial', input: trial, field: 'maxFollowUpMonths' },
    { tool: 'score_rwe_data_source', input: source, field: 'sourceType' },
    { tool: 'score_rwe_data_source', input: source, field: 'studyQuestion' },
    { tool: 'design_propensity_analysis', input: propensity, field: 'targetEstimand' },
    { tool: 'select_rwe_design', input: design, field: 'questionType' },
    { tool: 'assess_rwe_bias_risk', input: bias, field: 'studyDesign' },
    { tool: 'assess_rwe_bias_risk', input: bias, field: 'nUnmeasuredConfounders' },
    { tool: 'assess_rwe_regulatory_acceptability', input: acceptability, field: 'authority' },
    { tool: 'assess_rwe_regulatory_acceptability', input: acceptability, field: 'sampleSize' },
  ])('$tool refuses an omitted $field', async ({ tool, input, field }) => {
    const out = await run(tool, changed(input, { [field]: undefined }));
    expect(out).toMatchObject({ status: 'needs_parameters', code: 'missing_input', field });
    expect(out).not.toHaveProperty('basis');
  });

  it.each([
    { tool: 'score_rwe_data_source', input: source, field: 'geographicCoverage', value: 'global' },
    { tool: 'score_rwe_data_source', input: source, field: 'continuousEnrollmentPct', value: 140 },
    { tool: 'assess_rwe_regulatory_acceptability', input: acceptability, field: 'authority', value: 'FDA' },
    { tool: 'design_target_trial', input: trial, field: 'causalContrast', value: 'itt' },
  ])('$tool refuses $field = $value', async ({ tool, input, field, value }) => {
    expect(await run(tool, changed(input, { [field]: value })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
  });
});

describe('data-source scoring derives no score, gap or reliability finding from an unstated fact', () => {
  it.each(SOURCE_FLAGS)('%s left out: the dimensions reading it and the overall score are not assessed', field => {
    const out = scoreDataSource(changed(source, { [field]: undefined }));
    expect(out).toMatchObject({ overallScore: null, fitnessForPurpose: 'not_assessed' });
    const reading = out.dimensions.filter(d => d.notStated.includes(field));
    expect(reading.length).toBeGreaterThan(0);
    for (const d of reading) expect(d.score).toBeNull();
    expect(out.dimensions.find(d => d.dimension === 'Longitudinality')?.score).toBe(80);
    expect(out.dimensions.find(d => d.dimension === 'Sample Size')?.score).toBe(100);
    expect(JSON.stringify(out.dimensions)).not.toMatch(/No validation study|No death linkage|not available|not captured/);
  });

  it('does not report an unstated validation study as missing', () => {
    const reliability = scoreDataSource(changed(source, { hasValidationStudy: undefined })).regulatoryAcceptability.fdaReliability;
    expect(reliability).not.toMatch(/No validation study is available/);
    expect(reliability).toMatch(/was not stated/);
  });

  it('still scores and reports an explicit false', () => {
    const out = scoreDataSource({ ...source, hasValidationStudy: false, deathLinkage: false });
    expect(out.overallScore).toEqual(expect.any(Number));
    expect(out.fitnessForPurpose).not.toBe('not_assessed');
    expect(JSON.stringify(out.dimensions)).toMatch(/No validation study for key variable definitions/);
    expect(JSON.stringify(out.dimensions)).toMatch(/No death linkage/);
    expect(out.regulatoryAcceptability.fdaReliability).toMatch(/^No validation study is available/);
  });

  it('labels the source-type profile typical, and leaves out a trait a stated capture fact contradicts', () => {
    const claims = { ...source, sourceType: 'claims' as const };
    const unstated = scoreDataSource(changed(claims, Object.fromEntries(SOURCE_FLAGS.map(field => [field, undefined]))));
    expect(unstated.strengthsAndLimitations.note).toMatch(/^Typical of claims sources, not established for the stated source/);
    const contradicted = scoreDataSource({ ...claims, hasLabResults: true, hasPharmacyDispensing: false });
    expect(JSON.stringify(contradicted.dimensions)).toMatch(/Pharmacy dispensing data not available/);
    expect(contradicted.strengthsAndLimitations.strengths).not.toContain('Complete pharmacy dispensing capture');
    expect(contradicted.strengthsAndLimitations.limitations).not.toContain('No lab results or clinical notes');
    expect(scoreDataSource({ ...claims, hasLabResults: false, hasClinicalNotes: false }).strengthsAndLimitations).toMatchObject({
      strengths: expect.arrayContaining(['Complete pharmacy dispensing capture']),
      limitations: expect.arrayContaining(['No lab results or clinical notes']) });
  });

  it.each(['claims', 'ehr', 'registry', 'biobank', 'linked_claims_ehr', 'integrated_delivery_network'] as const)(
    '%s: no profile trait contradicts a stated capture fact', sourceType => {
      const none = scoreDataSource({ ...source, sourceType, hasLabResults: false, hasClinicalNotes: false, hasPharmacyDispensing: false });
      expect(none.strengthsAndLimitations.strengths.join(' | ')).not.toMatch(/pharmacy|\blabs?\b|lab values|notes|biomarker/i);
      expect(none.strengthsAndLimitations.limitations.join(' | ')).not.toMatch(/NLP|unstructured/i);
      const all = scoreDataSource({ ...source, sourceType });
      expect(all.strengthsAndLimitations.limitations.join(' | ')).not.toMatch(/No lab results|PBM/);
      expect(all.strengthsAndLimitations.note).toMatch(/not established for the stated source/);
    });
});

describe('bias assessment grades no bias from an unstated fact', () => {
  const qba = (out: ReturnType<typeof assessBiasRisk>) =>
    out.sensitivityAnalyses.find(s => s.analysis.startsWith('Probabilistic'))?.required;

  it('lists confounding by indication, ungraded, when the comparator is not stated', () => {
    const out = assessBiasRisk(changed(bias, { hasActiveComparator: undefined }));
    expect(out.biases).not.toContainEqual(expect.objectContaining({ specificBias: 'Confounding by indication (no active comparator)' }));
    expect(out.biases).toContainEqual(expect.objectContaining({
      category: 'selection_bias', riskLevel: 'not_assessed', specificBias: expect.stringMatching(/^Confounding by indication/) }));
    expect(out).toMatchObject({ overallBiasRisk: 'not_assessed', inputStates: { hasActiveComparator: 'not_stated' } });
  });

  it.each(['differentialSurveillance', 'selfReportedOutcome'])('keeps the bias %s would raise, ungraded', field => {
    const out = assessBiasRisk(changed(bias, { [field]: undefined }));
    expect(out.biases.filter(b => b.riskLevel === 'not_assessed')).toHaveLength(1);
    expect(out.overallBiasRisk).toBe('not_assessed');
  });

  it('gives a grade the unstated facts cannot change', () => {
    const out = assessBiasRisk(changed(bias, { studyDesign: 'prevalent_user_cohort', nUnmeasuredConfounders: 3, hasActiveComparator: undefined }));
    expect(out).toMatchObject({ overallBiasRisk: 'high', inputStates: { hasActiveComparator: 'not_stated' } });
    expect(qba(out)).toBe(true);
  });

  it('leaves quantitative bias analysis undetermined when an unstated fact decides the grade', () => {
    const out = assessBiasRisk(changed(bias, { nUnmeasuredConfounders: 3, hasActiveComparator: undefined }));
    expect(out.overallBiasRisk).toBe('not_assessed');
    expect(qba(out)).toBe('not_assessed');
  });

  it('keeps the explicit no-comparator finding', () => {
    expect(assessBiasRisk({ ...bias, hasActiveComparator: false }).biases).toContainEqual(expect.objectContaining({
      specificBias: 'Confounding by indication (no active comparator)', riskLevel: 'high' }));
  });
});

describe('regulatory acceptability grades no requirement from an unstated fact', () => {
  const status = (out: ReturnType<typeof assessRegulatoryAcceptability>, requirement: RegExp) =>
    out.evidenceRequirements.find(r => requirement.test(r.requirement))?.status;

  it('does not grade an unstated pre-registration as not met', () => {
    const out = assessRegulatoryAcceptability(changed(acceptability, { preRegistered: undefined }));
    expect(status(out, /pre-registration/)).toBe('not_assessed');
    expect(status(out, /^Transparency/)).toBe('not_assessed');
    expect(out.overallAcceptability).toBe('not_assessed');
    expect(out.recommendations.join(' ')).not.toMatch(/Pre-register the study protocol before any data access/);
    expect(out.recommendations.join(' ')).toMatch(/State preRegistered/);
  });

  it('does not grade unstated outcome validation as not met', () => {
    // 5.5 or 6.5 of 7 credits: moderate or high, so the grade waits for the answer.
    const out = assessRegulatoryAcceptability(changed(acceptability, { validatedOutcomes: undefined, dataSource: 'claims' }));
    expect(status(out, /^Validated outcome/)).toBe('not_assessed');
    expect(out.overallAcceptability).toBe('not_assessed');
    expect(out.recommendations).not.toContain(
      'Validate the primary outcome and exposure algorithms. Cite published validation studies or conduct a de novo validation against chart review.');
  });

  it('does not say no trial data exists when that was not stated', () => {
    const out = assessRegulatoryAcceptability(changed(acceptability, { existingTrialData: undefined }));
    expect(out.recommendations.join(' ')).not.toMatch(/no prior randomized trial data exists/);
    expect(out).toMatchObject({ overallAcceptability: 'high', inputStates: { existingTrialData: 'not_stated' } });
  });

  it('gives a grade the unstated fact cannot change', () => {
    // 6 or 7 of 7 credits: high either way. With the fixed half credit it was 5.5 or 6.5 of 7: not_assessed.
    const out = assessRegulatoryAcceptability(changed(acceptability, { validatedOutcomes: undefined }));
    expect(out).toMatchObject({ overallAcceptability: 'high', inputStates: { validatedOutcomes: 'not_stated' } });
  });

  it('grades the sensitivity-analysis requirement from the stated plan, and withholds a grade it decides', () => {
    const plan = {
      ...acceptability, purpose: 'post_marketing_safety', studyDesign: 'nested_case_control', dataSource: 'claims',
    } satisfies Parameters<typeof assessRegulatoryAcceptability>[0];
    const sensitivity = (out: ReturnType<typeof assessRegulatoryAcceptability>) =>
      out.evidenceRequirements.find(r => r.requirement.startsWith('Sensitivity analyses'));
    // The other six earn 5 credits. The fixed half credit made it 5.5 of 7 (0.79): moderate, a grade no input decided.
    for (const absent of [undefined, null]) {
      const unstated = assessRegulatoryAcceptability(changed(plan, { sensitivityAnalysesPlanned: absent }));
      expect(sensitivity(unstated)).toMatchObject({ status: 'not_assessed', recommendation: expect.stringMatching(/was not stated/) });
      expect(sensitivity(unstated)?.recommendation).not.toMatch(/Include E-value/);
      // 5 or 6 of 7 (0.71 or 0.86): moderate or high, so the grade waits for the answer.
      expect(unstated).toMatchObject({ overallAcceptability: 'not_assessed', inputStates: { sensitivityAnalysesPlanned: 'not_stated' } });
      expect(unstated.recommendations.join(' ')).toMatch(/State sensitivityAnalysesPlanned/);
    }
    const planned = assessRegulatoryAcceptability({ ...plan, sensitivityAnalysesPlanned: true });
    expect([sensitivity(planned)?.status, planned.overallAcceptability]).toEqual(['met', 'high']);
    const unplanned = assessRegulatoryAcceptability({ ...plan, sensitivityAnalysesPlanned: false });
    expect([sensitivity(unplanned)?.status, unplanned.overallAcceptability]).toEqual(['not_met', 'moderate']);
    expect(sensitivity(unplanned)?.recommendation).toMatch(/^Include E-value analysis/);
    // The review's plan, with a new-user active-comparator design: the other six earn 5.5, and the half credit made it
    // 6 of 7, high. Planned it is 6.5 of 7 (high), not planned 5.5 of 7 (moderate).
    const review = { ...plan, studyDesign: 'new_user_active_comparator' } satisfies Parameters<typeof assessRegulatoryAcceptability>[0];
    expect([undefined, true, false].map(answer =>
      assessRegulatoryAcceptability(changed(review, { sensitivityAnalysesPlanned: answer })).overallAcceptability))
      .toEqual(['not_assessed', 'high', 'moderate']);
  });

  it('keeps explicit answers', () => {
    const out = assessRegulatoryAcceptability({ ...acceptability, preRegistered: false, existingTrialData: false });
    expect(status(out, /pre-registration/)).toBe('not_met');
    expect(status(out, /^Transparency/)).toBe('partially_met');
    expect(out.recommendations.join(' ')).toMatch(/Pre-register the study protocol before any data access/);
    expect(out.recommendations.join(' ')).toMatch(/no prior randomized trial data exists/);
  });
});
