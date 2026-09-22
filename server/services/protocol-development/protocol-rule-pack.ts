/**
 * Protocol regulatory rule pack — deterministic, pure, dependency-free.
 *
 * `evaluateCompleteness` in protocol-development-logic.ts is the FINALIZE GATE and
 * is unchanged by this module: five structural checks (required sections complete,
 * >=1 objective, eligibility present, >=1 SoA visit). A protocol can pass all five
 * and still be non-compliant with the standards its section templates cite as their
 * basis. This module supplies that depth: one finding per rule, each citing a clause.
 *
 * HONESTY CONTRACT (the reason this module exists at all):
 *   - A rule that cannot be evaluated from the recorded input is 'not-assessed',
 *     never 'met'. An unassessed protocol is not a clean one.
 *   - A section's STATUS is not evidence of what the section SAYS. Where a rule is
 *     about content, a complete section yields 'attention' with a message that says
 *     in words that the content was not inspected — never 'met'.
 *   - Keyword scanning is used in exactly two places (intercurrent-event strategy
 *     names, FDORA diversity-plan section naming). Both declare themselves as a
 *     keyword scan in the message, and in both the ABSENCE of a hit is 'attention',
 *     never 'unmet'.
 *   - An optional flag that is null/undefined means "not recorded", which is never
 *     read as "no". 45 CFR 46 Subparts B/C/D apply only on an explicit `true`.
 *   - No citation is invented. Where a subsection number was not certain the named
 *     section is cited instead (ICH E8(R1), ICH E6(R3), ICH E9(R1), EU CTR Annex I).
 *
 * RED-FIRST EVIDENCE: `__tests__/protocol-rule-pack.test.ts` was written before this
 * file existed and observed failing — first on the unresolved import, then (against
 * an empty stub) on three real assertions: an endpoint-less objective not reported
 * unmet, a null involvesChildren flag producing no 'not-assessed' finding, and an
 * IRB protocol producing no 21 CFR 50.25 findings.
 *
 * Pure and total: no I/O, no clock, no randomness, no throw. Same input, same bytes.
 *
 * @module server/services/protocol-development/protocol-rule-pack
 */

import type { ProtocolKind, SectionStatus } from './protocol-development-logic';

// ─── Contract ────────────────────────────────────────────────────────────────

export type ProtocolRuleStatus = 'met' | 'unmet' | 'attention' | 'not-assessed';
export type ProtocolRuleSeverity = 'critical' | 'warning' | 'info';

export interface ProtocolRuleSectionInput {
  sectionKey: string; title: string; required: boolean;
  status: SectionStatus; contentLength: number; hasContent: boolean;
}

export interface ProtocolRuleObjectiveInput {
  objectiveType?: string | null; objective: string;
  endpoint?: string | null; timepoint?: string | null;
}

export interface ProtocolRuleInput {
  kind: ProtocolKind;
  sections: ProtocolRuleSectionInput[];
  objectives: ProtocolRuleObjectiveInput[];
  inclusion: string[];
  exclusion: string[];
  scheduleVisitCount: number;
  /** Optional context. ABSENT means "not recorded", which is NOT the same as "no". */
  phase?: string | null;
  designType?: string | null;
  regions?: string[];
  involvesChildren?: boolean | null;
  involvesPregnantWomen?: boolean | null;
  involvesPrisoners?: boolean | null;
  involvesVulnerable?: boolean | null;
  isIndTrial?: boolean | null;
}

export interface ProtocolRule {
  id: string; standard: string; clause: string;
  title: string; appliesTo: ProtocolKind[]; rationale: string;
}

export interface ProtocolRuleFinding {
  ruleId: string; standard: string; clause: string; title: string;
  status: ProtocolRuleStatus; severity: ProtocolRuleSeverity;
  message: string; remediation: string;
}

export interface ProtocolRuleEvaluation {
  findings: ProtocolRuleFinding[]; assessed: number; unmet: number; notAssessed: number;
}

// ─── Rule catalogue ──────────────────────────────────────────────────────────

/** [id, clause, title, appliesTo, rationale] — one line per rule, kept scannable. */
type Seed = [string, string, string, ProtocolKind[], string];

const CLIN: ProtocolKind[] = ['clinical'];
const HUMAN: ProtocolKind[] = ['clinical', 'irb'];
const ANIMAL: ProtocolKind[] = ['iacuc'];
const BIO: ProtocolKind[] = ['ibc'];

const M11 = 'ICH M11';
const E9R1 = 'ICH E9(R1)';
const IND = '21 CFR 312.23(a)(6)';
const CONSENT = '21 CFR 50.25';
const IRB111 = '21 CFR 56.111';
const HHS46 = '45 CFR 46';
const CTR = 'EU CTR 536/2014';
const PHS = 'PHS Policy IV.C.1';
const NIHG = 'NIH Guidelines (Recombinant or Synthetic Nucleic Acid Molecules)';
const ESTIMAND = 'Addendum on Estimands and Sensitivity Analysis';
const E8CTQ = 'Designing Quality into Clinical Studies';
// Annex I of Regulation (EU) 536/2014 is organised in lettered SECTIONS
// ("D. PROTOCOL"). "Part" in the CTR means Part I / Part II of the assessment
// report, so "Part D" invited confusion (corrected 2026-09-22).
const CTRD = 'Annex I, section D — Protocol';

