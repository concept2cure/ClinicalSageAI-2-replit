/**
 * S5d: the benefit-risk worksheets weigh, conclude and frame nothing from a fact
 * nobody stated. An omitted or null true/false input reads as not_stated
 * (inputStates); a verdict, weight, net balance or row conclusion it could change
 * is null or "Not assessed", and undecided names the facts. A malformed value is
 * refused by field. Before this, an omitted unmetMedicalNeed or mitigated read as
 * false and the verdict was given anyway, an omitted manageable read as
 * "Considered manageable", an omitted unmet need beside an approved option read
 * as "Effective alternatives exist", a stated false was overridden when no list
 * was given, and 'true', 'Severe', 'large', a rank '1' or a text for a list was
 * read as another value or crashed.
 */
import { describe, expect, it } from 'vitest';
import {
  assessBenefitRiskBalance, assessBRUncertainty, buildEffectsTable, designValueTree, planBRCommunication,
  structureBenefitRiskFramework,
} from '../../benefit-risk/benefit-risk-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { BENEFIT_RISK_TOOLS } from '../benefitRiskTools';

const framework = {
  productName: 'DrugX', indication: 'metastatic NSCLC', conditionSeverity: 'life_threatening', conditionCourse: 'progressive',
  unmetMedicalNeed: false, currentTreatments: [{ name: 'Docetaxel', status: 'approved' }],
  keyBenefits: [{ description: 'Longer overall survival', endpointType: 'mortality', magnitude: 'high', uncertainty: 'low' }],
  keyRisks: [{ description: 'Neutropenia', severity: 'severe', reversibility: 'partially_reversible', frequency: 'common', uncertainty: 'low', manageable: true }],
};
const effects = {
  productName: 'DrugX', indication: 'metastatic NSCLC', comparator: 'docetaxel',
  effects: [{ name: 'Overall survival', direction: 'favourable', treatmentValue: 12, controlValue: 9, ciLow: 1, ciHigh: 5, magnitude: 'high', uncertainty: 'low', evidenceSource: 'pivotal_rct' }],
};
const balance = {
  productName: 'DrugX', indication: 'metastatic NSCLC', conditionSeverity: 'serious', unmetMedicalNeed: false,
  benefits: [{ name: 'Overall survival', magnitude: 'low', endpointType: 'mortality', uncertainty: 'low' }],
  risks: [{ name: 'Neutropenia', severity: 'moderate', reversibility: 'fully_reversible', frequency: 'common', uncertainty: 'low', mitigated: true }],
};
const valueTree = {
  productName: 'DrugX', indication: 'metastatic NSCLC', weightingApproach: 'swing_weighting',
  criteria: [{ name: 'Overall survival', type: 'benefit', importanceRank: 1 }, { name: 'Neutropenia', type: 'risk', importanceRank: 2 }],
};
const uncertainty = {
  productName: 'DrugX', indication: 'metastatic NSCLC', netBalanceEstimate: 0.12,
  sources: [{ type: 'missing_data', affects: 'both', level: 'moderate' }],
};
const communication = {
  productName: 'DrugX', indication: 'metastatic NSCLC', verdict: 'favourable_with_conditions', audiences: ['patient'],
  includeVisualSummary: true, patientExperienceDataAvailable: true,
};

/** A copy of input with the value at a dotted/indexed path replaced, or removed when undefined. */
function changed(input: object, path: string, value: unknown): never {
  const copy = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let at: Record<string, unknown> = copy;
  for (const k of keys.slice(0, -1)) at = at[k] as Record<string, unknown>;
  const last = keys[keys.length - 1];
  if (value === undefined) delete at[last];
  else at[last] = value;
  return copy as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101, userId: 7 } as never));
}

function properties(tool: string) {
  return BENEFIT_RISK_TOOLS.find(t => t.name === tool)!.input_schema.properties as Record<string, any>;
}

