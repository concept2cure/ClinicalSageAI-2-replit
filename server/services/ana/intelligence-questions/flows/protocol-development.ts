/**
 * Protocol Development flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through a comprehensive clinical trial protocol design,
 * covering study identity, design, population, endpoints, statistics,
 * safety monitoring, regulatory strategy, informed consent, monitoring & data
 * management, drug supply & labeling, diversity & enrollment planning, and
 * pharmacovigilance.
 *
 * ~30 nodes, ~130 fields, 12 sections, 20 issue checks, extensive branching.
 *
 * @module server/services/ana/intelligence-questions/flows/protocol-development
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createProtocolDevelopmentFlow(): FlowDefinition {
  return {
    id: 'protocol-development-v1',
    category: 'protocol_development',
    name: 'Protocol Development',
    description:
      'Comprehensive protocol development questionnaire covering study design, population, endpoints, statistics, safety, regulatory strategy, informed consent, monitoring, drug supply, diversity planning, and pharmacovigilance for clinical trials.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'study_basics',
    estimatedMinutes: 45,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'study_identity',
        label: 'Study Identity',
        nodeIds: ['study_basics', 'sponsor_info'],
      },
      {
        id: 'study_design',
        label: 'Study Design',
        nodeIds: [
          'design_type',
          'adaptive_design_details',
          'blinding_randomization',
          'treatment_arms',
        ],
      },
      {
        id: 'study_population',
        label: 'Study Population',
        nodeIds: ['population_criteria', 'sample_size'],
      },
      {
        id: 'endpoints',
        label: 'Endpoints',
        nodeIds: ['primary_endpoint', 'oncology_endpoints', 'secondary_endpoints'],
      },
      {
        id: 'statistical_design',
        label: 'Statistical Design',
        nodeIds: ['stats_approach', 'estimand_framework'],
      },
      {
        id: 'safety_monitoring',
        label: 'Safety Monitoring',
        nodeIds: ['safety_plan', 'cardiac_hepatic_safety', 'dsmb'],
      },
      {
        id: 'regulatory_strategy',
        label: 'Regulatory Strategy',
        nodeIds: ['regulatory_path', 'agency_interactions', 'review_summary'],
      },
      {
        id: 'informed_consent',
        label: 'Informed Consent',
        nodeIds: ['consent_design', 'consent_special_populations'],
      },
      {
        id: 'monitoring_data_management',
        label: 'Monitoring & Data Management',
        nodeIds: ['monitoring_strategy', 'edc_data_management', 'medical_coding'],
      },
      {
        id: 'drug_supply_labeling',
        label: 'Drug Supply & Labeling',
        nodeIds: ['clinical_supply_chain', 'drug_labeling_accountability'],
      },
      {
        id: 'diversity_enrollment',
        label: 'Diversity & Enrollment Planning',
        nodeIds: ['diversity_action_plan', 'decentralized_elements'],
      },
      {
        id: 'pharmacovigilance',
        label: 'Pharmacovigilance Plan',
        nodeIds: ['pv_reporting', 'safety_signal_detection'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ══════════════════════════════════════════════════════════════════
       * Section 1 — Study Identity
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'study_basics',
        section: 'Study Identity',
        question:
          "Let's begin with the study identity. What is the working title, therapeutic area, target indication, and study phase for this trial?",
        guidance:
          'Per ICH E6(R2) Section 6.1, the protocol should include a descriptive title. ICH E8(R1) Section 4 recommends the title convey the intervention, condition, phase, and design. A well-structured title accelerates regulatory review and improves ClinicalTrials.gov discoverability.',
        fields: [
          {
            id: 'study_title',
            label: 'Study Title',
            type: 'text',
            placeholder:
              'e.g., A Phase 3, Randomized, Double-Blind Study of Drug X vs. Placebo in Adults with Moderate-to-Severe Condition Y',
            required: true,
            validation: { minLength: 20, maxLength: 500 },
          },
          {
            id: 'protocol_number',
            label: 'Protocol Number',
            type: 'text',
            placeholder: 'e.g., ABC-001-2024',
            required: false,
            helpText:
              'Sponsor-assigned protocol identifier per ICH E6(R2) Section 6.1.1.',
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'select',
            required: true,
            options: [
              { value: 'oncology', label: 'Oncology' },
              { value: 'cardiology', label: 'Cardiology' },
              { value: 'neurology', label: 'Neurology' },
              { value: 'immunology', label: 'Immunology / Rheumatology' },
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'rare_disease', label: 'Rare Disease / Orphan' },
              { value: 'metabolic', label: 'Metabolic / Endocrinology' },
              { value: 'respiratory', label: 'Respiratory' },
              { value: 'dermatology', label: 'Dermatology' },
              { value: 'gastroenterology', label: 'Gastroenterology' },
              { value: 'psychiatry', label: 'Psychiatry' },
              { value: 'ophthalmology', label: 'Ophthalmology' },
              { value: 'hematology', label: 'Hematology' },
              { value: 'gene_cell_therapy', label: 'Gene / Cell Therapy' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'indication',
            label: 'Indication',
            type: 'text',
            placeholder:
              'e.g., Non-small cell lung cancer (NSCLC) with EGFR exon 19 deletion',
            required: true,
          },
          {
            id: 'phase',
            label: 'Phase',
            type: 'select',
            required: true,
            helpText:
              'The study phase determines downstream design requirements, regulatory expectations, and safety monitoring obligations per 21 CFR 312.21.',
            options: [
              { value: 'phase_1', label: 'Phase 1' },
              { value: 'phase_1b_2a', label: 'Phase 1b / 2a' },
              { value: 'phase_2', label: 'Phase 2' },
              { value: 'phase_2b_3', label: 'Phase 2b / 3' },
              { value: 'phase_3', label: 'Phase 3' },
              { value: 'phase_3b_4', label: 'Phase 3b / 4' },
            ],
          },
          {
            id: 'orphan_designation',
            label: 'Orphan Drug Designation',
            type: 'yes_no',
            required: false,
            helpText:
              'Has FDA or EMA granted orphan drug designation? Per 21 CFR 316, orphan status affects study size, exclusivity, and fee waivers.',
          },
        ],
        defaultNext: 'sponsor_info',
      },

      {
        id: 'sponsor_info',
        section: 'Study Identity',
        question:
          'Who is the sponsor of this study, and what is the current regulatory filing status?',
        guidance:
          'ICH E6(R2) Section 5.1 requires clear identification of the sponsor. 21 CFR 312.23 details IND application contents. For EMA submissions, the EudraCT number is required per Regulation (EU) No 536/2014 (Clinical Trials Regulation).',
        fields: [
          {
            id: 'sponsor_name',
            label: 'Sponsor Name',
            type: 'text',
            placeholder: 'e.g., Acme Therapeutics, Inc.',
            required: true,
          },
          {
            id: 'sponsor_type',
            label: 'Sponsor Type',
            type: 'select',
            required: false,
            options: [
              { value: 'commercial', label: 'Commercial Sponsor' },
              { value: 'academic', label: 'Academic / Investigator-Sponsored' },
              { value: 'government', label: 'Government / NIH' },
              { value: 'consortium', label: 'Consortium / Cooperative Group' },
            ],
          },
          {
            id: 'ind_number',
            label: 'IND Number',
            type: 'text',
            placeholder: 'e.g., IND 123456',
            required: false,
            helpText:
              'FDA Investigational New Drug application number, if assigned. Required per 21 CFR 312.23 before shipping investigational product in the US.',
          },
          {
            id: 'eudract_number',
            label: 'EudraCT / CTIS Number',
            type: 'text',
            placeholder: 'e.g., 2024-000123-45',
            required: false,
            helpText:
              'EU Clinical Trial Information System (CTIS) number per Regulation (EU) No 536/2014.',
          },
          {
            id: 'drug_class',
            label: 'Drug / Product Class',
            type: 'select',
            required: true,
            options: [
              { value: 'small_molecule', label: 'Small Molecule' },
              { value: 'biologic', label: 'Biologic (mAb, Protein)' },
              { value: 'adc', label: 'Antibody-Drug Conjugate (ADC)' },
              { value: 'cell_therapy', label: 'Cell Therapy (CAR-T, etc.)' },
              { value: 'gene_therapy', label: 'Gene Therapy' },
              { value: 'vaccine', label: 'Vaccine' },
              { value: 'oligonucleotide', label: 'Oligonucleotide (ASO, siRNA)' },
              { value: 'radiopharmaceutical', label: 'Radiopharmaceutical' },
              { value: 'combination_product', label: 'Combination Product' },
              { value: 'other', label: 'Other' },
            ],
          },
        ],
        defaultNext: 'design_type',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 2 — Study Design
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'design_type',
        section: 'Study Design',
        question:
          'What study design are you planning, and what type of control will be used?',
        guidance:
          'ICH E9(R1) addresses estimands and sensitivity analyses for different designs. ICH E10 provides a framework for selecting the appropriate control group. The design should align with study objectives and the disease natural history. FDA Guidance on Adaptive Designs (2019) should be consulted for non-traditional designs.',
        fields: [
          {
            id: 'design_type',
            label: 'Design Type',
            type: 'select',
            required: true,
            options: [
              { value: 'parallel', label: 'Parallel Group' },
              { value: 'crossover', label: 'Crossover' },
              { value: 'factorial', label: 'Factorial' },
              { value: 'adaptive', label: 'Adaptive' },
              { value: 'basket', label: 'Basket Trial' },
              { value: 'umbrella', label: 'Umbrella Trial' },
              { value: 'platform', label: 'Platform Trial' },
              { value: 'single_arm', label: 'Single Arm' },
            ],
          },
          {
            id: 'control_type',
            label: 'Control Type',
            type: 'select',
            required: true,
            options: [
              { value: 'placebo', label: 'Placebo' },
              { value: 'active_comparator', label: 'Active Comparator' },
              { value: 'standard_of_care', label: 'Standard of Care' },
              { value: 'no_control', label: 'No Control (Single Arm)' },
              { value: 'historical', label: 'Historical Control' },
              { value: 'dose_comparison', label: 'Dose-Comparison' },
            ],
          },
          {
            id: 'study_objective_type',
            label: 'Primary Objective Type',
            type: 'select',
            required: true,
            options: [
              { value: 'superiority', label: 'Superiority' },
              { value: 'non_inferiority', label: 'Non-Inferiority' },
              { value: 'equivalence', label: 'Equivalence' },
              { value: 'dose_finding', label: 'Dose-Finding' },
              { value: 'safety_tolerability', label: 'Safety / Tolerability' },
              { value: 'pharmacokinetic', label: 'Pharmacokinetic' },
            ],
          },
        ],
        branches: [
          {
            when: { field: 'design_type', operator: 'eq', value: 'adaptive' },
            goto: 'adaptive_design_details',
          },
        ],
        issueChecks: [
          {
            id: 'historical_control_bias_check',
            condition: { field: 'control_type', operator: 'eq', value: 'historical' },
            severity: 'warning',
            title: 'Historical Control Limitations',
            message:
              'Historical controls introduce selection bias and confounding. FDA generally requires concurrent controls for confirmatory trials per ICH E10 Section 2.1.4. Ensure adequate justification is documented.',
            reference: 'ICH E10 Section 2.1.4 — Choice of Control Group',
          },
          {
            id: 'single_arm_regulatory_risk',
            condition: { field: 'design_type', operator: 'eq', value: 'single_arm' },
            severity: 'warning',
            title: 'Single Arm Design — Regulatory Risk',
            message:
              'Single-arm trials are generally acceptable only when the disease is serious, no alternative therapy exists, and the endpoint is objective. Per FDA Guidance on Expedited Programs (2014), single-arm trials may support Accelerated Approval with a surrogate endpoint.',
            reference: 'FDA Guidance: Expedited Programs for Serious Conditions (2014)',
          },
        ],
        defaultNext: 'blinding_randomization',
      },

      {
        id: 'adaptive_design_details',
        section: 'Study Design',
        question:
          'You selected an adaptive design. Describe the planned adaptations, interim analyses, and type I error control strategy.',
        guidance:
          'FDA Guidance on Adaptive Designs (2019) and ICH E20 require that all adaptations be pre-specified in the protocol and SAP. The overall type I error rate must be controlled across adaptations using methods such as group sequential boundaries, combination p-values, or conditional error functions. An independent DMC should oversee unblinded interim results. Simulation studies should validate operating characteristics.',
        fields: [
          {
            id: 'adaptation_type',
            label: 'Adaptation Type(s)',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'sample_size_re_estimation', label: 'Sample Size Re-estimation' },
              { value: 'dose_finding', label: 'Dose Finding / Selection' },
              { value: 'population_enrichment', label: 'Population Enrichment' },
              { value: 'treatment_switching', label: 'Treatment Arm Dropping' },
              { value: 'seamless_phase', label: 'Seamless Phase 2/3' },
              {
                value: 'response_adaptive',
                label: 'Response Adaptive Randomization',
              },
              { value: 'endpoint_modification', label: 'Endpoint Modification' },
              { value: 'futility_stopping', label: 'Futility Stopping' },
            ],
          },
          {
            id: 'interim_analysis_planned',
            label: 'Interim Analysis Planned',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'number_interim_analyses',
            label: 'Number of Planned Interim Analyses',
            type: 'number',
            required: false,
            validation: { min: 1, max: 10 },
            visibleWhen: {
              field: 'interim_analysis_planned',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'type_i_error_control',
            label: 'Type I Error Control Method',
            type: 'select',
            required: true,
            options: [
              { value: 'obrien_fleming', label: "O'Brien-Fleming Boundaries" },
              { value: 'lan_demets', label: 'Lan-DeMets Spending Function' },
              { value: 'combination_pvalues', label: 'Combination P-Values' },
              { value: 'conditional_error', label: 'Conditional Error Function' },
              { value: 'other', label: 'Other (describe in notes)' },
            ],
          },
          {
            id: 'simulation_study_completed',
            label: 'Operating Characteristic Simulations Completed',
            type: 'yes_no',
            required: true,
            helpText:
              'FDA Adaptive Design Guidance (2019) Section IV.C recommends simulation studies to evaluate operating characteristics under various scenarios.',
          },
        ],
        issueChecks: [
          {
            id: 'no_simulation_check',
            condition: {
              field: 'simulation_study_completed',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'Simulations Not Yet Completed',
            message:
              'FDA Guidance on Adaptive Designs (2019) recommends completing simulation studies to demonstrate that the adaptive design controls type I error and maintains adequate power across plausible scenarios before protocol finalization.',
            reference:
              'FDA Guidance: Adaptive Designs for Clinical Trials of Drugs and Biologics (2019), Section IV.C',
          },
        ],
        defaultNext: 'blinding_randomization',
      },

      {
        id: 'blinding_randomization',
        section: 'Study Design',
        question:
          'What level of blinding will the study use, and how will subjects be randomized?',
        guidance:
          'ICH E9 Section 2.3 discusses the importance of blinding for reducing bias. Double-blind is the gold standard for confirmatory trials. ICH E9 Section 2.3.2 requires that the randomization scheme ensure balance across treatment arms and key prognostic factors. Consider using an Interactive Response Technology (IRT) system for randomization and drug supply management.',
        fields: [
          {
            id: 'blinding_type',
            label: 'Blinding',
            type: 'select',
            required: true,
            options: [
              { value: 'open_label', label: 'Open-Label' },
              { value: 'single_blind', label: 'Single-Blind (Subject)' },
              { value: 'double_blind', label: 'Double-Blind' },
              { value: 'triple_blind', label: 'Triple-Blind' },
            ],
          },
          {
            id: 'randomization_method',
            label: 'Randomization Method',
            type: 'select',
            required: true,
            options: [
              { value: 'simple', label: 'Simple Randomization' },
              { value: 'block', label: 'Permuted Block' },
              { value: 'stratified_block', label: 'Stratified Permuted Block' },
              { value: 'minimization', label: 'Minimization' },
              { value: 'dynamic', label: 'Dynamic / Covariate-Adaptive' },
              { value: 'not_applicable', label: 'Not Applicable (Single Arm)' },
            ],
          },
          {
            id: 'randomization_ratio',
            label: 'Randomization Ratio',
            type: 'text',
            placeholder: 'e.g., 1:1, 2:1, 3:1',
            required: false,
            visibleWhen: {
              field: 'randomization_method',
              operator: 'neq',
              value: 'not_applicable',
            },
          },
          {
            id: 'stratification_factors',
            label: 'Stratification Factors',
            type: 'textarea',
            placeholder:
              'e.g., ECOG performance status (0 vs 1), prior therapy (yes/no), geographic region',
            required: false,
            helpText:
              'ICH E9 Section 2.3.2 recommends stratification by important prognostic factors. Limit to 3-4 factors to avoid over-stratification in smaller trials.',
          },
          {
            id: 'unblinding_procedures',
            label: 'Emergency Unblinding Procedures',
            type: 'textarea',
            required: false,
            visibleWhen: {
              field: 'blinding_type',
              operator: 'in',
              value: ['double_blind', 'triple_blind'],
            },
            helpText:
              'ICH E6(R2) Section 6.4.4 requires documented procedures for breaking the blind in emergencies.',
          },
        ],
        issueChecks: [
          {
            id: 'open_label_bias_check',
            condition: {
              field: 'blinding_type',
              operator: 'eq',
              value: 'open_label',
            },
            severity: 'info',
            title: 'Open-Label Design — Bias Considerations',
            message:
              'Open-label designs may introduce assessment and reporting bias. Per ICH E9 Section 2.3.1, consider blinded central adjudication of endpoints (BICR) to mitigate bias when blinding is not feasible.',
            reference: 'ICH E9 Section 2.3.1 — Blinding',
          },
        ],
        defaultNext: 'treatment_arms',
      },

      {
        id: 'treatment_arms',
        section: 'Study Design',
        question:
          'How many treatment arms will the study have, and what is the planned treatment duration and dosing regimen?',
        guidance:
          'The number of arms and treatment duration affect sample size calculations, study logistics, and regulatory review. ICH E9 Section 3.3 requires each arm to be adequately powered if formal pairwise comparisons are planned. Consider dose-response per ICH E4 for dose selection rationale.',
        fields: [
          {
            id: 'number_of_arms',
            label: 'Number of Treatment Arms',
            type: 'number',
            required: true,
            validation: { min: 1, max: 10 },
          },
          {
            id: 'arm_descriptions',
            label: 'Arm Descriptions',
            type: 'textarea',
            placeholder:
              'e.g., Arm A: Drug X 200mg BID; Arm B: Drug X 400mg QD; Arm C: Placebo',
            required: true,
            helpText:
              'Describe each arm including drug name, dose, route, and schedule.',
          },
          {
            id: 'comparator_drug',
            label: 'Comparator Drug / Intervention',
            type: 'text',
            placeholder: 'e.g., Standard-of-care chemotherapy (cisplatin + pemetrexed)',
            required: false,
            visibleWhen: {
              field: 'control_type',
              operator: 'in',
              value: ['active_comparator', 'standard_of_care'],
            },
          },
          {
            id: 'treatment_duration',
            label: 'Treatment Duration',
            type: 'text',
            placeholder: 'e.g., 12 weeks, 6 months, until progression',
            required: true,
          },
          {
            id: 'follow_up_duration',
            label: 'Post-Treatment Follow-Up Duration',
            type: 'text',
            placeholder: 'e.g., 30 days safety follow-up, 12 months survival follow-up',
            required: true,
            helpText:
              'ICH E1 recommends long-term safety follow-up based on indication and duration of treatment.',
          },
        ],
        issueChecks: [
          {
            id: 'many_arms_multiplicity_check',
            condition: { field: 'number_of_arms', operator: 'gt', value: 3 },
            severity: 'warning',
            title: 'Multiple Arms — Multiplicity Concern',
            message:
              'Studies with more than 3 treatment arms require careful multiplicity adjustment to control the family-wise type I error rate. Per ICH E9 Section 2.2.5, pre-specify pairwise comparisons and the adjustment method in the SAP.',
            reference: 'ICH E9 Section 2.2.5 — Multiplicity',
          },
        ],
        defaultNext: 'population_criteria',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 3 — Study Population
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'population_criteria',
        section: 'Study Population',
        question:
          'Describe the target population, including age range, key eligibility criteria, and any vulnerable populations.',
        guidance:
          'ICH E8(R1) emphasizes that the study population should reflect the intended therapeutic indication. ICH E6(R2) Section 6.5.1 requires clearly defined eligibility criteria. FDA Guidance on Broadening Eligibility Criteria (2020) encourages removing unnecessarily restrictive criteria to improve diversity and generalizability. ICH E7 provides specific guidance on geriatric populations.',
        fields: [
          {
            id: 'target_population_description',
            label: 'Target Population Description',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Adult patients aged 18-75 with histologically confirmed NSCLC, ECOG PS 0-1, with measurable disease per RECIST 1.1',
          },
          {
            id: 'age_range_min',
            label: 'Minimum Age (years)',
            type: 'number',
            required: true,
            validation: { min: 0, max: 120 },
          },
          {
            id: 'age_range_max',
            label: 'Maximum Age (years)',
            type: 'number',
            required: false,
            validation: { min: 0, max: 120 },
            helpText:
              'FDA Guidance on Broadening Eligibility Criteria (2020) discourages arbitrary upper age limits unless scientifically justified.',
          },
          {
            id: 'key_inclusion_criteria',
            label: 'Key Inclusion Criteria',
            type: 'textarea',
            required: true,
          },
          {
            id: 'key_exclusion_criteria',
            label: 'Key Exclusion Criteria',
            type: 'textarea',
            required: true,
          },
          {
            id: 'includes_vulnerable_populations',
            label: 'Includes Vulnerable Populations',
            type: 'multi_select',
            required: false,
            helpText:
              'Per 21 CFR 50 Subparts B-D, additional protections are required for certain populations.',
            options: [
              { value: 'none', label: 'None' },
              { value: 'pediatric', label: 'Pediatric (< 18 years)' },
              { value: 'pregnant', label: 'Pregnant / Nursing Women' },
              { value: 'prisoners', label: 'Prisoners' },
              { value: 'cognitively_impaired', label: 'Cognitively Impaired' },
              { value: 'economically_disadvantaged', label: 'Economically Disadvantaged' },
            ],
          },
          {
            id: 'pediatric_study_plan',
            label: 'Pediatric Study Plan (PSP) Status',
            type: 'select',
            required: false,
            visibleWhen: {
              field: 'includes_vulnerable_populations',
              operator: 'contains',
              value: 'pediatric',
            },
            helpText:
              'Per PREA (Pediatric Research Equity Act) and 21 CFR 314.55, sponsors must submit a PSP unless a waiver or deferral is granted.',
            options: [
              { value: 'not_required', label: 'Not Required' },
              { value: 'submitted', label: 'PSP Submitted to FDA' },
              { value: 'agreed', label: 'PSP Agreed with FDA' },
              { value: 'waiver_requested', label: 'Waiver / Deferral Requested' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'narrow_age_range_check',
            condition: { field: 'age_range_min', operator: 'gt', value: 64 },
            severity: 'info',
            title: 'Narrow Age Range — Consider ICH E7',
            message:
              'If the study population is limited to elderly patients (>64), ensure the protocol addresses ICH E7 (Studies in Support of Special Populations: Geriatrics) requirements including pharmacokinetic considerations, dose adjustments, and relevant comorbidity management.',
            reference: 'ICH E7 — Studies in Support of Special Populations: Geriatrics',
          },
        ],
        defaultNext: 'sample_size',
      },

      {
        id: 'sample_size',
        section: 'Study Population',
        question:
          'What is the planned enrollment, number of sites, and geographic scope?',
        guidance:
          'ICH E9 Section 3.5 requires that the sample size be justified based on the primary endpoint effect size, variability, alpha, and power. Multi-regional trials must consider ICH E17 requirements for consistency assessment across regions. ICH E5 may apply for bridging studies.',
        fields: [
          {
            id: 'planned_enrollment',
            label: 'Planned Enrollment (N)',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'sample_size_justification',
            label: 'Sample Size Justification',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Based on expected ORR of 45% vs 25% (control), with 90% power at two-sided alpha 0.05, N=180 per arm (360 total) is required.',
            helpText:
              'Per ICH E9 Section 3.5, provide the statistical basis including effect size assumptions, variability, power, and alpha.',
          },
          {
            id: 'dropout_rate_assumption',
            label: 'Expected Dropout Rate (%)',
            type: 'number',
            required: false,
            validation: { min: 0, max: 100 },
            helpText:
              'Include dropout/attrition adjustment. Rates above 20% may raise FDA concern about data integrity.',
          },
          {
            id: 'number_of_sites',
            label: 'Number of Sites',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'countries',
            label: 'Countries',
            type: 'textarea',
            placeholder: 'List countries separated by commas',
            required: false,
          },
          {
            id: 'multiregional_consistency',
            label: 'Multi-Regional Consistency Assessment Planned',
            type: 'yes_no',
            required: false,
            helpText:
              'ICH E17 requires a pre-specified strategy to evaluate consistency of treatment effects across regions in multi-regional clinical trials (MRCTs).',
          },
        ],
        issueChecks: [
          {
            id: 'large_trial_check',
            condition: {
              field: 'planned_enrollment',
              operator: 'gt',
              value: 5000,
            },
            severity: 'warning',
            title: 'Large Trial — Enhanced Infrastructure Required',
            message:
              'Trials exceeding 5,000 subjects require robust safety monitoring infrastructure, centralized statistical monitoring, and potentially a larger DSMB per FDA Guidance on Clinical Trial DSMBs (2006).',
            reference:
              'FDA Guidance: Establishment and Operation of Clinical Trial Data Monitoring Committees (2006)',
          },
          {
            id: 'high_dropout_check',
            condition: {
              field: 'dropout_rate_assumption',
              operator: 'gt',
              value: 25,
            },
            severity: 'warning',
            title: 'High Dropout Rate',
            message:
              'A dropout rate above 25% may undermine trial validity. Consider retention strategies and ensure the ICH E9(R1) estimand framework addresses intercurrent events related to discontinuation.',
            reference: 'ICH E9(R1) — Estimands and Sensitivity Analysis',
          },
        ],
        defaultNext: 'primary_endpoint',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 4 — Endpoints
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'primary_endpoint',
        section: 'Endpoints',
        question:
          'What is the primary efficacy endpoint, and how will treatment effect be assessed?',
        guidance:
          'ICH E9 Section 2.2 requires a clearly defined primary variable that provides the most clinically relevant and convincing evidence related to the primary objective. For surrogate endpoints, FDA requires evidence that the surrogate reasonably predicts clinical benefit per 21 CFR 314.510 (Accelerated Approval). Endpoint selection should be informed by the therapeutic area.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'primary_endpoint_description',
            label: 'Primary Endpoint',
            type: 'textarea',
            required: true,
            helpText:
              'Define the primary efficacy endpoint precisely, including measurement method, timing, and analysis population.',
          },
          {
            id: 'endpoint_type',
            label: 'Endpoint Assessment Type',
            type: 'select',
            required: true,
            options: [
              { value: 'superiority', label: 'Superiority' },
              { value: 'non_inferiority', label: 'Non-Inferiority' },
              { value: 'equivalence', label: 'Equivalence' },
            ],
          },
          {
            id: 'endpoint_category',
            label: 'Endpoint Category',
            type: 'select',
            required: true,
            options: [
              { value: 'clinical_outcome', label: 'Clinical Outcome (e.g., mortality, MACE)' },
              { value: 'surrogate', label: 'Surrogate Endpoint (e.g., ORR, HbA1c)' },
              { value: 'patient_reported', label: 'Patient-Reported Outcome (PRO)' },
              { value: 'composite', label: 'Composite Endpoint' },
              { value: 'biomarker', label: 'Biomarker Endpoint' },
              { value: 'pharmacokinetic', label: 'Pharmacokinetic Endpoint' },
            ],
          },
          {
            id: 'endpoint_is_surrogate',
            label: 'Is This a Surrogate Endpoint for Accelerated Approval?',
            type: 'yes_no',
            required: false,
            helpText:
              'Per 21 CFR 314.510, surrogate endpoints must reasonably predict clinical benefit. Post-marketing confirmatory trials will be required.',
          },
          {
            id: 'clinically_meaningful_difference',
            label: 'Clinically Meaningful Difference',
            type: 'text',
            required: true,
            placeholder:
              'e.g., 15% improvement in ORR, 3-month improvement in median OS, 0.5-point reduction in EDSS',
          },
          {
            id: 'primary_endpoint_timepoint',
            label: 'Primary Endpoint Assessment Timepoint',
            type: 'text',
            required: true,
            placeholder: 'e.g., Week 24, Event-driven (target 250 PFS events)',
          },
        ],
        branches: [
          {
            when: { field: 'therapeutic_area', operator: 'eq', value: 'oncology' },
            goto: 'oncology_endpoints',
          },
        ],
        issueChecks: [
          {
            id: 'surrogate_confirmatory_check',
            condition: {
              field: 'endpoint_is_surrogate',
              operator: 'eq',
              value: true,
            },
            severity: 'warning',
            title: 'Surrogate Endpoint — Confirmatory Trial Required',
            message:
              'Accelerated Approval based on a surrogate endpoint under 21 CFR 314.510 requires a post-marketing confirmatory trial demonstrating clinical benefit. FDA may withdraw approval under 21 CFR 314.530 if confirmatory evidence is not provided.',
            reference:
              '21 CFR 314.510 — Approval Based on a Surrogate Endpoint; FDA Guidance: Expedited Programs for Serious Conditions (2014)',
          },
        ],
        defaultNext: 'secondary_endpoints',
      },

      {
        id: 'oncology_endpoints',
        section: 'Endpoints',
        question:
          'For this oncology study, specify the tumor assessment methodology and oncology-specific endpoints.',
        guidance:
          'FDA Guidance on Clinical Trial Endpoints for Approval of Cancer Drugs (2018) outlines acceptable endpoints by regulatory pathway. Overall Survival (OS) is the gold standard. RECIST 1.1 is the standard response criteria for solid tumors. For hematologic malignancies, disease-specific criteria (e.g., IWG, IMWG) should be used. Blinded Independent Central Review (BICR) is recommended for response-based endpoints in open-label studies per FDA Guidance on Clinical Trial Imaging Endpoints (2018).',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'response_criteria',
            label: 'Response Assessment Criteria',
            type: 'select',
            required: true,
            options: [
              { value: 'recist_1_1', label: 'RECIST 1.1 (Solid Tumors)' },
              { value: 'irecist', label: 'iRECIST (Immunotherapy)' },
              { value: 'rano', label: 'RANO (CNS Tumors)' },
              { value: 'iwg', label: 'IWG (Lymphoma)' },
              { value: 'imwg', label: 'IMWG (Myeloma)' },
              { value: 'eln', label: 'ELN (Leukemia)' },
              { value: 'pcwg', label: 'PCWG (Prostate Cancer)' },
              { value: 'other', label: 'Other Disease-Specific Criteria' },
            ],
          },
          {
            id: 'oncology_primary_endpoint_type',
            label: 'Oncology Primary Endpoint',
            type: 'select',
            required: true,
            options: [
              { value: 'os', label: 'Overall Survival (OS)' },
              { value: 'pfs', label: 'Progression-Free Survival (PFS)' },
              { value: 'orr', label: 'Overall Response Rate (ORR)' },
              { value: 'dor', label: 'Duration of Response (DOR)' },
              { value: 'cr_rate', label: 'Complete Response Rate (CR)' },
              { value: 'efs', label: 'Event-Free Survival (EFS)' },
              { value: 'mrd', label: 'Minimal Residual Disease (MRD)' },
              { value: 'dfs', label: 'Disease-Free Survival (DFS)' },
              { value: 'pcr', label: 'Pathological Complete Response (pCR)' },
            ],
          },
          {
            id: 'imaging_schedule',
            label: 'Tumor Assessment Schedule',
            type: 'text',
            placeholder: 'e.g., Every 6 weeks for 24 weeks, then every 9 weeks',
            required: true,
          },
          {
            id: 'central_review_planned',
            label: 'Blinded Independent Central Review (BICR)',
            type: 'yes_no',
            required: true,
            helpText:
              'FDA Guidance on Clinical Trial Imaging Endpoints (2018) recommends BICR for ORR-based endpoints, especially in open-label studies.',
          },
        ],
        issueChecks: [
          {
            id: 'orr_no_bicr_check',
            condition: {
              field: 'central_review_planned',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'ORR Without BICR — Potential Regulatory Concern',
            message:
              'FDA strongly recommends Blinded Independent Central Review (BICR) when response rate is used as a primary endpoint, particularly in open-label studies. Investigator-assessed ORR alone may not be accepted for regulatory submissions.',
            reference:
              'FDA Guidance: Clinical Trial Imaging Endpoints (2018)',
          },
        ],
        defaultNext: 'secondary_endpoints',
      },

      {
        id: 'secondary_endpoints',
        section: 'Endpoints',
        question:
          'What secondary, exploratory, and patient-reported outcome endpoints will the study evaluate?',
        guidance:
          'ICH E9 Section 2.2.2 addresses secondary variables. Secondary endpoints should support the primary endpoint and provide additional evidence of benefit. FDA PRO Guidance (2009) requires that patient-reported outcomes intended for labeling claims use validated instruments with established measurement properties. Consider including health-related quality of life (HRQoL) instruments endorsed by the relevant therapeutic area guidance.',
        fields: [
          {
            id: 'secondary_endpoints_description',
            label: 'Key Secondary Endpoints',
            type: 'textarea',
            required: true,
            helpText:
              'List endpoints in priority order. Key secondary endpoints supporting labeling claims require multiplicity adjustment.',
          },
          {
            id: 'pro_instruments',
            label: 'Patient-Reported Outcome (PRO) Instruments',
            type: 'textarea',
            required: false,
            placeholder:
              'e.g., EQ-5D-5L, EORTC QLQ-C30, SF-36, FACIT-Fatigue',
            helpText:
              'Per FDA PRO Guidance (2009), PRO instruments must be validated for the target population. Content validity should be established through qualitative research.',
          },
          {
            id: 'exploratory_endpoints',
            label: 'Exploratory Endpoints',
            type: 'textarea',
            required: false,
          },
          {
            id: 'biomarker_endpoints',
            label: 'Biomarker / Translational Endpoints',
            type: 'textarea',
            required: false,
            helpText:
              'List pharmacodynamic, predictive, or prognostic biomarker endpoints. Consider companion diagnostic requirements per FDA Guidance on In Vitro Companion Diagnostic Devices (2014).',
          },
          {
            id: 'companion_diagnostic_required',
            label: 'Companion Diagnostic Required',
            type: 'yes_no',
            required: false,
            helpText:
              'Per 21 CFR 809.30, a companion diagnostic may be required if the drug is safe and effective only in patients identified by the diagnostic.',
          },
        ],
        issueChecks: [
          {
            id: 'companion_dx_codevelopment_check',
            condition: {
              field: 'companion_diagnostic_required',
              operator: 'eq',
              value: true,
            },
            severity: 'info',
            title: 'Companion Diagnostic — Co-Development Required',
            message:
              'Per FDA Guidance on In Vitro Companion Diagnostic Devices (2014), the therapeutic product and its companion diagnostic should be co-developed. The companion diagnostic must receive FDA approval or clearance contemporaneously with the therapeutic product.',
            reference:
              'FDA Guidance: In Vitro Companion Diagnostic Devices (2014); 21 CFR 809.30',
          },
        ],
        defaultNext: 'stats_approach',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 5 — Statistical Design
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'stats_approach',
        section: 'Statistical Design',
        question:
          'What is the planned statistical analysis approach for the primary endpoint?',
        guidance:
          'ICH E9(R1) introduced the estimand framework, requiring sponsors to precisely define the treatment effect of interest including population, variable, intercurrent events, and summary measure. The analysis method must align with the estimand. Multiplicity adjustment is required per ICH E9 Section 2.2.5 when there are multiple primary or key secondary endpoints used for labeling claims.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'primary_analysis_method',
            label: 'Primary Analysis Method',
            type: 'select',
            required: true,
            options: [
              { value: 'anova', label: 'ANOVA' },
              { value: 'ancova', label: 'ANCOVA' },
              { value: 'mixed_model', label: 'Mixed Model (MMRM)' },
              { value: 'cox_regression', label: 'Cox Proportional Hazards' },
              { value: 'logistic_regression', label: 'Logistic Regression' },
              { value: 'kaplan_meier', label: 'Kaplan-Meier / Log-Rank' },
              { value: 'chi_square', label: 'Chi-Square / Fisher Exact' },
              { value: 'cmi_wilcoxon', label: 'Wilcoxon Rank-Sum' },
              { value: 'gee', label: 'GEE (Generalized Estimating Equations)' },
              { value: 'bayesian', label: 'Bayesian Analysis' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'alpha_level',
            label: 'Significance Level (Alpha)',
            type: 'select',
            required: true,
            defaultValue: '0.05_two_sided',
            options: [
              { value: '0.05_two_sided', label: '0.05 (Two-Sided)' },
              { value: '0.025_one_sided', label: '0.025 (One-Sided)' },
              { value: '0.01_two_sided', label: '0.01 (Two-Sided)' },
              { value: '0.001_two_sided', label: '0.001 (Two-Sided)' },
            ],
          },
          {
            id: 'statistical_power',
            label: 'Statistical Power',
            type: 'select',
            required: true,
            defaultValue: '90',
            options: [
              { value: '80', label: '80%' },
              { value: '85', label: '85%' },
              { value: '90', label: '90% (Recommended for Phase 3)' },
              { value: '95', label: '95%' },
            ],
          },
          {
            id: 'multiplicity_adjustment',
            label: 'Multiplicity Adjustment Strategy',
            type: 'select',
            required: true,
            helpText:
              'ICH E9 Section 2.2.5 requires pre-specified multiplicity control for type I error when multiple hypotheses are tested.',
            options: [
              { value: 'bonferroni', label: 'Bonferroni' },
              { value: 'holm', label: 'Holm Step-Down' },
              { value: 'hochberg', label: 'Hochberg Step-Up' },
              { value: 'fixed_sequence', label: 'Fixed-Sequence (Hierarchical)' },
              { value: 'gatekeeping', label: 'Gatekeeping' },
              { value: 'graphical', label: 'Graphical (Bretz et al.)' },
              { value: 'none', label: 'None (Single Primary Endpoint)' },
            ],
          },
          {
            id: 'analysis_populations',
            label: 'Analysis Populations',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'itt', label: 'Intent-to-Treat (ITT)' },
              { value: 'mitt', label: 'Modified Intent-to-Treat (mITT)' },
              { value: 'per_protocol', label: 'Per-Protocol (PP)' },
              { value: 'safety', label: 'Safety Population' },
              { value: 'pk', label: 'PK-Evaluable Population' },
              { value: 'biomarker_positive', label: 'Biomarker-Positive Subgroup' },
            ],
          },
          {
            id: 'missing_data_strategy',
            label: 'Missing Data Handling Strategy',
            type: 'select',
            required: true,
            helpText:
              'Per ICH E9(R1) and NAS report on Missing Data (2010), the primary analysis strategy should align with the estimand and minimize assumptions about missing data.',
            options: [
              { value: 'mmrm', label: 'MMRM (Implicit Imputation)' },
              { value: 'multiple_imputation', label: 'Multiple Imputation' },
              { value: 'control_based_imputation', label: 'Control-Based Imputation' },
              { value: 'tipping_point', label: 'Tipping Point Analysis' },
              { value: 'locf', label: 'LOCF (Last Observation Carried Forward)' },
              { value: 'worst_case', label: 'Worst-Case Imputation' },
              { value: 'complete_case', label: 'Complete Case Analysis' },
              { value: 'other', label: 'Other' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'locf_discouraged_check',
            condition: {
              field: 'missing_data_strategy',
              operator: 'eq',
              value: 'locf',
            },
            severity: 'warning',
            title: 'LOCF — Discouraged by Regulators',
            message:
              'LOCF (Last Observation Carried Forward) is generally discouraged by FDA and EMA. The NAS report on Missing Data (2010) and ICH E9(R1) recommend principled methods such as MMRM or multiple imputation that are aligned with the estimand framework.',
            reference:
              'NAS Report: Prevention and Treatment of Missing Data in Clinical Trials (2010); ICH E9(R1)',
          },
        ],
        defaultNext: 'estimand_framework',
      },

      {
        id: 'estimand_framework',
        section: 'Statistical Design',
        question:
          'Define the estimand framework per ICH E9(R1) for the primary endpoint.',
        guidance:
          'ICH E9(R1) Addendum requires sponsors to precisely define the estimand with four attributes: (1) treatment condition, (2) population, (3) variable, (4) population-level summary measure, and to specify how each intercurrent event is handled. FDA and EMA expect this framework to be prospectively defined in the protocol and SAP.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'estimand_treatment_condition',
            label: 'Treatment Condition (What Is Being Compared)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Drug X 200mg BID compared to placebo, both administered in combination with standard background therapy',
          },
          {
            id: 'estimand_population',
            label: 'Estimand Population',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., All randomized patients with confirmed diagnosis of moderate-to-severe condition Y',
          },
          {
            id: 'estimand_variable',
            label: 'Variable (Endpoint)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Change from baseline in XYZ score at Week 24',
          },
          {
            id: 'estimand_summary_measure',
            label: 'Population-Level Summary Measure',
            type: 'select',
            required: true,
            options: [
              { value: 'difference_means', label: 'Difference in Means' },
              { value: 'difference_proportions', label: 'Difference in Proportions' },
              { value: 'hazard_ratio', label: 'Hazard Ratio' },
              { value: 'odds_ratio', label: 'Odds Ratio' },
              { value: 'risk_ratio', label: 'Risk Ratio' },
              { value: 'restricted_mean', label: 'Restricted Mean Survival Time' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'intercurrent_events_strategy',
            label: 'Intercurrent Events Handling',
            type: 'textarea',
            required: true,
            placeholder:
              'For each intercurrent event (e.g., treatment discontinuation, rescue medication, death), specify the strategy: treatment policy, composite, hypothetical, or principal stratum.',
            helpText:
              'ICH E9(R1) defines four strategies: Treatment Policy (include data regardless), Composite (incorporate event into variable), Hypothetical (estimate effect in absence of event), Principal Stratum (effect in subpopulation that would not experience event).',
          },
          {
            id: 'sensitivity_analyses_planned',
            label: 'Sensitivity Analyses Planned',
            type: 'textarea',
            required: false,
            helpText:
              'ICH E9(R1) requires sensitivity analyses to assess robustness of the primary analysis to deviations from assumptions.',
          },
        ],
        defaultNext: 'safety_plan',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 6 — Safety Monitoring
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'safety_plan',
        section: 'Safety Monitoring',
        question:
          'What is the planned approach for safety monitoring, adverse event collection, and dose-limiting toxicity assessment?',
        guidance:
          'ICH E6(R2) Sections 6.5.3 and 6.5.4 require protocols to specify how adverse events and serious adverse events are collected, classified, and reported. 21 CFR 312.32 requires initial SAE reports within 15 calendar days (7 days for fatal/life-threatening unexpected events). ICH E2A defines the classification of adverse events. For first-in-human studies, consider MABEL-based dosing per EMA Guideline EMEA/CHMP/SWP/28367/07.',
        fields: [
          {
            id: 'ae_grading_scale',
            label: 'AE Grading Scale',
            type: 'select',
            required: true,
            options: [
              { value: 'ctcae_5', label: 'CTCAE v5.0 (NCI)' },
              { value: 'ctcae_4', label: 'CTCAE v4.03' },
              { value: 'daids', label: 'DAIDS Toxicity Table' },
              { value: 'who', label: 'WHO Toxicity Grading' },
              { value: 'custom', label: 'Protocol-Specific Scale' },
            ],
          },
          {
            id: 'sae_reporting_timeline',
            label: 'SAE Reporting Timeline to Sponsor',
            type: 'select',
            required: true,
            defaultValue: '24_hours',
            options: [
              { value: '24_hours', label: 'Within 24 Hours (Recommended)' },
              { value: '72_hours', label: 'Within 72 Hours' },
            ],
          },
          {
            id: 'dose_escalation_scheme',
            label: 'Dose Escalation Scheme',
            type: 'select',
            required: false,
            visibleWhen: {
              field: 'phase',
              operator: 'in',
              value: ['phase_1', 'phase_1b_2a'],
            },
            helpText:
              'For Phase 1 dose-escalation studies, specify the design per FDA Guidance on Oncology Dose Optimization (2023).',
            options: [
              { value: '3_plus_3', label: '3+3 Design' },
              { value: 'crm', label: 'Continual Reassessment Method (CRM)' },
              { value: 'boin', label: 'BOIN Design' },
              { value: 'ewoc', label: 'EWOC (Escalation with Overdose Control)' },
              { value: 'mabel', label: 'MABEL-Based (First-in-Human)' },
              { value: 'accelerated_titration', label: 'Accelerated Titration' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'dlt_criteria',
            label: 'Dose-Limiting Toxicity (DLT) Criteria',
            type: 'textarea',
            required: false,
            visibleWhen: {
              field: 'phase',
              operator: 'in',
              value: ['phase_1', 'phase_1b_2a'],
            },
            helpText:
              'Define DLT criteria including grade, type, duration, and DLT evaluation window.',
          },
          {
            id: 'dlt_evaluation_window',
            label: 'DLT Evaluation Window',
            type: 'text',
            placeholder: 'e.g., 28 days (Cycle 1)',
            required: false,
            visibleWhen: {
              field: 'phase',
              operator: 'in',
              value: ['phase_1', 'phase_1b_2a'],
            },
          },
          {
            id: 'safety_run_in_planned',
            label: 'Safety Run-In Planned',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'rems_assessment',
            label: 'REMS Assessment Required',
            type: 'select',
            required: false,
            helpText:
              'Per 21 CFR 314.42 and FDAAA (2007), FDA may require a Risk Evaluation and Mitigation Strategy if necessary to ensure benefits outweigh risks.',
            options: [
              { value: 'not_required', label: 'Not Required' },
              { value: 'medication_guide', label: 'Medication Guide Only' },
              { value: 'communication_plan', label: 'Communication Plan' },
              { value: 'etasu', label: 'ETASU (Elements to Assure Safe Use)' },
              { value: 'tbd', label: 'To Be Determined with FDA' },
            ],
          },
        ],
        defaultNext: 'cardiac_hepatic_safety',
      },

      {
        id: 'cardiac_hepatic_safety',
        section: 'Safety Monitoring',
        question:
          'Describe the cardiac safety (QTc monitoring) and hepatotoxicity (Hy\'s Law) monitoring plans.',
        guidance:
          "ICH E14 (2005, Q&A R3 2015) provides guidance on QTc evaluation. A Thorough QT (TQT) study or concentration-QTc analysis may be required. For hepatotoxicity, FDA Guidance on Drug-Induced Liver Injury (DILI) recommends prospective Hy's Law monitoring using the criteria: ALT/AST >3x ULN concurrent with total bilirubin >2x ULN in the absence of cholestasis or other causes. This is detailed in FDA Guidance: Drug-Induced Liver Injury: Premarketing Clinical Evaluation (2009).",
        fields: [
          {
            id: 'qtc_monitoring_required',
            label: 'QTc Monitoring Required',
            type: 'yes_no',
            required: true,
            helpText:
              'Per ICH E14, QTc assessment is required for all new molecular entities. A dedicated TQT study may be replaced by concentration-QTc analysis from Phase 1 data per ICH E14 Q&A R3.',
          },
          {
            id: 'qtc_approach',
            label: 'QTc Assessment Approach',
            type: 'select',
            required: false,
            visibleWhen: {
              field: 'qtc_monitoring_required',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'tqt_study', label: 'Thorough QT (TQT) Study' },
              { value: 'concentration_qtc', label: 'Concentration-QTc Analysis (ICH E14 Q&A R3)' },
              { value: 'ecg_in_study', label: 'ECG Monitoring Within Study' },
              { value: 'dedicated_substudy', label: 'Dedicated ECG Sub-Study' },
            ],
          },
          {
            id: 'ecg_collection_schedule',
            label: 'ECG Collection Schedule',
            type: 'textarea',
            required: false,
            visibleWhen: {
              field: 'qtc_monitoring_required',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'e.g., Triplicate 12-lead ECGs at screening, baseline, C1D1, C1D15, C2D1, then every 3 cycles',
          },
          {
            id: 'hys_law_monitoring',
            label: "Hy's Law Monitoring Plan",
            type: 'select',
            required: true,
            helpText:
              "FDA Guidance on Drug-Induced Liver Injury (2009) defines Hy's Law criteria. Prospective monitoring is expected for all clinical trials.",
            options: [
              {
                value: 'standard',
                label: 'Standard Liver Chemistry Monitoring (ALT, AST, ALP, TBL)',
              },
              {
                value: 'enhanced',
                label: 'Enhanced Monitoring (Including Fractionated Bilirubin, INR)',
              },
              { value: 'not_applicable', label: 'Not Applicable (e.g., Topical Only)' },
            ],
          },
          {
            id: 'liver_stopping_rules',
            label: 'Liver Chemistry Stopping Rules',
            type: 'textarea',
            required: false,
            placeholder:
              "e.g., Discontinue if ALT >8x ULN, ALT >5x ULN for >2 weeks, or Hy's Law criteria met",
            helpText:
              'Per FDA DILI Guidance (2009), pre-specified stopping rules for hepatotoxicity should be included in the protocol.',
          },
        ],
        issueChecks: [
          {
            id: 'no_qtc_monitoring_check',
            condition: {
              field: 'qtc_monitoring_required',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'QTc Monitoring Not Planned',
            message:
              'ICH E14 requires QTc assessment for all new molecular entities. Failing to assess cardiac safety may result in a clinical hold or Refuse to File. Provide scientific justification if QTc monitoring is not applicable (e.g., biologics with no known cardiac risk).',
            reference: 'ICH E14 — The Clinical Evaluation of QT/QTc Interval Prolongation',
          },
        ],
        defaultNext: 'dsmb',
      },

      {
        id: 'dsmb',
        section: 'Safety Monitoring',
        question:
          'Will an independent Data Safety Monitoring Board (DSMB / DMC) oversee this study?',
        guidance:
          'FDA Guidance on Establishment and Operation of Clinical Trial DSMBs (2006) recommends DMCs for: (1) controlled trials with mortality or major morbidity endpoints, (2) trials with interim efficacy analyses, (3) large simple trials. Phase 3 confirmatory trials almost always require a DSMB. Per ICH E6(R2) Section 5.5, the DMC should operate under a formal charter specifying membership, procedures, and decision rules.',
        fields: [
          {
            id: 'dsmb_required',
            label: 'DSMB / DMC Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'dsmb_charter_available',
            label: 'DSMB Charter Available',
            type: 'yes_no',
            required: false,
            visibleWhen: {
              field: 'dsmb_required',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'dsmb_membership',
            label: 'DSMB Membership Description',
            type: 'textarea',
            required: false,
            visibleWhen: {
              field: 'dsmb_required',
              operator: 'eq',
              value: true,
            },
            helpText:
              'Typically includes at minimum a clinical expert, a biostatistician, and an ethicist. All members must be independent from the sponsor.',
          },
          {
            id: 'dsmb_review_frequency',
            label: 'DSMB Review Frequency',
            type: 'select',
            required: false,
            visibleWhen: {
              field: 'dsmb_required',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'biannual', label: 'Biannually' },
              { value: 'event_driven', label: 'Event-Driven' },
              { value: 'per_cohort', label: 'Per Dose Cohort' },
              { value: 'custom', label: 'Custom Schedule' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'dsmb_required_phase3_check',
            condition: {
              field: 'dsmb_required',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'DSMB Not Planned — High Risk',
            message:
              'Phase 2b and Phase 3 trials typically require an independent Data Safety Monitoring Board. Absence of a DSMB may be cited as a deficiency during FDA review. For trials with interim analyses, an independent DMC is essential to maintain trial integrity.',
            reference:
              'FDA Guidance: Establishment and Operation of Clinical Trial Data Monitoring Committees (2006)',
          },
        ],
        defaultNext: 'regulatory_path',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 7 — Regulatory Strategy
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'regulatory_path',
        section: 'Regulatory Strategy',
        question:
          'What regulatory pathway, expedited programs, and target submission regions are you planning?',
        guidance:
          'Consider whether the study design will support submissions to multiple agencies simultaneously. ICH guidelines are accepted across FDA, EMA, and PMDA, but each agency may have specific requirements. FDA expedited programs include Fast Track (FDASIA Sec. 901), Breakthrough Therapy (FDASIA Sec. 902), Accelerated Approval (21 CFR 314 Subpart H), and Priority Review. EMA offers PRIME (Priority Medicines) designation and Conditional Marketing Authorization.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'regulatory_pathway',
            label: 'FDA Regulatory Pathway / Expedited Programs',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'standard', label: 'Standard (505(b)(1))' },
              { value: '505b2', label: '505(b)(2)' },
              { value: 'accelerated_approval', label: 'Accelerated Approval' },
              { value: 'breakthrough_therapy', label: 'Breakthrough Therapy' },
              { value: 'fast_track', label: 'Fast Track' },
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'orphan_drug', label: 'Orphan Drug' },
              {
                value: 'rmat',
                label: 'RMAT (Regenerative Medicine Advanced Therapy)',
              },
            ],
          },
          {
            id: 'ema_designations',
            label: 'EMA Designations',
            type: 'multi_select',
            required: false,
            options: [
              { value: 'none', label: 'None' },
              { value: 'prime', label: 'PRIME (Priority Medicines)' },
              { value: 'conditional_ma', label: 'Conditional Marketing Authorization' },
              { value: 'orphan', label: 'Orphan Medicinal Product' },
              { value: 'atmp', label: 'ATMP (Advanced Therapy Medicinal Product)' },
            ],
          },
          {
            id: 'target_regions',
            label: 'Target Regulatory Regions',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'us_fda', label: 'US FDA' },
              { value: 'eu_ema', label: 'EU EMA' },
              { value: 'uk_mhra', label: 'UK MHRA' },
              { value: 'japan_pmda', label: 'Japan PMDA' },
              { value: 'china_nmpa', label: 'China NMPA' },
              { value: 'health_canada', label: 'Health Canada' },
              { value: 'australia_tga', label: 'Australia TGA' },
              { value: 'south_korea_mfds', label: 'South Korea MFDS' },
              { value: 'brazil_anvisa', label: 'Brazil ANVISA' },
            ],
          },
          {
            id: 'rwe_strategy',
            label: 'Real-World Evidence (RWE) Strategy',
            type: 'select',
            required: false,
            helpText:
              'Per FDA Framework for Real-World Evidence Program (2018) and 21st Century Cures Act, RWE may support regulatory decision-making.',
            options: [
              { value: 'none', label: 'Not Planned' },
              { value: 'external_control', label: 'External / Synthetic Control Arm' },
              { value: 'post_marketing', label: 'Post-Marketing Safety Study' },
              { value: 'label_expansion', label: 'Label Expansion Support' },
              { value: 'burden_of_disease', label: 'Burden of Disease / Natural History' },
            ],
          },
        ],
        defaultNext: 'agency_interactions',
      },

      {
        id: 'agency_interactions',
        section: 'Regulatory Strategy',
        question:
          'Describe planned or completed regulatory agency interactions and submission timeline.',
        guidance:
          'FDA offers Pre-IND (Type B), End-of-Phase 2 (Type B), and Pre-NDA/BLA (Type B) meetings per FDA Guidance on Formal Meetings Between CDER and Sponsors (2017). Type A meetings (30-day response) are for stalled programs. Type C meetings (75-day response) address specific issues. EMA Scientific Advice (Article 57 of Regulation 726/2004) provides non-binding guidance on development plans. Consider joint FDA-EMA parallel scientific advice for global programs.',
        fields: [
          {
            id: 'fda_meeting_type',
            label: 'FDA Meeting Type Planned',
            type: 'multi_select',
            required: false,
            options: [
              { value: 'pre_ind', label: 'Pre-IND Meeting (Type B)' },
              { value: 'eop1', label: 'End-of-Phase 1 Meeting' },
              { value: 'eop2', label: 'End-of-Phase 2 Meeting (Type B)' },
              { value: 'pre_nda', label: 'Pre-NDA/BLA Meeting (Type B)' },
              { value: 'type_a', label: 'Type A Meeting (Stalled Program)' },
              { value: 'type_c', label: 'Type C Meeting (Specific Issue)' },
              { value: 'none', label: 'No FDA Meetings Planned' },
            ],
          },
          {
            id: 'ema_scientific_advice',
            label: 'EMA Scientific Advice',
            type: 'select',
            required: false,
            options: [
              { value: 'not_planned', label: 'Not Planned' },
              { value: 'planned', label: 'Planned' },
              { value: 'received', label: 'Already Received' },
              { value: 'parallel_fda_ema', label: 'Parallel FDA-EMA Advice Planned' },
            ],
          },
          {
            id: 'target_submission_date',
            label: 'Target NDA/BLA/MAA Submission Date',
            type: 'text',
            placeholder: 'e.g., Q4 2027',
            required: false,
          },
          {
            id: 'pediatric_plan_status',
            label: 'Pediatric Plan Status (iPSP / PIP)',
            type: 'select',
            required: false,
            helpText:
              'PREA requires an initial Pediatric Study Plan (iPSP) per 21 CFR 314.55. EMA requires a Paediatric Investigation Plan (PIP) per Regulation (EC) No 1901/2006.',
            options: [
              { value: 'not_applicable', label: 'Not Applicable' },
              { value: 'ipsp_planned', label: 'iPSP Planned' },
              { value: 'ipsp_submitted', label: 'iPSP Submitted to FDA' },
              { value: 'ipsp_agreed', label: 'iPSP Agreed with FDA' },
              { value: 'pip_planned', label: 'PIP Planned for EMA' },
              { value: 'pip_agreed', label: 'PIP Agreed with EMA' },
              { value: 'waiver_deferral', label: 'Waiver or Deferral Obtained' },
            ],
          },
        ],
        defaultNext: 'review_summary',
      },

      {
        id: 'review_summary',
        section: 'Regulatory Strategy',
        question:
          'Capture any additional notes, key risks, open questions, or strategic considerations for the protocol.',
        guidance:
          'This is an opportunity to flag residual risks, outstanding questions, or strategic considerations that should be addressed during protocol finalization. Consider GCP compliance risks, enrollment feasibility, regulatory interaction outcomes, and competitive landscape factors.',
        fields: [
          {
            id: 'additional_notes',
            label: 'Additional Notes',
            type: 'textarea',
            required: false,
          },
          {
            id: 'key_risks_or_concerns',
            label: 'Key Risks or Concerns',
            type: 'textarea',
            required: false,
          },
          {
            id: 'competitive_landscape',
            label: 'Competitive Landscape Considerations',
            type: 'textarea',
            required: false,
            helpText:
              'Identify competing products or trials that may impact enrollment, endpoint selection, or regulatory strategy.',
          },
        ],
        defaultNext: 'consent_design',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 8 — Informed Consent
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'consent_design',
        section: 'Informed Consent',
        question:
          'Describe the informed consent process, including use of electronic consent (eConsent) and any additional consent elements.',
        guidance:
          '21 CFR 50.25 specifies required elements of informed consent including: nature and purpose of the study, risks and benefits, alternatives, confidentiality, compensation, and contact information. 21 CFR 50.27 requires documentation of consent. FDA Guidance on Use of Electronic Informed Consent (2016) allows eConsent with appropriate regulatory safeguards. ICH E6(R2) Section 4.8 requires IRB/IEC-approved consent before any study procedures.',
        fields: [
          {
            id: 'econsent_planned',
            label: 'Electronic Consent (eConsent) Planned',
            type: 'yes_no',
            required: true,
            helpText:
              'Per FDA Guidance on Use of Electronic Informed Consent (2016), eConsent is permitted when 21 CFR Part 11 requirements are met.',
          },
          {
            id: 'econsent_platform',
            label: 'eConsent Platform',
            type: 'text',
            placeholder: 'e.g., Medidata Rave eConsent, Florence eBinders, REDCap',
            required: false,
            visibleWhen: {
              field: 'econsent_planned',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'consent_language_requirements',
            label: 'Consent Languages Required',
            type: 'textarea',
            placeholder: 'e.g., English, Spanish, French, Mandarin',
            required: false,
            helpText:
              'Per 21 CFR 50.25(a) and 45 CFR 46.116, consent must be in a language understandable to the subject.',
          },
          {
            id: 'reconsent_triggers',
            label: 'Re-Consent Triggers',
            type: 'multi_select',
            required: false,
            helpText:
              'Per ICH E6(R2) Section 4.8.2, subjects should be re-consented when significant new information arises that may affect willingness to participate.',
            options: [
              { value: 'protocol_amendment', label: 'Protocol Amendment' },
              { value: 'new_safety_info', label: 'New Safety Information' },
              { value: 'age_of_majority', label: 'Subject Reaches Age of Majority' },
              { value: 'extension_study', label: 'Extension Study Entry' },
              { value: 'genetic_testing', label: 'Optional Genetic Sub-Study' },
            ],
          },
          {
            id: 'biospecimen_consent',
            label: 'Biospecimen / Future Research Consent',
            type: 'select',
            required: false,
            options: [
              { value: 'not_applicable', label: 'Not Applicable' },
              { value: 'included_main', label: 'Included in Main Consent' },
              { value: 'separate_consent', label: 'Separate Optional Consent' },
              { value: 'broad_consent', label: 'Broad Consent (45 CFR 46.116(d))' },
            ],
          },
        ],
        defaultNext: 'consent_special_populations',
      },

      {
        id: 'consent_special_populations',
        section: 'Informed Consent',
        question:
          'Does this study require pediatric assent, parental permission, or consent processes for other special populations?',
        guidance:
          '21 CFR 50 Subpart D governs additional protections for children, requiring: (1) parental permission per 21 CFR 50.55, (2) child assent when capable per 21 CFR 50.55(a), and (3) IRB determination of appropriate risk category (21 CFR 50.51-54). For cognitively impaired subjects, a legally authorized representative (LAR) must provide consent per 21 CFR 50.20.',
        fields: [
          {
            id: 'pediatric_assent_required',
            label: 'Pediatric Assent Required',
            type: 'yes_no',
            required: false,
            visibleWhen: {
              field: 'includes_vulnerable_populations',
              operator: 'contains',
              value: 'pediatric',
            },
            helpText:
              'Per 21 CFR 50.55, assent is typically required for children aged 7 and older who are capable of providing it.',
          },
          {
            id: 'assent_age_range',
            label: 'Assent Age Range',
            type: 'text',
            placeholder: 'e.g., 7-17 years',
            required: false,
            visibleWhen: {
              field: 'pediatric_assent_required',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'lar_consent_required',
            label: 'Legally Authorized Representative (LAR) Consent Required',
            type: 'yes_no',
            required: false,
            visibleWhen: {
              field: 'includes_vulnerable_populations',
              operator: 'contains',
              value: 'cognitively_impaired',
            },
          },
          {
            id: 'consent_monitoring_plan',
            label: 'Consent Quality Monitoring Plan',
            type: 'textarea',
            required: false,
            helpText:
              'Describe how consent quality will be monitored (e.g., consent comprehension assessment, consent audit as part of monitoring visits).',
          },
        ],
        defaultNext: 'monitoring_strategy',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 9 — Monitoring & Data Management
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'monitoring_strategy',
        section: 'Monitoring & Data Management',
        question:
          'Describe the clinical monitoring strategy, including risk-based monitoring and source data verification approach.',
        guidance:
          'ICH E6(R3) (draft 2023) emphasizes a quality-by-design approach with risk-proportionate monitoring. FDA Guidance on A Risk-Based Approach to Monitoring of Clinical Investigations (2013) supports risk-based monitoring (RBM) as an alternative to 100% on-site SDV. Central statistical monitoring (CSM) uses statistical algorithms to detect data anomalies and site-level quality issues. The monitoring plan should be documented per ICH E6(R2) Section 5.18.',
        fields: [
          {
            id: 'monitoring_model',
            label: 'Monitoring Model',
            type: 'select',
            required: true,
            options: [
              { value: 'traditional_100', label: 'Traditional (100% On-Site SDV)' },
              { value: 'risk_based', label: 'Risk-Based Monitoring (RBM)' },
              { value: 'centralized', label: 'Centralized Monitoring Only' },
              { value: 'hybrid', label: 'Hybrid (Central + Targeted On-Site)' },
              { value: 'remote', label: 'Remote Monitoring' },
            ],
          },
          {
            id: 'sdv_percentage',
            label: 'Source Data Verification (SDV) Target',
            type: 'select',
            required: true,
            options: [
              { value: '100', label: '100% SDV' },
              { value: '50', label: '50% SDV' },
              { value: '20', label: '20% SDV' },
              { value: '10', label: '10% SDV (Critical Data Only)' },
              { value: 'risk_based', label: 'Risk-Based (Variable by Data Element)' },
            ],
          },
          {
            id: 'central_monitoring_planned',
            label: 'Central Statistical Monitoring Planned',
            type: 'yes_no',
            required: true,
            helpText:
              'ICH E6(R3) recommends central monitoring using statistical methods to identify site-level data quality issues, unusual data patterns, and protocol deviations.',
          },
          {
            id: 'critical_data_processes',
            label: 'Critical Data and Critical Processes Identified',
            type: 'yes_no',
            required: true,
            helpText:
              'ICH E6(R3) requires identification of critical data and processes that are essential to ensuring human subject protection and reliability of trial results.',
          },
          {
            id: 'monitoring_visit_frequency',
            label: 'Planned On-Site Monitoring Visit Frequency',
            type: 'select',
            required: false,
            options: [
              { value: 'monthly', label: 'Monthly' },
              { value: 'bimonthly', label: 'Every 6-8 Weeks' },
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'triggered', label: 'Triggered by Risk Indicators Only' },
              { value: 'not_applicable', label: 'Not Applicable (Remote Only)' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_central_monitoring_check',
            condition: {
              field: 'central_monitoring_planned',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'No Central Monitoring Planned',
            message:
              'ICH E6(R3) emphasizes centralized monitoring as a key component of risk-based quality management. Central statistical monitoring can detect fabrication, systematic errors, and protocol deviations that on-site monitoring may miss.',
            reference: 'ICH E6(R3) Draft Guideline (2023), Section 5.2',
          },
        ],
        defaultNext: 'edc_data_management',
      },

      {
        id: 'edc_data_management',
        section: 'Monitoring & Data Management',
        question:
          'What Electronic Data Capture (EDC) system and data management approach will be used?',
        guidance:
          '21 CFR Part 11 governs electronic records and electronic signatures. ICH E6(R2) Section 5.5.3 requires that electronic data systems have adequate validation, audit trails, access controls, and backup. FDA Guidance on Electronic Source Data (2013) defines requirements for direct data entry into EDC systems.',
        fields: [
          {
            id: 'edc_system',
            label: 'EDC System',
            type: 'select',
            required: true,
            options: [
              { value: 'medidata_rave', label: 'Medidata Rave' },
              { value: 'oracle_inform', label: 'Oracle Clinical / InForm' },
              { value: 'veeva_vault', label: 'Veeva Vault CDMS' },
              { value: 'castor', label: 'Castor EDC' },
              { value: 'redcap', label: 'REDCap' },
              { value: 'openclinica', label: 'OpenClinica' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'edc_21cfr11_validated',
            label: 'EDC System 21 CFR Part 11 Validated',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'edc_direct_data_entry',
            label: 'Direct Data Entry (eSource) Planned',
            type: 'yes_no',
            required: false,
            helpText:
              'Per FDA Guidance on Electronic Source Data (2013), direct data entry into EDC eliminates the need for paper source documents.',
          },
          {
            id: 'data_cleaning_timeline',
            label: 'Target Database Lock Timeline',
            type: 'text',
            placeholder: 'e.g., 8 weeks after last patient last visit',
            required: false,
          },
          {
            id: 'external_data_sources',
            label: 'External Data Sources / Integrations',
            type: 'multi_select',
            required: false,
            options: [
              { value: 'central_lab', label: 'Central Laboratory' },
              { value: 'ecg_core', label: 'ECG Core Lab' },
              { value: 'imaging_core', label: 'Imaging Core Lab / BICR' },
              { value: 'patient_diary', label: 'ePRO / Patient Diary' },
              { value: 'wearable', label: 'Wearable / Digital Health Technology' },
              { value: 'irt', label: 'IRT / RTSM' },
              { value: 'biobank', label: 'Biobank / Central Biorepository' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'edc_not_validated_check',
            condition: {
              field: 'edc_21cfr11_validated',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'EDC System Not 21 CFR Part 11 Validated',
            message:
              'Use of an EDC system that does not comply with 21 CFR Part 11 requirements for electronic records and electronic signatures may result in FDA data integrity findings during inspection. Ensure validation is completed before first patient enrollment.',
            reference: '21 CFR Part 11 — Electronic Records; Electronic Signatures',
          },
        ],
        defaultNext: 'medical_coding',
      },

      {
        id: 'medical_coding',
        section: 'Monitoring & Data Management',
        question:
          'Specify the medical coding dictionaries and versions to be used for this study.',
        guidance:
          'Per ICH E2B(R3) and ICH M1, MedDRA is the standard dictionary for coding adverse events and medical history. WHO Drug Dictionary (WHODrug) is used for concomitant medication coding. Dictionary versions should be locked at database lock, and the protocol should specify the version used.',
        fields: [
          {
            id: 'meddra_version',
            label: 'MedDRA Version',
            type: 'select',
            required: true,
            options: [
              { value: '27.0', label: 'MedDRA v27.0 (March 2024)' },
              { value: '26.1', label: 'MedDRA v26.1 (September 2023)' },
              { value: '26.0', label: 'MedDRA v26.0 (March 2023)' },
              { value: '25.1', label: 'MedDRA v25.1 (September 2022)' },
              { value: 'latest', label: 'Latest Available at Study Start' },
            ],
          },
          {
            id: 'whodrug_version',
            label: 'WHODrug Dictionary Version',
            type: 'select',
            required: true,
            options: [
              { value: 'march_2024', label: 'WHODrug March 2024' },
              { value: 'september_2023', label: 'WHODrug September 2023' },
              { value: 'latest', label: 'Latest Available at Study Start' },
              { value: 'not_used', label: 'Not Used' },
            ],
          },
          {
            id: 'coding_up_versioning',
            label: 'Dictionary Up-Versioning Strategy',
            type: 'select',
            required: false,
            helpText:
              'MedDRA MSSO recommends maintaining a consistent version throughout a study or implementing a controlled up-versioning process.',
            options: [
              { value: 'fixed', label: 'Fixed Version Throughout Study' },
              { value: 'annual_upgrade', label: 'Annual Upgrade with Reconciliation' },
              { value: 'lock_at_dbl', label: 'Lock Version at Database Lock' },
            ],
          },
        ],
        defaultNext: 'clinical_supply_chain',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 10 — Drug Supply & Labeling
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'clinical_supply_chain',
        section: 'Drug Supply & Labeling',
        question:
          'Describe the clinical supply chain, including IRT/RTSM system, storage requirements, and drug accountability procedures.',
        guidance:
          'Per ICH E6(R2) Section 5.14, the sponsor is responsible for ensuring investigational products are manufactured per GMP (21 CFR 211), properly labeled (21 CFR 312.6), and adequately supplied. An Interactive Response Technology (IRT) / Randomization and Trial Supply Management (RTSM) system manages randomization, drug assignment, and supply logistics. 21 CFR 312.62 requires drug accountability records at each investigational site.',
        fields: [
          {
            id: 'irt_system',
            label: 'IRT / RTSM System',
            type: 'select',
            required: true,
            options: [
              { value: 'oracle_irt', label: 'Oracle IRT' },
              { value: 'medidata_balance', label: 'Medidata Balance (Rave RTSM)' },
              { value: 'suvoda', label: 'Suvoda' },
              { value: 'signant', label: 'Signant Health' },
              { value: 'almac', label: 'Almac Clinical Technologies' },
              { value: 'n_of_one', label: 'N-of-One / Endpoint Clinical' },
              { value: 'manual', label: 'Manual (No IRT)' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'storage_conditions',
            label: 'Storage Conditions',
            type: 'select',
            required: true,
            options: [
              { value: 'room_temp', label: 'Room Temperature (15-25 C)' },
              { value: 'refrigerated', label: 'Refrigerated (2-8 C)' },
              { value: 'frozen', label: 'Frozen (-20 C)' },
              { value: 'ultra_cold', label: 'Ultra-Cold (-80 C / Dry Ice)' },
              { value: 'cryogenic', label: 'Cryogenic (LN2, -150 C)' },
              { value: 'controlled_room', label: 'Controlled Room Temperature (20-25 C)' },
            ],
          },
          {
            id: 'cold_chain_required',
            label: 'Cold Chain Monitoring Required',
            type: 'yes_no',
            required: true,
            helpText:
              'Temperature-sensitive products require validated cold chain shipping with temperature monitoring per ICH Q1A(R2) and WHO Technical Report Series No. 961.',
          },
          {
            id: 'cold_chain_excursion_plan',
            label: 'Temperature Excursion Management Plan',
            type: 'textarea',
            required: false,
            visibleWhen: {
              field: 'cold_chain_required',
              operator: 'eq',
              value: true,
            },
            helpText:
              'Describe procedures for handling temperature excursions including quarantine, stability data assessment, and disposition.',
          },
          {
            id: 'drug_accountability_method',
            label: 'Drug Accountability Method',
            type: 'select',
            required: true,
            helpText:
              'Per 21 CFR 312.62(a), investigators must maintain adequate records of disposition of the drug, including dates, quantities, and use by subjects.',
            options: [
              { value: 'irt_automated', label: 'IRT-Automated with Site Reconciliation' },
              { value: 'manual_log', label: 'Manual Drug Accountability Log' },
              { value: 'hybrid', label: 'Hybrid (IRT + Manual Verification)' },
            ],
          },
          {
            id: 'resupply_strategy',
            label: 'Site Resupply Strategy',
            type: 'select',
            required: false,
            options: [
              { value: 'irt_triggered', label: 'IRT-Triggered Automatic Resupply' },
              { value: 'manual_request', label: 'Manual Request via Depot' },
              { value: 'direct_to_patient', label: 'Direct-to-Patient Shipment' },
              { value: 'depot_based', label: 'Regional Depot-Based' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'manual_irt_risk_check',
            condition: { field: 'irt_system', operator: 'eq', value: 'manual' },
            severity: 'warning',
            title: 'No IRT System — Randomization and Supply Risk',
            message:
              'Manual randomization and supply management without an IRT/RTSM system increases the risk of randomization errors, unblinding, and drug supply shortages. FDA expects validated automated systems for Phase 2b and Phase 3 trials.',
            reference: 'ICH E6(R2) Section 5.14 — Supply and Management of Investigational Products',
          },
          {
            id: 'ultra_cold_chain_check',
            condition: { field: 'storage_conditions', operator: 'in', value: ['ultra_cold', 'cryogenic'] },
            severity: 'info',
            title: 'Ultra-Cold / Cryogenic Storage — Site Feasibility',
            message:
              'Ultra-cold and cryogenic storage requirements significantly limit the number of eligible investigational sites and increase supply chain complexity. Ensure site feasibility assessments include storage capability verification.',
            reference: 'WHO Technical Report Series No. 961 — Temperature-Sensitive Pharmaceutical Products',
          },
        ],
        defaultNext: 'drug_labeling_accountability',
      },

      {
        id: 'drug_labeling_accountability',
        section: 'Drug Supply & Labeling',
        question:
          'Describe the clinical labeling requirements and blinding strategy for investigational product.',
        guidance:
          '21 CFR 312.6 specifies labeling requirements for investigational drugs including: name/code, batch number, storage conditions, route of administration, "Caution: New Drug — Limited by Federal Law to Investigational Use," and expiration date. For blinded studies, labels must not reveal treatment assignment. EU Annex 13 (now replaced by Commission Delegated Regulation (EU) 2017/1569) provides additional labeling requirements for IMP used in EU countries.',
        fields: [
          {
            id: 'labeling_type',
            label: 'Clinical Labeling Type',
            type: 'select',
            required: true,
            options: [
              { value: 'open_label', label: 'Open-Label (Treatment Identified)' },
              {
                value: 'double_blind',
                label: 'Double-Blind (Identical Appearance)',
              },
              {
                value: 'double_dummy',
                label: 'Double-Dummy (Different Formulations)',
              },
              {
                value: 'patient_specific',
                label: 'Patient-Specific (e.g., CAR-T, Gene Therapy)',
              },
            ],
          },
          {
            id: 'over_encapsulation',
            label: 'Over-Encapsulation Required for Blinding',
            type: 'yes_no',
            required: false,
            visibleWhen: {
              field: 'labeling_type',
              operator: 'in',
              value: ['double_blind', 'double_dummy'],
            },
          },
          {
            id: 'shelf_life_months',
            label: 'Current Shelf Life (Months)',
            type: 'number',
            required: false,
            validation: { min: 1, max: 60 },
            helpText:
              'Per ICH Q1A(R2), shelf life must be supported by stability data. Short shelf life products require careful supply chain planning.',
          },
          {
            id: 'multilingual_labels',
            label: 'Multi-Language Labeling Required',
            type: 'yes_no',
            required: false,
            helpText:
              'For multi-country trials, labels may need to include multiple languages per local regulatory requirements.',
          },
        ],
        defaultNext: 'diversity_action_plan',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 11 — Diversity & Enrollment Planning
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'diversity_action_plan',
        section: 'Diversity & Enrollment Planning',
        question:
          'Describe the trial diversity plan, demographic enrollment targets, and community engagement strategy.',
        guidance:
          'FDA Guidance on Diversity Plans to Improve Enrollment of Participants from Underrepresented Populations (2024) requires sponsors of Phase 3 and pivotal trials to submit a Diversity Action Plan. FDORA Section 3601 codified this requirement. The plan must include enrollment goals by race, ethnicity, sex, and age; a rationale for the targets; and strategies to achieve them. FDA may grant exemptions when a Diversity Action Plan is not feasible.',
        fields: [
          {
            id: 'diversity_plan_required',
            label: 'FDA Diversity Action Plan Required',
            type: 'yes_no',
            required: true,
            helpText:
              'Per FDORA Section 3601 and FDA Guidance (2024), Diversity Action Plans are required for Phase 3 and other pivotal studies unless an exemption is granted.',
          },
          {
            id: 'race_ethnicity_targets',
            label: 'Race / Ethnicity Enrollment Targets',
            type: 'textarea',
            required: false,
            visibleWhen: {
              field: 'diversity_plan_required',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'e.g., Black/African American: 15%; Hispanic/Latino: 20%; Asian: 8%; based on US disease prevalence data',
          },
          {
            id: 'sex_enrollment_targets',
            label: 'Sex Enrollment Targets',
            type: 'textarea',
            required: false,
            visibleWhen: {
              field: 'diversity_plan_required',
              operator: 'eq',
              value: true,
            },
            placeholder: 'e.g., Female: 50%; based on disease epidemiology',
          },
          {
            id: 'age_group_targets',
            label: 'Age Group Enrollment Targets',
            type: 'textarea',
            required: false,
            visibleWhen: {
              field: 'diversity_plan_required',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'e.g., >65 years: 30%; to reflect the elderly patient population per ICH E7',
          },
          {
            id: 'community_site_involvement',
            label: 'Community Site / FQHC Involvement Planned',
            type: 'yes_no',
            required: false,
            helpText:
              'Consider including Federally Qualified Health Centers (FQHCs), community hospitals, and minority-serving institutions to improve access.',
          },
          {
            id: 'enrollment_barriers_mitigation',
            label: 'Enrollment Barrier Mitigation Strategies',
            type: 'multi_select',
            required: false,
            options: [
              { value: 'transportation', label: 'Transportation Support' },
              { value: 'childcare', label: 'Childcare Support' },
              { value: 'flexible_visits', label: 'Flexible Visit Windows' },
              { value: 'multilingual_staff', label: 'Multilingual Study Staff' },
              { value: 'community_advisory', label: 'Community Advisory Board' },
              { value: 'mobile_units', label: 'Mobile Research Units' },
              { value: 'telehealth', label: 'Telehealth Visits' },
              { value: 'stipends', label: 'Participant Stipends / Reimbursement' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_diversity_plan_check',
            condition: {
              field: 'diversity_plan_required',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'No Diversity Action Plan — Regulatory Expectation',
            message:
              'FDORA Section 3601 and FDA Guidance on Diversity Action Plans (2024) require Phase 3 and pivotal trials to submit a Diversity Action Plan. Sponsors must provide justification if a plan is not submitted.',
            reference:
              'FDORA Section 3601; FDA Guidance: Diversity Plans to Improve Enrollment (2024)',
          },
        ],
        defaultNext: 'decentralized_elements',
      },

      {
        id: 'decentralized_elements',
        section: 'Diversity & Enrollment Planning',
        question:
          'Will this study incorporate decentralized clinical trial (DCT) elements?',
        guidance:
          'FDA Draft Guidance on Decentralized Clinical Trials for Drugs, Biological Products, and Devices (2024) provides a framework for incorporating remote elements such as telemedicine visits, direct-to-patient drug shipment, home health visits, and digital health technologies. DCT elements can improve enrollment diversity and reduce patient burden.',
        fields: [
          {
            id: 'dct_elements_planned',
            label: 'Decentralized Trial Elements Planned',
            type: 'multi_select',
            required: false,
            options: [
              { value: 'none', label: 'None (Fully Site-Based)' },
              { value: 'telehealth', label: 'Telehealth / Virtual Visits' },
              { value: 'home_nursing', label: 'Home Health Nursing Visits' },
              { value: 'dtp_drug', label: 'Direct-to-Patient Drug Shipment' },
              { value: 'local_lab', label: 'Local / Mobile Lab Services' },
              { value: 'epro_ecoa', label: 'ePRO / eCOA (Electronic Patient Diaries)' },
              { value: 'wearables', label: 'Wearable Devices / Sensors' },
              { value: 'mobile_imaging', label: 'Mobile Imaging Units' },
            ],
          },
          {
            id: 'dht_devices_used',
            label: 'Digital Health Technologies (DHTs) Used',
            type: 'textarea',
            required: false,
            placeholder:
              'e.g., Continuous glucose monitor (Dexcom G7), actigraphy (ActiGraph), smart pill bottle (Proteus)',
            helpText:
              'Per FDA Guidance on Digital Health Technologies for Remote Data Acquisition in Clinical Investigations (2024), DHTs must be fit for purpose with established verification and validation.',
          },
          {
            id: 'hybrid_visit_schedule',
            label: 'Hybrid Visit Schedule Description',
            type: 'textarea',
            required: false,
            placeholder:
              'e.g., Screening and Day 1 on-site; Weeks 2, 6 via telehealth; Week 12 on-site',
          },
        ],
        defaultNext: 'pv_reporting',
      },

      /* ══════════════════════════════════════════════════════════════════
       * Section 12 — Pharmacovigilance Plan
       * ══════════════════════════════════════════════════════════════════ */

      {
        id: 'pv_reporting',
        section: 'Pharmacovigilance Plan',
        question:
          'Define the pharmacovigilance reporting plan, including SUSAR reporting timelines and DSUR requirements.',
        guidance:
          '21 CFR 312.32 governs IND safety reporting: unexpected fatal/life-threatening SUSARs require 7-day initial reports, all other SUSARs require 15-day reports. ICH E2F provides the standard for the Development Safety Update Report (DSUR), which is an annual summary of safety data submitted to regulatory authorities. ICH E2A defines the criteria for expedited reporting of individual case safety reports (ICSRs). EMA requires SUSARs to be reported to EudraVigilance per Regulation (EC) No 726/2004.',
        fields: [
          {
            id: 'susar_7day_process',
            label: 'SUSAR 7-Day Reporting Process (Fatal/Life-Threatening)',
            type: 'select',
            required: true,
            helpText:
              'Per 21 CFR 312.32(c)(2), unexpected fatal or life-threatening suspected adverse reactions require initial reporting within 7 calendar days, with follow-up within 8 additional days.',
            options: [
              { value: 'in_house', label: 'In-House PV Team' },
              { value: 'outsourced_cro', label: 'Outsourced to CRO' },
              { value: 'outsourced_pv', label: 'Outsourced to PV Vendor' },
            ],
          },
          {
            id: 'susar_15day_process',
            label: 'SUSAR 15-Day Reporting Process (All Other)',
            type: 'select',
            required: true,
            helpText:
              'Per 21 CFR 312.32(c)(1), all other SUSARs require reporting within 15 calendar days of initial receipt.',
            options: [
              { value: 'in_house', label: 'In-House PV Team' },
              { value: 'outsourced_cro', label: 'Outsourced to CRO' },
              { value: 'outsourced_pv', label: 'Outsourced to PV Vendor' },
            ],
          },
          {
            id: 'safety_database',
            label: 'Safety Database System',
            type: 'select',
            required: true,
            options: [
              { value: 'argus', label: 'Oracle Argus Safety' },
              { value: 'aris_g', label: 'ArisGlobal LifeSphere' },
              { value: 'veeva_vault_safety', label: 'Veeva Vault Safety' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'dsur_preparation',
            label: 'DSUR Preparation Planned',
            type: 'yes_no',
            required: true,
            helpText:
              'ICH E2F requires sponsors to submit a Development Safety Update Report (DSUR) annually to all regulatory authorities where an IND/CTA is active. The DSUR is due within 60 days of the Development International Birth Date (DIBD).',
          },
          {
            id: 'dsur_dibd',
            label: 'Development International Birth Date (DIBD)',
            type: 'date',
            required: false,
            visibleWhen: {
              field: 'dsur_preparation',
              operator: 'eq',
              value: true,
            },
            helpText:
              'Per ICH E2F, the DIBD is the date of first authorization in any country for clinical investigation.',
          },
          {
            id: 'causality_assessment_method',
            label: 'Causality Assessment Methodology',
            type: 'select',
            required: true,
            helpText:
              'Per ICH E2A, the investigator must assess causality for each adverse event. The sponsor performs a separate independent assessment.',
            options: [
              { value: 'who_umc', label: 'WHO-UMC System (Certain, Probable, Possible, etc.)' },
              { value: 'naranjo', label: 'Naranjo Algorithm' },
              { value: 'binary', label: 'Binary (Related / Not Related)' },
              { value: 'five_point', label: 'Five-Point Scale (Definite to Unrelated)' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_dsur_check',
            condition: {
              field: 'dsur_preparation',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'DSUR Not Planned — Regulatory Requirement',
            message:
              'ICH E2F requires annual DSUR submission for all active INDs/CTAs. Failure to submit the DSUR may result in regulatory action including clinical holds. The first DSUR is due within 60 days of the DIBD anniversary.',
            reference:
              'ICH E2F — Development Safety Update Report; 21 CFR 312.33 — Annual Reports',
          },
        ],
        defaultNext: 'safety_signal_detection',
      },

      {
        id: 'safety_signal_detection',
        section: 'Pharmacovigilance Plan',
        question:
          'Describe the safety signal detection and management plan for this study.',
        guidance:
          'ICH E2E provides guidance on pharmacovigilance planning including signal detection methodology. FDA Guidance on Good Pharmacovigilance Practices (2005) recommends systematic approaches to identify, evaluate, and manage safety signals. Signal detection methods should be pre-specified and may include disproportionality analyses, Bayesian methods, and clinical review of aggregate safety data.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'signal_detection_method',
            label: 'Signal Detection Methods',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'clinical_review', label: 'Clinical Review of Aggregate Data' },
              { value: 'soc_pt_analysis', label: 'MedDRA SOC/PT Frequency Analysis' },
              { value: 'disproportionality', label: 'Disproportionality Analysis (PRR, ROR)' },
              { value: 'bayesian', label: 'Bayesian Signal Detection (BCPNN, MGPS)' },
              { value: 'cumulative_review', label: 'Cumulative Review at Pre-Specified Intervals' },
              { value: 'dsmb_review', label: 'DSMB / DMC Safety Review' },
            ],
          },
          {
            id: 'signal_review_frequency',
            label: 'Safety Signal Review Frequency',
            type: 'select',
            required: true,
            options: [
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'biannual', label: 'Biannually (with DSUR)' },
              { value: 'continuous', label: 'Continuous (Automated Monitoring)' },
              { value: 'event_driven', label: 'Event-Driven' },
            ],
          },
          {
            id: 'safety_management_team',
            label: 'Safety Management Team (SMT) Established',
            type: 'yes_no',
            required: true,
            helpText:
              'A cross-functional Safety Management Team typically includes medical monitor, PV physician, biostatistician, and regulatory affairs representative.',
          },
          {
            id: 'risk_management_plan',
            label: 'Risk Management Plan (RMP) / REMS Strategy',
            type: 'select',
            required: false,
            helpText:
              'EMA requires an EU Risk Management Plan per Directive 2001/83/EC Article 104a. FDA may require REMS per 21 CFR 314.42.',
            options: [
              { value: 'not_applicable', label: 'Not Applicable at This Stage' },
              { value: 'rmp_draft', label: 'EU RMP Draft in Progress' },
              { value: 'rmp_submitted', label: 'EU RMP Submitted' },
              { value: 'rems_planned', label: 'FDA REMS Under Evaluation' },
              { value: 'both', label: 'Both EU RMP and FDA REMS Planned' },
            ],
          },
          {
            id: 'pregnancy_reporting',
            label: 'Pregnancy Reporting and Follow-Up Required',
            type: 'yes_no',
            required: true,
            helpText:
              'Per ICH E2A and FDA Guidance on Safety Reporting (2015), pregnancies in study subjects or partners must be reported and followed to outcome.',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
