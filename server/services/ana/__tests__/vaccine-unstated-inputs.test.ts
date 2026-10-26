/** S5a: vaccine worksheets separate stated product facts from platform references. */
import { describe, expect, it } from 'vitest';
import {
  designVaccineCMC, assessCorrelateOfProtection, designVaccineClinicalProgram,
  assessLotConsistency, assessVaccinePlatform, planVaccineSpecialPopulations,
} from '../../vaccine/vaccine-knowledge';
import { getToolHandler } from '../AnaToolExecutor';

const cmc = {
  platform: 'protein_subunit', antigenName: 'Synthetic antigen', multivalent: true, numberOfValences: 4,
  adjuvanted: true, adjuvantName: 'aluminium hydroxide', lyophilized: false, framework: 'fda',
} satisfies Parameters<typeof designVaccineCMC>[0];
const correlate = {
  pathogen: 'Synthetic pathogen', immuneMarker: 'Synthetic neutralizing antibody', proposedThreshold: '1:80',
  protectionMechanismKnown: true, markerDirectlyProtective: true, hasEfficacyDataLinkingMarker: true,
  intendedUse: 'immunobridging', framework: 'fda',
} satisfies Parameters<typeof assessCorrelateOfProtection>[0];
const clinical = {
  platform: 'mrna', pathogen: 'Synthetic virus', hasEstablishedCorrelate: true, efficacyFeasible: false,
  noveltyIsHigh: false, targetPopulation: 'adults', diseaseSeriousness: 'serious', framework: 'fda',
} satisfies Parameters<typeof designVaccineClinicalProgram>[0];
const lots = {
  numberOfLots: 3, immunogenicityMarker: 'Neutralizing antibody GMT', expectedGMT: 100,
  assumedSdLog: 0.75, equivalenceMarginLower: 0.5, equivalenceMarginUpper: 2, targetPower: 0.9, framework: 'fda',
} satisfies Parameters<typeof assessLotConsistency>[0];
const platform = {
  platform: 'protein_subunit', priorLicensedProductOnPlatform: true, sameBackboneDifferentAntigen: true,
  intendedPopulation: 'general', framework: 'fda',
} satisfies Parameters<typeof assessVaccinePlatform>[0];
const special = {
  population: 'pediatric', platform: 'protein_subunit', adultDataAvailable: true, hasCorrelate: true,
  diseaseSeriousness: 'serious', framework: 'fda',
} satisfies Parameters<typeof planVaccineSpecialPopulations>[0];

const families = [
  { tool: 'design_vaccine_cmc', compute: designVaccineCMC, input: cmc, flags: ['multivalent', 'adjuvanted', 'lyophilized'] },
  { tool: 'assess_correlate_of_protection', compute: assessCorrelateOfProtection, input: correlate,
    flags: ['protectionMechanismKnown', 'markerDirectlyProtective', 'hasEfficacyDataLinkingMarker'] },
  { tool: 'design_vaccine_clinical_program', compute: designVaccineClinicalProgram, input: clinical,
    flags: ['hasEstablishedCorrelate', 'efficacyFeasible', 'noveltyIsHigh'] },
  { tool: 'assess_vaccine_platform', compute: assessVaccinePlatform, input: platform,
    flags: ['priorLicensedProductOnPlatform', 'sameBackboneDifferentAntigen'] },
  { tool: 'plan_vaccine_special_populations', compute: planVaccineSpecialPopulations, input: special,
    flags: ['adultDataAvailable', 'hasCorrelate'] },
];
const tools = [...families, { tool: 'assess_lot_consistency', compute: assessLotConsistency, input: lots, flags: [] }];

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101, userId: 7 } as never));
}

describe('all six existing vaccine tools retain explicit worksheet results', () => {
  it.each(tools)('$tool reaches its canonical engine with a stated basis', async ({ tool, input }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', engine: 'deterministic', basis: 'stated', appliesTo: 'the inputs stated in this conversation',
    });
  });
});

