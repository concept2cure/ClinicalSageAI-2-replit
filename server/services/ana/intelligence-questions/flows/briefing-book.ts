/**
 * FDA Briefing Document / Advisory Committee preparation flow definition
 * for the AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech/medtech sponsors through a comprehensive advisory
 * committee briefing document questionnaire covering committee overview,
 * background & unmet need, clinical development program, integrated safety,
 * benefit-risk assessment, questions for the committee, and presentation
 * strategy per FDA advisory committee guidance (21 CFR Part 14, FACA).
 *
 * 18 nodes · 80+ fields · 7 sections · 12 issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/briefing-book
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createBriefingBookFlow(): FlowDefinition {
  return {
    id: 'briefing-book-v1',
    category: 'briefing_book',
    name: 'Briefing Document',
    description:
      'Advisory Committee briefing document questionnaire covering background, clinical data presentation, benefit-risk framework, questions for the committee, and presentation strategy per FDA advisory committee guidance.',
    clientTypes: ['pharma', 'biotech', 'medtech'],
    entryNode: 'briefing_overview',
    estimatedMinutes: 45,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'briefing_overview_section',
        label: 'Briefing Overview',
        nodeIds: ['briefing_overview', 'meeting_context'],
      },
      {
        id: 'background_unmet_need',
        label: 'Background & Unmet Need',
        nodeIds: ['disease_overview', 'unmet_need_justification'],
      },
      {
        id: 'clinical_program',
        label: 'Clinical Development Program',
        nodeIds: ['program_overview', 'pivotal_study_design', 'efficacy_results'],
      },
      {
        id: 'integrated_safety',
        label: 'Integrated Safety',
        nodeIds: ['safety_database', 'adverse_events_summary', 'safety_subpopulations'],
      },
      {
        id: 'benefit_risk',
        label: 'Benefit-Risk Assessment',
        nodeIds: ['benefit_risk_framework', 'benefit_risk_summary'],
      },
      {
        id: 'committee_questions',
        label: 'Questions for the Committee',
        nodeIds: ['voting_questions', 'discussion_questions', 'anticipated_concerns'],
      },
      {
        id: 'presentation_strategy',
        label: 'Presentation Strategy',
        nodeIds: ['presentation_outline', 'speakers_and_visuals', 'contingency_planning'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 1 — Briefing Overview                                   */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'briefing_overview',
        section: 'briefing_overview_section',
        question:
          'Let\'s begin with the advisory committee meeting context. Which FDA advisory committee will review this product, and what is the purpose of the meeting?',
        guidance:
          'FDA advisory committees operate under 21 CFR Part 14 and the Federal Advisory Committee Act (FACA, 5 USC App. 2). Per FDA Guidance "Procedures for Meetings of the FDA Advisory Committees" (2017), the sponsor\'s briefing document is typically due to FDA 55 days before the advisory committee meeting and is made publicly available on the FDA website approximately 2 business days before the meeting. The briefing document must be a comprehensive, self-contained presentation of the data supporting the application. Reference: 21 CFR 14.25(c); FDA Manual of Policies and Procedures (MAPP) 6001.1.',
        fields: [
          {
            id: 'advisory_committee_type',
            label: 'Advisory Committee',
            type: 'select',
            required: true,
            options: [
              { value: 'odac', label: 'ODAC — Oncologic Drugs Advisory Committee', description: 'Reviews oncology drug applications and supplemental applications' },
              { value: 'crdac', label: 'CRDAC — Cardiovascular and Renal Drugs Advisory Committee', description: 'Reviews cardiovascular and renal drug applications' },
              { value: 'emdac', label: 'EMDAC — Endocrinologic and Metabolic Drugs Advisory Committee', description: 'Reviews endocrinology and metabolic disorder drugs' },
              { value: 'pcnsdac', label: 'PCNSDAC — Psychopharmacologic Drugs / Peripheral and CNS Drugs Advisory Committee', description: 'Reviews CNS and psychiatric drug applications' },
              { value: 'amdac', label: 'AMDAC — Antimicrobial Drugs Advisory Committee', description: 'Reviews anti-infective and antimicrobial drug applications' },
              { value: 'gacdac', label: 'GACDAC — Gastrointestinal Drugs Advisory Committee', description: 'Reviews gastrointestinal drug applications' },
              { value: 'aadpac', label: 'AADPAC — Anesthetic and Analgesic Drug Products Advisory Committee', description: 'Reviews anesthetic and analgesic drug applications' },
              { value: 'dac', label: 'DAC — Dermatologic and Ophthalmic Drugs Advisory Committee', description: 'Reviews dermatologic and ophthalmic drug applications' },
              { value: 'bpac', label: 'BPAC — Blood Products Advisory Committee', description: 'Reviews blood products and biologics' },
              { value: 'vrbpac', label: 'VRBPAC — Vaccines and Related Biological Products Advisory Committee', description: 'Reviews vaccines and related biologics' },
              { value: 'cdrh_panel', label: 'CDRH Device Panel', description: 'Device classification and PMA review panels under CDRH' },
              { value: 'other', label: 'Other Advisory Committee' },
            ],
          },
          {
            id: 'other_committee_name',
            label: 'Other Advisory Committee Name',
            type: 'text',
            placeholder: 'e.g., Arthritis Advisory Committee',
            visibleWhen: { field: 'advisory_committee_type', operator: 'eq', value: 'other' },
          },
          {
            id: 'meeting_purpose',
            label: 'Meeting Purpose',
            type: 'select',
            required: true,
            options: [
              { value: 'initial_approval', label: 'Initial NDA/BLA Approval', description: 'First marketing authorization for the product' },
              { value: 'supplemental_approval', label: 'Supplemental Approval (sNDA/sBLA)', description: 'New indication, population, or formulation' },
              { value: 'safety_review', label: 'Safety Review', description: 'Post-marketing safety signal or REMS evaluation' },
              { value: 'risk_benefit_reassessment', label: 'Risk-Benefit Reassessment', description: 'Reassessment of benefit-risk profile based on new data' },
              { value: 'accelerated_approval_confirmation', label: 'Accelerated Approval Confirmatory Review', description: 'Confirmatory trial results for an accelerated approval product' },
              { value: 'pediatric_review', label: 'Pediatric Application Review', description: 'Pediatric study results and labeling' },
            ],
          },
          {
            id: 'product_name',
            label: 'Product Under Review (Generic/Proprietary Name)',
            type: 'text',
            placeholder: 'e.g., pembrolizumab (KEYTRUDA)',
            required: true,
          },
          {
            id: 'application_number',
            label: 'NDA/BLA/PMA Number',
            type: 'text',
            placeholder: 'e.g., BLA 125514',
            helpText: 'The application number as assigned by FDA. Include the supplement number if applicable (e.g., BLA 125514/S-070).',
          },
          {
            id: 'proposed_indication',
            label: 'Proposed Indication',
            type: 'textarea',
            placeholder: 'e.g., Treatment of adult patients with unresectable or metastatic melanoma with disease progression following ipilimumab and, if BRAF V600 mutation positive, a BRAF inhibitor.',
            required: true,
            validation: { minLength: 20 },
          },
          {
            id: 'meeting_date',
            label: 'Advisory Committee Meeting Date',
            type: 'date',
            required: true,
            helpText: 'Per FDA MAPP 6001.1, the sponsor briefing document is due 55 days before the advisory committee meeting. FDA\'s own briefing document is typically posted 2 days before the meeting.',
          },
          {
            id: 'document_author',
            label: 'Sponsor vs. FDA Briefing Document',
            type: 'select',
            required: true,
            options: [
              { value: 'sponsor', label: 'Sponsor Briefing Document' },
              { value: 'fda', label: 'FDA Briefing Document (internal use)' },
              { value: 'joint', label: 'Joint Sponsor-FDA Document' },
            ],
          },
        ],
        defaultNext: 'meeting_context',
      },

      {
        id: 'meeting_context',
        section: 'briefing_overview_section',
        question:
          'What is the anticipated FDA position and regulatory context for this advisory committee meeting?',
        guidance:
          'Understanding the FDA\'s anticipated position is critical for framing the briefing document. Per 21 CFR 14.25, the advisory committee meeting notice in the Federal Register outlines the topics for discussion. FDA typically shares the questions for the committee in advance. The FDA\'s own pre-meeting assessment (documented in internal review memos and the FDA briefing document) reflects the reviewing division\'s analysis. Reference: FDA Guidance "Advisory Committee Meetings — Preparation and Public Availability of Information Given to Advisory Committee Members" (2008).',
        fields: [
          {
            id: 'fda_anticipated_position',
            label: 'Anticipated FDA Position',
            type: 'select',
            required: true,
            options: [
              { value: 'favorable', label: 'Favorable — FDA likely supportive of approval', description: 'Reviewing division signals are positive' },
              { value: 'mixed', label: 'Mixed — FDA has concerns but engagement is constructive', description: 'Some issues raised but pathway forward exists' },
              { value: 'unfavorable', label: 'Unfavorable — FDA has significant reservations', description: 'Reviewing division has raised major objections' },
              { value: 'unknown', label: 'Unknown — insufficient signal from FDA', description: 'No pre-meeting communication or ambiguous signals' },
            ],
          },
          {
            id: 'pre_meeting_fda_communication',
            label: 'Summary of Pre-Meeting FDA Communication',
            type: 'textarea',
            placeholder: 'e.g., FDA communicated via pre-meeting teleconference on [date] that the primary efficacy analysis was acceptable but raised concerns about the safety signal for hepatotoxicity. FDA requested additional subgroup analyses by age and baseline liver function.',
            helpText: 'Summarize any Type A, B, or C meetings, teleconferences, or written communications with the reviewing division relevant to the advisory committee discussion.',
          },
          {
            id: 'prior_ac_history',
            label: 'Prior Advisory Committee History for This Product',
            type: 'textarea',
            placeholder: 'e.g., No prior advisory committee meetings for this product. OR: ODAC met on [date] and voted 8-4 in favor of approval for the first-line indication.',
            helpText: 'Include any prior advisory committee votes, recommendations, or discussions related to this product or indication.',
          },
          {
            id: 'regulatory_pathway',
            label: 'Regulatory Pathway',
            type: 'multi_select',
            options: [
              { value: 'standard_review', label: 'Standard Review' },
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'accelerated_approval', label: 'Accelerated Approval (Subpart H/I)' },
              { value: 'breakthrough_therapy', label: 'Breakthrough Therapy Designation' },
              { value: 'fast_track', label: 'Fast Track Designation' },
              { value: 'rmat', label: 'RMAT Designation' },
              { value: 'orphan_drug', label: 'Orphan Drug Designation' },
            ],
            helpText: 'Expedited program designations per FDASIA 2012 and FDARA 2017. Accelerated approval under 21 CFR 314.500 (drugs) or 21 CFR 601.40 (biologics) requires use of a surrogate or intermediate clinical endpoint.',
          },
          {
            id: 'pdufa_date',
            label: 'PDUFA Action Date',
            type: 'date',
            helpText: 'The Prescription Drug User Fee Act (PDUFA) action date is typically 10 months (standard) or 6 months (priority review) from submission. Advisory committee meetings are generally scheduled 1-3 months before the PDUFA date.',
          },
        ],
        branches: [
          {
            when: { field: 'advisory_committee_type', operator: 'eq', value: 'odac' },
            goto: 'disease_overview',
          },
          {
            when: { field: 'advisory_committee_type', operator: 'eq', value: 'cdrh_panel' },
            goto: 'disease_overview',
          },
        ],
        defaultNext: 'disease_overview',
        provideExpertFeedback: true,
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 2 — Background & Unmet Need                            */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'disease_overview',
        section: 'background_unmet_need',
        question:
          'Provide an overview of the disease or condition under review. This section sets the clinical context for the advisory committee.',
        guidance:
          'The Background section of the briefing document should provide a concise but thorough overview of the disease or condition, its epidemiology, natural history, and the current standard of care. Per FDA Guidance "Providing Clinical Evidence of Effectiveness for Human Drug and Biological Products" (1998), the clinical context must support the proposed indication. Include ICD-10-CM classification, staging systems, and current NCCN/ASCO/AHA/ESC guidelines as applicable. Advisory committee members may include non-specialists, so the background must be accessible. Reference: 21 CFR 314.50(d)(5)(iv); ICH E10 "Choice of Control Group and Related Issues in Clinical Trials."',
        fields: [
          {
            id: 'disease_condition',
            label: 'Disease/Condition Name',
            type: 'text',
            placeholder: 'e.g., Non-Small Cell Lung Cancer (NSCLC)',
            required: true,
          },
          {
            id: 'disease_description',
            label: 'Disease/Condition Overview',
            type: 'textarea',
            placeholder: 'Provide a concise overview of the disease/condition, including pathophysiology, clinical manifestations, diagnostic criteria, and disease course.',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'prevalence_incidence',
            label: 'Prevalence/Incidence Data',
            type: 'textarea',
            placeholder: 'e.g., Approximately 235,000 new cases of NSCLC are diagnosed annually in the US, with 130,000 deaths per year. Worldwide incidence is approximately 2.2 million cases per year (GLOBOCAN 2020).',
            required: true,
            helpText: 'Include US-specific epidemiology data. Use SEER, CDC, or WHO GLOBOCAN data as sources. Cite the data year and source.',
          },
          {
            id: 'current_treatment_landscape',
            label: 'Current Treatment Landscape',
            type: 'textarea',
            placeholder: 'List currently approved therapies, standard-of-care regimens, and guideline recommendations (NCCN, ASCO, AHA, etc.).',
            required: true,
            validation: { minLength: 50 },
            helpText: 'Per ICH E10, the choice of comparator and positioning of the investigational product must be justified in the context of the existing treatment landscape.',
          },
          {
            id: 'disease_staging',
            label: 'Disease Staging or Classification System',
            type: 'text',
            placeholder: 'e.g., AJCC TNM 8th Edition, NYHA Functional Classification, Child-Pugh Score',
            helpText: 'Specify the staging or classification system used to define the target population.',
          },
        ],
        defaultNext: 'unmet_need_justification',
      },

      {
        id: 'unmet_need_justification',
        section: 'background_unmet_need',
        question:
          'Articulate the unmet medical need that the product addresses. This is a pivotal section for advisory committee persuasion.',
        guidance:
          'The unmet need argument is critical for advisory committee deliberation, particularly when the benefit-risk profile is marginal or the product uses an accelerated approval pathway. Per 21 CFR 314.500 (drugs) and 21 CFR 601.40 (biologics), accelerated approval requires demonstration that the product addresses an unmet need for a serious or life-threatening condition. FDA Guidance "Expedited Programs for Serious Conditions — Drugs and Biologics" (2014) defines "unmet medical need" as a condition whose treatment is not addressed adequately by available therapy. Reference: 21 USC 356; FDA Guidance "Expedited Programs" (2014); FDA Guidance "Rare Diseases" (2019).',
        fields: [
          {
            id: 'unmet_need_description',
            label: 'Unmet Medical Need Statement',
            type: 'textarea',
            placeholder: 'Describe what is inadequate about current therapy and why this product addresses that gap.',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'limitations_current_therapy',
            label: 'Limitations of Current Therapies',
            type: 'textarea',
            placeholder: 'e.g., Current first-line therapy (platinum-doublet chemotherapy) provides median PFS of only 5.5 months with significant toxicity including myelosuppression (Grade 3-4 in 40% of patients), nausea/vomiting, and peripheral neuropathy.',
            required: true,
          },
          {
            id: 'target_population',
            label: 'Target Patient Population',
            type: 'textarea',
            placeholder: 'Define the specific patient population eligible for the proposed indication, including biomarker requirements, prior therapy requirements, disease stage, etc.',
            required: true,
            helpText: 'The target population must align with the pivotal study population. Any extrapolation beyond the studied population must be justified.',
          },
          {
            id: 'clinical_significance',
            label: 'Clinical Significance of the Product',
            type: 'textarea',
            placeholder: 'e.g., This product offers a novel mechanism of action with demonstrated improvement in overall survival and a favorable tolerability profile compared to standard chemotherapy.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'patient_perspective',
            label: 'Patient Perspective on Unmet Need',
            type: 'textarea',
            placeholder: 'e.g., Patient advocacy organizations (e.g., LUNGevity Foundation) have identified the need for well-tolerated therapies that provide durable responses. Patient-reported outcome data from the pivotal trial supports meaningful quality-of-life improvement.',
            helpText: 'Per FDA PFDD Guidance "Patient-Focused Drug Development: Collecting Comprehensive and Representative Input" (2020), the patient voice should be integrated into the benefit-risk framework.',
          },
        ],
        defaultNext: 'program_overview',
        issueChecks: [
          {
            id: 'no_unmet_need_justification',
            condition: { field: 'unmet_need_description', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'No Unmet Medical Need Justification Provided',
            message:
              'The unmet medical need argument is critical for advisory committee deliberation. Per FDA Guidance "Expedited Programs for Serious Conditions" (2014), a clearly articulated unmet need strengthens the benefit-risk argument, particularly for products seeking accelerated approval.',
            reference: 'FDA Guidance: Expedited Programs for Serious Conditions (2014); 21 USC 356',
          },
        ],
        provideExpertFeedback: true,
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 3 — Clinical Development Program                        */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'program_overview',
        section: 'clinical_program',
        question:
          'Provide an overview of the clinical development program. How many studies support this application, and what was the overall development strategy?',
        guidance:
          'Per 21 CFR 314.50(d)(5) and ICH E8(R1) "General Considerations for Clinical Studies" (2021), the briefing document should include a clinical development program overview that describes the totality of evidence. FDA Guidance "Providing Clinical Evidence of Effectiveness for Human Drug and Biological Products" (1998) outlines the evidentiary standards, including the requirement for substantial evidence (typically two adequate and well-controlled studies, or one study with confirmatory evidence per 21 USC 355(d)). For accelerated approval products, describe the surrogate endpoint rationale per 21 CFR 314.500.',
        fields: [
          {
            id: 'total_studies',
            label: 'Total Number of Clinical Studies in the Development Program',
            type: 'number',
            required: true,
            validation: { min: 1, max: 100 },
            helpText: 'Include all Phase 1, 2, and 3 studies, as well as supportive studies (PK, special populations, etc.).',
          },
          {
            id: 'pivotal_study_count',
            label: 'Number of Pivotal (Registration) Studies',
            type: 'number',
            required: true,
            validation: { min: 1, max: 10 },
            helpText: 'Per 21 USC 355(d), substantial evidence of effectiveness typically requires two adequate and well-controlled studies. A single pivotal study may suffice if supported by a robust effect size, internal consistency, and supportive evidence (FDA Guidance 1998).',
          },
          {
            id: 'development_program_summary',
            label: 'Clinical Development Program Summary',
            type: 'textarea',
            placeholder: 'e.g., The development program consists of 14 clinical studies: 3 Phase 1 (dose escalation, food effect, DDI), 2 Phase 2 (dose-finding), 2 Phase 3 (pivotal KEYNOTE-024, confirmatory KEYNOTE-042), and 7 supportive studies.',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'dose_selection_rationale',
            label: 'Dose Selection Rationale for Pivotal Studies',
            type: 'textarea',
            placeholder: 'Describe how the dose used in pivotal studies was selected, including Phase 1/2 data, exposure-response analysis, and dose-finding study results.',
            required: true,
            helpText: 'Per ICH E4 "Dose-Response Information to Support Drug Registration" and FDA Guidance "Exposure-Response Relationships" (2003), the dose selection rationale must be supported by clinical pharmacology data.',
          },
          {
            id: 'clinical_pharmacology_overview',
            label: 'Clinical Pharmacology Overview',
            type: 'textarea',
            placeholder: 'Summarize key PK parameters, exposure-response relationships, drug-drug interaction potential, and special population PK.',
            helpText: 'Per ICH E5 "Ethnic Factors in the Acceptability of Foreign Clinical Data" and FDA Guidance "Population Pharmacokinetics" (2022), include relevant PK/PD data that supports the dosing recommendation.',
          },
        ],
        defaultNext: 'pivotal_study_design',
        issueChecks: [
          {
            id: 'single_pivotal_study_only',
            condition: { field: 'pivotal_study_count', operator: 'eq', value: 1 },
            severity: 'warning',
            title: 'Efficacy Data From Single Pivotal Study Only',
            message:
              'Per 21 USC 355(d), substantial evidence of effectiveness typically requires data from two adequate and well-controlled studies. Reliance on a single pivotal study is acceptable only when the study provides a large, robust, and internally consistent effect, particularly for overall survival endpoints. Be prepared for advisory committee scrutiny on the sufficiency of a single study.',
            reference: 'FDA Guidance: Providing Clinical Evidence of Effectiveness (1998); 21 USC 355(d)',
          },
        ],
      },

      {
        id: 'pivotal_study_design',
        section: 'clinical_program',
        question:
          'Describe the design of the pivotal study/studies. The study design will be a central topic of advisory committee discussion.',
        guidance:
          'Per 21 CFR 314.126, an adequate and well-controlled study must include: (1) a clear statement of objectives, (2) a summary of methods of analysis, (3) a design that permits valid comparison with a control (placebo, active comparator, dose-response, historical), (4) adequate measures to minimize bias, and (5) well-defined primary endpoints. ICH E9(R1) "Addendum on Estimands and Sensitivity Analysis in Clinical Trials" (2019) requires clear specification of the estimand. FDA will scrutinize the study design, including randomization, blinding, control arm, endpoint selection, and statistical analysis plan.',
        fields: [
          {
            id: 'pivotal_study_name',
            label: 'Pivotal Study Name/Identifier',
            type: 'text',
            placeholder: 'e.g., KEYNOTE-024 (NCT02142738)',
            required: true,
          },
          {
            id: 'study_design_type',
            label: 'Study Design',
            type: 'select',
            required: true,
            options: [
              { value: 'randomized_controlled', label: 'Randomized Controlled Trial (RCT)' },
              { value: 'single_arm', label: 'Single-Arm Study', description: 'Typically used for accelerated approval with response rate endpoint' },
              { value: 'crossover', label: 'Crossover Design' },
              { value: 'adaptive', label: 'Adaptive Design', description: 'Per FDA Guidance: Adaptive Designs for Clinical Trials of Drugs and Biologics (2019)' },
              { value: 'externally_controlled', label: 'Externally Controlled / Real-World Evidence', description: 'Per FDA Framework for RWE (2018)' },
            ],
          },
          {
            id: 'control_arm',
            label: 'Control Arm / Comparator',
            type: 'text',
            placeholder: 'e.g., Investigator choice of platinum-doublet chemotherapy',
            helpText: 'Per ICH E10, the choice of comparator must be justified. Active comparator trials require assay sensitivity assessment.',
          },
          {
            id: 'randomization_blinding',
            label: 'Randomization and Blinding',
            type: 'textarea',
            placeholder: 'e.g., 1:1 randomization, stratified by PD-L1 TPS (≥50% vs. <50%), ECOG PS (0 vs. 1), and geographic region. Open-label with blinded independent central review (BICR) for response assessment.',
            required: true,
          },
          {
            id: 'primary_endpoint',
            label: 'Primary Endpoint',
            type: 'textarea',
            placeholder: 'e.g., Overall Survival (OS), defined as time from randomization to death from any cause.',
            required: true,
            helpText: 'Per ICH E9, the primary endpoint must be clearly defined and clinically meaningful. For oncology, FDA Guidance "Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics" (2018) specifies acceptable primary endpoints.',
          },
          {
            id: 'secondary_endpoints',
            label: 'Key Secondary Endpoints',
            type: 'textarea',
            placeholder: 'e.g., Progression-Free Survival (PFS) per RECIST v1.1 by BICR, Objective Response Rate (ORR), Duration of Response (DOR), Patient-Reported Outcomes (EORTC QLQ-C30).',
            required: true,
          },
          {
            id: 'sample_size',
            label: 'Sample Size and Power',
            type: 'textarea',
            placeholder: 'e.g., 305 patients enrolled; study powered at 90% to detect a hazard ratio of 0.65 for OS at a two-sided alpha of 0.05, requiring approximately 200 OS events.',
            required: true,
          },
          {
            id: 'study_population',
            label: 'Study Population (Key Eligibility Criteria)',
            type: 'textarea',
            placeholder: 'e.g., Adults ≥18 years with histologically confirmed stage IV NSCLC, PD-L1 TPS ≥50%, no prior systemic therapy for advanced disease, ECOG PS 0-1, measurable disease per RECIST v1.1.',
            required: true,
          },
        ],
        defaultNext: 'efficacy_results',
      },

      {
        id: 'efficacy_results',
        section: 'clinical_program',
        question:
          'Present the key efficacy results from the pivotal study/studies. This is the core data the advisory committee will evaluate.',
        guidance:
          'Per 21 CFR 314.50(d)(5)(vi) and ICH E9(R1), efficacy results must be presented with the pre-specified primary analysis, sensitivity analyses, and subgroup analyses. FDA Guidance "Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics" (2018) specifies standards for oncology endpoint assessment. Present hazard ratios with 95% confidence intervals, Kaplan-Meier curves, and forest plots for subgroup analyses. For surrogate endpoints under accelerated approval (21 CFR 314.500), describe the surrogate-to-clinical outcome relationship. Advisory committee members will scrutinize the magnitude, durability, and clinical meaningfulness of the efficacy signal.',
        fields: [
          {
            id: 'primary_efficacy_result',
            label: 'Primary Endpoint Result',
            type: 'textarea',
            placeholder: 'e.g., Median OS: 30.0 months (treatment) vs. 14.2 months (control); HR 0.63 (95% CI: 0.47-0.86); p=0.003. Median follow-up: 25.2 months.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'secondary_efficacy_results',
            label: 'Key Secondary Endpoint Results',
            type: 'textarea',
            placeholder: 'e.g., PFS: median 10.3 vs. 6.0 months (HR 0.50, 95% CI 0.37-0.68); ORR: 44.8% vs. 27.8% (p<0.001); DOR: median 23.1 vs. 6.3 months.',
            required: true,
          },
          {
            id: 'subgroup_analyses',
            label: 'Key Subgroup Analysis Results',
            type: 'textarea',
            placeholder: 'Describe efficacy results in key subgroups (age, sex, race/ethnicity, biomarker status, disease stage, prior therapy). Include forest plot data.',
            required: true,
            helpText: 'Per ICH E9(R1) and FDA Guidance "Evaluation of Sex-Specific Data" (2020), subgroup analyses should assess consistency of treatment effect across demographics and baseline characteristics.',
          },
          {
            id: 'data_cutoff_date',
            label: 'Data Cutoff Date',
            type: 'date',
            required: true,
          },
          {
            id: 'data_maturity',
            label: 'Data Maturity (for time-to-event endpoints)',
            type: 'text',
            placeholder: 'e.g., OS events: 188/305 (61.6% maturity); Median follow-up: 25.2 months',
            helpText: 'For time-to-event endpoints, describe the event count, maturity, and median follow-up duration. Immature data may result in advisory committee concern.',
          },
          {
            id: 'clinical_meaningfulness',
            label: 'Clinical Meaningfulness Assessment',
            type: 'textarea',
            placeholder: 'Describe why the observed treatment effect is clinically meaningful (e.g., magnitude of OS benefit, quality of life improvement, patient-reported outcomes).',
            required: true,
            helpText: 'Per FDA Guidance "Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics" (2018), clinical meaningfulness encompasses the magnitude, durability, and patient impact of the treatment effect.',
          },
        ],
        defaultNext: 'safety_database',
        provideExpertFeedback: true,
        issueChecks: [
          {
            id: 'no_subgroup_analyses',
            condition: { field: 'subgroup_analyses', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'No Subgroup Analyses Provided',
            message:
              'Subgroup analyses are essential for advisory committee review. Per ICH E9(R1) and FDA Guidance "Evaluation of Sex-Specific Data" (2020), treatment effect consistency across demographics (age, sex, race, biomarker status) must be evaluated. Advisory committees routinely request forest plots of subgroup results.',
            reference: 'ICH E9(R1); FDA Guidance: Evaluation of Sex-Specific Data (2020)',
          },
          {
            id: 'surrogate_endpoint_concern',
            condition: { field: 'data_maturity', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'Data Maturity Not Specified for Time-to-Event Endpoint',
            message:
              'For time-to-event endpoints (OS, PFS), the data maturity (event count and percentage) and median follow-up duration must be reported. Immature data may undermine the efficacy argument before the advisory committee, particularly for OS endpoints.',
            reference: 'FDA Guidance: Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics (2018); ICH E9(R1)',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 4 — Integrated Safety                                   */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'safety_database',
        section: 'integrated_safety',
        question:
          'Describe the integrated safety database. The size and scope of the safety database will be central to the advisory committee\'s assessment.',
        guidance:
          'Per ICH E1 "The Extent of Population Exposure to Assess Clinical Safety" and FDA Guidance "Premarketing Risk Assessment" (2005), the safety database must include adequate numbers of patients exposed for sufficient duration. ICH E1 recommends a minimum of 1,500 patients exposed to the proposed dose, with at least 300-600 exposed for 6 months and 100 exposed for 1 year, depending on the intended duration of use. Per ICH E2E "Pharmacovigilance Planning," the safety specification should integrate data across all studies. Reference: 21 CFR 314.50(d)(5)(vi)(a); ICH E1; ICH E2E; FDA Guidance "Premarketing Risk Assessment" (2005).',
        fields: [
          {
            id: 'total_patients_exposed',
            label: 'Total Number of Patients Exposed to the Product',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText: 'Include patients from all clinical studies in the development program who received at least one dose.',
          },
          {
            id: 'patient_years_exposure',
            label: 'Total Patient-Years of Exposure',
            type: 'text',
            placeholder: 'e.g., 2,847 patient-years',
            required: true,
          },
          {
            id: 'exposure_duration',
            label: 'Exposure Duration Summary',
            type: 'textarea',
            placeholder: 'e.g., Median duration of exposure: 8.3 months (range: 1 day to 36 months). Patients exposed ≥6 months: 820 (54.7%); ≥12 months: 410 (27.3%); ≥24 months: 195 (13.0%).',
            required: true,
            helpText: 'Per ICH E1, present the number of patients exposed for various durations, particularly ≥6 months and ≥12 months.',
          },
          {
            id: 'safety_pool_description',
            label: 'Studies Included in the Integrated Safety Pool',
            type: 'textarea',
            placeholder: 'List the studies included in the integrated safety analysis, with study identifiers, designs, and patient counts.',
            required: true,
          },
          {
            id: 'comparator_safety_pool',
            label: 'Comparator/Control Arm Safety Data Available?',
            type: 'yes_no',
            required: true,
            helpText: 'Controlled safety data (treatment vs. comparator) is preferred for characterizing the safety profile. Single-arm studies provide less robust safety context.',
          },
        ],
        defaultNext: 'adverse_events_summary',
        issueChecks: [
          {
            id: 'no_integrated_safety_summary',
            condition: { field: 'total_patients_exposed', operator: 'lt', value: 100 },
            severity: 'critical',
            title: 'Insufficient Integrated Safety Database',
            message:
              'Per ICH E1, the safety database for a new drug application should include at least 1,500 patients exposed at the proposed dose for non-life-threatening conditions, or at least 300-600 patients for serious or life-threatening conditions with limited treatment options. A database of fewer than 100 patients is likely to be considered insufficient by the advisory committee.',
            reference: 'ICH E1; FDA Guidance: Premarketing Risk Assessment (2005); 21 CFR 314.50(d)(5)(vi)(a)',
          },
        ],
      },

      {
        id: 'adverse_events_summary',
        section: 'integrated_safety',
        question:
          'Summarize the adverse event profile from the integrated safety database. Include common AEs, serious AEs, deaths, and AEs of special interest.',
        guidance:
          'Per ICH E2D "Post-Approval Safety Data Management" and 21 CFR 314.50(d)(5)(vi)(a), the safety summary must include: (1) common adverse events (typically those occurring in ≥5% or ≥10% of patients), (2) all serious adverse events (SAEs), (3) all deaths and their causes, (4) dose modifications and discontinuations due to AEs, and (5) adverse events of special interest (AESIs) based on the product\'s pharmacological class and safety signals. Present AE data using MedDRA preferred terms and system organ classes. FDA advisory committee members will focus on the severity, reversibility, and manageability of safety signals.',
        fields: [
          {
            id: 'common_aes',
            label: 'Most Common Adverse Events (≥10% incidence)',
            type: 'textarea',
            placeholder: 'List the most common AEs by MedDRA preferred term with incidence rates for treatment and control arms (e.g., Fatigue: 34.2% vs. 28.1%; Nausea: 22.5% vs. 18.3%).',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'grade_3_4_aes',
            label: 'Grade 3-4 (Severe/Life-Threatening) Adverse Events',
            type: 'textarea',
            placeholder: 'List Grade 3-4 AEs by MedDRA preferred term with incidence rates. Use CTCAE v5.0 grading.',
            required: true,
          },
          {
            id: 'serious_adverse_events',
            label: 'Serious Adverse Events Summary',
            type: 'textarea',
            placeholder: 'e.g., Overall SAE rate: 28.5% (treatment) vs. 19.2% (control). Most common SAEs: Pneumonia (5.2% vs. 3.1%), Pneumonitis (3.8% vs. 0.5%).',
            required: true,
          },
          {
            id: 'deaths_summary',
            label: 'Deaths Summary',
            type: 'textarea',
            placeholder: 'e.g., Deaths on treatment or within 30 days of last dose: 45 (12.0%) treatment vs. 52 (17.3%) control. Treatment-related deaths: 3 (0.8%) treatment vs. 1 (0.3%) control. Causes: pneumonitis (2), hepatotoxicity (1).',
            required: true,
          },
          {
            id: 'aesi_list',
            label: 'Adverse Events of Special Interest (AESIs)',
            type: 'textarea',
            placeholder: 'e.g., Immune-mediated adverse events: pneumonitis (3.8%), colitis (1.7%), hepatitis (1.2%), thyroid disorders (12.5%), nephritis (0.5%). Infusion-related reactions (2.3%).',
            required: true,
            helpText: 'AESIs are defined based on the pharmacological class, mechanism of action, nonclinical findings, and safety signals identified during the development program.',
          },
          {
            id: 'discontinuations_due_to_aes',
            label: 'Discontinuations Due to Adverse Events',
            type: 'textarea',
            placeholder: 'e.g., Discontinuations due to AEs: 13.5% (treatment) vs. 8.2% (control). Most common reasons: pneumonitis (2.1%), hepatotoxicity (1.5%).',
            required: true,
          },
          {
            id: 'risk_management_measures',
            label: 'Risk Management Measures',
            type: 'textarea',
            placeholder: 'Describe implemented risk management measures, including monitoring guidelines, dose modification algorithms, contraindications, and any proposed REMS.',
            helpText: 'Per 21 CFR 314.520 and FDA Guidance "REMS" (2018), a Risk Evaluation and Mitigation Strategy may be required if FDA determines that a REMS is necessary to ensure the benefits outweigh the risks.',
          },
        ],
        defaultNext: 'safety_subpopulations',
        issueChecks: [
          {
            id: 'no_risk_management_measures',
            condition: { field: 'risk_management_measures', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'No Risk Management Measures Described',
            message:
              'Risk management measures (monitoring guidelines, dose modification algorithms, contraindications, REMS) are an essential component of the safety narrative for advisory committee review. Per 21 CFR 314.520, FDA may require a REMS. The sponsor should proactively present risk mitigation strategies.',
            reference: '21 CFR 314.520; FDA Guidance: REMS (2018); FDA Benefit-Risk Framework (PDUFA VI)',
          },
          {
            id: 'no_death_summary',
            condition: { field: 'deaths_summary', operator: 'eq', value: '' },
            severity: 'critical',
            title: 'No Deaths Summary Provided',
            message:
              'A thorough accounting of all deaths (on-treatment and follow-up) is mandatory for the safety section of the briefing document. Advisory committee members will expect a complete deaths analysis with causes, treatment-relatedness assessment, and comparison to the control arm.',
            reference: '21 CFR 314.50(d)(5)(vi)(a); ICH E2D; FDA Guidance: Safety Reporting Requirements for INDs and BA/BE Studies (2012)',
          },
        ],
      },

      {
        id: 'safety_subpopulations',
        section: 'integrated_safety',
        question:
          'Describe the safety profile in key subpopulations and provide long-term safety data. Advisory committees frequently focus on safety in vulnerable populations.',
        guidance:
          'Per ICH E7 "Studies in Support of Special Populations: Geriatrics," ICH E5 "Ethnic Factors," and FDA Guidance "Collection of Race and Ethnicity Data in Clinical Trials" (2016), safety data must be presented by age, sex, race/ethnicity, and organ function status. Per ICH E1, long-term safety data should be available for chronic-use products. Advisory committee members will specifically evaluate whether the safety profile is acceptable across all populations included in the proposed indication. Reference: 21 CFR 314.50(d)(5)(vi)(a); ICH E7; ICH E5; FDA Guidance "Evaluation of Sex-Specific Data" (2020).',
        fields: [
          {
            id: 'safety_by_age',
            label: 'Safety by Age Group',
            type: 'textarea',
            placeholder: 'e.g., Patients ≥65 years: higher incidence of Grade 3-4 AEs (42% vs. 33% in <65 years). No clinically meaningful differences in SAE profile. Dose modifications more frequent in ≥75 years (28% vs. 15%).',
            required: true,
          },
          {
            id: 'safety_by_sex',
            label: 'Safety by Sex',
            type: 'textarea',
            placeholder: 'e.g., No clinically meaningful differences in AE profile between males and females. Immune-mediated thyroid disorders more common in females (16.5% vs. 9.2%).',
          },
          {
            id: 'safety_by_race',
            label: 'Safety by Race/Ethnicity',
            type: 'textarea',
            placeholder: 'e.g., Safety profile was generally consistent across racial/ethnic subgroups. Asian patients had a higher incidence of hepatotoxicity (4.2% vs. 1.5% in non-Asian patients).',
            helpText: 'Per FDA Guidance "Collection of Race and Ethnicity Data in Clinical Trials" (2016), safety data should be analyzed by race and ethnicity using OMB categories.',
          },
          {
            id: 'safety_organ_impairment',
            label: 'Safety in Renal/Hepatic Impairment',
            type: 'textarea',
            placeholder: 'Describe safety data in patients with baseline renal or hepatic impairment, including any dose adjustment recommendations.',
          },
          {
            id: 'long_term_safety',
            label: 'Long-Term Safety Data',
            type: 'textarea',
            placeholder: 'e.g., In patients with ≥24 months of exposure (N=195), no new safety signals were identified. Late-onset immune-mediated AEs occurred at a rate of 2.1 per 100 patient-years.',
            helpText: 'Per ICH E1, long-term safety data is particularly important for chronic-use products.',
          },
        ],
        defaultNext: 'benefit_risk_framework',
        issueChecks: [
          {
            id: 'missing_subpopulation_data',
            condition: { field: 'safety_by_age', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'Missing Subpopulation Safety Data',
            message:
              'Safety data by age group is expected for advisory committee review. Per ICH E7 and FDA Guidance "Evaluation of Sex-Specific Data" (2020), failure to present subpopulation safety analyses may raise concerns about the generalizability of the safety profile.',
            reference: 'ICH E7; ICH E5; FDA Guidance: Collection of Race and Ethnicity Data (2016)',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 5 — Benefit-Risk Assessment                             */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'benefit_risk_framework',
        section: 'benefit_risk',
        question:
          'Present the structured benefit-risk assessment. FDA expects use of its Benefit-Risk Framework for this analysis.',
        guidance:
          'Per FDA "Benefit-Risk Assessment in Drug Regulatory Decision-Making" (PDUFA VI commitment, 2018) and FDA "Structured Approach to Benefit-Risk Assessment in Drug Regulatory Decision-Making" (NUREG), FDA uses a structured benefit-risk framework with five dimensions: (1) Analysis of Condition, (2) Current Treatment Options, (3) Benefit, (4) Risk, and (5) Risk Management. The framework is documented using a Benefit-Risk Assessment Table. Advisory committees will evaluate whether the benefits outweigh the risks for the proposed indication and population. For devices, the framework follows "Factors to Consider Regarding Benefit-Risk in Medical Device Product Availability, Compliance, and Enforcement Decisions" (2016). Reference: FDA PDUFA VI Benefit-Risk Framework; ICH E1; 21 CFR 314.50(d)(5)(viii).',
        fields: [
          {
            id: 'analysis_of_condition',
            label: 'Analysis of Condition (Severity, Morbidity, Mortality)',
            type: 'textarea',
            placeholder: 'Describe the severity and natural history of the disease/condition, including untreated outcomes, impact on patient function, and mortality data.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'evidence_of_benefit',
            label: 'Evidence of Benefit (Magnitude, Durability, Clinical Meaningfulness)',
            type: 'textarea',
            placeholder: 'Summarize the magnitude of benefit (e.g., HR for OS, absolute difference in response rate), durability (e.g., DOR, landmark survival rates), and clinical meaningfulness (PROs, symptom improvement).',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'characterization_of_risk',
            label: 'Characterization of Risk (Severity, Reversibility, Preventability)',
            type: 'textarea',
            placeholder: 'Characterize the key risks: severity of AEs, reversibility (e.g., immune-mediated AEs resolve with corticosteroids), preventability (monitoring, dose modification), and risk mitigation strategies.',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'risk_management_framework',
            label: 'Risk Management Strategies',
            type: 'textarea',
            placeholder: 'Describe risk management measures including labeling recommendations, monitoring requirements, REMS (if proposed), contraindications, and patient education materials.',
            required: true,
          },
          {
            id: 'comparison_to_available_therapies',
            label: 'Benefit-Risk Comparison to Available Therapies',
            type: 'textarea',
            placeholder: 'Compare the benefit-risk profile of the proposed product to currently available therapies, including direct comparisons (if available) and indirect comparisons (cross-trial, network meta-analysis).',
            required: true,
            helpText: 'Per ICH E10, justify the positioning of the investigational product relative to the standard of care.',
          },
          {
            id: 'benefit_risk_conclusion',
            label: 'Benefit-Risk Conclusion',
            type: 'textarea',
            placeholder: 'e.g., The benefit-risk profile of [product] is favorable for the proposed indication based on: (1) clinically meaningful improvement in OS with a hazard ratio of 0.63, (2) manageable and predictable safety profile with established management guidelines, and (3) an unmet need in the target population.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'is_device_panel',
            label: 'Is this a device panel requiring device-specific benefit-risk?',
            type: 'yes_no',
            defaultValue: false,
            helpText: 'Device panels under CDRH use a different benefit-risk framework per FDA "Factors to Consider Regarding Benefit-Risk in Medical Device Product Availability" (2016).',
          },
        ],
        branches: [
          {
            when: { field: 'is_device_panel', operator: 'eq', value: true },
            goto: 'benefit_risk_summary',
          },
        ],
        defaultNext: 'benefit_risk_summary',
        issueChecks: [
          {
            id: 'no_benefit_risk_framework',
            condition: { field: 'evidence_of_benefit', operator: 'eq', value: '' },
            severity: 'critical',
            title: 'No Benefit-Risk Framework Provided',
            message:
              'FDA\'s structured benefit-risk framework is a mandatory component of advisory committee briefing documents. Per the PDUFA VI Benefit-Risk Framework, the sponsor must address all five dimensions (Analysis of Condition, Current Treatment Options, Benefit, Risk, Risk Management). Failure to present a structured benefit-risk assessment will significantly weaken the sponsor\'s position before the advisory committee.',
            reference: 'FDA Benefit-Risk Framework (PDUFA VI); FDA Guidance: Benefit-Risk Assessment in Drug Regulatory Decision-Making (2018)',
          },
        ],
      },

      {
        id: 'benefit_risk_summary',
        section: 'benefit_risk',
        question:
          'Provide the final benefit-risk summary table and any additional considerations for the advisory committee\'s deliberation.',
        guidance:
          'The Benefit-Risk Summary Table is a key component of the FDA\'s structured benefit-risk framework. Per PDUFA VI commitments, FDA reviewers prepare their own benefit-risk table as part of the review. The sponsor\'s briefing document should include a parallel benefit-risk table to facilitate comparison. The table should present evidence across all five framework dimensions in a concise, visual format. For accelerated approval products (21 CFR 314.500), address the certainty of evidence and post-marketing commitments. Reference: FDA PDUFA VI Benefit-Risk Framework; 21 CFR 314.500; 21 CFR 601.40.',
        fields: [
          {
            id: 'benefit_risk_table_prepared',
            label: 'Has a Structured Benefit-Risk Summary Table Been Prepared?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'uncertainty_factors',
            label: 'Key Uncertainties and Limitations',
            type: 'textarea',
            placeholder: 'e.g., (1) Immature OS data with 61.6% event maturity; (2) Limited data in patients ≥75 years; (3) No head-to-head comparison with immunotherapy combinations; (4) Surrogate endpoint (ORR) not yet validated for clinical benefit.',
            required: true,
          },
          {
            id: 'post_marketing_commitments',
            label: 'Proposed Post-Marketing Studies/Commitments',
            type: 'textarea',
            placeholder: 'e.g., (1) Confirmatory Phase 3 study (Study XYZ) with OS primary endpoint, enrollment target Q3 2024; (2) Post-marketing registry for long-term safety surveillance; (3) Pediatric study per iPSP.',
            helpText: 'Per 21 CFR 314.81(b)(2)(vii) and FDA Guidance "Postmarketing Studies and Clinical Trials" (2011), post-marketing commitments may be required as conditions of approval.',
          },
          {
            id: 'rems_proposed',
            label: 'Is a REMS Being Proposed?',
            type: 'select',
            options: [
              { value: 'yes_rems', label: 'Yes — REMS proposed by sponsor' },
              { value: 'fda_required', label: 'Yes — REMS required by FDA' },
              { value: 'no', label: 'No REMS anticipated' },
              { value: 'under_discussion', label: 'Under discussion with FDA' },
            ],
            helpText: 'Per 21 CFR 314.520 and the FDAAA 2007, FDA may require a REMS if it determines that one is necessary to ensure the benefits of a drug outweigh its risks.',
          },
        ],
        defaultNext: 'voting_questions',
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 6 — Questions for the Committee                         */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'voting_questions',
        section: 'committee_questions',
        question:
          'Draft the proposed voting questions for the advisory committee. Voting questions determine the committee\'s formal recommendation.',
        guidance:
          'Per 21 CFR 14.25(c) and FDA MAPP 6001.1, the advisory committee votes on specific questions posed by FDA. While FDA formulates the final questions, the sponsor can propose questions that align with the application\'s strengths. Voting questions typically address: (1) whether the efficacy data are adequate, (2) whether the safety data are adequate, (3) whether the benefits outweigh the risks, and (4) whether a REMS is needed. For accelerated approval products, questions may address the adequacy of the surrogate endpoint and the confirmatory trial plan. Reference: 21 CFR 14.25; 21 CFR 14.31(b); FDA MAPP 6001.1.',
        fields: [
          {
            id: 'efficacy_voting_question',
            label: 'Proposed Efficacy Voting Question',
            type: 'textarea',
            placeholder: 'e.g., "Do the available data from Study KEYNOTE-024 provide substantial evidence of the effectiveness of [product] for the treatment of [indication]?"',
            required: true,
            helpText: 'The efficacy question should reference the specific study/studies and indication. Use language consistent with 21 USC 355(d) ("substantial evidence of effectiveness").',
          },
          {
            id: 'safety_voting_question',
            label: 'Proposed Safety Voting Question',
            type: 'textarea',
            placeholder: 'e.g., "Do the available safety data adequately characterize the safety profile of [product] for the proposed indication and population?"',
            required: true,
          },
          {
            id: 'benefit_risk_voting_question',
            label: 'Proposed Benefit-Risk Voting Question',
            type: 'textarea',
            placeholder: 'e.g., "Considering the totality of the efficacy and safety data, do the benefits of [product] outweigh its risks for the proposed indication?"',
            required: true,
          },
          {
            id: 'rems_voting_question',
            label: 'Proposed REMS Voting Question (if applicable)',
            type: 'textarea',
            placeholder: 'e.g., "If the committee recommends approval, should FDA require a REMS to ensure the benefits of [product] outweigh the risks?"',
            helpText: 'A REMS question is typically included when there are significant safety concerns that may require risk mitigation beyond standard labeling.',
          },
          {
            id: 'additional_voting_questions',
            label: 'Additional Proposed Voting Questions',
            type: 'textarea',
            placeholder: 'e.g., questions about specific subpopulations, accelerated approval endpoints, or post-marketing requirements.',
          },
        ],
        defaultNext: 'discussion_questions',
        issueChecks: [
          {
            id: 'no_voting_questions',
            condition: { field: 'efficacy_voting_question', operator: 'eq', value: '' },
            severity: 'critical',
            title: 'No Voting Questions Proposed',
            message:
              'Voting questions are the centerpiece of the advisory committee meeting. While FDA ultimately determines the questions, the sponsor should propose questions that frame the data favorably. Failure to anticipate the voting questions leaves the sponsor unprepared for the committee\'s formal deliberation.',
            reference: '21 CFR 14.25(c); FDA MAPP 6001.1; FDA Guidance: Advisory Committee Meetings (2008)',
          },
        ],
      },

      {
        id: 'discussion_questions',
        section: 'committee_questions',
        question:
          'Draft the proposed discussion questions and identify key opinion leader alignment. Discussion questions shape the committee\'s open deliberation.',
        guidance:
          'Per FDA MAPP 6001.1, the advisory committee meeting typically includes an open discussion period where committee members raise questions, express concerns, and discuss the data. Discussion questions are broader than voting questions and may address clinical trial design, statistical methodology, safety signal interpretation, labeling language, and post-marketing requirements. Per 21 CFR 14.29, meetings may include open public hearing sessions where patients, caregivers, and advocates provide testimony. Reference: 21 CFR 14.29; 21 CFR 14.31; FDA Guidance "Advisory Committee Meetings" (2008).',
        fields: [
          {
            id: 'discussion_question_1',
            label: 'Discussion Question 1',
            type: 'textarea',
            placeholder: 'e.g., "What is the clinical significance of the observed improvement in PFS in the context of the overall survival benefit?"',
            required: true,
          },
          {
            id: 'discussion_question_2',
            label: 'Discussion Question 2',
            type: 'textarea',
            placeholder: 'e.g., "Are the proposed risk management measures adequate to mitigate the identified safety risks?"',
          },
          {
            id: 'discussion_question_3',
            label: 'Discussion Question 3',
            type: 'textarea',
            placeholder: 'e.g., "Is the proposed labeling language appropriate for the target prescribing population?"',
          },
          {
            id: 'kol_alignment',
            label: 'Key Opinion Leader (KOL) Alignment',
            type: 'textarea',
            placeholder: 'e.g., Dr. [Name], [Institution] — served as PI for the pivotal study, supportive of the data and proposed indication. Dr. [Name], [Institution] — leading expert in [disease area], has expressed support for the unmet need argument.',
            helpText: 'Identify KOLs who may serve as advisory committee members, invited speakers, or public hearing presenters. Note any potential conflicts of interest per 18 USC 208 and FDA COI waivers.',
          },
          {
            id: 'patient_advocacy_input',
            label: 'Patient Advocacy Organization Input',
            type: 'textarea',
            placeholder: 'e.g., [Organization Name] plans to submit written testimony and present during the open public hearing. Key message: patients with [condition] have limited options and are willing to accept the identified risks given the meaningful benefit.',
            helpText: 'Per 21 CFR 14.29, the open public hearing allows patients, caregivers, and advocates to provide testimony. Coordinate with patient advocacy organizations to ensure effective representation.',
          },
        ],
        defaultNext: 'anticipated_concerns',
      },

      {
        id: 'anticipated_concerns',
        section: 'committee_questions',
        question:
          'What are the anticipated advisory committee concerns, and how will the sponsor respond? Pre-emptive responses to likely objections are essential.',
        guidance:
          'Advisory committee meetings are adversarial by design — FDA statisticians and medical officers may present analyses that challenge the sponsor\'s conclusions. Per 21 CFR 14.25, both the sponsor and FDA present their data and analyses, and committee members question both parties. Common areas of challenge include: statistical methodology (multiplicity adjustments, missing data handling), subgroup inconsistencies, safety signal interpretation, comparability of study populations to the real-world setting, and the adequacy of the benefit-risk assessment. The sponsor should prepare pre-emptive responses (backup slides, supplementary analyses) for all anticipated challenges. Reference: 21 CFR 14.25; 21 CFR 14.31.',
        fields: [
          {
            id: 'anticipated_concern_1',
            label: 'Anticipated Concern 1',
            type: 'textarea',
            placeholder: 'e.g., Concern: Immature OS data may be insufficient to demonstrate a survival benefit. Response: Updated analysis with extended follow-up (backup slide) shows consistent OS trend with HR 0.61 (95% CI 0.46-0.81).',
            required: true,
          },
          {
            id: 'anticipated_concern_2',
            label: 'Anticipated Concern 2',
            type: 'textarea',
            placeholder: 'e.g., Concern: Higher rate of treatment-related deaths (0.8% vs. 0.3%). Response: All treatment-related deaths were immune-mediated pneumonitis; updated management guidelines and enhanced monitoring have been implemented.',
            required: true,
          },
          {
            id: 'anticipated_concern_3',
            label: 'Anticipated Concern 3',
            type: 'textarea',
            placeholder: 'e.g., Concern: Limited data in elderly patients (≥75 years). Response: Subgroup analysis shows consistent treatment effect (HR 0.68, 95% CI 0.38-1.22); sample size limits statistical significance.',
          },
          {
            id: 'anticipated_concern_4',
            label: 'Anticipated Concern 4',
            type: 'textarea',
            placeholder: 'Additional anticipated concern and pre-emptive response.',
          },
          {
            id: 'fda_statistical_review_concerns',
            label: 'FDA Statistical Review Anticipated Concerns',
            type: 'textarea',
            placeholder: 'e.g., FDA may challenge the handling of missing data (MNAR assumption), crossover effects on OS, or the multiplicity adjustment strategy for co-primary endpoints.',
            helpText: 'FDA statistical reviewers often conduct independent analyses that may differ from the sponsor\'s approach. Prepare responses to alternative statistical methodologies.',
          },
          {
            id: 'pre_emptive_analyses',
            label: 'Pre-Emptive Analyses Prepared',
            type: 'textarea',
            placeholder: 'List supplementary analyses and backup slides prepared for anticipated challenges (e.g., tipping point analysis, RPSFT-adjusted OS, sensitivity analyses with alternative censoring rules).',
          },
        ],
        defaultNext: 'presentation_outline',
        provideExpertFeedback: true,
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 7 — Presentation Strategy                               */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'presentation_outline',
        section: 'presentation_strategy',
        question:
          'Outline the sponsor\'s presentation for the advisory committee meeting. The presentation structure must be strategic and time-efficient.',
        guidance:
          'Per 21 CFR 14.25 and FDA MAPP 6001.1, the sponsor is typically allotted 60-90 minutes for their formal presentation to the advisory committee (including Q&A). The presentation should be structured to tell a compelling narrative, starting with the unmet need, through the clinical data, to the benefit-risk conclusion. FDA Guidance "Advisory Committee Meetings — Preparation and Public Availability of Information Given to Advisory Committee Members" (2008) outlines the expectations for the sponsor presentation. Avoid overloading the presentation with data — focus on the key messages. Reserve detailed data for backup slides. Reference: 21 CFR 14.25; FDA MAPP 6001.1.',
        fields: [
          {
            id: 'presentation_duration',
            label: 'Allotted Presentation Time',
            type: 'select',
            required: true,
            options: [
              { value: '30_min', label: '30 minutes' },
              { value: '45_min', label: '45 minutes' },
              { value: '60_min', label: '60 minutes' },
              { value: '75_min', label: '75 minutes' },
              { value: '90_min', label: '90 minutes' },
            ],
          },
          {
            id: 'presentation_sections',
            label: 'Presentation Outline (Sections and Time Allocation)',
            type: 'textarea',
            placeholder: 'e.g., Introduction & Unmet Need (10 min) → Clinical Development Overview (5 min) → Pivotal Efficacy Data (15 min) → Integrated Safety (15 min) → Benefit-Risk Assessment (10 min) → Proposed Labeling (5 min) → Conclusion (5 min).',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'key_messages',
            label: 'Key Messages (Top 3-5)',
            type: 'textarea',
            placeholder: 'e.g., (1) [Product] provides a clinically meaningful OS improvement (HR 0.63) with a favorable tolerability profile. (2) No new safety signals identified with extended follow-up. (3) The benefit-risk profile supports approval for the proposed indication.',
            required: true,
          },
          {
            id: 'backup_slides_count',
            label: 'Number of Backup Slides Prepared',
            type: 'number',
            validation: { min: 0, max: 200 },
            helpText: 'Backup slides should cover additional subgroup analyses, sensitivity analyses, alternative statistical approaches, and detailed safety data. Typically 50-150 backup slides are prepared.',
          },
        ],
        defaultNext: 'speakers_and_visuals',
      },

      {
        id: 'speakers_and_visuals',
        section: 'presentation_strategy',
        question:
          'Identify the key speakers and describe the visual aids and data displays for the presentation.',
        guidance:
          'Per FDA MAPP 6001.1, the sponsor presentation team typically includes the medical officer/chief medical officer, the clinical team lead, the statistician, and may include external KOLs or patient advocates. Each speaker should be well-rehearsed and prepared for direct questions from committee members and FDA reviewers. Visual aids should follow best practices for data visualization in regulatory settings — clear Kaplan-Meier curves, forest plots, waterfall plots, and swimmer plots. Avoid complex animations or excessive text on slides. All slides and handouts must be provided to FDA in advance per the pre-meeting timeline. Reference: FDA MAPP 6001.1; 21 CFR 14.25.',
        fields: [
          {
            id: 'lead_presenter',
            label: 'Lead Presenter (Clinical Team Lead / CMO)',
            type: 'text',
            placeholder: 'e.g., Dr. Jane Smith, VP Clinical Development',
            required: true,
          },
          {
            id: 'medical_officer_speaker',
            label: 'Medical Officer / Disease Expert Speaker',
            type: 'text',
            placeholder: 'e.g., Dr. John Doe, Head of Oncology, [Sponsor]',
          },
          {
            id: 'statistician_speaker',
            label: 'Statistician / Statistical Presenter',
            type: 'text',
            placeholder: 'e.g., Dr. Emily Chen, VP Biostatistics',
            required: true,
          },
          {
            id: 'external_speakers',
            label: 'External Speakers (KOLs, Patient Advocates)',
            type: 'textarea',
            placeholder: 'e.g., Dr. [Name], [Institution] — will present the clinical context and unmet need (5 min). [Patient Name] — patient testimonial during open public hearing.',
            helpText: 'External speakers must disclose financial relationships per the FDA\'s COI disclosure requirements (18 USC 208).',
          },
          {
            id: 'visual_aids',
            label: 'Key Visual Aids and Data Displays',
            type: 'multi_select',
            options: [
              { value: 'km_curves', label: 'Kaplan-Meier Survival Curves' },
              { value: 'forest_plots', label: 'Forest Plots (Subgroup Analysis)' },
              { value: 'waterfall_plots', label: 'Waterfall Plots (Tumor Response)' },
              { value: 'swimmer_plots', label: 'Swimmer Plots (Duration of Response)' },
              { value: 'spider_plots', label: 'Spider Plots (Tumor Size Over Time)' },
              { value: 'benefit_risk_table', label: 'Benefit-Risk Summary Table' },
              { value: 'ae_tables', label: 'Adverse Event Summary Tables' },
              { value: 'exposure_response', label: 'Exposure-Response Plots' },
              { value: 'patient_flow', label: 'CONSORT Patient Flow Diagram' },
              { value: 'mechanism_animation', label: 'Mechanism of Action Animation/Illustration' },
            ],
          },
          {
            id: 'rehearsal_plan',
            label: 'Rehearsal Plan',
            type: 'textarea',
            placeholder: 'e.g., (1) Internal dry run with cross-functional team (4 weeks before AC); (2) Mock advisory committee with external consultants (3 weeks before AC); (3) Final dress rehearsal at venue (1-2 days before AC).',
            required: true,
            helpText: 'A well-rehearsed mock advisory committee session with external consultants playing the role of committee members is strongly recommended. Include tough Q&A practice.',
          },
        ],
        defaultNext: 'contingency_planning',
      },

      {
        id: 'contingency_planning',
        section: 'presentation_strategy',
        question:
          'Describe the post-meeting strategy, media preparation, and contingency plans for different advisory committee outcomes.',
        guidance:
          'Per 21 CFR 14.25(d), advisory committee recommendations are advisory to FDA and not binding, though FDA rarely deviates from committee recommendations (historically, FDA follows the committee vote ~75-80% of the time). The sponsor must prepare for all possible outcomes: favorable vote, unfavorable vote, split vote, or vote with conditions. Media preparation is critical as advisory committee meetings are public and often covered by financial and medical media. Post-meeting commitments (additional studies, labeling changes, REMS modifications) should be prepared in advance. Reference: 21 CFR 14.25(d); FDA MAPP 4151.1; 21 CFR 314.50.',
        fields: [
          {
            id: 'favorable_outcome_plan',
            label: 'Plan for Favorable Vote',
            type: 'textarea',
            placeholder: 'e.g., Immediate media release prepared. PDUFA date communication to investors. Launch readiness timeline. Post-approval commitment timeline to FDA.',
            required: true,
          },
          {
            id: 'unfavorable_outcome_plan',
            label: 'Plan for Unfavorable Vote',
            type: 'textarea',
            placeholder: 'e.g., Internal communication strategy. Assessment of FDA\'s remaining pathway options. Additional data generation plan. Investor communication. Potential appeal or resubmission strategy.',
            required: true,
          },
          {
            id: 'split_vote_plan',
            label: 'Plan for Split/Close Vote',
            type: 'textarea',
            placeholder: 'e.g., Engage with FDA reviewing division post-meeting to understand the impact of a split vote on the PDUFA decision. Prepare additional analyses addressing committee concerns.',
          },
          {
            id: 'media_preparation',
            label: 'Media Preparation Plan',
            type: 'textarea',
            placeholder: 'e.g., Press releases prepared for all outcomes. Designated spokesperson identified. Social media monitoring plan. Financial media briefing scheduled for day of vote.',
            required: true,
            helpText: 'Advisory committee meetings are live-streamed by FDA and covered by financial media. Share price impact should be anticipated.',
          },
          {
            id: 'post_meeting_commitments',
            label: 'Proposed Post-Meeting Commitments',
            type: 'textarea',
            placeholder: 'e.g., (1) Submit updated OS analysis within 90 days; (2) Initiate confirmatory Phase 3 study within 6 months of approval; (3) Implement enhanced hepatotoxicity monitoring per updated label.',
            helpText: 'Per 21 CFR 314.81(b)(2)(vii), FDA may require post-marketing studies or clinical trials as conditions of approval.',
          },
          {
            id: 'complete_response_contingency',
            label: 'Complete Response Letter (CRL) Contingency',
            type: 'textarea',
            placeholder: 'e.g., If a CRL is issued: (1) request Type A meeting within 30 days to discuss deficiencies; (2) assess feasibility of addressing each deficiency; (3) determine resubmission timeline; (4) evaluate alternative regulatory pathways.',
            helpText: 'Per 21 CFR 314.110, a Complete Response Letter identifies all deficiencies that must be resolved before the application can be approved. The sponsor typically has one year to respond.',
          },
        ],
        defaultNext: null,
        provideExpertFeedback: true,
        issueChecks: [
          {
            id: 'no_contingency_plan',
            condition: { field: 'unfavorable_outcome_plan', operator: 'eq', value: '' },
            severity: 'info',
            title: 'No Contingency Plan for Unfavorable Vote',
            message:
              'Advisory committee votes are advisory but historically influential (FDA follows the committee vote approximately 75-80% of the time). Preparing contingency plans for all outcomes — including unfavorable votes and Complete Response Letters — is a best practice for advisory committee readiness.',
            reference: '21 CFR 14.25(d); FDA MAPP 4151.1',
          },
          {
            id: 'no_complete_response_contingency',
            condition: { field: 'complete_response_contingency', operator: 'eq', value: '' },
            severity: 'info',
            title: 'No CRL Contingency Plan',
            message:
              'A Complete Response Letter (CRL) contingency plan should be prepared in advance of the advisory committee meeting. Per 21 CFR 314.110, the CRL identifies all deficiencies. Having a pre-developed response strategy minimizes delays in resubmission.',
            reference: '21 CFR 314.110; FDA Guidance: Complete Response Letters (2010)',
          },
        ],
      },
    ],
  };
}
