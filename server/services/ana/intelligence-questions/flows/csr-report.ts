/**
 * Clinical Study Report (CSR) flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides the user through all key sections of a CSR aligned with ICH E3,
 * covering study identification, design summary, protocol amendments and
 * deviations, patient disposition and demographics, efficacy results,
 * safety results (including detailed lab findings, AESIs, and safety
 * narratives), statistical methods, benefit-risk assessment, regulatory
 * impact, and conclusions. Branching logic and issue checks flag
 * regulatory considerations as answers are collected.
 *
 * 25 nodes, 120+ fields, 10 sections, 15+ issue checks.
 *
 * @module server/services/ana/intelligence-questions/flows/csr-report
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createCsrReportFlow(): FlowDefinition {
  return {
    id: 'csr-report-v1',
    category: 'csr_report',
    name: 'Clinical Study Report',
    description:
      'Comprehensive questionnaire for assembling a Clinical Study Report (CSR) per ICH E3. Covers study identification, design, protocol amendments/deviations, patient disposition, demographics, efficacy results, detailed safety analysis (labs, AESIs, narratives), statistical methods, benefit-risk assessment, regulatory impact, and conclusions.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'study_id',
    estimatedMinutes: 60,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'study_identification',
        label: 'Study Identification',
        nodeIds: ['study_id', 'study_dates'],
      },
      {
        id: 'design_summary',
        label: 'Study Design Summary',
        nodeIds: ['design_overview', 'study_drug_info'],
      },
      {
        id: 'protocol_amendments_deviations',
        label: 'Protocol Amendments & Deviations',
        nodeIds: ['protocol_amendments', 'protocol_deviations'],
      },
      {
        id: 'patient_disposition_demographics',
        label: 'Patient Disposition & Demographics',
        nodeIds: ['patient_disposition', 'demographics_baseline', 'concomitant_medications'],
      },
      {
        id: 'efficacy_results',
        label: 'Efficacy Results',
        nodeIds: ['primary_results', 'secondary_results', 'oncology_efficacy', 'vaccine_efficacy', 'sensitivity_analyses'],
      },
      {
        id: 'safety_results',
        label: 'Safety Results',
        nodeIds: ['safety_overview', 'serious_events'],
      },
      {
        id: 'detailed_safety',
        label: 'Detailed Safety Analysis',
        nodeIds: ['laboratory_findings', 'aesi_analysis', 'safety_narratives'],
      },
      {
        id: 'stat_methods',
        label: 'Statistical Methods',
        nodeIds: ['analysis_sets', 'stat_summary', 'interim_analysis_detail'],
      },
      {
        id: 'benefit_risk_regulatory',
        label: 'Benefit-Risk & Regulatory Impact',
        nodeIds: ['benefit_risk_framework', 'regulatory_impact'],
      },
      {
        id: 'conclusions',
        label: 'Conclusions',
        nodeIds: ['study_conclusions'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ══════════════════════════════════════════════════════════════════
       *  Section 1 — Study Identification
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'study_id',
        section: 'study_identification',
        question:
          'Let\'s identify the study. Please provide the protocol number, title, sponsor details, and regulatory identifiers.',
        guidance:
          'Per ICH E3 Section 1, the CSR must clearly identify the study by protocol number, full title, IND/IDE number (if applicable), sponsor name, development phase, and therapeutic area. The EU CT number assigned in CTIS is required for studies conducted in the EU under Regulation (EU) No 536/2014; a EudraCT number applies to legacy studies authorised under Directive 2001/20/EC.',
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
            label: 'Study Title',
            type: 'text',
            placeholder: 'e.g., A Phase 3, Randomized, Double-Blind Study of...',
            required: true,
            validation: {
              minLength: 20,
              maxLength: 500,
            },
          },
          {
            id: 'ind_ide_number',
            label: 'IND/IDE Number',
            type: 'text',
            placeholder: 'e.g., IND 123456',
          },
          {
            id: 'eudract_number',
            label: 'EudraCT / EU CT Number',
            type: 'text',
            placeholder: 'e.g., 2025-001234-12',
            helpText: 'Required for studies conducted in the European Union.',
          },
          {
            id: 'sponsor',
            label: 'Sponsor',
            type: 'text',
            placeholder: 'e.g., Acme Therapeutics, Inc.',
            required: true,
          },
          {
            id: 'study_phase',
            label: 'Phase',
            type: 'select',
            required: true,
            options: [
              { value: 'phase_1', label: 'Phase 1' },
              { value: 'phase_1_2', label: 'Phase 1/2' },
              { value: 'phase_2', label: 'Phase 2' },
              { value: 'phase_2_3', label: 'Phase 2/3' },
              { value: 'phase_3', label: 'Phase 3' },
              { value: 'phase_3b', label: 'Phase 3b' },
              { value: 'phase_4', label: 'Phase 4' },
            ],
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'select',
            required: true,
            options: [
              { value: 'oncology', label: 'Oncology' },
              { value: 'cardiovascular', label: 'Cardiovascular' },
              { value: 'cns', label: 'Central Nervous System' },
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'immunology', label: 'Immunology / Inflammation' },
              { value: 'metabolic', label: 'Metabolic / Endocrine' },
              { value: 'respiratory', label: 'Respiratory' },
              { value: 'rare_disease', label: 'Rare Disease / Orphan' },
              { value: 'vaccines', label: 'Vaccines' },
              { value: 'hematology', label: 'Hematology' },
              { value: 'dermatology', label: 'Dermatology' },
              { value: 'gastroenterology', label: 'Gastroenterology' },
              { value: 'ophthalmology', label: 'Ophthalmology' },
            ],
            allowOther: {},
          },
          {
            id: 'gcp_compliance_statement',
            label: 'Does the CSR State That the Study Was Conducted in Compliance With GCP?',
            type: 'yes_no',
            required: false,
            helpText: 'ICH E3 expects the title page to state whether the study was performed in compliance with Good Clinical Practice, and its ethics section to confirm IRB/IEC review and informed consent. ICH E6(R3) is the current GCP guideline; 21 CFR Parts 50 and 56 apply to US studies, and 21 CFR 312.120 to foreign studies not conducted under an IND.',
          },
        ],
        defaultNext: 'study_dates',
      },

      {
        id: 'study_dates',
        section: 'study_identification',
        question:
          'What are the key dates for this study?',
        guidance:
          'ICH E3 Section 2 requires the CSR to document the dates of first enrollment, last subject last visit, database lock, and clinical cutoff. These dates establish the reporting period and data currency. For multi-regional studies, per ICH E17, note if enrollment timelines differed materially by region.',
        fields: [
          {
            id: 'first_subject_enrolled',
            label: 'First Subject Enrolled Date',
            type: 'date',
            required: true,
          },
          {
            id: 'last_subject_last_visit',
            label: 'Last Subject Last Visit Date',
            type: 'date',
            required: true,
          },
          {
            id: 'database_lock_date',
            label: 'Database Lock Date',
            type: 'date',
            required: true,
          },
          {
            id: 'clinical_cutoff_date',
            label: 'Clinical Cutoff Date',
            type: 'date',
            helpText: 'For event-driven studies, provide the data cutoff date for the analysis.',
          },
          {
            id: 'countries_enrolled',
            label: 'Countries Where Subjects Enrolled',
            type: 'country_select',
            helpText: 'Select all countries. Multi-regional trials require ICH E17 regional consistency analysis.',
          },
        ],
        defaultNext: 'design_overview',
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 2 — Study Design Summary
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'design_overview',
        section: 'design_summary',
        question:
          'Summarize the study design as it was actually conducted.',
        guidance:
          'ICH E3 Section 9 requires a synopsis of the study design, objectives, planned and actual enrollment, and number of sites. Per ICH E9 Section 2, the study design should clearly specify the randomization method, blinding approach, and control group. This section sets the context for interpreting the results.',
        fields: [
          {
            id: 'design_description',
            label: 'Study Design Description',
            type: 'textarea',
            helpText: 'Brief description of the study design as it was conducted (e.g., "Randomized, double-blind, placebo-controlled, parallel-group, multi-center study").',
            required: true,
            validation: { minLength: 50, maxLength: 2000 },
          },
          {
            id: 'study_objective',
            label: 'Primary Study Objective',
            type: 'select',
            required: true,
            options: [
              { value: 'superiority', label: 'Superiority' },
              { value: 'non_inferiority', label: 'Non-Inferiority' },
              { value: 'equivalence', label: 'Equivalence' },
              { value: 'dose_finding', label: 'Dose Finding' },
              { value: 'pharmacokinetics', label: 'Pharmacokinetics' },
              { value: 'bioequivalence', label: 'Bioequivalence' },
              { value: 'safety_only', label: 'Safety Only' },
              { value: 'exploratory', label: 'Exploratory' },
            ],
          },
          {
            id: 'blinding',
            label: 'Blinding',
            type: 'select',
            required: true,
            options: [
              { value: 'double_blind', label: 'Double-Blind' },
              { value: 'single_blind', label: 'Single-Blind' },
              { value: 'open_label', label: 'Open-Label' },
              { value: 'observer_blind', label: 'Observer-Blind' },
            ],
          },
          {
            id: 'randomization_ratio',
            label: 'Randomization Ratio',
            type: 'text',
            placeholder: 'e.g., 1:1, 2:1, 1:1:1',
            helpText: 'Per ICH E9 Section 2.3, the randomization scheme must be documented.',
          },
          {
            id: 'subjects_planned',
            label: 'Number of Subjects Planned',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'subjects_enrolled',
            label: 'Number of Subjects Enrolled',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'number_of_sites',
            label: 'Number of Sites',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'study_duration',
            label: 'Treatment Duration',
            type: 'text',
            placeholder: 'e.g., 24 weeks treatment + 4 weeks follow-up',
            required: true,
          },
        ],
        defaultNext: 'study_drug_info',
        issueChecks: [
          {
            id: 'enrollment_shortfall',
            condition: {
              field: 'subjects_enrolled',
              operator: 'lt',
              value: 0, // Note: runtime engine should compare subjects_enrolled < 0.8 * subjects_planned
            },
            severity: 'warning',
            title: 'Potential Enrollment Shortfall',
            message:
              'If enrollment is below 80% of planned sample size, the study may be underpowered. Per ICH E9 Section 3.5, under-enrollment may compromise the ability to detect the planned treatment effect. Document the impact on statistical power in the CSR.',
            reference: 'ICH E9: Statistical Principles for Clinical Trials, Section 3.5',
          },
        ],
      },

      {
        id: 'study_drug_info',
        section: 'design_summary',
        question:
          'Provide details about the investigational product and comparator(s).',
        guidance:
          'ICH E3 Section 9.4 requires documentation of the investigational product, including name, dose(s), route of administration, formulation, and comparator details. Per ICH E3 Section 9.4.2 (Identity of Investigational Product(s)), the comparator should be described in sufficient detail to support the benefit-risk assessment.',
        fields: [
          {
            id: 'investigational_product_name',
            label: 'Investigational Product Name (INN/USAN)',
            type: 'text',
            placeholder: 'e.g., examplinib (generic name)',
            required: true,
          },
          {
            id: 'doses_studied',
            label: 'Dose(s) Studied',
            type: 'textarea',
            placeholder: 'e.g., 100 mg once daily, 200 mg once daily',
            required: true,
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
              { value: 'intradermal', label: 'Intradermal' },
              { value: 'intrathecal', label: 'Intrathecal' },
            ],
            allowOther: {},
          },
          {
            id: 'formulation',
            label: 'Formulation',
            type: 'text',
            placeholder: 'e.g., film-coated tablet, lyophilized powder for injection',
          },
          {
            id: 'comparator_type',
            label: 'Comparator Type',
            type: 'select',
            required: true,
            options: [
              { value: 'placebo', label: 'Placebo' },
              { value: 'active_comparator', label: 'Active Comparator' },
              { value: 'soc', label: 'Standard of Care' },
              { value: 'dose_comparison', label: 'Dose Comparison (no external comparator)' },
              { value: 'none', label: 'No Comparator (single-arm)' },
            ],
          },
          {
            id: 'comparator_name',
            label: 'Comparator Name',
            type: 'text',
            placeholder: 'e.g., sorafenib 400 mg BID',
            visibleWhen: {
              field: 'comparator_type',
              operator: 'in',
              value: ['active_comparator', 'soc'],
            },
          },
        ],
        defaultNext: 'protocol_amendments',
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 3 — Protocol Amendments & Deviations
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'protocol_amendments',
        section: 'protocol_amendments_deviations',
        question:
          'Describe any protocol amendments made during the study.',
        guidance:
          'Per ICH E3 Section 9.8 (Changes in the Conduct of the Study or Planned Analyses), the CSR must describe all protocol amendments, with the date and rationale for each and their possible impact on interpretation of the results; the amendments themselves are provided in Appendix 16.1.1. Amendments that change endpoints, eligibility, sample size, or analysis methods warrant a detailed description of the impact on data interpretation. FDA regulations at 21 CFR 312.30 (Protocol amendments) govern how amendments to an IND protocol are submitted, and any amendment affecting the safety or scientific validity of the study should be explicitly justified.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'number_of_amendments',
            label: 'Total Number of Protocol Amendments',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'major_amendments_count',
            label: 'Number of Major Amendments',
            type: 'number',
            required: true,
            validation: { min: 0 },
            helpText: 'Major amendments change endpoints, eligibility criteria, sample size, or statistical analysis plans.',
          },
          {
            id: 'minor_amendments_count',
            label: 'Number of Minor Amendments',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'amendment_summary',
            label: 'Summary of Major Amendments',
            type: 'textarea',
            placeholder: 'For each major amendment, provide: date, description of change, rationale, and whether subjects were affected before or after the change.',
            helpText: 'Per ICH E3 Section 9.8, describe changes to endpoints, eligibility, dosing, or analysis methods.',
            visibleWhen: {
              field: 'major_amendments_count',
              operator: 'gt',
              value: 0,
            },
            validation: { minLength: 50, maxLength: 5000 },
          },
          {
            id: 'amendment_impact_on_interpretation',
            label: 'Impact of Amendments on Data Interpretation',
            type: 'textarea',
            placeholder: 'Describe how the amendment(s) may affect the interpretation of efficacy and safety data.',
            visibleWhen: {
              field: 'major_amendments_count',
              operator: 'gt',
              value: 0,
            },
          },
        ],
        defaultNext: 'protocol_deviations',
      },

      {
        id: 'protocol_deviations',
        section: 'protocol_amendments_deviations',
        question:
          'Provide a summary of protocol deviations observed in the study.',
        guidance:
          'Per ICH E3 Section 10.2, the CSR must identify and discuss important protocol deviations, including eligibility violations, dosing errors, prohibited medication use, and missed visits. The impact of major deviations on the efficacy and safety analyses must be assessed. Per ICH E3 Section 11.1, subjects with major deviations are typically excluded from the per-protocol population but included in the ITT population.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'total_deviations',
            label: 'Total Number of Protocol Deviations',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'major_deviations_count',
            label: 'Number of Major/Important Deviations',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'major_deviation_rate',
            label: 'Major Deviation Rate (%)',
            type: 'number',
            helpText: 'Percentage of subjects with at least one major deviation.',
            validation: { min: 0, max: 100 },
          },
          {
            id: 'most_common_deviation_types',
            label: 'Most Common Deviation Types',
            type: 'multi_select',
            options: [
              { value: 'eligibility_violations', label: 'Eligibility Criteria Violations' },
              { value: 'dosing_errors', label: 'Dosing Errors / Non-Compliance' },
              { value: 'prohibited_meds', label: 'Prohibited Concomitant Medications' },
              { value: 'missed_visits', label: 'Missed Study Visits' },
              { value: 'wrong_assessments', label: 'Incorrect/Missing Assessments' },
              { value: 'consent_issues', label: 'Informed Consent Issues' },
              { value: 'randomization_errors', label: 'Randomization Errors' },
              { value: 'unblinding', label: 'Unblinding Events' },
            ],
            allowOther: {},
          },
          {
            id: 'deviation_impact_on_analyses',
            label: 'Impact on Efficacy and Safety Analyses',
            type: 'textarea',
            placeholder: 'Describe how deviations were handled in the statistical analysis (e.g., sensitivity analyses excluding subjects with major deviations).',
            helpText: 'Per ICH E3 Section 10.2, assess whether deviations could bias the treatment comparison.',
          },
        ],
        defaultNext: 'patient_disposition',
        issueChecks: [
          {
            id: 'high_deviation_rate',
            condition: {
              field: 'major_deviation_rate',
              operator: 'gt',
              value: 5,
            },
            severity: 'warning',
            title: 'High Major Protocol Deviation Rate',
            message:
              'Major protocol deviation rate exceeds 5%. FDA reviewers may question data integrity and the validity of the per-protocol analysis. Consider performing sensitivity analyses to assess the robustness of the primary results. Per ICH E9 Section 5.2.3, deviations from the protocol should be carefully evaluated for their impact on the trial conclusions.',
            reference: 'ICH E9: Statistical Principles for Clinical Trials, Section 5.2.3',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 4 — Patient Disposition & Demographics
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'patient_disposition',
        section: 'patient_disposition_demographics',
        question:
          'Provide the CONSORT-style patient disposition flow for this study.',
        guidance:
          'Per ICH E3 Section 10.1 and the CONSORT 2010 Statement, the CSR should include a flow diagram showing the number of subjects screened, screen failures (with reasons), randomized to each arm, treated, completing the study, and discontinuing (with reasons). Documenting the number screened, the screen failure rate and the reasons for screen failure lets reviewers judge how restrictive the eligibility criteria were and how generalizable the trial population is (see also FDA Guidance "Enhancing the Diversity of Clinical Trial Populations — Eligibility Criteria, Enrollment Practices, and Trial Designs" (2020)).',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'subjects_screened',
            label: 'Subjects Screened',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'screen_failures',
            label: 'Screen Failures',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'screen_failure_rate',
            label: 'Screen Failure Rate (%)',
            type: 'number',
            helpText: 'Calculated as (screen failures / screened) x 100.',
            validation: { min: 0, max: 100 },
          },
          {
            id: 'screen_failure_reasons',
            label: 'Top Reasons for Screen Failure',
            type: 'textarea',
            placeholder: 'e.g., Did not meet inclusion criteria (40%), Withdrew consent (15%), Lab abnormalities (12%)...',
          },
          {
            id: 'subjects_randomized',
            label: 'Subjects Randomized (Total)',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'subjects_completed',
            label: 'Subjects Completing Treatment',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'subjects_discontinued',
            label: 'Subjects Discontinued',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'discontinuation_reasons',
            label: 'Reasons for Discontinuation',
            type: 'textarea',
            placeholder: 'e.g., Adverse events (n=12), Lack of efficacy (n=8), Withdrew consent (n=6), Lost to follow-up (n=3)...',
            required: true,
            helpText: 'Per ICH E3 Section 10.1, reasons for discontinuation must be tabulated by treatment group.',
          },
          {
            id: 'early_termination',
            label: 'Was the Study Terminated Early?',
            type: 'yes_no',
          },
          {
            id: 'early_termination_reason',
            label: 'Reason for Early Termination',
            type: 'select',
            visibleWhen: {
              field: 'early_termination',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'efficacy', label: 'Overwhelming Efficacy (crossed efficacy boundary)' },
              { value: 'futility', label: 'Futility' },
              { value: 'safety', label: 'Safety Concerns' },
              { value: 'enrollment', label: 'Enrollment Difficulty' },
              { value: 'sponsor_decision', label: 'Sponsor Decision (business/strategic)' },
              { value: 'regulatory', label: 'Regulatory Action (clinical hold)' },
            ],
            allowOther: {},
          },
        ],
        defaultNext: 'demographics_baseline',
        issueChecks: [
          {
            id: 'high_screen_failure_rate',
            condition: {
              field: 'screen_failure_rate',
              operator: 'gt',
              value: 50,
            },
            severity: 'warning',
            title: 'High Screen Failure Rate',
            message:
              'Screen failure rate exceeds 50%, which may indicate overly restrictive eligibility criteria. FDA reviewers may question the generalizability of the trial population to the target treatment population. Per FDA Guidance "Enhancing the Diversity of Clinical Trial Populations" (2020), overly restrictive criteria should be justified.',
            reference: 'FDA Guidance: Enhancing the Diversity of Clinical Trial Populations (2020)',
          },
        ],
      },

      {
        id: 'demographics_baseline',
        section: 'patient_disposition_demographics',
        question:
          'Provide a summary of the demographic and baseline disease characteristics.',
        guidance:
          'Per ICH E3 Section 11.2, the CSR must present demographic data (age, sex, race, ethnicity) and baseline disease characteristics for each treatment group, with a comparison to assess balance. Per FDA Guidance "Collection of Race and Ethnicity Data in Clinical Trials" (2005, updated 2016), race and ethnicity data must use OMB categories. ICH E9 Section 5.7 requires assessment of baseline comparability.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'mean_age',
            label: 'Mean Age (years)',
            type: 'number',
            required: true,
            validation: { min: 0, max: 120 },
          },
          {
            id: 'age_range',
            label: 'Age Range',
            type: 'text',
            placeholder: 'e.g., 22-78 years',
          },
          {
            id: 'percent_male',
            label: 'Percent Male (%)',
            type: 'number',
            required: true,
            validation: { min: 0, max: 100 },
          },
          {
            id: 'race_ethnicity_summary',
            label: 'Race/Ethnicity Summary',
            type: 'textarea',
            placeholder: 'e.g., White 65%, Black/African American 15%, Asian 12%, Hispanic/Latino 18%...',
            required: true,
            helpText: 'Per FDA Guidance, use OMB race/ethnicity categories. Document representation relative to disease epidemiology.',
          },
          {
            id: 'baseline_disease_characteristics',
            label: 'Baseline Disease Characteristics',
            type: 'textarea',
            placeholder: 'e.g., Mean disease duration 4.2 years, ECOG PS 0/1: 85%/15%, prior lines of therapy: median 2...',
            required: true,
            helpText: 'Include key prognostic factors relevant to the study population.',
          },
          {
            id: 'treatment_groups_balanced',
            label: 'Were Treatment Groups Balanced at Baseline?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH E9 Section 5.7, imbalances should be assessed for potential impact on efficacy conclusions.',
          },
          {
            id: 'imbalance_description',
            label: 'Description of Baseline Imbalances',
            type: 'textarea',
            placeholder: 'Describe any notable imbalances and how they were addressed in the analysis.',
            visibleWhen: {
              field: 'treatment_groups_balanced',
              operator: 'eq',
              value: false,
            },
          },
          {
            id: 'subgroup_diversity_adequate',
            label: 'Was the Study Population Adequately Diverse?',
            type: 'yes_no',
            helpText: 'Per FDA Guidance "Enhancing the Diversity of Clinical Trial Populations" (2020), assess whether the enrolled population reflects the target treatment population.',
          },
        ],
        defaultNext: 'concomitant_medications',
        issueChecks: [
          {
            id: 'treatment_groups_not_balanced',
            condition: {
              field: 'treatment_groups_balanced',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'Treatment Groups Not Balanced at Baseline',
            message:
              'Baseline imbalances between treatment groups may confound the efficacy results. Per ICH E9 Section 5.7, assess whether imbalances are clinically meaningful and consider pre-specified covariate adjustment or sensitivity analyses to evaluate robustness of the treatment effect.',
            reference: 'ICH E9: Statistical Principles for Clinical Trials, Section 5.7',
          },
          {
            id: 'inadequate_diversity',
            condition: {
              field: 'subgroup_diversity_adequate',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'Inadequate Population Diversity',
            message:
              'The study population may not adequately reflect the diversity of the target treatment population. Per FDA Guidance "Enhancing the Diversity of Clinical Trial Populations" (2020), sponsors should ensure enrollment plans achieve broad demographic representation. This may affect labeling discussions and post-marketing requirements.',
            reference: 'FDA Guidance: Enhancing the Diversity of Clinical Trial Populations (2020)',
          },
        ],
      },

      {
        id: 'concomitant_medications',
        section: 'patient_disposition_demographics',
        question:
          'Provide a summary of prior and concomitant medications.',
        guidance:
          'Per ICH E3 Section 9.4.7 (Prior and Concomitant Therapy) and Section 11.2 (Demographic and Other Baseline Characteristics), the CSR must document prior therapies and concomitant medications used during the study, as they may affect both efficacy and safety interpretation. Medications should be coded using the WHO Drug Dictionary (WHO-DD) and summarized by ATC class. Prohibited medications (as defined in the protocol, see ICH E3 Section 9.4.7) that were used constitute protocol deviations and should be cross-referenced with the protocol deviations section (ICH E3 Section 10.2).',
        fields: [
          {
            id: 'who_drug_dictionary_version',
            label: 'WHO Drug Dictionary Version Used',
            type: 'text',
            placeholder: 'e.g., WHO-DD March 2025',
          },
          {
            id: 'prior_therapy_summary',
            label: 'Prior Therapy Summary',
            type: 'textarea',
            placeholder: 'Summarize prior therapies relevant to the condition under study (e.g., median lines of prior therapy, most common prior agents).',
            required: true,
          },
          {
            id: 'concomitant_meds_summary',
            label: 'Most Common Concomitant Medications',
            type: 'textarea',
            placeholder: 'List concomitant medications used by ≥10% of subjects in any treatment group, by ATC class.',
            required: true,
            helpText: 'Per ICH E3 Section 11.2, present by treatment group and identify any differences.',
          },
          {
            id: 'prohibited_meds_used',
            label: 'Were Prohibited Medications Used?',
            type: 'yes_no',
            helpText: 'Use of prohibited medications is a protocol deviation; cross-reference with Protocol Deviations section.',
          },
          {
            id: 'prohibited_meds_impact',
            label: 'Impact of Prohibited Medication Use',
            type: 'textarea',
            placeholder: 'Describe which prohibited medications were used, how many subjects were affected, and impact on efficacy/safety analyses.',
            visibleWhen: {
              field: 'prohibited_meds_used',
              operator: 'eq',
              value: true,
            },
          },
        ],
        defaultNext: 'primary_results',
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 5 — Efficacy Results
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'primary_results',
        section: 'efficacy_results',
        question:
          'What were the primary efficacy results?',
        guidance:
          'ICH E3 Section 11.4 requires a detailed presentation of primary endpoint results, including whether the endpoint was met, the point estimate, confidence interval, and p-value. A clear statement of whether the primary objective was achieved is essential. Per ICH E9 Section 5.1 (Prespecification of the Analysis), the primary analysis should be fully pre-specified in the protocol and statistical analysis plan (SAP).',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'primary_endpoint_description',
            label: 'Primary Endpoint Description',
            type: 'textarea',
            placeholder: 'e.g., Overall Survival (OS) defined as time from randomization to death from any cause.',
            required: true,
          },
          {
            id: 'primary_endpoint_met',
            label: 'Primary Endpoint Met',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'primary_endpoint_result_summary',
            label: 'Primary Endpoint Result Summary',
            type: 'textarea',
            placeholder: 'Summarize the primary efficacy result, including treatment difference and clinical interpretation.',
            required: true,
            validation: { minLength: 30, maxLength: 3000 },
          },
          {
            id: 'p_value',
            label: 'P-value',
            type: 'text',
            placeholder: 'e.g., p=0.003',
          },
          {
            id: 'effect_size',
            label: 'Effect Size (with CI)',
            type: 'text',
            placeholder: 'e.g., HR=0.72 (95% CI: 0.58-0.89), OR=2.3 (95% CI: 1.4-3.7)',
          },
          {
            id: 'clinical_significance',
            label: 'Was the Effect Clinically Meaningful?',
            type: 'yes_no',
            helpText: 'Per FDA guidance, statistical significance alone is insufficient; the treatment effect should meet or exceed a clinically meaningful threshold.',
          },
          {
            id: 'missing_data_primary_endpoint',
            label: 'Missing Data Rate for Primary Endpoint (%)',
            type: 'number',
            validation: { min: 0, max: 100 },
            helpText: 'Per ICH E9 (FDA Guidance "E9 Statistical Principles for Clinical Trials", 1998) and the ICH E9(R1) addendum (FDA final guidance, 2021), missing data are a potential source of bias that may compromise the validity of the primary analysis; neither sets a numeric threshold, so the extent of missing data and the handling strategy should be prespecified and supported by sensitivity analyses.',
          },
        ],
        branches: [
          {
            when: { field: 'therapeutic_area', operator: 'eq', value: 'oncology' },
            goto: 'oncology_efficacy',
          },
          {
            when: { field: 'therapeutic_area', operator: 'eq', value: 'vaccines' },
            goto: 'vaccine_efficacy',
          },
        ],
        defaultNext: 'sensitivity_analyses',
        issueChecks: [
          {
            id: 'primary_endpoint_not_met',
            condition: {
              field: 'primary_endpoint_met',
              operator: 'eq',
              value: false,
            },
            severity: 'info',
            title: 'Primary Endpoint Not Met',
            message:
              'The primary endpoint was not met. Provide the complete prespecified analysis and source-supported reasons and limitations. Assess robustness using sensitivity analyses for the same estimand; distinguish supplementary analyses and exploratory post hoc work, without using them to reverse the primary conclusion.',
            reference: 'ICH E3: Structure and Content of Clinical Study Reports, Section 11.4.1',
          },
          {
            id: 'high_missing_data_primary',
            condition: {
              field: 'missing_data_primary_endpoint',
              operator: 'gt',
              value: 20,
            },
            severity: 'critical',
            title: 'High Missing Data Rate for Primary Endpoint',
            message:
              'Missing data exceeds 20% for the primary endpoint. Per the National Research Council report "The Prevention and Treatment of Missing Data in Clinical Trials" (2010) and ICH E9(R1), high rates of missing data can introduce bias and undermine the validity of the primary analysis. A tipping-point analysis or pattern-mixture model sensitivity analysis is recommended.',
            reference: 'National Research Council: The Prevention and Treatment of Missing Data in Clinical Trials (2010); ICH E9(R1) Addendum',
          },
        ],
      },

      /* — Oncology-specific efficacy (conditional branch) —————————— */

      {
        id: 'oncology_efficacy',
        section: 'efficacy_results',
        question:
          'Provide oncology-specific efficacy details.',
        guidance:
          'For oncology trials, per FDA Guidance "Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics" (2018), document the RECIST criteria version used, whether response was confirmed, and whether an independent radiology review committee (IRC) was employed. Per RECIST 1.1, the IRC assessment is generally considered less biased than investigator assessment for open-label studies.',
        fields: [
          {
            id: 'recist_version',
            label: 'RECIST Criteria Version',
            type: 'select',
            required: true,
            options: [
              { value: 'recist_1_0', label: 'RECIST 1.0' },
              { value: 'recist_1_1', label: 'RECIST 1.1' },
              { value: 'irecist', label: 'iRECIST (immune-modified)' },
              { value: 'rano', label: 'RANO (neuro-oncology)' },
              { value: 'lugano', label: 'Lugano (lymphoma)' },
            ],
            allowOther: {},
          },
          {
            id: 'independent_radiology_review',
            label: 'Independent Radiology Review (IRC/BICR)?',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA Guidance (2018), BICR is generally expected for open-label oncology trials where tumor response is a primary or key secondary endpoint.',
          },
          {
            id: 'objective_response_rate',
            label: 'Objective Response Rate (ORR, %)',
            type: 'number',
            validation: { min: 0, max: 100 },
          },
          {
            id: 'complete_response_rate',
            label: 'Complete Response Rate (CR, %)',
            type: 'number',
            validation: { min: 0, max: 100 },
          },
          {
            id: 'duration_of_response',
            label: 'Median Duration of Response (months)',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'median_pfs',
            label: 'Median PFS (months)',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Per FDA Guidance, PFS may serve as a surrogate endpoint in certain tumor types.',
          },
          {
            id: 'median_os',
            label: 'Median OS (months)',
            type: 'number',
            validation: { min: 0 },
          },
        ],
        defaultNext: 'sensitivity_analyses',
      },

      /* — Vaccine-specific efficacy (conditional branch) —————————— */

      {
        id: 'vaccine_efficacy',
        section: 'efficacy_results',
        question:
          'Provide vaccine-specific efficacy and immunogenicity details.',
        guidance:
          'Per FDA Guidance "Clinical Data Needed to Support the Licensure of Seasonal Inactivated Influenza Vaccines" (2007) and ICH E3, vaccine CSRs must document vaccine efficacy (VE), seroconversion rates, geometric mean titers (GMT), and the reverse cumulative distribution curve (RCDC). Per FDA Guidance "Development and Licensure of Vaccines to Prevent COVID-19" (2020), VE should be estimated with a confidence interval, and the lower bound of the CI should exceed a pre-specified threshold.',
        fields: [
          {
            id: 'vaccine_efficacy_percent',
            label: 'Vaccine Efficacy (VE, %)',
            type: 'number',
            validation: { min: 0, max: 100 },
            required: true,
          },
          {
            id: 've_confidence_interval',
            label: 'VE Confidence Interval',
            type: 'text',
            placeholder: 'e.g., 95% CI: 60.0%-85.3%',
            required: true,
          },
          {
            id: 'seroconversion_rate',
            label: 'Seroconversion Rate (%)',
            type: 'number',
            validation: { min: 0, max: 100 },
            required: true,
            helpText: 'Proportion of subjects achieving a ≥4-fold rise in antibody titer.',
          },
          {
            id: 'geometric_mean_titer',
            label: 'Geometric Mean Titer (GMT) at Peak',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'gmt_ratio',
            label: 'GMT Ratio (vaccine/control)',
            type: 'text',
            placeholder: 'e.g., 15.2 (95% CI: 12.1-19.0)',
          },
          {
            id: 'durability_of_response',
            label: 'Durability of Immune Response',
            type: 'textarea',
            placeholder: 'Describe persistence of antibody titers at 6 months, 12 months, etc.',
          },
        ],
        defaultNext: 'sensitivity_analyses',
      },

      /* — Robustness is assessed whether the primary criterion was met or not. — */

      {
        id: 'sensitivity_analyses',
        section: 'efficacy_results',
        question:
          'Describe the planned robustness assessments, supplementary analyses and any post hoc work, whether or not the primary criterion was met.',
        guidance:
          'Assess robustness after either a successful or unsuccessful primary result. Under ICH E9(R1), sensitivity analyses address assumptions for the same estimand; supplementary analyses target a different estimand and must be labelled separately. Classify analyses by the protocol and SAP, not by whether their result is favourable. Post hoc work is identified as exploratory, not a replacement for the prespecified primary conclusion. Missing analyses or source outputs remain explicit.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'sensitivity_analyses_performed',
            label: 'Were Pre-Specified Sensitivity Analyses Performed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'sensitivity_analysis_summary',
            label: 'Sensitivity Analysis Results',
            type: 'textarea',
            placeholder: 'For each same-estimand sensitivity analysis, identify the assumption assessed, method, source output and whether it supports the robustness of the primary interpretation. Do not assume a per-protocol analysis targets the same estimand.',
            required: true,
            validation: { minLength: 50, maxLength: 5000 },
            visibleWhen: { field: 'sensitivity_analyses_performed', operator: 'eq', value: true },
          },
          {
            id: 'supplementary_analysis_summary',
            label: 'Supplementary Analyses (Different Estimand)',
            type: 'textarea',
            placeholder: 'Identify each different estimand, its rationale, prespecified or post hoc status, and source output; state when none was performed or the record is unavailable.',
          },
          {
            id: 'post_hoc_analyses_performed',
            label: 'Were Post-Hoc Analyses Performed?',
            type: 'yes_no',
          },
          {
            id: 'post_hoc_analysis_summary',
            label: 'Post-Hoc Analysis Summary',
            type: 'textarea',
            placeholder: 'Describe any post-hoc analyses, subgroup analyses, or responder analyses performed.',
            visibleWhen: {
              field: 'post_hoc_analyses_performed',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'potential_reasons_for_failure',
            label: 'Potential Reasons for Study Failure',
            type: 'textarea',
            placeholder: 'e.g., High placebo response rate, insufficient dose, study population not enriched, regional differences, etc.',
            required: true,
            visibleWhen: { field: 'primary_endpoint_met', operator: 'eq', value: false },
          },
        ],
        defaultNext: 'secondary_results',
      },

      {
        id: 'secondary_results',
        section: 'efficacy_results',
        question:
          'What were the key secondary efficacy results?',
        guidance:
          'ICH E3 Section 11.4 requires secondary endpoint results. Per ICH E9 Section 5.6, multiplicity adjustment is needed when multiple secondary endpoints are tested for statistical significance. Document whether a gatekeeping strategy (e.g., fixed-sequence, hierarchical) was used. Per FDA Guidance "Multiple Endpoints in Clinical Trials" (2022), clearly distinguish between endpoints tested with Type I error control and those that are descriptive.',
        fields: [
          {
            id: 'key_secondary_endpoints_met',
            label: 'Key Secondary Endpoints Status',
            type: 'select',
            required: true,
            options: [
              { value: 'all_met', label: 'All Key Secondary Endpoints Met' },
              { value: 'some_met', label: 'Some Key Secondary Endpoints Met' },
              { value: 'none_met', label: 'No Key Secondary Endpoints Met' },
            ],
          },
          {
            id: 'secondary_results_summary',
            label: 'Secondary Results Summary',
            type: 'textarea',
            placeholder: 'Summarize the key secondary endpoint results with effect sizes and p-values.',
            required: true,
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'multiplicity_adjustment',
            label: 'Multiplicity Adjustment Method',
            type: 'select',
            options: [
              { value: 'fixed_sequence', label: 'Fixed-Sequence (Hierarchical)' },
              { value: 'bonferroni', label: 'Bonferroni' },
              { value: 'hochberg', label: 'Hochberg' },
              { value: 'graphical', label: 'Graphical Approach' },
              { value: 'none', label: 'None (all secondary endpoints descriptive)' },
            ],
            allowOther: {},
            helpText: 'Per ICH E9 Section 5.6, multiplicity must be addressed when multiple endpoints contribute to the efficacy claim.',
          },
          {
            id: 'subgroup_analyses_performed',
            label: 'Were Pre-Specified Subgroup Analyses Performed?',
            type: 'yes_no',
          },
          {
            id: 'subgroup_analysis_summary',
            label: 'Subgroup Analysis Summary',
            type: 'textarea',
            placeholder: 'Summarize key subgroup findings (age, sex, race, geographic region, biomarker status, etc.).',
            visibleWhen: {
              field: 'subgroup_analyses_performed',
              operator: 'eq',
              value: true,
            },
          },
        ],
        defaultNext: 'safety_overview',
        issueChecks: [
          {
            id: 'no_subgroup_analysis',
            condition: {
              field: 'subgroup_analyses_performed',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'No Subgroup Analyses for Demographic Groups',
            message:
              'No pre-specified subgroup analyses were performed. Per FDA Guidance "Enhancing the Diversity of Clinical Trial Populations" (2020) and FDA Guidance "Evaluation of Sex-Specific Data in Medical Device Clinical Studies" (2014), regulatory submissions should include subgroup analyses by age, sex, race/ethnicity, and geographic region to support labeling claims for the full target population.',
            reference: 'FDA Guidance: Enhancing the Diversity of Clinical Trial Populations (2020)',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 6 — Safety Results
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'safety_overview',
        section: 'safety_results',
        question:
          'Provide an overview of the safety results.',
        guidance:
          'ICH E3 Section 12 requires a comprehensive safety summary including the total number of AEs, drug-related AEs, discontinuations due to AEs, dose modifications due to AEs, and the most common adverse events (typically ≥5% in any treatment group). Per ICH E3 Section 12.2 (12.2.2 Display of Adverse Events; 12.2.3 Analysis of Adverse Events), present AE data by System Organ Class (SOC) and Preferred Term (PT) using MedDRA coding. This forms the basis of the benefit-risk assessment.',
        fields: [
          {
            id: 'meddra_version',
            label: 'MedDRA Version Used',
            type: 'text',
            placeholder: 'e.g., MedDRA v26.1',
            required: true,
          },
          {
            id: 'total_aes_reported',
            label: 'Subjects with Any AE (n)',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'total_aes_percent',
            label: 'Subjects with Any AE (%)',
            type: 'number',
            validation: { min: 0, max: 100 },
          },
          {
            id: 'drug_related_aes',
            label: 'Subjects with Drug-Related AEs (n)',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'grade_3_or_higher_aes',
            label: 'Subjects with Grade ≥3 AEs (n)',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Using CTCAE grading (for oncology) or severity scale as defined in the protocol.',
          },
          {
            id: 'discontinuations_due_to_aes',
            label: 'Discontinuations Due to AEs (n)',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'dose_modifications_due_to_aes',
            label: 'Dose Modifications Due to AEs (n)',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'most_common_aes',
            label: 'Most Common AEs (≥5% in any group)',
            type: 'textarea',
            helpText: 'List by PT with incidence in each treatment group. Per ICH E3 Section 12.2.2, present by SOC and PT.',
            required: true,
            validation: { minLength: 30 },
          },
        ],
        defaultNext: 'serious_events',
        issueChecks: [
          {
            id: 'discontinuations_require_review',
            condition: {
              field: 'discontinuations_due_to_aes',
              operator: 'gt',
              value: 0,
            },
            severity: 'info',
            title: 'Review AE-Related Discontinuations',
            message:
              'Discontinuations due to adverse events were reported. This absolute count does not establish an incidence rate or tolerability conclusion. Review the safety population denominator, treatment-group counts, exposure and source outputs, then describe the events by PT and SOC with an appropriate comparison.',
            reference: 'ICH E3: Structure and Content of Clinical Study Reports, Section 12.2',
          },
          {
            id: 'grade3_events_require_review',
            condition: {
              field: 'grade_3_or_higher_aes',
              operator: 'gt',
              value: 0,
            },
            severity: 'info',
            title: 'Review Grade ≥3 Adverse Events',
            message:
              'Grade 3 or higher adverse events were reported. A nonzero count alone does not establish a high incidence or product risk. Review the grading scale, safety population denominator, treatment-group counts, exposure and source outputs before interpreting the finding; distinguish severity from seriousness.',
            reference: 'ICH E3: Structure and Content of Clinical Study Reports, Section 12.2',
          },
        ],
      },

      {
        id: 'serious_events',
        section: 'safety_results',
        question:
          'Provide details on serious adverse events and deaths.',
        guidance:
          'ICH E3 Section 12.2 and 12.3 require individual SAE listings and death narratives. Per ICH E3 Section 12.3.2, ALL deaths must be individually narrativized regardless of causality assessment. Drug-related SAEs require special attention in the benefit-risk discussion. Per 21 CFR 312.32, serious and unexpected adverse reactions must be reported as IND Safety Reports within 15 calendar days (7 days for fatal/life-threatening).',
        fields: [
          {
            id: 'total_saes',
            label: 'Total SAEs (n)',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'sae_incidence_percent',
            label: 'SAE Incidence (%)',
            type: 'number',
            validation: { min: 0, max: 100 },
          },
          {
            id: 'drug_related_saes',
            label: 'Drug-Related SAEs (n)',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'most_common_saes',
            label: 'Most Common SAEs by PT',
            type: 'textarea',
            placeholder: 'List SAEs occurring in ≥2 subjects in any group, with incidence per group.',
          },
          {
            id: 'deaths',
            label: 'Total Deaths (n)',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'deaths_drug_related',
            label: 'Drug-Related Deaths (n)',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'death_causes_summary',
            label: 'Causes of Death Summary',
            type: 'textarea',
            placeholder: 'List each death with PT, treatment group, study day, and investigator causality assessment.',
            visibleWhen: {
              field: 'deaths',
              operator: 'gt',
              value: 0,
            },
          },
        ],
        defaultNext: 'laboratory_findings',
        issueChecks: [
          {
            id: 'deaths_reported',
            condition: {
              field: 'deaths',
              operator: 'gt',
              value: 0,
            },
            severity: 'critical',
            title: 'Deaths Reported',
            message:
              'All deaths must be individually narrativized per ICH E3 Section 12.3.2, regardless of the investigator\'s causality assessment. Each narrative must include the subject identifier, demographics, relevant medical history, study treatment details, the event description with timeline, interventions, outcome, and the investigator\'s causality assessment.',
            reference: 'ICH E3: Structure and Content of Clinical Study Reports, Section 12.3.2',
          },
          {
            id: 'drug_related_deaths',
            condition: {
              field: 'deaths_drug_related',
              operator: 'gt',
              value: 0,
            },
            severity: 'critical',
            title: 'Drug-Related Deaths Reported',
            message:
              'Drug-related deaths that are unexpected (not consistent with the Investigator\'s Brochure) are IND safety reports under 21 CFR 312.32: FDA must be notified within 7 calendar days of sponsor awareness, and the full IND safety report must be submitted to FDA and all participating investigators within 15 calendar days. Expected deaths are not 7-day reports. Ensure applicable expedited reports have been submitted to FDA, participating investigators and other regulatory authorities as required, and that investigators have informed their IRBs/ECs. The benefit-risk assessment must explicitly address these events.',
            reference: '21 CFR 312.32; ICH E2A: Clinical Safety Data Management',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 7 — Detailed Safety Analysis
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'laboratory_findings',
        section: 'detailed_safety',
        question:
          'Provide details on key laboratory findings and organ-specific safety assessments.',
        guidance:
          'Per ICH E3 Section 12.4, laboratory data must be presented with shift tables (baseline to worst post-baseline grade) and individual clinically significant abnormalities identified. Per FDA Guidance "Drug-Induced Liver Injury: Premarketing Clinical Evaluation" (2009), a Hy\'s Law evaluation is mandatory for drugs with hepatotoxicity signals. Hy\'s Law criteria: ALT or AST > 3x ULN AND total bilirubin > 2x ULN WITHOUT alkaline phosphatase > 2x ULN (ruling out biliary obstruction). Per ICH E3 Section 12.4.2, renal and hematologic parameters should be summarized with shift tables.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'hepatic_safety_signal',
            label: 'Was a Hepatotoxicity Signal Identified?',
            type: 'yes_no',
            required: true,
            helpText: 'Any ALT/AST elevations > 3x ULN or bilirubin > 2x ULN.',
          },
          {
            id: 'hys_law_cases',
            label: 'Number of Hy\'s Law Cases',
            type: 'number',
            required: true,
            validation: { min: 0 },
            helpText: 'Hy\'s Law: ALT/AST > 3x ULN AND total bilirubin > 2x ULN (no ALP > 2x ULN). Per FDA DILI Guidance (2009), even 1 case is a serious signal.',
          },
          {
            id: 'hepatic_assessment_summary',
            label: 'Hepatic Safety Assessment Summary',
            type: 'textarea',
            placeholder: 'Describe the eDISH (evaluation of Drug-Induced Serious Hepatotoxicity) plot findings, Temple corollary assessment, and any cases in the "Hy\'s Law quadrant."',
            visibleWhen: {
              field: 'hepatic_safety_signal',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'hematology_findings',
            label: 'Key Hematology Findings',
            type: 'textarea',
            placeholder: 'Summarize shifts in hemoglobin, WBC, neutrophils, platelets using shift tables (Grade 0→1→2→3→4).',
            helpText: 'Per ICH E3 Section 12.4.2, identify any Grade 3/4 hematologic toxicities.',
          },
          {
            id: 'renal_function_changes',
            label: 'Renal Function Changes',
            type: 'textarea',
            placeholder: 'Summarize creatinine, eGFR, BUN changes. Note any cases of acute kidney injury (KDIGO criteria).',
          },
          {
            id: 'metabolic_parameters',
            label: 'Metabolic Parameter Changes',
            type: 'textarea',
            placeholder: 'Summarize changes in glucose, HbA1c, lipid panel, electrolytes.',
          },
          {
            id: 'shift_table_approach',
            label: 'Shift Table Methodology Used',
            type: 'select',
            options: [
              { value: 'ctcae', label: 'CTCAE Grade Shifts' },
              { value: 'normal_abnormal', label: 'Normal/Abnormal Shifts' },
              { value: 'predefined_thresholds', label: 'Pre-Defined Clinical Thresholds' },
              { value: 'combined', label: 'Combined Approach' },
            ],
          },
        ],
        defaultNext: 'aesi_analysis',
        issueChecks: [
          {
            id: 'hys_law_detected',
            condition: {
              field: 'hys_law_cases',
              operator: 'gt',
              value: 0,
            },
            severity: 'critical',
            title: 'Hy\'s Law Cases Detected',
            message:
              'One or more Hy\'s Law cases were identified. Per FDA Guidance "Drug-Induced Liver Injury: Premarketing Clinical Evaluation" (2009), Hy\'s Law cases are a strong signal of a potential to cause severe drug-induced liver injury (DILI): the guidance estimates the rate of severe DILI (death or transplant) at roughly one-tenth the Hy\'s Law case rate, and while a single case is worrisome, two are considered highly predictive of severe DILI potential in a larger population. Such findings may preclude approval absent a compelling benefit. Each case requires a detailed narrative, eDISH plot analysis, and assessment of alternative etiologies. This finding should be prominently discussed in the benefit-risk assessment and regulatory strategy.',
            reference: 'FDA Guidance: Drug-Induced Liver Injury: Premarketing Clinical Evaluation (2009)',
          },
        ],
      },

      {
        id: 'aesi_analysis',
        section: 'detailed_safety',
        question:
          'Describe Adverse Events of Special Interest (AESIs) identified in this study.',
        guidance:
          'AESIs are pre-defined events warranting focused monitoring based on the drug\'s mechanism of action, pharmacological class effects, or pre-clinical/early clinical signals; the AESI concept comes from CIOMS VI and the study protocol rather than ICH E3, which addresses comparable events as other significant adverse events in Section 12.3 and displays adverse events in Section 12.2.2. In line with CIOMS VI and common industry practice (not a requirement of FDA\'s 2012 guidance "Safety Reporting Requirements for INDs and BA/BE Studies", which addresses expedited reporting under 21 CFR 312.32), AESIs should be defined in the protocol and monitored via Standardized MedDRA Queries (SMQs) or Customized MedDRA Queries (CMQs). Time-to-onset and dose-response analyses are critical for assessing causal relationship.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'aesi_defined',
            label: 'Were AESIs Pre-Defined in the Protocol?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'aesi_list',
            label: 'List of AESIs',
            type: 'textarea',
            placeholder: 'e.g., QTc prolongation, hepatotoxicity, immune-mediated reactions, thromboembolic events...',
            visibleWhen: {
              field: 'aesi_defined',
              operator: 'eq',
              value: true,
            },
            required: true,
          },
          {
            id: 'aesi_meddra_coding',
            label: 'MedDRA Coding Approach for AESIs',
            type: 'select',
            options: [
              { value: 'smq_narrow', label: 'SMQ Narrow Scope' },
              { value: 'smq_broad', label: 'SMQ Broad Scope' },
              { value: 'cmq', label: 'Customized MedDRA Query (CMQ)' },
              { value: 'pt_list', label: 'Pre-Defined PT List' },
            ],
            visibleWhen: {
              field: 'aesi_defined',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'aesi_incidence_summary',
            label: 'AESI Incidence Summary',
            type: 'textarea',
            placeholder: 'For each AESI, provide incidence by treatment group, severity distribution, and outcomes.',
            visibleWhen: {
              field: 'aesi_defined',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'time_to_onset_analysis',
            label: 'Time-to-Onset Analysis',
            type: 'textarea',
            placeholder: 'Describe the median and range of time to onset for key AESIs and whether a temporal pattern was observed.',
            helpText: 'Time-to-onset analysis helps distinguish drug-related events from background rates. Per ICH E4 and the FDA guidance on Exposure-Response Relationships (2003), exposure-response analysis may be informative.',
          },
          {
            id: 'dose_response_for_aes',
            label: 'Dose-Response Relationship for AEs',
            type: 'textarea',
            placeholder: 'Describe any dose-response relationship observed for AESIs or other key AEs.',
            helpText: 'Per ICH E4 Section 3, a dose-response relationship strengthens the causal inference for drug-related events.',
          },
        ],
        defaultNext: 'safety_narratives',
      },

      {
        id: 'safety_narratives',
        section: 'detailed_safety',
        question:
          'Provide details on the safety narratives included in the CSR.',
        guidance:
          'Per ICH E3 Section 12.3.2, brief individual patient narratives are expected for: (1) ALL deaths, regardless of causality; (2) ALL other serious adverse events, regardless of causality; (3) those other significant adverse events (e.g., AEs leading to discontinuation of study drug) judged to be of special interest because of clinical importance. Per ICH E3 Section 14.3, narratives should include subject identifier, demographics, relevant medical history, study drug exposure, event description with timeline, concomitant medications, interventions, and outcome. For blinded studies, include the treatment assignment in the narrative.',
        fields: [
          {
            id: 'total_narratives_written',
            label: 'Total Number of Narratives Written',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'death_narratives_count',
            label: 'Death Narratives',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'drug_related_sae_narratives_count',
            label: 'Drug-Related SAE Narratives',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'ae_discontinuation_narratives_count',
            label: 'AE Leading to Discontinuation Narratives',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'other_narratives_count',
            label: 'Other Significant Narratives',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Narratives for events of regulatory interest not covered above (e.g., pregnancy exposures, medication errors).',
          },
          {
            id: 'narrative_format',
            label: 'Narrative Format',
            type: 'select',
            options: [
              { value: 'cioms_form', label: 'CIOMS Form Format' },
              { value: 'ich_e3_format', label: 'ICH E3 Section 14.3 Format' },
              { value: 'sponsor_template', label: 'Sponsor Template' },
            ],
          },
        ],
        defaultNext: 'analysis_sets',
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 8 — Statistical Methods
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'analysis_sets',
        section: 'stat_methods',
        question:
          'What were the analysis population sizes?',
        guidance:
          'ICH E3 Section 11.1 requires documentation of all analysis populations. The ITT (all randomized), mITT (randomized and treated/assessed), per-protocol (PP), and safety populations should be clearly defined with the number of subjects in each and the reasons for exclusion from each set. Per ICH E9 Section 5.2, the ITT population should be the primary analysis population for superiority trials, while in non-inferiority and equivalence trials the full analysis set is generally not conservative, so both the ITT and PP analyses should be presented and the conclusions should be consistent across them.',
        fields: [
          {
            id: 'itt_population_size',
            label: 'ITT Population Size',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'mitt_population_size',
            label: 'mITT Population Size',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'pp_population_size',
            label: 'Per-Protocol (PP) Population Size',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'safety_population_size',
            label: 'Safety Population Size',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'pk_population_size',
            label: 'PK Population Size',
            type: 'number',
            validation: { min: 0 },
            helpText: 'If pharmacokinetic analyses were performed.',
          },
          {
            id: 'reasons_for_exclusion_from_pp',
            label: 'Reasons for Exclusion from PP Population',
            type: 'textarea',
            placeholder: 'e.g., Major protocol deviations (n=15), insufficient treatment exposure (n=8), missing primary endpoint data (n=5).',
          },
        ],
        defaultNext: 'stat_summary',
      },

      {
        id: 'stat_summary',
        section: 'stat_methods',
        question:
          'Summarize the statistical methods used in the study.',
        guidance:
          'ICH E3 Section 11.4 and ICH E9 require a clear description of the primary analysis method, how missing data were handled, and any multiplicity adjustments. Per ICH E9(R1) Addendum, the estimand framework should describe the target of estimation, including intercurrent events handling. Per FDA Guidance "Adjusting for Covariates in Randomized Clinical Trials for Drugs and Biological Products" (2023), pre-specified covariate adjustment in the primary analysis is acceptable and often recommended.',
        fields: [
          {
            id: 'primary_analysis_method',
            label: 'Primary Analysis Method',
            type: 'text',
            placeholder: 'e.g., Cox proportional hazards model stratified by region and prior therapy',
            required: true,
          },
          {
            id: 'estimand_defined',
            label: 'Was an Estimand Framework Used (ICH E9(R1))?',
            type: 'yes_no',
            helpText: 'Per ICH E9(R1), the estimand should define the population, variable, intercurrent events, and summary measure.',
          },
          {
            id: 'intercurrent_events_handling',
            label: 'Intercurrent Events Handling Strategy',
            type: 'multi_select',
            options: [
              { value: 'treatment_policy', label: 'Treatment Policy (regardless of intercurrent event)' },
              { value: 'composite', label: 'Composite (event included in endpoint)' },
              { value: 'hypothetical', label: 'Hypothetical (had intercurrent event not occurred)' },
              { value: 'principal_stratum', label: 'Principal Stratum' },
              { value: 'while_on_treatment', label: 'While-on-Treatment' },
            ],
            helpText: 'Per ICH E9(R1), the strategy for handling intercurrent events defines the estimand.',
          },
          {
            id: 'handling_of_missing_data',
            label: 'Primary Missing Data Approach',
            type: 'select',
            required: true,
            options: [
              { value: 'locf', label: 'Last Observation Carried Forward (LOCF)' },
              { value: 'mmrm', label: 'Mixed Model for Repeated Measures (MMRM)' },
              { value: 'multiple_imputation', label: 'Multiple Imputation' },
              { value: 'complete_case', label: 'Complete Case Analysis' },
              { value: 'pattern_mixture', label: 'Pattern Mixture Model' },
              { value: 'tipping_point', label: 'Tipping Point Analysis' },
              { value: 'return_to_baseline', label: 'Return to Baseline' },
            ],
            allowOther: {},
          },
          {
            id: 'alpha_level',
            label: 'Overall Alpha Level',
            type: 'text',
            placeholder: 'e.g., 0.05 (two-sided)',
            required: true,
          },
          {
            id: 'interim_analyses_performed',
            label: 'Were Interim Analyses Performed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'covariate_adjustment',
            label: 'Pre-Specified Covariate Adjustment',
            type: 'textarea',
            placeholder: 'e.g., Stratification factors (region, prior therapy) included as covariates in the primary model.',
            helpText: 'Per FDA Guidance "Adjusting for Covariates in Randomized Clinical Trials" (2023), pre-specified covariate-adjusted analyses can improve precision.',
          },
        ],
        branches: [
          {
            when: { field: 'interim_analyses_performed', operator: 'eq', value: true },
            goto: 'interim_analysis_detail',
          },
        ],
        defaultNext: 'benefit_risk_framework',
        issueChecks: [
          {
            id: 'locf_primary_analysis',
            condition: {
              field: 'handling_of_missing_data',
              operator: 'eq',
              value: 'locf',
            },
            severity: 'warning',
            title: 'LOCF Used as Primary Missing Data Method',
            message:
              'LOCF was used as the primary method for handling missing data. Per ICH E9 (FDA Guidance "E9 Statistical Principles for Clinical Trials", 1998), the ICH E9(R1) addendum and the NRC report "The Prevention and Treatment of Missing Data in Clinical Trials" (2010), LOCF makes strong assumptions that are rarely justified and can bias results in either direction. FDA generally prefers likelihood-based methods (e.g., MMRM) or multiple imputation as the primary analysis, with LOCF as a sensitivity analysis at most.',
            reference: 'ICH E9 (FDA Guidance, 1998); ICH E9(R1) Addendum; NRC Report on Missing Data (2010)',
          },
        ],
      },

      {
        id: 'interim_analysis_detail',
        section: 'stat_methods',
        question:
          'Provide details on the interim analysis/analyses performed.',
        guidance:
          'Per ICH E9 Section 4.5 and FDA Guidance "Adaptive Designs for Clinical Trials of Drugs and Biologics" (2019), interim analyses require pre-specification of the alpha-spending function (e.g., O\'Brien-Fleming, Lan-DeMets), the information fraction at each look, and documentation of whether the IDMC operated under a charter with firewall procedures. All interim results must be reported in the CSR per ICH E3 Section 11.4.2.3 (Interim Analyses and Data Monitoring).',
        fields: [
          {
            id: 'number_of_interim_analyses',
            label: 'Number of Interim Analyses',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'alpha_spending_function',
            label: 'Alpha-Spending Function',
            type: 'select',
            required: true,
            options: [
              { value: 'obrien_fleming', label: 'O\'Brien-Fleming' },
              { value: 'pocock', label: 'Pocock' },
              { value: 'lan_demets_of', label: 'Lan-DeMets (O\'Brien-Fleming spending)' },
              { value: 'lan_demets_pocock', label: 'Lan-DeMets (Pocock spending)' },
              { value: 'hwang_shih_decani', label: 'Hwang-Shih-DeCani' },
            ],
            allowOther: {},
          },
          {
            id: 'information_fraction',
            label: 'Information Fraction at Each Interim Look',
            type: 'text',
            placeholder: 'e.g., 50% (1st interim), 75% (2nd interim), 100% (final)',
          },
          {
            id: 'alpha_spent',
            label: 'Cumulative Alpha Spent',
            type: 'text',
            placeholder: 'e.g., 0.003 at 1st interim, 0.023 at 2nd interim',
            helpText: 'Per ICH E9 Section 4.5, the total alpha spent must not exceed the overall planned alpha.',
          },
          {
            id: 'idmc_oversight',
            label: 'Was an Independent Data Monitoring Committee (IDMC) Used?',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA Guidance "Establishment and Operation of Clinical Trial Data Monitoring Committees" (2006), an IDMC with a pre-specified charter is recommended when interim analyses are planned.',
          },
          {
            id: 'interim_results_summary',
            label: 'Interim Analysis Results Summary',
            type: 'textarea',
            placeholder: 'For each interim analysis, provide: date, information fraction, test statistic, p-value, boundary, and IDMC recommendation.',
            required: true,
          },
          {
            id: 'alpha_spending_exceeded',
            label: 'Did Alpha Spending Exceed the Planned Boundary?',
            type: 'yes_no',
          },
        ],
        defaultNext: 'benefit_risk_framework',
        issueChecks: [
          {
            id: 'alpha_spending_exceeded_check',
            condition: {
              field: 'alpha_spending_exceeded',
              operator: 'eq',
              value: true,
            },
            severity: 'critical',
            title: 'Interim Analysis Alpha Spending Exceeded Planned Boundary',
            message:
              'The cumulative alpha spent at an interim analysis exceeded the pre-planned alpha-spending boundary. This constitutes Type I error inflation and may compromise the integrity of the final analysis. Per ICH E9 Section 4.5, any deviation from the planned alpha-spending must be documented and justified. FDA may request additional sensitivity analyses or may discount the final p-value.',
            reference: 'ICH E9: Statistical Principles for Clinical Trials, Section 4.5',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 9 — Benefit-Risk & Regulatory Impact
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'benefit_risk_framework',
        section: 'benefit_risk_regulatory',
        question:
          'Provide a structured benefit-risk assessment for the investigational product.',
        guidance:
          'Per FDA Guidance "Benefit-Risk Assessment for New Drug and Biological Products" (2023) and the EMA Benefit-Risk Methodology Project (a separate EMA initiative, not a GVP module; GVP Module V covers risk management systems), the benefit-risk assessment should be structured, transparent, and systematic. The FDA framework considers four dimensions: (1) Analysis of Condition, (2) Current Treatment Options, (3) Benefit, and (4) Risk and Risk Management. NNT (number needed to treat) and NNH (number needed to harm) provide intuitive measures for clinicians and regulators.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'unmet_medical_need',
            label: 'Unmet Medical Need / Severity of Condition',
            type: 'select',
            required: true,
            options: [
              { value: 'life_threatening_no_treatment', label: 'Life-Threatening / No Available Treatment' },
              { value: 'serious_inadequate_treatment', label: 'Serious Condition / Inadequately Treated' },
              { value: 'serious_available_treatment', label: 'Serious Condition / Treatment Available' },
              { value: 'non_serious', label: 'Non-Serious Condition' },
            ],
            helpText: 'Per FDA, the severity of the condition and availability of alternatives directly informs the acceptable risk level.',
          },
          {
            id: 'comparison_to_soc',
            label: 'How Does the Benefit Compare to Standard of Care?',
            type: 'select',
            required: true,
            options: [
              { value: 'superior', label: 'Superior to SOC' },
              { value: 'non_inferior', label: 'Non-Inferior to SOC' },
              { value: 'similar', label: 'Similar to SOC (different mechanism/profile)' },
              { value: 'inferior', label: 'Inferior to SOC' },
              { value: 'no_direct_comparison', label: 'No Direct Head-to-Head Comparison' },
            ],
          },
          {
            id: 'nnt',
            label: 'Number Needed to Treat (NNT)',
            type: 'number',
            validation: { min: 1 },
            helpText: 'NNT = 1 / (absolute risk reduction). Lower NNT indicates greater benefit.',
          },
          {
            id: 'nnh',
            label: 'Number Needed to Harm (NNH)',
            type: 'number',
            validation: { min: 1 },
            helpText: 'NNH = 1 / (absolute risk increase for key safety outcome). Higher NNH indicates lower risk.',
          },
          {
            id: 'effect_size_contextualization',
            label: 'Effect Size Contextualization',
            type: 'textarea',
            placeholder: 'Place the observed treatment effect in the context of clinically meaningful thresholds, prior trials in the same indication, and regulatory precedent.',
            required: true,
          },
          {
            id: 'benefit_risk_conclusion',
            label: 'Overall Benefit-Risk Conclusion',
            type: 'textarea',
            placeholder: 'Provide a structured summary of the benefit-risk balance, weighing efficacy, safety, tolerability, and available alternatives.',
            required: true,
            validation: { minLength: 50, maxLength: 3000 },
          },
        ],
        defaultNext: 'regulatory_impact',
      },

      {
        id: 'regulatory_impact',
        section: 'benefit_risk_regulatory',
        question:
          'Describe the regulatory implications and post-marketing considerations.',
        guidance:
          'Per ICH E3 Section 13 and FDA Guidance "Format and Content of Proposed Risk Evaluation and Mitigation Strategies (REMS)" (2009, updated 2020), the CSR should address implications for product labeling (US Prescribing Information and EU SmPC), post-marketing commitments (PMCs) and post-marketing requirements (PMRs), REMS considerations, and pediatric development plans per the Pediatric Research Equity Act (PREA) and FDA Guidance "Pediatric Study Plans" (2020).',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'uspi_sections_affected',
            label: 'USPI Sections Likely Affected',
            type: 'multi_select',
            options: [
              { value: 'boxed_warning', label: 'Boxed Warning' },
              { value: 'indications', label: 'Indications and Usage (Section 1)' },
              { value: 'dosage', label: 'Dosage and Administration (Section 2)' },
              { value: 'warnings_precautions', label: 'Warnings and Precautions (Section 5)' },
              { value: 'adverse_reactions', label: 'Adverse Reactions (Section 6)' },
              { value: 'drug_interactions', label: 'Drug Interactions (Section 7)' },
              { value: 'use_in_specific_populations', label: 'Use in Specific Populations (Section 8)' },
              { value: 'clinical_studies', label: 'Clinical Studies (Section 14)' },
            ],
            helpText: 'Per 21 CFR 201.56-57, identify which sections of the USPI will be updated with data from this study.',
          },
          {
            id: 'rems_considerations',
            label: 'Is a REMS Likely to Be Required?',
            type: 'select',
            options: [
              { value: 'no_rems', label: 'No REMS anticipated' },
              { value: 'medication_guide', label: 'Medication Guide Only' },
              { value: 'communication_plan', label: 'Communication Plan' },
              { value: 'etasu', label: 'Elements to Assure Safe Use (ETASU)' },
              { value: 'full_rems', label: 'Full REMS (Medication Guide + ETASU + Implementation System)' },
            ],
            helpText: 'Per FDAAA 2007 (Section 505-1), REMS may be required if FDA determines it is necessary to ensure benefits outweigh risks.',
          },
          {
            id: 'post_marketing_commitments',
            label: 'Anticipated Post-Marketing Commitments/Requirements',
            type: 'textarea',
            placeholder: 'e.g., Long-term safety study (PMR), hepatic monitoring registry (PMC), QTc study (PMC)...',
            helpText: 'Per FDAAA 2007, PMRs are legally binding; PMCs are agreed-upon studies.',
          },
          {
            id: 'pediatric_extrapolation',
            label: 'Pediatric Extrapolation Feasibility',
            type: 'select',
            options: [
              { value: 'full_extrapolation', label: 'Full Extrapolation Feasible' },
              { value: 'partial_extrapolation', label: 'Partial Extrapolation (PK/efficacy bridge + safety study)' },
              { value: 'separate_study_needed', label: 'Separate Pediatric Efficacy Study Needed' },
              { value: 'not_applicable', label: 'Not Applicable (adult-only indication)' },
              { value: 'waiver', label: 'Pediatric Study Waiver Expected' },
            ],
            helpText: 'Per PREA and FDA Guidance "Pediatric Study Plans" (2020), a pediatric development strategy must be addressed unless a waiver is granted.',
          },
          {
            id: 'expedited_pathways',
            label: 'Expedited Regulatory Pathways',
            type: 'multi_select',
            options: [
              { value: 'breakthrough', label: 'Breakthrough Therapy Designation' },
              { value: 'fast_track', label: 'Fast Track Designation' },
              { value: 'accelerated_approval', label: 'Accelerated Approval' },
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'orphan_drug', label: 'Orphan Drug Designation' },
              { value: 'rmat', label: 'Regenerative Medicine Advanced Therapy (RMAT)' },
              { value: 'none', label: 'Standard Review' },
            ],
            helpText: 'Document any expedited programs or designations granted for this product/indication (Breakthrough Therapy, Fast Track, Accelerated Approval and RMAT under FD&C Act section 506; Priority Review). Orphan Drug designation (FD&C Act section 526, Orphan Drug Act 1983) is a designation, not an expedited program.',
          },
          {
            id: 'regulatory_strategy_notes',
            label: 'Additional Regulatory Strategy Notes',
            type: 'textarea',
            placeholder: 'e.g., Pre-NDA meeting planned Q2 2026, Advisory Committee meeting anticipated, rolling submission...',
          },
        ],
        defaultNext: 'study_conclusions',
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 10 — Conclusions
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'study_conclusions',
        section: 'conclusions',
        question:
          'What are the overall conclusions and next steps?',
        guidance:
          'ICH E3 Section 13 requires an overall interpretation of the study results, integrating the efficacy, safety, and benefit-risk findings into a coherent narrative. The conclusion must be supported by the data presented and should not overstate the findings. Per ICH E3 Section 13 (Discussion and Overall Conclusions), the CSR conclusion should address: (1) whether the study objectives were achieved; (2) clinical relevance of the findings; (3) how the results fit into the totality of evidence for the development program; and (4) implications for next steps.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'overall_conclusion',
            label: 'Overall Conclusion',
            type: 'textarea',
            placeholder: 'Summarize the overall study conclusions based on the efficacy and safety results.',
            required: true,
            validation: { minLength: 50, maxLength: 5000 },
          },
          {
            id: 'efficacy_conclusions',
            label: 'Efficacy Conclusions',
            type: 'textarea',
            required: false,
            placeholder: 'State whether the primary objective was met, citing the pre-specified primary analysis: the treatment effect estimate, its confidence interval and p-value, and whether sensitivity and key secondary analyses support it.',
            helpText: 'ICH E3 asks for efficacy conclusions at the end of the efficacy evaluation, separate from the safety conclusions and the overall discussion. They should rest on the pre-specified primary analysis (ICH E9), not on secondary or post-hoc results.',
          },
          {
            id: 'safety_conclusions',
            label: 'Safety Conclusions',
            type: 'textarea',
            required: false,
            placeholder: 'Summarise the overall safety and tolerability profile against the comparator: common and serious adverse events, deaths, discontinuations, laboratory findings, and any signal that warrants monitoring or label language.',
            helpText: 'ICH E3 asks for safety conclusions at the end of the safety evaluation, as an overall assessment of the safety data with attention to events leading to changes in dose, concomitant therapy, serious events and deaths.',
          },
          {
            id: 'study_objectives_achieved',
            label: 'Were All Study Objectives Achieved?',
            type: 'select',
            required: true,
            options: [
              { value: 'all_achieved', label: 'All Objectives Achieved' },
              { value: 'primary_achieved', label: 'Primary Objective Achieved, Some Secondary Not Met' },
              { value: 'not_achieved', label: 'Primary Objective Not Achieved' },
            ],
          },
          {
            id: 'benefit_risk_assessment',
            label: 'Integrated Benefit-Risk Statement',
            type: 'textarea',
            placeholder: 'Provide a concise integrated assessment of the benefit-risk profile suitable for inclusion in the CSR executive summary.',
            required: true,
            validation: { minLength: 50, maxLength: 3000 },
          },
          {
            id: 'totality_of_evidence',
            label: 'How Do These Results Fit the Totality of Evidence?',
            type: 'textarea',
            placeholder: 'Describe how this study fits with other studies in the program (e.g., confirmatory of Phase 2 results, consistent with prior trials, addresses a gap).',
          },
          {
            id: 'implications_for_next_steps',
            label: 'Implications for Next Steps',
            type: 'select',
            required: true,
            options: [
              { value: 'nda_bla_filing', label: 'Proceed to NDA/BLA Filing' },
              { value: 'supplemental_nda', label: 'Supplemental NDA/BLA (new indication or population)' },
              { value: 'confirmatory_study', label: 'Initiate Confirmatory Study' },
              { value: 'dose_optimization', label: 'Dose Optimization Study Needed' },
              { value: 'program_discontinuation', label: 'Discontinue Development Program' },
            ],
            allowOther: {},
          },
          {
            id: 'next_steps_detail',
            label: 'Next Steps Detail',
            type: 'textarea',
            placeholder: 'e.g., NDA filing planned Q3 2026 with rolling submission; pre-NDA meeting scheduled; Advisory Committee anticipated.',
          },
          {
            id: 'csr_format',
            label: 'CSR Format',
            type: 'select',
            required: true,
            defaultValue: 'ich_e3_full',
            options: [
              { value: 'ich_e3_full', label: 'ICH E3 Full Report' },
              { value: 'ich_e3_abbreviated', label: 'ICH E3 Abbreviated Report' },
              { value: 'synoptic', label: 'Synoptic Report' },
            ],
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