describe.each(families)('$tool preserves the boolean answers', ({ tool, compute, input, flags }) => {
  it.each(flags)('%s is not inferred or coerced when omitted, null or malformed', async field => {
    for (const absent of [undefined, null]) {
      expect(compute(changed(input, { [field]: absent }))).toMatchObject({ inputStates: { [field]: 'not_stated' } });
    }
    for (const answer of [true, false]) {
      const overrides = field === 'multivalent' && answer === false ? { numberOfValences: 1 }
        : field === 'adjuvanted' && answer === false ? { adjuvantName: undefined } : {};
      expect(compute(changed(input, { ...overrides, [field]: answer })))
        .toMatchObject({ inputStates: { [field]: answer } });
    }
    for (const value of ['false', 0, 1]) {
      const out = await run(tool, changed(input, { [field]: value }));
      expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
      expect(out).not.toHaveProperty('basis');
    }
  });
});

describe('vaccine CMC does not infer formulation attributes from a platform profile', () => {
  it('withholds product formulation when the three deciding flags are unanswered', () => {
    const out = designVaccineCMC(changed(cmc, { multivalent: undefined, numberOfValences: undefined,
      adjuvanted: undefined, adjuvantName: undefined, lyophilized: undefined }));
    expect(out).toMatchObject({ valences: null, drugProduct: null, platformReference: { basis: 'reference_only' },
      adjuvantStrategy: { adjuvanted: null, recommendedAdjuvant: null } });
    const factual = out.cmcModules.flatMap(module => module.expectations)
      .filter(text => !/reference|\bif\b|\bwhen\b/i.test(text)).join(' ');
    expect(factual).not.toMatch(/Monovalent product:|No added adjuvant:|Liquid presentation:|Lyophilized presentation:/);
  });
  it('does not invent two valences when multivalence is stated without its count', () => {
    expect(designVaccineCMC(changed(cmc, { numberOfValences: undefined }))).toMatchObject({ valences: null, drugProduct: null });
  });
  it('does not substitute a platform-typical adjuvant when its name was not stated', () => {
    expect(designVaccineCMC(changed(cmc, { adjuvantName: undefined })))
      .toMatchObject({ adjuvantStrategy: { adjuvanted: true, recommendedAdjuvant: null } });
  });
  it('keeps explicit valences and the actual stated adjuvant', () => {
    expect(designVaccineCMC(cmc)).toMatchObject({ valences: 4,
      adjuvantStrategy: { adjuvanted: true, recommendedAdjuvant: 'aluminium hydroxide' } });
  });
  it('does not contradict an explicit nonadjuvanted liquid formulation with platform prose', () => {
    const out = designVaccineCMC(changed(cmc, { multivalent: false, numberOfValences: 1,
      adjuvanted: false, adjuvantName: undefined }));
    expect(out).toMatchObject({ valences: 1, adjuvantStrategy: { adjuvanted: false } });
    const factual = out.cmcModules.flatMap(module => module.expectations)
      .filter(text => !/reference|\bif\b|\bwhen\b/i.test(text)).join(' ');
    expect(`${out.drugProduct} ${factual}`).not.toMatch(/co-formulated with an adjuvant|Lyophilized presentation:/i);
    expect(`${out.drugProduct} ${factual}`).not.toMatch(/self-adjuvanting mechanism/i);
  });
  it('does not select liquid or lyophilized stability studies from unknown presentation', () => {
    const out = designVaccineCMC(changed(cmc, { lyophilized: undefined }));
    expect(out.drugProduct).toBeNull();
    const factual = out.stability.designConditions.filter(text => !/reference|\bif\b|\bwhen\b/i.test(text)).join(' ');
    expect(factual).not.toMatch(/for lyophilized presentations|Liquid presentation|Lyophilized presentation/i);
  });
});