const CATALOGUE: Array<{ standard: string; seeds: Seed[] }> = [
  { standard: M11, seeds: [
    ['ich-m11-protocol-summary', 'Section 1 — Protocol Summary', 'Protocol synopsis recorded', CLIN, 'A reviewer triages the trial from the synopsis before reading anything else.'],
    ['ich-m11-objectives-endpoints', 'Section 3 — Trial Objectives, Endpoints and Estimands', 'Every objective is paired with an endpoint', CLIN, 'An objective with no endpoint cannot be shown to have been met.'],
    ['ich-m11-trial-design', 'Section 4 — Trial Design', 'Trial design stated', CLIN, 'The design determines what inference the trial is capable of supporting.'],
    ['ich-m11-population-eligibility', 'Section 5 — Trial Population', 'Population and eligibility criteria recorded', CLIN, 'Who may enrol defines who the result may be applied to.'],
    ['ich-m11-intervention-concomitant', 'Section 6 — Trial Intervention and Concomitant Therapy', 'Intervention and concomitant therapy recorded', CLIN, 'The treatment actually given is the exposure the effect is attributed to.'],
    ['ich-m11-discontinuation-withdrawal', 'Section 7 — Discontinuation of Trial Intervention and Participant Withdrawal', 'Discontinuation and withdrawal criteria recorded', CLIN, 'Undocumented withdrawal rules make the analysis population unverifiable.'],
    ['ich-m11-assessment-schedule', 'Section 8 — Trial Assessments and Procedures', 'Schedule of assessments recorded', CLIN, 'Assessments with no schedule cannot be audited for protocol deviation.'],
    ['ich-m11-statistical-considerations', 'Section 9 — Statistical Considerations', 'Statistical considerations recorded', CLIN, 'An analysis chosen after the data are seen is not confirmatory.'],
    ['ich-m11-oversight-quality', 'Section 10 — General Considerations: Regulatory, Ethical and Trial Oversight', 'Oversight, risk management and quality recorded', CLIN, 'A regulator asks who is accountable for the trial before asking what it found.'],
  ] },
  { standard: E9R1, seeds: [
    ['ich-e9r1-estimand-treatment-condition', `${ESTIMAND} — estimand attribute: treatment condition`, 'Treatment condition of the estimand recorded', CLIN, 'The estimand is undefined until the treatment being compared is stated.'],
    ['ich-e9r1-estimand-population', `${ESTIMAND} — estimand attribute: population`, 'Target population of the estimand recorded', CLIN, 'A treatment effect is only interpretable against the population it is estimated in.'],
    ['ich-e9r1-estimand-variable', `${ESTIMAND} — estimand attribute: variable (endpoint)`, 'Primary endpoint recorded as the estimand variable', CLIN, 'The variable is what the treatment effect is measured on.'],
    ['ich-e9r1-estimand-intercurrent-events', `${ESTIMAND} — strategies for intercurrent events`, 'Intercurrent-event strategy recorded for the primary endpoint', CLIN, 'Without a strategy, rescue medication and discontinuation silently redefine the effect being estimated.'],
    ['ich-e9r1-estimand-population-level-summary', `${ESTIMAND} — estimand attribute: population-level summary`, 'Population-level summary measure recorded', CLIN, 'The summary measure fixes what number the trial is powered to and reports.'],
  ] },
  { standard: 'ICH E9', seeds: [
    ['ich-e9-sample-size-justification', 'Section 3.5 — Sample Size', 'Sample-size justification recorded', CLIN, 'An unjustified sample size can make a negative trial uninterpretable.'],
    ['ich-e9-multiplicity', 'Section 5.6 — Adjustment of Significance and Confidence Levels', 'Multiplicity addressed where more than one primary endpoint is recorded', CLIN, 'Several primary endpoints tested at the nominal level inflate the false-positive rate.'],
  ] },
  { standard: 'ICH E8(R1)', seeds: [
    ['ich-e8r1-critical-to-quality-factors', `${E8CTQ} — critical-to-quality factors`, 'Critical-to-quality factors recorded', CLIN, 'Quality designed in beats errors found later in monitoring.'],
    ['ich-e8r1-risk-proportionate-approach', `${E8CTQ} — risk-proportionate approach`, 'Risk-proportionate approach recorded', CLIN, 'Controls out of proportion to risk waste effort and hide the real hazards.'],
  ] },
  { standard: 'ICH E6(R3)', seeds: [
    ['ich-e6r3-safety-reporting', 'Annex 1 — Sponsor: safety assessment and reporting', 'Protocol-specified safety reporting responsibilities recorded', CLIN, 'Unassigned reporting duties are the usual cause of a late expedited report.'],
    ['ich-e6r3-monitoring-approach', 'Annex 1 — Sponsor: monitoring', 'Monitoring approach recorded', CLIN, 'The monitoring plan is what makes the recorded data believable.'],
    ['ich-e6r3-data-integrity', 'Annex 1 — Data Governance (Investigator and Sponsor)', 'Data integrity and ALCOA+ expectations recorded', CLIN, 'Data that cannot be shown to be attributable and contemporaneous cannot support a marketing claim.'],
  ] },
  { standard: IND, seeds: [
    ['fda-ind-objectives-purpose', '21 CFR 312.23(a)(6)(iii)(a)', 'Objectives and purpose of the study stated', CLIN, 'The IND reviewer reads the objective to judge whether the exposure is justified.'],
    ['fda-ind-investigator-site-information', '21 CFR 312.23(a)(6)(iii)(b)', 'Investigator, facility and reviewing IRB identified', CLIN, 'FDA must know who is administering the investigational drug and under whose review.'],
    ['fda-ind-selection-exclusion-criteria', '21 CFR 312.23(a)(6)(iii)(c)', 'Criteria for subject selection and exclusion recorded', CLIN, 'Exclusion criteria are the first line of subject protection in an early-phase trial.'],
    ['fda-ind-study-design-control', '21 CFR 312.23(a)(6)(iii)(d)', 'Study design including control stated', CLIN, 'Without a stated control the trial cannot support a comparative claim.'],
    ['fda-ind-dosing', '21 CFR 312.23(a)(6)(iii)(e)', 'Dose determination, maximum dosage and exposure duration recorded', CLIN, 'Dose and duration bound the risk the subject is being asked to accept.'],
    ['fda-ind-observations-measurements', '21 CFR 312.23(a)(6)(iii)(f)', 'Observations and measurements recorded', CLIN, 'Observations that are not scheduled are not made.'],
    ['fda-ind-safety-monitoring-procedures', '21 CFR 312.23(a)(6)(iii)(g)', 'Clinical procedures and tests to monitor drug effects and minimise risk recorded', CLIN, 'Safety monitoring is what turns an unexpected signal into a stopped trial.'],
  ] },
  { standard: CONSENT, seeds: [
    ['fda-consent-basic-elements', '21 CFR 50.25(a)(1)–(8)', 'Eight basic elements of informed consent addressed', HUMAN, 'Consent that omits a basic element is not legally effective consent.'],
    ['fda-consent-additional-elements', '21 CFR 50.25(b)(1)–(6)', 'Six additional elements of informed consent addressed where appropriate', HUMAN, 'Unforeseeable risks and withdrawal consequences change whether a subject would still agree.'],
  ] },
  { standard: IRB111, seeds: [
    ['fda-irb-risks-minimized', '21 CFR 56.111(a)(1)', 'Risks to subjects are minimised', HUMAN, 'An IRB cannot approve a protocol whose risks were never shown to be minimised.'],
    ['fda-irb-risks-reasonable', '21 CFR 56.111(a)(2)', 'Risks reasonable in relation to anticipated benefits', HUMAN, 'The risk/benefit judgement is the IRB approval criterion most often challenged.'],
    ['fda-irb-equitable-selection', '21 CFR 56.111(a)(3)', 'Selection of subjects is equitable', HUMAN, 'Inequitable selection loads trial risk onto the people least able to refuse.'],
    ['fda-irb-consent-sought-and-documented', '21 CFR 56.111(a)(4)–(5)', 'Informed consent sought and appropriately documented', HUMAN, 'Undocumented consent is indistinguishable from absent consent on inspection.'],
    ['fda-irb-data-monitoring-for-safety', '21 CFR 56.111(a)(6)', 'Adequate provision for monitoring data to ensure subject safety', HUMAN, 'Nobody sees an accumulating safety signal if nobody is assigned to look.'],
    ['fda-irb-privacy-confidentiality', '21 CFR 56.111(a)(7)', 'Adequate provisions to protect privacy and maintain confidentiality', HUMAN, 'A confidentiality breach is the most common non-physical harm in human research.'],
  ] },
  { standard: HHS46, seeds: [
    ['hhs-subpart-b-pregnant-women', '45 CFR 46.204 (Subpart B)', 'Subpart B conditions where pregnant women, fetuses or neonates are involved', HUMAN, 'Subpart B sets conditions no IRB may waive once this population is enrolled.'],
    ['hhs-subpart-c-prisoners', '45 CFR 46.305 (Subpart C)', 'Subpart C safeguards where prisoners are involved', HUMAN, 'Incarceration compromises the voluntariness that consent depends on.'],
    ['hhs-subpart-d-children-risk-category', '45 CFR 46.404–46.407 (Subpart D)', 'Subpart D risk category determined for research involving children', HUMAN, 'The permissible category decides whether the research may proceed at all.'],
    ['hhs-subpart-d-children-assent-permission', '45 CFR 46.408 (Subpart D)', 'Child assent and parental permission recorded', HUMAN, 'A child who has not assented has not agreed, whatever the parent signed.'],
    ['hhs-additional-safeguards-vulnerable', '45 CFR 46.111(b)', 'Additional safeguards for vulnerable subjects', HUMAN, 'Vulnerability to coercion is a reason for extra protection, not an exception to it.'],
  ] },
  { standard: CTR, seeds: [
    ['eu-ctr-protocol-content', CTRD, 'Annex I, section D protocol content recorded', CLIN, 'Member State assessors cannot assess what the protocol does not state.'],
    ['eu-ctr-eligibility-criteria', `${CTRD} (inclusion and exclusion criteria)`, 'Inclusion and exclusion criteria recorded', CLIN, 'Member State assessors check eligibility against the stated population first.'],
    ['eu-ctr-endpoints', `${CTRD} (endpoints)`, 'Endpoints recorded against objectives', CLIN, 'Endpoints are what the EU assessment report records the trial as measuring.'],
  ] },
  { standard: 'FDORA 2022 §3601', seeds: [
    ['fdora-3601-diversity-action-plan', 'FDORA 2022 §3601 (FD&C Act §505(z))', 'Diversity Action Plan expected for a pivotal/phase 3 US trial', CLIN, 'A pivotal trial whose enrolment does not reflect the treated population produces evidence FDA cannot generalise.'],
  ] },
  { standard: 'AWA 9 CFR 2.31', seeds: [
    ['iacuc-3rs-replacement', '9 CFR 2.31(d)(1)(ii)', 'Replacement — alternatives to painful or distressing procedures considered', ANIMAL, 'An animal used where a non-animal method exists is an avoidable harm.'],
    ['iacuc-3rs-reduction', '9 CFR 2.31(e)(2)', 'Reduction — rationale for species and number of animals recorded', ANIMAL, 'An unjustified animal count is either wasted animals or an underpowered study.'],
  ] },
  { standard: PHS, seeds: [
    ['iacuc-3rs-refinement', 'PHS Policy IV.C.1.d', 'Refinement — sedation, analgesia or anaesthesia recorded', ANIMAL, 'Procedures causing more than momentary pain require pain relief unless it is scientifically justified.'],
    ['iacuc-pain-distress-category', 'PHS Policy IV.C.1.a–b', 'Pain/distress category recorded with justification', ANIMAL, 'The category drives the level of committee scrutiny the protocol receives.'],
    ['iacuc-humane-endpoints', 'PHS Policy IV.C.1.e', 'Humane endpoints recorded', ANIMAL, 'Without a defined endpoint an animal in unrelievable distress is carried to death as data.'],
  ] },
  { standard: 'AVMA Guidelines for the Euthanasia of Animals', seeds: [
    ['iacuc-euthanasia-avma', 'PHS Policy IV.C.1.i (AVMA Guidelines)', 'Euthanasia method consistent with the AVMA Guidelines', ANIMAL, 'A method outside the AVMA Guidelines must be justified to the committee, not assumed.'],
  ] },
  { standard: NIHG, seeds: [
    ['ibc-risk-group-classification', 'Section II-A and Appendix B — risk group classification', 'Risk group of the agent recorded', BIO, 'Containment is selected from the risk group; an unrecorded group means unselected containment.'],
    ['ibc-containment-level', 'Appendix G — Physical Containment', 'Containment level and practices recorded', BIO, 'Physical containment is the control that stops a laboratory exposure becoming a community one.'],
  ] },
];

