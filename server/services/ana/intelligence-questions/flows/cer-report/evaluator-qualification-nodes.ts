/**
 * Section 8 — Evaluator Qualifications — question nodes for the Clinical Evaluation Report (CER) flow.
 *
 * Extracted verbatim from cer-report.ts (which had outgrown the repo file-size
 * gate) into one module per flow section. createCerReportFlow() assembles these
 * arrays into the flow's `nodes` array in the order its `sections` metadata
 * declares, so node ids, branching (defaultNext / visibleWhen) and issue checks
 * are byte-for-byte the ones the flow always had.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report/evaluator-qualification-nodes
 */

import type { QuestionNode } from '../../../../../../shared/types/intelligence-questions.js';

export const evaluatorQualificationNodes: QuestionNode[] = [
  {
    id: 'evaluator_qualifications',
    section: 'evaluator_qual',
    question:
      'Provide the qualifications of the CER evaluator(s).',
    guidance:
      'Per MEDDEV 2.7/1 Rev 4 Section 6 and EU MDR Annex XIV Part A, the CER must be performed by evaluators with sufficient clinical, regulatory, and scientific expertise. Evaluators must have documented professional experience (recommended at least 5 years) in the relevant medical field or device technology. The qualification requirements are based on three domains: (1) knowledge of the device technology and its application, (2) knowledge of the clinical evaluation methodology and regulatory requirements, and (3) knowledge of research methodology including clinical investigation design. Notified Bodies will specifically assess evaluator qualifications during their review and may reject CERs where the evaluator lacks sufficient expertise.',
    fields: [
      {
        id: 'evaluator_name',
        label: 'Lead Evaluator Name',
        type: 'text',
        required: true,
      },
      {
        id: 'evaluator_title',
        label: 'Evaluator Title / Credentials',
        type: 'text',
        required: true,
        helpText: 'e.g. MD, PhD, MSc, Professional Engineer, Clinical Specialist',
      },
      {
        id: 'evaluator_clinical_expertise',
        label: 'Clinical Expertise in Relevant Medical Field',
        type: 'textarea',
        required: true,
        helpText: 'Describe the evaluator\'s clinical experience and expertise relevant to the device\'s intended purpose. Include medical specialty, subspecialty, and clinical practice area.',
        validation: { minLength: 30 },
      },
      {
        id: 'evaluator_years_experience',
        label: 'Years of Relevant Professional Experience',
        type: 'number',
        required: true,
        validation: { min: 0 },
        helpText: 'MEDDEV 2.7/1 Rev 4 Section 6 recommends at least 5 years of documented professional experience',
      },
      {
        id: 'evaluator_regulatory_expertise',
        label: 'Regulatory Expertise',
        type: 'textarea',
        required: true,
        helpText: 'Experience with EU MDR 2017/745, MEDDEV 2.7/1 Rev 4, MDCG guidance, clinical evaluation methodology, conformity assessment procedures',
      },
      {
        id: 'evaluator_scientific_expertise',
        label: 'Scientific Expertise',
        type: 'textarea',
        helpText: 'Research publications, academic appointments, clinical trial experience, systematic review experience',
      },
      {
        id: 'evaluator_device_technology_knowledge',
        label: 'Device Technology Knowledge',
        type: 'textarea',
        required: true,
        helpText: 'Describe the evaluator\'s knowledge of the specific device technology, including hands-on experience, training, or research in the device field',
      },
      {
        id: 'evaluator_cv_attached',
        label: 'Evaluator CV Attached to CER',
        type: 'yes_no',
        required: true,
        helpText: 'A current CV must be included in the CER to demonstrate evaluator qualifications',
      },
      {
        id: 'evaluator_cer_training',
        label: 'Specific CER / Clinical Evaluation Training Completed',
        type: 'yes_no',
        helpText: 'Training on MEDDEV 2.7/1 Rev 4 methodology, systematic literature review, evidence appraisal',
      },
      {
        id: 'additional_evaluators',
        label: 'Additional Evaluators Involved',
        type: 'yes_no',
      },
      {
        id: 'additional_evaluator_details',
        label: 'Additional Evaluator Names and Qualifications',
        type: 'textarea',
        visibleWhen: { field: 'additional_evaluators', operator: 'eq', value: true },
        helpText: 'List all additional evaluators with their names, credentials, and specific contributions to the CER',
      },
    ],
    issueChecks: [
      {
        id: 'evaluator_not_qualified_mdr_check',
        condition: { field: 'evaluator_years_experience', operator: 'lt', value: 5 },
        severity: 'critical',
        title: 'Evaluator Not Qualified per MDR',
        message:
          'MEDDEV 2.7/1 Rev 4 Section 6 requires evaluators to have at least 5 years of documented professional experience in the relevant field. Evaluators with fewer than 5 years of experience may not meet Notified Body expectations and could result in CER rejection. Consider supplementing with an additional evaluator who meets the experience requirements.',
        reference: 'MEDDEV 2.7/1 Rev 4, Section 6; EU MDR Annex XIV Part A',
      },
    ],
    defaultNext: 'evaluator_declaration',
  },

  {
    id: 'evaluator_declaration',
    section: 'evaluator_qual',
    question:
      'Provide the evaluator independence declaration and conflict of interest disclosure.',
    guidance:
      'Per MEDDEV 2.7/1 Rev 4 Section 6 and EU MDR Annex XIV Part A, evaluators must declare their independence and disclose any potential conflicts of interest. The declaration must confirm that the evaluator has no financial or other interest that could bias the clinical evaluation. Internal evaluators (employed by the manufacturer) must disclose this relationship and demonstrate that appropriate measures are in place to ensure objectivity. Notified Bodies pay particular attention to evaluator independence and may request additional evaluators if conflicts are identified.',
    fields: [
      {
        id: 'independence_declaration',
        label: 'Independence Declaration Signed',
        type: 'yes_no',
        required: true,
        helpText: 'Declaration confirming no conflicts of interest with the manufacturer',
      },
      {
        id: 'evaluator_relationship',
        label: 'Evaluator Relationship to Manufacturer',
        type: 'select',
        required: true,
        options: [
          { value: 'external_independent', label: 'External — Fully Independent' },
          { value: 'external_consultant', label: 'External — Retained Consultant' },
          { value: 'internal_employee', label: 'Internal — Manufacturer Employee' },
          { value: 'internal_contracted', label: 'Internal — Contracted to Manufacturer' },
        ],
      },
      {
        id: 'conflict_of_interest',
        label: 'Any Conflicts of Interest Disclosed',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'conflict_details',
        label: 'Conflict of Interest Details',
        type: 'textarea',
        visibleWhen: { field: 'conflict_of_interest', operator: 'eq', value: true },
        helpText: 'Describe all disclosed conflicts and the mitigation measures in place',
      },
      {
        id: 'objectivity_measures',
        label: 'Measures to Ensure Objectivity',
        type: 'textarea',
        helpText: 'For internal evaluators or those with disclosed conflicts, describe the measures in place to ensure objectivity (e.g. peer review, independent oversight, separation of duties)',
      },
      {
        id: 'declaration_date',
        label: 'Date of Independence Declaration',
        type: 'date',
        required: true,
      },
    ],
    issueChecks: [
      {
        id: 'no_independence_declaration_check',
        condition: { field: 'independence_declaration', operator: 'eq', value: false },
        severity: 'warning',
        title: 'No Independence Declaration',
        message:
          'Evaluators should provide a signed declaration of independence and disclose any potential conflicts of interest per MEDDEV 2.7/1 Rev 4 Section 6. This is expected by Notified Bodies during the CER review. Absence of a declaration may result in the CER being returned for revision.',
        reference: 'MEDDEV 2.7/1 Rev 4, Section 6',
      },
    ],
    defaultNext: null,
  },
];