describe('correlate registry entries remain references rather than product validation', () => {
  it('does not fill any actual marker, threshold or type from a known pathogen', () => {
    expect(assessCorrelateOfProtection({ pathogen: 'hepatitis B' })).toMatchObject({
      immuneMarker: null, thresholdAssessment: null, copType: 'not_assessed', intendedUseAssessment: null,
      matchedKnownCorrelate: { pathogen: 'hepatitis b', basis: 'reference_only' },
    });
  });
  it.each(['protectionMechanismKnown', 'markerDirectlyProtective'])('does not classify CoP with %s unstated', field => {
    expect(assessCorrelateOfProtection(changed(correlate, { [field]: undefined, pathogen: 'hepatitis B' })).copType)
      .toBe('not_assessed');
  });
  it.each([
    { mechanism: true, protective: true, type: 'mechanistic_absolute' },
    { mechanism: true, protective: false, type: 'mechanistic_relative' },
    { mechanism: false, protective: true, type: 'nonmechanistic_absolute' },
    { mechanism: false, protective: false, type: 'nonmechanistic_relative' },
  ])('preserves nomenclature for explicitly stated $type flags', ({ mechanism, protective, type }) => {
    expect(assessCorrelateOfProtection({ ...correlate, protectionMechanismKnown: mechanism, markerDirectlyProtective: protective }).copType).toBe(type);
  });
  it('does not call missing efficacy linkage absent or infer it from the registry', () => {
    const out = assessCorrelateOfProtection(changed(correlate, { pathogen: 'hepatitis B', hasEfficacyDataLinkingMarker: undefined }));
    expect(out.surrogateEndpointUsability).toMatch(/not assessed|not stated|unknown/i);
    expect(out.surrogateEndpointUsability).not.toMatch(/^(?:Potentially )?Usable/i);
    expect(out.validationGaps.join(' ')).not.toMatch(/No efficacy dataset linking/i);
  });
  it('does not endorse bridging when efficacy linkage was explicitly ruled out', () => {
    const out = assessCorrelateOfProtection({ ...correlate, hasEfficacyDataLinkingMarker: false });
    expect(out.surrogateEndpointUsability).toMatch(/not usable|cannot|not supported/i);
  });
  it('does not pronounce validation complete from three positive boolean answers', () => {
    const out = assessCorrelateOfProtection(correlate);
    expect(out.validationGaps.join(' ')).not.toMatch(/No major gaps identified/i);
    expect(out.validationGaps.join(' ')).toMatch(/assay|Prentice|validation/i);
  });
  it('retains stated marker and threshold text even when they differ from a registry entry', () => {
    const out = assessCorrelateOfProtection({ ...correlate, pathogen: 'hepatitis B' });
    expect(out.immuneMarker).toBe(correlate.immuneMarker);
    expect(out.thresholdAssessment).toContain(correlate.proposedThreshold);
  });
});

