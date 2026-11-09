/**
 * S5d: the regulatory-strategy worksheets choose no pathway and call no
 * designation eligible or ineligible from a fact nobody stated. An omitted or
 * null true/false input reads as not_stated (inputStates); a 505 pathway, a
 * rolling-review eligibility or an orphan eligibility it could change is null,
 * with the facts named. A criterion no input states (substantial improvement, a
 * surrogate endpoint, significant improvement, the cost-recovery prong, the
 * insufficient-return limb, significant benefit) leaves its program null, never
 * true or false. A prevalence with no stated source is not used (design S5d:
 * fdaEligible null). A missing or malformed required value is refused by name or
 * field. Before this, an omitted 505 fact read as false (505(b)(1) or ANDA), an
 * omitted designation as none, a null prevalence as ineligible, any clinical
 * rationale text as significant benefit, 5 in 10,000 as over "not more than 5",
 * and an omitted landscape, an unknown market or a missing status object crashed.
 * A stated fact that rules a program out still gives false: a condition stated
 * not serious, not life-threatening and not debilitating meets neither EU orphan
 * limb, a biosimilar shows no improvement over its reference product, and a
 * stated adequate therapy fails RMAT's unmet need. A serious condition alone does
 * not meet the EU prevalence limb (life-threatening or chronically debilitating),
 * and a vaccine's or diagnostic's FDA count is persons dosed per year.
 *
 * The global-RI pins (expedited-programs-unstated-facts-not-assessed,
 * special-designations-orphan-unassessed-criteria-not-ineligible and the
 * regulatory-strategy-brief tests) cover global-ri/expedited-programs.ts,
 * special-designations.ts and regulatory-strategy-brief.ts, other engines; this
 * suite covers regulatory-strategy-knowledge.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  assessExpeditedProgram, assessOrphanDesignation, assessRollingSubmission, compareGlobalPathways, planFDAMeeting,
  select505Pathway,
} from '../../regulatory-strategy/regulatory-strategy-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { REGULATORY_STRATEGY_TOOLS } from '../regulatoryStrategyTools';

const expedited = {
  indication: 'serious', unmetMedicalNeedDescription: 'No approved therapy', availableTherapyLandscape: 'no_approved_therapy',
  evidenceLevel: 'phase2_data', productType: 'small_molecule',
};
const meeting = { developmentPhase: 'phase2', purpose: 'eop2', productType: 'biologic', questionsToDiscuss: ['Is the Phase 3 design adequate?'] };
const orphan = {
  diseasePrevalenceUS: 30000, diseasePrevalenceUSSource: 'Orphanet report 2024', diseasePrevalenceEU: 2,
  diseasePrevalenceEUSource: 'Orphanet report 2024', clinicalRationale: 'First targeted therapy', productType: 'small_molecule',
  existingApprovedTherapies: 0, isSerious: true, isLifeThreatening: true, isDebilitating: true,
};
const pathway = {
  activeIngredient: 'known', dosageFormChange: false, routeChange: false, indicationChange: false, newCombination: false,
  formulationInnovation: false, availableRLD: true,
};
const rolling = { expeditedDesignationStatus: { fastTrack: true, breakthroughTherapy: false, rmat: false }, productType: 'biologic', estimatedModuleCompletionDates: {} };
const global = { productType: 'biologic', indication: 'NSCLC', targetMarkets: ['us', 'eu'] };

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

const PATHWAY_FACTS = ['dosageFormChange', 'routeChange', 'indicationChange', 'newCombination', 'formulationInnovation', 'availableRLD'];
const families = [
  { tool: 'assess_expedited_program', compute: assessExpeditedProgram, input: expedited, flags: [] as string[] },
  { tool: 'plan_fda_meeting', compute: planFDAMeeting, input: meeting, flags: [] },
  { tool: 'assess_orphan_designation', compute: assessOrphanDesignation, input: orphan, flags: ['isSerious', 'isLifeThreatening', 'isDebilitating'] },
  { tool: 'select_505_pathway', compute: select505Pathway, input: pathway, flags: PATHWAY_FACTS },
  { tool: 'assess_rolling_submission', compute: assessRollingSubmission, input: rolling,
    flags: ['fastTrack', 'breakthroughTherapy', 'rmat'].map(k => `expeditedDesignationStatus.${k}`) },
  { tool: 'compare_global_pathways', compute: compareGlobalPathways, input: global, flags: [] },
];
const withFlags = families.flatMap(f => f.flags.map(flag => ({ ...f, flag })));
const program = (r: { assessments: Array<{ programName: string }> }, name: string) => r.assessments.find(a => a.programName === name) as any;

describe('the six regulatory-strategy tools compute from stated facts', () => {
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

describe('assess_orphan_designation', () => {
  it('a US prevalence with no stated source gives fdaEligible null (design S5d)', () => {
    const r = assessOrphanDesignation(changed(orphan, 'diseasePrevalenceUSSource', undefined));
    expect(r.fdaAssessment.eligible).toBeNull();
    expect(r.fdaAssessment.missing).toEqual(['diseasePrevalenceUSSource']);
    expect(r.fdaAssessment.rationale.join(' ')).toMatch(/a prevalence with no stated source is not used/);
  });
  it('an EU prevalence with no stated source is not used either', () => {
    expect(assessOrphanDesignation(changed(orphan, 'diseasePrevalenceEUSource', undefined)).emaAssessment.eligible).toBeNull();
  });
  it('an unknown prevalence is not ineligible', () => {
    const r = assessOrphanDesignation(changed(orphan, 'diseasePrevalenceUS', null));
    expect(r.fdaAssessment).toMatchObject({ eligible: null, missing: ['diseasePrevalenceUS'] });
  });
  it('a prevalence of 200,000 or more leaves FDA eligibility to the cost-recovery prong, not false', () => {
    const r = assessOrphanDesignation(changed(orphan, 'diseasePrevalenceUS', 250000));
    expect(r.fdaAssessment.eligible).toBeNull();
    expect(r.fdaAssessment.notAssessedCriteria[0]).toMatch(/cost of developing/);
  });
  it('omitted seriousness facts leave EMA eligibility null and named, not undefined or false', () => {
    const r = assessOrphanDesignation(['isSerious', 'isLifeThreatening', 'isDebilitating'].reduce((o, k) => changed(o, k, undefined), orphan as object) as never);
    expect(r.emaAssessment.eligible).toBeNull();
    expect(r.emaAssessment.missing).toEqual(['isSerious', 'isLifeThreatening', 'isDebilitating']);
    expect(r.emaAssessment.rationale.join(' ')).not.toMatch(/undefined/);
  });
  it('a clinical rationale is not a finding of significant benefit', () => {
    const r = assessOrphanDesignation(changed(orphan, 'existingApprovedTherapies', 2));
    expect(r.emaAssessment.eligible).toBeNull();
    expect(r.emaAssessment.notAssessedCriteria).toContain('If satisfactory treatment exists, the product must provide significant benefit to those affected');
  });
  it('5 in 10,000 does not exceed "not more than 5 in 10,000"', () => {
    expect(assessOrphanDesignation(changed(orphan, 'diseasePrevalenceEU', 5)).emaAssessment.eligible).toBe(true);
  });
  it('an omitted clinical rationale is not a crash', async () => {
    const input = changed(changed(orphan, 'clinicalRationale', undefined), 'existingApprovedTherapies', 2);
    expect(await run('assess_orphan_designation', input)).toMatchObject({ status: 'computed' });
  });
  it('control: keeps the stated answer', () => {
    const r = assessOrphanDesignation(orphan as never);
    expect(r.fdaAssessment.eligible).toBe(true);
    expect(r.emaAssessment.eligible).toBe(true);
  });
  it('control: a condition stated not serious, not life-threatening and not debilitating meets neither EU limb', () => {
    const r = assessOrphanDesignation({ ...orphan, isSerious: false, isLifeThreatening: false, isDebilitating: false } as never);
    expect(r.emaAssessment.eligible).toBe(false);
  });
  it('a serious condition alone does not meet the prevalence limb, which needs a life-threatening or chronically debilitating one', () => {
    const r = assessOrphanDesignation({ ...orphan, isSerious: true, isLifeThreatening: false, isDebilitating: false } as never);
    expect(r.emaAssessment.eligible).toBeNull();
    expect(r.emaAssessment.notAssessedCriteria[0]).toMatch(/Insufficient return/);
    expect(r.emaAssessment.criteria[1]).toMatch(/^The condition must be life-threatening or chronically debilitating/);
  });
  it.each(['vaccine', 'diagnostic'])('a %s is counted by persons dosed per year, not by the disease prevalence', (productType) => {
    const r = assessOrphanDesignation(changed(orphan, 'productType', productType));
    expect(r.fdaAssessment.eligible).toBeNull();
    expect(r.fdaAssessment.notAssessedCriteria[0]).toMatch(/administered per year \(21 CFR 316\.20\(b\)\(8\)\(i\)\)/);
  });
});

describe('select_505_pathway', () => {
  it('chooses no pathway while an unstated fact could change it, and names both answers', () => {
    const r = select505Pathway({ activeIngredient: 'known' } as never);
    expect(r.recommendedPathway).toBeNull();
    expect(r.undecided[0]).toMatchObject({ conclusion: 'recommendedPathway', couldBe: expect.arrayContaining(['505b1', '505b2', '505j']) });
    expect(r.undecided[0].decidingFacts).toContain('availableRLD');
  });
  it('keeps a pathway every answer gives', () => {
    expect(select505Pathway({ activeIngredient: 'new_molecular_entity' } as never).recommendedPathway!.pathway).toBe('505b1');
    expect(select505Pathway({ activeIngredient: 'known', availableRLD: false } as never).recommendedPathway!.pathway).toBe('505b1');
    const r = select505Pathway(changed(changed(pathway, 'dosageFormChange', true), 'formulationInnovation', undefined));
    expect(r.recommendedPathway!.pathway).toBe('505b2');
    expect(r.decisionTreeRationale.join(' ')).toMatch(/formulationInnovation was not stated: on every answer the pathway is/);
  });
  it('control: keeps the stated answer', () => {
    const r = select505Pathway(pathway as never);
    expect(r.recommendedPathway!.pathway).toBe('505j');
    expect(r.alternativePathways.map(p => p.pathway)).toEqual(['505b2']);
  });
});

describe('assess_rolling_submission', () => {
  it('with no designation stated, eligibility is null, not "not eligible"', () => {
    const r = assessRollingSubmission(changed(rolling, 'expeditedDesignationStatus', {}));
    expect(r.eligible).toBeNull();
    expect(r.eligibilityRationale[0]).toMatch(/not determined/);
  });
  it('control: one designation stated true is enough', () => {
    expect(assessRollingSubmission(changed(rolling, 'expeditedDesignationStatus', { rmat: true })).eligible).toBe(true);
  });
  it('control: keeps the stated answer', () => {
    expect(assessRollingSubmission(rolling as never).eligible).toBe(true);
    expect(assessRollingSubmission(changed(rolling, 'expeditedDesignationStatus.fastTrack', false)).eligible).toBe(false);
  });
});

describe('assess_expedited_program', () => {
  it('calls no program eligible on a criterion no input states', () => {
    const r = assessExpeditedProgram(expedited as never);
    expect(program(r, 'fast_track').eligible).toBe(true);
    for (const [name, criterion] of [
      ['breakthrough_therapy', /substantial improvement/],
      ['accelerated_approval', /surrogate or intermediate clinical endpoint/],
      ['priority_review', /significant improvement/],
    ] as const) {
      expect(program(r, name).eligible, name).toBeNull();
      expect(program(r, name).notAssessedCriteria[0], name).toMatch(criterion);
    }
    expect(r.strategicRecommendations.join(' ')).toMatch(/Not assessed: Breakthrough Therapy Designation/);
  });
  it('early clinical evidence is not "not eligible" for Breakthrough Therapy; preclinical evidence is', () => {
    expect(program(assessExpeditedProgram(changed(expedited, 'evidenceLevel', 'early_clinical')), 'breakthrough_therapy').eligible).toBeNull();
    expect(program(assessExpeditedProgram(changed(expedited, 'evidenceLevel', 'preclinical_only')), 'breakthrough_therapy').eligible).toBe(false);
  });
  it('control: keeps a stated failure (no clinical evidence rules out Breakthrough Therapy)', () => {
    const r = assessExpeditedProgram(changed(expedited, 'evidenceLevel', 'preclinical_only'));
    expect(program(r, 'breakthrough_therapy').eligible).toBe(false);
  });

  it('a stated adequate therapy leaves Fast Track and Accelerated Approval not assessed, naming the finding', () => {
    const r = assessExpeditedProgram(changed(expedited, 'availableTherapyLandscape', 'adequate_existing_therapy'));
    expect(program(r, 'fast_track').eligible).toBeNull();
    expect(program(r, 'fast_track').notAssessedCriteria.join(' ')).toMatch(/unmet medical need beside the available therapy/);
    expect(program(r, 'accelerated_approval').eligible).toBeNull();
    expect(program(r, 'accelerated_approval').notAssessedCriteria.join(' ')).toMatch(/meaningful advantage over the available therapy/);
  });
  it('a biosimilar is not eligible for Fast Track, Breakthrough Therapy, Accelerated Approval or Priority Review', () => {
    const r = assessExpeditedProgram(changed(expedited, 'productType', 'biosimilar'));
    for (const name of ['fast_track', 'breakthrough_therapy', 'accelerated_approval', 'priority_review']) {
      expect(program(r, name).eligible, name).toBe(false);
      expect(program(r, name).eligibilityRationale.join(' '), name).toMatch(/§351\(k\)/);
    }
  });
  it('a stated adequate therapy leaves the unmet need RMAT asks for not assessed', () => {
    const r = assessExpeditedProgram({ ...expedited, productType: 'cell_therapy', availableTherapyLandscape: 'adequate_existing_therapy' } as never);
    expect(program(r, 'rmat').eligible).toBeNull();
    expect(program(r, 'rmat').notAssessedCriteria.join(' ')).toMatch(/unmet medical need beside the available therapy/);
    expect(program(assessExpeditedProgram(changed(expedited, 'productType', 'cell_therapy')), 'rmat').eligible).toBe(true);
  });
  it('a combination product is not "not regenerative": whether it uses a regenerative therapy is not stated', () => {
    const rmat = program(assessExpeditedProgram(changed(expedited, 'productType', 'combination_product')), 'rmat');
    expect(rmat.eligible).toBeNull();
    expect(rmat.notAssessedCriteria[0]).toMatch(/combination product qualifies only if it uses/);
  });
});

describe('a missing or malformed value is refused by name or field, never read as another value or crashed on', () => {
  it.each([
    ['assess_expedited_program', 'availableTherapyLandscape', undefined, 'missing_input'],
    ['assess_expedited_program', 'evidenceLevel', undefined, 'missing_input'],
    ['assess_expedited_program', 'indication', 'Serious', 'invalid_input'],
    ['assess_expedited_program', 'productType', 'mAb', 'invalid_input'],
    ['plan_fda_meeting', 'purpose', 'EOP2', 'invalid_input'],
    ['plan_fda_meeting', 'developmentPhase', undefined, 'missing_input'],
    ['assess_orphan_designation', 'diseasePrevalenceUS', '30000', 'invalid_input'],
    ['assess_orphan_designation', 'diseasePrevalenceEU', -1, 'invalid_input'],
    ['assess_orphan_designation', 'existingApprovedTherapies', 1.5, 'invalid_input'],
    ['assess_orphan_designation', 'diseasePrevalenceUSSource', 42, 'invalid_input'],
    ['assess_orphan_designation', 'productType', undefined, 'missing_input'],
    ['assess_orphan_designation', 'productType', 'mAb', 'invalid_input'],
    ['select_505_pathway', 'activeIngredient', undefined, 'missing_input'],
    ['select_505_pathway', 'activeIngredient', 'NME', 'invalid_input'],
    ['assess_rolling_submission', 'expeditedDesignationStatus', 'fast track', 'invalid_input'],
    ['compare_global_pathways', 'targetMarkets', undefined, 'missing_input'],
    ['compare_global_pathways', 'targetMarkets', [], 'invalid_input'],
    ['compare_global_pathways', 'targetMarkets[0]', 'USA', 'invalid_input'],
  ] as const)('%s %s %j', async (tool, field, value, code) => {
    const out = await run(tool, changed(families.find(f => f.tool === tool)!.input, field, value));
    expect(out).toMatchObject({ status: 'needs_parameters', code, field });
    expect(out).not.toHaveProperty('error');
  });
});

describe('the definitions say what an omitted fact means', () => {
  const props = (tool: string) => REGULATORY_STRATEGY_TOOLS.find(t => t.name === tool)!.input_schema as any;
  it.each(withFlags)('$tool $flag says what an omission leaves and is not schema-required', ({ tool, flag }) => {
    const schema = props(tool);
    const path = flag.split('.');
    let at: any = schema;
    for (const k of path.slice(0, -1)) at = at.properties[k];
    expect(at.properties[path[path.length - 1]].description).toMatch(/Omitted or null/);
    expect(at.required ?? []).not.toContain(path[path.length - 1]);
  });
  it('orphan takes the prevalence sources', () => {
    expect(props('assess_orphan_designation').properties).toHaveProperty(
      'diseasePrevalenceUSSource.description', expect.stringMatching(/Without it the prevalence is not used/),
    );
  });
  it('orphan asks whether the disease is chronically debilitating, the EU prevalence limb\'s wording', () => {
    expect(props('assess_orphan_designation').properties.isDebilitating.description).toMatch(/chronically debilitating/);
    expect(REGULATORY_STRATEGY_TOOLS.find(t => t.name === 'assess_orphan_designation')!.description).not.toMatch(/<5 per 10,000/);
  });
  it('each description fits the gateway limit', () => {
    for (const t of REGULATORY_STRATEGY_TOOLS) expect(t.description.length, t.name).toBeLessThanOrEqual(1024);
  });
});
