/**
 * S5b: the digital-health worksheets keep an unanswered fact not_stated, decide nothing an answer could change, and
 * refuse a malformed value by field.
 *
 * What the code did before this change: classify_samd read an omitted meetsSaMDDefinition and generalPurposePlatform
 * as true ("Default true"), and a situation of 'Critical' matched no cell and fell back to Category I.
 * assess_ai_ml_device read an omitted transparency, representativeness, external-validation or monitoring fact as
 * passed ("Transparency documentation is provided."), an omitted plannedPostMarketModifications as "PCCP OPTIONAL",
 * and 'Locked' as hybrid. design_pccp crashed on a list that was not an array, wrote "No planned modification fits"
 * for an empty one, put a 'Population-expansion' type within the envelope, and said nothing of an omitted scope
 * fact. assess_gmlp scored a principle not assessed 0, so nine conformant and one left out scored 90 and "gap", and
 * dropped a principle of '3' or 11. design_samd_clinical_validation read an omitted prospectiveDataPlanned as true
 * ("Prospective data collection is planned"), an omitted reference standard as available, an omitted isAIML as
 * false (no CE-08) and an omitted autonomy as human-in-the-loop. design_pccp and assess_device_cybersecurity crashed on
 * a deviceName that was not text. assess_device_cybersecurity (S3, kept) added no data row for an
 * omitted handlesSensitiveData.
 */
import { describe, expect, it } from 'vitest';
import {
  classifySaMD, assessAIMLDevice, designPCCP, assessGMLP, designSaMDClinicalValidation, assessDeviceCybersecurity,
} from '../../digital-health/digital-health-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { DIGITAL_HEALTH_TOOLS } from '../digitalHealthTools';

/** ai-gateway/gateway.ts trims a longer tool description to this many characters for OpenAI-compatible providers. */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const samd = { healthcareSituation: 'critical', informationSignificance: 'treat-or-diagnose', meetsSaMDDefinition: true, generalPurposePlatform: true };
const aiml = {
  algorithmType: 'locked', autonomyLevel: 'autonomous', samdCategory: 'III', transparencyArtifactsProvided: true,
  trainingDataRepresentative: true, externalValidationPerformed: true, realWorldMonitoring: true,
  plannedPostMarketModifications: false, usesGenerativeOrFoundationModel: false,
};
const retraining = { label: 'Retraining', description: 'Quarterly retraining on new sites', type: 'retraining' };
const pccp = {
  deviceName: 'Detector', samdCategory: 'III', plannedModifications: [retraining], changesIntendedUse: false,
  expandsPopulation: false, addsNewInputModality: false, continuousLearningProposed: false,
};
const conformant = (principles: number[]) => principles.map(principle => ({ principle, conformity: 'conformant' }));
const gmlp = { principleInputs: conformant([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) };
const evidencePlan = {
  samdCategory: 'III', validClinicalAssociationEstablished: true, isAIML: true, referenceStandardAvailable: true,
  prospectiveDataPlanned: true, autonomyLevel: 'assistive',
};
const CYBER_FLAGS = [
  'includesSoftware', 'networkConnected', 'submissionUnder524B', 'threatModelProvided', 'sbomProvided',
  'securityRiskManagementProvided', 'vulnerabilityHandlingProcess', 'postMarketUpdatePlan', 'handlesSensitiveData',
];
const cyber = { ...Object.fromEntries(CYBER_FLAGS.map(k => [k, true])), handlesSensitiveData: false };

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

type Compute = (input: never) => { inputStates: Record<string, unknown> };
const stated = [
  { tool: 'classify_samd', input: samd, result: { category: 'IV', isSaMD: true } },
  { tool: 'assess_ai_ml_device', input: aiml, result: { pccpRecommended: false } },
  { tool: 'design_pccp', input: pccp, result: { pccpAppropriate: true, outOfScopeModifications: [] } },
  { tool: 'assess_gmlp', input: gmlp, result: { overallConformityScore: 100, overallVerdict: 'pass' } },
  { tool: 'design_samd_clinical_validation', input: evidencePlan, result: { independentReviewExpected: true } },
  { tool: 'assess_device_cybersecurity', input: cyber, result: { overallVerdict: 'pass', isCyberDevice: true, notStated: [] } },
];
const families: Array<{ tool: string; compute: Compute; input: object; flags: string[] }> = [
  { tool: 'classify_samd', compute: classifySaMD as Compute, input: samd, flags: ['meetsSaMDDefinition', 'generalPurposePlatform'] },
  { tool: 'assess_ai_ml_device', compute: assessAIMLDevice as Compute, input: aiml,
    flags: ['transparencyArtifactsProvided', 'trainingDataRepresentative', 'externalValidationPerformed', 'realWorldMonitoring',
      'plannedPostMarketModifications', 'usesGenerativeOrFoundationModel'] },
  { tool: 'design_pccp', compute: designPCCP as Compute, input: pccp,
    flags: ['changesIntendedUse', 'expandsPopulation', 'addsNewInputModality', 'continuousLearningProposed'] },
  { tool: 'design_samd_clinical_validation', compute: designSaMDClinicalValidation as Compute, input: evidencePlan,
    flags: ['validClinicalAssociationEstablished', 'isAIML', 'referenceStandardAvailable', 'prospectiveDataPlanned'] },
  { tool: 'assess_device_cybersecurity', compute: assessDeviceCybersecurity as Compute, input: cyber, flags: CYBER_FLAGS },
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
const text = (findings: Array<{ detail: string }>) => findings.map(f => f.detail).join(' ');

describe('the six digital-health tools keep their stated results', () => {
  it.each(stated)('$tool reaches its engine with a stated basis', async ({ tool, input, result }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', engine: 'deterministic', basis: 'stated', appliesTo: 'the inputs stated in this conversation', result,
    });
  });
});