describe('vaccine clinical pathways require the deciding facts', () => {
  it.each(['hasEstablishedCorrelate', 'efficacyFeasible'])('does not select Phase 3 with %s unstated', field => {
    const out = designVaccineClinicalProgram(changed(clinical, { [field]: undefined }));
    expect(out).toMatchObject({ pathwayAssessment: 'not_assessed' });
    expect(out.efficacyVsImmunobridging).toMatch(/^Not assessed/);
    const phase3 = out.phases.find(phase => /Phase 3/.test(phase.phase))!;
    expect(phase3).toBeDefined();
    expect(phase3.phase).not.toMatch(/^Phase 3 \((?:efficacy|immunobridging)/i);
    expect(phase3.endpoints).not.toContain('Vaccine efficacy (attack-rate reduction)');
    expect(phase3.endpoints).not.toContain('Immunogenicity non-inferiority/superiority');
  });
  it('keeps a complete immunobridging worksheet without deciding accelerated approval', () => {
    const out = designVaccineClinicalProgram(clinical);
    expect(out).toMatchObject({ pathwayAssessment: 'assessed', acceleratedApprovalEligibility: null });
    expect(out.efficacyVsImmunobridging).toMatch(/immunobridging/i);
  });
  it('does not select safety-database expectations from omitted disease seriousness', () => {
    expect(designVaccineClinicalProgram(changed(clinical, { diseaseSeriousness: undefined })).safetyDatabaseExpectation).toBeNull();
  });
  it('reports novelty-specific follow-up as unassessed rather than silently routine', () => {
    const out = designVaccineClinicalProgram(changed(clinical, { noveltyIsHigh: undefined }));
    expect(out.notes.map(note => note.message).join(' ')).toMatch(/noveltyIsHigh.*not stated/i);
  });
});

describe('vaccine platform references do not determine product eligibility', () => {
  it('does not grade product prior knowledge from missing licensing and backbone evidence', () => {
    const out = assessVaccinePlatform(changed(platform, { priorLicensedProductOnPlatform: undefined, sameBackboneDifferentAntigen: undefined }));
    expect(out).toMatchObject({ priorKnowledgeStrength: 'not_assessed', nonclinicalLeverage: null,
      platformMasterFileEligible: null, platformReference: { basis: 'reference_only' } });
    expect(out.priorKnowledgeLeverage.join(' ')).not.toMatch(/No prior-product leverage assumed|treat as a de-novo/i);
  });
  it('does not determine platform-master-file eligibility even with both product answers stated', () => {
    const out = assessVaccinePlatform(platform);
    expect(out).toMatchObject({ platformMasterFileEligible: null, platformReference: { basis: 'reference_only' } });
    expect(out.platformMasterFileGuidance).not.toMatch(/^Eligible for/i);
  });
  it('does not assume a general population for a suitability conclusion', () => {
    expect(assessVaccinePlatform(changed(platform, { intendedPopulation: undefined })).populationSuitability).toBeNull();
  });
  it('does not declare all viral vectors replication competent', () => {
    const out = assessVaccinePlatform({ ...platform, platform: 'viral_vector' });
    expect(out.populationSuitability).not.toMatch(/^Replicating platform/i);
  });
});

describe('special-population strategies do not invent the platform or source evidence', () => {
  it('keeps an unstated platform unknown while preserving general population guidance', () => {
    const out = planVaccineSpecialPopulations(changed(special, { platform: undefined }));
    expect(out).toMatchObject({ platform: 'not_stated' });
    expect(out.strategies.length).toBeGreaterThan(0);
    expect(out.notes.map(note => note.message).join(' ')).toMatch(/platform.*not stated|platform.*not assessed/i);
  });
  it.each(['pediatric', 'pregnancy'])('does not choose a %s endpoint without correlate status', population => {
    const out = planVaccineSpecialPopulations(changed(special, { population, hasCorrelate: undefined }));
    expect(out.bridgingApproach).toBeNull();
    expect(out.strategies[0].endpoint).toBeNull();
  });
  it('does not claim pediatric source evidence exists or requires de novo work when it was not stated', () => {
    const out = planVaccineSpecialPopulations(changed(special, { adultDataAvailable: undefined }));
    expect(out.strategies[0].strategy.join(' ')).not.toMatch(/Generate de-novo pediatric|Immunobridge from adult\/adolescent/i);
  });
  it('retains a stated lack of adult data and a stated lack of correlate', () => {
    const out = planVaccineSpecialPopulations({ ...special, adultDataAvailable: false, hasCorrelate: false });
    expect(out.strategies[0].strategy.join(' ')).toMatch(/de.novo/i);
    expect(out.strategies[0].endpoint).toMatch(/efficacy|clinical/i);
  });
  it('does not withhold general elderly guidance for irrelevant unknown pediatric data', () => {
    const out = planVaccineSpecialPopulations(changed(special, { population: 'elderly',
      adultDataAvailable: undefined, hasCorrelate: undefined }));
    expect(out.strategies[0].population).toMatch(/Elderly/);
    expect(out.strategies[0].endpoint).toBeTypeOf('string');
  });
});

describe('vaccine runtime context rejects unsupported branches', () => {
  it('requires a recognized platform in the three tools that require it', async () => {
    for (const { tool, input } of [families[0], families[2], families[3]]) {
      for (const absent of [undefined, null]) {
        expect(await run(tool, changed(input, { platform: absent })))
          .toMatchObject({ status: 'needs_parameters', code: 'missing_input', field: 'platform' });
      }
    }
  });
  it('rejects an unknown platform instead of selecting protein subunit', async () => {
    for (const { tool, input } of [families[0], families[2], families[3], families[4]]) {
      expect(await run(tool, changed(input, { platform: 'unrecognized platform' })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'platform' });
    }
  });
  it('rejects unsupported frameworks across all six wrappers', async () => {
    for (const { tool, input } of tools) {
      expect(await run(tool, changed(input, { framework: 'unrecognized' })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'framework' });
    }
  });
  it('rejects supplied invalid optional enum values without taking an implicit branch', async () => {
    for (const [tool, input, field] of [
      ['assess_correlate_of_protection', correlate, 'intendedUse'],
      ['design_vaccine_clinical_program', clinical, 'diseaseSeriousness'],
      ['design_vaccine_clinical_program', clinical, 'targetPopulation'],
      ['assess_vaccine_platform', platform, 'intendedPopulation'],
      ['plan_vaccine_special_populations', special, 'diseaseSeriousness'],
    ] as const) {
      expect(await run(tool, changed(input, { [field]: 'unrecognized' })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
    }
  });
  it('requires a valid special population instead of returning an empty strategy', async () => {
    for (const absent of [undefined, null]) {
      expect(await run('plan_vaccine_special_populations', changed(special, { population: absent })))
        .toMatchObject({ status: 'needs_parameters', code: 'missing_input', field: 'population' });
    }
    expect(await run('plan_vaccine_special_populations', changed(special, { population: 'unrecognized' })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'population' });
  });
  it('rejects malformed or contradictory valence counts', async () => {
    for (const count of [0, -1, 1.5, NaN, Infinity, '4']) {
      expect(await run('design_vaccine_cmc', changed(cmc, { numberOfValences: count })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'numberOfValences' });
    }
    expect(await run('design_vaccine_cmc', { ...cmc, multivalent: false }))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'numberOfValences' });
  });
});

describe('lot-consistency planning discloses defaults and validates its supported arithmetic', () => {
  it('preserves the explicit symmetric 3-lot planning calculation', () => {
    expect(assessLotConsistency(lots)).toMatchObject({ numberOfLots: 3,
      equivalenceMarginGMTRatio: { lower: 0.5, upper: 2 }, perGroupSampleSizeEstimate: 26,
      totalSampleSizeEstimate: 78, defaultsApplied: [] });
  });
  it('names every omitted numeric planning default rather than calling it stated', () => {
    expect(assessLotConsistency({})).toMatchObject({ numberOfLots: 3,
      equivalenceMarginGMTRatio: { lower: 0.5, upper: 2 }, perGroupSampleSizeEstimate: 26, totalSampleSizeEstimate: 78,
      defaultsApplied: expect.arrayContaining(['numberOfLots', 'assumedSdLog', 'equivalenceMarginLower', 'equivalenceMarginUpper', 'targetPower']) });
  });
  it.each([
    { field: 'numberOfLots', values: [1, 6, 2.5, NaN, Infinity] },
    { field: 'assumedSdLog', values: [0, -1, NaN, Infinity] },
    { field: 'expectedGMT', values: [0, -1, NaN, Infinity] },
    { field: 'equivalenceMarginLower', values: [0, -1, 1, NaN, Infinity] },
    { field: 'equivalenceMarginUpper', values: [0, 1, -1, NaN, Infinity] },
    { field: 'targetPower', values: [0, 1, -1, NaN, Infinity] },
  ])('refuses unsupported $field rather than clamping or emitting nonfinite numbers', async ({ field, values }) => {
    for (const value of values) {
      expect(await run('assess_lot_consistency', changed(lots, { [field]: value })))
        .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
    }
  });
  it('refuses asymmetric log margins instead of sizing only for the upper margin', async () => {
    expect(await run('assess_lot_consistency', { ...lots, equivalenceMarginLower: 0.8 }))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'equivalenceMarginLower' });
  });
});

