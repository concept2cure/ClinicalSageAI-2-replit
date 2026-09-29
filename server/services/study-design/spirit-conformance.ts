/**
 * SPIRIT 2013 conformance projection — per-item checklist conformance of a study
 * design (and, optionally, its authored protocol document).
 *
 * ## Which SPIRIT, and what that means
 * SPIRIT 2013 (Standard Protocol Items: Recommendations for Interventional
 * Trials; Chan et al., Ann Intern Med 2013;158:200-207; explanation and
 * elaboration BMJ 2013;346:e7586) was superseded by the SPIRIT 2025 statement
 * (Chan et al., 2025; BMJ 2025;389:e081477; Nat Med 2025;31:1784-1792), which
 * has 34 minimum items, a new open-science section and a patient and public
 * involvement item, and which journals now reference. THIS ENGINE ASSESSES THE
 * 2013 CHECKLIST ONLY. A sponsor still reporting against the 2013 checklist
 * (a protocol written before the update, a funder or committee template that
 * still cites it) gets that check; nobody gets a claim of conformance to the
 * current guideline. Every output carries `supersededBy` so a consumer can say
 * so, and `basis` names the supersession too.
 *
 * This module is the 2013 checklist as an ENGINE: every row is judged,
 * deterministically, from what the structured {@link StudyDesign} actually
 * carries and from which protocol sections exist. It is distinct from
 * `server/services/ana/reporting-guidelines.ts`, which is an ADVISOR that
 * selects a guideline for a study type and returns a short brief for a model
 * to narrate. That module summarises the standard; this one scores a design
 * against every item of it. Neither duplicates the other.
 *
 * ## The honesty contract
 *  - Pure and total: no model call, no randomness, no clock, no database, no
 *    throw on a partial design — absent fields, and null or non-object entries
 *    in the arrays this engine reads (objectives, estimands, endpoints, arms
 *    and their interventions, eligibility, analysis populations, planned
 *    analyses, document sections). Same input → byte-identical output. Arrays
 *    inside the Schedule of Activities are read by `schedule-of-activities.ts`,
 *    whose contract governs them.
 *  - The design is the spine (design-as-data): an item the design object can
 *    answer IN FULL (`evidencedBy: 'design'`) is judged from the design only;
 *    an authored section never overrides what the structured object says.
 *  - ONE RULE FOR A PARTIAL SIGNAL: when SPIRIT asks for an element the design
 *    object has no field for, the row is `partial` and the element is named in
 *    `gap` — never `met` with a `note:`. Such items (1, 3, 9, 11b, 12, 17a, 18a,
 *    20b, 21a, 21b, 22) are `'either'`: an authored section can complete them.
 *  - An item only an authored protocol can evidence (`'protocol_document'`) is
 *    `not_assessable` when no document is passed — never `missing`, because
 *    the design not carrying it is not evidence of its absence. With a
 *    document, it is judged on section PRESENCE: a section keyed or titled
 *    (whole words, see `./spirit-items`) to the topic with content is `met`
 *    when its status is `complete` and `partial` otherwise; a section whose
 *    key is an umbrella key (e.g. "ethics" for consent) is at most `partial`
 *    even when its title names the topic; no or empty section is `missing`.
 *    The engine does not read prose for adequacy and never claims to.
 *  - A recorded value is used only when it is usable: a sample size must be a
 *    positive finite number, power and alpha must lie in (0, 1), an allocation
 *    ratio must have one positive part per arm, a stopping boundary must be a
 *    number (null means "no boundary at this look"), a planned analysis must
 *    name an endpoint the design carries.
 *  - A recorded negative is never confused with an unrecorded field:
 *    `dmcCharter.present === false` is "no DMC"; `present` absent is "not
 *    stated", reported missing.
 *  - Items the design positively records as inapplicable (allocation and
 *    blinding items for a single-arm design or for exactly one arm with no
 *    control in a design that is not multi-group by definition; unblinding for
 *    an open-label design) are `not_assessable` with
 *    `notAssessableReason: 'not_applicable'`. An empty or unknown design — no
 *    arms entered yet — is never treated as inapplicable (fail closed).
 *  - Every non-met item carries a `gap` naming what is absent. Nothing is
 *    defaulted to a favourable state.
 *
 * SPIRIT 2013 numbers 33 items; eleven (2, 5, 6, 11, 16, 17, 18, 20, 21, 26,
 * 31) carry lettered sub-items, so the catalogue has 51 assessable rows and
 * `summary.total` is 51. The item catalogue and the section matcher live in
 * `./spirit-items` and are re-exported here.
 *
 * @module server/services/study-design/spirit-conformance
 */

