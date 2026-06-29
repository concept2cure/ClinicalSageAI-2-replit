/**
 * Labeling Intelligence tools — exposes the deterministic labeling
 * knowledge base to AnA as first-class, selectable tools.
 *
 * Each tool wraps a pure function that returns structured, citation-backed
 * output grounded in FDA PLR (21 CFR 201.56-57), FDA Boxed Warning guidance,
 * FDAAA 2007 / FDORA 2022 (REMS), PLLR (21 CFR 201.56(d)(1)), EMA QRD
 * template, and OTC Drug Facts labeling (21 CFR 201.66). NO LLM estimation,
 * NO network calls — the results are deterministic and submission-defensible.
 *
 * Tools:
 *   assess_plr_structure              — PLR section structure per 21 CFR 201.56-57
 *   assess_boxed_warning              — Boxed warning criteria per FDA guidance
 *   design_rems                       — REMS design per FDAAA 2007 / FDORA 2022
 *   assess_pregnancy_lactation_labeling — PLLR requirements per 21 CFR 201.56(d)(1)
 *   structure_smpc                    — EU SmPC structure per EMA QRD template
 *   assess_otc_labeling               — OTC Drug Facts per 21 CFR 201.66
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dynamic-import
 * the matching labeling intelligence knowledge module.
 *
 * @module server/services/ana/labelingIntelligenceTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned data verbatim — do NOT reinterpret regulatory citations, ' +
  'invent additional guidance, or substitute your own recommendations. ' +
  'If a parameter is missing or invalid, relay the validation error and ask the user for the correct value.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. PLR Structure Assessment
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_PLR_STRUCTURE: AnaTool = {
  name: 'assess_plr_structure',
  description:
    'Assess the required section structure and content elements for FDA Physician ' +
    'Labeling Rule (PLR) compliant prescribing information. Returns a complete ' +
    'section-by-section outline per 21 CFR 201.56(d) and 201.57, including ' +
    'Highlights of Prescribing Information, Full Prescribing Information table of ' +
    'contents, and all numbered FPI sections (1–17) with required subsections. ' +
    'Accounts for product-type-specific requirements (biologics BLA supplements, ' +
    'biosimilar-specific sections, ANDA labeling carve-outs), flags sections ' +
    'triggered by special populations (pediatric, geriatric, renal/hepatic ' +
    'impairment), and identifies when a Boxed Warning, REMS, or Medication ' +
    'Guide section is mandatory. Cites 21 CFR 201.56, 201.57, and relevant ' +
    'FDA draft/final guidance documents. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: ['prescription_drug', 'biological', 'biosimilar', 'generic'],
        description: 'Regulatory product classification — determines which PLR sections apply and any carve-outs (e.g., ANDA labeling exclusivity carve-outs for generics, biosimilar-specific sections for 351(k) products).',
      },
      applicationType: {
        type: 'string',
        enum: ['NDA', 'BLA', 'ANDA', 'supplement'],
        description: 'Application type filed with FDA — affects required content (e.g., NDA vs. BLA data requirements, supplement scope for labeling changes).',
      },
      therapeuticArea: {
        type: 'string',
        description: 'Therapeutic area or indication (e.g., "oncology", "cardiology", "infectious disease"). Influences section content expectations and FDA reviewer focus areas.',
      },
      specialPopulations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Special populations relevant to the product (e.g., "pediatric", "geriatric", "renal_impairment", "hepatic_impairment", "pregnant_women"). Triggers required subsections under Use in Specific Populations (Section 8).',
      },
      hasBoxedWarning: {
        type: 'boolean',
        description: 'Whether the product has or is expected to have a Boxed Warning — triggers Section 5 and Highlights requirements.',
      },
      isNewFormulation: {
        type: 'boolean',
        description: 'Whether this is a new formulation of an existing product — affects which sections require new data vs. cross-referencing the reference product.',
      },
    },
    required: ['productType', 'applicationType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Boxed Warning Assessment
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_BOXED_WARNING: AnaTool = {
  name: 'assess_boxed_warning',
  description:
    'Evaluate whether a safety signal meets FDA criteria for a Boxed Warning and ' +
    'return the recommended format, language structure, and regulatory basis. ' +
    'Assesses the signal against the four FDA criteria for boxed warnings per ' +
    '21 CFR 201.57(c)(1): (i) an adverse reaction so serious that the risk must ' +
    'be weighed against benefit, (ii) a serious adverse reaction that can be ' +
    'prevented or reduced by appropriate use, (iii) a restriction to certain ' +
    'situations, or (iv) an FDA-approved REMS with a Medication Guide or ETASU. ' +
    'Returns a structured assessment including criteria met, recommended warning ' +
    'text structure (header, body, bullet points per FDA formatting conventions), ' +
    'whether the warning is class-wide or product-specific, cross-references to ' +
    'Warnings and Precautions (Section 5), Adverse Reactions (Section 6), and ' +
    'Contraindications (Section 4), and precedent analysis from similar class ' +
    'labeling. Cites 21 CFR 201.57(c)(1), FDA guidance on warnings and ' +
    'precautions, and relevant safety communication precedents. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      safetySignalType: {
        type: 'string',
        enum: [
          'cardiovascular', 'hepatotoxicity', 'suicidality', 'infection',
          'malignancy', 'teratogenicity', 'cytokine_release', 'pml',
          'anaphylaxis', 'gi_perforation', 'bleeding', 'nephrotoxicity', 'other',
        ],
        description: 'Category of safety signal being evaluated for boxed warning inclusion.',
      },
      severity: {
        type: 'string',
        enum: ['life_threatening', 'serious', 'significant'],
        description: 'Severity classification of the safety signal — life-threatening and serious signals are most likely to meet boxed warning thresholds per 21 CFR 201.57(c)(1).',
      },
      clinicalEvidenceLevel: {
        type: 'string',
        enum: ['controlled_trials', 'observational', 'postmarketing', 'case_reports'],
        description: 'Strength of clinical evidence supporting the safety signal — controlled trial data carries the highest weight in FDA boxed warning determinations.',
      },
      riskMitigationAvailable: {
        type: 'boolean',
        description: 'Whether effective risk mitigation measures exist (e.g., monitoring, dose adjustment, contraindication) — affects whether criterion (ii) applies.',
      },
      classWide: {
        type: 'boolean',
        description: 'Whether the safety signal is class-wide (applies to all drugs in the pharmacological class) — affects warning language and cross-referencing.',
      },
      productSpecific: {
        type: 'boolean',
        description: 'Whether the safety signal is specific to this product (not shared across the class) — affects warning language and differentiation from class labeling.',
      },
    },
    required: ['safetySignalType', 'severity'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. REMS Design
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_REMS: AnaTool = {
  name: 'design_rems',
  description:
    'Design a Risk Evaluation and Mitigation Strategy (REMS) per FDAAA 2007 ' +
    '(Section 505-1 of the FD&C Act) and FDORA 2022 requirements. Returns a ' +
    'comprehensive REMS structure including: required REMS elements (Medication ' +
    'Guide, Communication Plan, Elements to Assure Safe Use / ETASU, ' +
    'Implementation System), ETASU component design (prescriber certification, ' +
    'pharmacy certification, patient enrollment, dispensing restrictions, ' +
    'laboratory monitoring requirements), REMS assessment timeline and metrics, ' +
    'REMS modification triggers, and shared system REMS considerations for ' +
    'generic/biosimilar products per FDORA 2022 single shared system REMS ' +
    'provisions. Accounts for product-specific risk profiles, target population ' +
    'characteristics, and precedent REMS programs for similar drug classes. ' +
    'Cites FD&C Act Section 505-1, 21 CFR Part 208 (Medication Guides), FDORA ' +
    '2022 Title III, and relevant FDA REMS guidance documents. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      identifiedRisk: {
        type: 'string',
        description: 'Description of the identified serious risk that necessitates a REMS (e.g., "severe hepatotoxicity requiring liver function monitoring", "teratogenicity with pregnancy prevention program").',
      },
      safetySignalType: {
        type: 'string',
        enum: [
          'cardiovascular', 'hepatotoxicity', 'suicidality', 'infection',
          'malignancy', 'teratogenicity', 'cytokine_release', 'pml',
          'anaphylaxis', 'gi_perforation', 'bleeding', 'nephrotoxicity', 'other',
        ],
        description: 'Category of safety signal driving the REMS requirement.',
      },
      productType: {
        type: 'string',
        enum: ['prescription_drug', 'biological', 'biosimilar', 'generic'],
        description: 'Product type — biosimilars and generics trigger shared system REMS considerations per FDORA 2022.',
      },
      riskSeverity: {
        type: 'string',
        enum: ['high', 'moderate', 'significant'],
        description: 'Severity of the identified risk — determines the intensity of REMS elements (e.g., high severity typically requires ETASU, moderate may require only a Medication Guide and Communication Plan).',
      },
      riskFrequency: {
        type: 'string',
        enum: ['common', 'uncommon', 'rare', 'very_rare'],
        description: 'Frequency of the identified risk — affects REMS burden-benefit calculus and assessment metrics.',
      },
      riskMitigationOptions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Available risk mitigation interventions (e.g., "laboratory monitoring", "pregnancy testing", "prescriber training", "restricted distribution", "patient registry").',
      },
      targetPopulation: {
        type: 'string',
        description: 'Target patient population (e.g., "adults with moderate-to-severe psoriasis", "women of childbearing potential with epilepsy"). Influences REMS design complexity and patient enrollment requirements.',
      },
    },
    required: ['identifiedRisk', 'safetySignalType', 'productType', 'riskSeverity'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Pregnancy and Lactation Labeling Assessment (PLLR)
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_PREGNANCY_LACTATION_LABELING: AnaTool = {
  name: 'assess_pregnancy_lactation_labeling',
  description:
    'Assess Pregnancy and Lactation Labeling Rule (PLLR) requirements and generate ' +
    'structured labeling content recommendations per 21 CFR 201.56(d)(1) and the ' +
    'FDA final rule effective June 30, 2015. Returns recommended content for all ' +
    'three PLLR subsections: 8.1 Pregnancy (risk summary, clinical considerations, ' +
    'data from human and animal studies), 8.2 Lactation (risk summary, clinical ' +
    'considerations, data), and 8.3 Females and Males of Reproductive Potential ' +
    '(pregnancy testing, contraception, infertility). Evaluates available evidence ' +
    '(animal reproductive toxicology data, human pregnancy registries, placental ' +
    'transfer studies, breast milk excretion data) against PLLR content standards ' +
    'and identifies data gaps requiring additional studies or post-marketing ' +
    'commitments. Eliminates legacy pregnancy categories (A/B/C/D/X) per the ' +
    'final rule. Cites 21 CFR 201.56(d)(1), 201.57(c)(9), FDA PLLR guidance ' +
    '(2014), and relevant FDA draft guidance on lactation studies. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      animalReproToxData: {
        type: 'array',
        description: 'Animal reproductive toxicology study results — used to populate the Data subsection of Section 8.1 Pregnancy.',
        items: {
          type: 'object',
          properties: {
            species: { type: 'string', description: 'Species used in the study (e.g., "rat", "rabbit", "cynomolgus monkey").' },
            findings: { type: 'string', description: 'Key findings from the study (e.g., "embryo-fetal lethality at 10x clinical exposure", "no adverse developmental effects").' },
            dose: { type: 'string', description: 'Dose level and route (e.g., "100 mg/kg/day oral", "5 mg/kg IV"). Include multiples of clinical exposure when available.' },
          },
          required: ['species', 'findings', 'dose'],
        },
      },
      humanPregnancyData: {
        type: 'boolean',
        description: 'Whether human pregnancy outcome data are available (from clinical trials, pregnancy registries, or epidemiological studies). Presence of human data significantly strengthens the Risk Summary.',
      },
      placentalTransfer: {
        type: 'string',
        enum: ['known', 'likely', 'unknown', 'none'],
        description: 'Placental transfer status — "known" if demonstrated in studies, "likely" if expected based on molecular characteristics (e.g., IgG antibodies), "unknown" if not studied, "none" if demonstrated not to cross.',
      },
      breastMilkExcretion: {
        type: 'string',
        enum: ['known', 'likely', 'unknown', 'none'],
        description: 'Breast milk excretion status — "known" if demonstrated in lactation studies, "likely" if expected based on molecular characteristics, "unknown" if not studied, "none" if demonstrated not to be excreted.',
      },
      mechanismBasedRisk: {
        type: 'boolean',
        description: 'Whether the drug\'s mechanism of action suggests developmental or reproductive risk (e.g., anti-angiogenic agents, cytotoxic agents, hormonal modulators). Triggers enhanced risk language in Section 8.1.',
      },
      pregnancyRegistryData: {
        type: 'boolean',
        description: 'Whether a pregnancy exposure registry exists or is planned — affects Clinical Considerations content and whether registry enrollment language is included in Section 8.1.',
      },
    },
    required: ['placentalTransfer', 'breastMilkExcretion'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. EU SmPC Structure
// ─────────────────────────────────────────────────────────────────────────────

export const STRUCTURE_SMPC: AnaTool = {
  name: 'structure_smpc',
  description:
    'Generate the required section structure for an EU Summary of Product ' +
    'Characteristics (SmPC) per the EMA Quality Review of Documents (QRD) ' +
    'template (current revision). Returns all 12 numbered SmPC sections ' +
    '(1. Name of the medicinal product through 12. Instructions for use) with ' +
    'required subsections, mandatory language blocks (e.g., black triangle ' +
    'statement for additional monitoring products, reporting statement for ' +
    'suspected adverse reactions), and procedure-specific requirements for ' +
    'centralized (CP), mutual recognition (MRP), decentralized (DCP), and ' +
    'national procedures. Identifies product-type-specific content (herbal ' +
    'traditional use registration, homeopathic registration), special ' +
    'population requirements (paediatric, elderly, renal/hepatic impairment), ' +
    'and cross-references to the Package Leaflet and labelling text. Cites ' +
    'Directive 2001/83/EC Article 11, Regulation (EC) No 726/2004, and the ' +
    'current EMA QRD template annotated guidance. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: ['medicinal_product', 'herbal', 'homeopathic'],
        description: 'Product classification under EU pharmaceutical law — determines which QRD template variant applies and which sections have modified content requirements.',
      },
      procedure: {
        type: 'string',
        enum: ['centralized', 'mutual_recognition', 'decentralized', 'national'],
        description: 'EU regulatory procedure — centralized products follow EMA QRD template strictly; MRP/DCP/national may have member-state-specific annexes.',
      },
      specialPopulations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Special populations requiring dedicated subsections (e.g., "paediatric", "elderly", "renal_impairment", "hepatic_impairment"). Triggers content in Sections 4.2, 4.4, 4.8, and 5.2.',
      },
      hasAdditionalMonitoring: {
        type: 'boolean',
        description: 'Whether the product is subject to additional monitoring (black inverted triangle symbol) — triggers mandatory statements in Section 4.8 and the beginning of the SmPC per EMA requirements.',
      },
    },
    required: ['productType', 'procedure'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. OTC Drug Facts Labeling
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_OTC_LABELING: AnaTool = {
  name: 'assess_otc_labeling',
  description:
    'Assess OTC Drug Facts labeling requirements per 21 CFR 201.66 and generate ' +
    'the required content structure. Returns the complete Drug Facts panel layout ' +
    'including all mandatory headings in required order (Active ingredient(s), ' +
    'Purpose(s), Use(s), Warnings, Directions, Other information, Inactive ' +
    'ingredients), required warning sub-sections (allergy alert, stomach bleeding ' +
    'warning for NSAIDs, Reye\'s syndrome warning for aspirin-containing products, ' +
    'liver warning for acetaminophen), age-specific dosing tiers for pediatric ' +
    'and adult populations, and format requirements (Helvetica/Arial fonts, ' +
    'minimum 6-point type, hairline rules between sections, bold/italic ' +
    'conventions). Identifies OTC monograph category-specific required warnings ' +
    'per 21 CFR Part 330-358 and flags when a product requires a professional ' +
    'labeling section. Accounts for 21 CFR 201.66(d) format exemptions for ' +
    'small-package labeling. Cites 21 CFR 201.66, applicable OTC monograph ' +
    'parts (21 CFR 330-358), and FDA OTC labeling guidance. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      otcCategory: {
        type: 'string',
        enum: [
          'analgesic', 'antacid', 'antihistamine', 'antidiarrheal', 'laxative',
          'cough_cold', 'topical_antibiotic', 'topical_antifungal', 'sunscreen',
          'antiperspirant', 'acne', 'other',
        ],
        description: 'OTC monograph category — determines which category-specific warnings and required statements apply per the relevant 21 CFR Part 330-358 monograph.',
      },
      activeIngredients: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of active ingredients (e.g., ["acetaminophen", "dextromethorphan HBr", "phenylephrine HCl"]). Determines required warnings (e.g., liver warning for acetaminophen, Reye\'s syndrome warning for salicylates).',
      },
      dosageForm: {
        type: 'string',
        description: 'Dosage form (e.g., "tablet", "capsule", "liquid", "cream", "ointment", "spray", "patch"). Affects Directions section format and any dosage-form-specific warnings.',
      },
      targetPopulation: {
        type: 'string',
        enum: ['adult', 'pediatric', 'both'],
        description: 'Target population — "pediatric" or "both" triggers age-tiered dosing in the Directions section and additional pediatric warnings.',
      },
    },
    required: ['otcCategory', 'activeIngredients', 'dosageForm', 'targetPopulation'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported Array
// ─────────────────────────────────────────────────────────────────────────────

/** Labeling Intelligence tools, spread into ALL_ANA_TOOLS. */
export const LABELING_INTELLIGENCE_TOOLS: AnaTool[] = [
  ASSESS_PLR_STRUCTURE,
  ASSESS_BOXED_WARNING,
  DESIGN_REMS,
  ASSESS_PREGNANCY_LACTATION_LABELING,
  STRUCTURE_SMPC,
  ASSESS_OTC_LABELING,
];
