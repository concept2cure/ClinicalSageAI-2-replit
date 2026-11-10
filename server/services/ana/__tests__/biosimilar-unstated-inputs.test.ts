/**
 * S5d: the biosimilar worksheets refuse a required or malformed input by field, decide no extrapolation or
 * interchangeability an unstated fact could change, and say when they fall back to a full list.
 *
 * What the code did before this change: no function checked its input. assess_analytical_similarity_biosimilar({})
 * and { productType: 'Insulin' } were given the mAb panel; a CQA or method list that was not a list of text crashed;
 * a requested CQA list that matched nothing silently returned the whole panel. design_biosimilar_clinical({}) planned
 * a healthy-volunteer study, and 'High' risk or PK complexity read as not high. assess_indication_extrapolation read a
 * mechanism or target not stated for either indication as 'unknown', and two unknowns compared equal: with nothing
 * stated every indication was likely_extrapolable, and an omitted target map made every target the same. A list of
 * indications given as text was assessed letter by letter. assess_interchangeability read an omitted requirement as
 * not met, 'false' as met (overallEligible 'false' with "All requirements appear met"), and crashed without
 * dosingFrequency. plan_biosimilar_ip_strategy read an unknown market ('United States') as both and printed
 * "(undefined)" for a missing name. assess_biosimilar_cmc returned no expression-system guidance for 'cho' and read
 * 'Commercial' as a non-commercial scale.
 */
import { describe, expect, it } from 'vitest';
import {
  assessAnalyticalSimilarity, assessExtrapolationOfIndications, assessInterchangeability,
} from '../../biosimilar/biosimilar-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { BIOSIMILAR_TOOLS } from '../biosimilarTools';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions';
import { selectToolsForTurn } from '../tool-selection';

/** ai-gateway/gateway.ts trims a longer tool description to this many characters for OpenAI-compatible providers. */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const analytical = { productType: 'adalimumab_biosimilar', criticalQualityAttributes: ['afucosylation'], analyticalMethodsUsed: ['HILIC'] };
const clinical = {
  productType: 'trastuzumab_biosimilar', referenceProduct: 'Herceptin', indications: ['HER2+ breast cancer'],
  mechanismOfAction: 'ADCC_dependent', pkComplexity: 'moderate', immunogenicityRisk: 'low',
};
const extrapolation = {
  referenceProductIndications: ['RA', 'psoriasis', 'CD'], clinicalStudyIndication: 'RA',
  mechanismOfActionPerIndication: { RA: 'TNF neutralization', psoriasis: 'TNF neutralization', CD: 'TNF neutralization + reverse signaling' },
  targetReceptorPerIndication: { RA: 'TNF-alpha', psoriasis: 'TNF-alpha', CD: 'TNF-alpha' },
};
const interchangeability = { biosimilarityEstablished: true, switchingStudyDataAvailable: true, productType: 'insulin', dosingFrequency: 'daily' };
const ip = { referenceProductName: 'Humira', patentExpiryDates: { substance: '2016-12-31' }, market: 'US' };
const cmc = { referenceProduct: 'Herceptin', expressionSystem: 'CHO', productionScale: 'commercial', analyticalCapability: 'advanced' };

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

const stated = [
  { tool: 'assess_analytical_similarity_biosimilar', input: analytical,
    result: { productType: 'adalimumab_biosimilar', referenceLotRequirements: { fdaMinimum: 10, emaMinimum: 3 } } },
  { tool: 'design_biosimilar_clinical', input: clinical,
    result: { productType: 'trastuzumab_biosimilar', referenceProduct: 'Herceptin', comparativeClinicalStudy: { primaryEndpoint: 'ORR at Week 24 (metastatic) or pCR (neoadjuvant)' } } },
  { tool: 'assess_indication_extrapolation', input: extrapolation,
    result: { extrapolationAssessments: [{ indication: 'psoriasis', feasibility: 'likely_extrapolable' }, { indication: 'CD', feasibility: 'conditional' }] } },
  { tool: 'assess_interchangeability', input: interchangeability, result: { requirementsAssessment: { overallEligible: true } } },
  { tool: 'plan_biosimilar_ip_strategy', input: ip, result: { market: 'US', euExclusivity: [] } },
  { tool: 'assess_biosimilar_cmc', input: cmc, result: { referenceProduct: 'Herceptin', expressionSystemGuidance: { system: 'CHO' } } },
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

describe('the six biosimilar tools keep their stated results', () => {
  it.each(stated)('$tool reaches its engine with a stated basis', async ({ tool, input, result }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', engine: 'deterministic', basis: 'stated', appliesTo: 'the inputs stated in this conversation', result,
    });
  });
});

