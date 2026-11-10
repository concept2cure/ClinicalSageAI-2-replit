/**
 * S5d: the immunogenicity worksheets report every true/false input as true, false or not_stated, say what an
 * unstated or inferred input leaves, and refuse a malformed value by field.
 *
 * What the code did before this change: the 2026-10-15 sweep had already left an unstated risk factor, clinical-
 * impact domain, NAb deciding fact, sampling driver or comparability trigger undetermined, but no result said which
 * true/false inputs were stated. design_ada_assay_strategy read highSolubleTarget and isMonoclonalAntibody by
 * truthiness ('false' read as true), did not check productType ({} and 'Humanized mAb' were served), described an
 * unknown preferredPlatform ('elisa') with bridging ECL's strengths, printed any sensitivity target ('50', -5) and
 * used 100 ng/mL without saying it was not stated, and said nothing of an unstated soluble target or of a mAb
 * status it inferred. classify_immunogenicity_clinical_impact read persistentADA, highTiter and
 * lifeThreateningIndication by truthiness and said nothing of an unstated life-threatening indication.
 * design_nab_assay inferred actsThroughCellReceptor from mechanismClass without saying so (a ligand neutralizer got
 * a ligand-binding format on an inferred false). assess_immunogenicity_risk wrote the redundant-counterpart concern
 * when the redundancy was not stated.
 */
import { describe, expect, it } from 'vitest';
import {
  assessImmunogenicityRisk, designADAAssayStrategy, classifyImmunogenicityClinicalImpact, designNAbAssay,
  planImmunogenicitySampling, assessImmunogenicityComparability,
} from '../../immunogenicity/immunogenicity-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { IMMUNOGENICITY_TOOLS } from '../immunogenicityTools';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions';
import { selectToolsForTurn } from '../tool-selection';

/** ai-gateway/gateway.ts trims a longer tool description to this many characters for OpenAI-compatible providers. */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const risk = {
  productType: 'human_recombinant', hasEndogenousCounterpart: false, aggregationLevel: 'low', glycosylation: 'human_like',
  hasImmunogenicImpurities: false, formulationRisk: false, route: 'intravenous', doseFrequency: 'intermittent',
  immuneStatus: 'immunocompetent', concomitantImmunosuppression: false,
};
const ada = {
  productType: 'humanized_mab', expectedCirculatingDrug_ug_per_mL: 50, highSolubleTarget: true, isMonoclonalAntibody: true,
  preferredPlatform: 'bridging_ECL', targetSensitivity_ng_per_mL: 50,
};
const impact = {
  pkImpact: true, exposureReductionFraction: 0.3, neutralizingEfficacyLoss: true, hypersensitivity: true, igeMediated: false,
  endogenousCrossReactivity: false, endogenousLifeSustaining: false, persistentADA: true, highTiter: true,
  lifeThreateningIndication: false,
};
const nab = { mechanismClass: 'receptor_agonist', actsThroughCellReceptor: true, cellBasedFeasible: true, endogenousNonRedundant: false };
const sampling = {
  halfLife_days: 14, riskTier: 'moderate', doseFrequency: 'chronic_weekly', treatmentDuration_weeks: 52,
  endogenousNonRedundant: false, drawVolume_mL: 5,
};
const comparability = {
  context: 'manufacturing_change', analyticalComparable: true, affectsAggregation: false, affectsGlycosylation: false,
  affectsFormulation: false, affectsImpurities: false, productRiskTier: 'low', comparativeClinicalStudyPlanned: false,
};

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

type Compute = (input: never) => { inputStates: Record<string, unknown> };
const families: Array<{ tool: string; compute: Compute; input: object; flags: string[]; required?: string[]; result: object }> = [
  { tool: 'assess_immunogenicity_risk', compute: assessImmunogenicityRisk as Compute, input: risk,
    flags: ['hasEndogenousCounterpart', 'endogenousNonRedundant', 'hasImmunogenicImpurities', 'formulationRisk', 'concomitantImmunosuppression'],
    result: { overallTier: 'low', riskScore: 18 } },
  { tool: 'design_ada_assay_strategy', compute: designADAAssayStrategy as Compute, input: ada,
    flags: ['highSolubleTarget', 'isMonoclonalAntibody'], result: { recommendedPlatform: 'bridging_ECL', targetSensitivity_ng_per_mL: 50 } },
  { tool: 'classify_immunogenicity_clinical_impact', compute: classifyImmunogenicityClinicalImpact as Compute, input: impact,
    flags: ['pkImpact', 'neutralizingEfficacyLoss', 'hypersensitivity', 'igeMediated', 'endogenousCrossReactivity',
      'endogenousLifeSustaining', 'persistentADA', 'highTiter', 'lifeThreateningIndication'],
    result: { overallSeverity: 'high', notAssessed: [] } },
  { tool: 'design_nab_assay', compute: designNAbAssay as Compute, input: nab,
    flags: ['actsThroughCellReceptor', 'cellBasedFeasible', 'endogenousNonRedundant'],
    result: { recommendedFormat: 'cell_based', cellBasedRequired: true } },
  { tool: 'plan_immunogenicity_sampling', compute: planImmunogenicitySampling as Compute, input: sampling,
    flags: [], required: ['endogenousNonRedundant'], result: { washout_days: 70, totalNominalDraws: 13, totalBloodVolume_mL: 65 } },
  { tool: 'assess_immunogenicity_comparability', compute: assessImmunogenicityComparability as Compute, input: comparability,
    flags: ['analyticalComparable', 'affectsAggregation', 'affectsGlycosylation', 'affectsFormulation', 'affectsImpurities',
      'comparativeClinicalStudyPlanned'],
    result: { changeImpact: 'minor', clinicalImmunogenicityStudyRequired: false } },
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

describe('the six immunogenicity tools keep their stated results', () => {
  it.each(families)('$tool reaches its engine with a stated basis', async ({ tool, input, result }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', engine: 'deterministic', basis: 'stated', appliesTo: 'the inputs stated in this conversation', result,
    });
  });
});

