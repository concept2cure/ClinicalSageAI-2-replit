/**
 * Safety Pharmacology — Deterministic Knowledge Base
 * ===================================================
 *
 * A pure, closed-form regulatory-science engine for the design and assessment
 * of safety pharmacology studies. There is NO LLM, NO network, NO database, and
 * NO import from any other service in this file. Every output is a deterministic
 * function of its typed input: identical input always yields identical output.
 *
 * Scope (ICH S7A core battery + supporting guidances):
 *   - designCoreBattery .................... ICH S7A vital-organ core battery design
 *   - assessCardiovascularSafetyPharmacology ICH S7A/S7B CV assessment + telemetry
 *   - assessCNSSafetyPharmacology .......... ICH S7A CNS (Irwin/FOB, motor, seizure)
 *   - assessRespiratorySafetyPharmacology .. ICH S7A respiratory (rate, TV, MV)
 *   - designFollowupSafetyStudy ............ ICH S7A supplemental/follow-up studies
 *   - assessAbuseLiability ................. FDA 2017 abuse-potential assessment
 *
 * Primary regulatory anchors (cited verbatim inside each engine):
 *   - ICH S7A: Safety Pharmacology Studies for Human Pharmaceuticals (2000/2001).
 *   - ICH S7B: Nonclinical Evaluation of the Potential for Delayed Ventricular
 *     Repolarization (QT Interval Prolongation) by Human Pharmaceuticals (2005).
 *   - ICH S6(R1): Preclinical Safety Evaluation of Biotechnology-Derived
 *     Pharmaceuticals (2011).
 *   - ICH M3(R2): Nonclinical Safety Studies for the Conduct of Human Clinical
 *     Trials and Marketing Authorization for Pharmaceuticals (2009).
 *   - FDA Guidance: Assessment of Abuse Potential of Drugs (January 2017).
 *   - ICH E14/S7B Q&A: Clinical and Nonclinical Evaluation of QT/QTc Interval
 *     Prolongation and Proarrhythmic Potential — Questions and Answers (2022).
 *
 * IMPORTANT for downstream consumers: report the returned numbers and the
 * regulatory citations verbatim. Do not recompute, re-round, or substitute an
 * alternate regulatory interpretation. A fabricated or misattributed nonclinical
 * citation in an IND/CTA safety package is a critical regulatory defect.
 *
 * @module server/services/safety-pharmacology/safety-pharmacology-knowledge
 */

/* eslint-disable @typescript-eslint/no-magic-numbers */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 0. Shared types and reference data
// ─────────────────────────────────────────────────────────────────────────────

/** Modality of the investigational product. Drives S7A vs S6(R1) logic. */
export type ProductModality =
  | 'small_molecule'
  | 'peptide'
  | 'monoclonal_antibody'
  | 'biologic_other'
  | 'oligonucleotide'
  | 'gene_therapy'
  | 'cell_therapy'
  | 'vaccine';

/** Development phase the safety-pharmacology package is intended to support. */
export type DevelopmentPhase =
  | 'preclinical'
  | 'fih_phase1'
  | 'phase2'
  | 'phase3'
  | 'marketing_application';

/** Route of clinical administration. */
export type AdministrationRoute =
  | 'oral'
  | 'intravenous'
  | 'subcutaneous'
  | 'intramuscular'
  | 'inhalation'
  | 'topical'
  | 'transdermal'
  | 'intrathecal'
  | 'ophthalmic'
  | 'other';

/** The three S7A core-battery vital organ systems. */
export type VitalOrganSystem = 'cardiovascular' | 'central_nervous' | 'respiratory';

/** Decision severity used across engines. */
export type Recommendation =
  | 'required'
  | 'recommended'
  | 'conditional'
  | 'not_required'
  | 'case_by_case';

/** A single regulatory citation. */
export interface RegulatoryCitation {
  source: string;
  section: string;
  text: string;
}

/** A measured or planned endpoint within a study. */
export interface SafetyEndpoint {
  endpoint: string;
  parameter: string;
  method: string;
  rationale: string;
  citation: string;
}

/** A recommended in vivo / in vitro study within a battery. */
export interface RecommendedStudy {
  studyName: string;
  organSystem: VitalOrganSystem | 'supplemental' | 'in_vitro';
  preferredSpecies: string[];
  glpRequired: boolean;
  timingRelativeToFIH: string;
  conscious: boolean;
  endpoints: SafetyEndpoint[];
  citation: string;
}

/** A free-form warning / advisory surfaced to the user. */
export interface Advisory {
  severity: 'info' | 'caution' | 'critical';
  message: string;
  citation?: string;
}

/**
 * Canonical ICH S7A definition strings, reused verbatim so that every engine
 * cites the identical text. Defined as a typed interface (NOT `as const`) to
 * avoid TS4104/TS2322 narrowing problems when spread into typed results.
 */
interface CanonCitations {
  s7aCoreDefinition: RegulatoryCitation;
  s7aVitalSystems: RegulatoryCitation;
  s7aGlp: RegulatoryCitation;
  s7aTiming: RegulatoryCitation;
  s7aSupplemental: RegulatoryCitation;
  s7aFollowup: RegulatoryCitation;
  s7aExclusions: RegulatoryCitation;
  s7bHerg: RegulatoryCitation;
  s6r1Biologics: RegulatoryCitation;
  m3r2: RegulatoryCitation;
  e14s7bQa: RegulatoryCitation;
  fdaAbuse2017: RegulatoryCitation;
}

const CANON: CanonCitations = {
  s7aCoreDefinition: {
    source: 'ICH S7A',
    section: '2.7.1 / 2.7.2 (Core Battery)',
    text:
      'The core battery is intended to investigate the effects of the test ' +
      'substance on vital functions. The cardiovascular, central nervous, and ' +
      'respiratory systems are usually considered the vital organ systems that ' +
      'should be studied in the core battery.',
  },
  s7aVitalSystems: {
    source: 'ICH S7A',
    section: '2.7.2',
    text:
      'Effects of the test substance on the cardiovascular, central nervous, ' +
      'and respiratory systems should be assessed before first administration ' +
      'to humans (the core battery).',
  },
  s7aGlp: {
    source: 'ICH S7A',
    section: '2.4 (GLP)',
    text:
      'Safety pharmacology core-battery studies should be conducted in ' +
      'compliance with Good Laboratory Practice (GLP) to the greatest extent ' +
      'feasible. Where studies are not conducted in full compliance with GLP, ' +
      'the level of compliance and the rationale should be specified.',
  },
  s7aTiming: {
    source: 'ICH S7A',
    section: '2.2 / 7 (Timing)',
    text:
      'Core-battery safety pharmacology information should generally be ' +
      'available before first administration to humans. Follow-up and ' +
      'supplemental studies may be conducted later in development, as warranted.',
  },
  s7aSupplemental: {
    source: 'ICH S7A',
    section: '2.7.3 (Supplemental studies)',
    text:
      'Supplemental studies evaluate potential adverse pharmacodynamic effects ' +
      'on organ-system functions not addressed by the core battery or repeated-' +
      'dose toxicity studies when there is a cause for concern (e.g., renal, ' +
      'gastrointestinal, autonomic, immune, or other systems).',
  },
  s7aFollowup: {
    source: 'ICH S7A',
    section: '2.7.3 (Follow-up studies)',
    text:
      'Follow-up studies provide a greater depth of understanding than, or ' +
      'additional knowledge to, that provided by the core battery for the ' +
      'cardiovascular, central nervous, or respiratory systems.',
  },
  s7aExclusions: {
    source: 'ICH S7A',
    section: '2.5 (Conditions for not conducting studies)',
    text:
      'Safety pharmacology studies may not be needed for locally applied agents ' +
      '(e.g., dermal, ocular) where the pharmacology is well characterized and ' +
      'systemic exposure or distribution to other organs is low, or for ' +
      'cytotoxic agents for treatment of end-stage cancer; the rationale should ' +
      'be documented.',
  },
  s7bHerg: {
    source: 'ICH S7B',
    section: '2.2 / 2.3 (Nonclinical QT)',
    text:
      'The nonclinical strategy for assessing delayed ventricular repolarization ' +
      'comprises an in vitro IKr (hERG) assay and an in vivo QT assay, integrated ' +
      'with cardiovascular safety pharmacology and an evidence-of-confidence ' +
      'assessment under the ICH E14/S7B Q&A.',
  },
  s6r1Biologics: {
    source: 'ICH S6(R1)',
    section: '6 (Safety Pharmacology)',
    text:
      'For biotechnology-derived pharmaceuticals, safety pharmacology endpoints ' +
      'should be evaluated, but stand-alone safety pharmacology studies may not ' +
      'be needed when endpoints can be incorporated into the design of toxicology ' +
      'studies, particularly when using a pharmacologically relevant species.',
  },
  m3r2: {
    source: 'ICH M3(R2)',
    section: '6 / 11',
    text:
      'The core battery of safety pharmacology studies (per ICH S7A) and an ' +
      'assessment of QT prolongation potential (per ICH S7B) should generally be ' +
      'completed before the initiation of clinical studies.',
  },
  e14s7bQa: {
    source: 'ICH E14/S7B Q&A (2022)',
    section: 'Q&A 1–6 (Best Practices / Integrated Risk Assessment)',
    text:
      'Best-practice in vitro hERG and in vivo QT data, generated to defined ' +
      'standards (concentration-response, positive control, evidence-of-confidence), ' +
      'can contribute to an integrated nonclinical/clinical QT risk assessment and ' +
      'may support a reduced reliance on a dedicated clinical thorough-QT study.',
  },
  fdaAbuse2017: {
    source: 'FDA Guidance: Assessment of Abuse Potential of Drugs (Jan 2017)',
    section: 'III–VI',
    text:
      'Drugs that are centrally active (cross the blood-brain barrier) and have ' +
      'chemical/pharmacological similarity to known drugs of abuse, or produce ' +
      'CNS effects, should be evaluated for abuse potential through a program of ' +
      'nonclinical and clinical studies, supporting the 8-factor analysis under ' +
      'Section 201(c) of the Controlled Substances Act (21 U.S.C. 811(c)).',
  },
};

