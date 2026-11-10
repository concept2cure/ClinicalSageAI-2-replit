/**
 * S5b: the medical-device worksheets keep an unanswered fact not_stated, decide nothing from it, and refuse a
 * malformed value by field.
 *
 * What the code did before this change: the 2026-10-15 sweep had made the SE flow, the clinical-data answer, the
 * GSPR applicability and the plan's conditional sections three-valued, but nothing refused a malformed value and
 * the rest read an omitted fact as false. select_device_pathway called { usClass: 'II', predicateExists: true } a
 * 510(k) with its biologic and exemption status never stated, isBiologic 'false' a BLA, usClass 'Class II' a
 * 510(k), a null HUD population an HDE, and an MDR Class I device with no stated aspect self-certified.
 * assess_substantial_equivalence found SE with the predicate's recall never stated and chose an Abbreviated 510(k)
 * on an unstated software or IVD fact, or any 510(k) type while an unstated answer could make it NSE.
 * design_device_clinical_evidence chose a pivotal study for an unstated
 * isIVD, an MDR plan for an unstated IVD, and read implantable 'true' as stated. assess_essential_principles built
 * the MDR matrix for an unstated isIVD, graded GSPR 1-4 gaps and raised "QMS-MISSING" and "RMF-MISSING" for
 * omitted files, and crashed on a standards string. plan_device_submission planned '510k' as an undetermined
 * pathway, read preSubmissionDone 'true' as done, and planned the nIVD eSTAR for an unstated isIVD.
 */
import { describe, expect, it } from 'vitest';
import {
  selectDevicePathway, assessSubstantialEquivalence, designDeviceClinicalEvidence, assessEssentialPrinciples,
  planDeviceSubmission,
} from '../../medical-device/medical-device-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { MEDICAL_DEVICE_TOOLS } from '../medicalDeviceTools';

/** ai-gateway/gateway.ts trims a longer tool description to this many characters for OpenAI-compatible providers. */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const pathway = {
  usClass: 'II', predicateExists: true, novelLowModerateRisk: false, humanitarianUseDevice: false, exempt: false,
  isBiologic: false, isIVD: false, euMdrClass: 'IIa', sterile: false, measuringFunction: false,
  reusableSurgicalInstrument: false,
} satisfies Parameters<typeof selectDevicePathway>[0];
const equivalence = {
  predicateIdentified: true, sameIntendedUse: true, sameTechnologicalCharacteristics: true,
  differentQuestionsOfSafetyEffectiveness: false, performanceDataDemonstratesEquivalence: true,
  predicateRecalledForSafety: false, usesReferenceDevice: false, isIVD: false, hasSoftware: false,
  patientContacting: false, sterile: false,
} satisfies Parameters<typeof assessSubstantialEquivalence>[0];
const evidence = {
  usClass: 'II', usPathway: '510(k)', novelTechnology: false, clinicalDataNeededForSE: true, implantable: false,
  lifeSustaining: false, isIVD: false, existingLiterature: false, realWorldDataAvailable: false, euMarket: true,
  euMdrClass: 'IIa', significantRisk: false,
} satisfies Parameters<typeof designDeviceClinicalEvidence>[0];
const principles = {
  isIVD: false, active: false, hasSoftware: false, patientContacting: false, sterile: false, measuringFunction: false,
  incorporatesMedicinalSubstance: false, emitsRadiation: false, implantable: false, qmsInPlace: true,
  riskManagementFile: true, standardsClaimed: ['ISO 14971:2019'],
} satisfies Parameters<typeof assessEssentialPrinciples>[0];
const plan = {
  usPathway: '510(k)', isIVD: false, hasSoftware: false, sterile: false, patientContacting: false,
  clinicalDataIncluded: false, euMarket: true, preSubmissionDone: false, asOf: '2026-11-08',
} satisfies Parameters<typeof planDeviceSubmission>[0];

