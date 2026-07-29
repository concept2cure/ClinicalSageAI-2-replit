/**
 * Risk Management Auditor -- simulates FDA / Notified Body reviewer scrutiny
 * of a Risk Management file per ISO 14971:2019 and ICH Q9(R1).
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * ISO 14971:2019, ISO/TR 24971, ICH Q9(R1), IEC 62366-1, MDR 2017/745
 * Annex I, and FDA Guidance on Risk Analysis.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/risk-management-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'rm_' + suffix;

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
    id: rid('no_hazard_identification'),
    dimension: 'completeness',
    title: 'No Hazard Identification Process',
    question: 'The risk management file does not include a systematic hazard identification process. How does the manufacturer claim to have identified all reasonably foreseeable hazards as required by ISO 14971:2019 Clause 5.4?',
    check(answers) {
      if (isBlank(answers.hazard_identification)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No hazard identification process or hazard list is documented in the risk management file.',
          'ISO 14971:2019 Clause 5.4 requires the manufacturer to identify known and foreseeable hazards associated with the medical device in both normal and fault conditions.',
          'ISO 14971:2019 Clause 5.4; ISO/TR 24971 Clause 5; FDA Guidance: Factors to Consider Regarding Benefit-Risk',
          'Implement a systematic hazard identification process using techniques such as preliminary hazard analysis, brainstorming with cross-functional teams, and review of predicate device adverse event data.',
          ['hazard_identification', 'hazard_list', 'risk_analysis_techniques'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_risk_estimation_matrix'),
    dimension: 'completeness',
    title: 'Risk Estimation Matrix Missing',
    question: 'No risk estimation matrix is provided in the risk management file. Without defined severity and probability scales, how does the manufacturer assign consistent risk levels across all identified hazardous situations?',
    check(answers) {
      if (isBlank(answers.risk_estimation_matrix)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The risk management file does not contain a risk estimation matrix with defined severity and probability scales.',
          'ISO 14971:2019 Clause 5.5 requires risk estimation for each identified hazardous situation using defined severity of harm and probability of occurrence categories.',
          'ISO 14971:2019 Clause 5.5; ISO/TR 24971 Clause 6; ICH Q9(R1) Section 4.2',
          'Develop a risk estimation matrix with clearly defined severity levels (e.g., negligible, marginal, critical, catastrophic) and probability categories supported by available data.',
          ['risk_estimation_matrix', 'severity_scale', 'probability_scale'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_risk_evaluation_criteria'),
    dimension: 'completeness',
    title: 'Risk Evaluation Criteria Not Defined',
    question: 'The risk management plan does not establish criteria for risk acceptability. How does the manufacturer determine whether a risk is acceptable, requires reduction, or is unacceptable without pre-defined evaluation criteria?',
    check(answers) {
      if (isBlank(answers.risk_acceptability_criteria)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No risk acceptability criteria (acceptable / ALARP / unacceptable thresholds) are defined in the risk management plan.',
          'ISO 14971:2019 Clause 4.4 requires the risk management plan to include criteria for risk acceptability based on the state of the art and known stakeholder concerns.',
          'ISO 14971:2019 Clause 4.4; ISO/TR 24971 Clause 4.4; ICH Q9(R1) Section 4.3',
          'Define explicit risk acceptability criteria in the risk management plan, including the boundary between acceptable and unacceptable risk regions and the ALARP zone.',
          ['risk_acceptability_criteria', 'risk_management_plan'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_fmea_fta'),
    dimension: 'completeness',
    title: 'No FMEA or FTA Performed',
    question: 'The file does not reference any Failure Mode and Effects Analysis (FMEA) or Fault Tree Analysis (FTA). Can the manufacturer demonstrate that all potential failure modes and their effects have been systematically analyzed?',
    check(answers) {
      if (isBlank(answers.fmea) && isBlank(answers.fta) && isBlank(answers.risk_analysis_techniques)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Neither FMEA, FTA, nor any other systematic risk analysis technique is documented in the risk management file.',
          'ISO 14971:2019 Clause 5.4 requires systematic techniques for hazard identification. ISO/TR 24971 recommends FMEA, FTA, HAZOP, or equivalent methods.',
          'ISO 14971:2019 Clause 5.4; ISO/TR 24971 Annex A; IEC 60812 (FMEA); IEC 61025 (FTA)',
          'Conduct at least one systematic risk analysis (FMEA, FTA, or HAZOP) covering design, manufacturing, and use-related failure modes. Document the methodology, participants, and outputs.',
          ['fmea', 'fta', 'risk_analysis_techniques'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('severity_rating_inconsistent'),
    dimension: 'consistency',
    title: 'Severity Ratings Inconsistent Across Hazards',
    question: 'The severity ratings assigned to similar hazardous situations vary without clear justification. How does the manufacturer ensure consistent application of severity categories when identical harms receive different ratings?',
    check(answers) {
      const severityInconsistency = answers.severity_inconsistencies ?? answers.severity_rating_issues;
      if (!isBlank(severityInconsistency)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Severity rating inconsistencies have been identified: ${severityInconsistency}. Similar harms are assigned different severity levels without documented rationale.`,
          'ISO 14971:2019 Clause 5.5 requires consistent application of severity categories. The risk estimation process shall be repeatable and traceable.',
          'ISO 14971:2019 Clause 5.5; ISO/TR 24971 Clause 6.2',
          'Review all severity assignments for consistency. Create a severity calibration table with explicit examples for each severity level and retrain the risk team.',
          ['severity_inconsistencies', 'severity_scale', 'risk_estimation_matrix'],
        );
      }
      return null;
    },
  },
  {
    id: rid('probability_not_data_supported'),
    dimension: 'consistency',
    title: 'Probability Estimates Not Supported by Data',
    question: 'Probability of occurrence estimates appear to be assigned without supporting evidence from clinical data, complaint history, or literature. What data sources justify the chosen probability levels?',
    check(answers) {
      if (isBlank(answers.probability_data_sources)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Probability estimates in the risk analysis are not substantiated by clinical data, complaint trending, literature review, or predicate device history.',
          'ISO 14971:2019 Clause 5.5 requires that probability of occurrence be estimated using available data. Where data are unavailable, the rationale for the estimate shall be documented.',
          'ISO 14971:2019 Clause 5.5; ISO/TR 24971 Clause 6.3; FDA Guidance: Factors to Consider Regarding Benefit-Risk',
          'Support probability estimates with quantitative data from complaint databases (MAUDE), published literature, bench testing, or clinical study data. Where data are insufficient, clearly document assumptions.',
          ['probability_data_sources', 'probability_scale', 'clinical_data_references'],
        );
      }
      return null;
    },
  },
  {
    id: rid('controls_not_traced_to_hazards'),
    dimension: 'consistency',
    title: 'Risk Controls Not Traced to Hazards',
    question: 'Risk control measures are listed but not clearly traced back to specific identified hazards. How does the manufacturer demonstrate that each identified hazard has been addressed and that no hazard lacks a corresponding risk control?',
    check(answers) {
      if (isBlank(answers.hazard_control_traceability)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The risk management file does not contain a traceability matrix linking risk control measures to their corresponding identified hazards.',
          'ISO 14971:2019 Clause 7.1 requires implementation of risk control measures for each risk requiring reduction, with traceability to the hazardous situation being addressed.',
          'ISO 14971:2019 Clause 7.1; ISO 14971:2019 Clause 9 (traceability); MDR 2017/745 Annex II Section 4',
          'Create a comprehensive traceability matrix mapping each identified hazard to its risk control measures, verification activities, and resulting residual risk level.',
          ['hazard_control_traceability', 'risk_controls', 'hazard_list'],
        );
      }
      return null;
    },
  },
  {
    id: rid('pre_post_mitigation_mismatch'),
    dimension: 'consistency',
    title: 'Pre- and Post-Mitigation Risk Levels Illogical',
    question: 'Several risk items show post-mitigation severity levels that are lower than pre-mitigation severity. Since risk controls cannot reduce the inherent severity of a harm, only its probability, how does the manufacturer explain these reductions?',
    check(answers) {
      const severityReductions = answers.severity_reduced_by_controls;
      if (severityReductions === true || severityReductions === 'yes' || severityReductions === 'Yes') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Post-mitigation severity levels are shown as lower than pre-mitigation levels for some hazards. Risk controls typically reduce probability of occurrence, not severity of harm.',
          'ISO 14971:2019 Clause 5.5 distinguishes between severity and probability. Severity is an intrinsic property of the harm and generally cannot be reduced by risk control measures.',
          'ISO 14971:2019 Clause 5.5; ISO/TR 24971 Clause 6.2; ICH Q9(R1) Section 4.2',
          'Review all risk entries where severity was reduced post-mitigation. Unless the control changes the nature of the potential harm itself, only the probability component should change.',
          ['severity_reduced_by_controls', 'risk_estimation_matrix', 'risk_controls'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (4 rules) ========== */
  {
    id: rid('iso14971_not_referenced'),
    dimension: 'regulatory_alignment',
    title: 'ISO 14971:2019 Not Referenced',
    question: 'The risk management file does not reference ISO 14971:2019 as the governing standard. Under which standard was this risk management process conducted, and how does the manufacturer claim compliance with current regulatory expectations?',
    check(answers) {
      const standards = String(answers.risk_management_standard ?? '').toLowerCase();
      if (isBlank(answers.risk_management_standard) || (!standards.includes('14971') && !standards.includes('iso 14971'))) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'ISO 14971:2019 is not cited as the governing standard for the risk management process.',
          'ISO 14971:2019 is the harmonized standard for medical device risk management recognized by FDA (via the RHTF) and under EU MDR 2017/745. Compliance is a regulatory expectation.',
          'ISO 14971:2019; MDR 2017/745 Article 10(2); FDA Guidance: Factors to Consider Regarding Benefit-Risk',
          'Explicitly reference ISO 14971:2019 in the risk management plan and ensure all process steps align with its clauses.',
          ['risk_management_standard', 'risk_management_plan'],
        );
      }
      return null;
    },
  },
  {
    id: rid('alarp_not_demonstrated'),
    dimension: 'regulatory_alignment',
    title: 'ALARP Principle Not Demonstrated',
    question: 'The risk management file does not demonstrate that residual risks have been reduced to as low as reasonably practicable (ALARP). How does the manufacturer justify that no further risk reduction is feasible for risks in the ALARP region?',
    check(answers) {
      if (isBlank(answers.alarp_demonstration)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No evidence of ALARP demonstration is provided for risks falling in the conditionally acceptable region.',
          'ISO 14971:2019 Clause 7.4 requires that when further risk reduction is practicable, it shall be implemented regardless of whether the risk is in an acceptable region. The ALARP principle is central to EU MDR expectations.',
          'ISO 14971:2019 Clause 7.4; MDR 2017/745 Annex I Section 2; ISO/TR 24971 Clause 7',
          'For each risk in the ALARP region, document the analysis of further risk reduction options, including why additional measures were deemed not reasonably practicable (cost-benefit analysis, state of the art review).',
          ['alarp_demonstration', 'residual_risks', 'risk_acceptability_criteria'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_gspr_mapping'),
    dimension: 'regulatory_alignment',
    title: 'No MDR Annex I GSPR Mapping',
    question: 'The risk management file does not map identified risks to the General Safety and Performance Requirements (GSPRs) of MDR 2017/745 Annex I. How does the manufacturer demonstrate that risk controls satisfy the essential requirements for the device?',
    check(answers) {
      if (isBlank(answers.gspr_mapping)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No mapping from risk management outputs to MDR 2017/745 Annex I GSPRs is provided.',
          'MDR 2017/745 Article 10(2) and Annex I require that the risk management process address all applicable GSPRs. A traceability matrix linking risks to GSPRs is expected in technical documentation.',
          'MDR 2017/745 Annex I; MDR 2017/745 Annex II Section 4; MDCG 2021-24',
          'Create a GSPR checklist mapping each applicable requirement from MDR Annex I to the corresponding risk control measures and verification evidence in the risk management file.',
          ['gspr_mapping', 'technical_documentation', 'risk_controls'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_benefit_risk_analysis'),
    dimension: 'regulatory_alignment',
    title: 'No Benefit-Risk Analysis per ISO 14971 Clause 8',
    question: 'The file does not contain an overall benefit-risk analysis as required by ISO 14971:2019 Clause 8. How does the manufacturer conclude that the medical benefits of the device outweigh the overall residual risk?',
    check(answers) {
      if (isBlank(answers.benefit_risk_analysis)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No overall benefit-risk analysis evaluating whether the medical benefits outweigh the overall residual risk is documented.',
          'ISO 14971:2019 Clause 8 requires that when individual residual risks are judged acceptable but the overall residual risk has not been evaluated, a benefit-risk analysis shall be performed.',
          'ISO 14971:2019 Clause 8; MDR 2017/745 Annex I Section 1; FDA Guidance: Factors to Consider Regarding Benefit-Risk',
          'Conduct a documented benefit-risk analysis that identifies clinical benefits, weighs them against overall residual risks, and concludes with a justified determination that benefits outweigh risks.',
          ['benefit_risk_analysis', 'residual_risks', 'clinical_benefits'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (4 rules) ========== */
  {
    id: rid('no_quantitative_risk_assessment'),
    dimension: 'scientific_rigor',
    title: 'No Quantitative Risk Assessment',
    question: 'The risk analysis relies entirely on qualitative assessments without any quantitative probability data. For a high-risk device, can the manufacturer justify why quantitative risk estimation was not performed?',
    check(answers) {
      const riskClass = String(answers.device_class ?? '').toLowerCase();
      if (
        isBlank(answers.quantitative_risk_data) &&
        (riskClass.includes('iii') || riskClass.includes('3') || riskClass.includes('iib') || riskClass.includes('2b'))
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Device class "${answers.device_class}" but no quantitative risk data are provided. Higher-risk devices warrant quantitative estimation.`,
          'ISO 14971:2019 Clause 5.5 allows qualitative or quantitative estimation but notes that quantitative methods should be used when sufficient data exist. ICH Q9(R1) Section 4.2 emphasizes data-driven estimation.',
          'ISO 14971:2019 Clause 5.5; ICH Q9(R1) Section 4.2; ISO/TR 24971 Clause 6',
          'Supplement qualitative assessments with quantitative probability data from complaint databases (e.g., MAUDE), clinical studies, reliability testing, or published failure rate data.',
          ['quantitative_risk_data', 'device_class', 'probability_data_sources'],
        );
      }
      return null;
    },
  },
  {
    id: rid('failure_modes_not_systematic'),
    dimension: 'scientific_rigor',
    title: 'Failure Modes Not Systematically Identified',
    question: 'The failure mode analysis appears ad hoc and does not follow a structured methodology. How does the manufacturer ensure that all critical failure modes -- including single-fault and combination-fault conditions -- have been captured?',
    check(answers) {
      if (isBlank(answers.failure_mode_methodology)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No structured methodology for failure mode identification is documented. The analysis may be incomplete if failure modes were identified without a systematic approach.',
          'ISO 14971:2019 Clause 5.4 requires systematic techniques for hazard identification. IEC 60812 provides a standardized methodology for FMEA.',
          'ISO 14971:2019 Clause 5.4; IEC 60812; IEC 61025; ISO/TR 24971 Annex A',
          'Apply a recognized structured methodology (e.g., process FMEA, design FMEA, FTA) with documented worksheets, severity-occurrence-detection ratings, and cross-functional team participation.',
          ['failure_mode_methodology', 'fmea', 'fta', 'risk_analysis_techniques'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_root_cause_analysis'),
    dimension: 'scientific_rigor',
    title: 'No Root Cause Analysis for High-Severity Hazards',
    question: 'High-severity hazards are identified but no root cause analysis is performed to understand underlying causal mechanisms. Without root cause understanding, how does the manufacturer ensure that risk controls address the true source of risk rather than symptoms?',
    check(answers) {
      if (isBlank(answers.root_cause_analysis) && !isBlank(answers.high_severity_hazards)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'High-severity hazards have been identified but no root cause analysis (e.g., fishbone diagram, 5-Why, FTA) is documented.',
          'ISO 14971:2019 Clause 5.4 and ISO/TR 24971 recommend causal analysis for significant hazards to ensure risk controls target root causes rather than proximate events.',
          'ISO 14971:2019 Clause 5.4; ISO/TR 24971 Annex A; ICH Q9(R1) Section 4.1',
          'Perform root cause analysis for all hazards rated as critical or catastrophic severity. Document the causal chain from root cause to hazardous situation to harm.',
          ['root_cause_analysis', 'high_severity_hazards', 'risk_analysis_techniques'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_state_of_art_review'),
    dimension: 'scientific_rigor',
    title: 'No State of the Art Review',
    question: 'The risk management file does not reference a state-of-the-art review. How does the manufacturer demonstrate awareness of current risk mitigation techniques and safety standards applicable to this device type?',
    check(answers) {
      if (isBlank(answers.state_of_art_review)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No state-of-the-art review is documented to support risk evaluation and risk control decisions.',
          'ISO 14971:2019 defines "state of the art" and references it throughout. MDR 2017/745 Annex I Section 2 requires risk reduction reflecting the state of the art.',
          'ISO 14971:2019 Clause 3.28; MDR 2017/745 Annex I Section 2; ISO/TR 24971 Clause 4.2',
          'Conduct and document a state-of-the-art review covering relevant standards, literature, competitor device labeling, regulatory guidance, and clinical best practices for the device type.',
          ['state_of_art_review', 'risk_management_plan'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (4 rules) ========== */
  {
    id: rid('controls_not_implementable'),
    dimension: 'practical_feasibility',
    title: 'Risk Controls Not Implementable',
    question: 'Certain risk control measures described in the file appear impractical given the device design constraints. Has the manufacturer assessed whether proposed controls can actually be implemented without compromising device functionality?',
    check(answers) {
      if (!isBlank(answers.impractical_controls)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Risk control feasibility concerns have been identified: ${answers.impractical_controls}.`,
          'ISO 14971:2019 Clause 7.1 requires that risk control measures be implemented and verified. Controls that are not technically feasible or practical do not constitute effective risk reduction.',
          'ISO 14971:2019 Clause 7.1; ISO/TR 24971 Clause 7.1; ICH Q9(R1) Section 4.4',
          'Review each proposed risk control for technical feasibility. Where controls are impractical, document the engineering rationale and select alternative measures following the risk control hierarchy (inherent safety, protective measures, information for safety).',
          ['impractical_controls', 'risk_controls', 'design_constraints'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_verification_of_effectiveness'),
    dimension: 'practical_feasibility',
    title: 'Risk Control Effectiveness Verification Missing',
    question: 'The file does not provide evidence that risk control measures have been verified for effectiveness. How does the manufacturer confirm that implemented controls actually reduce risk to the intended level?',
    check(answers) {
      if (isBlank(answers.risk_control_verification)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No verification evidence is provided to demonstrate the effectiveness of implemented risk control measures.',
          'ISO 14971:2019 Clause 7.2 requires verification that risk control measures have been implemented and are effective. This is a mandatory step in the risk management process.',
          'ISO 14971:2019 Clause 7.2; ISO/TR 24971 Clause 7.2; MDR 2017/745 Annex I Section 3',
          'For each risk control measure, document the verification method (testing, analysis, inspection), acceptance criteria, results, and conclusion on effectiveness. Cross-reference design verification and validation records.',
          ['risk_control_verification', 'risk_controls', 'verification_records'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_residual_risk_review'),
    dimension: 'practical_feasibility',
    title: 'No Residual Risk Review',
    question: 'After implementing risk controls, the manufacturer has not conducted a documented review of residual risk. How does the manufacturer confirm that residual risks are acceptable and that no new hazards were introduced by the controls?',
    check(answers) {
      if (isBlank(answers.residual_risk_review)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No documented review of residual risks after implementation of risk control measures is provided.',
          'ISO 14971:2019 Clause 7.3 requires evaluation of residual risk after each risk control is implemented, including assessment of whether new hazards or hazardous situations have been introduced.',
          'ISO 14971:2019 Clause 7.3; ISO 14971:2019 Clause 7.5; ISO/TR 24971 Clause 7.3',
          'Conduct and document a residual risk review for every controlled hazard. Evaluate whether new hazards are introduced by controls, confirm residual risk levels against acceptability criteria, and update the risk analysis accordingly.',
          ['residual_risk_review', 'residual_risks', 'risk_controls'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_control_hierarchy'),
    dimension: 'practical_feasibility',
    title: 'Risk Control Option Analysis Hierarchy Not Followed',
    question: 'The risk management file does not demonstrate that risk control measures were selected following the priority order mandated by ISO 14971:2019. Can the manufacturer show that inherent safety by design was considered before protective measures and information for safety?',
    check(answers) {
      if (isBlank(answers.control_hierarchy_evidence)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No evidence that the three-tier risk control hierarchy (inherent safety, protective measures, information for safety) was systematically applied.',
          'ISO 14971:2019 Clause 7.1 mandates a prioritized sequence: (a) inherent safety by design, (b) protective measures in the device or manufacturing process, (c) information for safety. Skipping to lower-priority controls without justification is a non-conformity.',
          'ISO 14971:2019 Clause 7.1; MDR 2017/745 Annex I Section 4; ISO/TR 24971 Clause 7.1',
          'For each risk control measure, document why higher-priority options were considered first. If inherent safety by design was not feasible, state the rationale before adopting protective measures or labeling-based controls.',
          ['control_hierarchy_evidence', 'risk_controls', 'design_constraints'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (4 rules) ========== */
  {
    id: rid('no_risk_management_plan'),
    dimension: 'documentation',
    title: 'Risk Management Plan Missing',
    question: 'The risk management file does not contain a risk management plan. Without a plan defining scope, responsibilities, and criteria, how was the risk management process initiated and governed?',
    check(answers) {
      if (isBlank(answers.risk_management_plan)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No risk management plan is present in the risk management file.',
          'ISO 14971:2019 Clause 4.4 requires a documented risk management plan that includes scope, assignment of responsibilities, review requirements, risk acceptability criteria, verification and validation activities, and collection of production and post-production information.',
          'ISO 14971:2019 Clause 4.4; MDR 2017/745 Annex II Section 4; ISO/TR 24971 Clause 4.4',
          'Create a risk management plan covering: scope of the risk management activities, roles and responsibilities, review milestones, acceptability criteria, lifecycle phases, and reference to applicable standards.',
          ['risk_management_plan', 'risk_management_standard'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_risk_management_report'),
    dimension: 'documentation',
    title: 'Risk Management Report Missing',
    question: 'The risk management file lacks a risk management report summarizing the results. How does the manufacturer provide top management with evidence that the risk management process has been completed and the overall residual risk is acceptable?',
    check(answers) {
      if (isBlank(answers.risk_management_report)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No risk management report is provided as the concluding document of the risk management process.',
          'ISO 14971:2019 Clause 9 requires a risk management report that reviews the risk management plan, confirms all planned activities have been completed, and states whether the overall residual risk is acceptable.',
          'ISO 14971:2019 Clause 9; ISO/TR 24971 Clause 9; MDR 2017/745 Annex II Section 4',
          'Prepare a risk management report that summarizes: completeness of the risk management plan execution, overall residual risk evaluation, benefit-risk conclusion, and any open items requiring post-market surveillance.',
          ['risk_management_report', 'risk_management_plan', 'residual_risks'],
        );
      }
      return null;
    },
  },
  {
    id: rid('traceability_gaps'),
    dimension: 'documentation',
    title: 'Risk Management Traceability Gaps',
    question: 'The risk management file contains traceability gaps between hazard identification, risk analysis, risk evaluation, risk controls, verification, and residual risk. How does the manufacturer demonstrate end-to-end traceability through the risk management process?',
    check(answers) {
      if (isBlank(answers.traceability_matrix) && isBlank(answers.hazard_control_traceability)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No traceability matrix or equivalent mechanism links hazards through risk analysis, controls, verification, and residual risk documentation.',
          'ISO 14971:2019 Clause 4.5 requires that the risk management file provide traceability for each identified hazard to the risk analysis, risk evaluation, risk control, and residual risk evaluation.',
          'ISO 14971:2019 Clause 4.5; MDR 2017/745 Annex II Section 4; MDCG 2021-24',
          'Develop a comprehensive traceability matrix that links each hazard ID through risk estimation, risk evaluation decision, risk control measure, verification evidence, and post-control residual risk level.',
          ['traceability_matrix', 'hazard_control_traceability', 'risk_management_file'],
        );
      }
      return null;
    },
  },
  {
    id: rid('rm_file_incomplete'),
    dimension: 'documentation',
    title: 'Risk Management File Incomplete',
    question: 'The risk management file is missing one or more mandatory components. Per ISO 14971:2019 Clause 4.5, the file shall contain or reference the risk management plan, risk analysis records, risk evaluation records, risk control records, residual risk evaluation, and the risk management report. Which components are absent?',
    check(answers) {
      const requiredComponents = [
        answers.risk_management_plan,
        answers.hazard_identification,
        answers.risk_estimation_matrix,
        answers.risk_controls,
        answers.residual_risks,
        answers.risk_management_report,
      ];
      const missingCount = requiredComponents.filter(c => isBlank(c)).length;
      if (missingCount >= 3) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `The risk management file is missing ${missingCount} of 6 key components. This constitutes a substantially incomplete risk management file.`,
          'ISO 14971:2019 Clause 4.5 specifies the required contents of the risk management file. All elements must be present or referenced for the file to be considered complete.',
          'ISO 14971:2019 Clause 4.5; MDR 2017/745 Annex II Section 4; FDA 21 CFR 820.30(g)',
          'Conduct a gap analysis against ISO 14971:2019 Clause 4.5 requirements. Systematically create or reference all missing components before the file can be considered audit-ready.',
          ['risk_management_plan', 'hazard_identification', 'risk_estimation_matrix', 'risk_controls', 'residual_risks', 'risk_management_report'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (4 rules) ========== */
  {
    id: rid('no_post_production_monitoring'),
    dimension: 'risk_identification',
    title: 'No Post-Production Monitoring Plan',
    question: 'The risk management file does not include a plan for post-production monitoring. How does the manufacturer intend to collect and evaluate real-world information on risks after the device is placed on the market?',
    check(answers) {
      if (isBlank(answers.post_production_monitoring)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No post-production monitoring plan or post-market surveillance strategy is linked to the risk management process.',
          'ISO 14971:2019 Clause 10 requires establishment and documentation of a system to collect and review production and post-production information relevant to the device safety.',
          'ISO 14971:2019 Clause 10; MDR 2017/745 Article 83-86 (PMS/PMCF); FDA 21 CFR 803 (MDR reporting)',
          'Develop a post-production monitoring plan that defines data sources (complaint handling, vigilance reports, literature review, registry data), review frequency, and criteria for triggering risk management file updates.',
          ['post_production_monitoring', 'pms_plan', 'vigilance_system'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_use_error_analysis'),
    dimension: 'risk_identification',
    title: 'No Systematic Use Error Analysis (IEC 62366)',
    question: 'The risk analysis does not systematically address use errors and human factors. Given that use error is a leading contributor to medical device adverse events, how does the manufacturer identify and mitigate use-related risks?',
    check(answers) {
      if (isBlank(answers.use_error_analysis) && isBlank(answers.usability_engineering)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No systematic use error analysis or usability engineering process (per IEC 62366-1) is linked to the risk management file.',
          'IEC 62366-1:2015 requires a usability engineering process that identifies use errors and integrates with the risk management process per ISO 14971. Use-related risks must be systematically addressed.',
          'IEC 62366-1:2015; ISO 14971:2019 Clause 5.4; FDA Guidance: Applying Human Factors and Usability Engineering (2016)',
          'Conduct a use-related risk analysis per IEC 62366-1, including use scenarios, task analysis, known use problems, and integration of findings into the ISO 14971 risk management process.',
          ['use_error_analysis', 'usability_engineering', 'human_factors'],
        );
      }
      return null;
    },
  },
  {
    id: rid('emerging_risks_not_addressed'),
    dimension: 'risk_identification',
    title: 'Emerging Risks Not Addressed',
    question: 'The risk management file does not address emerging risks such as cybersecurity threats, software-related hazards, or interoperability risks. Has the manufacturer evaluated whether newly recognized risk categories apply to this device?',
    check(answers) {
      if (isBlank(answers.emerging_risks)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No evaluation of emerging or newly recognized risk categories (e.g., cybersecurity, AI/ML-related risks, interoperability, supply chain) is documented.',
          'ISO 14971:2019 Clause 10.3 requires that new or revised information be evaluated for its impact on previously identified risks and for identification of new hazards.',
          'ISO 14971:2019 Clause 10.3; FDA Guidance: Cybersecurity in Medical Devices (2023); IMDRF Guidance on Software as a Medical Device',
          'Evaluate emerging risk categories applicable to the device type (cybersecurity, AI/ML, interoperability, supply chain disruptions) and document the assessment, even if such risks are determined to be not applicable.',
          ['emerging_risks', 'cybersecurity_risk', 'software_risks'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_known_hazards_from_similar_devices'),
    dimension: 'risk_identification',
    title: 'Known Hazards from Similar Devices Not Reviewed',
    question: 'The risk management file does not reference adverse event data or known hazards from similar or predicate devices. How does the manufacturer ensure that lessons learned from the market history of comparable devices have been incorporated into the hazard identification?',
    check(answers) {
      if (isBlank(answers.similar_device_hazards) && isBlank(answers.predicate_adverse_events)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No review of adverse events, recalls, or known hazards from similar or predicate devices is documented in the risk management file.',
          'ISO 14971:2019 Clause 5.4 requires consideration of hazards associated with similar medical devices. ISO/TR 24971 recommends review of adverse event databases and field safety corrective actions.',
          'ISO 14971:2019 Clause 5.4; ISO/TR 24971 Clause 5; FDA MAUDE Database; MDR 2017/745 Article 88 (trend reporting)',
          'Conduct a review of adverse event databases (MAUDE, BfArM, MHRA), recall databases, and published literature for similar devices. Incorporate identified hazards into the risk analysis.',
          ['similar_device_hazards', 'predicate_adverse_events', 'hazard_list'],
        );
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createRiskManagementAuditor(): WarGameAuditor {
  return {
    category: 'risk_management',
    name: 'FDA / Notified Body Risk Management Reviewer',
    description:
      'Simulates an FDA or Notified Body reviewer scrutinizing a Risk Management file ' +
      'per ISO 14971:2019 and ICH Q9(R1), evaluating completeness of hazard identification, ' +
      'consistency of risk estimation, regulatory alignment with ISO 14971 / MDR Annex I, ' +
      'scientific rigor of risk analysis, practical feasibility of risk controls, ' +
      'documentation quality of the risk management file, and risk identification gaps.',
    rules,
  };
}
