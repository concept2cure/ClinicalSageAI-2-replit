/**
 * Biostatistics skills: solver-first methods for sizing, estimands, the SAP,
 * multiplicity, adaptive and interim designs, missing data, Bayesian borrowing,
 * time-to-event and diagnostic-accuracy statistics, study data standards and
 * the reporting of results. Every figure comes from a deterministic engine.
 *
 * @module server/services/ana/skills/library/biostatistics
 */

import { skill, type LibrarySkillSource } from '../types.js';

const DESIGN_GATES = {
  kind: 'record',
  id: 'server/services/study-design/design-gates.ts',
  label: 'Study-design gates: estimands, endpoints, framework, power, multiplicity, populations, methods, missing data, interim',
} as const;

export const BIOSTATISTICS_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'biostatistics',
    name: 'Biostatistics',
    description:
      'The working rules for any statistical question about a clinical or performance study: establish the design first, take every number from a deterministic solver, insist on pre-specification, and narrate results without inventing or rounding figures. Each statistical method has its own skill under this one.',
    disciplines: ['biostatistics'],
    useCases: ['study-design', 'analysis', 'review', 'drafting'],
    triggers: [
      'biostatistics',
      'biostatistician',
      'statistical methods',
      'statistical analysis',
      'statistical significance',
      'p-value',
      'confidence interval',
      'type i error',
      'hypothesis testing',
      'ich e9',
      'statistical principles',
      'statistical review',
      'superiority trial',
      'non-inferiority',
      'equivalence trial',
      'statistical defensibility',
    ],
    tools: [
      'bind_protocol_to_study_design',
      'review_protocol_design_gates',
      'assess_statistical_defensibility',
      'compare_statistical_scenarios',
      'narrate_statistical_result',
      'lookup_ich_guideline',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'standard', id: 'ich_e_efficacy' },
      DESIGN_GATES,
    ],
    instructions: `
## When this applies
Any statistical question about a clinical or performance study: design, sizing, estimands, the SAP, interim and adaptive features, analysis of results, or how a statistical finding is written up. The sub-skills carry the method for each kind of work; this one sets the rules they share.

## Method
1. Establish the study before any statistics: the objective, the design (parallel, crossover, single-arm, group sequential), the inferential frame (superiority, non-inferiority or equivalence), the primary endpoint and its type, and the comparator. Read them from the program's study design record. The review engines read a study design bound to a protocol document; when nothing is bound and the person wants the protocol checked, say the engines cannot run and offer \`bind_protocol_to_study_design\`, a governed write with a reason, done only on the person's instruction.
2. Treat every number as a solver output. Sample size, power, alpha allocation, boundaries, adjusted p-values, effect estimates and their intervals come from the platform's deterministic engines, each named in the sub-skill for that work. Pass the sponsor's stated assumptions. When an engine applies a default (alpha, power, dropout, allocation), say which default it applied and ask whether it is the sponsor's choice. Never compute, round or estimate a figure yourself, and never fill an input the sponsor has not given.
3. Insist on pre-specification. The primary analysis, its estimand, the handling of intercurrent events and missing data, the multiplicity strategy and any interim or adaptive rule are fixed in the protocol and SAP before unblinding. A choice made after seeing the data is described as post hoc, whatever its merit.
4. Check the design as a reviewer would. Run \`review_protocol_design_gates\` on a bound protocol for the design gates' findings, and \`assess_statistical_defensibility\` for the engine's defensibility judgment on a set of design parameters. Report verdicts, severities and scores verbatim; do not re-rank, drop or total them.
5. When the person weighs alternatives (power, effect assumptions, allocation, inferential frame), run \`compare_statistical_scenarios\` rather than reasoning about the trade-off in prose.
6. When writing up a result, use \`narrate_statistical_result\` with the effect measure, estimate, interval and p-value from the analysis output, so the wording follows the interval, separates statistical from clinical significance and marks exploratory or multiplicity-uncontrolled results.
7. Cite the basis of the method. ICH E9 and its E9(R1) addendum are the shared foundation; confirm any other ICH guideline with \`lookup_ich_guideline\`. Refer to an FDA guidance by its topic only, run \`lookup_fda_guidance\` for what the currency register holds, and say the guidance needs confirming unless the lookup or the person supplied it.

## Before answering
- Every figure in the answer came from a named tool call in this turn or from the program's own records, and the answer says which.
- Defaults the engine applied are labelled as defaults, not presented as the sponsor's assumptions.
- A tool that failed, returned a validation error or did not run is reported as such, and the gap is left open.
- The inferential frame and the primary endpoint are stated alongside any sizing or verdict.
- Exploratory, post hoc and unadjusted results are labelled as such.

## Not AnA's to decide
- The assumptions (effect size, variability, dropout, margins) and the final SAP belong to the sponsor's statistician; AnA proposes and checks.
- Whether an agency accepts a design, margin, estimand or borrowing approach is the agency's determination, reached in its review or a meeting.
- AnA does not sign, approve or finalise a SAP or a statistical report.
`,
  }),

  skill({
    key: 'biostatistics.sample-size',
    name: 'Sample size and power',
    description:
      'Sizing a trial or performance study and checking a sample-size justification: the inputs to establish, which deterministic solver sizes which design, how dropout and effect uncertainty change the answer, and how scenarios and assurance are compared.',
    disciplines: ['biostatistics', 'clinical'],
    useCases: ['study-design', 'review', 'drafting'],
    triggers: [
      'sample size',
      'sample size calculation',
      'sample size justification',
      'power calculation',
      'statistical power',
      'power analysis',
      'underpowered',
      'how many patients',
      'how many subjects',
      'number of subjects',
      'effect size',
      'dropout rate',
      'allocation ratio',
      'non-inferiority margin',
      'equivalence margin',
      'assurance',
      'probability of success',
    ],
    tools: [
      'compute_sample_size',
      'estimate_sample_size',
      'design_mmrm',
      'review_mmrm_sizing',
      'analyze_missing_data_impact',
      'compare_statistical_scenarios',
      'compute_assurance',
      'assess_statistical_defensibility',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'ich', id: 'E10' },
      { kind: 'standard', id: 'ich_e_efficacy' },
    ],
    instructions: `
## When this applies
Sizing a trial or performance study, checking a sponsor's sample-size justification, or weighing power, effect and allocation trade-offs.

## Method
1. Establish the inputs before calling anything, and name the source of each:
   - the endpoint type (continuous, binary, time-to-event, ordinal, count, composite) and the population-level summary from the estimand;
   - the inferential frame: superiority, non-inferiority or equivalence. A non-inferiority or equivalence margin is the sponsor's, justified from historical evidence of the comparator's effect and clinical judgment (ICH E10 discusses the reasoning);
   - the assumed effect and variability (or control and treatment rates, or control median and hazard ratio), with where each came from: earlier trials, literature, natural history;
   - alpha and sidedness, target power, allocation ratio, number of arms, expected dropout or missing data, and any planned interim analyses.
   An input the sponsor has not given is asked for, not assumed.
2. Size with the deterministic engines:
   - \`compute_sample_size\` for the platform's standard sizing with its defensibility judgment; it also covers diagnostic, agreement and crossover designs;
   - \`estimate_sample_size\` when the formula must be shown: two-sample means, two proportions, or event-driven time-to-event sizing, under superiority, non-inferiority or equivalence, returning the formula, derived quantities and, for time-to-event, the required events;
   - \`design_mmrm\` for a repeated-measures endpoint analysed by MMRM with visit-wise retention;
   - \`review_mmrm_sizing\` for the MMRM endpoint of a study design bound to a protocol, sized from the sponsor's recorded assumptions, with whether the planned N covers it.
   Report per-arm and total N, achieved power and the assumptions used exactly as returned, including any default the engine applied.
3. Account for what erodes power. When dropout or missing data is expected, run \`analyze_missing_data_impact\` for the effective sample size and power loss under the planned handling method. When interim analyses are planned, the sizing follows the group-sequential design (the adaptive-and-interim skill), not the fixed-design result alone.
4. Show how N depends on its assumptions. Run \`compare_statistical_scenarios\` for each assumption the sponsor is unsure of (effect, variability, dropout, allocation, frame). When effect uncertainty is the real concern, \`compute_assurance\` returns the probability of success averaged over a prior on the standardized effect; present it beside power, not instead of it, and state the prior used.
5. Run \`assess_statistical_defensibility\` on the chosen design and report its verdict, fragility and escalation reasons verbatim.
6. Write the justification so a reviewer can reproduce it: each assumption with its source, the method, the engine, and the result. AnA does not write the number into the study design record; that is a governed act by a person.

## Pitfalls reviewers raise
- An effect size chosen to fit a feasible N rather than drawn from evidence or a clinically meaningful difference.
- Variability or event rates taken from one small study without saying so.
- Dropout ignored, or an inflation factor applied with no statement of how missing data will be handled.
- A non-inferiority margin with no justification from the comparator's historical effect.
- Sizing that ignores multiplicity across multiple primary endpoints, or the power cost of co-primary endpoints.

## Before answering
- Every N, power and margin figure came from a named engine in this turn, with its inputs listed.
- Each assumption shows its source, or is marked as not yet supplied.
- Engine defaults are named as defaults.
- The inferential frame, sidedness and alpha are stated with the result.

## Not AnA's to decide
- The effect size, variability, margin, power and dropout assumptions are the sponsor's, set with its statistician and clinicians.
- Whether a margin or sample size is acceptable is the agency's view, sought in a meeting or review.
`,
  }),

  skill({
    key: 'biostatistics.estimands',
    name: 'Estimands and intercurrent events',
    description:
      'Defining or reviewing an estimand under ICH E9(R1): the five attributes, a strategy for each intercurrent event, alignment with the trial objective, data collection and estimator, and the difference between sensitivity and supplementary analyses.',
    disciplines: ['biostatistics', 'clinical'],
    useCases: ['study-design', 'drafting', 'review'],
    triggers: [
      'estimand',
      'estimands',
      'e9(r1)',
      'intercurrent event',
      'intercurrent events',
      'treatment policy',
      'treatment-policy',
      'hypothetical strategy',
      'composite strategy',
      'while on treatment',
      'principal stratum',
      'population-level summary',
      'rescue medication',
      'clinical question of interest',
      'supplementary analysis',
    ],
    tools: [
      'advise_estimand',
      'assess_intercurrent_event_strategy',
      'define_estimand',
      'select_missing_data_strategy',
      'review_protocol_design_gates',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
      DESIGN_GATES,
    ],
    instructions: `
## When this applies
Defining, reviewing or documenting an estimand for a primary or key secondary objective, choosing intercurrent-event strategies, or deciding which analyses are sensitivity analyses and which are supplementary.

## Method
1. Start from the clinical question, not the analysis. Establish the trial objective, the decision the result will support, and who will use it. The estimand describes the treatment effect that answers that question.
2. Specify the five attributes and where each is stated in the protocol:
   - the treatment condition of interest and the comparator, including background and rescue therapy where relevant;
   - the population targeted by the question (an attribute of the estimand, distinct from an analysis set);
   - the variable (endpoint), including its timing;
   - the intercurrent events and the strategy for each;
   - the population-level summary (difference in means, risk ratio, hazard ratio and so on).
   Use \`advise_estimand\` to explain an attribute or a strategy, or to check a draft for which attributes are specified.
3. List the intercurrent events the trial can expect (discontinuation for lack of efficacy or for adverse events, rescue medication, treatment switching, death, dose change, non-adherence) and choose a strategy for each: treatment policy, hypothetical, composite variable, while on treatment, or principal stratum. Run \`assess_intercurrent_event_strategy\` with the endpoint type, whether the endpoint can still be measured after the event, the therapeutic context and the regulatory framing. Report its recommendation, alternative and rationale, and say where the sponsor's choice departs from it.
4. Assemble and check the estimand with \`define_estimand\`. Report its one-sentence description and its coherence findings verbatim, for example death handled by treatment policy for a non-mortality endpoint, or principal-stratum assumptions that cannot be verified.
5. Align the rest of the design with the estimand. A treatment-policy strategy needs data collected after discontinuation. The estimator and its missing-data assumption must match the strategy: \`select_missing_data_strategy\` returns an estimand-aligned primary estimator and sensitivity analyses (the missing-data skill). The sample size uses the population-level summary chosen here.
6. Separate sensitivity from supplementary analyses. Sensitivity analyses target the same estimand and test how robust the main estimator's conclusion is to departures from its assumptions. Supplementary analyses address other questions or other estimands. Label each planned analysis as one or the other.
7. On a protocol bound to a study design, run \`review_protocol_design_gates\`; its estimand findings show which confirmatory endpoints lack a complete estimand. Report them verbatim.

## Pitfalls reviewers raise
- An estimand stated only as "ITT" or as an analysis set, with no intercurrent-event strategy.
- A hypothetical strategy with no description of the hypothetical condition.
- Treatment policy chosen, while data collection stops at treatment discontinuation.
- Analyses that change the estimand presented as sensitivity analyses.
- In non-inferiority trials, a treatment-policy estimand relied on without discussion, although it is not necessarily conservative there.

## Before answering
- All five attributes are stated, or the missing ones are named.
- Each intercurrent event has a strategy and a reason.
- Tool recommendations and the sponsor's choices are distinguished.
- The estimator and data collection named are consistent with the strategies.

## Not AnA's to decide
- The clinical question and the estimand are the sponsor's choice, agreed by its clinical and statistical leads.
- Whether an estimand is acceptable for a claim is for the agency, usually discussed before the confirmatory trial.
`,
  }),

  skill({
    key: 'biostatistics.statistical-analysis-plan',
    name: 'Statistical analysis plan',
    description:
      'Drafting, reviewing or gap-checking a statistical analysis plan or the statistical section of a protocol: endpoint hierarchy, estimands, analysis sets, the pre-specified primary analysis, multiplicity, missing data, subgroups, interim analyses and safety analysis conventions.',
    disciplines: ['biostatistics', 'medical-writing'],
    useCases: ['drafting', 'review', 'gap-analysis'],
    documentTypes: ['ICH_SAP'],
    triggers: [
      'statistical analysis plan',
      'sap',
      'analysis set',
      'analysis sets',
      'full analysis set',
      'per-protocol set',
      'per protocol population',
      'intent-to-treat',
      'intention-to-treat',
      'itt population',
      'safety population',
      'key secondary endpoint',
      'key secondary endpoints',
      'subgroup analyses',
      'pre-specified analysis',
      'statistical section',
    ],
    tools: [
      'review_protocol_design_gates',
      'bind_protocol_to_study_design',
      'define_estimand',
      'plan_multiplicity_control',
      'select_missing_data_strategy',
      'generate_statistical_document',
      'assess_statistical_defensibility',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'ich', id: 'E3' },
      { kind: 'standard', id: 'ich_e_efficacy' },
      DESIGN_GATES,
    ],
    instructions: `
## When this applies
Drafting, reviewing or gap-checking a statistical analysis plan (SAP), or the statistical section of a protocol, for a clinical or performance study.

## Method
1. Establish what the SAP depends on: the protocol version it follows, the objectives and endpoints, the estimands, the design and randomisation, and the basis of the sample size. Read them from the program's study design and protocol. A SAP that disagrees with its protocol is a finding to report, not something to smooth over.
2. Check the design first. On a protocol bound to a study design, run \`review_protocol_design_gates\` and report its findings, severities and verdicts verbatim. If nothing is bound, say the gates did not run and offer \`bind_protocol_to_study_design\` (a governed write, done on the person's instruction).
3. Check that each element of the SAP is present and pre-specified:
   - Endpoints by hierarchy: primary, key secondary (those intended to support claims, under type I error control), other secondary, exploratory.
   - Estimands for the primary and key secondary objectives, each with its intercurrent-event strategies; assemble or check them with \`define_estimand\`.
   - Analysis sets, each defined with the analyses that use it: the full analysis set following the intention-to-treat principle, the per-protocol set, and the safety set.
   - The primary analysis: model or test, covariates and stratification factors, the hypothesis framework (superiority, non-inferiority with its margin, or equivalence), sidedness and significance level.
   - Multiplicity across primary and key secondary endpoints, doses, timepoints and interim looks; \`plan_multiplicity_control\` recommends the procedure (the multiplicity skill).
   - Intercurrent events and missing data: the estimator aligned with each estimand, its assumption, and sensitivity analyses that probe that assumption; \`select_missing_data_strategy\` proposes them (the missing-data skill).
   - Subgroups: pre-specified, with rationale, analysed for consistency rather than as separate claims unless under alpha control.
   - Interim analyses: timing by information fraction, the alpha-spending approach, stopping guidance, who sees unblinded data, and the data monitoring committee's role (the adaptive-and-interim skill).
   - Safety analysis conventions: exposure, the treatment-emergent definition, adverse events by MedDRA system organ class and preferred term, laboratory and vital-sign summaries, and the set used.
   - Data handling: baseline definition, visit windows, derived variables, and how deviations from planned analyses will be reported.
4. Draft with \`generate_statistical_document\`, choosing the document type that matches the request (full SAP, a single section, sample-size rationale, interim analysis plan, TLF shell plan). Every sample-size and power figure in the draft is engine-computed; the draft opens in the editor and is promoted through governed authoring by a person.
5. Run \`assess_statistical_defensibility\` on the design parameters the SAP states and report its verdict verbatim.
6. Record version control: the SAP is finalised before the blind is broken, and any later change is documented with its date relative to unblinding.

## Pitfalls reviewers raise
- The per-protocol set as the primary analysis set for a superiority claim.
- Key secondary endpoints with no multiplicity control, later proposed for labeling.
- Last observation carried forward as the primary missing-data approach, without justification or sensitivity analyses.
- Subgroups chosen after unblinding, or presented as confirmatory.
- Interim analyses with no stated spending function or monitoring committee arrangements.
- Protocol and SAP disagreeing on endpoints, analysis sets or alpha.

## Before answering
- Each SAP element above is marked present, missing or inconsistent with the protocol.
- Gate findings and engine verdicts are quoted, not paraphrased into a score.
- Every number in a draft came from an engine or from the protocol, and says which.

## Not AnA's to decide
- The sponsor's statistician authors and approves the SAP; AnA drafts and checks.
- AnA does not finalise, sign or date-stamp a SAP as final.
`,
  }),

  skill({
    key: 'biostatistics.multiplicity',
    name: 'Multiplicity and multiple endpoints',
    description:
      'Controlling the family-wise type I error when a trial tests several endpoints, doses, populations, timepoints or interim looks: defining the family, choosing a hierarchical, graphical or gatekeeping procedure, checking it, and applying it to results.',
    disciplines: ['biostatistics'],
    useCases: ['study-design', 'review', 'analysis'],
    triggers: [
      'multiplicity',
      'multiple endpoints',
      'multiple comparisons',
      'multiple testing',
      'alpha split',
      'alpha splitting',
      'alpha recycling',
      'hierarchical testing',
      'fixed sequence',
      'fixed-sequence',
      'gatekeeping',
      'graphical approach',
      'bonferroni',
      'holm',
      'hochberg',
      'family-wise error',
      'familywise error',
      'fwer',
      'co-primary endpoints',
    ],
    tools: [
      'plan_multiplicity_control',
      'review_multiplicity_control',
      'adjust_multiplicity',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
    ],
    instructions: `
## When this applies
A trial tests more than one hypothesis that could support a claim (several primary or key secondary endpoints, doses, populations, timepoints or interim looks), and the question is how to control the family-wise type I error or what a set of results allows the sponsor to say.

## Method
1. Establish the family: every hypothesis that, if rejected, would support a claim or a labeling statement. Name the sources of multiplicity: multiple primary endpoints, co-primary endpoints, primary plus key secondary, several doses against a shared control, subgroups, timepoints, interim analyses. Exploratory endpoints are outside the family and are reported as exploratory.
2. Distinguish co-primary endpoints (all must succeed: no alpha adjustment, but a power cost) from multiple primary endpoints (any one can succeed: alpha must be controlled across them). Ask which the sponsor intends.
3. Establish the clinical ordering and the logical relations among hypotheses (a key secondary is tested only if the primary succeeds; a lower dose only after a higher one), whether comparisons share a control, and whether positive dependence among the test statistics can be assumed.
4. Choose the procedure with \`plan_multiplicity_control\`. It selects among fixed-sequence (hierarchical) testing, Holm, Hochberg, Bonferroni, Dunnett, graphical approaches and gatekeeping, and returns the alpha allocation and a family-wise error statement. Report its recommendation, rationale and cautions verbatim; where the sponsor prefers another procedure, say what the tool recommends and why they differ.
5. For a graphical approach or gatekeeping, write the initial alpha weights and the transition (recycling) rules explicitly, so the procedure can be reproduced from the SAP alone. Hochberg relies on positive dependence; say so whenever it is chosen.
6. On a protocol bound to a study design, run \`review_multiplicity_control\` to check whether the recorded procedure holds the family-wise error at alpha over the confirmatory endpoints. Report the simulated rate, its Monte Carlo error and any gaps verbatim, and say the simulation assumes independent p-values. A procedure the engine cannot check is a gap; never substitute another.
7. When results exist, apply the pre-specified procedure to the observed p-values with \`adjust_multiplicity\` and report which hypotheses are rejected. Do not try other procedures after seeing the results.
8. Interim analyses spend alpha too. Their boundaries come from the group-sequential design (the adaptive-and-interim skill), and the multiplicity plan says how the two combine.
9. FDA's guidance on multiple endpoints in clinical trials is the US reference on this topic. Refer to it by topic, run \`lookup_fda_guidance\`, and say it needs confirming unless the lookup or the person supplied it.

## Pitfalls reviewers raise
- A hierarchy that stopped at a failed endpoint, with later endpoints still described as significant.
- Secondary endpoints proposed for labeling that were outside the testing strategy.
- Alpha recycled along paths the SAP does not specify.
- Hochberg used where positive dependence is doubtful.
- Subgroup findings presented as claims with no alpha allocated to them.

## Before answering
- The family of hypotheses is listed, with exploratory endpoints set apart.
- The procedure, its alpha allocation and its assumptions are stated as the tool returned them.
- Any result described as significant was reached by the pre-specified procedure.

## Not AnA's to decide
- The choice of procedure and the ordering of hypotheses are the sponsor's, set before unblinding.
- Whether a secondary result supports a labeling claim is the agency's decision.
`,
  }),

  skill({
    key: 'biostatistics.adaptive-and-interim',
    name: 'Adaptive designs and interim analyses',
    description:
      'Designs with planned interim analyses or adaptations: early stopping, group-sequential boundaries and alpha spending, sample-size re-estimation, enrichment, arm or dose selection, operating characteristics, and data monitoring committee arrangements and firewalls.',
    disciplines: ['biostatistics', 'clinical'],
    useCases: ['study-design', 'review', 'drafting'],
    triggers: [
      'adaptive design',
      'adaptive trial',
      'interim analysis',
      'interim analyses',
      'group sequential',
      'group-sequential',
      'alpha spending',
      'spending function',
      "o'brien-fleming",
      'pocock boundary',
      'futility',
      'stopping boundary',
      'early stopping',
      'sample size re-estimation',
      'data monitoring committee',
      'dmc',
      'dsmb',
      'idmc',
      'seamless phase 2/3',
      'operating characteristics',
    ],
    tools: [
      'design_adaptive_design',
      'design_group_sequential',
      'review_interim_operating_characteristics',
      'project_events',
      'generate_statistical_document',
      'lookup_fda_guidance',
      'lookup_ich_guideline',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'ich', id: 'E20' },
      DESIGN_GATES,
    ],
    instructions: `
## When this applies
A design with planned interim analyses, early stopping for efficacy or futility, sample-size re-estimation, population enrichment, dose or arm selection, or a seamless phase 2/3 design; and questions about monitoring committees and operating characteristics.

## Method
1. Establish what is adapted, on which data, at which information fraction, and who decides. Every adaptation and the rule that drives it is pre-specified in the protocol and SAP.
2. Choose the adaptation with \`design_adaptive_design\` for the goal (stop early for efficacy or futility, blinded or unblinded re-estimation, enrichment, dose or arm selection, combining phases). Use its type I error statement, cautions and regulatory considerations. Its interim boundaries are illustrative; never quote them as the design's boundaries.
3. Solve group-sequential boundaries with \`design_group_sequential\` from the information fractions, the one-sided alpha and the spending function (O'Brien-Fleming type, Pocock type or linear). Report the exact boundaries, and the operating-characteristics table over a drift grid when asked, verbatim.
4. On a protocol bound to a study design, run \`review_interim_operating_characteristics\`. It reports the solved boundaries, the one-sided type I error with futility non-binding, power at the planned alternative, expected sample size and per-look stopping probabilities. A recorded boundary that departs from the named spending function is a discrepancy; report it and do not replace it. The binding-futility figure is reported separately and is not the type I error.
5. For an event-driven trial, looks are timed by events. \`project_events\` gives the calendar time to reach each event count from the sponsor's accrual and event assumptions.
6. For adaptations beyond group-sequential boundaries (unblinded sample-size re-estimation, response-adaptive randomisation, Bayesian adaptive rules, multi-arm multi-stage selection), type I error and power come from the sponsor's simulation report. The platform has no engine that simulates those designs: say so, and review the report's scenarios, the number of replicates, and whether the null scenarios cover the plausible range.
7. Settle the monitoring arrangements: an independent data monitoring committee with a statistician, a charter that sets out stopping guidance and who sees unblinded data, usually an independent statistical group preparing the interim reports, and sponsor staff kept away from comparative interim results. \`generate_statistical_document\` drafts an interim analysis plan or a monitoring committee charter from the design parameters.
8. Cite the basis by topic: FDA's guidance on adaptive designs for drugs and biologics and its guidance on data monitoring committees (run \`lookup_fda_guidance\`; say each needs confirming unless supplied), and ICH E20 on adaptive designs, which the corpus records as a draft; confirm its status with \`lookup_ich_guideline\` before relying on it.

## Pitfalls reviewers raise
- Adaptation rules described in words but not specified well enough to reproduce.
- Type I error control claimed for a complex adaptation without simulations.
- Sponsor personnel with access to unblinded comparative interim data.
- Binding or non-binding futility not stated.
- Estimates reported after an adaptive design without saying whether they account for the adaptation.

## Before answering
- Boundaries and error rates quoted are the exact engine values, with their sidedness.
- Each adaptation states its decision rule, timing and decision-maker.
- Where no engine covers a design, the answer says the figures must come from the sponsor's simulations.

## Not AnA's to decide
- Stopping or adapting a trial is the sponsor's decision on the monitoring committee's recommendation; AnA never interprets unblinded interim results for a sponsor.
- Whether an adaptive design is acceptable for a confirmatory claim is the agency's view, usually sought before the trial.
`,
  }),

  skill({
    key: 'biostatistics.missing-data',
    name: 'Missing data and sensitivity analyses',
    description:
      'Preventing and handling missing data: separating intercurrent events from missingness, choosing an estimand-aligned primary estimator, planning sensitivity analyses such as tipping-point and reference-based imputation, and quantifying the power cost of dropout.',
    disciplines: ['biostatistics'],
    useCases: ['study-design', 'review', 'analysis'],
    triggers: [
      'missing data',
      'missingness',
      'multiple imputation',
      'tipping point',
      'tipping-point analysis',
      'missing at random',
      'missing not at random',
      'mnar',
      'locf',
      'last observation carried forward',
      'jump to reference',
      'reference-based imputation',
      'pattern-mixture',
      'mmrm',
      'sensitivity analysis',
      'sensitivity analyses',
      'retrieved dropouts',
    ],
    tools: [
      'select_missing_data_strategy',
      'assess_intercurrent_event_strategy',
      'analyze_missing_data_impact',
      'design_mmrm',
      'review_mmrm_sizing',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
      DESIGN_GATES,
    ],
    instructions: `
## When this applies
Planning how missing data are prevented and handled in the primary analysis, choosing sensitivity analyses, sizing for dropout, or reviewing the missing-data section of a SAP.

## Method
1. Prevention first. Establish what the protocol does to limit missing data: follow-up after treatment discontinuation, retention measures, visit windows, and how reasons for discontinuation are recorded. No analysis recovers information that was never collected.
2. Separate intercurrent events from missing data. What happens after an intercurrent event is governed by the estimand's strategy for it (the estimands skill); data are missing only when the strategy needs a value that was not observed. Confirm the strategy for each intercurrent event before choosing a method.
3. Establish the assumption the primary analysis rests on (missing completely at random, missing at random, or missing not at random) and why it is plausible for this trial.
4. Choose the primary estimator and the sensitivity analyses with \`select_missing_data_strategy\`, giving it the estimand strategy, the endpoint and the assumed mechanism. It returns a primary estimator (for example MMRM or multiple imputation under missing at random, or reference-based imputation) and sensitivity analyses that relax the assumption (delta-adjusted tipping point, jump-to-reference or copy-reference imputation, pattern-mixture or selection models). Report its rationale, assumptions and cautions verbatim.
5. When the estimator and the stated strategy appear to disagree (for example censoring at discontinuation under a treatment-policy estimand), run \`assess_intercurrent_event_strategy\` and set its recommendation beside the plan.
6. Make sensitivity analyses interpretable. A tipping-point analysis states the range of departures examined and the departure at which the conclusion changes; whether that departure is clinically plausible is a judgment for the clinical team. A reference-based analysis names the reference arm and why.
7. Quantify the cost to power. \`analyze_missing_data_impact\` returns the effective sample size, the power loss and a bias-risk rating for an expected missing rate and handling method. For a repeated-measures endpoint, \`design_mmrm\` sizes with visit-wise retention, and on a protocol bound to a study design \`review_mmrm_sizing\` sizes from the sponsor's recorded retention and says whether the planned N covers it.
8. The method's background is ICH E9(R1), the National Research Council's report on missing data in clinical trials, and the EMA guideline on missing data in confirmatory trials; cite them by name and topic.

## Pitfalls reviewers raise
- Last or baseline observation carried forward as the primary approach without justification.
- Complete-case analysis as the primary analysis.
- Imputation under missing at random used for a treatment-policy estimand when it imputes off-treatment outcomes from on-treatment data.
- Sensitivity analyses that vary the model but not the missing-data assumption.
- A treatment-policy estimand claimed with no data collected after discontinuation.

## Before answering
- The assumption behind the primary estimator is named and justified.
- Each sensitivity analysis says which assumption it departs from.
- Power and effective sample size figures come from the engines named above.

## Not AnA's to decide
- The plausibility of a tipping point, and the final choice of estimator, are for the sponsor's statistical and clinical leads.
- Whether the handling is acceptable is the agency's assessment.
`,
  }),

  skill({
    key: 'biostatistics.bayesian-and-borrowing',
    name: 'Bayesian designs and borrowing external data',
    description:
      'Bayesian designs and analyses, prior specification, and borrowing from historical or external data, including external and hybrid control arms: source fitness, choice of borrowing method, how much is borrowed, prior-data conflict and operating characteristics.',
    disciplines: ['biostatistics', 'clinical'],
    useCases: ['study-design', 'review', 'strategy'],
    triggers: [
      'bayesian',
      'informative prior',
      'prior distribution',
      'dynamic borrowing',
      'borrowing',
      'power prior',
      'commensurate prior',
      'robust map',
      'meta-analytic predictive',
      'external control',
      'external control arm',
      'historical control',
      'hybrid control',
      'prior-data conflict',
      'effective sample size',
      'posterior probability',
    ],
    tools: [
      'design_external_control',
      'plan_bayesian_borrowing',
      'analyze_external_control_borrow',
      'review_external_control_plan',
      'design_bayesian_device',
      'compute_assurance',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'ich', id: 'E10' },
      { kind: 'ich', id: 'E11A' },
    ],
    instructions: `
## When this applies
Bayesian designs and analyses, informative priors, and borrowing from historical or external data, including external and hybrid control arms, for drug, biologic and device studies.

## Method
1. Establish why a Bayesian approach is proposed and what the prior carries: a small or rare-disease population, an external or historical control, paediatric extrapolation from adult data (ICH E11A), or a device with earlier studies. Establish the decision rule (for example a posterior probability threshold) and whether the design must also show frequentist type I error control. For a confirmatory study, these are discussed with the agency before the trial.
2. Establish the source data's fitness before any borrowing: population, endpoint definition and ascertainment, standard of care and era, availability of patient-level data, and the covariates needed for comparability. \`design_external_control\` grades an external control source and lists the comparability domains, bias sources and analytic safeguards to address (ICH E10 discusses external controls).
3. Choose the borrowing method with \`plan_bayesian_borrowing\`. It ranks power, commensurate, meta-analytic-predictive, robust mixture and hierarchical priors by the number of sources, the risk of prior-data conflict and whether dynamic borrowing is needed, with effective-sample-size guidance and type I error considerations. Report its ranking and cautions verbatim.
4. Quantify how much is borrowed. For a normal power prior with discount a0, \`analyze_external_control_borrow\` returns the posterior control mean and standard error, the effective historical sample size and the share of posterior precision that comes from history. On a protocol bound to a study design, \`review_external_control_plan\` checks the plan's elements (source fitness, method and strength, conflict handling, covariate comparability, tipping-point sensitivity) and the borrowing strength at the planned concurrent-control size. A fixed discount does not handle prior-data conflict; say so rather than calling such a plan conflict-robust.
5. For a single-arm device or diagnostic study with a Beta prior and a posterior-exceedance success rule, \`design_bayesian_device\` finds the smallest n that reaches the target power while holding type I error at the performance goal. Report n, power and type I error as returned.
6. When a prior on the effect size informs a program decision, \`compute_assurance\` gives the probability of success averaged over that prior; state the prior used.
7. Operating characteristics (type I error, power and bias, including under prior-data conflict) are part of the design. Beyond the cases above, they come from the sponsor's simulation report; the platform has no general Bayesian trial simulator. Say so, and review the report's scenarios.
8. Cite the basis by topic: FDA's guidance on Bayesian statistics in medical device clinical trials, any FDA guidance on Bayesian methods for drugs and biologics, and FDA's guidance on externally controlled trials. Run \`lookup_fda_guidance\` and say each needs confirming unless the lookup or the person supplied it.

## Pitfalls reviewers raise
- A prior whose weight is not expressed as an effective sample size.
- Borrowing with no plan for prior-data conflict.
- An external control with different endpoint ascertainment or era of care, and no comparability analysis.
- Operating characteristics shown only under the scenario in which the prior is right.

## Before answering
- The prior, its source and its effective weight are stated as the engine returned them.
- Every posterior, effective sample size or error rate comes from a named engine or the sponsor's simulation report.
- Conflict handling is described honestly, including its limits.

## Not AnA's to decide
- The prior and the success threshold are the sponsor's choices, set before the data are seen.
- Whether borrowing is acceptable for a claim is the agency's determination.
`,
  }),

  skill({
    key: 'biostatistics.time-to-event-and-alternatives',
    name: 'Time-to-event designs and non-proportional hazards',
    description:
      'Trials with a time-to-event endpoint: event-driven sizing, projecting when events and enrolment targets are reached, event-driven interim timing, and alternatives to the hazard ratio when hazards are not proportional, such as restricted mean survival time and the win ratio.',
    disciplines: ['biostatistics', 'clinical'],
    useCases: ['study-design', 'analysis', 'review'],
    triggers: [
      'time-to-event',
      'time to event',
      'survival analysis',
      'hazard ratio',
      'proportional hazards',
      'non-proportional hazards',
      'rmst',
      'restricted mean survival',
      'win ratio',
      'hierarchical composite',
      'event-driven',
      'number of events',
      'event projection',
      'log-rank',
      'kaplan-meier',
      'median survival',
      'enrollment forecast',
      'accrual rate',
    ],
    tools: [
      'estimate_sample_size',
      'project_events',
      'forecast_enrollment',
      'review_enrollment_forecast',
      'design_group_sequential',
      'analyze_rmst',
      'analyze_win_ratio',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
    ],
    instructions: `
## When this applies
Trials whose primary or key endpoint is the time to an event (death, progression, first hospitalisation, a major adverse event): event-driven sizing and timing, and the analysis when hazards may not be proportional.

## Method
1. Establish the endpoint precisely: the event definition, how and when it is assessed (and whether the assessment schedule is the same in each arm), the time origin, censoring rules, competing events, and the estimand's strategy for intercurrent events such as treatment switching.
2. Size by events, not by patients. Power is driven by the number of events. \`estimate_sample_size\` in time-to-event mode returns the required events and a sample size from the hazard ratio, alpha, power, allocation and assumed event probability. Report them as returned, with every assumption's source.
3. Turn events into calendar time. \`project_events\` gives the time to reach a target event count from the sponsor's accrual rate and period, control median, hazard ratio and dropout. \`forecast_enrollment\` forecasts when site-level accrual reaches the target N; on a protocol bound to a study design, \`review_enrollment_forecast\` does this from the sponsor's site accrual plan. Accrual rates are sponsor inputs; never assume one.
4. Interim analyses in an event-driven trial are set at information fractions defined by events. Their boundaries come from \`design_group_sequential\` (the adaptive-and-interim skill).
5. Decide in advance whether proportional hazards is plausible. A delayed effect, crossing curves or a waning effect makes a single hazard ratio hard to interpret. Pre-specify the primary summary that matches the clinical question, and how the assumption will be examined. Alternatives with an engine:
   - \`analyze_rmst\` returns the restricted mean survival time difference up to a horizon tau, with its interval; the horizon is pre-specified and supported by the follow-up available.
   - \`analyze_win_ratio\` analyses a prioritised hierarchical composite (for example death, then hospitalisation, then a symptom measure) and returns the win ratio, its interval and p-value.
   The choice goes in the SAP before unblinding, and the estimand's population-level summary matches it.
6. Report Kaplan-Meier summaries, hazard ratios, RMST differences and win ratios exactly as the analysis output or the engine returns them. A median is reported only when it was reached.

## Pitfalls reviewers raise
- Sizing on patients with no event assumption, or an event rate taken from a different population.
- Informative censoring not considered, or assessment schedules that differ between arms.
- A method for non-proportional hazards chosen after the curves were seen.
- A win-ratio hierarchy that places a less important outcome above a more important one, or ties handled in a way not pre-specified.

## Before answering
- Events, sample size and timing figures come from the engines named, with their inputs.
- The summary measure answers the clinical question and is pre-specified.
- Sponsor inputs (accrual, medians, hazard ratio) are named as sponsor inputs.

## Not AnA's to decide
- The hazard ratio and event-rate assumptions, and the choice of primary summary, are the sponsor's.
- Whether an alternative summary is acceptable as primary is the agency's view.
`,
  }),

  skill({
    key: 'biostatistics.diagnostic-accuracy',
    name: 'Diagnostic accuracy and reader studies',
    description:
      'Clinical performance statistics for diagnostic devices and IVDs: sensitivity and specificity against a reference standard, positive and negative percent agreement against a non-reference comparator, confidence intervals, study sizing, Bayesian single-arm designs and multi-reader multi-case studies.',
    disciplines: ['biostatistics', 'diagnostics'],
    useCases: ['study-design', 'analysis', 'review'],
    segments: ['device', 'ivd'],
    triggers: [
      'diagnostic accuracy',
      'sensitivity and specificity',
      'clinical sensitivity',
      'clinical specificity',
      'positive percent agreement',
      'negative percent agreement',
      'ppa',
      'npa',
      'reference standard',
      'composite reference standard',
      'clopper-pearson',
      'mrmc',
      'reader study',
      'multi-reader multi-case',
      'roc curve',
      'auc',
      'ppv',
      'npv',
      'stard',
      'performance goal',
    ],
    tools: [
      'size_diagnostic_study',
      'design_bayesian_device',
      'compute_diagnostic_accuracy',
      'run_monte_carlo_simulation',
      'design_mrmc_reader_study',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'standard', id: 'eu_ivdr' },
    ],
    instructions: `
## When this applies
Clinical performance studies of diagnostic devices and IVDs, imaging and AI-assisted reading: estimating accuracy or agreement, sizing the study, and designing multi-reader multi-case studies.

## Method
1. Establish the intended use and the clinical decision the result informs, the intended-use population and setting, the specimen type, and the comparator. Whether the comparator is a reference standard (the best available method for establishing the target condition) or a non-reference comparator decides the vocabulary: against a reference standard, report sensitivity and specificity; against a non-reference comparator, report positive and negative percent agreement (PPA, NPA), which are agreement, not accuracy.
2. Establish the study design: prospective enrolment of consecutive or randomly selected intended-use subjects, or archived specimens with the enrichment stated; readers of the new test blinded to the reference result; how indeterminate and invalid results are handled; and any composite reference standard defined before testing.
3. Size the study with \`size_diagnostic_study\`: one performance metric against a goal, or co-primary sensitivity and specificity jointly given prevalence, by exact binomial power. Performance goals and expected performance are the sponsor's, with their basis. For a single-arm study with a Bayesian success rule, \`design_bayesian_device\` returns n, power and type I error.
4. Compute performance from the 2x2 counts with \`compute_diagnostic_accuracy\`: sensitivity and specificity with exact Clopper-Pearson intervals, PPA and NPA, predictive values (sample-based, or prevalence-adjusted when an intended-use prevalence is supplied), likelihood ratios and kappa. When Bayesian credible intervals are wanted, \`run_monte_carlo_simulation\` in diagnostic-accuracy mode returns them from a seeded simulation; say which interval is which.
5. Reader studies: for an imaging or AI device comparing reading conditions, \`design_mrmc_reader_study\` returns the power, or the minimum number of readers, under the Obuchowski-Rockette model from the sponsor's variance components. Those components come from a pilot or earlier study; never assume them.
6. Report in line with STARD: the flow of subjects, numbers excluded and why, indeterminate results, and an interval with every point estimate. Predictive values depend on prevalence; never carry them from an enriched sample to the intended-use population without adjustment.
7. Refer to FDA's guidance on reporting results from studies evaluating diagnostic tests, and its guidance on clinical performance assessment for computer-assisted detection devices, by topic; run \`lookup_fda_guidance\` and say each needs confirming unless supplied. For an EU IVD, the IVDR's performance evaluation requirements apply.

## Pitfalls reviewers raise
- PPA and NPA described as sensitivity and specificity.
- Case-control (spectrum-enriched) sampling presented as intended-use performance.
- Discordant results resolved by retesting only the discordant specimens, which biases the estimates.
- A point estimate called a pass while the lower confidence bound falls below the performance goal.
- Indeterminate or invalid results excluded without being reported.

## Before answering
- The comparator is named, and the metric vocabulary matches it.
- Every estimate carries its interval, as the engine returned it.
- Sizing inputs (goal, expected performance, prevalence, variance components) are attributed to the sponsor.

## Not AnA's to decide
- The performance goal and acceptance criteria are the sponsor's, ideally agreed in a pre-submission.
- Whether the clinical performance supports the intended use is the agency's or notified body's determination.
`,
  }),

  skill({
    key: 'biostatistics.data-standards',
    name: 'Study data standards (CDISC)',
    description:
      'Preparing and checking study data for a submission: which CDISC standards and versions apply, SDTM and ADaM conformance, define.xml, reviewer guides, traceability, and the sequence from database lock to filed datasets. The platform checks are rule subsets, not the validator of record.',
    disciplines: ['biostatistics', 'regulatory-operations'],
    useCases: ['submission-assembly', 'review', 'gap-analysis'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'cdisc',
      'sdtm',
      'adam',
      'adam dataset',
      'adsl',
      'define.xml',
      'define-xml',
      'study data standards',
      'technical conformance',
      'data standards catalog',
      'pinnacle 21',
      'pinnacle21',
      "reviewer's guide",
      'adrg',
      'csdrg',
      'controlled terminology',
      'trial summary dataset',
      'xpt',
    ],
    tools: [
      'plan_submission_from_database_lock',
      'validate_sdtm_dataset',
      'validate_adam_dataset',
      'check_dataset_conformance',
      'run_cdisc_pipeline',
      'generate_define_xml',
      'lookup_fda_guidance',
    ],
    instructions: `
## When this applies
Preparing or checking study data for a submission: SDTM and ADaM datasets, define.xml, reviewer's guides, conformance to the standards an agency requires, and the sequence from database lock to filed datasets.

## Method
1. Establish which standards and versions apply. In the US, standardised electronic study data are required for NDAs, BLAs, ANDAs and commercial INDs, in the standards listed in FDA's Data Standards Catalog, with expectations set out in FDA's Study Data Technical Conformance Guide. Refer to these by topic, run \`lookup_fda_guidance\`, and say they need confirming unless supplied. PMDA has its own electronic study data requirements; confirm them for a Japanese filing. The sponsor's data standards plan and the agency's catalog decide the SDTM IG, ADaM IG, Define-XML and controlled terminology versions.
2. Place the work in the sequence with \`plan_submission_from_database_lock\`: SAP final, database lock, SDTM with define.xml and the reviewer's guide, ADaM, tables, listings and figures, study reports, integrated datasets. With a project open, it reads which steps are filed in the Vault and what is blocked.
3. Check datasets with the deterministic checks, and say what each covers:
   - \`validate_sdtm_dataset\` checks an SDTM domain's code, required variables and naming against SDTM IG rules;
   - \`validate_adam_dataset\` checks an ADaM dataset's name, required variables and naming against ADaM IG rules;
   - \`check_dataset_conformance\` runs structural checks over a dataset spec (identifier variables, naming, types, label length, codelist resolution);
   - \`run_cdisc_pipeline\` runs the structural and deeper rules, generates define.xml and returns a consolidated report.
   These are mechanical rule subsets. They are not the validator of record: the sponsor's full validation against the agency's rules (for example with Pinnacle 21) is still required, and AnA never calls datasets submission-ready on these checks alone.
4. Generate define.xml with \`generate_define_xml\` at the Define-XML version the sponsor's plan names. Report the version emitted and its gap report (datasets without key variables, undefined codelists, missing labels).
5. Check traceability: each ADaM variable traces to SDTM or to a documented derivation, and each analysis result traces to an ADaM dataset and a program.
6. Every validation issue that remains is explained in the reviewer's guide (study data or analysis data), not left silent.

## Pitfalls reviewers raise
- Standards versions the agency did not support at the time of submission.
- A define.xml that does not match the datasets delivered.
- Validation issues left unexplained in the reviewer's guide.
- Analysis datasets that cannot be traced to SDTM.
- Missing items that FDA's technical rejection criteria for study data check, such as the trial summary dataset; confirm the current criteria.

## Before answering
- The standards and versions assumed are stated, with their source.
- Each finding cites the tool that produced it, and the answer says what that tool does not check.
- No dataset is described as conformant or submission-ready on the platform checks alone.

## Not AnA's to decide
- The sponsor's data standards plan and its validator of record decide conformance.
- Whether data are accepted on receipt is the agency's technical determination.
`,
  }),

  skill({
    key: 'biostatistics.reporting-results',
    name: 'Reporting statistical results',
    description:
      'Presenting and narrating statistical results in study reports, Module 2 summaries, topline reports and agency responses: every number traced to a source table, wording that follows the testing strategy, and figures consistent within and across documents.',
    disciplines: ['biostatistics', 'medical-writing'],
    useCases: ['drafting', 'review', 'analysis'],
    triggers: [
      'statistically significant',
      'topline',
      'top-line',
      'topline results',
      'top-line results',
      'enrolled n',
      'efficacy results',
      'results narrative',
      'forest plot',
      'nominal p-value',
      'post hoc analysis',
      'post-hoc',
      'clinical significance',
      'tables listings and figures',
      'tlf',
      'numbers do not match',
      'inconsistent numbers',
      'reconcile numbers',
      'results section',
    ],
    tools: [
      'narrate_statistical_result',
      'adjust_multiplicity',
      'check_numerical_integrity',
      'reconcile_dossier_numbers',
      'reconcile_extracted_figures',
      'lookup_ich_guideline',
    ],
    references: [
      { kind: 'ich', id: 'E3' },
      { kind: 'ich', id: 'E9(R1)' },
    ],
    instructions: `
## When this applies
Writing or checking how statistical results are presented: results sections of clinical study reports, Module 2 summaries, topline reports, publications and responses to agencies, and the consistency of figures across them.

## Method
1. Trace every figure to its source. Each number comes from a named table, listing or figure produced from the locked analysis datasets, or from an engine output in this conversation. Ask for the source output when it is not in front of you; never reconstruct one number from others.
2. Narrate each result with \`narrate_statistical_result\`, giving it the endpoint, effect measure, estimate, confidence interval, p-value and per-arm values from the source table. It decides significance from the interval (or the p-value), separates statistical from clinical significance, and flags post hoc and multiplicity-uncontrolled analyses so the wording does not overstate.
3. Respect the testing strategy. A result is called statistically significant only when it was tested under the pre-specified multiplicity procedure and the procedure reached it. With the observed p-values, \`adjust_multiplicity\` applies the pre-specified procedure and returns which hypotheses are rejected; results outside it are nominal and are described that way.
4. Present each estimate with its interval, the analysis set, the estimand and the method. Report sensitivity analyses beside the primary result and say whether they support it. Give absolute effects alongside relative ones where the data allow.
5. After drafting, check internal consistency with \`check_numerical_integrity\`. It reports candidates where the same labelled quantity appears with different values; adjudicate each (different arms or timepoints are legitimate). Its not_assessed verdict is not a clean result.
6. Check across documents before they go out together (study report, Module 2.7.3, Module 2.5, label): \`reconcile_dossier_numbers\` scans several documents' text for the same labelled figure (enrolled N, events, alpha, power, hazard ratio, primary p-value) disagreeing; \`reconcile_extracted_figures\` reconciles figures already extracted with their provenance, under a stated tolerance.
7. Follow ICH E3 for the structure of the study report's efficacy and statistical sections; confirm details with \`lookup_ich_guideline\`.

## Pitfalls reviewers raise
- Enrolled, randomised and analysed N differing between protocol, study report and summaries.
- "Trend toward significance" or similar wording for a result that did not meet its test.
- Secondary or subgroup results presented as findings after the testing hierarchy stopped.
- Relative effects reported without absolute effects or intervals.

## Before answering
- Every number names its source table or engine output.
- Significance language matches the pre-specified testing strategy.
- Consistency checks were run and their candidates adjudicated, or the answer says they were not.

## Not AnA's to decide
- The interpretation of clinical relevance is the sponsor's clinical team's, and the final conclusion is the agency's.
- AnA does not approve or sign a study report or its statistical sections.
`,
  }),
];
