/**
 * S5d: the bioequivalence worksheets keep an unanswered fact not_stated, decide nothing an answer could change,
 * say where NTI status and a numeric default came from, and refuse a malformed value by field.
 *
 * What the code did before this change: classify_bcs({}) was Class IV, a fraction absorbed of '0.9' read as 0.9, an
 * omitted drug name or dosage form was read as not NTI and immediate release (Class I "biowaiver eligible"), an
 * extended-release tablet was immediate release, and a drug name of 5 crashed. design_be_study({}) designed a 2x2
 * crossover of null subjects, an omitted isNTI with no drug name was read as not NTI, a stated isNTI false for
 * warfarin was overridden to true, 'false' read as NTI, a power of 0.85 or 0.95 was sized at 0.80 or 0.90, a GMR
 * outside the limits gave 9999 subjects, and a delayed-release form was not modified release.
 * assess_dissolution_similarity crashed without a profile, read '40' as 40 and reported f2Pass false when f2 was
 * not computed. assess_biowaiver crashed without a dosage form, read an omitted dissolution or NTI fact as false
 * (Class I with no drug name was GRANTED), read 'false' as true and an extended-release tablet as immediate release,
 * and granted two waivers ICH M9 does not contain: a Class II weak acid ("Class IIa") and a Class III product that
 * was only rapidly dissolving. guidance_for_anda({ ...texts }) returned a 505(b)(2) from three omitted sameness
 * facts, an omitted BCS class required an in vivo study, sameRouteAsRLD 'false' gave an ANDA, a strength that was
 * not a list crashed, and an NTI active ingredient with isNTI left out got no NTI line.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyBCS, designBEStudy, assessDissolutionSimilarity, assessBiowaiver, guidanceForANDA,
} from '../../bioequivalence/bioequivalence-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { BIOEQUIVALENCE_TOOLS } from '../bioequivalenceTools';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions';
import { selectToolsForTurn } from '../tool-selection';

/** ai-gateway/gateway.ts trims a longer tool description to this many characters for OpenAI-compatible providers. */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const bcs = { highestDoseStrength_mg: 100, solubility_mg_per_mL: 1, fractionAbsorbed: 0.9, drugName: 'metoprolol', dosageForm: 'immediate-release tablet' };
const study = {
  withinSubjectCV: 45, halfLife_hours: 12, isNTI: false, drugName: 'metoprolol', expectedGMR: 95, targetPower: 0.8,
  dosageForm: 'tablet', fedStudyRequired: false, formulationsToCompare: 2,
};
const profile = (meanDissolved: number[]) => ({ timePoints_min: [10, 20, 30], meanDissolved, rsdPercent: [5, 5, 5] });
const dissolution = { unitsPerProduct: 12, reference: profile([40, 60, 80]), test: profile([42, 61, 79]) };
const biowaiver = {
  bcsClass: 'I', dosageForm: 'immediate-release tablet', drugName: 'metoprolol', isNTI: false, isWeakAcid: false,
  veryRapidlyDissolving: true, rapidlyDissolving: true, referenceVeryRapidlyDissolving: true,
  excipientsQualitativelySame: true, excipientsQuantitativelySimilar: true, framework: 'ich_m9',
};
const anda = {
  activeIngredient: 'metoprolol', dosageForm: 'tablet', routeOfAdministration: 'oral', strengths: ['50 mg'],
  sameDosageFormAsRLD: true, sameRouteAsRLD: true, sameStrengthAsRLD: true, isCombinationProduct: false, bcsClass: 'I', isNTI: false,
};

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