/**
 * Drug/target classes with established central activity that trigger an abuse-
 * potential evaluation under FDA 2017. Typed array — no `as const`.
 */
interface AbuseTriggerClass {
  className: string;
  exampleTargets: string[];
  defaultScheduleHint: string;
}

const CNS_ABUSE_TRIGGER_CLASSES: AbuseTriggerClass[] = [
  {
    className: 'Opioid / mu-opioid receptor agonist',
    exampleTargets: ['MOR (OPRM1) agonist', 'partial agonist', 'mixed agonist-antagonist'],
    defaultScheduleHint: 'Schedule II–IV depending on efficacy/antagonist content',
  },
  {
    className: 'CNS depressant — GABA-A positive modulator',
    exampleTargets: ['benzodiazepine site', 'barbiturate site', 'neurosteroid site'],
    defaultScheduleHint: 'Schedule II–IV',
  },
  {
    className: 'CNS stimulant — monoamine releaser/reuptake inhibitor',
    exampleTargets: ['DAT', 'NET', 'amphetamine-like releaser'],
    defaultScheduleHint: 'Schedule II–IV',
  },
  {
    className: 'Cannabinoid CB1 agonist',
    exampleTargets: ['CB1 agonist', 'synthetic cannabinoid'],
    defaultScheduleHint: 'Schedule I–III depending on context',
  },
  {
    className: 'Classic / atypical hallucinogen',
    exampleTargets: ['5-HT2A agonist', 'NMDA antagonist (dissociative)', 'kappa-opioid agonist'],
    defaultScheduleHint: 'Schedule I–III (psychedelics in clinical development)',
  },
  {
    className: 'GABA-B agonist / sedative-hypnotic',
    exampleTargets: ['GABA-B agonist', 'gamma-hydroxybutyrate-like'],
    defaultScheduleHint: 'Schedule I–III',
  },
];

/**
 * The eight statutory factors of the FDA/DEA abuse-potential analysis under
 * Section 201(c) of the Controlled Substances Act (21 U.S.C. 811(c)).
 */
interface EightFactor {
  factor: number;
  title: string;
  description: string;
}

