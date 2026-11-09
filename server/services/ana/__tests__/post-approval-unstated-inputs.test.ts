/**
 * S5d: the ICH Q12 post-approval worksheets classify, designate and plan nothing
 * from a fact nobody stated. An omitted or null true/false input reads as
 * not_stated (inputStates); a risk tier, reporting category, variation type, SUPAC
 * level, established-condition status, comparability extent or ICH Q12 tool it
 * could change is null, and undecided names the facts and what each answer
 * gives. A malformed value is refused by field. Before this, an omitted risk
 * qualifier, solidOralProduct, biologicLicense, cqaImpact or cqa read as false,
 * an omitted analyticalCoverageComplete read as true, an annual-report change
 * with no asserted category was classified with its risk facts read as false, a
 * risk object without a magnitude dropped the stated magnitude, and 'true', an
 * unknown area or element type, or a text for a list was read as another value
 * or crashed.
 */
import { describe, expect, it } from 'vitest';
import {
  assessEstablishedConditions, assessPostApprovalComparability, classifyPostApprovalChange, designPACMP,
  planAnnualReport, planLifecycleManagement,
} from '../../post-approval/post-approval-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { POST_APPROVAL_TOOLS } from '../postApprovalTools';

const RISK = ['affectsCqa', 'affectsControlStrategy', 'sterileProcess', 'withinDesignSpace', 'priorKnowledge'] as const;
const noRisk = { affectsCqa: false, affectsControlStrategy: false, sterileProcess: false, withinDesignSpace: false, priorKnowledge: false };
const classify = {
  changeArea: 'manufacturing_site', description: 'Second drug product site', modality: 'small_molecule', magnitude: 'moderate',
  solidOralProduct: true, modifiedRelease: false, biologicLicense: false, risk: { ...noRisk, magnitude: 'moderate' },
};
const conditions = {
  developmentApproach: 'enhanced', modality: 'small_molecule',
  elements: [{ elementType: 'process_parameter', name: 'Granulation endpoint', cqaImpact: true, controlledDownstream: false, withinDesignSpace: false }],
};
const pacmp = {
  plannedChangeArea: 'manufacturing_site', plannedChangeDescription: 'Move granulation to site B', modality: 'small_molecule',
  tests: [{ attribute: 'Dissolution', test: 'USP II', acceptanceCriterion: 'f2 >= 50', cqa: true }], includeStability: true,
  risk: { ...noRisk, magnitude: 'moderate' },
};
const annual = {
  productName: 'DrugX', reportingPeriod: '2025', modality: 'small_molecule', biologicLicense: false,
  changes: [{ changeArea: 'equipment', description: 'Same-design blender', assertedCategory: 'Annual Report' }],
  stabilityProtocolOngoing: true, includePlcmDocument: true,
};
const comparability = {
  changeArea: 'drug_substance_process', modality: 'biologic', changeStage: 'upstream', affectsCqa: false,
  analyticalCoverageComplete: true, clinicalDataAvailable: false, risk: { ...noRisk, magnitude: 'moderate' },
};
const lifecycle = {
  productName: 'DrugX', modality: 'small_molecule', developmentApproach: 'minimal', marketedRegions: ['US', 'EU'],
  plannedChanges: [{ changeArea: 'manufacturing_site', expectedFrequency: 'one_time', magnitude: 'major', risk: { ...noRisk, magnitude: 'major' } }],
  changeHistory: [{ changeArea: 'scale', reportedCategory: 'CBE-30', yearImplemented: 2024 }],
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

const families = [
  { tool: 'classify_post_approval_change', compute: classifyPostApprovalChange, input: classify,
    flags: ['solidOralProduct', 'modifiedRelease', 'biologicLicense', ...RISK.map(k => `risk.${k}`)] },
  { tool: 'assess_established_conditions', compute: assessEstablishedConditions, input: conditions,
    flags: ['elements[0].cqaImpact', 'elements[0].controlledDownstream', 'elements[0].withinDesignSpace'] },
  { tool: 'design_pacmp', compute: designPACMP, input: pacmp, flags: ['includeStability', 'tests[0].cqa', ...RISK.map(k => `risk.${k}`)] },
  { tool: 'plan_annual_report', compute: planAnnualReport, input: annual, flags: ['biologicLicense', 'stabilityProtocolOngoing', 'includePlcmDocument'] },
  { tool: 'assess_postapproval_comparability', compute: assessPostApprovalComparability, input: comparability,
    flags: ['affectsCqa', 'analyticalCoverageComplete', 'clinicalDataAvailable', ...RISK.map(k => `risk.${k}`)] },
  { tool: 'plan_lifecycle_management', compute: planLifecycleManagement, input: lifecycle, flags: RISK.map(k => `plannedChanges[0].risk.${k}`) },
];
const withFlags = families.flatMap(f => f.flags.map(flag => ({ ...f, flag })));

describe('the six post-approval tools compute from stated facts', () => {
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

describe('classify_post_approval_change names no category an unstated fact could change', () => {
  const minorProcess = { changeArea: 'manufacturing_process', magnitude: 'minor', modality: 'small_molecule' };
  it('with the risk qualifiers omitted, the tier, category and variation type are null, with both answers named', () => {
    const r = classifyPostApprovalChange(minorProcess as never);
    expect(r.us.category).toBeNull();
    expect(r.us.regulation).toBeNull();
    expect(r.eu.variationType).toBeNull();
    expect(r.risk.tier).toBeNull();
    expect(r.risk.factors.find(f => f.label.startsWith('Involves a sterile'))!.applies).toBeNull();
    const u = r.undecided.find(x => x.conclusion === 'us.category')!;
    expect(u.decidingFacts).toContain('risk.sterileProcess');
    expect(u.couldBe).toEqual(expect.arrayContaining(['PAS', 'CBE-0']));
    expect(r.recommendedTools).not.toContain('design_pacmp');
  });
  it('an omitted solidOralProduct leaves SUPAC open, not "does not apply"', () => {
    const r = classifyPostApprovalChange(changed(classify, 'solidOralProduct', undefined));
    expect(r.supac.applicable).toBeNull();
    expect(r.supac.level).toBeNull();
    expect(r.us.category).toBe('PAS');
  });
  it('an omitted biologicLicense leaves the regulation open, not 21 CFR 314.70', () => {
    const r = classifyPostApprovalChange(changed(classify, 'biologicLicense', undefined));
    expect(r.us.category).toBe('PAS');
    expect(r.us.regulation).toBeNull();
    expect(r.undecided).toContainEqual({ conclusion: 'us.regulation', decidingFacts: ['biologicLicense'], couldBe: ['21 CFR 601.12(b)', '21 CFR 314.70(b)'] });
  });
  it('a risk object without a magnitude keeps the stated magnitude', () => {
    const r = classifyPostApprovalChange({ ...classify, changeArea: 'scale', magnitude: 'minor', risk: noRisk } as never);
    expect(r.risk).toMatchObject({ score: 1, tier: 'low' });
    expect(r.us.category).toBe('CBE-0');
  });
  it('names an omitted modality and magnitude as defaults', () => {
    const r = classifyPostApprovalChange({ changeArea: 'scale', risk: noRisk, solidOralProduct: false, modifiedRelease: false, biologicLicense: false } as never);
    expect(r.warnings.join(' ')).toMatch(/modality was not stated: the change is classified for a small molecule/);
    expect(r.warnings.join(' ')).toMatch(/magnitude was not stated: the risk score starts from a moderate change/);
  });
  it('control: keeps the stated answer', () => {
    const r = classifyPostApprovalChange(classify as never);
    expect(r.us).toMatchObject({ category: 'PAS', regulation: '21 CFR 314.70(b)' });
    expect(r.eu.variationType).toBe('II');
    expect(r.risk).toMatchObject({ score: 4, tier: 'moderate' });
    expect(r.supac).toMatchObject({ applicable: true, level: 'Level 2' });
    expect(r.comparabilityLikelyRequired).toBe(false);
  });
});

describe('assess_established_conditions', () => {
  it('an omitted CQA fact leaves a process parameter undetermined, not supportive information', () => {
    const r = assessEstablishedConditions(changed(conditions, 'elements[0].cqaImpact', undefined));
    expect(r.assessments[0]).toMatchObject({ isEstablishedCondition: null, classification: 'not_determined', changeReportingCategory: null });
    expect(r.summary).toMatchObject({ establishedConditions: 0, supportiveInformation: 0, notDetermined: 1 });
    expect(r.undecided[0].decidingFacts).toEqual(['elements[0].cqaImpact']);
  });
  it('a status every answer gives is kept', () => {
    const composition = changed(changed(conditions, 'elements[0].elementType', 'drug_product_composition'), 'elements[0].controlledDownstream', undefined);
    expect(assessEstablishedConditions(composition).assessments[0]).toMatchObject({ isEstablishedCondition: true, changeReportingCategory: 'PAS' });
  });
  it('control: keeps the stated answer', () => {
    expect(assessEstablishedConditions(conditions as never).assessments[0]).toMatchObject({
      isEstablishedCondition: true, changeReportingCategory: 'CBE-0', euChangeType: 'IAIN',
    });
  });
});

describe('design_pacmp', () => {
  it('with the risk qualifiers omitted, the category without a protocol and the reduced one are null', () => {
    const r = designPACMP({ plannedChangeArea: 'manufacturing_process', plannedChangeDescription: 'New granulator', modality: 'small_molecule', tests: pacmp.tests, includeStability: false } as never);
    expect(r.reportingCategory).toMatchObject({ withoutProtocol: null, proposedWithProtocol: null, feasible: null });
    expect(r.undecided.find(u => u.conclusion === 'reportingCategory.withoutProtocol')!.decidingFacts).toContain('risk.sterileProcess');
  });
  it('an unstated sterile process leaves a reduction to Annual Report undetermined', () => {
    const r = designPACMP({ ...(changed(pacmp, 'risk.sterileProcess', undefined) as object), currentCategoryIfNoProtocol: 'CBE-0', proposedReducedCategory: 'Annual Report' } as never);
    expect(r.reportingCategory.feasible).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/risk\.sterileProcess was not stated/);
  });
  it('an omitted cqa is not "not a CQA"', () => {
    const r = designPACMP(changed(pacmp, 'tests[0].cqa', undefined));
    expect(r.testPlan[0].cqa).toBeNull();
    expect(r.testPlan[0].purpose).toMatch(/^Not stated whether the attribute is a CQA/);
  });
  it('control: keeps the stated answer', () => {
    expect(designPACMP(pacmp as never).reportingCategory).toMatchObject({ withoutProtocol: 'PAS', proposedWithProtocol: 'CBE-30', feasible: true });
  });
});

describe('plan_annual_report', () => {
  it('a change with no asserted category is not classified from risk facts nobody stated', () => {
    const r = planAnnualReport(changed(annual, 'changes[0].assertedCategory', undefined));
    expect(r.annualReportContents.reportableChanges).toEqual([]);
    expect(r.annualReportContents.nonAnnualReportableFlagged).toEqual([]);
    expect(r.annualReportContents.notDetermined[0]).toMatchObject({ classifiedCategory: null, annualReportable: null });
    expect(r.annualReportContents.notDetermined[0].note).toMatch(/State assertedCategory/);
  });
  it('an omitted stabilityProtocolOngoing gives both answers', () => {
    const r = planAnnualReport(changed(annual, 'stabilityProtocolOngoing', undefined));
    expect(r.annualReportContents.stabilityUpdate).toMatch(/^Whether a stability protocol or commitment is ongoing was not stated/);
  });
  it('control: keeps the stated answer', () => {
    const r = planAnnualReport(annual as never);
    expect(r.annualReportContents.reportableChanges[0].classifiedCategory).toBe('Annual Report');
    expect(r.annualReportContents.stabilityUpdate).toMatch(/^Include updated stability data/);
  });
});

describe('assess_postapproval_comparability', () => {
  it('an omitted analytical coverage is not read as complete', () => {
    const r = assessPostApprovalComparability(changed(comparability, 'analyticalCoverageComplete', undefined));
    expect(r.extent).toBeNull();
    expect(r.bridgingStudies.clinicalRequired).toBeNull();
    expect(r.undecided.find(u => u.conclusion === 'extent')!.decidingFacts).toContain('analyticalCoverageComplete');
  });
  it('affectsCqa answers risk.affectsCqa when only one is stated', () => {
    const r = assessPostApprovalComparability(changed(changed(comparability, 'affectsCqa', true), 'risk.affectsCqa', undefined));
    expect(r).toMatchObject({ extent: 'analytical_plus_clinical', undecided: [] });
  });
  it('with neither stated, affectsCqa and risk.affectsCqa are one fact, never two that disagree', () => {
    const r = assessPostApprovalComparability({
      ...(changed(comparability, 'affectsCqa', undefined) as object),
      risk: { affectsControlStrategy: false, sterileProcess: false, withinDesignSpace: true, priorKnowledge: true, magnitude: 'major' },
    } as never);
    expect(r.extent).toBeNull();
    expect(r.undecided.find(u => u.conclusion === 'extent')).toEqual({
      conclusion: 'extent', decidingFacts: ['affectsCqa'], couldBe: ['analytical_plus_clinical', 'analytical_only'],
    });
    expect(r.bridgingStudies.nonclinicalRequired).toBe(false);
  });
  it('control: keeps the stated answer', () => {
    expect(assessPostApprovalComparability(comparability as never)).toMatchObject({
      extent: 'analytical_only', bridgingStudies: { nonclinicalRequired: false, clinicalRequired: false, pkPdRequired: false },
    });
  });
});

describe('plan_lifecycle_management', () => {
  it('a planned change whose category its unstated risk facts decide gets no tool', () => {
    const r = planLifecycleManagement({ ...lifecycle, plannedChanges: [{ changeArea: 'manufacturing_process', magnitude: 'minor', expectedFrequency: 'one_time' }] } as never);
    expect(r.toolRecommendations[0]).toMatchObject({ recommendedTool: null, defaultUsCategory: null });
    expect(r.pacmpCandidates).toEqual([]);
  });
  it('a history change with no reported category is counted as not determined', () => {
    const r = planLifecycleManagement(changed(lifecycle, 'changeHistory[0].reportedCategory', undefined));
    expect(r.changeHistorySummary.byCategory).toEqual({ 'not determined': 1 });
  });
});

describe('a malformed value is refused by field, never read as another value or crashed on', () => {
  it.each([
    ['classify_post_approval_change', 'changeArea', 'site'],
    ['classify_post_approval_change', 'modality', 'mAb'],
    ['classify_post_approval_change', 'magnitude', 'Major'],
    ['classify_post_approval_change', 'risk', 'high'],
    ['classify_post_approval_change', 'risk.magnitude', 'big'],
    ['assess_established_conditions', 'elements', 'granulation'],
    ['assess_established_conditions', 'elements[0].elementType', 'parameter'],
    ['assess_established_conditions', 'developmentApproach', 'QbD'],
    ['design_pacmp', 'plannedChangeArea', 'site'],
    ['design_pacmp', 'proposedReducedCategory', 'AR'],
    ['design_pacmp', 'tests', 'assay'],
    ['design_pacmp', 'tests[0].attribute', 7],
    ['plan_annual_report', 'changes', 'blender'],
    ['plan_annual_report', 'changes[0].assertedCategory', 'AR'],
    ['plan_annual_report', 'modality', 'mAb'],
    ['assess_postapproval_comparability', 'changeStage', 'Upstream'],
    ['assess_postapproval_comparability', 'changeArea', 'process'],
    ['plan_lifecycle_management', 'marketedRegions', 'US'],
    ['plan_lifecycle_management', 'marketedRegions[0]', 'USA'],
    ['plan_lifecycle_management', 'plannedChanges[0].expectedFrequency', 'often'],
    ['plan_lifecycle_management', 'changeHistory[0].yearImplemented', '2024'],
  ] as const)('%s %s %j', async (tool, field, value) => {
    const out = await run(tool, changed(families.find(f => f.tool === tool)!.input, field, value));
    expect(out).toMatchObject({ status: 'needs_parameters', field });
    expect(out).not.toHaveProperty('error');
  });
  it.each([
    ['assess_established_conditions', 'elements'],
    ['design_pacmp', 'plannedChangeDescription'],
    ['classify_post_approval_change', 'changeArea'],
  ] as const)('%s refuses an omitted required input, %s', async (tool, field) => {
    expect(await run(tool, changed(families.find(f => f.tool === tool)!.input, field, undefined))).toMatchObject({ status: 'needs_parameters', code: 'missing_input', field });
  });
});

describe('the definitions say what an omitted fact means', () => {
  it.each(withFlags)('$tool $flag says what an omission leaves', ({ tool, flag }) => {
    const props = POST_APPROVAL_TOOLS.find(t => t.name === tool)!.input_schema.properties as Record<string, any>;
    const path = flag.replace(/\[0\]/g, '').split('.');
    let at: any = { properties: props };
    for (const k of path) at = (at.properties ?? at.items.properties)[k];
    expect(at.description).toMatch(/Omitted or null/);
    expect(at.description).not.toMatch(/\(default/i);
  });
  it('each description fits the gateway limit', () => {
    for (const t of POST_APPROVAL_TOOLS) expect(t.description.length, t.name).toBeLessThanOrEqual(1024);
  });
});
