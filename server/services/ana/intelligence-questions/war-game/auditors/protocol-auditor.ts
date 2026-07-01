/**
 * Protocol Auditor -- simulates FDA reviewer scrutiny of a clinical protocol.
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * actual FDA regulations (21 CFR 312), ICH guidelines (E6, E9, E10), and
 * FDA Guidance documents.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/protocol-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'protocol_' + suffix;

function isBlank(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function numericVal(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function finding(
  id: string,
  dimension: AuditDimension,
  severity: 'info' | 'warning' | 'critical',
  title: string,
  question: string,
  observation: string,
  requirement: string,
  reference: string,
  recommendation: string,
  relatedFields: string[],
): WarGameFinding {
  return { id, dimension, severity, title, question, observation, requirement, reference, recommendation, relatedFields };
}

/* ------------------------------------------------------------------ */
/*  Audit Rules                                                       */
/* ------------------------------------------------------------------ */

const rules: AuditRule[] = [
  /* ========== COMPLETENESS (4 rules) ========== */
  {
    id: rid('missing_title'),
    dimension: 'completeness',
    title: 'Study Title Missing',
    question: 'The protocol lacks a descriptive title. How does the sponsor expect the Agency to identify this submission in our tracking system?',
    check(answers) {
      if (isBlank(answers.study_title)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No study title was provided in the protocol submission.',
          'A descriptive study title is required per 21 CFR 312.23(a)(6)(iii)(a) and is fundamental for IND submission identification.',
          '21 CFR 312.23(a)(6)(iii)(a); ICH E6(R2) Section 6.1',
          'Provide a concise, descriptive study title that includes the indication, intervention, and study phase.',
          ['study_title'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_sponsor'),
    dimension: 'completeness',
    title: 'Sponsor Identification Absent',
    question: 'Who is the sponsor of record? The submission does not clearly identify the responsible party, which is a regulatory prerequisite under 21 CFR 312.23.',
    check(answers) {
      if (isBlank(answers.sponsor_name)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Sponsor name is not specified in the protocol.',
          'The sponsor must be identified per 21 CFR 312.23(a)(1) as the entity assuming responsibility for the IND.',
          '21 CFR 312.23(a)(1); 21 CFR 312.50',
          'Identify the sponsor of record, including full legal name and contact information.',
          ['sponsor_name'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_indication'),
    dimension: 'completeness',
    title: 'Indication Not Specified',
    question: 'Can the sponsor clarify which disease or condition this protocol intends to study? Without a clearly defined indication, the Agency cannot assess whether the proposed clinical investigation is justified.',
    check(answers) {
      if (isBlank(answers.indication)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The therapeutic indication is missing from the protocol.',
          'The protocol must specify the indication per 21 CFR 312.23(a)(6)(iii)(a), describing the condition the drug is intended to treat.',
          '21 CFR 312.23(a)(6)(iii)(a)',
          'Clearly state the target indication, including any relevant ICD-10 diagnostic criteria.',
          ['indication', 'therapeutic_area'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_secondary_endpoints'),
    dimension: 'completeness',
    title: 'Secondary Endpoints Not Specified',
    question: 'The protocol does not define any secondary endpoints. A single primary endpoint alone may not provide a comprehensive characterization of the drug\'s benefit-risk profile. How does the sponsor plan to evaluate the broader clinical impact?',
    check(answers) {
      if (isBlank(answers.secondary_endpoints)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No secondary efficacy endpoints are specified.',
          'ICH E9 Section 2.2.2 recommends pre-specification of secondary endpoints to provide supportive evidence for the primary endpoint analysis.',
          'ICH E9 Section 2.2.2; FDA Guidance: Multiple Endpoints in Clinical Trials (2022)',
          'Define secondary endpoints including, where applicable, patient-reported outcomes, biomarker endpoints, and duration of response. Specify the analysis hierarchy or multiplicity adjustment strategy.',
          ['secondary_endpoints', 'primary_endpoint'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('phase_design_mismatch'),
    dimension: 'consistency',
    title: 'Phase/Design Mismatch',
    question: 'The sponsor indicates this is a Phase 1 study, yet the design type is described as a randomized controlled trial. Can the sponsor explain how a dose-escalation phase is consistent with this trial design?',
    check(answers) {
      const phase = String(answers.phase ?? '').toLowerCase();
      const design = String(answers.design_type ?? '').toLowerCase();
      if (
        phase.includes('1') &&
        !phase.includes('2') &&
        (design.includes('randomized') || design.includes('rct') || design.includes('controlled'))
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Phase "${answers.phase}" is paired with design type "${answers.design_type}", which is uncommon for early-phase studies.`,
          'The study design should be appropriate for the stated development phase per ICH E8 Section 3.1.3.1.',
          'ICH E8(R1) Section 3.1.3.1; FDA Guidance for Industry: Phase 1 Investigations (2015)',
          'Reconcile the study phase with an appropriate design. Phase 1 studies typically use open-label, sequential dose-escalation designs.',
          ['phase', 'design_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('arms_vs_control'),
    dimension: 'consistency',
    title: 'Number of Arms Inconsistent with Control Type',
    question: 'The protocol states this is a single-arm study, yet a placebo control is specified. How does the sponsor reconcile a single arm with a controlled design?',
    check(answers) {
      const arms = numericVal(answers.number_of_arms);
      const controlType = String(answers.control_type ?? '').toLowerCase();
      if (arms !== null && arms <= 1 && controlType && controlType !== 'none' && controlType !== 'uncontrolled') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Number of arms is ${arms} but control type is "${answers.control_type}". These are contradictory.`,
          'The number of treatment arms must be consistent with the control strategy per ICH E10 Section 2.1.',
          'ICH E10 Section 2.1; ICH E9(R1) Section 3',
          'Increase the number of arms to accommodate the control group, or change the control type to "none" for a single-arm study.',
          ['number_of_arms', 'control_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('blinding_open_label_placebo'),
    dimension: 'consistency',
    title: 'Open-Label Study with Placebo Control',
    question: 'The sponsor describes an open-label design with a placebo control. How does the sponsor intend to mitigate the substantial bias introduced by subjects knowing they are receiving placebo in an unblinded setting?',
    check(answers) {
      const blinding = String(answers.blinding_type ?? '').toLowerCase();
      const control = String(answers.control_type ?? '').toLowerCase();
      if (
        (blinding.includes('open') || blinding === 'none') &&
        control.includes('placebo')
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Blinding is "${answers.blinding_type}" while control type is "${answers.control_type}". Open-label placebo-controlled designs introduce significant expectation bias.`,
          'ICH E9 Section 2.3.2 requires that blinding be appropriate to minimize bias when using placebo controls.',
          'ICH E9 Section 2.3.2; ICH E10 Section 2.1.3',
          'Either implement blinding (at minimum single-blind) or replace the placebo arm with an active comparator if blinding is infeasible.',
          ['blinding_type', 'control_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('randomization_single_arm'),
    dimension: 'consistency',
    title: 'Randomization Ratio Specified for Single-Arm Study',
    question: 'The protocol describes a randomization ratio for a study that appears to have only one arm. Can the sponsor clarify this apparent inconsistency?',
    check(answers) {
      const arms = numericVal(answers.number_of_arms);
      const ratio = answers.randomization_ratio;
      if (arms !== null && arms <= 1 && !isBlank(ratio)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Randomization ratio "${ratio}" is specified but the study has only ${arms} arm(s). Randomization requires at least two arms.`,
          'Randomization is applicable only to multi-arm studies per ICH E9 Section 2.3.1.',
          'ICH E9 Section 2.3.1; ICH E10 Section 2.1',
          'Remove the randomization ratio for a single-arm study, or increase the number of arms and define the randomization scheme.',
          ['randomization_ratio', 'number_of_arms'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (3 rules) ========== */
  {
    id: rid('no_phase'),
    dimension: 'regulatory_alignment',
    title: 'Study Phase Not Declared',
    question: 'The protocol does not identify the clinical development phase. Under 21 CFR 312.23, how does the sponsor expect the Agency to evaluate whether the proposed investigation is appropriate for the current stage of development?',
    check(answers) {
      if (isBlank(answers.phase)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No clinical development phase is specified in the protocol.',
          'The study phase must be declared per 21 CFR 312.23(a)(6)(iii)(a) to allow FDA to assess developmental appropriateness.',
          '21 CFR 312.23(a)(6)(iii)(a); ICH E8(R1) Section 3',
          'Declare the study phase (Phase 1, 1/2, 2, 2/3, 3, or 4) and ensure the protocol design is consistent with that phase.',
          ['phase'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_safety_monitoring'),
    dimension: 'regulatory_alignment',
    title: 'Safety Monitoring Plan Absent',
    question: 'The protocol lacks a safety monitoring plan. How does the sponsor intend to meet its obligations under 21 CFR 312.32 for expedited reporting and ongoing safety evaluation?',
    check(answers) {
      if (isBlank(answers.safety_monitoring)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No safety monitoring procedures are described.',
          'A safety monitoring plan is required per 21 CFR 312.32 and ICH E6(R2) Section 4.11 to ensure timely detection and reporting of adverse events.',
          '21 CFR 312.32; ICH E6(R2) Section 4.11; ICH E2A',
          'Develop a comprehensive safety monitoring plan including AE/SAE definitions, grading criteria (e.g., CTCAE v5.0), reporting timelines, and procedures for safety signal detection.',
          ['safety_monitoring'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_dmc_phase3'),
    dimension: 'regulatory_alignment',
    title: 'No Data Monitoring Committee for Phase 3',
    question: 'This Phase 3 pivotal trial lacks a Data Monitoring Committee. Given the large patient population at risk, can the sponsor justify why independent safety oversight is unnecessary?',
    check(answers) {
      const phase = String(answers.phase ?? '').toLowerCase();
      const dmcPlanned = answers.dmc_planned;
      if (
        (phase.includes('3') || phase.includes('iii')) &&
        (dmcPlanned === false || dmcPlanned === 'no' || dmcPlanned === 'No' || isBlank(dmcPlanned))
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Phase "${answers.phase}" trial without DMC. FDA strongly recommends independent data monitoring for pivotal studies.`,
          'FDA Guidance "Establishment and Operation of Clinical Trial Data Monitoring Committees" (2006) recommends DMCs for controlled trials intended to support marketing applications.',
          'FDA Guidance: Data Monitoring Committees (2006); ICH E9 Section 4.5; 21 CFR 312.21(c)',
          'Establish an independent DMC with a charter defining membership, meeting schedule, statistical analysis plan for interim looks, and stopping boundaries.',
          ['dmc_planned', 'phase'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (5 rules) ========== */
  {
    id: rid('no_primary_endpoint'),
    dimension: 'scientific_rigor',
    title: 'Primary Endpoint Not Defined',
    question: 'Without a defined primary endpoint, how does the sponsor propose the Agency evaluate the efficacy of the investigational product? This is a fundamental deficiency.',
    check(answers) {
      if (isBlank(answers.primary_endpoint)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No primary efficacy endpoint is specified.',
          'A clearly defined primary endpoint is required per ICH E9 Section 2.2.1 to allow determination of treatment effect.',
          'ICH E9 Section 2.2.1; 21 CFR 314.126(b)(2)(v)',
          'Define a specific, measurable primary endpoint with clear assessment criteria, time point of evaluation, and clinical relevance justification.',
          ['primary_endpoint', 'primary_endpoint_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_sample_size'),
    dimension: 'scientific_rigor',
    title: 'Sample Size Not Specified',
    question: 'The protocol does not specify a target sample size. Without a pre-specified sample size based on power calculations, how can the Agency have confidence this study is adequately powered to detect a clinically meaningful treatment effect?',
    check(answers) {
      if (isBlank(answers.sample_size)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Target enrollment / sample size is not provided.',
          'A justified sample size based on power analysis is required per ICH E9 Section 3.5.',
          'ICH E9 Section 3.5; FDA Guidance: Adaptive Designs (2019)',
          'Provide a formal sample size calculation including effect size assumptions, power (typically >= 80%), alpha level, expected dropout rate, and the statistical test to be used.',
          ['sample_size', 'power', 'alpha', 'dropout_rate'],
        );
      }
      return null;
    },
  },
  {
    id: rid('low_statistical_power'),
    dimension: 'scientific_rigor',
    title: 'Inadequate Statistical Power',
    question: 'The proposed study power falls below the generally accepted threshold of 80%. Can the sponsor provide scientific justification for why an underpowered study is appropriate?',
    check(answers) {
      const power = numericVal(answers.power);
      if (power !== null && power < 80) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          `The proposed study power of ${power}% falls below the generally accepted threshold of 80%. Can the sponsor provide scientific justification for why an underpowered study is appropriate?`,
          `Statistical power is set at ${power}%, which is below the conventional minimum of 80%.`,
          'ICH E9 Section 3.5 recommends adequate power, conventionally at least 80%, to detect clinically meaningful differences.',
          'ICH E9 Section 3.5; ICH E9(R1) Addendum',
          'Increase sample size to achieve at least 80% power, or provide robust scientific justification for a lower-powered study with sensitivity analyses.',
          ['power', 'sample_size', 'alpha'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_statistical_method'),
    dimension: 'scientific_rigor',
    title: 'Statistical Method Not Pre-Specified',
    question: 'The protocol does not pre-specify the primary statistical analysis method. Without this, how does the sponsor intend to avoid post-hoc selection of favorable analyses, which constitutes a significant source of multiplicity-related bias?',
    check(answers) {
      if (isBlank(answers.statistical_method)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No primary statistical analysis method is declared in the protocol.',
          'Pre-specification of statistical methods is required per ICH E9 Section 5.1 and 21 CFR 314.126(b)(2)(v).',
          'ICH E9 Section 5.1; 21 CFR 314.126(b)(2)(v); ICH E9(R1)',
          'Pre-specify the primary analysis method (e.g., ANCOVA, mixed model for repeated measures, Cox regression) along with handling of missing data, multiplicity adjustments, and sensitivity analyses.',
          ['statistical_method', 'primary_endpoint'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_stratification_multiarm'),
    dimension: 'scientific_rigor',
    title: 'No Stratification Factors in Multi-Arm Study',
    question: 'The protocol describes a multi-arm trial but does not pre-specify stratification factors. Without stratification, imbalances in key prognostic variables across treatment arms may confound the primary analysis. How does the sponsor intend to ensure balanced randomization?',
    check(answers) {
      const arms = numericVal(answers.number_of_arms);
      if (arms !== null && arms >= 2 && isBlank(answers.stratification_factors)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          `Multi-arm study with ${arms} arms but no stratification factors defined. Important prognostic variables may be imbalanced across arms.`,
          'ICH E9 Section 2.3.1 recommends stratified randomization to ensure balance in key prognostic factors.',
          'ICH E9 Section 2.3.1; FDA Guidance: Adaptive Designs (2019) Section IV.A',
          'Pre-specify stratification factors based on known prognostic variables (e.g., disease severity, prior therapy, geographic region). Limit the number of stratification factors to avoid thin strata.',
          ['stratification_factors', 'number_of_arms', 'randomization_ratio'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (3 rules) ========== */
  {
    id: rid('sample_size_feasibility'),
    dimension: 'practical_feasibility',
    title: 'Enrollment Feasibility Concern',
    question: 'The proposed sample size appears ambitious given the indication. Has the sponsor conducted a feasibility analysis to confirm this enrollment target is achievable within the planned study timeline?',
    check(answers) {
      const n = numericVal(answers.sample_size);
      if (n !== null && n > 5000) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          `The proposed sample size of ${n} patients appears ambitious given the indication. Has the sponsor conducted a feasibility analysis to confirm this enrollment target is achievable within the planned study timeline?`,
          `Target enrollment of ${n} is very large and may present recruitment challenges.`,
          'ICH E6(R2) Section 6.7 requires the sponsor to ensure feasibility. Large enrollment targets increase risk of protocol amendments, timeline delays, and data quality issues.',
          'ICH E6(R2) Section 6.7; FDA Guidance: Enhancing the Diversity of Clinical Trial Populations (2020)',
          'Provide a recruitment feasibility analysis including number of planned sites, competitive enrollment landscape, and contingency plans if enrollment is slower than expected.',
          ['sample_size', 'target_population_description'],
        );
      }
      return null;
    },
  },
  {
    id: rid('unrealistic_dropout'),
    dimension: 'practical_feasibility',
    title: 'Dropout Rate Assumption Unrealistically Low',
    question: 'The assumed dropout rate is substantially below what is typically observed in this type of trial. If actual dropout exceeds this assumption, the study may be critically underpowered. What is the evidentiary basis for this assumption?',
    check(answers) {
      const rate = numericVal(answers.dropout_rate);
      const duration = numericVal(answers.treatment_duration);
      // Flag if dropout < 5% for studies > 12 weeks or if dropout < 3% regardless
      if (rate !== null && (rate < 3 || (rate < 5 && duration !== null && duration > 12))) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          `The assumed dropout rate of ${rate}% is substantially below what is typically observed in this type of trial. If actual dropout exceeds this assumption, the study may be critically underpowered. What is the evidentiary basis for this assumption?`,
          `Assumed dropout rate of ${rate}% is unusually low, especially for a study with treatment duration of ${duration ?? 'unspecified'} weeks.`,
          'ICH E9 Section 3.5 requires realistic dropout assumptions in sample size calculations. Published meta-analyses show average dropout rates of 15-25% for most therapeutic areas.',
          'ICH E9 Section 3.5; FDA Guidance: Missing Data in Confirmatory Clinical Trials (2020)',
          'Review published dropout rates for similar trials in this indication and adjust the sample size calculation accordingly. Consider a sensitivity analysis at higher dropout rates.',
          ['dropout_rate', 'sample_size', 'treatment_duration'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_visit_schedule'),
    dimension: 'practical_feasibility',
    title: 'Visit Schedule Not Defined',
    question: 'The protocol does not include a visit schedule. Without clear visit windows, how will sites consistently collect endpoint data, and how will the sponsor manage protocol deviations related to timing?',
    check(answers) {
      if (isBlank(answers.visit_schedule)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No visit schedule or schedule of assessments is provided.',
          'A study visit schedule is expected per ICH E6(R2) Section 6.4.1 to ensure consistent data collection across investigational sites.',
          'ICH E6(R2) Section 6.4.1; ICH E8(R1) Section 4',
          'Develop a visit schedule (schedule of assessments) including visit windows, required assessments at each visit, and allowable deviations from planned visit dates.',
          ['visit_schedule'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (2 rules) ========== */
  {
    id: rid('missing_inclusion_criteria'),
    dimension: 'documentation',
    title: 'Inclusion Criteria Absent',
    question: 'The protocol does not define inclusion criteria. Under 21 CFR 312.23(a)(6)(iii)(c), how does the sponsor plan to ensure a consistent and appropriate study population without pre-specified enrollment criteria?',
    check(answers) {
      if (isBlank(answers.inclusion_criteria)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Inclusion criteria are not documented in the protocol.',
          'Inclusion criteria are mandatory per 21 CFR 312.23(a)(6)(iii)(c) and ICH E6(R2) Section 6.5.1.',
          '21 CFR 312.23(a)(6)(iii)(c); ICH E6(R2) Section 6.5.1',
          'Define clear, measurable inclusion criteria covering diagnosis confirmation, age range, disease severity, and any required baseline assessments.',
          ['inclusion_criteria', 'target_population_description'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_exclusion_criteria'),
    dimension: 'documentation',
    title: 'Exclusion Criteria Absent',
    question: 'The protocol does not specify exclusion criteria. Without clear exclusion criteria, how will the sponsor protect vulnerable subjects and ensure interpretable results by excluding confounding conditions?',
    check(answers) {
      if (isBlank(answers.exclusion_criteria)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Exclusion criteria are not provided.',
          'Exclusion criteria are required per 21 CFR 312.23(a)(6)(iii)(c) and ICH E6(R2) Section 6.5.2 to protect subject safety and ensure scientific validity.',
          '21 CFR 312.23(a)(6)(iii)(c); ICH E6(R2) Section 6.5.2',
          'Specify exclusion criteria including contraindicated comorbidities, concomitant medications, pregnancy/lactation status, and any safety-related exclusions.',
          ['exclusion_criteria'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (4 rules) ========== */
  {
    id: rid('no_stopping_rules'),
    dimension: 'risk_identification',
    title: 'No Stopping Rules Defined',
    question: 'The protocol does not include pre-specified stopping rules. In the event of unexpected toxicity or overwhelming efficacy, what criteria will the sponsor use to halt enrollment or terminate the study?',
    check(answers) {
      if (isBlank(answers.stopping_rules)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No stopping rules or early termination criteria are defined.',
          'Pre-specified stopping criteria are expected per ICH E9 Section 4.5 and are a fundamental component of patient protection in clinical trials.',
          'ICH E9 Section 4.5; ICH E6(R2) Section 4.11.1; FDA Guidance: Data Monitoring Committees (2006)',
          'Define explicit stopping rules for futility, safety (e.g., maximum tolerated toxicity rate), and optionally efficacy, with associated statistical boundaries (e.g., O\'Brien-Fleming, Lan-DeMets alpha-spending).',
          ['stopping_rules', 'interim_analysis_planned', 'dmc_planned'],
        );
      }
      return null;
    },
  },
  {
    id: rid('interim_no_alpha_adjustment'),
    dimension: 'risk_identification',
    title: 'Interim Analysis without Alpha Adjustment',
    question: 'The protocol describes interim analyses but does not mention adjustment of the Type I error rate. Repeated looks at accumulating data inflate false positive rates. How does the sponsor intend to control the overall alpha?',
    check(answers) {
      const interimPlanned = answers.interim_analysis_planned;
      const alpha = numericVal(answers.alpha);
      const method = String(answers.statistical_method ?? '').toLowerCase();
      if (
        (interimPlanned === true || interimPlanned === 'yes' || interimPlanned === 'Yes') &&
        alpha !== null &&
        alpha >= 0.05 &&
        !method.includes('spending') &&
        !method.includes('alpha adjust') &&
        !method.includes('o\'brien') &&
        !method.includes('group sequential')
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Interim analyses are planned with alpha=${alpha} but no alpha-spending approach is mentioned. Multiple interim looks inflate the overall Type I error rate.`,
          'ICH E9 Section 4.5 requires prospective specification of how the overall alpha is preserved when interim analyses are conducted.',
          'ICH E9 Section 4.5; FDA Guidance: Adaptive Designs for Clinical Trials (2019)',
          'Implement a group-sequential design with an alpha-spending function (e.g., O\'Brien-Fleming or Lan-DeMets). Specify the number of planned interim looks and the corresponding nominal alpha levels.',
          ['interim_analysis_planned', 'alpha', 'statistical_method', 'stopping_rules'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_washout_comparator'),
    dimension: 'risk_identification',
    title: 'No Washout Period for Comparator Drug',
    question: 'The protocol specifies a comparator drug but does not define a washout period. Residual effects from prior therapies may confound efficacy and safety assessments. How does the sponsor address potential carryover effects?',
    check(answers) {
      if (!isBlank(answers.comparator_drug) && isBlank(answers.washout_period)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Comparator drug "${answers.comparator_drug}" is specified but no washout period is defined.`,
          'ICH E9 Section 2.3.4 addresses the need for adequate washout to avoid carryover effects. ICH E10 Section 2.6.1 discusses comparator selection considerations.',
          'ICH E9 Section 2.3.4; ICH E10 Section 2.6.1',
          'Define a washout period of sufficient duration (typically 5 half-lives of the prior therapy) and document the pharmacokinetic rationale.',
          ['washout_period', 'comparator_drug'],
        );
      }
      return null;
    },
  },
  {
    id: rid('narrow_age_range'),
    dimension: 'risk_identification',
    title: 'Narrow Age Range May Limit Generalizability',
    question: 'The proposed age range may exclude populations who would use this drug in clinical practice. Can the sponsor justify this restriction, particularly given FDA\'s focus on inclusive trial populations?',
    check(answers) {
      const ageMin = numericVal(answers.age_range_min);
      const ageMax = numericVal(answers.age_range_max);
      if (ageMin !== null && ageMax !== null) {
        const range = ageMax - ageMin;
        if (range > 0 && range < 20) {
          return finding(
            this.id,
            this.dimension,
            'info',
            this.title,
            `The proposed age range of ${ageMin}-${ageMax} years may exclude populations who would use this drug in clinical practice. Can the sponsor justify this restriction, particularly given FDA's focus on inclusive trial populations?`,
            `Age range of ${ageMin}-${ageMax} years (span of ${range} years) is narrow and may limit the generalizability of study results to broader patient populations.`,
            'FDA Guidance "Enhancing the Diversity of Clinical Trial Populations" (2020) recommends broadening eligibility criteria to improve generalizability.',
            'FDA Guidance: Enhancing the Diversity of Clinical Trial Populations (2020); ICH E7',
            'Broaden the age range unless a narrow range is scientifically justified (e.g., pediatric-only or geriatric-specific indication). Document the rationale for any age restrictions.',
            ['age_range_min', 'age_range_max', 'target_population_description'],
          );
        }
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createProtocolAuditor(): WarGameAuditor {
  return {
    category: 'protocol',
    name: 'FDA Protocol Reviewer',
    description:
      'Simulates an FDA clinical reviewer performing a pre-IND or IND protocol assessment, ' +
      'evaluating completeness, internal consistency, regulatory alignment, scientific rigor, ' +
      'practical feasibility, documentation quality, and risk identification.',
    rules,
  };
}
