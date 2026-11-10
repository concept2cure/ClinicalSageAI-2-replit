/**
 * S5b: the biomarker worksheets keep an unanswered fact not_stated, decide nothing an answer could change, and
 * refuse a malformed value by field.
 *
 * What the code did before this change: every boolean was read `=== true` or `!== false`, so an omitted fact was
 * an answer. classify_biomarker({ biomarkerName }) was "defaulted to prognostic", and { confirmsDisease: true }
 * was diagnostic whatever predictsDifferentialTreatmentEffect would say; with every feature false the intended
 * use's first category was returned even when its defining feature was stated false. design_cdx_codevelopment
 * read an omitted essentialForUse as a companion diagnostic, Class III, PMA, and an omitted
 * marketAssayDiffersFromCTA as a required bridging study. plan_biomarker_qualification chose a drug-specific
 * submission from omitted scope facts. assess_biomarker_analytical_validation read an omitted `quantitative` as
 * true, passed a CV of 12% against a 15% default whatever the stakes, crashed without `inputs`, and listed an omitted evidence fact's study as outstanding exactly as a stated false's.
 * assess_biomarker_clinical_validation read an omitted independentValidationSet as false. plan_enrichment_strategy
 * chose a stratified design from omitted design facts, clamped a prevalence of 1.5 to 1 and reported 0 screens for
 * a prevalence of 0. A malformed value was read as another: 'Predictive' became the diagnostic descriptor, 'true'
 * read as false, '0.1' as a prevalence of 0.1.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyBiomarker, planBiomarkerQualification, designCDxCodevelopment, assessBiomarkerAnalyticalValidation,
  assessBiomarkerClinicalValidation, planEnrichmentStrategy,
} from '../../biomarkers/biomarker-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { BIOMARKER_TOOLS } from '../biomarkerTools';

/** ai-gateway/gateway.ts trims a longer tool description to this many characters for OpenAI-compatible providers. */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const FEATURES = [
  'predictsDifferentialTreatmentEffect', 'indicatesToxicity', 'measuredInUnaffectedIndividuals', 'changesWithExposure',
  'confirmsDisease', 'measuredSerially',
];
const ALL_FALSE = Object.fromEntries(FEATURES.map(k => [k, false]));
const classify = {
  biomarkerName: 'HER2', intendedUse: 'patient_selection', ...ALL_FALSE, predictsDifferentialTreatmentEffect: true,
  confirmsDisease: true,
};
const qualification = {
  biomarkerName: 'KIM-1', category: 'safety', proposedContextOfUse: 'Nephrotoxicity monitoring in early-phase trials',
  couImpact: 'moderate', crossProgramUse: true, isGenomic: false, consortiumSponsored: true, singleDrugOnly: false,
};
const cdx = {
  therapeuticName: 'Drug X', biomarkerName: 'HER2', assayModality: 'ihc', essentialForUse: true, deviceRiskClass: 'III',
  usedClinicalTrialAssay: true, marketAssayDiffersFromCTA: true, therapeuticPhase: 'phase2',
};
const evidence = {
  precisionCVPercent: 6, maxAcceptableCVPercent: 10, limitOfDetection: 1, lowestClinicallyMeaningfulLevel: 5,
  interferenceTested: true, reportableRangeEstablished: true, robustnessDemonstrated: true, preanalyticalDocumented: true,
  multiSiteReproducibility: true,
};
const analytical = { biomarkerName: 'Troponin I', assayModality: 'elisa', quantitative: true, intendedUseStakes: 'high', inputs: evidence };
const clinical = {
  biomarkerName: 'HER2', truePositives: 45, falseNegatives: 5, trueNegatives: 90, falsePositives: 10,
  clinicalUtilityDemonstrated: true, cutoffPrespecified: true, independentValidationSet: true,
};
const enrichment = {
  biomarkerName: 'EGFR', category: 'predictive', biomarkerPositivePrevalence: 0.3, negativesExpectedToBenefit: false,
  effectConcentratedInPositives: true, characterizeNegatives: false, validatedAssayAvailable: true,
};

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}
/** analytical's booleans and numbers sit in `inputs`. */
function evidenceChanged(overrides: Record<string, unknown>): never {
  return { ...analytical, inputs: { ...evidence, ...overrides } } as never;
}