describe('assess_interchangeability keeps each boolean answer as stated', () => {
  it.each(['biosimilarityEstablished', 'switchingStudyDataAvailable'])('%s reads not_stated when omitted or null, and is refused when malformed', async field => {
    for (const absent of [undefined, null]) {
      expect(assessInterchangeability(changed(interchangeability, { [field]: absent }))).toMatchObject({ inputStates: { [field]: 'not_stated' } });
    }
    for (const answer of [true, false]) {
      expect(assessInterchangeability(changed(interchangeability, { [field]: answer }))).toMatchObject({ inputStates: { [field]: answer } });
    }
    for (const value of ['false', 'true', 0, 1]) await refused('assess_interchangeability', changed(interchangeability, { [field]: value }), 'invalid_input', field);
  });
});

describe('a malformed enum, list, map or text is refused by field, never read', () => {
  it.each([
    { tool: 'assess_analytical_similarity_biosimilar', input: changed(analytical, { productType: 'Insulin' }), field: 'productType' },
    { tool: 'assess_analytical_similarity_biosimilar', input: changed(analytical, { criticalQualityAttributes: 'afucosylation' }), field: 'criticalQualityAttributes' },
    { tool: 'assess_analytical_similarity_biosimilar', input: changed(analytical, { analyticalMethodsUsed: [5] }), field: 'analyticalMethodsUsed' },
    { tool: 'design_biosimilar_clinical', input: changed(clinical, { productType: 'Adalimumab' }), field: 'productType' },
    { tool: 'design_biosimilar_clinical', input: changed(clinical, { referenceProduct: 5 }), field: 'referenceProduct' },
    { tool: 'design_biosimilar_clinical', input: changed(clinical, { pkComplexity: 'High' }), field: 'pkComplexity' },
    { tool: 'design_biosimilar_clinical', input: changed(clinical, { immunogenicityRisk: 'High' }), field: 'immunogenicityRisk' },
    { tool: 'assess_indication_extrapolation', input: changed(extrapolation, { referenceProductIndications: 'RA, CD' }), field: 'referenceProductIndications' },
    { tool: 'assess_indication_extrapolation', input: changed(extrapolation, { mechanismOfActionPerIndication: 'TNF' }), field: 'mechanismOfActionPerIndication' },
    { tool: 'assess_indication_extrapolation', input: changed(extrapolation, { mechanismOfActionPerIndication: { RA: 5 } }), field: 'mechanismOfActionPerIndication' },
    { tool: 'assess_indication_extrapolation', input: changed(extrapolation, { targetReceptorPerIndication: ['TNF-alpha'] }), field: 'targetReceptorPerIndication' },
    { tool: 'assess_indication_extrapolation', input: changed(extrapolation, { clinicalStudyIndication: 5 }), field: 'clinicalStudyIndication' },
    { tool: 'assess_interchangeability', input: changed(interchangeability, { dosingFrequency: 2 }), field: 'dosingFrequency' },
    { tool: 'plan_biosimilar_ip_strategy', input: changed(ip, { market: 'United States' }), field: 'market' },
    { tool: 'plan_biosimilar_ip_strategy', input: changed(ip, { referenceProductName: 5 }), field: 'referenceProductName' },
    { tool: 'assess_biosimilar_cmc', input: changed(cmc, { expressionSystem: 'cho' }), field: 'expressionSystem' },
    { tool: 'assess_biosimilar_cmc', input: changed(cmc, { productionScale: 'Commercial' }), field: 'productionScale' },
    { tool: 'assess_biosimilar_cmc', input: changed(cmc, { analyticalCapability: 'Advanced' }), field: 'analyticalCapability' },
  ].map((c, i) => ({ ...c, n: i + 1 })))('$tool refuses $field (case $n)', async ({ tool, input, field }) => {
    await refused(tool, input, 'invalid_input', field);
  });
});

describe('a required input that is not stated is asked for by name', () => {
  it.each([
    { tool: 'assess_analytical_similarity_biosimilar', input: {}, field: 'productType' },
    { tool: 'design_biosimilar_clinical', input: { productType: 'mAb' }, field: 'referenceProduct' },
    { tool: 'assess_indication_extrapolation', input: { referenceProductIndications: ['RA'], mechanismOfActionPerIndication: {} }, field: 'clinicalStudyIndication' },
    { tool: 'assess_interchangeability', input: {}, field: 'dosingFrequency' },
    { tool: 'plan_biosimilar_ip_strategy', input: { market: 'US' }, field: 'referenceProductName' },
    { tool: 'assess_biosimilar_cmc', input: { referenceProduct: 'Herceptin' }, field: 'expressionSystem' },
  ].map((c, i) => ({ ...c, n: i + 1 })))('$tool asks for $field (case $n)', async ({ tool, input, field }) => {
    await refused(tool, input, 'missing_input', field);
  });
});

