/**
 * Clinical Evaluation Report (CER) flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides the user through gathering the information required for a CER per
 * MEDDEV 2.7/1 Rev 4, covering device description, equivalence assessment,
 * clinical data collection, and risk-benefit analysis.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createCerReportFlow(): FlowDefinition {
  return {
    id: 'cer-report-v1',
    category: 'cer_report',
    name: 'Clinical Evaluation Report',
    description:
      'Comprehensive questionnaire for Clinical Evaluation Reports (CER) per MEDDEV 2.7/1 Rev 4, covering device description, equivalence assessment, clinical data sources, literature appraisal, clinical experience, and risk-benefit analysis.',
    clientTypes: ['medtech'],
    entryNode: 'cer_device_info',
    estimatedMinutes: 25,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'device_desc',
        label: 'Device Description',
        nodeIds: ['cer_device_info', 'intended_purpose'],
      },
      {
        id: 'equivalence',
        label: 'Equivalence',
        nodeIds: ['equivalent_device', 'equivalence_justification'],
      },
      {
        id: 'clinical_data',
        label: 'Clinical Data',
        nodeIds: ['clinical_data_sources', 'literature_search', 'clinical_experience'],
      },
      {
        id: 'risk_benefit',
        label: 'Risk-Benefit Analysis',
        nodeIds: ['risk_analysis', 'cer_conclusions'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── Device Description ────────────────────────────────────────── */

      {
        id: 'cer_device_info',
        section: 'Device Description',
        question:
          'Let\'s begin with the device details. What is the device name, manufacturer, and current CE marking status?',
        guidance:
          'The CER must include a complete description of the device per MEDDEV 2.7/1 Rev 4 Section A1. Include the GMDN code for standardized nomenclature and the UDI-DI for traceability across the European market.',
        fields: [
          {
            id: 'cer_device_name',
            label: 'Device Name',
            type: 'text',
            required: true,
          },
          {
            id: 'cer_manufacturer',
            label: 'Manufacturer',
            type: 'text',
            required: true,
          },
          {
            id: 'ce_marking_status',
            label: 'CE Marking Status',
            type: 'select',
            required: true,
            options: [
              { value: 'not_applied', label: 'Not Applied' },
              { value: 'applied_pending', label: 'Applied — Pending' },
              { value: 'ce_marked', label: 'CE Marked' },
            ],
          },
          {
            id: 'gmdn_code',
            label: 'GMDN Code',
            type: 'text',
            helpText: 'Global Medical Device Nomenclature code',
          },
          {
            id: 'udi_di',
            label: 'UDI-DI',
            type: 'text',
            helpText: 'Unique Device Identification - Device Identifier',
          },
        ],
        defaultNext: 'intended_purpose',
      },

      {
        id: 'intended_purpose',
        section: 'Device Description',
        question:
          'What is the intended purpose of this device, and who is the target patient population?',
        guidance:
          'The intended purpose is a critical element of the CER and determines the scope of clinical evaluation. Per EU MDR Article 2(12), the intended purpose includes the medical condition, target patient population, and clinical benefits. Contraindications must also be clearly identified.',
        fields: [
          {
            id: 'cer_intended_purpose',
            label: 'Intended Purpose',
            type: 'textarea',
            required: true,
          },
          {
            id: 'target_patient_population',
            label: 'Target Patient Population',
            type: 'textarea',
            required: true,
          },
          {
            id: 'medical_conditions_treated',
            label: 'Medical Conditions Treated',
            type: 'textarea',
            required: true,
          },
          {
            id: 'cer_contraindications',
            label: 'Contraindications',
            type: 'textarea',
          },
        ],
        defaultNext: 'equivalent_device',
      },

      /* ── Equivalence ───────────────────────────────────────────────── */

      {
        id: 'equivalent_device',
        section: 'Equivalence',
        question:
          'Have you identified an equivalent device for the clinical evaluation?',
        guidance:
          'MEDDEV 2.7/1 Rev 4 requires manufacturers to justify equivalence on clinical, technical, and biological grounds. An equivalent device must have the same clinical purpose, similar design, and use similar materials. Without equivalence, standalone clinical investigation data is typically required.',
        fields: [
          {
            id: 'equiv_device_identified',
            label: 'Equivalent Device Identified',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'equiv_device_name',
            label: 'Equivalent Device Name',
            type: 'text',
            visibleWhen: { field: 'equiv_device_identified', operator: 'eq', value: true },
          },
          {
            id: 'equiv_device_manufacturer',
            label: 'Equivalent Device Manufacturer',
            type: 'text',
            visibleWhen: { field: 'equiv_device_identified', operator: 'eq', value: true },
          },
        ],
        branches: [
          {
            when: { field: 'equiv_device_identified', operator: 'eq', value: false },
            goto: 'clinical_data_sources',
          },
        ],
        issueChecks: [
          {
            id: 'no_equivalent_device_check',
            condition: { field: 'equiv_device_identified', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Equivalent Device',
            message:
              'Without an equivalent device, standalone clinical investigation data will likely be required per MEDDEV 2.7/1 Rev 4.',
          },
        ],
        defaultNext: 'equivalence_justification',
      },

      {
        id: 'equivalence_justification',
        section: 'Equivalence',
        question:
          'Provide the equivalence justification across clinical, technical, and biological dimensions.',
        guidance:
          'Per MEDDEV 2.7/1 Rev 4 Appendix A1, equivalence must be demonstrated across three dimensions: clinical (same clinical condition, purpose, and effect), technical (similar design, specifications, and deployment), and biological (same materials, contact type, and duration). Each dimension must be individually justified.',
        fields: [
          {
            id: 'clinical_equivalence',
            label: 'Clinical Equivalence',
            type: 'textarea',
            required: true,
            helpText: 'Same clinical condition, same clinical purpose, same clinical effect',
          },
          {
            id: 'technical_equivalence',
            label: 'Technical Equivalence',
            type: 'textarea',
            required: true,
          },
          {
            id: 'biological_equivalence',
            label: 'Biological Equivalence',
            type: 'textarea',
            required: true,
            helpText: 'Same materials, contact type, and duration',
          },
        ],
        defaultNext: 'clinical_data_sources',
      },

      /* ── Clinical Data ─────────────────────────────────────────────── */

      {
        id: 'clinical_data_sources',
        section: 'Clinical Data',
        question:
          'What clinical data sources are available for the evaluation?',
        guidance:
          'The CER should draw on all available clinical data, including clinical investigations, published literature, post-market surveillance, registry data, and complaints data. Identify all available sources to ensure a comprehensive evaluation.',
        fields: [
          {
            id: 'data_sources_available',
            label: 'Sources Available',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'clinical_investigations', label: 'Clinical Investigations' },
              { value: 'literature', label: 'Published Literature' },
              { value: 'post_market_surveillance', label: 'Post-Market Surveillance' },
              { value: 'registers', label: 'Registers / Registries' },
              { value: 'complaints_data', label: 'Complaints Data' },
            ],
          },
          {
            id: 'clinical_investigation_available',
            label: 'Clinical Investigation Data Available',
            type: 'yes_no',
            required: true,
          },
        ],
        branches: [
          {
            when: { field: 'clinical_investigation_available', operator: 'eq', value: true },
            goto: 'literature_search',
          },
        ],
        defaultNext: 'literature_search',
      },

      {
        id: 'literature_search',
        section: 'Clinical Data',
        question:
          'Describe the literature search strategy and results.',
        guidance:
          'MEDDEV 2.7/1 Rev 4 Section 8 requires a systematic literature review. The search strategy must be documented, reproducible, and comprehensive. Include the databases searched, search terms, date range, and the screening/appraisal methodology used.',
        fields: [
          {
            id: 'literature_search_strategy',
            label: 'Literature Search Strategy',
            type: 'textarea',
            required: true,
            helpText: 'Describe databases searched, search terms, and date range',
          },
          {
            id: 'databases_searched',
            label: 'Databases Searched',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'pubmed', label: 'PubMed' },
              { value: 'embase', label: 'Embase' },
              { value: 'cochrane', label: 'Cochrane Library' },
              { value: 'scopus', label: 'Scopus' },
              { value: 'web_of_science', label: 'Web of Science' },
            ],
          },
          {
            id: 'total_articles_identified',
            label: 'Total Articles Identified',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'articles_included_after_screening',
            label: 'Articles Included After Screening',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'appraisal_method',
            label: 'Appraisal Method',
            type: 'select',
            required: true,
            options: [
              { value: 'oxford_levels', label: 'Oxford Levels of Evidence' },
              { value: 'grade', label: 'GRADE' },
              { value: 'custom', label: 'Custom' },
            ],
          },
        ],
        defaultNext: 'clinical_experience',
      },

      {
        id: 'clinical_experience',
        section: 'Clinical Data',
        question:
          'Summarize the clinical experience and post-market data for this device.',
        guidance:
          'Post-market clinical data provides real-world evidence on the device\'s safety and performance. Include distribution volumes, complaint rates, vigilance reports, and any field safety corrective actions. High vigilance rates may indicate safety concerns requiring additional analysis.',
        fields: [
          {
            id: 'total_units_distributed',
            label: 'Total Device Units Sold/Distributed',
            type: 'number',
          },
          {
            id: 'pmcf_planned',
            label: 'Post-Market Clinical Follow-up Planned',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'complaint_rate',
            label: 'Complaint Rate',
            type: 'text',
            placeholder: 'e.g. 0.02%',
          },
          {
            id: 'vigilance_reports',
            label: 'Vigilance Reports Filed',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'field_safety_corrective_actions',
            label: 'Field Safety Corrective Actions',
            type: 'number',
            validation: { min: 0 },
          },
        ],
        issueChecks: [
          {
            id: 'high_vigilance_rate_check',
            condition: { field: 'vigilance_reports', operator: 'gt', value: 10 },
            severity: 'warning',
            title: 'High Vigilance Rate',
            message:
              'Consider whether the vigilance report rate indicates a safety concern requiring additional analysis.',
          },
        ],
        defaultNext: 'risk_analysis',
      },

      /* ── Risk-Benefit Analysis ─────────────────────────────────────── */

      {
        id: 'risk_analysis',
        section: 'Risk-Benefit Analysis',
        question:
          'Describe the risk management outputs and the benefit-risk determination.',
        guidance:
          'The CER must include an analysis of the overall benefit-risk profile per MEDDEV 2.7/1 Rev 4 Section 10. This should draw on the risk management file (ISO 14971), identify residual risks, and conclude whether the benefits outweigh the risks in the context of the state of the art.',
        fields: [
          {
            id: 'risk_management_file_available',
            label: 'Risk Management File Available',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'residual_risks_identified',
            label: 'Residual Risks Identified',
            type: 'textarea',
            required: true,
          },
          {
            id: 'benefit_risk',
            label: 'Benefit-Risk Determination',
            type: 'select',
            required: true,
            options: [
              { value: 'favorable', label: 'Favorable' },
              { value: 'acceptable', label: 'Acceptable' },
              { value: 'unfavorable', label: 'Unfavorable' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'unfavorable_benefit_risk_check',
            condition: { field: 'benefit_risk', operator: 'eq', value: 'unfavorable' },
            severity: 'critical',
            title: 'Unfavorable Benefit-Risk',
            message:
              'An unfavorable benefit-risk ratio will not support CE marking. Review risk mitigations.',
          },
        ],
        defaultNext: 'cer_conclusions',
      },

      {
        id: 'cer_conclusions',
        section: 'Risk-Benefit Analysis',
        question:
          'Summarize the overall CER conclusions and post-market planning.',
        guidance:
          'The CER conclusion must state whether sufficient clinical evidence exists to demonstrate conformity with the relevant General Safety and Performance Requirements (GSPR) of the EU MDR. Include the PMCF plan status, update schedule, and any Notified Body involvement.',
        fields: [
          {
            id: 'overall_conclusion',
            label: 'Overall Clinical Evaluation Conclusion',
            type: 'textarea',
            required: true,
          },
          {
            id: 'pmcf_plan_needed',
            label: 'PMCF Plan Needed',
            type: 'yes_no',
            required: true,
            helpText: 'Post-Market Clinical Follow-up',
          },
          {
            id: 'cer_update_schedule',
            label: 'CER Update Schedule',
            type: 'select',
            required: true,
            defaultValue: 'annual',
            options: [
              { value: 'annual', label: 'Annual' },
              { value: 'biennial', label: 'Biennial' },
              { value: 'triggered', label: 'Triggered' },
            ],
          },
          {
            id: 'notified_body',
            label: 'Notified Body',
            type: 'text',
            helpText: 'Name of the Notified Body if applicable',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
