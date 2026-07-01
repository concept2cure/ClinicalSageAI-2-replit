/**
 * IND (Investigational New Drug) Submission flow definition for the
 * AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through a comprehensive IND submission
 * questionnaire covering sponsor information, product details, preclinical
 * data, clinical plan, and regulatory history.
 *
 * @module server/services/ana/intelligence-questions/flows/ind-submission
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createIndSubmissionFlow(): FlowDefinition {
  return {
    id: 'ind-submission-v1',
    category: 'ind_submission',
    name: 'IND Submission',
    description:
      'Comprehensive IND submission questionnaire covering sponsor information, product details, preclinical data, clinical plan, and regulatory history for FDA Investigational New Drug applications.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'sponsor_details',
    estimatedMinutes: 35,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'sponsor_info',
        label: 'Sponsor Information',
        nodeIds: ['sponsor_details', 'ind_type'],
      },
      {
        id: 'product_info',
        label: 'Product Information',
        nodeIds: ['drug_info', 'formulation'],
      },
      {
        id: 'preclinical',
        label: 'Preclinical Data',
        nodeIds: ['nonclinical_summary', 'toxicology'],
      },
      {
        id: 'clinical_plan',
        label: 'Clinical Plan',
        nodeIds: ['proposed_study', 'investigator_info'],
      },
      {
        id: 'reg_history',
        label: 'Regulatory History',
        nodeIds: ['prior_submissions', 'ind_review'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── Sponsor Information ───────────────────────────────────────── */

      {
        id: 'sponsor_details',
        section: 'sponsor_info',
        question:
          'Let\'s begin with sponsor information. Please provide the details of the IND sponsor.',
        guidance:
          'Per 21 CFR 312.23(a)(1), the IND application must include the name and address of the sponsor, as well as a contact person responsible for the submission.',
        fields: [
          {
            id: 'sponsor_name',
            label: 'Sponsor Name',
            type: 'text',
            placeholder: 'e.g., Acme Therapeutics, Inc.',
            required: true,
          },
          {
            id: 'sponsor_address',
            label: 'Sponsor Address',
            type: 'textarea',
            placeholder: '123 Pharma Blvd, Suite 400, Cambridge, MA 02142',
            required: true,
          },
          {
            id: 'contact_person',
            label: 'Contact Person',
            type: 'text',
            placeholder: 'e.g., Jane Smith, VP Regulatory Affairs',
            required: true,
          },
          {
            id: 'contact_phone',
            label: 'Contact Phone',
            type: 'text',
            placeholder: 'e.g., (617) 555-0100',
            required: true,
          },
          {
            id: 'contact_email',
            label: 'Contact Email',
            type: 'text',
            placeholder: 'e.g., jsmith@acmetherapeutics.com',
            required: true,
            validation: {
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
              patternMessage: 'Please enter a valid email address.',
            },
          },
        ],
        defaultNext: 'ind_type',
      },

      {
        id: 'ind_type',
        section: 'sponsor_info',
        question:
          'What type of IND are you filing, and is this an original submission or an amendment?',
        guidance:
          'A Commercial IND (21 CFR 312.23) supports the full development program toward NDA/BLA. A Research (Investigator) IND is filed by an investigator who both initiates and conducts a study. An Emergency IND permits use in a life-threatening situation before a standard IND is in effect.',
        fields: [
          {
            id: 'ind_type_selection',
            label: 'IND Type',
            type: 'select',
            required: true,
            options: [
              { value: 'commercial', label: 'Commercial IND' },
              { value: 'research', label: 'Research / Investigator IND' },
              { value: 'emergency', label: 'Emergency IND' },
            ],
          },
          {
            id: 'ind_application_type',
            label: 'Is this an original IND or an amendment?',
            type: 'select',
            required: true,
            options: [
              { value: 'original', label: 'Original IND' },
              { value: 'amendment', label: 'Amendment to existing IND' },
            ],
          },
          {
            id: 'previous_ind_number',
            label: 'Previous IND Number',
            type: 'text',
            placeholder: 'e.g., IND 123456',
            visibleWhen: {
              field: 'ind_application_type',
              operator: 'eq',
              value: 'amendment',
            },
          },
        ],
        defaultNext: 'drug_info',
      },

      /* ── Product Information ───────────────────────────────────────── */

      {
        id: 'drug_info',
        section: 'product_info',
        question:
          'Provide details about the investigational drug product.',
        guidance:
          'Per 21 CFR 312.23(a)(7), the IND must include a description of the drug substance and drug product, including the name, structure, mechanism of action, and route of administration.',
        fields: [
          {
            id: 'drug_name_generic',
            label: 'Drug Name (Generic)',
            type: 'text',
            placeholder: 'e.g., Remdesivir',
            required: true,
          },
          {
            id: 'drug_code_number',
            label: 'Drug Code/Number',
            type: 'text',
            placeholder: 'e.g., ABC-1234',
            required: true,
          },
          {
            id: 'therapeutic_class',
            label: 'Therapeutic Class',
            type: 'text',
            placeholder: 'e.g., Kinase inhibitor, Monoclonal antibody',
            required: true,
          },
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action',
            type: 'textarea',
            placeholder:
              'e.g., Selective inhibitor of EGFR tyrosine kinase that blocks downstream RAS/RAF/MEK signaling...',
            required: true,
          },
          {
            id: 'route_of_administration',
            label: 'Route of Administration',
            type: 'select',
            required: true,
            options: [
              { value: 'oral', label: 'Oral' },
              { value: 'iv', label: 'Intravenous (IV)' },
              { value: 'sc', label: 'Subcutaneous (SC)' },
              { value: 'im', label: 'Intramuscular (IM)' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhaled', label: 'Inhaled' },
              { value: 'other', label: 'Other' },
            ],
          },
        ],
        defaultNext: 'formulation',
      },

      {
        id: 'formulation',
        section: 'product_info',
        question:
          'Describe the formulation and manufacturing details for the investigational product.',
        guidance:
          'Per 21 CFR 312.23(a)(7) and 21 CFR 211, the IND must describe the dosage form, composition, and manufacturing process. Clinical supplies must be manufactured under cGMP conditions.',
        fields: [
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'solution', label: 'Solution' },
              { value: 'suspension', label: 'Suspension' },
              { value: 'powder', label: 'Powder' },
              { value: 'lyophilized', label: 'Lyophilized' },
              { value: 'patch', label: 'Patch' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'strengths',
            label: 'Strength(s)',
            type: 'text',
            placeholder: 'e.g., 25 mg, 50 mg, 100 mg',
            required: true,
          },
          {
            id: 'excipients_of_note',
            label: 'Excipients of Note',
            type: 'textarea',
            placeholder:
              'List any notable excipients (e.g., novel excipients, those with known safety concerns).',
          },
          {
            id: 'manufacturing_site',
            label: 'Manufacturing Site',
            type: 'text',
            placeholder: 'e.g., Lonza AG, Basel, Switzerland',
            required: true,
          },
          {
            id: 'gmp_compliance',
            label: 'GMP Compliance Confirmed',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 211, clinical trial material must be manufactured in compliance with current Good Manufacturing Practice (cGMP).',
          },
        ],
        defaultNext: 'nonclinical_summary',
        issueChecks: [
          {
            id: 'gmp_non_compliance',
            condition: {
              field: 'gmp_compliance',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'GMP Non-Compliance',
            message:
              'IND submissions require GMP-compliant manufacturing. FDA may place a clinical hold.',
            reference: '21 CFR 211',
          },
        ],
      },

      /* ── Preclinical Data ──────────────────────────────────────────── */

      {
        id: 'nonclinical_summary',
        section: 'preclinical',
        question:
          'Summarize the nonclinical (preclinical) pharmacology program supporting this IND.',
        guidance:
          'Per ICH M3(R2), nonclinical studies supporting first-in-human dosing must include pharmacology, general toxicology, safety pharmacology, and genotoxicity. Provide an overview of both in vitro and in vivo findings.',
        fields: [
          {
            id: 'pharmacology_studies_completed',
            label: 'Pharmacology Studies Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'in_vitro_studies_summary',
            label: 'In Vitro Studies Summary',
            type: 'textarea',
            placeholder:
              'e.g., Target binding assays demonstrated IC50 of 15 nM. Selectivity panel of 60+ receptors showed no significant off-target activity at 10 uM.',
            required: true,
          },
          {
            id: 'in_vivo_studies_summary',
            label: 'In Vivo Studies Summary',
            type: 'textarea',
            placeholder:
              'e.g., Dose-dependent tumor growth inhibition in NSCLC xenograft models (60% TGI at 30 mg/kg). PK studies in rat and dog showed oral bioavailability of 45%.',
            required: true,
          },
          {
            id: 'species_used',
            label: 'Species Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'mouse', label: 'Mouse' },
              { value: 'rat', label: 'Rat' },
              { value: 'rabbit', label: 'Rabbit' },
              { value: 'dog', label: 'Dog' },
              { value: 'monkey', label: 'Monkey' },
              { value: 'minipig', label: 'Minipig' },
              { value: 'other', label: 'Other' },
            ],
          },
        ],
        defaultNext: 'toxicology',
      },

      {
        id: 'toxicology',
        section: 'preclinical',
        question:
          'Describe the toxicology program. What studies have been completed, and what were the key findings?',
        guidance:
          'Per 21 CFR 312.23(a)(8) and ICH M3(R2), adequate toxicology data must be available to support the proposed clinical study. GLP-compliant pivotal toxicology studies are expected. The NOAEL should be clearly stated and used to derive the safe starting dose.',
        fields: [
          {
            id: 'glp_tox_completed',
            label: 'GLP Toxicology Studies Completed',
            type: 'yes_no',
            required: true,
            helpText:
              'FDA generally expects GLP compliance (21 CFR 58) for pivotal safety studies supporting the IND.',
          },
          {
            id: 'single_dose_tox_completed',
            label: 'Single-Dose Toxicology Completed',
            type: 'yes_no',
          },
          {
            id: 'repeat_dose_tox_completed',
            label: 'Repeat-Dose Toxicology Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'genetic_tox_completed',
            label: 'Genetic Toxicology Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'noael_value',
            label: 'NOAEL',
            type: 'text',
            placeholder: 'e.g., 30 mg/kg/day in rat; 10 mg/kg/day in dog',
            required: true,
            helpText: 'No Observed Adverse Effect Level with units',
          },
          {
            id: 'safety_pharmacology_completed',
            label: 'Safety Pharmacology Completed',
            type: 'yes_no',
          },
        ],
        defaultNext: 'proposed_study',
        issueChecks: [
          {
            id: 'glp_tox_required',
            condition: {
              field: 'glp_tox_completed',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'GLP Toxicology Required',
            message:
              'GLP-compliant toxicology studies are required before initiating human studies per 21 CFR 312.23.',
            reference: '21 CFR 312.23(a)(8)',
          },
        ],
      },

      /* ── Clinical Plan ─────────────────────────────────────────────── */

      {
        id: 'proposed_study',
        section: 'clinical_plan',
        question:
          'Describe the proposed clinical study that will be conducted under this IND.',
        guidance:
          'Per 21 CFR 312.23(a)(6), the IND must include a protocol for each planned study. At minimum, one clinical protocol must be submitted with the initial IND. Include the indication, phase, design, dosing, and enrollment plan.',
        fields: [
          {
            id: 'proposed_indication',
            label: 'Proposed Indication',
            type: 'text',
            placeholder:
              'e.g., Locally advanced or metastatic non-small cell lung cancer (NSCLC)',
            required: true,
          },
          {
            id: 'first_study_phase',
            label: 'Phase of First Study',
            type: 'select',
            required: true,
            options: [
              { value: 'phase_1', label: 'Phase 1' },
              { value: 'phase_1b', label: 'Phase 1b' },
              { value: 'phase_2', label: 'Phase 2' },
            ],
          },
          {
            id: 'study_design_overview',
            label: 'Study Design Overview',
            type: 'textarea',
            placeholder:
              'e.g., Open-label, dose-escalation study using a 3+3 design followed by dose expansion cohorts in selected indications.',
            required: true,
          },
          {
            id: 'proposed_starting_dose',
            label: 'Proposed Starting Dose',
            type: 'text',
            placeholder: 'e.g., 1 mg once daily',
            required: true,
          },
          {
            id: 'dose_escalation_plan',
            label: 'Dose Escalation Plan',
            type: 'textarea',
            placeholder:
              'e.g., Modified Fibonacci scheme: 1 mg, 3 mg, 10 mg, 30 mg, 100 mg, 300 mg. DLT evaluation window of 28 days.',
            visibleWhen: {
              field: 'first_study_phase',
              operator: 'in',
              value: ['phase_1', 'phase_1b'],
            },
          },
          {
            id: 'planned_enrollment',
            label: 'Planned Enrollment',
            type: 'number',
            placeholder: 'e.g., 30',
            required: true,
            validation: { min: 1 },
          },
        ],
        defaultNext: 'investigator_info',
      },

      {
        id: 'investigator_info',
        section: 'clinical_plan',
        question:
          'Provide details about the principal investigator and planned clinical sites.',
        guidance:
          'Per 21 CFR 312.53, each participating investigator must complete Form FDA 1572 (Statement of Investigator). The PI must be qualified by training and experience to conduct the proposed study. IRB approval is required before any study activities can begin.',
        fields: [
          {
            id: 'pi_name',
            label: 'Principal Investigator Name',
            type: 'text',
            placeholder: 'e.g., Dr. John Doe, MD, PhD',
            required: true,
          },
          {
            id: 'pi_institution',
            label: 'PI Institution',
            type: 'text',
            placeholder: 'e.g., Massachusetts General Hospital',
            required: true,
          },
          {
            id: 'pi_qualifications_summary',
            label: 'PI Qualifications Summary',
            type: 'textarea',
            placeholder:
              'e.g., Board-certified oncologist with 15 years of experience in NSCLC clinical trials. Has served as PI on 12 prior Phase 1-3 studies.',
            required: true,
          },
          {
            id: 'number_of_planned_sites',
            label: 'Number of Planned Sites',
            type: 'number',
            placeholder: 'e.g., 5',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'irb_status',
            label: 'IRB Approval Status',
            type: 'select',
            required: true,
            options: [
              { value: 'approved', label: 'Approved' },
              { value: 'pending', label: 'Pending' },
              { value: 'not_submitted', label: 'Not Submitted' },
            ],
          },
        ],
        defaultNext: 'prior_submissions',
        issueChecks: [
          {
            id: 'irb_not_submitted',
            condition: {
              field: 'irb_status',
              operator: 'eq',
              value: 'not_submitted',
            },
            severity: 'warning',
            title: 'IRB Not Submitted',
            message:
              'IRB approval or at minimum submission is typically expected before IND filing. Consider timing.',
          },
        ],
      },

      /* ── Regulatory History ────────────────────────────────────────── */

      {
        id: 'prior_submissions',
        section: 'reg_history',
        question:
          'Have you had any previous interactions with the FDA regarding this product?',
        guidance:
          'Per 21 CFR 312.82, sponsors may request a pre-IND (Type B) meeting to discuss the IND content, nonclinical requirements, and clinical trial design. Prior FDA feedback can significantly shape the IND strategy and reduce the risk of clinical holds.',
        fields: [
          {
            id: 'previous_fda_interactions',
            label: 'Previous FDA Interactions',
            type: 'yes_no',
          },
          {
            id: 'pre_ind_meeting',
            label: 'Pre-IND Meeting Held',
            type: 'yes_no',
          },
          {
            id: 'pre_ind_meeting_date',
            label: 'Pre-IND Meeting Date',
            type: 'date',
            visibleWhen: {
              field: 'pre_ind_meeting',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'fda_feedback_summary',
            label: 'FDA Feedback Summary',
            type: 'textarea',
            placeholder:
              'Summarize any notable FDA feedback or recommendations from the pre-IND meeting...',
            visibleWhen: {
              field: 'pre_ind_meeting',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'related_inds',
            label: 'Related INDs',
            type: 'textarea',
            placeholder: 'e.g., IND 123456, IND 789012',
            helpText: 'List any related IND numbers for this compound',
          },
        ],
        defaultNext: 'ind_review',
      },

      {
        id: 'ind_review',
        section: 'reg_history',
        question:
          'Finally, let\'s cover the submission timeline and any additional regulatory considerations.',
        guidance:
          'Per 21 CFR 312.40, the FDA has 30 calendar days to review an IND before clinical trials may proceed. If the FDA does not place a clinical hold within 30 days, the IND is considered active and studies may begin. A Special Protocol Assessment (SPA) adds 45 days to the FDA review timeline.',
        fields: [
          {
            id: 'target_ind_submission_date',
            label: 'Target IND Submission Date',
            type: 'date',
            required: true,
          },
          {
            id: 'thirty_day_review_awareness',
            label: 'Planned 30-Day Review Awareness',
            type: 'yes_no',
            required: true,
            helpText:
              'Confirm you are aware that the FDA has 30 calendar days to review the IND before clinical trials may proceed (21 CFR 312.40).',
          },
          {
            id: 'spa_requested',
            label: 'Special Protocol Assessment Requested',
            type: 'yes_no',
          },
          {
            id: 'additional_notes',
            label: 'Additional Notes',
            type: 'textarea',
            placeholder:
              'Any additional information or considerations for this IND submission...',
          },
        ],
        defaultNext: null,
        issueChecks: [
          {
            id: 'spa_timeline_impact',
            condition: {
              field: 'spa_requested',
              operator: 'eq',
              value: true,
            },
            severity: 'info',
            title: 'SPA Request',
            message:
              'Special Protocol Assessment adds 45 days to FDA review timeline. Plan accordingly.',
          },
        ],
      },
    ],
  };
}
