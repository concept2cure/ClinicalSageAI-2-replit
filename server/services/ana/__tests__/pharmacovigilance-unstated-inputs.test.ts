/**
 * S5a: the pharmacovigilance worksheets decide no clock, threshold, tier or
 * obligation from a fact nobody stated. An omitted fact reads as not_stated,
 * what it decides as not_assessed (or null), and a required fact is refused by
 * name. Before this, an omitted seriousnessCriteria gave a fatal SUSAR the
 * 15-day clock, an omitted DME status raised the signal threshold to 3 cases,
 * and omitted PV-system facts concluded a QPPV was mandated and routine PV sufficed.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyExpeditedReporting, assessCausality, planAggregateReport,
  detectSafetySignal, assessSignalPriority, designPVSystem,
} from '../../pharmacovigilance/pharmacovigilance-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { PHARMACOVIGILANCE_TOOLS } from '../pharmacovigilanceTools';

const expedited = {
  stage: 'investigational', serious: true, seriousnessCriteria: ['hospitalization'], expectedness: 'unexpected',
  relatedness: 'related', region: 'both', fromInterventionalStudy: true, occurredInEU: true,
} satisfies Parameters<typeof classifyExpeditedReporting>[0];
const causality = {
  naranjoAnswers: { q1_previous_reports: 'yes', q2_after_drug: 'yes', q5_alternative_causes: 'no' },
  dechallenge: 'positive', rechallenge: 'not_done', temporalPlausible: 'yes', alternativeExplanation: 'no',
  pharmacologicallyKnown: 'unknown', informationSufficient: true,
} satisfies Parameters<typeof assessCausality>[0];
const aggregate = {
  stage: 'marketed', region: 'both', marketed: true, inDevelopment: false, yearsSinceAuthorization: 1,
  onEURDList: false, withinFirstThreeYearsUS: true,
} satisfies Parameters<typeof planAggregateReport>[0];
const signal = { a: 2, b: 98, c: 50, d: 99850, designatedMedicalEvent: true } satisfies Parameters<typeof detectSafetySignal>[0];
const priority = {
  strengthOfEvidence: 'moderate', seriousness: 'serious_non_fatal', novelty: 'known_change', publicHealthImpact: 'medium',
  preventability: 'partially', vulnerablePopulation: true, designatedMedicalEvent: false,
} satisfies Parameters<typeof assessSignalPriority>[0];
const pvSystem = {
  region: 'eu', stage: 'marketed', newActiveSubstance: false, hasImportantRisks: false, euMarketingAuthorization: true,
  estimatedAnnualICSRVolume: 500, portfolioSize: 3,
} satisfies Parameters<typeof designPVSystem>[0];

const families = [
  { tool: 'classify_expedited_reporting', compute: classifyExpeditedReporting, input: expedited,
    flags: ['fromInterventionalStudy', 'occurredInEU'] },
  { tool: 'assess_pv_causality', compute: assessCausality, input: causality, flags: ['informationSufficient'] },
  { tool: 'plan_aggregate_safety_report', compute: planAggregateReport, input: aggregate,
    flags: ['marketed', 'inDevelopment', 'onEURDList', 'withinFirstThreeYearsUS'] },
  { tool: 'detect_safety_signal', compute: detectSafetySignal, input: signal, flags: ['designatedMedicalEvent'] },
  { tool: 'assess_signal_priority', compute: assessSignalPriority, input: priority,
    flags: ['vulnerablePopulation', 'designatedMedicalEvent'] },
  { tool: 'design_pv_system', compute: designPVSystem, input: pvSystem,
    flags: ['newActiveSubstance', 'hasImportantRisks', 'euMarketingAuthorization'] },
];

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101, userId: 7 } as never));
}

describe('the six pharmacovigilance tools compute from stated facts', () => {
  it.each(families)('$tool reaches its engine with a stated basis', async ({ tool, input }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', engine: 'deterministic', basis: 'stated', appliesTo: 'the inputs stated in this conversation',
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
    for (const value of ['false', 0, 1]) {
      const out = await run(tool, changed(input, { [field]: value }));
      expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
      expect(out).not.toHaveProperty('basis');
    }
  });
});

describe('the six definitions say what an omitted flag means', () => {
  it.each(families)('$tool describes each flag when omitted, and claims no default', ({ tool, flags }) => {
    const properties = PHARMACOVIGILANCE_TOOLS.find(t => t.name === tool)!.input_schema.properties as
      Record<string, { description: string }>;
    for (const field of flags) {
      expect(properties[field].description, field).toMatch(/omitted|Required when/);
      expect(properties[field].description, field).not.toMatch(/\(default\)/);
    }
  });
});

describe('a required fact is refused by name, never defaulted', () => {
  it.each([
    { tool: 'classify_expedited_reporting', input: expedited, field: 'serious' },
    { tool: 'classify_expedited_reporting', input: expedited, field: 'region' },
    { tool: 'classify_expedited_reporting', input: expedited, field: 'stage' },
    { tool: 'plan_aggregate_safety_report', input: aggregate, field: 'region' },
    { tool: 'detect_safety_signal', input: signal, field: 'd' },
    { tool: 'assess_signal_priority', input: priority, field: 'strengthOfEvidence' },
    { tool: 'design_pv_system', input: pvSystem, field: 'region' },
  ])('$tool refuses without $field', async ({ tool, input, field }) => {
    const out = await run(tool, changed(input, { [field]: undefined }));
    expect(out).toMatchObject({ status: 'needs_parameters', code: 'missing_input', field });
    expect(out.message).toContain(field);
  });
});

describe('classify_expedited_reporting chooses no clock or rule set from an omitted fact', () => {
  it.each([
    { criteria: undefined, as: 'omitted' }, { criteria: [], as: 'empty for a serious case' },
  ])('gives an expedited development case no 7- or 15-day clock when seriousnessCriteria is $as', ({ criteria }) => {
    const out = classifyExpeditedReporting(changed(expedited, { seriousnessCriteria: criteria }));
    expect(out.fatalOrLifeThreatening).toBe('not_stated');
    expect(out.obligations).toHaveLength(2);
    for (const o of out.obligations) {
      expect(o).toMatchObject({ reportable: true, clock: null, reportType: expect.stringMatching(/not assessed/) });
    }
    expect(out.fastestClockDays).toBe('not_assessed');
    expect(out.rationale.join(' ')).not.toMatch(/standard 15-calendar-day clock/);
  });
  it.each([
    { criteria: ['death'], days: 7 }, { criteria: ['life_threatening'], days: 7 }, { criteria: ['hospitalization'], days: 15 },
  ])('keeps the clock the stated $criteria choose: $days days', ({ criteria, days }) => {
    const out = classifyExpeditedReporting(changed(expedited, { seriousnessCriteria: criteria }));
    expect(out.obligations.map(o => o.clock?.calendarDays)).toEqual([days, days]);
    expect(out.fastestClockDays).toBe(days);
  });
  it('refuses seriousnessCriteria that is not a list of the ICH E2A criteria', async () => {
    expect(await run('classify_expedited_reporting', changed(expedited, { seriousnessCriteria: 'death' })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: 'seriousnessCriteria' });
  });
  it('asks which rules apply when stage is "both" and fromInterventionalStudy is omitted', async () => {
    expect(await run('classify_expedited_reporting', changed(expedited, { stage: 'both', fromInterventionalStudy: undefined })))
      .toMatchObject({ status: 'needs_parameters', code: 'missing_input', field: 'fromInterventionalStudy' });
    expect(classifyExpeditedReporting(changed(expedited, { stage: 'both', fromInterventionalStudy: true })).isSUSAR).toBe(true);
    expect(classifyExpeditedReporting(changed(expedited, { stage: 'both', fromInterventionalStudy: false })).isSUSAR).toBe(false);
  });
  it('does not read an omitted occurredInEU as non-EEA for a non-serious postmarketing case', () => {
    const base = { ...expedited, stage: 'marketed', serious: false, seriousnessCriteria: undefined, fromInterventionalStudy: false };
    const eu = (out: ReturnType<typeof classifyExpeditedReporting>) => out.obligations.find(o => o.region === 'eu');
    const unstated = classifyExpeditedReporting(changed(base, { occurredInEU: undefined }));
    expect(eu(unstated)).toMatchObject({ reportable: null, clock: null });
    expect(unstated.fastestClockDays).toBe('not_assessed');
    expect(eu(classifyExpeditedReporting(changed(base, { occurredInEU: true }))))
      .toMatchObject({ reportable: true, clock: { calendarDays: 90 } });
    expect(eu(classifyExpeditedReporting(changed(base, { occurredInEU: false })))).toMatchObject({ reportable: false, clock: null });
  });
});

describe('assess_pv_causality assigns no WHO-UMC category without a stated sufficiency', () => {
  it('keeps the Naranjo score and withholds the WHO-UMC category and its agreement', () => {
    const out = assessCausality(changed(causality, { informationSufficient: undefined }));
    expect(out).toMatchObject({ naranjoScore: 6, naranjoCategory: 'probable', whoUmcCategory: 'not_assessed', whoUmcCriteria: [] });
    expect(out.agreement).toMatch(/not assessed/);
    expect(out.warnings.join(' ')).not.toMatch(/DIVERGE/);
  });
  it.each([
    { informationSufficient: true, category: 'probable' }, { informationSufficient: false, category: 'unassessable' },
  ])('keeps the stated answer: $informationSufficient gives $category', ({ informationSufficient, category }) => {
    expect(assessCausality(changed(causality, { informationSufficient })).whoUmcCategory).toBe(category);
  });
});

describe('plan_aggregate_safety_report schedules no cadence from an omitted fact', () => {
  const pader = (out: ReturnType<typeof planAggregateReport>) => out.reports.find(r => r.type === 'PADER');
  const pbrer = (out: ReturnType<typeof planAggregateReport>) => out.reports.find(r => r.type === 'PBRER');
  it('does not default the PADER to quarterly when withinFirstThreeYearsUS is omitted', () => {
    const out = pader(planAggregateReport(changed(aggregate, { withinFirstThreeYearsUS: undefined })));
    expect(out?.cadence).toMatch(/^Not assessed/);
    expect(out?.submissionDeadline).toMatch(/^Not assessed/);
  });
  it('does not bypass the EURD list when onEURDList is omitted', () => {
    expect(pbrer(planAggregateReport(changed(aggregate, { onEURDList: undefined })))?.cadence).toMatch(/^Not assessed/);
  });
  it('keeps the stated schedule', () => {
    const out = planAggregateReport(aggregate);
    expect(pader(out)?.submissionDeadline).toBe('Within 30 calendar days of the close of each quarter.');
    expect(pbrer(out)?.cadence).toBe('Every 6 months (first 2 years after authorisation).');
    expect(pader(planAggregateReport(changed(aggregate, { withinFirstThreeYearsUS: false })))?.submissionDeadline)
      .toBe('Within 60 calendar days of the anniversary of US approval.');
    expect(pbrer(planAggregateReport(changed(aggregate, { onEURDList: true })))?.cadence).toMatch(/^Per the EU Reference Dates/);
  });
});

describe('detect_safety_signal applies no case-count threshold from an omitted DME status', () => {
  it('leaves 1-2 cases undetermined when designatedMedicalEvent is omitted', () => {
    const out = detectSafetySignal(changed(signal, { designatedMedicalEvent: undefined }));
    expect(out.signalOfDisproportionateReporting).toBeNull();
    expect(out.measures.map(m => m.exceedsThreshold)).toEqual([null, null, null]);
    for (const m of out.measures.filter(x => x.method !== 'EBGM')) expect(m.signalThreshold).toMatch(/DME status not stated/);
  });
  it.each([
    { dme: true, sdr: true, count: /a >= 1 \(DME/ }, { dme: false, sdr: false, count: /a >= 3 \((Evans|van)/ },
  ])('keeps the stated DME answer $dme', ({ dme, sdr, count }) => {
    const out = detectSafetySignal(changed(signal, { designatedMedicalEvent: dme }));
    expect(out.signalOfDisproportionateReporting).toBe(sdr);
    for (const m of out.measures.filter(x => x.method !== 'EBGM')) expect(m.signalThreshold).toMatch(count);
  });
  it('decides without DME status when the count criterion holds either way', () => {
    expect(detectSafetySignal(changed(signal, { a: 5, b: 95, designatedMedicalEvent: undefined }))
      .signalOfDisproportionateReporting).toBe(true);
  });
});

describe('assess_signal_priority gives a tier only when the unstated modifiers cannot move it', () => {
  it('withholds the tier when an omitted modifier could cross a boundary', () => {
    expect(assessSignalPriority(changed(priority, { vulnerablePopulation: undefined, designatedMedicalEvent: undefined })))
      .toMatchObject({ priorityTier: 'not_assessed', priorityScore: null, scoreRange: { min: 11, max: 15 } });
  });
  it('keeps a tier the omitted modifiers cannot change', () => {
    expect(assessSignalPriority(changed(priority, {
      strengthOfEvidence: 'strong', novelty: 'new', publicHealthImpact: 'high', preventability: 'preventable',
      vulnerablePopulation: undefined, designatedMedicalEvent: undefined,
    }))).toMatchObject({ priorityTier: 'high', priorityScore: null, scoreRange: { min: 15, max: 19 } });
  });
  it('scores the stated modifiers', () => {
    expect(assessSignalPriority(priority)).toMatchObject({ priorityTier: 'medium', priorityScore: 13, scoreRange: { min: 13, max: 13 } });
  });
});

describe('design_pv_system leaves an obligation open when the fact that decides it is omitted', () => {
  it('does not assume an EU authorisation or the absence of risks', () => {
    const out = designPVSystem(changed(pvSystem, {
      newActiveSubstance: undefined, hasImportantRisks: undefined, euMarketingAuthorization: undefined,
    }));
    expect(out).toMatchObject({ qppvRequired: null, psmfRequired: null, rmpRequired: null });
    expect(out.components.find(c => c.component.startsWith('Qualified Person'))?.required).toBeNull();
    expect(out.pharmacovigilancePlan.join(' ')).not.toMatch(/Routine pharmacovigilance is likely sufficient/);
  });
  it('decides from a stated fact that settles it alone', () => {
    expect(designPVSystem(changed(pvSystem, { newActiveSubstance: true, hasImportantRisks: undefined })).rmpRequired).toBe(true);
  });
  it('keeps the stated answers', () => {
    const out = designPVSystem(pvSystem);
    expect(out).toMatchObject({ qppvRequired: true, psmfRequired: true, rmpRequired: false });
    expect(out.pharmacovigilancePlan.join(' ')).toMatch(/Routine pharmacovigilance is likely sufficient/);
    expect(designPVSystem(changed(pvSystem, { euMarketingAuthorization: false })).qppvRequired).toBe(false);
  });
});