type Compute = (input: never) => { inputStates: Record<string, unknown> };
const families: Array<{ tool: string; compute: Compute; input: object; flags: string[]; set: (o: Record<string, unknown>) => never; result: object }> = [
  { tool: 'classify_biomarker', compute: classifyBiomarker as Compute, input: classify, flags: FEATURES,
    set: o => changed(classify, o), result: { category: 'predictive', cdxLikely: true } },
  { tool: 'plan_biomarker_qualification', compute: planBiomarkerQualification as Compute, input: qualification,
    flags: ['crossProgramUse', 'isGenomic', 'consortiumSponsored', 'singleDrugOnly'], set: o => changed(qualification, o),
    result: { recommendedPathway: 'ddt_qualification', couImpactTier: 'moderate' } },
  { tool: 'design_cdx_codevelopment', compute: designCDxCodevelopment as Compute, input: cdx,
    flags: ['essentialForUse', 'usedClinicalTrialAssay', 'marketAssayDiffersFromCTA'], set: o => changed(cdx, o),
    result: { cdxVsComplementary: 'companion', devicePathway: 'pma', ctaBridgingRequired: true } },
  { tool: 'assess_biomarker_analytical_validation', compute: assessBiomarkerAnalyticalValidation as Compute, input: analytical,
    flags: ['interferenceTested', 'reportableRangeEstablished', 'robustnessDemonstrated', 'preanalyticalDocumented',
      'multiSiteReproducibility'], set: evidenceChanged, result: { quantitative: true, overallReadiness: 'gaps' } },
  { tool: 'assess_biomarker_clinical_validation', compute: assessBiomarkerClinicalValidation as Compute, input: clinical,
    flags: ['clinicalUtilityDemonstrated', 'cutoffPrespecified', 'independentValidationSet'], set: o => changed(clinical, o),
    result: { validityEstablished: true, clinicalSensitivity: 0.9, clinicalSpecificity: 0.9 } },
  { tool: 'plan_enrichment_strategy', compute: planEnrichmentStrategy as Compute, input: enrichment,
    flags: ['negativesExpectedToBenefit', 'effectConcentratedInPositives', 'characterizeNegatives', 'validatedAssayAvailable'],
    set: o => changed(enrichment, o), result: { enrichmentType: 'predictive', recommendedDesign: 'biomarker_positive_only' } },
];

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101, userId: 7 } as never));
}
async function refused(tool: string, input: object, code: string, field: string) {
  const out = await run(tool, input);
  expect(out, `${tool} ${field}`).toMatchObject({ status: 'needs_parameters', code, field });
  expect(out).not.toHaveProperty('basis');
}

describe('the six biomarker tools keep their stated results', () => {
  it.each(families)('$tool reaches its engine with a stated basis', async ({ tool, input, result }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', engine: 'deterministic', basis: 'stated', appliesTo: 'the inputs stated in this conversation', result,
    });
  });
});

describe.each(families)('$tool keeps each boolean answer as stated', ({ tool, compute, set, flags }) => {
  it.each(flags)('%s reads not_stated when omitted or null, and is refused when malformed', async field => {
    for (const absent of [undefined, null]) {
      expect(compute(set({ [field]: absent }))).toMatchObject({ inputStates: { [field]: 'not_stated' } });
    }
    for (const answer of [true, false]) {
      expect(compute(set({ [field]: answer }))).toMatchObject({ inputStates: { [field]: answer } });
    }
    for (const value of ['false', 'true', 0, 1]) await refused(tool, set({ [field]: value }), 'invalid_input', field);
  });
});

