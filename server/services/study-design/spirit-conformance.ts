/**
 * SPIRIT 2013 conformance projection — per-item checklist conformance of a study
 * design (and, optionally, its authored protocol document).
 *
 * ## The industry need
 * SPIRIT 2013 (Standard Protocol Items: Recommendations for Interventional
 * Trials; Chan et al., Ann Intern Med 2013; BMJ 2013;346:e7586) is the
 * protocol-content standard that journals, funders and many ethics committees
 * expect a trial protocol to satisfy, and sponsors run its 33-item checklist
 * before a protocol is finalised. This module is that checklist as an ENGINE:
 * every SPIRIT row is judged, deterministically, from what the structured
 * {@link StudyDesign} actually carries and from which protocol sections exist.
 *
 * It is distinct from `server/services/ana/reporting-guidelines.ts`, which is
 * an ADVISOR: it selects a reporting guideline for a study type and returns an
 * eight-line SPIRIT brief of high-yield items for a model to narrate. That
 * module summarises the standard; this one scores a design against every item
 * of it. Neither duplicates the other.
 *
 * ## The honesty contract
 *  - Pure and total: no model call, no randomness, no clock, no database, no
 *    throw on a partial design. Same input → byte-identical output.
 *  - The design is the spine (design-as-data): an item the design object can
 *    carry (`evidencedBy: 'design'`) is judged from the design only; an
 *    authored section never overrides what the structured object says.
 *  - An item only an authored protocol can evidence (`'protocol_document'`) is
 *    `not_assessable` when no document is passed — never `missing`, because
 *    the design not carrying it is not evidence of its absence. With a
 *    document, it is judged on section PRESENCE: a section keyed or titled to
 *    the topic with content is `met` when its status is `complete` and
 *    `partial` otherwise; an umbrella section (e.g. "ethics" for amendments)
 *    is at most `partial`; no or empty section is `missing`. The engine does
 *    not read prose for adequacy and never claims to.
 *  - `'either'` items are judged from the design and may be raised by a
 *    document section; a design signal that is only partial stays partial
 *    without a document.
 *  - Items the design positively records as inapplicable (allocation and
 *    blinding items for a single-arm or open-label design) are
 *    `not_assessable` with `notAssessableReason: 'not_applicable'`; an empty
 *    or unknown design is never treated as inapplicable (fail closed).
 *  - Every non-met item carries a `gap` naming what is absent. Nothing is
 *    defaulted to a favourable state.
 *
 * SPIRIT numbers 33 items; eleven (2, 5, 6, 11, 16, 17, 18, 20, 21, 26, 31) carry lettered sub-items, so the catalogue
 * has 51 assessable rows and `summary.total` is 51. The item catalogue lives in
 * `./spirit-items` and is re-exported here.
 *
 * @module server/services/study-design/spirit-conformance
 */

import { ESTIMAND_REQUIRED_ROLES, type Arm, type Endpoint, type InterimDesign, type Intervention, type StudyDesign } from './study-design-types';
import { endpointTimeFrameFromSoa, projectScheduleOfActivities } from './schedule-of-activities';
import { SPIRIT_2013_ITEMS, SPIRIT_DOCUMENT_TOPICS, type SpiritEvidenceSource, type SpiritItem, type SpiritSection } from './spirit-items';

export {
  SPIRIT_2013_ITEMS,
  SPIRIT_2013_NUMBERED_ITEM_COUNT,
  SPIRIT_DOCUMENT_TOPICS,
  type SpiritDocumentTopic,
  type SpiritEvidenceSource,
  type SpiritItem,
  type SpiritSection,
} from './spirit-items';

export const SPIRIT_BASIS =
  'SPIRIT 2013 Statement — Standard Protocol Items: Recommendations for Interventional Trials (33-item checklist)';

// ─── Public shapes ───────────────────────────────────────────────────────────

/** One authored protocol section; mirrors a `protocol_sections` row. */
export interface SpiritProtocolSection {
  sectionKey: string;
  title: string;
  content: string | null;
  /** `protocol_sections` vocabulary is not_started | draft | complete; only `complete` can meet an item. */
  status: string;
}

export interface SpiritProtocolDocument {
  sections: SpiritProtocolSection[];
}

export type SpiritItemStatus = 'met' | 'partial' | 'missing' | 'not_assessable';

/** Why an item was not assessed: no document was passed, or the design records the item as inapplicable. */
export type SpiritNotAssessableReason = 'no_document' | 'not_applicable';

