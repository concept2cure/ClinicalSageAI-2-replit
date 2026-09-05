/**
 * Section 3 — Clinical Data Identification — question nodes for the Clinical Evaluation Report (CER) flow.
 *
 * Extracted verbatim from cer-report.ts (which had outgrown the repo file-size
 * gate) into one module per flow section. createCerReportFlow() assembles these
 * arrays into the flow's `nodes` array in the order its `sections` metadata
 * declares, so node ids, branching (defaultNext / visibleWhen) and issue checks
 * are byte-for-byte the ones the flow always had.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report/clinical-data-identification-nodes
 */

import type { QuestionNode } from '../../../../../../shared/types/intelligence-questions.js';

export const clinicalDataIdentificationNodes: QuestionNode[] = [
  {
    id: 'clinical_data_sources',
    section: 'clinical_data_id',
    question:
      'What clinical data sources are available for the evaluation?',
    guidance:
      'The CER should draw on all available clinical data, including clinical investigations, published literature, post-market surveillance, registry data, and complaints data. Per MEDDEV 2.7/1 Rev 4 Section 7, all data from the manufacturer\'s post-market surveillance system should be included. For Class III and implantable devices under EU MDR Article 61(4), clinical investigations are generally required unless justified otherwise. Clinical data must be identified systematically and the identification process documented. MDCG 2020-5 provides guidance on clinical evaluation adequacy and the clinical data sets that should be considered.',
    fields: [
      {
        id: 'data_sources_available',
        label: 'Clinical Data Sources Available',
        type: 'multi_select',
        required: true,
        options: [
          { value: 'clinical_investigations', label: 'Clinical Investigations (own device)' },
          { value: 'clinical_investigations_equiv', label: 'Clinical Investigations (equivalent device)' },
          { value: 'literature', label: 'Published Literature' },
          { value: 'post_market_surveillance', label: 'Post-Market Surveillance Data' },
          { value: 'registers', label: 'Registers / Registries' },
          { value: 'complaints_data', label: 'Complaints Data' },
          { value: 'vigilance_data', label: 'Vigilance / FSCA Data' },
          { value: 'pmcf_data', label: 'PMCF Study Data' },
          { value: 'expert_opinion', label: 'Expert Clinical Opinion' },
          { value: 'real_world_evidence', label: 'Real-World Evidence / EHR Data' },
        ],
      },
      {
        id: 'clinical_investigation_available',
        label: 'Clinical Investigation Data Available for Subject Device',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'equiv_device_identified',
        label: 'Equivalent Device Identified for Clinical Data',
        type: 'yes_no',
        required: true,
        helpText: 'Per MEDDEV 2.7/1 Rev 4, equivalence must be demonstrated to use clinical data from another device',
      },
      {
        id: 'data_sufficiency_assessment',
        label: 'Initial Data Sufficiency Assessment',
        type: 'select',
        required: true,
        options: [
          { value: 'sufficient', label: 'Sufficient — All claims and safety endpoints supported' },
          { value: 'partial_gaps', label: 'Partial Gaps — Some endpoints lack clinical data' },
          { value: 'significant_gaps', label: 'Significant Gaps — Major endpoints unsupported' },
          { value: 'insufficient', label: 'Insufficient — Fundamental lack of clinical data' },
        ],
        helpText: 'Preliminary assessment of whether available clinical data is sufficient to support all safety and performance claims',
      },
      {
        id: 'data_gap_description',
        label: 'Description of Clinical Data Gaps',
        type: 'textarea',
        visibleWhen: { field: 'data_sufficiency_assessment', operator: 'neq', value: 'sufficient' },
        helpText: 'Describe each identified gap and how it will be addressed (PMCF, clinical investigation, additional literature)',
      },
      {
        id: 'systematic_review_methodology_used',
        label: 'Systematic Review Methodology Used for Data Identification',
        type: 'yes_no',
        required: true,
        helpText: 'Per MEDDEV 2.7/1 Rev 4 Section 8, a systematic and documented approach is required',
      },
    ],
    branches: [
      {
        when: { field: 'equiv_device_identified', operator: 'eq', value: true },
        goto: 'equivalent_device',
      },
      {
        when: { field: 'clinical_investigation_available', operator: 'eq', value: true },
        goto: 'clinical_investigation_detail',
      },
    ],
    issueChecks: [
      {
        id: 'clinical_data_gaps_not_addressed_check',
        condition: { field: 'data_sufficiency_assessment', operator: 'eq', value: 'significant_gaps' },
        severity: 'warning',
        title: 'Clinical Data Gaps Not Addressed',
        message:
          'Significant gaps in clinical data have been identified. Per MEDDEV 2.7/1 Rev 4 and EU MDR Annex XIV Part A, all gaps must be clearly documented with a plan to address them (e.g. through PMCF studies, additional clinical investigations, or further literature review). Unaddressed gaps may result in CER rejection by the Notified Body.',
        reference: 'MEDDEV 2.7/1 Rev 4; EU MDR Annex XIV Part A',
      },
      {
        id: 'no_systematic_review_check',
        condition: { field: 'systematic_review_methodology_used', operator: 'eq', value: false },
        severity: 'warning',
        title: 'No Systematic Review Methodology',
        message:
          'A systematic and documented approach to clinical data identification is required per MEDDEV 2.7/1 Rev 4 Section 8. Without a systematic review methodology, the comprehensiveness of the data identification cannot be demonstrated, and the CER may be challenged by the Notified Body.',
        reference: 'MEDDEV 2.7/1 Rev 4, Section 8',
      },
    ],
    defaultNext: 'literature_search',
  },

  {
    id: 'equivalent_device',
    section: 'clinical_data_id',
    question:
      'Provide details about the equivalent device and the basis for the equivalence claim.',
    guidance:
      'MEDDEV 2.7/1 Rev 4 requires manufacturers to justify equivalence on clinical, technical, and biological grounds. An equivalent device must have the same clinical purpose, similar design, and use similar materials. Under EU MDR Article 61(5), manufacturers demonstrating equivalence to a device of another manufacturer must have a contract in place giving them access to the equivalent device\'s technical documentation — this is a hard requirement. Without such access, the equivalence route is not available for devices of other manufacturers. The equivalence assessment must use a structured side-by-side comparison as described in MEDDEV 2.7/1 Rev 4 Appendix A1.',
    fields: [
      {
        id: 'equiv_device_name',
        label: 'Equivalent Device Name',
        type: 'text',
        required: true,
      },
      {
        id: 'equiv_device_manufacturer',
        label: 'Equivalent Device Manufacturer',
        type: 'text',
        required: true,
      },
      {
        id: 'equiv_device_ce_marked',
        label: 'Is the Equivalent Device Currently CE Marked?',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'equiv_device_classification',
        label: 'Equivalent Device Classification',
        type: 'select',
        options: [
          { value: 'class_i', label: 'Class I' },
          { value: 'class_iia', label: 'Class IIa' },
          { value: 'class_iib', label: 'Class IIb' },
          { value: 'class_iii', label: 'Class III' },
        ],
      },
      {
        id: 'access_to_technical_documentation',
        label: 'Access to Equivalent Device Technical Documentation',
        type: 'select',
        required: true,
        options: [
          { value: 'own_device', label: 'Own Device — Full access' },
          { value: 'contract_access', label: 'Contract in Place — Access to technical documentation' },
          { value: 'no_access', label: 'No Direct Access to Technical Documentation' },
        ],
        helpText: 'EU MDR Article 61(5) requires access to the equivalent device\'s technical documentation via contract when claiming equivalence to another manufacturer\'s device',
      },
      {
        id: 'equiv_clinical_data_available',
        label: 'Clinical Data Available for Equivalent Device',
        type: 'multi_select',
        options: [
          { value: 'clinical_investigations', label: 'Clinical Investigations' },
          { value: 'published_literature', label: 'Published Literature' },
          { value: 'registry_data', label: 'Registry Data' },
          { value: 'post_market_data', label: 'Post-Market Surveillance Data' },
        ],
      },
    ],
    issueChecks: [
      {
        id: 'no_equivalence_demonstration_check',
        condition: { field: 'access_to_technical_documentation', operator: 'eq', value: 'no_access' },
        severity: 'warning',
        title: 'No Equivalence Demonstration for Reference Device',
        message:
          'Without access to the equivalent device\'s technical documentation, the equivalence route cannot be used for devices of other manufacturers per EU MDR Article 61(5). The manufacturer must either obtain a contract with the equivalent device manufacturer, use their own predicate device, or generate standalone clinical investigation data.',
        reference: 'EU MDR Article 61(5); MEDDEV 2.7/1 Rev 4, Appendix A1',
      },
    ],
    defaultNext: 'equivalence_demonstration',
  },

  {
    id: 'equivalence_demonstration',
    section: 'clinical_data_id',
    question:
      'Provide the equivalence justification across clinical, technical, and biological dimensions.',
    guidance:
      'Per MEDDEV 2.7/1 Rev 4 Appendix A1, equivalence must be demonstrated across three dimensions: clinical (same clinical condition, purpose, and effect), technical (similar design, specifications, and deployment), and biological (same materials, contact type, and duration). Each dimension must be individually justified with a detailed comparison. Any differences must be assessed for their impact on safety and clinical performance. Notified Bodies expect a structured side-by-side comparison table covering each dimension. The MDCG 2020-5 guidance clarifies that any difference between the subject device and the claimed equivalent must be clinically justified.',
    fields: [
      {
        id: 'clinical_equivalence',
        label: 'Clinical Equivalence',
        type: 'textarea',
        required: true,
        helpText: 'Same clinical condition, same clinical purpose, same clinical effect, same site in body, same target population',
        validation: { minLength: 50 },
      },
      {
        id: 'technical_equivalence',
        label: 'Technical Equivalence',
        type: 'textarea',
        required: true,
        helpText: 'Similar design, specifications, physicochemical properties, deployment methods, operating principles, energy type, sterilization',
        validation: { minLength: 50 },
      },
      {
        id: 'biological_equivalence',
        label: 'Biological Equivalence',
        type: 'textarea',
        required: true,
        helpText: 'Same materials in contact with human body, contact type (skin, tissue, blood, CNS), contact duration (transient, short-term, long-term)',
        validation: { minLength: 50 },
      },
      {
        id: 'equivalence_differences',
        label: 'Identified Differences from Equivalent Device',
        type: 'textarea',
        required: true,
        helpText: 'List ALL differences and explain why they do not negatively affect safety or clinical performance. Per MDCG 2020-5, each difference requires clinical justification.',
      },
      {
        id: 'equivalence_table_prepared',
        label: 'Side-by-Side Equivalence Comparison Table Prepared',
        type: 'yes_no',
        required: true,
        helpText: 'A structured comparison table is expected by Notified Bodies per MEDDEV 2.7/1 Rev 4 Appendix A1',
      },
      {
        id: 'equivalence_conclusion',
        label: 'Equivalence Conclusion',
        type: 'select',
        required: true,
        options: [
          { value: 'equivalent', label: 'Equivalent — No clinically significant differences' },
          { value: 'similar_with_differences', label: 'Similar — Differences identified but justified' },
          { value: 'not_equivalent', label: 'Not Equivalent — Significant differences that prevent equivalence claim' },
        ],
      },
    ],
    defaultNext: 'literature_search',
  },
];