describe('a malformed enum, count, percentage or prevalence is refused by field, never read', () => {
  it.each([
    { tool: 'classify_biomarker', input: changed(classify, { assertedCategory: 'Predictive' }), field: 'assertedCategory' },
    { tool: 'classify_biomarker', input: changed(classify, { intendedUse: 'Patient selection' }), field: 'intendedUse' },
    { tool: 'plan_biomarker_qualification', input: changed(qualification, { category: 'Safety' }), field: 'category' },
    { tool: 'plan_biomarker_qualification', input: changed(qualification, { couImpact: 'High' }), field: 'couImpact' },
    { tool: 'design_cdx_codevelopment', input: changed(cdx, { assayModality: 'IHC' }), field: 'assayModality' },
    { tool: 'design_cdx_codevelopment', input: changed(cdx, { deviceRiskClass: 'Class III' }), field: 'deviceRiskClass' },
    { tool: 'design_cdx_codevelopment', input: changed(cdx, { therapeuticPhase: 'Phase 3' }), field: 'therapeuticPhase' },
    { tool: 'assess_biomarker_analytical_validation', input: changed(analytical, { intendedUseStakes: 'High' }), field: 'intendedUseStakes' },
    { tool: 'assess_biomarker_analytical_validation', input: changed(analytical, { quantitative: 'true' }), field: 'quantitative' },
    { tool: 'assess_biomarker_analytical_validation', input: evidenceChanged({ precisionCVPercent: '8' }), field: 'precisionCVPercent' },
    { tool: 'assess_biomarker_analytical_validation', input: evidenceChanged({ maxAcceptableCVPercent: 0 }), field: 'maxAcceptableCVPercent' },
    { tool: 'assess_biomarker_analytical_validation', input: evidenceChanged({ limitOfDetection: -1 }), field: 'limitOfDetection' },
    { tool: 'assess_biomarker_analytical_validation', input: changed(analytical, { quantitative: false, inputs: { positivePercentAgreement: 150, negativePercentAgreement: 95 } }), field: 'positivePercentAgreement' },
    { tool: 'assess_biomarker_clinical_validation', input: changed(clinical, { truePositives: '45' }), field: 'truePositives' },
    { tool: 'assess_biomarker_clinical_validation', input: changed(clinical, { falsePositives: 4.5 }), field: 'falsePositives' },
    { tool: 'assess_biomarker_clinical_validation', input: changed(clinical, { intendedUsePrevalence: '0.1' }), field: 'intendedUsePrevalence' },
    { tool: 'assess_biomarker_clinical_validation', input: changed(clinical, { intendedUsePrevalence: 1.5 }), field: 'intendedUsePrevalence' },
    { tool: 'plan_enrichment_strategy', input: changed(enrichment, { category: 'Predictive' }), field: 'category' },
    { tool: 'plan_enrichment_strategy', input: changed(enrichment, { biomarkerPositivePrevalence: 1.5 }), field: 'biomarkerPositivePrevalence' },
    { tool: 'plan_enrichment_strategy', input: changed(enrichment, { biomarkerPositivePrevalence: 0 }), field: 'biomarkerPositivePrevalence' },
    { tool: 'plan_enrichment_strategy', input: changed(enrichment, { biomarkerPositivePrevalence: '0.3' }), field: 'biomarkerPositivePrevalence' },
    { tool: 'plan_enrichment_strategy', input: changed(enrichment, { screeningPoolSize: 12.5 }), field: 'screeningPoolSize' },
  ].map((c, i) => ({ ...c, n: i + 1 })))('$tool refuses $field (case $n)', async ({ tool, input, field }) => {
    await refused(tool, input, 'invalid_input', field);
  });
});

describe('a required input that is not stated is asked for by name', () => {
  it.each([
    { tool: 'classify_biomarker', input: {}, field: 'biomarkerName' },
    { tool: 'plan_biomarker_qualification', input: { biomarkerName: 'KIM-1' }, field: 'category' },
    { tool: 'design_cdx_codevelopment', input: { therapeuticName: 'Drug X', biomarkerName: 'HER2' }, field: 'assayModality' },
    { tool: 'assess_biomarker_analytical_validation', input: { biomarkerName: 'B', assayModality: 'elisa', inputs: {} }, field: 'quantitative' },
    { tool: 'assess_biomarker_analytical_validation', input: { biomarkerName: 'B', assayModality: 'elisa', quantitative: true }, field: 'inputs' },
    { tool: 'assess_biomarker_clinical_validation', input: { biomarkerName: 'B', truePositives: 45, falseNegatives: 5, trueNegatives: 90 }, field: 'falsePositives' },
    { tool: 'plan_enrichment_strategy', input: { biomarkerName: 'EGFR', category: 'predictive' }, field: 'biomarkerPositivePrevalence' },
  ].map((c, i) => ({ ...c, n: i + 1 })))('$tool asks for $field (case $n)', async ({ tool, input, field }) => {
    await refused(tool, input, 'missing_input', field);
  });
});