const families = [
  { tool: 'structure_benefit_risk_framework', compute: structureBenefitRiskFramework, input: framework, flags: ['unmetMedicalNeed', 'keyRisks[0].manageable'] },
  { tool: 'build_effects_table', compute: buildEffectsTable, input: effects, flags: [] },
  { tool: 'assess_benefit_risk_balance', compute: assessBenefitRiskBalance, input: balance, flags: ['unmetMedicalNeed', 'risks[0].mitigated'] },
  { tool: 'design_value_tree', compute: designValueTree, input: valueTree, flags: [] },
  { tool: 'assess_br_uncertainty', compute: assessBRUncertainty, input: uncertainty, flags: [] },
  { tool: 'plan_br_communication', compute: planBRCommunication, input: communication, flags: ['includeVisualSummary', 'patientExperienceDataAvailable'] },
];
const withFlags = families.flatMap(f => f.flags.map(flag => ({ ...f, flag })));

describe('the six benefit-risk tools compute from stated facts', () => {
  it.each(families)('$tool reaches its engine with a stated basis', async ({ tool, input }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', engine: 'deterministic', basis: 'stated', appliesTo: 'the inputs stated in this conversation',
    });
  });
});

describe('each true/false input is kept as stated', () => {
  it.each(withFlags)('$tool $flag reads not_stated when omitted or null, and is refused when malformed', async ({ tool, compute, input, flag }) => {
    for (const absent of [undefined, null]) {
      expect((compute as (p: never) => object)(changed(input, flag, absent))).toMatchObject({ inputStates: { [flag]: 'not_stated' } });
    }
    for (const answer of [true, false]) {
      expect((compute as (p: never) => object)(changed(input, flag, answer))).toMatchObject({ inputStates: { [flag]: answer } });
    }
    for (const value of ['false', 0, 1]) {
      const out = await run(tool, changed(input, flag, value));
      expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: flag });
      expect(out).not.toHaveProperty('basis');
    }
  });
});

describe('structure_benefit_risk_framework concludes nothing from an unstated fact', () => {
  it('an omitted unmet need beside an approved option is not "Effective alternatives exist"', () => {
    const r = structureBenefitRiskFramework(changed(framework, 'unmetMedicalNeed', undefined));
    expect(r.unmetNeedConsidered).toBeNull();
    expect(r.rows[1].conclusionsAndReasons).toMatch(/^Not assessed/);
    expect(r.rows[1].conclusionsAndReasons).not.toMatch(/Effective alternatives exist/);
    expect(r.undecided).toContainEqual(expect.objectContaining({ conclusion: 'unmetNeedConsidered', decidingFacts: ['unmetMedicalNeed'] }));
  });
  it('a stated false is kept when no treatment list is given', () => {
    const r = structureBenefitRiskFramework(changed(framework, 'currentTreatments', undefined));
    expect(r.unmetNeedConsidered).toBe(false);
  });
  it('an option of unstated status is not read as approved', () => {
    const r = structureBenefitRiskFramework(changed(changed(framework, 'unmetMedicalNeed', undefined), 'currentTreatments[0].status', undefined));
    expect(r.rows[1].evidenceAndUncertainties[0]).toMatch(/status not stated/);
    expect(r.undecided[0].decidingFacts).toEqual(['unmetMedicalNeed', 'currentTreatments[0].status']);
  });
  it('an option of unstated status decides nothing beside a stated off-label one', () => {
    const r = structureBenefitRiskFramework({
      ...(changed(framework, 'unmetMedicalNeed', undefined) as object),
      currentTreatments: [{ name: 'Drug A', status: 'off_label' }, { name: 'Drug B' }],
    } as never);
    expect(r.unmetNeedConsidered).toBeNull();
    expect(r.undecided).toContainEqual(expect.objectContaining({ conclusion: 'unmetNeedConsidered', decidingFacts: ['unmetMedicalNeed'] }));
  });
  it('an omitted manageable is not "Considered manageable", and a risk conclusion it decides is not assessed', () => {
    const reversible = changed(framework, 'keyRisks[0].reversibility', 'fully_reversible');
    expect(structureBenefitRiskFramework(reversible).rows[3].conclusionsAndReasons).toMatch(/readily manageable/);
    const r = structureBenefitRiskFramework(changed(reversible, 'keyRisks[0].manageable', undefined));
    expect(r.rows[3].evidenceAndUncertainties[0]).toMatch(/Manageability not stated\./);
    expect(r.rows[3].conclusionsAndReasons).toMatch(/^Not assessed: the risk conclusion turns on whether keyRisks\[0\]\.manageable/);
    expect(r.undecided).toContainEqual(expect.objectContaining({ conclusion: 'riskWeight', decidingFacts: ['keyRisks[0].manageable'] }));
    expect(r.integratedAssessmentNarrative).toMatch(/risk weight from [\d.]+ to [\d.]+/);
  });
  it('an omitted condition severity is not "of lower severity"', () => {
    const r = structureBenefitRiskFramework(changed(framework, 'conditionSeverity', undefined));
    expect(r.severityContextScore).toBeNull();
    expect(r.rows[0].conclusionsAndReasons).toMatch(/^Not assessed/);
  });
  it('control: keeps the stated answer', () => {
    const r = structureBenefitRiskFramework(framework as never);
    expect(r.unmetNeedConsidered).toBe(false);
    expect(r.severityContextScore).toBe(1);
    expect(r.rows[3].conclusionsAndReasons).toBe(
      'The risks are of moderate concern and appear addressable through labeling and routine pharmacovigilance.',
    );
    expect(r.integratedAssessmentNarrative).toMatch(/benefit weight 0\.712, risk weight 0\.476, net 0\.236\), the weight of benefit clearly exceeds/);
  });
});

