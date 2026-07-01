/**
 * Clinical Evaluation Report (CER) flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides the user through gathering the information required for a CER per
 * MEDDEV 2.7/1 Rev 4 and EU MDR (2017/745), covering device description,
 * equivalence assessment, clinical data collection, risk-benefit analysis,
 * state of the art, GSPR compliance, clinical data appraisal, and
 * PMCF & evaluator qualifications.
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
      'Comprehensive questionnaire for Clinical Evaluation Reports (CER) per MEDDEV 2.7/1 Rev 4 and EU MDR (2017/745), covering device description, equivalence assessment, clinical data sources, literature appraisal, clinical experience, risk-benefit analysis, state of the art, GSPR compliance, clinical data appraisal methodology, and PMCF & evaluator qualifications.',
    clientTypes: ['medtech'],
    entryNode: 'cer_device_info',
    estimatedMinutes: 50,

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
        nodeIds: ['clinical_data_sources', 'clinical_investigation_details', 'standalone_clinical_justification', 'literature_search', 'clinical_experience'],
      },
      {
        id: 'risk_benefit',
        label: 'Risk-Benefit Analysis',
        nodeIds: ['risk_analysis', 'cer_conclusions', 'cer_update_history'],
      },
      {
        id: 'state_of_art',
        label: 'State of the Art',
        nodeIds: ['medical_alternatives', 'technology_assessment'],
      },
      {
        id: 'gspr_compliance',
        label: 'GSPR Compliance',
        nodeIds: ['gspr_checklist', 'common_specifications'],
      },
      {
        id: 'data_appraisal',
        label: 'Clinical Data Appraisal',
        nodeIds: ['methodological_quality', 'data_analysis'],
      },
      {
        id: 'pmcf_evaluator',
        label: 'PMCF & Evaluator',
        nodeIds: ['pmcf_plan', 'implant_long_term', 'vigilance_analysis', 'evaluator_qualifications'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── 1. Device Description ────────────────────────────────────── */

      {
        id: 'cer_device_info',
        section: 'Device Description',
        question:
          'Let\'s begin with the device details. What is the device name, manufacturer, and current CE marking status?',
        guidance:
          'The CER must include a complete description of the device per MEDDEV 2.7/1 Rev 4 Section A1. Include the GMDN code for standardized nomenclature and the UDI-DI for traceability across the European market. Under EU MDR, the CER must reference the device\'s EU MDR classification per Annex VIII.',
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
              { value: 'ce_marked_mdd', label: 'CE Marked (under MDD 93/42/EEC)' },
              { value: 'ce_marked_mdr', label: 'CE Marked (under EU MDR 2017/745)' },
              { value: 'transitioning', label: 'Transitioning MDD to MDR' },
            ],
          },
          {
            id: 'eu_mdr_class',
            label: 'EU MDR Device Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'class_i', label: 'Class I' },
              { value: 'class_is', label: 'Class Is (Sterile)' },
              { value: 'class_im', label: 'Class Im (Measuring)' },
              { value: 'class_ir', label: 'Class Ir (Reusable Surgical Instruments)' },
              { value: 'class_iia', label: 'Class IIa' },
              { value: 'class_iib', label: 'Class IIb' },
              { value: 'class_iii', label: 'Class III' },
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
            helpText: 'Unique Device Identification - Device Identifier (EUDAMED)',
          },
          {
            id: 'device_description_summary',
            label: 'Device Description Summary',
            type: 'textarea',
            required: true,
            helpText: 'Comprehensive description of the device including principles of operation, materials, components, accessories, and variants/models covered by this CER',
            validation: { minLength: 50 },
          },
          {
            id: 'is_implantable',
            label: 'Is the device implantable?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'notified_body_name',
            label: 'Notified Body',
            type: 'text',
            helpText: 'Name and NB number of the Notified Body (e.g. BSI 0086, TUV SUD 0123)',
          },
          {
            id: 'cer_revision_number',
            label: 'CER Revision Number',
            type: 'text',
            helpText: 'Current revision of this CER (e.g. Rev 01, Rev 02)',
          },
          {
            id: 'cer_date',
            label: 'CER Date',
            type: 'date',
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
          'The intended purpose is a critical element of the CER and determines the scope of clinical evaluation. Per EU MDR Article 2(12), the intended purpose includes the medical condition, target patient population, and clinical benefits. Contraindications must also be clearly identified. The intended purpose must be consistent with the labeling and IFU.',
        fields: [
          {
            id: 'cer_intended_purpose',
            label: 'Intended Purpose',
            type: 'textarea',
            required: true,
            validation: { minLength: 30 },
          },
          {
            id: 'target_patient_population',
            label: 'Target Patient Population',
            type: 'textarea',
            required: true,
            helpText: 'Include age range, clinical condition, any exclusions',
          },
          {
            id: 'medical_conditions_treated',
            label: 'Medical Conditions / Indications',
            type: 'textarea',
            required: true,
          },
          {
            id: 'claimed_clinical_benefits',
            label: 'Claimed Clinical Benefits',
            type: 'textarea',
            required: true,
            helpText: 'List all clinical benefits claimed for the device — these must be supported by clinical evidence in the CER',
          },
          {
            id: 'cer_contraindications',
            label: 'Contraindications',
            type: 'textarea',
          },
          {
            id: 'intended_users',
            label: 'Intended Users',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'healthcare_professional', label: 'Healthcare Professional' },
              { value: 'patient_self_use', label: 'Patient (Self-Use)' },
              { value: 'caregiver', label: 'Caregiver / Lay Person' },
              { value: 'surgeon', label: 'Surgeon' },
              { value: 'nurse', label: 'Nurse' },
              { value: 'technician', label: 'Technician' },
            ],
          },
          {
            id: 'clinical_context',
            label: 'Clinical Context of Use',
            type: 'textarea',
            helpText: 'Describe the clinical setting and workflow in which the device is used',
          },
        ],
        defaultNext: 'equivalent_device',
      },

      /* ── 2. Equivalence ───────────────────────────────────────────── */

      {
        id: 'equivalent_device',
        section: 'Equivalence',
        question:
          'Have you identified an equivalent device for the clinical evaluation?',
        guidance:
          'MEDDEV 2.7/1 Rev 4 requires manufacturers to justify equivalence on clinical, technical, and biological grounds. An equivalent device must have the same clinical purpose, similar design, and use similar materials. Under EU MDR, Article 61(5) requires that manufacturers demonstrate equivalence through a contract giving access to the equivalent device\'s technical documentation (unless it is their own device). Without equivalence, standalone clinical investigation data is typically required.',
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
          {
            id: 'equiv_device_ce_marked',
            label: 'Is the Equivalent Device Currently CE Marked?',
            type: 'yes_no',
            visibleWhen: { field: 'equiv_device_identified', operator: 'eq', value: true },
          },
          {
            id: 'access_to_technical_documentation',
            label: 'Access to Equivalent Device Technical Documentation',
            type: 'select',
            visibleWhen: { field: 'equiv_device_identified', operator: 'eq', value: true },
            options: [
              { value: 'own_device', label: 'Own Device — Full access' },
              { value: 'contract_access', label: 'Contract in Place — Access to technical documentation' },
              { value: 'no_access', label: 'No Direct Access to Technical Documentation' },
            ],
            helpText: 'EU MDR Article 61(5) requires access to the equivalent device\'s technical documentation via contract',
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
              'Without an equivalent device, standalone clinical investigation data will likely be required per MEDDEV 2.7/1 Rev 4 and EU MDR Article 61(4). This is especially critical for Class III and implantable devices.',
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
          'Per MEDDEV 2.7/1 Rev 4 Appendix A1, equivalence must be demonstrated across three dimensions: clinical (same clinical condition, purpose, and effect), technical (similar design, specifications, and deployment), and biological (same materials, contact type, and duration). Each dimension must be individually justified with a detailed comparison. Any differences must be assessed for their impact on safety and clinical performance.',
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
            helpText: 'Similar design, specifications, physicochemical properties, deployment methods, operating principles',
            validation: { minLength: 50 },
          },
          {
            id: 'biological_equivalence',
            label: 'Biological Equivalence',
            type: 'textarea',
            required: true,
            helpText: 'Same materials in contact with human body, contact type, contact duration',
            validation: { minLength: 50 },
          },
          {
            id: 'equivalence_differences',
            label: 'Identified Differences from Equivalent Device',
            type: 'textarea',
            helpText: 'List any differences and explain why they do not affect safety or clinical performance',
          },
          {
            id: 'equivalence_table_prepared',
            label: 'Side-by-Side Equivalence Comparison Table Prepared',
            type: 'yes_no',
            required: true,
            helpText: 'A structured comparison table is expected by Notified Bodies',
          },
        ],
        defaultNext: 'clinical_data_sources',
      },

      /* ── 3. Clinical Data ─────────────────────────────────────────── */

      {
        id: 'clinical_data_sources',
        section: 'Clinical Data',
        question:
          'What clinical data sources are available for the evaluation?',
        guidance:
          'The CER should draw on all available clinical data, including clinical investigations, published literature, post-market surveillance, registry data, and complaints data. Per MEDDEV 2.7/1 Rev 4 Section 7, all data from the manufacturer\'s post-market surveillance system should be included. For Class III and implantable devices under EU MDR, clinical investigations are generally required unless justified otherwise.',
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
            ],
          },
          {
            id: 'clinical_investigation_available',
            label: 'Clinical Investigation Data Available for Subject Device',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'clinical_investigation_type',
            label: 'Clinical Investigation Type',
            type: 'select',
            visibleWhen: { field: 'clinical_investigation_available', operator: 'eq', value: true },
            options: [
              { value: 'pre_market', label: 'Pre-Market Clinical Investigation' },
              { value: 'pmcf_study', label: 'PMCF Study' },
              { value: 'registry_study', label: 'Registry-Based Study' },
              { value: 'real_world_evidence', label: 'Real-World Evidence Study' },
            ],
          },
          {
            id: 'investigation_number_subjects',
            label: 'Number of Subjects in Clinical Investigation',
            type: 'number',
            visibleWhen: { field: 'clinical_investigation_available', operator: 'eq', value: true },
            validation: { min: 1 },
          },
          {
            id: 'investigation_follow_up_duration',
            label: 'Follow-up Duration (months)',
            type: 'number',
            visibleWhen: { field: 'clinical_investigation_available', operator: 'eq', value: true },
            validation: { min: 0 },
          },
        ],
        branches: [
          {
            when: { field: 'clinical_investigation_available', operator: 'eq', value: true },
            goto: 'clinical_investigation_details',
          },
          {
            when: { field: 'equiv_device_identified', operator: 'eq', value: false },
            goto: 'standalone_clinical_justification',
          },
        ],
        issueChecks: [
          {
            id: 'class_iii_no_investigation_check',
            condition: { field: 'clinical_investigation_available', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Clinical Investigation Data',
            message:
              'For Class III and implantable devices, EU MDR Article 61(4) generally requires clinical investigation data unless the manufacturer can justify reliance on existing clinical data. This justification must be clearly documented in the CER.',
            reference: 'EU MDR Article 61(4)',
          },
        ],
        defaultNext: 'literature_search',
      },

      {
        id: 'clinical_investigation_details',
        section: 'Clinical Data',
        question:
          'Provide details about the clinical investigation(s) conducted for this device.',
        guidance:
          'Per EU MDR Annex XV, clinical investigations must follow a clinical investigation plan (CIP), be conducted per ISO 14155, and have ethics committee approval. Provide details on the study design, population, endpoints, and results. The investigation must generate sufficient evidence to support the claimed clinical benefits and characterize the risk profile.',
        fields: [
          {
            id: 'investigation_study_design',
            label: 'Study Design',
            type: 'select',
            required: true,
            options: [
              { value: 'randomized_controlled', label: 'Randomized Controlled Trial' },
              { value: 'single_arm', label: 'Single-Arm Study' },
              { value: 'cohort', label: 'Prospective Cohort' },
              { value: 'case_control', label: 'Case-Control' },
              { value: 'registry', label: 'Registry-Based Study' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'iso_14155_compliant',
            label: 'Conducted per ISO 14155',
            type: 'yes_no',
            required: true,
            helpText: 'ISO 14155 — Clinical investigation of medical devices for human subjects',
          },
          {
            id: 'ethics_committee_approval',
            label: 'Ethics Committee / IRB Approval',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'investigation_primary_endpoint',
            label: 'Primary Endpoint',
            type: 'textarea',
            required: true,
          },
          {
            id: 'investigation_secondary_endpoints',
            label: 'Secondary Endpoints',
            type: 'textarea',
          },
          {
            id: 'investigation_results_summary',
            label: 'Results Summary',
            type: 'textarea',
            required: true,
            helpText: 'Summarize the key findings: primary endpoint results, safety outcomes, complications',
          },
          {
            id: 'investigation_adverse_events',
            label: 'Adverse Events / Device Deficiencies',
            type: 'textarea',
            helpText: 'Summarize adverse events, serious adverse events (SAEs), and device deficiencies',
          },
          {
            id: 'investigation_report_available',
            label: 'Clinical Investigation Report Available',
            type: 'yes_no',
            required: true,
          },
        ],
        defaultNext: 'literature_search',
      },

      {
        id: 'standalone_clinical_justification',
        section: 'Clinical Data',
        question:
          'Since no equivalent device was identified, provide justification for the clinical data strategy.',
        guidance:
          'Without an equivalent device, the manufacturer must demonstrate safety and performance through standalone clinical data. Per EU MDR Article 61(4), Class III and implantable devices generally require clinical investigation data. If relying solely on literature and post-market data, a detailed justification must explain why this is sufficient, referencing the device risk class, clinical context, and available evidence.',
        fields: [
          {
            id: 'standalone_justification',
            label: 'Justification for Standalone Clinical Data Approach',
            type: 'textarea',
            required: true,
            helpText: 'Explain why clinical data without an equivalent device comparison is sufficient',
            validation: { minLength: 100 },
          },
          {
            id: 'standalone_data_sources',
            label: 'Primary Data Sources for Standalone Evaluation',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'own_clinical_investigation', label: 'Own Clinical Investigation' },
              { value: 'published_literature', label: 'Published Literature on Subject Device' },
              { value: 'similar_device_literature', label: 'Published Literature on Similar Devices' },
              { value: 'post_market_data', label: 'Post-Market Surveillance Data' },
              { value: 'registry_data', label: 'Registry Data' },
            ],
          },
          {
            id: 'regulatory_precedent',
            label: 'Regulatory Precedent or Guidance',
            type: 'textarea',
            helpText: 'Cite any MDCG guidance, Notified Body position papers, or regulatory precedent supporting this approach',
          },
          {
            id: 'nb_consulted',
            label: 'Notified Body Consulted on Clinical Data Strategy',
            type: 'yes_no',
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
          'MEDDEV 2.7/1 Rev 4 Section 8 requires a systematic literature review. The search strategy must be documented, reproducible, and comprehensive. Include the databases searched, search terms, date range, and the screening/appraisal methodology. Multiple databases should be searched to ensure comprehensive coverage. The literature search protocol should be finalized before conducting the search.',
        fields: [
          {
            id: 'literature_search_protocol',
            label: 'Literature Search Protocol Documented',
            type: 'yes_no',
            required: true,
            helpText: 'A written protocol should be finalized before conducting the search',
          },
          {
            id: 'literature_search_strategy',
            label: 'Literature Search Strategy',
            type: 'textarea',
            required: true,
            helpText: 'Describe search terms, Boolean operators, MeSH/EMTREE terms, and date range',
            validation: { minLength: 50 },
          },
          {
            id: 'databases_searched',
            label: 'Databases Searched',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'pubmed', label: 'PubMed / MEDLINE' },
              { value: 'embase', label: 'Embase' },
              { value: 'cochrane', label: 'Cochrane Library' },
              { value: 'scopus', label: 'Scopus' },
              { value: 'web_of_science', label: 'Web of Science' },
              { value: 'google_scholar', label: 'Google Scholar' },
              { value: 'clinicaltrials_gov', label: 'ClinicalTrials.gov' },
              { value: 'who_ictrp', label: 'WHO ICTRP' },
            ],
          },
          {
            id: 'search_date_range',
            label: 'Literature Search Date Range',
            type: 'text',
            required: true,
            placeholder: 'e.g. January 2010 — December 2025',
          },
          {
            id: 'total_articles_identified',
            label: 'Total Articles Identified',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'articles_after_duplicate_removal',
            label: 'Articles After Duplicate Removal',
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
            id: 'articles_pivotal',
            label: 'Number of Pivotal Articles',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Articles directly relevant to the subject or equivalent device',
          },
          {
            id: 'prisma_flow_diagram',
            label: 'PRISMA Flow Diagram Prepared',
            type: 'yes_no',
            helpText: 'Recommended to document the screening and selection process',
          },
          {
            id: 'appraisal_method',
            label: 'Evidence Appraisal Method',
            type: 'select',
            required: true,
            options: [
              { value: 'oxford_levels', label: 'Oxford Levels of Evidence' },
              { value: 'grade', label: 'GRADE (Grading of Recommendations Assessment)' },
              { value: 'jadad', label: 'Jadad Score' },
              { value: 'newcastle_ottawa', label: 'Newcastle-Ottawa Scale' },
              { value: 'custom', label: 'Custom Appraisal Framework' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'single_database_check',
            condition: { field: 'databases_searched', operator: 'eq', value: ['pubmed'] },
            severity: 'warning',
            title: 'Only Single Database Searched',
            message:
              'MEDDEV 2.7/1 Rev 4 requires a comprehensive literature search. Searching only a single database may miss relevant publications. At minimum, PubMed/MEDLINE and Embase should be searched.',
            reference: 'MEDDEV 2.7/1 Rev 4, Section 8',
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
          'Post-market clinical data provides real-world evidence on the device\'s safety and performance. Include distribution volumes, complaint rates, vigilance reports, and any field safety corrective actions. High vigilance rates or FSCA occurrences may indicate safety concerns requiring additional analysis. Data from EUDAMED vigilance system should be considered where available.',
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
            helpText: 'Summarize the main types/categories of complaints received',
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
            helpText: 'Describe each FSCA including root cause and corrective actions taken',
          },
          {
            id: 'trend_reports_conducted',
            label: 'Trend Reports / Signal Detection Conducted',
            type: 'yes_no',
            helpText: 'Per EU MDR Article 88 — trending of incidents that are not individually reportable',
          },
        ],
        issueChecks: [
          {
            id: 'high_vigilance_rate_check',
            condition: { field: 'vigilance_reports', operator: 'gt', value: 10 },
            severity: 'warning',
            title: 'High Number of Vigilance Reports',
            message:
              'The number of serious incident reports may indicate a safety concern. The CER must include a thorough analysis of vigilance data and any corrective actions taken.',
          },
          {
            id: 'fsca_safety_signal_check',
            condition: { field: 'field_safety_corrective_actions', operator: 'gt', value: 0 },
            severity: 'warning',
            title: 'FSCA Reported — Safety Signal Investigation Required',
            message:
              'Any Field Safety Corrective Action indicates a potential safety issue that must be thoroughly analyzed in the CER. The root cause analysis, corrective actions, and their effectiveness must be documented.',
            reference: 'EU MDR Article 87-90',
          },
        ],
        branches: [
          {
            when: { field: 'is_implantable', operator: 'eq', value: true },
            goto: 'implant_long_term',
          },
          {
            when: { field: 'vigilance_reports', operator: 'gt', value: 5 },
            goto: 'vigilance_analysis',
          },
        ],
        defaultNext: 'risk_analysis',
      },

      /* ── 4. Risk-Benefit Analysis ─────────────────────────────────── */

      {
        id: 'risk_analysis',
        section: 'Risk-Benefit Analysis',
        question:
          'Describe the risk management outputs and the benefit-risk determination.',
        guidance:
          'The CER must include an analysis of the overall benefit-risk profile per MEDDEV 2.7/1 Rev 4 Section 10 and EU MDR Annex XIV Part A. This should draw on the risk management file (ISO 14971), identify residual risks, and conclude whether the benefits outweigh the risks in the context of the state of the art. The benefit-risk analysis must consider the severity and probability of each risk.',
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
            helpText: 'Summarize key hazards identified and their risk control measures',
          },
          {
            id: 'residual_risks_identified',
            label: 'Residual Risks Identified',
            type: 'textarea',
            required: true,
          },
          {
            id: 'clinical_risks',
            label: 'Clinical Risks Requiring Clinical Evidence',
            type: 'textarea',
            helpText: 'Identify which risks from the risk management file require clinical data to substantiate acceptability',
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
            ],
          },
          {
            id: 'benefit_risk_justification',
            label: 'Benefit-Risk Justification',
            type: 'textarea',
            required: true,
            helpText: 'Provide a detailed justification of the benefit-risk conclusion with reference to clinical evidence and state of the art',
          },
        ],
        issueChecks: [
          {
            id: 'unfavorable_benefit_risk_check',
            condition: { field: 'benefit_risk', operator: 'eq', value: 'unfavorable' },
            severity: 'critical',
            title: 'Unfavorable Benefit-Risk',
            message:
              'An unfavorable benefit-risk ratio will not support CE marking under EU MDR. The device cannot demonstrate conformity with General Safety and Performance Requirements. Review risk mitigations and consider whether additional clinical data could change the determination.',
          },
        ],
        defaultNext: 'cer_conclusions',
      },

      {
        id: 'cer_conclusions',
        section: 'Risk-Benefit Analysis',
        question:
          'Summarize the overall CER conclusions and identify any gaps.',
        guidance:
          'The CER conclusion must state whether sufficient clinical evidence exists to demonstrate conformity with the relevant General Safety and Performance Requirements (GSPR) of the EU MDR. Include identified data gaps, needed additional evidence, and the update schedule. Per EU MDR, CERs for implantable and Class III devices must be updated at least annually.',
        fields: [
          {
            id: 'overall_conclusion',
            label: 'Overall Clinical Evaluation Conclusion',
            type: 'textarea',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'gspr_conformity_confirmed',
            label: 'GSPR Conformity Confirmed by Clinical Evidence',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'data_gaps_identified',
            label: 'Clinical Data Gaps Identified',
            type: 'textarea',
            helpText: 'Describe any gaps in the clinical evidence and how they will be addressed',
          },
          {
            id: 'cer_update_schedule',
            label: 'CER Update Schedule',
            type: 'select',
            required: true,
            defaultValue: 'annual',
            options: [
              { value: 'annual', label: 'Annual (required for Class III and implantable)' },
              { value: 'biennial', label: 'Biennial (Class IIa/IIb non-implant)' },
              { value: 'triennial', label: 'Triennial (low-risk devices with justification)' },
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
          },
        ],
        branches: [
          {
            when: { field: 'additional_clinical_evidence_needed', operator: 'eq', value: true },
            goto: 'cer_update_history',
          },
        ],
        issueChecks: [
          {
            id: 'cer_update_overdue_implant_check',
            condition: { field: 'cer_update_schedule', operator: 'neq', value: 'annual' },
            severity: 'warning',
            title: 'Non-Annual CER Update for Potential Implant/Class III',
            message:
              'EU MDR requires annual CER updates for implantable devices and Class III devices. If this device is implantable or Class III, ensure the update schedule is set to annual.',
            reference: 'EU MDR Article 61(11)',
          },
        ],
        defaultNext: 'medical_alternatives',
      },

      {
        id: 'cer_update_history',
        section: 'Risk-Benefit Analysis',
        question:
          'Document the CER update history and any changes since the last evaluation.',
        guidance:
          'The CER is a living document that must be updated regularly. Each update should document what new data was reviewed, whether conclusions changed, and any new risks or benefits identified. This history demonstrates ongoing clinical evaluation compliance to the Notified Body.',
        fields: [
          {
            id: 'previous_cer_versions',
            label: 'Number of Previous CER Versions',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'changes_since_last_update',
            label: 'Significant Changes Since Last CER Update',
            type: 'textarea',
            required: true,
            helpText: 'Summarize new clinical data, new vigilance data, regulatory changes, or design changes since last CER',
          },
          {
            id: 'conclusion_changes',
            label: 'Did Conclusions Change from Previous CER?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'conclusion_change_details',
            label: 'Details of Conclusion Changes',
            type: 'textarea',
            visibleWhen: { field: 'conclusion_changes', operator: 'eq', value: true },
          },
          {
            id: 'new_safety_signals',
            label: 'New Safety Signals Identified Since Last CER',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'new_safety_signal_details',
            label: 'Safety Signal Details and Mitigations',
            type: 'textarea',
            visibleWhen: { field: 'new_safety_signals', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'medical_alternatives',
      },

      /* ── 5. State of the Art ──────────────────────────────────────── */

      {
        id: 'medical_alternatives',
        section: 'State of the Art',
        question:
          'Describe the current state of the art for the medical condition this device addresses.',
        guidance:
          'The CER must include an analysis of the state of the art per MEDDEV 2.7/1 Rev 4 Section 7 and EU MDR Article 61(1). This includes current treatment alternatives, competing devices, standard of care, and benchmarks from published literature. The state of the art forms the context for evaluating whether the device\'s benefit-risk profile is acceptable.',
        fields: [
          {
            id: 'current_treatment_landscape',
            label: 'Current Treatment Landscape',
            type: 'textarea',
            required: true,
            helpText: 'Describe all available treatment options (surgical, pharmacological, device-based, conservative) for the target medical condition',
            validation: { minLength: 50 },
          },
          {
            id: 'alternative_devices',
            label: 'Alternative Devices/Therapies',
            type: 'textarea',
            required: true,
            helpText: 'List competing devices and alternative therapeutic approaches on the market',
          },
          {
            id: 'standard_of_care',
            label: 'Standard of Care',
            type: 'textarea',
            required: true,
            helpText: 'Describe the current standard of care and relevant clinical guidelines',
          },
          {
            id: 'published_benchmarks',
            label: 'Published Performance Benchmarks',
            type: 'textarea',
            helpText: 'Cite published literature benchmarks for safety and performance endpoints relevant to this device category (e.g. complication rates, success rates)',
          },
          {
            id: 'unmet_clinical_need',
            label: 'Unmet Clinical Need',
            type: 'textarea',
            helpText: 'Describe any unmet clinical needs that this device addresses',
          },
        ],
        issueChecks: [
          {
            id: 'no_state_of_art_check',
            condition: { field: 'current_treatment_landscape', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'No State of the Art Analysis',
            message:
              'A state of the art analysis is required per MEDDEV 2.7/1 Rev 4 Section 7. This analysis provides the context for evaluating the device\'s benefit-risk profile and is expected by Notified Bodies.',
            reference: 'MEDDEV 2.7/1 Rev 4, Section 7',
          },
        ],
        defaultNext: 'technology_assessment',
      },

      {
        id: 'technology_assessment',
        section: 'State of the Art',
        question:
          'Describe the current state of technology and any evolving standards relevant to this device.',
        guidance:
          'Per EU MDR Article 61(1), the clinical evaluation must consider the current state of technology. This includes evolving standards, recent guidance changes, harmonized standards applicable to the device, and any emerging technologies that may affect the device\'s risk-benefit profile. Reference MDCG guidance documents where applicable.',
        fields: [
          {
            id: 'current_technology_state',
            label: 'Current State of Technology',
            type: 'textarea',
            required: true,
            helpText: 'Describe the technological landscape for this type of device, including recent advances',
          },
          {
            id: 'harmonized_standards_applicable',
            label: 'Harmonized Standards Applicable',
            type: 'textarea',
            required: true,
            helpText: 'List the EU harmonized standards applicable to this device type (e.g. EN ISO 14708 for active implants)',
          },
          {
            id: 'evolving_standards',
            label: 'Evolving Standards or Guidance',
            type: 'textarea',
            helpText: 'Identify any standards or guidelines currently under revision that may affect the device',
          },
          {
            id: 'recent_guidance_changes',
            label: 'Recent Regulatory Guidance Changes',
            type: 'textarea',
            helpText: 'List any recent MDCG guidance documents, MEDDEV revisions, or Notified Body position papers relevant to this device',
          },
          {
            id: 'emerging_safety_concerns',
            label: 'Emerging Safety Concerns in the Field',
            type: 'textarea',
            helpText: 'Identify any emerging safety signals, product recalls, or safety communications in this device category',
          },
        ],
        defaultNext: 'gspr_checklist',
      },

      /* ── 6. GSPR Compliance ───────────────────────────────────────── */

      {
        id: 'gspr_checklist',
        section: 'GSPR Compliance',
        question:
          'Map the clinical evidence to the applicable General Safety and Performance Requirements (GSPRs).',
        guidance:
          'EU MDR Annex I defines the General Safety and Performance Requirements. The CER must demonstrate that clinical evidence supports conformity with each applicable GSPR. Some GSPRs are addressed through clinical evidence, while others are addressed through design verification, biocompatibility, or other non-clinical evidence. A GSPR checklist is required as part of the technical documentation per EU MDR Annex II.',
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
            helpText: 'List the specific GSPRs (by number) that require clinical data as supporting evidence',
          },
          {
            id: 'gsprs_design_verification',
            label: 'GSPRs Addressed by Design Verification',
            type: 'textarea',
            helpText: 'List GSPRs addressed through non-clinical evidence (bench testing, design verification)',
          },
          {
            id: 'gsprs_with_gaps',
            label: 'GSPRs with Evidence Gaps',
            type: 'textarea',
            helpText: 'Identify any GSPRs where the clinical evidence is insufficient and describe the plan to address',
          },
          {
            id: 'annex_i_chapter_i_covered',
            label: 'Chapter I (General Requirements) GSPRs 1-9 Addressed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'annex_i_chapter_ii_covered',
            label: 'Chapter II (Design & Manufacturing) GSPRs 10-22 Addressed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'annex_i_chapter_iii_covered',
            label: 'Chapter III (Information Supplied) GSPR 23 Addressed',
            type: 'yes_no',
            required: true,
          },
        ],
        issueChecks: [
          {
            id: 'no_gspr_mapping_check',
            condition: { field: 'gspr_mapping_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No GSPR Mapping',
            message:
              'A mapping of clinical evidence to the applicable General Safety and Performance Requirements is required per EU MDR Annex XIV Part A. Notified Bodies will expect a complete GSPR checklist as part of the technical documentation review.',
            reference: 'EU MDR Annex XIV Part A; Annex II Section 4',
          },
        ],
        defaultNext: 'common_specifications',
      },

      {
        id: 'common_specifications',
        section: 'GSPR Compliance',
        question:
          'Are there any Common Specifications (CS) applicable to this device, and how is conformity demonstrated?',
        guidance:
          'Common Specifications are adopted by the European Commission per EU MDR Article 9 for certain device categories. Where CS exist, manufacturers must comply unless they can justify that their alternative solution provides at least an equivalent level of safety and performance. Deviations from CS require robust justification.',
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
            helpText: 'List the applicable Common Specifications by reference number and title',
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
            helpText: 'If deviating from any CS, provide justification that the alternative approach provides equivalent safety and performance',
          },
          {
            id: 'conformity_assessment_route',
            label: 'Conformity Assessment Route',
            type: 'select',
            required: true,
            options: [
              { value: 'annex_ix', label: 'Annex IX — QMS + Technical Documentation' },
              { value: 'annex_x', label: 'Annex X — Type Examination' },
              { value: 'annex_xi_a', label: 'Annex XI Part A — Production QA' },
              { value: 'annex_xi_b', label: 'Annex XI Part B — Product Verification' },
            ],
            helpText: 'The conformity assessment procedure per EU MDR Annex IX-XI',
          },
        ],
        defaultNext: 'methodological_quality',
      },

      /* ── 7. Clinical Data Appraisal ────────────────────────────────── */

      {
        id: 'methodological_quality',
        section: 'Clinical Data Appraisal',
        question:
          'Describe the methodology used to appraise the quality and relevance of clinical data.',
        guidance:
          'Per MEDDEV 2.7/1 Rev 4 Sections 8-9, each piece of clinical data must be appraised for methodological quality and relevance to the subject device. This includes assessment of study design, sample size, bias, confounding, and statistical methods. Each study should be assigned a level of evidence and a weighting in the overall analysis.',
        fields: [
          {
            id: 'quality_assessment_methodology',
            label: 'Study Quality Assessment Methodology',
            type: 'textarea',
            required: true,
            helpText: 'Describe the criteria and scales used to assess the quality of individual studies',
          },
          {
            id: 'evidence_grading_system',
            label: 'Levels of Evidence Grading System',
            type: 'select',
            required: true,
            options: [
              { value: 'oxford', label: 'Oxford Centre for Evidence-Based Medicine' },
              { value: 'grade', label: 'GRADE' },
              { value: 'sign', label: 'SIGN (Scottish Intercollegiate Guidelines Network)' },
              { value: 'ahrq', label: 'AHRQ Evidence Grading' },
              { value: 'custom', label: 'Custom Framework' },
            ],
          },
          {
            id: 'relevance_assessment',
            label: 'Relevance Assessment Criteria',
            type: 'textarea',
            required: true,
            helpText: 'Describe how relevance to the subject device was assessed (e.g. same device, equivalent device, similar device category)',
          },
          {
            id: 'data_weighting_approach',
            label: 'Data Weighting Approach',
            type: 'textarea',
            required: true,
            helpText: 'Describe how different data sources and studies are weighted in the overall clinical evaluation',
          },
          {
            id: 'bias_assessment',
            label: 'Bias Assessment Conducted',
            type: 'yes_no',
            required: true,
            helpText: 'Assessment of selection bias, performance bias, detection bias, attrition bias, and reporting bias',
          },
          {
            id: 'number_pivotal_studies',
            label: 'Number of Pivotal Studies',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Studies with the highest relevance and quality forming the core evidence base',
          },
          {
            id: 'number_supportive_studies',
            label: 'Number of Supportive Studies',
            type: 'number',
            validation: { min: 0 },
          },
        ],
        defaultNext: 'data_analysis',
      },

      {
        id: 'data_analysis',
        section: 'Clinical Data Appraisal',
        question:
          'Describe the data analysis and synthesis methodology.',
        guidance:
          'The CER should describe how clinical data from different sources is analyzed and synthesized to reach conclusions on safety and performance. Where appropriate, quantitative methods (meta-analysis) may be used. The analysis should address heterogeneity between studies, publication bias, and the robustness of conclusions.',
        fields: [
          {
            id: 'statistical_methods',
            label: 'Statistical Methods for Data Synthesis',
            type: 'textarea',
            required: true,
            helpText: 'Describe the statistical methods used to analyze and synthesize clinical data',
          },
          {
            id: 'meta_analysis_performed',
            label: 'Meta-Analysis Performed',
            type: 'yes_no',
          },
          {
            id: 'meta_analysis_method',
            label: 'Meta-Analysis Method',
            type: 'select',
            visibleWhen: { field: 'meta_analysis_performed', operator: 'eq', value: true },
            options: [
              { value: 'fixed_effects', label: 'Fixed Effects Model' },
              { value: 'random_effects', label: 'Random Effects Model' },
              { value: 'bayesian', label: 'Bayesian Meta-Analysis' },
            ],
          },
          {
            id: 'heterogeneity_assessment',
            label: 'Heterogeneity Assessment',
            type: 'textarea',
            visibleWhen: { field: 'meta_analysis_performed', operator: 'eq', value: true },
            helpText: 'Describe how heterogeneity between studies was assessed (e.g. I-squared, Q statistic)',
          },
          {
            id: 'sensitivity_analysis',
            label: 'Sensitivity Analysis Performed',
            type: 'yes_no',
            helpText: 'To test the robustness of conclusions',
          },
          {
            id: 'publication_bias_assessment',
            label: 'Publication Bias Assessment',
            type: 'yes_no',
            helpText: 'e.g. Funnel plot, Egger\'s test',
          },
          {
            id: 'safety_data_summary',
            label: 'Safety Data Summary',
            type: 'textarea',
            required: true,
            helpText: 'Summarize the overall safety profile from all data sources (adverse events, complications, device-related incidents)',
          },
          {
            id: 'performance_data_summary',
            label: 'Performance/Efficacy Data Summary',
            type: 'textarea',
            required: true,
            helpText: 'Summarize the overall performance and clinical effectiveness from all data sources',
          },
        ],
        defaultNext: 'pmcf_plan',
      },

      /* ── 8. PMCF & Evaluator ──────────────────────────────────────── */

      {
        id: 'pmcf_plan',
        section: 'PMCF & Evaluator',
        question:
          'Describe the Post-Market Clinical Follow-up (PMCF) plan for this device.',
        guidance:
          'EU MDR Article 61(11) and Annex XIV Part B require a PMCF plan for all devices except where duly justified. The PMCF plan must describe how the manufacturer will proactively collect and evaluate clinical data after CE marking to confirm safety and performance throughout the device\'s lifetime. MDCG 2020-7 provides guidance on PMCF plan and PMCF evaluation report content.',
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
            helpText: 'If no PMCF is planned, provide detailed justification per EU MDR Annex XIV Part B',
          },
          {
            id: 'pmcf_study_type',
            label: 'PMCF Activities Planned',
            type: 'multi_select',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
            options: [
              { value: 'pmcf_study', label: 'PMCF Clinical Study' },
              { value: 'registry', label: 'Registry Participation' },
              { value: 'survey', label: 'Surveys / Questionnaires' },
              { value: 'literature_review', label: 'Ongoing Literature Review' },
              { value: 'complaint_analysis', label: 'Systematic Complaint Analysis' },
              { value: 'real_world_data', label: 'Real-World Data / Electronic Health Records' },
            ],
          },
          {
            id: 'pmcf_endpoints',
            label: 'PMCF Study Endpoints',
            type: 'textarea',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
            helpText: 'Primary and secondary endpoints for PMCF data collection',
          },
          {
            id: 'pmcf_sample_size',
            label: 'Target PMCF Sample Size',
            type: 'number',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
            validation: { min: 1 },
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
            helpText: 'Key milestones including interim analyses, reports to Notified Body',
          },
          {
            id: 'pmcf_evaluation_report_available',
            label: 'PMCF Evaluation Report Available',
            type: 'yes_no',
            helpText: 'Has a PMCF Evaluation Report been prepared from collected PMCF data?',
          },
          {
            id: 'pms_plan_reference',
            label: 'PMS Plan Reference',
            type: 'text',
            helpText: 'Reference number or title of the Post-Market Surveillance Plan that integrates with this PMCF plan',
          },
        ],
        issueChecks: [
          {
            id: 'no_pmcf_plan_check',
            condition: { field: 'pmcf_plan_established', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No PMCF Plan',
            message:
              'A Post-Market Clinical Follow-up plan is required per EU MDR Article 61(11) and Annex XIV Part B for all devices unless duly justified. Notified Bodies will expect a PMCF plan and will not approve the CER without one (or a robust justification for its absence).',
            reference: 'EU MDR Article 61(11); Annex XIV Part B; MDCG 2020-7',
          },
          {
            id: 'no_post_market_data_check',
            condition: { field: 'pmcf_evaluation_report_available', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Post-Market Clinical Data Included',
            message:
              'If the device is already on the market, the CER should include analysis of post-market clinical data. If no post-market data is available, explain why (e.g. new device not yet marketed).',
          },
        ],
        branches: [
          {
            when: { field: 'is_implantable', operator: 'eq', value: true },
            goto: 'implant_long_term',
          },
        ],
        defaultNext: 'evaluator_qualifications',
      },

      {
        id: 'implant_long_term',
        section: 'PMCF & Evaluator',
        question:
          'For this implantable device, describe the long-term clinical follow-up requirements and data.',
        guidance:
          'Implantable devices have specific requirements under EU MDR for long-term clinical follow-up. The expected lifetime of the device must be supported by clinical data with adequate follow-up duration. PMCF studies for implants should include long-term safety endpoints such as device survival, revision rates, and late complications. The CER must be updated annually for implantable devices per EU MDR Article 61(11).',
        fields: [
          {
            id: 'expected_implant_lifetime',
            label: 'Expected Implant Lifetime (years)',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'longest_clinical_follow_up',
            label: 'Longest Clinical Follow-Up Available (months)',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'long_term_safety_endpoints',
            label: 'Long-Term Safety Endpoints Tracked',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'device_survival', label: 'Device Survival / Implant Retention' },
              { value: 'revision_rate', label: 'Revision / Re-operation Rate' },
              { value: 'late_complications', label: 'Late Complications' },
              { value: 'migration', label: 'Migration / Displacement' },
              { value: 'material_degradation', label: 'Material Degradation / Wear' },
              { value: 'infection', label: 'Late Infection Rate' },
              { value: 'patient_outcomes', label: 'Patient-Reported Outcomes' },
            ],
          },
          {
            id: 'registry_participation',
            label: 'National/International Registry Participation',
            type: 'yes_no',
            helpText: 'e.g. National Joint Registry, SCAAR, MAUDE database',
          },
          {
            id: 'registry_name',
            label: 'Registry Name',
            type: 'text',
            visibleWhen: { field: 'registry_participation', operator: 'eq', value: true },
          },
          {
            id: 'explant_analysis_program',
            label: 'Explant / Retrieval Analysis Program in Place',
            type: 'yes_no',
            helpText: 'Systematic analysis of explanted devices to identify failure modes',
          },
        ],
        issueChecks: [
          {
            id: 'implant_cer_annual_check',
            condition: { field: 'cer_update_schedule', operator: 'neq', value: 'annual' },
            severity: 'critical',
            title: 'Implantable Device Requires Annual CER Update',
            message:
              'EU MDR requires that the CER for implantable devices be updated at least annually. A non-annual update schedule for an implantable device is non-compliant.',
            reference: 'EU MDR Article 61(11)',
          },
        ],
        defaultNext: 'evaluator_qualifications',
      },

      {
        id: 'vigilance_analysis',
        section: 'PMCF & Evaluator',
        question:
          'Provide a detailed analysis of the vigilance data and safety signals.',
        guidance:
          'When significant vigilance data exists, the CER must include a thorough analysis of serious incident reports, field safety corrective actions, and trend analyses. This section should identify root causes, assess the adequacy of corrective actions, and determine whether the overall benefit-risk profile remains acceptable. Reference EU MDR Articles 87-92 and MEDDEV 2.12-1 for vigilance reporting requirements.',
        fields: [
          {
            id: 'vigilance_data_period',
            label: 'Vigilance Data Analysis Period',
            type: 'text',
            required: true,
            placeholder: 'e.g. January 2020 — December 2025',
          },
          {
            id: 'serious_incidents_analysis',
            label: 'Serious Incident Analysis',
            type: 'textarea',
            required: true,
            helpText: 'Categorize and analyze serious incidents by type, root cause, and outcome',
          },
          {
            id: 'incident_rate_per_device',
            label: 'Incident Rate (per devices distributed)',
            type: 'text',
            required: true,
            placeholder: 'e.g. 0.001% serious incident rate',
          },
          {
            id: 'root_cause_categories',
            label: 'Root Cause Categories',
            type: 'multi_select',
            options: [
              { value: 'design', label: 'Design-Related' },
              { value: 'manufacturing', label: 'Manufacturing-Related' },
              { value: 'use_error', label: 'Use Error' },
              { value: 'maintenance', label: 'Maintenance / Service' },
              { value: 'material', label: 'Material-Related' },
              { value: 'software', label: 'Software-Related' },
              { value: 'unknown', label: 'Unknown / Under Investigation' },
            ],
          },
          {
            id: 'corrective_actions_effective',
            label: 'Corrective Actions Effective',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'benefit_risk_still_acceptable',
            label: 'Benefit-Risk Ratio Still Acceptable After Vigilance Analysis',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'competent_authority_interactions',
            label: 'Competent Authority Interactions Regarding Vigilance',
            type: 'textarea',
            helpText: 'Describe any interactions with competent authorities regarding reported incidents',
          },
        ],
        issueChecks: [
          {
            id: 'benefit_risk_no_longer_acceptable',
            condition: { field: 'benefit_risk_still_acceptable', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Benefit-Risk No Longer Acceptable After Vigilance Review',
            message:
              'If the vigilance analysis suggests the benefit-risk ratio is no longer acceptable, this is a fundamental issue that must be resolved before the CER can support continued CE marking. Immediate corrective action is required.',
          },
        ],
        defaultNext: 'evaluator_qualifications',
      },

      {
        id: 'evaluator_qualifications',
        section: 'PMCF & Evaluator',
        question:
          'Provide the qualifications and independence declaration of the CER evaluator(s).',
        guidance:
          'Per MEDDEV 2.7/1 Rev 4 Section 6 and EU MDR Annex XIV Part A, the CER must be performed by evaluators with sufficient clinical, regulatory, and scientific expertise. Evaluators must have at least 5 years of documented professional experience in the relevant medical field or device technology. They must declare any conflicts of interest. The Notified Body will assess evaluator qualifications during their review.',
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
            helpText: 'e.g. MD, PhD, MSc, Professional Engineer',
          },
          {
            id: 'evaluator_clinical_expertise',
            label: 'Clinical Expertise in Relevant Medical Field',
            type: 'textarea',
            required: true,
            helpText: 'Describe the evaluator\'s clinical experience and expertise relevant to the device\'s intended purpose',
          },
          {
            id: 'evaluator_years_experience',
            label: 'Years of Relevant Professional Experience',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'evaluator_regulatory_expertise',
            label: 'Regulatory Expertise',
            type: 'textarea',
            helpText: 'Experience with EU MDR, MEDDEV guidelines, clinical evaluation methodology',
          },
          {
            id: 'evaluator_scientific_expertise',
            label: 'Scientific Expertise',
            type: 'textarea',
            helpText: 'Research publications, academic appointments, clinical trial experience',
          },
          {
            id: 'evaluator_cv_attached',
            label: 'Evaluator CV Attached to CER',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'independence_declaration',
            label: 'Independence Declaration Signed',
            type: 'yes_no',
            required: true,
            helpText: 'Declaration confirming no conflicts of interest with the manufacturer',
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
          },
        ],
        issueChecks: [
          {
            id: 'evaluator_insufficient_experience_check',
            condition: { field: 'evaluator_years_experience', operator: 'lt', value: 5 },
            severity: 'critical',
            title: 'Evaluator May Lack Required Qualifications',
            message:
              'MEDDEV 2.7/1 Rev 4 Section 6 requires evaluators to have at least 5 years of documented professional experience in the relevant field. Evaluators with less experience may not meet Notified Body expectations and could result in CER rejection.',
            reference: 'MEDDEV 2.7/1 Rev 4, Section 6',
          },
          {
            id: 'no_independence_declaration_check',
            condition: { field: 'independence_declaration', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Independence Declaration',
            message:
              'Evaluators should provide a signed declaration of independence and disclose any potential conflicts of interest. This is expected by Notified Bodies during the CER review.',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