const families = [
  { tool: 'select_device_pathway', compute: selectDevicePathway, input: pathway,
    optional: ['novelLowModerateRisk', 'humanitarianUseDevice', 'exempt', 'isBiologic', 'isIVD', 'sterile',
      'measuringFunction', 'reusableSurgicalInstrument'],
    required: ['predicateExists'],
    result: { usPathway: '510(k)', euConformityRoute: 'notified body — full QMS + technical documentation', clinicalEvidenceLikelyRequired: false } },
  { tool: 'assess_substantial_equivalence', compute: assessSubstantialEquivalence, input: equivalence,
    optional: ['differentQuestionsOfSafetyEffectiveness', 'performanceDataDemonstratesEquivalence',
      'predicateRecalledForSafety', 'usesReferenceDevice', 'isIVD', 'hasSoftware', 'patientContacting', 'sterile'],
    required: ['predicateIdentified', 'sameIntendedUse', 'sameTechnologicalCharacteristics'],
    result: { determination: 'SE', recommendedSubmissionType: '510(k)-Abbreviated' } },
  { tool: 'design_device_clinical_evidence', compute: designDeviceClinicalEvidence, input: evidence,
    optional: ['novelTechnology', 'clinicalDataNeededForSE', 'implantable', 'lifeSustaining', 'isIVD',
      'existingLiterature', 'realWorldDataAvailable', 'euMarket', 'significantRisk'],
    required: [],
    result: { clinicalDataRequired: true, usIDERequired: false, recommendedStudies: [expect.objectContaining({ studyType: 'pivotal' })] } },
  { tool: 'assess_essential_principles', compute: assessEssentialPrinciples, input: principles,
    optional: ['active', 'hasSoftware', 'patientContacting', 'sterile', 'measuringFunction',
      'incorporatesMedicinalSubstance', 'emitsRadiation', 'implantable', 'qmsInPlace', 'riskManagementFile'],
    required: ['isIVD'],
    result: { framework: 'EU MDR Annex I (GSPR)', overallConformity: 'gaps-present' } },
  { tool: 'plan_device_submission', compute: planDeviceSubmission, input: plan,
    optional: ['isIVD', 'hasSoftware', 'sterile', 'patientContacting', 'clinicalDataIncluded', 'euMarket', 'preSubmissionDone'],
    required: [],
    result: { usPathway: '510(k)', qSubStrategy: expect.stringMatching(/^A Pre-Submission is optional/) } },
];

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  // No user: the private-rule gate (governed-tool-gate.ts) needs a membership row the unit harness does not have.
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101 } as never));
}

function refusal(f: () => unknown): { code?: string; field?: string } {
  try {
    f();
  } catch (e) {
    return e as { code?: string; field?: string };
  }
  return {};
}

describe('the five device worksheets keep their stated results', () => {
  it.each(families)('$tool reaches its engine with a stated basis', async ({ tool, input, result }) => {
    expect(await run(tool, input)).toMatchObject({ status: 'computed', engine: 'deterministic', basis: 'stated', result });
  });
});

describe.each(families)('$tool keeps each boolean answer as stated', ({ tool, compute, input, optional, required }) => {
  it.each(optional)('%s reads not_stated when omitted or null', field => {
    for (const absent of [undefined, null]) {
      expect(compute(changed(input, { [field]: absent }))).toMatchObject({ inputStates: { [field]: 'not_stated' } });
    }
    for (const answer of [true, false]) {
      expect(compute(changed(input, { [field]: answer }))).toMatchObject({ inputStates: { [field]: answer } });
    }
  });

  it.each([...optional, ...required])('%s is refused by field when malformed', async field => {
    for (const value of ['false', 'true', 0, 1]) {
      const out = await run(tool, changed(input, { [field]: value }));
      expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
      expect(out).not.toHaveProperty('basis');
    }
  });
});

