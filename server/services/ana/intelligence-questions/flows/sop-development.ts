/**
 * SOP Development flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through gathering the information needed to create or
 * revise a Standard Operating Procedure, covering identification, scope,
 * process definition, roles, compliance requirements, document control,
 * training & competency, and audit & CAPA readiness.
 *
 * 15 nodes, 6 sections, 80+ fields with branching for CFR Part 11,
 * pharmacovigilance, and medical device specializations. The three
 * specialization branch nodes live in ./sop-development-specializations.ts
 * and are spread into the `nodes` array at their original position.
 *
 * @module server/services/ana/intelligence-questions/flows/sop-development
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';
import { createSopSpecializationNodes } from './sop-development-specializations.js';

export function createSopDevelopmentFlow(): FlowDefinition {
  return {
    id: 'sop-development-v1',
    category: 'sop_development',
    name: 'SOP Development',
    description:
      'Collects the information needed to develop a Standard Operating Procedure (SOP), covering identification, scope, process definition, responsible roles, compliance requirements, document control, training and competency assessment, audit readiness, CAPA integration, and deviation handling.',
    clientTypes: [],
    entryNode: 'sop_basics',
    estimatedMinutes: 45,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'sop_id',
        label: 'SOP Identification',
        nodeIds: ['sop_basics', 'sop_scope'],
      },
      {
        id: 'process_def',
        label: 'Process Definition',
        nodeIds: ['process_steps', 'roles'],
      },
      {
        id: 'compliance',
        label: 'Compliance',
        nodeIds: [
          'compliance_reqs',
          'cfr11_details',
          'pv_requirements',
          'device_requirements',
          'sop_review',
        ],
      },
      {
        id: 'doc_control',
        label: 'Document Control',
        nodeIds: ['doc_management', 'change_management'],
      },
      {
        id: 'training',
        label: 'Training & Competency',
        nodeIds: ['training_program', 'knowledge_assessment'],
      },
      {
        id: 'audit_capa',
        label: 'Audit & CAPA',
        nodeIds: ['audit_readiness', 'capa_integration', 'deviation_handling'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 1 — SOP Identification                                  */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'sop_basics',
        section: 'SOP Identification',
        question:
          'Let\'s identify this SOP. What is the title, number, department, version, and effective date?',
        guidance:
          'A well-structured SOP begins with clear identification. The title should be specific and descriptive. Assign a document number following your organization\'s naming convention, and specify the owning department to determine the review and approval chain. Prioritization helps resource planning — urgent and critical SOPs may require expedited review cycles.',
        fields: [
          {
            id: 'sop_title',
            label: 'SOP Title',
            type: 'text',
            required: true,
            placeholder: 'e.g. Monitoring Visit Report Completion',
          },
          {
            id: 'sop_number',
            label: 'SOP Number',
            type: 'text',
            placeholder: 'e.g. SOP-CL-001',
          },
          {
            id: 'sop_department',
            label: 'Department',
            type: 'select',
            required: true,
            options: [
              { value: 'clinical_operations', label: 'Clinical Operations' },
              { value: 'quality_assurance', label: 'Quality Assurance' },
              { value: 'regulatory_affairs', label: 'Regulatory Affairs' },
              { value: 'pharmacovigilance', label: 'Pharmacovigilance' },
              { value: 'data_management', label: 'Data Management' },
              { value: 'biostatistics', label: 'Biostatistics' },
              { value: 'medical_writing', label: 'Medical Writing' },
              { value: 'supply_chain', label: 'Supply Chain' },
            ],
          },
          {
            id: 'sop_version',
            label: 'Version',
            type: 'text',
            defaultValue: '1.0',
          },
          {
            id: 'sop_effective_date',
            label: 'Effective Date',
            type: 'date',
            required: true,
          },
          {
            id: 'sop_category',
            label: 'SOP Category',
            type: 'select',
            required: true,
            helpText: 'GxP SOPs require additional compliance controls and training documentation.',
            options: [
              { value: 'gxp', label: 'GxP (Regulated)' },
              { value: 'non_gxp', label: 'Non-GxP' },
              { value: 'administrative', label: 'Administrative' },
            ],
          },
          {
            id: 'sop_priority',
            label: 'Priority',
            type: 'select',
            required: true,
            options: [
              { value: 'routine', label: 'Routine' },
              { value: 'urgent', label: 'Urgent' },
              { value: 'critical', label: 'Critical' },
            ],
          },
          {
            id: 'sop_author',
            label: 'Author',
            type: 'text',
            placeholder: 'Full name of the primary author',
          },
        ],
        defaultNext: 'sop_scope',
      },

      {
        id: 'sop_scope',
        section: 'SOP Identification',
        question:
          'What is the purpose and scope of this SOP, which regulations apply, and does it require any specialization track?',
        guidance:
          'The purpose statement should explain why the SOP exists and what process it governs. The scope defines who it applies to and under what circumstances. Identifying applicable regulations ensures the SOP addresses all required elements for compliance. If this SOP involves electronic records (21 CFR Part 11), pharmacovigilance, or medical devices, select the appropriate specialization to capture additional requirements.',
        fields: [
          {
            id: 'sop_purpose',
            label: 'Purpose',
            type: 'textarea',
            required: true,
            placeholder: 'Describe why this SOP exists and what process it governs',
          },
          {
            id: 'sop_scope_description',
            label: 'Scope Description',
            type: 'textarea',
            required: true,
            placeholder: 'Define who this SOP applies to and under what circumstances',
          },
          {
            id: 'applicable_regulations',
            label: 'Applicable Regulations',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'ich_gcp', label: 'ICH GCP' },
              { value: '21_cfr_11', label: '21 CFR Part 11' },
              { value: '21_cfr_312', label: '21 CFR 312' },
              { value: 'eu_mdr', label: 'EU MDR' },
              { value: 'iso_14155', label: 'ISO 14155' },
              { value: 'gdpr', label: 'GDPR' },
              { value: 'hipaa', label: 'HIPAA' },
            ],
          },
          {
            id: 'geographic_applicability',
            label: 'Geographic Applicability',
            type: 'multi_select',
            helpText: 'Select all regions where this SOP will be applied.',
            options: [
              { value: 'us', label: 'United States' },
              { value: 'eu', label: 'European Union' },
              { value: 'japan', label: 'Japan' },
              { value: 'china', label: 'China' },
              { value: 'global', label: 'Global' },
            ],
          },
          {
            id: 'affected_systems',
            label: 'Affected Systems',
            type: 'multi_select',
            helpText: 'Select all computerized systems that interact with this SOP.',
            options: [
              { value: 'ctms', label: 'CTMS (Clinical Trial Management)' },
              { value: 'edms', label: 'EDMS (Document Management)' },
              { value: 'lims', label: 'LIMS (Lab Information Management)' },
              { value: 'erp', label: 'ERP (Enterprise Resource Planning)' },
              { value: 'edc', label: 'EDC (Electronic Data Capture)' },
              { value: 'safety_db', label: 'Safety Database' },
            ],
          },
          {
            id: 'cross_reference_sops',
            label: 'Cross-Reference SOPs',
            type: 'textarea',
            placeholder: 'List related SOPs that should be cross-referenced (one per line)',
            helpText: 'Identify existing SOPs that interact with or depend on this procedure.',
          },
          {
            id: 'sop_type_specialization',
            label: 'SOP Specialization',
            type: 'select',
            helpText:
              'If this SOP requires specialized regulatory sections, select the appropriate track. Otherwise choose General.',
            options: [
              { value: 'general', label: 'General' },
              { value: 'electronic_records', label: 'Electronic Records (21 CFR Part 11)' },
              { value: 'pharmacovigilance', label: 'Pharmacovigilance' },
              { value: 'medical_device', label: 'Medical Device' },
            ],
            defaultValue: 'general',
          },
        ],
        branches: [
          {
            when: { field: 'sop_type_specialization', operator: 'eq', value: 'electronic_records' },
            goto: 'cfr11_details',
          },
          {
            when: { field: 'sop_type_specialization', operator: 'eq', value: 'pharmacovigilance' },
            goto: 'pv_requirements',
          },
          {
            when: { field: 'sop_type_specialization', operator: 'eq', value: 'medical_device' },
            goto: 'device_requirements',
          },
        ],
        defaultNext: 'process_steps',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Branch nodes — Specialization tracks                            */
      /*  (CFR Part 11 / pharmacovigilance / medical-device deep-dives —  */
      /*  extracted to ./sop-development-specializations.ts and spread    */
      /*  here in their original position, so node order is unchanged)    */
      /* ────────────────────────────────────────────────────────────────── */

      ...createSopSpecializationNodes(),

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 2 — Process Definition                                  */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'process_steps',
        section: 'Process Definition',
        question:
          'Describe the process this SOP will cover. How many major steps are involved, and where are the critical decision points?',
        guidance:
          'A clear process overview enables structured documentation. Identify the major steps in sequence, critical decision points where the process may branch, and any exception handling procedures for deviations from normal flow. Documenting inputs, outputs, and quality checkpoints ensures completeness and traceability.',
        fields: [
          {
            id: 'process_overview',
            label: 'Process Overview',
            type: 'textarea',
            required: true,
            placeholder: 'Provide a high-level description of the entire process',
          },
          {
            id: 'num_major_steps',
            label: 'Number of Major Steps',
            type: 'number',
            required: true,
            validation: { min: 1, max: 50 },
          },
          {
            id: 'critical_decision_points',
            label: 'Critical Decision Points',
            type: 'textarea',
            helpText: 'Describe points where decisions could change the process flow',
          },
          {
            id: 'exception_handling',
            label: 'Exception Handling',
            type: 'textarea',
            placeholder: 'How are deviations from the standard process handled?',
          },
          {
            id: 'process_inputs',
            label: 'Process Inputs',
            type: 'textarea',
            placeholder: 'List all inputs required before the process can begin (documents, data, approvals)',
            helpText: 'Identify prerequisites, source documents, and trigger events.',
          },
          {
            id: 'process_outputs',
            label: 'Process Outputs',
            type: 'textarea',
            placeholder: 'List all outputs produced by the process (records, reports, approvals)',
            helpText: 'Identify deliverables, records generated, and downstream handoffs.',
          },
          {
            id: 'quality_checkpoints',
            label: 'Quality Checkpoints',
            type: 'textarea',
            placeholder: 'Describe verification or review points within the process',
            helpText: 'Where in the process are quality checks performed? Who performs them?',
          },
          {
            id: 'forms_and_templates',
            label: 'Associated Forms and Templates',
            type: 'textarea',
            placeholder: 'List forms, templates, or checklists used during the process',
          },
        ],
        defaultNext: 'roles',
      },

      {
        id: 'roles',
        section: 'Process Definition',
        question:
          'Who is responsible for executing this process, and what does the approval chain look like?',
        guidance:
          'Clearly defined roles and responsibilities ensure accountability. The approval chain should follow your organization\'s quality system hierarchy. Training requirements help ensure personnel are competent to perform the procedure. Document delegation authorities and escalation paths to handle absences and exceptions.',
        fields: [
          {
            id: 'responsible_roles',
            label: 'Responsible Roles',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'sponsor', label: 'Sponsor' },
              { value: 'cra', label: 'CRA' },
              { value: 'project_manager', label: 'Project Manager' },
              { value: 'medical_monitor', label: 'Medical Monitor' },
              { value: 'data_manager', label: 'Data Manager' },
              { value: 'statistician', label: 'Statistician' },
              { value: 'regulatory_specialist', label: 'Regulatory Specialist' },
              { value: 'quality_manager', label: 'Quality Manager' },
            ],
          },
          {
            id: 'approval_chain',
            label: 'Approval Chain',
            type: 'textarea',
            required: true,
            helpText: 'List roles in approval sequence (e.g., Author -> Reviewer -> QA -> Approver)',
          },
          {
            id: 'training_required',
            label: 'Training Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'delegation_authority',
            label: 'Delegation Authority',
            type: 'textarea',
            placeholder: 'Describe who can delegate and under what conditions',
            helpText: 'Document who can act on behalf of the responsible person during absences.',
          },
          {
            id: 'escalation_path',
            label: 'Escalation Path',
            type: 'textarea',
            placeholder: 'Define the escalation hierarchy for issues or delays',
            helpText: 'When and to whom should issues be escalated?',
          },
          {
            id: 'subject_matter_experts',
            label: 'Subject Matter Experts',
            type: 'textarea',
            placeholder: 'List SMEs who should be consulted for this SOP',
            helpText: 'Identify internal or external experts whose input is needed.',
          },
        ],
        issueChecks: [
          {
            id: 'no_training_for_gxp',
            condition: { field: 'training_required', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Training Required for GxP SOPs',
            message:
              'FDA expects all personnel performing GxP activities to be trained and competent. Lack of training documentation is one of the most common FDA 483 observations. Ensure training requirements are defined even for non-GxP SOPs as a best practice.',
            reference: '21 CFR 211.25, 21 CFR 820.25',
          },
        ],
        defaultNext: 'compliance_reqs',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 3 — Compliance                                          */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'compliance_reqs',
        section: 'Compliance',
        question:
          'What are the compliance requirements for this SOP? Consider audit trail, electronic signatures, record retention, and data integrity.',
        guidance:
          'Regulatory compliance requirements drive documentation and system controls. If the SOP involves electronic records or signatures, 21 CFR Part 11 compliance is essential. Record retention periods should align with applicable regulations and your organization\'s quality policy. Data integrity (ALCOA+) principles should be embedded in every GxP SOP.',
        fields: [
          {
            id: 'audit_trail_required',
            label: 'Audit Trail Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'electronic_signatures',
            label: 'Electronic Signatures Required',
            type: 'yes_no',
          },
          {
            id: 'record_retention_period',
            label: 'Record Retention Period',
            type: 'select',
            required: true,
            options: [
              { value: '3_years', label: '3 Years' },
              { value: '5_years', label: '5 Years' },
              { value: '7_years', label: '7 Years' },
              { value: '15_years', label: '15 Years' },
              { value: 'permanent', label: 'Permanent' },
            ],
          },
          {
            id: 'associated_forms_templates',
            label: 'Associated Forms/Templates',
            type: 'textarea',
          },
          {
            id: 'gxp_classification',
            label: 'GxP Classification',
            type: 'select',
            required: true,
            helpText: 'Select the specific Good Practice classification for this SOP.',
            options: [
              { value: 'gcp', label: 'GCP (Good Clinical Practice)' },
              { value: 'gmp', label: 'GMP (Good Manufacturing Practice)' },
              { value: 'glp', label: 'GLP (Good Laboratory Practice)' },
              { value: 'gvp', label: 'GVP (Good Pharmacovigilance Practice)' },
              { value: 'gdp', label: 'GDP (Good Distribution Practice)' },
              { value: 'non_gxp', label: 'Non-GxP' },
            ],
          },
          {
            id: 'data_integrity_alcoa',
            label: 'Data Integrity (ALCOA+) Addressed',
            type: 'yes_no',
            required: true,
            helpText:
              'ALCOA+ stands for Attributable, Legible, Contemporaneous, Original, Accurate, Complete, Consistent, Enduring, and Available.',
          },
          {
            id: 'cfr_part_11_scope',
            label: '21 CFR Part 11 Scope Details',
            type: 'textarea',
            placeholder: 'Describe which electronic records and signatures are in scope',
            visibleWhen: { field: 'electronic_signatures', operator: 'eq', value: true },
          },
          {
            id: 'regulatory_inspection_history',
            label: 'Regulatory Inspection History',
            type: 'textarea',
            placeholder: 'Summarize any relevant inspection findings related to this process area',
            helpText: 'Note any previous 483 observations, warning letters, or audit findings.',
          },
        ],
        issueChecks: [
          {
            id: 'esig_without_cfr11',
            condition: { field: 'electronic_signatures', operator: 'eq', value: true },
            severity: 'critical',
            title: '21 CFR Part 11 Compliance Required',
            message:
              'Electronic signatures require full 21 CFR Part 11 compliance including system validation, audit trails, and access controls. Ensure the applicable regulations for this SOP include 21 CFR Part 11 and that all predicate rule requirements are addressed.',
            reference: '21 CFR Part 11',
          },
          {
            id: 'short_retention',
            condition: { field: 'record_retention_period', operator: 'eq', value: '3_years' },
            severity: 'critical',
            title: 'Insufficient Retention Period',
            message:
              'A 3-year retention period may be insufficient for GxP records. FDA requires retention for at least 2 years after drug approval or investigation discontinuation (21 CFR 312.62). EU GMP requires 1 year after expiry or 5 years after certification. Review your retention policy against all applicable regulations.',
            reference: '21 CFR 312.62, EU GMP Chapter 4',
          },
          {
            id: 'no_audit_trail_gxp',
            condition: { field: 'audit_trail_required', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Audit Trail Required for GxP SOPs',
            message:
              'GxP SOPs handling electronic records must maintain audit trails per 21 CFR Part 11 and EU Annex 11. Audit trails are essential for data integrity and regulatory compliance.',
            reference: '21 CFR 11.10(e), EU Annex 11',
          },
          {
            id: 'no_data_integrity',
            condition: { field: 'data_integrity_alcoa', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Data Integrity (ALCOA+) Not Addressed',
            message:
              'FDA and EMA expect data integrity principles (ALCOA+) to be embedded in SOPs. Consider addressing Attributable, Legible, Contemporaneous, Original, and Accurate requirements. Failure to address data integrity is an increasingly common inspection finding.',
            reference: 'FDA Data Integrity Guidance (2018)',
          },
        ],
        defaultNext: 'sop_review',
      },

      {
        id: 'sop_review',
        section: 'Compliance',
        question:
          'How often should this SOP be reviewed, and what governance mechanisms apply?',
        guidance:
          'Periodic review ensures SOPs remain current with evolving regulations and organizational processes. Most quality systems require review at least every two to three years. If this SOP supersedes a previous version, capture the prior document number for traceability. Review committees and effectiveness metrics help ensure quality oversight.',
        fields: [
          {
            id: 'review_frequency',
            label: 'Review Frequency',
            type: 'select',
            required: true,
            defaultValue: 'annual',
            options: [
              { value: 'annual', label: 'Annual' },
              { value: 'biennial', label: 'Biennial' },
              { value: 'triennial', label: 'Triennial' },
              { value: 'as_needed', label: 'As Needed' },
            ],
          },
          {
            id: 'superseded_sop_number',
            label: 'Superseded SOP Number',
            type: 'text',
            placeholder: 'e.g. SOP-CL-001 v2.0',
          },
          {
            id: 'change_control_notes',
            label: 'Change Control Notes',
            type: 'textarea',
            placeholder: 'Summarize reasons for revision or key changes from the previous version',
          },
          {
            id: 'review_committee_members',
            label: 'Review Committee Members',
            type: 'textarea',
            placeholder: 'List the roles or names on the review committee',
            helpText: 'Identify the cross-functional team responsible for periodic SOP review.',
          },
          {
            id: 'effectiveness_metrics',
            label: 'Effectiveness Metrics',
            type: 'textarea',
            placeholder: 'How will you measure whether this SOP is effective?',
            helpText:
              'Examples: deviation rates, training completion rates, audit findings, process cycle times.',
          },
          {
            id: 'sunset_clause',
            label: 'Sunset Clause',
            type: 'yes_no',
            helpText:
              'A sunset clause automatically flags the SOP for review or retirement if not revised within a specified period.',
          },
        ],
        issueChecks: [
          {
            id: 'no_periodic_review',
            condition: { field: 'review_frequency', operator: 'eq', value: 'as_needed' },
            severity: 'warning',
            title: 'No Periodic Review Defined',
            message:
              'SOPs should have a defined periodic review cycle. "As needed" review may result in outdated procedures remaining in circulation. Most quality systems require review at least every 2-3 years.',
            reference: 'ICH Q10 Section 3.2.5',
          },
          {
            id: 'no_sunset_clause',
            condition: { field: 'sunset_clause', operator: 'eq', value: false },
            severity: 'info',
            title: 'Consider Sunset Clause',
            message:
              'A sunset clause ensures SOPs are automatically flagged for review if not revised within a specified period. This prevents obsolete procedures from remaining active indefinitely.',
          },
        ],
        defaultNext: 'doc_management',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 4 — Document Control                                    */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'doc_management',
        section: 'Document Control',
        question:
          'How will this SOP be managed within your document management system?',
        guidance:
          'Effective document control is fundamental to GxP compliance. 21 CFR 211.186 and ICH Q10 require controlled document systems. Your DMS should ensure only current versions are in use and obsolete versions are promptly removed from circulation. The document numbering convention and distribution method should be defined before the SOP becomes effective.',
        fields: [
          {
            id: 'dms_system',
            label: 'Document Management System',
            type: 'select',
            required: true,
            options: [
              { value: 'veeva_vault', label: 'Veeva Vault' },
              { value: 'mastercontrol', label: 'MasterControl' },
              { value: 'documentum', label: 'Documentum' },
              { value: 'sharepoint', label: 'SharePoint' },
              { value: 'paper_based', label: 'Paper-Based' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'version_control_method',
            label: 'Version Control Method',
            type: 'select',
            required: true,
            options: [
              { value: 'major_minor', label: 'Major.Minor (e.g., 2.1)' },
              { value: 'sequential', label: 'Sequential (e.g., v1, v2, v3)' },
              { value: 'date_based', label: 'Date-Based' },
            ],
          },
          {
            id: 'controlled_copy_distribution',
            label: 'Controlled Copy Distribution',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'electronic_only', label: 'Electronic Only' },
              { value: 'printed_controlled', label: 'Printed Controlled Copies' },
              { value: 'both', label: 'Both Electronic and Printed' },
            ],
          },
          {
            id: 'archiving_method',
            label: 'Archiving Method',
            type: 'select',
            required: true,
            options: [
              { value: 'electronic_archive', label: 'Electronic Archive' },
              { value: 'physical_archive', label: 'Physical Archive' },
              { value: 'hybrid', label: 'Hybrid' },
            ],
          },
          {
            id: 'retrieval_procedures',
            label: 'Retrieval Procedures',
            type: 'textarea',
            placeholder: 'Describe how archived SOP versions can be retrieved when needed',
          },
          {
            id: 'document_numbering_convention',
            label: 'Document Numbering Convention',
            type: 'text',
            placeholder: 'e.g. SOP-[DEPT]-[SEQ]-[REV]',
            helpText: 'Define the standard numbering format for SOPs in your organization.',
          },
          {
            id: 'watermark_requirements',
            label: 'Watermark Requirements',
            type: 'yes_no',
            helpText: 'Are controlled copies required to have watermarks (e.g., CONTROLLED COPY, DRAFT)?',
          },
        ],
        issueChecks: [
          {
            id: 'paper_based_dms',
            condition: { field: 'dms_system', operator: 'eq', value: 'paper_based' },
            severity: 'warning',
            title: 'Paper-Based Document Management',
            message:
              'Paper-based document management systems increase risk of uncontrolled copies and version confusion. Consider transitioning to an electronic DMS for improved compliance, searchability, and audit trail capabilities.',
            reference: 'ICH Q10, 21 CFR 211.186',
          },
        ],
        defaultNext: 'change_management',
      },

      {
        id: 'change_management',
        section: 'Document Control',
        question:
          'How are changes to this SOP initiated, assessed, and approved?',
        guidance:
          'Change control ensures SOP modifications are systematic and traceable. ICH Q10 Section 3.2.4 and 21 CFR 820.40 (for devices) require documented change control procedures. All changes should be assessed for impact on related processes, training needs, and regulatory filings. Emergency changes need special handling to maintain compliance while allowing timely response.',
        fields: [
          {
            id: 'change_request_process',
            label: 'Change Request Process',
            type: 'select',
            required: true,
            options: [
              { value: 'formal_cr', label: 'Formal Change Request (CR)' },
              { value: 'informal', label: 'Informal' },
              { value: 'email_based', label: 'Email-Based' },
              { value: 'dms_workflow', label: 'DMS Workflow' },
            ],
          },
          {
            id: 'impact_assessment_required',
            label: 'Impact Assessment Required',
            type: 'yes_no',
            required: true,
            helpText: 'Is a formal impact assessment required before changes are approved?',
          },
          {
            id: 'emergency_change_procedure',
            label: 'Emergency Change Procedure Exists',
            type: 'yes_no',
            helpText: 'Is there a procedure for expedited changes in urgent situations?',
          },
          {
            id: 'emergency_change_details',
            label: 'Emergency Change Details',
            type: 'textarea',
            placeholder: 'Describe the emergency change procedure and approval requirements',
            visibleWhen: { field: 'emergency_change_procedure', operator: 'eq', value: true },
          },
          {
            id: 'change_history_tracking',
            label: 'Change History Tracking',
            type: 'select',
            required: true,
            options: [
              { value: 'automated', label: 'Automated (DMS tracked)' },
              { value: 'manual_log', label: 'Manual Log' },
              { value: 'version_comparison', label: 'Version Comparison' },
            ],
          },
          {
            id: 'stakeholder_notification',
            label: 'Stakeholder Notification Method',
            type: 'multi_select',
            required: true,
            helpText: 'How are affected personnel notified when the SOP changes?',
            options: [
              { value: 'email', label: 'Email Notification' },
              { value: 'training_system', label: 'Training System Assignment' },
              { value: 'read_acknowledge', label: 'Read and Acknowledge' },
              { value: 'team_meeting', label: 'Team Meeting' },
            ],
          },
          {
            id: 'change_effectiveness_review',
            label: 'Change Effectiveness Review',
            type: 'yes_no',
            helpText: 'Is an effectiveness review conducted after SOP changes are implemented?',
          },
        ],
        issueChecks: [
          {
            id: 'no_impact_assessment',
            condition: { field: 'impact_assessment_required', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Impact Assessment Recommended',
            message:
              'Changes to SOPs should include an impact assessment to evaluate effects on related procedures, training requirements, and regulatory filings. Without impact assessment, changes may have unintended consequences on validated systems or regulatory submissions.',
            reference: 'ICH Q10 Section 3.2.4',
          },
        ],
        defaultNext: 'training_program',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 5 — Training & Competency                               */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'training_program',
        section: 'Training & Competency',
        question:
          'What training methodology will support this SOP?',
        guidance:
          '21 CFR 211.25 (pharma), 21 CFR 820.25 (devices), and ICH Q10 require that personnel performing GxP activities are trained and qualified. Training records must demonstrate competency before personnel perform regulated activities independently. The training methodology should be proportionate to the complexity and risk of the procedure.',
        fields: [
          {
            id: 'training_methods',
            label: 'Training Methods',
            type: 'multi_select',
            required: true,
            helpText: 'Select all training delivery methods that will be used.',
            options: [
              { value: 'classroom', label: 'Classroom Training' },
              { value: 'ojt', label: 'On-the-Job Training (OJT)' },
              { value: 'e_learning', label: 'E-Learning' },
              { value: 'self_study', label: 'Self-Study (Read & Understand)' },
              { value: 'mentoring', label: 'Mentoring' },
              { value: 'simulation', label: 'Simulation / Dry Run' },
            ],
          },
          {
            id: 'initial_training_timeline',
            label: 'Initial Training Timeline',
            type: 'select',
            required: true,
            helpText: 'How soon must new personnel complete training after SOP becomes effective?',
            options: [
              { value: '24_hours', label: 'Within 24 Hours' },
              { value: '48_hours', label: 'Within 48 Hours' },
              { value: '1_week', label: 'Within 1 Week' },
              { value: '2_weeks', label: 'Within 2 Weeks' },
              { value: '30_days', label: 'Within 30 Days' },
            ],
          },
          {
            id: 'retraining_triggers',
            label: 'Retraining Triggers',
            type: 'multi_select',
            required: true,
            helpText: 'Select all events that trigger retraining on this SOP.',
            options: [
              { value: 'revision_update', label: 'SOP Revision / Update' },
              { value: 'capa_action', label: 'CAPA Action' },
              { value: 'periodic_schedule', label: 'Periodic Schedule' },
              { value: 'competency_gap', label: 'Competency Gap Identified' },
              { value: 'role_change', label: 'Role Change' },
            ],
          },
          {
            id: 'training_records_system',
            label: 'Training Records System',
            type: 'select',
            required: true,
            options: [
              { value: 'lms', label: 'Learning Management System (LMS)' },
              { value: 'paper_based', label: 'Paper-Based' },
              { value: 'hybrid', label: 'Hybrid' },
              { value: 'spreadsheet', label: 'Spreadsheet' },
            ],
          },
          {
            id: 'competency_assessment_method',
            label: 'Competency Assessment Method',
            type: 'multi_select',
            required: true,
            helpText: 'How will personnel demonstrate competency after training?',
            options: [
              { value: 'written_test', label: 'Written Test' },
              { value: 'practical_demonstration', label: 'Practical Demonstration' },
              { value: 'observed_performance', label: 'Observed Performance' },
              { value: 'quiz', label: 'Online Quiz' },
              { value: 'case_study', label: 'Case Study' },
            ],
          },
          {
            id: 'training_effectiveness_measurement',
            label: 'Training Effectiveness Measurement',
            type: 'select',
            helpText: 'How will you measure whether training was effective?',
            options: [
              { value: 'post_training_assessment', label: 'Post-Training Assessment' },
              { value: 'performance_monitoring', label: 'Performance Monitoring' },
              { value: 'error_rate_tracking', label: 'Error Rate Tracking' },
              { value: 'supervisor_evaluation', label: 'Supervisor Evaluation' },
            ],
          },
          {
            id: 'gxp_training_required',
            label: 'GxP-Specific Training Required',
            type: 'yes_no',
            required: true,
            helpText:
              'Does this SOP require GxP-specific training (e.g., GCP, GMP, GLP fundamentals)?',
          },
        ],
        issueChecks: [
          {
            id: 'no_gxp_training',
            condition: { field: 'gxp_training_required', operator: 'eq', value: false },
            severity: 'critical',
            title: 'GxP Training Required',
            message:
              'FDA and EMA require documented training for all GxP activities. Failure to train personnel on GxP SOPs is a common FDA 483 observation. Consider whether GxP fundamentals training should be a prerequisite for this SOP.',
            reference: '21 CFR 211.25, 21 CFR 820.25',
          },
        ],
        defaultNext: 'knowledge_assessment',
      },

      {
        id: 'knowledge_assessment',
        section: 'Training & Competency',
        question:
          'How will you assess and maintain competency for personnel following this SOP?',
        guidance:
          'Competency assessment goes beyond training completion. FDA expects documented evidence that personnel can perform procedures correctly. EU GMP Annex 15 and ICH Q10 emphasize the need for ongoing competency verification, not just initial training sign-off. Define clear passing criteria and remediation plans for personnel who do not meet standards.',
        fields: [
          {
            id: 'assessment_types',
            label: 'Assessment Types',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'written_exam', label: 'Written Examination' },
              { value: 'practical_skills', label: 'Practical Skills Assessment' },
              { value: 'observed_performance', label: 'Observed Performance' },
              { value: 'oral_examination', label: 'Oral Examination' },
              { value: 'scenario_based', label: 'Scenario-Based Assessment' },
            ],
          },
          {
            id: 'passing_criteria',
            label: 'Passing Criteria',
            type: 'select',
            required: true,
            options: [
              { value: '70_percent', label: '70% or Higher' },
              { value: '80_percent', label: '80% or Higher' },
              { value: '90_percent', label: '90% or Higher' },
              { value: '100_percent', label: '100% (Perfect Score)' },
              { value: 'competency_based', label: 'Competency-Based (Pass/Fail)' },
            ],
          },
          {
            id: 'remediation_process',
            label: 'Remediation Process',
            type: 'select',
            required: true,
            helpText: 'What happens when personnel fail to demonstrate competency?',
            options: [
              { value: 'retrain_retest', label: 'Retrain and Retest' },
              { value: 'additional_mentoring', label: 'Additional Mentoring' },
              { value: 'restricted_duties', label: 'Restricted Duties' },
              { value: 'formal_remediation_plan', label: 'Formal Remediation Plan' },
            ],
          },
          {
            id: 'remediation_timeline',
            label: 'Remediation Timeline',
            type: 'select',
            required: true,
            helpText: 'How quickly must remediation be completed?',
            options: [
              { value: '24_hours', label: 'Within 24 Hours' },
              { value: '48_hours', label: 'Within 48 Hours' },
              { value: '1_week', label: 'Within 1 Week' },
              { value: '2_weeks', label: 'Within 2 Weeks' },
              { value: '30_days', label: 'Within 30 Days' },
            ],
          },
          {
            id: 'ongoing_competency_frequency',
            label: 'Ongoing Competency Assessment Frequency',
            type: 'select',
            required: true,
            options: [
              { value: 'annual', label: 'Annual' },
              { value: 'biennial', label: 'Biennial' },
              { value: 'with_each_revision', label: 'With Each SOP Revision' },
              { value: 'risk_based', label: 'Risk-Based' },
            ],
          },
          {
            id: 'competency_documentation',
            label: 'Competency Documentation',
            type: 'select',
            required: true,
            helpText: 'How are competency records maintained?',
            options: [
              { value: 'training_matrix', label: 'Training Matrix' },
              { value: 'individual_records', label: 'Individual Training Records' },
              { value: 'both', label: 'Both Matrix and Individual Records' },
              { value: 'competency_portfolio', label: 'Competency Portfolio' },
            ],
          },
        ],
        defaultNext: 'audit_readiness',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 6 — Audit & CAPA                                        */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'audit_readiness',
        section: 'Audit & CAPA',
        question:
          'How audit-ready is this SOP and its associated documentation?',
        guidance:
          'FDA 483 observations frequently cite inadequate SOPs, failure to follow written procedures, and insufficient training. Proactive mock audits and gap analyses identify these issues before an actual inspection. Review FDA Warning Letters in your therapeutic area for common findings and ensure your SOP addresses those patterns.',
        fields: [
          {
            id: 'mock_audit_schedule',
            label: 'Mock Audit Schedule',
            type: 'select',
            required: true,
            options: [
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'semi_annual', label: 'Semi-Annual' },
              { value: 'annual', label: 'Annual' },
              { value: 'pre_inspection', label: 'Pre-Inspection Only' },
              { value: 'none', label: 'None' },
            ],
          },
          {
            id: 'documentation_review_checklist',
            label: 'Documentation Review Checklist Exists',
            type: 'yes_no',
            required: true,
            helpText: 'Is there a checklist to verify SOP documentation completeness before audits?',
          },
          {
            id: 'common_483_observations_addressed',
            label: 'Common 483 Observations Addressed',
            type: 'multi_select',
            helpText: 'Select which common FDA 483 observations this SOP addresses.',
            options: [
              { value: 'inadequate_procedures', label: 'Inadequate Written Procedures' },
              { value: 'failure_to_follow_sop', label: 'Failure to Follow SOP' },
              { value: 'inadequate_training', label: 'Inadequate Training' },
              { value: 'missing_signatures', label: 'Missing Signatures / Dates' },
              { value: 'incomplete_records', label: 'Incomplete Records' },
              { value: 'no_deviation_handling', label: 'No Deviation Handling' },
            ],
          },
          {
            id: 'inspection_readiness_score',
            label: 'Inspection Readiness Self-Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'fully_ready', label: 'Fully Ready' },
              { value: 'mostly_ready', label: 'Mostly Ready' },
              { value: 'needs_improvement', label: 'Needs Improvement' },
              { value: 'not_ready', label: 'Not Ready' },
            ],
          },
          {
            id: 'previous_audit_findings',
            label: 'Previous Audit Findings',
            type: 'textarea',
            placeholder: 'Summarize any relevant findings from previous audits or inspections',
          },
          {
            id: 'gap_analysis_completed',
            label: 'Gap Analysis Completed',
            type: 'yes_no',
            helpText: 'Has a gap analysis been performed against current regulatory requirements?',
          },
        ],
        issueChecks: [
          {
            id: 'no_mock_audits',
            condition: { field: 'mock_audit_schedule', operator: 'eq', value: 'none' },
            severity: 'warning',
            title: 'No Mock Audit Program',
            message:
              'Regular mock audits help identify compliance gaps before regulatory inspections. Consider establishing at least an annual mock audit schedule for GxP SOPs.',
            reference: 'FDA Inspection Best Practices',
          },
          {
            id: 'not_inspection_ready',
            condition: { field: 'inspection_readiness_score', operator: 'eq', value: 'not_ready' },
            severity: 'critical',
            title: 'Not Inspection Ready',
            message:
              'An SOP that is not inspection-ready poses significant regulatory risk. Address all identified gaps before the SOP becomes effective. Consider delaying the effective date until readiness is achieved.',
          },
        ],
        defaultNext: 'capa_integration',
      },

      {
        id: 'capa_integration',
        section: 'Audit & CAPA',
        question:
          'How does this SOP integrate with your CAPA system?',
        guidance:
          '21 CFR 820.90 (devices) and ICH Q10 (pharma) require documented CAPA systems. CAPAs must be proportionate to the risk and documented to demonstrate closure. FDA expects that CAPA effectiveness is verified and that similar issues do not recur. Root cause analysis methodology should be appropriate for the complexity of the issue.',
        fields: [
          {
            id: 'corrective_action_triggers',
            label: 'Corrective Action Triggers',
            type: 'multi_select',
            required: true,
            helpText: 'Select all events that can trigger a corrective action.',
            options: [
              { value: 'deviation', label: 'Deviation' },
              { value: 'complaint', label: 'Complaint' },
              { value: 'audit_finding', label: 'Audit Finding' },
              { value: 'trending_event', label: 'Trending Event' },
              { value: 'oos_result', label: 'Out-of-Specification Result' },
              { value: 'adverse_event', label: 'Adverse Event' },
            ],
          },
          {
            id: 'preventive_action_methodology',
            label: 'Preventive Action Methodology',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'risk_assessment', label: 'Risk Assessment' },
              { value: 'trend_analysis', label: 'Trend Analysis' },
              { value: 'process_capability', label: 'Process Capability Analysis' },
              { value: 'fmea', label: 'FMEA (Failure Mode & Effects Analysis)' },
              { value: 'root_cause_analysis', label: 'Root Cause Analysis' },
            ],
          },
          {
            id: 'root_cause_analysis_method',
            label: 'Root Cause Analysis Method',
            type: 'select',
            required: true,
            options: [
              { value: 'fishbone', label: 'Fishbone (Ishikawa) Diagram' },
              { value: '5_why', label: '5 Whys' },
              { value: 'fault_tree', label: 'Fault Tree Analysis' },
              { value: 'rcfa', label: 'Root Cause Failure Analysis (RCFA)' },
              { value: 'is_is_not', label: 'Is / Is Not Analysis' },
            ],
          },
          {
            id: 'effectiveness_check_timeline',
            label: 'Effectiveness Check Timeline',
            type: 'select',
            required: true,
            helpText: 'When will CAPA effectiveness be verified after implementation?',
            options: [
              { value: '30_days', label: '30 Days' },
              { value: '60_days', label: '60 Days' },
              { value: '90_days', label: '90 Days' },
              { value: '180_days', label: '180 Days' },
              { value: 'custom', label: 'Custom Timeline' },
            ],
          },
          {
            id: 'capa_documentation_requirements',
            label: 'CAPA Documentation Requirements',
            type: 'multi_select',
            required: true,
            helpText: 'Select all required CAPA documentation elements.',
            options: [
              { value: 'investigation_report', label: 'Investigation Report' },
              { value: 'root_cause_analysis', label: 'Root Cause Analysis Document' },
              { value: 'action_plan', label: 'Action Plan' },
              { value: 'effectiveness_evidence', label: 'Effectiveness Evidence' },
              { value: 'management_review', label: 'Management Review Record' },
            ],
          },
          {
            id: 'capa_escalation_criteria',
            label: 'CAPA Escalation Criteria',
            type: 'textarea',
            placeholder: 'Describe when and how CAPAs should be escalated to senior management',
          },
        ],
        issueChecks: [
          {
            id: 'no_effectiveness_check',
            condition: { field: 'effectiveness_check_timeline', operator: 'eq', value: 'custom' },
            severity: 'info',
            title: 'Define Effectiveness Timeline',
            message:
              'Ensure the custom effectiveness check timeline is documented and justified. The timeline should be long enough to verify effectiveness but short enough to catch recurring issues promptly.',
          },
        ],
        defaultNext: 'deviation_handling',
      },

      {
        id: 'deviation_handling',
        section: 'Audit & CAPA',
        question:
          'How will deviations from this SOP be classified, reported, and resolved?',
        guidance:
          'ICH Q10 and 21 CFR 211.192 require investigation of deviations. Critical deviations may require regulatory notification. All deviations should be trended to identify systemic issues. FDA expects that repeated deviations trigger CAPA actions and potentially SOP revision. Clearly defined classification and timelines ensure consistent handling.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'deviation_classification',
            label: 'Deviation Classification Levels',
            type: 'multi_select',
            required: true,
            helpText: 'Select all deviation severity levels used in your classification system.',
            options: [
              { value: 'minor', label: 'Minor' },
              { value: 'major', label: 'Major' },
              { value: 'critical', label: 'Critical' },
            ],
          },
          {
            id: 'minor_deviation_timeline',
            label: 'Minor Deviation Resolution Timeline',
            type: 'select',
            required: true,
            options: [
              { value: '24_hours', label: '24 Hours' },
              { value: '48_hours', label: '48 Hours' },
              { value: '72_hours', label: '72 Hours' },
              { value: '5_business_days', label: '5 Business Days' },
            ],
          },
          {
            id: 'major_deviation_timeline',
            label: 'Major Deviation Resolution Timeline',
            type: 'select',
            required: true,
            options: [
              { value: '24_hours', label: '24 Hours' },
              { value: '48_hours', label: '48 Hours' },
              { value: '72_hours', label: '72 Hours' },
            ],
          },
          {
            id: 'critical_deviation_timeline',
            label: 'Critical Deviation Resolution Timeline',
            type: 'select',
            required: true,
            options: [
              { value: 'immediate', label: 'Immediate' },
              { value: '2_hours', label: '2 Hours' },
              { value: '4_hours', label: '4 Hours' },
              { value: '24_hours', label: '24 Hours' },
            ],
          },
          {
            id: 'investigation_requirements',
            label: 'Investigation Requirements',
            type: 'multi_select',
            required: true,
            helpText: 'Select all required investigation activities for deviations.',
            options: [
              { value: 'root_cause_analysis', label: 'Root Cause Analysis' },
              { value: 'impact_assessment', label: 'Impact Assessment' },
              { value: 'capa_evaluation', label: 'CAPA Evaluation' },
              { value: 'regulatory_notification', label: 'Regulatory Notification Assessment' },
              { value: 'management_review', label: 'Management Review' },
            ],
          },
          {
            id: 'capa_linkage',
            label: 'CAPA Linkage',
            type: 'select',
            required: true,
            helpText: 'When does a deviation trigger a CAPA?',
            options: [
              { value: 'automatic', label: 'Automatic (All Deviations)' },
              { value: 'risk_based', label: 'Risk-Based Assessment' },
              { value: 'all_major_critical', label: 'All Major and Critical Deviations' },
              { value: 'case_by_case', label: 'Case-by-Case Evaluation' },
            ],
          },
          {
            id: 'deviation_trending',
            label: 'Deviation Trending Frequency',
            type: 'select',
            required: true,
            options: [
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'real_time_dashboard', label: 'Real-Time Dashboard' },
              { value: 'annual', label: 'Annual' },
            ],
          },
          {
            id: 'deviation_approval_authority',
            label: 'Deviation Approval Authority',
            type: 'textarea',
            placeholder: 'Define who has authority to approve deviation closures at each severity level',
            helpText:
              'Specify the approval authority for minor, major, and critical deviations.',
          },
        ],
        issueChecks: [
          {
            id: 'no_deviation_trending',
            condition: { field: 'deviation_trending', operator: 'eq', value: 'annual' },
            severity: 'warning',
            title: 'Infrequent Deviation Trending',
            message:
              'Annual deviation trending may miss emerging patterns. Consider more frequent trending (monthly or quarterly) to enable early detection of systemic issues and prevent repeat deviations.',
            reference: 'ICH Q10 Section 3.2',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