describe('assess_indication_extrapolation compares only what was stated for both indications', () => {
  it('leaves an indication with nothing stated not assessed, and names the facts', () => {
    const out = assessExtrapolationOfIndications({ referenceProductIndications: ['RA', 'psoriasis'], mechanismOfActionPerIndication: {}, clinicalStudyIndication: 'RA' } as never);
    expect(out.extrapolationAssessments).toMatchObject([{ indication: 'psoriasis', feasibility: 'not_assessed', moaInIndication: null }]);
    expect(out.extrapolationAssessments[0].justificationRequirements[0]).toMatch(
      /^Not assessed: the mechanism of action \(mechanismOfActionPerIndication\) and the target\/receptor \(targetReceptorPerIndication\) of psoriasis or of RA are not stated/);
  });
  it('does not read an omitted target as the same target', () => {
    const out = assessExtrapolationOfIndications(changed(extrapolation, { targetReceptorPerIndication: undefined }));
    expect(out.extrapolationAssessments.map(a => a.feasibility)).toEqual(['not_assessed', 'not_assessed']);
    expect(out.extrapolationAssessments[0].justificationRequirements[0]).toMatch(/feasibility is likely_extrapolable and conditional\.$/);
    expect(out.extrapolationAssessments[1].justificationRequirements[0]).toMatch(/feasibility is conditional and additional_data_needed\.$/);
  });
});

describe('assess_interchangeability calls nothing met or unmet that was not stated', () => {
  it('leaves eligibility null while a requirement is unstated and none is false', () => {
    const out = assessInterchangeability({ dosingFrequency: 'weekly' } as never).requirementsAssessment;
    expect(out).toMatchObject({ biosimilarityEstablished: null, switchingSafetyDemonstrated: null, overallEligible: null });
    expect(out.missingRequirements.join(' ')).toMatch(/biosimilarityEstablished is not stated/);
    expect(assessInterchangeability({ biosimilarityEstablished: true, dosingFrequency: 'weekly' } as never).requirementsAssessment.overallEligible).toBeNull();
  });
  it('is false once a requirement is stated false, and says where the clinical-result answer comes from', () => {
    expect(assessInterchangeability({ switchingStudyDataAvailable: false, dosingFrequency: 'weekly' } as never).requirementsAssessment.overallEligible).toBe(false);
    expect(assessInterchangeability(changed(interchangeability, {})).requirementsAssessment)
      .toMatchObject({ expectedSameClinicalResultBasis: expect.stringMatching(/taken from biosimilarityEstablished/) });
  });
});

describe('assess_analytical_similarity_biosimilar says when it falls back to a full list', () => {
  it('names an unmatched attribute or method list', () => {
    expect(assessAnalyticalSimilarity({ productType: 'insulin', criticalQualityAttributes: ['xyz'] } as never))
      .toMatchObject({ selectionNotes: [expect.stringMatching(/None of criticalQualityAttributes matched the insulin panel/)] });
    expect(assessAnalyticalSimilarity({ productType: 'insulin', analyticalMethodsUsed: ['xyz'] } as never))
      .toMatchObject({ selectionNotes: [expect.stringMatching(/none of analyticalMethodsUsed matched/)] });
    expect(assessAnalyticalSimilarity({ productType: 'insulin' } as never)).toMatchObject({ selectionNotes: [] });
  });
});

describe('the six definitions say what an omitted fact means, within the trimmed length', () => {
  const def = (tool: string) => BIOSIMILAR_TOOLS.find(t => t.name === tool)!;
  const props = (tool: string) => def(tool).input_schema.properties as Record<string, { description: string }>;

  it.each(stated)('$tool', ({ tool }) => {
    expect(def(tool).description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    expect(def(tool).description).toMatch(/relay the validation error/);
  });

  it('keeps the interchangeability requirements optional and three-valued, and names the inputs no function reads', () => {
    for (const field of ['biosimilarityEstablished', 'switchingStudyDataAvailable']) {
      expect(def('assess_interchangeability').input_schema.required).not.toContain(field);
      expect(props('assess_interchangeability')[field].description).toMatch(/Omitted or null stays not_stated/);
    }
    for (const [tool, field] of [
      ['design_biosimilar_clinical', 'mechanismOfAction'], ['design_biosimilar_clinical', 'indications'],
      ['assess_interchangeability', 'productType'], ['plan_biosimilar_ip_strategy', 'patentExpiryDates'],
      ['plan_biosimilar_ip_strategy', 'biosimilarExclusivityStatus'],
    ]) {
      expect(props(tool)[field].description, field).toMatch(/Not read/);
      expect(def(tool).input_schema.required, field).not.toContain(field);
    }
  });

  it.each([
    ['assess_analytical_similarity_biosimilar', 'Assign CQA tiers for our adalimumab biosimilar analytical similarity'],
    ['design_biosimilar_clinical', 'Design the clinical program for our trastuzumab biosimilar'],
    ['assess_indication_extrapolation', 'Justify extrapolation of indications for our infliximab biosimilar'],
    ['assess_interchangeability', 'Do we need a switching study for interchangeability?'],
    ['plan_biosimilar_ip_strategy', 'Walk me through the BPCIA patent dance for our Humira biosimilar'],
    ['assess_biosimilar_cmc', 'Plan the CMC development strategy for a biosimilar of Herceptin'],
  ])('keeps %s among the tools selected for "%s"', (tool, prompt) => {
    expect(selectToolsForTurn(ALL_ANA_TOOLS, prompt, { maxTools: 50 }).map(t => t.name)).toContain(tool);
  });
});
