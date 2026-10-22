/**
 * Safety skills: pharmacovigilance from IND to postmarket (case assessment,
 * aggregate reports, signal management, risk management, benefit-risk) and
 * device and IVD vigilance. Clocks, classifications and scores come from the
 * deterministic engines; IND safety reports and ICSR transmission are not sent
 * from the platform at launch (decision P-32).
 *
 * @module server/services/ana/skills/library/safety
 */

import { skill, type LibrarySkillSource } from '../types.js';

export const SAFETY_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'safety',
    name: 'Safety and pharmacovigilance',
    description:
      'The safety lifecycle from first-in-human to postmarket for drugs, biologics, devices and IVDs: what is collected, assessed and reported at each stage, how a pharmacovigilance system is set up, which method applies, and the platform boundary that IND safety reports and ICSR transmission are not sent from the platform at launch.',
    disciplines: ['safety'],
    useCases: ['strategy', 'review', 'gap-analysis'],
    documentTypes: ['EU_PSMF'],
    triggers: [
      'pharmacovigilance',
      'drug safety',
      'safety database',
      'pv system',
      'qppv',
      'psmf',
      'pharmacovigilance system master file',
      'safety surveillance',
      'postmarketing safety',
      'post-marketing safety',
      'safety reporting',
      'ind safety reporting',
      'icsr transmission',
      'pharmacovigilance plan',
      'ich e2e',
      'safety lifecycle',
    ],
    tools: [
      'design_pv_system',
      'advise_pharmacovigilance',
      'lookup_ich_guideline',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E2A' },
      { kind: 'ich', id: 'E2D(R1)' },
      { kind: 'ich', id: 'E2E' },
    ],
    instructions: `
## When this applies
Questions about drug, biologic or device safety across the lifecycle: what must be collected, assessed and reported during development and after approval, how a pharmacovigilance system is set up, and which safety method applies. The sub-skills carry each method.

## Method
1. Establish the product and the stage: investigational (an IND or a clinical trial application) or marketed; the regions; the product type (drug, biologic, vaccine, device, IVD, combination product); and who holds the obligations (sponsor, marketing-authorisation holder, manufacturer). The obligations differ with each.
2. Map the question to the lifecycle and to the method that answers it:
   - individual cases: seriousness, expectedness, causality, coding, narratives and expedited reporting (case assessment);
   - periodic reports: the DSUR in development; the PBRER or PSUR and, in the US, the PADER after approval (aggregate reports);
   - signals: detection, validation, prioritisation and assessment (signal management);
   - risk management: the EU RMP and the US REMS (risk management plans);
   - benefit-risk assessment and its communication (benefit-risk);
   - devices and IVDs: medical device reporting, EU vigilance, post-market surveillance and recalls (device vigilance).
3. For a pharmacovigilance system, run \`design_pv_system\` for the region and stage. It returns the required components (for example a QPPV and a PSMF in the EU, a validated safety database with E2B(R3) capability, MedDRA coding, literature monitoring, signal management, periodic and expedited reporting, risk minimisation, audit and inspection readiness) and the ICH E2E pharmacovigilance plan. Report required and optional components exactly as returned.
4. For what a deliverable is for, its cadence and its common pitfalls, \`advise_pharmacovigilance\` covers the DSUR, the PBRER, expedited ICSR and SUSAR reporting, and the EU signal management cycle. Clocks, cadences and thresholds come from the tools named in each sub-skill, never from memory.
5. State the platform's launch boundary whenever it is relevant: IND safety reports under 21 CFR 312.32 and ICSR transmission (E2B(R3) to FDA or EudraVigilance) are not sent from the platform at launch. AnA can help classify a case and draft its narrative and report content; submission happens outside the platform, through the sponsor's safety system and gateway.
6. Confirm guideline details with \`lookup_ich_guideline\` (E2A, E2B(R3), E2C(R2), E2D(R1), E2E, E2F). Refer to an FDA guidance by its topic only, run \`lookup_fda_guidance\`, and say it needs confirming unless the lookup or the person supplied it.

## Before answering
- Every clock, cadence, threshold and classification came from a named tool in this turn, and the answer says which.
- The stage, product type and region the answer assumes are stated.
- No transmission, filing or submission is described as done by the platform.
- Medical judgments (seriousness, causality, signal conclusions) are marked as the assessor's.

## Not AnA's to decide
- Seriousness, expectedness and causality for a case are assessed by the investigator and the sponsor's qualified safety physician; AnA proposes and records reasons.
- Whether a signal is confirmed, and what regulatory action follows, are decisions for the sponsor's safety governance and the agency.
- Reports are signed and submitted by the sponsor's responsible persons (in the EU, under the QPPV's oversight); AnA never signs, approves or transmits.
`,
  }),

  skill({
    key: 'safety.case-assessment',
    name: 'Individual case safety assessment',
    description:
      'Assessing an individual adverse event case from a trial or the postmarketing setting: case validity, seriousness, expectedness against the reference safety information, causality, MedDRA coding, the expedited reporting classification and the case narrative.',
    disciplines: ['safety', 'clinical'],
    useCases: ['analysis', 'drafting', 'review'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_ICSR', 'US_IND_SR'],
    triggers: [
      'icsr',
      'individual case',
      'case assessment',
      'causality assessment',
      'causality',
      'seriousness',
      'serious adverse event',
      'sae',
      'susar',
      'expectedness',
      'reference safety information',
      'meddra',
      'meddra coding',
      'safety narrative',
      'patient narrative',
      'expedited reporting',
      'ind safety report',
      '15-day report',
      '7-day report',
      'naranjo',
      'who-umc',
      'suspected adverse reaction',
    ],
    tools: [
      'assess_pv_causality',
      'code_meddra',
      'classify_expedited_reporting',
      'draft_safety_narrative',
    ],
    references: [
      { kind: 'ich', id: 'E2A' },
      { kind: 'ich', id: 'E2B(R3)' },
      { kind: 'ich', id: 'E2D(R1)' },
    ],
    instructions: `
## When this applies
Assessing an individual adverse event case from a clinical trial or the postmarketing setting: whether it is a valid case, its seriousness, expectedness and causality, its coding, its expedited reporting classification and its narrative.

## Method
1. Establish that the case is valid: an identifiable patient, an identifiable reporter, a suspect product and an adverse event. Without all four it is not yet a reportable case; record what is missing and follow up. Establish the source (clinical trial, spontaneous, solicited, literature) and the date the sponsor first received the minimum information, because reporting clocks start from it.
2. Seriousness is a regulatory classification against defined criteria: death, a life-threatening event, inpatient hospitalisation or its prolongation, persistent or significant disability or incapacity, a congenital anomaly or birth defect, or an important medical event by medical judgment. It is not severity. Record which criterion applies and whose judgment it is.
3. Expectedness is judged against the reference safety information in force at the time: the Investigator's Brochure (its reference safety information section) in development, the approved labeling or SmPC after approval. An event more severe or more specific than the one listed is unexpected.
4. Causality: record the investigator's and the sponsor's assessments separately, each with reasons. A sponsor that disagrees with an investigator's assessment documents why; how the two combine for expedited reporting differs by region (in the EU the sponsor does not downgrade the investigator's assessment). Run \`assess_pv_causality\` with the temporal relationship, dechallenge and rechallenge, alternative causes and pharmacological plausibility. It returns the WHO-UMC category and the Naranjo score with its breakdown; report both and any divergence. The tool supports the physician's judgment; it does not replace it.
5. Code each event with \`code_meddra\` to the preferred term. MedDRA is a licensed dictionary: when no licence is configured the tool returns license_required and no code. Say so, and never invent a term or code.
6. Classify the reporting obligation with \`classify_expedited_reporting\` from seriousness, expectedness, relatedness and stage. It returns whether the case is a SUSAR, the obligations for FDA and the EU, the report type, destination, citation and the fastest clock. Report them verbatim, and ask for any criterion not stated rather than assuming it. In the US, IND safety reporting is governed by 21 CFR 312.32, and postmarketing reporting by 21 CFR 314.80 for drugs and 21 CFR 600.80 for biologics. Under 312.32 some events become reportable only on aggregate review (for example an anticipated event occurring more often on the drug); that judgment belongs to the sponsor's safety review.
7. Draft the narrative with \`draft_safety_narrative\` from the structured case facts: relevant history and concomitant medication, exposure, the event's course, action taken, dechallenge and rechallenge, outcome and causality. It drafts only from the facts supplied and lists missing fields; ask for them instead of filling them in.
8. Platform boundary: IND safety reports and E2B(R3) ICSR transmission are not sent from the platform at launch. The classification and draft are inputs to the sponsor's safety system, where the report is finalised and submitted.

## Pitfalls reviewers raise
- Severity confused with seriousness.
- Expectedness judged against a version of the reference safety information not in force at the time of the event.
- A causality assessment downgraded by the sponsor without a documented reason.
- Narratives missing dechallenge, rechallenge or concomitant medication.
- The clock started from the date of medical review rather than first receipt of the minimum information.

## Before answering
- Seriousness, expectedness and causality are each stated with their basis and their assessor.
- Clocks, report types and destinations are quoted from the tool output.
- Missing case facts are listed, not supplied.
- The answer does not imply the platform will transmit the report.

## Not AnA's to decide
- The medical assessments are the investigator's and the sponsor's safety physician's.
- Whether and when to submit is the sponsor's decision, made in its safety system; AnA never submits or signs.
`,
  }),

  skill({
    key: 'safety.aggregate-reports',
    name: 'Aggregate safety reports (DSUR, PBRER, PADER)',
    description:
      'Planning, structuring and reviewing periodic aggregate safety reports: which reports apply, their cadence and data lock points, the DSUR under ICH E2F, the PBRER or PSUR under ICH E2C(R2), and the US PADER at method level, with the data each section needs.',
    disciplines: ['safety', 'medical-writing'],
    useCases: ['drafting', 'review', 'lifecycle-change'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_DSUR', 'EU_PSUR', 'US_PADER'],
    triggers: [
      'dsur',
      'development safety update report',
      'pbrer',
      'psur',
      'periodic benefit-risk evaluation report',
      'periodic safety update report',
      'pader',
      'periodic adverse drug experience report',
      'aggregate safety report',
      'aggregate report',
      'data lock point',
      'dibd',
      'development international birth date',
      'international birth date',
      'eurd list',
      'summary tabulations',
      'cumulative exposure',
      'e2f',
      'e2c(r2)',
    ],
    tools: [
      'plan_aggregate_safety_report',
      'generate_dsur_structure',
      'generate_psur_structure',
      'advise_pharmacovigilance',
      'check_numerical_integrity',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E2F' },
      { kind: 'ich', id: 'E2C(R2)' },
      { kind: 'standard', id: 'cfr_314' },
    ],
    instructions: `
## When this applies
Planning, structuring or reviewing periodic aggregate safety reports: the DSUR during development, the PBRER (the format of the EU PSUR) after approval, and the US PADER at method level.

## Method
1. Establish which reports apply, with their cadence and data lock points, using \`plan_aggregate_safety_report\` with the lifecycle stage, marketing status and regions. Report each cadence, data-lock-point rule, submission clock and content outline as returned; never state a deadline from memory. Where it flags the option of a PBRER in place of a PADER, that is something the sponsor arranges with FDA; say so.
2. DSUR (ICH E2F). The reporting period is anchored on the development international birth date, and one DSUR normally covers the active substance across the sponsor's trials. Generate the section skeleton with \`generate_dsur_structure\`. The data the sections need: worldwide marketing status, actions taken for safety reasons, changes to the reference safety information, the inventory of ongoing and completed trials, interval and cumulative exposure, line listings and summary tabulations of serious adverse reactions, significant findings from trials and other sources, nonclinical and literature findings, the overall safety assessment and the summary of important risks. In the US a sponsor may use the DSUR to meet the IND annual report under 21 CFR 312.33; confirm FDA's current position with \`lookup_fda_guidance\` before stating it.
3. PBRER or PSUR (ICH E2C(R2)). The report is an evaluation of benefit-risk, not a listing. Generate the section skeleton with \`generate_psur_structure\`. The sections need: estimated exposure and patterns of use, summary tabulations, findings from clinical trials and non-interventional studies, literature, signals new, ongoing and closed in the interval, the signal and risk evaluation, the benefit evaluation, and the integrated benefit-risk analysis for the authorised indications. In the EU the PSUR follows GVP Module VII, and where the EURD list sets a frequency it governs; the cadence comes from \`plan_aggregate_safety_report\`.
4. PADER (US; 21 CFR 314.80 for drugs, 21 CFR 600.80 for biologics): a narrative summary and analysis of the adverse experience information for the interval, including the 15-day reports submitted, and the actions taken since the last report. Its cadence comes from \`plan_aggregate_safety_report\`.
5. Use \`advise_pharmacovigilance\` for a deliverable's purpose and common pitfalls when scaffolding or checking a report.
6. The numbers in a report (exposure, case counts, tabulations) come from the sponsor's safety database and clinical data at the data lock point. AnA has no launch tool that builds line listings or tabulations from a safety database; ask for them. After drafting, run \`check_numerical_integrity\` to find the same quantity stated with different values, and adjudicate each candidate.

## Pitfalls reviewers raise
- Interval and cumulative data mixed, or exposure estimated without a stated method.
- Changes to the reference safety information during the period not described.
- Signals listed without evaluation, or closed without reasons.
- A benefit-risk conclusion that the preceding sections do not support.
- A data lock point applied inconsistently across sections.

## Before answering
- The reports, cadences and clocks quoted came from \`plan_aggregate_safety_report\` in this turn.
- Each section's data source is named, and figures not yet supplied are left open.
- Regional differences (EU, US) are stated where they apply.

## Not AnA's to decide
- The content and conclusions of a periodic report are the sponsor's, under its safety physician (and in the EU, the QPPV's oversight).
- Waivers, alternative formats and submission dates agreed with an agency are the sponsor's arrangements with that agency.
- AnA does not sign or submit a periodic report.
`,
  }),

  skill({
    key: 'safety.signal-management',
    name: 'Safety signal management',
    description:
      'Detecting, validating, prioritising and assessing safety signals from spontaneous reports, trials and literature: disproportionality computed by the engines, the limits of spontaneous-report data, validation against cases, prioritisation and documented assessment.',
    disciplines: ['safety'],
    useCases: ['analysis', 'review', 'drafting'],
    documentTypes: ['ICH_SIGNAL'],
    triggers: [
      'safety signal',
      'signal detection',
      'signal management',
      'signal validation',
      'signal assessment',
      'signal prioritisation',
      'signal prioritization',
      'disproportionality',
      'prr',
      'ror',
      'ebgm',
      'eb05',
      'bcpnn',
      'faers',
      'eudravigilance',
      'emerging safety issue',
      'signal of disproportionate reporting',
      'gvp module ix',
    ],
    tools: [
      'advise_pharmacovigilance',
      'screen_signal_panel',
      'detect_safety_signal',
      'search_drug_adverse_events',
      'search_device_adverse_events',
      'assess_signal_priority',
    ],
    references: [
      { kind: 'ich', id: 'E2C(R2)' },
      { kind: 'ich', id: 'E2E' },
    ],
    instructions: `
## When this applies
Detecting, validating, prioritising and assessing safety signals from spontaneous reports, clinical data, literature or aggregate review, and documenting the signal assessment.

## Method
1. Follow the signal management cycle: detection, validation, analysis and prioritisation, assessment, recommendation for action, and exchange of information. EU GVP Module IX describes it; \`advise_pharmacovigilance\` covers the cycle's steps and pitfalls.
2. Detection. Establish the data source, its date range and the query. For a spontaneous-report database, disproportionality is computed by the engines from the 2x2 counts (reports of the event with the product, other events with the product, the event with all other products, other events with all other products):
   - \`screen_signal_panel\` runs the frequentist PRR and ROR criterion and the Bayesian shrinkage methods (the BCPNN information component and the empirical Bayes geometric mean) and consolidates them into a priority tier with notes where they diverge; prefer it when counts are small.
   - \`detect_safety_signal\` decides whether a signal of disproportionate reporting is present on PRR with chi-squared, ROR and an EB05 approximation, with warnings for small counts and zero cells.
   Report each measure, its interval and the criterion applied, verbatim. A signal of disproportionate reporting is a statistical association that needs validation; it is not evidence of causation.
3. Context from FAERS or MAUDE: \`search_drug_adverse_events\` and \`search_device_adverse_events\` return report counts, serious events and top reactions from openFDA. Spontaneous reports are not incidence: reporting is voluntary, incomplete, duplicated and influenced by publicity and time on market, and counts cannot be read as rates. Use them as context, or as the source of 2x2 counts only with the query and date stated.
4. Validation. Review the cases behind the signal: clinical plausibility, temporal relationship, dechallenge and rechallenge, confounding by indication or concomitant medication, duplicates, and whether the association is already in the reference safety information.
5. Prioritisation. For a validated signal, \`assess_signal_priority\` scores strength of evidence, seriousness, novelty, public-health impact and preventability, with modifiers for vulnerable populations and designated medical events, and returns a tier and an action timeline. Report the tier and timeline as returned.
6. Assessment. Bring together the case series, clinical trial data, literature, exposure, biological plausibility and any epidemiological evidence. Conclude whether the signal is refuted, confirmed as a risk, or needs more information, and propose actions (labeling change, risk minimisation, further study) for the sponsor's safety governance to decide.
7. Record each signal with the dates of detection, validation, decisions and outcome. Signals open and closed in the period feed the PBRER and the DSUR (the aggregate-reports skill).

## Pitfalls reviewers raise
- Disproportionality presented as a risk estimate or as causal evidence.
- Small-count signals neither shrunk nor flagged.
- Validation not documented, or signals closed with no rationale.
- Masking by heavily reported products in the comparison background not considered.

## Before answering
- Each statistic names the engine, the counts and the data source and date behind it.
- Spontaneous-report figures are described as reporting, not incidence.
- The stage of the cycle the answer addresses is stated.

## Not AnA's to decide
- Whether a signal is validated, confirmed or closed is the sponsor's safety governance decision.
- Regulatory action on a signal (labeling, restrictions, communication) is decided with the agency.
`,
  }),

  skill({
    key: 'safety.risk-management-plans',
    name: 'Risk management plans and REMS',
    description:
      'Writing or reviewing an EU risk management plan under GVP Module V, designing or assessing a US REMS, choosing routine and additional risk minimisation measures, and planning how their effectiveness is evaluated.',
    disciplines: ['safety', 'regulatory-strategy'],
    useCases: ['drafting', 'review', 'strategy', 'lifecycle-change'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['EU_RMP', 'US_REMS'],
    triggers: [
      'risk management plan',
      'rmp',
      'rems',
      'etasu',
      'elements to assure safe use',
      'risk minimisation',
      'risk minimization',
      'additional risk minimisation',
      'safety specification',
      'important identified risk',
      'important potential risk',
      'safety concerns',
      'gvp module v',
      'rems assessment',
      'pregnancy prevention programme',
      'educational materials',
    ],
    tools: [
      'advise_risk_management',
      'design_pv_system',
      'design_rems',
      'lookup_fda_guidance',
      'lookup_ich_guideline',
    ],
    references: [
      { kind: 'ich', id: 'E2E' },
      {
        kind: 'record',
        id: 'shared/regulatory/lifecycle-obligations.ts',
        label: 'Lifecycle obligations: REMS assessments and other post-approval commitments',
      },
    ],
    instructions: `
## When this applies
Writing or reviewing an EU risk management plan (RMP), designing or assessing a US REMS, and choosing risk minimisation measures and how their effectiveness is measured.

## Method
1. Start from the safety concerns. Establish the important identified risks, important potential risks and missing information (EU) from the safety specification, and the serious risks a REMS would address (US). The pharmacovigilance plan and risk minimisation follow from these, not from a template. ICH E2E sets out the safety specification and pharmacovigilance plan that both systems build on; confirm its details with \`lookup_ich_guideline\`.
2. EU RMP. GVP Module V organises it in parts: product overview; the safety specification (with its modules on the epidemiology of the indication, nonclinical findings, clinical trial exposure, populations not studied, post-authorisation experience, and the identified and potential risks); the pharmacovigilance plan, including any additional pharmacovigilance activities; plans for post-authorisation efficacy studies; risk minimisation measures, routine and additional, with how their effectiveness will be evaluated; a summary for the public; and annexes. Use \`advise_risk_management\` for the components, when an RMP is required and common pitfalls, and \`design_pv_system\` for the pharmacovigilance plan and system obligations.
3. US REMS. Under section 505-1 of the FD&C Act, FDA can require a REMS when it is needed to ensure the benefits of a drug outweigh its risks. Its elements can include a Medication Guide or patient package insert, a communication plan, and elements to assure safe use (such as prescriber or pharmacy certification, dispensing only in certain settings, patient monitoring or enrolment) supported by an implementation system; the strategy also sets a timetable for submitting REMS assessments. Run \`design_rems\` with the signal type and severity; report the elements it proposes, and note the inputs it lists as not having shaped them.
4. Choose the least burdensome measure that addresses the risk: routine measures (labeling, pack size, legal status) before additional ones (educational materials, controlled access, pregnancy prevention programmes, registries). Each additional measure needs a stated objective and a plan to evaluate its effectiveness, with process indicators (reach, knowledge, behaviour) and outcome indicators (the frequency of the harm it targets).
5. Plan for the lifecycle. A REMS carries assessment obligations, and an RMP is updated as knowledge changes. The platform's lifecycle-obligations record models a REMS as an enforceable commitment evidenced by REMS assessments; the assessment timetable is the one set in the product's approved REMS, never a generic figure. For FDA's REMS guidance (assessments, modifications, format), refer to it by topic, run \`lookup_fda_guidance\`, and say it needs confirming unless the lookup or the person supplied it.

## Pitfalls reviewers raise
- Safety concerns that list every adverse reaction instead of the important risks.
- Additional risk minimisation proposed with no effectiveness evaluation.
- Missing information with no pharmacovigilance activity to address it.
- REMS goals written as activities rather than as the outcome sought.

## Before answering
- Each measure is tied to a named safety concern.
- REMS elements and proposals are quoted from the tool, with the inputs that did not shape them.
- EU and US terms are kept apart (an RMP is not a REMS).

## Not AnA's to decide
- Whether a REMS is required, and its final content, are FDA's determination; the content of an RMP is agreed with the EU assessors.
- The sponsor decides what it proposes; AnA drafts and checks, and does not sign or submit.
`,
  }),

  skill({
    key: 'safety.benefit-risk',
    name: 'Structured benefit-risk assessment',
    description:
      'Structuring, writing or reviewing a benefit-risk assessment: the decision frame, the FDA framework for drugs and biologics, key benefits and risks in a value tree, an effects table, uncertainty, an integrated judgment as a decision aid, and communication to each audience.',
    disciplines: ['safety', 'clinical', 'regulatory-strategy'],
    useCases: ['drafting', 'review', 'strategy', 'agency-interaction'],
    documentTypes: ['ICH_BENEFIT_RISK'],
    triggers: [
      'benefit-risk',
      'benefit risk',
      'benefit/risk',
      'risk-benefit',
      'benefit-risk framework',
      'benefit-risk assessment',
      'effects table',
      'value tree',
      'mcda',
      'proact-url',
      'brat',
      'favourable effects',
      'unfavourable effects',
      'benefits and risks conclusions',
      '2.5.6',
      'swing weighting',
    ],
    tools: [
      'structure_benefit_risk_framework',
      'design_value_tree',
      'build_effects_table',
      'assess_br_uncertainty',
      'assess_benefit_risk_balance',
      'plan_br_communication',
      'lookup_fda_guidance',
      'lookup_ich_guideline',
    ],
    references: [
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'ich', id: 'E2C(R2)' },
    ],
    instructions: `
## When this applies
Structuring, writing or reviewing a benefit-risk assessment: the Clinical Overview's benefits and risks conclusions (Module 2.5.6), the integrated benefit-risk analysis of a PBRER, an advisory committee briefing, or a sponsor's internal decision.

## Method
1. Establish the decision: the product, the indication and population, the comparator or current standard of care, and who decides. Benefit-risk is assessed for a defined indication, not for a product in general.
2. Frame it in the decision-maker's structure. For an FDA drug or biologic application, \`structure_benefit_risk_framework\` builds the framework's four rows (analysis of condition, current treatment options, benefit, risk and risk management) with evidence, uncertainties and conclusions. For a device, FDA's benefit-risk factors for device decisions are a separate guidance topic; refer to it by topic, run \`lookup_fda_guidance\`, and say it needs confirming unless supplied.
3. Select the key benefits and key risks: those that drive the decision, each defined by an outcome measure. \`design_value_tree\` decomposes the decision into benefit and risk criteria (PrOACT-URL, BRAT) and recommends a weighting approach. Weights express the decision-maker's values; they are elicited, never assumed.
4. Tabulate effects with \`build_effects_table\`: each favourable and unfavourable effect with treatment and comparator values, the difference, its interval, the uncertainty and the source, all taken from the study results. The tool flags intervals that include no effect; describe those effects as not established.
5. Characterise uncertainty with \`assess_br_uncertainty\`: data quality, extrapolation, rare serious events, surrogate endpoints, missing data, subgroup heterogeneity, long-term effects. Report how robust it judges the conclusion and what would change it, and carry residual uncertainty into the labeling and the risk management plan.
6. When an integrated judgment is asked for, \`assess_benefit_risk_balance\` returns a weighted balance, its drivers and a verdict. It is a structured decision aid built on the inputs given: present it with its drivers and inputs, never as a regulatory conclusion.
7. Plan communication with \`plan_br_communication\`: framing and formats for each audience (effects table, forest plot, icon arrays) and one core message that every document restates without overstating benefit or softening risk.
8. Write the conclusion so a reader can trace it: the condition and the unmet need, each key benefit and risk with its magnitude and uncertainty, how risk management changes the balance, and the population in which the balance is favourable. ICH M4E(R2) sets the Clinical Overview's structure; confirm it with \`lookup_ich_guideline\`.

## Pitfalls reviewers raise
- Benefits expressed only as relative effects while risks are given as absolute rates.
- Uncertainty acknowledged in general terms but not tied to specific effects.
- A favourable conclusion drawn for a broader population than the evidence supports.
- Benefit-risk text inconsistent with the efficacy and safety summaries.

## Before answering
- Every effect size and interval comes from the study results or a named tool output.
- Weights are attributed to whoever set them.
- Any verdict from a tool is presented as a decision aid with its drivers.

## Not AnA's to decide
- The benefit-risk conclusion in a filing is the sponsor's; whether the product is approvable is the agency's determination.
- The values that weight benefits against risks belong to the decision-maker, not to AnA.
`,
  }),

  skill({
    key: 'safety.device-vigilance',
    name: 'Device and IVD vigilance',
    description:
      'Device and IVD postmarket safety: complaint evaluation for reportability, medical device reporting under 21 CFR Part 803, EU MDR and IVDR vigilance and post-market surveillance at method level, field safety notices, corrections, removals and recalls.',
    disciplines: ['safety', 'quality-systems'],
    useCases: ['analysis', 'drafting', 'review', 'lifecycle-change'],
    segments: ['device', 'ivd'],
    documentTypes: ['US_MDR_REPORT', 'US_RECALL', 'EU_FSCA', 'EU_IVD_VIGILANCE'],
    triggers: [
      'medical device report',
      'medical device reporting',
      'mdr reportable',
      'mdr reportability',
      'emdr',
      'part 803',
      '21 cfr 803',
      'malfunction report',
      'serious injury',
      'become aware',
      'vigilance',
      'serious incident',
      'fsca',
      'field safety notice',
      'field safety corrective action',
      'trend reporting',
      'device recall',
      'correction and removal',
      'part 806',
      'maude',
      'complaint handling',
      'post-market surveillance',
      'postmarket surveillance',
      'pms plan',
    ],
    tools: [
      'assess_mdr_reportability',
      'build_postmarket_report',
      'search_device_adverse_events',
      'search_device_recalls',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'currency-fact', id: 'eu-eudamed-mandatory' },
      {
        kind: 'record',
        id: 'shared/regulatory/qmsr-crosswalk.ts',
        label: 'QMSR crosswalk: complaint handling and reporting under ISO 13485:2016 clause 8.2',
      },
    ],
    instructions: `
## When this applies
Device and IVD postmarket safety: whether an event is reportable to FDA under medical device reporting or to EU authorities under MDR or IVDR vigilance, drafting those reports and field safety notices, trend reporting, corrections, removals and recalls, and post-market surveillance planning.

## Method
1. Establish the device, its class in each market, the reporter's role (manufacturer, importer, user facility, authorised representative), the country where the event occurred, and the date the firm became aware of information that reasonably suggests a reportable event. Clocks run from awareness.
2. Complaint evaluation comes first. Under the QMSR, in force since 2026-02-02, complaint handling follows ISO 13485:2016 clause 8.2 through 21 CFR 820.10, and complaint records follow 21 CFR 820.35; each complaint is evaluated for reportability and the decision recorded. Cite 21 CFR 820.198 only as the former provision.
3. Reportability: run \`assess_mdr_reportability\` with the harm level, whether a malfunction could cause or contribute to death or serious injury if it recurred, the country, whether a correction or removal is anticipated, and whether a trend threshold is crossed. It returns whether the event is reportable under 21 CFR Part 803 and as an EU serious incident, whether a Part 806 correction or removal report applies, the FDA report type, and the EU severity and clock. Report them verbatim; the tool computes the trigger, and the manufacturer decides and files.
4. Draft the report with \`build_postmarket_report\`: an eMDR (US), an EU manufacturer incident report, or a field safety notice. It returns a structured payload, or the required fields that are missing; ask for those rather than filling them. The tool drafts; filing happens through the manufacturer's own reporting channels, by its responsible person. A device PSUR is authored as a program document, not with this tool.
5. Context and trends: \`search_device_adverse_events\` returns MAUDE reports by product code, device or manufacturer, and \`search_device_recalls\` returns FDA recalls with their classification. MAUDE reports are not incidence and may be incomplete or duplicated; use them for context and for comparable devices, with the query stated.
6. Corrections, removals and recalls: in the US, recalls are handled under 21 CFR Part 7 and corrections and removals are reported under Part 806; FDA classifies the recall. In the EU, a field safety corrective action is reported to the authorities and communicated to users by a field safety notice.
7. EU post-market surveillance: the MDR and IVDR require a post-market surveillance system and plan proportionate to the risk class, feeding the risk management file (ISO 14971), the clinical or performance evaluation, and post-market clinical or performance follow-up. Establish the class first: it decides whether a post-market surveillance report or a PSUR is required, and how often. The currency register (fact eu-eudamed-mandatory) records which EUDAMED modules are mandatory and from when; confirm the current reporting route before telling a manufacturer where a vigilance report goes.
8. FDA's guidance on medical device reporting for manufacturers is the US reference; refer to it by topic, run \`lookup_fda_guidance\`, and say it needs confirming unless the lookup or the person supplied it.

## Pitfalls reviewers raise
- Complaints closed without a documented reportability decision.
- An awareness date later than the first information the firm held.
- Malfunctions not reported because no one was harmed this time.
- Trend reporting not defined in the post-market surveillance plan.
- Field actions taken without the corresponding report.

## Before answering
- Reportability, report type and clocks are quoted from the tool output.
- The market, class and reporter role assumed are stated.
- No report is described as filed by the platform.

## Not AnA's to decide
- The reportability decision and the report are the manufacturer's, signed by its responsible person.
- Recall classification is FDA's; EU authorities assess vigilance reports and field actions.
`,
  }),
];