/** Every rule, in catalogue order. That order is the finding order — determinism. */
export const PROTOCOL_RULES: readonly ProtocolRule[] = CATALOGUE.flatMap((group) =>
  group.seeds.map(([id, clause, title, appliesTo, rationale]) => ({
    id, standard: group.standard, clause, title, appliesTo, rationale,
  })),
);

const IDS_BY_STANDARD = new Map<string, string[]>(
  CATALOGUE.map((group) => [group.standard, group.seeds.map((s) => s[0])]),
);

/** The rules that apply to `kind`, or every rule when `kind` is omitted. Pure. */
export function listProtocolRules(kind?: ProtocolKind): ProtocolRule[] {
  const all = PROTOCOL_RULES.map((r) => ({ ...r, appliesTo: [...r.appliesTo] }));
  return kind ? all.filter((r) => r.appliesTo.includes(kind)) : all;
}

// ─── Evaluation primitives ───────────────────────────────────────────────────

interface Outcome { status: ProtocolRuleStatus; severity: ProtocolRuleSeverity; message: string; remediation: string }
type Sink = Map<string, Outcome>;

interface SectionProbe {
  present: boolean; keys: string[]; title: string;
  status: SectionStatus | null; contentLength: number; hasContent: boolean;
}

interface Ctx {
  kind: ProtocolKind;
  sections: Map<string, ProtocolRuleSectionInput>; sectionList: ProtocolRuleSectionInput[];
  requiredTotal: number; requiredIncomplete: number;
  objectives: ProtocolRuleObjectiveInput[]; primaries: ProtocolRuleObjectiveInput[];
  inclusion: number; exclusion: number; visits: number;
  phase: string; designType: string; regions: string[];
  input: ProtocolRuleInput;
}