import type { Arm, Endpoint, InterimDesign, Intervention, StudyDesign } from './study-design-types';
import { endpointTimeFrameFromSoa, projectScheduleOfActivities } from './schedule-of-activities';
import { present } from './usdm-types';
import { SPIRIT_2013_ITEMS, SPIRIT_DOCUMENT_TOPICS, describeTitleTerm, normaliseSectionKey, sectionsForTopic } from './spirit-items';
import type { SpiritConformance, SpiritItem, SpiritItemResult, SpiritItemStatus, SpiritNotAssessableReason, SpiritProtocolDocument, SpiritProtocolSection } from './spirit-items';

export { SPIRIT_2013_ITEMS, SPIRIT_2013_NUMBERED_ITEM_COUNT, SPIRIT_DOCUMENT_TOPICS, normaliseTitle, sectionsForTopic } from './spirit-items';
export type {
  SpiritConformance, SpiritDocumentTopic, SpiritEvidenceSource, SpiritItem, SpiritItemResult, SpiritItemStatus,
  SpiritNotAssessableReason, SpiritProtocolDocument, SpiritProtocolSection, SpiritSection, SpiritTitleTerm,
} from './spirit-items';

export const SPIRIT_BASIS =
  'SPIRIT 2013 Statement — Standard Protocol Items: Recommendations for Interventional Trials (Chan et al., Ann Intern Med 2013;158:200-207; 33-item checklist). ' +
  'Superseded by the SPIRIT 2025 statement (34 items); this engine assesses the 2013 checklist only.';

/** The guideline that superseded the checklist this engine assesses; carried on every output. */
export const SPIRIT_SUPERSEDED_BY =
  'SPIRIT 2025 statement: updated guideline for protocols of randomised trials (Chan et al., 2025; BMJ 2025;389:e081477; Nat Med 2025;31:1784-1792) — ' +
  '34 minimum items, including a new open-science section and a patient and public involvement item. Conformance to SPIRIT 2013 is not conformance to SPIRIT 2025.';

// ─── Verdict helpers ─────────────────────────────────────────────────────────

interface Verdict {
  status: SpiritItemStatus;
  evidence: string[];
  gap?: string;
}

const RANK: Record<SpiritItemStatus, number> = { met: 3, partial: 2, missing: 1, not_assessable: 0 };

function met(evidence: string[]): Verdict {
  return { status: 'met', evidence };
}

function partial(evidence: string[], gap: string): Verdict {
  return { status: 'partial', evidence, gap };
}

