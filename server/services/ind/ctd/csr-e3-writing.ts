/**
 * How a senior medical writer writes an ICH E3 clinical study report: the
 * report-wide rules (tense, voice, numbers, hedging, causality, never
 * interpreting beyond the data), the standard sentence shapes, and the coding
 * dictionaries and grading scales a writer must name correctly.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Until 2026-10-29 (CSR slice 4, docs/design/CSR_END_TO_END_2026-10-29.md) the
 * E3 overlay said what each heading carries but never how to write it, and
 * medical_writing_guidance had ten global style rules and a top-level CSR
 * standard. The per-heading rules live on the headings themselves (the
 * `writing` field in csr-e3-sections-*.ts); this file holds what every heading
 * shares, once. medical-writing.ts reads it; nothing restates it.
 *
 * ── Rule 2 ───────────────────────────────────────────────────────────────────
 * Every sentence shape below has slots in braces, never figures. A slot is
 * filled from the engine's tables — the section's evidence pack
 * (get_csr_section_evidence) or the §14 output it cites — and a slot with no
 * source stays unfilled: the writer says the figure is awaited, never
 * estimates it. The census in tests/regulatory/csr-e3-overlay.test.ts refuses a
 * per-heading rule that carries a figure.
 *
 * ── Basis ────────────────────────────────────────────────────────────────────
 * Tense, voice and sentence shape are craft (platform convention), not
 * regulation: E3 prescribes content and order, not grammar. Where a rule rests
 * on E3 or E9(R1) the basis says so, graded `recall` — the session could not
 * read the regulator copies (egress to fda.gov and ich.org was refused on
 * 2026-10-29), so nothing here claims to have been checked against them.
 */

import type { RegulatoryBasis } from './types.js';
import { FDA_E3, ICH_E9_R1, practice } from './regulatory-basis.js';

const CRAFT = practice('Senior medical-writing practice (AMWA/EMWA CSR craft); not a regulatory requirement');
const CONDUCT_SOURCE_RULE = 'Only state approval, consent, compliance, study conduct or SAP timing when retained source records support the statement. Study metadata and a standard sentence are not evidence that approval occurred, consent was obtained or an analysis was prespecified. Describe missing or unknown records, late approvals, waivers, exceptions and deviations honestly; do not assume a compliant history or invent an authority decision.';

export interface CsrWritingRule {
  topic: 'tense' | 'voice' | 'numbers' | 'hedging' | 'causality' | 'interpretation' | 'population' | 'traceability' | 'terminology' | 'estimand' | 'source';
  rule: string;
  basis: RegulatoryBasis;
}

