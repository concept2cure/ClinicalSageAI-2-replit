/**
 * Section 6 — GSPR Compliance — question nodes for the Clinical Evaluation Report (CER) flow.
 *
 * Extracted verbatim from cer-report.ts (which had outgrown the repo file-size
 * gate) into one module per flow section. createCerReportFlow() assembles these
 * arrays into the flow's `nodes` array in the order its `sections` metadata
 * declares, so node ids, branching (defaultNext / visibleWhen) and issue checks
 * are byte-for-byte the ones the flow always had.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report/gspr-compliance-nodes
 */

import type { QuestionNode } from '../../../../../../shared/types/intelligence-questions.js';

export const gsprComplianceNodes: QuestionNode[] = [
  {
    id: 'gspr_checklist',
    section: 'gspr_compliance',
    question:
      'Map the clinical evidence to the applicable General Safety and Performance Requirements (GSPRs).',
    guidance:
      'EU MDR Annex I defines the General Safety and Performance Requirements (GSPRs) — the fundamental requirements that all medical devices must meet. The CER must demonstrate that clinical evidence supports conformity with each applicable GSPR. GSPRs are divided into three chapters: Chapter I (General Requirements, GSPRs 1-9), Chapter II (Requirements Regarding Design and Manufacture, GSPRs 10-22), and Chapter III (Requirements Regarding Information Supplied with the Device, GSPR 23). Some GSPRs are addressed through clinical evidence, while others are addressed through design verification, biocompatibility testing (ISO 10993), or other non-clinical evidence. A GSPR checklist mapping each requirement to its supporting evidence is required as part of the technical documentation per EU MDR Annex II Section 4. The clinical evaluation must specifically address GSPRs that can only be verified through clinical data.',
    fields: [
      {
        id: 'gspr_mapping_completed',
        label: 'GSPR Mapping Completed',
        type: 'yes_no',
        required: true,
        helpText: 'Have you mapped clinical evidence to each applicable GSPR in Annex I?',
      },
      {
        id: 'gsprs_requiring_clinical_evidence',
        label: 'GSPRs Requiring Clinical Evidence',
        type: 'textarea',
        required: true,
        helpText: 'List the specific GSPRs (by number) that require clinical data as supporting evidence. Typically includes GSPR 1 (safety/performance), 2 (risk management), 6 (clinical benefits), 8 (performance characteristics).',
      },
      {
        id: 'gsprs_design_verification',
        label: 'GSPRs Addressed by Design Verification',
        type: 'textarea',
        helpText: 'List GSPRs addressed through non-clinical evidence (bench testing, design verification, biocompatibility per ISO 10993)',
      },
      {
        id: 'gsprs_with_gaps',
        label: 'GSPRs with Evidence Gaps',
        type: 'textarea',
        helpText: 'Identify any GSPRs where the clinical evidence is insufficient and describe the plan to address the gap',
      },
      {
        id: 'annex_i_chapter_i_covered',
        label: 'Chapter I (General Requirements) GSPRs 1-9 Addressed',
        type: 'yes_no',
        required: true,
        helpText: 'Includes: general safety/performance (1), risk management (2), acceptability of benefit-risk (3-4), design for performance (5), clinical benefits (6), chemical properties (7), performance characteristics (8), design for safety (9)',
      },
      {
        id: 'annex_i_chapter_ii_covered',
        label: 'Chapter II (Design & Manufacturing) GSPRs 10-22 Addressed',
        type: 'yes_no',
        required: true,
        helpText: 'Includes: chemical/physical/biological properties (10-11), infection (12), substances (13-14), software (15-17), active devices (18-22)',
      },
      {
        id: 'annex_i_chapter_iii_covered',
        label: 'Chapter III (Information Supplied) GSPR 23 Addressed',
        type: 'yes_no',
        required: true,
        helpText: 'Labeling requirements including label, IFU, implant card per Annex I Section 23',
      },
      {
        id: 'gspr_specific_concerns',
        label: 'GSPR-Specific Concerns or Notified Body Questions',
        type: 'textarea',
        helpText: 'Document any specific GSPR-related questions raised by the Notified Body or identified as areas of concern',
      },
    ],
    issueChecks: [
      {
        id: 'no_gspr_compliance_assessment_check',
        condition: { field: 'gspr_mapping_completed', operator: 'eq', value: false },
        severity: 'critical',
        title: 'No GSPR Compliance Assessment',
        message:
          'A mapping of clinical evidence to the applicable General Safety and Performance Requirements is required per EU MDR Annex XIV Part A and Annex II Section 4. Without a complete GSPR checklist, the CER cannot demonstrate that the device meets the fundamental safety and performance requirements. This will result in rejection by the Notified Body.',
        reference: 'EU MDR Annex XIV Part A; Annex II Section 4; Annex I',
      },
    ],
    defaultNext: 'common_specifications',
  },

  {
    id: 'common_specifications',
    section: 'gspr_compliance',
    question:
      'Are there any Common Specifications (CS) applicable to this device, and how is conformity demonstrated?',
    guidance:
      'Common Specifications are adopted by the European Commission per EU MDR Article 9 for certain device categories where harmonized standards are insufficient. Where CS exist, manufacturers must comply unless they can justify that their alternative solution provides at least an equivalent level of safety and performance — the burden of proof is on the manufacturer. Deviations from CS require robust justification and will receive heightened Notified Body scrutiny. The conformity assessment route determines the level of Notified Body involvement and the depth of documentation review.',
    fields: [
      {
        id: 'common_specs_applicable',
        label: 'Common Specifications Applicable',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'common_specs_list',
        label: 'Applicable Common Specifications',
        type: 'textarea',
        visibleWhen: { field: 'common_specs_applicable', operator: 'eq', value: true },
        helpText: 'List the applicable Common Specifications by reference number, title, and publication date',
      },
      {
        id: 'cs_conformity_demonstrated',
        label: 'Conformity with CS Demonstrated',
        type: 'yes_no',
        visibleWhen: { field: 'common_specs_applicable', operator: 'eq', value: true },
      },
      {
        id: 'cs_deviations',
        label: 'Deviations from Common Specifications',
        type: 'textarea',
        visibleWhen: { field: 'common_specs_applicable', operator: 'eq', value: true },
        helpText: 'If deviating from any CS, provide justification that the alternative approach provides equivalent safety and performance per EU MDR Article 9(2)',
      },
      {
        id: 'conformity_assessment_route',
        label: 'Conformity Assessment Route',
        type: 'select',
        required: true,
        options: [
          { value: 'annex_ix', label: 'Annex IX — QMS + Technical Documentation Assessment' },
          { value: 'annex_x', label: 'Annex X — Type Examination' },
          { value: 'annex_xi_a', label: 'Annex XI Part A — Production QA' },
          { value: 'annex_xi_b', label: 'Annex XI Part B — Product Verification' },
        ],
        helpText: 'The conformity assessment procedure per EU MDR Article 52 and Annex IX-XI',
      },
      {
        id: 'technical_documentation_structure',
        label: 'Technical Documentation Structure per Annex II',
        type: 'select',
        required: true,
        options: [
          { value: 'sted', label: 'Summary Technical Documentation (STED) Format' },
          { value: 'annex_ii', label: 'EU MDR Annex II Structure' },
          { value: 'custom', label: 'Custom Structure (mapped to Annex II)' },
        ],
      },
    ],
    defaultNext: 'risk_analysis',
  },
];
