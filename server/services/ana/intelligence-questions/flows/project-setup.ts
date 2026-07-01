/**
 * Project Setup flow definition for the AnA Intelligence Questioning system.
 *
 * Guides users through platform project configuration and onboarding,
 * covering organization and project identity, product and regulatory
 * scope, team and roles, and initial configuration.
 *
 * 10 nodes · 48 fields · 4 sections · 6 issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/project-setup
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createProjectSetupFlow(): FlowDefinition {
  return {
    id: 'project-setup-v1',
    category: 'project_setup',
    name: 'Project Setup',
    description:
      'Platform project configuration and onboarding questionnaire covering organization and project identity, product and regulatory scope, team and roles, and initial configuration settings.',
    clientTypes: [],
    entryNode: 'organization_info',
    estimatedMinutes: 20,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'org_project',
        label: 'Organization & Project Identity',
        nodeIds: ['organization_info', 'project_identity'],
      },
      {
        id: 'product_regulatory',
        label: 'Product & Regulatory Scope',
        nodeIds: ['product_details', 'regulatory_targets', 'medtech_regulatory', 'multi_country_setup'],
      },
      {
        id: 'team_roles',
        label: 'Team & Roles',
        nodeIds: ['team_assignment', 'external_partners'],
      },
      {
        id: 'initial_config',
        label: 'Initial Configuration',
        nodeIds: ['project_preferences', 'final_confirmation'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Organization & Project Identity                     */
      /* ================================================================ */

      {
        id: 'organization_info',
        section: 'org_project',
        question:
          'Let\'s set up your project. First, confirm your organization details and the type of company.',
        guidance:
          'Accurate organization information ensures correct regulatory mapping, document templates, and compliance workflows. The organization type (pharma, biotech, medtech) determines which regulatory frameworks and document types are available throughout the platform.',
        fields: [
          {
            id: 'organization_name',
            label: 'Organization Name',
            type: 'text',
            placeholder: 'e.g., Acme Therapeutics, Inc.',
            required: true,
          },
          {
            id: 'organization_type',
            label: 'Organization Type',
            type: 'select',
            required: true,
            options: [
              { value: 'pharma', label: 'Pharmaceutical Company' },
              { value: 'biotech', label: 'Biotechnology Company' },
              { value: 'medtech', label: 'Medical Device Company' },
              { value: 'cro', label: 'Contract Research Organization (CRO)' },
              { value: 'cdmo', label: 'Contract Development and Manufacturing Organization (CDMO)' },
              { value: 'academic', label: 'Academic / Research Institution' },
              { value: 'government', label: 'Government Agency' },
            ],
          },
          {
            id: 'organization_size',
            label: 'Organization Size',
            type: 'select',
            options: [
              { value: 'startup', label: 'Startup (< 50 employees)' },
              { value: 'small', label: 'Small (50-200 employees)' },
              { value: 'mid', label: 'Mid-Size (200-1,000 employees)' },
              { value: 'large', label: 'Large (1,000-10,000 employees)' },
              { value: 'enterprise', label: 'Enterprise (> 10,000 employees)' },
            ],
          },
          {
            id: 'headquarters_country',
            label: 'Headquarters Country',
            type: 'country_select',
            required: true,
          },
        ],
        defaultNext: 'project_identity',
      },

      {
        id: 'project_identity',
        section: 'org_project',
        question:
          'Define the project. What is the project name, internal code, and what phase or stage is it in?',
        guidance:
          'A well-defined project identity ensures all team members and platform workflows reference the same product and development stage. The project code should follow your organization\'s naming convention. The development phase determines which document types and regulatory activities are most relevant.',
        fields: [
          {
            id: 'project_name',
            label: 'Project Name',
            type: 'text',
            placeholder: 'e.g., Project Atlas — ABC-1234 Phase 3 Program',
            required: true,
          },
          {
            id: 'project_code',
            label: 'Internal Project Code',
            type: 'text',
            placeholder: 'e.g., PRJ-2024-042',
          },
          {
            id: 'project_description',
            label: 'Project Description',
            type: 'textarea',
            placeholder: 'Brief description of the project scope and objectives',
            required: true,
            validation: { minLength: 20 },
          },
          {
            id: 'development_phase',
            label: 'Development Phase / Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'discovery', label: 'Discovery / Preclinical' },
              { value: 'ind_enabling', label: 'IND-Enabling / Pre-CTA' },
              { value: 'phase_1', label: 'Phase 1 Clinical' },
              { value: 'phase_2', label: 'Phase 2 Clinical' },
              { value: 'phase_3', label: 'Phase 3 Clinical / Pivotal' },
              { value: 'nda_bla_filing', label: 'NDA/BLA/MAA Filing' },
              { value: 'post_approval', label: 'Post-Approval / Life Cycle Management' },
              { value: 'device_design', label: 'Device Design & Development' },
              { value: 'device_submission', label: 'Device Submission (510(k) / PMA / De Novo)' },
              { value: 'device_post_market', label: 'Device Post-Market' },
            ],
          },
          {
            id: 'target_submission_date',
            label: 'Target Submission Date',
            type: 'date',
            helpText: 'The target date for the primary regulatory submission (IND, NDA, 510(k), etc.).',
          },
          {
            id: 'project_priority',
            label: 'Project Priority',
            type: 'select',
            options: [
              { value: 'critical', label: 'Critical — Top priority' },
              { value: 'high', label: 'High' },
              { value: 'standard', label: 'Standard' },
              { value: 'low', label: 'Low — Long-term / exploratory' },
            ],
          },
        ],
        defaultNext: 'product_details',
        issueChecks: [
          {
            id: 'submission_date_in_past',
            condition: { field: 'target_submission_date', operator: 'lt', value: '2026-07-01' },
            severity: 'warning',
            title: 'Target Submission Date Is in the Past',
            message:
              'The target submission date appears to be in the past. Please verify the date. If the submission has already occurred, consider selecting "Post-Approval / Life Cycle Management" as the development phase.',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 2 — Product & Regulatory Scope                          */
      /* ================================================================ */

      {
        id: 'product_details',
        section: 'product_regulatory',
        question:
          'Tell us about the product. What is the therapeutic area, product type, and route of administration?',
        guidance:
          'Product information drives intelligent defaults throughout the platform — from document templates to regulatory pathway recommendations. The therapeutic area helps map to appropriate FDA review divisions, ICH guidelines, and competitive intelligence sources.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'product_name',
            label: 'Product Name (Generic / Code)',
            type: 'text',
            placeholder: 'e.g., ABC-1234 (remdesivir)',
            required: true,
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'select',
            required: true,
            options: [
              { value: 'oncology', label: 'Oncology' },
              { value: 'immunology', label: 'Immunology / Inflammation' },
              { value: 'neurology', label: 'Neurology / Psychiatry' },
              { value: 'cardiovascular', label: 'Cardiovascular' },
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'metabolic', label: 'Metabolic / Endocrinology' },
              { value: 'respiratory', label: 'Respiratory' },
              { value: 'rare_disease', label: 'Rare Disease / Orphan' },
              { value: 'hematology', label: 'Hematology' },
              { value: 'ophthalmology', label: 'Ophthalmology' },
              { value: 'dermatology', label: 'Dermatology' },
              { value: 'gastroenterology', label: 'Gastroenterology' },
              { value: 'gene_cell_therapy', label: 'Gene / Cell Therapy' },
              { value: 'medical_device', label: 'Medical Device' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'small_molecule', label: 'Small Molecule' },
              { value: 'monoclonal_antibody', label: 'Monoclonal Antibody' },
              { value: 'adc', label: 'Antibody-Drug Conjugate (ADC)' },
              { value: 'bispecific', label: 'Bispecific Antibody' },
              { value: 'gene_therapy', label: 'Gene Therapy' },
              { value: 'cell_therapy', label: 'Cell Therapy' },
              { value: 'vaccine', label: 'Vaccine' },
              { value: 'peptide', label: 'Peptide' },
              { value: 'oligonucleotide', label: 'Oligonucleotide' },
              { value: 'biosimilar', label: 'Biosimilar' },
              { value: 'medical_device', label: 'Medical Device' },
              { value: 'combination_product', label: 'Drug-Device Combination' },
              { value: 'diagnostic', label: 'Diagnostic / IVD' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'indication',
            label: 'Target Indication',
            type: 'text',
            placeholder: 'e.g., Locally advanced or metastatic non-small cell lung cancer (NSCLC)',
          },
          {
            id: 'route_of_administration',
            label: 'Route of Administration',
            type: 'select',
            options: [
              { value: 'oral', label: 'Oral' },
              { value: 'iv', label: 'Intravenous (IV)' },
              { value: 'sc', label: 'Subcutaneous (SC)' },
              { value: 'im', label: 'Intramuscular (IM)' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhaled', label: 'Inhaled' },
              { value: 'intrathecal', label: 'Intrathecal' },
              { value: 'ophthalmic', label: 'Ophthalmic' },
              { value: 'implant', label: 'Implant' },
              { value: 'na_device', label: 'N/A (Device)' },
              { value: 'other', label: 'Other' },
            ],
            visibleWhen: { field: 'product_type', operator: 'neq', value: 'medical_device' },
          },
        ],
        branches: [
          {
            when: { field: 'organization_type', operator: 'eq', value: 'medtech' },
            goto: 'medtech_regulatory',
          },
          {
            when: { field: 'product_type', operator: 'in', value: ['medical_device', 'diagnostic'] },
            goto: 'medtech_regulatory',
          },
        ],
        defaultNext: 'regulatory_targets',
        issueChecks: [
          {
            id: 'missing_therapeutic_area',
            condition: { field: 'therapeutic_area', operator: 'eq', value: 'other' },
            severity: 'info',
            title: 'Therapeutic Area Not Specified',
            message:
              'Selecting a specific therapeutic area enables the platform to provide more relevant document templates, regulatory guidance, and competitive intelligence. Consider selecting the most appropriate therapeutic area for your product.',
          },
        ],
      },

      {
        id: 'regulatory_targets',
        section: 'product_regulatory',
        question:
          'What are the regulatory targets for this project? Select the agencies and submission types you are planning.',
        guidance:
          'Identifying target regulatory agencies early ensures the platform configures the correct document templates, formatting requirements, and compliance checks. Multi-country submissions require coordination of timelines and may benefit from harmonized CTD (Common Technical Document) preparation per ICH M4.',
        fields: [
          {
            id: 'primary_regulatory_agency',
            label: 'Primary Regulatory Agency',
            type: 'agency_select',
            required: true,
          },
          {
            id: 'submission_type',
            label: 'Primary Submission Type',
            type: 'select',
            required: true,
            options: [
              { value: 'ind', label: 'IND (Investigational New Drug)' },
              { value: 'nda', label: 'NDA (New Drug Application)' },
              { value: 'bla', label: 'BLA (Biologics License Application)' },
              { value: 'anda', label: 'ANDA (Abbreviated New Drug Application)' },
              { value: '510k', label: '510(k) Premarket Notification' },
              { value: 'pma', label: 'PMA (Premarket Approval)' },
              { value: 'de_novo', label: 'De Novo Classification Request' },
              { value: 'maa', label: 'MAA (Marketing Authorization Application — EU)' },
              { value: 'cta', label: 'CTA (Clinical Trial Application — EU/UK)' },
              { value: 'jnda', label: 'JNDA (Japan New Drug Application)' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'multi_country_submission',
            label: 'Is This a Multi-Country Submission?',
            type: 'yes_no',
            helpText: 'Multi-country submissions require harmonized document packages. The ICH Common Technical Document (CTD) format is accepted by FDA, EMA, PMDA, Health Canada, TGA, and many other agencies.',
          },
          {
            id: 'additional_agencies',
            label: 'Additional Regulatory Agencies',
            type: 'multi_select',
            visibleWhen: { field: 'multi_country_submission', operator: 'eq', value: true },
            options: [
              { value: 'ema', label: 'EMA (European Medicines Agency)' },
              { value: 'pmda', label: 'PMDA (Japan)' },
              { value: 'nmpa', label: 'NMPA (China)' },
              { value: 'health_canada', label: 'Health Canada' },
              { value: 'tga', label: 'TGA (Australia)' },
              { value: 'mhra', label: 'MHRA (United Kingdom)' },
              { value: 'anvisa', label: 'ANVISA (Brazil)' },
              { value: 'cdsco', label: 'CDSCO (India)' },
              { value: 'who', label: 'WHO Prequalification' },
            ],
          },
          {
            id: 'ctd_format',
            label: 'Using ICH CTD Format?',
            type: 'yes_no',
            helpText: 'The ICH Common Technical Document (M4) format is the standard for all major regulatory submissions worldwide.',
          },
        ],
        branches: [
          {
            when: { field: 'multi_country_submission', operator: 'eq', value: true },
            goto: 'multi_country_setup',
          },
        ],
        defaultNext: 'team_assignment',
        issueChecks: [
          {
            id: 'no_regulatory_target',
            condition: { field: 'submission_type', operator: 'eq', value: 'other' },
            severity: 'warning',
            title: 'No Standard Regulatory Target Selected',
            message:
              'Selecting a specific submission type enables the platform to provide tailored document templates, formatting requirements, and regulatory intelligence. If your submission type is not listed, contact support for assistance with custom configurations.',
          },
        ],
      },

      {
        id: 'medtech_regulatory',
        section: 'product_regulatory',
        question:
          'This is a medical device project. Provide device-specific regulatory information.',
        guidance:
          'Medical device submissions follow distinct pathways: 510(k) for substantial equivalence to a predicate device (21 CFR 807), PMA for Class III devices (21 CFR 814), and De Novo for novel low-to-moderate risk devices (21 CFR 860). Device classification determines the regulatory pathway and required documentation. In the EU, the Medical Device Regulation (EU 2017/745) applies with Notified Body assessment.',
        fields: [
          {
            id: 'device_class',
            label: 'Device Classification (US)',
            type: 'select',
            required: true,
            options: [
              { value: 'class_i', label: 'Class I — General Controls' },
              { value: 'class_ii', label: 'Class II — General + Special Controls' },
              { value: 'class_iii', label: 'Class III — Premarket Approval Required' },
              { value: 'not_classified', label: 'Not Yet Classified' },
            ],
          },
          {
            id: 'device_submission_pathway',
            label: 'Submission Pathway',
            type: 'select',
            required: true,
            options: [
              { value: '510k_traditional', label: '510(k) — Traditional' },
              { value: '510k_special', label: '510(k) — Special' },
              { value: '510k_abbreviated', label: '510(k) — Abbreviated' },
              { value: 'pma', label: 'PMA (Premarket Approval)' },
              { value: 'de_novo', label: 'De Novo Classification Request' },
              { value: 'hde', label: 'HDE (Humanitarian Device Exemption)' },
              { value: 'eua', label: 'Emergency Use Authorization (EUA)' },
            ],
          },
          {
            id: 'predicate_device',
            label: 'Predicate Device (for 510(k))',
            type: 'text',
            placeholder: 'e.g., K123456 — Brand Name by Manufacturer',
            visibleWhen: { field: 'device_submission_pathway', operator: 'in', value: ['510k_traditional', '510k_special', '510k_abbreviated'] },
          },
          {
            id: 'product_code',
            label: 'FDA Product Code',
            type: 'text',
            placeholder: 'e.g., QAS (Class II, Cardiovascular)',
          },
          {
            id: 'eu_mdr_class',
            label: 'EU MDR Classification',
            type: 'select',
            options: [
              { value: 'class_i', label: 'Class I' },
              { value: 'class_iia', label: 'Class IIa' },
              { value: 'class_iib', label: 'Class IIb' },
              { value: 'class_iii', label: 'Class III' },
              { value: 'na', label: 'Not applicable / No EU filing planned' },
            ],
          },
          {
            id: 'notified_body',
            label: 'Notified Body (EU)',
            type: 'text',
            placeholder: 'e.g., BSI, TUV SUD, Dekra',
            visibleWhen: { field: 'eu_mdr_class', operator: 'neq', value: 'na' },
          },
        ],
        defaultNext: 'team_assignment',
      },

      {
        id: 'multi_country_setup',
        section: 'product_regulatory',
        question:
          'For multi-country submissions, let\'s define the submission timeline and coordination strategy.',
        guidance:
          'Multi-country submissions benefit from a coordinated regulatory strategy. Consider whether to use a simultaneous global filing approach or a sequential (rolling) strategy starting with the primary market. The ICH CTD format (M4) provides a harmonized document structure accepted by all ICH member agencies. Regional differences in Module 1 (administrative information) and certain Module 3 (CMC) requirements must be addressed.',
        fields: [
          {
            id: 'filing_strategy',
            label: 'Multi-Country Filing Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'simultaneous', label: 'Simultaneous Global Filing' },
              { value: 'sequential', label: 'Sequential (Rolling) — Start with Primary Market' },
              { value: 'staggered', label: 'Staggered — Primary + Key Markets Within 6 Months' },
            ],
          },
          {
            id: 'primary_market',
            label: 'Primary Market (First Filing)',
            type: 'country_select',
            required: true,
          },
          {
            id: 'filing_timeline_overview',
            label: 'Filing Timeline Overview',
            type: 'textarea',
            placeholder: 'e.g., US FDA: Q2 2026. EU EMA: Q3 2026 (centralized procedure). Japan PMDA: Q4 2026.',
            required: true,
          },
          {
            id: 'local_agent_required',
            label: 'Are Local Regulatory Agents/Representatives Required?',
            type: 'yes_no',
            helpText: 'Many countries require a local authorized representative or regulatory agent for foreign sponsors.',
          },
          {
            id: 'translation_needs',
            label: 'Translation Requirements',
            type: 'textarea',
            placeholder: 'e.g., Japanese translation required for PMDA submission. EU — English accepted for centralized procedure. China — Chinese translation for all modules.',
          },
        ],
        defaultNext: 'team_assignment',
      },

      /* ================================================================ */
      /*  Section 3 — Team & Roles                                        */
      /* ================================================================ */

      {
        id: 'team_assignment',
        section: 'team_roles',
        question:
          'Assign the core project team. Who is leading this project and what are the key roles?',
        guidance:
          'A well-defined project team ensures accountability and efficient communication. The project lead has overall responsibility for project delivery. Assign functional leads for regulatory, clinical, CMC, and other relevant areas. Platform access permissions will be configured based on these role assignments.',
        fields: [
          {
            id: 'project_lead',
            label: 'Project Lead / Program Manager',
            type: 'text',
            placeholder: 'e.g., Jane Smith, VP Regulatory Affairs',
            required: true,
          },
          {
            id: 'project_lead_email',
            label: 'Project Lead Email',
            type: 'text',
            placeholder: 'e.g., jsmith@acmetherapeutics.com',
            required: true,
          },
          {
            id: 'regulatory_lead',
            label: 'Regulatory Lead',
            type: 'text',
            placeholder: 'e.g., John Doe, Director Regulatory Affairs',
          },
          {
            id: 'clinical_lead',
            label: 'Clinical Lead',
            type: 'text',
            placeholder: 'e.g., Dr. Sarah Johnson, VP Clinical Development',
          },
          {
            id: 'cmc_lead',
            label: 'CMC / Manufacturing Lead',
            type: 'text',
            placeholder: 'e.g., Mike Chen, Director CMC',
          },
          {
            id: 'quality_lead',
            label: 'Quality Assurance Lead',
            type: 'text',
            placeholder: 'e.g., Lisa Park, QA Manager',
          },
          {
            id: 'team_size',
            label: 'Estimated Total Team Size',
            type: 'number',
            placeholder: 'e.g., 12',
            validation: { min: 1 },
          },
        ],
        defaultNext: 'external_partners',
        issueChecks: [
          {
            id: 'no_project_lead',
            condition: { field: 'project_lead', operator: 'eq', value: '' },
            severity: 'critical',
            title: 'No Project Lead Assigned',
            message:
              'Every project must have a designated project lead who is accountable for project delivery, timeline management, and stakeholder communication. Assign a project lead before proceeding.',
          },
        ],
      },

      {
        id: 'external_partners',
        section: 'team_roles',
        question:
          'Are there external partners involved in this project (CROs, CMOs, consultants)?',
        guidance:
          'External partners such as CROs, CDMOs, and regulatory consultants are common in pharmaceutical development. Identifying these partners early helps configure appropriate access permissions, document sharing workflows, and communication channels within the platform.',
        fields: [
          {
            id: 'external_partners_involved',
            label: 'Are External Partners Involved?',
            type: 'yes_no',
          },
          {
            id: 'cro_partner',
            label: 'CRO Partner(s)',
            type: 'text',
            placeholder: 'e.g., IQVIA, Covance, Parexel',
            visibleWhen: { field: 'external_partners_involved', operator: 'eq', value: true },
          },
          {
            id: 'cdmo_partner',
            label: 'CDMO / Manufacturing Partner(s)',
            type: 'text',
            placeholder: 'e.g., Lonza, Catalent, Samsung Biologics',
            visibleWhen: { field: 'external_partners_involved', operator: 'eq', value: true },
          },
          {
            id: 'regulatory_consultant',
            label: 'Regulatory Consultant(s)',
            type: 'text',
            placeholder: 'e.g., Regulatory Solutions Inc.',
            visibleWhen: { field: 'external_partners_involved', operator: 'eq', value: true },
          },
          {
            id: 'partner_access_level',
            label: 'Default Partner Access Level',
            type: 'select',
            visibleWhen: { field: 'external_partners_involved', operator: 'eq', value: true },
            options: [
              { value: 'view_only', label: 'View Only — Can view assigned documents' },
              { value: 'contributor', label: 'Contributor — Can edit assigned sections' },
              { value: 'full_access', label: 'Full Access — Same as internal team' },
            ],
          },
        ],
        defaultNext: 'project_preferences',
      },

      /* ================================================================ */
      /*  Section 4 — Initial Configuration                               */
      /* ================================================================ */

      {
        id: 'project_preferences',
        section: 'initial_config',
        question:
          'Set your project preferences and configure initial platform settings.',
        guidance:
          'These preferences configure the platform behavior for your project. Notification settings control how team members receive updates. Document naming conventions ensure consistency across all project deliverables. The project timezone determines scheduling and deadline management.',
        fields: [
          {
            id: 'notification_preference',
            label: 'Notification Preference',
            type: 'select',
            options: [
              { value: 'all', label: 'All Notifications' },
              { value: 'critical_only', label: 'Critical Only (deadlines, issues, reviews)' },
              { value: 'daily_digest', label: 'Daily Digest' },
              { value: 'weekly_digest', label: 'Weekly Digest' },
            ],
          },
          {
            id: 'document_naming_convention',
            label: 'Document Naming Convention',
            type: 'select',
            options: [
              { value: 'ctd', label: 'ICH CTD Numbering (e.g., m2-25-clinical-overview)' },
              { value: 'project_code', label: 'Project Code Prefix (e.g., ABC1234-DOC-001)' },
              { value: 'custom', label: 'Custom Convention' },
            ],
          },
          {
            id: 'custom_naming_convention',
            label: 'Custom Naming Convention',
            type: 'text',
            placeholder: 'e.g., [PROJECT]-[TYPE]-[SEQ]-[VERSION]',
            visibleWhen: { field: 'document_naming_convention', operator: 'eq', value: 'custom' },
          },
          {
            id: 'project_timezone',
            label: 'Project Timezone',
            type: 'select',
            options: [
              { value: 'est', label: 'US Eastern (ET)' },
              { value: 'cst', label: 'US Central (CT)' },
              { value: 'pst', label: 'US Pacific (PT)' },
              { value: 'gmt', label: 'GMT / UTC' },
              { value: 'cet', label: 'Central European (CET)' },
              { value: 'jst', label: 'Japan Standard (JST)' },
              { value: 'cst_china', label: 'China Standard (CST)' },
            ],
          },
          {
            id: 'enable_ai_assistance',
            label: 'Enable AI-Assisted Document Intelligence',
            type: 'yes_no',
            helpText: 'When enabled, the platform provides AI-powered regulatory guidance, document drafting assistance, and compliance checking throughout the project.',
          },
          {
            id: 'milestone_tracking',
            label: 'Enable Milestone Tracking',
            type: 'yes_no',
            helpText: 'Milestone tracking provides automated deadline management, progress dashboards, and critical path analysis.',
          },
        ],
        defaultNext: 'final_confirmation',
      },

      {
        id: 'final_confirmation',
        section: 'initial_config',
        question:
          'Review your project setup and confirm. The project will be created with the settings you have provided.',
        guidance:
          'Review all project settings before confirming. Once the project is created, you can modify these settings in the project administration panel. The platform will automatically configure document templates, workflows, and compliance checks based on your selections.',
        fields: [
          {
            id: 'setup_confirmation',
            label: 'I confirm the project information above is correct and I am ready to create this project.',
            type: 'checkbox',
            required: true,
          },
          {
            id: 'initial_documents_to_create',
            label: 'Which Documents Should the Platform Prepare First?',
            type: 'multi_select',
            options: [
              { value: 'project_plan', label: 'Regulatory Project Plan' },
              { value: 'submission_timeline', label: 'Submission Timeline' },
              { value: 'document_list', label: 'Document Requirements List' },
              { value: 'team_charter', label: 'Team Charter / RACI Matrix' },
              { value: 'risk_register', label: 'Regulatory Risk Register' },
            ],
          },
          {
            id: 'additional_notes',
            label: 'Additional Notes or Special Requirements',
            type: 'textarea',
            placeholder: 'Any additional information, special requirements, or notes for project setup...',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