describe('the six definitions say what an omitted fact means, within the trimmed length', () => {
  const def = (tool: string) => BIOMARKER_TOOLS.find(t => t.name === tool)!;
  const props = (tool: string): Record<string, { description: string }> => {
    const p = def(tool).input_schema.properties as Record<string, { description: string; properties?: object }>;
    return (tool === 'assess_biomarker_analytical_validation' ? p.inputs.properties : p) as Record<string, { description: string }>;
  };

  it.each(families)('$tool', ({ tool, flags }) => {
    expect(def(tool).description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    expect(def(tool).description).toMatch(/relay the validation error/);
    for (const field of flags) {
      expect(def(tool).input_schema.required).not.toContain(field);
      expect(props(tool)[field].description, field).toMatch(/Omitted or null stays not_stated/);
      expect(props(tool)[field].description, field).not.toMatch(/\(default|Default true/);
    }
  });

  it('requires quantitative, and names the inputs no function reads', () => {
    expect(def('assess_biomarker_analytical_validation').input_schema.required).toContain('quantitative');
    expect(props('classify_biomarker').diseaseContext.description).toMatch(/Not read/);
    expect(props('design_cdx_codevelopment').framework.description).toMatch(/Not read/);
    expect(props('assess_biomarker_analytical_validation').limitOfQuantitation.description).toMatch(/Not read/);
  });
});

describe('classify_biomarker infers a category only when no unstated feature could change it', () => {
  it('does not default a biomarker nobody described to prognostic', () => {
    const out = classifyBiomarker({ biomarkerName: 'X' });
    expect(out).toMatchObject({ category: null, categoryLabel: null, cdxLikely: null, supportedUses: [] });
    expect(out.candidateCategories).toHaveLength(7);
    expect(out.inferenceBasis).toMatch(/^Not decided: /);
    expect(out.inferenceBasis).not.toMatch(/defaulted/);
  });

  it('leaves a disease-confirming marker open while a higher-precedence feature is unstated', () => {
    const out = classifyBiomarker({ biomarkerName: 'HER2', confirmsDisease: true });
    expect(out.category).toBeNull();
    expect(out.candidateCategories).toEqual(expect.arrayContaining(['predictive', 'diagnostic', 'monitoring']));
  });

  it('names only the features whose answer could change it', () => {
    const out = classifyBiomarker({ biomarkerName: 'X', changesWithExposure: true });
    expect(out.inferenceBasis).toMatch(/predictsDifferentialTreatmentEffect, indicatesToxicity and measuredInUnaffectedIndividuals are not stated/);
    expect(out.inferenceBasis).not.toMatch(/confirmsDisease|measuredSerially/);
  });

  it('decides a category the stated features settle', () => {
    expect(classifyBiomarker({ biomarkerName: 'HER2', ...ALL_FALSE, confirmsDisease: true }).category).toBe('diagnostic');
    expect(classifyBiomarker({ biomarkerName: 'X', predictsDifferentialTreatmentEffect: true }).category).toBe('predictive');
  });

  it('with every feature stated false, is prognostic and flags an intended use that contradicts it', () => {
    const out = classifyBiomarker({ biomarkerName: 'X', ...ALL_FALSE, intendedUse: 'dose_selection' });
    expect(out.category).toBe('prognostic');
    expect(out.cautions.map(c => c.message).join(' ')).toMatch(/Reconcile the intended use/);
    expect(classifyBiomarker({ biomarkerName: 'X', ...ALL_FALSE, intendedUse: 'enrichment' }).category).toBe('prognostic');
  });

  it('says when an asserted predictive category has no stated interaction', () => {
    const out = classifyBiomarker({ biomarkerName: 'X', assertedCategory: 'predictive' });
    expect(out.cautions.map(c => c.message).join(' ')).toMatch(/predictsDifferentialTreatmentEffect is not stated/);
  });
});

describe('plan_biomarker_qualification chooses no pathway from unstated scope facts', () => {
  const base = { biomarkerName: 'KIM-1', category: 'safety' as const, proposedContextOfUse: 'Renal safety' };

  it('leaves the pathway not assessed and names the facts', () => {
    const out = planBiomarkerQualification(base);
    expect(out.recommendedPathway).toBe('not_assessed');
    expect(out.pathwayRationale).toMatch(/^Not assessed: singleDrugOnly, crossProgramUse and consortiumSponsored are not stated/);
    expect(planBiomarkerQualification({ ...base, crossProgramUse: true }).recommendedPathway).toBe('not_assessed');
  });

  it('keeps a pathway the stated facts settle', () => {
    expect(planBiomarkerQualification({ ...base, singleDrugOnly: false, crossProgramUse: true }).recommendedPathway).toBe('ddt_qualification');
    expect(planBiomarkerQualification({ ...base, singleDrugOnly: true }).recommendedPathway).toBe('drug_specific_submission');
    expect(planBiomarkerQualification({ ...base, crossProgramUse: false, consortiumSponsored: false }).recommendedPathway)
      .toBe('drug_specific_submission');
  });

  it('says when the impact tier was inferred, and when genomic status was not stated', () => {
    const messages = planBiomarkerQualification({ ...base, category: 'pharmacodynamic_response' }).findings.map(f => f.message).join(' ');
    expect(messages).toMatch(/COU impact tier inferred as LOW from category/);
    expect(messages).toMatch(/isGenomic is not stated/);
  });
});

describe('design_cdx_codevelopment decides no companion status, pathway or bridging from an unstated fact', () => {
  const base = { therapeuticName: 'Drug X', biomarkerName: 'HER2', assayModality: 'ihc' as const };

  it('leaves companion status, pathway and bridging undetermined when nothing decides them', () => {
    const out = designCDxCodevelopment(base);
    expect(out).toMatchObject({
      isCompanionDiagnostic: null, cdxVsComplementary: 'not_assessed', devicePathway: 'not_assessed',
      contemporaneousApprovalRequired: null, ctaBridgingRequired: null,
    });
    expect(out.ctaBridgingPlan).toMatch(/^Not assessed: usedClinicalTrialAssay and marketAssayDiffersFromCTA are not stated/);
  });

  it('says when the class was assumed, and reads a stated class alone', () => {
    const assumed = designCDxCodevelopment({ ...base, essentialForUse: true });
    expect(assumed.devicePathway).toBe('pma');
    expect(assumed.findings.map(f => f.message).join(' ')).toMatch(/Class III is assumed for a companion diagnostic/);
    expect(designCDxCodevelopment({ ...base, deviceRiskClass: 'II' })).toMatchObject({ devicePathway: '510k', cdxVsComplementary: 'not_assessed' });
  });

  it('does not call bridging required, or raise the filing finding, from an omitted difference', () => {
    const out = designCDxCodevelopment({ ...base, usedClinicalTrialAssay: true, therapeuticPhase: 'filed' });
    expect(out.ctaBridgingRequired).toBeNull();
    expect(out.findings.some(f => f.severity === 'critical')).toBe(false);
    expect(designCDxCodevelopment({ ...base, usedClinicalTrialAssay: false }).ctaBridgingRequired).toBe(false);
  });

  it('does not call a Phase 3 bridging study mandatory while the CTA enrollment is unstated', () => {
    const phase3 = { ...base, essentialForUse: true, therapeuticPhase: 'phase3' as const, marketAssayDiffersFromCTA: true };
    const messages = designCDxCodevelopment(phase3).findings.map(f => f.message).join(' ');
    expect(messages).toMatch(/usedClinicalTrialAssay is not stated/);
    expect(messages).not.toMatch(/bridging study is now mandatory/);
    expect(designCDxCodevelopment({ ...phase3, usedClinicalTrialAssay: true }).findings.map(f => f.message).join(' '))
      .toMatch(/bridging study is now mandatory/);
  });
});

describe('assess_biomarker_analytical_validation passes nothing an unstated stakes level could fail', () => {
  const qa = (inputs: object, extra: object = {}) =>
    assessBiomarkerAnalyticalValidation({ biomarkerName: 'B', assayModality: 'elisa', quantitative: true, inputs, ...extra } as never);
  const precision = (out: ReturnType<typeof qa>) => out.parameterAssessments.find(p => p.parameter.startsWith('Precision'))!;

  it('leaves a CV between the two defaults not evaluated, and readiness not assessed', () => {
    const out = qa({ precisionCVPercent: 12 });
    expect(precision(out).status).toBe('not_evaluated');
    expect(out.overallReadiness).toBe('not_assessed');
  });

  it('decides a CV both defaults agree on, and says which limit was used', () => {
    expect(precision(qa({ precisionCVPercent: 8 }))).toMatchObject({ status: 'pass', detail: expect.stringMatching(/the defaults/) });
    expect(qa({ precisionCVPercent: 20 }).overallReadiness).toBe('not_ready');
    expect(precision(qa({ precisionCVPercent: 12 }, { intendedUseStakes: 'moderate' }))).toMatchObject({
      status: 'pass', detail: expect.stringMatching(/default for low- or moderate-stakes use/) });
  });

  it('does not say multi-site reproducibility was not demonstrated when it was not stated', () => {
    const messages = qa({}, { intendedUseStakes: 'high' }).findings.map(f => f.message).join(' ');
    expect(messages).toMatch(/whether multi-site reproducibility was demonstrated is not stated/);
    expect(messages).not.toMatch(/not demonstrated\./);
    expect(qa({}, { intendedUseStakes: 'high' }).outstandingRequirements)
      .toContain('multiSiteReproducibility not stated. Multi-site reproducibility study (required for CDx-level assays).');
  });

  it('names an evidence fact left out', () => {
    const out = qa({});
    expect(out.parameterAssessments.find(p => p.parameter.startsWith('Analytical specificity'))!.detail).toMatch(/^interferenceTested not stated\. /);
    expect(out.outstandingRequirements).toContain('interferenceTested not stated. Interference / cross-reactivity study (CLSI EP07).');
    expect(out.outstandingRequirements).not.toContain('Interference / cross-reactivity study (CLSI EP07).');
    expect(qa({ interferenceTested: false }).outstandingRequirements).toContain('Interference / cross-reactivity study (CLSI EP07).');
  });
});

describe('assess_biomarker_clinical_validation leaves validity open while an unstated fact could establish it', () => {
  it('is null, not false, with independence unstated, and says so', () => {
    const out = assessBiomarkerClinicalValidation(changed(clinical, { independentValidationSet: undefined }));
    expect(out.validityEstablished).toBeNull();
    const messages = out.findings.map(f => f.message).join(' ');
    expect(messages).toMatch(/independent dataset .* is not stated/);
    expect(messages).not.toMatch(/Performance not confirmed/);
  });

  it('keeps a stated false, and inadequate accuracy no answer could repair', () => {
    expect(assessBiomarkerClinicalValidation(changed(clinical, { independentValidationSet: false })).validityEstablished).toBe(false);
    expect(assessBiomarkerClinicalValidation(changed(clinical, { truePositives: 20, falseNegatives: 30, independentValidationSet: undefined }))
      .validityEstablished).toBe(false);
  });

  it('does not say utility is not demonstrated when it was not stated', () => {
    const messages = assessBiomarkerClinicalValidation(changed(clinical, { clinicalUtilityDemonstrated: undefined })).findings
      .map(f => f.message).join(' ');
    expect(messages).toMatch(/Whether clinical utility is demonstrated is not stated/);
    expect(messages).not.toMatch(/Utility is not yet demonstrated/);
  });
});

describe('plan_enrichment_strategy chooses no predictive design from unstated facts', () => {
  const base = { biomarkerName: 'EGFR', category: 'predictive' as const, biomarkerPositivePrevalence: 0.3 };

  it('leaves the design not assessed and names the facts', () => {
    const out = planEnrichmentStrategy(base);
    expect(out.recommendedDesign).toBe('not_assessed');
    expect(out.recommendedDesignRationale).toMatch(
      /^Not assessed: negativesExpectedToBenefit, characterizeNegatives and effectConcentratedInPositives are not stated/);
  });

  it('keeps a design every answer gives', () => {
    expect(planEnrichmentStrategy({ ...base, negativesExpectedToBenefit: true }).recommendedDesign).toBe('stratified');
    expect(planEnrichmentStrategy({ ...base, characterizeNegatives: false, effectConcentratedInPositives: false })).toMatchObject({
      recommendedDesign: 'stratified', recommendedDesignRationale: expect.stringMatching(/^Predictive hypothesis not yet firmly established/) });
    expect(planEnrichmentStrategy({ ...base, category: 'prognostic' }).recommendedDesign).toBe('all_comers');
  });

  it('names the design facts it was not given when every answer gives the design', () => {
    expect(planEnrichmentStrategy({ ...base, characterizeNegatives: false, effectConcentratedInPositives: false }).recommendedDesignRationale)
      .toMatch(/ negativesExpectedToBenefit is not stated; every answer gives this design\.$/);
    expect(planEnrichmentStrategy(enrichment as never).recommendedDesignRationale).not.toMatch(/not stated/);
  });

  it('does not say no validated assay was reported when it was not stated', () => {
    const messages = planEnrichmentStrategy(changed(enrichment, { validatedAssayAvailable: undefined })).findings.map(f => f.message).join(' ');
    expect(messages).toMatch(/whether one exists \(validatedAssayAvailable\) is not stated/);
    expect(messages).not.toMatch(/No validated assay reported/);
  });
});