describe('a missing or malformed class, pathway, list, date or number is refused by field, never read', () => {
  it.each([
    { tool: 'select_device_pathway', input: pathway, field: 'usClass', value: 'Class II', code: 'invalid_input' },
    { tool: 'select_device_pathway', input: pathway, field: 'usClass', value: undefined, code: 'missing_input' },
    { tool: 'select_device_pathway', input: pathway, field: 'predicateExists', value: undefined, code: 'missing_input' },
    { tool: 'select_device_pathway', input: pathway, field: 'euMdrClass', value: 'Class IIa', code: 'invalid_input' },
    { tool: 'select_device_pathway', input: pathway, field: 'euIvdrClass', value: 'b', code: 'invalid_input' },
    { tool: 'select_device_pathway', input: pathway, field: 'estimatedAnnualUSPopulation', value: '5000', code: 'invalid_input' },
    { tool: 'select_device_pathway', input: pathway, field: 'estimatedAnnualUSPopulation', value: -1, code: 'invalid_input' },
    { tool: 'design_device_clinical_evidence', input: evidence, field: 'usClass', value: 'Class III', code: 'invalid_input' },
    { tool: 'design_device_clinical_evidence', input: evidence, field: 'usPathway', value: 'pma', code: 'invalid_input' },
    { tool: 'design_device_clinical_evidence', input: evidence, field: 'euMdrClass', value: 'IIA', code: 'invalid_input' },
    { tool: 'assess_essential_principles', input: principles, field: 'isIVD', value: undefined, code: 'missing_input' },
    { tool: 'assess_essential_principles', input: principles, field: 'standardsClaimed', value: 'ISO 14971', code: 'invalid_input' },
    { tool: 'plan_device_submission', input: plan, field: 'usPathway', value: '510k', code: 'invalid_input' },
    { tool: 'plan_device_submission', input: plan, field: 'usPathway', value: undefined, code: 'missing_input' },
    { tool: 'plan_device_submission', input: plan, field: 'asOf', value: 'tomorrow', code: 'invalid_input' },
  ])('$tool refuses $field = $value', async ({ tool, input, field, value, code }) => {
    const out = await run(tool, changed(input, { [field]: value }));
    expect(out).toMatchObject({ status: 'needs_parameters', code, field });
    expect(out).not.toHaveProperty('basis');
  });

  it('refuses a standards entry that is not an ID, by index', () => {
    expect(refusal(() => assessEssentialPrinciples(changed(principles, { standardsClaimed: ['ISO 14971', 1] }))))
      .toMatchObject({ code: 'invalid_input', field: 'standardsClaimed[1]' });
  });
});