const NO_ACTION = 'No action: the recorded protocol satisfies this rule.';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const trunc = (v: string): string => (v.length <= 60 ? v : `${v.slice(0, 57)}...`);

function buildContext(input: ProtocolRuleInput): Ctx {
  const sectionList = Array.isArray(input.sections) ? input.sections : [];
  const sections = new Map<string, ProtocolRuleSectionInput>();
  for (const s of sectionList) if (!sections.has(s.sectionKey)) sections.set(s.sectionKey, s);
  const required = sectionList.filter((s) => s.required);
  const objectives = Array.isArray(input.objectives) ? input.objectives : [];
  return {
    kind: input.kind,
    sections,
    sectionList,
    requiredTotal: required.length,
    requiredIncomplete: required.filter((s) => s.status !== 'complete').length,
    objectives,
    primaries: objectives.filter((o) => str(o.objectiveType).toLowerCase() === 'primary'),
    inclusion: Array.isArray(input.inclusion) ? input.inclusion.filter((c) => str(c) !== '').length : 0,
    exclusion: Array.isArray(input.exclusion) ? input.exclusion.filter((c) => str(c) !== '').length : 0,
    visits: Number.isFinite(input.scheduleVisitCount) ? Math.max(0, Math.trunc(input.scheduleVisitCount)) : 0,
    phase: str(input.phase),
    designType: str(input.designType),
    regions: Array.isArray(input.regions) ? input.regions.map((r) => str(r).toUpperCase()).filter((r) => r !== '') : [],
    input,
  };
}

function probe(ctx: Ctx, keys: string[]): SectionProbe {
  for (const key of keys) {
    const s = ctx.sections.get(key);
    if (s) {
      return { present: true, keys, title: str(s.title) || key, status: s.status, contentLength: Math.max(0, Number(s.contentLength) || 0), hasContent: s.hasContent === true };
    }
  }
  return { present: false, keys, title: '', status: null, contentLength: 0, hasContent: false };
}

/**
 * A section-backed rule can never return 'met'. A status and a character count say
 * that something was written, not that it says what the clause requires — so the
 * best available outcome is 'attention' with a message that says exactly that.
 */
function sectionOutcome(p: SectionProbe, subject: string, remediation: string, missing: ProtocolRuleSeverity = 'critical'): Outcome {
  const keyList = p.keys.map((k) => `"${k}"`).join(' or ');
  if (!p.present) {
    return { status: 'unmet', severity: missing, message: `No section keyed ${keyList} is recorded on this protocol, so it records nothing for ${subject}.`, remediation };
  }
  if (p.status === 'not_started') {
    return { status: 'unmet', severity: missing, message: `Section "${p.title}" is recorded as not started, so the protocol records nothing for ${subject}.`, remediation };
  }
  if (!p.hasContent || p.contentLength === 0) {
    return { status: 'unmet', severity: missing, message: `Section "${p.title}" is recorded as ${String(p.status).replace('_', ' ')} but holds no content, so the protocol records nothing for ${subject}.`, remediation };
  }
  if (p.status === 'draft') {
    return { status: 'attention', severity: 'warning', message: `Section "${p.title}" is in draft with ${p.contentLength} characters recorded; its content was not inspected for ${subject}.`, remediation };
  }
  return { status: 'attention', severity: 'warning', message: `Section "${p.title}" is marked complete with ${p.contentLength} characters recorded, but its recorded content was not inspected for ${subject}; a completion status is not evidence of ${subject}.`, remediation };
}