describe('supplemental vaccine platform recognition and contradictory facts', () => {
  it('does not recognize an incidental live substring as a live vaccine platform', async () => {
    expect(await run('assess_vaccine_platform', { ...platform, platform: 'delivery system' }))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'platform' });
  });
  it('preserves supported explicit platform aliases including vector identifiers with digits', async () => {
    for (const [alias, expected] of [
      ['mRNA-LNP', 'mrna'], ['adenovirus vector', 'viral_vector'],
      ['recombinant protein subunit', 'protein_subunit'], ['live attenuated', 'live_attenuated'],
      ['Ad26', 'viral_vector'],
    ]) {
      expect(await run('assess_vaccine_platform', { ...platform, platform: alias }))
        .toMatchObject({ status: 'computed', result: { platform: expected } });
    }
  });
  it('refuses a named actual adjuvant when the product is explicitly nonadjuvanted', async () => {
    const out = await run('design_vaccine_cmc', { ...cmc, adjuvanted: false });
    expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'adjuvantName' });
    expect(out).not.toHaveProperty('basis');
  });
  it('does not categorize an unspecified viral-vector replication status as live in pregnancy', () => {
    const out = planVaccineSpecialPopulations({ ...special, population: 'pregnancy', platform: 'viral_vector' });
    const cautions = out.strategies[0].cautions.join(' ');
    expect(cautions).not.toMatch(/Live\/replicating platforms/i);
    expect(cautions).toMatch(/replication|replicating/i);
  });
  it.each([undefined, false])('does not endorse a pediatric source bridge with adult data %j', adultDataAvailable => {
    for (const population of ['pediatric', 'all']) {
      const out = planVaccineSpecialPopulations(changed(special, { population, adultDataAvailable }));
      expect(out.bridgingApproach).toBeNull();
    }
  });
});