describe('select_device_pathway gives a pathway only when no unstated deciding fact could change it', () => {
  it('does not route a device whose biologic and exemption status were not stated', () => {
    const out = selectDevicePathway({ usClass: 'II', predicateExists: true });
    expect(out).toMatchObject({ usPathway: 'undetermined', clinicalEvidenceLikelyRequired: null });
    expect(out.usPathwayRationale).toMatch(/isBiologic \(true gives BLA\), exempt \(true gives exempt\) were not stated/);
    expect(out.usPathwayRationale).toMatch(/If each is false the pathway is 510\(k\)/);
    expect(out.usAlternatives.map(a => a.pathway)).toEqual(['510(k)', 'BLA', 'exempt']);
    expect(out.findings.map(f => f.id)).toContain('NEEDS-INPUT-UNSTATED');
    expect(selectDevicePathway(pathway).usPathway).toBe('510(k)');
  });

  it.each(['isBiologic', 'novelLowModerateRisk', 'humanitarianUseDevice'])(
    '%s left out leaves a class III, no-predicate pathway undetermined', field => {
      const pma = changed(pathway, { usClass: 'III', predicateExists: false });
      expect(selectDevicePathway(pma).usPathway).toBe('IDE-then-PMA');
      const out = selectDevicePathway(changed(pma, { [field]: undefined }));
      expect(out.usPathway).toBe('undetermined');
      expect(out.usPathwayRationale).toContain(field);
    });

  it('keeps a pathway no answer to the unstated fact could change', () => {
    expect(selectDevicePathway(changed(pathway, { usClass: 'III', novelLowModerateRisk: undefined })).usPathway).toBe('510(k)');
    expect(selectDevicePathway(changed(pathway, { humanitarianUseDevice: undefined })).usPathway).toBe('510(k)');
    // A class III device is never 510(k)-exempt, so an unstated exemption changes nothing.
    const pma = selectDevicePathway(changed(pathway, { usClass: 'III', predicateExists: false, exempt: undefined }));
    expect(pma).toMatchObject({ usPathway: 'IDE-then-PMA', inputStates: { exempt: 'not_stated' } });
    expect(pma.findings.map(f => f.id)).not.toContain('NEEDS-INPUT-UNSTATED');
  });

  it('does not read a null HUD population as one within the 8,000 limit', () => {
    const hud = changed(pathway, { usClass: 'III', predicateExists: false, humanitarianUseDevice: true });
    expect(selectDevicePathway(changed(hud, { estimatedAnnualUSPopulation: null })).usPathway).toBe('undetermined');
    expect(selectDevicePathway(changed(hud, { estimatedAnnualUSPopulation: 4000 })).usPathway).toBe('HDE');
  });

  it('gives no clinical-evidence answer while the pathway is undetermined', () => {
    const out = selectDevicePathway(changed(pathway, { usClass: 'III', predicateExists: false, humanitarianUseDevice: true }));
    expect(out).toMatchObject({ usPathway: 'undetermined', clinicalEvidenceLikelyRequired: null });
  });

  it('does not self-certify an MDR Class I device whose sterile, measuring or reusable aspect was not stated', () => {
    const classI = changed(pathway, { euMdrClass: 'I' });
    expect(selectDevicePathway(classI).euConformityRoute).toBe('self-certification (no NB)');
    const out = selectDevicePathway(changed(classI, { sterile: undefined }));
    expect(out.euConformityRoute).toBe('undetermined');
    expect(out.euConformityRationale).toMatch(/sterile not stated/);
    expect(selectDevicePathway(changed(classI, { sterile: undefined, measuringFunction: true })).euConformityRoute)
      .toBe('notified body involvement');
  });

  it('routes a stated IVDR class without isIVD, and does not choose between two stated classes', () => {
    const ivdr = changed(pathway, { isIVD: undefined, euMdrClass: undefined, euIvdrClass: 'B' });
    expect(selectDevicePathway(ivdr).euConformityRoute).toBe('notified body — full QMS + technical documentation');
    const both = selectDevicePathway(changed(ivdr, { euMdrClass: 'IIa' }));
    expect(both.euConformityRoute).toBe('undetermined');
    expect(both.euConformityRationale).toMatch(/isIVD/);
  });

  it('sends an IVDR Class A device to a notified body for sterility only', () => {
    const classA = changed(pathway, { isIVD: true, euMdrClass: undefined, euIvdrClass: 'A' });
    expect(selectDevicePathway(changed(classA, { measuringFunction: true })).euConformityRoute).toBe('self-certification (no NB)');
    expect(selectDevicePathway(changed(classA, { sterile: true })).euConformityRoute).toBe('notified body involvement');
  });
});

describe('assess_substantial_equivalence finds no SE and picks no 510(k) type from an unstated fact', () => {
  it('does not find SE while the predicate recall was not stated', () => {
    const out = assessSubstantialEquivalence(changed(equivalence, { predicateRecalledForSafety: undefined }));
    expect(out.determination).toBe('indeterminate');
    expect(out.determinationRationale).toMatch(/predicateRecalledForSafety/);
    expect(out.predicateAdequacy).toMatch(/^Not determined/);
    expect(out.decisionPath[0]).toMatchObject({ outcome: 'indeterminate' });
  });

  it('still ends at a stated NSE whatever the recall', () => {
    const nse = assessSubstantialEquivalence({ predicateIdentified: true, sameIntendedUse: false } as never);
    expect(nse.determination).toBe('NSE');
  });

  it('names the performance data an unstated device property decides', () => {
    const out = assessSubstantialEquivalence(changed(equivalence, { sterile: undefined, isIVD: null }));
    const undetermined = out.performanceDataNeeded.find(p => p.id === 'PERF-UNDETERMINED');
    expect(String(undetermined?.statement)).toMatch(/PERF-STERILE \(sterile\), PERF-IVD \(isIVD\)/);
    expect(assessSubstantialEquivalence(equivalence).performanceDataNeeded.map(p => p.id)).toEqual(['PERF-BENCH']);
  });

  it('names no 510(k) type while an unstated recall or different-questions answer could make it NSE', () => {
    expect(assessSubstantialEquivalence(changed(equivalence, { predicateRecalledForSafety: undefined })).recommendedSubmissionType).toBeNull();
    const differs = changed(equivalence, { sameTechnologicalCharacteristics: false, differentQuestionsOfSafetyEffectiveness: undefined });
    expect(assessSubstantialEquivalence(differs).recommendedSubmissionType).toBeNull();
    // No answer to the performance data changes the type: false is still a 510(k) awaiting testing.
    expect(assessSubstantialEquivalence(changed(equivalence, { performanceDataDemonstratesEquivalence: undefined })).recommendedSubmissionType)
      .toBe('510(k)-Abbreviated');
  });

  it('does not choose an Abbreviated 510(k) on an unstated software or IVD fact', () => {
    expect(assessSubstantialEquivalence(changed(equivalence, { hasSoftware: undefined })).recommendedSubmissionType).toBeNull();
    expect(assessSubstantialEquivalence(changed(equivalence, { hasSoftware: true })).recommendedSubmissionType)
      .toBe('510(k)-Traditional');
  });
});