/** Rules that hold under every CSR heading. */
export const CSR_WRITING_RULES: readonly CsrWritingRule[] = Object.freeze([
  { topic: 'source', rule: CONDUCT_SOURCE_RULE, basis: CRAFT },
  { topic: 'tense', rule: 'Past tense for everything planned, done and observed ("Patients were randomised", "The protocol required", "Nausea was reported by"); present tense for what the report and its outputs contain and for conclusions and established facts ("Table 14.3.1.1 summarises", "These data show"). Never the future tense of the protocol ("patients will be").', basis: CRAFT },
  { topic: 'voice', rule: 'Active voice where the agent matters — the investigator assessed, the DMC recommended, the sponsor amended. Passive is acceptable for routine methods whose agent is obvious ("Blood samples were collected"). Never use the passive to hide who made a decision (§9.8).', basis: CRAFT },
  { topic: 'numbers', rule: 'Counts as n (%) with the denominator stated in the sentence or the cited table; one consistent number of decimal places for percentages; the estimate and its confidence or credible interval before any planned decision statistic. Include a p-value only where the prespecified analysis uses one, exactly as the output gives it. Every figure in the text is in a cited §14 output — no orphan numbers, no rounding that the table does not show.', basis: FDA_E3 },
  { topic: 'hedging', rule: 'Calibrate the verb to the evidence: a primary or multiplicity-controlled endpoint that met its criterion "demonstrated" or "showed"; a secondary endpoint outside the testing hierarchy carries a "nominal" p-value and "suggests"; an exploratory or post hoc result is called exploratory or post hoc and "hypothesis-generating". Never "a trend towards significance", "approached significance" or "numerically superior" as if it were a finding.', basis: CRAFT },
  { topic: 'causality', rule: 'Report relatedness as someone\'s assessment: "considered by the investigator to be related to study drug", and the sponsor\'s assessment separately where one was made. "Treatment-emergent" is not "related". Never write "caused by", "drug-induced" or "due to" unless an adjudication committee or the protocol\'s causality method concluded it, and name which.', basis: CRAFT },
  { topic: 'interpretation', rule: 'Never interpret beyond the data: no mechanism, no population or dose that was not studied, no clinical meaningfulness without a pre-specified threshold, and no "comparable" or "similar" groups on the strength of a non-significant superiority test. A non-significant superiority difference is not evidence of no difference. Match the prespecified criterion to the hypothesis: non-inferiority uses its justified margin and interval direction, equivalence its two margins and interval inclusion, and Bayesian analyses their prior, posterior quantity and decision threshold. Do not turn these designs into superiority p-value decisions or infer success merely because an interval includes the null.', basis: CRAFT },
  { topic: 'population', rule: 'Name the analysis set for every result ("in the full analysis set", "in the safety population") and use its name exactly as §11.1 and define.xml define it.', basis: FDA_E3 },
  { topic: 'traceability', rule: 'Cite the source output at the end of each results paragraph (Table 14.2.1.1; Listing 16.2.7); a statement without a cited output is a draft, not a result.', basis: CRAFT },
  { topic: 'terminology', rule: 'Use coded terms exactly as coded: MedDRA preferred terms and system organ classes with their capitalisation and the MedDRA version; WHODrug preferred names; CTCAE or the protocol\'s grading scale with its version. "Adverse event", not "side effect"; "patients", "subjects" or "participants" as the protocol says, consistently.', basis: CRAFT },
  { topic: 'estimand', rule: 'For a study planned under ICH E9(R1), state each result as an estimate of its estimand — population, treatment condition, variable, the handling of each intercurrent event, and the population-level summary — and keep the main estimator, sensitivity analyses (same estimand, different assumptions) and supplementary analyses (a different estimand) apart.', basis: ICH_E9_R1 },
]);

export interface CsrSentencePattern {
  id: string;
  use: string;
  /** Slots in braces; filled only from the engine's tables. */
  pattern: string;
}

