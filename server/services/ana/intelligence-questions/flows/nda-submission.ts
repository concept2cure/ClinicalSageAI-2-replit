/**
 * NDA (New Drug Application) Submission flow definition for the AnA
 * Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through a comprehensive NDA questionnaire
 * covering all CTD modules, clinical data packages, manufacturing, labeling,
 * REMS, post-marketing commitments, advisory committee readiness, and
 * submission strategy per 21 CFR 314.
 *
 * This is one of the deepest flows in the system — an NDA is a massive
 * regulatory undertaking that typically runs 100,000+ pages in eCTD format.
 *
 * @module server/services/ana/intelligence-questions/flows/nda-submission
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createNdaSubmissionFlow(): FlowDefinition {
  return {
    id: 'nda-submission-v1',
    category: 'nda_submission',
    name: 'NDA Submission',
    description:
      'Comprehensive New Drug Application questionnaire covering all CTD modules, clinical data packages, manufacturing, labeling, and post-marketing commitments per 21 CFR 314.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'nda_overview',
    estimatedMinutes: 60,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'nda_overview_section',
        label: 'NDA Overview',
        nodeIds: ['nda_overview', 'nda_designations'],
      },
      {
        id: 'module_1_admin',
        label: 'Module 1 — Administrative',
        nodeIds: ['admin_forms', 'patent_exclusivity'],
      },
      {
        id: 'module_25_clinical_overview',
        label: 'Module 2.5 — Clinical Overview',
        nodeIds: ['clinical_dev_program', 'clinical_pharmacology', 'benefit_risk'],
      },
      {
        id: 'module_27_clinical_summary',
        label: 'Module 2.7 — Clinical Summary',
        nodeIds: ['biopharm_pk_summary', 'efficacy_safety_tables', 'literature_references'],
      },
      {
        id: 'module_3_quality',
        label: 'Module 3 — Quality / CMC',
        nodeIds: ['drug_substance', 'drug_product', 'facilities_adventitious'],
      },
      {
        id: 'module_4_nonclinical',
        label: 'Module 4 — Nonclinical',
        nodeIds: ['pharmacology_pk', 'toxicology_program'],
      },
      {
        id: 'module_5_clinical',
        label: 'Module 5 — Clinical Study Reports',
        nodeIds: ['pivotal_studies', 'supportive_studies', 'integrated_summaries'],
      },
      {
        id: 'labeling_section',
        label: 'Labeling',
        nodeIds: ['uspi_content', 'medication_guide'],
      },
      {
        id: 'rems_section',
        label: 'REMS Assessment',
        nodeIds: ['rems_determination', 'rems_elements'],
      },
      {
        id: 'post_marketing_section',
        label: 'Post-Marketing Commitments',
        nodeIds: ['pmc_pmr', 'pediatric_pharmacovigilance'],
      },
      {
        id: 'advisory_committee_section',
        label: 'Advisory Committee',
        nodeIds: ['adcom_planning', 'adcom_preparation'],
      },
      {
        id: 'submission_strategy_section',
        label: 'Submission Timeline & Strategy',
        nodeIds: ['pre_nda_meeting', 'submission_planning', 'review_management'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [

      /* ================================================================
       * Section 1 — NDA Overview
       * ================================================================ */

      {
        id: 'nda_overview',
        section: 'NDA Overview',
        question:
          'Let\'s begin the NDA submission questionnaire. What type of NDA are you filing, and what is the application status?',
        guidance:
          'Under 21 CFR 314.50, an NDA must contain full reports of investigations showing whether the drug is safe and effective. A 505(b)(1) NDA relies entirely on the applicant\'s own data. A 505(b)(2) application (21 USC 355(b)(2)) relies in part on FDA\'s prior findings of safety and efficacy for a listed drug — this pathway is governed by FDA Guidance "Applications Covered by Section 505(b)(2)" (October 1999, updated 2023). A 505(j) ANDA is for generic drugs under 21 CFR 314.94. The submission type determines the review pathway, user fee structure, and required content.',
        fields: [
          {
            id: 'nda_type',
            label: 'NDA Type',
            type: 'select',
            required: true,
            options: [
              {
                value: '505b1',
                label: '505(b)(1) — Full NDA',
                description: 'Applicant-generated data for new molecular entity or new indication.',
              },
              {
                value: '505b2',
                label: '505(b)(2) — Partial NDA',
                description: 'Relies in part on published literature or FDA findings for a listed drug.',
              },
              {
                value: '505j',
                label: '505(j) — ANDA (Generic)',
                description: 'Abbreviated NDA for generic copy of a Reference Listed Drug.',
              },
            ],
          },
          {
            id: 'application_number',
            label: 'Application Number (if assigned)',
            type: 'text',
            placeholder: 'e.g., NDA 214787',
            helpText: 'Leave blank for original submissions that have not yet received an NDA number.',
          },
          {
            id: 'submission_type',
            label: 'Submission Type',
            type: 'select',
            required: true,
            options: [
              { value: 'original', label: 'Original NDA' },
              { value: 'efficacy_supplement', label: 'Efficacy Supplement (sNDA — new indication)' },
              { value: 'manufacturing_supplement', label: 'Manufacturing Supplement (CBE / Prior Approval)' },
              { value: 'labeling_supplement', label: 'Labeling Supplement' },
              { value: 'annual_report', label: 'Annual Report (21 CFR 314.81(b)(2))' },
            ],
          },
          {
            id: 'drug_name_generic',
            label: 'Generic (INN) Name',
            type: 'text',
            placeholder: 'e.g., Semaglutide',
            required: true,
          },
          {
            id: 'proposed_trade_name',
            label: 'Proposed Trade Name',
            type: 'text',
            placeholder: 'e.g., Ozempic',
            helpText: 'Per FDA Guidance "Best Practices in Developing Proprietary Names for Drugs" (2020), trade names must be cleared by CDER\'s Division of Medication Error Prevention and Analysis (DMEPA) before approval.',
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
              { value: 'metabolic', label: 'Metabolic / Endocrine' },
              { value: 'immunology', label: 'Immunology / Inflammation' },
              { value: 'respiratory', label: 'Respiratory' },
              { value: 'gastroenterology', label: 'Gastroenterology' },
              { value: 'dermatology', label: 'Dermatology' },
              { value: 'rare_disease', label: 'Rare Disease' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'indication_statement',
            label: 'Proposed Indication Statement',
            type: 'textarea',
            placeholder: 'e.g., For the treatment of adults with moderately to severely active rheumatoid arthritis who have had an inadequate response to one or more TNF blockers.',
            required: true,
            validation: { minLength: 20, maxLength: 2000 },
          },
          {
            id: 'is_biologic',
            label: 'Is this product a biologic (protein, antibody, vaccine)?',
            type: 'yes_no',
            required: true,
            helpText: 'Biologics are typically filed as BLAs under 42 USC 262. However, certain protein products transitioned to the BLA pathway under BPCIA (March 2020). If this product is a biologic, some Module 3 requirements differ.',
          },
        ],
        branches: [
          {
            when: { field: 'nda_type', operator: 'eq', value: '505b2' },
            goto: 'nda_505b2_bridging',
          },
        ],
        defaultNext: 'nda_designations',
        issueChecks: [
          {
            id: 'trade_name_not_cleared',
            condition: { field: 'proposed_trade_name', operator: 'eq', value: '' },
            severity: 'info',
            title: 'Trade Name Not Yet Proposed',
            message:
              'CDER\'s DMEPA requires trade name review and clearance before NDA approval. Consider submitting a proprietary name request early — the review process typically takes 180 days.',
            reference: 'FDA Guidance "Best Practices in Developing Proprietary Names for Drugs" (2020)',
          },
        ],
        provideExpertFeedback: true,
      },

      /* ── 505(b)(2) Bridging Questions (branch node) ──────────────── */

      {
        id: 'nda_505b2_bridging',
        section: 'NDA Overview',
        question:
          'For 505(b)(2) applications, we need to establish the right of reference and bridging strategy. Please provide the reference listed drug (RLD) and bridging study details.',
        guidance:
          'Under 505(b)(2) (21 USC 355(b)(2)), the applicant may rely on FDA\'s prior findings of safety/effectiveness for a listed drug, plus published literature. Per FDA Guidance "Determining Whether to Submit an ANDA or a 505(b)(2) Application" (2019), you must identify the Reference Listed Drug (RLD) and demonstrate a scientific bridge (bioequivalence, comparative clinical studies, or literature) to the RLD. A right-of-reference letter (21 CFR 314.50(g)) from the RLD holder is required if relying on their proprietary data.',
        fields: [
          {
            id: 'reference_listed_drug',
            label: 'Reference Listed Drug (RLD)',
            type: 'text',
            placeholder: 'e.g., Ambien (zolpidem tartrate) tablets, NDA 019908',
            required: true,
            helpText: 'Identify the RLD from the FDA Orange Book (Approved Drug Products with Therapeutic Equivalence Evaluations).',
          },
          {
            id: 'has_right_of_reference',
            label: 'Do you have a right-of-reference letter from the RLD holder?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 314.50(g), if relying on proprietary data owned by the RLD holder, a written authorization (right-of-reference letter) is required.',
          },
          {
            id: 'bridging_strategy',
            label: 'Bridging Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'bioequivalence', label: 'Bioequivalence Study' },
              { value: 'comparative_clinical', label: 'Comparative Clinical Study' },
              { value: 'literature', label: 'Published Literature Only' },
              { value: 'combination', label: 'Combination (BE + literature + new studies)' },
            ],
          },
          {
            id: 'bridging_study_summary',
            label: 'Bridging Study Summary',
            type: 'textarea',
            placeholder: 'Describe the bridging studies conducted or planned to link to the RLD...',
            required: true,
          },
          {
            id: 'differences_from_rld',
            label: 'Differences from the RLD',
            type: 'multi_select',
            options: [
              { value: 'dosage_form', label: 'Different Dosage Form' },
              { value: 'route', label: 'Different Route of Administration' },
              { value: 'strength', label: 'Different Strength' },
              { value: 'indication', label: 'Different / New Indication' },
              { value: 'formulation', label: 'Different Formulation (same dosage form)' },
              { value: 'population', label: 'Different Patient Population' },
              { value: 'regimen', label: 'Different Dosing Regimen' },
            ],
          },
        ],
        defaultNext: 'nda_designations',
        issueChecks: [
          {
            id: '505b2_no_right_of_reference',
            condition: { field: 'has_right_of_reference', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Right-of-Reference Letter',
            message:
              'A 505(b)(2) application relying on proprietary RLD data without a right-of-reference letter will be refused to file. You may only rely on publicly available data (published literature, FDA\'s prior findings from the summary basis of approval) without this letter. Reassess whether the available public data is sufficient to support your application.',
            reference: '21 CFR 314.50(g); FDA Guidance "Applications Covered by Section 505(b)(2)" (October 1999)',
          },
        ],
        provideExpertFeedback: true,
      },

      {
        id: 'nda_designations',
        section: 'NDA Overview',
        question:
          'Does this product have any special FDA designations, and are you requesting priority review?',
        guidance:
          'Special designations can accelerate review and provide regulatory advantages. Priority Review (21 CFR 314.101(a)) shortens the review clock from 10 months to 6 months for drugs offering a significant improvement. Breakthrough Therapy (21 USC 356(a)) provides intensive FDA guidance. Fast Track (21 USC 356(b)) allows rolling submission. Orphan Drug (21 USC 360bb) provides 7-year market exclusivity. Accelerated Approval (21 CFR 314 Subpart H) allows approval based on a surrogate endpoint.',
        fields: [
          {
            id: 'priority_review_requested',
            label: 'Priority Review Requested',
            type: 'yes_no',
            required: true,
            helpText: 'Per PDUFA VII (2022-2027), Priority Review shortens the target action date to 6 months from filing vs. 10 months for Standard Review.',
          },
          {
            id: 'priority_review_basis',
            label: 'Basis for Priority Review Request',
            type: 'select',
            visibleWhen: { field: 'priority_review_requested', operator: 'eq', value: true },
            options: [
              { value: 'serious_condition', label: 'Significant improvement for serious condition' },
              { value: 'unmet_need', label: 'Addresses unmet medical need' },
              { value: 'prv', label: 'Priority Review Voucher (PRV) being redeemed' },
              { value: 'other', label: 'Other basis' },
            ],
          },
          {
            id: 'orphan_drug_designation',
            label: 'Orphan Drug Designation',
            type: 'yes_no',
            required: true,
            helpText: 'Per the Orphan Drug Act (21 USC 360bb), orphan designation provides 7-year market exclusivity, tax credits for clinical research, and eligibility for OOPD grants.',
          },
          {
            id: 'orphan_designation_number',
            label: 'Orphan Designation Number',
            type: 'text',
            placeholder: 'e.g., DES 21-1234',
            visibleWhen: { field: 'orphan_drug_designation', operator: 'eq', value: true },
          },
          {
            id: 'breakthrough_therapy',
            label: 'Breakthrough Therapy Designation',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'fast_track',
            label: 'Fast Track Designation',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'accelerated_approval',
            label: 'Seeking Accelerated Approval (Subpart H)?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 314 Subpart H, accelerated approval allows use of a surrogate endpoint reasonably likely to predict clinical benefit. Post-marketing confirmatory studies will be required.',
          },
          {
            id: 'accelerated_approval_endpoint',
            label: 'Surrogate Endpoint for Accelerated Approval',
            type: 'textarea',
            placeholder: 'e.g., Objective response rate (ORR) as assessed by independent central review using RECIST v1.1',
            visibleWhen: { field: 'accelerated_approval', operator: 'eq', value: true },
          },
          {
            id: 'rems_anticipated',
            label: 'Is a REMS Anticipated?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 USC 355-1, FDA can require a Risk Evaluation and Mitigation Strategy if necessary to ensure benefits outweigh risks.',
          },
        ],
        branches: [
          {
            when: { field: 'therapeutic_area', operator: 'eq', value: 'oncology' },
            goto: 'nda_oncology_pathway',
          },
          {
            when: { field: 'orphan_drug_designation', operator: 'eq', value: true },
            goto: 'nda_orphan_specifics',
          },
        ],
        defaultNext: 'admin_forms',
        issueChecks: [
          {
            id: 'priority_review_no_basis',
            condition: { field: 'priority_review_requested', operator: 'eq', value: true },
            severity: 'info',
            title: 'Priority Review Request Noted',
            message:
              'Priority Review requests must be accompanied by data demonstrating a significant improvement in safety or effectiveness over available therapy. Ensure the clinical data package clearly articulates the comparative advantage.',
            reference: 'PDUFA VII Goal Letters; 21 CFR 314.101(a)',
          },
          {
            id: 'rolling_without_fast_track',
            condition: { field: 'fast_track', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Rolling Submission Requires Fast Track',
            message:
              'Only products with Fast Track designation are eligible for rolling submission (21 USC 356(b)(2)). Without this designation, the complete NDA must be submitted at once.',
            reference: '21 USC 356(b)(2)',
          },
        ],
        provideExpertFeedback: true,
      },

      /* ── Oncology Pathway Branch ─────────────────────────────────── */

      {
        id: 'nda_oncology_pathway',
        section: 'NDA Overview',
        question:
          'For oncology applications, let\'s address specific accelerated approval and surrogate endpoint considerations.',
        guidance:
          'Oncology drugs frequently use the accelerated approval pathway (21 CFR 314 Subpart H). FDA\'s Oncology Center of Excellence (OCE) reviews oncology applications. Per FDA Guidance "Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics" (2018), acceptable surrogate endpoints include ORR, DFS, and PFS. Under the FDORA (2022) amendments, sponsors must demonstrate due diligence in completing confirmatory trials.',
        fields: [
          {
            id: 'oncology_review_division',
            label: 'Anticipated Review Division',
            type: 'select',
            required: true,
            options: [
              { value: 'oce_dhot1', label: 'OCE — Division of Hematology Oncology Toxicology 1' },
              { value: 'oce_dhot2', label: 'OCE — Division of Hematology Oncology Toxicology 2' },
              { value: 'oce_oncology1', label: 'OCE — Division of Oncology 1' },
              { value: 'oce_oncology2', label: 'OCE — Division of Oncology 2' },
              { value: 'oce_oncology3', label: 'OCE — Division of Oncology 3' },
              { value: 'unknown', label: 'Not Yet Determined' },
            ],
          },
          {
            id: 'surrogate_endpoint_type',
            label: 'Surrogate Endpoint Type',
            type: 'select',
            options: [
              { value: 'orr', label: 'Objective Response Rate (ORR)' },
              { value: 'pfs', label: 'Progression-Free Survival (PFS)' },
              { value: 'dfs', label: 'Disease-Free Survival (DFS)' },
              { value: 'mrd', label: 'Minimal Residual Disease (MRD)' },
              { value: 'pcr', label: 'Pathologic Complete Response (pCR)' },
              { value: 'os', label: 'Overall Survival (OS) — full approval endpoint' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'companion_diagnostic',
            label: 'Is a companion diagnostic required?',
            type: 'yes_no',
            helpText: 'Per FDA Guidance "In Vitro Companion Diagnostic Devices" (2014), if the drug targets a specific biomarker, a companion diagnostic must be approved or cleared contemporaneously.',
          },
          {
            id: 'companion_dx_status',
            label: 'Companion Diagnostic Development Status',
            type: 'select',
            visibleWhen: { field: 'companion_diagnostic', operator: 'eq', value: true },
            options: [
              { value: 'approved', label: 'Already FDA-approved/cleared' },
              { value: 'pma_submitted', label: 'PMA submitted' },
              { value: 'in_development', label: 'In development' },
              { value: 'ldt', label: 'Lab-developed test (LDT) — not yet PMA-approved' },
            ],
          },
          {
            id: 'confirmatory_trial_plan',
            label: 'Confirmatory Trial Plan (for accelerated approval)',
            type: 'textarea',
            placeholder: 'Describe the planned confirmatory trial(s) to verify clinical benefit. Per FDORA 2022 amendments, sponsors must initiate confirmatory trials prior to or shortly after accelerated approval.',
            visibleWhen: { field: 'accelerated_approval', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'admin_forms',
        provideExpertFeedback: true,
      },

      /* ── Orphan Drug Specifics Branch ────────────────────────────── */

      {
        id: 'nda_orphan_specifics',
        section: 'NDA Overview',
        question:
          'For orphan drug applications, let\'s address the specific exclusivity and waiver considerations.',
        guidance:
          'The Orphan Drug Act (21 USC 360bb) provides 7-year market exclusivity from date of approval, tax credits for qualified clinical testing expenses, and waiver of PDUFA user fees. Per 21 CFR 316.34, exclusivity applies to the same drug for the same rare disease. FDA\'s Office of Orphan Products Development (OOPD) administers the program. Note that orphan exclusivity does not prevent approval of a clinically superior product (21 CFR 316.3(b)(14)).',
        fields: [
          {
            id: 'orphan_disease_prevalence',
            label: 'Disease Prevalence in the US',
            type: 'text',
            placeholder: 'e.g., Fewer than 200,000 affected individuals',
            required: true,
            helpText: 'Per 21 USC 360bb(a)(2), orphan drug designation requires prevalence fewer than 200,000 persons or a demonstration that costs of development cannot be recovered.',
          },
          {
            id: 'orphan_user_fee_waiver',
            label: 'Requesting PDUFA User Fee Waiver?',
            type: 'yes_no',
            required: true,
            helpText: 'Orphan products are eligible for a waiver of PDUFA user fees (21 CFR 316.46).',
          },
          {
            id: 'orphan_pediatric_waiver',
            label: 'Requesting PREA Waiver Based on Orphan Status?',
            type: 'yes_no',
            helpText: 'Under FDARA (2017), orphan drug products may be eligible for partial waivers of pediatric study requirements if the rare disease does not occur in the pediatric population.',
          },
          {
            id: 'orphan_natural_history',
            label: 'Natural History Study Available?',
            type: 'yes_no',
            helpText: 'For rare diseases, natural history data are often critical for interpreting clinical trial results and may serve as an external control per FDA Guidance "Rare Diseases: Natural History Studies for Drug Development" (2019).',
          },
          {
            id: 'orphan_clinical_trial_design',
            label: 'Special Clinical Trial Design Considerations',
            type: 'textarea',
            placeholder: 'e.g., Single-arm trial with historical control due to small patient population. Adaptive design with enrichment strategy.',
            helpText: 'Per FDA Guidance "Rare Diseases: Common Issues in Drug Development" (2019), FDA recognizes that standard trial designs may not be feasible for rare diseases.',
          },
        ],
        defaultNext: 'admin_forms',
        provideExpertFeedback: true,
      },

      /* ================================================================
       * Section 2 — Module 1: Administrative
       * ================================================================ */

      {
        id: 'admin_forms',
        section: 'Module 1 — Administrative',
        question:
          'Let\'s address the Module 1 administrative requirements. Please confirm the status of required forms and documents.',
        guidance:
          'Module 1 of the CTD contains region-specific administrative information. For US NDAs, Form FDA 356h (Application to Market a New Drug, Biologic, or Antibiotic Drug for Human Use) is the cover form per 21 CFR 314.50(a). The comprehensive table of contents must follow the eCTD v4.0 format per FDA Guidance "Providing Regulatory Submissions in Electronic Format — Certain Human Pharmaceutical Product Applications and Related Submissions" (2023). The environmental assessment is required per 21 CFR 25 unless a categorical exclusion applies.',
        fields: [
          {
            id: 'form_356h_prepared',
            label: 'Form FDA 356h Prepared',
            type: 'yes_no',
            required: true,
            helpText: 'This is the mandatory cover form for all NDA submissions per 21 CFR 314.50(a).',
          },
          {
            id: 'ectd_version',
            label: 'eCTD Publishing Version',
            type: 'select',
            required: true,
            options: [
              { value: 'ectd_v4', label: 'eCTD v4.0 (current standard)' },
              { value: 'ectd_v3', label: 'eCTD v3.2.2 (legacy — contact FDA)' },
            ],
          },
          {
            id: 'comprehensive_toc',
            label: 'Comprehensive Table of Contents Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'environmental_assessment',
            label: 'Environmental Assessment Status',
            type: 'select',
            required: true,
            options: [
              { value: 'ea_submitted', label: 'Environmental Assessment (EA) Submitted' },
              { value: 'categorical_exclusion', label: 'Categorical Exclusion Claimed (21 CFR 25.31)' },
              { value: 'not_prepared', label: 'Not Yet Prepared' },
            ],
          },
          {
            id: 'debarment_certification',
            label: 'Debarment Certification Included',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 314.50(l), the NDA must include a certification that no person who was debarred under 21 USC 335a(a) or (b) was involved in the application.',
          },
          {
            id: 'field_copy_certification',
            label: 'Field Copy Certification',
            type: 'yes_no',
            helpText: 'Certification per 21 CFR 314.50(e)(2)(iii) regarding the accuracy and completeness of the application.',
          },
          {
            id: 'user_fee_pdufa',
            label: 'PDUFA User Fee Payment Status',
            type: 'select',
            required: true,
            options: [
              { value: 'paid', label: 'Paid — fee confirmation letter available' },
              { value: 'waiver_granted', label: 'Fee Waiver Granted (orphan/small business)' },
              { value: 'pending', label: 'Payment Pending' },
              { value: 'not_paid', label: 'Not Yet Paid' },
            ],
          },
        ],
        defaultNext: 'patent_exclusivity',
        issueChecks: [
          {
            id: 'user_fee_not_paid',
            condition: { field: 'user_fee_pdufa', operator: 'eq', value: 'not_paid' },
            severity: 'critical',
            title: 'PDUFA User Fee Not Paid',
            message:
              'Per 21 USC 379h, an NDA will not be received (refused to file) until the PDUFA user fee is paid or a fee waiver is granted. The FY2026 application fee exceeds $4 million. Ensure payment before submission.',
            reference: '21 USC 379h; PDUFA VII Commitment Letter',
          },
          {
            id: 'env_assessment_missing',
            condition: { field: 'environmental_assessment', operator: 'eq', value: 'not_prepared' },
            severity: 'warning',
            title: 'Environmental Assessment Missing',
            message:
              'Per 21 CFR 25.15, an environmental assessment or claim of categorical exclusion must accompany the NDA. Most drugs qualify for a categorical exclusion under 21 CFR 25.31(e) — confirm eligibility.',
            reference: '21 CFR 25.15; 21 CFR 25.31',
          },
        ],
      },

      {
        id: 'patent_exclusivity',
        section: 'Module 1 — Administrative',
        question:
          'Provide patent and exclusivity information for the Orange Book listing.',
        guidance:
          'Per 21 CFR 314.53, the applicant must submit patent information for each patent that claims the drug substance, drug product, or method of use within 30 days of NDA approval. This information is listed in the FDA Orange Book (Approved Drug Products with Therapeutic Equivalence Evaluations). Patent certifications (Paragraphs I-IV) are required for 505(b)(2) and ANDA applications per 21 CFR 314.50(i) and 21 CFR 314.94(a)(12). Exclusivity claims must be documented at the time of submission.',
        fields: [
          {
            id: 'patents_to_list',
            label: 'Number of Patents for Orange Book Listing',
            type: 'number',
            required: true,
            validation: { min: 0, max: 50 },
            helpText: 'Per 21 CFR 314.53, list all patents claiming the drug substance, drug product, or approved method of use.',
          },
          {
            id: 'patent_types',
            label: 'Patent Types',
            type: 'multi_select',
            options: [
              { value: 'drug_substance', label: 'Drug Substance Patent' },
              { value: 'drug_product', label: 'Drug Product (Formulation) Patent' },
              { value: 'method_of_use', label: 'Method of Use Patent' },
            ],
            visibleWhen: { field: 'patents_to_list', operator: 'gt', value: 0 },
          },
          {
            id: 'patent_certification',
            label: 'Patent Certification Type (for 505(b)(2) / ANDA only)',
            type: 'select',
            visibleWhen: { field: 'nda_type', operator: 'in', value: ['505b2', '505j'] },
            options: [
              { value: 'paragraph_i', label: 'Paragraph I — No patent information filed' },
              { value: 'paragraph_ii', label: 'Paragraph II — Patent has expired' },
              { value: 'paragraph_iii', label: 'Paragraph III — Will not seek approval until patent expires' },
              { value: 'paragraph_iv', label: 'Paragraph IV — Patent is invalid or will not be infringed' },
            ],
            helpText: 'Per 21 CFR 314.50(i), each patent listed in the Orange Book for the RLD requires a certification.',
          },
          {
            id: 'exclusivity_claims',
            label: 'Exclusivity Claims',
            type: 'multi_select',
            options: [
              { value: 'nce_5yr', label: '5-Year NCE Exclusivity (new chemical entity — 21 CFR 314.108(b)(2))' },
              { value: 'three_yr', label: '3-Year Exclusivity (new clinical investigations — 21 CFR 314.108(b)(4))' },
              { value: 'pediatric_6mo', label: '6-Month Pediatric Exclusivity (BPCA — 21 USC 355a)' },
              { value: 'orphan_7yr', label: '7-Year Orphan Drug Exclusivity (21 USC 360cc)' },
              { value: 'cgp', label: 'Competitive Generic Therapy (CGT) 180-Day Exclusivity' },
              { value: 'none', label: 'No Exclusivity Claim' },
            ],
          },
          {
            id: 'patent_expiry_date',
            label: 'Earliest Patent Expiry Date',
            type: 'date',
            visibleWhen: { field: 'patents_to_list', operator: 'gt', value: 0 },
            helpText: 'Include any pediatric exclusivity extensions or patent term adjustments under 35 USC 156.',
          },
        ],
        defaultNext: 'clinical_dev_program',
        issueChecks: [
          {
            id: 'paragraph_iv_30month_stay',
            condition: { field: 'patent_certification', operator: 'eq', value: 'paragraph_iv' },
            severity: 'info',
            title: 'Paragraph IV Certification — 30-Month Stay Implications',
            message:
              'A Paragraph IV certification triggers a 45-day notice requirement to the patent holder and NDA holder per 21 USC 355(j)(2)(B). The patent holder may sue within 45 days, triggering an automatic 30-month stay of FDA approval (21 USC 355(j)(5)(B)(iii)). Ensure litigation counsel is engaged and a Paragraph IV notice letter is prepared.',
            reference: '21 USC 355(j)(2)(B); 21 CFR 314.95',
          },
        ],
      },

      /* ================================================================
       * Section 3 — Module 2.5: Clinical Overview
       * ================================================================ */

      {
        id: 'clinical_dev_program',
        section: 'Module 2.5 — Clinical Overview',
        question:
          'Provide an overview of the clinical development program that supports this NDA.',
        guidance:
          'Module 2.5 (ICH M4E(R2)) requires a Clinical Overview that critically analyzes the clinical data from all studies. This is a narrative assessment, not a data listing — it should synthesize the biopharmaceutic, clinical pharmacology, efficacy, and safety data into a coherent benefit-risk story. Per ICH E1 (Population Exposure), at least 1,500 patients should be exposed for short-term treatments and at least 300-600 for one year for chronic use.',
        fields: [
          {
            id: 'total_clinical_studies',
            label: 'Total Number of Clinical Studies in the NDA',
            type: 'number',
            required: true,
            validation: { min: 1, max: 500 },
            helpText: 'Include all Phase 1, 2, and 3 studies across the entire clinical development program.',
          },
          {
            id: 'total_patients_exposed',
            label: 'Total Patients Exposed to the Drug',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText: 'Per ICH E1, the safety database typically requires at least 1,500 patients for short-term treatment indications. For chronic use, 300-600 patients exposed for 6 months and 100 for 12 months.',
          },
          {
            id: 'development_duration_years',
            label: 'Clinical Development Duration (Years)',
            type: 'number',
            validation: { min: 0, max: 30 },
            placeholder: 'e.g., 8',
          },
          {
            id: 'ind_number',
            label: 'IND Number(s)',
            type: 'text',
            placeholder: 'e.g., IND 123456, IND 789012',
            required: true,
          },
          {
            id: 'clinical_overview_author',
            label: 'Clinical Overview Author',
            type: 'text',
            placeholder: 'e.g., Dr. Jane Smith, MD, PhD — VP Clinical Development',
            helpText: 'Per ICH M4(R4), the author of the clinical overview must be identified and should be a qualified expert.',
          },
          {
            id: 'biopharmaceutic_classification',
            label: 'BCS Classification (Biopharmaceutics Classification System)',
            type: 'select',
            options: [
              { value: 'bcs_i', label: 'BCS Class I — High solubility, high permeability' },
              { value: 'bcs_ii', label: 'BCS Class II — Low solubility, high permeability' },
              { value: 'bcs_iii', label: 'BCS Class III — High solubility, low permeability' },
              { value: 'bcs_iv', label: 'BCS Class IV — Low solubility, low permeability' },
              { value: 'na', label: 'Not applicable (biologic or non-oral route)' },
            ],
            helpText: 'Per FDA Guidance "Waiver of In Vivo Bioavailability and Bioequivalence Studies for Immediate-Release Solid Oral Dosage Forms Based on a BCS" (2017).',
          },
        ],
        defaultNext: 'clinical_pharmacology',
        issueChecks: [
          {
            id: 'safety_db_too_small',
            condition: { field: 'total_patients_exposed', operator: 'lt', value: 1500 },
            severity: 'warning',
            title: 'Safety Database May Be Insufficient',
            message:
              'ICH E1 recommends a safety database of at least 1,500 patients for non-life-threatening indications. A database below this threshold may trigger a refuse-to-file action or a Complete Response Letter requesting additional safety data. Ensure justification is provided if the safety database is smaller than recommended.',
            reference: 'ICH E1 "The Extent of Population Exposure to Assess Clinical Safety"',
          },
        ],
        provideExpertFeedback: true,
      },

      {
        id: 'clinical_pharmacology',
        section: 'Module 2.5 — Clinical Overview',
        question:
          'Describe the clinical pharmacology data package, including PK/PD, drug interactions, and special populations.',
        guidance:
          'The clinical pharmacology section (Module 2.7.2 and supporting Module 5 studies) is critical for labeling and dosing recommendations. Per ICH E14 (2005, R3 2017) and FDA Guidance "E14 and S7B: Clinical and Nonclinical Evaluation of QT/QTc Interval Prolongation" (2017), a thorough QT/QTc study or concentration-QTc analysis is required. FDA Guidance "Population Pharmacokinetics" (2022) and "Drug Interaction Studies" (2020) describe expectations for PK/PD characterization and DDI assessments.',
        fields: [
          {
            id: 'pk_characterization',
            label: 'PK Characterization Complete',
            type: 'yes_no',
            required: true,
            helpText: 'Absorption, distribution, metabolism, and excretion (ADME) should be fully characterized.',
          },
          {
            id: 'population_pk_model',
            label: 'Population PK Model Developed',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA Guidance "Population Pharmacokinetics" (2022), a popPK model integrating data across studies is expected.',
          },
          {
            id: 'exposure_response',
            label: 'Exposure-Response Analysis Complete',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA Guidance "Exposure-Response Relationships — Study Design, Data Analysis, and Regulatory Applications" (2003), E-R analysis is expected for efficacy and safety endpoints.',
          },
          {
            id: 'ddi_studies',
            label: 'Drug-Drug Interaction Studies',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'cyp_inhibition', label: 'CYP Inhibition Studies (in vitro)' },
              { value: 'cyp_induction', label: 'CYP Induction Studies (in vitro)' },
              { value: 'transporter', label: 'Transporter Studies (P-gp, BCRP, OATP, etc.)' },
              { value: 'clinical_ddi', label: 'Clinical DDI Studies' },
              { value: 'pbpk', label: 'PBPK Modeling for DDI Prediction' },
            ],
            helpText: 'Per FDA Guidance "In Vitro Drug Interaction Studies — Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions" (2020) and "Clinical Drug Interaction Studies" (2020).',
          },
          {
            id: 'qtc_assessment',
            label: 'QTc Assessment Completed',
            type: 'select',
            required: true,
            options: [
              { value: 'tqt_study', label: 'Dedicated TQT Study (ICH E14)' },
              { value: 'concentration_qtc', label: 'Concentration-QTc Analysis (ICH E14 Q&A R3)' },
              { value: 'both', label: 'Both TQT Study and C-QTc Analysis' },
              { value: 'not_completed', label: 'Not Completed' },
            ],
          },
          {
            id: 'special_populations',
            label: 'Special Population Studies Conducted',
            type: 'multi_select',
            options: [
              { value: 'hepatic', label: 'Hepatic Impairment (FDA Guidance 2020)' },
              { value: 'renal', label: 'Renal Impairment (FDA Guidance 2020)' },
              { value: 'pediatric', label: 'Pediatric PK' },
              { value: 'geriatric', label: 'Geriatric (ICH E7)' },
              { value: 'pregnancy', label: 'Pregnancy / Lactation' },
              { value: 'race_ethnicity', label: 'Race/Ethnicity (ICH E5)' },
              { value: 'food_effect', label: 'Food Effect Study' },
            ],
          },
        ],
        defaultNext: 'benefit_risk',
        issueChecks: [
          {
            id: 'no_qtc_assessment',
            condition: { field: 'qtc_assessment', operator: 'eq', value: 'not_completed' },
            severity: 'critical',
            title: 'QTc Assessment Not Completed',
            message:
              'Per ICH E14 and FDA Guidance "E14 and S7B Clinical and Nonclinical Evaluation of QT/QTc Interval Prolongation" (2017), a thorough QTc assessment is required for virtually all new drugs. This is a refuse-to-file issue. Either a dedicated TQT study or a concentration-QTc analysis from Phase 1/2 ECG data must be provided.',
            reference: 'ICH E14(R3); FDA Guidance "E14 and S7B" (2017)',
          },
        ],
      },

      {
        id: 'benefit_risk',
        section: 'Module 2.5 — Clinical Overview',
        question:
          'Present the benefit-risk assessment for the proposed indication.',
        guidance:
          'The benefit-risk assessment is the capstone of Module 2.5 and is central to FDA\'s review. Per FDA\'s Benefit-Risk Framework (Structured Approach, 2018), the assessment should address: (1) Analysis of Condition — severity, unmet medical need; (2) Current Treatment Options — approved therapies and their limitations; (3) Benefit — clinical efficacy, effect size, durability; (4) Risk — safety profile, adverse events, serious risks; (5) Risk Management — REMS, contraindications, warnings. The benefit-risk assessment directly informs the labeling.',
        fields: [
          {
            id: 'disease_severity',
            label: 'Disease Severity Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'life_threatening', label: 'Life-Threatening / Immediately Life-Threatening' },
              { value: 'serious', label: 'Serious Condition (as defined in 21 CFR 312.300)' },
              { value: 'chronic_debilitating', label: 'Chronic / Debilitating but Not Life-Threatening' },
              { value: 'symptomatic', label: 'Symptomatic / Quality-of-Life Condition' },
            ],
          },
          {
            id: 'unmet_need',
            label: 'Unmet Medical Need Statement',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the unmet medical need and why existing therapies are inadequate...',
            validation: { minLength: 50, maxLength: 3000 },
          },
          {
            id: 'current_treatments',
            label: 'Current Standard of Care',
            type: 'textarea',
            required: true,
            placeholder: 'List currently approved treatments for this indication and their limitations...',
          },
          {
            id: 'efficacy_magnitude',
            label: 'Magnitude of Efficacy Benefit',
            type: 'textarea',
            required: true,
            placeholder: 'Summarize the primary efficacy results (e.g., hazard ratio, response rate, absolute risk reduction) and their clinical significance...',
          },
          {
            id: 'key_safety_risks',
            label: 'Key Safety Risks',
            type: 'textarea',
            required: true,
            placeholder: 'Summarize the most important safety findings, including dose-limiting toxicities, serious adverse events, and any deaths on treatment...',
          },
          {
            id: 'benefit_risk_conclusion',
            label: 'Benefit-Risk Conclusion',
            type: 'select',
            required: true,
            options: [
              { value: 'favorable', label: 'Favorable — Benefits clearly outweigh risks' },
              { value: 'favorable_with_mitigation', label: 'Favorable with Risk Mitigation (REMS or labeling restrictions)' },
              { value: 'marginal', label: 'Marginal — Benefits modestly outweigh risks' },
              { value: 'uncertain', label: 'Uncertain — Additional data may be needed' },
            ],
          },
        ],
        defaultNext: 'biopharm_pk_summary',
        provideExpertFeedback: true,
      },

      /* ================================================================
       * Section 4 — Module 2.7: Clinical Summary
       * ================================================================ */

      {
        id: 'biopharm_pk_summary',
        section: 'Module 2.7 — Clinical Summary',
        question:
          'Provide the biopharmaceutic and pharmacokinetic study summaries for Module 2.7.',
        guidance:
          'Module 2.7.1 (ICH M4E(R2)) requires a Summary of Biopharmaceutic Studies and Associated Analytical Methods. Module 2.7.2 requires a Summary of Clinical Pharmacology Studies. These are tabular summaries with cross-references to the full study reports in Module 5. Per ICH E3, each study should be summarized with design, objectives, key results, and conclusions.',
        fields: [
          {
            id: 'bioavailability_studies_count',
            label: 'Number of Bioavailability Studies',
            type: 'number',
            validation: { min: 0, max: 50 },
            required: true,
          },
          {
            id: 'bioequivalence_studies_count',
            label: 'Number of Bioequivalence Studies',
            type: 'number',
            validation: { min: 0, max: 50 },
          },
          {
            id: 'formulation_changes',
            label: 'Were there formulation changes during development?',
            type: 'yes_no',
            required: true,
            helpText: 'If the clinical formulation differs from the to-be-marketed formulation, a bridging bioequivalence study is typically required.',
          },
          {
            id: 'formulation_bridge_study',
            label: 'Bridging Study Between Clinical and Commercial Formulations',
            type: 'yes_no',
            visibleWhen: { field: 'formulation_changes', operator: 'eq', value: true },
            helpText: 'Per FDA Guidance "SUPAC-MR: Modified Release Solid Oral Dosage Forms" (1997) and "SUPAC-IR" (1995), changes in formulation may require bioequivalence bridging.',
          },
          {
            id: 'pk_studies_count',
            label: 'Total PK Studies',
            type: 'number',
            required: true,
            validation: { min: 0, max: 100 },
          },
          {
            id: 'pk_summary_complete',
            label: 'PK Tabular Summary (Module 2.7.2) Complete',
            type: 'yes_no',
            required: true,
          },
        ],
        defaultNext: 'efficacy_safety_tables',
      },

      {
        id: 'efficacy_safety_tables',
        section: 'Module 2.7 — Clinical Summary',
        question:
          'Describe the status of the clinical efficacy and safety tabular summaries.',
        guidance:
          'Module 2.7.3 (Summary of Clinical Efficacy) must include tabular summaries of efficacy data per ICH M4E(R2): patient demographics, primary/secondary endpoint results, and subgroup analyses. Module 2.7.4 (Summary of Clinical Safety) must include tabular summaries of adverse events, serious adverse events, deaths, and laboratory findings per ICH E3 and ICH M4E(R2). The safety tables should follow the MedDRA dictionary for AE coding.',
        fields: [
          {
            id: 'efficacy_tables_complete',
            label: 'Module 2.7.3 — Efficacy Tabular Summary Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'safety_tables_complete',
            label: 'Module 2.7.4 — Safety Tabular Summary Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'meddra_version',
            label: 'MedDRA Version Used for AE Coding',
            type: 'text',
            placeholder: 'e.g., MedDRA v26.1',
            required: true,
          },
          {
            id: 'ae_tables_included',
            label: 'AE Tables Included',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'teae_overview', label: 'TEAE Overview Table' },
              { value: 'ae_by_soc', label: 'AEs by System Organ Class' },
              { value: 'ae_by_severity', label: 'AEs by Severity Grade' },
              { value: 'drug_related_ae', label: 'Drug-Related AEs' },
              { value: 'sae_table', label: 'Serious Adverse Events Table' },
              { value: 'deaths', label: 'Deaths Listing' },
              { value: 'discontinuation_ae', label: 'AEs Leading to Discontinuation' },
              { value: 'lab_abnormalities', label: 'Laboratory Abnormalities' },
              { value: 'vital_signs', label: 'Vital Signs Changes' },
              { value: 'ecg_findings', label: 'ECG Findings' },
            ],
          },
          {
            id: 'deaths_on_study',
            label: 'Number of Deaths in the Clinical Program',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'deaths_narratives_complete',
            label: 'Death Narratives Complete',
            type: 'yes_no',
            visibleWhen: { field: 'deaths_on_study', operator: 'gt', value: 0 },
            helpText: 'Per ICH E3, individual patient narratives must be provided for all deaths, and a summary attribution assessment is required.',
          },
        ],
        defaultNext: 'literature_references',
      },

      {
        id: 'literature_references',
        section: 'Module 2.7 — Clinical Summary',
        question:
          'Provide information about the literature references and Module 2.7.6 requirements.',
        guidance:
          'Module 2.7.5 (References) must include all literature cited in the clinical overview and clinical summaries. Module 2.7.6 (Synopses of Individual Studies) requires a synopsis for each clinical study following the ICH E3 synopsis format. For 505(b)(2) applications, published literature supporting safety/efficacy must be included in full per 21 CFR 314.50(d)(1).',
        fields: [
          {
            id: 'total_literature_references',
            label: 'Total Literature References',
            type: 'number',
            validation: { min: 0, max: 5000 },
          },
          {
            id: 'study_synopses_complete',
            label: 'ICH E3 Synopses Complete for All Studies',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'literature_for_505b2',
            label: 'Published Literature Included for 505(b)(2) Reliance',
            type: 'yes_no',
            visibleWhen: { field: 'nda_type', operator: 'eq', value: '505b2' },
            helpText: 'For 505(b)(2), full copies of published reports relied upon for safety/efficacy must be included per 21 CFR 314.50(d)(1).',
          },
          {
            id: 'datasets_submitted',
            label: 'Electronic Datasets Submitted in CDISC Format',
            type: 'select',
            required: true,
            options: [
              { value: 'sdtm_adam', label: 'SDTM + ADaM Datasets (FDA required format)' },
              { value: 'sdtm_only', label: 'SDTM Only' },
              { value: 'legacy', label: 'Legacy Format (pre-CDISC)' },
              { value: 'not_ready', label: 'Not Yet Prepared' },
            ],
            helpText: 'Per FDA Guidance "Study Data Standards Resources" (updated annually), CDISC SDTM and ADaM datasets are required for NDA submissions. SEND datasets are required for nonclinical studies.',
          },
          {
            id: 'define_xml_version',
            label: 'Define-XML Version',
            type: 'select',
            options: [
              { value: 'v2_1', label: 'Define-XML v2.1' },
              { value: 'v2_0', label: 'Define-XML v2.0' },
              { value: 'not_prepared', label: 'Not Yet Prepared' },
            ],
          },
        ],
        defaultNext: 'drug_substance',
      },

      /* ================================================================
       * Section 5 — Module 3: Quality / CMC
       * ================================================================ */

      {
        id: 'drug_substance',
        section: 'Module 3 — Quality / CMC',
        question:
          'Describe the drug substance (Module 3.2.S) information.',
        guidance:
          'Module 3.2.S covers the drug substance per ICH Q7 (GMP for Active Pharmaceutical Ingredients), ICH Q11 (Development and Manufacture of Drug Substances), and ICH Q6A/Q6B (Specifications for chemical/biotechnological substances). The drug substance section must include characterization, manufacturing process description, specification justification, and stability data per ICH Q1A(R2).',
        fields: [
          {
            id: 'drug_substance_name',
            label: 'Drug Substance Name (USAN / INN)',
            type: 'text',
            required: true,
          },
          {
            id: 'chemical_structure_characterized',
            label: 'Chemical Structure Fully Characterized',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'manufacturing_process_validated',
            label: 'Manufacturing Process Validated',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q7, the commercial manufacturing process must be validated. Process validation data per FDA Guidance "Process Validation: General Principles and Practices" (2011) should be included or cross-referenced.',
          },
          {
            id: 'ds_specification_set',
            label: 'Drug Substance Specification Set per ICH Q6A/Q6B',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'ds_stability_data',
            label: 'Drug Substance Stability Data Available',
            type: 'select',
            required: true,
            options: [
              { value: 'full_ich', label: 'Full ICH Q1A(R2) Stability Data (long-term + accelerated)' },
              { value: 'partial', label: 'Partial Stability Data (ongoing studies)' },
              { value: 'minimal', label: 'Minimal Data — Additional Studies Needed' },
            ],
          },
          {
            id: 'ds_impurity_profile',
            label: 'Impurity Profile Characterized per ICH Q3A(R2)',
            type: 'yes_no',
            required: true,
            helpText: 'Impurity limits per ICH Q3A(R2) — identification threshold: 0.10% for dose >2g/day; qualification threshold: 0.15% for dose >2g/day.',
          },
          {
            id: 'genotoxic_impurities',
            label: 'Genotoxic Impurities Assessed per ICH M7(R2)',
            type: 'yes_no',
            required: true,
            helpText: 'ICH M7(R2) requires assessment and control of mutagenic impurities in pharmaceuticals with acceptable intake limits (typically 1.5 μg/day for lifetime exposure).',
          },
          {
            id: 'ds_manufacturer',
            label: 'Drug Substance Manufacturer',
            type: 'text',
            placeholder: 'e.g., Lonza AG, Visp, Switzerland',
            required: true,
          },
        ],
        defaultNext: 'drug_product',
      },

      {
        id: 'drug_product',
        section: 'Module 3 — Quality / CMC',
        question:
          'Describe the drug product (Module 3.2.P) information.',
        guidance:
          'Module 3.2.P covers the drug product per ICH Q8(R2) (Pharmaceutical Development), ICH Q9 (Quality Risk Management), and ICH Q10 (Pharmaceutical Quality System). The section must include formulation, manufacturing process, specifications, stability, and container-closure system information. Per ICH Q1A(R2), stability data supporting the proposed shelf life must be provided. Per ICH Q3B(R2), degradation impurities must be qualified.',
        fields: [
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'solution_injection', label: 'Solution for Injection' },
              { value: 'lyophilized', label: 'Lyophilized Powder for Reconstitution' },
              { value: 'suspension', label: 'Suspension' },
              { value: 'patch', label: 'Transdermal Patch' },
              { value: 'inhaler', label: 'Inhaler (MDI / DPI)' },
              { value: 'prefilled_syringe', label: 'Prefilled Syringe' },
              { value: 'autoinjector', label: 'Autoinjector' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'strengths',
            label: 'Strengths to be Marketed',
            type: 'text',
            required: true,
            placeholder: 'e.g., 25 mg, 50 mg, 100 mg',
          },
          {
            id: 'dp_manufacturing_validated',
            label: 'Drug Product Manufacturing Process Validated',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'dp_specification_set',
            label: 'Drug Product Specifications per ICH Q6A/Q6B',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'dp_stability_data',
            label: 'Drug Product Stability Data',
            type: 'select',
            required: true,
            options: [
              { value: 'full_ich', label: 'Full ICH Q1A(R2) Stability Data — supports proposed shelf life' },
              { value: 'partial', label: 'Partial Data — shelf life extrapolation needed (ICH Q1E)' },
              { value: 'insufficient', label: 'Insufficient — additional data needed before approval' },
            ],
          },
          {
            id: 'proposed_shelf_life',
            label: 'Proposed Shelf Life',
            type: 'text',
            placeholder: 'e.g., 24 months at 25°C/60% RH',
            required: true,
          },
          {
            id: 'container_closure',
            label: 'Container-Closure System',
            type: 'text',
            placeholder: 'e.g., HDPE bottle with child-resistant closure, 30-count',
            required: true,
          },
          {
            id: 'dp_manufacturer',
            label: 'Drug Product Manufacturing Site',
            type: 'text',
            placeholder: 'e.g., Patheon, Inc., Cincinnati, OH',
            required: true,
          },
        ],
        defaultNext: 'facilities_adventitious',
      },

      {
        id: 'facilities_adventitious',
        section: 'Module 3 — Quality / CMC',
        question:
          'Provide information about manufacturing facilities and, for biologics, adventitious agents assessment.',
        guidance:
          'All manufacturing, testing, and packaging sites must be listed in Module 3.2.R (Regional Information) with their FDA Establishment Identifier (FEI) numbers. Per 21 CFR 314.50(d)(1), facilities must be registered with FDA and inspected. For biologics or products derived from biological sources, adventitious agents (viruses, TSE agents, mycoplasma) must be addressed per ICH Q5A(R2) "Viral Safety Evaluation" and ICH Q5D "Cell Substrates."',
        fields: [
          {
            id: 'total_manufacturing_sites',
            label: 'Total Manufacturing / Testing Sites',
            type: 'number',
            required: true,
            validation: { min: 1, max: 50 },
          },
          {
            id: 'all_sites_registered',
            label: 'All Sites FDA-Registered with FEI Numbers',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pre_approval_inspection_expected',
            label: 'Pre-Approval Inspection (PAI) Expected',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA MAPP 5014.1, PAI is typically conducted for NDA manufacturing sites. FDA\'s Office of Pharmaceutical Quality (OPQ) conducts PAI assessments.',
          },
          {
            id: 'gmp_status',
            label: 'Current GMP Status of All Sites',
            type: 'select',
            required: true,
            options: [
              { value: 'all_compliant', label: 'All Sites GMP-Compliant (no outstanding 483s)' },
              { value: 'minor_483', label: 'Minor FDA 483 Observations Outstanding' },
              { value: 'warning_letter', label: 'Warning Letter or Import Alert Active' },
              { value: 'not_inspected', label: 'Not Yet FDA-Inspected' },
            ],
          },
          {
            id: 'adventitious_agents_applicable',
            label: 'Adventitious Agents Assessment Applicable',
            type: 'yes_no',
            required: true,
            helpText: 'Required for biologics and any product derived from biological sources (e.g., animal-derived excipients, cell-culture-based products).',
          },
          {
            id: 'viral_safety_evaluation',
            label: 'Viral Safety Evaluation per ICH Q5A(R2) Complete',
            type: 'yes_no',
            visibleWhen: { field: 'adventitious_agents_applicable', operator: 'eq', value: true },
          },
          {
            id: 'cell_bank_characterization',
            label: 'Cell Bank Characterization per ICH Q5D Complete',
            type: 'yes_no',
            visibleWhen: { field: 'is_biologic', operator: 'eq', value: true },
            helpText: 'For biological products, Master Cell Bank (MCB) and Working Cell Bank (WCB) must be characterized per ICH Q5D.',
          },
        ],
        defaultNext: 'pharmacology_pk',
      },

      /* ================================================================
       * Section 6 — Module 4: Nonclinical
       * ================================================================ */

      {
        id: 'pharmacology_pk',
        section: 'Module 4 — Nonclinical',
        question:
          'Describe the nonclinical pharmacology and pharmacokinetic studies supporting the NDA.',
        guidance:
          'Module 4 (ICH M4S(R2)) covers the nonclinical data. Section 4.2.1 (Primary Pharmacodynamics) describes the mechanism of action and in vitro/in vivo efficacy. Section 4.2.2 (Secondary Pharmacodynamics) covers off-target effects. Section 4.2.3 (Safety Pharmacology) must address cardiovascular (ICH S7A/S7B), CNS, and respiratory systems. Section 4.2.4 covers nonclinical PK (ADME). Per ICH S7B, an hERG assay and in vivo QT study are expected.',
        fields: [
          {
            id: 'primary_pharmacology_complete',
            label: 'Primary Pharmacology Studies Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'secondary_pharmacology_complete',
            label: 'Secondary Pharmacology (Off-Target Screen) Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'safety_pharmacology_core_battery',
            label: 'Core Safety Pharmacology Battery Complete',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH S7A, the core battery includes cardiovascular (hERG + in vivo telemetry), CNS (Irwin test / FOB), and respiratory function studies.',
          },
          {
            id: 'herg_assay',
            label: 'hERG Assay Conducted',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH S7B, an in vitro hERG (IKr) assay is required to assess QT prolongation risk.',
          },
          {
            id: 'nonclinical_pk_complete',
            label: 'Nonclinical PK (ADME) Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'species_used_nonclinical',
            label: 'Species Used in Nonclinical Program',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'mouse', label: 'Mouse' },
              { value: 'rat', label: 'Rat' },
              { value: 'rabbit', label: 'Rabbit' },
              { value: 'dog', label: 'Dog' },
              { value: 'cynomolgus', label: 'Cynomolgus Monkey' },
              { value: 'minipig', label: 'Minipig' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'environmental_risk_assessment',
            label: 'Environmental Risk Assessment (ERA) Completed',
            type: 'yes_no',
            helpText: 'Per 21 CFR 25, an ERA may be required unless a categorical exclusion applies. The ERA evaluates potential environmental impact of manufacturing and patient excretion.',
          },
        ],
        defaultNext: 'toxicology_program',
      },

      {
        id: 'toxicology_program',
        section: 'Module 4 — Nonclinical',
        question:
          'Describe the nonclinical toxicology program supporting the NDA.',
        guidance:
          'The toxicology section (Module 4.2.3) must include single-dose, repeat-dose (duration per ICH M3(R2) — typically 6 months in rodents, 9 months in non-rodents for chronic use), genotoxicity (ICH S2(R1)), carcinogenicity (ICH S1A/S1B — required for products used > 6 months or with concern), reproductive toxicity (ICH S5(R3) — fertility, embryo-fetal development, pre/postnatal development), and local tolerance. Phototoxicity (ICH S10) should be assessed if the drug absorbs UV/visible light.',
        fields: [
          {
            id: 'single_dose_tox',
            label: 'Single-Dose Toxicology Complete',
            type: 'yes_no',
          },
          {
            id: 'repeat_dose_tox_rodent',
            label: 'Repeat-Dose Toxicology — Rodent (duration)',
            type: 'select',
            required: true,
            options: [
              { value: '1_month', label: '1 Month' },
              { value: '3_month', label: '3 Months' },
              { value: '6_month', label: '6 Months' },
              { value: 'not_conducted', label: 'Not Conducted' },
            ],
          },
          {
            id: 'repeat_dose_tox_non_rodent',
            label: 'Repeat-Dose Toxicology — Non-Rodent (duration)',
            type: 'select',
            required: true,
            options: [
              { value: '1_month', label: '1 Month' },
              { value: '3_month', label: '3 Months' },
              { value: '9_month', label: '9 Months' },
              { value: 'not_conducted', label: 'Not Conducted' },
            ],
          },
          {
            id: 'genotoxicity_battery',
            label: 'Genotoxicity Battery Complete (ICH S2(R1))',
            type: 'yes_no',
            required: true,
            helpText: 'Standard battery: Ames test (bacterial reverse mutation), in vitro chromosomal aberration or micronucleus, and in vivo micronucleus.',
          },
          {
            id: 'carcinogenicity_studies',
            label: 'Carcinogenicity Studies',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Completed (2-year rodent + Tg.rasH2 or p53+/-)' },
              { value: 'waiver_granted', label: 'Waiver Granted (ICH S1A — duration < 6 months)' },
              { value: 'ongoing', label: 'Ongoing — Data Expected Before Approval' },
              { value: 'not_initiated', label: 'Not Initiated' },
            ],
          },
          {
            id: 'reproductive_tox',
            label: 'Reproductive Toxicology Studies per ICH S5(R3)',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'fertility', label: 'Fertility and Early Embryonic Development (Segment I)' },
              { value: 'efd', label: 'Embryo-Fetal Development (Segment II)' },
              { value: 'ppnd', label: 'Pre/Postnatal Development (Segment III)' },
              { value: 'juvenile', label: 'Juvenile Animal Toxicology' },
              { value: 'none', label: 'None Conducted' },
            ],
          },
          {
            id: 'indication_chronicity',
            label: 'Is this a chronic-use indication (> 6 months treatment)?',
            type: 'yes_no',
            required: true,
          },
        ],
        defaultNext: 'pivotal_studies',
        issueChecks: [
          {
            id: 'no_carcinogenicity_chronic',
            condition: { field: 'carcinogenicity_studies', operator: 'eq', value: 'not_initiated' },
            severity: 'critical',
            title: 'No Carcinogenicity Data for Chronic Indication',
            message:
              'Per ICH S1A, carcinogenicity studies are required for drugs intended for continuous use > 6 months. FDA will not approve an NDA for a chronic indication without carcinogenicity data or a scientifically justified waiver. This is a refuse-to-file issue.',
            reference: 'ICH S1A "Need for Carcinogenicity Studies of Pharmaceuticals"; ICH S1B(R1)',
          },
          {
            id: 'missing_reproductive_tox',
            condition: { field: 'reproductive_tox', operator: 'contains', value: 'none' },
            severity: 'critical',
            title: 'Missing Reproductive Toxicology Studies',
            message:
              'Per ICH S5(R3), reproductive and developmental toxicity studies are required for all drugs to be used in women of childbearing potential. At minimum, fertility (Segment I) and embryo-fetal development (Segment II) studies are expected before NDA submission. This is a refuse-to-file issue.',
            reference: 'ICH S5(R3) "Detection of Reproductive and Developmental Toxicity"',
          },
          {
            id: 'no_chronic_tox_data',
            condition: { field: 'repeat_dose_tox_rodent', operator: 'in', value: ['1_month', 'not_conducted'] },
            severity: 'critical',
            title: 'Insufficient Chronic Toxicity Duration',
            message:
              'Per ICH M3(R2), repeat-dose toxicity study duration must equal or exceed the intended clinical treatment duration. For chronic use, 6-month rodent and 9-month non-rodent studies are required. Current data appears insufficient for the proposed indication.',
            reference: 'ICH M3(R2) Table 1; FDA Guidance "Nonclinical Safety Evaluation of Drug Products" (2016)',
          },
        ],
      },

      /* ================================================================
       * Section 7 — Module 5: Clinical Study Reports
       * ================================================================ */

      {
        id: 'pivotal_studies',
        section: 'Module 5 — Clinical Study Reports',
        question:
          'Describe the pivotal clinical studies that form the primary evidence for this NDA.',
        guidance:
          'Per 21 CFR 314.126, FDA generally requires evidence from adequate and well-controlled investigations — typically two pivotal trials demonstrating effectiveness. Under certain circumstances (e.g., large multicenter trial with robust results, rare disease), a single pivotal trial may suffice per FDA Guidance "Providing Clinical Evidence of Effectiveness for Human Drug and Biological Products" (1998). Each pivotal study report must follow the ICH E3 format.',
        fields: [
          {
            id: 'number_pivotal_studies',
            label: 'Number of Pivotal (Phase 3) Studies',
            type: 'number',
            required: true,
            validation: { min: 0, max: 20 },
          },
          {
            id: 'pivotal_study_designs',
            label: 'Pivotal Study Design(s)',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'rct_parallel', label: 'Randomized Controlled — Parallel Group' },
              { value: 'rct_crossover', label: 'Randomized Controlled — Crossover' },
              { value: 'single_arm', label: 'Single-Arm (for accelerated approval)' },
              { value: 'non_inferiority', label: 'Non-Inferiority' },
              { value: 'superiority', label: 'Superiority' },
              { value: 'adaptive', label: 'Adaptive Design' },
              { value: 'platform', label: 'Platform / Master Protocol' },
              { value: 'external_control', label: 'External / Historical Control' },
            ],
          },
          {
            id: 'primary_endpoint',
            label: 'Primary Endpoint(s)',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Overall Survival (OS) with a hazard ratio target of <0.75 vs. standard of care; co-primary endpoints of ACR20 response rate and change in HAQ-DI from baseline at Week 24',
          },
          {
            id: 'primary_endpoint_met',
            label: 'Primary Endpoint(s) Met',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pivotal_total_enrollment',
            label: 'Total Enrollment Across Pivotal Studies',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'statistical_analysis_plan',
            label: 'Statistical Analysis Plan Pre-Specified',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH E9(R1), the statistical analysis plan must be pre-specified and finalized before database lock.',
          },
          {
            id: 'multiplicity_controlled',
            label: 'Multiplicity Controlled (if multiple endpoints)',
            type: 'yes_no',
            helpText: 'Per ICH E9(R1), multiplicity must be controlled using methods such as hierarchical testing, gatekeeping, or Bonferroni correction.',
          },
          {
            id: 'pivotal_csr_status',
            label: 'Pivotal Study CSR Status',
            type: 'select',
            required: true,
            options: [
              { value: 'final', label: 'Final CSR(s) Complete (ICH E3 format)' },
              { value: 'draft', label: 'Draft CSR — Finalization in Progress' },
              { value: 'not_started', label: 'CSR Writing Not Yet Started' },
            ],
          },
        ],
        defaultNext: 'supportive_studies',
        issueChecks: [
          {
            id: 'insufficient_pivotal_studies',
            condition: { field: 'number_pivotal_studies', operator: 'lt', value: 2 },
            severity: 'critical',
            title: 'Fewer Than Two Adequate, Well-Controlled Studies',
            message:
              'Per 21 CFR 314.126 and FDA Guidance "Providing Clinical Evidence of Effectiveness" (1998), FDA generally requires at least two adequate and well-controlled investigations to demonstrate substantial evidence of effectiveness. A single pivotal study may be acceptable if the trial is large, multicenter, and provides a particularly robust and compelling demonstration of efficacy (p < 0.001), or for rare diseases. Prepare a strong justification if relying on a single pivotal study.',
            reference: '21 CFR 314.126; 21 USC 355(d)',
          },
        ],
        provideExpertFeedback: true,
      },

      {
        id: 'supportive_studies',
        section: 'Module 5 — Clinical Study Reports',
        question:
          'Describe the supportive clinical studies included in the NDA.',
        guidance:
          'Supportive studies (Phase 1, Phase 2, dose-finding, PK/PD, and special population studies) provide context for the pivotal trial results. Per ICH M4E(R2), Module 5.3 should include: 5.3.1 — biopharmaceutic studies; 5.3.2 — PK studies; 5.3.3 — PK/PD studies; 5.3.4 — efficacy studies; 5.3.5 — safety studies; 5.3.6 — post-marketing reports (if applicable). Dose-finding studies (Phase 2) are particularly important for justifying the dose selected for Phase 3.',
        fields: [
          {
            id: 'phase1_studies_count',
            label: 'Number of Phase 1 Studies',
            type: 'number',
            required: true,
            validation: { min: 0, max: 100 },
          },
          {
            id: 'phase2_studies_count',
            label: 'Number of Phase 2 Studies',
            type: 'number',
            required: true,
            validation: { min: 0, max: 50 },
          },
          {
            id: 'dose_finding_adequate',
            label: 'Dose-Finding (Phase 2) Data Adequate to Justify Phase 3 Dose',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'supportive_efficacy_studies',
            label: 'Number of Supportive Efficacy Studies',
            type: 'number',
            validation: { min: 0, max: 50 },
          },
          {
            id: 'special_population_studies',
            label: 'Special Population Studies Included',
            type: 'multi_select',
            options: [
              { value: 'hepatic', label: 'Hepatic Impairment' },
              { value: 'renal', label: 'Renal Impairment' },
              { value: 'pediatric', label: 'Pediatric' },
              { value: 'geriatric', label: 'Geriatric' },
              { value: 'pregnant', label: 'Pregnant / Lactating' },
              { value: 'race_ethnicity', label: 'Race / Ethnicity Bridge Studies' },
              { value: 'none', label: 'None' },
            ],
          },
          {
            id: 'all_csr_complete',
            label: 'All Supportive Study CSRs Complete (ICH E3)',
            type: 'yes_no',
            required: true,
          },
        ],
        defaultNext: 'integrated_summaries',
      },

      {
        id: 'integrated_summaries',
        section: 'Module 5 — Clinical Study Reports',
        question:
          'Describe the Integrated Summary of Safety (ISS) and Integrated Summary of Efficacy (ISE).',
        guidance:
          'The ISS and ISE are unique to US NDA submissions (not required in the ICH CTD but expected by FDA). Per FDA Guidance "Integrated Summary of Effectiveness" (2015), the ISE should integrate efficacy data across all studies. The ISS (per FDA Guidance "Premarketing Risk Assessment" (2005)) should pool safety data across all studies and include a 120-Day Safety Update per 21 CFR 314.50(d)(5)(vi)(b). The safety update covers all AEs occurring after the NDA data cutoff.',
        fields: [
          {
            id: 'iss_complete',
            label: 'Integrated Summary of Safety (ISS) Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'ise_complete',
            label: 'Integrated Summary of Efficacy (ISE) Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'safety_database_size',
            label: 'Total Safety Database Size (patients exposed)',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText: 'Per ICH E1, the safety database should include at least 1,500 patients for short-term treatment. For chronic use, at least 300-600 patients for 6 months and 100 for 12 months.',
          },
          {
            id: 'safety_update_120day',
            label: '120-Day Safety Update Planned',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 314.50(d)(5)(vi)(b), a 120-day safety update report must be submitted 4 months after NDA filing. This report covers new safety data accumulated after the original NDA data cutoff date.',
          },
          {
            id: 'safety_update_cutoff',
            label: 'NDA Safety Data Cutoff Date',
            type: 'date',
          },
          {
            id: 'integrated_safety_pooling_strategy',
            label: 'Safety Data Pooling Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'all_exposed', label: 'All Patients Exposed to Study Drug' },
              { value: 'phase23_only', label: 'Phase 2/3 Controlled Studies Only' },
              { value: 'pivotal_only', label: 'Pivotal Studies Only' },
              { value: 'multiple_pools', label: 'Multiple Pools (recommended by FDA)' },
            ],
          },
        ],
        defaultNext: 'uspi_content',
        issueChecks: [
          {
            id: 'no_iss',
            condition: { field: 'iss_complete', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Integrated Summary of Safety Not Complete',
            message:
              'The ISS is a critical component of the NDA and its absence will result in a refuse-to-file determination. The ISS should integrate safety data across all clinical studies with standardized MedDRA coding, pooled AE tables, and exposure-adjusted incidence rates.',
            reference: 'FDA Guidance "Premarketing Risk Assessment" (2005); 21 CFR 314.50(d)(5)',
          },
        ],
      },

      /* ================================================================
       * Section 8 — Labeling
       * ================================================================ */

      {
        id: 'uspi_content',
        section: 'Labeling',
        question:
          'Describe the proposed US Prescribing Information (USPI) content.',
        guidance:
          'The USPI must be in Physician Labeling Rule (PLR) format per 21 CFR 201.56 and 201.57. The structured format includes Highlights, Full Prescribing Information table of contents, and 17 numbered sections. Per FDA Guidance "Labeling for Human Prescription Drug and Biological Products — Determining Established Pharmacologic Class for Use in the Highlights" (2009), the Highlights section must include the most important prescribing information. Boxed warnings (21 CFR 201.57(c)(1)) are reserved for the most serious risks.',
        fields: [
          {
            id: 'uspi_plr_format',
            label: 'USPI in PLR Format (21 CFR 201.56/201.57)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'highlights_section_complete',
            label: 'Highlights Section Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'boxed_warning_proposed',
            label: 'Boxed Warning Proposed',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 201.57(c)(1), a boxed warning is required when an adverse reaction is so serious relative to the drug\'s benefit that it is essential to consider in the drug\'s use, or when a serious adverse reaction can be prevented or reduced by appropriate use.',
          },
          {
            id: 'boxed_warning_text',
            label: 'Proposed Boxed Warning Text',
            type: 'textarea',
            visibleWhen: { field: 'boxed_warning_proposed', operator: 'eq', value: true },
            placeholder: 'Enter the proposed boxed warning text...',
          },
          {
            id: 'contraindications',
            label: 'Proposed Contraindications',
            type: 'textarea',
            placeholder: 'e.g., Known hypersensitivity to the active ingredient or any excipient. Concomitant use with strong CYP3A4 inhibitors.',
            required: true,
          },
          {
            id: 'warnings_precautions_count',
            label: 'Number of Warnings & Precautions Sections',
            type: 'number',
            required: true,
            validation: { min: 0, max: 30 },
          },
          {
            id: 'adverse_reactions_table',
            label: 'Adverse Reactions Table Prepared',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 201.57(c)(7), labeling must include a table of adverse reactions occurring at an incidence > 2% (or other appropriate threshold) vs. comparator.',
          },
          {
            id: 'drug_interactions_section',
            label: 'Drug Interactions Section Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'specific_populations',
            label: 'Use in Specific Populations Sections Drafted',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'pregnancy', label: 'Pregnancy (8.1) — PLLR format required per 79 FR 72064' },
              { value: 'lactation', label: 'Lactation (8.2)' },
              { value: 'females_males_repro', label: 'Females and Males of Reproductive Potential (8.3)' },
              { value: 'pediatric', label: 'Pediatric Use (8.4)' },
              { value: 'geriatric', label: 'Geriatric Use (8.5)' },
              { value: 'hepatic', label: 'Hepatic Impairment (8.6)' },
              { value: 'renal', label: 'Renal Impairment (8.7)' },
            ],
          },
        ],
        defaultNext: 'medication_guide',
        issueChecks: [
          {
            id: 'not_plr_format',
            condition: { field: 'uspi_plr_format', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Labeling Not in PLR Format',
            message:
              'Per 21 CFR 201.56 and 201.57, all new NDA labeling must be in the Physician Labeling Rule (PLR) structured format. Non-PLR labeling will be rejected. The PLR format includes Highlights, Full Prescribing Information TOC, and 17 standardized sections.',
            reference: '21 CFR 201.56; 21 CFR 201.57; 71 FR 3922 (January 24, 2006)',
          },
        ],
      },

      {
        id: 'medication_guide',
        section: 'Labeling',
        question:
          'Is a Medication Guide or patient labeling required for this product?',
        guidance:
          'Per 21 CFR 208, a Medication Guide is required when FDA determines that: (1) the drug poses a serious and significant public health concern requiring distribution of patient information; (2) patient labeling could help prevent serious adverse effects; or (3) the drug is important to health and patient adherence is crucial. Per FDA Guidance "Medication Guides — Distribution Requirements and Inclusion in REMS" (2011), the Med Guide must be written at a 6th-8th grade reading level.',
        fields: [
          {
            id: 'medication_guide_required',
            label: 'Medication Guide Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'medication_guide_reason',
            label: 'Reason for Medication Guide',
            type: 'select',
            visibleWhen: { field: 'medication_guide_required', operator: 'eq', value: true },
            options: [
              { value: 'serious_risk', label: 'Serious and significant public health concern' },
              { value: 'patient_labeling_prevents_ae', label: 'Patient labeling could prevent serious adverse effects' },
              { value: 'adherence_critical', label: 'Patient adherence is crucial to efficacy' },
              { value: 'rems_component', label: 'Required as part of REMS' },
            ],
          },
          {
            id: 'medication_guide_drafted',
            label: 'Medication Guide Drafted',
            type: 'yes_no',
            visibleWhen: { field: 'medication_guide_required', operator: 'eq', value: true },
          },
          {
            id: 'patient_counseling_info',
            label: 'Patient Counseling Information Section (Section 17) Drafted',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 201.57(c)(18), Section 17 must include information for safe and effective use of the drug.',
          },
          {
            id: 'instructions_for_use',
            label: 'Instructions for Use (IFU) Required',
            type: 'yes_no',
            helpText: 'IFU is typically required for devices or delivery systems (inhalers, autoinjectors, prefilled syringes) per 21 CFR 801.',
          },
        ],
        defaultNext: 'rems_determination',
        issueChecks: [
          {
            id: 'no_med_guide_serious_risk',
            condition: { field: 'medication_guide_required', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Medication Guide for Drug with Potential Serious Risks',
            message:
              'Per 21 CFR 208, FDA may require a Medication Guide if the drug poses serious and significant public health concerns. If this product has a boxed warning, REMS, or serious adverse reactions, FDA is likely to require a Medication Guide. Reassess this determination.',
            reference: '21 CFR 208; FDA Guidance "Medication Guides" (2011)',
          },
        ],
      },

      /* ================================================================
       * Section 9 — REMS Assessment
       * ================================================================ */

      {
        id: 'rems_determination',
        section: 'REMS Assessment',
        question:
          'Let\'s assess whether a REMS (Risk Evaluation and Mitigation Strategy) is needed and, if so, what elements are proposed.',
        guidance:
          'Per 21 USC 355-1 (FDAAA 2007, as amended by FDASIA 2012 and FDORA 2022), FDA can require a REMS if necessary to ensure that the benefits of the drug outweigh the risks. FDA considers: (1) the estimated size of the population likely to use the drug; (2) the seriousness of the known or potential adverse events; (3) the expected benefit of the drug; (4) the expected or actual duration of treatment; (5) the seriousness of the disease or condition. A REMS may include a Medication Guide, Communication Plan, Elements to Assure Safe Use (ETASU), and/or an Implementation System.',
        fields: [
          {
            id: 'rems_required',
            label: 'Is a REMS Required or Anticipated?',
            type: 'select',
            required: true,
            options: [
              { value: 'required_fda', label: 'Yes — FDA Has Required a REMS' },
              { value: 'anticipated', label: 'Yes — Sponsor Anticipates REMS Will Be Required' },
              { value: 'voluntary', label: 'Voluntary REMS Proposed by Sponsor' },
              { value: 'not_required', label: 'No REMS Required' },
            ],
          },
          {
            id: 'rems_elements',
            label: 'REMS Elements',
            type: 'multi_select',
            visibleWhen: { field: 'rems_required', operator: 'in', value: ['required_fda', 'anticipated', 'voluntary'] },
            options: [
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'communication_plan', label: 'Communication Plan (Dear HCP Letter, training)' },
              { value: 'etasu', label: 'Elements to Assure Safe Use (ETASU)' },
              { value: 'implementation_system', label: 'Implementation System' },
            ],
          },
          {
            id: 'etasu_details',
            label: 'ETASU Requirements',
            type: 'multi_select',
            visibleWhen: { field: 'rems_elements', operator: 'contains', value: 'etasu' },
            options: [
              { value: 'prescriber_certification', label: 'Prescriber Certification / Training' },
              { value: 'pharmacy_certification', label: 'Pharmacy Certification' },
              { value: 'patient_enrollment', label: 'Patient Enrollment in Registry' },
              { value: 'dispensing_restrictions', label: 'Dispensing Restrictions (e.g., specialty pharmacy only)' },
              { value: 'lab_monitoring', label: 'Required Laboratory Monitoring' },
              { value: 'pregnancy_testing', label: 'Pregnancy Testing Requirements' },
            ],
          },
          {
            id: 'rems_assessment_timeline',
            label: 'REMS Assessment Timeline',
            type: 'select',
            visibleWhen: { field: 'rems_required', operator: 'in', value: ['required_fda', 'anticipated', 'voluntary'] },
            options: [
              { value: '18_months', label: '18 Months After Approval' },
              { value: '3_years', label: '3 Years After Approval' },
              { value: '7_years', label: '7 Years After Approval' },
              { value: 'custom', label: 'Custom Timeline Per FDA Agreement' },
            ],
            helpText: 'Per 21 USC 355-1(g), the REMS timetable must specify assessments at 18 months, 3 years, and 7 years after approval.',
          },
        ],
        defaultNext: 'rems_elements',
        issueChecks: [
          {
            id: 'no_rems_with_boxed_warning',
            condition: { field: 'rems_required', operator: 'eq', value: 'not_required' },
            severity: 'critical',
            title: 'No REMS Assessment for Potential Serious Risk Drug',
            message:
              'If this drug has a proposed boxed warning, FDA will almost certainly require a REMS or at minimum a thorough REMS assessment discussion. Per 21 USC 355-1, drugs with serious safety risks that cannot be managed through labeling alone require REMS. Review whether a REMS is necessary.',
            reference: '21 USC 355-1; FDAAA Section 901',
          },
        ],
      },

      {
        id: 'rems_elements',
        section: 'REMS Assessment',
        question:
          'Provide additional REMS implementation details and comparison with similar REMS programs.',
        guidance:
          'FDA maintains a publicly available REMS database at fda.gov/drugs/rems. When proposing or preparing for a REMS, it is highly informative to review REMS programs for drugs in the same therapeutic class or with similar risk profiles. Per FDA Guidance "Format and Content of Proposed Risk Evaluation and Mitigation Strategies" (2009), the REMS submission should include a proposed REMS document, REMS supporting document, and proposed timetable for submission of REMS assessments.',
        fields: [
          {
            id: 'similar_rems_programs',
            label: 'Similar REMS Programs Reviewed',
            type: 'textarea',
            placeholder: 'e.g., iPLEDGE (isotretinoin), Clozapine REMS, Thalomid REMS — describe similarities and differences...',
          },
          {
            id: 'rems_it_system',
            label: 'REMS IT System / Platform',
            type: 'select',
            options: [
              { value: 'vendor_platform', label: 'Third-Party Vendor REMS Platform' },
              { value: 'proprietary', label: 'Proprietary / In-House System' },
              { value: 'shared_system', label: 'Shared System REMS (class-wide)' },
              { value: 'not_applicable', label: 'Not Applicable' },
              { value: 'tbd', label: 'To Be Determined' },
            ],
          },
          {
            id: 'rems_modification_authority',
            label: 'REMS Modification Authority per FDORA',
            type: 'textarea',
            placeholder: 'Under FDORA (2022), describe plans for potential REMS modification requests or sunset provisions...',
            helpText: 'FDORA (2022) amended the REMS provisions to add requirements for FDA to evaluate whether REMS elements remain appropriate and to streamline modification processes.',
          },
          {
            id: 'rems_burden_assessment',
            label: 'REMS Burden on Patient Access',
            type: 'textarea',
            placeholder: 'Describe any anticipated impact on patient access, healthcare provider burden, and pharmacy distribution...',
            helpText: 'Per 21 USC 355-1(f)(2), REMS elements must not be unduly burdensome on patient access to the drug.',
          },
        ],
        defaultNext: 'pmc_pmr',
      },

      /* ================================================================
       * Section 10 — Post-Marketing Commitments
       * ================================================================ */

      {
        id: 'pmc_pmr',
        section: 'Post-Marketing Commitments',
        question:
          'Describe any anticipated post-marketing commitments (PMCs) and post-marketing requirements (PMRs).',
        guidance:
          'PMRs are studies required by statute or regulation (e.g., 505(o)(3) safety studies, accelerated approval confirmatory trials, PREA pediatric studies). PMCs are studies agreed to but not required by statute. Per 21 CFR 314.81(b)(2)(vii), annual reports must include PMC/PMR status updates. For accelerated approval products, per FDORA (2022) amendments, sponsors must demonstrate due diligence in completing confirmatory trials — FDA can expedite withdrawal if confirmatory studies are not completed.',
        fields: [
          {
            id: 'pmr_anticipated',
            label: 'Post-Marketing Requirements (PMRs) Anticipated',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pmr_types',
            label: 'Types of PMRs',
            type: 'multi_select',
            visibleWhen: { field: 'pmr_anticipated', operator: 'eq', value: true },
            options: [
              { value: '505o3_safety', label: '505(o)(3) Safety Study' },
              { value: 'confirmatory_accel', label: 'Confirmatory Trial (Accelerated Approval)' },
              { value: 'prea_pediatric', label: 'PREA Pediatric Study' },
              { value: 'rems_assessment', label: 'REMS Assessment Study' },
              { value: 'animal_rule', label: 'Animal Rule Post-Marketing Study' },
              { value: 'ddi_study', label: 'Drug Interaction Study' },
            ],
          },
          {
            id: 'pmc_anticipated',
            label: 'Post-Marketing Commitments (PMCs) Anticipated',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pmc_description',
            label: 'PMC Description',
            type: 'textarea',
            visibleWhen: { field: 'pmc_anticipated', operator: 'eq', value: true },
            placeholder: 'Describe anticipated PMCs (e.g., additional drug interaction studies, real-world evidence generation, registry studies)...',
          },
          {
            id: 'phase4_studies_planned',
            label: 'Phase 4 Studies Planned',
            type: 'number',
            validation: { min: 0, max: 50 },
          },
          {
            id: 'dsur_commitment',
            label: 'DSUR (Development Safety Update Report) Commitment Ongoing',
            type: 'yes_no',
            helpText: 'Per ICH E2F, DSURs are submitted annually during clinical development. Post-approval, PSURs/PBRERs (ICH E2C(R2)) replace DSURs.',
          },
        ],
        defaultNext: 'pediatric_pharmacovigilance',
      },

      {
        id: 'pediatric_pharmacovigilance',
        section: 'Post-Marketing Commitments',
        question:
          'Address pediatric study requirements and pharmacovigilance plans.',
        guidance:
          'The Pediatric Research Equity Act (PREA, 21 USC 355c) requires pediatric studies for all new active ingredients, new indications, new dosage forms, and new routes of administration, unless a waiver or deferral is granted. Per FDA Guidance "Qualifying for Pediatric Exclusivity Under the Best Pharmaceuticals for Children Act" (BPCA, 21 USC 355a), a Written Request from FDA can trigger pediatric studies for 6-month exclusivity. Post-marketing pharmacovigilance per ICH E2E and FDA Guidance "Good Pharmacovigilance Practices" (2005) should be planned.',
        fields: [
          {
            id: 'prea_applicable',
            label: 'PREA Applicable to This Product',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pediatric_study_status',
            label: 'Pediatric Study Status',
            type: 'select',
            visibleWhen: { field: 'prea_applicable', operator: 'eq', value: true },
            options: [
              { value: 'completed', label: 'Pediatric Studies Completed' },
              { value: 'deferred', label: 'Deferral Granted (studies to be completed post-approval)' },
              { value: 'waiver_full', label: 'Full Waiver Granted' },
              { value: 'waiver_partial', label: 'Partial Waiver (some age groups)' },
              { value: 'not_addressed', label: 'Not Yet Addressed' },
            ],
          },
          {
            id: 'pediatric_formulation',
            label: 'Pediatric Formulation Developed',
            type: 'yes_no',
            visibleWhen: { field: 'prea_applicable', operator: 'eq', value: true },
            helpText: 'Per FDA Guidance "General Clinical Pharmacology Considerations for Pediatric Studies" (2022), an age-appropriate formulation is required.',
          },
          {
            id: 'bpca_written_request',
            label: 'BPCA Written Request Received',
            type: 'yes_no',
            helpText: 'Per 21 USC 355a, if FDA issues a Written Request for pediatric studies, completion confers 6 months of additional exclusivity (added to existing patents/exclusivities).',
          },
          {
            id: 'pharmacovigilance_plan',
            label: 'Post-Marketing Pharmacovigilance Plan',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'adr_reporting', label: 'Routine ADR Reporting (MedWatch / FAERS)' },
              { value: 'psur', label: 'PSUR / PBRER (ICH E2C(R2))' },
              { value: 'signal_detection', label: 'Active Signal Detection Program' },
              { value: 'registry', label: 'Patient Registry' },
              { value: 'pregnancy_registry', label: 'Pregnancy Exposure Registry' },
              { value: 'sentinel', label: 'Sentinel System Monitoring' },
              { value: 'observational', label: 'Observational Post-Marketing Safety Study' },
            ],
          },
          {
            id: 'risk_management_plan',
            label: 'Risk Management Plan (RMP) Prepared',
            type: 'yes_no',
            helpText: 'While RMPs are an EU requirement (EMA), preparing a pharmacovigilance plan for the US that addresses key safety concerns is best practice per ICH E2E.',
          },
        ],
        defaultNext: 'adcom_planning',
        issueChecks: [
          {
            id: 'no_pediatric_no_waiver',
            condition: { field: 'pediatric_study_status', operator: 'eq', value: 'not_addressed' },
            severity: 'warning',
            title: 'Pediatric Requirements Not Addressed',
            message:
              'PREA (21 USC 355c) requires pediatric studies unless a waiver or deferral is obtained. Failure to address pediatric requirements may result in a refuse-to-file determination. Engage FDA early to discuss pediatric development plans — a Pediatric Study Plan (PSP) must be submitted per 21 USC 355c(e).',
            reference: 'PREA (21 USC 355c); FDA Guidance "Pediatric Study Plans" (2020)',
          },
        ],
      },

      /* ================================================================
       * Section 11 — Advisory Committee
       * ================================================================ */

      {
        id: 'adcom_planning',
        section: 'Advisory Committee',
        question:
          'Is an FDA Advisory Committee meeting expected for this NDA, and what is the preparation status?',
        guidance:
          'Per 21 CFR Part 14, FDA may convene an advisory committee to obtain independent expert advice. Advisory committees are common for: first-in-class drugs, drugs with novel mechanisms of action, products with significant safety concerns, drugs for serious or life-threatening conditions, and applications where FDA seeks broader stakeholder input. The relevant advisory committee depends on the therapeutic area (e.g., ODAC for oncology, CDER advisory committees for other areas). FDA typically decides whether to convene an AdCom within 90 days of filing.',
        fields: [
          {
            id: 'adcom_expected',
            label: 'Advisory Committee Meeting Expected',
            type: 'select',
            required: true,
            options: [
              { value: 'confirmed', label: 'Yes — FDA Has Confirmed AdCom' },
              { value: 'likely', label: 'Likely — First-in-Class or Novel MOA' },
              { value: 'possible', label: 'Possible — Safety Concerns May Trigger' },
              { value: 'unlikely', label: 'Unlikely — Well-Characterized Drug Class' },
            ],
          },
          {
            id: 'relevant_committee',
            label: 'Relevant Advisory Committee',
            type: 'select',
            visibleWhen: { field: 'adcom_expected', operator: 'in', value: ['confirmed', 'likely', 'possible'] },
            options: [
              { value: 'odac', label: 'Oncologic Drugs Advisory Committee (ODAC)' },
              { value: 'cardrenal', label: 'Cardiovascular and Renal Drugs Advisory Committee' },
              { value: 'psychopharm', label: 'Psychopharmacologic Drugs Advisory Committee' },
              { value: 'amdac', label: 'Antimicrobial Drugs Advisory Committee' },
              { value: 'emdac', label: 'Endocrinologic and Metabolic Drugs Advisory Committee' },
              { value: 'gastrointestinal', label: 'Gastrointestinal Drugs Advisory Committee' },
              { value: 'pulmonary', label: 'Pulmonary-Allergy Drugs Advisory Committee' },
              { value: 'arthritis', label: 'Arthritis Advisory Committee' },
              { value: 'dermatologic', label: 'Dermatologic and Ophthalmic Drugs Advisory Committee' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'novel_mechanism',
            label: 'Is This a First-in-Class or Novel Mechanism of Action?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'prior_adcom_precedents',
            label: 'Prior AdCom Precedents for Similar Drugs',
            type: 'textarea',
            placeholder: 'Describe any prior advisory committee meetings for drugs in the same class or for the same indication, and their outcomes...',
            helpText: 'Reviewing prior AdCom transcripts and FDA briefing documents for similar drugs provides invaluable insight into FDA thinking and potential concerns.',
          },
        ],
        defaultNext: 'adcom_preparation',
        issueChecks: [
          {
            id: 'adcom_novel_moa_not_planned',
            condition: { field: 'adcom_expected', operator: 'eq', value: 'unlikely' },
            severity: 'warning',
            title: 'AdCom May Be Required for Novel Drug',
            message:
              'For first-in-class drugs or products with novel mechanisms of action, FDA frequently convenes an advisory committee. If this product has a novel MOA, prepare for the possibility of an AdCom even if one is not currently expected. Budget 3-6 months for AdCom preparation.',
            reference: '21 CFR Part 14; FDA MAPP 4000.4',
          },
        ],
        provideExpertFeedback: true,
      },

      {
        id: 'adcom_preparation',
        section: 'Advisory Committee',
        question:
          'What is the status of advisory committee preparation materials?',
        guidance:
          'If an AdCom is expected, preparation is a major undertaking. The sponsor must prepare a comprehensive briefing document (typically 100-200 pages) submitted to FDA 60 days before the meeting. FDA will prepare its own briefing document and questions for the committee. Key preparation activities include: identifying anticipated FDA concerns, preparing responses to likely questions, developing a compelling benefit-risk presentation, and engaging a KOL consultant panel for mock advisory committee rehearsals.',
        fields: [
          {
            id: 'briefing_document_status',
            label: 'Sponsor Briefing Document Status',
            type: 'select',
            options: [
              { value: 'final', label: 'Final — Ready for Submission' },
              { value: 'draft', label: 'In Draft' },
              { value: 'outline', label: 'Outline Only' },
              { value: 'not_started', label: 'Not Started' },
              { value: 'not_applicable', label: 'Not Applicable (no AdCom expected)' },
            ],
          },
          {
            id: 'anticipated_concerns',
            label: 'Anticipated FDA / Committee Concerns',
            type: 'textarea',
            placeholder: 'List the top 3-5 concerns you expect FDA or committee members to raise...',
          },
          {
            id: 'proposed_adcom_questions',
            label: 'Proposed Discussion Questions',
            type: 'textarea',
            placeholder: 'Draft 2-3 proposed discussion questions that frame the benefit-risk discussion favorably...',
            helpText: 'FDA drafts the final questions, but sponsors can propose questions during the pre-AdCom meeting.',
          },
          {
            id: 'mock_adcom_planned',
            label: 'Mock Advisory Committee Rehearsal Planned',
            type: 'yes_no',
            helpText: 'Best practice: conduct at least one mock AdCom with external KOL panelists 4-6 weeks before the actual meeting.',
          },
          {
            id: 'patient_advocacy',
            label: 'Patient Advocacy / Open Public Hearing Preparation',
            type: 'yes_no',
            helpText: 'AdCom meetings include an Open Public Hearing where patients and advocates can provide testimony. Coordinating supportive patient testimony is common practice.',
          },
        ],
        defaultNext: 'pre_nda_meeting',
      },

      /* ================================================================
       * Section 12 — Submission Timeline & Strategy
       * ================================================================ */

      {
        id: 'pre_nda_meeting',
        section: 'Submission Timeline & Strategy',
        question:
          'Have you held or do you plan to hold a Pre-NDA (Type B) meeting with FDA?',
        guidance:
          'Per FDA Guidance "Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products" (2017) and FDA MAPP 4000.2, a Pre-NDA meeting (Type B meeting) is strongly recommended before NDA submission. The meeting request should be submitted at least 3 months before the desired meeting date. The briefing document is due 30 days before the meeting. Key topics include: NDA content and format, clinical data presentation, statistical analysis plans, labeling, and CMC readiness.',
        fields: [
          {
            id: 'pre_nda_meeting_held',
            label: 'Pre-NDA Meeting Held or Planned',
            type: 'select',
            required: true,
            options: [
              { value: 'held', label: 'Meeting Held — FDA Feedback Received' },
              { value: 'scheduled', label: 'Meeting Scheduled' },
              { value: 'requested', label: 'Meeting Requested — Pending FDA Response' },
              { value: 'not_planned', label: 'Not Planned' },
            ],
          },
          {
            id: 'pre_nda_meeting_date',
            label: 'Pre-NDA Meeting Date',
            type: 'date',
            visibleWhen: { field: 'pre_nda_meeting_held', operator: 'in', value: ['held', 'scheduled'] },
          },
          {
            id: 'fda_feedback_summary',
            label: 'Key FDA Feedback from Pre-NDA Meeting',
            type: 'textarea',
            visibleWhen: { field: 'pre_nda_meeting_held', operator: 'eq', value: 'held' },
            placeholder: 'Summarize the key FDA feedback and agreements from the Pre-NDA meeting...',
          },
          {
            id: 'fda_review_division',
            label: 'Assigned FDA Review Division',
            type: 'text',
            placeholder: 'e.g., Division of Rheumatology and Transplant Medicine (DRTM)',
            helpText: 'The review division is typically confirmed during or after the Pre-NDA meeting. See FDA organizational structure at fda.gov.',
          },
          {
            id: 'review_division_prior_interactions',
            label: 'Prior Interactions with This Review Division',
            type: 'textarea',
            placeholder: 'Describe any prior IND interactions, End-of-Phase 2 meetings, or other communications with this division...',
          },
        ],
        defaultNext: 'submission_planning',
        issueChecks: [
          {
            id: 'no_pre_nda_meeting',
            condition: { field: 'pre_nda_meeting_held', operator: 'eq', value: 'not_planned' },
            severity: 'warning',
            title: 'No Pre-NDA Meeting Planned',
            message:
              'A Pre-NDA meeting (Type B) is strongly recommended by FDA and widely considered best practice. This meeting provides an opportunity to discuss NDA format, content, statistical analysis strategy, and any outstanding FDA concerns before submission. Proceeding without a Pre-NDA meeting increases the risk of refuse-to-file actions or unexpected Complete Response Letters.',
            reference: 'FDA Guidance "Formal Meetings Between the FDA and Sponsors" (2017); FDA MAPP 4000.2',
          },
        ],
        provideExpertFeedback: true,
      },

      {
        id: 'submission_planning',
        section: 'Submission Timeline & Strategy',
        question:
          'Provide the NDA submission timeline and strategy details.',
        guidance:
          'NDA submission planning requires coordination across CMC, clinical, regulatory, labeling, and publishing teams. Per PDUFA VII timelines, FDA has 60 days from receipt to make a filing decision (21 CFR 314.101). The review clock starts from the filing date — 10 months for Standard Review, 6 months for Priority Review. Rolling submission (21 USC 356(b)(2)) is available only to Fast Track products and allows sequential module submission. The eCTD must be published per FDA Guidance "eCTD Specifications" (2023).',
        fields: [
          {
            id: 'target_submission_date',
            label: 'Target NDA Submission Date',
            type: 'date',
            required: true,
          },
          {
            id: 'rolling_submission',
            label: 'Rolling Submission Planned',
            type: 'yes_no',
            helpText: 'Rolling submission is available only with Fast Track designation per 21 USC 356(b)(2). Modules can be submitted as they are completed.',
          },
          {
            id: 'rolling_submission_schedule',
            label: 'Rolling Submission Schedule',
            type: 'textarea',
            visibleWhen: { field: 'rolling_submission', operator: 'eq', value: true },
            placeholder: 'e.g., Module 3 (CMC) — Q1 2026; Module 4 (Nonclinical) — Q2 2026; Module 5 (Clinical) — Q3 2026; Module 1 (Administrative) — Q4 2026',
          },
          {
            id: 'ectd_publishing_status',
            label: 'eCTD Publishing Status',
            type: 'select',
            required: true,
            options: [
              { value: 'complete', label: 'eCTD Publishing Complete — Ready for ESG Submission' },
              { value: 'in_progress', label: 'eCTD Publishing In Progress' },
              { value: 'not_started', label: 'eCTD Publishing Not Yet Started' },
            ],
          },
          {
            id: 'ectd_publishing_vendor',
            label: 'eCTD Publishing Vendor / Tool',
            type: 'text',
            placeholder: 'e.g., Lorenz DocuBridge, IQVIA RIMSmart, Veeva Vault RIM',
          },
          {
            id: 'submission_readiness_assessment',
            label: 'Submission Readiness Assessment Complete',
            type: 'yes_no',
            helpText: 'Best practice: conduct a formal submission readiness assessment 90-120 days before the target date to identify gaps across all CTD modules.',
          },
          {
            id: 'estimated_page_count',
            label: 'Estimated Total NDA Page Count',
            type: 'number',
            placeholder: 'e.g., 120000',
            validation: { min: 1000 },
            helpText: 'A typical NDA ranges from 50,000 to 200,000+ pages in eCTD format.',
          },
        ],
        defaultNext: 'review_management',
        issueChecks: [
          {
            id: 'rolling_without_fast_track_strategy',
            condition: { field: 'rolling_submission', operator: 'eq', value: true },
            severity: 'warning',
            title: 'Rolling Submission — Verify Fast Track Eligibility',
            message:
              'Rolling submission is a benefit of Fast Track designation only. Confirm that Fast Track designation has been granted before planning a rolling submission strategy. If Fast Track is not granted, the complete NDA must be submitted at once.',
            reference: '21 USC 356(b)(2)',
          },
        ],
      },

      {
        id: 'review_management',
        section: 'Submission Timeline & Strategy',
        question:
          'Finally, let\'s address FDA review management and anticipated post-submission activities.',
        guidance:
          'After NDA submission, the 60-day filing review period begins (21 CFR 314.101). If filed, the PDUFA action date is set (10 months standard, 6 months priority from filing date). During the review cycle, expect: mid-cycle communication (FDA may schedule), discipline review questions (clinical, CMC, pharm-tox, biostatistics), a pre-approval inspection (PAI), and a potential advisory committee meeting. The sponsor should maintain a "war room" team to respond to FDA questions within 24-48 hours. An FDA Complete Response Letter (CRL) is issued if the NDA cannot be approved as submitted.',
        fields: [
          {
            id: 'expected_pdufa_date',
            label: 'Expected PDUFA Action Date',
            type: 'date',
            helpText: 'Calculate: Filing date + 10 months (Standard) or + 6 months (Priority).',
          },
          {
            id: 'review_team_readiness',
            label: 'Review-Cycle Response Team in Place',
            type: 'yes_no',
            required: true,
            helpText: 'A cross-functional team (regulatory, clinical, CMC, biostatistics, labeling, safety) should be ready to respond to FDA questions during the review cycle.',
          },
          {
            id: 'anticipated_information_requests',
            label: 'Anticipated FDA Information Request Areas',
            type: 'multi_select',
            options: [
              { value: 'clinical_efficacy', label: 'Clinical Efficacy Questions' },
              { value: 'clinical_safety', label: 'Clinical Safety Questions' },
              { value: 'biostatistics', label: 'Biostatistics Questions' },
              { value: 'cmc', label: 'CMC / Quality Questions' },
              { value: 'labeling', label: 'Labeling Negotiations' },
              { value: 'clinical_pharm', label: 'Clinical Pharmacology' },
              { value: 'nonclinical', label: 'Nonclinical / Toxicology' },
              { value: 'rems', label: 'REMS Negotiations' },
            ],
          },
          {
            id: 'launch_readiness',
            label: 'Commercial Launch Readiness Activities',
            type: 'multi_select',
            options: [
              { value: 'manufacturing_scale', label: 'Commercial-Scale Manufacturing Validated' },
              { value: 'supply_chain', label: 'Supply Chain Established' },
              { value: 'sales_force', label: 'Sales Force Trained' },
              { value: 'distribution', label: 'Distribution Network Ready' },
              { value: 'payer_contracts', label: 'Payer / PBM Contracts Negotiated' },
              { value: 'medical_affairs', label: 'Medical Affairs / MSL Plan' },
              { value: 'patient_support', label: 'Patient Support / Hub Services Program' },
            ],
            helpText: 'Commercial readiness activities should be aligned with the expected PDUFA date — typically 6-12 months of lead time is needed.',
          },
          {
            id: 'crl_contingency',
            label: 'Complete Response Letter (CRL) Contingency Plan',
            type: 'yes_no',
            helpText: 'Best practice: prepare a CRL contingency plan outlining potential resubmission timelines and additional studies if FDA issues a CRL.',
          },
          {
            id: 'additional_notes',
            label: 'Additional Strategic Considerations',
            type: 'textarea',
            placeholder: 'Any additional considerations for the NDA submission strategy...',
          },
        ],
        defaultNext: null,
        provideExpertFeedback: true,
      },
    ],
  };
}