describe('design_device_clinical_evidence chooses no study or EU evaluation from an unstated fact', () => {
  const statements = (p: object) => designDeviceClinicalEvidence(p as never).findings.map(f => f.statement).join(' ');

  it('does not choose a pivotal investigation for an unstated isIVD', () => {
    const out = designDeviceClinicalEvidence(changed(evidence, { isIVD: undefined }));
    expect(out.recommendedStudies.map(s => s.studyType)).toEqual([]);
    expect(statements(changed(evidence, { isIVD: undefined }))).toMatch(/Not assessed: .*\(isIVD\)/);
  });

  it('names the feasibility, literature and real-world routes an unstated fact decides', () => {
    const text = statements(changed(evidence, { novelTechnology: undefined, existingLiterature: undefined, realWorldDataAvailable: null }));
    expect(text).toMatch(/feasibility \(first-in-human\) study \(novelTechnology\)/);
    expect(text).toMatch(/the literature route \(existingLiterature\)/);
    expect(text).toMatch(/real-world evidence \(realWorldDataAvailable\)/);
    expect(statements(evidence)).not.toMatch(/Not assessed/);
  });

  it('does not read an implant stated as a string as stated', async () => {
    const none = { usClass: 'II', novelTechnology: false, clinicalDataNeededForSE: false, lifeSustaining: false };
    expect(designDeviceClinicalEvidence(changed(none, { implantable: false })).clinicalDataRequired).toBe(false);
    expect(await run('design_device_clinical_evidence', changed(none, { implantable: 'true' })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'implantable' });
  });

  it('scopes no EU evaluation from an unstated market, IVD status, class or implant', () => {
    const plan = (o: Record<string, unknown>) => designDeviceClinicalEvidence(changed(evidence, o)).euClinicalEvaluationPlan;
    expect(plan({ euMarket: undefined })).toMatch(/^Not scoped: .*\(euMarket\)/);
    expect(plan({ euMarket: false })).toMatch(/^EU market not indicated/);
    expect(plan({ isIVD: undefined })).toMatch(/^Not assessed: .*isIVD was not stated/);
    expect(plan({ euMdrClass: undefined })).toMatch(/is not assessed: euMdrClass not stated/);
    expect(plan({})).toMatch(/For lower classes/);
  });
});

describe('assess_essential_principles grades no row from an unstated fact', () => {
  const row = (r: ReturnType<typeof assessEssentialPrinciples>, ref: string) => r.conformityMatrix.find(x => x.gsprRef === ref);

  it('does not build an MDR matrix for a device not said to be an IVD or not', () => {
    expect(refusal(() => assessEssentialPrinciples(changed(principles, { isIVD: undefined }))))
      .toMatchObject({ code: 'missing_input', field: 'isIVD' });
  });

  it('raises no gap or "missing" finding for an unstated QMS or risk file', () => {
    const out = assessEssentialPrinciples(changed(principles, { qmsInPlace: undefined, riskManagementFile: undefined }));
    for (const ref of ['GSPR 1', 'GSPR 2', 'GSPR 3', 'GSPR 4']) expect(row(out, ref)?.status, ref).toBe('not-assessed');
    const ids = out.findings.map(f => f.id);
    expect(ids).not.toContain('QMS-MISSING');
    expect(ids).not.toContain('RMF-MISSING');
    expect(ids).toContain('FILES-NOT-STATED');
    expect(out.overallConformity).toBe('insufficient-information');
  });

  it('keeps the stated answers', () => {
    const out = assessEssentialPrinciples(changed(principles, { qmsInPlace: false, riskManagementFile: false }));
    expect(out.findings.map(f => f.id)).toEqual(expect.arrayContaining(['QMS-MISSING', 'RMF-MISSING']));
    expect(row(out, 'GSPR 1')?.status).toBe('gap');
    expect(row(assessEssentialPrinciples(principles), 'GSPR 1')?.status).toBe('addressed');
    expect(row(assessEssentialPrinciples(changed(principles, { qmsInPlace: undefined })), 'GSPR 4')?.status).toBe('not-assessed');
  });
});

