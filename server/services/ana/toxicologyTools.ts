/**
 * Preclinical Toxicology tools — exposes the deterministic toxicology
 * knowledge base (server/services/toxicology/toxicology-knowledge) to AnA
 * as first-class, selectable tools.
 *
 * Each tool wraps a pure function that returns structured, citation-backed
 * output grounded in ICH M3(R2), S1A-C, S2(R1), S5(R3), S6(R1), S7A/B,
 * S9, and FDA/EMA guidance. NO LLM estimation, NO network calls — the
 * results are deterministic and submission-defensible.
 *
 * Tools:
 *   select_tox_species              — species selection per ICH M3(R2) / S6(R1)
 *   design_repeat_dose_study        — repeat-dose study design per ICH M3(R2) Table 1
 *   calculate_safety_margin         — NOAEL→HED→MRSD per FDA 2005 Guidance
 *   design_genotox_battery          — genotoxicity battery per ICH S2(R1)
 *   assess_carcinogenicity_need     — carcinogenicity trigger evaluation per ICH S1A
 *   design_repro_tox_study          — reproductive/developmental tox per ICH S5(R3)
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dynamic-import
 * the matching `../toxicology/toxicology-knowledge` module.
 *
 * @module server/services/ana/toxicologyTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned data verbatim — do NOT reinterpret regulatory citations, ' +
  'invent additional guidance, or substitute your own species/dose/study-design ' +
  'recommendations. If a parameter is missing or invalid, relay the validation ' +
  'error and ask the user for the correct value.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Species Selection
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_TOX_SPECIES: AnaTool = {
  name: 'select_tox_species',
  description:
    'Select and justify toxicology species for a nonclinical safety program. ' +
    'Returns recommended rodent and non-rodent species with detailed rationale, ' +
    'selection criteria (PK similarity, metabolic profile, pharmacological ' +
    'relevance, target expression), regulatory citations (ICH M3(R2), ICH S6(R1) ' +
    'for biologics, ICH S9 for oncology), contraindications, and special ' +
    'considerations (e.g., single-species biologic programs, transgenic models, ' +
    'route-specific species). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      moleculeType: {
        type: 'string',
        enum: ['small_molecule', 'biologic', 'antibody', 'peptide', 'oligonucleotide', 'adc', 'cell_therapy', 'gene_therapy'],
        description: 'Modality of the test article.',
      },
      therapeuticArea: {
        type: 'string',
        enum: ['oncology', 'anti_infective', 'cns', 'cardiovascular', 'metabolic', 'immunology', 'rare_disease', 'dermatology', 'ophthalmology', 'general'],
        description: 'Therapeutic area (affects regulatory pathway, e.g., ICH S9 for oncology).',
      },
      routeOfAdministration: {
        type: 'string',
        description: 'Intended clinical route (e.g., oral, iv, sc, im, inhalation, dermal, intrathecal, intravitreal).',
      },
      targetOrgan: {
        type: 'string',
        description: 'Primary pharmacological target organ, if known.',
      },
      knownMetabolismSimilarity: {
        type: 'string',
        description: 'Known metabolic profile similarity to human (e.g., "rat CYP profile similar to human").',
      },
      pharmacologicallyRelevantIn: {
        type: 'array',
        items: { type: 'string' },
        description: 'Species in which the molecule is pharmacologically active (critical for biologics per ICH S6(R1)). E.g., ["rat", "cynomolgus"].',
      },
      isOncology: {
        type: 'boolean',
        description: 'Whether the indication is oncology (triggers ICH S9 considerations).',
      },
    },
    required: ['moleculeType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Repeat-Dose Toxicity Study Design
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_REPEAT_DOSE_STUDY: AnaTool = {
  name: 'design_repeat_dose_study',
  description:
    'Design a repeat-dose toxicity study aligned with ICH M3(R2) Table 1. ' +
    'Returns study duration mapped to the target clinical phase, group design ' +
    '(number of groups, animals per sex per group, dose selection principles), ' +
    'comprehensive endpoint list (in-life, clinical pathology, histopathology, ' +
    'safety pharmacology integration, route-specific endpoints), satellite TK ' +
    'group design (timepoints, analytes, ADA for biologics), and recovery group ' +
    'parameters. Accounts for ICH S6(R1) biologic-specific design and ICH S9 ' +
    'oncology abbreviations. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      species: {
        type: 'string',
        description: 'Toxicology species (e.g., "rat", "dog", "cynomolgus monkey", "minipig", "mouse").',
      },
      phase: {
        type: 'string',
        enum: ['phase1', 'phase1b', 'phase2', 'phase3', 'marketing'],
        description: 'Target clinical trial phase — determines minimum required study duration per ICH M3(R2) Table 1.',
      },
      moleculeType: {
        type: 'string',
        enum: ['small_molecule', 'biologic', 'antibody', 'peptide', 'oligonucleotide', 'adc', 'cell_therapy', 'gene_therapy'],
        description: 'Modality of the test article.',
      },
      routeOfAdministration: {
        type: 'string',
        description: 'Route of administration (e.g., oral, iv, sc, im, inhalation, dermal, intravitreal). Determines route-specific endpoints.',
      },
      therapeuticArea: {
        type: 'string',
        enum: ['oncology', 'anti_infective', 'cns', 'cardiovascular', 'metabolic', 'immunology', 'rare_disease', 'dermatology', 'ophthalmology', 'general'],
        description: 'Therapeutic area.',
      },
      isOncology: {
        type: 'boolean',
        description: 'Oncology indication — triggers ICH S9 abbreviated program (e.g., 2-week studies may suffice for Phase 1, recovery groups not essential).',
      },
      maxClinicalDoseMgKg: {
        type: 'number',
        description: 'Maximum planned clinical dose in mg/kg (informs high-dose selection).',
      },
      includeRecovery: {
        type: 'boolean',
        description: 'Whether to include recovery groups (default true; typically omitted for oncology per ICH S9).',
      },
      includeImmunotoxicity: {
        type: 'boolean',
        description: 'Include immunotoxicity endpoints per ICH S8 (e.g., TDAR, NK cell activity, immunophenotyping).',
      },
    },
    required: ['species', 'phase', 'moleculeType', 'routeOfAdministration'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Safety Margin / First-in-Human Dose Calculation
// ─────────────────────────────────────────────────────────────────────────────

export const CALCULATE_SAFETY_MARGIN: AnaTool = {
  name: 'calculate_safety_margin',
  description:
    'Calculate the Human Equivalent Dose (HED) and Maximum Recommended Starting ' +
    'Dose (MRSD) from a nonclinical NOAEL using the FDA body surface area (Km ' +
    'factor) method (FDA 2005 Guidance). Returns step-by-step calculations: ' +
    'HED = NOAEL × (animal Km / human Km), MRSD = HED / safety factor. ' +
    'Optionally computes AUC-based and Cmax-based safety margins when exposure ' +
    'data are provided. Includes regulatory interpretation, warnings for low ' +
    'margins, and ICH S9 oncology-specific dose-selection considerations ' +
    '(STD10, HNSTD). Supported species: mouse, rat, hamster, guinea pig, ' +
    'rabbit, dog, NHP, minipig. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      noaelMgKg: {
        type: 'number',
        description: 'NOAEL in mg/kg/day from the toxicology study.',
      },
      species: {
        type: 'string',
        description: 'Species from which the NOAEL was derived (e.g., "rat", "dog", "cynomolgus monkey").',
      },
      animalBodyWeightKg: {
        type: 'number',
        description: 'Average body weight of test animals in kg (used for verification; Km factors are species-level constants).',
      },
      humanBodyWeightKg: {
        type: 'number',
        description: 'Assumed human body weight in kg (default 60).',
      },
      method: {
        type: 'string',
        enum: ['body_surface_area', 'auc_based', 'cmax_based', 'pharmacological'],
        description: 'Primary method for HED calculation (default body_surface_area).',
      },
      animalAuc: {
        type: 'number',
        description: 'Animal AUC(0-24h) or AUC(0-inf) at NOAEL (ng·h/mL) — for AUC-based margin.',
      },
      humanProjectedAuc: {
        type: 'number',
        description: 'Projected human AUC at the proposed MRSD (ng·h/mL) — for AUC-based margin.',
      },
      animalCmax: {
        type: 'number',
        description: 'Animal Cmax at NOAEL (ng/mL) — for Cmax-based margin.',
      },
      humanProjectedCmax: {
        type: 'number',
        description: 'Projected human Cmax at the proposed MRSD (ng/mL) — for Cmax-based margin.',
      },
      additionalSafetyFactor: {
        type: 'number',
        description: 'Safety factor to divide HED by to obtain MRSD (default 10). Consider larger factors for novel targets, steep dose-response, non-monitorable/irreversible toxicity.',
      },
      isOncology: {
        type: 'boolean',
        description: 'Oncology indication — ICH S9 allows 1/10 STD10 or 1/6 HNSTD approaches.',
      },
      moleculeType: {
        type: 'string',
        enum: ['small_molecule', 'biologic', 'antibody', 'peptide', 'oligonucleotide', 'adc', 'cell_therapy', 'gene_therapy'],
        description: 'Modality (affects interpretation — BSA scaling may not be optimal for biologics).',
      },
    },
    required: ['noaelMgKg', 'species'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Genotoxicity Battery Design
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_GENOTOX_BATTERY: AnaTool = {
  name: 'design_genotox_battery',
  description:
    'Design a genotoxicity testing battery per ICH S2(R1). Returns the standard ' +
    'three-assay battery (Ames test / OECD TG 471, in vitro chromosomal aberration ' +
    'or micronucleus / OECD TG 473 or 487, in vivo micronucleus / OECD TG 474), ' +
    'modifications for biologics (ICH S6(R1) — generally not required), ADCs ' +
    '(payload testing), oncology (ICH S9 — reduced battery pre-Phase 1), and ' +
    'Option 2 integration into repeat-dose studies. Evaluates prior results to ' +
    'recommend follow-up studies (in vivo comet / OECD TG 489, transgenic rodent / ' +
    'OECD TG 488) and provides a weight-of-evidence assessment. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      moleculeType: {
        type: 'string',
        enum: ['small_molecule', 'biologic', 'antibody', 'peptide', 'oligonucleotide', 'adc', 'cell_therapy', 'gene_therapy'],
        description: 'Modality of the test article. Biologics (except ADCs) are generally exempt per ICH S6(R1).',
      },
      therapeuticArea: {
        type: 'string',
        enum: ['oncology', 'anti_infective', 'cns', 'cardiovascular', 'metabolic', 'immunology', 'rare_disease', 'dermatology', 'ophthalmology', 'general'],
        description: 'Therapeutic area.',
      },
      isOncology: {
        type: 'boolean',
        description: 'Oncology indication — ICH S9 allows reduced battery pre-Phase 1.',
      },
      knownStructuralAlerts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Known structural alerts for genotoxicity (e.g., "alkylating group", "aromatic amine", "nitro group", "epoxide").',
      },
      integrateIntoRepeatDose: {
        type: 'boolean',
        description: 'Whether to use ICH S2(R1) Option 2: integrate in vivo micronucleus into a repeat-dose study (reduces animal use).',
      },
      previousResults: {
        type: 'array',
        description: 'Results from already-completed genotoxicity assays — used to determine follow-up needs.',
        items: {
          type: 'object',
          properties: {
            assay: { type: 'string', description: 'Name of the completed assay (e.g., "Ames test", "In vitro micronucleus").' },
            result: { type: 'string', enum: ['positive', 'negative', 'equivocal'], description: 'Outcome of the assay.' },
          },
          required: ['assay', 'result'],
        },
      },
    },
    required: ['moleculeType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Carcinogenicity Assessment
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_CARCINOGENICITY_NEED: AnaTool = {
  name: 'assess_carcinogenicity_need',
  description:
    'Evaluate whether carcinogenicity studies are required per ICH S1A triggers ' +
    'and, if so, recommend a study design per ICH S1B(R1) and S1C(R2). Evaluates ' +
    'all ICH S1A triggers: clinical duration ≥6 months, positive genotoxicity, ' +
    'structural alerts, preneoplastic lesions in repeat-dose studies, endocrine ' +
    'activity, immunosuppression. Returns trigger-by-trigger assessment, ' +
    'recommended design (2-year rat bioassay, 6-month Tg.rasH2 transgenic mouse ' +
    'model, or weight-of-evidence waiver per ICH S1B(R1) 2022 revision), dose ' +
    'selection per ICH S1C(R2), and statistical approaches. Handles biologics ' +
    '(ICH S6(R1) — standard bioassays generally inappropriate) and oncology ' +
    '(ICH S9 — typically not required). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      clinicalDurationMonths: {
        type: 'number',
        description: 'Anticipated duration of clinical use in months. ≥6 months triggers carcinogenicity assessment per ICH S1A.',
      },
      moleculeType: {
        type: 'string',
        enum: ['small_molecule', 'biologic', 'antibody', 'peptide', 'oligonucleotide', 'adc', 'cell_therapy', 'gene_therapy'],
        description: 'Modality of the test article.',
      },
      therapeuticArea: {
        type: 'string',
        enum: ['oncology', 'anti_infective', 'cns', 'cardiovascular', 'metabolic', 'immunology', 'rare_disease', 'dermatology', 'ophthalmology', 'general'],
        description: 'Therapeutic area.',
      },
      indication: {
        type: 'string',
        description: 'Specific indication (e.g., "moderate-to-severe rheumatoid arthritis").',
      },
      isLifeThreatening: {
        type: 'boolean',
        description: 'Whether the indication is life-threatening (affects trigger evaluation).',
      },
      isOncology: {
        type: 'boolean',
        description: 'Oncology indication — carcinogenicity studies generally not required per ICH S9.',
      },
      genotoxicityResults: {
        type: 'array',
        description: 'Results from genotoxicity studies.',
        items: {
          type: 'object',
          properties: {
            assay: { type: 'string', description: 'Name of the assay.' },
            result: { type: 'string', enum: ['positive', 'negative', 'equivocal'], description: 'Outcome.' },
          },
          required: ['assay', 'result'],
        },
      },
      hasStructuralAlert: {
        type: 'boolean',
        description: 'Whether the compound has structural alerts for carcinogenicity.',
      },
      hasPreneoplasticLesions: {
        type: 'boolean',
        description: 'Whether preneoplastic lesions were observed in repeat-dose toxicity studies.',
      },
      hasEndocrineActivity: {
        type: 'boolean',
        description: 'Whether the compound has endocrine-related pharmacological activity.',
      },
      isImmunosuppressive: {
        type: 'boolean',
        description: 'Whether the compound is immunosuppressive.',
      },
      patientPopulation: {
        type: 'string',
        description: 'Patient population (e.g., "adult", "pediatric", "elderly"). Affects risk-benefit assessment.',
      },
    },
    required: ['clinicalDurationMonths', 'moleculeType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Reproductive / Developmental Toxicology
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_REPRO_TOX_STUDY: AnaTool = {
  name: 'design_repro_tox_study',
  description:
    'Design reproductive and developmental toxicology studies per ICH S5(R3). ' +
    'Covers all three segments: Segment I (fertility and early embryonic ' +
    'development — rat, male 4-week / female 2-week pre-mating), Segment II ' +
    '(embryo-fetal development — rat + rabbit, dosing during organogenesis), ' +
    'Segment III (pre- and postnatal development — rat, GD 6 through lactation). ' +
    'Returns species selection and justification, study timing relative to ' +
    'clinical phases (ICH M3(R2) requirements for WOCBP enrollment), group ' +
    'sizes, dose groups, endpoints (fetal examination, behavioral assessment, ' +
    'F1 fertility), and special considerations for biologics (ICH S6(R1) — ' +
    'pharmacologically relevant species, ePPND in NHP) and oncology (ICH S9 — ' +
    'deferred or waived fertility/PPND studies). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      studyType: {
        type: 'string',
        enum: ['fertility', 'embryo_fetal_development', 'prenatal_postnatal', 'all'],
        description: 'Which reproductive toxicology study segment(s) to design. Use "all" for a complete program.',
      },
      moleculeType: {
        type: 'string',
        enum: ['small_molecule', 'biologic', 'antibody', 'peptide', 'oligonucleotide', 'adc', 'cell_therapy', 'gene_therapy'],
        description: 'Modality of the test article.',
      },
      species: {
        type: 'string',
        description: 'Preferred species (if known). If omitted, the engine selects per ICH S5(R3) and ICH S6(R1).',
      },
      phase: {
        type: 'string',
        enum: ['phase1', 'phase1b', 'phase2', 'phase3', 'marketing'],
        description: 'Target clinical phase — determines timing requirements for study completion.',
      },
      therapeuticArea: {
        type: 'string',
        enum: ['oncology', 'anti_infective', 'cns', 'cardiovascular', 'metabolic', 'immunology', 'rare_disease', 'dermatology', 'ophthalmology', 'general'],
        description: 'Therapeutic area.',
      },
      isOncology: {
        type: 'boolean',
        description: 'Oncology indication — ICH S9 allows deferred fertility and PPND studies.',
      },
      patientPopulation: {
        type: 'string',
        enum: ['men_only', 'women_of_childbearing_potential', 'both', 'postmenopausal'],
        description: 'Intended patient population — affects timing requirements (e.g., WOCBP enrollment requires EFD data).',
      },
      includeJuvenile: {
        type: 'boolean',
        description: 'Whether to include juvenile animal toxicity study considerations.',
      },
      knownTeratogenicConcern: {
        type: 'boolean',
        description: 'Whether there is a known or suspected teratogenic concern (triggers enhanced EFD design).',
      },
    },
    required: ['studyType', 'moleculeType', 'phase'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported Array
// ─────────────────────────────────────────────────────────────────────────────

/** Preclinical toxicology tools, spread into ALL_ANA_TOOLS. */
export const TOXICOLOGY_TOOLS: AnaTool[] = [
  SELECT_TOX_SPECIES,
  DESIGN_REPEAT_DOSE_STUDY,
  CALCULATE_SAFETY_MARGIN,
  DESIGN_GENOTOX_BATTERY,
  ASSESS_CARCINOGENICITY_NEED,
  DESIGN_REPRO_TOX_STUDY,
];
