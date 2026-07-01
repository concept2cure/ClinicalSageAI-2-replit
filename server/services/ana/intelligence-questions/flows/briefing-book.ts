/**
 * Briefing Book flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through gathering the information needed to prepare an
 * advisory committee briefing document, covering meeting purpose, product
 * background, clinical development program, efficacy summary, safety profile,
 * benefit-risk framework, unresolved issues, questions for the committee,
 * regulatory history, and comparable products.
 *
 * 10 nodes, 5 sections, 70+ fields with branching for meeting type and
 * product category-specific considerations.
 *
 * @module server/services/ana/intelligence-questions/flows/briefing-book
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createBriefingBookFlow(): FlowDefinition {
  return {
    id: 'briefing-book-v1',
    category: 'briefing_book',
    name: 'Briefing Book',
    description:
      'Advisory committee briefing document preparation',
    clientTypes: [],
    entryNode: 'meeting_purpose',
    estimatedMinutes: 50,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'meeting_info',
        label: 'Meeting Information',
        nodeIds: ['meeting_purpose', 'product_background'],
      },
      {
        id: 'clinical_evidence',
        label: 'Clinical Evidence',
        nodeIds: [
          'clinical_development',
          'efficacy_summary',
          'safety_profile',
        ],
      },
      {
        id: 'benefit_risk',
        label: 'Benefit-Risk Assessment',
        nodeIds: ['benefit_risk_framework', 'unresolved_issues'],
      },
      {
        id: 'committee_engagement',
        label: 'Committee Engagement',
        nodeIds: ['committee_questions', 'regulatory_history'],
      },
      {
        id: 'competitive_landscape',
        label: 'Competitive Landscape',
        nodeIds: ['comparable_products'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 1 — Meeting Information                                 */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'meeting_purpose',
        section: 'Meeting Information',
        question:
          'What is the purpose of this advisory committee meeting, and what type of meeting is it?',
        guidance:
          'Advisory committee meetings serve different purposes depending on whether FDA is seeking advice on an original application, a supplemental application, a safety issue, or a policy matter. The meeting type determines the structure and emphasis of the briefing document. FDA typically publishes the meeting agenda and questions 1-2 months before the meeting. The briefing document must be submitted to FDA at least 4 weeks before the meeting.',
        fields: [
          {
            id: 'meeting_type',
            label: 'Meeting Type',
            type: 'select',
            required: true,
            options: [
              { value: 'original_nda_bla', label: 'Original NDA/BLA Review' },
              { value: 'supplemental', label: 'Supplemental Application Review' },
              { value: 'safety_review', label: 'Safety Review' },
              { value: 'policy_topic', label: 'Policy / Scientific Topic' },
              { value: 'risk_management', label: 'Risk Management (REMS)' },
              { value: 'pediatric', label: 'Pediatric Study / Extrapolation' },
            ],
          },
          {
            id: 'advisory_committee_name',
            label: 'Advisory Committee Name',
            type: 'select',
            required: true,
            helpText: 'Select the FDA advisory committee that will review this product.',
            options: [
              { value: 'odac', label: 'ODAC (Oncologic Drugs)' },
              { value: 'aadpac', label: 'AADPAC (Anesthetic and Analgesic Drug Products)' },
              { value: 'amdac', label: 'AMDAC (Antimicrobial Drugs)' },
              { value: 'crdac', label: 'CRDAC (Cardiovascular and Renal Drugs)' },
              { value: 'deidpac', label: 'DEIDPAC (Dermatologic and Ophthalmic Drugs)' },
              { value: 'emdac', label: 'EMDAC (Endocrinologic and Metabolic Drugs)' },
              { value: 'gacdpac', label: 'GACDPAC (Gastrointestinal Drugs)' },
              { value: 'pcns', label: 'PCNS (Psychopharmacologic Drugs)' },
              { value: 'pcdpac', label: 'PCDPAC (Pulmonary-Allergy Drugs)' },
              { value: 'arthritis', label: 'Arthritis Advisory Committee' },
              { value: 'vaccines', label: 'VRBPAC (Vaccines and Related Biological Products)' },
              { value: 'blood', label: 'Blood Products Advisory Committee' },
              { value: 'mdpac', label: 'MDPAC (Medical Devices)' },
              { value: 'joint', label: 'Joint Committee Meeting' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'meeting_date',
            label: 'Scheduled Meeting Date',
            type: 'date',
          },
          {
            id: 'briefing_doc_deadline',
            label: 'Briefing Document Submission Deadline',
            type: 'date',
            helpText: 'Typically 4 weeks before the meeting date.',
          },
          {
            id: 'meeting_objective',
            label: 'Meeting Objective',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the primary objective(s) for this advisory committee meeting',
          },
          {
            id: 'fda_requested_meeting',
            label: 'FDA-Requested Meeting',
            type: 'yes_no',
            required: true,
            helpText: 'Was this advisory committee meeting requested by FDA or by the sponsor?',
          },
          {
            id: 'voting_questions_expected',
            label: 'Voting Questions Expected',
            type: 'yes_no',
            required: true,
            helpText: 'Will the committee vote on specific questions (e.g., approvability)?',
          },
          {
            id: 'previous_adcom_for_product',
            label: 'Previous Advisory Committee Meeting for This Product',
            type: 'yes_no',
            helpText: 'Has this product been discussed at a prior advisory committee meeting?',
          },
          {
            id: 'previous_adcom_details',
            label: 'Previous Meeting Details',
            type: 'textarea',
            placeholder: 'Date, committee, outcome, and key discussion points from the prior meeting',
            visibleWhen: { field: 'previous_adcom_for_product', operator: 'eq', value: true },
          },
        ],
        branches: [
          {
            when: { field: 'meeting_type', operator: 'eq', value: 'safety_review' },
            goto: 'safety_profile',
          },
        ],
        defaultNext: 'product_background',
      },

      {
        id: 'product_background',
        section: 'Meeting Information',
        question:
          'Provide the product background and disease context for the briefing document.',
        guidance:
          'The product background section of a briefing document must orient the committee on the disease/condition, unmet medical need, current treatment landscape, and the product\'s place in therapy. This section should be evidence-based and objective, providing context for the clinical data that follows. Include epidemiology, disease burden, and the rationale for development.',
        fields: [
          {
            id: 'disease_condition',
            label: 'Disease / Condition',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the disease or condition, including epidemiology and natural history',
          },
          {
            id: 'unmet_medical_need',
            label: 'Unmet Medical Need',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the unmet medical need and limitations of current therapies',
          },
          {
            id: 'product_description',
            label: 'Product Description',
            type: 'textarea',
            required: true,
            placeholder: 'Active ingredient, formulation, mechanism of action, pharmacological class',
          },
          {
            id: 'product_category',
            label: 'Product Category',
            type: 'select',
            required: true,
            options: [
              { value: 'small_molecule', label: 'Small Molecule' },
              { value: 'biologic', label: 'Biologic' },
              { value: 'cell_therapy', label: 'Cell Therapy' },
              { value: 'gene_therapy', label: 'Gene Therapy' },
              { value: 'vaccine', label: 'Vaccine' },
              { value: 'combination', label: 'Combination Product' },
              { value: 'device', label: 'Medical Device' },
              { value: 'biosimilar', label: 'Biosimilar' },
            ],
          },
          {
            id: 'current_treatment_options',
            label: 'Current Treatment Options',
            type: 'textarea',
            required: true,
            placeholder: 'List currently approved therapies and their key limitations',
          },
          {
            id: 'regulatory_designation',
            label: 'Regulatory Designations',
            type: 'multi_select',
            helpText: 'Select any special regulatory designations granted for this product.',
            options: [
              { value: 'breakthrough', label: 'Breakthrough Therapy' },
              { value: 'fast_track', label: 'Fast Track' },
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'accelerated_approval', label: 'Accelerated Approval' },
              { value: 'orphan_drug', label: 'Orphan Drug' },
              { value: 'rmat', label: 'RMAT (Regenerative Medicine Advanced Therapy)' },
              { value: 'none', label: 'None' },
            ],
          },
          {
            id: 'proposed_indication',
            label: 'Proposed Indication',
            type: 'textarea',
            required: true,
            placeholder: 'Exact proposed indication statement as submitted to FDA',
          },
        ],
        defaultNext: 'clinical_development',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 2 — Clinical Evidence                                   */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'clinical_development',
        section: 'Clinical Evidence',
        question:
          'Describe the clinical development program supporting this product.',
        guidance:
          'The clinical development program overview should present the totality of evidence in a logical sequence. Advisory committees expect a clear narrative from early dose-finding studies through pivotal trials. Include the rationale for dose selection, study design choices, and any significant protocol amendments. FDA often focuses on whether the development program adequately addressed the key efficacy and safety questions.',
        fields: [
          {
            id: 'development_program_overview',
            label: 'Development Program Overview',
            type: 'textarea',
            required: true,
            placeholder: 'High-level summary of the clinical development program, including number and types of studies',
          },
          {
            id: 'pivotal_study_count',
            label: 'Number of Pivotal Studies',
            type: 'number',
            required: true,
            validation: { min: 1, max: 20 },
          },
          {
            id: 'pivotal_study_designs',
            label: 'Pivotal Study Design(s)',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'randomized_controlled', label: 'Randomized Controlled Trial' },
              { value: 'single_arm', label: 'Single-Arm Trial' },
              { value: 'non_inferiority', label: 'Non-Inferiority Trial' },
              { value: 'superiority', label: 'Superiority Trial' },
              { value: 'crossover', label: 'Crossover Trial' },
              { value: 'adaptive', label: 'Adaptive Design' },
              { value: 'platform', label: 'Platform / Basket Trial' },
              { value: 'real_world_evidence', label: 'Real-World Evidence' },
            ],
          },
          {
            id: 'primary_endpoints',
            label: 'Primary Endpoint(s)',
            type: 'textarea',
            required: true,
            placeholder: 'List each primary endpoint and its rationale',
          },
          {
            id: 'key_secondary_endpoints',
            label: 'Key Secondary Endpoints',
            type: 'textarea',
            placeholder: 'List key secondary endpoints included in the statistical testing hierarchy',
          },
          {
            id: 'total_patients_enrolled',
            label: 'Total Patients Enrolled',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'dose_selection_rationale',
            label: 'Dose Selection Rationale',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the dose-finding studies and rationale for the recommended dose',
          },
          {
            id: 'protocol_amendments',
            label: 'Significant Protocol Amendments',
            type: 'textarea',
            placeholder: 'Describe any significant amendments to pivotal study protocols and their justification',
          },
          {
            id: 'comparator_selection',
            label: 'Comparator Selection Rationale',
            type: 'textarea',
            placeholder: 'Justify the choice of comparator (active or placebo) in pivotal studies',
          },
        ],
        issueChecks: [
          {
            id: 'single_arm_pivotal',
            condition: { field: 'pivotal_study_designs', operator: 'includes', value: 'single_arm' },
            severity: 'info',
            title: 'Single-Arm Pivotal Study',
            message:
              'Single-arm pivotal studies require careful contextualization of results against historical controls or external data. Advisory committees may scrutinize the choice not to conduct a randomized controlled trial. Be prepared to justify the study design and provide supporting external evidence.',
            reference: 'FDA Guidance on Single-Arm Trials for Oncology',
          },
        ],
        defaultNext: 'efficacy_summary',
      },

      {
        id: 'efficacy_summary',
        section: 'Clinical Evidence',
        question:
          'Summarize the efficacy data for the briefing document.',
        guidance:
          'The efficacy summary is typically the centerpiece of the briefing document. Present results clearly with appropriate statistical rigor. Include primary and key secondary endpoint results, subgroup analyses, patient-reported outcomes, and durability of response. Advisory committee members will scrutinize the clinical meaningfulness of the results, not just statistical significance. Forest plots and Kaplan-Meier curves are expected for time-to-event endpoints.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'primary_efficacy_results',
            label: 'Primary Efficacy Results',
            type: 'textarea',
            required: true,
            placeholder: 'Present primary endpoint results with point estimates, confidence intervals, and p-values',
          },
          {
            id: 'clinical_significance',
            label: 'Clinical Significance',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the clinical meaningfulness of the observed treatment effect beyond statistical significance',
          },
          {
            id: 'secondary_endpoint_results',
            label: 'Key Secondary Endpoint Results',
            type: 'textarea',
            required: true,
            placeholder: 'Results for key secondary endpoints in the testing hierarchy',
          },
          {
            id: 'subgroup_analyses',
            label: 'Subgroup Analyses',
            type: 'textarea',
            required: true,
            placeholder: 'Pre-specified and exploratory subgroup analyses (age, sex, race, disease severity, biomarker status)',
          },
          {
            id: 'patient_reported_outcomes',
            label: 'Patient-Reported Outcomes',
            type: 'textarea',
            placeholder: 'Quality of life, symptom improvement, or other PRO measures',
          },
          {
            id: 'durability_of_response',
            label: 'Durability of Response',
            type: 'textarea',
            placeholder: 'Duration of response, progression-free interval, or maintenance of effect over time',
          },
          {
            id: 'sensitivity_analyses',
            label: 'Sensitivity Analyses',
            type: 'textarea',
            placeholder: 'Key sensitivity analyses and their impact on primary conclusions',
          },
          {
            id: 'missing_data_handling',
            label: 'Missing Data Handling',
            type: 'textarea',
            placeholder: 'Describe approaches to missing data and impact on results',
            helpText: 'Advisory committees frequently question the impact of missing data on efficacy conclusions.',
          },
        ],
        defaultNext: 'safety_profile',
      },

      {
        id: 'safety_profile',
        section: 'Clinical Evidence',
        question:
          'Summarize the safety profile for the briefing document.',
        guidance:
          'The safety summary must present a balanced and transparent assessment. Include the size and duration of the safety database, common and serious adverse events, deaths, discontinuations due to adverse events, and any signals of concern. Advisory committees pay particular attention to serious and unexpected adverse events, comparative safety data, and whether risk mitigation strategies are adequate. Provide context by comparing to the safety profile of the active comparator or standard of care.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'safety_database_description',
            label: 'Safety Database Description',
            type: 'textarea',
            required: true,
            placeholder: 'Total patients exposed, median duration of exposure, long-term safety follow-up available',
          },
          {
            id: 'safety_database_size',
            label: 'Safety Database Size (Patients Exposed)',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'deaths_overview',
            label: 'Deaths Overview',
            type: 'textarea',
            required: true,
            placeholder: 'Number of deaths in treatment and control arms, causes, and assessment of relatedness',
          },
          {
            id: 'serious_adverse_events',
            label: 'Serious Adverse Events',
            type: 'textarea',
            required: true,
            placeholder: 'Incidence and types of SAEs, comparison between treatment and control groups',
          },
          {
            id: 'adverse_events_of_special_interest',
            label: 'Adverse Events of Special Interest',
            type: 'textarea',
            required: true,
            placeholder: 'Pre-specified AESIs with incidence, severity, time to onset, and management',
          },
          {
            id: 'discontinuation_due_to_ae',
            label: 'Discontinuation Due to Adverse Events',
            type: 'textarea',
            required: true,
            placeholder: 'Rate and reasons for treatment discontinuation due to adverse events',
          },
          {
            id: 'dose_modifications_safety',
            label: 'Dose Modifications for Safety',
            type: 'textarea',
            placeholder: 'Frequency and reasons for dose reductions, interruptions, or delays',
          },
          {
            id: 'safety_in_subgroups',
            label: 'Safety in Special Subgroups',
            type: 'textarea',
            placeholder: 'Safety findings in elderly, renally/hepatically impaired, or other special populations',
          },
          {
            id: 'postmarket_safety_data',
            label: 'Post-Market Safety Data (if applicable)',
            type: 'textarea',
            placeholder: 'Post-marketing safety signals, FAERS data, or international pharmacovigilance findings',
          },
        ],
        issueChecks: [
          {
            id: 'small_safety_database',
            condition: { field: 'safety_database_size', operator: 'lt', value: 300 },
            severity: 'warning',
            title: 'Limited Safety Database',
            message:
              'A safety database of fewer than 300 patients may raise concerns at the advisory committee about the adequacy of safety characterization. ICH E1 recommends at least 300-600 patients for short-term treatments and 1500 for chronic-use products. Be prepared to address committee questions about the ability to detect uncommon adverse events.',
            reference: 'ICH E1, FDA Pre-Market Safety Guidance',
          },
        ],
        defaultNext: 'benefit_risk_framework',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 3 — Benefit-Risk Assessment                             */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'benefit_risk_framework',
        section: 'Benefit-Risk Assessment',
        question:
          'Describe the benefit-risk framework for this product.',
        guidance:
          'FDA uses a structured Benefit-Risk Framework based on the PDUFA V commitment. The framework evaluates five dimensions: Analysis of Condition, Current Treatment Options, Benefit, Risk, and Risk Management. The briefing document should present this framework clearly and transparently, acknowledging both the strengths and limitations of the available evidence. Advisory committees are asked to weigh the totality of evidence, not just individual endpoints.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'benefit_summary',
            label: 'Benefit Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Concise summary of the key benefits demonstrated by the clinical program',
          },
          {
            id: 'risk_summary',
            label: 'Risk Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Concise summary of the key risks identified in the clinical program',
          },
          {
            id: 'benefit_risk_conclusion',
            label: 'Benefit-Risk Conclusion',
            type: 'textarea',
            required: true,
            placeholder: 'Overall assessment of whether benefits outweigh risks for the proposed indication and population',
          },
          {
            id: 'risk_mitigation_strategies',
            label: 'Risk Mitigation Strategies',
            type: 'multi_select',
            required: true,
            helpText: 'Select all risk mitigation strategies proposed or implemented.',
            options: [
              { value: 'labeling', label: 'Labeling (Warnings, Contraindications)' },
              { value: 'boxed_warning', label: 'Boxed Warning' },
              { value: 'rems', label: 'REMS' },
              { value: 'restricted_distribution', label: 'Restricted Distribution' },
              { value: 'monitoring_requirements', label: 'Monitoring Requirements' },
              { value: 'dose_modification', label: 'Dose Modification Guidelines' },
              { value: 'patient_selection', label: 'Patient Selection Criteria' },
              { value: 'companion_diagnostic', label: 'Companion Diagnostic' },
              { value: 'postmarket_study', label: 'Post-Market Study Commitment' },
            ],
          },
          {
            id: 'uncertainties',
            label: 'Key Uncertainties',
            type: 'textarea',
            required: true,
            placeholder: 'Describe key areas of uncertainty in the benefit-risk assessment',
          },
          {
            id: 'benefit_risk_framework_type',
            label: 'Framework Used',
            type: 'select',
            required: true,
            options: [
              { value: 'fda_structured', label: 'FDA Structured Benefit-Risk Framework' },
              { value: 'ema_proactive', label: 'EMA PROACTIVE Framework' },
              { value: 'mcda', label: 'Multi-Criteria Decision Analysis (MCDA)' },
              { value: 'qualitative', label: 'Qualitative Assessment' },
              { value: 'custom', label: 'Custom Framework' },
            ],
          },
          {
            id: 'postmarket_commitments',
            label: 'Proposed Post-Market Commitments',
            type: 'textarea',
            placeholder: 'List any proposed post-market studies, registries, or REMS assessments',
          },
        ],
        defaultNext: 'unresolved_issues',
      },

      {
        id: 'unresolved_issues',
        section: 'Benefit-Risk Assessment',
        question:
          'What are the unresolved issues and areas of disagreement with FDA?',
        guidance:
          'Transparency about unresolved issues strengthens the briefing document. Advisory committees value honest acknowledgment of data limitations and areas of FDA-sponsor disagreement. Common areas of contention include primary endpoint selection, statistical analysis methods, subgroup differences, safety signal interpretation, and labeling language. Present both the sponsor\'s and FDA\'s perspectives where they differ.',
        fields: [
          {
            id: 'fda_sponsor_disagreements',
            label: 'Areas of FDA-Sponsor Disagreement',
            type: 'textarea',
            required: true,
            placeholder: 'Describe areas where the sponsor and FDA have different positions',
          },
          {
            id: 'data_limitations',
            label: 'Key Data Limitations',
            type: 'textarea',
            required: true,
            placeholder: 'Acknowledged limitations of the clinical data (study design, population, follow-up duration)',
          },
          {
            id: 'outstanding_safety_signals',
            label: 'Outstanding Safety Signals',
            type: 'textarea',
            placeholder: 'Safety signals under investigation or where the clinical significance is uncertain',
          },
          {
            id: 'crl_issues',
            label: 'Complete Response Letter Issues (if applicable)',
            type: 'textarea',
            placeholder: 'If this is a resubmission, describe CRL issues and how they were addressed',
          },
          {
            id: 'labeling_disagreements',
            label: 'Labeling Disagreements',
            type: 'textarea',
            placeholder: 'Areas where the sponsor and FDA disagree on proposed labeling language',
          },
          {
            id: 'additional_data_planned',
            label: 'Additional Data Collection Planned',
            type: 'textarea',
            placeholder: 'Ongoing studies, interim analyses, or additional data that may inform the benefit-risk assessment',
          },
        ],
        issueChecks: [
          {
            id: 'crl_resubmission',
            condition: { field: 'crl_issues', operator: 'neq', value: '' },
            severity: 'info',
            title: 'CRL Resubmission Considerations',
            message:
              'For resubmissions following a Complete Response Letter, the briefing document should clearly delineate each CRL deficiency and how it was resolved. Advisory committees may focus on whether new data adequately address the original concerns.',
          },
        ],
        defaultNext: 'committee_questions',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 4 — Committee Engagement                                */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'committee_questions',
        section: 'Committee Engagement',
        question:
          'What questions will be posed to the advisory committee?',
        guidance:
          'FDA publishes the committee questions in advance, and the sponsor\'s briefing document should anticipate and address them. Questions may be discussion (non-voting) or voting questions. Voting questions are typically framed as yes/no on approvability or agreement with specific benefit-risk conclusions. The sponsor should prepare concise, data-supported answers to each anticipated question and develop backup slides for potential follow-up questions.',
        fields: [
          {
            id: 'fda_discussion_questions',
            label: 'FDA Discussion Questions',
            type: 'textarea',
            required: true,
            placeholder: 'List the discussion questions published by FDA (or anticipated questions if not yet published)',
          },
          {
            id: 'fda_voting_questions',
            label: 'FDA Voting Questions',
            type: 'textarea',
            required: true,
            placeholder: 'List the voting questions published by FDA (or anticipated voting questions)',
          },
          {
            id: 'sponsor_proposed_questions',
            label: 'Sponsor-Proposed Questions',
            type: 'textarea',
            placeholder: 'Additional questions the sponsor would like the committee to consider',
          },
          {
            id: 'anticipated_committee_concerns',
            label: 'Anticipated Committee Concerns',
            type: 'textarea',
            required: true,
            placeholder: 'Based on the data package and FDA interactions, what concerns might committee members raise?',
          },
          {
            id: 'key_opinion_leaders',
            label: 'Key Opinion Leaders / Expected Panelists',
            type: 'textarea',
            placeholder: 'Known or expected committee members and their potential perspectives',
          },
          {
            id: 'patient_representative_considerations',
            label: 'Patient Representative Considerations',
            type: 'textarea',
            placeholder: 'Issues likely to be raised by the patient representative on the committee',
          },
          {
            id: 'open_public_hearing_preparation',
            label: 'Open Public Hearing Preparation',
            type: 'textarea',
            placeholder: 'Anticipated speakers and topics during the open public hearing session',
          },
        ],
        defaultNext: 'regulatory_history',
      },

      {
        id: 'regulatory_history',
        section: 'Committee Engagement',
        question:
          'What is the regulatory interaction history for this product?',
        guidance:
          'A complete regulatory history provides context for the advisory committee. Include all significant regulatory interactions, FDA meeting minutes, special protocol assessments, and any changes in the regulatory strategy over the course of development. If FDA has previously expressed concerns, the briefing document should address how those concerns were resolved or remain under discussion.',
        fields: [
          {
            id: 'ind_submission_date',
            label: 'IND / IDE Submission Date',
            type: 'date',
          },
          {
            id: 'application_type',
            label: 'Application Type',
            type: 'select',
            required: true,
            options: [
              { value: 'nda', label: 'NDA' },
              { value: 'bla', label: 'BLA' },
              { value: 'pma', label: 'PMA' },
              { value: 'snda', label: 'sNDA' },
              { value: 'sbla', label: 'sBLA' },
              { value: 'anda', label: 'ANDA' },
              { value: 'eua', label: 'EUA' },
            ],
          },
          {
            id: 'application_submission_date',
            label: 'Application Submission Date',
            type: 'date',
          },
          {
            id: 'pdufa_date',
            label: 'PDUFA Action Date',
            type: 'date',
            helpText: 'The FDA target action date under PDUFA.',
          },
          {
            id: 'key_fda_meetings',
            label: 'Key FDA Meetings',
            type: 'textarea',
            required: true,
            placeholder: 'List all significant FDA meetings (Pre-IND, EOP2, Pre-NDA/BLA, Type A, etc.) with dates and key outcomes',
          },
          {
            id: 'special_protocol_assessment',
            label: 'Special Protocol Assessment (SPA)',
            type: 'yes_no',
            helpText: 'Was a Special Protocol Assessment agreed upon with FDA for the pivotal study?',
          },
          {
            id: 'spa_details',
            label: 'SPA Details',
            type: 'textarea',
            placeholder: 'Describe the SPA agreement, any amendments, and whether FDA has indicated intent to rescind',
            visibleWhen: { field: 'special_protocol_assessment', operator: 'eq', value: true },
          },
          {
            id: 'clinical_holds',
            label: 'Clinical Holds',
            type: 'textarea',
            placeholder: 'Describe any clinical holds placed on the IND, reasons, and resolution',
          },
          {
            id: 'refuse_to_file',
            label: 'Refuse to File (RTF)',
            type: 'yes_no',
            helpText: 'Was the application subject to a Refuse to File action?',
          },
          {
            id: 'international_regulatory_status',
            label: 'International Regulatory Status',
            type: 'textarea',
            placeholder: 'Approval status in EU, Japan, and other major markets',
          },
        ],
        issueChecks: [
          {
            id: 'rtf_history',
            condition: { field: 'refuse_to_file', operator: 'eq', value: true },
            severity: 'warning',
            title: 'Refuse to File History',
            message:
              'A prior Refuse to File action may be raised by committee members. The briefing document should clearly describe what deficiencies were identified, how they were addressed in the resubmission, and confirm that the current filing was accepted for review.',
          },
        ],
        defaultNext: 'comparable_products',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 5 — Competitive Landscape                               */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'comparable_products',
        section: 'Competitive Landscape',
        question:
          'What comparable or competing products should be discussed in the briefing document?',
        guidance:
          'Advisory committees consider the product in the context of existing and emerging therapies. The briefing document should provide an objective comparison of efficacy, safety, convenience, and cost considerations. Avoid direct promotional comparisons — instead, present published data and let the committee draw conclusions. Include recently approved products and those in late-stage development that may change the treatment landscape.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'approved_competitors',
            label: 'Approved Competing Products',
            type: 'textarea',
            required: true,
            placeholder: 'List approved products in the same therapeutic space with generic name, brand name, and approval date',
          },
          {
            id: 'pipeline_competitors',
            label: 'Pipeline Competitors',
            type: 'textarea',
            placeholder: 'Products in Phase III or under regulatory review for the same or similar indication',
          },
          {
            id: 'comparative_efficacy',
            label: 'Comparative Efficacy Data',
            type: 'textarea',
            required: true,
            placeholder: 'Cross-trial or head-to-head comparisons of efficacy (acknowledge limitations of indirect comparisons)',
          },
          {
            id: 'comparative_safety',
            label: 'Comparative Safety Data',
            type: 'textarea',
            required: true,
            placeholder: 'Comparison of safety profiles across products in the class',
          },
          {
            id: 'differentiation_factors',
            label: 'Differentiation Factors',
            type: 'multi_select',
            required: true,
            helpText: 'Select the key factors that differentiate this product from competitors.',
            options: [
              { value: 'novel_mechanism', label: 'Novel Mechanism of Action' },
              { value: 'superior_efficacy', label: 'Superior Efficacy' },
              { value: 'improved_safety', label: 'Improved Safety Profile' },
              { value: 'convenience', label: 'Dosing Convenience' },
              { value: 'route_of_admin', label: 'Route of Administration' },
              { value: 'patient_population', label: 'Different Patient Population' },
              { value: 'combination_therapy', label: 'Combination Therapy Potential' },
              { value: 'biomarker_driven', label: 'Biomarker-Driven Selection' },
              { value: 'first_in_class', label: 'First in Class' },
              { value: 'cost', label: 'Cost Advantage' },
            ],
          },
          {
            id: 'treatment_guidelines',
            label: 'Placement in Treatment Guidelines',
            type: 'textarea',
            placeholder: 'Where would this product fit in current NCCN, AHA, IDSA, or other treatment guidelines?',
          },
          {
            id: 'health_economics_data',
            label: 'Health Economics Data',
            type: 'textarea',
            placeholder: 'Cost-effectiveness, QALY gains, or other health economics data available',
            helpText: 'While FDA does not consider cost in approval decisions, advisory committees may discuss it.',
          },
          {
            id: 'patient_preference_data',
            label: 'Patient Preference Data',
            type: 'textarea',
            placeholder: 'Patient preference studies, surveys, or qualitative data supporting product value',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