describe.each(families)('$tool keeps each boolean answer as stated', ({ tool, compute, input, flags }) => {
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

describe('a malformed enum, modification or principle is refused by field, never read', () => {
  it.each([
    { tool: 'classify_samd', input: changed(samd, { healthcareSituation: 'Critical' }), field: 'healthcareSituation' },
    { tool: 'classify_samd', input: changed(samd, { informationSignificance: 'Treat' }), field: 'informationSignificance' },
    { tool: 'assess_ai_ml_device', input: changed(aiml, { algorithmType: 'Locked' }), field: 'algorithmType' },
    { tool: 'assess_ai_ml_device', input: changed(aiml, { autonomyLevel: 'Autonomous' }), field: 'autonomyLevel' },
    { tool: 'assess_ai_ml_device', input: changed(aiml, { samdCategory: 'iv' }), field: 'samdCategory' },
    { tool: 'design_pccp', input: changed(pccp, { plannedModifications: 'retrain' }), field: 'plannedModifications' },
    { tool: 'design_pccp', input: changed(pccp, { plannedModifications: [] }), field: 'plannedModifications' },
    { tool: 'design_pccp', input: changed(pccp, { plannedModifications: [{ ...retraining, type: 'Population-expansion' }] }), field: 'plannedModifications[0].type' },
    { tool: 'design_pccp', input: changed(pccp, { plannedModifications: [retraining, { ...retraining, label: ' ' }] }), field: 'plannedModifications[1].label' },
    { tool: 'design_pccp', input: changed(pccp, { samdCategory: 'V' }), field: 'samdCategory' },
    { tool: 'design_pccp', input: changed(pccp, { deviceName: 5 }), field: 'deviceName' },
    { tool: 'assess_device_cybersecurity', input: changed(cyber, { deviceName: 5 }), field: 'deviceName' },
    { tool: 'assess_gmlp', input: { principleInputs: 'all conformant' }, field: 'principleInputs' },
    { tool: 'assess_gmlp', input: { principleInputs: [{ principle: '3', conformity: 'conformant' }] }, field: 'principleInputs[0].principle' },
    { tool: 'assess_gmlp', input: { principleInputs: [{ principle: 11, conformity: 'conformant' }] }, field: 'principleInputs[0].principle' },
    { tool: 'assess_gmlp', input: { principleInputs: [{ principle: 4, conformity: 'Conformant' }] }, field: 'principleInputs[0].conformity' },
    { tool: 'assess_gmlp', input: { principleInputs: conformant([1, 1]) }, field: 'principleInputs[1].principle' },
    { tool: 'design_samd_clinical_validation', input: changed(evidencePlan, { samdCategory: 'V' }), field: 'samdCategory' },
    { tool: 'design_samd_clinical_validation', input: changed(evidencePlan, { autonomyLevel: 'full' }), field: 'autonomyLevel' },
  ].map((c, i) => ({ ...c, n: i + 1 })))('$tool refuses $field (case $n)', async ({ tool, input, field }) => {
    await refused(tool, input, 'invalid_input', field);
  });
});

describe('a required input that is not stated is asked for by name', () => {
  it.each([
    { tool: 'classify_samd', input: {}, field: 'healthcareSituation' },
    { tool: 'assess_ai_ml_device', input: { algorithmType: 'locked' }, field: 'autonomyLevel' },
    { tool: 'design_pccp', input: {}, field: 'plannedModifications' },
    { tool: 'assess_gmlp', input: {}, field: 'principleInputs' },
    { tool: 'design_samd_clinical_validation', input: {}, field: 'samdCategory' },
  ])('$tool asks for $field', async ({ tool, input, field }) => {
    await refused(tool, input, 'missing_input', field);
  });
});

describe('the six definitions say what an omitted fact means, within the trimmed length', () => {
  const def = (tool: string) => DIGITAL_HEALTH_TOOLS.find(t => t.name === tool)!;
  const props = (tool: string) => def(tool).input_schema.properties as Record<string, { description: string }>;

  it.each(stated)('$tool', ({ tool }) => {
    expect(def(tool).description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    expect(def(tool).description).toMatch(/relay the validation error/);
    for (const field of families.find(f => f.tool === tool)?.flags ?? []) {
      expect(def(tool).input_schema.required).not.toContain(field);
      expect(props(tool)[field].description, field).toMatch(/Omitted or null stays not_stated/);
      expect(props(tool)[field].description, field).not.toMatch(/\(default|Default true|Default treated/);
    }
  });

  it('names the inputs no function reads, and says what a not-assessed principle does to the score', () => {
    for (const [tool, field] of [['classify_samd', 'intendedUse'], ['classify_samd', 'targetPopulation'],
      ['assess_ai_ml_device', 'intendedModifications'], ['design_pccp', 'algorithmType'], ['assess_gmlp', 'samdCategory'],
      ['design_samd_clinical_validation', 'intendedUse']]) {
      expect(props(tool)[field].description, `${tool}.${field}`).toMatch(/Not read/);
    }
    const conformity = (props('assess_gmlp').principleInputs as unknown as { items: { properties: Record<string, { description: string }> } })
      .items.properties.conformity.description;
    expect(conformity).toMatch(/"not-assessed" principle leaves the score null/);
  });

  it('keeps the routing words design_pccp is found by', () => {
    expect(def('design_pccp').description).toMatch(/pre-authorize iterative AI\/ML model updates/);
  });
});

describe('classify_samd does not assume the software is SaMD on a general-purpose platform', () => {
  it('leaves isSaMD null and names the facts left out', () => {
    const out = classifySaMD({ healthcareSituation: 'serious', informationSignificance: 'drive' });
    expect(out.isSaMD).toBeNull();
    expect(text(out.considerations)).toMatch(/meetsSaMDDefinition is not stated/);
    expect(text(out.considerations)).toMatch(/generalPurposePlatform is not stated/);
    expect(out.category).toBe('II');
  });

  it('keeps the stated answers', () => {
    expect(text(classifySaMD(samd as never).considerations)).not.toMatch(/not stated/);
    expect(classifySaMD(changed(samd, { meetsSaMDDefinition: false })).isSaMD).toBe(false);
  });
});

describe('assess_ai_ml_device passes nothing and recommends nothing from an unstated fact', () => {
  const omit = (fields: string[]) => Object.fromEntries(fields.map(k => [k, undefined]));

  it('reports omitted evidence as not stated, never as provided or in place', () => {
    const out = assessAIMLDevice(changed(aiml, omit(['transparencyArtifactsProvided', 'trainingDataRepresentative',
      'externalValidationPerformed', 'realWorldMonitoring'])));
    for (const findings of [out.transparencyFindings, out.biasAndGeneralizabilityFindings, out.monitoringFindings]) {
      expect(findings.some(f => f.severity === 'pass'), JSON.stringify(findings)).toBe(false);
    }
    expect(text(out.transparencyFindings)).toMatch(/^Not stated: transparencyArtifactsProvided was not given/);
    expect(text(out.transparencyFindings)).not.toMatch(/Transparency documentation is provided/);
    expect(text(out.monitoringFindings)).not.toMatch(/monitoring is in place/);
  });

  it('leaves a locked model’s PCCP recommendation null while planned modifications are unstated', () => {
    const out = assessAIMLDevice(changed(aiml, { plannedPostMarketModifications: undefined }));
    expect(out.pccpRecommended).toBeNull();
    expect(out.pccpRationale).toMatch(/^Not assessed: plannedPostMarketModifications is not stated/);
    expect(assessAIMLDevice(changed(aiml, { plannedPostMarketModifications: undefined, algorithmType: 'adaptive' })).pccpRecommended).toBe(true);
    expect(assessAIMLDevice(aiml as never).pccpRationale).toMatch(/^PCCP OPTIONAL/);
  });

  it('names an unstated generative component and SaMD category', () => {
    const out = assessAIMLDevice(changed(aiml, { usesGenerativeOrFoundationModel: undefined, samdCategory: undefined }));
    expect(text(out.overallRiskFlags)).toMatch(/usesGenerativeOrFoundationModel was not given/);
    expect(text(out.overallRiskFlags)).toMatch(/samdCategory is not stated/);
    expect(assessAIMLDevice(changed(aiml, { samdCategory: 'IV' })).overallRiskFlags.map(f => f.severity)).toContain('critical-gap');
  });
});

describe('design_pccp names the scope facts it was not given', () => {
  it('names each unstated scope fact, and nothing when all are stated', () => {
    const out = designPCCP({ plannedModifications: [retraining] } as never);
    expect(out.outOfScopeModifications).toContainEqual(expect.objectContaining({
      topic: 'Scope facts not stated', severity: 'attention',
      detail: expect.stringMatching(/^Not assessed: changesIntendedUse, expandsPopulation, addsNewInputModality, continuousLearningProposed are not stated/),
    }));
    expect(designPCCP(pccp as never).outOfScopeModifications).toEqual([]);
  });

  it('keeps a population expansion outside the envelope', () => {
    const out = designPCCP(changed(pccp, { plannedModifications: [{ ...retraining, type: 'population-expansion' }] }));
    expect(out.descriptionOfModifications[0].withinPCCPEnvelope).toBe(false);
  });
});

describe('assess_gmlp scores and grades no principle nobody assessed', () => {
  it('leaves the score null and the verdict not assessed while a principle is not assessed', () => {
    expect(assessGMLP({ principleInputs: conformant([1, 2, 3, 4, 5, 6, 7, 8, 9]) } as never))
      .toMatchObject({ overallConformityScore: null, overallVerdict: 'not_assessed', notAssessedCount: 1 });
    expect(assessGMLP({ principleInputs: [...conformant([1, 2, 3, 4, 5, 6, 7, 8, 9]), { principle: 10, conformity: 'not-assessed' }] } as never))
      .toMatchObject({ overallConformityScore: null, overallVerdict: 'not_assessed' });
  });

  it('gives the verdict a non-conformant principle settles', () => {
    expect(assessGMLP({ principleInputs: [{ principle: 3, conformity: 'non-conformant' }] } as never))
      .toMatchObject({ overallConformityScore: null, overallVerdict: 'critical-gap' });
  });

  it('keeps the stated answers', () => {
    expect(assessGMLP({ principleInputs: [...conformant([1, 2, 3, 4, 5, 6, 7, 8, 9]), { principle: 10, conformity: 'partial' }] } as never))
      .toMatchObject({ overallConformityScore: 95, overallVerdict: 'gap' });
  });
});

describe('design_samd_clinical_validation names each unstated fact in the plan', () => {
  const plan = (overrides: Record<string, unknown>) => designSaMDClinicalValidation(changed(evidencePlan, overrides));

  it('leaves the association rigor not assessed', () => {
    const pillar = plan({ validClinicalAssociationEstablished: undefined }).pillars[0];
    expect(pillar.rigor).toBe('not_assessed');
    expect(pillar.evidenceElements[0]).toMatch(/^validClinicalAssociationEstablished is not stated/);
  });

  it('does not read an omitted AI/ML, reference-standard, data-source or autonomy fact as an answer', () => {
    const out = plan({ isAIML: undefined, referenceStandardAvailable: undefined, prospectiveDataPlanned: undefined, autonomyLevel: undefined });
    expect(out.pillars[1].evidenceElements.join(' ')).toMatch(/isAIML is not stated/);
    expect(out.overallNarrative).toMatch(/is not stated \(isAIML\)/);
    expect(out.evidencePlan.find(r => r.id === 'CE-08')?.rationale).toMatch(/^isAIML is not stated/);
    expect(plan({ isAIML: false }).evidencePlan.map(r => r.id)).not.toContain('CE-08');
    expect(out.evidencePlan.find(r => r.id === 'CE-06')?.rationale).toMatch(/^referenceStandardAvailable is not stated/);
    expect(out.studyDesignGuidance[0]).toMatch(/^prospectiveDataPlanned is not stated/);
    expect(out.pillars[2].evidenceElements.join(' ')).toMatch(/autonomyLevel is not stated/);
    expect(plan({}).evidencePlan.map(r => r.id)).not.toContain('CE-06');
  });
});

describe('assess_device_cybersecurity lists an unstated sensitive-data fact without grading it', () => {
  const data = (out: ReturnType<typeof assessDeviceCybersecurity>) => out.requirements.find(r => r.id === 'CY-DATA');

  it('adds the data-protection row as not stated, at attention, and still passes', () => {
    const out = assessDeviceCybersecurity(changed(cyber, { handlesSensitiveData: undefined }));
    expect(data(out)).toMatchObject({ status: 'not_stated', severity: 'attention' });
    expect(out).toMatchObject({ overallVerdict: 'pass', notStated: [] });
  });

  it('keeps the stated answers', () => {
    expect(data(assessDeviceCybersecurity(cyber as never))).toBeUndefined();
    expect(data(assessDeviceCybersecurity(changed(cyber, { handlesSensitiveData: true })))).toMatchObject({ status: 'present', severity: 'attention' });
  });
});