const met = (message: string): Outcome => ({ status: 'met', severity: 'info', message, remediation: NO_ACTION });
const unmet = (message: string, remediation: string, severity: ProtocolRuleSeverity = 'critical'): Outcome => ({ status: 'unmet', severity, message, remediation });
const attention = (message: string, remediation: string): Outcome => ({ status: 'attention', severity: 'warning', message, remediation });
const unassessed = (message: string, remediation: string): Outcome => ({ status: 'not-assessed', severity: 'info', message, remediation });

/**
 * A recorded-as-false flag makes a conditional standard inapplicable; an ABSENT flag
 * makes it unassessed. Absence is never read as "no" — that is the whole point.
 */
function applicability(flag: boolean | null | undefined, subject: string, condition: string): Outcome | null {
  if (flag == null) {
    return unassessed(
      `This protocol has not recorded whether ${condition}, so ${subject} was not assessed. An unrecorded flag is not a record of absence.`,
      `Record on the protocol whether ${condition}.`,
    );
  }
  if (flag === false) return met(`Not applicable: this protocol records that ${condition} is not the case.`);
  return null;
}

// ─── Shared structured checks (structured signals, never text heuristics) ─────

function objectivesHaveEndpoints(ctx: Ctx): Outcome {
  if (ctx.objectives.length === 0) {
    return unmet('No objectives are recorded, so no objective is paired with an endpoint.', 'Record each objective together with the endpoint that measures it.');
  }
  const missing = ctx.objectives.filter((o) => str(o.endpoint) === '');
  if (missing.length === 0) return met(`All ${ctx.objectives.length} recorded objectives carry an endpoint.`);
  return unmet(
    `${missing.length} of ${ctx.objectives.length} recorded objectives carry no endpoint (first: "${trunc(str(missing[0].objective)) || '(untitled objective)'}").`,
    'Record the endpoint that measures each objective, or remove the objective.',
  );
}

function eligibilityRecorded(ctx: Ctx): Outcome {
  if (ctx.inclusion === 0 && ctx.exclusion === 0) {
    return unmet('No inclusion and no exclusion criteria are recorded.', 'Record the inclusion and exclusion criteria that define who may enrol.');
  }
  if (ctx.inclusion === 0) return unmet(`No inclusion criteria are recorded (${ctx.exclusion} exclusion criteria recorded).`, 'Record the inclusion criteria.');
  if (ctx.exclusion === 0) return unmet(`No exclusion criteria are recorded (${ctx.inclusion} inclusion criteria recorded).`, 'Record the exclusion criteria.', 'warning');
  return met(`${ctx.inclusion} inclusion and ${ctx.exclusion} exclusion criteria are recorded.`);
}

function scheduleRecorded(ctx: Ctx): Outcome {
  if (ctx.visits === 0) return unmet('The schedule of assessments records no visits.', 'Record the visits and the assessments performed at each.');
  return met(`${ctx.visits} scheduled visits are recorded.`);
}

// ─── ICH M11 ─────────────────────────────────────────────────────────────────

function evalIchM11(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'clinical') return;
  sink.set('ich-m11-protocol-summary', sectionOutcome(probe(ctx, ['synopsis', 'summary']), 'a protocol synopsis', 'Write the protocol synopsis required by ICH M11 Section 1.'));
  sink.set('ich-m11-objectives-endpoints', objectivesHaveEndpoints(ctx));
  sink.set('ich-m11-trial-design', sectionOutcome(probe(ctx, ['design']), 'the trial design', 'State the trial design, including allocation, blinding and control.'));
  sink.set('ich-m11-population-eligibility', eligibilityRecorded(ctx));
  sink.set('ich-m11-intervention-concomitant', sectionOutcome(probe(ctx, ['intervention']), 'the trial intervention and concomitant therapy', 'Record the intervention, its administration and the concomitant therapy rules.'));
  sink.set('ich-m11-discontinuation-withdrawal', sectionOutcome(probe(ctx, ['discontinuation', 'withdrawal']), 'discontinuation and withdrawal criteria', 'Add a discontinuation/withdrawal section stating the criteria and the follow-up that applies.'));
  sink.set('ich-m11-assessment-schedule', scheduleRecorded(ctx));
  sink.set('ich-m11-statistical-considerations', sectionOutcome(probe(ctx, ['statistics']), 'the statistical considerations', 'Record the analysis populations, the primary analysis and the handling of missing data.'));
  sink.set('ich-m11-oversight-quality', sectionOutcome(probe(ctx, ['oversight', 'ethics']), 'oversight, risk management and quality', 'Record trial oversight, the risk-management approach and the quality arrangements.'));
}

// ─── ICH E9 / E9(R1) ─────────────────────────────────────────────────────────

/** The five named E9(R1) strategies. Used ONLY as a declared keyword scan. */
const INTERCURRENT_STRATEGIES = ['treatment policy', 'hypothetical', 'composite', 'while on treatment', 'principal stratum'];

function primaryEndpointOutcome(ctx: Ctx): Outcome {
  if (ctx.primaries.length === 0) {
    return unassessed("No objective is recorded with objective_type 'primary', so the estimand's variable attribute was not assessed.", "Record the primary objective and the endpoint that measures it.");
  }
  const withEndpoint = ctx.primaries.filter((o) => str(o.endpoint) !== '');
  if (withEndpoint.length === ctx.primaries.length) {
    return met(`${ctx.primaries.length} primary objectives are recorded and each carries an endpoint.`);
  }
  return unmet(
    `${ctx.primaries.length - withEndpoint.length} of ${ctx.primaries.length} recorded primary objectives carry no endpoint.`,
    'Record the endpoint for each primary objective before the estimand can be constructed.',
  );
}

