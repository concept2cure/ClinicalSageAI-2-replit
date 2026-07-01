/**
 * Safety Narrative flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through collection of all data needed to write individual
 * patient safety narratives per ICH E3 §12.3.  Covers narrative type
 * identification, patient demographics and medical history, detailed event
 * description with MedDRA coding, clinical course and treatment, causality
 * assessment (including Naranjo and WHO-UMC criteria), and regulatory
 * reporting requirements (IND Safety Reports, CIOMS forms, aggregate
 * context).  Branching logic handles death, pregnancy, and AESI-specific
 * paths.  Issue checks flag missing or incomplete data that could delay
 * regulatory submissions.
 *
 * 15 nodes, 75+ fields, 6 sections, 12 issue checks.
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
      'Guided questionnaire for assembling individual patient safety narratives per ICH E3 §12.3. Covers narrative classification, patient profile, event description with MedDRA coding, clinical course, causality assessment (Naranjo, WHO-UMC), and regulatory reporting (IND Safety Reports per 21 CFR 312.32, CIOMS forms). Branching handles death, pregnancy, and AESI-specific paths.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'narrative_overview',
    estimatedMinutes: 20,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'narrative_overview',
        label: 'Narrative Overview',
        nodeIds: ['narrative_overview', 'study_identification'],
      },
      {
        id: 'patient_profile',
        label: 'Patient Profile',
        nodeIds: ['patient_demographics', 'medical_history'],
      },
      {
        id: 'event_description',
        label: 'Event Description',
        nodeIds: ['event_identification', 'event_details', 'study_drug_exposure'],
      },
      {
        id: 'clinical_course',
        label: 'Clinical Course',
        nodeIds: ['event_treatment', 'hospitalization_details', 'outcome_resolution'],
      },
      {
        id: 'causality_assessment',
        label: 'Causality Assessment',
        nodeIds: ['investigator_causality', 'sponsor_causality'],
      },
      {
        id: 'regulatory_reporting',
        label: 'Regulatory Reporting',
        nodeIds: ['expedited_reporting', 'cioms_completion', 'narrative_draft'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ══════════════════════════════════════════════════════════════════
       *  Section 1 — Narrative Overview
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'narrative_overview',
        section: 'narrative_overview',
        question:
          'What type of safety narrative is being prepared, and what are the seriousness criteria?',
        guidance:
          'Per ICH E3 Section 12.3.2, individual patient narratives are required for all deaths (regardless of causality), all SAEs assessed as drug-related, all AEs leading to study drug discontinuation, and other events of regulatory significance. Per ICH E2A Section II, seriousness criteria are defined as: death, life-threatening, hospitalization or prolongation of hospitalization, persistent or significant disability/incapacity, congenital anomaly/birth defect, or other medically important event. 21 CFR 312.32(a) provides the US regulatory definition of serious adverse event.',
        fields: [
          {
            id: 'narrative_type',
            label: 'Narrative Type',
            type: 'select',
            required: true,
            options: [
              { value: 'death', label: 'Death' },
              { value: 'sae', label: 'Serious Adverse Event (SAE)' },
              { value: 'aesi', label: 'Adverse Event of Special Interest (AESI)' },
              { value: 'ae_discontinuation', label: 'AE Leading to Discontinuation' },
              { value: 'pregnancy', label: 'Pregnancy Exposure' },
            ],
          },
          {
            id: 'event_classification',
            label: 'Event Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'serious', label: 'Serious' },
              { value: 'non_serious', label: 'Non-Serious' },
            ],
            helpText: 'Per ICH E2A, an event is serious if it meets any of the seriousness criteria below.',
          },
          {
            id: 'seriousness_criteria',
            label: 'Seriousness Criteria Met',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'death', label: 'Results in Death' },
              { value: 'life_threatening', label: 'Life-Threatening' },
              { value: 'hospitalization', label: 'Requires or Prolongs Hospitalization' },
              { value: 'disability', label: 'Persistent or Significant Disability/Incapacity' },
              { value: 'congenital_anomaly', label: 'Congenital Anomaly/Birth Defect' },
              { value: 'medically_significant', label: 'Other Medically Significant Event' },
            ],
            helpText: 'Per ICH E2A Section II and 21 CFR 312.32(a), select all applicable seriousness criteria. Multiple criteria may apply to a single event.',
          },
          {
            id: 'initial_or_followup',
            label: 'Report Type',
            type: 'select',
            required: true,
            options: [
              { value: 'initial', label: 'Initial Report' },
              { value: 'followup', label: 'Follow-Up Report' },
              { value: 'final', label: 'Final Report' },
            ],
          },
          {
            id: 'date_sponsor_aware',
            label: 'Date Sponsor First Became Aware',
            type: 'date',
            required: true,
            helpText: 'Per 21 CFR 312.32(c)(1), the clock for expedited reporting begins on the date the sponsor first learns of the event.',
          },
        ],
        defaultNext: 'study_identification',
        issueChecks: [
          {
            id: 'death_narrative_required',
            condition: {
              field: 'narrative_type',
              operator: 'eq',
              value: 'death',
            },
            severity: 'critical',
            title: 'Death Narrative — Complete Documentation Required',
            message:
              'Per ICH E3 Section 12.3.2, ALL deaths must be individually narrativized regardless of the investigator\'s causality assessment. The narrative must include complete demographics, medical history, study drug exposure, a detailed timeline of the terminal event, interventions, autopsy findings (if available), and both investigator and sponsor causality assessments. Per 21 CFR 312.32(c)(1)(i), fatal and life-threatening suspected adverse reactions require IND Safety Report submission within 7 calendar days of sponsor awareness.',
            reference: 'ICH E3 Section 12.3.2; 21 CFR 312.32(c)(1)(i)',
          },
        ],
      },

      {
        id: 'study_identification',
        section: 'narrative_overview',
        question:
          'Identify the study, site, and subject for this narrative.',
        guidance:
          'Per ICH E3 Section 14.3, each narrative must clearly identify the protocol number, study site, and subject. The subject identifier should be the unique randomization or screening number assigned per the protocol. Per ICH E2B(R3) Section 2.12, the study registration number (e.g., NCT number) should also be documented to enable cross-referencing with ClinicalTrials.gov. CIOMS-I form Item 1 requires the same identification data.',
        fields: [
          {
            id: 'protocol_number',
            label: 'Protocol Number',
            type: 'text',
            placeholder: 'e.g., ABC-2025-001',
            required: true,
          },
          {
            id: 'study_title',
            label: 'Study Title (Abbreviated)',
            type: 'text',
            placeholder: 'e.g., Phase 3 Study of Drug X in Advanced NSCLC',
            required: true,
            validation: { minLength: 10, maxLength: 300 },
          },
          {
            id: 'clinical_trial_registration',
            label: 'Clinical Trial Registration Number',
            type: 'text',
            placeholder: 'e.g., NCT04123456',
            helpText: 'Per ICH E2B(R3), the study registration number aids cross-referencing.',
          },
          {
            id: 'site_number',
            label: 'Site Number',
            type: 'text',
            placeholder: 'e.g., Site 101',
            required: true,
          },
          {
            id: 'site_country',
            label: 'Site Country',
            type: 'country_select',
            required: true,
            helpText: 'Relevant for determining applicable regulatory reporting requirements (e.g., EMA, FDA, PMDA).',
          },
          {
            id: 'subject_id',
            label: 'Subject Identifier',
            type: 'text',
            placeholder: 'e.g., 101-001',
            required: true,
            helpText: 'Use the unique subject number assigned per the protocol. Do not include patient names per ICH E2B(R3) privacy requirements.',
          },
          {
            id: 'treatment_arm',
            label: 'Treatment Arm',
            type: 'text',
            placeholder: 'e.g., Drug X 200 mg QD',
            required: true,
          },
          {
            id: 'blinded_at_time_of_event',
            label: 'Was the Study Blinded at Time of Event?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH E2A Section IV, unblinding for expedited reporting should follow the sponsor\'s pre-defined procedures.',
          },
        ],
        defaultNext: 'patient_demographics',
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 2 — Patient Profile
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'patient_demographics',
        section: 'patient_profile',
        question:
          'Provide the patient\'s demographic information and baseline characteristics.',
        guidance:
          'Per ICH E3 Section 14.3 and ICH E2B(R3) Section 2.1, each narrative must document the patient\'s age, sex, race/ethnicity, weight, and height. These data are essential for contextualizing the event, assessing dose-weight relationships, and enabling pharmacovigilance signal detection across demographic subgroups. Per CIOMS-I form requirements, age (not date of birth) should be reported for privacy.',
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
            id: 'race',
            label: 'Race',
            type: 'select',
            required: true,
            options: [
              { value: 'white', label: 'White' },
              { value: 'black', label: 'Black or African American' },
              { value: 'asian', label: 'Asian' },
              { value: 'native_american', label: 'American Indian or Alaska Native' },
              { value: 'pacific_islander', label: 'Native Hawaiian or Other Pacific Islander' },
              { value: 'multiracial', label: 'Multiracial' },
              { value: 'other', label: 'Other' },
              { value: 'not_reported', label: 'Not Reported' },
            ],
            helpText: 'Per FDA Guidance "Collection of Race and Ethnicity Data in Clinical Trials" (2005, updated 2016), use OMB categories.',
          },
          {
            id: 'ethnicity',
            label: 'Ethnicity',
            type: 'select',
            options: [
              { value: 'hispanic_latino', label: 'Hispanic or Latino' },
              { value: 'not_hispanic_latino', label: 'Not Hispanic or Latino' },
              { value: 'not_reported', label: 'Not Reported' },
            ],
          },
          {
            id: 'weight_kg',
            label: 'Weight (kg)',
            type: 'number',
            validation: { min: 1, max: 500 },
          },
          {
            id: 'height_cm',
            label: 'Height (cm)',
            type: 'number',
            validation: { min: 20, max: 300 },
          },
          {
            id: 'baseline_disease_status',
            label: 'Baseline Disease Status',
            type: 'textarea',
            placeholder: 'e.g., Stage IIIB NSCLC, ECOG PS 1, EGFR exon 19 deletion positive',
            required: true,
            helpText: 'Describe the baseline disease status and key prognostic factors at study entry.',
            validation: { minLength: 20, maxLength: 2000 },
          },
          {
            id: 'baseline_lab_values',
            label: 'Relevant Baseline Laboratory Values',
            type: 'textarea',
            placeholder: 'e.g., ALT 22 U/L, AST 18 U/L, Creatinine 0.9 mg/dL, ANC 4.2 x 10^9/L',
            helpText: 'Include lab values relevant to the adverse event (e.g., liver function tests for hepatotoxicity, renal function for nephrotoxicity).',
          },
        ],
        defaultNext: 'medical_history',
      },

      {
        id: 'medical_history',
        section: 'patient_profile',
        question:
          'Document the patient\'s relevant medical history and concomitant medications.',
        guidance:
          'Per ICH E3 Section 14.3 and ICH E2B(R3) Section 2.8, the narrative must include relevant medical history, comorbidities, and concomitant medications. Medical history is critical for assessing whether the event is attributable to the study drug, an underlying condition, or a concomitant medication. Per WHO-UMC causality criteria, the availability of alternative explanations directly impacts the causality assessment. Medications should be documented with dose, route, indication, and start/stop dates.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'relevant_medical_history',
            label: 'Relevant Medical History',
            type: 'textarea',
            placeholder: 'e.g., Hypertension (diagnosed 2018), Type 2 diabetes (diagnosed 2020), prior appendectomy (2015)',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
            helpText: 'Include conditions relevant to the adverse event, risk factors, and prior episodes of similar events.',
          },
          {
            id: 'comorbidities',
            label: 'Active Comorbidities at Time of Event',
            type: 'textarea',
            placeholder: 'e.g., Controlled hypertension, chronic kidney disease stage 2, obesity (BMI 32)',
            helpText: 'Per ICH E2B(R3) Section 2.8.1, document active medical conditions at the time of the event.',
          },
          {
            id: 'allergies',
            label: 'Known Allergies',
            type: 'textarea',
            placeholder: 'e.g., Penicillin (rash), sulfonamides (anaphylaxis), NKDA',
          },
          {
            id: 'concomitant_medications',
            label: 'Concomitant Medications',
            type: 'textarea',
            placeholder: 'Drug name | Dose | Route | Indication | Start date | Stop date\ne.g., Metformin | 1000 mg BID | PO | Type 2 DM | 01-Mar-2020 | Ongoing',
            required: true,
            validation: { minLength: 5, maxLength: 5000 },
            helpText: 'Per ICH E2B(R3) Section 2.9, document all concomitant medications with dose, route, indication, and start/stop dates. Include OTC medications and herbal supplements.',
          },
          {
            id: 'prior_study_drug_exposure',
            label: 'Prior Exposure to Same or Similar Drug Class',
            type: 'textarea',
            placeholder: 'e.g., Prior treatment with similar TKI (Drug Y) 2019-2020, discontinued due to rash',
            helpText: 'Previous exposure to the same drug class may inform the causality assessment.',
          },
        ],
        defaultNext: 'event_identification',
        issueChecks: [
          {
            id: 'missing_concomitant_meds',
            condition: {
              field: 'concomitant_medications',
              operator: 'eq',
              value: '',
            },
            severity: 'warning',
            title: 'No Concomitant Medication Documentation',
            message:
              'Concomitant medications have not been documented. Per ICH E2B(R3) Section 2.9 and CIOMS-I form requirements, all concomitant medications (including OTC and herbal) must be recorded to enable proper causality assessment. Missing medication data is a common deficiency identified by FDA during review of IND Safety Reports.',
            reference: 'ICH E2B(R3) Section 2.9; CIOMS-I Form Requirements',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 3 — Event Description
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'event_identification',
        section: 'event_description',
        question:
          'Identify the adverse event using standardized terminology and classification.',
        guidance:
          'Per ICH E2B(R3) Section 2.13 and ICH E3 Section 12.1, adverse events must be coded using the Medical Dictionary for Regulatory Activities (MedDRA). The Preferred Term (PT) and System Organ Class (SOC) are mandatory. Per ICH M1 (MedDRA), use the Lowest Level Term (LLT) for the verbatim term and the PT for the standardized coding. For oncology trials, severity should be graded using CTCAE v5.0 per NCI Common Terminology Criteria.',
        fields: [
          {
            id: 'event_verbatim_term',
            label: 'Verbatim Event Term (as reported by investigator)',
            type: 'text',
            placeholder: 'e.g., Severe chest pain with shortness of breath',
            required: true,
          },
          {
            id: 'meddra_preferred_term',
            label: 'MedDRA Preferred Term (PT)',
            type: 'text',
            placeholder: 'e.g., Acute myocardial infarction',
            required: true,
            helpText: 'Per ICH M1 (MedDRA), the PT is the standardized term used for regulatory reporting.',
          },
          {
            id: 'meddra_soc',
            label: 'MedDRA System Organ Class (SOC)',
            type: 'text',
            placeholder: 'e.g., Cardiac disorders',
            required: true,
            helpText: 'The primary SOC to which the PT is assigned per MedDRA hierarchy.',
          },
          {
            id: 'meddra_llt',
            label: 'MedDRA Lowest Level Term (LLT)',
            type: 'text',
            placeholder: 'e.g., Chest pain severe with dyspnea',
            helpText: 'The LLT closest to the verbatim term reported by the investigator.',
          },
          {
            id: 'meddra_version',
            label: 'MedDRA Version',
            type: 'text',
            placeholder: 'e.g., MedDRA v26.1',
            required: true,
          },
          {
            id: 'severity_grade',
            label: 'Severity Grade',
            type: 'select',
            required: true,
            options: [
              { value: 'grade_1', label: 'Grade 1 — Mild' },
              { value: 'grade_2', label: 'Grade 2 — Moderate' },
              { value: 'grade_3', label: 'Grade 3 — Severe' },
              { value: 'grade_4', label: 'Grade 4 — Life-Threatening' },
              { value: 'grade_5', label: 'Grade 5 — Death' },
            ],
            helpText: 'Per NCI CTCAE v5.0. For non-oncology studies, use the severity scale defined in the protocol.',
          },
          {
            id: 'severity_grading_scale',
            label: 'Grading Scale Used',
            type: 'select',
            required: true,
            options: [
              { value: 'ctcae_v5', label: 'CTCAE v5.0' },
              { value: 'ctcae_v4', label: 'CTCAE v4.03' },
              { value: 'protocol_specific', label: 'Protocol-Specific Scale' },
              { value: 'mild_moderate_severe', label: 'Mild/Moderate/Severe (ICH E2A)' },
            ],
          },
        ],
        defaultNext: 'event_details',
        issueChecks: [
          {
            id: 'missing_meddra_coding',
            condition: {
              field: 'meddra_preferred_term',
              operator: 'eq',
              value: '',
            },
            severity: 'warning',
            title: 'Missing MedDRA Coding',
            message:
              'The adverse event has not been coded using MedDRA terminology. Per ICH E2B(R3) Section 2.13 and ICH E3 Section 12.1, all adverse events must be coded using MedDRA Preferred Terms. Uncoded events cannot be properly aggregated for signal detection and may delay regulatory submissions.',
            reference: 'ICH E2B(R3) Section 2.13; ICH M1 (MedDRA)',
          },
          {
            id: 'missing_soc_coding',
            condition: {
              field: 'meddra_soc',
              operator: 'eq',
              value: '',
            },
            severity: 'warning',
            title: 'Missing MedDRA System Organ Class',
            message:
              'The MedDRA System Organ Class (SOC) has not been provided. Per ICH E2B(R3) Section 2.13 and ICH E3 Section 12.1, adverse events must be classified by SOC for proper tabulation in the CSR safety tables. SOC classification is also required for aggregate signal detection in periodic safety reports per ICH E2C(R2).',
            reference: 'ICH E2B(R3) Section 2.13; ICH E2C(R2)',
          },
        ],
      },

      {
        id: 'event_details',
        section: 'event_description',
        question:
          'Provide the detailed clinical description and temporal relationship of the event.',
        guidance:
          'Per ICH E3 Section 14.3, the narrative must include a detailed clinical description of the event, the date of onset, duration, and temporal relationship to study drug administration. The temporal relationship is one of the key criteria in both the Naranjo algorithm and WHO-UMC causality assessment system. Per ICH E2A Section III, document whether the event occurred during treatment, during a dose escalation, or during follow-up.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'event_onset_date',
            label: 'Event Onset Date',
            type: 'date',
            required: true,
          },
          {
            id: 'event_duration_days',
            label: 'Event Duration (days)',
            type: 'number',
            validation: { min: 0 },
            helpText: 'From onset to resolution or last assessment. Enter 0 if event is ongoing.',
          },
          {
            id: 'study_day_of_onset',
            label: 'Study Day at Onset',
            type: 'number',
            validation: { min: 1 },
            helpText: 'Day relative to first dose of study drug (Day 1 = first dose).',
          },
          {
            id: 'detailed_description',
            label: 'Detailed Clinical Description',
            type: 'textarea',
            placeholder: 'Provide a chronological narrative of the event including presenting symptoms, signs, diagnostic workup, findings, and clinical course.',
            required: true,
            validation: { minLength: 50, maxLength: 10000 },
            helpText: 'Per ICH E3 Section 14.3, the narrative should be written in a clear chronological format, presenting the clinical facts without editorial interpretation of causality.',
          },
          {
            id: 'temporal_relationship',
            label: 'Temporal Relationship to Study Drug',
            type: 'select',
            required: true,
            options: [
              { value: 'during_treatment', label: 'During Active Treatment' },
              { value: 'dose_escalation', label: 'During Dose Escalation' },
              { value: 'within_5_halflives', label: 'Within 5 Half-Lives After Last Dose' },
              { value: 'followup_period', label: 'During Post-Treatment Follow-Up' },
              { value: 'before_first_dose', label: 'Before First Dose (screening)' },
            ],
            helpText: 'The temporal relationship is a key criterion in the Naranjo algorithm (Question 1) and WHO-UMC system.',
          },
          {
            id: 'time_from_last_dose',
            label: 'Time from Last Dose to Event Onset',
            type: 'text',
            placeholder: 'e.g., 3 hours, 2 days, 1 week',
            helpText: 'Document the interval between the last dose and event onset. Critical for assessing temporal plausibility.',
          },
        ],
        branches: [
          {
            when: { field: 'narrative_type', operator: 'eq', value: 'death' },
            goto: 'study_drug_exposure',
          },
          {
            when: { field: 'narrative_type', operator: 'eq', value: 'pregnancy' },
            goto: 'study_drug_exposure',
          },
          {
            when: { field: 'narrative_type', operator: 'eq', value: 'aesi' },
            goto: 'study_drug_exposure',
          },
        ],
        defaultNext: 'study_drug_exposure',
      },

      {
        id: 'study_drug_exposure',
        section: 'event_description',
        question:
          'Document the study drug exposure details and action taken.',
        guidance:
          'Per ICH E3 Section 14.3 and ICH E2B(R3) Section 2.12, the narrative must document the dose of study drug at the time of the event, cumulative exposure, the date of the last dose, and the action taken with the study drug. Per ICH E2A Section III.B, the action taken with study drug (dose reduced, interrupted, discontinued, not changed) is essential for interpreting the clinical significance and for dechallenge/rechallenge assessment.',
        fields: [
          {
            id: 'dose_at_event',
            label: 'Dose at Time of Event',
            type: 'text',
            placeholder: 'e.g., 200 mg once daily',
            required: true,
          },
          {
            id: 'cumulative_dose',
            label: 'Cumulative Dose Received',
            type: 'text',
            placeholder: 'e.g., 5600 mg total (28 days x 200 mg)',
            helpText: 'Total cumulative dose from first dose to event onset.',
          },
          {
            id: 'first_dose_date',
            label: 'Date of First Dose',
            type: 'date',
            required: true,
          },
          {
            id: 'last_dose_date',
            label: 'Date of Last Dose Before Event',
            type: 'date',
            required: true,
          },
          {
            id: 'action_taken',
            label: 'Action Taken with Study Drug',
            type: 'select',
            required: true,
            options: [
              { value: 'dose_not_changed', label: 'Dose Not Changed' },
              { value: 'dose_reduced', label: 'Dose Reduced' },
              { value: 'drug_interrupted', label: 'Drug Interrupted (temporary hold)' },
              { value: 'drug_discontinued', label: 'Drug Permanently Discontinued' },
              { value: 'not_applicable', label: 'Not Applicable (event before first dose)' },
              { value: 'unknown', label: 'Unknown' },
            ],
            helpText: 'Per ICH E2A Section III.B, the action taken with study drug informs the dechallenge assessment.',
          },
          {
            id: 'dose_reduction_details',
            label: 'Dose Reduction Details',
            type: 'textarea',
            placeholder: 'e.g., Dose reduced from 200 mg to 150 mg QD on Study Day 15',
            visibleWhen: {
              field: 'action_taken',
              operator: 'eq',
              value: 'dose_reduced',
            },
          },
          {
            id: 'interruption_dates',
            label: 'Drug Interruption Dates',
            type: 'text',
            placeholder: 'e.g., Held from Day 14 to Day 21',
            visibleWhen: {
              field: 'action_taken',
              operator: 'in',
              value: ['drug_interrupted', 'dose_reduced'],
            },
          },
        ],
        branches: [
          {
            when: { field: 'narrative_type', operator: 'eq', value: 'death' },
            goto: 'event_treatment',
          },
          {
            when: { field: 'narrative_type', operator: 'eq', value: 'pregnancy' },
            goto: 'event_treatment',
          },
          {
            when: { field: 'narrative_type', operator: 'eq', value: 'aesi' },
            goto: 'event_treatment',
          },
        ],
        defaultNext: 'event_treatment',
        issueChecks: [
          {
            id: 'action_taken_unknown',
            condition: {
              field: 'action_taken',
              operator: 'eq',
              value: 'unknown',
            },
            severity: 'warning',
            title: 'Action Taken with Study Drug Unknown',
            message:
              'The action taken with the study drug is documented as unknown. Per ICH E2B(R3) Section 2.12.5 and CIOMS-I form requirements, the action taken (dose reduced, interrupted, discontinued, or not changed) must be recorded for every SAE. This information is critical for dechallenge assessment and for regulatory reviewers evaluating drug-event causality.',
            reference: 'ICH E2B(R3) Section 2.12.5; CIOMS-I Form',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 4 — Clinical Course
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'event_treatment',
        section: 'clinical_course',
        question:
          'What treatments and interventions were administered for the adverse event?',
        guidance:
          'Per ICH E3 Section 14.3, the narrative must document all treatments administered for the adverse event, including medications (with dose, route, and duration), procedures, and supportive care. Per ICH E2B(R3) Section 2.10, treatment of the reaction should be documented with start/stop dates. This information is essential for understanding the clinical course and may support or refute causality (e.g., response to specific antidote suggests drug-related etiology).',
        fields: [
          {
            id: 'medications_for_event',
            label: 'Medications Used to Treat the Event',
            type: 'textarea',
            placeholder: 'Drug name | Dose | Route | Start date | Stop date\ne.g., Epinephrine | 0.3 mg | IM | 15-Jan-2025 | 15-Jan-2025',
            helpText: 'Per ICH E2B(R3) Section 2.10, document all medications used to treat the adverse event.',
          },
          {
            id: 'procedures_performed',
            label: 'Procedures Performed',
            type: 'textarea',
            placeholder: 'e.g., Chest CT performed on Day 15, bronchoscopy with BAL on Day 16, percutaneous coronary intervention on Day 17',
          },
          {
            id: 'supportive_care',
            label: 'Supportive Care Provided',
            type: 'textarea',
            placeholder: 'e.g., IV fluids, supplemental oxygen via nasal cannula, continuous cardiac monitoring',
          },
          {
            id: 'icu_admission',
            label: 'Was ICU Admission Required?',
            type: 'yes_no',
          },
          {
            id: 'icu_duration_days',
            label: 'ICU Duration (days)',
            type: 'number',
            validation: { min: 1 },
            visibleWhen: {
              field: 'icu_admission',
              operator: 'eq',
              value: true,
            },
          },
        ],
        defaultNext: 'hospitalization_details',
      },

      {
        id: 'hospitalization_details',
        section: 'clinical_course',
        question:
          'Provide hospitalization and clinical course timeline details.',
        guidance:
          'Per ICH E2A Section II, hospitalization (or prolongation of existing hospitalization) is one of the seriousness criteria for SAEs. Per ICH E3 Section 14.3, the narrative should include admission and discharge dates, key findings during hospitalization, and the clinical course timeline. The timeline should present a clear day-by-day or milestone-based progression to enable the reviewer to understand the evolution of the event.',
        fields: [
          {
            id: 'hospitalized',
            label: 'Was the Patient Hospitalized for This Event?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'admission_date',
            label: 'Hospital Admission Date',
            type: 'date',
            visibleWhen: {
              field: 'hospitalized',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'discharge_date',
            label: 'Hospital Discharge Date',
            type: 'date',
            visibleWhen: {
              field: 'hospitalized',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'hospitalization_duration_days',
            label: 'Hospitalization Duration (days)',
            type: 'number',
            validation: { min: 1 },
            visibleWhen: {
              field: 'hospitalized',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'clinical_course_timeline',
            label: 'Clinical Course Timeline',
            type: 'textarea',
            placeholder: 'Day 1: Presented with fever 39.2C and rigors...\nDay 2: Blood cultures positive for...\nDay 3: Started on IV antibiotics...\nDay 7: Afebrile, clinically improved...',
            required: true,
            validation: { minLength: 30, maxLength: 10000 },
            helpText: 'Per ICH E3 Section 14.3, provide a chronological timeline of the clinical course from event onset to outcome.',
          },
          {
            id: 'dechallenge_info',
            label: 'Dechallenge Information',
            type: 'select',
            required: true,
            options: [
              { value: 'positive', label: 'Positive Dechallenge (event improved/resolved after drug stopped)' },
              { value: 'negative', label: 'Negative Dechallenge (event persisted after drug stopped)' },
              { value: 'not_applicable', label: 'Not Applicable (drug not stopped)' },
              { value: 'unknown', label: 'Unknown' },
            ],
            helpText: 'Per Naranjo algorithm Question 3 and WHO-UMC criteria, positive dechallenge supports a causal relationship.',
          },
          {
            id: 'rechallenge_info',
            label: 'Rechallenge Information',
            type: 'select',
            options: [
              { value: 'positive', label: 'Positive Rechallenge (event recurred on re-exposure)' },
              { value: 'negative', label: 'Negative Rechallenge (event did not recur on re-exposure)' },
              { value: 'not_done', label: 'Rechallenge Not Done' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
            helpText: 'Per Naranjo algorithm Question 4, positive rechallenge is strong evidence of causal relationship. However, rechallenge may be unethical for serious events.',
          },
        ],
        branches: [
          {
            when: { field: 'narrative_type', operator: 'eq', value: 'death' },
            goto: 'outcome_resolution',
          },
          {
            when: { field: 'narrative_type', operator: 'eq', value: 'pregnancy' },
            goto: 'outcome_resolution',
          },
        ],
        defaultNext: 'outcome_resolution',
        issueChecks: [
          {
            id: 'no_dechallenge_info',
            condition: {
              field: 'dechallenge_info',
              operator: 'eq',
              value: 'unknown',
            },
            severity: 'info',
            title: 'Dechallenge Information Not Available',
            message:
              'Dechallenge information is unknown. Per the Naranjo algorithm (Question 3) and WHO-UMC causality criteria, dechallenge data (whether the event improved or resolved after the study drug was stopped) is an important factor in causality assessment. Efforts should be made to obtain this information from the investigator site if possible.',
            reference: 'Naranjo Algorithm; WHO-UMC Causality Assessment System',
          },
        ],
      },

      {
        id: 'outcome_resolution',
        section: 'clinical_course',
        question:
          'What was the outcome of the adverse event?',
        guidance:
          'Per ICH E2B(R3) Section 2.13.6 and ICH E3 Section 14.3, the outcome must be documented using standardized categories: recovered/resolved, recovering/resolving, not recovered/not resolved, recovered with sequelae, fatal, or unknown. Per CIOMS-I form Item 13, the outcome at the time of last observation must be recorded. For death cases, autopsy findings and cause of death must be documented. For pregnancy cases, document the pregnancy outcome.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'outcome',
            label: 'Event Outcome',
            type: 'select',
            required: true,
            options: [
              { value: 'resolved', label: 'Recovered/Resolved' },
              { value: 'resolving', label: 'Recovering/Resolving' },
              { value: 'not_resolved', label: 'Not Recovered/Not Resolved' },
              { value: 'resolved_with_sequelae', label: 'Recovered with Sequelae' },
              { value: 'fatal', label: 'Fatal' },
              { value: 'unknown', label: 'Unknown' },
            ],
            helpText: 'Per ICH E2B(R3) Section 2.13.6 and CIOMS-I form, select the outcome at the time of the most recent assessment.',
          },
          {
            id: 'resolution_date',
            label: 'Resolution Date',
            type: 'date',
            visibleWhen: {
              field: 'outcome',
              operator: 'in',
              value: ['resolved', 'resolved_with_sequelae'],
            },
          },
          {
            id: 'sequelae_description',
            label: 'Description of Sequelae',
            type: 'textarea',
            placeholder: 'e.g., Residual peripheral neuropathy Grade 1 at last follow-up',
            visibleWhen: {
              field: 'outcome',
              operator: 'eq',
              value: 'resolved_with_sequelae',
            },
          },
          {
            id: 'cause_of_death',
            label: 'Cause of Death',
            type: 'textarea',
            placeholder: 'e.g., Acute myocardial infarction per death certificate',
            visibleWhen: {
              field: 'outcome',
              operator: 'eq',
              value: 'fatal',
            },
            helpText: 'Per ICH E3 Section 12.3.2, document the primary and contributing causes of death as listed on the death certificate.',
          },
          {
            id: 'autopsy_performed',
            label: 'Was an Autopsy Performed?',
            type: 'yes_no',
            visibleWhen: {
              field: 'outcome',
              operator: 'eq',
              value: 'fatal',
            },
          },
          {
            id: 'autopsy_findings',
            label: 'Autopsy Findings',
            type: 'textarea',
            placeholder: 'Summarize key autopsy findings relevant to the cause of death and potential drug relationship.',
            visibleWhen: {
              field: 'autopsy_performed',
              operator: 'eq',
              value: true,
            },
            helpText: 'Per ICH E3 Section 12.3.2, autopsy findings should be documented when available, as they may clarify the cause of death and drug relationship.',
          },
          {
            id: 'contributing_factors_death',
            label: 'Contributing Factors to Death',
            type: 'textarea',
            placeholder: 'e.g., Progressive disease, comorbid heart failure, hospital-acquired pneumonia',
            visibleWhen: {
              field: 'outcome',
              operator: 'eq',
              value: 'fatal',
            },
          },
          {
            id: 'pregnancy_outcome',
            label: 'Pregnancy Outcome',
            type: 'select',
            visibleWhen: {
              field: 'narrative_type',
              operator: 'eq',
              value: 'pregnancy',
            },
            options: [
              { value: 'live_birth_normal', label: 'Live Birth — Normal' },
              { value: 'live_birth_abnormal', label: 'Live Birth — Congenital Anomaly' },
              { value: 'spontaneous_abortion', label: 'Spontaneous Abortion' },
              { value: 'elective_termination', label: 'Elective Termination' },
              { value: 'stillbirth', label: 'Stillbirth' },
              { value: 'ectopic', label: 'Ectopic Pregnancy' },
              { value: 'ongoing', label: 'Pregnancy Ongoing' },
              { value: 'unknown', label: 'Unknown' },
            ],
            helpText: 'Per FDA Guidance "Pregnant Women: Scientific and Ethical Considerations for Inclusion in Clinical Trials" (2018) and ICH E2B(R3), pregnancy outcomes must be followed to completion.',
          },
          {
            id: 'pregnancy_followup_plan',
            label: 'Pregnancy Follow-Up Plan',
            type: 'textarea',
            placeholder: 'e.g., Follow-up planned at delivery and at 12 months of age for infant assessment',
            visibleWhen: {
              field: 'narrative_type',
              operator: 'eq',
              value: 'pregnancy',
            },
            helpText: 'Per ICH E2B(R3) and most protocols, pregnancy outcomes must be tracked to completion with infant follow-up.',
          },
          {
            id: 'aesi_criteria_met',
            label: 'AESI Pre-Defined Criteria Met',
            type: 'textarea',
            placeholder: 'Describe which pre-defined AESI criteria were met and the supporting evidence',
            visibleWhen: {
              field: 'narrative_type',
              operator: 'eq',
              value: 'aesi',
            },
            helpText: 'Per the protocol-defined AESI criteria, document which specific criteria were satisfied and the evidence supporting classification as an AESI.',
          },
        ],
        defaultNext: 'investigator_causality',
        issueChecks: [
          {
            id: 'missing_outcome',
            condition: {
              field: 'outcome',
              operator: 'eq',
              value: 'unknown',
            },
            severity: 'warning',
            title: 'Event Outcome Unknown',
            message:
              'The outcome of the adverse event is unknown. Per ICH E2B(R3) Section 2.13.6 and CIOMS-I form requirements, every effort should be made to obtain the final outcome. Regulatory authorities may request follow-up information. Consider issuing a follow-up query to the investigator site.',
            reference: 'ICH E2B(R3) Section 2.13.6; CIOMS-I Form',
          },
          {
            id: 'pregnancy_no_followup',
            condition: {
              field: 'pregnancy_followup_plan',
              operator: 'eq',
              value: '',
            },
            severity: 'critical',
            title: 'Pregnancy Case Without Follow-Up Plan',
            message:
              'A pregnancy exposure has been reported without a documented follow-up plan. Per ICH E2B(R3) and FDA Guidance "Pregnant Women: Scientific and Ethical Considerations for Inclusion in Clinical Trials" (2018), all pregnancy cases must be followed to outcome (delivery or termination) and infants should be assessed for congenital anomalies. Missing pregnancy follow-up is a common FDA inspection finding and may result in a Form FDA 483 observation.',
            reference: 'ICH E2B(R3); FDA Guidance: Pregnant Women in Clinical Trials (2018)',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 5 — Causality Assessment
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'investigator_causality',
        section: 'causality_assessment',
        question:
          'What is the investigator\'s causality assessment, and what reasoning supports it?',
        guidance:
          'Per ICH E2A Section III.C and 21 CFR 312.32, the investigator\'s causality assessment is a critical component of the safety narrative. The investigator must assess whether there is a "reasonable possibility" that the drug caused the event (per FDA\'s definition in 21 CFR 312.32(a)). Per ICH E2B(R3) Section 2.13.8, the categories are: related, possibly related, unlikely related, or not related. The Naranjo algorithm provides a standardized scoring system (definite ≥9, probable 5-8, possible 1-4, doubtful ≤0). The WHO-UMC system uses: certain, probable/likely, possible, unlikely, conditional/unclassified, unassessable/unclassifiable.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'investigator_assessment',
            label: 'Investigator Causality Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'related', label: 'Related' },
              { value: 'possibly_related', label: 'Possibly Related' },
              { value: 'unlikely_related', label: 'Unlikely Related' },
              { value: 'not_related', label: 'Not Related' },
            ],
            helpText: 'Per ICH E2A Section III.C, the investigator must assess whether there is a reasonable possibility that the drug caused the event.',
          },
          {
            id: 'investigator_reasoning',
            label: 'Investigator\'s Causality Reasoning',
            type: 'textarea',
            placeholder: 'Describe the investigator\'s rationale for the causality assessment, including temporal relationship, biologic plausibility, dechallenge/rechallenge results, and alternative explanations considered.',
            required: true,
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'temporal_relationship_assessment',
            label: 'Temporal Relationship',
            type: 'select',
            required: true,
            options: [
              { value: 'compatible', label: 'Compatible (reasonable time to onset)' },
              { value: 'incompatible', label: 'Incompatible (onset before exposure or too remote)' },
              { value: 'uncertain', label: 'Uncertain' },
            ],
            helpText: 'Naranjo Question 1: Did the adverse event appear after the suspected drug was administered?',
          },
          {
            id: 'biologic_plausibility',
            label: 'Biologic Plausibility',
            type: 'select',
            required: true,
            options: [
              { value: 'plausible', label: 'Plausible (known mechanism or pharmacology)' },
              { value: 'possible', label: 'Possible (theoretical mechanism)' },
              { value: 'not_plausible', label: 'Not Biologically Plausible' },
              { value: 'unknown', label: 'Unknown' },
            ],
            helpText: 'Is there a known pharmacological mechanism by which the drug could cause this event?',
          },
          {
            id: 'known_class_effect',
            label: 'Known Drug Class Effect?',
            type: 'yes_no',
            helpText: 'Is this event a known effect of the pharmacological class? Per Naranjo Question 2 and WHO-UMC criteria.',
          },
          {
            id: 'alternative_explanations',
            label: 'Alternative Explanations Considered',
            type: 'textarea',
            placeholder: 'e.g., Underlying disease progression, concomitant medication effect, pre-existing condition, intercurrent illness',
            required: true,
            helpText: 'Per Naranjo Question 5 and WHO-UMC criteria, document whether the event could be attributed to alternative causes.',
          },
          {
            id: 'naranjo_score',
            label: 'Naranjo Algorithm Score',
            type: 'number',
            validation: { min: -4, max: 13 },
            helpText: 'Definite ≥9; Probable 5-8; Possible 1-4; Doubtful ≤0. Score based on 10 questions assessing temporal relationship, pattern recognition, dechallenge, rechallenge, alternative causes, placebo response, drug levels, dose-response, prior experience, and objective evidence.',
          },
        ],
        defaultNext: 'sponsor_causality',
        issueChecks: [
          {
            id: 'missing_causality_assessment',
            condition: {
              field: 'investigator_assessment',
              operator: 'eq',
              value: '',
            },
            severity: 'critical',
            title: 'Missing Investigator Causality Assessment',
            message:
              'The investigator\'s causality assessment has not been provided. Per ICH E2A Section III.C and 21 CFR 312.32, the investigator\'s assessment of reasonable possibility of causal relationship is mandatory for all SAEs and is the trigger for determining whether an event meets the definition of a suspected adverse reaction requiring expedited reporting. The narrative cannot be finalized without this assessment.',
            reference: 'ICH E2A Section III.C; 21 CFR 312.32(a)',
          },
        ],
      },

      {
        id: 'sponsor_causality',
        section: 'causality_assessment',
        question:
          'Provide the sponsor\'s causality assessment and the WHO-UMC classification.',
        guidance:
          'Per 21 CFR 312.32(a), the sponsor must make an independent assessment of whether there is a "reasonable possibility" that the drug caused the event. The sponsor\'s assessment may differ from the investigator\'s. Per FDA Guidance "Safety Reporting Requirements for INDs and BA/BE Studies" (2012), the sponsor should consider the totality of evidence, including the investigator\'s assessment, drug mechanism of action, preclinical data, and experience across the development program. The WHO-UMC system provides a standardized framework accepted globally by regulatory authorities.',
        fields: [
          {
            id: 'sponsor_assessment',
            label: 'Sponsor Causality Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'related', label: 'Related' },
              { value: 'possibly_related', label: 'Possibly Related' },
              { value: 'unlikely_related', label: 'Unlikely Related' },
              { value: 'not_related', label: 'Not Related' },
            ],
            helpText: 'Per 21 CFR 312.32, the sponsor must independently assess causality. The sponsor\'s assessment determines expedited reporting obligations.',
          },
          {
            id: 'sponsor_reasoning',
            label: 'Sponsor\'s Causality Reasoning',
            type: 'textarea',
            placeholder: 'Describe the sponsor\'s rationale, including any differences from the investigator\'s assessment and program-level data considered.',
            required: true,
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'who_umc_classification',
            label: 'WHO-UMC Causality Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'certain', label: 'Certain' },
              { value: 'probable_likely', label: 'Probable/Likely' },
              { value: 'possible', label: 'Possible' },
              { value: 'unlikely', label: 'Unlikely' },
              { value: 'conditional_unclassified', label: 'Conditional/Unclassified' },
              { value: 'unassessable', label: 'Unassessable/Unclassifiable' },
            ],
            helpText: 'The WHO-UMC system is the internationally accepted causality assessment framework. Per WHO-UMC, "Certain" requires: plausible time relationship, no alternative explanation, positive dechallenge, and definitive pharmacological/phenomenological evidence.',
          },
          {
            id: 'causality_differs_from_investigator',
            label: 'Does Sponsor Assessment Differ from Investigator?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'discrepancy_justification',
            label: 'Justification for Discrepant Assessment',
            type: 'textarea',
            placeholder: 'Explain why the sponsor\'s assessment differs from the investigator\'s, citing specific evidence.',
            visibleWhen: {
              field: 'causality_differs_from_investigator',
              operator: 'eq',
              value: true,
            },
            helpText: 'Per 21 CFR 312.32 and FDA Guidance (2012), when the sponsor downgrades the investigator\'s causality assessment, the justification must be well-documented and scientifically supported.',
          },
        ],
        defaultNext: 'expedited_reporting',
        issueChecks: [
          {
            id: 'causality_discrepancy',
            condition: {
              field: 'causality_differs_from_investigator',
              operator: 'eq',
              value: true,
            },
            severity: 'warning',
            title: 'Sponsor-Investigator Causality Discrepancy',
            message:
              'The sponsor\'s causality assessment differs from the investigator\'s assessment. Per 21 CFR 312.32(a) and FDA Guidance "Safety Reporting Requirements for INDs and BA/BE Studies" (2012), when the sponsor disagrees with the investigator\'s causality assessment (particularly when downgrading from related to not related), the justification must be scientifically robust and well-documented. FDA has issued Warning Letters citing inadequate justification for sponsor disagreement with investigator causality.',
            reference: '21 CFR 312.32(a); FDA Guidance: Safety Reporting Requirements for INDs (2012)',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 6 — Regulatory Reporting
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'expedited_reporting',
        section: 'regulatory_reporting',
        question:
          'Determine whether this event requires expedited regulatory reporting.',
        guidance:
          'Per 21 CFR 312.32(c)(1), IND Safety Reports must be submitted to FDA within 15 calendar days for serious, unexpected, suspected adverse reactions, and within 7 calendar days for fatal or life-threatening events. Per ICH E2A Section IV, expedited reporting to regulatory authorities and ethics committees is required for serious, unexpected adverse drug reactions. Per EU Clinical Trials Regulation (EU) No 536/2014 Article 42, SUSARs must be reported to EudraVigilance within 15 days (7 days for fatal/life-threatening). The reporting clock starts when the sponsor first becomes aware of the event meeting reporting criteria.',
        fields: [
          {
            id: 'meets_expedited_criteria',
            label: 'Does This Event Meet Expedited Reporting Criteria?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 312.32(c)(1), expedited reporting is required for serious, unexpected, and suspected adverse reactions (i.e., SAEs that are both unexpected and reasonably possibly related to the drug).',
          },
          {
            id: 'reporting_timeframe',
            label: 'Reporting Timeframe',
            type: 'select',
            required: true,
            options: [
              { value: '7_day', label: '7-Day Report (fatal or life-threatening)' },
              { value: '15_day', label: '15-Day Report (serious, unexpected, suspected)' },
              { value: 'annual_report', label: 'Annual Report Only (expected or not related)' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
            helpText: 'Per 21 CFR 312.32(c)(1)(i), fatal and life-threatening suspected adverse reactions require a 7-day report. Per 21 CFR 312.32(c)(1)(ii), other serious, unexpected, suspected adverse reactions require a 15-day report.',
          },
          {
            id: 'expected_or_unexpected',
            label: 'Is This Event Expected or Unexpected?',
            type: 'select',
            required: true,
            options: [
              { value: 'expected', label: 'Expected (listed in Investigator Brochure / Reference Safety Information)' },
              { value: 'unexpected', label: 'Unexpected (not listed or more severe/specific than listed)' },
              { value: 'uncertain', label: 'Uncertain — Requires Medical Review' },
            ],
            helpText: 'Per ICH E2A Section II and 21 CFR 312.32(a), an event is "unexpected" if it is not listed in the current Investigator Brochure (IB) or Reference Safety Information (RSI) in terms of nature, severity, or specificity.',
          },
          {
            id: 'date_initial_report_submitted',
            label: 'Date Initial Report Submitted to Regulatory Authority',
            type: 'date',
            helpText: 'Per 21 CFR 312.32, document the date the IND Safety Report was submitted. Compare with the "Date Sponsor Became Aware" to verify compliance with reporting timelines.',
          },
          {
            id: 'regulatory_authorities_notified',
            label: 'Regulatory Authorities Notified',
            type: 'multi_select',
            options: [
              { value: 'fda', label: 'FDA (US)' },
              { value: 'ema', label: 'EMA (EU)' },
              { value: 'pmda', label: 'PMDA (Japan)' },
              { value: 'health_canada', label: 'Health Canada' },
              { value: 'mhra', label: 'MHRA (UK)' },
              { value: 'tga', label: 'TGA (Australia)' },
              { value: 'other', label: 'Other National Authority' },
            ],
            helpText: 'Per ICH E2A Section IV, all regulatory authorities where the IND/CTA is active must be notified.',
          },
          {
            id: 'irb_ec_notified',
            label: 'Were All IRBs/Ethics Committees Notified?',
            type: 'yes_no',
            helpText: 'Per 21 CFR 312.32(c)(1)(iii) and ICH E6(R2) Section 4.11.1, the sponsor must notify all participating investigators and their IRBs/ECs of IND Safety Reports.',
          },
        ],
        defaultNext: 'cioms_completion',
        issueChecks: [
          {
            id: 'sae_reporting_delay',
            condition: {
              field: 'date_initial_report_submitted',
              operator: 'eq',
              value: '',
            },
            severity: 'critical',
            title: 'SAE Reporting Potentially Delayed',
            message:
              'No initial report submission date has been documented. Per 21 CFR 312.32(c)(1), IND Safety Reports for serious, unexpected, suspected adverse reactions must be submitted within 15 calendar days (7 days for fatal/life-threatening events) of the sponsor first becoming aware. Late reporting may result in FDA Warning Letters, clinical holds, or enforcement actions. Per FDA Compliance Program 7348.810, late safety reports are a common inspection finding.',
            reference: '21 CFR 312.32(c)(1); FDA Compliance Program 7348.810',
          },
        ],
      },

      {
        id: 'cioms_completion',
        section: 'regulatory_reporting',
        question:
          'Document the CIOMS form completion status and cross-references to similar events.',
        guidance:
          'The CIOMS-I form (Council for International Organizations of Medical Sciences Form I) is the internationally accepted format for expedited safety reporting, adopted by ICH and incorporated into MedWatch Form FDA 3500A. Per ICH E2B(R3), the information in the CIOMS form maps directly to the Individual Case Safety Report (ICSR) data elements submitted to regulatory databases (FAERS, EudraVigilance). Cross-referencing with similar events in the study enables the sponsor to identify potential safety signals per ICH E2C(R2) (Periodic Benefit-Risk Evaluation Report).',
        fields: [
          {
            id: 'cioms_form_completed',
            label: 'CIOMS Form / MedWatch 3500A Completed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'cioms_form_date',
            label: 'Date CIOMS Form Completed',
            type: 'date',
            visibleWhen: {
              field: 'cioms_form_completed',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'e2b_submission',
            label: 'E2B(R3) Electronic Submission Made?',
            type: 'yes_no',
            helpText: 'Per ICH E2B(R3), electronic ICSR submission is required for most regulatory authorities (FAERS for FDA, EudraVigilance for EMA).',
          },
          {
            id: 'similar_events_in_study',
            label: 'Number of Similar Events in This Study',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Document the number of events with the same or related MedDRA PTs observed in this study to provide aggregate context.',
          },
          {
            id: 'similar_events_description',
            label: 'Description of Similar Events',
            type: 'textarea',
            placeholder: 'e.g., 3 other cases of hepatotoxicity (Grade 2: n=2, Grade 3: n=1) observed across treatment arms; all resolved on dose interruption.',
            visibleWhen: {
              field: 'similar_events_in_study',
              operator: 'gt',
              value: 0,
            },
            helpText: 'Per ICH E2C(R2), aggregate analysis of similar events is important for signal detection.',
          },
          {
            id: 'aggregate_analysis_context',
            label: 'Aggregate Analysis Context',
            type: 'textarea',
            placeholder: 'Describe the overall incidence of this event type in the study, comparison to the control arm, and whether the event is consistent with the known safety profile of the drug.',
            helpText: 'Per ICH E2C(R2) and ICH E3 Section 12.2, place the individual event in the context of the overall study safety data.',
          },
        ],
        defaultNext: 'narrative_draft',
      },

      {
        id: 'narrative_draft',
        section: 'regulatory_reporting',
        question:
          'Provide the draft narrative text and finalization details.',
        guidance:
          'Per ICH E3 Section 14.3, the narrative should be a concise, factual account that integrates all the information collected in previous sections into a coherent clinical story. The narrative should follow a standard structure: (1) patient identification and demographics, (2) relevant medical history, (3) study drug exposure, (4) event description with timeline, (5) treatment and clinical course, (6) outcome, (7) causality assessment. Per FDA Reviewer Guidance, narratives should present facts without editorial bias and should be written in past tense. The narrative should be suitable for inclusion in the CSR per ICH E3 Section 14.3 and in IND Safety Reports per 21 CFR 312.32.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'narrative_text_draft',
            label: 'Draft Narrative Text',
            type: 'textarea',
            placeholder: 'Subject [ID] was a [age]-year-old [sex] [race] patient with [baseline disease status] who was enrolled in Study [protocol number] at Site [site number]. The patient received [study drug] [dose] starting on [date]. On Study Day [X] ([date]), the patient developed [event description]...',
            required: true,
            validation: { minLength: 100, maxLength: 20000 },
            helpText: 'Per ICH E3 Section 14.3, write a concise, factual, chronological narrative. Present clinical facts without editorial interpretation of causality.',
          },
          {
            id: 'narrative_reviewed_by',
            label: 'Narrative Reviewed By',
            type: 'text',
            placeholder: 'e.g., Dr. Jane Smith, Medical Monitor',
            helpText: 'Document the medical reviewer who approved the narrative content.',
          },
          {
            id: 'narrative_review_date',
            label: 'Narrative Review Date',
            type: 'date',
          },
          {
            id: 'narrative_status',
            label: 'Narrative Status',
            type: 'select',
            required: true,
            options: [
              { value: 'draft', label: 'Draft — Pending Medical Review' },
              { value: 'under_review', label: 'Under Medical Review' },
              { value: 'approved', label: 'Approved / Finalized' },
              { value: 'revision_needed', label: 'Revision Needed' },
            ],
          },
          {
            id: 'cross_reference_csr_section',
            label: 'CSR Section Cross-Reference',
            type: 'text',
            placeholder: 'e.g., CSR Section 14.3.2, Appendix 16.3.7',
            helpText: 'Per ICH E3, safety narratives are typically included in Section 14.3 of the CSR with supporting data in Appendix 16.3.',
          },
          {
            id: 'additional_documents_attached',
            label: 'Additional Documents Attached',
            type: 'multi_select',
            options: [
              { value: 'lab_reports', label: 'Laboratory Reports' },
              { value: 'imaging_reports', label: 'Imaging/Radiology Reports' },
              { value: 'discharge_summary', label: 'Hospital Discharge Summary' },
              { value: 'autopsy_report', label: 'Autopsy Report' },
              { value: 'ecg_reports', label: 'ECG Reports' },
              { value: 'death_certificate', label: 'Death Certificate' },
              { value: 'pathology_report', label: 'Pathology Report' },
              { value: 'other', label: 'Other Supporting Documents' },
            ],
            helpText: 'Per ICH E3 Section 14.3 and Appendix 16.3, supporting documents should be referenced in the narrative and included in the CSR appendices.',
          },
        ],
        defaultNext: null,
        issueChecks: [
          {
            id: 'narrative_not_finalized',
            condition: {
              field: 'narrative_status',
              operator: 'in',
              value: ['draft', 'revision_needed'],
            },
            severity: 'warning',
            title: 'Narrative Not Yet Finalized',
            message:
              'The safety narrative has not been finalized. Per ICH E3 Section 14.3, all patient narratives must be medically reviewed and approved prior to CSR submission. For events requiring expedited reporting per 21 CFR 312.32, the initial narrative should be completed and submitted with the IND Safety Report even if follow-up information is pending. Ensure medical review is completed before the CSR database lock.',
            reference: 'ICH E3 Section 14.3; 21 CFR 312.32',
          },
        ],
      },
    ],
  };
}
