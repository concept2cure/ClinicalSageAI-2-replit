/**
 * PMA Auditor -- simulates FDA reviewer scrutiny of a Premarket Approval
 * Application (PMA) per 21 CFR 814.
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * actual FDA regulations (21 CFR 814, 21 CFR 820), ISO standards (13485,
 * 14971, 10993), IEC standards (62304, 60601), and FDA Guidance documents.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/pma-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'pma_' + suffix;

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
  /* ========== COMPLETENESS (5 rules) ========== */
  {
    id: rid('no_pivotal_study'),
    dimension: 'completeness',
    title: 'No Pivotal Clinical Study',
    question: 'The PMA submission does not reference a pivotal clinical study demonstrating reasonable assurance of safety and effectiveness. How does the applicant intend to meet the evidentiary burden for a Class III device without pivotal clinical data?',
    check(answers) {
      if (isBlank(answers.pivotal_study_id) && isBlank(answers.pivotal_study_summary)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No pivotal clinical study is referenced or summarized in the PMA submission.',
          'A PMA must contain valid scientific evidence, typically including well-controlled clinical investigations, to demonstrate reasonable assurance of safety and effectiveness per 21 CFR 814.20(b)(3)(v) and (b)(6).',
          '21 CFR 814.20(b)(3)(v); 21 CFR 814.20(b)(6); 21 CFR 860.7(c)',
          'Provide a full report of the pivotal clinical investigation(s) including study design, enrollment, endpoints, statistical analysis plan, and results. If relying on non-clinical evidence alone, provide a detailed justification per 21 CFR 860.7(c)(2).',
          ['pivotal_study_id', 'pivotal_study_summary', 'clinical_data'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_bench_testing'),
    dimension: 'completeness',
    title: 'Missing Bench Testing Data',
    question: 'The submission lacks bench testing data characterizing device performance. Without performance verification under simulated use conditions, how can the Agency assess whether the device meets its design specifications?',
    check(answers) {
      if (isBlank(answers.bench_testing_summary) && isBlank(answers.performance_testing)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No bench testing or performance testing data is provided.',
          '21 CFR 814.20(b)(3)(iv) requires non-clinical laboratory studies including bench performance testing to support device safety and effectiveness.',
          '21 CFR 814.20(b)(3)(iv); FDA Guidance: Recommended Content and Format of Non-Clinical Bench Performance Testing Information in PMA Submissions',
          'Include bench testing results covering mechanical, electrical, chemical, and biological performance characteristics as applicable. Test methods should follow recognized consensus standards.',
          ['bench_testing_summary', 'performance_testing'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_biocompatibility'),
    dimension: 'completeness',
    title: 'No Biocompatibility Testing per ISO 10993',
    question: 'The PMA does not include biocompatibility evaluation data. For a device with patient contact, how does the applicant justify the absence of a biological evaluation per ISO 10993?',
    check(answers) {
      if (isBlank(answers.biocompatibility_data) && isBlank(answers.iso_10993_evaluation)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No biocompatibility evaluation per ISO 10993 is included in the submission.',
          'Devices with direct or indirect patient contact require a biological evaluation per 21 CFR 814.20(b)(3)(iv) and FDA-recognized standard ISO 10993-1.',
          '21 CFR 814.20(b)(3)(iv); ISO 10993-1:2018; FDA Guidance: Use of International Standard ISO 10993-1 (2020)',
          'Conduct a biological evaluation per ISO 10993-1, including a risk assessment to determine required endpoints (cytotoxicity, sensitization, irritation, systemic toxicity, etc.) based on device contact type and duration.',
          ['biocompatibility_data', 'iso_10993_evaluation', 'device_contact_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_labeling_draft'),
    dimension: 'completeness',
    title: 'No Labeling Draft Included',
    question: 'The submission does not contain proposed labeling, including the package insert, instructions for use, and any patient labeling. Under 21 CFR 814.20(b)(10), labeling is a required component. How does the applicant plan to address this deficiency?',
    check(answers) {
      if (isBlank(answers.labeling_draft) && isBlank(answers.instructions_for_use)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No proposed labeling or instructions for use are included in the PMA.',
          'Labeling specimens are a required PMA component per 21 CFR 814.20(b)(10), including all labels, instructions for use, and promotional materials.',
          '21 CFR 814.20(b)(10); 21 CFR 801; FDA Guidance: Device Labeling Guidance (2018)',
          'Provide complete proposed labeling including device description, indications for use, contraindications, warnings, precautions, adverse events, instructions for use, and patient labeling as applicable.',
          ['labeling_draft', 'instructions_for_use', 'indications_for_use'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_device_description'),
    dimension: 'completeness',
    title: 'Device Description Incomplete',
    question: 'The PMA lacks a comprehensive device description covering materials, design, principles of operation, and manufacturing methods. How does the applicant expect the Agency to evaluate the device without a thorough technical characterization?',
    check(answers) {
      if (isBlank(answers.device_description)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No comprehensive device description is provided in the submission.',
          'A complete device description is required per 21 CFR 814.20(b)(3)(i), including pictorial representations, engineering drawings, and descriptions of all functional components.',
          '21 CFR 814.20(b)(3)(i)',
          'Provide a complete device description including materials of construction, design features, principles of operation, power source, accessories, component specifications, and photographs or engineering drawings.',
          ['device_description', 'device_components', 'device_materials'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('design_input_output_mismatch'),
    dimension: 'consistency',
    title: 'Design Input/Output Mismatch',
    question: 'The design inputs do not appear to trace to corresponding design outputs. Can the applicant demonstrate that each user need and design requirement has a verified and validated design output, as required under the design controls regulation?',
    check(answers) {
      const hasInputs = !isBlank(answers.design_inputs);
      const hasOutputs = !isBlank(answers.design_outputs);
      if (hasInputs && !hasOutputs) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Design inputs are documented but corresponding design outputs are absent or incomplete, indicating a traceability gap.',
          'Design outputs must satisfy design inputs per 21 CFR 820.30(d), and the relationship must be traceable through a design history file.',
          '21 CFR 820.30(d); 21 CFR 820.30(i); ISO 13485:2016 Section 7.3.4',
          'Complete the design output documentation and establish bidirectional traceability between design inputs, outputs, verification, and validation results in the design history file.',
          ['design_inputs', 'design_outputs', 'traceability_matrix'],
        );
      }
      return null;
    },
  },
  {
    id: rid('ifu_protocol_discrepancy'),
    dimension: 'consistency',
    title: 'IFU vs Clinical Protocol Discrepancy',
    question: 'The instructions for use describe device usage parameters that differ from those specified in the pivotal clinical protocol. Which set of parameters reflects the intended use of the device, and how does the applicant reconcile this inconsistency?',
    check(answers) {
      const ifu = String(answers.instructions_for_use ?? '').toLowerCase();
      const protocol = String(answers.clinical_protocol_summary ?? '').toLowerCase();
      if (!isBlank(answers.instructions_for_use) && !isBlank(answers.clinical_protocol_summary)) {
        const ifuDose = ifu.match(/(\d+)\s*(min|hour|ml|mg|mm)/);
        const protocolDose = protocol.match(/(\d+)\s*(min|hour|ml|mg|mm)/);
        if (ifuDose && protocolDose && ifuDose[0] !== protocolDose[0]) {
          return finding(
            this.id,
            this.dimension,
            'warning',
            this.title,
            this.question,
            `Potential discrepancy detected between IFU parameters ("${ifuDose[0]}") and clinical protocol parameters ("${protocolDose[0]}").`,
            'Labeling must be consistent with the conditions under which the device was clinically evaluated per 21 CFR 814.20(b)(10) and 21 CFR 801.4.',
            '21 CFR 814.20(b)(10); 21 CFR 801.4; FDA Guidance: Device Labeling Guidance (2018)',
            'Reconcile all numerical parameters (dose, duration, frequency, depth, etc.) between the IFU and clinical protocol. Clearly document any approved deviations and their justification.',
            ['instructions_for_use', 'clinical_protocol_summary', 'labeling_draft'],
          );
        }
      }
      return null;
    },
  },
  {
    id: rid('predicate_comparison_gap'),
    dimension: 'consistency',
    title: 'Predicate Device Comparison Incomplete',
    question: 'The PMA references predicate devices but does not provide a systematic comparison of technological characteristics and clinical performance. How does the applicant position this device relative to existing legally marketed devices?',
    check(answers) {
      if (!isBlank(answers.predicate_device) && isBlank(answers.predicate_comparison_table)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'A predicate device is referenced but no systematic comparison of technological and clinical characteristics is provided.',
          'While PMAs do not require substantial equivalence, a thorough comparison to legally marketed devices provides context for the benefit-risk assessment per 21 CFR 814.20(b)(3).',
          '21 CFR 814.20(b)(3); FDA Guidance: PMA Review Process',
          'Provide a comparison table detailing technological characteristics, clinical performance data, indications for use, and safety profiles of the subject device versus referenced predicate or comparator devices.',
          ['predicate_device', 'predicate_comparison_table', 'device_description'],
        );
      }
      return null;
    },
  },
  {
    id: rid('indications_vs_clinical_evidence'),
    dimension: 'consistency',
    title: 'Indications for Use Exceed Clinical Evidence',
    question: 'The proposed indications for use appear broader than the population studied in the pivotal trial. Can the applicant clarify how the clinical evidence supports the full scope of the proposed indications?',
    check(answers) {
      const indications = String(answers.indications_for_use ?? '').toLowerCase();
      const studyPopulation = String(answers.study_population ?? '').toLowerCase();
      if (
        !isBlank(answers.indications_for_use) &&
        !isBlank(answers.study_population) &&
        (indications.includes('all') || indications.includes('general')) &&
        (studyPopulation.includes('adult') || studyPopulation.includes('specific') || studyPopulation.includes('subset'))
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The proposed indications for use may be broader than the clinical study population, potentially extrapolating beyond the evidence base.',
          'Indications for use must be supported by valid scientific evidence from the clinical investigation per 21 CFR 814.20(b)(3)(v) and 21 CFR 860.7(c)(1).',
          '21 CFR 814.20(b)(3)(v); 21 CFR 860.7(c)(1)',
          'Narrow the indications for use to match the population studied in the pivotal trial, or provide additional evidence (e.g., subgroup analyses, supplemental studies) supporting the broader claims.',
          ['indications_for_use', 'study_population', 'pivotal_study_summary'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (5 rules) ========== */
  {
    id: rid('no_presub_meeting'),
    dimension: 'regulatory_alignment',
    title: 'No Pre-Submission Meeting Record',
    question: 'The PMA does not reference a pre-submission (Q-Sub) interaction with the Agency. Given the complexity of PMA reviews, has the applicant engaged FDA prior to submission to align on pivotal study design, endpoints, and acceptance criteria?',
    check(answers) {
      if (isBlank(answers.presub_meeting_id) && isBlank(answers.fda_feedback_reference)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No record of pre-submission meeting or Q-Sub feedback is referenced in the PMA.',
          'FDA strongly recommends pre-submission meetings for PMAs per the Pre-Submission Program Guidance to align on study design and acceptance criteria before pivotal study conduct.',
          '21 CFR 814.20; FDA Guidance: Requests for Feedback and Meetings for Medical Device Submissions (Q-Sub) (2023)',
          'Reference prior Q-Sub interactions and summarize FDA feedback received. If no pre-submission was conducted, strongly consider requesting one to align on any outstanding review questions.',
          ['presub_meeting_id', 'fda_feedback_reference'],
        );
      }
      return null;
    },
  },
  {
    id: rid('panel_track_wrong'),
    dimension: 'regulatory_alignment',
    title: 'Advisory Panel Track Assignment Incorrect',
    question: 'The declared advisory panel classification does not appear to match the device type and indication. Has the applicant verified the correct product code and panel assignment with CDRH?',
    check(answers) {
      if (!isBlank(answers.advisory_panel) && !isBlank(answers.product_code)) {
        const panel = String(answers.advisory_panel).toLowerCase();
        const code = String(answers.product_code).toLowerCase();
        // Flag if panel/code look internally inconsistent (heuristic: panel should relate to device type)
        if (panel.includes('orthop') && code.startsWith('qbj')) {
          return finding(
            this.id,
            this.dimension,
            'warning',
            this.title,
            this.question,
            `Advisory panel "${answers.advisory_panel}" may not align with product code "${answers.product_code}". Misclassification can cause routing to the wrong review division.`,
            'Correct panel assignment is critical for PMA review routing per 21 CFR 814.20(b)(1) and 21 CFR 860 device classification.',
            '21 CFR 814.20(b)(1); 21 CFR 860; FDA Product Classification Database',
            'Verify the product code and advisory panel assignment using the FDA Product Classification Database. Reference the pre-submission feedback confirming panel assignment.',
            ['advisory_panel', 'product_code', 'device_classification'],
          );
        }
      }
      if (!isBlank(answers.device_classification) && isBlank(answers.advisory_panel)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No advisory panel is specified despite the device being classified. Panel assignment is needed for proper review routing.',
          'PMA submissions must identify the advisory panel per 21 CFR 814.20(b)(1).',
          '21 CFR 814.20(b)(1); 21 CFR 860',
          'Specify the correct advisory panel based on the device classification and product code. Consult the FDA Product Classification Database.',
          ['advisory_panel', 'product_code', 'device_classification'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_advisory_committee_prep'),
    dimension: 'regulatory_alignment',
    title: 'Advisory Committee Preparation Missing',
    question: 'This PMA may be referred to an advisory committee panel meeting. Has the applicant prepared an executive summary, presentation materials, and responses to anticipated questions from the panel?',
    check(answers) {
      if (isBlank(answers.advisory_committee_materials) && isBlank(answers.panel_preparation)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No advisory committee preparation materials are included. Many novel PMAs are referred to advisory panel review.',
          'FDA may convene an advisory committee to review a PMA per 21 CFR 814.44(a). Applicants should be prepared for panel review, especially for novel devices.',
          '21 CFR 814.44(a); FDA Guidance: Procedures for Meetings of the Medical Devices Advisory Committee (2017)',
          'Prepare advisory committee materials including an executive summary (per FDA template), presentation slides, backup data, and anticipated questions with draft responses.',
          ['advisory_committee_materials', 'panel_preparation'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_ide_reference'),
    dimension: 'regulatory_alignment',
    title: 'No IDE Reference for Pivotal Study',
    question: 'The pivotal clinical study is not linked to an approved Investigational Device Exemption (IDE). Was the pivotal study conducted under an IDE, and if so, can the applicant provide the IDE number and approval status?',
    check(answers) {
      if (!isBlank(answers.pivotal_study_id) && isBlank(answers.ide_number)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'A pivotal clinical study is referenced but no IDE number or exemption justification is provided.',
          'Significant risk device studies require an approved IDE per 21 CFR 812. The PMA must reference the IDE under which clinical data was collected per 21 CFR 814.20(b)(6).',
          '21 CFR 812; 21 CFR 814.20(b)(6)',
          'Provide the IDE number, date of approval, any IDE supplements, and confirmation that the study was conducted in compliance with IDE requirements and IRB approvals.',
          ['ide_number', 'pivotal_study_id', 'irb_approval'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_clinical_site_compliance'),
    dimension: 'regulatory_alignment',
    title: 'Clinical Site GCP Compliance Not Documented',
    question: 'The submission does not document GCP compliance or IRB oversight at clinical investigation sites. How does the applicant assure the Agency that the pivotal study data are reliable and ethically obtained?',
    check(answers) {
      if (!isBlank(answers.pivotal_study_id) && isBlank(answers.gcp_compliance) && isBlank(answers.irb_approval)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No documentation of GCP compliance or IRB oversight is referenced for the pivotal clinical investigation sites.',
          'Clinical investigations supporting a PMA must comply with GCP requirements per 21 CFR 812, 21 CFR 50, and 21 CFR 56.',
          '21 CFR 812; 21 CFR 50; 21 CFR 56; ICH E6(R2)',
          'Provide documentation of GCP compliance for all clinical sites, including IRB approval letters, monitoring reports, and a statement of compliance with 21 CFR Parts 50 and 56.',
          ['gcp_compliance', 'irb_approval', 'pivotal_study_id'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (5 rules) ========== */
  {
    id: rid('endpoints_not_validated'),
    dimension: 'scientific_rigor',
    title: 'Clinical Endpoints Not Validated',
    question: 'The primary clinical endpoints used in the pivotal study have not been demonstrated to be clinically meaningful or previously validated for this device type. Can the applicant provide evidence of endpoint validation?',
    check(answers) {
      if (isBlank(answers.endpoint_validation) && !isBlank(answers.primary_endpoint)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Primary clinical endpoint is specified but no validation evidence or clinical meaningfulness justification is provided.',
          'Clinical endpoints must be clinically meaningful and appropriate for demonstrating safety and effectiveness per 21 CFR 860.7(e) and FDA endpoint guidance.',
          '21 CFR 860.7(e); FDA Guidance: Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics (adapted for devices); FDA Guidance: Use of Real-World Evidence (2017)',
          'Provide published validation data for the primary endpoint, or include a clinical meaningfulness justification referencing FDA-agreed performance goals from the pre-submission process.',
          ['endpoint_validation', 'primary_endpoint', 'presub_meeting_id'],
        );
      }
      return null;
    },
  },
  {
    id: rid('sample_size_inadequate'),
    dimension: 'scientific_rigor',
    title: 'Sample Size Inadequate for Primary Endpoint',
    question: 'The pivotal study sample size does not appear adequately powered to detect a clinically meaningful difference in the primary endpoint. Can the applicant provide the power analysis assumptions and demonstrate statistical adequacy?',
    check(answers) {
      const n = numericVal(answers.pivotal_sample_size);
      const power = numericVal(answers.statistical_power);
      if ((n !== null && n < 50) || (power !== null && power < 80)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Pivotal study sample size is ${n ?? 'unspecified'} with power of ${power ?? 'unspecified'}%. This may be insufficient to demonstrate safety and effectiveness with adequate statistical confidence.`,
          'PMA pivotal studies must include adequate sample sizes to provide valid scientific evidence per 21 CFR 860.7(c)(2) and statistical guidance for device trials.',
          '21 CFR 860.7(c)(2); FDA Guidance: Design Considerations for Pivotal Clinical Investigations for Medical Devices (2013)',
          'Provide a formal sample size/power calculation including effect size assumptions, clinically meaningful difference, alpha level, expected attrition, and the agreed-upon performance goal from the pre-submission.',
          ['pivotal_sample_size', 'statistical_power', 'primary_endpoint', 'presub_meeting_id'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_bayesian_justification'),
    dimension: 'scientific_rigor',
    title: 'No Bayesian/Adaptive Design Justification',
    question: 'The study employs a Bayesian or adaptive design but does not provide the statistical methodology justification, prior selection rationale, or operating characteristics. How does the applicant demonstrate that the design controls the Type I error rate?',
    check(answers) {
      const design = String(answers.study_design ?? '').toLowerCase();
      if (
        (design.includes('bayesian') || design.includes('adaptive')) &&
        isBlank(answers.adaptive_design_justification)
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'A Bayesian or adaptive study design is described but no statistical justification, simulation results, or operating characteristics are provided.',
          'Bayesian and adaptive designs for device trials require thorough justification per FDA guidance, including prior elicitation, simulation-based operating characteristics, and Type I error control.',
          'FDA Guidance: Adaptive Designs for Medical Device Clinical Studies (2016); FDA Guidance: Bayesian Statistics in Medical Device Clinical Trials (2010)',
          'Provide the complete Bayesian/adaptive design specification including: informative prior justification, simulation study results demonstrating operating characteristics (Type I error, power), interim analysis rules, and stopping boundaries.',
          ['adaptive_design_justification', 'study_design', 'statistical_method'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_performance_goal'),
    dimension: 'scientific_rigor',
    title: 'No Objective Performance Criteria',
    question: 'The PMA does not reference an objective performance criterion (OPC) or performance goal for the primary endpoint analysis. Without a pre-specified success threshold, how will the Agency determine whether the device meets the approval standard?',
    check(answers) {
      if (isBlank(answers.performance_goal) && isBlank(answers.objective_performance_criteria)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No objective performance criterion or performance goal is specified for the primary endpoint.',
          'FDA frequently requires pre-specified performance goals for single-arm PMA studies. These should be agreed upon during the pre-submission process.',
          'FDA Guidance: Design Considerations for Pivotal Clinical Investigations for Medical Devices (2013); 21 CFR 860.7(e)',
          'Specify objective performance criteria for each primary endpoint, referencing historical controls, published literature, or FDA-agreed performance goals from Q-Sub feedback.',
          ['performance_goal', 'objective_performance_criteria', 'primary_endpoint'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_human_factors'),
    dimension: 'scientific_rigor',
    title: 'No Human Factors / Usability Validation',
    question: 'The PMA does not include a human factors validation study. Use-related risks may pose significant safety concerns. Has the applicant conducted usability testing per FDA guidance?',
    check(answers) {
      if (isBlank(answers.human_factors_study) && isBlank(answers.usability_validation)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No human factors validation or usability engineering study is referenced in the PMA submission.',
          'FDA expects human factors validation for devices where use error could cause harm, per the 2016 Human Factors Guidance and IEC 62366-1.',
          'FDA Guidance: Applying Human Factors and Usability Engineering to Medical Devices (2016); IEC 62366-1:2015',
          'Conduct a summative human factors validation study with representative users, use environments, and critical tasks. Include a use-related risk analysis and demonstrate that residual use risks are acceptable.',
          ['human_factors_study', 'usability_validation', 'use_related_risks'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (4 rules) ========== */
  {
    id: rid('no_qms_manufacturing'),
    dimension: 'practical_feasibility',
    title: 'Manufacturing Not Under QMS (ISO 13485)',
    question: 'The PMA does not document that device manufacturing is conducted under a quality management system compliant with 21 CFR 820 and ISO 13485. How does the applicant assure consistent device quality for commercial distribution?',
    check(answers) {
      if (isBlank(answers.qms_certification) && isBlank(answers.iso_13485_status)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No QMS certification or ISO 13485 compliance documentation is provided for the manufacturing facility.',
          'Devices must be manufactured under a quality system per 21 CFR 820 (Quality System Regulation). ISO 13485 certification is expected for PMA-class devices.',
          '21 CFR 820; ISO 13485:2016; 21 CFR 814.20(b)(4)',
          'Provide ISO 13485 certification for all manufacturing facilities, or document compliance with 21 CFR 820 QSR. Include manufacturing process validation data and facility registration information.',
          ['qms_certification', 'iso_13485_status', 'manufacturing_facility'],
        );
      }
      return null;
    },
  },
  {
    id: rid('sterilization_not_validated'),
    dimension: 'practical_feasibility',
    title: 'Sterilization Process Not Validated',
    question: 'For a sterile device, the PMA does not include sterilization validation data. Without validated sterilization, how can the applicant guarantee product sterility at point of use?',
    check(answers) {
      const sterile = String(answers.sterile_device ?? '').toLowerCase();
      if (
        (sterile === 'yes' || sterile === 'true' || sterile.includes('sterile')) &&
        isBlank(answers.sterilization_validation)
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Device is indicated as sterile but no sterilization validation data is provided.',
          'Sterilization processes must be validated per 21 CFR 820.75 and applicable standards (ISO 11135 for EO, ISO 11137 for radiation, ISO 17665 for moist heat).',
          '21 CFR 820.75; ISO 11135; ISO 11137; ISO 17665; 21 CFR 814.20(b)(4)',
          'Provide sterilization validation data including method selection rationale, bioburden characterization, dose/cycle establishment, sterility assurance level (SAL) of 10^-6, and package integrity testing.',
          ['sterilization_validation', 'sterile_device', 'sterilization_method'],
        );
      }
      return null;
    },
  },
  {
    id: rid('supply_chain_not_qualified'),
    dimension: 'practical_feasibility',
    title: 'Supply Chain Not Qualified',
    question: 'The PMA does not include evidence that critical component suppliers and raw material sources have been qualified. How does the applicant manage supply chain risk for a Class III device?',
    check(answers) {
      if (isBlank(answers.supplier_qualification) && isBlank(answers.supply_chain_controls)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No supplier qualification or supply chain control documentation is provided.',
          'Purchasing controls including supplier qualification are required per 21 CFR 820.50 and ISO 13485:2016 Section 7.4.',
          '21 CFR 820.50; ISO 13485:2016 Section 7.4',
          'Document supplier qualification procedures, incoming inspection criteria, approved supplier lists, and contingency plans for critical single-source components.',
          ['supplier_qualification', 'supply_chain_controls'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_shelf_life'),
    dimension: 'practical_feasibility',
    title: 'Shelf Life / Stability Not Established',
    question: 'The PMA does not provide shelf life or stability data. Without demonstrated product stability, how can the applicant ensure device safety and performance through the labeled expiration date?',
    check(answers) {
      if (isBlank(answers.shelf_life_data) && isBlank(answers.stability_testing)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No shelf life determination or stability testing data is included in the submission.',
          'Shelf life validation is required to support expiration dating per 21 CFR 814.20(b)(3)(iv) and applicable standards.',
          '21 CFR 814.20(b)(3)(iv); FDA Guidance: Shelf Life of Medical Devices (1991); ASTM F1980 (accelerated aging)',
          'Provide real-time and/or accelerated aging data supporting the claimed shelf life. Include package integrity testing, sterility maintenance (if applicable), and device performance after aging.',
          ['shelf_life_data', 'stability_testing', 'expiration_date'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (4 rules) ========== */
  {
    id: rid('no_design_history_file'),
    dimension: 'documentation',
    title: 'No Design History File',
    question: 'The PMA does not reference a Design History File (DHF). Under design controls, how does the applicant document the complete design and development history of this Class III device?',
    check(answers) {
      if (isBlank(answers.design_history_file) && isBlank(answers.dhf_reference)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No Design History File (DHF) is referenced or summarized in the PMA.',
          'A DHF containing or referencing the complete design and development records is required per 21 CFR 820.30(j) and is a key element reviewed during PMA assessment.',
          '21 CFR 820.30(j); ISO 13485:2016 Section 7.3.10; FDA Design Control Guidance (1997)',
          'Reference the DHF and provide a DHF index or summary demonstrating that all design control elements (planning, input, output, review, verification, validation, transfer, changes) are documented.',
          ['design_history_file', 'dhf_reference'],
        );
      }
      return null;
    },
  },
  {
    id: rid('vv_incomplete'),
    dimension: 'documentation',
    title: 'Verification & Validation (V&V) Incomplete',
    question: 'The design verification and validation documentation is incomplete. Without thorough V&V, how does the applicant demonstrate that the device meets user needs and its intended use under actual or simulated use conditions?',
    check(answers) {
      if (isBlank(answers.verification_summary) || isBlank(answers.validation_summary)) {
        const missing = [];
        if (isBlank(answers.verification_summary)) missing.push('verification');
        if (isBlank(answers.validation_summary)) missing.push('validation');
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Design ${missing.join(' and ')} documentation is missing or incomplete.`,
          'Design verification and design validation are required per 21 CFR 820.30(e)-(f). Verification confirms outputs meet inputs; validation confirms the device meets user needs under actual or simulated conditions.',
          '21 CFR 820.30(e); 21 CFR 820.30(f); ISO 13485:2016 Sections 7.3.6-7.3.7',
          'Provide complete V&V reports including test protocols, acceptance criteria, results, pass/fail determinations, and traceability to design requirements. Validation must include testing under actual or simulated use conditions.',
          ['verification_summary', 'validation_summary', 'design_inputs'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_traceability_matrix'),
    dimension: 'documentation',
    title: 'No Traceability Matrix',
    question: 'The PMA lacks a requirements traceability matrix linking user needs, design inputs, design outputs, V&V activities, and risk controls. How does the applicant demonstrate complete coverage of all requirements?',
    check(answers) {
      if (isBlank(answers.traceability_matrix)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No requirements traceability matrix is provided in the submission.',
          'A traceability matrix is expected per 21 CFR 820.30(i) design controls and is a key deliverable linking requirements through verification, validation, and risk management.',
          '21 CFR 820.30(i); ISO 13485:2016 Section 7.3.9; FDA Design Control Guidance (1997)',
          'Create a bidirectional traceability matrix linking: user needs -> design inputs -> design outputs -> V&V protocols -> V&V results -> risk controls. Demonstrate complete coverage with no orphaned requirements.',
          ['traceability_matrix', 'design_inputs', 'design_outputs', 'verification_summary', 'validation_summary'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_software_documentation'),
    dimension: 'documentation',
    title: 'Software Documentation Absent (IEC 62304)',
    question: 'The device appears to contain software but the PMA does not include software documentation per IEC 62304. For a Class III device, software lifecycle documentation including architecture, hazard analysis, and testing is required. How does the applicant address this gap?',
    check(answers) {
      const hasSoftware = String(answers.contains_software ?? '').toLowerCase();
      if (
        (hasSoftware === 'yes' || hasSoftware === 'true' || hasSoftware.includes('software')) &&
        isBlank(answers.software_documentation) &&
        isBlank(answers.iec_62304_level)
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Device contains software but no IEC 62304 lifecycle documentation is provided.',
          'Medical device software must be developed per IEC 62304 with documentation appropriate to the software safety classification. FDA expects Level of Concern documentation for PMA submissions.',
          'IEC 62304:2006+AMD1:2015; FDA Guidance: Content of Premarket Submissions for Device Software Functions (2023); 21 CFR 820.30',
          'Provide IEC 62304-compliant documentation including: software safety classification, requirements specification, architecture design, unit/integration/system test reports, anomaly/defect lists, and revision history.',
          ['software_documentation', 'iec_62304_level', 'contains_software'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (5 rules) ========== */
  {
    id: rid('no_fmea_fta'),
    dimension: 'risk_identification',
    title: 'FMEA/FTA Not Performed',
    question: 'The PMA does not include a Failure Mode and Effects Analysis (FMEA) or Fault Tree Analysis (FTA). For a Class III device, how does the applicant systematically identify and mitigate potential failure modes without these risk analysis techniques?',
    check(answers) {
      if (isBlank(answers.fmea_report) && isBlank(answers.fta_report) && isBlank(answers.risk_analysis_method)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No FMEA, FTA, or equivalent systematic risk analysis technique is documented in the PMA.',
          'Systematic risk analysis including techniques such as FMEA and FTA is required per ISO 14971:2019 and 21 CFR 820.30(g) as part of design validation.',
          'ISO 14971:2019; IEC 60812 (FMEA); IEC 61025 (FTA); 21 CFR 820.30(g)',
          'Perform a comprehensive risk analysis using FMEA, FTA, or equivalent systematic technique. Document the risk management file per ISO 14971 including hazard identification, risk estimation, risk evaluation, risk controls, and residual risk assessment.',
          ['fmea_report', 'fta_report', 'risk_analysis_method', 'risk_management_file'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_cybersecurity_assessment'),
    dimension: 'risk_identification',
    title: 'No Cybersecurity Assessment for Connected Device',
    question: 'The device incorporates wireless connectivity or network interfaces but the PMA does not include a cybersecurity risk assessment. How does the applicant address the cybersecurity threat landscape for this connected medical device?',
    check(answers) {
      const connected = String(answers.connectivity ?? '').toLowerCase();
      if (
        (connected.includes('wireless') || connected.includes('bluetooth') || connected.includes('wifi') ||
         connected.includes('network') || connected.includes('internet') || connected.includes('cloud') ||
         connected === 'yes' || connected === 'true') &&
        isBlank(answers.cybersecurity_assessment)
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Device has network connectivity but no cybersecurity risk assessment is included in the PMA.',
          'Connected medical devices require a cybersecurity risk assessment per FDA Cybersecurity Guidance (2023), including threat modeling, a Software Bill of Materials (SBOM), and vulnerability management plans.',
          'FDA Guidance: Cybersecurity in Medical Devices (2023); 21 CFR 814.20(b)(3); NIST Cybersecurity Framework',
          'Provide a complete cybersecurity submission including: threat model, SBOM, security architecture, penetration testing results, vulnerability disclosure policy, patch/update mechanisms, and end-of-life/support plans.',
          ['cybersecurity_assessment', 'connectivity', 'software_documentation'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_post_approval_study'),
    dimension: 'risk_identification',
    title: 'Post-Approval Study Not Planned',
    question: 'The PMA does not include a post-approval study (PAS) plan. Given that Class III devices often require post-market surveillance, how does the applicant plan to monitor long-term safety and effectiveness?',
    check(answers) {
      if (isBlank(answers.post_approval_study_plan) && isBlank(answers.post_market_surveillance)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No post-approval study plan or post-market surveillance strategy is included in the PMA submission.',
          'FDA may require a PAS as a condition of approval per 21 CFR 814.82. Proactive inclusion of a PAS plan demonstrates commitment to long-term safety monitoring.',
          '21 CFR 814.82; 21 CFR 822 (Postmarket Surveillance); FDA Guidance: Post-Approval Studies (2017)',
          'Develop a post-approval study plan addressing: study objectives, design, endpoints, sample size, enrollment timeline, data collection methods, and reporting schedule. Consider a registry-based approach for efficiency.',
          ['post_approval_study_plan', 'post_market_surveillance'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_maude_surveillance'),
    dimension: 'risk_identification',
    title: 'No MAUDE Surveillance Analysis',
    question: 'The PMA does not include an analysis of MAUDE (Manufacturer and User Facility Device Experience) data for similar devices. Have adverse events reported for comparable devices been considered in the risk assessment?',
    check(answers) {
      if (isBlank(answers.maude_analysis) && isBlank(answers.adverse_event_history)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No MAUDE database analysis for similar or predicate devices is included in the risk assessment.',
          'Analysis of adverse event databases (MAUDE) for similar devices is recommended to inform the risk analysis per ISO 14971:2019 Clause 4.2 and provides context for the benefit-risk determination.',
          'ISO 14971:2019 Clause 4.2; 21 CFR 803 (MDR); FDA MAUDE Database',
          'Conduct a MAUDE database search for the subject device (if previously marketed) and comparable devices. Analyze reported adverse events, device malfunctions, and deaths to inform the risk management file.',
          ['maude_analysis', 'adverse_event_history', 'predicate_device'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_electrical_safety'),
    dimension: 'risk_identification',
    title: 'No Electrical Safety Testing (IEC 60601)',
    question: 'The device appears to be electrically powered but the PMA does not include IEC 60601 electrical safety and electromagnetic compatibility testing. How does the applicant demonstrate that the device meets essential safety requirements for electrical medical equipment?',
    check(answers) {
      const powered = String(answers.power_source ?? '').toLowerCase();
      if (
        (powered.includes('electric') || powered.includes('battery') || powered.includes('ac') ||
         powered.includes('mains') || powered.includes('power') || powered === 'yes') &&
        isBlank(answers.iec_60601_testing)
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Device is electrically powered but no IEC 60601-1 safety or IEC 60601-1-2 EMC testing results are provided.',
          'Electrically powered medical devices must comply with IEC 60601-1 (general safety) and IEC 60601-1-2 (EMC), which are FDA-recognized consensus standards.',
          'IEC 60601-1:2005+AMD2:2020; IEC 60601-1-2:2014+AMD1:2020; 21 CFR 814.20(b)(3)(iv)',
          'Provide IEC 60601-1 and IEC 60601-1-2 test reports from an accredited testing laboratory (e.g., NRTL). Include any applicable collateral and particular standards (e.g., IEC 60601-1-6 for usability, device-specific particular standards).',
          ['iec_60601_testing', 'power_source', 'emc_testing'],
        );
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createPmaAuditor(): WarGameAuditor {
  return {
    category: 'pma',
    name: 'FDA PMA Reviewer',
    description:
      'Simulates an FDA CDRH reviewer performing a Premarket Approval Application (PMA) assessment ' +
      'per 21 CFR 814, evaluating completeness of clinical and non-clinical evidence, internal consistency, ' +
      'regulatory alignment with IDE and advisory panel requirements, scientific rigor of pivotal studies, ' +
      'practical feasibility of manufacturing and quality systems, documentation quality including design ' +
      'controls and V&V, and risk identification including cybersecurity and post-market surveillance.',
    rules,
  };
}