describe('assess_benefit_risk_balance gives no verdict an unstated fact could change', () => {
  it('an omitted unmet need that decides the verdict leaves it null, with both answers named', () => {
    const r = assessBenefitRiskBalance(changed(balance, 'unmetMedicalNeed', undefined));
    expect(r.verdict).toBeNull();
    expect(r.netBalance).toBeNull();
    expect(r.undecided).toContainEqual({
      conclusion: 'verdict', decidingFacts: ['unmetMedicalNeed'], couldBe: ['favourable_with_conditions', 'favourable'],
    });
    expect(r.structuredConclusion).toMatch(/^The benefit-risk balance of DrugX in metastatic NSCLC is not determined on the stated inputs: it turns on unmetMedicalNeed/);
    expect(r.drivers.find(d => d.factor === 'Unmet medical need')).toMatchObject({ contribution: null, rationale: expect.stringMatching(/^Not stated/) });
  });
  it('an omitted mitigation that decides the verdict leaves it, the risk weight and that driver null', () => {
    const r = assessBenefitRiskBalance(changed(balance, 'risks[0].mitigated', undefined));
    expect(r.verdict).toBeNull();
    expect(r.riskWeight).toBeNull();
    expect(r.drivers.find(d => d.factor === 'Risk: Neutropenia')!.contribution).toBeNull();
    expect(r.keyRisksSummary[0]).toMatch(/mitigation not stated/);
    expect(r.undecided).toContainEqual({
      conclusion: 'verdict', decidingFacts: ['risks[0].mitigated'], couldBe: ['indeterminate', 'favourable_with_conditions'],
    });
  });
  it('names only the verdicts an answer gives, not every verdict between the two', () => {
    const r = assessBenefitRiskBalance({
      conditionSeverity: 'moderate', unmetMedicalNeed: true,
      benefits: [
        { name: 'OS', magnitude: 'high', uncertainty: 'low', endpointType: 'mortality' },
        { name: 'Disability', magnitude: 'very_high', uncertainty: 'moderate', endpointType: 'irreversible_morbidity' },
      ],
      risks: [{ name: 'Hepatic failure', severity: 'fatal', reversibility: 'irreversible', frequency: 'common', uncertainty: 'low' }],
    } as never);
    expect(r.verdict).toBeNull();
    expect(r.undecided).toContainEqual({
      conclusion: 'verdict', decidingFacts: ['risks[0].mitigated'], couldBe: ['unfavourable', 'favourable_with_conditions'],
    });
  });
  it('a verdict every answer gives is kept, with the net balance it cannot fix left null', () => {
    const strong = changed(changed(balance, 'benefits[0].magnitude', 'very_high'), 'unmetMedicalNeed', undefined);
    const r = assessBenefitRiskBalance(strong);
    expect(r.verdict).toBe('favourable');
    expect(r.netBalance).toBeNull();
    expect(r.structuredConclusion).toMatch(/The verdict is the same on every answer to unmetMedicalNeed/);
  });
  it('names the omitted grades a score used at its middle value', () => {
    const r = assessBenefitRiskBalance(changed(balance, 'risks[0].reversibility', undefined));
    expect(r.methodNotes.join(' ')).toMatch(/risks\[0\]\.reversibility \(partially_reversible\)/);
  });
  it('control: keeps the stated answer', () => {
    const r = assessBenefitRiskBalance(balance as never);
    expect(r).toMatchObject({ verdict: 'favourable_with_conditions', netBalance: 0.115, riskWeight: 0.168 });
    expect(assessBenefitRiskBalance(changed(balance, 'unmetMedicalNeed', true)).verdict).toBe('favourable');
    expect(assessBenefitRiskBalance(changed(balance, 'risks[0].mitigated', false)).verdict).toBe('indeterminate');
  });
});