const CSA_EIGHT_FACTORS: EightFactor[] = [
  {
    factor: 1,
    title: "Actual or relative potential for abuse",
    description:
      'Direct evidence of abuse (epidemiology, drug-discrimination, self-' +
      'administration) and similarity to known drugs of abuse.',
  },
  {
    factor: 2,
    title: 'Scientific evidence of pharmacological effect',
    description:
      'Receptor binding, in vivo pharmacology, and CNS effects that produce ' +
      'reinforcing or subjective effects.',
  },
  {
    factor: 3,
    title: 'State of current scientific knowledge',
    description: 'Chemistry, formulation, and the body of nonclinical/clinical data.',
  },
  {
    factor: 4,
    title: 'History and current pattern of abuse',
    description: 'Documented misuse of the drug or its pharmacological class.',
  },
  {
    factor: 5,
    title: 'Scope, duration, and significance of abuse',
    description: 'Public-health magnitude of any observed or anticipated abuse.',
  },
  {
    factor: 6,
    title: 'Risk to the public health',
    description: 'Consequences of abuse to the individual and society.',
  },
  {
    factor: 7,
    title: 'Psychic or physiological dependence liability',
    description:
      'Physical-dependence (withdrawal) and psychological-dependence evidence, ' +
      'including dedicated dependence studies.',
  },
  {
    factor: 8,
    title: 'Whether an immediate precursor of a controlled substance',
    description: 'Whether the substance is a precursor already controlled under the CSA.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers (pure)
// ─────────────────────────────────────────────────────────────────────────────

/** Decide whether stand-alone S7A studies are expected for the modality. */
function isLargeMoleculeModality(modality: ProductModality): boolean {
  return (
    modality === 'monoclonal_antibody' ||
    modality === 'biologic_other' ||
    modality === 'peptide' ||
    modality === 'oligonucleotide' ||
    modality === 'gene_therapy' ||
    modality === 'cell_therapy' ||
    modality === 'vaccine'
  );
}

/** Round to a fixed number of decimal places, deterministically. */
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Stable de-duplication preserving first occurrence. */
function unique<T>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1. designCoreBattery — ICH S7A core battery design
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignCoreBatteryParams {
  /** Investigational product modality. */
  modality: ProductModality;
  /** Clinical route of administration. */
  route: AdministrationRoute;
  /** Development phase the package supports. */
  phase?: DevelopmentPhase;
  /** True if the agent is centrally active (crosses the blood-brain barrier). */
  cnsActive?: boolean;
  /** True if the product is locally applied with low systemic exposure. */
  locallyAppliedLowSystemic?: boolean;
  /** True if a cytotoxic agent for end-stage cancer (S7A 2.5 exclusion). */
  cytotoxicEndStageOncology?: boolean;
  /**
   * True when a pharmacologically relevant repeat-dose tox species exists into
   * which biologic safety-pharmacology endpoints can be integrated (S6(R1)).
   */
  pharmacologicallyRelevantToxSpeciesAvailable?: boolean;
  /** True if hERG/in vivo QT data are already available. */
  hergAndInVivoQTAvailable?: boolean;
}

export interface DesignCoreBatteryResult {
  modality: ProductModality;
  route: AdministrationRoute;
  phase: DevelopmentPhase;
  coreBatteryRequired: boolean;
  standaloneStudiesExpected: boolean;
  exclusionApplies: boolean;
  exclusionRationale: string | null;
  organSystems: VitalOrganSystem[];
  recommendedStudies: RecommendedStudy[];
  qtAssessment: {
    hergRequired: boolean;
    inVivoQTRequired: boolean;
    integratedRiskAssessment: string;
  };
  glpExpectation: string;
  timing: string;
  advisories: Advisory[];
  citations: RegulatoryCitation[];
}

/**
 * Design the ICH S7A core battery across the three vital organ systems. Pure
 * and deterministic. Handles small-molecule (stand-alone studies), biologics
 * (S6(R1) integration into toxicology), local/cytotoxic exclusions (S7A 2.5),
 * and the S7B/E14-S7B Q&A QT integration point.
 */
export function designCoreBattery(
  params: DesignCoreBatteryParams,
): DesignCoreBatteryResult {
  const phase: DevelopmentPhase = params.phase ?? 'fih_phase1';
  const advisories: Advisory[] = [];
  const citations: RegulatoryCitation[] = [
    CANON.s7aCoreDefinition,
    CANON.s7aVitalSystems,
    CANON.s7aGlp,
    CANON.s7aTiming,
    CANON.m3r2,
  ];

  // --- Exclusion analysis (S7A 2.5) -----------------------------------------
  let exclusionApplies = false;
  let exclusionRationale: string | null = null;

  if (params.cytotoxicEndStageOncology) {
    exclusionApplies = true;
    exclusionRationale =
      'Cytotoxic agent for treatment of end-stage cancer — per ICH S7A 2.5, ' +
      'core-battery safety pharmacology studies may not be needed before FIH; ' +
      'the rationale and any planned in-study cardiovascular/respiratory ' +
      'monitoring should be documented.';
    citations.push(CANON.s7aExclusions);
    advisories.push({
      severity: 'caution',
      message:
        'Exclusion claimed for end-stage oncology cytotoxic. Confirm the agent ' +
        'is genuinely cytotoxic (not a targeted/immuno agent) and document a ' +
        'clinical cardiovascular monitoring plan in lieu of a dedicated study.',
      citation: 'ICH S7A 2.5',
    });
  } else if (
    params.locallyAppliedLowSystemic &&
    (params.route === 'topical' ||
      params.route === 'ophthalmic' ||
      params.route === 'transdermal')
  ) {
    exclusionApplies = true;
    exclusionRationale =
      'Locally applied agent with low systemic exposure (ICH S7A 2.5). Core ' +
      'battery may be waived if systemic exposure and distribution to other ' +
      'organs are demonstrably low and the pharmacology is well characterized; ' +
      'document the exposure rationale.';
    citations.push(CANON.s7aExclusions);
    advisories.push({
      severity: 'caution',
      message:
        'Local-application exclusion is conditional on demonstrated low systemic ' +
        'exposure. Provide toxicokinetic data supporting low Cmax/AUC before ' +
        'waiving the core battery.',
      citation: 'ICH S7A 2.5',
    });
  }

  const largeMolecule = isLargeMoleculeModality(params.modality);
  const standaloneStudiesExpected =
    !exclusionApplies &&
    !(
      largeMolecule &&
      params.pharmacologicallyRelevantToxSpeciesAvailable === true
    );

  if (largeMolecule) {
    citations.push(CANON.s6r1Biologics);
    if (params.pharmacologicallyRelevantToxSpeciesAvailable) {
      advisories.push({
        severity: 'info',
        message:
          'Biologic with a pharmacologically relevant repeat-dose toxicology ' +
          'species available: per ICH S6(R1), safety-pharmacology endpoints ' +
          '(ECG/telemetry, clinical observations, respiratory parameters) should ' +
          'be incorporated into the general toxicology study rather than run as ' +
          'stand-alone S7A studies.',
        citation: 'ICH S6(R1) §6',
      });
    } else {
      advisories.push({
        severity: 'caution',
        message:
          'Biologic without a clearly relevant pharmacology species. Justify ' +
          'species selection and the safety-pharmacology strategy; consider ' +
          'in vitro/ex vivo or transgenic/homologous-protein approaches.',
        citation: 'ICH S6(R1) §6',
      });
    }
  }

  // --- Organ systems ---------------------------------------------------------
  const organSystems: VitalOrganSystem[] = exclusionApplies
    ? []
    : ['cardiovascular', 'central_nervous', 'respiratory'];

  // --- Recommended studies ---------------------------------------------------
  const recommendedStudies: RecommendedStudy[] = [];

  if (!exclusionApplies) {
    // Cardiovascular
    recommendedStudies.push({
      studyName: standaloneStudiesExpected
        ? 'Cardiovascular safety pharmacology (conscious telemetry)'
        : 'Cardiovascular endpoints integrated into repeat-dose toxicology',
      organSystem: 'cardiovascular',
      preferredSpecies: standaloneStudiesExpected
        ? ['dog (Beagle)', 'cynomolgus monkey', 'minipig']
        : ['the pharmacologically relevant toxicology species'],
      glpRequired: true,
      timingRelativeToFIH: 'Before first administration to humans',
      conscious: true,
      endpoints: [
        {
          endpoint: 'Blood pressure',
          parameter: 'Systolic/diastolic/mean arterial pressure',
          method: 'Implanted telemetry (preferred) in conscious animals',
          rationale: 'Detects pressor/depressor hemodynamic liabilities.',
          citation: 'ICH S7A 2.7.2',
        },
        {
          endpoint: 'Heart rate',
          parameter: 'HR (bpm)',
          method: 'Telemetry ECG-derived',
          rationale: 'Detects chrono­tropic effects (tachy-/brady-cardia).',
          citation: 'ICH S7A 2.7.2',
        },
        {
          endpoint: 'Electrocardiogram',
          parameter: 'PR, QRS, RR, QT, QTc',
          method: 'Telemetry ECG with rate-correction (QTc)',
          rationale: 'Detects conduction and repolarization liabilities; S7B link.',
          citation: 'ICH S7A 2.7.2 / ICH S7B',
        },
      ],
      citation: 'ICH S7A 2.7.2 (cardiovascular core)',
    });

    // CNS
    recommendedStudies.push({
      studyName: standaloneStudiesExpected
        ? 'CNS safety pharmacology (Irwin / functional observational battery)'
        : 'CNS clinical observations integrated into repeat-dose toxicology',
      organSystem: 'central_nervous',
      preferredSpecies: ['rat (preferred rodent)'],
      glpRequired: true,
      timingRelativeToFIH: 'Before first administration to humans',
      conscious: true,
      endpoints: [
        {
          endpoint: 'Functional observational battery / Irwin',
          parameter: 'Behavior, autonomic signs, neuromuscular, sensorimotor',
          method: 'Modified Irwin screen or FOB in conscious rodents',
          rationale: 'Detects qualitative CNS effects and gross neurotoxicity.',
          citation: 'ICH S7A 2.7.2',
        },
        {
          endpoint: 'Locomotor / motor activity',
          parameter: 'Spontaneous motor activity (counts)',
          method: 'Automated activity monitors',
          rationale: 'Quantifies sedation/stimulation.',
          citation: 'ICH S7A 2.7.2',
        },
      ],
      citation: 'ICH S7A 2.7.2 (CNS core)',
    });

    // Respiratory
    recommendedStudies.push({
      studyName: standaloneStudiesExpected
        ? 'Respiratory safety pharmacology (whole-body plethysmography)'
        : 'Respiratory endpoints integrated into repeat-dose toxicology',
      organSystem: 'respiratory',
      preferredSpecies: ['rat (preferred rodent)'],
      glpRequired: true,
      timingRelativeToFIH: 'Before first administration to humans',
      conscious: true,
      endpoints: [
        {
          endpoint: 'Respiratory rate',
          parameter: 'Breaths per minute',
          method: 'Whole-body or head-out plethysmography in conscious animals',
          rationale: 'Detects respiratory depression/stimulation.',
          citation: 'ICH S7A 2.7.2',
        },
        {
          endpoint: 'Tidal volume / minute volume',
          parameter: 'TV (mL), MV (mL/min)',
          method: 'Plethysmography',
          rationale: 'Distinguishes rate vs. depth-driven ventilation changes.',
          citation: 'ICH S7A 2.7.2',
        },
      ],
      citation: 'ICH S7A 2.7.2 (respiratory core)',
    });
  }

  // --- QT / hERG integration -------------------------------------------------
  const hergRequired = !exclusionApplies && params.modality === 'small_molecule';
  const inVivoQTRequired = !exclusionApplies;
  let integratedRiskAssessment =
    'Per ICH S7B and the ICH E14/S7B Q&A (2022), combine the in vitro IKr (hERG) ' +
    'assay with the in vivo QT assessment (typically embedded in the CV telemetry ' +
    'study) into an integrated proarrhythmia risk assessment.';

  if (hergRequired || inVivoQTRequired) {
    citations.push(CANON.s7bHerg, CANON.e14s7bQa);
  }
  if (params.hergAndInVivoQTAvailable) {
    integratedRiskAssessment +=
      ' hERG and in vivo QT data are reported as already available — verify they ' +
      'meet the E14/S7B Q&A best-practice and evidence-of-confidence criteria so ' +
      'they can contribute to the integrated QT risk assessment.';
  }
  if (largeMolecule && params.modality !== 'small_molecule') {
    integratedRiskAssessment +=
      ' For this biologic, a stand-alone hERG assay is generally not informative; ' +
      'rely on in vivo ECG/QT from the relevant pharmacology species.';
  }

  // --- GLP / timing strings --------------------------------------------------
  const glpExpectation =
    'Core-battery safety pharmacology studies should be GLP-compliant to the ' +
    'greatest extent feasible (ICH S7A 2.4). Any deviation from full GLP must be ' +
    'specified with rationale.';
  const timing =
    'Core-battery information should be available before first administration to ' +
    'humans (ICH S7A 2.2; ICH M3(R2) §11). Follow-up/supplemental studies may be ' +
    'completed later in development.';

  const coreBatteryRequired = !exclusionApplies;

  if (params.route === 'inhalation') {
    advisories.push({
      severity: 'caution',
      message:
        'Inhalation route: emphasize respiratory endpoints and consider ' +
        'additional pulmonary function measures; align exposure with the ' +
        'intended clinical aerosol delivery.',
      citation: 'ICH S7A 2.7.2',
    });
  }
  if (phase === 'preclinical') {
    advisories.push({
      severity: 'info',
      message:
        'Package is being assembled pre-FIH — schedule the core battery to read ' +
        'out before the IND/CTA enabling toxicology package is finalized.',
    });
  }

  return {
    modality: params.modality,
    route: params.route,
    phase,
    coreBatteryRequired,
    standaloneStudiesExpected,
    exclusionApplies,
    exclusionRationale,
    organSystems,
    recommendedStudies,
    qtAssessment: {
      hergRequired,
      inVivoQTRequired,
      integratedRiskAssessment,
    },
    glpExpectation,
    timing,
    advisories,
    citations: unique(citations),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2. assessCardiovascularSafetyPharmacology
// ─────────────────────────────────────────────────────────────────────────────

export interface CardiovascularParams {
  modality: ProductModality;
  route: AdministrationRoute;
  /** Preferred large-animal species, if already chosen. */
  species?: 'dog' | 'cynomolgus_monkey' | 'minipig' | 'other';
  /** True if an in vitro hERG IKr assay has been performed. */
  hergAssayDone?: boolean;
  /** hERG IC50 in µM, if available. */
  hergIC50_uM?: number;
  /** Anticipated clinical free Cmax in µM, if available (for safety margin). */
  clinicalFreeCmax_uM?: number;
  /** True if an in vivo QT signal was observed in telemetry. */
  inVivoQTSignalObserved?: boolean;
  /** True if a positive control (e.g., moxifloxacin) was included. */
  positiveControlIncluded?: boolean;
  /** True if the program will rely on E14/S7B Q&A to reduce a clinical TQT. */
  seekingTQTWaiverViaQa?: boolean;
}

export interface CardiovascularResult {
  studyDesign: {
    preferredModel: string;
    species: string[];
    conscious: boolean;
    telemetry: string;
    studyType: string;
    doseLevels: string;
    glpRequired: boolean;
    timingRelativeToFIH: string;
  };
  endpoints: SafetyEndpoint[];
  qtIntegration: {
    hergRequired: boolean;
    hergSafetyMargin: number | null;
    hergMarginInterpretation: string;
    inVivoQTRequired: boolean;
    positiveControlStatus: string;
    e14s7bQaPathway: string;
  };
  riskFlags: Advisory[];
  citations: RegulatoryCitation[];
}

/**
 * Assess the cardiovascular safety-pharmacology package per ICH S7A/S7B with the
 * E14/S7B Q&A integration point. Computes the hERG-to-clinical-exposure safety
 * margin deterministically when both values are supplied.
 */
export function assessCardiovascularSafetyPharmacology(
  params: CardiovascularParams,
): CardiovascularResult {
  const citations: RegulatoryCitation[] = [
    CANON.s7aVitalSystems,
    CANON.s7bHerg,
    CANON.e14s7bQa,
    CANON.s7aGlp,
  ];
  const riskFlags: Advisory[] = [];
  const largeMolecule = isLargeMoleculeModality(params.modality);

  const speciesMap: Record<string, string> = {
    dog: 'dog (Beagle)',
    cynomolgus_monkey: 'cynomolgus monkey',
    minipig: 'minipig (Göttingen)',
    other: 'other (justify selection)',
  };
  const species = params.species
    ? [speciesMap[params.species]]
    : largeMolecule
      ? ['cynomolgus monkey (pharmacologically relevant species)']
      : ['dog (Beagle)', 'cynomolgus monkey', 'minipig'];

  const studyDesign = {
    preferredModel:
      'Conscious, freely-moving large animal with implanted radiotelemetry',
    species,
    conscious: true,
    telemetry:
      'Implanted radiotelemetry capturing arterial BP, ECG (lead II or modified), ' +
      'HR and body temperature; Latin-square or crossover dosing with adequate ' +
      'washout. Continuous recording typically ≥ 24 h post-dose.',
    studyType: largeMolecule
      ? 'CV endpoints integrated into the repeat-dose toxicology study where a ' +
        'relevant species is used (ICH S6(R1)), or a stand-alone telemetry study'
      : 'Stand-alone GLP cardiovascular safety pharmacology study',
    doseLevels:
      'At least three dose levels plus vehicle, with the high dose producing ' +
      'exposure multiples above the anticipated clinical exposure (ideally ' +
      'covering the expected human Cmax with margin).',
    glpRequired: true,
    timingRelativeToFIH: 'Before first administration to humans (ICH S7A 2.2)',
  };

  const endpoints: SafetyEndpoint[] = [
    {
      endpoint: 'Arterial blood pressure',
      parameter: 'Systolic, diastolic, mean arterial pressure (mmHg)',
      method: 'Implanted telemetry pressure catheter',
      rationale: 'Hemodynamic pressor/depressor liability.',
      citation: 'ICH S7A 2.7.2',
    },
    {
      endpoint: 'Heart rate',
      parameter: 'HR (bpm)',
      method: 'Telemetry ECG-derived',
      rationale: 'Chronotropic effects.',
      citation: 'ICH S7A 2.7.2',
    },
    {
      endpoint: 'ECG morphology and intervals',
      parameter: 'PR, QRS, RR, QT, rate-corrected QTc',
      method: 'Telemetry ECG with individual rate-correction',
      rationale: 'Conduction and repolarization (delayed repolarization) liability.',
      citation: 'ICH S7A 2.7.2 / ICH S7B',
    },
    {
      endpoint: 'Cardiac contractility (when warranted)',
      parameter: 'LV dP/dt max, ejection-related indices',
      method: 'Pressure-volume telemetry or echocardiography (follow-up)',
      rationale: 'Inotropic liability; typically a follow-up endpoint.',
      citation: 'ICH S7A 2.7.3 (follow-up)',
    },
  ];

  // --- hERG / QT integration -------------------------------------------------
  const hergRequired = !largeMolecule;
  let hergSafetyMargin: number | null = null;
  let hergMarginInterpretation =
    'Provide an in vitro IKr (hERG) IC50 and the anticipated clinical free Cmax ' +
    'to compute a safety margin.';

  if (
    typeof params.hergIC50_uM === 'number' &&
    typeof params.clinicalFreeCmax_uM === 'number' &&
    params.clinicalFreeCmax_uM > 0
  ) {
    hergSafetyMargin = roundTo(params.hergIC50_uM / params.clinicalFreeCmax_uM, 2);
    if (hergSafetyMargin >= 30) {
      hergMarginInterpretation =
        `hERG IC50 / clinical free Cmax = ${hergSafetyMargin}× — a margin ≥ 30× is ` +
        'conventionally regarded as reassuring for direct IKr block, though it must ' +
        'be interpreted within the integrated ICH E14/S7B Q&A assessment.';
    } else if (hergSafetyMargin >= 10) {
      hergMarginInterpretation =
        `hERG IC50 / clinical free Cmax = ${hergSafetyMargin}× — an intermediate margin ` +
        '(10–30×). Strengthen the in vivo QT data and the evidence-of-confidence ' +
        'package before relying on it.';
      riskFlags.push({
        severity: 'caution',
        message:
          'Intermediate hERG margin (10–30×). Plan robust in vivo QT and a clinical ' +
          'QT strategy aligned with ICH E14.',
        citation: 'ICH E14/S7B Q&A',
      });
    } else {
      hergMarginInterpretation =
        `hERG IC50 / clinical free Cmax = ${hergSafetyMargin}× — a LOW margin (< 10×) ` +
        'indicates meaningful proarrhythmic concern; expect heightened scrutiny and ' +
        'likely a dedicated clinical QT evaluation.';
      riskFlags.push({
        severity: 'critical',
        message:
          'Low hERG safety margin (< 10×). Treat QT prolongation as a material risk; ' +
          'a thorough clinical QT assessment is likely required.',
        citation: 'ICH S7B / ICH E14',
      });
    }
  }

  if (params.inVivoQTSignalObserved) {
    riskFlags.push({
      severity: 'critical',
      message:
        'In vivo QT signal observed in telemetry. Characterize concentration-QTc ' +
        'relationship and carry the finding into the clinical QT strategy.',
      citation: 'ICH S7B 2.3',
    });
  }

  const positiveControlStatus = params.positiveControlIncluded
    ? 'Positive control (e.g., moxifloxacin) included — supports assay sensitivity ' +
      'and evidence-of-confidence per ICH E14/S7B Q&A.'
    : 'No positive control reported. A positive control is needed to demonstrate ' +
      'assay sensitivity for an evidence-of-confidence QT package (ICH E14/S7B Q&A).';
  if (!params.positiveControlIncluded) {
    riskFlags.push({
      severity: 'caution',
      message:
        'Include a positive control (moxifloxacin in vivo; dofetilide/E-4031 in vitro) ' +
        'to establish assay sensitivity for the integrated QT risk assessment.',
      citation: 'ICH E14/S7B Q&A',
    });
  }

  let e14s7bQaPathway =
    'The integrated ICH E14/S7B Q&A pathway combines best-practice in vitro hERG ' +
    'and in vivo QT data into an evidence-of-confidence assessment.';
  if (params.seekingTQTWaiverViaQa) {
    if (largeMolecule) {
      e14s7bQaPathway +=
        ' For this biologic, the E14/S7B Q&A "double-negative" nonclinical pathway ' +
        '(which is anchored on a clean hERG assay) does not directly apply; rely on ' +
        'in vivo QT and clinical ECG monitoring instead.';
      riskFlags.push({
        severity: 'caution',
        message:
          'A nonclinical-data-based clinical-TQT reduction (E14/S7B Q&A) is intended ' +
          'for small molecules with a valid hERG assay; reconsider for this biologic.',
        citation: 'ICH E14/S7B Q&A',
      });
    } else {
      e14s7bQaPathway +=
        ' To support reduced reliance on a dedicated clinical thorough-QT study, the ' +
        'hERG and in vivo QT data must meet the Q&A best-practice standards (full ' +
        'concentration-response, validated positive control, demonstrated ' +
        'evidence-of-confidence). Confirm regulatory concurrence early.';
    }
  }

  if (largeMolecule) {
    citations.push(CANON.s6r1Biologics);
  }

  return {
    studyDesign,
    endpoints,
    qtIntegration: {
      hergRequired,
      hergSafetyMargin,
      hergMarginInterpretation,
      inVivoQTRequired: true,
      positiveControlStatus,
      e14s7bQaPathway,
    },
    riskFlags,
    citations: unique(citations),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3. assessCNSSafetyPharmacology
// ─────────────────────────────────────────────────────────────────────────────

export interface CNSParams {
  modality: ProductModality;
  route: AdministrationRoute;
  /** True if the agent crosses the blood-brain barrier / is centrally active. */
  cnsActive?: boolean;
  /** Known/expected pharmacology suggesting seizure liability. */
  seizureLiabilitySuspected?: boolean;
  /** Pharmacology suggesting sedation/abuse-relevant CNS effects. */
  sedativeOrStimulantActivity?: boolean;
  /** True if the program targets a CNS indication. */
  cnsIndication?: boolean;
  /** Preferred rodent species, if chosen. */
  species?: 'rat' | 'mouse' | 'other';
}

export interface CNSResult {
  studyDesign: {
    preferredModel: string;
    species: string[];
    conscious: boolean;
    studyType: string;
    glpRequired: boolean;
    timingRelativeToFIH: string;
  };
  coreEndpoints: SafetyEndpoint[];
  followupEndpoints: SafetyEndpoint[];
  seizureLiability: {
    flagged: boolean;
    recommendation: Recommendation;
    rationale: string;
  };
  bodyTemperature: SafetyEndpoint;
  abuseLiabilityCrossReference: string;
  advisories: Advisory[];
  citations: RegulatoryCitation[];
}

/**
 * Assess the CNS safety-pharmacology package per ICH S7A: Irwin/functional
 * observational battery, motor activity, behavior, seizure liability, and body
 * temperature. Deterministic.
 */
export function assessCNSSafetyPharmacology(params: CNSParams): CNSResult {
  const citations: RegulatoryCitation[] = [
    CANON.s7aVitalSystems,
    CANON.s7aCoreDefinition,
    CANON.s7aGlp,
  ];
  const advisories: Advisory[] = [];
  const largeMolecule = isLargeMoleculeModality(params.modality);

  const speciesMap: Record<string, string> = {
    rat: 'rat (preferred rodent)',
    mouse: 'mouse',
    other: 'other (justify selection)',
  };
  const species = params.species
    ? [speciesMap[params.species]]
    : ['rat (preferred rodent)'];

  const studyDesign = {
    preferredModel:
      'Conscious rodent functional observational battery (FOB) or modified ' +
      'Irwin screen, with automated locomotor activity',
    species,
    conscious: true,
    studyType: largeMolecule
      ? 'CNS clinical-observation endpoints may be integrated into repeat-dose ' +
        'toxicology in a relevant species (ICH S6(R1)); otherwise a stand-alone ' +
        'FOB/Irwin study'
      : 'Stand-alone GLP CNS safety pharmacology study (FOB/Irwin + motor activity)',
    glpRequired: true,
    timingRelativeToFIH: 'Before first administration to humans (ICH S7A 2.2)',
  };

  const coreEndpoints: SafetyEndpoint[] = [
    {
      endpoint: 'Functional observational battery / Irwin screen',
      parameter:
        'Autonomic (salivation, lacrimation, pupil), neuromuscular (gait, grip, ' +
        'tone), sensorimotor (reflexes), behavioral (arousal, stereotypy)',
      method: 'Standardized blinded observation in conscious rodents',
      rationale:
        'Detects the qualitative profile of CNS effects and gross neurotoxicity.',
      citation: 'ICH S7A 2.7.2',
    },
    {
      endpoint: 'Spontaneous locomotor / motor activity',
      parameter: 'Activity counts over a defined interval',
      method: 'Automated activity monitors (infrared beam-break)',
      rationale: 'Quantifies sedation versus stimulation.',
      citation: 'ICH S7A 2.7.2',
    },
    {
      endpoint: 'Behavioral assessment',
      parameter: 'Arousal, posture, reactivity, abnormal behavior',
      method: 'Observational scoring within the FOB',
      rationale: 'Characterizes behavioral pharmacodynamics.',
      citation: 'ICH S7A 2.7.2',
    },
  ];

  const followupEndpoints: SafetyEndpoint[] = [
    {
      endpoint: 'Learning and memory (follow-up)',
      parameter: 'Cognitive performance (e.g., passive avoidance, water maze)',
      method: 'Dedicated cognitive paradigm',
      rationale: 'Follow-up when a cause for concern is identified.',
      citation: 'ICH S7A 2.7.3',
    },
    {
      endpoint: 'Nerve conduction / visual / auditory function (follow-up)',
      parameter: 'Electrophysiology as indicated',
      method: 'Targeted electrophysiology',
      rationale: 'Greater depth for specific CNS concerns.',
      citation: 'ICH S7A 2.7.3',
    },
  ];

  // Seizure liability ---------------------------------------------------------
  const seizureFlagged =
    params.seizureLiabilitySuspected === true ||
    (params.cnsActive === true && params.cnsIndication === true);
  const seizureLiability = {
    flagged: seizureFlagged,
    recommendation: (seizureFlagged ? 'recommended' : 'case_by_case') as Recommendation,
    rationale: seizureFlagged
      ? 'CNS-active agent or suspected pro-convulsant pharmacology: a follow-up ' +
        'seizure-liability evaluation (e.g., EEG monitoring, in vitro/in vivo ' +
        'seizure models, careful FOB convulsion scoring) is recommended in addition ' +
        'to the core FOB.'
      : 'No specific pro-convulsant signal flagged; convulsions remain a scored ' +
        'item within the FOB and are followed up only on cause for concern.',
  };
  if (seizureFlagged) {
    citations.push(CANON.s7aFollowup);
    advisories.push({
      severity: 'caution',
      message:
        'Seizure liability flagged. Add convulsion/EEG endpoints and review the ' +
        'general-toxicology in-life data for tremor/convulsion before FIH.',
      citation: 'ICH S7A 2.7.3',
    });
  }

  const bodyTemperature: SafetyEndpoint = {
    endpoint: 'Body temperature',
    parameter: 'Core/surface temperature (°C)',
    method: 'Telemetry or rectal probe within the CNS or CV study',
    rationale:
      'Hyper-/hypothermia is a recognized CNS-mediated safety-pharmacology ' +
      'endpoint and is commonly captured alongside the FOB.',
    citation: 'ICH S7A 2.7.2',
  };

  let abuseLiabilityCrossReference =
    'If the agent is centrally active, evaluate abuse potential per the FDA 2017 ' +
    'guidance (use assessAbuseLiability).';
  if (params.cnsActive || params.sedativeOrStimulantActivity) {
    abuseLiabilityCrossReference =
      'This agent shows central activity (sedative/stimulant or CNS penetration). ' +
      'An abuse-potential assessment is triggered under the FDA 2017 guidance — ' +
      'run assessAbuseLiability and feed CNS FOB findings (sedation, stimulation, ' +
      'stereotypy) into the analysis.';
    citations.push(CANON.fdaAbuse2017);
    advisories.push({
      severity: 'info',
      message:
        'Central activity present — cross-reference the abuse-liability engine; CNS ' +
        'FOB signals (stimulation/sedation) are inputs to the 8-factor analysis.',
      citation: 'FDA 2017 Abuse Potential Guidance',
    });
  }

  if (largeMolecule) {
    citations.push(CANON.s6r1Biologics);
    advisories.push({
      severity: 'info',
      message:
        'For this biologic, CNS endpoints are usually limited to clinical ' +
        'observations within toxicology unless CNS penetration/target engagement ' +
        'is expected (ICH S6(R1)).',
      citation: 'ICH S6(R1) §6',
    });
  }

  return {
    studyDesign,
    coreEndpoints,
    followupEndpoints,
    seizureLiability,
    bodyTemperature,
    abuseLiabilityCrossReference,
    advisories,
    citations: unique(citations),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4. assessRespiratorySafetyPharmacology
// ─────────────────────────────────────────────────────────────────────────────

export interface RespiratoryParams {
  modality: ProductModality;
  route: AdministrationRoute;
  /** Pharmacology suggesting respiratory depression (e.g., opioid). */
  respiratoryDepressantActivity?: boolean;
  /** Preferred rodent species, if chosen. */
  species?: 'rat' | 'mouse' | 'dog' | 'other';
  /** Whether a blood-gas / pulse-oximetry follow-up is planned. */
  bloodGasFollowupPlanned?: boolean;
}

export interface RespiratoryResult {
  studyDesign: {
    preferredModel: string;
    species: string[];
    conscious: boolean;
    method: string;
    studyType: string;
    glpRequired: boolean;
    timingRelativeToFIH: string;
  };
  coreEndpoints: SafetyEndpoint[];
  followupEndpoints: SafetyEndpoint[];
  depressionRisk: {
    flagged: boolean;
    recommendation: Recommendation;
    rationale: string;
  };
  advisories: Advisory[];
  citations: RegulatoryCitation[];
}

/**
 * Assess the respiratory safety-pharmacology package per ICH S7A: respiratory
 * rate, tidal volume, and minute volume by plethysmography in conscious animals,
 * with blood-gas/oximetry as a follow-up. Deterministic.
 */
export function assessRespiratorySafetyPharmacology(
  params: RespiratoryParams,
): RespiratoryResult {
  const citations: RegulatoryCitation[] = [
    CANON.s7aVitalSystems,
    CANON.s7aCoreDefinition,
    CANON.s7aGlp,
  ];
  const advisories: Advisory[] = [];
  const largeMolecule = isLargeMoleculeModality(params.modality);

  const speciesMap: Record<string, string> = {
    rat: 'rat (preferred rodent)',
    mouse: 'mouse',
    dog: 'dog (Beagle, for large-animal jacketed plethysmography)',
    other: 'other (justify selection)',
  };
  const species = params.species
    ? [speciesMap[params.species]]
    : ['rat (preferred rodent)'];

  const studyDesign = {
    preferredModel:
      'Conscious, unrestrained animal in whole-body plethysmography (rodent) or ' +
      'jacketed/head-out plethysmography (large animal)',
    species,
    conscious: true,
    method:
      'Whole-body plethysmography (preferred for rodents); minimize restraint and ' +
      'measurement artifact. Record over an adequate post-dose window.',
    studyType: largeMolecule
      ? 'Respiratory endpoints may be integrated into repeat-dose toxicology in a ' +
        'relevant species (ICH S6(R1)); otherwise a stand-alone plethysmography study'
      : 'Stand-alone GLP respiratory safety pharmacology study',
    glpRequired: true,
    timingRelativeToFIH: 'Before first administration to humans (ICH S7A 2.2)',
  };

  const coreEndpoints: SafetyEndpoint[] = [
    {
      endpoint: 'Respiratory rate',
      parameter: 'Breaths per minute (bpm)',
      method: 'Whole-body plethysmography in conscious animals',
      rationale: 'Detects respiratory depression or stimulation.',
      citation: 'ICH S7A 2.7.2',
    },
    {
      endpoint: 'Tidal volume',
      parameter: 'TV (mL/breath)',
      method: 'Plethysmography',
      rationale: 'Detects changes in depth of ventilation.',
      citation: 'ICH S7A 2.7.2',
    },
    {
      endpoint: 'Minute volume',
      parameter: 'MV = rate × tidal volume (mL/min)',
      method: 'Derived from plethysmography',
      rationale: 'Integrates rate and depth to quantify total ventilation.',
      citation: 'ICH S7A 2.7.2',
    },
  ];

  const followupEndpoints: SafetyEndpoint[] = [
    {
      endpoint: 'Arterial blood gases (follow-up)',
      parameter: 'pO2, pCO2, pH, oxygen saturation',
      method: 'Arterial sampling / pulse oximetry',
      rationale:
        'Follow-up to characterize the functional consequence of a ventilatory ' +
        'change (e.g., hypoxemia/hypercapnia) on a cause for concern.',
      citation: 'ICH S7A 2.7.3',
    },
    {
      endpoint: 'Airway resistance / compliance (follow-up)',
      parameter: 'Resistance (cmH2O/mL/s), dynamic compliance',
      method: 'Invasive/restrained plethysmography',
      rationale: 'Distinguishes bronchoconstriction from central depression.',
      citation: 'ICH S7A 2.7.3',
    },
  ];

  const depressantFlagged = params.respiratoryDepressantActivity === true;
  const depressionRisk = {
    flagged: depressantFlagged,
    recommendation: (depressantFlagged ? 'recommended' : 'case_by_case') as Recommendation,
    rationale: depressantFlagged
      ? 'Pharmacology suggests respiratory-depressant liability (e.g., opioid or ' +
        'CNS depressant): strengthen ventilatory characterization and add a ' +
        'blood-gas/oximetry follow-up to quantify hypoxemia/hypercapnia and the ' +
        'concentration-effect relationship.'
      : 'No specific respiratory-depressant pharmacology flagged; the core ' +
        'plethysmography endpoints are sufficient unless a signal emerges.',
  };
  if (depressantFlagged) {
    citations.push(CANON.s7aFollowup);
    advisories.push({
      severity: 'caution',
      message:
        'Respiratory-depressant liability flagged. Plan blood-gas/oximetry ' +
        'follow-up and align clinical respiratory monitoring at FIH.',
      citation: 'ICH S7A 2.7.3',
    });
  }
  if (params.route === 'inhalation') {
    advisories.push({
      severity: 'caution',
      message:
        'Inhalation route: respiratory endpoints are central. Match nebulized/' +
        'aerosol exposure to intended clinical delivery and consider local airway ' +
        'irritation endpoints.',
      citation: 'ICH S7A 2.7.2',
    });
  }
  if (params.bloodGasFollowupPlanned) {
    advisories.push({
      severity: 'info',
      message: 'Blood-gas follow-up already planned — confirm it is powered to ' +
        'detect the anticipated ventilatory change.',
    });
  }
  if (largeMolecule) {
    citations.push(CANON.s6r1Biologics);
  }

  return {
    studyDesign,
    coreEndpoints,
    followupEndpoints,
    depressionRisk,
    advisories,
    citations: unique(citations),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5. designFollowupSafetyStudy — supplemental/follow-up studies
// ─────────────────────────────────────────────────────────────────────────────

/** Organ systems for supplemental S7A studies (beyond the core battery). */
export type SupplementalSystem =
  | 'renal'
  | 'gastrointestinal'
  | 'autonomic'
  | 'immune'
  | 'skeletal_muscle'
  | 'endocrine';

export interface FollowupSafetyParams {
  /**
   * Trigger source(s): findings in the core battery, repeat-dose tox, class
   * effects, or clinical signals warranting a deeper/supplemental evaluation.
   */
  triggers: Array<{
    organSystem: VitalOrganSystem | SupplementalSystem;
    source: 'core_battery' | 'repeat_dose_tox' | 'class_effect' | 'clinical_signal';
    description: string;
  }>;
  modality: ProductModality;
  /** Whether the agent is centrally active. */
  cnsActive?: boolean;
}

interface FollowupStudyTemplate {
  system: VitalOrganSystem | SupplementalSystem;
  category: 'follow_up' | 'supplemental';
  studyName: string;
  endpoints: string[];
  preferredSpecies: string[];
  citation: string;
}

/** Static catalogue of follow-up/supplemental study templates (no `as const`). */
const FOLLOWUP_TEMPLATES: FollowupStudyTemplate[] = [
  {
    system: 'cardiovascular',
    category: 'follow_up',
    studyName: 'Cardiac contractility / proarrhythmia follow-up',
    endpoints: [
      'LV dP/dt and pressure-volume loops',
      'Echocardiographic ejection fraction',
      'Proarrhythmia model (e.g., wedge, Langendorff, or in silico CiPA)',
    ],
    preferredSpecies: ['dog', 'cynomolgus monkey', 'rabbit (wedge)'],
    citation: 'ICH S7A 2.7.3 (follow-up CV)',
  },
  {
    system: 'central_nervous',
    category: 'follow_up',
    studyName: 'CNS follow-up (EEG / seizure / cognition)',
    endpoints: ['EEG', 'Seizure-threshold models', 'Learning and memory paradigms'],
    preferredSpecies: ['rat', 'mouse'],
    citation: 'ICH S7A 2.7.3 (follow-up CNS)',
  },
  {
    system: 'respiratory',
    category: 'follow_up',
    studyName: 'Respiratory follow-up (blood gases / airway mechanics)',
    endpoints: ['Arterial blood gases', 'Airway resistance and compliance', 'Pulse oximetry'],
    preferredSpecies: ['rat', 'dog'],
    citation: 'ICH S7A 2.7.3 (follow-up respiratory)',
  },
  {
    system: 'renal',
    category: 'supplemental',
    studyName: 'Renal/urinary supplemental study',
    endpoints: [
      'Urine volume and osmolality',
      'Electrolyte excretion (Na+, K+, Cl-)',
      'Glomerular filtration / clearance markers',
      'Urinary pH and protein',
    ],
    preferredSpecies: ['rat'],
    citation: 'ICH S7A 2.7.3 (supplemental renal)',
  },
  {
    system: 'gastrointestinal',
    category: 'supplemental',
    studyName: 'Gastrointestinal supplemental study',
    endpoints: [
      'Gastric secretion and pH',
      'GI transit (charcoal meal)',
      'In vitro ileal/intestinal contractility',
    ],
    preferredSpecies: ['rat', 'mouse'],
    citation: 'ICH S7A 2.7.3 (supplemental GI)',
  },
  {
    system: 'autonomic',
    category: 'supplemental',
    studyName: 'Autonomic nervous system supplemental study',
    endpoints: [
      'Baroreflex sensitivity',
      'Responses to autonomic agonists/antagonists',
      'Heart-rate variability',
    ],
    preferredSpecies: ['dog', 'rat'],
    citation: 'ICH S7A 2.7.3 (supplemental autonomic)',
  },
  {
    system: 'immune',
    category: 'supplemental',
    studyName: 'Immune-function supplemental study',
    endpoints: ['Cytokine release', 'Functional immune assays'],
    preferredSpecies: ['rat', 'cynomolgus monkey'],
    citation: 'ICH S7A 2.7.3 (supplemental immune)',
  },
  {
    system: 'skeletal_muscle',
    category: 'supplemental',
    studyName: 'Skeletal-muscle supplemental study',
    endpoints: ['Grip strength', 'Neuromuscular junction function'],
    preferredSpecies: ['rat'],
    citation: 'ICH S7A 2.7.3 (supplemental skeletal muscle)',
  },
  {
    system: 'endocrine',
    category: 'supplemental',
    studyName: 'Endocrine supplemental study',
    endpoints: ['Hormone panels', 'Glucose homeostasis'],
    preferredSpecies: ['rat'],
    citation: 'ICH S7A 2.7.3 (supplemental endocrine)',
  },
];

export interface FollowupStudyRecommendation {
  system: VitalOrganSystem | SupplementalSystem;
  category: 'follow_up' | 'supplemental';
  recommendation: Recommendation;
  studyName: string;
  endpoints: string[];
  preferredSpecies: string[];
  triggerSummary: string;
  citation: string;
}

export interface FollowupSafetyResult {
  anyStudyWarranted: boolean;
  recommendations: FollowupStudyRecommendation[];
  generalGuidance: string;
  advisories: Advisory[];
  citations: RegulatoryCitation[];
}

/**
 * Map core-battery / toxicology / clinical triggers to ICH S7A follow-up
 * (deeper CV/CNS/respiratory) and supplemental (renal/GI/autonomic/immune/etc.)
 * studies. Deterministic — driven entirely by the supplied triggers.
 */
export function designFollowupSafetyStudy(
  params: FollowupSafetyParams,
): FollowupSafetyResult {
  const citations: RegulatoryCitation[] = [
    CANON.s7aSupplemental,
    CANON.s7aFollowup,
    CANON.s7aGlp,
  ];
  const advisories: Advisory[] = [];
  const recommendations: FollowupStudyRecommendation[] = [];

  for (const template of FOLLOWUP_TEMPLATES) {
    const matching = params.triggers.filter(
      (t: FollowupSafetyParams['triggers'][number]) => t.organSystem === template.system,
    );
    if (matching.length === 0) {
      continue;
    }
    const hasClinical = matching.some(
      (t: FollowupSafetyParams['triggers'][number]) => t.source === 'clinical_signal',
    );
    const recommendation: Recommendation = hasClinical ? 'required' : 'recommended';
    const triggerSummary = matching
      .map(
        (t: FollowupSafetyParams['triggers'][number]) =>
          `${t.source}: ${t.description}`,
      )
      .join(' | ');

    recommendations.push({
      system: template.system,
      category: template.category,
      recommendation,
      studyName: template.studyName,
      endpoints: template.endpoints.slice(),
      preferredSpecies: template.preferredSpecies.slice(),
      triggerSummary,
      citation: template.citation,
    });
  }

  if (params.cnsActive) {
    advisories.push({
      severity: 'info',
      message:
        'Centrally active agent — consider proactively scheduling CNS follow-up ' +
        '(EEG/seizure) and reviewing autonomic endpoints even absent an explicit ' +
        'trigger.',
      citation: 'ICH S7A 2.7.3',
    });
  }

  const anyStudyWarranted = recommendations.length > 0;
  if (!anyStudyWarranted) {
    advisories.push({
      severity: 'info',
      message:
        'No triggers supplied that map to a follow-up/supplemental study. ' +
        'Follow-up and supplemental studies are conducted only on a cause for ' +
        'concern (ICH S7A 2.7.3).',
    });
  }

  const generalGuidance =
    'Follow-up studies add depth to a core vital-organ system; supplemental ' +
    'studies cover organ systems outside the core battery (renal, GI, autonomic, ' +
    'immune, etc.) when there is a cause for concern. They may be conducted later ' +
    'in development and need not precede FIH unless the trigger is a material ' +
    'clinical or core-battery safety signal (ICH S7A 2.7.3; ICH M3(R2)).';

  citations.push(CANON.m3r2);

  return {
    anyStudyWarranted,
    recommendations,
    generalGuidance,
    advisories,
    citations: unique(citations),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6. assessAbuseLiability — FDA 2017 abuse-potential assessment
// ─────────────────────────────────────────────────────────────────────────────

export interface AbuseLiabilityParams {
  /** Investigational product modality. */
  modality: ProductModality;
  /** True if the agent crosses the blood-brain barrier. */
  crossesBloodBrainBarrier?: boolean;
  /**
   * Primary pharmacological target/class, free text. Matched against the
   * built-in CNS abuse-trigger class list (case-insensitive substring).
   */
  pharmacologicalClass?: string;
  /** True if CNS effects (euphoria, sedation, hallucination) were observed. */
  cnsEffectsObserved?: boolean;
  /** True if structurally/pharmacologically similar to a known drug of abuse. */
  similarToKnownDrugOfAbuse?: boolean;
  /** Phase of development (drives which studies are expected now). */
  phase?: DevelopmentPhase;
  /** Whether a dedicated self-administration study has been done. */
  selfAdministrationDone?: boolean;
  /** Whether a drug-discrimination study has been done. */
  drugDiscriminationDone?: boolean;
  /** Whether a physical-dependence/withdrawal study has been done. */
  dependenceStudyDone?: boolean;
}

export interface AbuseStudyRecommendation {
  studyType: string;
  purpose: string;
  recommendation: Recommendation;
  status: 'done' | 'outstanding';
  citation: string;
}

export interface AbuseLiabilityResult {
  abuseAssessmentTriggered: boolean;
  triggerRationale: string;
  matchedClass: AbuseTriggerClass | null;
  nonclinicalStudies: AbuseStudyRecommendation[];
  clinicalStudies: AbuseStudyRecommendation[];
  eightFactorAnalysis: EightFactor[];
  csaSchedulingImplication: {
    likelyControlled: boolean;
    scheduleHint: string;
    note: string;
  };
  advisories: Advisory[];
  citations: RegulatoryCitation[];
}

/**
 * Assess abuse potential per the FDA 2017 guidance "Assessment of Abuse Potential
 * of Drugs". Determines whether the assessment is triggered (central activity +
 * abuse-relevant pharmacology), enumerates the required nonclinical (self-
 * administration, drug-discrimination, physical-dependence) and clinical (human
 * abuse-potential) studies, lays out the CSA 8-factor analysis, and provides a
 * scheduling implication. Deterministic.
 */
export function assessAbuseLiability(
  params: AbuseLiabilityParams,
): AbuseLiabilityResult {
  const citations: RegulatoryCitation[] = [CANON.fdaAbuse2017];
  const advisories: Advisory[] = [];

  // --- Class match -----------------------------------------------------------
  let matchedClass: AbuseTriggerClass | null = null;
  if (params.pharmacologicalClass) {
    const needle = params.pharmacologicalClass.toLowerCase();
    for (const cls of CNS_ABUSE_TRIGGER_CLASSES) {
      const hayClass = cls.className.toLowerCase();
      const hayTargets = cls.exampleTargets.map((t: string) => t.toLowerCase());
      if (
        hayClass.includes(needle) ||
        needle.includes(hayClass.split(' ')[0]) ||
        hayTargets.some((t: string) => t.includes(needle) || needle.includes(t))
      ) {
        matchedClass = cls;
        break;
      }
    }
  }

  // --- Trigger logic (FDA 2017 §III) ----------------------------------------
  const central =
    params.crossesBloodBrainBarrier === true ||
    params.cnsEffectsObserved === true ||
    matchedClass !== null;
  const abuseRelevant =
    matchedClass !== null ||
    params.similarToKnownDrugOfAbuse === true ||
    params.cnsEffectsObserved === true;

  const abuseAssessmentTriggered = central && abuseRelevant;

  let triggerRationale: string;
  if (abuseAssessmentTriggered) {
    const reasons: string[] = [];
    if (params.crossesBloodBrainBarrier) reasons.push('crosses the blood-brain barrier');
    if (matchedClass) reasons.push(`matches abuse-relevant class "${matchedClass.className}"`);
    if (params.cnsEffectsObserved) reasons.push('produces CNS effects');
    if (params.similarToKnownDrugOfAbuse) reasons.push('similar to a known drug of abuse');
    triggerRationale =
      'Abuse-potential assessment is triggered under FDA 2017 §III because the ' +
      `drug is centrally active and abuse-relevant (${reasons.join('; ')}).`;
  } else {
    triggerRationale =
      'Abuse-potential assessment is not triggered: the drug does not appear to be ' +
      'centrally active with abuse-relevant pharmacology. A full program is generally ' +
      'unnecessary, but CNS findings emerging in development should be monitored and ' +
      'can re-trigger the assessment (FDA 2017 §III).';
  }

  // --- Nonclinical studies ---------------------------------------------------
  const nonclinicalStudies: AbuseStudyRecommendation[] = [];
  if (abuseAssessmentTriggered) {
    nonclinicalStudies.push({
      studyType: 'Receptor-binding / pharmacology profiling',
      purpose:
        'Characterize affinity at abuse-relevant targets (mu-opioid, GABA-A, DAT, ' +
        'CB1, 5-HT2A, etc.) and relate to known drugs of abuse.',
      recommendation: 'required',
      status: 'outstanding',
      citation: 'FDA 2017 §IV.A',
    });
    nonclinicalStudies.push({
      studyType: 'Drug-discrimination study',
      purpose:
        'Determine whether the drug produces interoceptive (subjective) effects ' +
        'similar to a known drug of abuse training stimulus.',
      recommendation: 'recommended',
      status: params.drugDiscriminationDone ? 'done' : 'outstanding',
      citation: 'FDA 2017 §IV.B',
    });
    nonclinicalStudies.push({
      studyType: 'Self-administration study',
      purpose:
        'Assess reinforcing efficacy (the hallmark of abuse liability) in a model ' +
        'of operant drug self-administration.',
      recommendation: 'recommended',
      status: params.selfAdministrationDone ? 'done' : 'outstanding',
      citation: 'FDA 2017 §IV.B',
    });
    nonclinicalStudies.push({
      studyType: 'Physical-dependence / withdrawal study',
      purpose:
        'Evaluate physical dependence by abrupt discontinuation or antagonist ' +
        'precipitation and characterize the withdrawal syndrome.',
      recommendation: 'recommended',
      status: params.dependenceStudyDone ? 'done' : 'outstanding',
      citation: 'FDA 2017 §IV.C',
    });
  }

  // --- Clinical studies ------------------------------------------------------
  const clinicalStudies: AbuseStudyRecommendation[] = [];
  if (abuseAssessmentTriggered) {
    const phase: DevelopmentPhase = params.phase ?? 'phase2';
    const huaRecommendation: Recommendation =
      phase === 'phase3' || phase === 'marketing_application' ? 'required' : 'recommended';
    clinicalStudies.push({
      studyType: 'Human abuse-potential (HAP) study',
      purpose:
        'A randomized, double-blind, placebo- and positive-controlled crossover ' +
        'study in recreational drug users measuring "drug liking" (e.g., VAS) and ' +
        'related subjective measures.',
      recommendation: huaRecommendation,
      status: 'outstanding',
      citation: 'FDA 2017 §V',
    });
    clinicalStudies.push({
      studyType: 'Clinical physical-dependence / withdrawal assessment',
      purpose:
        'Evaluate withdrawal on discontinuation in clinical studies (e.g., a ' +
        'structured taper/abrupt-stop assessment).',
      recommendation: 'recommended',
      status: 'outstanding',
      citation: 'FDA 2017 §V',
    });
    clinicalStudies.push({
      studyType: 'Adverse-event signal review for abuse-related events',
      purpose:
        'Systematically collect euphoria, abuse, misuse, diversion, and overdose ' +
        'events across the clinical program.',
      recommendation: 'required',
      status: 'outstanding',
      citation: 'FDA 2017 §V',
    });
  }

  // --- CSA scheduling implication --------------------------------------------
  const likelyControlled = abuseAssessmentTriggered;
  const scheduleHint = matchedClass
    ? matchedClass.defaultScheduleHint
    : abuseAssessmentTriggered
      ? 'Schedule II–V (to be determined by the 8-factor analysis and HHS/DEA review)'
      : 'Not anticipated to be a controlled substance';
  const csaSchedulingImplication = {
    likelyControlled,
    scheduleHint,
    note:
      'Final scheduling is a DEA determination informed by an HHS scientific and ' +
      'medical evaluation and the 8-factor analysis under Section 201(c) of the CSA ' +
      '(21 U.S.C. 811(c)). The sponsor provides an abuse-potential assessment in the ' +
      'NDA; control status (and Schedule) is set before or near approval.',
  };

  if (abuseAssessmentTriggered) {
    advisories.push({
      severity: 'caution',
      message:
        'Plan the abuse-potential program early. The FDA expects the nonclinical ' +
        'package (binding, drug-discrimination, self-administration, dependence) to ' +
        'inform the timing of a human abuse-potential study, and an 8-factor ' +
        'analysis to be submitted in the NDA.',
      citation: 'FDA 2017 §IV–VI',
    });
    if (params.modality !== 'small_molecule') {
      advisories.push({
        severity: 'info',
        message:
          'Abuse potential is uncommon for large-molecule biologics that do not ' +
          'penetrate the CNS; confirm CNS exposure/target engagement before ' +
          'committing to a full program.',
        citation: 'FDA 2017 §III',
      });
    }
  }

  return {
    abuseAssessmentTriggered,
    triggerRationale,
    matchedClass,
    nonclinicalStudies,
    clinicalStudies,
    eightFactorAnalysis: CSA_EIGHT_FACTORS.map((f: EightFactor) => ({ ...f })),
    csaSchedulingImplication,
    advisories,
    citations: unique(citations),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// End of Safety Pharmacology deterministic knowledge base.
// ─────────────────────────────────────────────────────────────────────────────