describe.each(families.filter(f => f.flags.length > 0))('$tool keeps each boolean answer as stated', ({ tool, compute, input, flags }) => {
  it.each(flags)('%s reads not_stated when omitted or null, and is refused when malformed', async field => {
    for (const absent of [undefined, null]) {
      expect(compute(changed(input, { [field]: absent }))).toMatchObject({ inputStates: { [field]: 'not_stated' } });
    }
    for (const answer of [true, false]) {
      expect(compute(changed(input, { [field]: answer }))).toMatchObject({ inputStates: { [field]: answer } });
    }
    for (const value of ['false', 'true', 0, 1]) await refused(tool, changed(input, { [field]: value }), 'invalid_input', field);
  });
});

describe('plan_immunogenicity_sampling reports its required boolean', () => {
  it('keeps the stated answer and refuses an omitted or malformed one', async () => {
    for (const answer of [true, false]) {
      expect(planImmunogenicitySampling(changed(sampling, { endogenousNonRedundant: answer })).inputStates)
        .toEqual({ endogenousNonRedundant: answer });
    }
    await refused('plan_immunogenicity_sampling', changed(sampling, { endogenousNonRedundant: undefined }), 'missing_input', 'endogenousNonRedundant');
    await refused('plan_immunogenicity_sampling', changed(sampling, { endogenousNonRedundant: 'false' }), 'invalid_input', 'endogenousNonRedundant');
  });
});

describe('design_ada_assay_strategy refuses what it cannot read, by field', () => {
  it.each([
    { input: changed(ada, { productType: 'Humanized mAb' }), field: 'productType' },
    { input: changed(ada, { preferredPlatform: 'elisa' }), field: 'preferredPlatform' },
    { input: changed(ada, { targetSensitivity_ng_per_mL: '50' }), field: 'targetSensitivity_ng_per_mL' },
    { input: changed(ada, { targetSensitivity_ng_per_mL: -5 }), field: 'targetSensitivity_ng_per_mL' },
    { input: changed(ada, { targetSensitivity_ng_per_mL: 0 }), field: 'targetSensitivity_ng_per_mL' },
  ].map((c, i) => ({ ...c, n: i + 1 })))('refuses $field (case $n)', async ({ input, field }) => {
    await refused('design_ada_assay_strategy', input, 'invalid_input', field);
  });

  it('asks for a missing productType by name', async () => {
    await refused('design_ada_assay_strategy', {}, 'missing_input', 'productType');
  });
});

describe('design_ada_assay_strategy says what an unstated or inferred input leaves', () => {
  it('names an unstated soluble target and an inferred mAb status', () => {
    const out = designADAAssayStrategy({ productType: 'fusion_protein' } as never);
    expect(out.platformRationale).toMatch(/Whether a high soluble target or shed receptor is expected \(highSolubleTarget\) is not stated/);
    expect(out.platformRationale).toMatch(/isMonoclonalAntibody is not stated; it is taken as false from productType fusion_protein\./);
    expect(out.platformRationale).not.toMatch(/For a monoclonal antibody/);
  });

  it('says the sensitivity target was not stated, and uses a stated one', () => {
    expect(designADAAssayStrategy({ productType: 'peptide' } as never).sensitivityStatement).toMatch(/No target was stated/);
    expect(designADAAssayStrategy(changed(ada, {})).sensitivityStatement).not.toMatch(/No target was stated/);
  });

  it('keeps the stated soluble-target and mAb answers', () => {
    const stated = designADAAssayStrategy(changed(ada, {}));
    expect(stated.platformRationale).toMatch(/acid-dissociation sample pretreatment/);
    expect(stated.platformRationale).toMatch(/For a monoclonal antibody/);
    const none = designADAAssayStrategy(changed(ada, { highSolubleTarget: false, isMonoclonalAntibody: false }));
    expect(none.platformRationale).not.toMatch(/acid-dissociation|monoclonal antibody|not stated/);
  });
});