function intercurrentOutcome(ctx: Ctx): Outcome {
  if (ctx.primaries.length === 0) {
    return unassessed("No objective is recorded with objective_type 'primary', so no intercurrent-event strategy was looked for.", 'Record the primary objective first.');
  }
  const haystack = ctx.primaries.map((o) => `${str(o.objective)} ${str(o.endpoint)} ${str(o.timepoint)}`).join(' | ').toLowerCase();
  const hits = INTERCURRENT_STRATEGIES.filter((s) => haystack.includes(s));
  if (hits.length > 0) {
    return met(`A keyword scan of the recorded primary objective and endpoint text named the intercurrent-event strategy "${hits[0]}". This is a keyword scan, not a reading of the protocol.`);
  }
  return attention(
    `A keyword scan of the recorded primary objective and endpoint text found none of the five ICH E9(R1) intercurrent-event strategies by name (${INTERCURRENT_STRATEGIES.join(', ')}). This is a keyword scan, not a reading of the protocol, so its result is not proof the strategy is missing.`,
    'State, for the primary endpoint, which strategy applies to each anticipated intercurrent event.',
  );
}

function multiplicityOutcome(ctx: Ctx): Outcome {
  if (ctx.primaries.length === 0) {
    return unassessed("No objective is recorded with objective_type 'primary', so multiplicity was not assessed.", 'Record the primary objectives.');
  }
  if (ctx.primaries.length === 1) return met('Exactly one primary objective is recorded, so no multiplicity arises from multiple primary endpoints.');
  return attention(
    `${ctx.primaries.length} primary objectives are recorded; the protocol record holds no multiplicity-control strategy alongside them.`,
    'Prespecify the multiplicity control (hierarchy, alpha split or gatekeeping) in the statistical considerations.',
  );
}

function evalIchE9(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'clinical') return;
  sink.set('ich-e9r1-estimand-treatment-condition', sectionOutcome(probe(ctx, ['intervention']), "the estimand's treatment condition", 'State the treatment condition, including the comparator, exactly as the estimand requires.'));
  sink.set('ich-e9r1-estimand-population', eligibilityRecorded(ctx));
  sink.set('ich-e9r1-estimand-variable', primaryEndpointOutcome(ctx));
  sink.set('ich-e9r1-estimand-intercurrent-events', intercurrentOutcome(ctx));
  sink.set('ich-e9r1-estimand-population-level-summary', unassessed(
    'The protocol record has no field for a population-level summary measure, and inferring one from section prose would be a guess, so this attribute was not assessed.',
    'State the population-level summary (for example a difference in means, a risk difference or a hazard ratio) in the statistical considerations.',
  ));
  sink.set('ich-e9-sample-size-justification', sectionOutcome(probe(ctx, ['statistics']), 'a sample-size justification', 'Record the sample size with the assumptions, effect size and power it was derived from.'));
  sink.set('ich-e9-multiplicity', multiplicityOutcome(ctx));
}

// ─── ICH E8(R1) and ICH E6(R3) ───────────────────────────────────────────────

function evalIchE8(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'clinical') return;
  sink.set('ich-e8r1-critical-to-quality-factors', sectionOutcome(probe(ctx, ['quality', 'data_management']), 'the critical-to-quality factors', 'Record the critical-to-quality factors and the controls each one gets.', 'warning'));
  sink.set('ich-e8r1-risk-proportionate-approach', ctx.phase === ''
    ? unassessed('This protocol records no phase, so whether its approach is proportionate to risk was not assessed.', 'Record the trial phase.')
    : attention(`Phase is recorded as "${ctx.phase}", but the protocol record holds no risk assessment to judge proportionality against.`, 'Record the risk assessment that the monitoring and oversight intensity is derived from.'));
}

function evalIchE6(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'clinical') return;
  sink.set('ich-e6r3-safety-reporting', sectionOutcome(probe(ctx, ['safety']), 'protocol-specified safety reporting responsibilities', 'Record who reports what, to whom and within what timeline.'));
  sink.set('ich-e6r3-monitoring-approach', sectionOutcome(probe(ctx, ['monitoring', 'data_safety', 'oversight']), 'the monitoring approach', 'Record the monitoring approach, including any centralised or risk-based element.', 'warning'));
  sink.set('ich-e6r3-data-integrity', sectionOutcome(probe(ctx, ['data_management', 'data_governance']), 'data integrity and ALCOA+ expectations', 'Record the data-governance expectations the sites and the sponsor are held to.', 'warning'));
}

// ─── 21 CFR 312.23(a)(6) — IND protocol content ──────────────────────────────

function evalIndContent(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'clinical') return;
  const gate = applicability(ctx.input.isIndTrial, 'IND protocol content under 21 CFR 312.23(a)(6)', 'this trial is conducted under a US IND');
  if (gate) {
    for (const id of IDS_BY_STANDARD.get(IND) ?? []) sink.set(id, gate);
    return;
  }
  sink.set('fda-ind-objectives-purpose', ctx.objectives.length > 0
    ? met(`${ctx.objectives.length} objectives are recorded.`)
    : unmet('No objectives are recorded, so the protocol states no objective or purpose.', 'Record the study objectives and purpose.'));
  sink.set('fda-ind-investigator-site-information', unassessed(
    'The protocol record carries no investigator, facility or reviewing-IRB roster, so this element was not assessed here.',
    'Record the investigators, the research facilities and the reviewing IRB for each site.',
  ));
  sink.set('fda-ind-selection-exclusion-criteria', eligibilityRecorded(ctx));
  sink.set('fda-ind-study-design-control', ctx.designType !== ''
    ? met(`The protocol records a design type of "${ctx.designType}".`)
    : sectionOutcome(probe(ctx, ['design']), 'the study design and its control group', 'Record the design type, including the control group and the bias-minimisation methods.'));
  sink.set('fda-ind-dosing', sectionOutcome(probe(ctx, ['intervention', 'dosing']), 'dose determination, maximum dosage and exposure duration', 'Record how the dose is determined, the planned maximum and the duration of exposure.'));
  sink.set('fda-ind-observations-measurements', scheduleRecorded(ctx));
  sink.set('fda-ind-safety-monitoring-procedures', sectionOutcome(probe(ctx, ['safety', 'data_safety']), 'the clinical procedures and tests used to monitor drug effects and minimise risk', 'Record the safety monitoring procedures, laboratory tests and stopping rules.'));
}

