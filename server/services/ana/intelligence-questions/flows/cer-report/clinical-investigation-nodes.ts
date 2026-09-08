/**
 * Section 5 — Clinical Investigation Data — question nodes for the Clinical Evaluation Report (CER) flow.
 *
 * Extracted verbatim from cer-report.ts (which had outgrown the repo file-size
 * gate) into one module per flow section. createCerReportFlow() assembles these
 * arrays into the flow's `nodes` array in the order its `sections` metadata
 * declares, so node ids, branching (defaultNext / visibleWhen) and issue checks
 * are byte-for-byte the ones the flow always had.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report/clinical-investigation-nodes
 */

import type { QuestionNode } from '../../../../../../shared/types/intelligence-questions.js';

export const clinicalInvestigationNodes: QuestionNode[] = [
  {
    id: 'clinical_investigation_detail',
    section: 'clinical_investigation',
    question:
      'Provide details about the clinical investigation(s) for the subject device.',
    guidance:
      'Clinical investigations must be conducted in accordance with ISO 14155:2020 and EU MDR Article 62-82. For Class III and implantable devices, clinical investigation data is generally required per EU MDR Article 61(4) unless the manufacturer can justify reliance on existing clinical data — this justification must be clearly documented and is subject to heightened Notified Body scrutiny. The clinical investigation report must include study design, endpoints, sample size justification, statistical analysis plan, and results. Per MDCG 2021-6, the clinical investigation should be designed to address the specific clinical questions relevant to the CER.',
    fields: [
      {
        id: 'clinical_investigation_type',
        label: 'Clinical Investigation Type',
        type: 'select',
        required: true,
        options: [
          { value: 'pre_market_pivotal', label: 'Pre-Market Pivotal Investigation' },
          { value: 'pre_market_feasibility', label: 'Pre-Market Feasibility/Pilot Study' },
          { value: 'pmcf_study', label: 'PMCF Study (Post-CE Marking)' },
          { value: 'registry_study', label: 'Registry-Based Study' },
          { value: 'real_world_evidence', label: 'Real-World Evidence Study' },
        ],
      },
      {
        id: 'investigation_study_design',
        label: 'Study Design',
        type: 'select',
        required: true,
        options: [
          { value: 'rct', label: 'Randomized Controlled Trial (RCT)' },
          { value: 'non_randomized_controlled', label: 'Non-Randomized Controlled Trial' },
          { value: 'single_arm', label: 'Single-Arm Study (with objective performance criteria)' },
          { value: 'case_control', label: 'Case-Control Study' },
          { value: 'cohort', label: 'Cohort Study (Prospective or Retrospective)' },
          { value: 'case_series', label: 'Case Series' },
          { value: 'cross_sectional', label: 'Cross-Sectional Study' },
        ],
      },
      {
        id: 'investigation_iso_14155_compliant',
        label: 'Investigation Conducted per ISO 14155:2020',
        type: 'yes_no',
        required: true,
        helpText: 'Clinical investigations for CE marking purposes must comply with ISO 14155',
      },
      {
        id: 'investigation_primary_endpoint',
        label: 'Primary Endpoint(s)',
        type: 'textarea',
        required: true,
        helpText: 'Define the primary safety and/or performance endpoint(s) with success criteria',
      },
      {
        id: 'investigation_secondary_endpoints',
        label: 'Secondary Endpoint(s)',
        type: 'textarea',
        helpText: 'List all secondary endpoints and their definitions',
      },
      {
        id: 'investigation_number_subjects',
        label: 'Number of Subjects Enrolled',
        type: 'number',
        required: true,
        validation: { min: 1 },
      },
      {
        id: 'investigation_sample_size_justification',
        label: 'Sample Size Justification',
        type: 'textarea',
        required: true,
        helpText: 'Statistical basis for the sample size, including power calculation, expected effect size, alpha, and dropout rate',
      },
      {
        id: 'investigation_number_sites',
        label: 'Number of Investigational Sites',
        type: 'number',
        validation: { min: 1 },
      },
      {
        id: 'investigation_follow_up_duration',
        label: 'Follow-up Duration (months)',
        type: 'number',
        required: true,
        validation: { min: 0 },
        helpText: 'Duration of clinical follow-up. For implantable devices, long-term follow-up may be required.',
      },
      {
        id: 'investigation_statistical_analysis',
        label: 'Statistical Analysis Plan Summary',
        type: 'textarea',
        required: true,
        helpText: 'Summary of the pre-specified statistical analysis plan, including analysis populations (ITT, PP), handling of missing data, and multiplicity adjustments',
      },
      {
        id: 'investigation_results_summary',
        label: 'Results Summary',
        type: 'textarea',
        required: true,
        helpText: 'Summary of key results including primary endpoint achievement, safety outcomes, and device-related adverse events',
        validation: { minLength: 50 },
      },
      {
        id: 'investigation_adverse_events',
        label: 'Adverse Events Summary',
        type: 'textarea',
        required: true,
        helpText: 'Summary of all adverse events, serious adverse events, and device-related adverse events with rates',
      },
      {
        id: 'investigation_ethics_approval',
        label: 'Ethics Committee/IRB Approval Obtained',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'investigation_competent_authority',
        label: 'Competent Authority Notification/Approval',
        type: 'yes_no',
        helpText: 'Per EU MDR Article 70, clinical investigations in the EU must be notified to the Member State competent authority',
      },
      {
        id: 'investigation_registration',
        label: 'Clinical Investigation Registered',
        type: 'text',
        helpText: 'Registry identifier (e.g. ClinicalTrials.gov NCT number, EUDAMED CIV-ID)',
      },
    ],
    issueChecks: [
      {
        id: 'no_clinical_investigation_class_iii_check',
        condition: { field: 'clinical_investigation_available', operator: 'eq', value: false },
        severity: 'critical',
        title: 'No Clinical Investigation Data for Class III / Implantable',
        message:
          'For Class III and implantable devices, EU MDR Article 61(4) generally requires clinical investigation data unless the manufacturer can provide robust justification for reliance on existing clinical data. This justification is subject to heightened scrutiny by Notified Bodies. The absence of clinical investigation data is a critical gap that must be addressed.',
        reference: 'EU MDR Article 61(4); MDCG 2020-6',
      },
    ],
    defaultNext: 'clinical_experience',
  },

  {
    id: 'clinical_experience',
    section: 'clinical_investigation',
    question:
      'Summarize the clinical experience and post-market data for this device.',
    guidance:
      'Post-market clinical data provides real-world evidence on the device\'s safety and performance. Include distribution volumes, complaint rates, vigilance reports, and any field safety corrective actions. High vigilance rates or FSCA occurrences may indicate safety concerns requiring additional analysis. Data from EUDAMED vigilance system should be considered where available. Per EU MDR Article 83-86, the manufacturer must have a post-market surveillance system that collects and evaluates real-world data on the device. This data feeds into the CER as clinical experience per MEDDEV 2.7/1 Rev 4 Section 7.',
    fields: [
      {
        id: 'total_units_distributed',
        label: 'Total Device Units Sold/Distributed',
        type: 'number',
      },
      {
        id: 'distribution_countries',
        label: 'Countries of Distribution',
        type: 'textarea',
        helpText: 'List the countries where the device has been marketed',
      },
      {
        id: 'years_on_market',
        label: 'Years on Market',
        type: 'number',
        validation: { min: 0 },
      },
      {
        id: 'complaint_rate',
        label: 'Complaint Rate',
        type: 'text',
        placeholder: 'e.g. 0.02% per devices distributed',
      },
      {
        id: 'total_complaints',
        label: 'Total Number of Complaints',
        type: 'number',
        validation: { min: 0 },
      },
      {
        id: 'complaint_categories',
        label: 'Main Complaint Categories',
        type: 'textarea',
        helpText: 'Summarize the main types/categories of complaints received and their trends over time',
      },
      {
        id: 'vigilance_reports',
        label: 'Number of Serious Incident Reports Filed',
        type: 'number',
        validation: { min: 0 },
        helpText: 'Vigilance reports / serious incident reports per EU MDR Article 87',
      },
      {
        id: 'field_safety_corrective_actions',
        label: 'Number of Field Safety Corrective Actions (FSCA)',
        type: 'number',
        validation: { min: 0 },
      },
      {
        id: 'fsca_descriptions',
        label: 'FSCA Descriptions',
        type: 'textarea',
        visibleWhen: { field: 'field_safety_corrective_actions', operator: 'gt', value: 0 },
        helpText: 'Describe each FSCA including root cause, corrective actions taken, and effectiveness assessment',
      },
      {
        id: 'trend_reports_conducted',
        label: 'Trend Reports / Signal Detection Conducted',
        type: 'yes_no',
        helpText: 'Per EU MDR Article 88 — systematic detection of trends in incidents that may not be individually reportable',
      },
      {
        id: 'pms_report_reference',
        label: 'PMS Report / PSUR Reference',
        type: 'text',
        helpText: 'Reference to the Post-Market Surveillance Report (Class I) or Periodic Safety Update Report (Class IIa, IIb, III) per EU MDR Article 85-86',
      },
    ],
    issueChecks: [
      {
        id: 'high_vigilance_rate_check',
        condition: { field: 'vigilance_reports', operator: 'gt', value: 10 },
        severity: 'warning',
        title: 'High Number of Vigilance Reports',
        message:
          'The number of serious incident reports may indicate a safety concern. The CER must include a thorough analysis of vigilance data and any corrective actions taken. Trend analysis per EU MDR Article 88 should be performed.',
      },
      {
        id: 'fsca_safety_signal_check',
        condition: { field: 'field_safety_corrective_actions', operator: 'gt', value: 0 },
        severity: 'warning',
        title: 'FSCA Reported — Safety Signal Investigation Required',
        message:
          'Any Field Safety Corrective Action indicates a potential safety issue that must be thoroughly analyzed in the CER. The root cause analysis, corrective actions, and their effectiveness must be documented. The impact on the benefit-risk assessment must be considered.',
        reference: 'EU MDR Article 87-90',
      },
    ],
    defaultNext: 'gspr_checklist',
  },
];
