/**
 * Briefing Book (Advisory Committee Briefing Document) flow definition
 * for the AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through preparation of an Advisory
 * Committee briefing document covering meeting context, product and
 * indication overview, nonclinical summary, clinical program overview,
 * benefit-risk framework, and voting questions & strategy.
 *
 * 16 nodes · 80+ fields · 6 sections · 12+ issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/briefing-book
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createBriefingBookFlow(): FlowDefinition {
  return {
    id: 'briefing-book-v1',
    category: 'briefing_book',
    name: 'Advisory Committee Briefing Book',
    description:
      'Comprehensive questionnaire for preparing an Advisory Committee Briefing Document, covering meeting context, product and indication overview, nonclinical summary, clinical program results, benefit-risk framework, and voting questions & strategy per FDA Advisory Committee guidance and 21 CFR Part 14.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'meeting_details',
    estimatedMinutes: 60,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'meeting_context',
        label: 'Meeting Context',
        nodeIds: ['meeting_details', 'committee_selection'],
      },
      {
        id: 'product_indication',
        label: 'Product & Indication Overview',
        nodeIds: ['product_overview', 'indication_and_epidemiology', 'competitive_landscape'],
      },
      {
        id: 'nonclinical',
        label: 'Nonclinical Summary',
        nodeIds: ['nonclinical_overview'],
      },
      {
        id: 'clinical_program',
        label: 'Clinical Program Overview',
        nodeIds: ['clinical_program_summary', 'efficacy_results', 'safety_summary', 'safety_update'],
      },
      {
        id: 'benefit_risk',
        label: 'Benefit-Risk Framework',
        nodeIds: ['benefit_risk_assessment', 'risk_management_plan', 'post_marketing_commitments'],
      },
      {
        id: 'voting_strategy',
        label: 'Voting Questions & Strategy',
        nodeIds: ['voting_questions', 'presentation_strategy', 'final_review'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Meeting Context                                     */
      /* ================================================================ */

      {
        id: 'meeting_details',
        section: 'meeting_context',
        question:
          'Let\'s begin with the Advisory Committee meeting context. What type of meeting is this, and what is the regulatory purpose?',
        guidance:
          'Per 21 CFR Part 14 and the Federal Advisory Committee Act (FACA, 5 USC Appendix 2), FDA Advisory Committee meetings are public proceedings where external experts provide recommendations to the Agency. The sponsor\'s briefing document is typically submitted 30-55 days before the meeting per PDUFA commitments and FDA\'s "Guidance for Industry: Advisory Committee Meetings — Preparation and Public Availability of Information Given to Advisory Committee Members" (2008). The briefing document is made public at least two business days before the meeting.',
        fields: [
          {
            id: 'meeting_type',
            label: 'Meeting Purpose',
            type: 'select',
            required: true,
            options: [
              { value: 'pre_approval', label: 'Pre-Approval (Original NDA/BLA)', description: 'Advisory Committee meeting before initial marketing approval' },
              { value: 'supplemental', label: 'Supplemental Application (sNDA/sBLA)', description: 'New indication, formulation, or population' },
              { value: 'post_approval_safety', label: 'Post-Approval Safety Review', description: 'Safety signal evaluation after marketing' },
              { value: 'pediatric', label: 'Pediatric-Focused Meeting', description: 'PREA-required pediatric data review' },
              { value: 'rems_review', label: 'REMS Review', description: 'Risk Evaluation and Mitigation Strategy assessment' },
              { value: 'citizen_petition', label: 'Citizen Petition / Policy', description: 'FDA-requested advisory on policy or regulatory matter' },
            ],
          },
          {
            id: 'meeting_date',
            label: 'Scheduled Meeting Date',
            type: 'date',
            required: true,
          },
          {
            id: 'briefing_document_due_date',
            label: 'Briefing Document Submission Deadline',
            type: 'date',
            required: true,
            helpText: 'Per PDUFA commitments, the sponsor briefing document is typically due 30-55 days before the meeting. Confirm the exact deadline with your FDA project manager.',
          },
          {
            id: 'application_number',
            label: 'Application Number (NDA/BLA/sNDA/sBLA)',
            type: 'text',
            placeholder: 'e.g., NDA 214787 or BLA 761248',
            required: true,
          },
          {
            id: 'product_name',
            label: 'Product Name (Proprietary and Generic)',
            type: 'text',
            placeholder: 'e.g., BRAND NAME (generic name)',
            required: true,
          },
          {
            id: 'sponsor_name',
            label: 'Sponsor Name',
            type: 'text',
            placeholder: 'e.g., Acme Therapeutics, Inc.',
            required: true,
          },
          {
            id: 'fda_review_division',
            label: 'FDA Review Division',
            type: 'text',
            placeholder: 'e.g., Division of Oncology Products 1, CDER',
            helpText: 'Identify the review division to align your briefing document with their expectations and prior precedents.',
          },
        ],
        defaultNext: 'committee_selection',
      },

      {
        id: 'committee_selection',
        section: 'meeting_context',
        question:
          'Which Advisory Committee will convene, and what is the composition of the panel? Understanding the committee helps tailor the briefing document.',
        guidance:
          'FDA has multiple Advisory Committees under CDER, CBER, and CDRH per 21 CFR Part 14.100. Each committee has specific therapeutic expertise. The Oncologic Drugs Advisory Committee (ODAC) reviews oncology products; the Anesthetic and Analgesic Drug Products Advisory Committee (AADPAC) covers pain; the Cardiovascular and Renal Drugs Advisory Committee (CRDAC) handles CV drugs. CDRH panels review devices. Knowing the committee allows you to anticipate the types of questions panelists may ask and tailor the briefing document accordingly.',
        fields: [
          {
            id: 'advisory_committee',
            label: 'Advisory Committee',
            type: 'select',
            required: true,
            options: [
              { value: 'odac', label: 'ODAC — Oncologic Drugs Advisory Committee' },
              { value: 'aadpac', label: 'AADPAC — Anesthetic and Analgesic Drug Products AC' },
              { value: 'crdac', label: 'CRDAC — Cardiovascular and Renal Drugs AC' },
              { value: 'emdac', label: 'EMDAC — Endocrinologic and Metabolic Drugs AC' },
              { value: 'pcns', label: 'PCNS — Psychopharmacologic Drugs AC' },
              { value: 'amdac', label: 'AMDAC — Antimicrobial Drugs AC' },
              { value: 'gastrointestinal', label: 'GIDAC — Gastrointestinal Drugs AC' },
              { value: 'dermatologic', label: 'DDMAC — Dermatologic and Ophthalmic Drugs AC' },
              { value: 'pulmonary_allergy', label: 'PADAC — Pulmonary-Allergy Drugs AC' },
              { value: 'vaccines_related', label: 'VRBPAC — Vaccines and Related Biological Products AC' },
              { value: 'blood_products', label: 'Blood Products Advisory Committee' },
              { value: 'cdrh_panel', label: 'CDRH Device Panel (specify below)' },
              { value: 'joint', label: 'Joint Advisory Committee Meeting' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'cdrh_panel_name',
            label: 'CDRH Panel Name',
            type: 'text',
            placeholder: 'e.g., Circulatory System Devices Panel',
            visibleWhen: { field: 'advisory_committee', operator: 'eq', value: 'cdrh_panel' },
          },
          {
            id: 'joint_committee_details',
            label: 'Joint Committee Details',
            type: 'textarea',
            placeholder: 'e.g., Joint ODAC and CRDAC meeting to review cardiovascular safety of oncology drug',
            visibleWhen: { field: 'advisory_committee', operator: 'eq', value: 'joint' },
          },
          {
            id: 'prior_ac_meetings',
            label: 'Any Prior Advisory Committee Meetings for This Product?',
            type: 'yes_no',
            helpText: 'If a prior AC meeting was held, the briefing document should address how prior committee feedback has been incorporated.',
          },
          {
            id: 'prior_ac_outcome_summary',
            label: 'Prior AC Meeting Outcome Summary',
            type: 'textarea',
            placeholder: 'e.g., Prior ODAC meeting on [date] voted 8-4 in favor of approval but raised concerns about hepatotoxicity signal. FDA issued a Complete Response Letter requesting additional safety data.',
            visibleWhen: { field: 'prior_ac_meetings', operator: 'eq', value: true },
          },
          {
            id: 'fda_briefing_document_expected',
            label: 'Has FDA Indicated They Will Publish Their Own Briefing Document?',
            type: 'yes_no',
            helpText: 'FDA typically publishes its own briefing document 1-2 business days before the meeting. Anticipating FDA\'s framing helps prepare the sponsor\'s presentation strategy.',
          },
          {
            id: 'patient_representative_expected',
            label: 'Is a Patient Representative Expected on the Panel?',
            type: 'yes_no',
            helpText: 'Patient representatives bring a unique perspective. Consider including a patient-focused benefit narrative in your briefing document.',
          },
        ],
        branches: [
          {
            when: { field: 'meeting_type', operator: 'eq', value: 'pediatric' },
            goto: 'product_overview',
          },
          {
            when: { field: 'advisory_committee', operator: 'eq', value: 'cdrh_panel' },
            goto: 'product_overview',
          },
        ],
        defaultNext: 'product_overview',
      },

      /* ================================================================ */
      /*  Section 2 — Product & Indication Overview                       */
      /* ================================================================ */

      {
        id: 'product_overview',
        section: 'product_indication',
        question:
          'Provide a concise overview of the product for the Advisory Committee. This section sets the stage for the entire briefing document.',
        guidance:
          'The product overview section of the briefing document should provide a clear, concise summary that a non-specialist panelist can understand. Per FDA guidance on AC briefing documents, include the mechanism of action, formulation, dosing regimen, and the specific regulatory action being sought. For biologics, briefly describe the manufacturing process. Reference the product label (if approved) or proposed labeling.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'drug_generic_name',
            label: 'Generic / INN Name',
            type: 'text',
            placeholder: 'e.g., pembrolizumab',
            required: true,
          },
          {
            id: 'drug_brand_name',
            label: 'Proprietary (Brand) Name',
            type: 'text',
            placeholder: 'e.g., KEYTRUDA',
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
              { value: 'cell_therapy', label: 'Cell Therapy (CAR-T, TCR, etc.)' },
              { value: 'vaccine', label: 'Vaccine' },
              { value: 'peptide', label: 'Peptide' },
              { value: 'oligonucleotide', label: 'Oligonucleotide (ASO/siRNA)' },
              { value: 'biosimilar', label: 'Biosimilar' },
              { value: 'combination_product', label: 'Combination Product' },
              { value: 'medical_device', label: 'Medical Device' },
            ],
          },
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action (Brief)',
            type: 'textarea',
            placeholder: 'e.g., Humanized IgG4 monoclonal antibody that binds PD-1 receptor, blocking PD-L1 and PD-L2 interaction, thereby restoring anti-tumor T-cell immunity.',
            required: true,
            validation: { minLength: 30 },
          },
          {
            id: 'dosing_regimen',
            label: 'Proposed / Approved Dosing Regimen',
            type: 'textarea',
            placeholder: 'e.g., 200 mg IV Q3W or 400 mg IV Q6W until disease progression, unacceptable toxicity, or up to 24 months.',
            required: true,
          },
          {
            id: 'regulatory_action_sought',
            label: 'Specific Regulatory Action Being Sought',
            type: 'textarea',
            placeholder: 'e.g., Approval of original BLA for treatment of adult patients with unresectable or metastatic melanoma. OR: Supplemental NDA for expansion to first-line NSCLC.',
            required: true,
            validation: { minLength: 20 },
          },
          {
            id: 'expedited_designations',
            label: 'Expedited Program Designations',
            type: 'multi_select',
            options: [
              { value: 'fast_track', label: 'Fast Track' },
              { value: 'breakthrough', label: 'Breakthrough Therapy' },
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'accelerated_approval', label: 'Accelerated Approval' },
              { value: 'rmat', label: 'RMAT (Regenerative Medicine Advanced Therapy)' },
              { value: 'orphan', label: 'Orphan Drug Designation' },
              { value: 'none', label: 'None' },
            ],
          },
        ],
        defaultNext: 'indication_and_epidemiology',
      },

      {
        id: 'indication_and_epidemiology',
        section: 'product_indication',
        question:
          'Describe the target indication, disease epidemiology, and unmet medical need. This establishes why this product matters.',
        guidance:
          'The Advisory Committee must understand the disease burden and current treatment landscape. Present incidence and prevalence data with authoritative sources (NCI SEER, WHO, CDC). Describe the current standard of care and its limitations. Quantify the unmet need — mortality rates, lack of therapeutic options, treatment-related toxicity burden. For rare diseases, emphasize orphan disease considerations. This section should make a compelling case for why a new therapy is needed.',
        fields: [
          {
            id: 'proposed_indication',
            label: 'Proposed Indication (Exact Wording)',
            type: 'textarea',
            placeholder: 'e.g., Treatment of adult patients with locally advanced or metastatic urothelial carcinoma who have disease progression during or following platinum-containing chemotherapy.',
            required: true,
          },
          {
            id: 'disease_epidemiology',
            label: 'Disease Epidemiology (Incidence/Prevalence)',
            type: 'textarea',
            placeholder: 'e.g., Approximately 83,000 new cases and 17,000 deaths annually in the US (ACS 2024). 5-year survival rate for metastatic disease is 5-8%.',
            required: true,
            validation: { minLength: 30 },
          },
          {
            id: 'current_standard_of_care',
            label: 'Current Standard of Care',
            type: 'textarea',
            placeholder: 'e.g., First-line: Gemcitabine + cisplatin. Second-line: Limited options — single-agent chemotherapy with ORR <15% and median OS of 7-9 months.',
            required: true,
          },
          {
            id: 'unmet_medical_need',
            label: 'Unmet Medical Need Statement',
            type: 'textarea',
            placeholder: 'e.g., Patients who progress on platinum-based chemotherapy have limited treatment options with poor response rates and significant toxicity. No approved targeted therapies exist for this population.',
            required: true,
            validation: { minLength: 30 },
          },
          {
            id: 'patient_population_size',
            label: 'Estimated US Patient Population (Annual)',
            type: 'text',
            placeholder: 'e.g., ~15,000 patients annually would be eligible for the proposed indication',
          },
          {
            id: 'pediatric_relevance',
            label: 'Is this indication relevant to pediatric populations?',
            type: 'yes_no',
            helpText: 'If a pediatric-focused AC meeting, this section should include pediatric-specific epidemiology and development history per PREA.',
          },
        ],
        defaultNext: 'competitive_landscape',
      },

      {
        id: 'competitive_landscape',
        section: 'product_indication',
        question:
          'Describe the competitive landscape. What approved and investigational therapies exist, and how does this product differentiate?',
        guidance:
          'Advisory Committee members will want to understand where this product fits relative to existing and emerging therapies. Include all approved therapies for the same indication with their efficacy and safety profiles. Identify key competitors in late-stage clinical development. Present a differentiation narrative — how does this product offer a meaningful improvement over available options? This context is critical for the benefit-risk discussion.',
        fields: [
          {
            id: 'approved_therapies',
            label: 'Currently Approved Therapies for This Indication',
            type: 'textarea',
            placeholder: 'e.g., 1. Drug A (Brand): Approved 2019, ORR 22%, mOS 10.3 months, Key toxicities: nephrotoxicity, neuropathy.\n2. Drug B (Brand): Approved 2021, ORR 28%, mOS 12.1 months, Key toxicities: immune-related AEs.',
            required: true,
          },
          {
            id: 'investigational_therapies',
            label: 'Key Investigational Therapies in Late-Stage Development',
            type: 'textarea',
            placeholder: 'e.g., Competitor X: Phase 3 (NCT01234567), estimated completion Q4 2025. Competitor Y: Phase 2/3, accelerated approval pathway.',
          },
          {
            id: 'differentiation_narrative',
            label: 'Product Differentiation Narrative',
            type: 'textarea',
            placeholder: 'e.g., Novel mechanism targeting [X] with potential for improved efficacy in [subgroup]. Oral formulation vs. IV standard of care. Favorable safety profile with no dose-limiting myelosuppression.',
            required: true,
            validation: { minLength: 30 },
          },
          {
            id: 'head_to_head_data',
            label: 'Is Head-to-Head Data Available vs. Standard of Care?',
            type: 'select',
            options: [
              { value: 'yes_superiority', label: 'Yes — Superiority trial completed' },
              { value: 'yes_non_inferiority', label: 'Yes — Non-inferiority trial completed' },
              { value: 'indirect_comparison', label: 'No — Indirect/Cross-trial comparison only' },
              { value: 'single_arm', label: 'No — Single-arm study (no comparator)' },
            ],
            helpText: 'The absence of head-to-head comparative data is frequently raised by Advisory Committee members. Prepare cross-trial comparison analyses if direct data is unavailable.',
          },
        ],
        defaultNext: 'nonclinical_overview',
        issueChecks: [
          {
            id: 'incomplete_competitive_landscape',
            condition: { field: 'investigational_therapies', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'Incomplete Competitive Landscape',
            message:
              'Advisory Committee members expect a comprehensive view of the therapeutic landscape, including late-stage investigational therapies. Omitting competitive pipeline data may invite challenging questions about the product\'s relative positioning. Review ClinicalTrials.gov for relevant Phase 2/3 competitors.',
            reference: 'FDA Guidance: Advisory Committee Meetings (2008)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 3 — Nonclinical Summary                                 */
      /* ================================================================ */

      {
        id: 'nonclinical_overview',
        section: 'nonclinical',
        question:
          'Provide a high-level nonclinical summary for the Advisory Committee. Focus on findings relevant to the clinical benefit-risk assessment.',
        guidance:
          'The nonclinical section of the briefing document should be concise — the Advisory Committee is primarily interested in clinical data. Focus on: (1) mechanism of action validation from animal models, (2) key toxicology findings that inform clinical safety monitoring, (3) carcinogenicity, reproductive toxicity, and genotoxicity findings, and (4) any nonclinical findings that remain unexplained or are relevant to long-term safety. Reference ICH M3(R2) and the IND nonclinical package.',
        fields: [
          {
            id: 'pharmacology_summary',
            label: 'Primary Pharmacology Summary',
            type: 'textarea',
            placeholder: 'e.g., In vitro and in vivo studies demonstrated dose-dependent target inhibition. Xenograft models showed 60-80% tumor growth inhibition at clinically relevant exposures.',
            required: true,
          },
          {
            id: 'key_toxicology_findings',
            label: 'Key Toxicology Findings Relevant to Clinical Safety',
            type: 'textarea',
            placeholder: 'e.g., Target organ toxicity: hepatotoxicity (reversible, rat/dog) and myelosuppression (rat). NOAEL: 30 mg/kg/day in dog. Safety margins: >10x at proposed clinical dose.',
            required: true,
            validation: { minLength: 30 },
          },
          {
            id: 'carcinogenicity_findings',
            label: 'Carcinogenicity Assessment',
            type: 'select',
            options: [
              { value: 'completed_negative', label: 'Completed — No carcinogenic potential identified' },
              { value: 'completed_positive', label: 'Completed — Findings identified (describe below)' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'waived', label: 'Waived with scientific justification' },
              { value: 'not_required', label: 'Not required (biologic per ICH S6(R1))' },
            ],
          },
          {
            id: 'carcinogenicity_details',
            label: 'Carcinogenicity Findings Details',
            type: 'textarea',
            visibleWhen: { field: 'carcinogenicity_findings', operator: 'eq', value: 'completed_positive' },
          },
          {
            id: 'reproductive_toxicity_summary',
            label: 'Reproductive and Developmental Toxicity Summary',
            type: 'textarea',
            placeholder: 'e.g., Embryo-fetal development studies showed teratogenicity at maternally toxic doses in rabbits. Product is contraindicated in pregnancy. Pregnancy testing required per labeling.',
          },
          {
            id: 'nonclinical_concerns_unresolved',
            label: 'Any Unresolved Nonclinical Concerns?',
            type: 'textarea',
            placeholder: 'e.g., Phospholipidosis observed in rat at high doses — clinical significance uncertain. Monitoring plan in place.',
            helpText: 'Advisory Committee members and FDA reviewers will probe any unresolved nonclinical findings. Proactively address these in the briefing document.',
          },
        ],
        defaultNext: 'clinical_program_summary',
      },

      /* ================================================================ */
      /*  Section 4 — Clinical Program Overview                           */
      /* ================================================================ */

      {
        id: 'clinical_program_summary',
        section: 'clinical_program',
        question:
          'Provide an overview of the clinical development program. How many studies, what phases, and what is the total patient exposure?',
        guidance:
          'The clinical program overview should give the Advisory Committee a roadmap of all clinical studies that support the application. Present the studies in a tabular format: study number, phase, design, population, N enrolled, key endpoints. Highlight the pivotal study(ies). Total patient exposure data (patient-years) is critical for the safety database assessment per ICH E1. For NDA/BLA submissions, FDA expects at least 1,500 patients exposed and 300-600 patients for 6 months per ICH E1.',
        fields: [
          {
            id: 'total_studies_in_program',
            label: 'Total Number of Clinical Studies in the Program',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'pivotal_study_identifiers',
            label: 'Pivotal Study Identifier(s)',
            type: 'text',
            placeholder: 'e.g., Study ABC-301 (Phase 3) and Study ABC-201 (Phase 2)',
            required: true,
          },
          {
            id: 'total_patients_exposed',
            label: 'Total Patients Exposed to Study Drug',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText: 'Per ICH E1, FDA expects at least 1,500 patients exposed for chronic-use drugs, with at least 300-600 exposed for 6 months and 100 for 12 months.',
          },
          {
            id: 'total_patient_years',
            label: 'Total Patient-Years of Exposure',
            type: 'text',
            placeholder: 'e.g., 2,450 patient-years',
          },
          {
            id: 'clinical_program_overview',
            label: 'Clinical Program Overview (Study Listing)',
            type: 'textarea',
            placeholder: 'e.g., Phase 1: ABC-101 (dose escalation, N=45), ABC-102 (food effect, N=24). Phase 2: ABC-201 (single-arm, N=120). Phase 3: ABC-301 (randomized, N=650).',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'pivotal_study_design',
            label: 'Pivotal Study Design Summary',
            type: 'textarea',
            placeholder: 'e.g., Randomized, double-blind, placebo-controlled, multicenter Phase 3 study in patients with [indication]. 2:1 randomization. Primary endpoint: PFS by BICR per RECIST v1.1. Key secondary: OS, ORR, DOR.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'study_population_demographics',
            label: 'Key Demographics of Study Population',
            type: 'textarea',
            placeholder: 'e.g., Median age 62 (range 28-84). 55% male. 72% White, 12% Black, 8% Asian. ECOG PS 0-1. Prior lines of therapy: median 1 (range 0-4).',
          },
        ],
        defaultNext: 'efficacy_results',
        provideExpertFeedback: true,
      },

      {
        id: 'efficacy_results',
        section: 'clinical_program',
        question:
          'Present the key efficacy results from the pivotal study(ies). This is the core of the briefing document.',
        guidance:
          'Present efficacy results with precision and transparency. Include the primary endpoint with the pre-specified statistical analysis, all key secondary endpoints, and pre-specified subgroup analyses. For time-to-event endpoints, include Kaplan-Meier curves, hazard ratios with confidence intervals, and median values. For response endpoints, include confirmed response rates, duration of response, and time to response. FDA will scrutinize the statistical analysis plan — ensure consistency between the SAP and the results presented. Address any multiplicity-adjusted analyses.',
        fields: [
          {
            id: 'primary_endpoint_result',
            label: 'Primary Endpoint Result',
            type: 'textarea',
            placeholder: 'e.g., Median PFS: 12.3 months (drug) vs. 6.1 months (control). HR = 0.52 (95% CI: 0.42-0.64), p < 0.0001. Pre-specified statistical significance boundary crossed at interim analysis.',
            required: true,
            validation: { minLength: 30 },
          },
          {
            id: 'primary_endpoint_met',
            label: 'Was the Primary Endpoint Met?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'key_secondary_endpoints',
            label: 'Key Secondary Endpoint Results',
            type: 'textarea',
            placeholder: 'e.g., OS: Median not reached vs. 18.2 months, HR = 0.71 (95% CI: 0.55-0.92). ORR: 45% vs. 18% (p < 0.001). Median DOR: 14.5 months vs. 8.2 months.',
            required: true,
          },
          {
            id: 'subgroup_analyses',
            label: 'Pre-Specified Subgroup Analyses',
            type: 'textarea',
            placeholder: 'e.g., Consistent benefit across age, sex, race, ECOG PS, and prior therapy subgroups. Biomarker-high subgroup: HR = 0.35; biomarker-low: HR = 0.78. Forest plot included.',
            helpText: 'Pre-specified subgroup analyses are expected in the briefing document. Identify any subgroups with inconsistent treatment effect.',
          },
          {
            id: 'patient_reported_outcomes',
            label: 'Patient-Reported Outcomes (PROs)',
            type: 'textarea',
            placeholder: 'e.g., EORTC QLQ-C30 Global Health Status: Mean change from baseline +5.2 (drug) vs. -2.1 (control). Time to deterioration: significantly delayed (HR = 0.65, p = 0.003).',
            helpText: 'PRO data is increasingly important at Advisory Committee meetings and for FDA labeling decisions.',
          },
          {
            id: 'surrogate_vs_clinical_endpoint',
            label: 'If Using a Surrogate Endpoint, What Is the Basis for Its Reasonableness?',
            type: 'textarea',
            placeholder: 'e.g., PFS has been accepted by FDA as a surrogate for OS in this setting based on meta-analyses by [reference]. Prior approvals in this indication (Drug X, Drug Y) used PFS as the primary endpoint.',
            helpText: 'For accelerated approval based on a surrogate endpoint (21 USC 356), provide evidence that the surrogate is reasonably likely to predict clinical benefit.',
          },
        ],
        defaultNext: 'safety_summary',
      },

      {
        id: 'safety_summary',
        section: 'clinical_program',
        question:
          'Present the integrated safety summary. Advisory Committee members will focus heavily on the safety profile.',
        guidance:
          'The safety section is often the most scrutinized part of the briefing document. Present an integrated safety summary across all studies per ICH E2C(R2). Include: overall AE rates (all grades and Grade ≥3), serious adverse events (SAEs), discontinuations due to AEs, dose modifications, and deaths. Present treatment-emergent adverse events (TEAEs) in tabular format for the pivotal study (drug vs. control). Highlight adverse events of special interest (AESIs) with incidence, time to onset, management, and resolution. Address any deaths on study drug.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'overall_safety_database_size',
            label: 'Overall Safety Database Size',
            type: 'text',
            placeholder: 'e.g., N=2,150 patients across 8 studies; 1,425 patient-years of exposure',
            required: true,
          },
          {
            id: 'common_adverse_events',
            label: 'Most Common Adverse Events (≥10% Incidence)',
            type: 'textarea',
            placeholder: 'e.g., Fatigue (38% vs. 25%), nausea (32% vs. 18%), diarrhea (28% vs. 15%), rash (22% vs. 5%), arthralgia (18% vs. 12%).',
            required: true,
          },
          {
            id: 'grade_3_plus_events',
            label: 'Grade ≥3 Adverse Events',
            type: 'textarea',
            placeholder: 'e.g., Overall Grade ≥3 TEAE rate: 45% (drug) vs. 32% (control). Most common Grade ≥3: neutropenia (12%), hepatotoxicity (8%), hypertension (6%).',
            required: true,
          },
          {
            id: 'serious_adverse_events',
            label: 'Serious Adverse Events (SAEs)',
            type: 'textarea',
            placeholder: 'e.g., SAE rate: 28% (drug) vs. 20% (control). Most common SAEs: pneumonia (5%), febrile neutropenia (3%), hepatic failure (2%).',
            required: true,
          },
          {
            id: 'discontinuation_rate',
            label: 'Discontinuation Due to Adverse Events',
            type: 'text',
            placeholder: 'e.g., 15% (drug) vs. 8% (control)',
            required: true,
          },
          {
            id: 'deaths_on_treatment',
            label: 'Deaths on Treatment',
            type: 'textarea',
            placeholder: 'e.g., 12 deaths on drug arm (3 treatment-related: 1 hepatic failure, 1 cardiac arrest, 1 pneumonitis) vs. 8 deaths on control (1 treatment-related).',
            required: true,
          },
          {
            id: 'adverse_events_of_special_interest',
            label: 'Adverse Events of Special Interest (AESIs)',
            type: 'textarea',
            placeholder: 'e.g., Hepatotoxicity (AESI): 15% any grade, 8% Grade ≥3. Median time to onset: 6 weeks. Management: dose hold per protocol. Resolution: 85% resolved within 4 weeks of dose hold. 2% required permanent discontinuation.',
            required: true,
            validation: { minLength: 30 },
          },
        ],
        defaultNext: 'safety_update',
      },

      {
        id: 'safety_update',
        section: 'clinical_program',
        question:
          'Has there been any safety update since the NDA/BLA submission? Post-submission safety data must be presented.',
        guidance:
          'FDA regulations require the applicant to submit any new safety information that becomes available after the NDA/BLA submission and before the Advisory Committee meeting. Per 21 CFR 314.81(b)(1) and FDA guidance, a 120-Day Safety Update is required for NDA submissions. For the briefing document, include: updated exposure data, any new safety signals, any new SUSARs, and updated benefit-risk assessment. Advisory Committee members will specifically ask whether any new safety concerns have emerged.',
        fields: [
          {
            id: 'safety_update_available',
            label: 'Is a Post-Submission Safety Update Available?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'safety_update_data_cutoff',
            label: 'Safety Update Data Cutoff Date',
            type: 'date',
            visibleWhen: { field: 'safety_update_available', operator: 'eq', value: true },
          },
          {
            id: 'safety_update_summary',
            label: 'Safety Update Summary',
            type: 'textarea',
            placeholder: 'e.g., 120-Day Safety Update (data cutoff: [date]): Additional 350 patients exposed since NDA submission. No new safety signals identified. Updated AE table included in Appendix. Two new SUSARs reported (1 hepatic failure, 1 interstitial lung disease) — both resolved.',
            visibleWhen: { field: 'safety_update_available', operator: 'eq', value: true },
            validation: { minLength: 30 },
          },
          {
            id: 'new_safety_signals',
            label: 'Any New Safety Signals Since Submission?',
            type: 'yes_no',
            visibleWhen: { field: 'safety_update_available', operator: 'eq', value: true },
          },
          {
            id: 'new_safety_signal_details',
            label: 'New Safety Signal Details',
            type: 'textarea',
            visibleWhen: { field: 'new_safety_signals', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'benefit_risk_assessment',
        issueChecks: [
          {
            id: 'missing_safety_update',
            condition: { field: 'safety_update_available', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Missing Post-Submission Safety Update',
            message:
              'A post-submission safety update is expected for the Advisory Committee briefing document. Per 21 CFR 314.81(b)(1), NDA applicants must provide a 120-Day Safety Update. Advisory Committee members will ask about any new safety information since the application was submitted. Failure to present updated safety data undermines credibility.',
            reference: '21 CFR 314.81(b)(1); FDA Guidance: Advisory Committee Meetings (2008)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 5 — Benefit-Risk Framework                              */
      /* ================================================================ */

      {
        id: 'benefit_risk_assessment',
        section: 'benefit_risk',
        question:
          'Present the benefit-risk assessment. This is the most critical section of the briefing document — the Advisory Committee\'s vote hinges on this analysis.',
        guidance:
          'FDA uses the Benefit-Risk Framework described in the PDUFA VI commitment letter and the "Benefit-Risk Assessment in Drug Regulatory Decision-Making" (Draft Revision, 2023). The framework evaluates five dimensions: (1) Analysis of Condition, (2) Current Treatment Options, (3) Benefit, (4) Risk, and (5) Risk Management. Present a structured benefit-risk summary table. For each dimension, provide a concise evidence-based assessment. The benefit-risk conclusion should directly support the regulatory action being sought.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'benefit_summary',
            label: 'Summary of Benefits',
            type: 'textarea',
            placeholder: 'e.g., Statistically significant and clinically meaningful improvement in PFS (HR 0.52). Confirmed ORR of 45% with durable responses (median DOR 14.5 months). Consistent benefit across pre-specified subgroups. Improved patient-reported quality of life.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'risk_summary',
            label: 'Summary of Risks',
            type: 'textarea',
            placeholder: 'e.g., Manageable safety profile with known class effects. Key risks: hepatotoxicity (Grade ≥3 in 8%, manageable with dose modification), neutropenia (12%). 2 treatment-related deaths (0.3%). No new or unexpected safety signals.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'benefit_risk_conclusion',
            label: 'Benefit-Risk Conclusion',
            type: 'textarea',
            placeholder: 'e.g., The benefits of [product] — significant and durable improvement in progression-free survival, overall survival trend, and quality of life — outweigh the identified risks, which are manageable with appropriate monitoring and dose modification. The benefit-risk profile supports approval for the proposed indication.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'benefit_risk_table_prepared',
            label: 'Has a Structured Benefit-Risk Summary Table Been Prepared (per FDA PDUFA VI Framework)?',
            type: 'yes_no',
            required: true,
            helpText: 'FDA\'s Benefit-Risk Framework (PDUFA VI) recommends a structured summary table with five dimensions: Analysis of Condition, Current Treatment Options, Benefit, Risk, and Risk Management.',
          },
          {
            id: 'uncertainty_factors',
            label: 'Key Uncertainties and Limitations',
            type: 'textarea',
            placeholder: 'e.g., Overall survival data immature (median follow-up 18 months). Limited data in patients >75 years. No head-to-head comparison with recently approved competitor.',
            required: true,
          },
        ],
        defaultNext: 'risk_management_plan',
        issueChecks: [
          {
            id: 'no_benefit_risk_table',
            condition: { field: 'benefit_risk_table_prepared', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Structured Benefit-Risk Summary Table',
            message:
              'FDA\'s PDUFA VI Benefit-Risk Framework recommends a structured benefit-risk summary table. Advisory Committee members rely on this table to frame their evaluation. The absence of a clear, structured benefit-risk summary is a significant gap in the briefing document.',
            reference: 'PDUFA VI Commitment Letter; FDA Benefit-Risk Framework (2023)',
          },
        ],
      },

      {
        id: 'risk_management_plan',
        section: 'benefit_risk',
        question:
          'What risk management and mitigation strategies are proposed? Include REMS, labeling, and monitoring plans.',
        guidance:
          'Risk management strategies should demonstrate that identified risks can be effectively managed in clinical practice. Consider: (1) Labeling — boxed warnings, contraindications, warnings and precautions, (2) REMS — if required per 21 USC 355-1, describe the REMS elements (Medication Guide, Communication Plan, ETASU), (3) Monitoring recommendations in the label, (4) Dose modification guidelines, and (5) Post-marketing surveillance commitments. Advisory Committee members want assurance that risks can be managed outside of clinical trial settings.',
        fields: [
          {
            id: 'proposed_labeling_risk_communications',
            label: 'Proposed Labeling Risk Communications',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'boxed_warning', label: 'Boxed Warning' },
              { value: 'contraindication', label: 'Contraindication' },
              { value: 'warnings_precautions', label: 'Warnings and Precautions' },
              { value: 'adverse_reactions', label: 'Adverse Reactions Section' },
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'patient_counseling', label: 'Patient Counseling Information' },
            ],
          },
          {
            id: 'rems_required',
            label: 'Is a REMS Required or Proposed?',
            type: 'select',
            options: [
              { value: 'yes_with_etasu', label: 'Yes — REMS with ETASU (Elements to Assure Safe Use)' },
              { value: 'yes_medication_guide', label: 'Yes — REMS with Medication Guide only' },
              { value: 'yes_communication_plan', label: 'Yes — REMS with Communication Plan' },
              { value: 'no', label: 'No REMS required' },
              { value: 'under_discussion', label: 'Under discussion with FDA' },
            ],
            helpText: 'Per 21 USC 355-1 (FDAAA), FDA may require a REMS if necessary to ensure the benefits outweigh the risks.',
          },
          {
            id: 'rems_details',
            label: 'REMS Details',
            type: 'textarea',
            visibleWhen: { field: 'rems_required', operator: 'in', value: ['yes_with_etasu', 'yes_medication_guide', 'yes_communication_plan'] },
          },
          {
            id: 'monitoring_recommendations',
            label: 'Proposed Monitoring Recommendations (Labeling)',
            type: 'textarea',
            placeholder: 'e.g., LFTs at baseline, Q2W for first 3 months, then monthly. ECG at baseline and as clinically indicated. CBC with differential weekly for first 8 weeks.',
            required: true,
          },
          {
            id: 'dose_modification_guidelines',
            label: 'Dose Modification Guidelines for Key AEs',
            type: 'textarea',
            placeholder: 'e.g., Hepatotoxicity: Grade 2 ALT — hold until Grade ≤1, resume at reduced dose. Grade 3 ALT — hold, may resume at reduced dose if resolved within 4 weeks. Grade 4 — permanent discontinuation.',
            required: true,
          },
        ],
        defaultNext: 'post_marketing_commitments',
      },

      {
        id: 'post_marketing_commitments',
        section: 'benefit_risk',
        question:
          'What post-marketing commitments and studies are planned or required? Advisory Committee members often recommend specific PMCs.',
        guidance:
          'Post-marketing commitments (PMCs) and post-marketing requirements (PMRs) are distinct. PMRs are required by statute (FDAAA 2007, 21 USC 355(o)(3)) or regulation, while PMCs are agreed upon but not legally required. For accelerated approvals, a confirmatory trial is required per 21 USC 356. Present planned post-marketing studies, pharmacovigilance plans, and any commitments discussed with FDA. Advisory Committee members frequently recommend additional studies or registry requirements.',
        fields: [
          {
            id: 'post_marketing_studies_planned',
            label: 'Planned Post-Marketing Studies',
            type: 'textarea',
            placeholder: 'e.g., PMR 1: Confirmatory Phase 3 OS study (ABC-401) — enrollment ongoing, estimated completion 2027. PMR 2: Hepatic safety registry (N=5,000) — 5-year observational study. PMC 1: Renal impairment PK study.',
            required: true,
          },
          {
            id: 'confirmatory_trial_required',
            label: 'Is a Confirmatory Trial Required (Accelerated Approval)?',
            type: 'yes_no',
            helpText: 'If seeking accelerated approval under 21 USC 356, a confirmatory trial to verify clinical benefit is required as a PMR.',
          },
          {
            id: 'confirmatory_trial_status',
            label: 'Confirmatory Trial Status',
            type: 'select',
            visibleWhen: { field: 'confirmatory_trial_required', operator: 'eq', value: true },
            options: [
              { value: 'enrolling', label: 'Currently Enrolling' },
              { value: 'completed', label: 'Completed — Results Pending' },
              { value: 'planned', label: 'Planned — Not Yet Initiated' },
              { value: 'results_available', label: 'Results Available' },
            ],
          },
          {
            id: 'pharmacovigilance_plan',
            label: 'Pharmacovigilance Plan Summary',
            type: 'textarea',
            placeholder: 'e.g., Enhanced pharmacovigilance: active surveillance for hepatotoxicity and cardiac events. Signal detection methodology: Bayesian analysis with quarterly review. Aggregate safety reports: DSURs annually.',
          },
          {
            id: 'real_world_evidence_plan',
            label: 'Real-World Evidence (RWE) Generation Plan',
            type: 'textarea',
            placeholder: 'e.g., Partnership with [health system/registry] for RWE generation. Electronic health record data analysis to assess real-world outcomes.',
            helpText: 'RWE plans demonstrate commitment to long-term safety and effectiveness monitoring and are viewed favorably by Advisory Committee members.',
          },
        ],
        defaultNext: 'voting_questions',
        issueChecks: [
          {
            id: 'no_post_marketing_plan',
            condition: { field: 'pharmacovigilance_plan', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'No Post-Marketing Pharmacovigilance Plan Presented',
            message:
              'A pharmacovigilance plan should be presented in the briefing document, especially for products with identified safety signals. Advisory Committee members frequently ask about post-marketing surveillance commitments. Demonstrating proactive safety monitoring builds confidence in the sponsor\'s safety commitment.',
            reference: 'FDAAA 2007; ICH E2E',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 6 — Voting Questions & Strategy                         */
      /* ================================================================ */

      {
        id: 'voting_questions',
        section: 'voting_strategy',
        question:
          'What are the proposed voting questions for the Advisory Committee? These must be aligned with the regulatory action sought and the proposed labeling claims.',
        guidance:
          'FDA develops the voting questions in consultation with the sponsor and the Advisory Committee chair. Per 21 CFR Part 14 and FDA\'s guidance, voting questions should be clear, specific, and answerable by the committee. Questions typically address: (1) whether the efficacy data support approval, (2) whether the safety profile is acceptable, and (3) whether the benefit-risk assessment favors approval. For supplemental applications, questions may focus on the specific new indication. The sponsor should anticipate the questions and prepare responses. Misalignment between voting questions and label claims is a common pitfall.',
        fields: [
          {
            id: 'proposed_voting_questions',
            label: 'Proposed/Anticipated Voting Questions',
            type: 'textarea',
            placeholder: 'e.g., 1. Has the applicant provided substantial evidence of effectiveness of [product] for [indication]?\n2. Has the applicant provided sufficient evidence of the safety of [product] for [indication]?\n3. Do the benefits of [product] outweigh its risks for the proposed indication?',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'discussion_questions_anticipated',
            label: 'Anticipated Discussion Questions',
            type: 'textarea',
            placeholder: 'e.g., 1. Please discuss the adequacy of the safety database for the proposed indication.\n2. Please discuss the appropriateness of PFS as the primary endpoint in this setting.\n3. Please discuss any additional post-marketing studies that should be required.',
          },
          {
            id: 'voting_question_alignment',
            label: 'Are Voting Questions Aligned with Proposed Label Claims?',
            type: 'yes_no',
            required: true,
            helpText: 'Voting questions should directly map to the proposed indication statement and key labeling claims. Misalignment can lead to a favorable vote but unfavorable labeling outcome.',
          },
          {
            id: 'challenging_questions_prepared',
            label: 'Have Responses to Challenging Questions Been Prepared?',
            type: 'yes_no',
            helpText: 'Prepare backup slides and responses for tough questions: immature OS data, subgroup heterogeneity, safety signals, lack of comparator data, surrogate endpoint validity, etc.',
          },
        ],
        defaultNext: 'presentation_strategy',
        issueChecks: [
          {
            id: 'voting_questions_not_aligned',
            condition: { field: 'voting_question_alignment', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Voting Questions Not Aligned with Label Claims',
            message:
              'Voting questions that do not align with the proposed labeling claims can result in a situation where the committee votes favorably but FDA cannot support the proposed label. Ensure each voting question directly maps to a specific indication statement or labeling claim. Discuss voting question alignment with FDA before the briefing document is finalized.',
            reference: '21 CFR Part 14; FDA Guidance: Advisory Committee Meetings (2008)',
          },
        ],
      },

      {
        id: 'presentation_strategy',
        section: 'voting_strategy',
        question:
          'What is the presentation strategy for the Advisory Committee meeting? The oral presentation must complement the briefing document.',
        guidance:
          'The sponsor typically has 60-90 minutes for their presentation at the Advisory Committee meeting. The presentation should be structured, rehearsed, and focused on the key messages from the briefing document. Per FDA guidance, presenters should include the lead clinician, lead statistician, and lead safety scientist. Consider including a KOL or patient advocate. Backup slides for anticipated questions are essential. The open public hearing allows patients and advocacy groups to speak — coordinate supportive testimony if appropriate.',
        fields: [
          {
            id: 'presentation_duration',
            label: 'Allocated Presentation Time',
            type: 'select',
            options: [
              { value: '60_min', label: '60 Minutes' },
              { value: '75_min', label: '75 Minutes' },
              { value: '90_min', label: '90 Minutes' },
              { value: 'tbd', label: 'To Be Determined' },
            ],
          },
          {
            id: 'key_presenters',
            label: 'Key Presenters and Their Roles',
            type: 'textarea',
            placeholder: 'e.g., 1. Dr. Smith (VP Clinical Development) — Clinical overview, 20 min\n2. Dr. Jones (Lead Statistician) — Efficacy results, 15 min\n3. Dr. Lee (VP Safety) — Safety and benefit-risk, 20 min',
            required: true,
          },
          {
            id: 'kol_involvement',
            label: 'Will a Key Opinion Leader (KOL) Present?',
            type: 'yes_no',
            helpText: 'A KOL can provide clinical context and credibility. Ensure the KOL is not a current Advisory Committee member and disclose any financial relationships.',
          },
          {
            id: 'patient_testimony_planned',
            label: 'Is Patient/Advocacy Testimony Planned for Open Public Hearing?',
            type: 'yes_no',
            helpText: 'Patient and advocacy group testimony during the open public hearing can be powerful. Coordinate with patient advocacy organizations well in advance.',
          },
          {
            id: 'backup_slides_prepared',
            label: 'Number of Backup Slides Prepared',
            type: 'number',
            placeholder: 'e.g., 40',
            helpText: 'Typical Advisory Committee presentations include 30-50 backup slides covering anticipated questions on subgroups, safety signals, methodology, and competitive context.',
          },
          {
            id: 'mock_ac_conducted',
            label: 'Has a Mock Advisory Committee Been Conducted?',
            type: 'yes_no',
            helpText: 'A mock Advisory Committee with external experts simulating the panel is strongly recommended. It identifies weaknesses in the presentation and briefing document.',
          },
        ],
        defaultNext: 'final_review',
      },

      {
        id: 'final_review',
        section: 'voting_strategy',
        question:
          'Final review — confirm readiness of the briefing document package and identify any remaining gaps.',
        guidance:
          'Before submitting the briefing document, conduct a comprehensive quality review. Per FDA guidance, the briefing document should be a standalone document that does not require committee members to reference the NDA/BLA. All data tables should be self-explanatory with clear headers, footnotes, and data cutoff dates. Ensure consistency between the briefing document, the oral presentation, and the proposed labeling. Confirm that all FDA feedback from pre-meeting communications has been addressed.',
        fields: [
          {
            id: 'document_qc_complete',
            label: 'Has a Comprehensive QC Review of the Briefing Document Been Completed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'legal_review_complete',
            label: 'Has Legal Review Been Completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Legal review should cover promotional claims, off-label implications, and consistency with approved labeling (if applicable).',
          },
          {
            id: 'medical_review_complete',
            label: 'Has Medical/Scientific Review Been Completed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'data_consistency_verified',
            label: 'Has Data Consistency Been Verified Across All Sections?',
            type: 'yes_no',
            required: true,
            helpText: 'Verify that all efficacy numbers, safety data, and patient counts are consistent throughout the document. Inconsistencies undermine credibility.',
          },
          {
            id: 'fda_pre_meeting_feedback_addressed',
            label: 'Has All FDA Pre-Meeting Feedback Been Addressed?',
            type: 'yes_no',
          },
          {
            id: 'remaining_gaps',
            label: 'Remaining Gaps or Concerns',
            type: 'textarea',
            placeholder: 'List any remaining gaps, outstanding data, or unresolved concerns that need to be addressed before submission.',
          },
          {
            id: 'submission_readiness',
            label: 'Overall Submission Readiness Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'ready', label: 'Ready for Submission' },
              { value: 'minor_revisions', label: 'Minor Revisions Needed' },
              { value: 'major_revisions', label: 'Major Revisions Needed' },
              { value: 'not_ready', label: 'Not Ready — Significant Gaps' },
            ],
          },
        ],
        defaultNext: null,
        issueChecks: [
          {
            id: 'document_not_qc_reviewed',
            condition: { field: 'document_qc_complete', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Briefing Document QC Not Complete',
            message:
              'A comprehensive quality control review of the briefing document is essential before submission. Data inconsistencies, typographical errors, and formatting issues in a public document undermine sponsor credibility with the Advisory Committee.',
          },
          {
            id: 'not_submission_ready',
            condition: { field: 'submission_readiness', operator: 'in', value: ['major_revisions', 'not_ready'] },
            severity: 'critical',
            title: 'Briefing Document Not Ready for Submission',
            message:
              'The briefing document requires significant additional work before it can be submitted. Given the fixed Advisory Committee date, develop a remediation plan with clear timelines. Consider requesting a meeting postponement with FDA if critical gaps cannot be addressed in time.',
          },
        ],
      },
    ],
  };
}