// ─── 21 CFR 50.25 and 21 CFR 56.111 ──────────────────────────────────────────

function evalConsent(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'clinical' && ctx.kind !== 'irb') return;
  const p = probe(ctx, ['recruitment', 'consent', 'ethics']);
  sink.set('fda-consent-basic-elements', sectionOutcome(p, 'the eight basic elements of informed consent at 21 CFR 50.25(a)(1)–(8)', 'Check the consent section element by element against 21 CFR 50.25(a)(1)–(8) and record each one.'));
  sink.set('fda-consent-additional-elements', sectionOutcome(p, 'the six additional elements of informed consent at 21 CFR 50.25(b)(1)–(6)', 'Check the consent section against 21 CFR 50.25(b)(1)–(6) and record each element that is appropriate to this trial.', 'warning'));
}

function evalIrbCriteria(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'clinical' && ctx.kind !== 'irb') return;
  const risk = probe(ctx, ['risks_benefits', 'safety']);
  const consent = probe(ctx, ['recruitment', 'consent', 'ethics']);
  sink.set('fda-irb-risks-minimized', sectionOutcome(risk, 'how risks to subjects are minimised', 'Record the procedures that minimise risk, including those already performed for diagnosis or treatment.'));
  sink.set('fda-irb-risks-reasonable', sectionOutcome(risk, 'why risks are reasonable in relation to anticipated benefits', 'Record the risk/benefit judgement the IRB is being asked to accept.'));
  sink.set('fda-irb-equitable-selection', ctx.inclusion === 0
    ? unmet('No inclusion criteria are recorded, so selection of subjects cannot be shown to be equitable.', 'Record the inclusion criteria and the recruitment approach.')
    : sectionOutcome(probe(ctx, ['population', 'recruitment']), 'why selection of subjects is equitable', 'Record why the selection of subjects is equitable for this population and setting.'));
  sink.set('fda-irb-consent-sought-and-documented', sectionOutcome(consent, 'how informed consent is sought and documented', 'Record the consent process and how consent is documented for each subject.'));
  sink.set('fda-irb-data-monitoring-for-safety', sectionOutcome(probe(ctx, ['data_safety', 'safety']), 'the provision for monitoring data to ensure subject safety', 'Record the data and safety monitoring provision, or state why none is appropriate.', 'warning'));
  sink.set('fda-irb-privacy-confidentiality', sectionOutcome(probe(ctx, ['privacy', 'data_management']), 'the provisions protecting privacy and maintaining confidentiality', 'Record the privacy and confidentiality provisions, including identifiers and retention.'));
}

// ─── 45 CFR 46 Subparts B / C / D — flag-gated, absence is never "no" ─────────

function evalHhsSubparts(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'clinical' && ctx.kind !== 'irb') return;
  const safeguards = probe(ctx, ['vulnerable', 'ethics', 'population']);
  const gated: Array<[string, boolean | null | undefined, string, string]> = [
    ['hhs-subpart-b-pregnant-women', ctx.input.involvesPregnantWomen, 'pregnant women, human fetuses or neonates are involved', 'the Subpart B conditions at 45 CFR 46.204'],
    ['hhs-subpart-c-prisoners', ctx.input.involvesPrisoners, 'prisoners are involved', 'the Subpart C safeguards at 45 CFR 46.305'],
    ['hhs-subpart-d-children-risk-category', ctx.input.involvesChildren, 'children are involved', 'the Subpart D risk category at 45 CFR 46.404–46.407'],
    ['hhs-subpart-d-children-assent-permission', ctx.input.involvesChildren, 'children are involved', 'child assent and parental permission at 45 CFR 46.408'],
    ['hhs-additional-safeguards-vulnerable', ctx.input.involvesVulnerable, 'subjects vulnerable to coercion or undue influence are involved', 'the additional safeguards at 45 CFR 46.111(b)'],
  ];
  for (const [id, flag, condition, subject] of gated) {
    const gate = applicability(flag, subject, condition);
    sink.set(id, gate ?? sectionOutcome(safeguards, subject, `Record ${subject} in the safeguards section, given the protocol records that ${condition}.`));
  }
}

// ─── EU CTR 536/2014 and FDORA 2022 §3601 ────────────────────────────────────

const EU_REGIONS = new Set([
  'EU', 'EEA', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
]);

function euApplicability(ctx: Ctx): Outcome | null {
  if (ctx.regions.length === 0) {
    return unassessed('This protocol records no regions, so whether EU CTR 536/2014 applies was not assessed.', 'Record the regions this trial will be submitted in.');
  }
  if (!ctx.regions.some((r) => EU_REGIONS.has(r))) {
    return met(`Not applicable: the recorded regions (${ctx.regions.join(', ')}) include no EU or EEA member state.`);
  }
  return null;
}

function evalEuCtr(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'clinical') return;
  const gate = euApplicability(ctx);
  if (gate) {
    for (const id of IDS_BY_STANDARD.get(CTR) ?? []) sink.set(id, gate);
    return;
  }
  sink.set('eu-ctr-protocol-content', ctx.requiredTotal === 0
    ? unmet('This protocol records no required sections, so its Annex I, section D content has not been assessed.', 'Seed the protocol from its section template before submitting.')
    : ctx.requiredIncomplete === 0
      ? met(`All ${ctx.requiredTotal} required sections are recorded complete.`)
      : unmet(`${ctx.requiredIncomplete} of ${ctx.requiredTotal} required sections are not complete.`, 'Complete every required section before the Part I submission.'));
  sink.set('eu-ctr-eligibility-criteria', eligibilityRecorded(ctx));
  sink.set('eu-ctr-endpoints', objectivesHaveEndpoints(ctx));
}

/** Declared keyword scan over section KEYS and TITLES — absence is 'attention'. */
const DIVERSITY_TERMS = ['diversity', 'enrolment plan', 'enrollment plan', 'representativeness'];

