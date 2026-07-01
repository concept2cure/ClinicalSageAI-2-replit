/**
 * SOP Development flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through gathering the information needed to create or
 * revise a Standard Operating Procedure, covering identification, scope,
 * process definition, roles, and compliance requirements.
 *
 * @module server/services/ana/intelligence-questions/flows/sop-development
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createSopDevelopmentFlow(): FlowDefinition {
  return {
    id: 'sop-development-v1',
    category: 'sop_development',
    name: 'SOP Development',
    description:
      'Collects the information needed to develop a Standard Operating Procedure (SOP), covering identification, scope, process definition, responsible roles, compliance requirements, and review lifecycle.',
    clientTypes: [],
    entryNode: 'sop_basics',
    estimatedMinutes: 20,

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
        nodeIds: ['compliance_reqs', 'sop_review'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── SOP Identification ────────────────────────────────────────── */

      {
        id: 'sop_basics',
        section: 'SOP Identification',
        question:
          'Let\'s identify this SOP. What is the title, number, department, version, and effective date?',
        guidance:
          'A well-structured SOP begins with clear identification. The title should be specific and descriptive. Assign a document number following your organization\'s naming convention, and specify the owning department to determine the review and approval chain.',
        fields: [
          {
            id: 'sop_title',
            label: 'SOP Title',
            type: 'text',
            required: true,
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
        ],
        defaultNext: 'sop_scope',
      },

      {
        id: 'sop_scope',
        section: 'SOP Identification',
        question:
          'What is the purpose and scope of this SOP, and which regulations apply?',
        guidance:
          'The purpose statement should explain why the SOP exists and what process it governs. The scope defines who it applies to and under what circumstances. Identifying applicable regulations ensures the SOP addresses all required elements for compliance.',
        fields: [
          {
            id: 'sop_purpose',
            label: 'Purpose',
            type: 'textarea',
            required: true,
          },
          {
            id: 'sop_scope_description',
            label: 'Scope Description',
            type: 'textarea',
            required: true,
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
        ],
        defaultNext: 'process_steps',
      },

      /* ── Process Definition ────────────────────────────────────────── */

      {
        id: 'process_steps',
        section: 'Process Definition',
        question:
          'Describe the process this SOP will cover. How many major steps are involved, and where are the critical decision points?',
        guidance:
          'A clear process overview enables structured documentation. Identify the major steps in sequence, critical decision points where the process may branch, and any exception handling procedures for deviations from normal flow.',
        fields: [
          {
            id: 'process_overview',
            label: 'Process Overview',
            type: 'textarea',
            required: true,
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
          'Clearly defined roles and responsibilities ensure accountability. The approval chain should follow your organization\'s quality system hierarchy. Training requirements help ensure personnel are competent to perform the procedure.',
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
            helpText: 'List roles in approval sequence',
          },
          {
            id: 'training_required',
            label: 'Training Required',
            type: 'yes_no',
            required: true,
          },
        ],
        defaultNext: 'compliance_reqs',
      },

      /* ── Compliance ────────────────────────────────────────────────── */

      {
        id: 'compliance_reqs',
        section: 'Compliance',
        question:
          'What are the compliance requirements for this SOP? Consider audit trail, electronic signatures, and record retention.',
        guidance:
          'Regulatory compliance requirements drive documentation and system controls. If the SOP involves electronic records or signatures, 21 CFR Part 11 compliance is essential. Record retention periods should align with applicable regulations and your organization\'s quality policy.',
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
        ],
        issueChecks: [
          {
            id: 'esig_without_cfr11',
            condition: { field: 'electronic_signatures', operator: 'eq', value: true },
            severity: 'warning',
            title: '21 CFR 11 Compliance',
            message:
              'Electronic signatures require 21 CFR Part 11 compliance. Add to applicable regulations.',
          },
        ],
        defaultNext: 'sop_review',
      },

      {
        id: 'sop_review',
        section: 'Compliance',
        question:
          'How often should this SOP be reviewed? Is it superseding an existing SOP?',
        guidance:
          'Periodic review ensures SOPs remain current with evolving regulations and organizational processes. Most quality systems require review at least every two to three years. If this SOP supersedes a previous version, capture the prior document number for traceability.',
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
          },
          {
            id: 'change_control_notes',
            label: 'Change Control Notes',
            type: 'textarea',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
