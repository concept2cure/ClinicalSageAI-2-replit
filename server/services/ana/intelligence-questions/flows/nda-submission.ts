/**
 * NDA (New Drug Application) Submission flow definition for the
 * AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through a comprehensive NDA submission
 * questionnaire covering application overview, drug product information,
 * nonclinical pharmacology & toxicology, clinical pharmacology, clinical
 * efficacy, clinical safety, CTD module structure, labeling & REMS,
 * post-marketing commitments, and review & submission readiness.
 *
 * 23 nodes · 130+ fields · 10 sections · 20+ issue checks
 *
 * Regulatory framework: 21 CFR 314 (NDA regulations), ICH CTD (M4),
 * ICH efficacy guidelines (E1, E4, E9), ICH safety guidelines (S1–S5),
 * FDA Guidance documents for industry, PDUFA, PREA, FDAAA.
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
      'Comprehensive New Drug Application (NDA) submission questionnaire covering application type (505(b)(1)/505(b)(2)), drug product information, nonclinical pharmacology & toxicology, clinical pharmacology, efficacy, safety, CTD/eCTD structure, labeling & REMS, post-marketing commitments, and submission readiness for FDA marketing approval under 21 CFR 314.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'app_type',
    estimatedMinutes: 90,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'app_overview',
        label: 'Application Overview',
        nodeIds: ['app_type', 'sponsor_info'],
      },
      {
        id: 'drug_product_info',
        label: 'Drug Product Information',
        nodeIds: ['drug_description', 'formulation_dosage'],
      },
      {
        id: 'nonclinical',
        label: 'Nonclinical Pharmacology & Toxicology',
        nodeIds: ['nonclinical_overview', 'carcinogenicity_repro'],
      },
      {
        id: 'clinical_pharm',
        label: 'Clinical Pharmacology',
        nodeIds: ['pk_summary', 'ddi_assessment', 'special_pops_pk'],
      },
      {
        id: 'clinical_efficacy',
        label: 'Clinical Efficacy',
        nodeIds: ['efficacy_overview', 'pivotal_studies', 'endpoint_analysis'],
      },
      {
        id: 'clinical_safety',
        label: 'Clinical Safety',
        nodeIds: ['safety_database', 'adverse_events', 'deaths_serious_ae'],
      },
      {
        id: 'ctd_structure',
        label: 'CTD Module Structure',
        nodeIds: ['ctd_organization', 'ectd_submission'],
      },
      {
        id: 'labeling_rems',
        label: 'Labeling & REMS',
        nodeIds: ['labeling_content', 'rems_evaluation'],
      },
      {
        id: 'post_marketing',
        label: 'Post-Marketing Commitments',
        nodeIds: ['pmc_pme', 'pediatric_commitments'],
      },
      {
        id: 'review_submission',
        label: 'Review & Submission',
        nodeIds: ['submission_readiness', 'final_review'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Application Overview                                */
      /* ================================================================ */

      {
        id: 'app_type',
        section: 'app_overview',
        question:
          'Let\'s begin with the NDA application type. Is this a 505(b)(1) new molecular entity, a 505(b)(2) application relying on a listed drug, or a supplement to an existing NDA? The application pathway determines the evidentiary requirements.',
        guidance:
          'Per 21 CFR 314.50, an NDA must contain full reports of investigations showing the drug is safe and effective. A 505(b)(1) NDA (full NDA) requires the applicant to provide all safety and efficacy data. A 505(b)(2) NDA (21 CFR 314.54) permits reliance on FDA\'s previous findings of safety and/or effectiveness for a listed drug, reducing the need for de novo studies — but requires a right-of-reference or published literature. NDA supplements (21 CFR 314.70) cover changes to an approved NDA such as new indications, formulation changes, or labeling updates. Expedited programs (Priority Review, Accelerated Approval under 21 CFR 314.500, Fast Track, Breakthrough Therapy) affect review timelines and may impose additional post-marketing requirements.',
        fields: [
          {
            id: 'nda_type',
            label: 'NDA Application Type',
            type: 'select',
            required: true,
            options: [
              {
                value: '505b1',
                label: '505(b)(1) — Full NDA (New Molecular Entity)',
                description: 'Complete safety and efficacy data package; no reliance on listed drug findings',
              },
              {
                value: '505b2',
                label: '505(b)(2) — NDA with Listed Drug Reliance',
                description: 'Per 21 CFR 314.54, partial reliance on FDA\'s prior findings for a listed drug',
              },
              {
                value: 'supplement',
                label: 'NDA Supplement (sNDA)',
                description: '21 CFR 314.70 — change to an approved NDA (new indication, formulation, labeling)',
              },
            ],
            helpText:
              'The application type dictates the scope of data required. 505(b)(2) applicants must identify the listed drug and provide a bridge (e.g., bioequivalence or clinical study) per 21 CFR 314.54.',
          },
          {
            id: 'supplement_type',
            label: 'Supplement Type',
            type: 'select',
            visibleWhen: { field: 'nda_type', operator: 'eq', value: 'supplement' },
            options: [
              { value: 'new_indication', label: 'New Indication / Use' },
              { value: 'new_dosage_form', label: 'New Dosage Form or Route' },
              { value: 'new_strength', label: 'New Strength' },
              { value: 'labeling_change', label: 'Labeling Change' },
              { value: 'manufacturing_change', label: 'Manufacturing Change' },
              { value: 'efficacy_supplement', label: 'Efficacy Supplement' },
            ],
            helpText: 'Per 21 CFR 314.70, supplements are classified by the type and significance of the proposed change.',
          },
          {
            id: 'listed_drug_info',
            label: 'Listed Drug / Reference Listed Drug (RLD) Information',
            type: 'textarea',
            visibleWhen: { field: 'nda_type', operator: 'eq', value: '505b2' },
            placeholder:
              'e.g., Reference Listed Drug: Drugname Tablets (NDA 012345), Holder: Pharma Corp. Basis of reliance: safety data from approved RLD; new clinical efficacy study conducted for proposed indication.',
            helpText:
              'Per 21 CFR 314.54, 505(b)(2) applicants must identify the listed drug and describe the basis of reliance on FDA\'s previous findings. Paragraph IV patent certifications may be required per 21 CFR 314.50(i).',
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
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'endocrine', label: 'Endocrine / Metabolic' },
              { value: 'immunology', label: 'Immunology / Rheumatology' },
              { value: 'rare_disease', label: 'Rare Disease / Orphan' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'accelerated_pathway',
            label: 'Expedited Program Designations',
            type: 'multi_select',
            options: [
              {
                value: 'priority_review',
                label: 'Priority Review',
                description: 'PDUFA 6-month review target vs. standard 10-month',
              },
              {
                value: 'accelerated_approval',
                label: 'Accelerated Approval (21 CFR 314.500–314.560)',
                description: 'Approval based on surrogate endpoint; confirmatory study required',
              },
              {
                value: 'fast_track',
                label: 'Fast Track Designation',
                description: 'Serious condition with unmet need; rolling review eligible',
              },
              {
                value: 'breakthrough',
                label: 'Breakthrough Therapy Designation',
                description: 'Substantial improvement over existing therapies; intensive FDA guidance',
              },
            ],
            helpText:
              'Expedited programs affect review timelines and post-marketing obligations. Accelerated Approval (21 CFR 314.510) requires a confirmatory post-marketing study. Priority Review sets a 6-month PDUFA goal date.',
          },
          {
            id: 'application_number',
            label: 'Existing NDA Application Number',
            type: 'text',
            placeholder: 'e.g., NDA 214567',
            visibleWhen: { field: 'nda_type', operator: 'eq', value: 'supplement' },
            helpText: 'The approved NDA number for the supplement.',
          },
        ],
        branches: [
          {
            when: { field: 'nda_type', operator: 'eq', value: '505b2' },
            goto: 'sponsor_info',
          },
        ],
        defaultNext: 'sponsor_info',
      },

      {
        id: 'sponsor_info',
        section: 'app_overview',
        question:
          'Provide sponsor details. Per 21 CFR 314.50(a), the NDA must identify the applicant, responsible contact, and confirm PDUFA user fee payment.',
        guidance:
          'Per 21 CFR 314.50(a), the NDA cover letter must include the applicant name, address, NDA number (if supplement), and a responsible contact person. PDUFA user fees (21 CFR 314.50(l)) must be paid before FDA will file the application. The Prescription Drug User Fee Act (PDUFA) goal date establishes the FDA review timeline (10 months standard, 6 months priority review from the filing date, which is typically 60 days after receipt).',
        fields: [
          {
            id: 'sponsor_name',
            label: 'Sponsor / Applicant Name (Legal Entity)',
            type: 'text',
            placeholder: 'e.g., Acme Therapeutics, Inc.',
            required: true,
            helpText: 'Full legal entity name as it will appear on Form FDA 356h and the approval letter.',
          },
          {
            id: 'sponsor_address',
            label: 'Sponsor Address',
            type: 'textarea',
            placeholder: '123 Pharma Blvd, Suite 400, Cambridge, MA 02142',
            required: true,
          },
          {
            id: 'regulatory_contact',
            label: 'Regulatory Contact Person',
            type: 'text',
            placeholder: 'e.g., Jane Smith, VP Regulatory Affairs',
            required: true,
          },
          {
            id: 'contact_email',
            label: 'Contact Email',
            type: 'text',
            placeholder: 'e.g., regulatory@acmetherapeutics.com',
            required: true,
            validation: {
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
              patternMessage: 'Please enter a valid email address.',
            },
          },
          {
            id: 'contact_phone',
            label: 'Contact Phone',
            type: 'text',
            placeholder: 'e.g., (617) 555-0100',
          },
          {
            id: 'user_fee_paid',
            label: 'PDUFA User Fee Paid',
            type: 'yes_no',
            required: true,
            helpText:
              'Per PDUFA (21 USC 379h) and 21 CFR 314.50(l), the application fee must be paid at the time of NDA submission. FDA will not file an application without fee payment or a valid waiver/reduction.',
          },
          {
            id: 'pdufa_goal_date',
            label: 'PDUFA Goal Date (if known)',
            type: 'date',
            visibleWhen: { field: 'user_fee_paid', operator: 'eq', value: true },
            helpText:
              'The PDUFA goal date is set by FDA after filing (Day 60). Standard review: 10 months from receipt. Priority review: 6 months from receipt.',
          },
        ],
        defaultNext: 'drug_description',
        issueChecks: [
          {
            id: 'pdufa_fee_not_paid',
            condition: { field: 'user_fee_paid', operator: 'eq', value: false },
            severity: 'critical',
            title: 'PDUFA User Fee Required',
            message:
              'The Prescription Drug User Fee must be paid at the time of NDA submission. FDA will refuse to file the application without fee payment per 21 CFR 314.50(l) and 21 USC 379h. Fee waivers may be available for small businesses or orphan products under certain conditions.',
            reference: '21 CFR 314.50(l); PDUFA (21 USC 379h)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 2 — Drug Product Information                            */
      /* ================================================================ */

      {
        id: 'drug_description',
        section: 'drug_product_info',
        question:
          'Provide detailed drug product information. Per 21 CFR 314.50(d)(1), the NDA must contain a full description of the drug substance, its mechanism of action, dosage form, route, and all proposed strengths.',
        guidance:
          'Per 21 CFR 314.50(d)(1), the NDA must include a full description of the drug including: chemical name and structure, established (generic) name, proposed brand name, mechanism of action, dosage form, route of administration, and all strengths for which approval is sought. For 505(b)(2) applications, therapeutic equivalence rating (per the Orange Book) relative to the reference listed drug must be addressed. The drug substance should be fully characterized at the NDA stage including polymorphism, chirality, and impurity profile.',
        fields: [
          {
            id: 'generic_name',
            label: 'Generic Name (INN/USAN)',
            type: 'text',
            placeholder: 'e.g., acmetinib',
            required: true,
            helpText: 'International Nonproprietary Name (INN) or United States Adopted Name (USAN). This must be assigned before NDA approval.',
          },
          {
            id: 'proposed_brand_name',
            label: 'Proposed Brand (Trade) Name',
            type: 'text',
            placeholder: 'e.g., Acmexor',
            helpText:
              'FDA\'s Division of Medication Error Prevention and Analysis (DMEPA) reviews proposed proprietary names for potential medication errors. Submit early for review.',
          },
          {
            id: 'active_ingredient',
            label: 'Active Ingredient Description',
            type: 'textarea',
            placeholder:
              'e.g., Acmetinib hydrochloride, a selective tyrosine kinase inhibitor targeting EGFR exon 20 insertions. Molecular formula: C25H28ClFN4O3·HCl, MW = 527.4. White to off-white crystalline powder.',
            required: true,
            validation: { minLength: 30 },
          },
          {
            id: 'molecular_target',
            label: 'Molecular Target',
            type: 'text',
            placeholder: 'e.g., EGFR (epidermal growth factor receptor) with selectivity for exon 20 insertion mutations',
          },
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action',
            type: 'textarea',
            placeholder:
              'e.g., Acmetinib selectively and irreversibly inhibits EGFR with exon 20 insertion mutations (IC50 = 5 nM), blocking downstream RAS/RAF/MEK/ERK and PI3K/AKT signaling. >100-fold selectivity over wild-type EGFR minimizes on-target toxicity.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'injection', label: 'Solution for Injection' },
              { value: 'infusion', label: 'Solution for Infusion' },
              { value: 'topical', label: 'Topical (Cream/Ointment/Gel)' },
              { value: 'inhaled', label: 'Inhaled (Powder/Solution)' },
              { value: 'patch', label: 'Transdermal Patch' },
              { value: 'other', label: 'Other' },
            ],
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
              { value: 'intrathecal', label: 'Intrathecal' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'strengths',
            label: 'Proposed Strength(s)',
            type: 'text',
            placeholder: 'e.g., 25 mg, 50 mg, 100 mg film-coated tablets',
            required: true,
            helpText: 'List all strengths for which approval is sought. Each strength requires separate bioequivalence or clinical justification.',
          },
          {
            id: 'therapeutic_equivalence',
            label: 'Therapeutic Equivalence Rating (Orange Book)',
            type: 'select',
            visibleWhen: { field: 'nda_type', operator: 'eq', value: '505b2' },
            options: [
              {
                value: 'AB',
                label: 'AB — Therapeutically Equivalent (meets bioequivalence)',
                description: 'Substitutable at the pharmacy level',
              },
              {
                value: 'BX',
                label: 'BX — Not Therapeutically Equivalent (insufficient data)',
                description: 'Not substitutable; may need additional studies',
              },
              {
                value: 'not_determined',
                label: 'Not Yet Determined',
                description: 'TE evaluation pending FDA assessment',
              },
            ],
            helpText:
              'Per the Orange Book (Approved Drug Products with Therapeutic Equivalence Evaluations), 505(b)(2) products may receive an AB rating if bioequivalence to the RLD is demonstrated.',
          },
        ],
        defaultNext: 'formulation_dosage',
        provideExpertFeedback: true,
      },

      {
        id: 'formulation_dosage',
        section: 'drug_product_info',
        question:
          'Provide detailed CMC information: quantitative composition, manufacturing, specifications, and stability data for the drug product.',
        guidance:
          'Per 21 CFR 314.50(d)(1) and ICH M4Q (CTD Module 3 — Quality), the NDA must include comprehensive CMC data including quantitative composition, excipient justification, manufacturing process description, batch analysis data, specifications, and stability. At the NDA stage, full ICH Q1A(R2) stability data (typically 12-24 months long-term and 6 months accelerated) is expected. Manufacturing sites must be identified and compliant with cGMP (21 CFR Parts 210/211). Container closure system suitability must be demonstrated.',
        fields: [
          {
            id: 'quantitative_composition',
            label: 'Quantitative Composition (per dosage unit)',
            type: 'textarea',
            placeholder:
              'e.g., Acmetinib HCl: 50 mg (equivalent to 42 mg free base)\nMicrocrystalline cellulose: 120 mg\nCroscarmellose sodium: 15 mg\nMagnesium stearate: 2 mg\nFilm coat (Opadry II): 6 mg\nTotal tablet weight: 193 mg',
            required: true,
          },
          {
            id: 'excipient_safety',
            label: 'All excipients listed in FDA Inactive Ingredients Guide (IIG) for proposed route and dose?',
            type: 'yes_no',
            required: true,
            helpText:
              'Novel excipients (not in the FDA IIG database) require separate safety justification and may trigger additional nonclinical studies or a Type IV DMF.',
          },
          {
            id: 'manufacturing_sites',
            label: 'Manufacturing Site(s) — Drug Substance and Drug Product',
            type: 'textarea',
            placeholder:
              'e.g., Drug Substance: Lonza AG, Basel, Switzerland (FDA EIR 2024)\nDrug Product: Patheon, Cincinnati, OH (FDA EIR 2025)\nPackaging: Anderson Packaging, Rockford, IL',
            required: true,
            helpText:
              'All manufacturing, testing, and packaging sites must be listed. FDA may conduct pre-approval inspections (PAI) per 21 CFR 211.',
          },
          {
            id: 'batch_analysis',
            label: 'Batch Analysis Summary (pivotal/commercial scale)',
            type: 'textarea',
            placeholder:
              'e.g., Three pivotal-scale batches (Batch 001, 002, 003) manufactured at proposed commercial site. All batches met specifications for assay (99.2-100.1%), related substances (total <0.5%), dissolution (Q=85% at 30 min), content uniformity (AV <5.0), and microbial limits.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'specifications_summary',
            label: 'Proposed Commercial Specifications Summary',
            type: 'textarea',
            placeholder:
              'e.g., Appearance, identification (HPLC RT, IR), assay (98.0-102.0%), related substances (individual ≤0.3%, total ≤1.0%), dissolution (Q=80% at 30 min, USP Apparatus II), content uniformity (USP <905>), water content (≤0.5%), microbial limits (USP <61>/<62>).',
            required: true,
          },
          {
            id: 'stability_data_duration',
            label: 'Long-Term Stability Data Available',
            type: 'select',
            required: true,
            options: [
              { value: '6mo', label: '6 months', flagsIssue: true },
              { value: '12mo', label: '12 months' },
              { value: '18mo', label: '18 months' },
              { value: '24mo', label: '24 months' },
              { value: '36mo', label: '36 months or more' },
            ],
            helpText:
              'Per ICH Q1A(R2), NDA stability data should include at least 12 months long-term (25°C/60% RH) and 6 months accelerated (40°C/75% RH) data at the time of submission. Proposed shelf life should not exceed twice the long-term data period or the accelerated data period, whichever is shorter.',
          },
          {
            id: 'container_closure',
            label: 'Container Closure System Description',
            type: 'textarea',
            placeholder:
              'e.g., 30-count HDPE bottle with polypropylene child-resistant cap and induction seal. Desiccant canister included. Extractables/leachables (E&L) study completed per USP <1663>/<1664>.',
            required: true,
          },
          {
            id: 'controlled_substance',
            label: 'Is the drug product a controlled substance under the Controlled Substances Act?',
            type: 'yes_no',
            helpText:
              'If yes, DEA scheduling is required before marketing. The scheduling recommendation is included in the NDA review and coordinated between FDA and DEA (21 USC 811-812).',
          },
        ],
        defaultNext: 'nonclinical_overview',
        issueChecks: [
          {
            id: 'limited_stability_data',
            condition: { field: 'stability_data_duration', operator: 'eq', value: '6mo' },
            severity: 'warning',
            title: 'Limited Stability Data',
            message:
              'Only 6 months of long-term stability data may be insufficient to support the proposed shelf life at NDA submission. Per ICH Q1A(R2), the proposed shelf life should be supported by data from at least 12 months of long-term stability testing. FDA may issue a Refuse to File if stability data are inadequate.',
            reference: 'ICH Q1A(R2); 21 CFR 314.50(d)(1)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 3 — Nonclinical Pharmacology & Toxicology               */
      /* ================================================================ */

      {
        id: 'nonclinical_overview',
        section: 'nonclinical',
        question:
          'Provide a summary of the nonclinical pharmacology and toxicology program supporting this NDA. At the NDA stage, the complete nonclinical package per ICH M3(R2) should be available.',
        guidance:
          'Per ICH M3(R2) "Nonclinical Safety Studies for the Conduct of Human Clinical Trials and Marketing Authorization" and 21 CFR 314.50(d)(2), the NDA must include full reports of all nonclinical studies. The nonclinical overview (CTD Module 2.4) should integrate pharmacology (primary, secondary, safety), pharmacokinetics (ADME), and toxicology (single-dose, repeat-dose, genotoxicity, carcinogenicity, reproductive toxicology, and special toxicology). Per ICH S7A/S7B, safety pharmacology (cardiovascular, CNS, respiratory) must be complete. The Module 2.4 Nonclinical Overview and Module 2.6 Nonclinical Written and Tabulated Summaries should follow ICH M4S format.',
        fields: [
          {
            id: 'pharmacology_summary',
            label: 'Nonclinical Pharmacology Summary (primary and secondary)',
            type: 'textarea',
            placeholder:
              'e.g., Primary pharmacodynamics: selective EGFR exon 20 insertion inhibitor (IC50 = 5 nM). In vivo efficacy demonstrated in PDX models with >80% TGI at 30 mg/kg QD. Secondary pharmacodynamics: selectivity panel (60+ kinases) showed no significant off-target activity at 10 uM. No CNS penetration (brain/plasma ratio <0.05).',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'species_studied',
            label: 'Species Used in Nonclinical Program',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'mouse', label: 'Mouse' },
              { value: 'rat', label: 'Rat' },
              { value: 'rabbit', label: 'Rabbit' },
              { value: 'dog', label: 'Dog' },
              { value: 'monkey', label: 'Cynomolgus Monkey' },
              { value: 'minipig', label: 'Minipig' },
            ],
            helpText:
              'Per ICH M3(R2), toxicology studies must be conducted in at least two species (one rodent, one non-rodent) for small molecules. For biologics (ICH S6(R1)), one pharmacologically relevant species may suffice.',
          },
          {
            id: 'pivotal_tox_studies',
            label: 'Pivotal Toxicology Studies Summary',
            type: 'textarea',
            placeholder:
              'e.g., 28-day GLP rat study (NOAEL 100 mg/kg/day), 28-day GLP dog study (NOAEL 30 mg/kg/day), 26-week GLP rat study (NOAEL 60 mg/kg/day), 39-week GLP dog study (NOAEL 15 mg/kg/day). Target organ toxicities: liver (reversible ALT elevation in dog at ≥60 mg/kg), GI (emesis in dog at ≥30 mg/kg). All findings reversible within 4-week recovery period.',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'noael_summary',
            label: 'NOAEL Summary (most sensitive species)',
            type: 'text',
            placeholder: 'e.g., NOAEL: 15 mg/kg/day (dog, 39-week study); exposure margin at MRHD: 3.2x (based on AUC)',
            required: true,
          },
          {
            id: 'safety_pharmacology',
            label: 'ICH S7A Core Battery Safety Pharmacology Completed (CV, CNS, Respiratory)',
            type: 'yes_no',
            required: true,
            helpText:
              'ICH S7A core battery covers cardiovascular (including hERG per S7B), central nervous system (Irwin/FOB), and respiratory (plethysmography) endpoints. These must be complete for the NDA.',
          },
          {
            id: 'genetic_tox_battery',
            label: 'ICH S2(R1) Genetic Toxicology Battery Completed',
            type: 'yes_no',
            required: true,
            helpText:
              'Standard battery: (1) bacterial reverse mutation (Ames test), (2) in vitro chromosomal aberration or micronucleus assay, (3) in vivo micronucleus or equivalent. All three tests must be negative for a clean genotoxicity profile.',
          },
          {
            id: 'has_target_organ_tox',
            label: 'Were target organ toxicities identified in nonclinical studies?',
            type: 'yes_no',
          },
          {
            id: 'target_organs',
            label: 'Target Organ Toxicity Description',
            type: 'textarea',
            placeholder:
              'e.g., Liver: reversible ALT/AST elevation at ≥60 mg/kg in dog (exposure margin 1.5x at MRHD). Kidney: tubular basophilia in rat at ≥200 mg/kg (exposure margin 8x). All findings were reversible after a 4-week recovery period.',
            visibleWhen: { field: 'has_target_organ_tox', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'carcinogenicity_repro',
        issueChecks: [
          {
            id: 'genotox_battery_required',
            condition: { field: 'genetic_tox_battery', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Genotoxicity Battery Required',
            message:
              'The complete ICH S2(R1) genotoxicity battery must be completed before NDA submission. Missing genotoxicity data is a major deficiency that will result in a Refuse to File or Complete Response Letter. The standard battery includes Ames test, in vitro chromosomal aberration or micronucleus, and in vivo micronucleus assay.',
            reference: 'ICH S2(R1); ICH M3(R2); 21 CFR 314.50(d)(2)',
          },
        ],
      },

      {
        id: 'carcinogenicity_repro',
        section: 'nonclinical',
        question:
          'Describe the carcinogenicity and reproductive toxicology studies. These are critical for NDA labeling and risk assessment.',
        guidance:
          'Per ICH S1A/S1B, carcinogenicity studies are required for drugs intended for chronic use (≥6 months continuous or intermittent for chronic/recurrent conditions). ICH S1B(R1) allows alternatives to the traditional 2-year rat bioassay (e.g., p53+/- transgenic mouse model or rasH2 model). Per ICH S5(R3), the complete reproductive toxicology battery (fertility and early embryonic development, embryo-fetal development, pre- and postnatal development) must be completed before NDA submission. Teratogenicity signals have direct implications for REMS evaluation, Pregnancy Category assignment (now under PLLR framework per 21 CFR 201.57(c)(9)), and boxed warning consideration.',
        fields: [
          {
            id: 'carcinogenicity_status',
            label: 'Carcinogenicity Study Status',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Completed — 2-year rodent and/or transgenic mouse model' },
              { value: 'ongoing', label: 'Ongoing — data expected before approval' },
              { value: 'waived', label: 'Waived — with scientific justification to FDA' },
              { value: 'planned', label: 'Planned — post-marketing commitment' },
            ],
          },
          {
            id: 'carcinogenicity_findings',
            label: 'Carcinogenicity Study Findings',
            type: 'textarea',
            placeholder:
              'e.g., 2-year rat study: no carcinogenicity signal at doses up to 100 mg/kg/day (exposure margin 5x MRHD). 26-week rasH2 transgenic mouse study: negative at all dose levels tested.',
            visibleWhen: { field: 'carcinogenicity_status', operator: 'eq', value: 'completed' },
          },
          {
            id: 'repro_tox_status',
            label: 'Reproductive Toxicology Program Status',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Completed — all ICH S5(R3) segments' },
              { value: 'ongoing', label: 'Ongoing — some segments still in progress' },
              { value: 'planned', label: 'Planned — not yet initiated' },
            ],
          },
          {
            id: 'repro_tox_segments',
            label: 'Reproductive Toxicology Segments Completed',
            type: 'multi_select',
            visibleWhen: { field: 'repro_tox_status', operator: 'in', value: ['completed', 'ongoing'] },
            options: [
              { value: 'fertility', label: 'Segment I — Fertility and Early Embryonic Development' },
              { value: 'efd', label: 'Segment II — Embryo-Fetal Development (EFD)' },
              { value: 'pre_postnatal', label: 'Segment III — Pre- and Postnatal Development (PPND)' },
            ],
          },
          {
            id: 'teratogenicity_signal',
            label: 'Was a teratogenicity signal identified in reproductive toxicology studies?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pregnancy_category_proposed',
            label: 'Proposed Pregnancy/Lactation Labeling (PLLR)',
            type: 'select',
            options: [
              {
                value: 'contraindicated',
                label: 'Contraindicated in Pregnancy',
                description: 'Teratogenicity demonstrated; pregnancy test and contraception required',
              },
              {
                value: 'caution',
                label: 'Use with Caution — Risk Cannot Be Ruled Out',
                description: 'Insufficient human data; animal data concerning',
              },
              {
                value: 'no_data',
                label: 'No Adequate Data in Pregnant Women',
                description: 'Animal reproduction studies conducted; results described in labeling',
              },
            ],
            helpText:
              'The PLLR framework (21 CFR 201.57(c)(9)) replaced pregnancy categories (A, B, C, D, X) with descriptive labeling including risk summary, clinical considerations, and supporting data.',
          },
          {
            id: 'juvenile_animal_studies',
            label: 'Juvenile Animal Studies',
            type: 'select',
            options: [
              { value: 'completed', label: 'Completed' },
              { value: 'planned', label: 'Planned (post-marketing or PREA commitment)' },
              { value: 'not_needed', label: 'Not Needed (adult-only indication)' },
              { value: 'waived', label: 'Waived (with justification)' },
            ],
            helpText:
              'Per FDA Guidance "Nonclinical Safety Evaluation of Pediatric Drug Products" (2006) and ICH S11, juvenile animal studies are needed when pediatric use is anticipated and developing organ systems may be uniquely affected.',
          },
        ],
        defaultNext: 'pk_summary',
        provideExpertFeedback: true,
        issueChecks: [
          {
            id: 'teratogenicity_rems_needed',
            condition: { field: 'teratogenicity_signal', operator: 'eq', value: true },
            severity: 'critical',
            title: 'Teratogenicity Signal Requires REMS Evaluation',
            message:
              'A teratogenicity signal in reproductive toxicology studies requires evaluation for a REMS with Elements to Assure Safe Use (ETASU) such as pregnancy testing, contraception requirements, and restricted distribution programs (see thalidomide/lenalidomide REMS precedents). Pregnancy must be listed as a contraindication in labeling, and a Medication Guide is likely required.',
            reference: '21 CFR 314.50; 21 USC 355-1; 21 CFR 201.57(c)(9)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 4 — Clinical Pharmacology                               */
      /* ================================================================ */

      {
        id: 'pk_summary',
        section: 'clinical_pharm',
        question:
          'Summarize the clinical pharmacology program. Describe the human PK profile, ADME characterization, dose-response relationships, and PK/PD modeling.',
        guidance:
          'Per 21 CFR 314.50(d)(3) and ICH E4 "Dose Response Information to Support Drug Registration," the NDA must include a thorough characterization of the drug\'s clinical pharmacology. The Clinical Pharmacology and Biopharmaceutics (CP&B) section should cover: human ADME, absolute and/or relative bioavailability, dose proportionality, food effect, PK in target population, exposure-response (E-R) analysis, population PK (popPK) modeling, and PBPK modeling if applicable. The exposure-response analysis should link drug exposure (AUC, Cmax, Ctrough) to both efficacy and safety endpoints to support the proposed dosing regimen.',
        fields: [
          {
            id: 'human_pk_summary',
            label: 'Human PK Summary (ADME characterization)',
            type: 'textarea',
            placeholder:
              'e.g., Absorption: rapidly absorbed (Tmax = 2-3 hr), absolute bioavailability = 62%. Distribution: Vd = 85 L, protein binding 97% (primarily albumin). Metabolism: primarily CYP3A4 (78%), minor CYP2D6 (12%). Excretion: 65% fecal (30% unchanged), 25% renal (10% unchanged). Mass balance study completed with [14C]-labeled compound.',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'bioavailability',
            label: 'Bioavailability (absolute or relative)',
            type: 'text',
            placeholder: 'e.g., Absolute bioavailability: 62% (90% CI: 55-69%)',
          },
          {
            id: 'half_life',
            label: 'Terminal Elimination Half-Life',
            type: 'text',
            placeholder: 'e.g., t1/2 = 14.5 hours (range: 10-22 hr), supporting once-daily dosing',
            required: true,
          },
          {
            id: 'dose_proportionality',
            label: 'Dose Proportionality',
            type: 'select',
            options: [
              { value: 'linear', label: 'Linear / Dose-Proportional PK' },
              { value: 'non_linear', label: 'Non-Linear PK (saturation, autoinduction, or capacity-limited)' },
              { value: 'partially_linear', label: 'Partially Linear (linear within therapeutic range, non-linear at higher doses)' },
            ],
            helpText:
              'Dose proportionality assessment is critical for justifying the proposed dose range and any dose adjustment recommendations in labeling.',
          },
          {
            id: 'food_effect',
            label: 'Food Effect Study Results',
            type: 'select',
            options: [
              { value: 'no_effect', label: 'No Clinically Meaningful Food Effect' },
              { value: 'increased_exposure', label: 'Increased Exposure with Food (high-fat meal)' },
              { value: 'decreased_exposure', label: 'Decreased Exposure with Food' },
              { value: 'not_studied', label: 'Not Studied (parenteral product)' },
            ],
            helpText:
              'Per FDA Guidance "Food-Effect Bioavailability and Fed Bioequivalence Studies" (2022), food effect determines the dosing instructions in labeling (take with/without food, etc.).',
          },
          {
            id: 'accumulation_ratio',
            label: 'Accumulation Ratio at Steady State',
            type: 'text',
            placeholder: 'e.g., AUC accumulation ratio = 1.8 at steady state (Day 15) with QD dosing',
          },
          {
            id: 'pk_in_target_population',
            label: 'PK in Target Patient Population',
            type: 'textarea',
            placeholder:
              'e.g., Population PK analysis in cancer patients (N=450) showed no clinically significant differences in CL/F compared to healthy volunteers after adjusting for body weight and albumin.',
          },
          {
            id: 'pk_pd_relationship',
            label: 'PK/PD and Exposure-Response Analysis',
            type: 'textarea',
            placeholder:
              'e.g., Exposure-response analysis: AUCss correlated with ORR (p<0.001). E-R modeling supports 100 mg QD as the dose achieving ≥90% target coverage in >95% of patients. Exposure-safety: higher Cmax associated with increased Grade ≥3 rash (logistic regression, p=0.02).',
            required: true,
            validation: { minLength: 50 },
            helpText:
              'Per FDA Guidance "Exposure-Response Relationships — Study Design, Data Analysis, and Regulatory Applications" (2003) and ICH E4, E-R analysis should be provided to support dose selection and labeling recommendations.',
          },
          {
            id: 'popPK_model',
            label: 'Population PK (popPK) or PBPK Model Developed',
            type: 'yes_no',
            helpText:
              'PopPK and PBPK models are increasingly expected by FDA to support dosing in special populations, predict drug interactions, and justify dose modifications. FDA Guidances on PBPK Analysis (2018/2020) provide framework.',
          },
        ],
        defaultNext: 'ddi_assessment',
      },

      {
        id: 'ddi_assessment',
        section: 'clinical_pharm',
        question:
          'Describe the drug-drug interaction (DDI) assessment. Both in vitro and clinical DDI studies should be complete for the NDA.',
        guidance:
          'Per FDA Guidance "In Vitro Drug Interaction Studies — Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions" (January 2020) and "Clinical Drug Interaction Studies" (January 2020), the NDA must include a comprehensive DDI assessment. In vitro: CYP reaction phenotyping (substrate identification), CYP inhibition (reversible and TDI), CYP induction (PXR/CAR activation and mRNA), and transporter interactions (P-gp, BCRP, OATP1B1/1B3, OCT2, OAT1/3, MATE1/2-K). Clinical DDI studies should follow the FDA DDI Decision Trees (Figures 1-7 of the 2020 guidance). Results directly impact labeling (contraindications, dose adjustments, interaction tables).',
        fields: [
          {
            id: 'cyp_substrate',
            label: 'CYP Enzyme(s) — Drug is a Substrate of',
            type: 'multi_select',
            options: [
              { value: '3A4', label: 'CYP3A4' },
              { value: '2D6', label: 'CYP2D6' },
              { value: '2C9', label: 'CYP2C9' },
              { value: '2C19', label: 'CYP2C19' },
              { value: '2C8', label: 'CYP2C8' },
              { value: '1A2', label: 'CYP1A2' },
              { value: '2B6', label: 'CYP2B6' },
            ],
          },
          {
            id: 'cyp_inhibitor',
            label: 'CYP Enzyme(s) — Drug is an Inhibitor of',
            type: 'multi_select',
            options: [
              { value: '3A4', label: 'CYP3A4' },
              { value: '2D6', label: 'CYP2D6' },
              { value: '2C9', label: 'CYP2C9' },
              { value: '2C19', label: 'CYP2C19' },
              { value: '2C8', label: 'CYP2C8' },
              { value: '1A2', label: 'CYP1A2' },
              { value: '2B6', label: 'CYP2B6' },
            ],
          },
          {
            id: 'cyp_inducer',
            label: 'CYP Enzyme(s) — Drug is an Inducer of',
            type: 'multi_select',
            options: [
              { value: '3A4', label: 'CYP3A4' },
              { value: '2D6', label: 'CYP2D6' },
              { value: '2C9', label: 'CYP2C9' },
              { value: '2C19', label: 'CYP2C19' },
              { value: '2C8', label: 'CYP2C8' },
              { value: '1A2', label: 'CYP1A2' },
              { value: '2B6', label: 'CYP2B6' },
            ],
          },
          {
            id: 'transporter_substrate',
            label: 'Transporter Interactions — Drug is a Substrate/Inhibitor of',
            type: 'multi_select',
            options: [
              { value: 'pgp', label: 'P-glycoprotein (P-gp / MDR1)' },
              { value: 'bcrp', label: 'BCRP' },
              { value: 'oatp1b1', label: 'OATP1B1' },
              { value: 'oatp1b3', label: 'OATP1B3' },
              { value: 'oct2', label: 'OCT2' },
              { value: 'oat1', label: 'OAT1' },
              { value: 'oat3', label: 'OAT3' },
              { value: 'mate1', label: 'MATE1' },
            ],
          },
          {
            id: 'clinical_ddi_completed',
            label: 'Clinical DDI Studies Completed',
            type: 'yes_no',
            required: true,
            helpText:
              'At the NDA stage, all clinical DDI studies triggered by in vitro results should be completed. These results are incorporated into the Drug Interactions section (Section 7) of labeling per 21 CFR 201.57.',
          },
          {
            id: 'clinical_ddi_summary',
            label: 'Clinical DDI Study Results Summary',
            type: 'textarea',
            placeholder:
              'e.g., Strong CYP3A4 inhibitor (itraconazole): 3.5-fold increase in AUC — dose reduction required. Strong CYP3A4 inducer (rifampin): 78% decrease in AUC — co-administration contraindicated. CYP2D6 inhibition: no clinically significant effect on dextromethorphan PK. P-gp inhibition: 1.6-fold increase in digoxin AUC — monitoring recommended.',
            visibleWhen: { field: 'clinical_ddi_completed', operator: 'eq', value: true },
          },
          {
            id: 'ddi_labeling_impact',
            label: 'DDI Impact on Labeling (dose adjustments, contraindications)',
            type: 'textarea',
            placeholder:
              'e.g., Contraindicated with strong CYP3A4 inducers. Dose reduction to 50 mg with strong CYP3A4 inhibitors. Avoid concomitant use with sensitive CYP3A4 substrates with narrow therapeutic index. Monitor digoxin levels with co-administration.',
          },
        ],
        defaultNext: 'special_pops_pk',
        issueChecks: [
          {
            id: 'clinical_ddi_not_completed',
            condition: { field: 'clinical_ddi_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Clinical DDI Studies Expected',
            message:
              'Clinical drug-drug interaction studies should be completed before NDA submission. Missing DDI data may result in labeling limitations, post-marketing requirements, or a Complete Response Letter. Per the FDA DDI Guidance (2020), clinical studies are required when in vitro results indicate potential for clinically relevant interactions.',
            reference: 'FDA Guidance: Clinical Drug Interaction Studies (January 2020); FDA Guidance: In Vitro Drug Interaction Studies (January 2020)',
          },
        ],
      },

      {
        id: 'special_pops_pk',
        section: 'clinical_pharm',
        question:
          'Describe the PK assessments in special populations: renal impairment, hepatic impairment, geriatric patients, and other intrinsic factors.',
        guidance:
          'Per FDA Guidance "Pharmacokinetics in Patients with Impaired Renal Function" (2020) and "Pharmacokinetics in Patients with Impaired Hepatic Function" (2003), dedicated PK studies are generally required for drugs with significant renal or hepatic clearance. Geriatric PK assessment is expected per ICH E7. Analysis by sex, race/ethnicity, and body weight should be included per the ICH E5 framework and FDA Guidance on Collection of Race and Ethnicity Data in Clinical Trials (2016). These data directly inform the Use in Specific Populations section of labeling (21 CFR 201.57(c)(9)).',
        fields: [
          {
            id: 'renal_impairment_study',
            label: 'Renal Impairment Study',
            type: 'select',
            options: [
              { value: 'completed', label: 'Dedicated PK Study Completed (mild/moderate/severe/ESRD)' },
              { value: 'planned', label: 'Planned Before Approval' },
              { value: 'not_needed', label: 'Not Needed — Minimal Renal Elimination (<30%)' },
              { value: 'pop_pk', label: 'Assessed via Population PK Analysis' },
            ],
          },
          {
            id: 'hepatic_impairment_study',
            label: 'Hepatic Impairment Study',
            type: 'select',
            options: [
              { value: 'completed', label: 'Dedicated PK Study Completed (Child-Pugh A/B/C)' },
              { value: 'planned', label: 'Planned Before Approval' },
              { value: 'not_needed', label: 'Not Needed — Minimal Hepatic Metabolism' },
              { value: 'pop_pk', label: 'Assessed via Population PK Analysis' },
            ],
          },
          {
            id: 'geriatric_pk',
            label: 'Geriatric PK Assessment',
            type: 'select',
            options: [
              { value: 'adequate_data', label: 'Adequate Data from Clinical Trials and/or PopPK' },
              { value: 'planned', label: 'Additional Assessment Planned' },
              { value: 'not_needed', label: 'Not Needed (pediatric-only indication)' },
            ],
            helpText:
              'Per ICH E7, clinical trials should include adequate representation of patients ≥65 years. PopPK analysis should evaluate age as a covariate.',
          },
          {
            id: 'sex_based_analysis',
            label: 'Sex-Based PK/PD Analysis Completed',
            type: 'yes_no',
            helpText:
              'Per FDA Guidance and ICH E1/E7, sponsors should analyze PK and safety data by sex. Any sex-based differences should be reflected in labeling.',
          },
          {
            id: 'race_ethnicity_analysis',
            label: 'Race/Ethnicity PK Analysis Completed',
            type: 'yes_no',
            helpText:
              'Per ICH E5 and FDA Guidance on Collection of Race and Ethnicity Data (2016), ethnic factors that may influence drug response should be evaluated. Consider CYP2D6/2C19 polymorphism prevalence across populations.',
          },
          {
            id: 'body_weight_effect',
            label: 'Body Weight Effect on PK',
            type: 'select',
            options: [
              { value: 'no_effect', label: 'No Clinically Meaningful Effect' },
              { value: 'dose_adjust', label: 'Dose Adjustment Recommended by Body Weight' },
              { value: 'not_studied', label: 'Not Studied / Under Evaluation' },
            ],
          },
        ],
        defaultNext: 'efficacy_overview',
      },

      /* ================================================================ */
      /*  Section 5 — Clinical Efficacy                                   */
      /* ================================================================ */

      {
        id: 'efficacy_overview',
        section: 'clinical_efficacy',
        question:
          'Provide an overview of the clinical efficacy program. How many studies were conducted, what phases are complete, and what is the proposed indication?',
        guidance:
          'Per 21 CFR 314.50(d)(5) and ICH E9 "Statistical Principles for Clinical Trials," the NDA must contain adequate and well-controlled clinical investigations (as defined in 21 CFR 314.126) demonstrating the drug is effective for the proposed indication. FDA generally expects substantial evidence from at least one adequate and well-controlled Phase 3 study (two is preferred for most indications). For oncology, FDA may accept a single pivotal trial with compelling results. Surrogate endpoints may support Accelerated Approval (21 CFR 314.510) but require confirmatory studies. The clinical overview (CTD Module 2.5) and clinical summary (CTD Module 2.7) should integrate all efficacy data per ICH M4E.',
        fields: [
          {
            id: 'total_efficacy_studies',
            label: 'Total Number of Efficacy Studies in the NDA',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText: 'Include all clinical studies contributing to the efficacy assessment, from Phase 1 (dose-finding/PK) through pivotal Phase 3.',
          },
          {
            id: 'study_phases_completed',
            label: 'Study Phases Completed',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'phase1', label: 'Phase 1 (PK/safety/dose-finding)' },
              { value: 'phase2', label: 'Phase 2 (proof-of-concept/dose-ranging)' },
              { value: 'phase3', label: 'Phase 3 (pivotal confirmatory)' },
            ],
          },
          {
            id: 'pivotal_study_count',
            label: 'Number of Pivotal Studies',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText:
              'FDA generally expects two adequate and well-controlled studies, though a single pivotal study may suffice with strong evidence (large effect size, high statistical significance, consistency across subgroups) per FDA Guidance "Providing Clinical Evidence of Effectiveness for Human Drug and Biological Products" (1998).',
          },
          {
            id: 'indication_statement',
            label: 'Proposed Indication Statement',
            type: 'textarea',
            placeholder:
              'e.g., Acmetinib is indicated for the treatment of adult patients with locally advanced or metastatic non-small cell lung cancer (NSCLC) with epidermal growth factor receptor (EGFR) exon 20 insertion mutations, as detected by an FDA-approved test, who have progressed on or after platinum-based chemotherapy.',
            required: true,
            validation: { minLength: 50 },
            helpText:
              'The indication statement should be specific and mirror the language in the proposed USPI Indications and Usage section per 21 CFR 201.57(c)(2).',
          },
          {
            id: 'is_oncology',
            label: 'Is this an oncology indication?',
            type: 'yes_no',
            helpText:
              'Oncology NDAs are reviewed by CDER\'s Office of Oncologic Diseases and may have different endpoint requirements (e.g., ORR, PFS, OS per FDA oncology guidance documents).',
          },
          {
            id: 'oncology_tumor_type',
            label: 'Oncology Tumor Type',
            type: 'select',
            visibleWhen: { field: 'is_oncology', operator: 'eq', value: true },
            options: [
              { value: 'solid_tumor', label: 'Solid Tumor' },
              { value: 'hematologic', label: 'Hematologic Malignancy' },
              { value: 'cns', label: 'CNS Tumor' },
              { value: 'multiple', label: 'Multiple Tumor Types (tissue-agnostic)' },
            ],
          },
          {
            id: 'uses_surrogate_endpoint',
            label: 'Is approval sought based on a surrogate endpoint?',
            type: 'yes_no',
            helpText:
              'Per 21 CFR 314.510, FDA may grant accelerated approval based on a surrogate endpoint reasonably likely to predict clinical benefit. A confirmatory study demonstrating clinical benefit is required post-approval (21 CFR 314.530).',
          },
          {
            id: 'surrogate_endpoint_description',
            label: 'Surrogate Endpoint Description and Justification',
            type: 'textarea',
            placeholder:
              'e.g., Objective response rate (ORR) by RECIST v1.1 as assessed by independent central review (IRC). ORR is an established surrogate endpoint in oncology for accelerated approval per FDA Table of Surrogate Endpoints.',
            visibleWhen: { field: 'uses_surrogate_endpoint', operator: 'eq', value: true },
          },
        ],
        branches: [
          {
            when: { field: 'is_oncology', operator: 'eq', value: true },
            goto: 'pivotal_studies',
          },
        ],
        defaultNext: 'pivotal_studies',
        provideExpertFeedback: true,
      },

      {
        id: 'pivotal_studies',
        section: 'clinical_efficacy',
        question:
          'Provide detailed information about the pivotal clinical trial(s). Study design, enrollment, endpoints, and results are critical for the efficacy assessment.',
        guidance:
          'Per 21 CFR 314.126 "Adequate and Well-Controlled Studies," pivotal studies must use one of the following designs: (1) placebo-controlled, (2) dose-comparison, (3) active-controlled, (4) no-treatment controlled, or (5) historical-controlled (rarely sufficient alone). Randomization, blinding, and pre-specified statistical analysis plans are essential per ICH E9 "Statistical Principles for Clinical Trials." ICH E9(R1) introduces the estimand framework to precisely define what treatment effect is being estimated. For non-inferiority designs, the non-inferiority margin must be justified per ICH E10 "Choice of Control Group and Related Issues." FDA expects the primary efficacy analysis to be based on the intent-to-treat (ITT) population.',
        fields: [
          {
            id: 'pivotal_study_design',
            label: 'Pivotal Study Design',
            type: 'select',
            required: true,
            options: [
              { value: 'randomized_controlled', label: 'Randomized Controlled Trial (RCT)' },
              { value: 'single_arm', label: 'Single-Arm Trial (typically for accelerated approval)' },
              { value: 'crossover', label: 'Crossover Design' },
              { value: 'non_inferiority', label: 'Non-Inferiority Trial' },
              { value: 'adaptive', label: 'Adaptive Design (per FDA Guidance 2019)' },
            ],
          },
          {
            id: 'control_type',
            label: 'Control Group Type',
            type: 'select',
            visibleWhen: { field: 'pivotal_study_design', operator: 'in', value: ['randomized_controlled', 'non_inferiority'] },
            options: [
              { value: 'placebo', label: 'Placebo Control' },
              { value: 'active', label: 'Active Comparator' },
              { value: 'historical', label: 'Historical Control' },
              { value: 'none', label: 'No Control (add-on design)' },
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
            ],
          },
          {
            id: 'pivotal_enrollment',
            label: 'Total Enrollment in Pivotal Study',
            type: 'number',
            required: true,
            validation: { min: 10 },
          },
          {
            id: 'primary_endpoint',
            label: 'Primary Efficacy Endpoint',
            type: 'textarea',
            placeholder:
              'e.g., Progression-free survival (PFS) as assessed by BICR per RECIST v1.1; or Overall survival (OS) with stratified log-rank test.',
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
            id: 'effect_size',
            label: 'Effect Size / Treatment Difference',
            type: 'textarea',
            placeholder:
              'e.g., Median PFS: 12.5 months (drug) vs 6.8 months (control); HR = 0.52 (95% CI: 0.40-0.68). Absolute PFS improvement: 5.7 months. ORR: 58% vs 22% (p<0.0001).',
            required: true,
          },
          {
            id: 'p_value_or_ci',
            label: 'P-Value and/or Confidence Interval',
            type: 'text',
            placeholder: 'e.g., HR 0.52, 95% CI: 0.40-0.68, p<0.0001 (stratified log-rank)',
            required: true,
          },
          {
            id: 'secondary_endpoints',
            label: 'Key Secondary Endpoints and Results',
            type: 'textarea',
            placeholder:
              'e.g., OS: median 24.5 vs 18.2 months (HR 0.72, 95% CI: 0.55-0.94, p=0.015). ORR: 58% vs 22%. Duration of response: median 11.2 months.',
          },
          {
            id: 'statistical_analysis_plan',
            label: 'Statistical Analysis Plan Summary',
            type: 'textarea',
            placeholder:
              'e.g., Primary analysis: stratified log-rank test for PFS. Stratification factors: ECOG PS (0 vs 1), prior therapy lines (1 vs ≥2), brain metastases (yes/no). Alpha controlled at 0.05 two-sided. Multiplicity adjustment for key secondary endpoints via hierarchical testing procedure.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'subgroup_analyses',
            label: 'Pre-Specified Subgroup Analyses',
            type: 'textarea',
            placeholder:
              'e.g., Forest plot of PFS HR by age (<65/≥65), sex, ECOG PS, prior lines, brain metastases, geographic region, mutation subtype. Consistent treatment effect observed across all pre-specified subgroups.',
          },
          {
            id: 'multicenter',
            label: 'Was the pivotal study multicenter?',
            type: 'yes_no',
          },
          {
            id: 'number_of_sites',
            label: 'Number of Clinical Sites',
            type: 'number',
            visibleWhen: { field: 'multicenter', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'endpoint_analysis',
        issueChecks: [
          {
            id: 'primary_endpoint_not_met',
            condition: { field: 'primary_endpoint_met', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Primary Endpoint Not Met — NDA Approvability Concern',
            message:
              'The primary efficacy endpoint was not met in the pivotal study. This is a fundamental approvability concern. Per 21 CFR 314.126, substantial evidence of effectiveness requires demonstration of a treatment effect in adequate and well-controlled studies. If the primary endpoint was not met, the NDA will likely receive a Complete Response Letter unless there are compelling alternative analyses (e.g., a highly significant secondary endpoint with clinical meaningfulness).',
            reference: '21 CFR 314.126; ICH E9; FDA Guidance: Providing Clinical Evidence of Effectiveness (1998)',
          },
        ],
      },

      {
        id: 'endpoint_analysis',
        section: 'clinical_efficacy',
        question:
          'Provide additional endpoint analysis details, including regulatory endpoint classification, subgroup consistency, and benefit-risk assessment.',
        guidance:
          'Per FDA Guidance "Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics" (2018) and ICH E9(R1) "Estimands and Sensitivity Analysis in Clinical Trials," the regulatory endpoint must be clinically meaningful or a validated surrogate. For oncology: OS is the gold standard; PFS and ORR may support regular or accelerated approval depending on the context. Independent review committee (IRC/BICR) assessment is typically required for endpoint assessment in open-label oncology trials. The benefit-risk framework per PDUFA VI (Structured Benefit-Risk Assessment) should weigh the magnitude of clinical benefit against the safety profile in the context of the treated disease and available alternatives.',
        fields: [
          {
            id: 'regulatory_endpoint_type',
            label: 'Regulatory Endpoint Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'os', label: 'Overall Survival (OS)' },
              { value: 'pfs', label: 'Progression-Free Survival (PFS)' },
              { value: 'orr', label: 'Objective Response Rate (ORR)' },
              { value: 'dfs', label: 'Disease-Free Survival (DFS)' },
              { value: 'efs', label: 'Event-Free Survival (EFS)' },
              { value: 'composite', label: 'Composite Endpoint' },
              { value: 'patient_reported', label: 'Patient-Reported Outcome (PRO)' },
              { value: 'biomarker_surrogate', label: 'Biomarker / Surrogate Endpoint' },
            ],
          },
          {
            id: 'endpoint_assessment_method',
            label: 'Endpoint Assessment Methodology',
            type: 'textarea',
            placeholder:
              'e.g., PFS assessed by blinded independent central review (BICR) per RECIST v1.1. CT/MRI scans every 6 weeks for 48 weeks, then every 12 weeks. Concordance between investigator and BICR assessments: 89%. Sensitivity analysis using investigator assessment confirmed the primary result.',
            required: true,
          },
          {
            id: 'independent_review',
            label: 'Was an independent review committee (IRC/BICR) used?',
            type: 'yes_no',
            visibleWhen: { field: 'is_oncology', operator: 'eq', value: true },
            helpText:
              'For oncology trials, FDA generally expects BICR-assessed endpoints in open-label studies per FDA Guidance "Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics" (2018).',
          },
          {
            id: 'irc_concordance',
            label: 'IRC/BICR and Investigator Concordance',
            type: 'textarea',
            placeholder:
              'e.g., BICR-assessed ORR: 58% (95% CI: 51-65%). Investigator-assessed ORR: 62%. Concordance rate: 89%. Discordant cases primarily due to timing of progression calls.',
            visibleWhen: { field: 'independent_review', operator: 'eq', value: true },
          },
          {
            id: 'pre_specified_subgroups',
            label: 'Pre-Specified Subgroup Analyses Summary',
            type: 'textarea',
            placeholder:
              'e.g., Forest plot: treatment effect consistent across all pre-specified subgroups (age, sex, ECOG PS, prior therapy, geographic region, biomarker status). No subgroup showed a treatment interaction (all interaction p-values > 0.10).',
          },
          {
            id: 'consistency_across_subgroups',
            label: 'Was the treatment effect consistent across subgroups?',
            type: 'yes_no',
          },
          {
            id: 'benefit_risk_summary',
            label: 'Benefit-Risk Assessment Summary',
            type: 'textarea',
            placeholder:
              'e.g., Benefit: clinically meaningful and statistically significant improvement in PFS (HR 0.52, 5.7-month improvement) with durable responses (median DOR 11.2 months). Risk: manageable safety profile with Grade ≥3 AEs in 35% (primarily rash, diarrhea, paronychia). No new safety signals compared to established EGFR inhibitors. Favorable benefit-risk in the context of limited treatment options for EGFR exon 20 insertion NSCLC.',
            required: true,
            validation: { minLength: 100 },
          },
        ],
        branches: [
          {
            when: { field: 'accelerated_pathway', operator: 'contains', value: 'accelerated_approval' },
            goto: 'safety_database',
          },
        ],
        defaultNext: 'safety_database',
        provideExpertFeedback: true,
      },

      /* ================================================================ */
      /*  Section 6 — Clinical Safety                                     */
      /* ================================================================ */

      {
        id: 'safety_database',
        section: 'clinical_safety',
        question:
          'Describe the overall safety database. Per ICH E1, the NDA safety database must be adequate to characterize the safety profile for the proposed indication and patient population.',
        guidance:
          'Per ICH E1 "The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions" and 21 CFR 314.50(d)(5)(vi), the NDA safety database should include: (a) ≥1,500 patients exposed to the drug at any dose, (b) ≥300-600 patients exposed for 6 months, and (c) ≥100 patients exposed for 12 months (for chronic-use drugs). ICH E1(A) "The Extent of Population Exposure to Assess Clinical Safety" provides additional guidance. An integrated safety summary (ISS) pooling all studies is expected. The safety update cutoff date should be as recent as possible, typically within 4 months of NDA submission.',
        fields: [
          {
            id: 'total_exposed',
            label: 'Total Patients Exposed to Drug (any dose, all studies)',
            type: 'number',
            required: true,
            validation: { min: 100 },
          },
          {
            id: 'exposure_duration_6mo',
            label: 'Patients Exposed for ≥6 Months',
            type: 'number',
            required: true,
          },
          {
            id: 'exposure_duration_12mo',
            label: 'Patients Exposed for ≥12 Months',
            type: 'number',
            required: true,
          },
          {
            id: 'safety_database_adequate',
            label: 'Does the safety database meet ICH E1 thresholds?',
            type: 'yes_no',
            required: true,
            helpText:
              'ICH E1: ≥1,500 total exposed, ≥300-600 for 6 months, ≥100 for 12 months (chronic-use). Lower thresholds may be acceptable for life-threatening conditions, orphan indications, or accelerated approval.',
          },
          {
            id: 'controlled_trial_patients',
            label: 'Patients in Controlled Trials (drug arm)',
            type: 'number',
            required: true,
          },
          {
            id: 'total_patient_years',
            label: 'Total Patient-Years of Exposure',
            type: 'number',
          },
          {
            id: 'safety_update_cutoff',
            label: 'Safety Data Cutoff Date',
            type: 'date',
            required: true,
            helpText:
              'The safety update should be as current as possible. FDA typically expects a 120-day Safety Update Report (21 CFR 314.50(d)(5)(vi)(b)) submitted 120 days after NDA submission.',
          },
          {
            id: 'integrated_safety_summary',
            label: 'Integrated Safety Summary (ISS) Prepared',
            type: 'yes_no',
            required: true,
            helpText:
              'The ISS pools safety data across all studies and is a critical component of the NDA. It should be structured per ICH E2C(R2) "Periodic Benefit-Risk Evaluation Report" format.',
          },
        ],
        defaultNext: 'adverse_events',
        issueChecks: [
          {
            id: 'safety_database_below_e1',
            condition: { field: 'total_exposed', operator: 'lt', value: 1500 },
            severity: 'warning',
            title: 'Safety Database Below ICH E1 Recommendation',
            message:
              'The total number of patients exposed is below the ICH E1 recommendation of ≥1,500 patients. For non-life-threatening chronic conditions, this may result in a request for additional safety data or a post-marketing requirement. For life-threatening conditions, orphan drugs, or accelerated approval, lower thresholds may be acceptable with adequate justification.',
            reference: 'ICH E1; ICH E1(A); 21 CFR 314.50(d)(5)(vi)',
          },
          {
            id: 'insufficient_long_term_exposure',
            condition: { field: 'exposure_duration_12mo', operator: 'lt', value: 300 },
            severity: 'critical',
            title: 'Insufficient Long-Term Exposure Data',
            message:
              'Fewer than 300 patients have ≥12-month exposure data. Per ICH E1(A), adequate long-term exposure is essential to identify adverse reactions that may emerge with chronic use (e.g., carcinogenicity signals, organ toxicity, immune-mediated reactions). FDA may require post-marketing studies to supplement the database.',
            reference: 'ICH E1(A); 21 CFR 314.50(d)(5)(vi)',
          },
        ],
      },

      {
        id: 'adverse_events',
        section: 'clinical_safety',
        question:
          'Describe the adverse event profile, including the most common AEs, dose-response relationships, and any anticipated labeling implications.',
        guidance:
          'Per 21 CFR 314.50(d)(5)(vi) and ICH E2C(R2), the NDA must include a comprehensive analysis of adverse events. Common AEs (occurring in ≥5-10% of patients and more frequent than control) should be tabulated by system organ class (SOC) and preferred term (MedDRA). Grade ≥3 events (CTCAE v5.0) should be separately analyzed. Dose-response relationships for toxicity should be described. Special safety topics (hepatotoxicity per FDA Guidance "Drug-Induced Liver Injury" (2009), cardiovascular risk per ICH E14, nephrotoxicity, infections, etc.) require dedicated analyses. If a boxed warning is anticipated, the proposed text should be included per 21 CFR 201.57(c)(1).',
        fields: [
          {
            id: 'most_common_aes',
            label: 'Most Common Adverse Events (≥10% incidence)',
            type: 'textarea',
            placeholder:
              'e.g., Rash (45% any grade, 12% Grade ≥3), Diarrhea (38%, 5% Grade ≥3), Paronychia (28%, 3% Grade ≥3), Stomatitis (22%, 2% Grade ≥3), Fatigue (20%, 3% Grade ≥3), Nausea (18%, 1% Grade ≥3), AST elevation (15%, 4% Grade ≥3), Decreased appetite (14%, 1% Grade ≥3).',
            required: true,
            validation: { minLength: 100 },
          },
          {
            id: 'grade_3_4_events',
            label: 'Grade ≥3 Adverse Events Summary',
            type: 'textarea',
            placeholder:
              'e.g., Overall Grade ≥3 AE rate: 35% (drug) vs 28% (control). Most common Grade ≥3: rash (12%), diarrhea (5%), AST/ALT elevation (4%), infection (3%). Grade 5 AEs: 2% (drug) vs 1.5% (control).',
            required: true,
          },
          {
            id: 'dose_response_toxicity',
            label: 'Is there a dose-response relationship for toxicity?',
            type: 'yes_no',
          },
          {
            id: 'dose_limiting_toxicities',
            label: 'Dose-Limiting Toxicities Description',
            type: 'textarea',
            placeholder:
              'e.g., Dose-limiting toxicities at 200 mg QD: Grade 3 rash (DLT rate 33%), Grade 3 diarrhea (DLT rate 17%). MTD/RP2D established at 100 mg QD based on Phase 1 dose-escalation data.',
            visibleWhen: { field: 'dose_response_toxicity', operator: 'eq', value: true },
          },
          {
            id: 'treatment_discontinuation_rate',
            label: 'Treatment Discontinuation Rate Due to AEs',
            type: 'text',
            placeholder: 'e.g., 12% drug vs 8% control; most common reasons: rash (3%), hepatotoxicity (2%)',
            required: true,
          },
          {
            id: 'dose_modification_rate',
            label: 'Dose Modification Rate (interruption + reduction)',
            type: 'text',
            placeholder: 'e.g., Dose interruption: 35%, Dose reduction: 18%, Median time to first dose modification: 2.1 months',
          },
          {
            id: 'special_safety_topics',
            label: 'Special Safety Topics Requiring Dedicated Analysis',
            type: 'multi_select',
            options: [
              { value: 'hepatotox', label: 'Hepatotoxicity (Hy\'s Law / DILI)' },
              { value: 'cardiotox', label: 'Cardiotoxicity (QTc, LVEF, Heart Failure)' },
              { value: 'nephrotox', label: 'Nephrotoxicity' },
              { value: 'neuro', label: 'Neurotoxicity (peripheral neuropathy, CNS effects)' },
              { value: 'infection', label: 'Infections (opportunistic, reactivation)' },
              { value: 'bleeding', label: 'Bleeding / Hemorrhagic Events' },
              { value: 'qt_prolongation', label: 'QT Prolongation' },
              { value: 'cytokine_release', label: 'Cytokine Release Syndrome (CRS)' },
              { value: 'immunogenicity', label: 'Immunogenicity (ADA)' },
            ],
            helpText:
              'Dedicated safety analyses are required for each identified risk. FDA Guidance documents exist for hepatotoxicity (DILI Guidance 2009), QTc (ICH E14), and immunogenicity (FDA Guidance 2014).',
          },
          {
            id: 'boxed_warning_anticipated',
            label: 'Is a Boxed Warning anticipated?',
            type: 'yes_no',
          },
          {
            id: 'boxed_warning_text',
            label: 'Proposed Boxed Warning Text',
            type: 'textarea',
            placeholder:
              'e.g., WARNING: HEPATOTOXICITY\nSevere and fatal hepatotoxicity has occurred. Monitor liver function tests prior to and during treatment. Withhold, reduce dose, or permanently discontinue based on severity. [See Warnings and Precautions (5.1)]',
            visibleWhen: { field: 'boxed_warning_anticipated', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'deaths_serious_ae',
        issueChecks: [
          {
            id: 'boxed_warning_labeling_impact',
            condition: { field: 'boxed_warning_anticipated', operator: 'eq', value: true },
            severity: 'info',
            title: 'Boxed Warning Impact on Labeling and REMS',
            message:
              'An anticipated boxed warning has significant regulatory implications: (1) the boxed warning is the most prominent safety communication in labeling per 21 CFR 201.57(c)(1), (2) FDA may require a REMS (with Medication Guide as a minimum element) when a boxed warning is warranted, (3) payer coverage and formulary positioning may be affected. Coordinate with FDA on the exact boxed warning language during the review process.',
            reference: '21 CFR 201.57(c)(1); 21 USC 355-1',
          },
        ],
      },

      {
        id: 'deaths_serious_ae',
        section: 'clinical_safety',
        question:
          'Provide a detailed analysis of deaths, serious adverse events (SAEs), and safety narratives in the clinical program.',
        guidance:
          'Per 21 CFR 314.50(d)(5)(vi)(b) and ICH E2D "Post-Approval Safety Data Management," all deaths and serious adverse events must be thoroughly analyzed. For each death, a narrative should describe the patient, the event, the temporal relationship to drug exposure, and the investigator\'s and sponsor\'s causality assessment. Per ICH E2A, SAEs include: death, life-threatening events, hospitalization (or prolongation), persistent disability, congenital anomaly, and important medical events. The integrated safety summary should present deaths and SAEs by treatment group with rate comparisons (drug vs. control) and patient-year-adjusted incidence rates.',
        fields: [
          {
            id: 'deaths_in_program',
            label: 'Total Deaths in Clinical Program (all causes)',
            type: 'number',
            required: true,
          },
          {
            id: 'deaths_drug_related',
            label: 'Deaths Assessed as Drug-Related',
            type: 'number',
          },
          {
            id: 'death_narratives_prepared',
            label: 'Individual Death Narratives Prepared',
            type: 'yes_no',
            visibleWhen: { field: 'deaths_in_program', operator: 'gt', value: 0 },
            helpText:
              'Per 21 CFR 314.50(d)(5)(vi)(b), individual patient narratives for all deaths (and other serious or significant AEs) must be included in the NDA. Each narrative should describe demographics, medical history, dosing, event description, management, outcome, and causality assessment.',
          },
          {
            id: 'sae_summary',
            label: 'SAE Summary (by system organ class)',
            type: 'textarea',
            placeholder:
              'e.g., Overall SAE rate: 25% (drug) vs 18% (control). Most common SAEs: pneumonia (4%), hepatic failure (2%), GI hemorrhage (1.5%), cardiac arrest (0.5%). SAE rate adjusted for patient-years: 0.45 events/patient-year (drug) vs 0.32 (control).',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'sae_rate_drug_vs_control',
            label: 'SAE Rate: Drug vs. Control',
            type: 'text',
            placeholder: 'e.g., Drug: 25% (0.45/patient-year) vs. Control: 18% (0.32/patient-year)',
          },
          {
            id: 'withdrawal_due_to_ae',
            label: 'Withdrawal/Discontinuation Due to AEs (drug vs. control)',
            type: 'text',
            placeholder: 'e.g., Drug: 12% vs. Control: 8%. Most common reasons: hepatotoxicity (3%), rash (2%), diarrhea (1%)',
            required: true,
          },
          {
            id: 'safety_signal_management',
            label: 'Safety Signal Management Plan',
            type: 'textarea',
            placeholder:
              'e.g., Hepatotoxicity management: ALT/AST monitoring at baseline, Q2W for first 3 months, then monthly. Dose modification algorithm for ALT >3x ULN, >5x ULN, >10x ULN. Rechallenge permitted for Grade 2 events after resolution. Permanent discontinuation for Hy\'s Law cases.',
          },
        ],
        defaultNext: 'ctd_organization',
        issueChecks: [
          {
            id: 'drug_related_deaths',
            condition: { field: 'deaths_drug_related', operator: 'gt', value: 0 },
            severity: 'warning',
            title: 'Drug-Related Deaths Require Thorough Analysis',
            message:
              'One or more deaths have been assessed as drug-related. Thorough analysis is required including: (1) individual patient narratives for each case, (2) comparison of death rates with control arm, (3) temporal relationship analysis, (4) risk factor identification, and (5) proposed risk mitigation measures. Drug-related deaths will be closely scrutinized by the FDA review team and may impact labeling (boxed warning, contraindications) and REMS requirements.',
            reference: '21 CFR 314.50(d)(5)(vi)(b); ICH E2A; ICH E2D',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 7 — CTD Module Structure                                */
      /* ================================================================ */

      {
        id: 'ctd_organization',
        section: 'ctd_structure',
        question:
          'Describe the CTD/eCTD organization for this NDA. All NDA submissions must be in eCTD format per FDA requirements.',
        guidance:
          'Per ICH M4 "Organization of the Common Technical Document for the Registration of Pharmaceuticals for Human Use" and 21 CFR 314.50(a), NDA submissions must follow the CTD structure: Module 1 (Regional Administrative Information), Module 2 (CTD Summaries), Module 3 (Quality/CMC), Module 4 (Nonclinical Study Reports), Module 5 (Clinical Study Reports). The FDA eCTD mandate (effective since May 2017) requires all NDA submissions to be in eCTD electronic format. Module 2 summaries (Quality Overall Summary, Nonclinical Overview, Nonclinical Written/Tabulated Summaries, Clinical Overview, Clinical Summary) are critical review documents that must be complete and well-organized.',
        fields: [
          {
            id: 'ctd_format',
            label: 'Submission Format',
            type: 'select',
            required: true,
            options: [
              { value: 'ectd_v4', label: 'eCTD v4.0 (ICH M8 — current standard)' },
              { value: 'ectd_v3', label: 'eCTD v3.2.2 (transitional)' },
              { value: 'paper', label: 'Paper Submission', flagsIssue: true },
            ],
          },
          {
            id: 'publishing_tool',
            label: 'eCTD Publishing Tool',
            type: 'select',
            options: [
              { value: 'global_submit', label: 'Global Submit (IQVIA)' },
              { value: 'lorenz', label: 'Lorenz docuBridge' },
              { value: 'isi_toolbox', label: 'ISI Toolbox' },
              { value: 'other', label: 'Other Publishing Tool' },
            ],
          },
          {
            id: 'module_2_summaries',
            label: 'Module 2 Summaries Completed',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'quality_overall', label: 'Module 2.3 — Quality Overall Summary (QOS)' },
              { value: 'nonclinical_overview', label: 'Module 2.4 — Nonclinical Overview' },
              { value: 'nonclinical_summary', label: 'Module 2.6 — Nonclinical Written and Tabulated Summaries' },
              { value: 'clinical_overview', label: 'Module 2.5 — Clinical Overview' },
              { value: 'clinical_summary', label: 'Module 2.7 — Clinical Summary' },
            ],
            helpText:
              'All Module 2 summaries must be completed for the NDA. These are the primary review documents used by FDA reviewers. Incomplete Module 2 documents may result in a Refuse to File.',
          },
          {
            id: 'module_2_completed',
            label: 'Are all Module 2 summaries finalized?',
            type: 'yes_no',
          },
          {
            id: 'module_3_included',
            label: 'Module 3 (Quality/CMC) Included',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'cross_reference_list',
            label: 'Cross-References to Previously Submitted Documents',
            type: 'textarea',
            placeholder:
              'e.g., IND 123456 — cross-referenced for Phase 1/2 study reports (Study ABC-001, ABC-002). DMF 12345 — drug substance manufacturing (Type II DMF held by supplier).',
          },
        ],
        defaultNext: 'ectd_submission',
        issueChecks: [
          {
            id: 'paper_submission_not_allowed',
            condition: { field: 'ctd_format', operator: 'eq', value: 'paper' },
            severity: 'critical',
            title: 'eCTD Submission Required',
            message:
              'Paper NDA submissions are no longer accepted by FDA. Per the eCTD mandate (effective May 5, 2017), all NDAs, ANDAs, BLAs, and amendments/supplements must be submitted in eCTD format. Failure to submit in eCTD format will result in a Refuse to Receive.',
            reference: 'FDA eCTD Mandate (21 CFR 314.50(a)); ICH M8',
          },
        ],
      },

      {
        id: 'ectd_submission',
        section: 'ctd_structure',
        question:
          'Provide eCTD technical details including sequence numbering, datasets, and validation status.',
        guidance:
          'Per FDA Technical Specifications Documents and the FDA Data Standards Catalog, NDA submissions must include study datasets in CDISC format (SDTM for tabulation datasets, ADaM for analysis datasets). The define.xml file per CDISC Define-XML v2.0 must accompany all datasets. Reviewer\'s Guides for each study dataset are expected per FDA Guidance "Study Data Technical Conformance Guide" (2023). The eCTD submission must pass the FDA\'s eSubmitter validation (ESG gateway) before FDA will accept the submission. All sequence numbers must follow the FDA Comprehensive Table of Contents (CTOCh) and CDER/CBER numbering conventions.',
        fields: [
          {
            id: 'ectd_sequence_number',
            label: 'eCTD Sequence Number',
            type: 'text',
            placeholder: 'e.g., 0000 (for original NDA submission)',
            required: true,
          },
          {
            id: 'submission_type',
            label: 'Submission Type',
            type: 'select',
            options: [
              { value: 'original', label: 'Original NDA' },
              { value: 'amendment', label: 'Pre-Filing Amendment' },
              { value: 'supplement', label: 'Supplement (sNDA)' },
            ],
          },
          {
            id: 'regional_module',
            label: 'Module 1 Regional Administrative Information Complete',
            type: 'yes_no',
            helpText:
              'Module 1 includes Form FDA 356h, patent information (Form 3542a), financial disclosure (21 CFR 54), debarment certification, and other administrative documents.',
          },
          {
            id: 'datasets_format',
            label: 'Study Data Format',
            type: 'select',
            required: true,
            options: [
              { value: 'cdisc_adam', label: 'CDISC ADaM + SDTM (FDA-required standard)' },
              { value: 'cdisc_sdtm', label: 'CDISC SDTM Only (tabulation only)' },
              { value: 'legacy', label: 'Legacy / Non-CDISC Format', flagsIssue: true },
            ],
            helpText:
              'Per the FDA Data Standards Catalog (updated annually), NDA study data must be submitted in CDISC standards: SDTM for tabulation datasets and ADaM for analysis datasets. SAS Transport (XPT) v5 format is required.',
          },
          {
            id: 'define_xml_included',
            label: 'Define.xml Files Included (CDISC Define-XML v2.0)',
            type: 'yes_no',
            helpText:
              'Define.xml is a machine-readable metadata file describing the structure and content of submitted datasets. It is required per the FDA Study Data Technical Conformance Guide (2023).',
          },
          {
            id: 'sas_transport_files',
            label: 'SAS Transport (XPT v5) Files Prepared',
            type: 'yes_no',
            helpText:
              'Per the FDA Data Standards Catalog, all datasets must be in SAS Transport File Format (XPT v5). Dataset size limit: 5 GB per file.',
          },
          {
            id: 'reviewer_guides',
            label: 'Reviewer\'s Guides Prepared for Each Study',
            type: 'yes_no',
            required: true,
            helpText:
              'Per FDA Guidance "Study Data Technical Conformance Guide" (2023), a Reviewer\'s Guide (RG) must accompany each study dataset submission. The RG describes dataset structure, key variables, deviations from CDISC standards, and analysis methods.',
          },
          {
            id: 'esub_validation_passed',
            label: 'eSub/eCTD Validation Passed (FDA ESG gateway)',
            type: 'yes_no',
            required: true,
            helpText:
              'The FDA Electronic Submissions Gateway (ESG) performs automated validation of eCTD submissions. Validation errors must be resolved before FDA will accept the submission. Run a pre-submission validation using the FDA eCTD Validation Criteria document.',
          },
        ],
        defaultNext: 'labeling_content',
        issueChecks: [
          {
            id: 'legacy_datasets_not_accepted',
            condition: { field: 'datasets_format', operator: 'eq', value: 'legacy' },
            severity: 'warning',
            title: 'CDISC Standards Required',
            message:
              'Non-CDISC (legacy) data formats are no longer accepted for NDAs per the FDA Data Standards Catalog. Study data must be submitted in CDISC SDTM (tabulation) and ADaM (analysis) formats in SAS Transport XPT v5 files. Conversion to CDISC standards should be initiated immediately to avoid submission delays.',
            reference: 'FDA Data Standards Catalog; FDA Study Data Technical Conformance Guide (2023)',
          },
          {
            id: 'esub_validation_required',
            condition: { field: 'esub_validation_passed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'eSub Validation Must Pass',
            message:
              'The eCTD submission must pass FDA Electronic Submissions Gateway (ESG) validation before acceptance. Common validation failures include: incorrect file naming, PDF bookmark errors, missing M1 documents, file size limits exceeded, and lifecycle sequencing errors. Resolve all validation errors before submission.',
            reference: 'FDA eCTD Guidance; FDA eCTD Validation Criteria; 21 CFR 314.50(a)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 8 — Labeling & REMS                                     */
      /* ================================================================ */

      {
        id: 'labeling_content',
        section: 'labeling_rems',
        question:
          'Describe the proposed labeling content. The draft USPI (United States Prescribing Information) must be included in the NDA per 21 CFR 201.56-201.57.',
        guidance:
          'Per 21 CFR 201.56 and 21 CFR 201.57, the USPI must follow the Physician Labeling Rule (PLR) format with standardized sections: Highlights, Full Prescribing Information (FPI) table of contents, boxed warning (if applicable), Indications and Usage, Dosage and Administration, Dosage Forms and Strengths, Contraindications, Warnings and Precautions, Adverse Reactions, Drug Interactions, Use in Specific Populations, Description, Clinical Pharmacology, Nonclinical Toxicology, Clinical Studies, References, How Supplied/Storage and Handling, and Patient Counseling Information. A Medication Guide (21 CFR Part 208) may be required if the product has serious risks that could be mitigated by patient education. Patient package inserts may also be required.',
        fields: [
          {
            id: 'uspi_draft_complete',
            label: 'USPI (Prescribing Information) Draft Complete',
            type: 'yes_no',
            required: true,
            helpText:
              'The proposed USPI must be submitted with the NDA. FDA negotiates labeling during the review cycle, but a complete draft following the PLR format (21 CFR 201.57) must be included at submission.',
          },
          {
            id: 'indications_usage',
            label: 'Proposed Indications and Usage (Section 1)',
            type: 'textarea',
            placeholder:
              'e.g., ACMEXOR (acmetinib) is indicated for the treatment of adult patients with locally advanced or metastatic non-small cell lung cancer (NSCLC) with epidermal growth factor receptor (EGFR) exon 20 insertion mutations, as detected by an FDA-approved test, who have progressed on or after platinum-based chemotherapy.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'dosage_administration',
            label: 'Proposed Dosage and Administration (Section 2)',
            type: 'textarea',
            placeholder:
              'e.g., The recommended dosage is 100 mg taken orally once daily with or without food until disease progression or unacceptable toxicity. Dose modifications for adverse reactions: Grade 3 rash — interrupt until ≤Grade 1, then resume at 75 mg. Hepatic impairment: reduce to 75 mg for moderate (Child-Pugh B); not recommended for severe (Child-Pugh C).',
            required: true,
          },
          {
            id: 'contraindications',
            label: 'Proposed Contraindications (Section 4)',
            type: 'textarea',
            placeholder:
              'e.g., Known hypersensitivity to acmetinib or any excipient. Co-administration with strong CYP3A4 inducers (e.g., rifampin, phenytoin, carbamazepine, St. John\'s wort).',
          },
          {
            id: 'warnings_precautions',
            label: 'Proposed Warnings and Precautions (Section 5)',
            type: 'textarea',
            placeholder:
              'e.g., 5.1 Hepatotoxicity: ALT/AST elevations observed in 15% of patients (Grade ≥3 in 4%). Monitor LFTs at baseline and periodically. 5.2 Dermatologic Reactions: Rash in 45%, severe in 12%. 5.3 Embryo-Fetal Toxicity: Can cause fetal harm based on animal data.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'adverse_reactions_section',
            label: 'Adverse Reactions Section (Section 6) Prepared',
            type: 'yes_no',
            required: true,
            helpText:
              'Section 6 presents AE data from clinical trials. Per 21 CFR 201.57(c)(7), include: common AEs table (≥10%), Grade ≥3 table, AEs leading to discontinuation, and selected AEs requiring monitoring.',
          },
          {
            id: 'drug_interactions_section',
            label: 'Drug Interactions Section (Section 7) Prepared',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 201.57(c)(8), describe clinically significant interactions including effect on and by CYP enzymes/transporters, dose adjustments, and contraindicated combinations.',
          },
          {
            id: 'use_in_specific_populations',
            label: 'Use in Specific Populations (Section 8) Content',
            type: 'textarea',
            placeholder:
              'e.g., 8.1 Pregnancy: can cause fetal harm. Advise pregnant women of potential risk. 8.2 Lactation: advise not to breastfeed. 8.3 Females and Males of Reproductive Potential: verify pregnancy status; use effective contraception. 8.4 Pediatric Use: safety and efficacy not established. 8.5 Geriatric Use: no overall differences in safety/efficacy in patients ≥65. 8.6 Renal Impairment: no dose adjustment for mild/moderate. 8.7 Hepatic Impairment: dose reduction for moderate (Child-Pugh B).',
            required: true,
          },
          {
            id: 'patient_labeling',
            label: 'Patient Package Insert / Patient Information Prepared',
            type: 'yes_no',
          },
          {
            id: 'medication_guide_needed',
            label: 'Medication Guide Required (21 CFR Part 208)',
            type: 'yes_no',
            helpText:
              'Per 21 CFR Part 208, a Medication Guide is required when: (1) the product has serious risks relative to benefits, (2) patient adherence is crucial, or (3) there are important instructions for safe use. Products with boxed warnings typically require a Medication Guide.',
          },
        ],
        defaultNext: 'rems_evaluation',
        issueChecks: [
          {
            id: 'uspi_not_complete',
            condition: { field: 'uspi_draft_complete', operator: 'eq', value: false },
            severity: 'warning',
            title: 'USPI Draft Should Be Complete',
            message:
              'A complete draft USPI in PLR format (21 CFR 201.57) must be submitted with the NDA. An incomplete USPI may result in a Refuse to File action. The draft should include all standardized sections with data from the clinical development program. FDA will negotiate final labeling language during the review cycle.',
            reference: '21 CFR 201.56; 21 CFR 201.57',
          },
        ],
      },

      {
        id: 'rems_evaluation',
        section: 'labeling_rems',
        question:
          'Has the need for a Risk Evaluation and Mitigation Strategy (REMS) been assessed? If REMS is required, describe the proposed elements.',
        guidance:
          'Per 21 USC 355-1 (FDAAA Section 901) and FDA Guidance "Format and Content of Proposed Risk Evaluation and Mitigation Strategies (REMS), REMS Assessments, and Proposed REMS Modifications" (2009), FDA may require a REMS if it determines that a REMS is necessary to ensure the benefits outweigh the risks. REMS elements may include: (1) Medication Guide and/or Patient Package Insert, (2) Communication Plan (Dear Healthcare Provider letters, educational materials), (3) Elements to Assure Safe Use (ETASU) — prescriber certification, patient enrollment, pharmacy certification, restricted distribution. REMS with ETASU are the most restrictive and are required for drugs with the most serious safety concerns (e.g., thalidomide/lenalidomide, isotretinoin, opioids).',
        fields: [
          {
            id: 'rems_required',
            label: 'REMS Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'yes', label: 'Yes — REMS Required' },
              { value: 'likely', label: 'Likely — Under Discussion with FDA' },
              { value: 'no', label: 'No — REMS Not Required' },
              { value: 'under_discussion', label: 'Under Discussion — Awaiting FDA Guidance' },
            ],
          },
          {
            id: 'rems_elements',
            label: 'Proposed REMS Elements',
            type: 'multi_select',
            visibleWhen: { field: 'rems_required', operator: 'in', value: ['yes', 'likely'] },
            options: [
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'communication_plan', label: 'Communication Plan (healthcare provider education)' },
              { value: 'etasu', label: 'Elements to Assure Safe Use (ETASU)' },
              { value: 'implementation_system', label: 'Implementation System' },
            ],
          },
          {
            id: 'etasu_description',
            label: 'ETASU Description (if applicable)',
            type: 'textarea',
            placeholder:
              'e.g., Prescriber certification required (complete online training module). Patients must sign a Patient-Prescriber Agreement form acknowledging risks. Pharmacy must be certified in the REMS program. Drug dispensed only to certified pharmacies. Pregnancy testing required before each cycle for WOCBP.',
            visibleWhen: { field: 'rems_elements', operator: 'contains', value: 'etasu' },
          },
          {
            id: 'rems_assessment_timeline',
            label: 'REMS Assessment and Reporting Timeline',
            type: 'text',
            placeholder: 'e.g., REMS assessments due at 18 months, 3 years, and 7 years post-approval',
            helpText: 'Per 21 USC 355-1(g), REMS assessments must be submitted at 18 months, 3 years, and 7 years after initial REMS approval, or as otherwise specified by FDA.',
          },
          {
            id: 'prior_rems_experience',
            label: 'Does the sponsor have prior experience managing a REMS program?',
            type: 'yes_no',
          },
          {
            id: 'rems_comparable_products',
            label: 'Comparable Products with REMS (for benchmarking)',
            type: 'textarea',
            placeholder:
              'e.g., Lenalidomide (Revlimid REMS), Isotretinoin (iPLEDGE REMS), Opioids (Class-Wide REMS). Benchmark elements include: patient enrollment, prescriber certification, pregnancy prevention program.',
          },
        ],
        defaultNext: 'pmc_pme',
        issueChecks: [
          {
            id: 'rems_elements_missing',
            condition: { field: 'rems_required', operator: 'eq', value: 'yes' },
            severity: 'critical',
            title: 'REMS Elements Must Be Defined',
            message:
              'REMS has been identified as required, but the specific REMS elements must be fully defined before NDA submission. Per 21 USC 355-1, the proposed REMS document must include: a description of each element, implementation timeline, timetable for REMS assessments, and proposed metrics for evaluating REMS effectiveness. Coordinate with FDA\'s Office of Surveillance and Epidemiology (OSE) on REMS design.',
            reference: '21 USC 355-1; FDAAA Section 901',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 9 — Post-Marketing Commitments                         */
      /* ================================================================ */

      {
        id: 'pmc_pme',
        section: 'post_marketing',
        question:
          'Describe post-marketing commitments (PMCs) and post-marketing requirements (PMEs). For accelerated approval, a confirmatory study is required.',
        guidance:
          'Per 21 CFR 314.81 "Other Post-Marketing Reports" and FDAAA Section 505(o)(3), FDA may require post-marketing studies or clinical trials to assess a known or potential serious risk, to assess signals of serious risk, or to identify unexpected serious risks. For drugs approved under Accelerated Approval (21 CFR 314.510), a confirmatory study demonstrating clinical benefit is required per 21 CFR 314.530. FDA may withdraw accelerated approval if the confirmatory study fails to verify clinical benefit. Post-marketing commitments are agreed-upon studies; post-marketing requirements are mandatory per FDAAA. Periodic Safety Update Reports (PSURs) per ICH E2C(R2) or Periodic Adverse Drug Experience Reports (PADERs) per 21 CFR 314.80 are required.',
        fields: [
          {
            id: 'confirmatory_study_planned',
            label: 'Confirmatory Post-Approval Study Planned',
            type: 'yes_no',
          },
          {
            id: 'confirmatory_study_design',
            label: 'Confirmatory Study Design',
            type: 'textarea',
            placeholder:
              'e.g., Phase 3 randomized, double-blind, placebo-controlled study of acmetinib vs. standard of care in first-line NSCLC with EGFR exon 20 insertions. Primary endpoint: OS. Target enrollment: 450 patients. Estimated completion: Q4 2028.',
            visibleWhen: { field: 'confirmatory_study_planned', operator: 'eq', value: true },
          },
          {
            id: 'accelerated_approval_conditions',
            label: 'Accelerated Approval Conditions',
            type: 'textarea',
            placeholder:
              'e.g., This NDA seeks accelerated approval based on ORR (surrogate endpoint). Confirmatory study (Study XYZ-003) is ongoing with OS as the primary endpoint. Enrollment complete; interim analysis planned at 60% OS events. Final OS analysis expected Q2 2028.',
            visibleWhen: { field: 'accelerated_pathway', operator: 'contains', value: 'accelerated_approval' },
          },
          {
            id: 'pmc_list',
            label: 'Post-Marketing Commitments (PMCs) — Agreed-Upon Studies',
            type: 'textarea',
            placeholder:
              'e.g., PMC 1: Long-term safety registry (5,000 patients, 5 years). PMC 2: QTc definitive study (per ICH E14). PMC 3: Renal impairment PK study (Child-Pugh classification).',
          },
          {
            id: 'pme_list',
            label: 'Post-Marketing Requirements (PMEs) — Mandatory Studies',
            type: 'textarea',
            placeholder:
              'e.g., PMR 1: Confirmatory OS study (21 CFR 314.530). PMR 2: Pediatric studies per iPSP (PREA). PMR 3: REMS assessment at 18 months.',
          },
          {
            id: 'phase_4_studies',
            label: 'Planned Phase 4 Studies',
            type: 'textarea',
            placeholder:
              'e.g., Phase 4 real-world evidence study evaluating effectiveness in community oncology settings. Registry study for long-term safety in >5,000 patients.',
          },
          {
            id: 'signal_detection_plan',
            label: 'Post-Marketing Safety Signal Detection Plan',
            type: 'textarea',
            placeholder:
              'e.g., Routine pharmacovigilance: ICSR processing via Argus Safety with MedDRA coding. Signal detection: quarterly disproportionality analysis (PRR, ROR) on spontaneous AE database. FAERS data mining. Periodic review of literature reports. Sentinel System active surveillance planned.',
            required: true,
          },
          {
            id: 'periodic_safety_reports',
            label: 'Periodic Safety Report Type',
            type: 'select',
            required: true,
            options: [
              { value: 'psur', label: 'PSUR / PBRER (ICH E2C(R2))' },
              { value: 'pader', label: 'PADER (21 CFR 314.80)' },
              { value: 'dsur', label: 'DSUR (ICH E2F — for ongoing studies)' },
            ],
            helpText:
              'For marketed products, PADERs are required per 21 CFR 314.80 (quarterly for first 3 years, then annually). PBRERs (ICH E2C(R2)) may be submitted in lieu of PADERs if agreed upon with FDA.',
          },
        ],
        defaultNext: 'pediatric_commitments',
        provideExpertFeedback: true,
        issueChecks: [
          {
            id: 'accelerated_approval_no_confirmatory',
            condition: { field: 'confirmatory_study_planned', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Confirmatory Study Required for Accelerated Approval',
            message:
              'If this NDA seeks accelerated approval (21 CFR 314.510), a confirmatory post-marketing study demonstrating clinical benefit is mandatory per 21 CFR 314.530. Per FDORA 2022 amendments, FDA has enhanced authority to require that confirmatory studies are underway prior to accelerated approval and to withdraw approval on an expedited timeline if studies fail to verify clinical benefit. The confirmatory study protocol should be agreed upon with FDA before NDA submission.',
            reference: '21 CFR 314.510; 21 CFR 314.530; FDORA 2022',
          },
        ],
      },

      {
        id: 'pediatric_commitments',
        section: 'post_marketing',
        question:
          'Address the pediatric development strategy. PREA requirements apply to most NDAs, and the initial Pediatric Study Plan (iPSP) should be submitted.',
        guidance:
          'Per the Pediatric Research Equity Act (PREA, 21 USC 355c, as amended by FDARA 2017), sponsors of new drugs must submit an initial Pediatric Study Plan (iPSP) no later than 60 days after the End-of-Phase 2 (EOP2) meeting or equivalent timepoint. The iPSP should outline the planned pediatric studies, including age groups, formulation, and study design. Orphan-designated drugs are exempt from PREA. Pediatric exclusivity (21 USC 355a, BPCA) provides 6 months of additional market exclusivity if FDA-issued Written Requests for pediatric studies are fulfilled. Per ICH E11(R1), age-appropriate formulations and juvenile animal studies (ICH S11) must be considered.',
        fields: [
          {
            id: 'prea_applicable',
            label: 'PREA Applicability',
            type: 'select',
            required: true,
            options: [
              { value: 'yes', label: 'Yes — PREA Applies (disease relevant to pediatric patients)' },
              { value: 'orphan_exempt', label: 'Exempt — Orphan Drug Designation' },
              { value: 'waiver', label: 'PREA Waiver Granted or Requested' },
              { value: 'deferral', label: 'PREA Deferral Granted or Requested' },
            ],
          },
          {
            id: 'ipsp_submitted',
            label: 'Initial Pediatric Study Plan (iPSP) Submitted to FDA',
            type: 'yes_no',
            visibleWhen: { field: 'prea_applicable', operator: 'eq', value: 'yes' },
            helpText:
              'Per FDARA 2017, the iPSP should be submitted no later than 60 days after the EOP2 meeting request. FDA provides feedback within 90 days, and the agreed-upon iPSP forms the basis for PREA commitments.',
          },
          {
            id: 'pediatric_studies_planned',
            label: 'Planned Pediatric Studies',
            type: 'textarea',
            placeholder:
              'e.g., Phase 1/2 dose-finding study in pediatric patients (aged 6-17 years) with EGFR mutation-positive NSCLC. Planned enrollment: 30 patients. PK-guided dose selection with adult PK bridging. Initiation: 2027.',
            visibleWhen: { field: 'prea_applicable', operator: 'eq', value: 'yes' },
          },
          {
            id: 'pediatric_formulation',
            label: 'Pediatric Formulation Development Planned',
            type: 'yes_no',
            visibleWhen: { field: 'prea_applicable', operator: 'eq', value: 'yes' },
            helpText:
              'Per ICH E11(R1) and FDA Guidance on Pediatric Formulations, an age-appropriate formulation (e.g., oral solution, mini-tablets, dispersible tablets) may be required for younger age groups.',
          },
          {
            id: 'pediatric_exclusivity_eligible',
            label: 'Pediatric Exclusivity (505A) Eligibility',
            type: 'yes_no',
            helpText:
              'Per BPCA (21 USC 355a), pediatric exclusivity provides 6 months of additional market exclusivity if FDA-issued Written Requests are fulfilled. This applies to NMEs with remaining patent life or marketing exclusivity.',
          },
          {
            id: 'bpca_written_request',
            label: 'Has FDA Issued a Written Request (WR) Under BPCA?',
            type: 'yes_no',
            helpText:
              'A Written Request from FDA specifies the pediatric studies needed to obtain pediatric exclusivity. It is separate from PREA obligations.',
          },
        ],
        defaultNext: 'submission_readiness',
        issueChecks: [
          {
            id: 'ipsp_not_submitted',
            condition: { field: 'ipsp_submitted', operator: 'eq', value: false },
            severity: 'warning',
            title: 'iPSP Should Be Submitted',
            message:
              'PREA applies to this product, but the initial Pediatric Study Plan (iPSP) has not been submitted to FDA. Per FDARA 2017, the iPSP should be submitted no later than 60 days after the EOP2 meeting request. Failure to submit the iPSP may delay NDA approval, as FDA may require pediatric study commitments as a condition of approval.',
            reference: 'PREA (21 USC 355c); FDARA 2017; FDA Guidance: Pediatric Study Plans (2020)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 10 — Review & Submission                                */
      /* ================================================================ */

      {
        id: 'submission_readiness',
        section: 'review_submission',
        question:
          'Assess submission readiness. Has a Pre-NDA meeting been held, is patent information prepared, and are all regulatory prerequisites in place?',
        guidance:
          'Per 21 CFR 314.50(h) and 21 CFR 314.53, NDA applicants must submit patent information (Form FDA 3542a) for each drug substance and drug product patent. Patent certifications per 21 CFR 314.50(i) are required for 505(b)(2) applications (Paragraph I-IV certifications). Exclusivity claims (5-year NCE, 3-year clinical data, orphan 7-year, pediatric 6-month extension) should be identified. A Pre-NDA meeting (Type B, per FDA Guidance "Formal Meetings" (2017)) is strongly recommended to discuss filing strategy, labeling issues, REMS, and data requirements. Advisory Committee (AdCom) preparation may be needed if FDA refers the NDA to an advisory committee per 21 CFR 14.',
        fields: [
          {
            id: 'pre_nda_meeting_held',
            label: 'Pre-NDA Meeting (Type B) Held with FDA',
            type: 'yes_no',
            helpText:
              'A Pre-NDA meeting is strongly recommended per FDA Guidance "Formal Meetings Between the FDA and Sponsors" (2017). Topics include: agreement on NDA content and format, labeling discussions, REMS requirements, and any outstanding data requests.',
          },
          {
            id: 'fda_feedback_addressed',
            label: 'Summary of FDA Pre-NDA Meeting Feedback',
            type: 'textarea',
            placeholder:
              'e.g., FDA agreed with the proposed eCTD structure. Requested additional subgroup analysis by biomarker status. Recommended boxed warning language for hepatotoxicity. Agreed that pediatric studies can be deferred per PREA.',
            visibleWhen: { field: 'pre_nda_meeting_held', operator: 'eq', value: true },
          },
          {
            id: 'advisory_committee_anticipated',
            label: 'Advisory Committee (AdCom) Meeting Anticipated',
            type: 'yes_no',
            helpText:
              'FDA may convene an advisory committee meeting per 21 CFR Part 14. AdCom meetings are more likely for NMEs, novel mechanisms, controversial benefit-risk profiles, or first-in-class products. Prepare briefing documents, question responses, and presentation materials.',
          },
          {
            id: 'adcom_preparation',
            label: 'AdCom Preparation Status',
            type: 'textarea',
            placeholder:
              'e.g., Briefing document outline prepared. Key topics identified: benefit-risk in 2nd line, hepatotoxicity management, comparability to existing therapies. KOL consultants identified for panel preparation.',
            visibleWhen: { field: 'advisory_committee_anticipated', operator: 'eq', value: true },
          },
          {
            id: 'patent_info_prepared',
            label: 'Patent Information Prepared (Form FDA 3542a)',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 314.53, patent information (drug substance, drug product, method-of-use patents) must be submitted on Form FDA 3542a. This information is published in the Orange Book upon approval.',
          },
          {
            id: 'exclusivity_claims',
            label: 'Exclusivity Claims',
            type: 'multi_select',
            options: [
              { value: 'nce_5yr', label: '5-Year NCE Exclusivity (21 USC 355(c)(3)(E)(ii))' },
              { value: '3yr_clinical', label: '3-Year Clinical Data Exclusivity (21 USC 355(c)(3)(E)(iii))' },
              { value: 'orphan_7yr', label: '7-Year Orphan Drug Exclusivity (21 USC 360bb)' },
              { value: 'pediatric_6mo', label: '6-Month Pediatric Exclusivity (21 USC 355a)' },
              { value: 'none', label: 'No Exclusivity Claims' },
            ],
            helpText:
              'NCE exclusivity (5 years) applies to drugs containing an active moiety never previously approved. Clinical data exclusivity (3 years) applies to supplements with new clinical studies. Orphan exclusivity (7 years) applies to drugs with orphan designation.',
          },
          {
            id: 'patent_certifications',
            label: 'Patent Certifications (for 505(b)(2) applications)',
            type: 'select',
            options: [
              { value: 'paragraph_i', label: 'Paragraph I — No patent listed' },
              { value: 'paragraph_ii', label: 'Paragraph II — Patent has expired' },
              { value: 'paragraph_iii', label: 'Paragraph III — Patent will expire (date)' },
              { value: 'paragraph_iv', label: 'Paragraph IV — Patent is invalid or not infringed' },
              { value: 'not_applicable', label: 'Not Applicable (505(b)(1) NDA)' },
            ],
            helpText:
              'Per 21 CFR 314.50(i), 505(b)(2) applicants must certify to each patent listed in the Orange Book for the reference listed drug. Paragraph IV certifications trigger a 45-day notice to the patent holder and may result in patent litigation with a 30-month stay.',
          },
          {
            id: 'orange_book_listing',
            label: 'Orange Book Listing Information Prepared',
            type: 'yes_no',
            helpText:
              'Upon NDA approval, patent and exclusivity information is published in the Orange Book. Ensure all relevant patents and exclusivity claims are accurately listed per 21 CFR 314.53.',
          },
        ],
        defaultNext: 'final_review',
      },

      {
        id: 'final_review',
        section: 'review_submission',
        question:
          'Complete the final submission checklist. All administrative documents must be included per 21 CFR 314.50.',
        guidance:
          'Per 21 CFR 314.50, the NDA must include: Form FDA 356h (Application Form), financial disclosure information (21 CFR Part 54), debarment certification (21 CFR 314.50(a)(5)(iv)), field copy certification, environmental assessment or categorical exclusion (21 CFR Part 25), and a cover letter. The field copy certification confirms that a complete copy of Section 11 (case report tabulations/forms for serious AEs and study dropouts) has been provided. Financial disclosure (21 CFR 54) requires disclosure of financial interests of clinical investigators. The environmental assessment usually qualifies for categorical exclusion per 21 CFR 25.31(a). The target submission date should account for the 60-day filing period and PDUFA review clock.',
        fields: [
          {
            id: 'form_fda_356h_complete',
            label: 'Form FDA 356h (Application Form) Complete',
            type: 'yes_no',
            required: true,
            helpText:
              'Form FDA 356h is the official NDA application form. It must be signed by the applicant or authorized representative and identifies all NDA components.',
          },
          {
            id: 'financial_disclosure',
            label: 'Financial Disclosure (21 CFR Part 54) Complete',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 54.4, applicants must submit financial disclosure or certification for all clinical investigators who conducted covered clinical studies. Investigators with disclosable financial interests must be identified.',
          },
          {
            id: 'debarment_certification',
            label: 'Debarment Certification (21 CFR 314.50(a)(5)(iv)) Complete',
            type: 'yes_no',
            required: true,
            helpText:
              'The applicant must certify that no debarred person (as defined by 21 USC 335a) was involved in the development of the drug. Check the FDA Debarment List.',
          },
          {
            id: 'field_copy_certification',
            label: 'Field Copy Certification Complete',
            type: 'yes_no',
            required: true,
            helpText:
              'The field copy certification confirms that a complete copy of the NDA Section 11 (case report tabulations/forms) is available for FDA district office review if needed for pre-approval inspections.',
          },
          {
            id: 'environmental_assessment',
            label: 'Environmental Assessment or Categorical Exclusion',
            type: 'select',
            required: true,
            options: [
              {
                value: 'categorical_exclusion',
                label: 'Categorical Exclusion (21 CFR 25.31(a))',
                description: 'Most NDAs qualify for categorical exclusion',
              },
              {
                value: 'ea_prepared',
                label: 'Environmental Assessment (EA) Prepared',
                description: 'Required if categorical exclusion does not apply',
              },
              {
                value: 'not_addressed',
                label: 'Not Yet Addressed',
                flagsIssue: true,
              },
            ],
          },
          {
            id: 'cover_letter_prepared',
            label: 'NDA Cover Letter Prepared',
            type: 'yes_no',
            required: true,
            helpText:
              'The cover letter should identify the NDA, list all components, reference any pre-NDA meeting agreements, and highlight any special considerations (expedited pathways, breakthrough designation, etc.).',
          },
          {
            id: 'target_submission_date',
            label: 'Target NDA Submission Date',
            type: 'date',
            required: true,
          },
          {
            id: 'pdufa_date_target',
            label: 'Anticipated PDUFA Goal Date',
            type: 'date',
            helpText:
              'PDUFA goal date = filing date + 10 months (standard review) or 6 months (priority review). Filing date is typically 60 days after receipt.',
          },
          {
            id: 'submission_notes',
            label: 'Additional Submission Notes or Considerations',
            type: 'textarea',
            placeholder:
              'e.g., Rolling submission planned under Fast Track designation. First module to be submitted Q1 2027 with complete eCTD expected Q3 2027. Companion diagnostic (CDx) NDA submitted in parallel to CDRH.',
          },
        ],
        defaultNext: null,
        issueChecks: [
          {
            id: 'form_356h_required',
            condition: { field: 'form_fda_356h_complete', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Form FDA 356h Required',
            message:
              'Form FDA 356h (Application to Market a New Drug, Biologic, or Antibiotic Drug for Human Use) is a mandatory NDA component. The signed form must be included as the first document in Module 1 of the eCTD submission. FDA will issue a Refuse to Receive if Form 356h is missing.',
            reference: '21 CFR 314.50(a)',
          },
          {
            id: 'financial_disclosure_required',
            condition: { field: 'financial_disclosure', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Financial Disclosure Required',
            message:
              'Financial disclosure information (Form FDA 3454/3455) must be submitted per 21 CFR Part 54. The applicant must certify or disclose financial interests of all clinical investigators who conducted covered studies. Failure to submit financial disclosure will result in a Refuse to File.',
            reference: '21 CFR 54',
          },
        ],
      },
    ],
  };
}