describe('classify_immunogenicity_clinical_impact names an unstated life-threatening indication', () => {
  it('adds a monitoring line that names it, and none when it is stated false', () => {
    const omitted = classifyImmunogenicityClinicalImpact(changed(impact, { lifeThreateningIndication: undefined }));
    expect(omitted.monitoringRecommendations.join(' ')).toMatch(/lifeThreateningIndication\) is not stated/);
    expect(classifyImmunogenicityClinicalImpact(changed(impact, {})).monitoringRecommendations.join(' '))
      .not.toMatch(/life-threatening/);
    expect(classifyImmunogenicityClinicalImpact(changed(impact, { lifeThreateningIndication: true })).monitoringRecommendations.join(' '))
      .toMatch(/For a life-threatening indication/);
  });
  it('does not weigh efficacy loss as tolerable while the severity is undetermined and could be critical', () => {
    // igeMediated left out with hypersensitivity: the severity is high or critical, and the trunk line is withheld at critical.
    const out = classifyImmunogenicityClinicalImpact(changed(impact, { igeMediated: undefined, lifeThreateningIndication: true }));
    expect(out.overallSeverity).toBe('undetermined');
    expect(out.monitoringRecommendations.join(' ')).not.toMatch(/loss of efficacy may be tolerable/);
    expect(out.monitoringRecommendations.join(' ')).toMatch(/once every domain is graded/);
  });
});

describe('design_nab_assay says when the receptor fact was inferred', () => {
  it('names the inference where it decides the format', () => {
    const out = designNAbAssay({ mechanismClass: 'ligand_neutralizer', endogenousNonRedundant: false } as never);
    expect(out.recommendedFormat).toBe('competitive_ligand_binding');
    expect(out.formatRationale).toMatch(/actsThroughCellReceptor is not stated; it is taken as false from mechanismClass ligand_neutralizer\./);
    expect(designNAbAssay(changed(nab, {})).formatRationale).not.toMatch(/not stated/);
    expect(designNAbAssay({ mechanismClass: 'receptor_agonist', cellBasedFeasible: true } as never).formatRationale).not.toMatch(/not stated/);
  });
});

describe('assess_immunogenicity_risk does not call an unstated redundancy redundant', () => {
  it('names the redundancy fact in the counterpart concern', () => {
    const out = assessImmunogenicityRisk(changed(risk, { hasEndogenousCounterpart: true }));
    expect(out.keyConcerns.join(' ')).toMatch(/Whether the counterpart is non-redundant \(endogenousNonRedundant\) is not stated/);
    expect(assessImmunogenicityRisk(changed(risk, { hasEndogenousCounterpart: true, endogenousNonRedundant: false })).keyConcerns.join(' '))
      .not.toMatch(/not stated/);
  });
});

describe('the six definitions say what an omitted fact means, within the trimmed length', () => {
  const def = (tool: string) => IMMUNOGENICITY_TOOLS.find(t => t.name === tool)!;
  const props = (tool: string) => def(tool).input_schema.properties as Record<string, { description: string }>;

  it.each(families)('$tool', ({ tool, flags }) => {
    expect(def(tool).description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    expect(def(tool).description).toMatch(/relay the validation error/);
    for (const field of flags) {
      expect(def(tool).input_schema.required).not.toContain(field);
      expect(props(tool)[field].description, field).toMatch(/omitted or null stays not_stated/i);
      expect(props(tool)[field].description, field).not.toMatch(/\(default|Default true/);
    }
  });

  it('names the input no function reads, and the sensitivity it uses when none is stated', () => {
    expect(props('design_ada_assay_strategy').phase.description).toMatch(/Not read/);
    expect(props('design_ada_assay_strategy').targetSensitivity_ng_per_mL.description).not.toMatch(/Default 100/);
  });

  it.each([
    ['assess_immunogenicity_risk', 'How immunogenic is our humanized mAb likely to be?'],
    ['design_ada_assay_strategy', 'Design an ADA assay strategy with screening and confirmatory cut points'],
    ['classify_immunogenicity_clinical_impact', 'ADA are causing loss of efficacy and infusion reactions; grade the clinical impact'],
    ['design_nab_assay', 'Should our neutralizing antibody assay be cell-based or competitive ligand binding?'],
    ['plan_immunogenicity_sampling', 'Build an ADA sampling schedule for a 52-week weekly dosing study'],
    ['assess_immunogenicity_comparability', 'Do we need a clinical immunogenicity study after this manufacturing change?'],
  ])('keeps %s among the tools selected for "%s"', (tool, prompt) => {
    expect(selectToolsForTurn(ALL_ANA_TOOLS, prompt, { maxTools: 50 }).map(t => t.name)).toContain(tool);
  });
});