describe('plan_br_communication', () => {
  it('says when patient-experience data were not stated, instead of leaving them out', () => {
    const r = planBRCommunication(changed(communication, 'patientExperienceDataAvailable', undefined));
    expect(r.audiencePlans[0].framing).toMatch(/patient-experience\/PFDD data are available was not stated/);
    expect(planBRCommunication(changed(communication, 'patientExperienceDataAvailable', false)).audiencePlans[0].framing).not.toMatch(/PFDD/);
  });
  it('control: keeps the stated framing', () => {
    expect(planBRCommunication(communication as never).audiencePlans[0].framing).toMatch(
      /using absolute frequencies \(natural frequencies, e\.g\. "x in 1,000"\) rather than relative risks\. Incorporate patient-experience\/PFDD data on which outcomes patients value most\.$/,
    );
  });
  it('names the visual-summary and audience defaults', () => {
    const r = planBRCommunication(changed(changed(communication, 'includeVisualSummary', undefined), 'audiences', undefined));
    expect(r.visualSummary).toHaveLength(5);
    expect(r.methodNotes.join(' ')).toMatch(/includeVisualSummary was not stated/);
    expect(r.methodNotes.join(' ')).toMatch(/No audiences were stated/);
  });
});

describe('a malformed value is refused by field, never read as another value or crashed on', () => {
  it.each([
    ['structure_benefit_risk_framework', 'conditionSeverity', 'Severe'],
    ['structure_benefit_risk_framework', 'conditionCourse', 'Chronic'],
    ['structure_benefit_risk_framework', 'currentTreatments', 'docetaxel'],
    ['structure_benefit_risk_framework', 'currentTreatments[0].status', 'Approved'],
    ['structure_benefit_risk_framework', 'keyBenefits[0].magnitude', 'large'],
    ['structure_benefit_risk_framework', 'keyBenefits[0].endpointType', 'clinical'],
    ['structure_benefit_risk_framework', 'keyRisks', 'neutropenia'],
    ['structure_benefit_risk_framework', 'keyRisks[0].reversibility', 'reversible'],
    ['structure_benefit_risk_framework', 'riskManagementTools', 'REMS'],
    ['structure_benefit_risk_framework', 'productName', 42],
    ['build_effects_table', 'effects', 'OS'],
    ['build_effects_table', 'effects[0].direction', 'Favourable'],
    ['build_effects_table', 'effects[0].treatmentValue', '12'],
    ['build_effects_table', 'effects[0].ciLow', Number.NaN],
    ['build_effects_table', 'effects[0].evidenceSource', 'RCT'],
    ['build_effects_table', 'effects[0].uncertainty', 'Low'],
    ['assess_benefit_risk_balance', 'benefits', 'OS'],
    ['assess_benefit_risk_balance', 'benefits[0].magnitude', 'large'],
    ['assess_benefit_risk_balance', 'benefits[0].weight', 1.5],
    ['assess_benefit_risk_balance', 'benefits[0].weight', 'heavy'],
    ['assess_benefit_risk_balance', 'risks[0].severity', 'Severe'],
    ['assess_benefit_risk_balance', 'risks[0].frequency', 'often'],
    ['assess_benefit_risk_balance', 'conditionSeverity', 'Serious'],
    ['assess_benefit_risk_balance', 'specialPopulations', 'elderly'],
    ['design_value_tree', 'criteria', 'OS'],
    ['design_value_tree', 'criteria[0].type', 'Benefit'],
    ['design_value_tree', 'criteria[0].importanceRank', '1'],
    ['design_value_tree', 'criteria[0].importanceRank', 0],
    ['design_value_tree', 'weightingApproach', 'MCDA'],
    ['design_value_tree', 'alternatives', 'placebo'],
    ['assess_br_uncertainty', 'sources', 'missing data'],
    ['assess_br_uncertainty', 'sources[0].type', 'bias'],
    ['assess_br_uncertainty', 'sources[0].level', 'High'],
    ['assess_br_uncertainty', 'sources[0].affects', 'efficacy'],
    ['assess_br_uncertainty', 'netBalanceEstimate', '0.3'],
    ['plan_br_communication', 'audiences', 'patient'],
    ['plan_br_communication', 'audiences[0]', 'Patients'],
    ['plan_br_communication', 'keyBenefitMessages', 'longer survival'],
  ] as const)('%s %s %j', async (tool, field, value) => {
    const out = await run(tool, changed(families.find(f => f.tool === tool)!.input, field, value));
    expect(out).toMatchObject({ status: 'needs_parameters', field });
    expect(out).not.toHaveProperty('error');
  });

  it.each([
    ['build_effects_table', 'effects'],
    ['assess_benefit_risk_balance', 'risks'],
    ['design_value_tree', 'criteria'],
    ['assess_br_uncertainty', 'sources'],
  ] as const)('%s refuses an omitted required list, %s', async (tool, field) => {
    expect(await run(tool, changed(families.find(f => f.tool === tool)!.input, field, undefined))).toMatchObject({ status: 'needs_parameters', code: 'missing_input', field });
  });
});

describe('the definitions say what an omitted fact means', () => {
  it.each(withFlags)('$tool $flag says what an omission leaves, and claims no default', ({ tool, flag }) => {
    const props = properties(tool);
    const [list, key] = flag.includes('[') ? [flag.split('[')[0], flag.split('.').pop()!] : [undefined, flag];
    const description: string = list ? props[list].items.properties[key].description : props[key].description;
    expect(description).toMatch(/Omitted or null/);
    expect(description).not.toMatch(/\(default/i);
  });
  it('the balance description says the verdict can be none, naming the facts', () => {
    expect(BENEFIT_RISK_TOOLS.find(t => t.name === 'assess_benefit_risk_balance')!.description).toMatch(/or none, naming the facts/);
  });
  it('each description fits the gateway limit', () => {
    for (const t of BENEFIT_RISK_TOOLS) expect(t.description.length, t.name).toBeLessThanOrEqual(1024);
  });
});