function fdoraOutcome(ctx: Ctx): Outcome {
  if (ctx.regions.length === 0) return unassessed('This protocol records no regions, so the FDORA §3601 expectation was not assessed.', 'Record the regions this trial will be submitted in.');
  if (!ctx.regions.includes('US')) return met(`Not applicable: the recorded regions (${ctx.regions.join(', ')}) do not include the US.`);
  if (ctx.phase === '' && ctx.designType === '') {
    return unassessed('This protocol records neither a phase nor a design type, so whether it is a phase 3 / pivotal trial was not assessed.', 'Record the phase and design type.');
  }
  const pivotal = /(^|\D)3(\D|$)|iii|pivotal/i.test(`${ctx.phase} ${ctx.designType}`);
  if (!pivotal) return met(`Not applicable: the recorded phase "${ctx.phase || '(none)'}" and design type "${ctx.designType || '(none)'}" are not a phase 3 / pivotal trial.`);
  const scanned = ctx.sectionList.some((s) => {
    const hay = `${s.sectionKey} ${s.title}`.toLowerCase();
    return DIVERSITY_TERMS.some((t) => hay.includes(t));
  });
  if (scanned) return attention('A keyword scan of the recorded section keys and titles matched a diversity/enrolment-plan section, but its content was not inspected against FDORA §3601.', 'Confirm the Diversity Action Plan meets the FDA guidance content expectations.');
  return attention(
    `This trial is recorded as phase "${ctx.phase || '(none)'}" / design "${ctx.designType || '(none)'}" with a US region, so FDORA §3601 expects a Diversity Action Plan. A keyword scan of the recorded section keys and titles matched none; this is a keyword scan, not proof the plan is absent.`,
    'Record the Diversity Action Plan, or record why this trial is outside the FDORA §3601 scope.',
  );
}

// ─── IACUC and IBC ───────────────────────────────────────────────────────────

function evalIacuc(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'iacuc') return;
  sink.set('iacuc-3rs-replacement', sectionOutcome(probe(ctx, ['replacement']), 'the consideration of alternatives to painful or distressing procedures', 'Record the alternatives search — the databases queried, the dates and the outcome.'));
  sink.set('iacuc-3rs-reduction', sectionOutcome(probe(ctx, ['reduction']), 'the rationale for the species and the number of animals', 'Record the animal count with the power calculation or other rationale behind it.'));
  sink.set('iacuc-3rs-refinement', sectionOutcome(probe(ctx, ['refinement']), 'sedation, analgesia or anaesthesia', 'Record the agents, doses and schedule, or the scientific justification for withholding them.'));
  sink.set('iacuc-pain-distress-category', sectionOutcome(probe(ctx, ['pain_category']), 'the pain/distress category and its justification', 'Record the USDA pain/distress category and justify the classification.'));
  sink.set('iacuc-humane-endpoints', sectionOutcome(probe(ctx, ['euthanasia', 'endpoints']), 'the humane endpoints', 'Record the humane endpoints and the observations that trigger them.'));
  sink.set('iacuc-euthanasia-avma', sectionOutcome(probe(ctx, ['euthanasia']), 'the euthanasia method and its consistency with the AVMA Guidelines', 'Record the euthanasia method and confirm it is an AVMA-acceptable method, or justify the deviation.'));
}

function evalIbc(ctx: Ctx, sink: Sink): void {
  if (ctx.kind !== 'ibc') return;
  sink.set('ibc-risk-group-classification', sectionOutcome(probe(ctx, ['risk_assessment', 'agents']), 'the risk group of the agent', 'Record the NIH Guidelines risk group for every agent used.'));
  sink.set('ibc-containment-level', sectionOutcome(probe(ctx, ['risk_assessment', 'ppe']), 'the containment level and practices', 'Record the biosafety level and the physical containment practices selected from it.'));
}

const EVALUATORS: Array<(ctx: Ctx, sink: Sink) => void> = [
  evalIchM11, evalIchE9, evalIchE8, evalIchE6, evalIndContent,
  evalConsent, evalIrbCriteria, evalHhsSubparts, evalEuCtr,
  (ctx, sink) => { if (ctx.kind === 'clinical') sink.set('fdora-3601-diversity-action-plan', fdoraOutcome(ctx)); },
  evalIacuc, evalIbc,
];

/**
 * A rule in scope for the kind that no evaluator produced an outcome for is a gap in
 * THIS module, and it is reported as an unassessed rule rather than quietly dropped
 * or, worse, defaulted to 'met'.
 */
const UNREACHED: Outcome = {
  status: 'not-assessed',
  severity: 'info',
  message: 'This rule is in scope for the protocol kind but no evaluator produced an assessment for it, so it was not assessed.',
  remediation: 'Report this as a gap in the protocol rule pack.',
};

/**
 * Evaluate a protocol document's recorded content against the rule pack. One finding
 * per rule in scope for the kind, in catalogue order. Pure and total — no throw, no
 * clock, no randomness: the same input always yields byte-identical output.
 */
export function evaluateProtocolRules(input: ProtocolRuleInput): ProtocolRuleEvaluation {
  const ctx = buildContext(input);
  const sink: Sink = new Map();
  for (const evaluate of EVALUATORS) evaluate(ctx, sink);

  const findings: ProtocolRuleFinding[] = [];
  for (const rule of PROTOCOL_RULES) {
    if (!rule.appliesTo.includes(ctx.kind)) continue;
    const o = sink.get(rule.id) ?? UNREACHED;
    findings.push({
      ruleId: rule.id, standard: rule.standard, clause: rule.clause, title: rule.title,
      status: o.status, severity: o.severity, message: o.message, remediation: o.remediation,
    });
  }
  const notAssessed = findings.filter((f) => f.status === 'not-assessed').length;
  return {
    findings,
    assessed: findings.length - notAssessed,
    unmet: findings.filter((f) => f.status === 'unmet').length,
    notAssessed,
  };
}
