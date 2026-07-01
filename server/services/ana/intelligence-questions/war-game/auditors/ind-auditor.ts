/**
 * IND Submission War Game Auditor
 *
 * Simulates FDA reviewer scrutiny of an Investigational New Drug application.
 * Rules cover CMC completeness, nonclinical package adequacy, clinical plan
 * quality, regulatory history, and submission format compliance.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/ind-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding } from '../types.js';

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

function includes(val: unknown, search: string): boolean {
  if (typeof val === 'string') return val.toLowerCase().includes(search.toLowerCase());
  if (Array.isArray(val)) return val.some((v) => includes(v, search));
  return false;
}

/* ─── CMC Completeness (ind_001 – ind_007) ─────────────────────────────── */

const cmcRules: AuditRule[] = [
  {
    id: 'ind_001',
    dimension: 'completeness',
    title: 'No drug substance manufacturer identified',
    question:
      'Who is the manufacturer of the drug substance, and have they been qualified under current Good Manufacturing Practice?',
    check(answers) {
      if (isEmpty(answers.drug_substance_manufacturer)) {
        return {
          id: 'ind_001',
          dimension: 'completeness',
          severity: 'critical',
          title: 'No drug substance manufacturer identified',
          question:
            'Who is the manufacturer of the drug substance, and have they been qualified under current Good Manufacturing Practice?',
          observation:
            'The application does not identify a manufacturer for the drug substance. FDA reviewers in the Office of Pharmaceutical Quality will require this information before allowing clinical trials to proceed.',
          requirement:
            'Per 21 CFR 312.23(a)(7), the IND must include a description of the drug substance including the name and address of its manufacturer. The Chemistry, Manufacturing, and Controls (CMC) section is incomplete without manufacturer identification.',
          reference: '21 CFR 312.23(a)(7)(i); FDA Guidance for Industry: Content and Format of INDs for Phase 1 Studies (2015)',
          recommendation:
            'Identify the drug substance manufacturer, including facility name, address, and any applicable establishment registration or Drug Master File (DMF) reference. Provide evidence of GMP qualification or a letter of authorization from the DMF holder.',
          relatedFields: ['drug_substance_manufacturer', 'gmp_compliance', 'drug_master_file'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_002',
    dimension: 'completeness',
    title: 'No stability data available',
    question:
      'What stability data support the proposed shelf life and storage conditions of the drug product to be used in clinical trials?',
    check(answers) {
      if (answers.stability_data_available === false || answers.stability_data_available === 'no' || isEmpty(answers.stability_data_available)) {
        return {
          id: 'ind_002',
          dimension: 'completeness',
          severity: 'critical',
          title: 'No stability data available',
          question:
            'What stability data support the proposed shelf life and storage conditions of the drug product to be used in clinical trials?',
          observation:
            'The sponsor has not provided stability data for the drug product. Without these data, FDA cannot assess whether the investigational product will maintain its identity, strength, quality, and purity through the duration of the proposed clinical trial.',
          requirement:
            'Per 21 CFR 312.23(a)(7)(iv)(b), the IND must provide brief stability information. ICH Q1A(R2) outlines the required stability testing conditions. At minimum, Phase 1 INDs should include preliminary stability data under proposed storage conditions.',
          reference: '21 CFR 312.23(a)(7)(iv)(b); ICH Q1A(R2) Stability Testing of New Drug Substances and Products',
          recommendation:
            'Provide available accelerated and real-time stability data, even if limited. Include at minimum 1-3 months of data under proposed storage conditions. Define container-closure system and storage conditions. If stability studies are ongoing, provide a commitment to submit updated data.',
          relatedFields: ['stability_data_available', 'formulation_type', 'dosage_form'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_003',
    dimension: 'completeness',
    title: 'No Drug Master File reference',
    question:
      'Has a Drug Master File been filed for the drug substance or any excipient used in the formulation, and has a Letter of Authorization been provided?',
    check(answers) {
      if (isEmpty(answers.drug_master_file) && !isEmpty(answers.drug_substance_manufacturer)) {
        return {
          id: 'ind_003',
          dimension: 'completeness',
          severity: 'warning',
          title: 'No Drug Master File reference',
          question:
            'Has a Drug Master File been filed for the drug substance or any excipient used in the formulation, and has a Letter of Authorization been provided?',
          observation:
            'No Drug Master File (DMF) reference has been provided. While a DMF is not strictly required for an IND, its absence means all manufacturing, processing, and quality information must be included directly in the application.',
          requirement:
            'Per 21 CFR 314.420, a DMF may be submitted to support an IND. If the drug substance manufacturer holds a DMF, a Letter of Authorization should be included so FDA can cross-reference confidential manufacturing information.',
          reference: '21 CFR 314.420; FDA Guidance for Industry: Drug Master Files (2019)',
          recommendation:
            'Determine whether the drug substance manufacturer holds an active DMF with FDA. If so, obtain a Letter of Authorization and include the DMF number. If no DMF exists, ensure all required CMC information is provided directly in the IND application per 21 CFR 312.23(a)(7).',
          relatedFields: ['drug_master_file', 'drug_substance_manufacturer', 'gmp_compliance'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_004',
    dimension: 'regulatory_alignment',
    title: 'GMP non-compliance for drug product manufacturer',
    question:
      'Is the drug product manufactured in compliance with current Good Manufacturing Practice (cGMP), and has the facility been inspected by FDA?',
    check(answers) {
      if (answers.gmp_compliance === false || answers.gmp_compliance === 'no') {
        return {
          id: 'ind_004',
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'GMP non-compliance for drug product manufacturer',
          question:
            'Is the drug product manufactured in compliance with current Good Manufacturing Practice (cGMP), and has the facility been inspected by FDA?',
          observation:
            'The sponsor has indicated that the drug product is not manufactured under cGMP conditions. This is a significant regulatory concern that may result in a clinical hold.',
          requirement:
            'Per 21 CFR 211 and 21 CFR 312.23(a)(7), the investigational drug must be manufactured under conditions that ensure its safety, identity, strength, quality, and purity. Phase 1 drugs require compliance with Phase-appropriate cGMP as described in FDA Guidance.',
          reference:
            '21 CFR 211; 21 CFR 312.23(a)(7); FDA Guidance for Industry: CGMP for Phase 1 Investigational Drugs (2008)',
          recommendation:
            'Ensure the manufacturing facility meets Phase-appropriate cGMP requirements. If the facility has not been inspected, provide documentation of internal quality systems, SOPs, and equipment qualification. Consider using a contract manufacturing organization (CMO) with established GMP compliance.',
          relatedFields: ['gmp_compliance', 'drug_product_manufacturer', 'manufacturing_facility'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_005',
    dimension: 'regulatory_alignment',
    title: 'No environmental assessment or exemption claim',
    question:
      'Has an environmental assessment been prepared, or does the investigational drug qualify for a categorical exclusion under 21 CFR 25?',
    check(answers) {
      if (isEmpty(answers.environmental_assessment)) {
        return {
          id: 'ind_005',
          dimension: 'regulatory_alignment',
          severity: 'warning',
          title: 'No environmental assessment or exemption claim',
          question:
            'Has an environmental assessment been prepared, or does the investigational drug qualify for a categorical exclusion under 21 CFR 25?',
          observation:
            'The application does not address the environmental impact of the investigational drug. While most INDs qualify for categorical exclusion, the claim must still be explicitly stated.',
          requirement:
            'Per 21 CFR 25.15(a), each IND must include either an environmental assessment or a claim of categorical exclusion under 21 CFR 25.31. Failure to address this requirement may result in an administrative deficiency notice.',
          reference: '21 CFR 25.15(a); 21 CFR 25.31; 21 CFR 25.40',
          recommendation:
            'Include a statement claiming categorical exclusion under 21 CFR 25.31(e) for clinical investigations, or prepare a full environmental assessment if the drug or its manufacturing process may significantly affect the environment. Most Phase 1 INDs qualify for categorical exclusion.',
          relatedFields: ['environmental_assessment', 'formulation_type', 'route_of_administration'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_006',
    dimension: 'completeness',
    title: 'Missing dosage form specification',
    question:
      'What is the dosage form of the investigational drug product, and how does it relate to the proposed route of administration?',
    check(answers) {
      if (isEmpty(answers.dosage_form)) {
        return {
          id: 'ind_006',
          dimension: 'completeness',
          severity: 'critical',
          title: 'Missing dosage form specification',
          question:
            'What is the dosage form of the investigational drug product, and how does it relate to the proposed route of administration?',
          observation:
            'The dosage form has not been specified. This is a fundamental element of the CMC section and is required for FDA to evaluate the drug product description, manufacturing process, and controls.',
          requirement:
            'Per 21 CFR 312.23(a)(7)(iv)(a), the IND must include a list of all components used in the manufacture of the drug product, a quantitative composition, and the dosage form. The dosage form must be consistent with the proposed route of administration.',
          reference: '21 CFR 312.23(a)(7)(iv)(a); FDA Guidance for Industry: Content and Format of INDs for Phase 1 Studies (2015)',
          recommendation:
            'Specify the dosage form (e.g., tablet, capsule, injection, solution for infusion) and ensure it is appropriate for the stated route of administration. Include quantitative composition and describe the manufacturing process.',
          relatedFields: ['dosage_form', 'formulation_type', 'route_of_administration'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_007',
    dimension: 'completeness',
    title: 'Route of administration not specified',
    question:
      'What is the proposed route of administration, and has the nonclinical program adequately evaluated toxicity via this route?',
    check(answers) {
      if (isEmpty(answers.route_of_administration)) {
        return {
          id: 'ind_007',
          dimension: 'completeness',
          severity: 'critical',
          title: 'Route of administration not specified',
          question:
            'What is the proposed route of administration, and has the nonclinical program adequately evaluated toxicity via this route?',
          observation:
            'The route of administration has not been defined. Without this information, FDA cannot assess whether the nonclinical studies used a relevant route, whether the dosage form is appropriate, or whether the safety monitoring plan is adequate.',
          requirement:
            'Per 21 CFR 312.23(a)(7)(iv)(a), the IND must specify the route of administration. ICH M3(R2) requires that nonclinical studies use a route relevant to the proposed clinical use.',
          reference: '21 CFR 312.23(a)(7)(iv)(a); ICH M3(R2) Section 4',
          recommendation:
            'Specify the route of administration (e.g., oral, intravenous, subcutaneous, intramuscular, topical). Ensure nonclinical toxicology studies employed the same or a scientifically justified alternative route. Update the dosage form and formulation information accordingly.',
          relatedFields: ['route_of_administration', 'dosage_form', 'nonclinical_studies_completed', 'species_used'],
        };
      }
      return null;
    },
  },
];

/* ─── Nonclinical Package (ind_008 – ind_015) ─────────────────────────── */

const nonclinicalRules: AuditRule[] = [
  {
    id: 'ind_008',
    dimension: 'regulatory_alignment',
    title: 'Non-GLP nonclinical studies',
    question:
      'Were the pivotal nonclinical safety studies conducted in compliance with Good Laboratory Practice (GLP) per 21 CFR Part 58?',
    check(answers) {
      if (answers.glp_compliance === false || answers.glp_compliance === 'no') {
        return {
          id: 'ind_008',
          dimension: 'regulatory_alignment',
          severity: 'critical',
          title: 'Non-GLP nonclinical studies',
          question:
            'Were the pivotal nonclinical safety studies conducted in compliance with Good Laboratory Practice (GLP) per 21 CFR Part 58?',
          observation:
            'The pivotal nonclinical safety studies were not conducted under GLP conditions. FDA requires GLP compliance for studies intended to support the safety of an investigational drug in humans.',
          requirement:
            'Per 21 CFR 312.23(a)(8)(iii), nonclinical studies must be conducted in compliance with 21 CFR Part 58 (GLP). Non-GLP studies are acceptable only for pharmacology/screening studies, not for pivotal toxicology studies that support initial clinical dosing.',
          reference: '21 CFR 312.23(a)(8)(iii); 21 CFR Part 58; ICH M3(R2) Section 1',
          recommendation:
            'Conduct pivotal repeat-dose toxicology studies under GLP conditions. If non-GLP studies are being submitted, clearly identify them as such and provide a rationale. Any deviations from GLP must be documented and their impact on data integrity assessed.',
          relatedFields: ['glp_compliance', 'nonclinical_studies_completed', 'toxicology_findings_summary'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_009',
    dimension: 'scientific_rigor',
    title: 'No NOAEL established',
    question:
      'What is the No Observed Adverse Effect Level (NOAEL) from the pivotal toxicology studies, and how was it used to derive the maximum recommended starting dose?',
    check(answers) {
      if (isEmpty(answers.noael)) {
        return {
          id: 'ind_009',
          dimension: 'scientific_rigor',
          severity: 'critical',
          title: 'No NOAEL established',
          question:
            'What is the No Observed Adverse Effect Level (NOAEL) from the pivotal toxicology studies, and how was it used to derive the maximum recommended starting dose?',
          observation:
            'No NOAEL has been established from the nonclinical toxicology program. The NOAEL is the primary basis for calculating the maximum recommended starting dose (MRSD) in first-in-human studies.',
          requirement:
            'Per FDA Guidance for Industry: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers (2005), the NOAEL from the most appropriate animal species must be identified and converted to a human equivalent dose (HED) using body surface area scaling.',
          reference:
            'FDA Guidance: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials (2005); ICH M3(R2) Section 7; ICH S9 (for anticancer drugs)',
          recommendation:
            'Identify the NOAEL from the most sensitive species in the pivotal toxicology program. Calculate the HED using appropriate allometric scaling factors. Apply a safety factor (typically 10-fold) to derive the MRSD. Document the complete dose derivation with all assumptions.',
          relatedFields: ['noael', 'starting_dose_justification', 'species_used', 'toxicology_findings_summary'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_010',
    dimension: 'scientific_rigor',
    title: 'Single species toxicology program',
    question:
      'Have toxicology studies been conducted in two relevant species (one rodent and one non-rodent), and if not, what is the scientific justification for a single-species program?',
    check(answers) {
      if (!isEmpty(answers.species_used)) {
        const speciesVal = String(answers.species_used).toLowerCase();
        const speciesList = speciesVal.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
        if (speciesList.length < 2 && !includes(speciesVal, 'two') && !includes(speciesVal, '2 species')) {
          return {
            id: 'ind_010',
            dimension: 'scientific_rigor',
            severity: 'warning',
            title: 'Single species toxicology program',
            question:
              'Have toxicology studies been conducted in two relevant species (one rodent and one non-rodent), and if not, what is the scientific justification for a single-species program?',
            observation:
              'The nonclinical program appears to include toxicology studies in only a single species. ICH M3(R2) generally requires repeat-dose toxicity studies in two mammalian species (one rodent and one non-rodent) to support clinical trials.',
            requirement:
              'ICH M3(R2) Section 5 requires repeat-dose toxicity studies in two species. A single-species approach is acceptable only with scientific justification (e.g., biologics where only one species is pharmacologically relevant, or when supported by pre-IND FDA agreement).',
            reference: 'ICH M3(R2) Sections 5 and 10; ICH S6(R1) for biotechnology-derived products',
            recommendation:
              'If only one species was used, provide scientific justification (e.g., species-specific pharmacology for biologics). Consider conducting studies in a second relevant species before advancing beyond Phase 1. Document any FDA pre-IND agreement regarding single-species approach.',
            relatedFields: ['species_used', 'nonclinical_studies_completed', 'mechanism_of_action', 'pre_ind_meeting_held'],
          };
        }
      }
      return null;
    },
  },
  {
    id: 'ind_011',
    dimension: 'scientific_rigor',
    title: 'No carcinogenicity assessment for chronic therapy',
    question:
      'Is carcinogenicity testing required based on the duration of proposed clinical use, and if so, has it been completed or appropriately deferred?',
    check(answers) {
      if (
        (answers.carcinogenicity_required === true || answers.carcinogenicity_required === 'yes') &&
        !isEmpty(answers.proposed_indication)
      ) {
        const indication = String(answers.proposed_indication).toLowerCase();
        const chronicConditions = ['chronic', 'long-term', 'maintenance', 'prophylaxis', 'prevention'];
        const isChronicUse = chronicConditions.some((c) => indication.includes(c));
        if (isChronicUse) {
          return {
            id: 'ind_011',
            dimension: 'scientific_rigor',
            severity: 'warning',
            title: 'No carcinogenicity assessment for chronic therapy',
            question:
              'Is carcinogenicity testing required based on the duration of proposed clinical use, and if so, has it been completed or appropriately deferred?',
            observation:
              'The sponsor has indicated that carcinogenicity testing is required, and the proposed indication suggests chronic or long-term use. ICH S1A requires carcinogenicity assessment for drugs intended for continuous use of six months or more.',
            requirement:
              'Per ICH S1A, carcinogenicity studies are required for drugs intended for at least 6 months of continuous use. Per ICH M3(R2), these studies should be completed before filing an NDA but are not required for IND submission. However, any available genotoxicity or structural alerts should be discussed.',
            reference: 'ICH S1A Guideline on the Need for Carcinogenicity Studies; ICH S1B(R1); ICH M3(R2) Section 8',
            recommendation:
              'Acknowledge the carcinogenicity requirement in the IND. Provide a timeline for completing carcinogenicity studies. Include results of genotoxicity testing (Ames test, chromosomal aberration) and discuss any structural alerts. If the drug class has known carcinogenicity signals, provide risk assessment.',
            relatedFields: ['carcinogenicity_required', 'proposed_indication', 'genotoxicity_completed', 'therapeutic_class'],
          };
        }
      }
      return null;
    },
  },
  {
    id: 'ind_012',
    dimension: 'completeness',
    title: 'No genotoxicity studies completed',
    question:
      'Have standard battery genotoxicity studies (Ames, in vitro chromosomal aberration, and in vivo micronucleus) been completed?',
    check(answers) {
      if (answers.genotoxicity_completed === false || answers.genotoxicity_completed === 'no') {
        return {
          id: 'ind_012',
          dimension: 'completeness',
          severity: 'critical',
          title: 'No genotoxicity studies completed',
          question:
            'Have standard battery genotoxicity studies (Ames, in vitro chromosomal aberration, and in vivo micronucleus) been completed?',
          observation:
            'Genotoxicity studies have not been completed. The standard battery of genotoxicity tests is required before initiating clinical trials under ICH guidance.',
          requirement:
            'Per ICH S2(R1) and ICH M3(R2) Section 6, a standard genotoxicity battery (bacterial reverse mutation assay, in vitro cytogenetic assay or mouse lymphoma assay, and in vivo test for chromosomal damage) must be completed before first-in-human exposure. For short-duration Phase 1 studies, at minimum the in vitro tests should be completed.',
          reference: 'ICH S2(R1) Guidance on Genotoxicity Testing; ICH M3(R2) Section 6; 21 CFR 312.23(a)(8)',
          recommendation:
            'Complete at minimum the in vitro components of the genotoxicity battery (Ames test and chromosomal aberration or mouse lymphoma assay) before IND submission. The in vivo micronucleus test should be completed before initiating repeat-dose clinical studies. Submit results with full study reports or adequate summaries.',
          relatedFields: ['genotoxicity_completed', 'nonclinical_studies_completed', 'carcinogenicity_required'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_013',
    dimension: 'completeness',
    title: 'Insufficient pharmacology summary',
    question:
      'Does the pharmacology summary adequately describe the primary pharmacodynamic effects, secondary pharmacology, and safety pharmacology (cardiovascular, respiratory, CNS) of the investigational drug?',
    check(answers) {
      if (isEmpty(answers.pharmacology_summary)) {
        return {
          id: 'ind_013',
          dimension: 'completeness',
          severity: 'warning',
          title: 'Insufficient pharmacology summary',
          question:
            'Does the pharmacology summary adequately describe the primary pharmacodynamic effects, secondary pharmacology, and safety pharmacology (cardiovascular, respiratory, CNS) of the investigational drug?',
          observation:
            'No pharmacology summary has been provided. FDA reviewers expect a concise summary of primary pharmacodynamic activity and safety pharmacology (core battery) findings to evaluate the drug\'s benefit-risk profile.',
          requirement:
            'Per 21 CFR 312.23(a)(8) and ICH S7A, the IND must include pharmacology information including primary pharmacodynamics and safety pharmacology (hERG, cardiovascular telemetry, respiratory function, CNS assessment). ICH S7B addresses proarrhythmic risk evaluation.',
          reference: '21 CFR 312.23(a)(8); ICH S7A Safety Pharmacology Studies; ICH S7B Non-Clinical Evaluation of QT/QTc Prolongation',
          recommendation:
            'Provide a pharmacology summary covering: (1) primary pharmacodynamic studies demonstrating mechanism of action; (2) safety pharmacology core battery (cardiovascular including hERG and in vivo telemetry, respiratory, CNS); (3) secondary pharmacology screen. Include dose-response relationships and relevance to proposed clinical doses.',
          relatedFields: ['pharmacology_summary', 'mechanism_of_action', 'therapeutic_class'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_014',
    dimension: 'completeness',
    title: 'No PK summary provided',
    question:
      'What are the absorption, distribution, metabolism, and excretion (ADME) characteristics of the drug, and how do they inform dose selection and clinical pharmacology planning?',
    check(answers) {
      if (isEmpty(answers.pk_summary)) {
        return {
          id: 'ind_014',
          dimension: 'completeness',
          severity: 'warning',
          title: 'No PK summary provided',
          question:
            'What are the absorption, distribution, metabolism, and excretion (ADME) characteristics of the drug, and how do they inform dose selection and clinical pharmacology planning?',
          observation:
            'No pharmacokinetic summary has been provided. ADME information is essential for understanding drug disposition, predicting human pharmacokinetics, and informing clinical dose selection.',
          requirement:
            'Per 21 CFR 312.23(a)(8) and ICH M3(R2) Section 4, the IND must include available pharmacokinetic data. For first-in-human studies, PK data from at least one animal species should be available to support human dose projections.',
          reference: '21 CFR 312.23(a)(8)(i); ICH M3(R2) Section 4; FDA Guidance: Safety Testing of Drug Metabolites (2020)',
          recommendation:
            'Provide a PK summary including: (1) single-dose and repeat-dose PK parameters (Cmax, AUC, t1/2, clearance, volume of distribution) in relevant species; (2) in vitro metabolism data (CYP identification, metabolite profiling); (3) protein binding data; (4) allometric scaling or PBPK modeling to predict human PK parameters.',
          relatedFields: ['pk_summary', 'starting_dose_justification', 'noael', 'mechanism_of_action'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_015',
    dimension: 'documentation',
    title: 'Toxicology findings not adequately summarized',
    question:
      'Are the nonclinical toxicology findings clearly summarized with target organ identification, dose-response relationships, and reversibility assessment?',
    check(answers) {
      if (isEmpty(answers.toxicology_findings_summary) && !isEmpty(answers.nonclinical_studies_completed)) {
        return {
          id: 'ind_015',
          dimension: 'documentation',
          severity: 'warning',
          title: 'Toxicology findings not adequately summarized',
          question:
            'Are the nonclinical toxicology findings clearly summarized with target organ identification, dose-response relationships, and reversibility assessment?',
          observation:
            'Nonclinical studies have been completed, but no toxicology findings summary has been provided. FDA reviewers in the Pharmacology/Toxicology division require a clear integrated summary to evaluate human risk.',
          requirement:
            'Per 21 CFR 312.23(a)(8), the IND must include adequate information about pharmacological and toxicological studies to permit an evaluation of whether the drug is reasonably safe for initial testing in humans. An integrated summary of toxicological findings is expected.',
          reference:
            '21 CFR 312.23(a)(8); ICH M4S(R2) Common Technical Document — Nonclinical Overview; FDA Reviewer Guidance: Integration of Toxicology Findings',
          recommendation:
            'Provide an integrated summary of toxicology findings including: (1) target organs of toxicity; (2) dose-response relationships for key findings; (3) reversibility or progression of findings during recovery periods; (4) relationship of findings to expected human exposures; (5) NOAEL determination for each study. Include tabular summaries of study designs and findings across all completed studies.',
          relatedFields: ['toxicology_findings_summary', 'nonclinical_studies_completed', 'noael', 'species_used'],
        };
      }
      return null;
    },
  },
];

/* ─── Clinical Plan (ind_016 – ind_022) ────────────────────────────────── */

const clinicalPlanRules: AuditRule[] = [
  {
    id: 'ind_016',
    dimension: 'scientific_rigor',
    title: 'First-in-human with inadequate starting dose justification',
    question:
      'How was the proposed starting dose derived from nonclinical data, and does the justification follow FDA guidance for maximum recommended starting dose calculation?',
    check(answers) {
      if (
        (answers.first_in_human === true || answers.first_in_human === 'yes') &&
        isEmpty(answers.starting_dose_justification)
      ) {
        return {
          id: 'ind_016',
          dimension: 'scientific_rigor',
          severity: 'critical',
          title: 'First-in-human with inadequate starting dose justification',
          question:
            'How was the proposed starting dose derived from nonclinical data, and does the justification follow FDA guidance for maximum recommended starting dose calculation?',
          observation:
            'This is a first-in-human study, but no starting dose justification has been provided. The absence of a rigorous dose derivation is one of the most common reasons for FDA clinical holds on Phase 1 INDs.',
          requirement:
            'Per FDA Guidance: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials (2005), the starting dose must be derived from the NOAEL in the most appropriate animal species, converted to a human equivalent dose (HED) using allometric scaling, and divided by a safety factor (typically 10x). For biologics, additional PK/PD modeling may be required.',
          reference:
            'FDA Guidance: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers (2005); 21 CFR 312.42(b)(1)(i)',
          recommendation:
            'Provide a complete starting dose justification including: (1) NOAEL from the most sensitive species; (2) HED calculation with body surface area scaling factors; (3) safety margin (typically at least 10-fold); (4) consideration of pharmacologically active dose (PAD); (5) MABEL approach if applicable (especially for biologics). The starting dose should be the lower of NOAEL/10 and PAD/10.',
          relatedFields: ['first_in_human', 'starting_dose_justification', 'noael', 'dose_escalation_scheme'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_017',
    dimension: 'scientific_rigor',
    title: 'No dose escalation scheme for Phase 1',
    question:
      'What dose escalation scheme will be used, and what decision rules govern dose escalation, de-escalation, and stopping?',
    check(answers) {
      const phase = String(answers.proposed_phase ?? '').toLowerCase();
      const isPhase1 = includes(phase, '1') || includes(phase, 'i');
      if (isPhase1 && isEmpty(answers.dose_escalation_scheme)) {
        return {
          id: 'ind_017',
          dimension: 'scientific_rigor',
          severity: 'critical',
          title: 'No dose escalation scheme for Phase 1',
          question:
            'What dose escalation scheme will be used, and what decision rules govern dose escalation, de-escalation, and stopping?',
          observation:
            'This is a Phase 1 study with no dose escalation scheme described. FDA expects a clearly defined escalation method with pre-specified decision rules for dose-limiting toxicity (DLT) evaluation.',
          requirement:
            'Per 21 CFR 312.23(a)(6), the IND must include a protocol with a description of the dose escalation plan. FDA Guidance on adaptive designs and the Project Optimus initiative emphasize the need for well-justified escalation strategies and stopping rules.',
          reference:
            '21 CFR 312.23(a)(6); FDA Project Optimus (Dose Optimization); FDA Guidance: Adaptive Designs for Clinical Trials (2019)',
          recommendation:
            'Define a dose escalation scheme such as 3+3, modified Fibonacci, accelerated titration, Bayesian optimal interval (BOIN), or continual reassessment method (CRM). Specify: (1) DLT definition and evaluation window; (2) escalation decision rules; (3) de-escalation criteria; (4) stopping rules for safety; (5) maximum tolerated dose (MTD) determination criteria; (6) number of subjects per cohort.',
          relatedFields: ['dose_escalation_scheme', 'proposed_phase', 'starting_dose_justification', 'safety_monitoring_plan'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_018',
    dimension: 'practical_feasibility',
    title: 'Large planned enrollment for initial IND',
    question:
      'Is the proposed enrollment size appropriate for the study phase, and does it reflect the available safety data to support exposure of this number of subjects?',
    check(answers) {
      const enrollment = Number(answers.planned_enrollment);
      const phase = String(answers.proposed_phase ?? '').toLowerCase();
      const isPhase1 = includes(phase, '1') || includes(phase, 'i');
      const indType = String(answers.ind_type ?? '').toLowerCase();
      if (isPhase1 && indType === 'initial' && !isNaN(enrollment) && enrollment > 100) {
        return {
          id: 'ind_018',
          dimension: 'practical_feasibility',
          severity: 'warning',
          title: 'Large planned enrollment for initial IND',
          question:
            'Is the proposed enrollment size appropriate for the study phase, and does it reflect the available safety data to support exposure of this number of subjects?',
          observation:
            `The initial Phase 1 IND proposes enrollment of ${enrollment} subjects, which is unusually large for an initial Phase 1 study. FDA may question whether the nonclinical safety package supports this level of human exposure at this stage of development.`,
          requirement:
            'Per 21 CFR 312.42(b)(1), FDA may place a clinical hold if human subjects would be exposed to an unreasonable and significant risk. ICH M3(R2) Table 1 specifies the nonclinical support required based on the number of subjects and duration of dosing.',
          reference: '21 CFR 312.42(b)(1); ICH M3(R2) Table 1; ICH E8(R1) General Considerations for Clinical Studies',
          recommendation:
            'Justify the proposed enrollment size with a statistical rationale (e.g., number of dose cohorts, subjects per cohort, expansion cohorts). Ensure the nonclinical safety package supports the duration and extent of proposed exposure per ICH M3(R2) Table 1. Consider staging the study with interim safety reviews.',
          relatedFields: ['planned_enrollment', 'proposed_phase', 'ind_type', 'nonclinical_studies_completed'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_019',
    dimension: 'risk_identification',
    title: 'No safety monitoring plan',
    question:
      'What safety monitoring procedures are in place to protect clinical trial subjects, including stopping rules, SAE reporting, and DSMB oversight?',
    check(answers) {
      if (isEmpty(answers.safety_monitoring_plan)) {
        return {
          id: 'ind_019',
          dimension: 'risk_identification',
          severity: 'critical',
          title: 'No safety monitoring plan',
          question:
            'What safety monitoring procedures are in place to protect clinical trial subjects, including stopping rules, SAE reporting, and DSMB oversight?',
          observation:
            'No safety monitoring plan has been described. This is a fundamental deficiency that may trigger a clinical hold, as FDA must be satisfied that subjects will not be exposed to unreasonable risk.',
          requirement:
            'Per 21 CFR 312.23(a)(6)(iii), the protocol must include provisions for monitoring clinical trials. 21 CFR 312.32 requires expedited reporting of serious adverse events. FDA Guidance on Safety Reporting Requirements specifies IND safety reporting obligations.',
          reference:
            '21 CFR 312.23(a)(6)(iii); 21 CFR 312.32; FDA Guidance: Safety Reporting Requirements for INDs (2015); ICH E6(R2) Section 5.18',
          recommendation:
            'Develop a comprehensive safety monitoring plan including: (1) dose-limiting toxicity criteria; (2) stopping rules for individual subjects and the study overall; (3) SAE and SUSAR reporting procedures and timelines; (4) Data Safety Monitoring Board (DSMB) charter if applicable; (5) protocol-specified safety assessments and their frequency; (6) provisions for unblinding in emergencies.',
          relatedFields: ['safety_monitoring_plan', 'proposed_phase', 'first_in_human', 'dose_escalation_scheme'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_020',
    dimension: 'regulatory_alignment',
    title: 'No pediatric study plan when required',
    question:
      'Has a Pediatric Study Plan been submitted or has a deferral/waiver been requested, as required under the Pediatric Research Equity Act (PREA)?',
    check(answers) {
      if (isEmpty(answers.pediatric_study_plan)) {
        const indication = String(answers.proposed_indication ?? '').toLowerCase();
        const adultOnlyConditions = ['erectile dysfunction', 'menopause', 'alzheimer', 'prostate cancer'];
        const likelyAdultOnly = adultOnlyConditions.some((c) => indication.includes(c));
        if (!likelyAdultOnly && !isEmpty(answers.proposed_indication)) {
          return {
            id: 'ind_020',
            dimension: 'regulatory_alignment',
            severity: 'warning',
            title: 'No pediatric study plan when required',
            question:
              'Has a Pediatric Study Plan been submitted or has a deferral/waiver been requested, as required under the Pediatric Research Equity Act (PREA)?',
            observation:
              'No pediatric study plan has been provided. Under PREA, sponsors must submit a Pediatric Study Plan (PSP) for drugs that are intended to treat conditions that occur in pediatric populations, unless a waiver or deferral is granted.',
            requirement:
              'Per Section 505B of the FD&C Act (PREA) and FDA Guidance: Pediatric Study Plans (2020), sponsors must submit an initial PSP no later than 60 days after the end-of-Phase 2 meeting or before submitting the NDA. Early engagement on pediatric development is recommended.',
            reference:
              'FD&C Act Section 505B (PREA); FDA Guidance: Pediatric Study Plans — Content of and Process for Submitting Initial Pediatric Study Plans and Amended Initial Pediatric Study Plans (2020)',
            recommendation:
              'Assess whether the proposed indication is relevant to pediatric populations. If so, develop a Pediatric Study Plan and consider submitting it early. If the condition does not occur in pediatric populations, request a full waiver. If pediatric studies should be deferred, request a deferral with a proposed timeline.',
            relatedFields: ['pediatric_study_plan', 'proposed_indication', 'proposed_phase'],
          };
        }
      }
      return null;
    },
  },
  {
    id: 'ind_021',
    dimension: 'completeness',
    title: 'Missing proposed indication',
    question:
      'What is the proposed clinical indication for the investigational drug, and what is the unmet medical need it addresses?',
    check(answers) {
      if (isEmpty(answers.proposed_indication)) {
        return {
          id: 'ind_021',
          dimension: 'completeness',
          severity: 'critical',
          title: 'Missing proposed indication',
          question:
            'What is the proposed clinical indication for the investigational drug, and what is the unmet medical need it addresses?',
          observation:
            'The proposed clinical indication has not been specified. This is a foundational element of the IND that informs the entire regulatory assessment, including nonclinical requirements, clinical trial design, and benefit-risk evaluation.',
          requirement:
            'Per 21 CFR 312.23(a)(3), the IND must include a comprehensive investigator\'s brochure containing a summary of the proposed clinical indication. The indication determines the applicable FDA review division and the nonclinical/clinical requirements per ICH M3(R2).',
          reference: '21 CFR 312.23(a)(3); 21 CFR 312.23(a)(6)(i); ICH M3(R2) Table 1',
          recommendation:
            'Clearly state the proposed clinical indication, target patient population, and unmet medical need. This information drives the entire regulatory strategy, including: review division assignment, nonclinical study requirements, clinical endpoint selection, and comparator considerations.',
          relatedFields: ['proposed_indication', 'mechanism_of_action', 'therapeutic_class', 'proposed_phase'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_022',
    dimension: 'documentation',
    title: 'Proposed protocol title missing or vague',
    question:
      'Does the protocol have a clear, descriptive title that identifies the study phase, drug, indication, and study design?',
    check(answers) {
      if (isEmpty(answers.proposed_protocol_title)) {
        return {
          id: 'ind_022',
          dimension: 'documentation',
          severity: 'info',
          title: 'Proposed protocol title missing or vague',
          question:
            'Does the protocol have a clear, descriptive title that identifies the study phase, drug, indication, and study design?',
          observation:
            'No proposed protocol title has been provided. While not a ground for clinical hold, a missing or poorly written title suggests incomplete protocol development and may indicate broader deficiencies.',
          requirement:
            'Per 21 CFR 312.23(a)(6)(i), the IND protocol must include a title and statement of purpose. ICH E6(R2) Section 6.1 specifies that the protocol should include a descriptive title.',
          reference: '21 CFR 312.23(a)(6)(i); ICH E6(R2) Section 6.1',
          recommendation:
            'Provide a descriptive protocol title that includes: (1) study phase; (2) study design (e.g., randomized, double-blind, placebo-controlled); (3) drug name; (4) proposed indication or target population; (5) primary objective (e.g., safety, PK, efficacy). Example: "A Phase 1, Randomized, Double-Blind, Placebo-Controlled, Single Ascending Dose Study of [Drug Name] in Healthy Adult Volunteers."',
          relatedFields: ['proposed_protocol_title', 'proposed_phase', 'proposed_indication', 'drug_name'],
        };
      }
      return null;
    },
  },
];

/* ─── Regulatory History (ind_023 – ind_027) ───────────────────────────── */

const regulatoryHistoryRules: AuditRule[] = [
  {
    id: 'ind_023',
    dimension: 'risk_identification',
    title: 'Previous clinical hold not addressed',
    question:
      'Has the sponsor received a previous clinical hold, and if so, have all deficiencies identified in the clinical hold letter been adequately resolved?',
    check(answers) {
      if (!isEmpty(answers.clinical_hold_history) && !includes(answers.clinical_hold_history, 'none') && !includes(answers.clinical_hold_history, 'n/a')) {
        return {
          id: 'ind_023',
          dimension: 'risk_identification',
          severity: 'critical',
          title: 'Previous clinical hold not addressed',
          question:
            'Has the sponsor received a previous clinical hold, and if so, have all deficiencies identified in the clinical hold letter been adequately resolved?',
          observation:
            'The sponsor reports a history of clinical holds. FDA will closely scrutinize the current submission to verify that all previously identified deficiencies have been resolved. Unresolved clinical hold issues are grounds for continued or renewed holds.',
          requirement:
            'Per 21 CFR 312.42(e), a clinical hold may be imposed if any of the criteria in 312.42(b) are met. To resume clinical investigations, the sponsor must respond to the clinical hold letter and receive FDA notification that the hold is lifted (21 CFR 312.42(d)).',
          reference: '21 CFR 312.42(b)-(e); FDA Guidance: Clinical Holds of INDs (2023)',
          recommendation:
            'Provide a detailed cross-reference to the previous clinical hold letter and the sponsor\'s complete response. Document how each deficiency was resolved. Include any new data (nonclinical, CMC, clinical) generated to address FDA concerns. If this is a new IND related to a previously held IND, explicitly address all prior concerns.',
          relatedFields: ['clinical_hold_history', 'previous_ind_numbers', 'fda_feedback_summary'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_024',
    dimension: 'practical_feasibility',
    title: 'Pre-IND meeting not held for novel mechanism',
    question:
      'Has a pre-IND meeting (Type B meeting) been held with FDA, particularly for a drug with a novel mechanism of action?',
    check(answers) {
      if (
        (answers.pre_ind_meeting_held === false || answers.pre_ind_meeting_held === 'no') &&
        !isEmpty(answers.mechanism_of_action)
      ) {
        const moa = String(answers.mechanism_of_action).toLowerCase();
        const novelIndicators = ['novel', 'first-in-class', 'new mechanism', 'unprecedented', 'unique', 'first in class'];
        const isNovel = novelIndicators.some((n) => moa.includes(n));
        if (isNovel) {
          return {
            id: 'ind_024',
            dimension: 'practical_feasibility',
            severity: 'warning',
            title: 'Pre-IND meeting not held for novel mechanism',
            question:
              'Has a pre-IND meeting (Type B meeting) been held with FDA, particularly for a drug with a novel mechanism of action?',
            observation:
              'No pre-IND meeting has been held, despite the drug appearing to have a novel mechanism of action. Pre-IND meetings are strongly recommended for first-in-class compounds to align on nonclinical and clinical development strategy.',
            requirement:
              'Per FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants (2017), sponsors may request a pre-IND meeting (Type B) to discuss the planned IND content, nonclinical study design, and first-in-human trial design. While not required, these meetings can prevent clinical holds.',
            reference:
              'FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants of PDUFAct Products (2017); 21 CFR 312.82',
            recommendation:
              'Strongly consider requesting a pre-IND meeting (Type B, 60-day timeline) before submitting the IND. Prepare a comprehensive meeting package addressing: (1) nonclinical development plan; (2) CMC strategy; (3) proposed Phase 1 study design; (4) biomarker strategy; (5) any novel safety concerns. This is particularly important for first-in-class mechanisms where there is no regulatory precedent.',
            relatedFields: ['pre_ind_meeting_held', 'mechanism_of_action', 'fda_feedback_summary', 'first_in_human'],
          };
        }
      }
      return null;
    },
  },
  {
    id: 'ind_025',
    dimension: 'consistency',
    title: 'No FDA feedback summary when pre-IND meeting was held',
    question:
      'If a pre-IND meeting was held, has the FDA feedback been summarized and have all FDA recommendations been addressed in the IND?',
    check(answers) {
      if (
        (answers.pre_ind_meeting_held === true || answers.pre_ind_meeting_held === 'yes') &&
        isEmpty(answers.fda_feedback_summary)
      ) {
        return {
          id: 'ind_025',
          dimension: 'consistency',
          severity: 'warning',
          title: 'No FDA feedback summary when pre-IND meeting was held',
          question:
            'If a pre-IND meeting was held, has the FDA feedback been summarized and have all FDA recommendations been addressed in the IND?',
          observation:
            'A pre-IND meeting was held but no FDA feedback summary has been provided. This creates a significant gap because FDA reviewers will compare the IND submission against the advice given in the pre-IND meeting. Inconsistencies may delay review.',
          requirement:
            'Per FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants (2017), the official meeting minutes issued by FDA represent the formal record. Sponsors are expected to address all FDA recommendations in the subsequent IND submission.',
          reference:
            'FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants of PDUFAct Products (2017); 21 CFR 312.82',
          recommendation:
            'Include a summary of FDA feedback from the pre-IND meeting and cross-reference how each recommendation has been addressed in the IND. If the sponsor deviated from FDA advice, provide a clear scientific rationale. Include the meeting date, FDA meeting number, and key agreements.',
          relatedFields: ['fda_feedback_summary', 'pre_ind_meeting_held', 'previous_ind_numbers'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_026',
    dimension: 'documentation',
    title: 'Amendment without adequate justification for changes',
    question:
      'Does this IND amendment clearly describe what has changed from the original submission and provide a rationale for each change?',
    check(answers) {
      const indType = String(answers.ind_type ?? '').toLowerCase();
      if (indType === 'amendment') {
        const hasJustification =
          !isEmpty(answers.fda_feedback_summary) ||
          !isEmpty(answers.related_submissions);
        if (!hasJustification) {
          return {
            id: 'ind_026',
            dimension: 'documentation',
            severity: 'warning',
            title: 'Amendment without adequate justification for changes',
            question:
              'Does this IND amendment clearly describe what has changed from the original submission and provide a rationale for each change?',
            observation:
              'This is an IND amendment but does not include adequate justification for the proposed changes. Amendments without clear change narratives create confusion and may delay FDA review.',
            requirement:
              'Per 21 CFR 312.31, IND amendments must be submitted for protocol amendments, new investigators, and changes in CMC information. Each amendment should clearly identify what has changed, why, and reference the relevant section of the original IND.',
            reference: '21 CFR 312.30; 21 CFR 312.31; 21 CFR 312.32',
            recommendation:
              'Include a cover letter that summarizes all changes made in this amendment. For protocol amendments, provide a tracked-changes version. For CMC amendments, describe the nature of the change and its impact on drug product quality. Cross-reference the original IND sections being modified and provide a rationale for each change.',
            relatedFields: ['ind_type', 'related_submissions', 'fda_feedback_summary', 'previous_ind_numbers'],
          };
        }
      }
      return null;
    },
  },
  {
    id: 'ind_027',
    dimension: 'documentation',
    title: 'Related submissions not cross-referenced',
    question:
      'Are all related regulatory submissions (other INDs, DMFs, NDAs, BLAs) properly cross-referenced to provide FDA with a complete regulatory history?',
    check(answers) {
      if (
        isEmpty(answers.related_submissions) &&
        !isEmpty(answers.previous_ind_numbers)
      ) {
        return {
          id: 'ind_027',
          dimension: 'documentation',
          severity: 'info',
          title: 'Related submissions not cross-referenced',
          question:
            'Are all related regulatory submissions (other INDs, DMFs, NDAs, BLAs) properly cross-referenced to provide FDA with a complete regulatory history?',
          observation:
            'Previous IND numbers are referenced but no related submissions have been cross-referenced. FDA reviewers benefit from a complete regulatory history including any related INDs, DMFs, NDAs, or BLAs.',
          requirement:
            'Per 21 CFR 312.23(a)(1), the IND cover sheet (Form FDA 1571) requires listing of related IND and NDA/BLA numbers. Cross-referencing related submissions ensures consistency and allows FDA to access relevant information from other applications.',
          reference: '21 CFR 312.23(a)(1); Form FDA 1571 Instructions',
          recommendation:
            'List all related regulatory submissions including: (1) other INDs for the same drug substance; (2) DMFs for the drug substance or excipients; (3) any NDAs or BLAs under development; (4) INDs for related compounds in the same pharmacological class. Include application numbers and cross-reference letters where applicable.',
          relatedFields: ['related_submissions', 'previous_ind_numbers', 'drug_master_file'],
        };
      }
      return null;
    },
  },
];

/* ─── Submission Quality (ind_028 – ind_030) ───────────────────────────── */

const submissionQualityRules: AuditRule[] = [
  {
    id: 'ind_028',
    dimension: 'completeness',
    title: 'Sponsor contact information incomplete',
    question:
      'Is the sponsor\'s contact information complete, including name, address, telephone number, and a designated agent for communication with FDA?',
    check(answers) {
      const missingFields: string[] = [];
      if (isEmpty(answers.sponsor_name)) missingFields.push('sponsor name');
      if (isEmpty(answers.sponsor_contact)) missingFields.push('sponsor contact');
      if (isEmpty(answers.sponsor_address)) missingFields.push('sponsor address');
      if (missingFields.length > 0) {
        return {
          id: 'ind_028',
          dimension: 'completeness',
          severity: 'warning',
          title: 'Sponsor contact information incomplete',
          question:
            'Is the sponsor\'s contact information complete, including name, address, telephone number, and a designated agent for communication with FDA?',
          observation:
            `The following sponsor information is missing: ${missingFields.join(', ')}. Incomplete sponsor information can delay IND processing and is an administrative deficiency.`,
          requirement:
            'Per 21 CFR 312.23(a)(1), Form FDA 1571 requires the sponsor\'s name, address, telephone number, and the name of the person responsible for monitoring the conduct and progress of the investigation. The sponsor must designate a contact person for FDA communications.',
          reference: '21 CFR 312.23(a)(1); 21 CFR 312.50; 21 CFR 312.52; Form FDA 1571',
          recommendation:
            'Complete all sponsor identification fields on Form FDA 1571. Identify a U.S. agent if the sponsor is a foreign entity. Designate a qualified individual as the sponsor\'s representative for FDA communication, including 24-hour contact information for safety reporting.',
          relatedFields: ['sponsor_name', 'sponsor_contact', 'sponsor_address'],
        };
      }
      return null;
    },
  },
  {
    id: 'ind_029',
    dimension: 'risk_identification',
    title: 'Research IND without academic institution safeguards',
    question:
      'For a research (non-commercial) IND, are appropriate institutional safeguards in place, including IRB oversight, qualified investigators, and adequate resources for the proposed study?',
    check(answers) {
      const submissionType = String(answers.submission_type ?? '').toLowerCase();
      if (submissionType === 'research') {
        const hasInstitutionalSafeguards =
          !isEmpty(answers.safety_monitoring_plan) && !isEmpty(answers.sponsor_contact);
        if (!hasInstitutionalSafeguards) {
          return {
            id: 'ind_029',
            dimension: 'risk_identification',
            severity: 'warning',
            title: 'Research IND without academic institution safeguards',
            question:
              'For a research (non-commercial) IND, are appropriate institutional safeguards in place, including IRB oversight, qualified investigators, and adequate resources for the proposed study?',
            observation:
              'This is a research (non-commercial) IND, but the submission does not demonstrate adequate institutional safeguards. Sponsor-investigators at academic institutions may have limited experience with IND regulatory obligations, which increases the risk of non-compliance.',
            requirement:
              'Per 21 CFR 312.3(b), a sponsor-investigator holds both sponsor and investigator responsibilities. This includes compliance with 21 CFR 312 Subpart D (sponsor responsibilities) and Subpart E (investigator responsibilities). FDA Guidance on Investigator-Sponsored INDs outlines specific expectations.',
            reference:
              '21 CFR 312.3(b); 21 CFR 312 Subparts D and E; FDA Guidance: Investigator Responsibilities — Protecting the Rights, Safety, and Welfare of Study Subjects (2009)',
            recommendation:
              'Ensure the sponsor-investigator has: (1) IRB approval from the responsible institution; (2) adequate facilities and qualified staff; (3) a safety monitoring plan with independent oversight; (4) systems for adverse event reporting within FDA-mandated timelines; (5) financial resources to complete the study; (6) a qualified individual to serve as medical monitor if the sponsor-investigator is also the sole investigator.',
            relatedFields: ['submission_type', 'sponsor_contact', 'safety_monitoring_plan', 'sponsor_name'],
          };
        }
      }
      return null;
    },
  },
  {
    id: 'ind_030',
    dimension: 'regulatory_alignment',
    title: 'Orphan drug designation claimed without supporting documentation',
    question:
      'If orphan drug designation has been claimed, has the sponsor provided the FDA-issued designation letter and demonstrated that the orphan condition prevalence criteria are met?',
    check(answers) {
      if (
        (answers.orphan_drug_designation === true || answers.orphan_drug_designation === 'yes') &&
        isEmpty(answers.proposed_indication)
      ) {
        return {
          id: 'ind_030',
          dimension: 'regulatory_alignment',
          severity: 'warning',
          title: 'Orphan drug designation claimed without supporting documentation',
          question:
            'If orphan drug designation has been claimed, has the sponsor provided the FDA-issued designation letter and demonstrated that the orphan condition prevalence criteria are met?',
          observation:
            'Orphan drug designation has been claimed, but the proposed indication has not been specified. Without a clearly defined rare disease indication, FDA cannot verify orphan drug eligibility or its potential regulatory benefits.',
          requirement:
            'Per 21 CFR Part 316, orphan drug designation requires that the disease or condition affect fewer than 200,000 persons in the United States. The sponsor must provide the orphan drug designation request number or approval letter. Designation does not guarantee approval and is specific to the indication.',
          reference:
            '21 CFR Part 316; FD&C Act Section 526; FDA Guidance: Qualifying for Pediatric Exclusivity Under the Best Pharmaceuticals for Children Act (if both apply)',
          recommendation:
            'Provide the FDA-issued orphan drug designation letter and number. Clearly define the rare disease indication for which designation was granted. Include prevalence data supporting the orphan disease criteria. Note that orphan designation provides incentives including tax credits, protocol assistance, and 7 years of marketing exclusivity upon approval.',
          relatedFields: ['orphan_drug_designation', 'proposed_indication', 'therapeutic_class'],
        };
      }
      return null;
    },
  },
];

/* ─── Public factory ───────────────────────────────────────────────────── */

export function createIndAuditor(): WarGameAuditor {
  return {
    category: 'ind',
    name: 'IND Submission Auditor',
    description:
      'Simulates FDA Office of New Drugs reviewer scrutiny of an Investigational New Drug application, examining CMC data, nonclinical package, clinical plan, and submission quality.',
    rules: [
      ...cmcRules,
      ...nonclinicalRules,
      ...clinicalPlanRules,
      ...regulatoryHistoryRules,
      ...submissionQualityRules,
    ],
  };
}