describe('supplemental vaccine reference text follows its stated scope', () => {
  it('does not call every supported reciprocal equivalence margin two-fold', () => {
    const out = assessLotConsistency({ ...lots, equivalenceMarginLower: 0.8, equivalenceMarginUpper: 1.25 });
    expect(out.equivalenceMarginGMTRatio).toEqual({ lower: 0.8, upper: 1.25 });
    expect(out.perGroupSampleSizeEstimate).toBeGreaterThan(26);
    expect(out.assumptions.join(' ')).not.toMatch(/two.fold/i);
  });
  it('does not infer adult-equivalent maternal dosing without dose evidence', () => {
    const out = planVaccineSpecialPopulations({ ...special, population: 'pregnancy' });
    expect(out.strategies[0].dosing).not.toMatch(/Typically the adult dose/i);
    expect(out.strategies[0].dosing).toMatch(/dose.*not assessed|product.specific evidence/i);
  });
  it('qualifies platform cold-chain prose as a reference rather than established product storage', () => {
    const out = designVaccineCMC(cmc);
    expect(out.stability.storageRecommendation).toMatch(/reference only/i);
    expect(out.stability.storageRecommendation).toMatch(/not established|not assessed/i);
  });
});

describe('supplemental vaccine clinical combinations preserve both explicit answers', () => {
  it.each([
    { hasEstablishedCorrelate: true, efficacyFeasible: false, path: /Immunobridging pathway/i,
      endpoint: 'Immunogenicity non-inferiority/superiority' },
    { hasEstablishedCorrelate: true, efficacyFeasible: true, path: /Either pathway viable/i,
      endpoint: 'Vaccine efficacy (attack-rate reduction)' },
    { hasEstablishedCorrelate: false, efficacyFeasible: true, path: /Clinical efficacy required/i,
      endpoint: 'Vaccine efficacy (attack-rate reduction)' },
  ])('keeps the known pathway for correlate=$hasEstablishedCorrelate, feasibility=$efficacyFeasible', ({
    hasEstablishedCorrelate, efficacyFeasible, path, endpoint,
  }) => {
    const out = designVaccineClinicalProgram({ ...clinical, hasEstablishedCorrelate, efficacyFeasible });
    expect(out).toMatchObject({ pathwayAssessment: 'assessed',
      inputStates: { hasEstablishedCorrelate, efficacyFeasible }, acceleratedApprovalEligibility: null });
    expect(out.efficacyVsImmunobridging).toMatch(path);
    expect(out.phases.find(phase => /Phase 3/.test(phase.phase))!.endpoints).toContain(endpoint);
  });
  it('does not select an infeasible field-efficacy trial when both prerequisites are explicitly false', () => {
    const out = designVaccineClinicalProgram({ ...clinical, hasEstablishedCorrelate: false, efficacyFeasible: false });
    expect(out).toMatchObject({ pathwayAssessment: 'assessed',
      inputStates: { hasEstablishedCorrelate: false, efficacyFeasible: false }, acceleratedApprovalEligibility: null });
    expect(out.efficacyVsImmunobridging).toMatch(/Challenge/i);
    const phase3 = out.phases.find(phase => /Phase 3/.test(phase.phase))!;
    expect(phase3.phase).not.toMatch(/^Phase 3 \(efficacy/i);
    expect(phase3.objectives).not.toContain('Demonstrate vaccine efficacy against laboratory-confirmed disease.');
    expect(phase3.endpoints).not.toContain('Vaccine efficacy (attack-rate reduction)');
  });
});

describe('vaccine planning precision preserves the assumptions actually used', () => {
  it('does not collapse a tight reciprocal margin into the degenerate interval one to one', () => {
    const lower = 0.9999;
    const upper = 1 / lower;
    const out = assessLotConsistency({ ...lots, equivalenceMarginLower: lower, equivalenceMarginUpper: upper });
    expect(out.equivalenceMarginGMTRatio).toEqual({ lower, upper });
    expect(out.assumptions.join(' ')).toContain('0.9999');
    expect(out.assumptions.join(' ')).not.toMatch(/GMT-ratio margin 1[–-]1\b/);
  });
  it('reports the entered power rather than a rounded power that was not used', () => {
    const out = assessLotConsistency({ ...lots, targetPower: 0.505 });
    expect(out.assumptions.join(' ')).toContain('0.505');
    expect(out.assumptions.join(' ')).not.toContain('Target power: 0.51');
  });
});

// Regression caught while tightening normalization, not an original baseline finding.
describe('compact vaccine platform aliases retain their existing meanings', () => {
  it('preserves all six previously supported compact aliases', () => {
    for (const [alias, expected] of [
      ['messengerrna', 'mrna'], ['selfamplifying', 'mrna'], ['viruslikeparticle', 'vlp'],
      ['polysaccharideprotein', 'conjugate'], ['liveattenuated', 'live_attenuated'], ['wholevirion', 'inactivated'],
    ]) {
      expect(assessVaccinePlatform({ ...platform, platform: alias }).platform, alias).toBe(expected);
    }
  });
  it('preserves specific vectoridentifiers without accepting incidental substrings', () => {
    for (const alias of ['ChAdOx1', 'rVSV', 'ChAdOx1 nCoV-19', 'rVSV-ZEBOV']) {
      expect(assessVaccinePlatform({ ...platform, platform: alias }).platform, alias).toBe('viral_vector');
    }
  });
});