type Compute = (input: never) => { inputStates?: Record<string, unknown> };
const families: Array<{ tool: string; compute: Compute; input: object; flags: string[]; result: object }> = [
  { tool: 'classify_bcs', compute: classifyBCS as Compute, input: bcs, flags: [], result: { bcsClass: 'I', biowaiverEligible: true, isNTI: false } },
  { tool: 'design_be_study', compute: designBEStudy as Compute, input: study, flags: ['isNTI', 'fedStudyRequired'],
    result: { recommendedDesign: { designName: 'replicate_4_period' }, isHighlyVariable: true, scaledApproachApplicable: true } },
  { tool: 'assess_dissolution_similarity', compute: assessDissolutionSimilarity as Compute, input: dissolution, flags: [],
    result: { f2Pass: true, timePointsUsed: 3 } },
  { tool: 'assess_biowaiver', compute: assessBiowaiver as Compute, input: biowaiver,
    flags: ['isNTI', 'isWeakAcid', 'veryRapidlyDissolving', 'rapidlyDissolving', 'referenceVeryRapidlyDissolving',
      'excipientsQualitativelySame', 'excipientsQuantitativelySimilar'],
    result: { decision: 'BIOWAIVER_GRANTED', eligible: true } },
  { tool: 'guidance_for_anda', compute: guidanceForANDA as Compute, input: anda,
    flags: ['sameDosageFormAsRLD', 'sameRouteAsRLD', 'sameStrengthAsRLD', 'isCombinationProduct', 'isNTI'],
    result: { recommendedPathway: 'anda_505j', suitabilityPetitionRequired: false } },
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

describe('the five bioequivalence tools keep their stated results', () => {
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

describe('a malformed number, enum, list or text is refused by field, never read', () => {
  it.each([
    { tool: 'classify_bcs', input: changed(bcs, { fractionAbsorbed: '0.9' }), field: 'fractionAbsorbed' },
    { tool: 'classify_bcs', input: changed(bcs, { fractionAbsorbed: 1.5 }), field: 'fractionAbsorbed' },
    { tool: 'classify_bcs', input: changed(bcs, { highestDoseStrength_mg: 0 }), field: 'highestDoseStrength_mg' },
    { tool: 'classify_bcs', input: changed(bcs, { solubility_mg_per_mL: '1' }), field: 'solubility_mg_per_mL' },
    { tool: 'classify_bcs', input: changed(bcs, { drugName: 5 }), field: 'drugName' },
    { tool: 'classify_bcs', input: changed(bcs, { dosageForm: 5 }), field: 'dosageForm' },
    { tool: 'design_be_study', input: changed(study, { withinSubjectCV: '45' }), field: 'withinSubjectCV' },
    { tool: 'design_be_study', input: changed(study, { halfLife_hours: -1 }), field: 'halfLife_hours' },
    { tool: 'design_be_study', input: changed(study, { expectedGMR: 0 }), field: 'expectedGMR' },
    { tool: 'design_be_study', input: changed(study, { targetPower: 80 }), field: 'targetPower' },
    { tool: 'design_be_study', input: changed(study, { formulationsToCompare: '3' }), field: 'formulationsToCompare' },
    { tool: 'design_be_study', input: changed(study, { formulationsToCompare: 1 }), field: 'formulationsToCompare' },
    { tool: 'design_be_study', input: changed(study, { drugName: 5 }), field: 'drugName' },
    { tool: 'assess_dissolution_similarity', input: changed(dissolution, { reference: 'x' }), field: 'reference' },
    { tool: 'assess_dissolution_similarity', input: changed(dissolution, { reference: { ...profile([40, 60, 80]), meanDissolved: ['40', '60', '80'] } }), field: 'reference.meanDissolved' },
    { tool: 'assess_dissolution_similarity', input: changed(dissolution, { test: { ...profile([42, 61, 79]), timePoints_min: 'abc' } }), field: 'test.timePoints_min' },
    { tool: 'assess_dissolution_similarity', input: changed(dissolution, { reference: { ...profile([40, 60, 80]), rsdPercent: [5, 5] } }), field: 'reference.rsdPercent' },
    { tool: 'assess_dissolution_similarity', input: changed(dissolution, { unitsPerProduct: '12' }), field: 'unitsPerProduct' },
    { tool: 'assess_biowaiver', input: changed(biowaiver, { bcsClass: 'Class I' }), field: 'bcsClass' },
    { tool: 'assess_biowaiver', input: changed(biowaiver, { framework: 'ICH' }), field: 'framework' },
    { tool: 'assess_biowaiver', input: changed(biowaiver, { f2: '60' }), field: 'f2' },
    { tool: 'assess_biowaiver', input: changed(biowaiver, { f2: 150 }), field: 'f2' },
    { tool: 'assess_biowaiver', input: changed(biowaiver, { doseSolubilityRatioAtPH6_8_mL: 0 }), field: 'doseSolubilityRatioAtPH6_8_mL' },
    { tool: 'assess_biowaiver', input: changed(biowaiver, { dosageForm: 5 }), field: 'dosageForm' },
    { tool: 'guidance_for_anda', input: changed(anda, { bcsClass: 'Class I' }), field: 'bcsClass' },
    { tool: 'guidance_for_anda', input: changed(anda, { strengths: '50 mg' }), field: 'strengths' },
    { tool: 'guidance_for_anda', input: changed(anda, { strengths: [50] }), field: 'strengths' },
  ].map((c, i) => ({ ...c, n: i + 1 })))('$tool refuses $field (case $n)', async ({ tool, input, field }) => {
    await refused(tool, input, 'invalid_input', field);
  });
});

describe('a required input that is not stated is asked for by name', () => {
  it.each([
    { tool: 'classify_bcs', input: {}, field: 'highestDoseStrength_mg' },
    { tool: 'design_be_study', input: {}, field: 'withinSubjectCV' },
    { tool: 'assess_dissolution_similarity', input: {}, field: 'reference' },
    { tool: 'assess_biowaiver', input: { dosageForm: 'tablet' }, field: 'bcsClass' },
    { tool: 'assess_biowaiver', input: { bcsClass: 'I' }, field: 'dosageForm' },
    { tool: 'guidance_for_anda', input: {}, field: 'activeIngredient' },
  ].map((c, i) => ({ ...c, n: i + 1 })))('$tool asks for $field (case $n)', async ({ tool, input, field }) => {
    await refused(tool, input, 'missing_input', field);
  });
});

describe('classify_bcs decides no eligibility an unstated drug name or dosage form could change', () => {
  const data = { highestDoseStrength_mg: 100, solubility_mg_per_mL: 1, fractionAbsorbed: 0.9 };
  it('leaves eligibility and NTI status null without a drug name or form, and says so', () => {
    const out = classifyBCS(data as never);
    expect(out).toMatchObject({ bcsClass: 'I', biowaiverEligible: null, isNTI: null });
    expect(out).toMatchObject({ ntiBasis: expect.stringMatching(/no drug name was given/) });
    expect(out.biowaiverRationale[0]).toMatch(/drugName and dosageForm are not stated, so eligibility is not assessed/);
  });
  it('keeps an ineligible class ineligible, and says where an NTI answer came from', () => {
    expect(classifyBCS({ ...data, fractionAbsorbed: 0.5, solubility_mg_per_mL: 0.01 } as never).biowaiverEligible).toBe(false);
    expect(classifyBCS(changed(bcs, {}))).toMatchObject({ ntiBasis: expect.stringMatching(/not on the platform's NTI list, which is not exhaustive/) });
    expect(classifyBCS(changed(bcs, { drugName: 'warfarin' }))).toMatchObject({ isNTI: true, biowaiverEligible: false });
  });
  it('does not read a modified-release form as immediate release', () => {
    expect(classifyBCS(changed(bcs, { dosageForm: 'extended-release tablet' })).biowaiverEligible).toBe(false);
  });
});

describe('design_be_study sizes nothing from an unstated NTI status, and says what it defaulted', () => {
  const data = { withinSubjectCV: 25, halfLife_hours: 10 };
  it('leaves the criteria and the sample size null with no isNTI and no drug name', () => {
    const out = designBEStudy(data as never);
    expect(out).toMatchObject({ isNTI: null, acceptanceCriteria: null, estimatedSampleSize: { perGroup: null, total: null } });
    expect(out.additionalRequirements[0]).toMatch(/^isNTI is not stated/);
    expect(out.defaultsApplied).toEqual([
      'expectedGMR not stated: 100% used.', 'targetPower not stated: 0.80 used.',
      'formulationsToCompare not stated: 2 (test vs. reference) used.',
    ]);
    expect(out.studyConditions.join(' ')).toMatch(/fedStudyRequired is not stated/);
    expect(designBEStudy({ ...data, fedStudyRequired: null } as never).studyConditions.join(' ')).toMatch(/fedStudyRequired is not stated/);
  });
  it('takes NTI status from the list only when isNTI is not stated, and names a stated false for a listed drug as a conflict', () => {
    const conflict = designBEStudy({ ...data, drugName: 'warfarin', isNTI: false } as never);
    expect(conflict).toMatchObject({
      isNTI: null, acceptanceCriteria: null, estimatedSampleSize: { perGroup: null, total: null }, inputStates: { isNTI: false },
      ntiBasis: expect.stringMatching(/^isNTI is stated false, but warfarin is on the platform's NTI list: the two conflict/),
    });
    expect(conflict.additionalRequirements[0]).toMatch(/^isNTI is stated false, but warfarin is on the platform's NTI list: for an NTI drug/);
    expect(conflict.washoutPeriod.minimum_hours).toBe(50);
    expect(designBEStudy({ ...data, drugName: 'warfarin', isNTI: true } as never)).toMatchObject({ isNTI: true, ntiBasis: 'isNTI was stated.' });
    expect(designBEStudy({ ...data, drugName: 'warfarin' } as never).isNTI).toBe(true);
    expect(designBEStudy({ ...data, drugName: 'metoprolol' } as never)).toMatchObject({ ntiBasis: expect.stringMatching(/treated as not NTI/) });
  });
  it('sizes the stated power, and computes no sample size for a GMR outside the limits', () => {
    const total = (targetPower: number) => designBEStudy({ ...data, withinSubjectCV: 30, isNTI: false, targetPower } as never).estimatedSampleSize.total;
    expect([total(0.8), total(0.85), total(0.9), total(0.95)]).toEqual([44, 50, 60, 76]);
    expect(designBEStudy({ ...data, isNTI: false, expectedGMR: 130 } as never).estimatedSampleSize).toMatchObject({
      perGroup: null, total: null, basis: expect.stringMatching(/outside the acceptance limits/) });
  });
  it('treats a delayed-release, enteric-coated or ER form as modified release', () => {
    for (const dosageForm of ['delayed-release capsule', 'enteric-coated tablet', 'ER tablet']) {
      expect(designBEStudy({ ...data, isNTI: false, dosageForm } as never).additionalRequirements.join(' '), dosageForm)
        .toMatch(/Modified-release product/);
    }
  });
});

describe('assess_dissolution_similarity reports no pass or fail when f2 is not computed', () => {
  it('is null, not false, without a unit count', () => {
    const out = assessDissolutionSimilarity({ reference: profile([40, 60, 80]), test: profile([42, 61, 79]) } as never);
    expect(out).toMatchObject({ f2: null, f2Pass: null, f1: null, f1Pass: null });
    expect(out.interpretation).toMatch(/^f2 was NOT computed/);
  });
});

describe('assess_biowaiver decides only what every answer to the unstated facts gives', () => {
  const tablet = { dosageForm: 'immediate-release tablet', drugName: 'metoprolol' };
  it('denies Class II under every framework: ICH M9 has no weak-acid exception', () => {
    for (const framework of [undefined, 'ich_m9', 'ema', 'fda', 'who']) {
      const out = assessBiowaiver({
        ...tablet, bcsClass: 'II', isNTI: false, isWeakAcid: true, doseSolubilityRatioAtPH6_8_mL: 200, veryRapidlyDissolving: true,
        ...(framework ? { framework } : {}),
      } as never);
      expect(out, String(framework)).toMatchObject({ decision: 'BIOWAIVER_DENIED', eligible: false });
      expect(out.citations.join(' ')).not.toMatch(/IIa/);
    }
    expect(assessBiowaiver({ ...tablet, bcsClass: 'II', doseSolubilityRatioAtPH6_8_mL: 200 } as never).defaultsApplied)
      .toEqual(['framework not stated: ich_m9 used.']);
  });
  it('does not grant Class III to a product that is only rapidly dissolving, whatever its f2', () => {
    const out = assessBiowaiver({
      ...tablet, bcsClass: 'III', isNTI: false, veryRapidlyDissolving: false, rapidlyDissolving: true, referenceVeryRapidlyDissolving: true,
      excipientsQualitativelySame: true, excipientsQuantitativelySimilar: true, f2: 65, framework: 'ich_m9',
    } as never);
    expect(out).toMatchObject({ decision: 'BIOWAIVER_CONDITIONAL', eligible: false });
    expect(out.outstandingRequirements.join(' ')).toMatch(/very rapidly dissolving .* for BOTH test and reference/);
  });
  it('does not grant with no NTI answer and no drug name, and names it', () => {
    const out = assessBiowaiver({ bcsClass: 'I', dosageForm: 'tablet', veryRapidlyDissolving: true, referenceVeryRapidlyDissolving: true } as never);
    expect(out).toMatchObject({ decision: 'BIOWAIVER_NOT_ASSESSED', eligible: null });
    expect(out.rationale[0]).toMatch(/^Not assessed: isNTI is not stated/);
    // Nothing in a result that is not assessed speaks for one answer: no "eligible", no "biowaiver granted" citation.
    expect(out.rationale.join(' ')).not.toMatch(/eligible for biowaiver/);
    expect(out.citations.join(' ')).not.toMatch(/granted/);
  });
  it('denies a modified-release form, and names a stated NTI false for a listed drug as a conflict', () => {
    for (const dosageForm of ['extended-release tablet', 'enteric-coated tablet', 'XR tablet']) {
      expect(assessBiowaiver(changed(biowaiver, { dosageForm })).decision, dosageForm).toBe('BIOWAIVER_DENIED');
    }
    const conflict = assessBiowaiver(changed(biowaiver, { drugName: 'warfarin' }));
    expect(conflict).toMatchObject({ decision: 'BIOWAIVER_NOT_ASSESSED', eligible: null, inputStates: { isNTI: false } });
    expect(conflict.rationale[0]).toMatch(/^Not assessed: isNTI is stated false, but warfarin is on the platform's NTI list, and the decision turns on it/);
    expect(conflict.outstandingRequirements[0]).toMatch(/^Confirm NTI status and state isNTI/);
    // A decision every reading gives is kept: Class IV is denied whether or not warfarin is NTI.
    expect(assessBiowaiver(changed(biowaiver, { drugName: 'warfarin', bcsClass: 'IV' }))).toMatchObject({ decision: 'BIOWAIVER_DENIED' });
  });
  it('keeps a decision the stated facts settle, with an omitted f2 outstanding', () => {
    const out = assessBiowaiver({ ...tablet, bcsClass: 'I', veryRapidlyDissolving: true, referenceVeryRapidlyDissolving: false } as never);
    expect(out.decision).toBe('BIOWAIVER_CONDITIONAL');
    expect(out.outstandingRequirements.join(' ')).toMatch(/REFERENCE product/);
  });
});

describe('guidance_for_anda chooses no pathway an unstated sameness fact could change', () => {
  const texts = { activeIngredient: 'metoprolol', dosageForm: 'tablet', routeOfAdministration: 'oral', strengths: ['50 mg'] };
  it('leaves the pathway not assessed and names the facts', () => {
    const out = guidanceForANDA(texts as never);
    expect(out).toMatchObject({ recommendedPathway: 'not_assessed', pathwayGuidance: null, suitabilityPetitionRequired: null });
    expect(out.suitabilityPetitionReason).toMatch(/^Not assessed: sameDosageFormAsRLD, sameRouteAsRLD and sameStrengthAsRLD are not stated/);
    expect(guidanceForANDA({ ...texts, sameRouteAsRLD: true } as never).recommendedPathway).toBe('not_assessed');
  });
  it('keeps a pathway the stated facts settle', () => {
    expect(guidanceForANDA({ ...texts, sameRouteAsRLD: false } as never).recommendedPathway).toBe('505b2');
    const petition = guidanceForANDA({ ...texts, sameRouteAsRLD: true, sameDosageFormAsRLD: false } as never);
    expect(petition).toMatchObject({ recommendedPathway: 'suitability_petition', suitabilityPetitionRequired: true });
    expect(petition.suitabilityPetitionReason).toMatch(/different dosage form/);
    expect(petition.suitabilityPetitionReason).not.toMatch(/different strength/);
  });
  it('names an unstated BCS class and combination fact, and takes NTI status from the active ingredient as the other worksheets do', () => {
    const same = { ...texts, sameRouteAsRLD: true, sameDosageFormAsRLD: true, sameStrengthAsRLD: true };
    const out = guidanceForANDA(same as never);
    expect(out.beStrategyRecommendation.join(' ')).toMatch(/bcsClass is not stated/);
    expect(out.orangeBookConsiderations.join(' ')).toMatch(/isCombinationProduct is not stated/);
    expect(out.ntiBasis).toMatch(/metoprolol is not on the platform's NTI list, which is not exhaustive/);
    expect(guidanceForANDA({ ...same, activeIngredient: 'warfarin' } as never).beStrategyRecommendation.join(' ')).toMatch(/^.*NTI drug: tighter BE acceptance criteria/);
    expect(guidanceForANDA({ ...same, activeIngredient: 'warfarin', isNTI: false } as never).beStrategyRecommendation.join(' '))
      .toMatch(/isNTI is stated false, but warfarin is on the platform's NTI list: for an NTI drug/);
  });
});

describe('the five definitions say what an omitted fact means, within the trimmed length', () => {
  const def = (tool: string) => BIOEQUIVALENCE_TOOLS.find(t => t.name === tool)!;
  const props = (tool: string) => def(tool).input_schema.properties as Record<string, { description: string }>;

  it.each(families)('$tool', ({ tool, flags }) => {
    expect(def(tool).description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    expect(def(tool).description).toMatch(/relay the validation error/);
    for (const field of flags) {
      expect(def(tool).input_schema.required).not.toContain(field);
      expect(props(tool)[field].description, field).toMatch(/Omitted or null stays not_stated/);
    }
    for (const p of Object.values(props(tool))) expect(p.description).not.toMatch(/Default (false|true|100|0\.80)|\(default/);
  });

  it('points recorded profiles to compare_recorded_dissolution, and names the input no function reads', () => {
    expect(def('assess_dissolution_similarity').description).toMatch(/for recorded profiles use compare_recorded_dissolution/i);
    expect(props('guidance_for_anda').routeOfAdministration.description).toMatch(/Not read/);
    expect(def('guidance_for_anda').input_schema.required).not.toContain('routeOfAdministration');
    expect(props('assess_biowaiver').isWeakAcid.description).toMatch(/not read: ICH M9 has no BCS Class II weak-acid exception/);
    expect(def('assess_biowaiver').description).not.toMatch(/IIa/);
  });

  it.each([
    ['classify_bcs', 'Classify this drug substance under the Biopharmaceutics Classification System'],
    ['design_be_study', 'Design a bioequivalence study for a highly variable drug with CV 45%'],
    ['assess_dissolution_similarity', 'Compute f2 for these test and reference dissolution profiles'],
    ['assess_biowaiver', 'Can we get a biowaiver for our BCS Class III tablet?'],
    ['guidance_for_anda', 'Should we file an ANDA or a 505(b)(2) for our generic?'],
  ])('keeps %s among the tools selected for "%s"', (tool, prompt) => {
    expect(selectToolsForTurn(ALL_ANA_TOOLS, prompt, { maxTools: 50 }).map(t => t.name)).toContain(tool);
  });
});