function missing(gap: string): Verdict {
  return { status: 'missing', evidence: [], gap };
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function num(n: unknown, label: string): string {
  return finite(n) ? `${label} ${n}` : '';
}

function quoted(name: unknown): string {
  return present(name) ? `"${name.trim()}"` : '(unnamed)';
}

// ─── Totality: the arrays the judges read hold only objects ──────────────────

function objects<T>(list: unknown): T[] {
  return Array.isArray(list) ? (list.filter(x => typeof x === 'object' && x !== null) as T[]) : [];
}

function strings(list: unknown): string[] {
  return Array.isArray(list) ? list.filter(present).map(s => s.trim()) : [];
}

/** A shallow copy whose arrays hold only objects, so every judge is total. The input is never mutated. */
function sanitise(input: unknown): StudyDesign {
  const d = (typeof input === 'object' && input !== null ? input : {}) as StudyDesign;
  const pop = d.population;
  const sp = d.statisticalPlan;
  return {
    ...d,
    objectives: objects(d.objectives),
    estimands: objects(d.estimands),
    endpoints: objects(d.endpoints),
    arms: objects<Arm>(d.arms).map(a => ({ ...a, interventions: objects<Intervention>(a.interventions) })),
    population: pop && typeof pop === 'object' ? { ...pop, eligibility: objects(pop.eligibility), analysisPopulations: objects(pop.analysisPopulations) } : pop,
    statisticalPlan: sp && typeof sp === 'object' ? { ...sp, plannedAnalyses: objects(sp.plannedAnalyses) } : sp,
  };
}

// ─── Design judges (items the StudyDesign object can evidence) ───────────────

function investigationalNames(design: StudyDesign): string[] {
  return design.arms.flatMap(arm => arm.interventions.filter(iv => iv.role === 'investigational' && present(iv.name)).map(iv => iv.name.trim()));
}

function judgeTitle(d: StudyDesign): Verdict {
  const title = present(d.title) ? d.title.trim() : '';
  if (!title) return missing('The design has no title.');
  const lc = title.toLowerCase();
  const notIdentified: string[] = [];
  const indication = present(d.indication) ? d.indication.trim() : '';
  if (!indication) notIdentified.push('a population (the design records no indication)');
  else if (!lc.includes(indication.toLowerCase())) notIdentified.push(`the recorded indication "${indication}"`);
  const drugs = investigationalNames(d);
  if (drugs.length === 0) notIdentified.push('an intervention (the design records no investigational intervention)');
  else if (!drugs.some(n => lc.includes(n.toLowerCase()))) notIdentified.push(`an investigational intervention (${drugs.join(', ')})`);
  const shortfall = notIdentified.length ? `The title does not identify ${notIdentified.join(' or ')}. ` : '';
  return partial([`design: title "${title}"`], `${shortfall}Whether the title identifies the study design (and the trial acronym, if any) is not carried by the design object; SPIRIT 1 asks the title to identify the design, population and interventions.`);
}

function judgeVersion(d: StudyDesign): Verdict {
  if (!finite(d.version)) return missing('The design records no version identifier.');
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
  const stated = d.objectives.filter(o => present(o.text));
  if (stated.length === 0) return missing('The design records no objectives.');
  const evidence = stated.map(o => `design: ${o.level} objective ${o.order}: "${o.text.trim()}" (endpoint: ${present(o.endpointName) ? o.endpointName : 'not linked'})`);
  const gaps: string[] = [];
  if (!stated.some(o => o.level === 'primary')) gaps.push('no primary objective is recorded');
  const unlinked = stated.filter(o => !present(o.endpointName)).length;
  if (unlinked > 0) gaps.push(`${unlinked} objective(s) are not linked to an endpoint`);
  return gaps.length ? partial(evidence, `SPIRIT 7 asks for specific objectives: ${gaps.join('; ')}.`) : met(evidence);
}

function judgeRatio(evidence: string[], ratio: unknown[], arms: number): Verdict {
  evidence.push(`design: allocation ratio ${ratio.join(':')}`);
  if (!ratio.every(r => finite(r) && r > 0)) return partial(evidence, 'The recorded allocation ratio has a part that is not a positive number; SPIRIT 8 asks for the allocation ratio.');
  if (ratio.length !== arms) {
    return partial(evidence, `The allocation ratio has ${ratio.length} part(s) but the design records ${arms} arm(s), so the ratio cannot be read against the groups; SPIRIT 8 asks for the allocation ratio.`);
  }
  return met(evidence);
}

function judgeTrialDesign(d: StudyDesign): Verdict {
  const f = d.framework;
  if (!f || !present(f.structuralDesign) || !present(f.inferentialFrame)) {
    return missing('The design records no framework (structural design and inferential frame).');
  }
  const evidence = [`design: structural design ${f.structuralDesign}`, `design: inferential framework ${f.inferentialFrame}`];
  const ratio = d.randomization?.ratio;
  if (Array.isArray(ratio) && ratio.length > 0) return judgeRatio(evidence, ratio, d.arms.length);
  if (d.arms.length === 0) return partial(evidence, 'The design records no arms, so the allocation ratio cannot be shown; SPIRIT 8 asks for it.');
  if (d.arms.length === 1) {
    evidence.push('design: one arm — no allocation ratio applies');
    return met(evidence);
  }
  return partial(evidence, `The design has ${d.arms.length} arms but records no allocation ratio; SPIRIT 8 asks for the allocation ratio.`);
}

function judgeSetting(d: StudyDesign): Verdict {
  const regions = [...strings(d.targetRegions), ...strings(d.framework?.mrct?.regions)];
  if (regions.length === 0) return missing('The design records no target regions or countries and carries no study-setting description.');
  return partial([`design: regions ${Array.from(new Set(regions)).join(', ')}`], 'The design records regions but not the study setting type or where the site list can be obtained; SPIRIT 9 asks for both.');
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

/** What SPIRIT 11a needs recorded to replicate an intervention: how and when it is given (a placebo needs no dose). */
function requiredDetail(role: Intervention['role']): Array<'dose' | 'route' | 'regimen'> {
  if (role === 'placebo') return ['route', 'regimen'];
  if (role === 'device') return ['regimen'];
  return ['dose', 'route', 'regimen'];
}

function interventionDetail(arm: Arm, iv: Intervention): { line: string; lacking: string[] } {
  const parts = [present(iv.dose) ? `dose ${iv.dose}` : '', present(iv.route) ? `route ${iv.route}` : '', present(iv.regimen) ? `regimen ${iv.regimen}` : '', present(iv.duration) ? `duration ${iv.duration}` : ''].filter(present);
  const line = `design: arm ${quoted(arm.name)} — ${iv.name} (${iv.role})${parts.length ? `: ${parts.join(', ')}` : ''}`;
  return { line, lacking: requiredDetail(iv.role).filter(k => !present(iv[k])) };
}

function judgeInterventions(d: StudyDesign): Verdict {
  if (d.arms.length === 0) return missing('The design records no arms or interventions.');
  const evidence: string[] = [];
  const gaps: string[] = [];
  for (const arm of d.arms) {
    if (arm.interventions.length === 0) gaps.push(`arm ${quoted(arm.name)} has no intervention`);
    for (const iv of arm.interventions) {
      const { line, lacking } = interventionDetail(arm, iv);
      evidence.push(line);
      if (lacking.length) gaps.push(`${quoted(iv.name)} in arm ${quoted(arm.name)} lacks ${lacking.join(', ')}`);
    }
  }
  if (gaps.length) return partial(evidence, `SPIRIT 11a asks for enough detail to replicate each intervention (how and when administered): ${gaps.join('; ')}.`);
  return met(evidence);
}

function judgeDiscontinuation(d: StudyDesign): Verdict {
  const withRules = d.arms.filter(a => present(a.doseModificationRules));
  if (withRules.length === 0) return missing('The design records no dose-modification rules on any arm and carries no discontinuation criteria.');
  const evidence = withRules.map(a => `design: arm ${quoted(a.name)} doseModificationRules = "${a.doseModificationRules!.trim()}"`);
  const gaps = ['criteria for discontinuing the allocated intervention are not carried by the design object'];
  const without = d.arms.filter(a => !present(a.doseModificationRules) && a.interventions.some(i => i.role !== 'placebo'));
  if (without.length) gaps.push(`arms without modification rules: ${without.map(a => quoted(a.name)).join(', ')}`);
  return partial(evidence, `SPIRIT 11b asks for discontinuation and modification criteria: ${gaps.join('; ')}.`);
}

/** The time frame of an outcome: recorded on the endpoint, or derived (and labelled so) from the Schedule of Activities. */
function outcomeTimeFrame(d: StudyDesign, e: Endpoint): string {
  if (present(e.timepoint)) return ` at ${e.timepoint.trim()}`;
  const derived = present(e.name) ? endpointTimeFrameFromSoa(d, e.name) : null;
  return derived ? `; time frame derived from the Schedule of Activities: ${derived}` : '';
}

/** What SPIRIT 12 asks of one outcome that the design does not carry, and its evidence line. */
function outcomeShortfall(d: StudyDesign, e: Endpoint, summaryMeasure: unknown): { line: string; lacking: string[] } {
  const when = outcomeTimeFrame(d, e);
  const lacking: string[] = [];
  if (!present(e.definition)) lacking.push('measurement variable/definition');
  if (!present(summaryMeasure)) lacking.push('method of aggregation (no estimand summary measure is recorded for it)');
  if (!when) lacking.push('time point');
  const definition = present(e.definition) ? `: ${e.definition.trim()}` : '';
  const aggregation = present(summaryMeasure) ? `; aggregated as ${summaryMeasure.trim()} (estimand summary measure)` : '';
  return { line: `design: ${e.role} endpoint ${quoted(e.name)} (${e.type})${definition}${when}${aggregation}`, lacking };
}

function judgeOutcomes(d: StudyDesign): Verdict {
  if (d.endpoints.length === 0) return missing('The design records no endpoints.');
  const summaryMeasures = new Map(d.estimands.map(e => [e.endpointName, e.summaryMeasure] as const));
  const evidence: string[] = [];
  const gaps: string[] = [];
  if (!d.endpoints.some(e => e.role === 'primary')) gaps.push('no primary endpoint is recorded');
  for (const e of d.endpoints) {
    const { line, lacking } = outcomeShortfall(d, e, summaryMeasures.get(e.name));
    evidence.push(line);
    if (lacking.length) gaps.push(`${quoted(e.name)} (${e.role}) lacks ${lacking.join(', ')}`);
  }
  gaps.push('the analysis metric (e.g. change from baseline, final value, time to event) is not carried as a field for any outcome; endpoint definitions are listed, not parsed');
  return partial(evidence, `SPIRIT 12 asks for the measurement variable, analysis metric, method of aggregation and time point of every primary, secondary and other outcome, harms included: ${gaps.join('; ')}.`);
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

/** A probability the design records: an evidence line when it lies in (0, 1), otherwise the gap it leaves. */
function probability(v: unknown, field: string, name: string, suffix = ''): { line?: string; gap?: string } {
  if (v === undefined || v === null) return { gap: `the ${name}` };
  if (!finite(v) || v <= 0 || v >= 1) return { gap: `a usable ${name} (the recorded ${field} ${String(v)} is not a probability between 0 and 1)` };
  return { line: `design: ${field} ${v}${suffix}` };
}

function judgeSampleSize(d: StudyDesign): Verdict {
  const sp = d.statisticalPlan;
  const n = sp?.plannedSampleSize;
  if (n === undefined || n === null) return missing('The design records no planned sample size.');
  if (!finite(n) || n <= 0) return missing(`The design records a planned sample size of ${String(n)}, which is not a positive number, so no sample size is shown.`);
  const evidence = [`design: statisticalPlan.plannedSampleSize = ${n}`];
  const gaps: string[] = [];
  for (const p of [probability(sp.power, 'power', 'target power'), probability(sp.alpha, 'alpha', 'significance level', sp.oneSided ? ' (one-sided)' : '')]) {
    if (p.line) evidence.push(p.line);
    else gaps.push(p.gap ?? '');
  }
  const pa = sp.powerAssumptions;
  const assumptions = pa ? [num(pa.effectSize, 'effect size'), num(pa.eventRate, 'event rate'), num(pa.variance, 'variance')].filter(present) : [];
  if (assumptions.length) evidence.push(`design: assumptions ${assumptions.join(', ')}`);
  else gaps.push('the clinical/statistical assumptions (effect size, event rate or variance)');
  if (finite(sp.dropoutRate)) evidence.push(`design: dropout rate ${sp.dropoutRate}`);
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
  const strata = strings(r.stratificationFactors);
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
    return partial(evidence, 'The design records the trial as open-label but not whether any party (e.g. outcome assessors, adjudicators, data analysts) is nonetheless blinded; SPIRIT 17a asks who is blinded after assignment and how.');
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
  const primaries = d.endpoints.filter(e => e.role === 'primary');
  const evidence: string[] = [];
  if (proj.present) evidence.push(`design: Schedule of Activities schedules ${proj.counts.activities} activities across ${proj.counts.visits} visits`);
  const uninstrumented: string[] = [];
  for (const e of primaries) {
    const instrument = present(e.measurementMethod) ? e.measurementMethod : e.validatedInstrument;
    if (present(instrument)) evidence.push(`design: ${quoted(e.name)} measured by ${instrument.trim()}`);
    else uninstrumented.push(quoted(e.name));
  }
  if (evidence.length === 0) return missing('The design carries no Schedule of Activities and no measurement method on any primary endpoint.');
  const gaps = ['data-quality processes and the reference to data collection forms are not carried by the design object'];
  if (!proj.present) gaps.push('no Schedule of Activities is attached');
  if (uninstrumented.length) gaps.push(`primary endpoint(s) without a measurement method: ${uninstrumented.join(', ')}`);
  return partial(evidence, `SPIRIT 18a: ${gaps.join('; ')}.`);
}

function judgeStatisticalMethods(d: StudyDesign): Verdict {
  const analyses = (d.statisticalPlan?.plannedAnalyses ?? []).filter(a => present(a.method));
  if (analyses.length === 0) return missing('The design records no planned analyses.');
  const evidence = analyses.map(a => `design: ${quoted(a.endpointName)} — ${a.method.trim()}`);
  const endpointNames = new Set(d.endpoints.map(e => e.name).filter(present));
  const analysed = new Set(analyses.map(a => a.endpointName));
  const gaps: string[] = [];
  if (!d.endpoints.some(e => e.role === 'primary')) gaps.push('the design records no primary endpoint, so no method for a primary outcome can be shown');
  const orphans = analyses.filter(a => !present(a.endpointName) || !endpointNames.has(a.endpointName));
  if (orphans.length) gaps.push(`planned analyses name no endpoint the design carries: ${orphans.map(a => quoted(a.endpointName)).join(', ')}`);
  const uncovered = d.endpoints.filter(e => (e.role === 'primary' || e.role === 'key_secondary' || e.role === 'secondary') && !analysed.has(e.name));
  if (uncovered.length) gaps.push(`no method is recorded for ${uncovered.map(e => `${quoted(e.name)} (${e.role})`).join(', ')}`);
  return gaps.length ? partial(evidence, `SPIRIT 20a asks for the methods for the primary and secondary outcomes: ${gaps.join('; ')}.`) : met(evidence);
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

type DmcCharter = NonNullable<NonNullable<StudyDesign['safety']>['dmcCharter']>;

function judgeDataMonitoringCommittee(d: StudyDesign): Verdict {
  const c = d.safety?.dmcCharter;
  if (!c || typeof c !== 'object') return missing('The design records no DMC charter and no statement that a DMC is not needed.');
  if (c.present === false) {
    return partial(['design: safety.dmcCharter.present = false'], 'The design records that there is no DMC; SPIRIT 21a then asks for an explanation of why a DMC is not needed, which the design object does not carry.');
  }
  if (c.present !== true) {
    const recorded = present(c.composition) ? ` A composition ("${c.composition.trim()}") is recorded, but whether a DMC exists is not inferred from it.` : '';
    return missing(`The design records a DMC charter without safety.dmcCharter.present, so it does not state whether the trial has a DMC.${recorded}`);
  }
  return judgeRecordedDmc(c, d.statisticalPlan?.interim?.dmcRole);
}

/** A DMC the design records as present: what it carries, and the SPIRIT 21a elements it has no field for. */
function judgeRecordedDmc(c: DmcCharter, role: unknown): Verdict {
  const evidence = ['design: safety.dmcCharter.present = true'];
  if (present(c.composition)) evidence.push(`design: composition "${c.composition.trim()}"`);
  if (present(c.meetingCadence)) evidence.push(`design: meeting cadence ${c.meetingCadence.trim()}`);
  if (typeof c.hasStatisticalMember === 'boolean') evidence.push(`design: statistical member ${c.hasStatisticalMember ? 'yes' : 'no'}`);
  if (present(role)) evidence.push(`design: interim DMC role "${role.trim()}"`);
  const lacking = [present(c.composition) ? '' : 'its composition', present(role) ? 'its reporting structure' : 'its role and reporting structure', 'whether it is independent from the sponsor and free of competing interests', 'where its charter can be found'].filter(present);
  return partial(evidence, `A DMC is recorded; SPIRIT 21a also asks for ${lacking.join(', ')}, which the design object does not carry.`);
}

function anyBoundary(list: unknown): boolean {
  return Array.isArray(list) && list.some(finite);
}

/** Evidence the design carries for planned interim analyses, and whether any numeric stopping boundary is recorded (null = no boundary at that look). */
function interimEvidence(interim: InterimDesign | undefined): { planned: boolean; boundaries: boolean; lines: string[] } {
  const fractions = interim && Array.isArray(interim.informationFractions) ? interim.informationFractions : [];
  if (!interim || fractions.length === 0) return { planned: false, boundaries: false, lines: [] };
  const lines = [`design: interim analyses at information fractions ${fractions.join(', ')}${interim.spendingFunction ? ` (${interim.spendingFunction})` : ''}`];
  const boundaries = anyBoundary(interim.efficacyBoundaries) || anyBoundary(interim.futilityBoundaries);
  if (boundaries) lines.push('design: numeric efficacy/futility boundaries recorded');
  if (present(interim.dmcRole)) lines.push(`design: interim DMC role "${interim.dmcRole.trim()}"`);
  return { planned: true, boundaries, lines };
}

function judgeInterimAndStopping(d: StudyDesign): Verdict {
  const interim = interimEvidence(d.statisticalPlan?.interim);
  const stopping = d.safety?.stoppingRules;
  const evidence = [...interim.lines];
  if (present(stopping)) evidence.push(`design: safety.stoppingRules = "${stopping.trim()}"`);
  if (evidence.length === 0) return missing('The design records neither interim analyses nor stopping rules.');
  if (!interim.planned) evidence.push('note: no interim analysis is recorded in the design');
  const gaps: string[] = [];
  if (interim.planned && !interim.boundaries && !present(stopping)) gaps.push('interim analyses are recorded without a numeric stopping boundary or stopping rules');
  gaps.push('who will have access to the interim results and who will make the final decision to terminate the trial are not carried as fields by the design object (a DMC role, when recorded, is listed, not read)');
  return partial(evidence, `SPIRIT 21b asks for the interim analyses and stopping guidelines, including who sees interim results and who decides termination: ${gaps.join('; ')}.`);
}

function judgeHarms(d: StudyDesign): Verdict {
  const s = d.safety;
  if (!s || !present(s.aeDefinitions)) return missing('The design records no adverse-event definitions (safety.aeDefinitions).');
  const evidence = [`design: safety.aeDefinitions = "${s.aeDefinitions.trim()}"`];
  if (present(s.dltDefinition)) evidence.push(`design: DLT definition "${s.dltDefinition.trim()}"`);
  return partial(evidence, 'The design records adverse-event definitions only; SPIRIT 22 asks for the plans for collecting, assessing, reporting and managing solicited and spontaneously reported adverse events, which the design object does not carry.');
}

/** Item code → design judge. Every `design` and `either` item has one; a test pins the coverage. */
const DESIGN_JUDGES: Readonly<Record<string, (d: StudyDesign) => Verdict>> = {
  '1': judgeTitle, '3': judgeVersion, '6b': judgeComparator, '7': judgeObjectives, '8': judgeTrialDesign, '9': judgeSetting,
  '10': judgeEligibility, '11a': judgeInterventions, '11b': judgeDiscontinuation, '12': judgeOutcomes, '13': judgeTimeline, '14': judgeSampleSize,
  '16a': judgeAllocation, '17a': judgeBlinding, '17b': judgeUnblinding, '18a': judgeDataCollection, '20a': judgeStatisticalMethods,
  '20b': judgeAdditionalAnalyses, '20c': judgePopulationAndMissingData, '21a': judgeDataMonitoringCommittee, '21b': judgeInterimAndStopping, '22': judgeHarms,
};

/** Items the design can carry but for which no judge is registered fail closed, never open. */
function judgeDesign(item: SpiritItem, design: StudyDesign): Verdict {
  const judge = DESIGN_JUDGES[item.item];
  if (!judge) return { status: 'not_assessable', evidence: [], gap: `No design judge is registered for SPIRIT ${item.item}; the item was not assessed.` };
  return judge(design);
}

// ─── Applicability (SPIRIT 16–17 are for controlled / blinded trials) ─────────

const ASSIGNMENT_ITEMS = new Set(['16a', '16b', '16c', '17a', '17b']);

/** Structural designs that have more than one group by definition: recording "no control" never makes them inapplicable. */
const MULTI_GROUP_DESIGNS: ReadonlySet<string> = new Set(['parallel_group', 'crossover', 'factorial', 'platform', 'mams']);

/** A reason the item does not apply, ONLY when the design positively records it; an unknown or arm-less design is never inapplicable. */
function notApplicable(item: SpiritItem, d: StudyDesign): { reason: string; evidence: string[] } | undefined {
  if (!ASSIGNMENT_ITEMS.has(item.item)) return undefined;
  const f = d.framework;
  if (f?.structuralDesign === 'single_arm') {
    return { reason: `SPIRIT ${item.item} applies to controlled trials and the design is recorded as single-arm`, evidence: ['design: framework.structuralDesign = single_arm'] };
  }
  if (f?.controlType === 'none' && d.arms.length === 1 && !MULTI_GROUP_DESIGNS.has(f.structuralDesign)) {
    return {
      reason: `SPIRIT ${item.item} applies to controlled trials and the design records no control and exactly one arm`,
      evidence: ['design: framework.controlType = none', 'design: 1 arm', `design: framework.structuralDesign = ${present(f.structuralDesign) ? f.structuralDesign : 'not recorded'}`],
    };
  }
  if (item.item === '17b' && d.randomization?.blinding === 'open') {
    return { reason: 'SPIRIT 17b applies to blinded trials and the design is recorded as open-label', evidence: ['design: randomization.blinding = open'] };
  }
  return undefined;
}

// ─── Document judge (section presence, never prose adequacy) ─────────────────

function hasContent(s: SpiritProtocolSection): boolean {
  return present(s.content);
}

function describeSection(s: SpiritProtocolSection): string {
  return `document: section "${String(s.sectionKey)}" ("${String(s.title)}") status ${String(s.status)}, ${present(s.content) ? s.content.trim().length : 0} characters`;
}

function judgeDocument(item: SpiritItem, doc: SpiritProtocolDocument): Verdict {
  const topic = SPIRIT_DOCUMENT_TOPICS[item.item];
  if (!topic) return { status: 'not_assessable', evidence: [], gap: `No document topic is registered for SPIRIT ${item.item}; the item was not assessed.` };
  const { specific, umbrella } = sectionsForTopic(topic, doc.sections);
  const filled = specific.filter(hasContent);
  const names = (list: SpiritProtocolSection[]) => list.map(s => `"${String(s.sectionKey)}"`).join(', ');
  if (filled.length) {
    const evidence = filled.map(describeSection);
    if (filled.some(s => normaliseSectionKey(s.status) === 'complete')) return met(evidence);
    return partial(evidence, `The document addresses ${topic.label} in section(s) ${names(filled)} but none is in status "complete"; SPIRIT ${item.item} is met only by a complete section.`);
  }
  const filledUmbrella = umbrella.filter(hasContent);
  if (filledUmbrella.length) {
    return partial(filledUmbrella.map(describeSection), `The document has no section dedicated to ${topic.label}; its ${names(filledUmbrella)} section(s) may cover it, but this engine cannot confirm that they address SPIRIT ${item.item}.`);
  }
  if (specific.length) return missing(`The document's ${names(specific)} section(s) for ${topic.label} have no content.`);
  return missing(`The document has no section keyed or titled to ${topic.label} (looked for keys ${topic.keys.join(', ')} or titles with the whole words ${topic.titleTerms.map(describeTitleTerm).join(', ')}).`);
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
  const out: SpiritItemResult = { item: item.item, number: item.number, section: item.section, title: item.title, evidencedBy: item.evidencedBy, status: v.status, evidence: v.evidence };
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
 * row of the SPIRIT 2013 checklist — which SPIRIT 2025 has superseded; see the module
 * header. Pure, total and deterministic.
 */
export function assessSpiritConformance(design: StudyDesign, doc?: SpiritProtocolDocument): SpiritConformance {
  const d = sanitise(design);
  const document = doc && typeof doc === 'object' && Array.isArray(doc.sections) ? doc : undefined;
  const items = SPIRIT_2013_ITEMS.map(item => assessItem(item, d, document));
  const summary = { met: 0, partial: 0, missing: 0, notAssessable: 0, total: items.length };
  for (const r of items) {
    if (r.status === 'met') summary.met += 1;
    else if (r.status === 'partial') summary.partial += 1;
    else if (r.status === 'missing') summary.missing += 1;
    else summary.notAssessable += 1;
  }
  return { items, summary, basis: SPIRIT_BASIS, supersededBy: SPIRIT_SUPERSEDED_BY, documentProvided: document !== undefined };
}