export interface SpiritItemResult {
  item: string;
  number: number;
  section: SpiritSection;
  title: string;
  evidencedBy: SpiritEvidenceSource;
  status: SpiritItemStatus;
  /** Provenance lines, each prefixed `design:`, `document:` or `note:`. */
  evidence: string[];
  /** What is absent, present whenever status is not `met`. */
  gap?: string;
  notAssessableReason?: SpiritNotAssessableReason;
}

export interface SpiritConformance {
  items: SpiritItemResult[];
  summary: { met: number; partial: number; missing: number; notAssessable: number; total: number };
  basis: string;
  /** Whether a protocol document was passed; without one every document-only item is not_assessable. */
  documentProvided: boolean;
}

// ─── Verdict helpers ─────────────────────────────────────────────────────────

interface Verdict {
  status: SpiritItemStatus;
  evidence: string[];
  gap?: string;
}

const RANK: Record<SpiritItemStatus, number> = { met: 3, partial: 2, missing: 1, not_assessable: 0 };

function present(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function met(evidence: string[]): Verdict {
  return { status: 'met', evidence };
}

function partial(evidence: string[], gap: string): Verdict {
  return { status: 'partial', evidence, gap };
}

function missing(gap: string): Verdict {
  return { status: 'missing', evidence: [], gap };
}

function num(n: unknown, label: string): string {
  return typeof n === 'number' ? `${label} ${n}` : '';
}

// ─── Design judges (items the StudyDesign object can evidence) ───────────────

function investigationalNames(design: StudyDesign): string[] {
  const names: string[] = [];
  for (const arm of design.arms ?? []) {
    for (const iv of arm.interventions ?? []) if (iv.role === 'investigational' && present(iv.name)) names.push(iv.name.trim());
  }
  return names;
}

function judgeTitle(d: StudyDesign): Verdict {
  const title = present(d.title) ? d.title.trim() : '';
  if (!title) return missing('The design has no title.');
  const lc = title.toLowerCase();
  const evidence = [`design: title "${title}"`, 'note: design-type wording in the title is not assessed by this engine'];
  const notIdentified: string[] = [];
  const indication = present(d.indication) ? d.indication.trim() : '';
  if (!indication) notIdentified.push('a population (the design records no indication)');
  else if (!lc.includes(indication.toLowerCase())) notIdentified.push(`the recorded indication "${indication}"`);
  const drugs = investigationalNames(d);
  if (drugs.length === 0) notIdentified.push('an intervention (the design records no investigational intervention)');
  else if (!drugs.some(n => lc.includes(n.toLowerCase()))) notIdentified.push(`an investigational intervention (${drugs.join(', ')})`);
  if (notIdentified.length === 0) return met(evidence);
  return partial(evidence, `The title does not identify ${notIdentified.join(' or ')}; SPIRIT 1 asks the title to identify the design, population and interventions.`);
}

function judgeVersion(d: StudyDesign): Verdict {
  if (typeof d.version !== 'number') return missing('The design records no version identifier.');
  return partial([`design: version ${d.version}`], 'The design records a version identifier but the design object carries no protocol date; SPIRIT 3 asks for both.');
}

function judgeComparator(d: StudyDesign): Verdict {
  const f = d.framework;
  if (!f || !present(f.controlType)) return missing('The design records no control type, so the choice of comparator cannot be shown.');
  const evidence = [`design: framework.controlType = ${f.controlType}`];
  if (present(f.controlJustification)) {
    evidence.push(`design: framework.controlJustification = "${f.controlJustification.trim()}"`);
    return met(evidence);
  }
  return partial(evidence, `framework.controlJustification is not recorded; SPIRIT 6b asks for the explanation of the comparator choice (control type "${f.controlType}").`);
}

function judgeObjectives(d: StudyDesign): Verdict {
  const stated = (d.objectives ?? []).filter(o => present(o.text));
  if (stated.length === 0) return missing('The design records no objectives.');
  const evidence = stated.map(o => `design: ${o.level} objective ${o.order}: "${o.text.trim()}" (endpoint: ${present(o.endpointName) ? o.endpointName : 'not linked'})`);
  const gaps: string[] = [];
  if (!stated.some(o => o.level === 'primary')) gaps.push('no primary objective is recorded');
  const unlinked = stated.filter(o => !present(o.endpointName)).length;
  if (unlinked > 0) gaps.push(`${unlinked} objective(s) are not linked to an endpoint`);
  return gaps.length ? partial(evidence, `SPIRIT 7 asks for specific objectives: ${gaps.join('; ')}.`) : met(evidence);
}

function judgeTrialDesign(d: StudyDesign): Verdict {
  const f = d.framework;
  if (!f || !present(f.structuralDesign) || !present(f.inferentialFrame)) {
    return missing('The design records no framework (structural design and inferential frame).');
  }
  const evidence = [`design: structural design ${f.structuralDesign}`, `design: inferential framework ${f.inferentialFrame}`];
  const ratio = d.randomization?.ratio;
  const arms = d.arms ?? [];
  if (Array.isArray(ratio) && ratio.length > 0) {
    evidence.push(`design: allocation ratio ${ratio.join(':')}`);
    return met(evidence);
  }
  if (arms.length === 0) return partial(evidence, 'The design records no arms, so the allocation ratio cannot be shown; SPIRIT 8 asks for it.');
  if (arms.length === 1) {
    evidence.push('design: one arm — no allocation ratio applies');
    return met(evidence);
  }
  return partial(evidence, `The design has ${arms.length} arms but records no allocation ratio; SPIRIT 8 asks for the allocation ratio.`);
}

function judgeSetting(d: StudyDesign): Verdict {
  const regions = [...(d.targetRegions ?? []), ...(d.framework?.mrct?.regions ?? [])].filter(present);
  if (regions.length === 0) return missing('The design records no target regions or countries and carries no study-setting description.');
  const unique = Array.from(new Set(regions.map(r => r.trim())));
  return partial([`design: regions ${unique.join(', ')}`], 'The design records regions but not the study setting type or where the site list can be obtained; SPIRIT 9 asks for both.');
}

function judgeEligibility(d: StudyDesign): Verdict {
  const criteria = (d.population?.eligibility ?? []).filter(c => present(c.text));
  if (criteria.length === 0) return missing('The design records no eligibility criteria.');
  const inclusion = criteria.filter(c => c.type === 'inclusion').length;
  const exclusion = criteria.filter(c => c.type === 'exclusion').length;
  const evidence = [`design: ${inclusion} inclusion and ${exclusion} exclusion criteria`];
  if (inclusion === 0 || exclusion === 0) {
    return partial(evidence, `The design records ${inclusion === 0 ? 'no inclusion' : 'no exclusion'} criteria; SPIRIT 10 asks for both.`);
  }
  evidence.push('note: centre and operator eligibility (SPIRIT 10, if applicable) is not carried by the design object');
  return met(evidence);
}

function interventionDetail(arm: Arm, iv: Intervention): { line: string; lacking: string[] } {
  const parts = [present(iv.dose) ? `dose ${iv.dose}` : '', present(iv.route) ? `route ${iv.route}` : '', present(iv.regimen) ? `regimen ${iv.regimen}` : '', present(iv.duration) ? `duration ${iv.duration}` : ''].filter(present);
  const line = `design: arm "${arm.name}" — ${iv.name} (${iv.role})${parts.length ? `: ${parts.join(', ')}` : ''}`;
  const required = iv.role === 'placebo' ? [] : iv.role === 'device' ? ['regimen'] : ['dose', 'route', 'regimen'];
  const lacking = required.filter(k => !present((iv as unknown as Record<string, unknown>)[k]));
  return { line, lacking };
}

function judgeInterventions(d: StudyDesign): Verdict {
  const arms = d.arms ?? [];
  if (arms.length === 0) return missing('The design records no arms or interventions.');
  const evidence: string[] = [];
  const gaps: string[] = [];
  for (const arm of arms) {
    const ivs = arm.interventions ?? [];
    if (ivs.length === 0) gaps.push(`arm "${arm.name}" has no intervention`);
    for (const iv of ivs) {
      const { line, lacking } = interventionDetail(arm, iv);
      evidence.push(line);
      if (lacking.length) gaps.push(`"${iv.name}" in arm "${arm.name}" lacks ${lacking.join(', ')}`);
    }
  }
  if (gaps.length) return partial(evidence, `SPIRIT 11a asks for enough detail to replicate each intervention (how and when administered): ${gaps.join('; ')}.`);
  return met(evidence);
}

function judgeDiscontinuation(d: StudyDesign): Verdict {
  const arms = d.arms ?? [];
  const withRules = arms.filter(a => present(a.doseModificationRules));
  if (withRules.length === 0) return missing('The design records no dose-modification rules on any arm and carries no discontinuation criteria.');
  const evidence = withRules.map(a => `design: arm "${a.name}" doseModificationRules = "${a.doseModificationRules!.trim()}"`);
  const gaps = ['criteria for discontinuing the allocated intervention are not carried by the design object'];
  const without = arms.filter(a => !present(a.doseModificationRules) && (a.interventions ?? []).some(i => i.role !== 'placebo'));
  if (without.length) gaps.push(`arms without modification rules: ${without.map(a => `"${a.name}"`).join(', ')}`);
  return partial(evidence, `SPIRIT 11b asks for discontinuation and modification criteria: ${gaps.join('; ')}.`);
}

/** What SPIRIT 12 asks of one outcome that the design does not carry, and its evidence line. */
function outcomeShortfall(d: StudyDesign, e: Endpoint, summaryMeasure: string | undefined): { line: string; lacking: string[] } {
  const timeFrame = present(e.timepoint) ? e.timepoint.trim() : endpointTimeFrameFromSoa(d, e.name);
  const lacking: string[] = [];
  if (!present(e.definition)) lacking.push('measurement variable/definition');
  if (!timeFrame) lacking.push('time point');
  if (ESTIMAND_REQUIRED_ROLES.includes(e.role) && !present(summaryMeasure)) lacking.push('method of aggregation (estimand summary measure)');
  const definition = present(e.definition) ? `: ${e.definition.trim()}` : '';
  const line = `design: ${e.role} endpoint "${e.name}" (${e.type})${definition}${timeFrame ? ` at ${timeFrame}` : ''}`;
  return { line, lacking };
}

function judgeOutcomes(d: StudyDesign): Verdict {
  const endpoints = (d.endpoints ?? []).filter(e => e.role !== 'exploratory' && e.role !== 'safety');
  if ((d.endpoints ?? []).length === 0) return missing('The design records no endpoints.');
  const evidence: string[] = [];
  const gaps: string[] = [];
  if (!endpoints.some(e => e.role === 'primary')) gaps.push('no primary endpoint is recorded');
  const summaryMeasures = new Map((d.estimands ?? []).map(e => [e.endpointName, e.summaryMeasure] as const));
  for (const e of endpoints) {
    const { line, lacking } = outcomeShortfall(d, e, summaryMeasures.get(e.name));
    evidence.push(line);
    if (lacking.length) gaps.push(`"${e.name}" lacks ${lacking.join(', ')}`);
  }
  if (gaps.length) return partial(evidence, `SPIRIT 12 asks for the variable, metric, aggregation and time point of each outcome: ${gaps.join('; ')}.`);
  return met(evidence);
}

function judgeTimeline(d: StudyDesign): Verdict {
  const proj = projectScheduleOfActivities(d);
  if (!proj.present) return missing('The design carries no Schedule of Activities, so the participant timeline cannot be shown.');
  const c = proj.counts;
  const evidence = [`design: Schedule of Activities with ${c.epochs} epochs, ${c.visits} visits, ${c.activities} activities, ${c.scheduledCells} scheduled cells`];
  const gaps: string[] = [];
  const kinds = new Set(proj.epochs.map(s => s.epoch.kind));
  if (!kinds.has('screening')) gaps.push('no screening/enrolment epoch has visits');
  if (!kinds.has('treatment')) gaps.push('no treatment epoch has visits');
  const undated = proj.visits.filter(v => !v.unscheduled && typeof v.studyDay !== 'number').length;
  if (undated > 0) gaps.push(`${undated} scheduled visit(s) have no study day`);
  if (c.activities === 0 || c.scheduledCells === 0) gaps.push('no assessments are scheduled');
  if (gaps.length) return partial(evidence, `SPIRIT 13 asks for the time schedule of enrolment, interventions, assessments and visits: ${gaps.join('; ')}.`);
  return met(evidence);
}

function judgeSampleSize(d: StudyDesign): Verdict {
  const sp = d.statisticalPlan;
  const n = sp?.plannedSampleSize;
  if (typeof n !== 'number' || n <= 0) return missing('The design records no planned sample size.');
  const evidence = [`design: statisticalPlan.plannedSampleSize = ${n}`];
  const gaps: string[] = [];
  if (typeof sp.power === 'number') evidence.push(`design: power ${sp.power}`); else gaps.push('the target power');
  if (typeof sp.alpha === 'number') evidence.push(`design: alpha ${sp.alpha}${sp.oneSided ? ' (one-sided)' : ''}`); else gaps.push('the significance level');
  const pa = sp.powerAssumptions;
  const assumptions = pa ? [num(pa.effectSize, 'effect size'), num(pa.eventRate, 'event rate'), num(pa.variance, 'variance')].filter(present) : [];
  if (assumptions.length) evidence.push(`design: assumptions ${assumptions.join(', ')}`);
  else gaps.push('the clinical/statistical assumptions (effect size, event rate or variance)');
  if (typeof sp.dropoutRate === 'number') evidence.push(`design: dropout rate ${sp.dropoutRate}`);
  if (gaps.length) return partial(evidence, `SPIRIT 14 asks how the sample size was determined; the design does not record ${gaps.join(', ')}.`);
  return met(evidence);
}

function judgeAllocation(d: StudyDesign): Verdict {
  const r = d.randomization;
  if (!r || !present(r.allocationMethod)) return missing('The design records no randomization node (allocation method).');
  const evidence = [`design: randomization.allocationMethod = ${r.allocationMethod}`];
  if (r.allocationMethod === 'none') {
    return partial(evidence, 'The allocation method is recorded as "none"; SPIRIT 16a asks for the method of generating the allocation sequence in a controlled trial.');
  }
  const strata = (r.stratificationFactors ?? []).filter(present);
  if (strata.length) evidence.push(`design: stratification factors ${strata.join(', ')}`);
  if (r.allocationMethod === 'stratified' && strata.length === 0) {
    return partial(evidence, 'Stratified allocation is recorded without stratification factors; SPIRIT 16a asks for the list of factors.');
  }
  evidence.push('note: restriction details (e.g. block size) belong in a separate document per SPIRIT 16a and are not assessed here');
  return met(evidence);
}

function judgeBlinding(d: StudyDesign): Verdict {
  const r = d.randomization;
  if (!r || !present(r.blinding)) return missing('The design records no blinding level.');
  const evidence = [`design: randomization.blinding = ${r.blinding}`];
  if (present(r.blindingRationale)) evidence.push(`design: blindingRationale = "${r.blindingRationale.trim()}"`);
  if (r.blinding === 'open') {
    evidence.push('design: open-label — no party is blinded');
    return met(evidence);
  }
  return partial(evidence, `The design records the blinding level "${r.blinding}" but not which parties are blinded and how; SPIRIT 17a asks for the parties and the mechanism rather than the label.`);
}

function judgeUnblinding(d: StudyDesign): Verdict {
  const r = d.randomization;
  if (!r || !present(r.blinding)) return missing('The design records no blinding level, so the unblinding provisions cannot be assessed against it.');
  if (present(r.emergencyUnblindingProcedure)) {
    return met([`design: randomization.blinding = ${r.blinding}`, `design: randomization.emergencyUnblindingProcedure = "${r.emergencyUnblindingProcedure.trim()}"`]);
  }
  return missing(`The design is ${r.blinding}-blind but records no emergency unblinding procedure.`);
}

function judgeDataCollection(d: StudyDesign): Verdict {
  const proj = projectScheduleOfActivities(d);
  const primaries = (d.endpoints ?? []).filter(e => e.role === 'primary');
  const instrumented = primaries.filter(e => present(e.measurementMethod) || present(e.validatedInstrument));
  const evidence: string[] = [];
  if (proj.present) evidence.push(`design: Schedule of Activities schedules ${proj.counts.activities} activities across ${proj.counts.visits} visits`);
  for (const e of instrumented) evidence.push(`design: "${e.name}" measured by ${(e.measurementMethod ?? e.validatedInstrument)!.trim()}`);
  if (evidence.length === 0) return missing('The design carries no Schedule of Activities and no measurement method on any primary endpoint.');
  const gaps = ['data-quality processes and the reference to data collection forms are not carried by the design object'];
  if (!proj.present) gaps.push('no Schedule of Activities is attached');
  const uninstrumented = primaries.filter(e => !instrumented.includes(e));
  if (uninstrumented.length) gaps.push(`primary endpoint(s) without a measurement method: ${uninstrumented.map(e => `"${e.name}"`).join(', ')}`);
  return partial(evidence, `SPIRIT 18a: ${gaps.join('; ')}.`);
}

function judgeStatisticalMethods(d: StudyDesign): Verdict {
  const analyses = (d.statisticalPlan?.plannedAnalyses ?? []).filter(a => present(a.method));
  if (analyses.length === 0) return missing('The design records no planned analyses.');
  const evidence = analyses.map(a => `design: "${a.endpointName}" — ${a.method.trim()}`);
  const analysed = new Set(analyses.map(a => a.endpointName));
  const uncovered = (d.endpoints ?? []).filter(e => (e.role === 'primary' || e.role === 'key_secondary' || e.role === 'secondary') && !analysed.has(e.name));
  if (uncovered.length) {
    return partial(evidence, `SPIRIT 20a asks for the methods for primary and secondary outcomes; no method is recorded for: ${uncovered.map(e => `"${e.name}" (${e.role})`).join(', ')}.`);
  }
  return met(evidence);
}

function judgeAdditionalAnalyses(d: StudyDesign): Verdict {
  const evidence: string[] = [];
  if (d.statisticalPlan?.sensitivityAnalysesSpecified === true) evidence.push('design: statisticalPlan.sensitivityAnalysesSpecified = true');
  const consistency = d.framework?.mrct?.consistencyApproach;
  if (present(consistency)) evidence.push(`design: MRCT regional consistency approach "${consistency.trim()}"`);
  if (evidence.length === 0) return missing('The design records no sensitivity, subgroup or adjusted analyses.');
  return partial(evidence, 'Subgroup and adjusted analyses are not carried by the design object; SPIRIT 20b asks for the methods of any additional analyses.');
}

function judgePopulationAndMissingData(d: StudyDesign): Verdict {
  const sets = (d.population?.analysisPopulations ?? []).filter(s => present(s.definition));
  const strategy = d.statisticalPlan?.missingDataStrategy;
  const evidence: string[] = [];
  const gaps: string[] = [];
  if (sets.length) {
    evidence.push(`design: analysis populations ${sets.map(s => `${s.kind}${s.isPrimaryAnalysisSet ? ' (primary analysis set)' : ''}`).join(', ')}`);
    if (!sets.some(s => s.isPrimaryAnalysisSet)) gaps.push('no analysis population is marked as the primary analysis set');
  } else {
    gaps.push('no analysis population is defined');
  }
  if (present(strategy)) evidence.push(`design: statisticalPlan.missingDataStrategy = "${strategy.trim()}"`);
  else gaps.push('no missing-data method is recorded');
  if (evidence.length === 0) return missing('The design records no analysis population and no missing-data method (SPIRIT 20c).');
  return gaps.length ? partial(evidence, `SPIRIT 20c: ${gaps.join('; ')}.`) : met(evidence);
}

function judgeDataMonitoringCommittee(d: StudyDesign): Verdict {
  const c = d.safety?.dmcCharter;
  if (!c) return missing('The design records no DMC charter and no statement that a DMC is not needed.');
  if (c.present !== true) {
    return partial(['design: safety.dmcCharter.present = false'], 'The design records that there is no DMC; SPIRIT 21a then asks for an explanation of why a DMC is not needed, which the design object does not carry.');
  }
  const evidence = ['design: safety.dmcCharter.present = true'];
  if (present(c.composition)) evidence.push(`design: composition "${c.composition.trim()}"`);
  if (present(c.meetingCadence)) evidence.push(`design: meeting cadence ${c.meetingCadence.trim()}`);
  if (typeof c.hasStatisticalMember === 'boolean') evidence.push(`design: statistical member ${c.hasStatisticalMember ? 'yes' : 'no'}`);
  if (!present(c.composition)) return partial(evidence, 'A DMC is recorded without its composition; SPIRIT 21a asks for composition, role, reporting structure and independence.');
  evidence.push('note: independence from the sponsor and the reporting structure are not carried by the design object');
  return met(evidence);
}

/** Evidence the design carries for planned interim analyses, and whether any stopping boundary is recorded. */
function interimEvidence(interim: InterimDesign | undefined): { planned: boolean; boundaries: boolean; lines: string[] } {
  const fractions = interim?.informationFractions ?? [];
  if (!interim || fractions.length === 0) return { planned: false, boundaries: false, lines: [] };
  const lines = [`design: interim analyses at information fractions ${fractions.join(', ')}${interim.spendingFunction ? ` (${interim.spendingFunction})` : ''}`];
  const boundaries = (interim.efficacyBoundaries?.length ?? 0) > 0 || (interim.futilityBoundaries?.length ?? 0) > 0;
  if (boundaries) lines.push('design: efficacy/futility boundaries recorded');
  if (present(interim.dmcRole)) lines.push(`design: interim DMC role "${interim.dmcRole.trim()}"`);
  return { planned: true, boundaries, lines };
}

function judgeInterimAndStopping(d: StudyDesign): Verdict {
  const interim = interimEvidence(d.statisticalPlan?.interim);
  const stopping = d.safety?.stoppingRules;
  const evidence = [...interim.lines];
  if (present(stopping)) evidence.push(`design: safety.stoppingRules = "${stopping.trim()}"`);
  if (evidence.length === 0) return missing('The design records neither interim analyses nor stopping rules.');
  if (interim.planned && !interim.boundaries && !present(stopping)) {
    return partial(evidence, 'Interim analyses are recorded without stopping boundaries or stopping rules; SPIRIT 21b asks for the stopping guidelines.');
  }
  if (!interim.planned) evidence.push('note: no interim analysis is recorded in the design; SPIRIT 21b is judged on the stopping rules alone');
  evidence.push('note: who sees interim results and decides termination is not carried by the design object beyond the DMC role');
  return met(evidence);
}

function judgeHarms(d: StudyDesign): Verdict {
  const s = d.safety;
  if (!s || !present(s.aeDefinitions)) return missing('The design records no adverse-event definitions (safety.aeDefinitions).');
  const evidence = [`design: safety.aeDefinitions = "${s.aeDefinitions.trim()}"`];
  if (present(s.dltDefinition)) evidence.push(`design: DLT definition "${s.dltDefinition.trim()}"`);
  evidence.push('note: AE reporting and management procedures beyond the definitions are not carried by the design object');
  return met(evidence);
}

/** Item code → design judge. Every `design` and `either` item has one; a test pins the coverage. */
const DESIGN_JUDGES: Readonly<Record<string, (d: StudyDesign) => Verdict>> = {
  '1': judgeTitle,
  '3': judgeVersion,
  '6b': judgeComparator,
  '7': judgeObjectives,
  '8': judgeTrialDesign,
  '9': judgeSetting,
  '10': judgeEligibility,
  '11a': judgeInterventions,
  '11b': judgeDiscontinuation,
  '12': judgeOutcomes,
  '13': judgeTimeline,
  '14': judgeSampleSize,
  '16a': judgeAllocation,
  '17a': judgeBlinding,
  '17b': judgeUnblinding,
  '18a': judgeDataCollection,
  '20a': judgeStatisticalMethods,
  '20b': judgeAdditionalAnalyses,
  '20c': judgePopulationAndMissingData,
  '21a': judgeDataMonitoringCommittee,
  '21b': judgeInterimAndStopping,
  '22': judgeHarms,
};

/** Items the design can carry but for which no judge is registered fail closed, never open. */
function judgeDesign(item: SpiritItem, design: StudyDesign): Verdict {
  const judge = DESIGN_JUDGES[item.item];
  if (!judge) return { status: 'not_assessable', evidence: [], gap: `No design judge is registered for SPIRIT ${item.item}; the item was not assessed.` };
  return judge(design);
}

// ─── Applicability (SPIRIT 16–17 are for controlled / blinded trials) ─────────

const ASSIGNMENT_ITEMS = new Set(['16a', '16b', '16c', '17a', '17b']);

/** A reason the item does not apply, ONLY when the design positively records it; an unknown design is never inapplicable. */
function notApplicable(item: SpiritItem, d: StudyDesign): { reason: string; evidence: string[] } | undefined {
  if (!ASSIGNMENT_ITEMS.has(item.item)) return undefined;
  const f = d.framework;
  const arms = d.arms ?? [];
  if (f?.structuralDesign === 'single_arm') {
    return { reason: `SPIRIT ${item.item} applies to controlled trials and the design is recorded as single-arm`, evidence: ['design: framework.structuralDesign = single_arm'] };
  }
  if (f?.controlType === 'none' && arms.length <= 1) {
    return { reason: `SPIRIT ${item.item} applies to controlled trials and the design records no control and ${arms.length} arm(s)`, evidence: ['design: framework.controlType = none', `design: ${arms.length} arm(s)`] };
  }
  if (item.item === '17b' && d.randomization?.blinding === 'open') {
    return { reason: 'SPIRIT 17b applies to blinded trials and the design is recorded as open-label', evidence: ['design: randomization.blinding = open'] };
  }
  return undefined;
}

// ─── Document judge (section presence, never prose adequacy) ─────────────────

function normaliseKey(key: unknown): string {
  return typeof key === 'string' ? key.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
}

function hasContent(s: SpiritProtocolSection): boolean {
  return present(s.content);
}

function describeSection(s: SpiritProtocolSection): string {
  return `document: section "${s.sectionKey}" ("${s.title}") status ${s.status}, ${(s.content ?? '').trim().length} characters`;
}

function judgeDocument(item: SpiritItem, doc: SpiritProtocolDocument): Verdict {
  const topic = SPIRIT_DOCUMENT_TOPICS[item.item];
  if (!topic) return { status: 'not_assessable', evidence: [], gap: `No document topic is registered for SPIRIT ${item.item}; the item was not assessed.` };
  const sections = Array.isArray(doc.sections) ? doc.sections : [];
  const specific = sections.filter(s => topic.keys.includes(normaliseKey(s.sectionKey)) || topic.titleTerms.some(t => (typeof s.title === 'string' ? s.title.toLowerCase() : '').includes(t)));
  const umbrella = sections.filter(s => !specific.includes(s) && (topic.umbrellaKeys ?? []).includes(normaliseKey(s.sectionKey)));
  const filled = specific.filter(hasContent);
  const names = (list: SpiritProtocolSection[]) => list.map(s => `"${s.sectionKey}"`).join(', ');
  if (filled.length) {
    const evidence = filled.map(describeSection);
    if (filled.some(s => normaliseKey(s.status) === 'complete')) return met(evidence);
    return partial(evidence, `The document addresses ${topic.label} in section(s) ${names(filled)} but none is in status "complete"; SPIRIT ${item.item} is met only by a complete section.`);
  }
  const filledUmbrella = umbrella.filter(hasContent);
  if (filledUmbrella.length) {
    return partial(filledUmbrella.map(describeSection), `The document has no section dedicated to ${topic.label}; its ${names(filledUmbrella)} section(s) may cover it, but this engine cannot confirm that they address SPIRIT ${item.item}.`);
  }
  if (specific.length) return missing(`The document's ${names(specific)} section(s) for ${topic.label} have no content.`);
  return missing(`The document has no section keyed or titled to ${topic.label} (looked for keys ${topic.keys.join(', ')} or titles containing ${topic.titleTerms.map(t => `"${t}"`).join(', ')}).`);
}

// ─── Assembly ────────────────────────────────────────────────────────────────

function topicLabel(item: SpiritItem): string {
  return SPIRIT_DOCUMENT_TOPICS[item.item]?.label ?? item.title.toLowerCase();
}

function noDocument(item: SpiritItem): Verdict {
  return { status: 'not_assessable', evidence: [], gap: `Not assessable from the study design: SPIRIT ${item.item} (${topicLabel(item)}) is evidenced by the protocol document, and no protocol document was passed.` };
}

function withNoDocumentNote(item: SpiritItem, v: Verdict): Verdict {
  if (v.status === 'met') return v;
  return { ...v, gap: `${v.gap ?? ''} No protocol document was passed; a document section on ${topicLabel(item)} could also evidence this item.`.trim() };
}

function sourceLines(source: 'design' | 'document', v: Verdict): string[] {
  return v.status === 'missing' ? [`${source}: not evidenced — ${v.gap ?? ''}`.trim()] : v.evidence;
}

function mergeVerdicts(fromDesign: Verdict, fromDoc: Verdict): Verdict {
  const evidence = [...sourceLines('design', fromDesign), ...sourceLines('document', fromDoc)];
  const winner = RANK[fromDoc.status] > RANK[fromDesign.status] ? fromDoc : fromDesign;
  if (winner.status === 'met') return { status: 'met', evidence };
  const gaps = [fromDesign.gap, fromDoc.status === 'met' ? undefined : fromDoc.gap].filter(present);
  return { status: winner.status, evidence, gap: gaps.join(' Document: ') };
}

function toResult(item: SpiritItem, v: Verdict, reason?: SpiritNotAssessableReason): SpiritItemResult {
  const out: SpiritItemResult = {
    item: item.item,
    number: item.number,
    section: item.section,
    title: item.title,
    evidencedBy: item.evidencedBy,
    status: v.status,
    evidence: v.evidence,
  };
  if (present(v.gap)) out.gap = v.gap;
  if (reason) out.notAssessableReason = reason;
  return out;
}

function assessItem(item: SpiritItem, design: StudyDesign, doc: SpiritProtocolDocument | undefined): SpiritItemResult {
  const na = notApplicable(item, design);
  if (na) return toResult(item, { status: 'not_assessable', evidence: na.evidence, gap: `Not applicable: ${na.reason}.` }, 'not_applicable');
  if (item.evidencedBy === 'design') return toResult(item, judgeDesign(item, design));
  if (item.evidencedBy === 'protocol_document') {
    return doc ? toResult(item, judgeDocument(item, doc)) : toResult(item, noDocument(item), 'no_document');
  }
  const fromDesign = judgeDesign(item, design);
  return doc ? toResult(item, mergeVerdicts(fromDesign, judgeDocument(item, doc))) : toResult(item, withNoDocumentNote(item, fromDesign));
}

/**
 * Assess a study design (and optionally its authored protocol document) against every
 * row of the SPIRIT 2013 checklist. Pure, total and deterministic; see the module
 * header for the honesty contract.
 */
export function assessSpiritConformance(design: StudyDesign, doc?: SpiritProtocolDocument): SpiritConformance {
  const document = doc && Array.isArray(doc.sections) ? doc : undefined;
  const items = SPIRIT_2013_ITEMS.map(item => assessItem(item, design, document));
  const summary = { met: 0, partial: 0, missing: 0, notAssessable: 0, total: items.length };
  for (const r of items) {
    if (r.status === 'met') summary.met += 1;
    else if (r.status === 'partial') summary.partial += 1;
    else if (r.status === 'missing') summary.missing += 1;
    else summary.notAssessable += 1;
  }
  return { items, summary, basis: SPIRIT_BASIS, documentProvided: document !== undefined };
}
