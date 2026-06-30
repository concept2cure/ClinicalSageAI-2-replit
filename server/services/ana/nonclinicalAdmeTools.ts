/**
 * Nonclinical PK / ADME & Toxicokinetics tools — exposes the deterministic
 * knowledge engines in `server/services/nonclinical-adme/nonclinical-adme-knowledge`
 * to AnA as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Scope: NONCLINICAL / in-vitro disposition supporting first-in-human (FIH)
 * entry and beyond — NOT clinical DDI risk classification.
 *
 * Tools:
 *   design_adme_program          — nonclinical ADME package by stage/modality/route
 *   design_mass_balance_study    — radiolabeled (14C/3H) mass-balance / ADME design
 *   assess_metabolite_safety     — MIST assessment (ICH M3(R2) / FDA 2020)
 *   design_toxicokinetics        — ICH S3A TK design embedded in tox studies
 *   design_reaction_phenotyping  — in-vitro CYP/UGT/transporter phenotyping + fm
 *   assess_protein_binding       — plasma protein binding (fu) cross-species
 *
 * @module server/services/ana/nonclinicalAdmeTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. design_adme_program
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_ADME_PROGRAM: AnaTool = {
  name: 'design_adme_program',
  description:
    'Assemble the overall NONCLINICAL ADME study package (absorption, distribution, ' +
    'metabolism, excretion) appropriate to a drug modality, development stage, and route ' +
    'of administration, with each study annotated by necessity and timing relative to ' +
    'first-in-human (FIH) dosing. Returns the study list (in-vitro permeability, metabolic ' +
    'stability, metabolite ID, reaction phenotyping, CYP inhibition/induction, transporter ' +
    'substrate/inhibition, protein binding, blood-to-plasma, QWBA tissue distribution, animal ' +
    'and human mass balance, toxicokinetics), an FIH readiness checklist, modality-specific ' +
    'strategy notes (small molecules vs. peptides/oligos/antibodies/ADCs under ICH S6(R1)), ' +
    'and citations (ICH M3(R2), ICH S3A, ICH S3B, FDA In Vitro DDI 2020, FDA MIST 2020, ICH ' +
    'M12). Use when the user needs to plan a nonclinical ADME program or determine what ADME ' +
    'data must be in hand before FIH. This is NONCLINICAL/in-vitro scope — it does not ' +
    'classify clinical DDI risk. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      modality: {
        type: 'string',
        enum: [
          'small_molecule',
          'peptide',
          'oligonucleotide',
          'antibody',
          'adc',
          'protein',
          'other_biologic',
        ],
        description:
          'Drug modality. Drives whether the classic small-molecule ADME package applies ' +
          '(small_molecule, adc) or whether ICH S6(R1) biologic disposition logic applies.',
      },
      developmentStage: {
        type: 'string',
        enum: [
          'lead_optimization',
          'candidate_selection',
          'ind_enabling',
          'phase1',
          'phase2',
          'phase3',
          'nda_bla',
        ],
        description:
          'Development stage. Determines which studies are required vs. recommended vs. ' +
          'optional at this point in the lifecycle.',
      },
      route: {
        type: 'string',
        enum: [
          'oral',
          'iv',
          'subcutaneous',
          'intramuscular',
          'inhalation',
          'topical',
          'ophthalmic',
          'intrathecal',
          'other',
        ],
        description:
          'Route of administration. Affects emphasis (e.g., IV de-emphasizes oral-absorption ' +
          'studies; local routes emphasize systemically-available fraction).',
      },
      isNewChemicalEntity: {
        type: 'boolean',
        description:
          'Whether the program is for a new chemical entity (NCE). Defaults to true for ' +
          'small_molecule. NCEs require the full in-vitro metabolism and DDI package before FIH.',
      },
      halfLife_hours: {
        type: 'number',
        description: 'Estimated elimination half-life in hours, if known (informational).',
      },
      metabolicClearanceExpected: {
        type: 'boolean',
        description:
          'Whether metabolism is expected to be the major clearance route. Defaults to true ' +
          'for small molecules. When false, reaction-phenotyping depth is reduced and ' +
          'excretion/transporter studies gain importance.',
      },
      ddiPotentialExpected: {
        type: 'boolean',
        description:
          'Whether the molecule is expected to be a CYP/transporter victim or perpetrator. ' +
          'When true, the in-vitro DDI package (inhibition/induction/transporter inhibition) ' +
          'is elevated to required and front-loaded.',
      },
      chronicDosing: {
        type: 'boolean',
        description:
          'Whether chronic (>= 6 month) dosing is intended. When true, accumulation and ' +
          'long tissue-retention triggers (ICH S3B) receive emphasis.',
      },
      drugName: {
        type: 'string',
        description: 'Name of the drug substance (optional, echoed only).',
      },
    },
    required: ['modality', 'developmentStage', 'route'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. design_mass_balance_study
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_MASS_BALANCE_STUDY: AnaTool = {
  name: 'design_mass_balance_study',
  description:
    'Design a radiolabeled (14C or 3H) mass-balance / ADME study in human or animal. ' +
    'Returns label-position guidance (metabolically stable position; 14C preferred over 3H ' +
    'to avoid exchange/loss), administered-radioactivity dose guidance (with dosimetry ' +
    'justification for human studies), the collection schedule across urine, feces, plasma/' +
    'blood, expired air and bile as relevant, a recovery target (>= 90% of administered ' +
    'radioactivity), an estimated collection duration derived from half-life, and a ' +
    'metabolite-profiling plan that quantifies each circulating human metabolite as a ' +
    'fraction of total drug-related exposure to feed the MIST assessment. Citations: ICH ' +
    'M3(R2), FDA Safety Testing of Drug Metabolites (2020), ICH S3B. Use when the user needs ' +
    'to design a human 14C ADME study or its animal counterpart. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        enum: ['human', 'animal'],
        description:
          'Whether the study is the human radiolabeled ADME study or the animal mass-balance ' +
          'study. Human studies are dosimetry-justified and use healthy subjects; animal ' +
          'studies dose at the toxicologically relevant level.',
      },
      isotope: {
        type: 'string',
        enum: ['14C', '3H'],
        description:
          'Radiolabel isotope. Default 14C. 14C is generally preferred for the definitive ' +
          'human study because 3H is prone to exchange/loss leading to falsely low recovery.',
      },
      route: {
        type: 'string',
        enum: [
          'oral',
          'iv',
          'subcutaneous',
          'intramuscular',
          'inhalation',
          'topical',
          'ophthalmic',
          'intrathecal',
          'other',
        ],
        description: 'Route of administration for the radiolabeled dose. Default oral.',
      },
      halfLife_hours: {
        type: 'number',
        description:
          'Estimated terminal half-life in hours. When provided, drives an estimated minimum ' +
          'collection duration (~7 half-lives, or ~10 if slow elimination is expected).',
      },
      slowEliminationExpected: {
        type: 'boolean',
        description:
          'Whether slow excretion is expected (e.g., covalent/tissue binding). When true, the ' +
          'collection period is extended and incomplete-recovery risk is flagged.',
      },
      biliaryExcretionSuspected: {
        type: 'boolean',
        description:
          'Whether biliary excretion is suspected to be a major route. When true, bile ' +
          'collection (bile-duct-cannulated animals) is recommended.',
      },
      species: {
        type: 'string',
        description: 'Animal species when subject = "animal" (e.g., "rat", "dog").',
      },
      drugName: {
        type: 'string',
        description: 'Name of the drug substance (optional, echoed only).',
      },
    },
    required: ['subject'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. assess_metabolite_safety
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_METABOLITE_SAFETY: AnaTool = {
  name: 'assess_metabolite_safety',
  description:
    'Perform a Metabolites-in-Safety-Testing (MIST) assessment per ICH M3(R2) and the FDA ' +
    'Safety Testing of Drug Metabolites guidance (2020). For each human metabolite, the ' +
    'engine determines whether it exceeds 10% of total drug-related exposure, whether animal ' +
    '(tox-species) exposure covers human exposure, and whether the metabolite is ' +
    'disproportionate (major in humans but not covered by animals) or human-unique. Returns ' +
    'a per-metabolite verdict (no_action / monitor / qualification_needed / ' +
    'human_unique_qualification), the lists of disproportionate-or-major and human-unique ' +
    'metabolites, an overall qualification-triggered flag, and recommended actions ' +
    '(synthesize and dose the metabolite, select an alternate tox species, etc.). Flags ' +
    'structural alerts and pharmacologically active metabolites. Citations: FDA MIST (2020), ' +
    'ICH M3(R2). Use when the user has human metabolite exposure data and needs to decide ' +
    'whether nonclinical metabolite qualification is required. This is NONCLINICAL metabolite ' +
    'safety — it does not classify clinical DDI risk. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      metabolites: {
        type: 'array',
        description: 'Array of human metabolites with exposure and characterization data.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Metabolite identifier or chemical name.',
            },
            percentOfTotalDrugRelated: {
              type: 'number',
              description:
                'Human exposure as a percent (0-100) of total drug-related (parent + all ' +
                'metabolites) exposure. The MIST threshold is 10%.',
            },
            humanToAnimalExposureRatio: {
              type: 'number',
              description:
                'Ratio of human exposure to the highest animal (tox-species) exposure for the ' +
                'same metabolite (human/animal). A value <= 1 means animal exposure covers ' +
                'human exposure. Omit if unknown.',
            },
            pharmacologicallyActive: {
              type: 'boolean',
              description: 'Whether the metabolite is pharmacologically active.',
            },
            structuralAlert: {
              type: 'boolean',
              description:
                'Whether the metabolite carries a structural alert / reactive-metabolite ' +
                'liability (lowers the threshold for concern).',
            },
            humanUnique: {
              type: 'boolean',
              description:
                'Whether the metabolite is unique to humans (not formed at meaningful levels ' +
                'in any tox species). Human-unique metabolites cannot have been covered by ' +
                'animal toxicology.',
            },
          },
          required: ['name', 'percentOfTotalDrugRelated'],
        },
      },
      exposureBasis: {
        type: 'string',
        enum: ['total_drug_related', 'parent'],
        description:
          'Basis used to express percentOfTotalDrugRelated. FDA MIST is defined relative to ' +
          'TOTAL drug-related exposure. Default total_drug_related. If "parent" is used, the ' +
          'engine flags that percentages should be re-expressed against total drug-related ' +
          'material.',
      },
      chronicUse: {
        type: 'boolean',
        description:
          'Whether the drug is intended for chronic use. When true, the assessment emphasizes ' +
          'steady-state / long-term exposure and a lower threshold for genotoxic alerts.',
      },
      drugName: {
        type: 'string',
        description: 'Name of the parent drug (optional, echoed only).',
      },
    },
    required: ['metabolites'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. design_toxicokinetics
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_TOXICOKINETICS: AnaTool = {
  name: 'design_toxicokinetics',
  description:
    'Design the toxicokinetics (TK) embedded within a nonclinical toxicology study per ICH ' +
    'S3A. Returns the sampling strategy (full-profile vs. composite/microsampling depending ' +
    'on rodent vs. non-rodent), the sampling days within the study (first dose, steady state, ' +
    'interim for carcinogenicity, critical windows for DART/juvenile), the exposure ' +
    'parameters to derive (AUC, Cmax, Tmax, half-life), exposure-margin framing on a systemic ' +
    'EXPOSURE basis (with a computed animal/human AUC multiple when both AUCs are supplied), ' +
    'and assessments of saturation (dose-proportionality of AUC/Cmax), accumulation (Day 1 ' +
    'vs. end-of-dosing ratio), and sex differences. Also advises on satellite vs. main-study ' +
    'animals and dose-group adequacy. Citations: ICH S3A (+ 2017 Q&A microsampling), ICH ' +
    'M3(R2). Use when the user needs to design TK sampling and exposure-margin analysis for a ' +
    'tox study. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      studyType: {
        type: 'string',
        enum: [
          'single_dose',
          'repeat_dose_rodent',
          'repeat_dose_nonrodent',
          'carcinogenicity',
          'reproductive_dart',
          'juvenile',
        ],
        description:
          'The toxicology study type the TK is embedded in. Drives sampling days and whether ' +
          'critical-window or interim sampling is needed.',
      },
      species: {
        type: 'string',
        description:
          'Tox species (e.g., "rat", "mouse", "dog", "cynomolgus monkey"). Determines ' +
          'composite/microsampling (rodent) vs. serial sampling (non-rodent).',
      },
      route: {
        type: 'string',
        enum: [
          'oral',
          'iv',
          'subcutaneous',
          'intramuscular',
          'inhalation',
          'topical',
          'ophthalmic',
          'intrathecal',
          'other',
        ],
        description: 'Route of administration in the tox study.',
      },
      doseGroups: {
        type: 'number',
        description:
          'Number of dose groups excluding control. Fewer than 3 limits dose-proportionality / ' +
          'saturation characterization.',
      },
      useSatelliteGroup: {
        type: 'boolean',
        description:
          'Whether a satellite (TK) group is used so that TK blood sampling does not ' +
          'compromise main-study toxicology endpoints. Common in rodents.',
      },
      anticipatedHumanAUC: {
        type: 'number',
        description:
          'Anticipated human therapeutic AUC (any consistent unit) for exposure-margin ' +
          'framing. Used with animalHighDoseAUC to compute the exposure multiple.',
      },
      animalHighDoseAUC: {
        type: 'number',
        description:
          'Achieved animal AUC at the high dose (same unit as anticipatedHumanAUC). The ' +
          'engine computes the exposure multiple = animal / human.',
      },
      saturationSuspected: {
        type: 'boolean',
        description:
          'Whether saturation of absorption/clearance is suspected. When true, the engine ' +
          'recommends >= 3 dose groups to characterize the plateau.',
      },
      accumulationSuspected: {
        type: 'boolean',
        description:
          'Whether accumulation on repeat dosing is suspected. When true, a late-study TK ' +
          'profile is emphasized to quantify the accumulation ratio.',
      },
      genderDifferenceSuspected: {
        type: 'boolean',
        description:
          'Whether a sex difference in exposure is suspected (common with sex-specific ' +
          'CYP/UGT/transporter expression in rodents).',
      },
      drugName: {
        type: 'string',
        description: 'Name of the drug substance (optional, echoed only).',
      },
    },
    required: ['studyType', 'species', 'route'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. design_reaction_phenotyping
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_REACTION_PHENOTYPING: AnaTool = {
  name: 'design_reaction_phenotyping',
  description:
    'Design an in-vitro reaction-phenotyping study to determine which enzymes metabolize the ' +
    'drug and estimate the fraction metabolized (fm) by each pathway. Returns the three ' +
    'orthogonal approaches required for a robust fm estimate (recombinant human enzymes; ' +
    'selective chemical inhibition in human liver microsomes; correlation analysis across an ' +
    'individual-donor HLM bank), a per-enzyme plan with selective inhibitors and marker ' +
    'reactions for the standard CYP panel (1A2, 2B6, 2C8, 2C9, 2C19, 2D6, 3A4) plus optional ' +
    'non-CYP enzymes (UGT, FMO, aldehyde oxidase), fm interpretation (pathways with fm >= ' +
    '0.25 are clinically meaningful; fm >= 0.5 indicates a sensitive victim), and flags ' +
    'enzymes as clinically meaningful when preliminary fm values are supplied. Citations: FDA ' +
    'In Vitro DDI (2020), ICH M12. Use when the user needs to plan reaction phenotyping or ' +
    'estimate fm. This is the IN-VITRO/nonclinical input to clinical DDI planning; it does not ' +
    'itself classify clinical DDI risk. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      candidateEnzymes: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'CYP1A2',
            'CYP2B6',
            'CYP2C8',
            'CYP2C9',
            'CYP2C19',
            'CYP2D6',
            'CYP2E1',
            'CYP3A4',
            'CYP3A5',
            'UGT1A1',
            'UGT1A3',
            'UGT1A4',
            'UGT1A9',
            'UGT2B7',
            'FMO',
            'AO',
            'non_cyp_other',
          ],
        },
        description:
          'Enzymes to phenotype. If omitted, the standard CYP panel (1A2, 2B6, 2C8, 2C9, ' +
          '2C19, 2D6, 3A4) is used, extended with UGT/FMO/AO when nonCypSuspected is true.',
      },
      metabolismMajorClearance: {
        type: 'boolean',
        description:
          'Whether metabolism is the major clearance route. Default true. When false, ' +
          'phenotyping is limited in scope.',
      },
      fractionMetabolic: {
        type: 'number',
        description:
          'Estimated overall fraction of clearance that is metabolic (0-1). Phenotyping is ' +
          'warranted when this is >= 0.25 (or when metabolismMajorClearance is true).',
      },
      nonCypSuspected: {
        type: 'boolean',
        description:
          'Whether non-CYP enzymes (UGT, FMO, aldehyde oxidase) are suspected. When true, the ' +
          'panel is extended and specialized-incubation warnings are returned.',
      },
      preliminaryFm: {
        type: 'array',
        description:
          'Optional preliminary fm estimates by enzyme (0-1), summing to <= 1. When supplied, ' +
          'enzymes with fm >= 0.25 are flagged as clinically meaningful.',
        items: {
          type: 'object',
          properties: {
            enzyme: {
              type: 'string',
              enum: [
                'CYP1A2',
                'CYP2B6',
                'CYP2C8',
                'CYP2C9',
                'CYP2C19',
                'CYP2D6',
                'CYP2E1',
                'CYP3A4',
                'CYP3A5',
                'UGT1A1',
                'UGT1A3',
                'UGT1A4',
                'UGT1A9',
                'UGT2B7',
                'FMO',
                'AO',
                'non_cyp_other',
              ],
              description: 'Enzyme the fm value applies to.',
            },
            fm: {
              type: 'number',
              description: 'Fraction metabolized by this enzyme (0-1).',
            },
          },
          required: ['enzyme', 'fm'],
        },
      },
      drugName: {
        type: 'string',
        description: 'Name of the drug substance (optional, echoed only).',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_protein_binding
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_PROTEIN_BINDING: AnaTool = {
  name: 'assess_protein_binding',
  description:
    'Assess plasma protein binding across species. For each species, the engine normalizes ' +
    'fraction unbound (fu) and percent bound, assigns a binding category, identifies the ' +
    'human fu, and computes the maximum cross-species fold difference in fu. Returns method ' +
    'guidance (equilibrium dialysis is the reference method; multi-concentration measurement ' +
    'to detect saturable binding; use the same method across species), implications for ' +
    'free-drug exposure and DDI (interpret safety margins on an unbound basis when binding ' +
    'differs across species; fu is a required input to in-vitro DDI parameters), and warnings ' +
    '(missing human data, large cross-species differences, concentration-dependent binding). ' +
    'Citations: ICH S3A, FDA In Vitro DDI (2020). Use when the user has protein-binding data ' +
    'and needs cross-species free-drug interpretation. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      speciesData: {
        type: 'array',
        description:
          'Per-species binding data; should include human plus the tox species. Provide ' +
          'either fractionUnbound or percentBound for each species.',
        items: {
          type: 'object',
          properties: {
            species: {
              type: 'string',
              description: 'Species name (e.g., "human", "rat", "dog"). Human anchors the comparison.',
            },
            fractionUnbound: {
              type: 'number',
              description: 'Fraction unbound (fu), 0-1. Provide this OR percentBound.',
            },
            percentBound: {
              type: 'number',
              description: 'Percent bound (0-100). Provide this OR fractionUnbound.',
            },
          },
          required: ['species'],
        },
      },
      method: {
        type: 'string',
        enum: ['equilibrium_dialysis', 'ultrafiltration', 'ultracentrifugation', 'other'],
        description:
          'Method used / planned. Default equilibrium_dialysis (the reference method). Other ' +
          'methods trigger non-specific-binding correction guidance.',
      },
      concentrationDependentSuspected: {
        type: 'boolean',
        description:
          'Whether binding is suspected to be concentration-dependent (saturable). When true, ' +
          'the engine recommends characterizing fu across the therapeutic range.',
      },
      drugName: {
        type: 'string',
        description: 'Name of the drug substance (optional, echoed only).',
      },
    },
    required: ['speciesData'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Nonclinical PK / ADME & Toxicokinetics tools, spread into ALL_ANA_TOOLS. */
export const NONCLINICAL_ADME_TOOLS: AnaTool[] = [
  DESIGN_ADME_PROGRAM,
  DESIGN_MASS_BALANCE_STUDY,
  ASSESS_METABOLITE_SAFETY,
  DESIGN_TOXICOKINETICS,
  DESIGN_REACTION_PHENOTYPING,
  ASSESS_PROTEIN_BINDING,
];