describe('plan_device_submission plans nothing from an unstated fact without saying so', () => {
  const section = (o: Record<string, unknown>, id: string) =>
    planDeviceSubmission(changed(plan, o)).usSections.find(s => s.sectionId === id);

  it('says when the Pre-Submission was not stated', () => {
    const out = planDeviceSubmission(changed(plan, { preSubmissionDone: undefined }));
    expect(out.qSubStrategy).toMatch(/^Whether a Pre-Submission has already occurred was not stated \(preSubmissionDone\)\. If none has: A Pre-Submission is optional/);
    expect(out.timeline.find(t => /Q-Sub/.test(t.phase))?.description).toMatch(/preSubmissionDone not stated/);
  });

  it('says when the EU market was not stated, and names both regulations for an unstated IVD', () => {
    const out = planDeviceSubmission(changed(plan, { euMarket: undefined }));
    expect(out.euTechnicalDocumentation).toEqual([]);
    expect(out.findings.map(f => f.id)).toContain('EU-NOT-STATED');
    expect(planDeviceSubmission(changed(plan, { euMarket: false })).findings.map(f => f.id)).not.toContain('EU-NOT-STATED');
    const eu = planDeviceSubmission(changed(plan, { isIVD: undefined })).euTechnicalDocumentation;
    expect(eu[0].citation.source).toBe('MDR or IVDR Annex II/III §1');
    expect(planDeviceSubmission(plan).euTechnicalDocumentation[0].citation.source).toBe('MDR Annex II/III §1');
  });

  it('keeps the IVD eSTAR questions on a plan whose IVD status was not stated, marked undetermined', () => {
    expect(String(section({ isIVD: undefined }, 'ivd-analytical-performance')?.contents)).toMatch(/^Undetermined: an IVD eSTAR question/);
    expect(section({}, 'ivd-analytical-performance')).toBeUndefined();
    expect(String(section({ isIVD: true }, 'ivd-analytical-performance')?.contents)).toMatch(/^Required/);
    expect(String(section({ usPathway: 'De Novo', isIVD: undefined }, 'ivd-perf')?.contents)).toMatch(/^Undetermined/);
  });
});

describe('the five definitions say what an omitted fact means, within the trimmed length', () => {
  it.each(families)('$tool', ({ tool, optional, required }) => {
    const def = MEDICAL_DEVICE_TOOLS.find(t => t.name === tool)!;
    expect(def.description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    expect(def.description).toMatch(/relay the validation error/);
    expect(def.description).not.toMatch(/generic drug/);
    const properties = def.input_schema.properties as Record<string, { description: string }>;
    for (const field of optional) {
      expect(def.input_schema.required).not.toContain(field);
      expect(properties[field].description, field).toMatch(/not_stated|[Uu]nstated/);
    }
    for (const field of required) expect(def.input_schema.required).toContain(field);
  });

  it('names the inputs no function reads', () => {
    const props = (tool: string) => MEDICAL_DEVICE_TOOLS.find(t => t.name === tool)!.input_schema.properties as
      Record<string, { description: string }>;
    expect(props('assess_essential_principles').layUse.description).toMatch(/Not read/);
    expect(props('plan_device_submission').euMdrClass.description).toMatch(/Not read/);
    expect(props('plan_device_submission').euIvdrClass.description).toMatch(/Not read/);
    expect(props('assess_substantial_equivalence').subjectDeviceName.description).toMatch(/not read/);
  });
});
