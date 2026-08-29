/**
 * Section 7 — Benefit-Risk & PMCF — question nodes for the Clinical Evaluation Report (CER) flow.
 *
 * Extracted verbatim from cer-report.ts (which had outgrown the repo file-size
 * gate) into one module per flow section. createCerReportFlow() assembles these
 * arrays into the flow's `nodes` array in the order its `sections` metadata
 * declares, so node ids, branching (defaultNext / visibleWhen) and issue checks
 * are byte-for-byte the ones the flow always had.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report/benefit-risk-pmcf-nodes
 */

import type { QuestionNode } from '../../../../../../shared/types/intelligence-questions.js';

export const benefitRiskPmcfNodes: QuestionNode[] = [
  {
    id: 'risk_analysis',
    section: 'benefit_risk_pmcf',
    question:
      'Describe the risk management outputs and the benefit-risk determination.',
    guidance:
      'The CER must include an analysis of the overall benefit-risk profile per MEDDEV 2.7/1 Rev 4 Section 10 and EU MDR Annex XIV Part A. This should draw on the risk management file (ISO 14971:2019), identify residual risks, and conclude whether the benefits outweigh the risks in the context of the state of the art. The benefit-risk analysis must consider the severity and probability of each risk, the clinical benefits demonstrated by evidence, and the acceptability of risks in light of the intended purpose and state of the art. Per EU MDR GSPR 1 and 8, the device must achieve the performance intended by the manufacturer and the risks must be acceptable when weighed against the benefits.',
    fields: [
      {
        id: 'risk_management_file_available',
        label: 'Risk Management File Available (ISO 14971)',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'risk_management_standard',
        label: 'Risk Management Standard Applied',
        type: 'select',
        options: [
          { value: 'iso_14971_2019', label: 'ISO 14971:2019' },
          { value: 'iso_14971_2007', label: 'ISO 14971:2007' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'hazard_analysis_summary',
        label: 'Summary of Hazard Analysis',
        type: 'textarea',
        required: true,
        helpText: 'Summarize key hazards identified and their risk control measures, drawn from the risk management file',
      },
      {
        id: 'residual_risks_identified',
        label: 'Residual Risks Identified',
        type: 'textarea',
        required: true,
        helpText: 'List all residual risks after risk control measures have been applied',
      },
      {
        id: 'clinical_risks',
        label: 'Clinical Risks Requiring Clinical Evidence',
        type: 'textarea',
        helpText: 'Identify which risks from the risk management file require clinical data to substantiate their acceptability. These must be addressed by clinical evidence in the CER.',
      },
      {
        id: 'benefit_risk',
        label: 'Overall Benefit-Risk Determination',
        type: 'select',
        required: true,
        options: [
          { value: 'favorable', label: 'Favorable — Benefits clearly outweigh risks' },
          { value: 'acceptable', label: 'Acceptable — Benefits outweigh risks with adequate risk controls' },
          { value: 'unfavorable', label: 'Unfavorable — Risks outweigh benefits' },
          { value: 'indeterminate', label: 'Indeterminate — Insufficient data to conclude' },
        ],
      },
      {
        id: 'benefit_risk_justification',
        label: 'Benefit-Risk Justification',
        type: 'textarea',
        required: true,
        helpText: 'Provide a detailed justification of the benefit-risk conclusion with reference to clinical evidence, state of the art benchmarks, and risk management outputs. Each claimed benefit must be linked to supporting evidence.',
        validation: { minLength: 50 },
      },
      {
        id: 'risk_acceptability_criteria',
        label: 'Risk Acceptability Criteria',
        type: 'textarea',
        helpText: 'Describe the criteria used to determine whether individual and overall residual risks are acceptable in the context of the benefits',
      },
    ],
    issueChecks: [
      {
        id: 'benefit_risk_not_favorable_check',
        condition: { field: 'benefit_risk', operator: 'eq', value: 'unfavorable' },
        severity: 'critical',
        title: 'Benefit-Risk Not Favorable',
        message:
          'An unfavorable benefit-risk ratio will not support CE marking under EU MDR. The device cannot demonstrate conformity with General Safety and Performance Requirements (GSPR 1, 3, 8). Review risk mitigations, consider whether additional clinical data or design modifications could change the determination. An unfavorable conclusion precludes placing the device on the EU market.',
        reference: 'EU MDR Annex I, GSPRs 1, 3, 8',
      },
    ],
    defaultNext: 'cer_conclusions',
  },

  {
    id: 'cer_conclusions',
    section: 'benefit_risk_pmcf',
    question:
      'Summarize the overall CER conclusions and identify any gaps or open items.',
    guidance:
      'The CER conclusion must state whether sufficient clinical evidence exists to demonstrate conformity with the relevant General Safety and Performance Requirements (GSPR) of the EU MDR. Include identified data gaps, needed additional evidence, and the update schedule. Per EU MDR Article 61(11), CERs for implantable and Class III devices must be updated at least annually. For other device classes, updates may be less frequent but must be justified. The conclusion must be clearly traceable to the evidence presented in the CER and must address each claimed clinical benefit and identified risk.',
    fields: [
      {
        id: 'overall_conclusion',
        label: 'Overall Clinical Evaluation Conclusion',
        type: 'textarea',
        required: true,
        helpText: 'State the overall conclusion: does the available clinical evidence demonstrate that the device conforms to the applicable GSPRs for safety and performance?',
        validation: { minLength: 100 },
      },
      {
        id: 'gspr_conformity_confirmed',
        label: 'GSPR Conformity Confirmed by Clinical Evidence',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'all_claimed_benefits_supported',
        label: 'All Claimed Clinical Benefits Supported by Evidence',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'unsupported_claims',
        label: 'Claims Not Fully Supported by Evidence',
        type: 'textarea',
        visibleWhen: { field: 'all_claimed_benefits_supported', operator: 'eq', value: false },
        helpText: 'List any claims that lack sufficient clinical evidence and the plan to address them',
      },
      {
        id: 'data_gaps_identified',
        label: 'Clinical Data Gaps Identified',
        type: 'textarea',
        helpText: 'Describe any gaps in the clinical evidence and how they will be addressed (PMCF, additional studies, ongoing literature review)',
      },
      {
        id: 'cer_update_schedule',
        label: 'CER Update Schedule',
        type: 'select',
        required: true,
        defaultValue: 'annual',
        options: [
          { value: 'annual', label: 'Annual (required for Class III and implantable per Article 61(11))' },
          { value: 'biennial', label: 'Biennial (Class IIa/IIb non-implant — with justification)' },
          { value: 'triennial', label: 'Triennial (low-risk devices — with robust justification)' },
          { value: 'triggered', label: 'Triggered by Significant New Data' },
        ],
      },
      {
        id: 'last_cer_update_date',
        label: 'Date of Last CER Update',
        type: 'date',
      },
      {
        id: 'additional_clinical_evidence_needed',
        label: 'Additional Clinical Evidence Needed',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'additional_evidence_plan',
        label: 'Plan to Address Evidence Gaps',
        type: 'textarea',
        visibleWhen: { field: 'additional_clinical_evidence_needed', operator: 'eq', value: true },
        helpText: 'Describe the planned activities to generate additional clinical evidence: PMCF studies, literature updates, registry participation',
      },
      {
        id: 'cer_reviewer_sign_off',
        label: 'CER Reviewed and Approved by Qualified Person',
        type: 'yes_no',
        required: true,
        helpText: 'The CER must be reviewed and approved by the Person Responsible for Regulatory Compliance (PRRC) per EU MDR Article 15',
      },
    ],
    defaultNext: 'pmcf_plan',
  },

  {
    id: 'pmcf_plan',
    section: 'benefit_risk_pmcf',
    question:
      'Describe the Post-Market Clinical Follow-up (PMCF) plan for this device.',
    guidance:
      'EU MDR Article 61(11) and Annex XIV Part B require a PMCF plan for all devices except where duly justified. The PMCF plan must describe how the manufacturer will proactively collect and evaluate clinical data after CE marking to confirm safety and performance throughout the device\'s lifetime, address residual risks, and detect emerging risks. MDCG 2020-7 provides detailed guidance on PMCF plan and PMCF evaluation report content. The PMCF plan should be proportionate to the risk class of the device and must address any gaps identified in the clinical evaluation.',
    fields: [
      {
        id: 'pmcf_plan_established',
        label: 'PMCF Plan Established',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'pmcf_justification_not_needed',
        label: 'Justification for No PMCF (if applicable)',
        type: 'textarea',
        visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: false },
        helpText: 'If no PMCF is planned, provide detailed justification per EU MDR Annex XIV Part B — note that justification must be robust and will be scrutinized by the Notified Body',
      },
      {
        id: 'pmcf_objectives',
        label: 'PMCF Objectives',
        type: 'textarea',
        visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
        helpText: 'Per MDCG 2020-7: confirm safety/performance, identify unknown risks, detect misuse, verify long-term safety, assess rare complications',
      },
      {
        id: 'pmcf_study_type',
        label: 'PMCF Activities Planned',
        type: 'multi_select',
        visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
        options: [
          { value: 'interventional_study', label: 'Interventional PMCF Study' },
          { value: 'observational_study', label: 'Observational PMCF Study' },
          { value: 'registry', label: 'Registry Participation' },
          { value: 'survey', label: 'Surveys / Questionnaires' },
          { value: 'literature_review', label: 'Ongoing Systematic Literature Review' },
          { value: 'complaint_analysis', label: 'Systematic Complaint Analysis' },
          { value: 'real_world_data', label: 'Real-World Data / Electronic Health Records' },
          { value: 'patient_reported_outcomes', label: 'Patient-Reported Outcome Measures (PROMs)' },
        ],
      },
      {
        id: 'pmcf_endpoints',
        label: 'PMCF Study Endpoints',
        type: 'textarea',
        visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
        helpText: 'Primary and secondary endpoints for PMCF data collection, including definitions and success criteria',
      },
      {
        id: 'pmcf_sample_size',
        label: 'Target PMCF Sample Size',
        type: 'number',
        visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
        validation: { min: 1 },
        helpText: 'Include sample size justification (statistical or pragmatic basis)',
      },
      {
        id: 'pmcf_duration',
        label: 'PMCF Duration (months)',
        type: 'number',
        visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
        validation: { min: 1 },
      },
      {
        id: 'pmcf_milestones',
        label: 'PMCF Milestones and Timeline',
        type: 'textarea',
        visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
        helpText: 'Key milestones including enrollment targets, interim analyses, reports to Notified Body, and final analysis',
      },
      {
        id: 'pmcf_evaluation_report_available',
        label: 'PMCF Evaluation Report Available',
        type: 'yes_no',
        helpText: 'Has a PMCF Evaluation Report been prepared from previously collected PMCF data? Per MDCG 2020-8.',
      },
      {
        id: 'pms_plan_reference',
        label: 'PMS Plan Reference',
        type: 'text',
        helpText: 'Reference number or title of the Post-Market Surveillance Plan that integrates with this PMCF plan',
      },
    ],
    branches: [
      {
        when: { field: 'pmcf_study_type', operator: 'contains', value: 'interventional_study' },
        goto: 'pmcf_study_design',
      },
      {
        when: { field: 'pmcf_study_type', operator: 'contains', value: 'observational_study' },
        goto: 'pmcf_study_design',
      },
    ],
    issueChecks: [
      {
        id: 'no_pmcf_plan_check',
        condition: { field: 'pmcf_plan_established', operator: 'eq', value: false },
        severity: 'critical',
        title: 'No PMCF Plan',
        message:
          'A Post-Market Clinical Follow-up plan is required per EU MDR Article 61(11) and Annex XIV Part B for all devices unless duly justified. Notified Bodies will not approve the CER without a PMCF plan (or a robust justification for its absence). For Class III and implantable devices, a PMCF plan is always required.',
        reference: 'EU MDR Article 61(11); Annex XIV Part B; MDCG 2020-7',
      },
    ],
    defaultNext: 'evaluator_qualifications',
  },

  {
    id: 'pmcf_study_design',
    section: 'benefit_risk_pmcf',
    question:
      'Provide details on the PMCF study design.',
    guidance:
      'PMCF studies may be interventional (where the device is used in a protocol-defined manner) or observational (where the device is used per routine clinical practice). Interventional PMCF studies must comply with EU MDR Article 74 and ISO 14155:2020. Observational studies should follow applicable national regulations and MDCG 2020-7 recommendations. The study design must be proportionate to the device risk class and the specific PMCF objectives. For Class III and implantable devices, PMCF studies are typically expected to be more rigorous. Per MDCG 2020-7, the PMCF plan should specify the study type, methodology, endpoints, and timelines.',
    fields: [
      {
        id: 'pmcf_study_classification',
        label: 'PMCF Study Classification',
        type: 'select',
        required: true,
        options: [
          { value: 'interventional', label: 'Interventional PMCF Study (Article 74 scope)' },
          { value: 'observational_prospective', label: 'Observational — Prospective' },
          { value: 'observational_retrospective', label: 'Observational — Retrospective' },
          { value: 'mixed_methods', label: 'Mixed Methods' },
        ],
      },
      {
        id: 'pmcf_study_iso_14155',
        label: 'PMCF Study Conducted per ISO 14155:2020',
        type: 'yes_no',
        helpText: 'Interventional PMCF studies within EU MDR Article 74 scope must comply with ISO 14155',
      },
      {
        id: 'pmcf_study_protocol_reference',
        label: 'PMCF Study Protocol Reference',
        type: 'text',
        helpText: 'Protocol identifier or document reference number',
      },
      {
        id: 'pmcf_study_sites',
        label: 'Number of PMCF Study Sites',
        type: 'number',
        validation: { min: 1 },
      },
      {
        id: 'pmcf_study_countries',
        label: 'Countries Where PMCF Study Is Conducted',
        type: 'textarea',
      },
      {
        id: 'pmcf_study_ethics_approval',
        label: 'Ethics Committee Approval Obtained',
        type: 'yes_no',
        helpText: 'Ethics approval is required for interventional PMCF studies and may be required for observational studies depending on national requirements',
      },
      {
        id: 'pmcf_study_competent_authority',
        label: 'Competent Authority Approval/Notification',
        type: 'yes_no',
        helpText: 'Required for interventional PMCF studies per EU MDR Article 70',
      },
      {
        id: 'pmcf_study_data_management',
        label: 'Data Management Plan',
        type: 'textarea',
        helpText: 'Describe the data collection, management, and quality assurance approach (eCRF, monitoring, source data verification)',
      },
      {
        id: 'pmcf_study_interim_results',
        label: 'Interim Results Available',
        type: 'yes_no',
      },
      {
        id: 'pmcf_interim_results_summary',
        label: 'Interim Results Summary',
        type: 'textarea',
        visibleWhen: { field: 'pmcf_study_interim_results', operator: 'eq', value: true },
        helpText: 'Summary of interim analysis results and any safety signals identified',
      },
    ],
    defaultNext: 'evaluator_qualifications',
  },
];