/** The standard result sentences. Slots, never figures. */
export const CSR_SENTENCE_PATTERNS: readonly CsrSentencePattern[] = Object.freeze([
  { id: 'disposition', use: '§10.1, synopsis', pattern: 'Of the {n_randomised} patients randomised, {n_completed} ({pct_completed}%) completed the study and {n_discontinued} ({pct_discontinued}%) discontinued early; the most common reason for discontinuation was {reason} ({arm_a}: {n_a} [{pct_a}%]; {arm_b}: {n_b} [{pct_b}%]) (Table {table}).' },
  { id: 'demographics', use: '§11.2', pattern: 'In the {analysis_set}, the median age was {median_age} years (range: {min_age} to {max_age}), {n_female} ({pct_female}%) patients were female and {n_category} ({pct_category}%) were {race_category} (Table {table}). The largest between-group difference was in {characteristic} ({arm_a}: {value_a}; {arm_b}: {value_b}).' },
  { id: 'efficacy-estimate', use: '§11.4.1, synopsis; only when the source supplies this frequentist estimate, confidence interval and p-value. Do not substitute a credible interval or invent a p-value.', pattern: 'At {timepoint}, the {summary_measure} for {endpoint} in the {analysis_set} was {estimate} ({ci_level}% CI: {ci_lower}, {ci_upper}; p {p_relation} {p_value}) for {arm_a} versus {arm_b} (Table {table}).' },
  { id: 'efficacy-time-to-event', use: '§11.4.1', pattern: 'Median {endpoint} was {median_a} months ({ci_level}% CI: {lower_a}, {upper_a}) with {arm_a} and {median_b} months ({ci_level}% CI: {lower_b}, {upper_b}) with {arm_b}; the hazard ratio was {hr} ({ci_level}% CI: {hr_lower}, {hr_upper}), based on {n_events} events ({pct_maturity}% maturity) (Table {table}; Figure {figure}).' },
  { id: 'non-significant', use: '§11.4.1; a superiority comparison only, when the source analysis supports this interpretation. Crossing the superiority null does not decide noninferiority, equivalence or a Bayesian hypothesis.', pattern: 'The difference in {endpoint} was {estimate} ({ci_level}% CI: {ci_lower}, {ci_upper}); the prespecified superiority criterion {criterion} was not met. The interval includes {null_value} and does not exclude {clinically_relevant_bound} (Table {table}).' },
  { id: 'non-inferiority', use: '§11.4.1; only when the retained SAP and source analysis specify noninferiority, the margin, effect direction, analysis set and decision criterion. Copy the recorded conclusion; do not decide noninferiority from a nonsignificant superiority p-value.', pattern: 'For {endpoint} in the {analysis_set}, {effect_measure} was {estimate} ({ci_level}% CI: {ci_lower}, {ci_upper}). The prespecified noninferiority margin was {margin}, with {decision_direction} defined in {sap_reference}. The source analysis reported {recorded_noninferiority_conclusion} (Table {table}).' },
  { id: 'equivalence', use: '§11.4.1; only when the retained SAP and source analysis specify equivalence, both margins and the decision criterion. Copy the recorded conclusion; a nonsignificant difference is not evidence of equivalence.', pattern: 'For {endpoint} in the {analysis_set}, {effect_measure} was {estimate} ({ci_level}% CI: {ci_lower}, {ci_upper}). The prespecified equivalence limits were {lower_margin} and {upper_margin} under {decision_criterion}. The source analysis reported {recorded_equivalence_conclusion} (Table {table}; SAP {sap_reference}).' },
  { id: 'bayesian-decision', use: '§11.4.1; only when the retained SAP and source analysis supply the posterior summary, credible interval, named hypothesis and any decision threshold. Identify the prior and prior-sensitivity output only when recorded. Copy the recorded decision rather than computing one. A credible interval is not a confidence interval; posterior probability is not a p-value.', pattern: 'For {endpoint} in the {analysis_set}, the posterior {summary_measure} was {estimate} ({credible_level}% credible interval: {credible_lower}, {credible_upper}). The posterior probability of {named_hypothesis} was {posterior_probability}, as reported in {source_analysis}; {recorded_decision_if_any} (Table {table}; SAP {sap_reference}).' },
  { id: 'ae-frequency', use: '§12.2.1, §12.2.2, synopsis', pattern: 'Treatment-emergent adverse events (TEAEs) were reported by {n_a} ({pct_a}%) patients in the {arm_a} group and {n_b} ({pct_b}%) in the {arm_b} group (Table {table}). The most common TEAEs (reported by at least {threshold}% of patients in any group) were {preferred_term} ({n_a_pt} [{pct_a_pt}%] vs {n_b_pt} [{pct_b_pt}%]) and …' },
  { id: 'exposure-adjusted', use: '§12.2.3', pattern: 'The exposure-adjusted incidence rate of {preferred_term} was {rate_a} per {per} patient-years with {arm_a} and {rate_b} per {per} patient-years with {arm_b} (Table {table}).' },
  { id: 'sae-death', use: '§12.3.1, §12.3.3', pattern: '{n_deaths} patients died during the study ({arm_a}: {n_a}; {arm_b}: {n_b}); {n_related} of these deaths {was_were} considered by the investigator to be related to study drug (Listing {listing}).' },
  { id: 'lab-shift', use: '§12.4.2.2', pattern: 'For {parameter}, {n_a} ({pct_a}%) patients in the {arm_a} group shifted from {baseline_category} at baseline to {worst_category} post-baseline, compared with {n_b} ({pct_b}%) in the {arm_b} group (Table {table}).' },
  { id: 'narrative-opener', use: '§12.3.2, §14.3.3', pattern: 'Patient {patient_id}, a {age}-year-old {sex} with {condition} and a history of {relevant_history}, received {dose} {treatment} from Study Day {start_day}. On Study Day {onset_day}, the patient experienced {event} (MedDRA PT: {preferred_term}; {grade_scale} Grade {grade}), which was {seriousness}. Study drug was {action_taken}. The event {outcome} on Study Day {end_day}. The investigator considered the event {relatedness} to study drug.' },
  { id: 'conclusion', use: '§11.4.7, §12.6, §13', pattern: 'In {population}, {treatment} {verb_calibrated_to_evidence} {finding} on {endpoint} (§11.4.1). The safety profile was characterised by {most_common_events}; {key_risk} occurred in {n} ({pct}%) patients (§12.2).' },
]);

