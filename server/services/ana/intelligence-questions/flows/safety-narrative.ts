/**
 * Safety Narrative flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through collection of all data needed to write individual
 * patient safety narratives for serious adverse events per ICH E3 Section 12.3.
 * Covers case identification, event classification, patient history, event
 * description with MedDRA coding, clinical course and interventions, causality
 * assessment (including Naranjo, WHO-UMC, and clinical judgment), and narrative
 * composition for clinical study report appendices and regulatory submissions.
 * Branching logic handles death cases and SUSAR-specific paths.  Issue checks
 * flag missing or incomplete data that could delay regulatory submissions.
 *
 * 14 nodes · 65+ fields · 5 sections · 9 issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/safety-narrative
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createSafetyNarrativeFlow(): FlowDefinition {
  return {
    id: 'safety-narrative-v1',
    category: 'safety_narrative',
    name: 'Safety Narrative',
    description:
      'Guided questionnaire for assembling individual patient safety narratives per ICH E3 Section 12.3. Covers case identification, event classification, patient history, event description with MedDRA coding, interventions and outcomes, causality assessment, and narrative composition for serious adverse events in clinical study reports.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'case_identification',
    estimatedMinutes: 40,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'case_overview',
        label: 'Case Overview',
        nodeIds: ['case_identification', 'event_classification', 'study_context'],
      },
      {
        id: 'patient_history',
        label: 'Patient History & Context',
        nodeIds: ['medical_history', 'concomitant_medications', 'death_case_details', 'susar_details'],
      },
      {
        id: 'event_timeline',
        label: 'Event Description & Timeline',
        nodeIds: ['event_description', 'event_timeline_details', 'interventions_outcomes'],
      },
      {
        id: 'causality_assessment_section',
        label: 'Causality Assessment',
        nodeIds: ['causality_assessment', 'causality_factors'],
      },
      {
        id: 'narrative_composition',
        label: 'Narrative Composition',
        nodeIds: ['narrative_composition'],
      },
      {
        id: 'regulatory_reporting',
        label: 'Regulatory Reporting',
        nodeIds: ['narrative_finalization'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /* ── Section 1: Case Overview ─────────────────────────────────── */
      /* ================================================================ */

      {
        id: 'case_identification',
        section: 'case_overview',
        question:
          'Provide the case identification details for this safety narrative, including the case number, subject identifier, study number, and reporting dates.',
        guidance:
          'Per ICH E2B(R3) and ICH E3 Section 12.3, individual case narratives must clearly identify the case, subject, study, and investigational product. The reporting date and date of initial awareness establish the regulatory reporting timeline. Use blinded subject identifiers to maintain study integrity.',
        fields: [
          {
            id: 'case_number',
            label: 'Case Number',
            type: 'text',
            required: true,
            placeholder: 'e.g., SAE-2025-0001',
          },
          {
            id: 'subject_id',
            label: 'Subject Identifier',
            type: 'text',
            required: true,
            placeholder: 'e.g., SUBJ-001-0042',
            helpText: 'Use blinded subject identifier only.',
          },
          {
            id: 'study_number',
            label: 'Study Number',
            type: 'text',
            required: true,
            placeholder: 'e.g., PROTO-2025-001',
          },
          {
            id: 'study_phase',
            label: 'Study Phase',
            type: 'select',
            required: true,
            options: [
              { value: 'phase_1', label: 'Phase 1' },
              { value: 'phase_2', label: 'Phase 2' },
              { value: 'phase_3', label: 'Phase 3' },
              { value: 'phase_4', label: 'Phase 4' },
            ],
          },
          {
            id: 'investigational_product',
            label: 'Investigational Product',
            type: 'text',
            required: true,
            placeholder: 'Drug name and dose',
          },
          {
            id: 'reporting_date',
            label: 'Reporting Date',
            type: 'date',
            required: true,
          },
          {
            id: 'initial_awareness_date',
            label: 'Date of Initial Awareness',
            type: 'date',
            required: true,
          },
          {
            id: 'report_type',
            label: 'Report Type',
            type: 'select',
            required: true,
            options: [
              { value: 'initial', label: 'Initial' },
              { value: 'follow_up', label: 'Follow-Up' },
              { value: 'final', label: 'Final' },
            ],
          },
        ],
        defaultNext: 'event_classification',
      },

      {
        id: 'event_classification',
        section: 'case_overview',
        question:
          'Classify the adverse event using standardized MedDRA terminology, seriousness criteria, and case type.',
        guidance:
          'Per ICH E2A, seriousness criteria include death, life-threatening, hospitalization or prolonged hospitalization, persistent or significant disability/incapacity, congenital anomaly/birth defect, and other medically important events. All adverse events must be coded using MedDRA Preferred Terms and System Organ Classes per ICH E2B(R3). The expectedness assessment is based on the current Investigator Brochure or Reference Safety Information.',
        fields: [
          {
            id: 'event_term_verbatim',
            label: 'Event Term (Verbatim)',
            type: 'text',
            required: true,
            placeholder: 'Verbatim term as reported by investigator',
          },
          {
            id: 'event_term_meddra_pt',
            label: 'MedDRA Preferred Term',
            type: 'text',
            required: true,
            placeholder: 'MedDRA Preferred Term',
            helpText: 'Use current MedDRA version for coding.',
          },
          {
            id: 'event_term_meddra_soc',
            label: 'MedDRA System Organ Class',
            type: 'text',
            required: true,
            placeholder: 'MedDRA System Organ Class',
          },
          {
            id: 'event_seriousness_criteria',
            label: 'Seriousness Criteria',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'death', label: 'Results in Death' },
              { value: 'life_threatening', label: 'Life-Threatening' },
              { value: 'hospitalization', label: 'Requires Hospitalization' },
              { value: 'prolonged_hospitalization', label: 'Prolongs Hospitalization' },
              { value: 'disability', label: 'Persistent or Significant Disability' },
              { value: 'congenital_anomaly', label: 'Congenital Anomaly/Birth Defect' },
              { value: 'other_medically_important', label: 'Other Medically Important' },
            ],
          },
          {
            id: 'event_outcome',
            label: 'Event Outcome',
            type: 'select',
            required: true,
            options: [
              { value: 'fatal', label: 'Fatal' },
              { value: 'not_recovered', label: 'Not Recovered/Not Resolved' },
              { value: 'recovering', label: 'Recovering/Resolving' },
              { value: 'recovered_with_sequelae', label: 'Recovered with Sequelae' },
              { value: 'recovered', label: 'Recovered/Resolved' },
              { value: 'unknown', label: 'Unknown' },
            ],
          },
          {
            id: 'case_type',
            label: 'Case Type',
            type: 'select',
            required: true,
            options: [
              { value: 'death_case', label: 'Death Case' },
              { value: 'non_fatal_sae', label: 'Non-Fatal SAE' },
              { value: 'susar', label: 'SUSAR' },
              { value: 'non_susar', label: 'Non-SUSAR' },
            ],
          },
          {
            id: 'expectedness',
            label: 'Expectedness',
            type: 'select',
            required: true,
            options: [
              { value: 'expected', label: 'Expected' },
              { value: 'unexpected', label: 'Unexpected' },
            ],
          },
          {
            id: 'is_susar',
            label: 'Is this a SUSAR?',
            type: 'yes_no',
          },
        ],
        branches: [
          {
            when: { field: 'case_type', operator: 'eq', value: 'death_case' },
            goto: 'death_case_details',
          },
          {
            when: { field: 'is_susar', operator: 'eq', value: true },
            goto: 'susar_details',
          },
        ],
        defaultNext: 'study_context',
        issueChecks: [
          {
            id: 'unexpected_susar_expedited',
            condition: { field: 'is_susar', operator: 'eq', value: true },
            severity: 'critical',
            title: 'SUSAR — Expedited Reporting Required',
            message:
              'Suspected Unexpected Serious Adverse Reactions (SUSARs) require expedited reporting per ICH E2A and EU Regulation 536/2014 Article 42. Fatal or life-threatening SUSARs must be reported within 7 calendar days (initial) with a follow-up within 8 additional days. All other SUSARs must be reported within 15 calendar days. Ensure the narrative is finalized within the applicable regulatory timeline.',
            reference: 'ICH E2A, EU Regulation 536/2014 Art. 42, 21 CFR 312.32',
          },
          {
            id: 'death_case_narrative',
            condition: { field: 'event_seriousness_criteria', operator: 'contains', value: 'death' },
            severity: 'critical',
            title: 'Death Case — Comprehensive Narrative Required',
            message:
              'Per ICH E3 Section 12.3.2, all death cases require detailed individual narratives in the CSR regardless of the investigator\'s causality assessment. The narrative must include cause of death, contributing factors, autopsy findings (if available), and an independent sponsor assessment of causality.',
            reference: 'ICH E3 Section 12.3.2, ICH E2B(R3)',
          },
        ],
      },

      {
        id: 'study_context',
        section: 'case_overview',
        question:
          'Provide the study treatment context at the time of the adverse event, including treatment arm, blinding status, dosing, and route of administration.',
        guidance:
          'Per ICH E3 Section 12.3, each safety narrative must document the study drug exposure context including treatment arm assignment, dose at event onset, duration of exposure, and blinding status. For blinded studies, the narrative should maintain the blind unless unblinding was required for patient safety per ICH E6(R2) Section 3.3.3. The temporal relationship between drug exposure and event onset is a key element of causality assessment per the WHO-UMC system.',
        fields: [
          {
            id: 'treatment_arm',
            label: 'Treatment Arm',
            type: 'text',
            required: true,
            placeholder: 'e.g., Drug X 100mg QD',
          },
          {
            id: 'blinding_status',
            label: 'Blinding Status',
            type: 'select',
            required: true,
            options: [
              { value: 'blinded', label: 'Blinded' },
              { value: 'unblinded', label: 'Unblinded' },
              { value: 'open_label', label: 'Open-Label' },
            ],
          },
          {
            id: 'randomization_date',
            label: 'Randomization Date',
            type: 'date',
          },
          {
            id: 'dose_at_event_onset',
            label: 'Dose at Event Onset',
            type: 'text',
            placeholder: 'Dose and frequency at time of event',
          },
          {
            id: 'route_of_administration',
            label: 'Route of Administration',
            type: 'select',
            required: true,
            options: [
              { value: 'oral', label: 'Oral' },
              { value: 'intravenous', label: 'Intravenous' },
              { value: 'subcutaneous', label: 'Subcutaneous' },
              { value: 'intramuscular', label: 'Intramuscular' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhaled', label: 'Inhaled' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'duration_of_treatment_before_event',
            label: 'Duration of Treatment Before Event',
            type: 'text',
            placeholder: 'e.g., 42 days',
          },
          {
            id: 'protocol_defined_sae_criteria',
            label: 'Protocol-Defined SAE Criteria',
            type: 'yes_no',
            helpText: 'Was this SAE specifically defined in the protocol as an event of interest?',
          },
        ],
        defaultNext: 'medical_history',
      },

      /* ================================================================ */
      /* ── Section 2: Patient History & Context ─────────────────────── */
      /* ================================================================ */

      {
        id: 'medical_history',
        section: 'patient_history',
        question:
          'Document the patient\'s demographic information, relevant medical history, baseline laboratory values, and other pertinent clinical context.',
        guidance:
          'Per ICH E3 Section 12.3.1, the patient context is essential for causality assessment. Document conditions relevant to the event, pre-existing conditions, surgical history, and known allergies. Baseline laboratory values should be included when relevant to the adverse event under evaluation.',
        fields: [
          {
            id: 'age',
            label: 'Age (years)',
            type: 'number',
            required: true,
            validation: { min: 0, max: 120 },
          },
          {
            id: 'sex',
            label: 'Sex',
            type: 'select',
            required: true,
            options: [
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'race_ethnicity',
            label: 'Race/Ethnicity',
            type: 'text',
            placeholder: 'As reported by subject',
          },
          {
            id: 'relevant_medical_history',
            label: 'Relevant Medical History',
            type: 'textarea',
            required: true,
            placeholder: 'List all relevant past and current medical conditions with dates of onset',
            helpText: 'Include conditions relevant to the event, pre-existing conditions, surgical history, and known allergies.',
          },
          {
            id: 'baseline_lab_values',
            label: 'Baseline Laboratory Values',
            type: 'textarea',
            placeholder: 'Relevant baseline laboratory values',
          },
          {
            id: 'relevant_family_history',
            label: 'Relevant Family History',
            type: 'textarea',
            placeholder: 'Relevant family medical history',
          },
          {
            id: 'pregnancy_status',
            label: 'Pregnancy Status',
            type: 'select',
            options: [
              { value: 'not_pregnant', label: 'Not Pregnant' },
              { value: 'pregnant', label: 'Pregnant' },
              { value: 'unknown', label: 'Unknown' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'smoking_alcohol_status',
            label: 'Smoking, Alcohol, and Substance Use',
            type: 'textarea',
            placeholder: 'Smoking, alcohol, and substance use history',
          },
        ],
        defaultNext: 'concomitant_medications',
        issueChecks: [
          {
            id: 'incomplete_medical_history',
            condition: {
              field: 'relevant_medical_history',
              operator: 'eq',
              value: '',
            },
            severity: 'critical',
            title: 'Incomplete Medical History',
            message:
              'A complete relevant medical history is essential for causality assessment. ICH E2B(R3) requires documentation of relevant past and concurrent medical conditions.',
            reference: 'ICH E2B(R3) Section B.1.7',
          },
        ],
      },

      {
        id: 'concomitant_medications',
        section: 'patient_history',
        question:
          'List all concomitant medications the subject was taking at the time of the event, including prescription drugs, over-the-counter medications, and supplements.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'concomitant_medications_list',
            label: 'Concomitant Medications List',
            type: 'textarea',
            required: true,
            placeholder: 'List all concomitant medications with dose, route, dates of use, and indication',
          },
          {
            id: 'number_of_concomitant_meds',
            label: 'Number of Concomitant Medications',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'medications_potentially_causative',
            label: 'Potentially Causative Medications',
            type: 'textarea',
            placeholder: 'List any concomitant medications that could be alternative causes',
          },
          {
            id: 'herbal_otc_supplements',
            label: 'Herbal/OTC/Supplements',
            type: 'textarea',
            placeholder: 'Herbal medicines, OTC drugs, supplements',
          },
          {
            id: 'medications_started_after_event',
            label: 'Medications Started After Event',
            type: 'textarea',
            placeholder: 'Medications started to treat the event',
          },
        ],
        defaultNext: 'event_description',
        issueChecks: [
          {
            id: 'missing_concomitant_meds',
            condition: {
              field: 'number_of_concomitant_meds',
              operator: 'eq',
              value: 0,
            },
            severity: 'warning',
            title: 'No Concomitant Medications Reported',
            message:
              'It is unusual for a clinical trial subject to report zero concomitant medications. Confirm this is accurate and not a documentation gap.',
            reference: 'ICH E3 Section 12.3',
          },
        ],
      },

      {
        id: 'death_case_details',
        section: 'patient_history',
        question:
          'Provide additional details specific to this death case, including date and cause of death, autopsy information, and causality assessments.',
        guidance:
          'Per ICH E3, all death cases require comprehensive narratives regardless of the investigator\'s causality assessment. Autopsy results, when available, provide critical information for understanding the cause of death and its potential relationship to the study drug.',
        fields: [
          {
            id: 'date_of_death',
            label: 'Date of Death',
            type: 'date',
            required: true,
          },
          {
            id: 'primary_cause_of_death',
            label: 'Primary Cause of Death',
            type: 'text',
            required: true,
          },
          {
            id: 'contributing_causes',
            label: 'Contributing Causes of Death',
            type: 'textarea',
          },
          {
            id: 'autopsy_performed',
            label: 'Autopsy Performed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'autopsy_results',
            label: 'Autopsy Results',
            type: 'textarea',
            visibleWhen: {
              field: 'autopsy_performed',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'death_certificate_obtained',
            label: 'Death Certificate Obtained',
            type: 'yes_no',
          },
          {
            id: 'relationship_to_study_drug_investigator',
            label: 'Investigator Assessment of Relationship to Study Drug',
            type: 'select',
            required: true,
            options: [
              { value: 'related', label: 'Related' },
              { value: 'possibly_related', label: 'Possibly Related' },
              { value: 'unlikely_related', label: 'Unlikely Related' },
              { value: 'not_related', label: 'Not Related' },
            ],
          },
          {
            id: 'relationship_to_study_drug_sponsor',
            label: 'Sponsor Assessment of Relationship to Study Drug',
            type: 'select',
            required: true,
            options: [
              { value: 'related', label: 'Related' },
              { value: 'possibly_related', label: 'Possibly Related' },
              { value: 'unlikely_related', label: 'Unlikely Related' },
              { value: 'not_related', label: 'Not Related' },
            ],
          },
        ],
        defaultNext: 'study_context',
      },

      {
        id: 'susar_details',
        section: 'patient_history',
        question:
          'Provide details specific to this Suspected Unexpected Serious Adverse Reaction (SUSAR), including reporting timeline, regulatory notifications, and unblinding status.',
        fields: [
          {
            id: 'susar_report_date',
            label: 'SUSAR Report Date',
            type: 'date',
            required: true,
          },
          {
            id: 'susar_regulatory_authority',
            label: 'Regulatory Authority',
            type: 'text',
            required: true,
            placeholder: 'e.g., FDA, EMA, PMDA',
          },
          {
            id: 'expedited_reporting_timeline',
            label: 'Expedited Reporting Timeline',
            type: 'select',
            required: true,
            helpText: '7-day for fatal/life-threatening; 15-day for others.',
            options: [
              { value: '7_day', label: '7-Day Report' },
              { value: '15_day', label: '15-Day Report' },
            ],
          },
          {
            id: 'irb_ec_notification_date',
            label: 'IRB/EC Notification Date',
            type: 'date',
          },
          {
            id: 'data_lock_point',
            label: 'Data Lock Point',
            type: 'date',
          },
          {
            id: 'dsmb_notification',
            label: 'DSMB Notification',
            type: 'yes_no',
          },
          {
            id: 'unblinding_performed',
            label: 'Unblinding Performed',
            type: 'yes_no',
            helpText: 'Was the treatment assignment unblinded for this report?',
          },
          {
            id: 'ib_update_required',
            label: 'IB Update Required',
            type: 'yes_no',
            helpText: 'Does the Investigator Brochure safety information need updating?',
          },
        ],
        defaultNext: 'study_context',
      },

      /* ================================================================ */
      /* ── Section 3: Event Description & Timeline ──────────────────── */
      /* ================================================================ */

      {
        id: 'event_description',
        section: 'event_timeline',
        question:
          'Provide a detailed chronological description of the adverse event, including onset date and time, time-to-onset from first dose, severity grade, and event duration.',
        guidance:
          'Per ICH E3 Section 12.3, the narrative should present a factual, chronological account of the event from onset through resolution or last follow-up. The temporal relationship between drug administration and event onset is a critical factor in causality assessment.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'event_narrative_description',
            label: 'Event Narrative Description',
            type: 'textarea',
            required: true,
            placeholder: 'Provide a detailed chronological description of the event including onset symptoms, progression, and clinical course',
            validation: { minLength: 100 },
          },
          {
            id: 'onset_date',
            label: 'Onset Date',
            type: 'date',
            required: true,
          },
          {
            id: 'onset_time',
            label: 'Onset Time',
            type: 'text',
            placeholder: 'HH:MM if known',
          },
          {
            id: 'time_to_onset',
            label: 'Time to Onset',
            type: 'text',
            required: true,
            placeholder: 'e.g., 14 days after first dose',
            helpText: 'Time from first dose of study drug to event onset.',
          },
          {
            id: 'event_severity_grade',
            label: 'Event Severity Grade',
            type: 'select',
            required: true,
            options: [
              { value: 'mild', label: 'Mild' },
              { value: 'moderate', label: 'Moderate' },
              { value: 'severe', label: 'Severe' },
              { value: 'life_threatening', label: 'Life-Threatening' },
              { value: 'fatal', label: 'Fatal' },
            ],
          },
          {
            id: 'event_duration',
            label: 'Event Duration',
            type: 'text',
            placeholder: 'e.g., 7 days',
          },
        ],
        defaultNext: 'event_timeline_details',
        issueChecks: [
          {
            id: 'time_to_onset_missing',
            condition: {
              field: 'time_to_onset',
              operator: 'eq',
              value: '',
            },
            severity: 'critical',
            title: 'Time-to-Onset Not Documented',
            message:
              'The temporal relationship between drug administration and event onset is critical for causality assessment. This must be documented.',
            reference: 'ICH E2B(R3) Section B.2.i.4',
          },
        ],
      },

      {
        id: 'event_timeline_details',
        section: 'event_timeline',
        question:
          'Provide supporting clinical data observed during the event, including laboratory values, vital signs, diagnostic procedures, hospitalization details, and ICU admission status.',
        fields: [
          {
            id: 'key_lab_values_during_event',
            label: 'Key Laboratory Values During Event',
            type: 'textarea',
            placeholder: 'Relevant laboratory values during the event with dates',
          },
          {
            id: 'key_vital_signs',
            label: 'Key Vital Signs',
            type: 'textarea',
            placeholder: 'Relevant vital signs during the event',
          },
          {
            id: 'diagnostic_procedures',
            label: 'Diagnostic Procedures',
            type: 'textarea',
            placeholder: 'Imaging, biopsies, ECGs, other diagnostic tests performed',
          },
          {
            id: 'hospitalization_dates',
            label: 'Hospitalization Dates',
            type: 'text',
            placeholder: 'Admission and discharge dates if applicable',
            visibleWhen: {
              field: 'event_seriousness_criteria',
              operator: 'contains',
              value: 'hospitalization',
            },
          },
          {
            id: 'icu_admission',
            label: 'ICU Admission',
            type: 'yes_no',
          },
          {
            id: 'icu_duration',
            label: 'ICU Duration',
            type: 'text',
            placeholder: 'Duration of ICU stay',
            visibleWhen: {
              field: 'icu_admission',
              operator: 'eq',
              value: true,
            },
          },
        ],
        defaultNext: 'interventions_outcomes',
      },

      {
        id: 'interventions_outcomes',
        section: 'event_timeline',
        question:
          'Document the actions taken with the study drug, dechallenge and rechallenge results, treatment administered for the event, and the event outcome.',
        fields: [
          {
            id: 'study_drug_action',
            label: 'Action Taken with Study Drug',
            type: 'select',
            required: true,
            options: [
              { value: 'dose_not_changed', label: 'Dose Not Changed' },
              { value: 'dose_reduced', label: 'Dose Reduced' },
              { value: 'drug_interrupted', label: 'Drug Interrupted' },
              { value: 'drug_withdrawn', label: 'Drug Withdrawn' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'dechallenge_result',
            label: 'Dechallenge Result',
            type: 'select',
            required: true,
            helpText: 'What happened when the study drug was stopped or reduced?',
            options: [
              { value: 'positive_resolved', label: 'Positive — Event Resolved' },
              { value: 'positive_improved', label: 'Positive — Event Improved' },
              { value: 'negative_no_change', label: 'Negative — No Change' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'rechallenge_performed',
            label: 'Rechallenge Performed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'rechallenge_result',
            label: 'Rechallenge Result',
            type: 'select',
            options: [
              { value: 'positive_recurred', label: 'Positive — Event Recurred' },
              { value: 'negative_no_recurrence', label: 'Negative — No Recurrence' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
            visibleWhen: {
              field: 'rechallenge_performed',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'treatment_for_event',
            label: 'Treatment for Event',
            type: 'textarea',
            placeholder: 'Medications and procedures used to treat the event',
          },
          {
            id: 'event_resolution_date',
            label: 'Event Resolution Date',
            type: 'date',
          },
          {
            id: 'sequelae_description',
            label: 'Sequelae Description',
            type: 'textarea',
            placeholder: 'Describe any residual effects or sequelae',
          },
        ],
        defaultNext: 'causality_assessment',
        issueChecks: [
          {
            id: 'no_dechallenge_info',
            condition: {
              field: 'dechallenge_result',
              operator: 'eq',
              value: 'not_applicable',
            },
            severity: 'info',
            title: 'No Dechallenge Information',
            message:
              'Dechallenge information (response to drug withdrawal) is valuable for causality assessment. If the drug was stopped, document the clinical response.',
            reference: 'FDA CIOMS Form Guidance',
          },
          {
            id: 'no_rechallenge_info',
            condition: {
              field: 'rechallenge_performed',
              operator: 'eq',
              value: false,
            },
            severity: 'info',
            title: 'No Rechallenge Information',
            message:
              'Rechallenge data, when available, provides strong evidence for or against causality. Document the rationale if rechallenge was not performed.',
            reference: 'ICH E2B(R3) Section B.4',
          },
        ],
      },

      /* ================================================================ */
      /* ── Section 4: Causality Assessment ──────────────────────────── */
      /* ================================================================ */

      {
        id: 'causality_assessment',
        section: 'causality_assessment_section',
        question:
          'Provide the investigator and sponsor causality assessments, assessment method used, and a detailed rationale for the determination.',
        guidance:
          'Causality assessment is a critical component of every safety narrative. Both the investigator and sponsor must independently assess the causal relationship between the study drug and the event. Standardized methods such as WHO-UMC, Naranjo algorithm, or Bayesian approaches provide a structured framework for consistent assessment.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'investigator_causality',
            label: 'Investigator Causality Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'related', label: 'Related' },
              { value: 'possibly_related', label: 'Possibly Related' },
              { value: 'unlikely_related', label: 'Unlikely Related' },
              { value: 'not_related', label: 'Not Related' },
              { value: 'not_assessable', label: 'Not Assessable' },
            ],
          },
          {
            id: 'sponsor_causality',
            label: 'Sponsor Causality Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'related', label: 'Related' },
              { value: 'possibly_related', label: 'Possibly Related' },
              { value: 'unlikely_related', label: 'Unlikely Related' },
              { value: 'not_related', label: 'Not Related' },
              { value: 'not_assessable', label: 'Not Assessable' },
            ],
          },
          {
            id: 'causality_assessment_method',
            label: 'Causality Assessment Method',
            type: 'select',
            required: true,
            options: [
              { value: 'who_umc', label: 'WHO-UMC System' },
              { value: 'naranjo', label: 'Naranjo Algorithm' },
              { value: 'bayesian', label: 'Bayesian Approach' },
              { value: 'clinical_judgment', label: 'Clinical Judgment' },
              { value: 'company_algorithm', label: 'Company Algorithm' },
            ],
          },
          {
            id: 'causality_score',
            label: 'Causality Score',
            type: 'text',
            placeholder: 'Score or category if using a standardized method',
          },
          {
            id: 'primary_causality_rationale',
            label: 'Primary Causality Rationale',
            type: 'textarea',
            required: true,
            placeholder: 'Provide detailed rationale for the causality assessment including temporal relationship, biological plausibility, dechallenge/rechallenge results, and alternative explanations',
          },
        ],
        defaultNext: 'causality_factors',
        issueChecks: [
          {
            id: 'missing_causality',
            condition: {
              field: 'sponsor_causality',
              operator: 'eq',
              value: 'not_assessable',
            },
            severity: 'critical',
            title: 'Missing Causality Assessment',
            message:
              'A causality assessment is required for all serious adverse events. Regulatory authorities require the sponsor to provide an assessment of the causal relationship between the study drug and the event.',
            reference: 'ICH E2A Section III.B',
          },
        ],
      },

      {
        id: 'causality_factors',
        section: 'causality_assessment_section',
        question:
          'Evaluate the specific factors that inform the causality assessment, including temporal plausibility, pharmacological effects, dose-response relationship, biological plausibility, alternative explanations, and literature evidence.',
        fields: [
          {
            id: 'temporal_relationship_plausible',
            label: 'Temporal Relationship Plausible',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'known_pharmacological_effect',
            label: 'Known Pharmacological Effect',
            type: 'yes_no',
          },
          {
            id: 'dose_response_relationship',
            label: 'Dose-Response Relationship',
            type: 'yes_no',
          },
          {
            id: 'biological_plausibility',
            label: 'Biological Plausibility',
            type: 'textarea',
            placeholder: 'Is the event biologically plausible given the drug mechanism of action?',
          },
          {
            id: 'alternative_explanations',
            label: 'Alternative Explanations',
            type: 'textarea',
            required: true,
            placeholder: 'List alternative causes: underlying disease, concomitant medications, medical history',
          },
          {
            id: 'similar_cases_in_literature',
            label: 'Similar Cases in Literature',
            type: 'yes_no',
          },
          {
            id: 'literature_references',
            label: 'Literature References',
            type: 'textarea',
            placeholder: 'Cite relevant published case reports or safety signals',
            visibleWhen: {
              field: 'similar_cases_in_literature',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'class_effect_known',
            label: 'Class Effect Known',
            type: 'yes_no',
            helpText: 'Is this event known to be associated with this class of drugs?',
          },
        ],
        defaultNext: 'narrative_composition',
      },

      /* ================================================================ */
      /* ── Section 5: Narrative Composition ─────────────────────────── */
      /* ================================================================ */

      {
        id: 'narrative_composition',
        section: 'narrative_composition',
        question:
          'Compose the draft narrative text, selecting the appropriate format and sections to include. Ensure the narrative is a factual, chronological account written in the third person.',
        guidance:
          'Per ICH E3 Section 12.3 and CIOMS form guidance, the safety narrative should be a concise, factual, chronological account of the event. The narrative should present clinical facts without editorial interpretation of causality. Use the third person and past tense. Include all relevant sections: patient demographics, medical history, drug exposure, event description, laboratory data, treatment actions, outcome, and causality discussion.',
        fields: [
          {
            id: 'narrative_format',
            label: 'Narrative Format',
            type: 'select',
            required: true,
            options: [
              { value: 'cioms_format', label: 'CIOMS Format' },
              { value: 'csr_appendix_format', label: 'CSR Appendix Format' },
              { value: 'regulatory_authority_format', label: 'Regulatory Authority Format' },
              { value: 'company_template', label: 'Company Template' },
            ],
          },
          {
            id: 'narrative_sections_included',
            label: 'Narrative Sections Included',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'patient_demographics', label: 'Patient Demographics' },
              { value: 'medical_history', label: 'Medical History' },
              { value: 'drug_exposure', label: 'Drug Exposure' },
              { value: 'event_description', label: 'Event Description' },
              { value: 'lab_data', label: 'Laboratory Data' },
              { value: 'treatment_actions', label: 'Treatment Actions' },
              { value: 'outcome', label: 'Outcome' },
              { value: 'causality_discussion', label: 'Causality Discussion' },
            ],
          },
          {
            id: 'narrative_draft',
            label: 'Draft Narrative Text',
            type: 'textarea',
            required: true,
            placeholder: 'Enter the complete draft narrative text. The narrative should be a factual, chronological account written in the third person.',
            validation: { minLength: 200 },
          },
          {
            id: 'blinding_maintained',
            label: 'Blinding Maintained in Narrative',
            type: 'yes_no',
            helpText: 'Has the treatment blind been maintained in the narrative text?',
          },
          {
            id: 'meddra_version_used',
            label: 'MedDRA Version Used',
            type: 'text',
            required: true,
            placeholder: 'e.g., MedDRA v27.0',
          },
        ],
        defaultNext: 'narrative_finalization',
      },

      {
        id: 'narrative_finalization',
        section: 'regulatory_reporting',
        question:
          'Complete the finalization steps for the safety narrative, including medical review, quality checks, regulatory deadlines, and any outstanding follow-up items.',
        guidance:
          'Per ICH E6(R2) and 21 CFR 312.32, safety narratives must undergo medical review and quality control before submission. Expedited IND safety reports (7-day and 15-day) have strict regulatory timelines. The narrative must be consistent with the safety database entries and CIOMS/MedWatch forms. FDA expects narratives to be included in IND annual reports (21 CFR 312.33), CSR appendices (ICH E3), and NDA/BLA safety summaries (ICH M4E). Ensure all follow-up information is incorporated before finalization.',
        fields: [
          {
            id: 'medical_review_completed',
            label: 'Medical Review Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'medical_reviewer_name',
            label: 'Medical Reviewer Name',
            type: 'text',
            placeholder: 'Name and title of medical reviewer',
            visibleWhen: {
              field: 'medical_review_completed',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'quality_check_completed',
            label: 'Quality Check Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'regulatory_submission_deadline',
            label: 'Regulatory Submission Deadline',
            type: 'date',
            required: true,
          },
          {
            id: 'narrative_attachments',
            label: 'Narrative Attachments',
            type: 'multi_select',
            options: [
              { value: 'source_documents', label: 'Source Documents' },
              { value: 'lab_reports', label: 'Laboratory Reports' },
              { value: 'autopsy_report', label: 'Autopsy Report' },
              { value: 'discharge_summary', label: 'Discharge Summary' },
              { value: 'ecg_tracings', label: 'ECG Tracings' },
              { value: 'imaging_reports', label: 'Imaging Reports' },
              { value: 'none', label: 'None' },
            ],
          },
          {
            id: 'additional_follow_up_needed',
            label: 'Additional Follow-Up Needed',
            type: 'yes_no',
          },
          {
            id: 'follow_up_items',
            label: 'Follow-Up Items',
            type: 'textarea',
            visibleWhen: {
              field: 'additional_follow_up_needed',
              operator: 'eq',
              value: true,
            },
          },
        ],
        defaultNext: null,
        issueChecks: [
          {
            id: 'medical_review_missing',
            condition: { field: 'medical_review_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Medical Review Not Completed',
            message:
              'Per ICH E6(R2) Section 4.11, the sponsor\'s medical officer must review all safety reports. Individual patient safety narratives should be reviewed by a qualified physician before inclusion in the CSR or submission to regulatory authorities. Ensure medical sign-off is obtained before finalizing the narrative.',
            reference: 'ICH E6(R2) Section 4.11, ICH E3 Section 12.3',
          },
          {
            id: 'quality_check_missing',
            condition: { field: 'quality_check_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Quality Check Not Completed',
            message:
              'Safety narratives should undergo a quality control review to verify accuracy of dates, MedDRA coding, consistency between narrative text and the safety database, and completeness of required elements per CIOMS VI guidance. Discrepancies between the narrative and the safety database can trigger regulatory queries.',
            reference: 'CIOMS VI Working Group Report, ICH E2B(R3)',
          },
        ],
      },
    ],
  };
}