export interface CsrTerminologyStandard {
  id: 'meddra' | 'ctcae' | 'daids' | 'fda-vaccine-toxicity' | 'whodd' | 'cdisc';
  name: string;
  rule: string;
}

/** The dictionaries and scales a CSR writer must name and use correctly. */
export const CSR_TERMINOLOGY: readonly CsrTerminologyStandard[] = Object.freeze([
  { id: 'meddra', name: 'MedDRA', rule: 'State the version used for coding. Tables show system organ class (primary SOC) and preferred term; the patient listing (16.2.7) also shows the investigator\'s verbatim term. Write PTs and SOCs exactly as coded, initial capital ("Nausea", "Gastrointestinal disorders"). Grouped searches use SMQs, FDA Medical Queries (OCMQ) or a sponsor grouping that is named and defined; never invent a grouping in the text.' },
  { id: 'ctcae', name: 'NCI CTCAE', rule: 'Name the version (for example v5.0) and use "Grade 1–5" with capital G; Grade 5 is death. "Severe" is not "serious": severity (grade) and seriousness (the regulatory criteria) are reported separately. CTCAE terms are MedDRA lowest-level terms; report them at PT level in tables unless the SAP says otherwise.' },
  { id: 'daids', name: 'DAIDS AE Grading Table', rule: 'For HIV and many infectious-disease studies; name the version. Laboratory grades from DAIDS are not interchangeable with CTCAE grades, so say which scale each table uses.' },
  { id: 'fda-vaccine-toxicity', name: 'FDA Toxicity Grading Scale for Healthy Adult and Adolescent Volunteers in Preventive Vaccine Clinical Trials (2007)', rule: 'For solicited local and systemic reactions in vaccine studies. Report solicited reactions by the collection window the protocol set (for example days 1–7 after each dose), separately from unsolicited adverse events.' },
  { id: 'whodd', name: 'WHODrug Global (WHO Drug Dictionary)', rule: 'State the version; report prior and concomitant medications by ATC class and preferred name; define "prior" and "concomitant" by their dates relative to first dose, as the SAP does.' },
  { id: 'cdisc', name: 'CDISC SDTM / ADaM', rule: 'The analysis-set flags, treatment variables and dataset names in the text match define.xml (ADSL population flags, TRT01P/TRT01A, ADAE TRTEMFL). Do not paste variable names into prose; name the analysis set and the variable\'s meaning, with the dataset in the table footnote.' },
]);

// ── Per-heading rule vocabulary, shared by csr-e3-sections-*.ts ─────────────

/** Short per-heading writing rules reused across headings. */
export const W = Object.freeze({
  fromConductRecords: CONDUCT_SOURCE_RULE,
  pastConduct: 'Past tense for what was planned and done ("The protocol specified", "Patients were assigned").',
  presentDocument: 'Present tense for what this report and its appendices contain ("Appendix 16.1.1 contains").',
  noFigures: 'Introduce the subsections in one or two sentences; the content belongs under them.',
  fromProtocol: 'Restate the protocol and SAP, do not paraphrase them loosely; cite the version and date that governed the analysis.',
  slotsOnly: 'Every figure comes from the cited §14 output or the evidence pack; a figure with no source is written as awaited, never estimated.',
  estimateFirst: 'Estimate and the planned confidence or credible interval first; name the analysis set, hypothesis, decision criterion and output. Include a p-value only if that analysis planned one; do not apply a superiority decision to non-inferiority, equivalence or Bayesian outputs.',
  calibrated: 'Calibrate verbs to the evidence: "demonstrated" only for a pre-specified, multiplicity-controlled result; "nominal", "exploratory" or "post hoc" as the plan classifies it.',
  investigatorCausality: 'Relatedness is reported as the investigator\'s (and separately the sponsor\'s) assessment, never as the writer\'s finding.',
  presentConclusion: 'Present tense for conclusions; each conclusion points back to the result it rests on and is no stronger than it.',
});
