/**
 * Biomarkers & Companion Diagnostics — Deterministic Knowledge Engine
 * ====================================================================
 *
 * Pure, closed-form, reproducible regulatory-science engines for biomarker
 * classification, qualification, companion-diagnostic (CDx) co-development,
 * analytical and clinical validation, and trial enrichment strategy.
 *
 * NO LLM. NO network. NO database. Its imports from other services: the 2x2
 * engine (stats/clinical-performance), equally pure, so clinical validation
 * computes its metrics there instead of keeping a second copy, and the shared
 * stated-input readers and their refusal. Identical input always yields
 * identical output.
 *
 * Rule 2 S5b (2026-11-08): an omitted or null boolean reads as not_stated
 * (inputStates) and is never scored, graded or classified as true or false. A
 * category, pathway, determination, design or verdict that the answer to an
 * unstated true/false fact could change is null or not_assessed, and the result
 * names the fact; so is analytical readiness when unstated stakes decide
 * precision. An omitted COU impact, device risk class or CV limit is inferred
 * as before, and the result says so. A required input, or a malformed value a
 * function reads, is refused by field.
 *
 * ── Authoritative sources grounding the rules below ─────────────────────────
 *  - FDA-NIH Biomarker Working Group, BEST (Biomarkers, EndpointS, and other
 *    Tools) Resource (2016, updated). Seven biomarker categories:
 *    diagnostic, prognostic, predictive, pharmacodynamic/response, monitoring,
 *    safety, susceptibility/risk.
 *  - 21st Century Cures Act of 2016, Section 3011 (Drug Development Tool [DDT]
 *    qualification, codified at FD&C Act Section 507).
 *  - FDA Biomarker Qualification: Evidentiary Framework (Guidance for Industry,
 *    Dec 2018). Context of Use (COU), evidentiary criteria scaled to benefit/risk,
 *    the three-stage qualification process (Letter of Intent, Qualification Plan,
 *    Full Qualification Package).
 *  - FDA "In Vitro Companion Diagnostic Devices" (Guidance for Industry and FDA
 *    Staff, Aug 2014).
 *  - FDA "Principles for Codevelopment of an In Vitro Companion Diagnostic Device
 *    with a Therapeutic Product" (Draft Guidance, Jul 2016).
 *  - FDA "Enrichment Strategies for Clinical Trials to Support Determination of
 *    Effectiveness of Human Drugs and Biological Products" (Guidance for Industry,
 *    Mar 2019).
 *  - FDA "Developing Targeted Therapies in Low-Frequency Molecular Subsets of a
 *    Disease" (Guidance, 2018).
 *  - CLSI analytical-validation standards: EP05 (precision), EP06 (linearity),
 *    EP07 (interference), EP09 (method comparison/bias), EP12 (qualitative
 *    performance), EP17 (LoB/LoD/LoQ), EP25 (stability), EP28 (reference
 *    intervals).
 *  - 21 CFR 809.10, 21 CFR 814 (PMA), 21 CFR 807 Subpart E (510(k)),
 *    21 CFR 814.20(b) (CDx/therapeutic cross-labeling).
 *  - ICH E16 (genomic biomarkers — qualification submissions), ICH E15
 *    (pharmacogenomics terminology).
 *
 * All citations are reproduced verbatim in the engine outputs. Callers MUST
 * relay the returned citations and numbers without alteration; a fabricated or
 * misattributed regulatory citation in a marketing application is a critical
 * defect.
 *
 * @module server/services/biomarkers/biomarker-knowledge
 */

import { DEVICE_CLASSES, type DeviceClass } from '../../../shared/regulatory/device-class.js';
import { refuseUnlessStated, type RequiredInputCheck } from '../ana-biostats/computation-engine.js';
import {
  booleanInputStates,
  statedBoolean,
  statedNumber,
  statedOneOf,
} from '../immunogenicity/immunogenicity-reference.js';
import { computeDiagnosticAccuracy, type Interval } from '../stats/clinical-performance.js';
import {
  CATEGORY_TABLE,
  CITATION_LIBRARY,
  USE_CATEGORY_TABLE,
  type CategoryDescriptor,
  type NamedCitation,
  type UseToCategory,
} from './biomarker-reference.js';

// ════════════════════════════════════════════════════════════════════════════
// SHARED TYPES
// ════════════════════════════════════════════════════════════════════════════

/** A regulatory citation reproduced verbatim from a primary source. */
export interface Citation {
  /** Short source identifier, e.g. "FDA-NIH BEST Resource (2016)". */
  source: string;
  /** Specific section / page / clause reference. */
  reference: string;
  /** Verbatim or close-paraphrase statement of the cited rule. */
  statement: string;
}

/** Severity ranking used across engines for findings and warnings. */
export type Severity = 'info' | 'caution' | 'warning' | 'critical';

/** A single structured finding emitted by an engine. */
export interface Finding {
  severity: Severity;
  message: string;
}

/** The seven BEST biomarker categories. */
export type BiomarkerCategory =
  | 'diagnostic'
  | 'prognostic'
  | 'predictive'
  | 'pharmacodynamic_response'
  | 'monitoring'
  | 'safety'
  | 'susceptibility_risk';

/** Intended regulatory use of a biomarker in a development program. */
export type BiomarkerUse =
  | 'patient_selection'
  | 'enrichment'
  | 'stratification'
  | 'dose_selection'
  | 'efficacy_endpoint'
  | 'safety_monitoring'
  | 'screening'
  | 'risk_assessment'
  | 'disease_detection';

/** Measurement modality / assay platform class. */
export type AssayModality =
  | 'ihc'
  | 'pcr'
  | 'ngs'
  | 'fish'
  | 'elisa'
  | 'flow_cytometry'
  | 'mass_spectrometry'
  | 'sequencing_panel'
  | 'ctdna_liquid_biopsy'
  | 'imaging'
  | 'clinical_chemistry'
  | 'other';

/** Regulatory framework / jurisdiction for device-side rules. */
export type DeviceFramework = 'fda' | 'eu_ivdr' | 'pmda' | 'health_canada';

// ════════════════════════════════════════════════════════════════════════════
// REFERENCE TABLES (typed interfaces; NO `as const`)
// ════════════════════════════════════════════════════════════════════════════

// The BEST category descriptors and the intended-use mapping are in biomarker-reference.ts (moved 2026-11-08).

/** COU impact tier and the evidentiary expectation it triggers. */
interface CouImpactTier {
  tier: 'low' | 'moderate' | 'high';
  description: string;
  evidentiaryExpectation: string;
  exampleCou: string;
}

const COU_IMPACT_TABLE: CouImpactTier[] = [
  {
    tier: 'low',
    description:
      'Biomarker informs internal decisions with limited consequence if wrong (e.g., exploratory ' +
      'go/no-go, non-pivotal dose ranging), or supplements other established measures.',
    evidentiaryExpectation:
      'Lighter evidentiary package: plausible biological rationale, analytical reliability sufficient ' +
      'for the decision, and supportive (often observational) clinical association data.',
    exampleCou:
      'Use a PD marker to support internal dose-selection decisions in early-phase trials of a class.',
  },
  {
    tier: 'moderate',
    description:
      'Biomarker influences trial conduct or interpretation with moderate consequence (e.g., ' +
      'stratification, secondary endpoint, safety monitoring with confirmatory follow-up).',
    evidentiaryExpectation:
      'Moderate package: robust analytical validation, a coherent body of clinical evidence ' +
      'establishing the marker-outcome relationship, and quantified performance with uncertainty.',
    exampleCou:
      'Use a safety biomarker to trigger enhanced monitoring / additional testing in clinical trials.',
  },
  {
    tier: 'high',
    description:
      'Biomarker drives consequential patient-level or regulatory decisions (e.g., patient selection, ' +
      'trial enrichment that excludes patients, a basis for efficacy or approval).',
    evidentiaryExpectation:
      'Most rigorous package: complete analytical validation to the level of the intended assay, ' +
      'strong (ideally prospective and/or randomized) clinical evidence with replication, and explicit ' +
      'characterization of false-positive/false-negative consequences.',
    exampleCou:
      'Use a predictive biomarker to select patients for a therapy as the basis of an indication.',
  },
];

/** Stage descriptor for the FDA Biomarker Qualification (DDT) process. */
interface QualificationStage {
  stage: number;
  name: string;
  fdaSubmission: string;
  purpose: string;
  keyDeliverables: string[];
}

const QUALIFICATION_STAGE_TABLE: QualificationStage[] = [
  {
    stage: 1,
    name: 'Letter of Intent (LOI)',
    fdaSubmission: 'Letter of Intent to the relevant DDT qualification program',
    purpose:
      'Initiate the qualification process: describe the biomarker, the proposed Context of Use, and ' +
      'the need it addresses. FDA decides whether to accept the submission into the program.',
    keyDeliverables: [
      'Biomarker identity and measurement method (summary level)',
      'Draft Context of Use statement',
      'Statement of need and proposed benefit to drug development',
      'Identification of the requesting party (often a consortium)',
    ],
  },
  {
    stage: 2,
    name: 'Qualification Plan (QP)',
    fdaSubmission: 'Qualification Plan submission and FDA feedback',
    purpose:
      'Define the evidentiary strategy: agree with FDA on the studies, analyses, and acceptance ' +
      'criteria needed to support the COU before generating the full dataset.',
    keyDeliverables: [
      'Refined Context of Use',
      'Analytical validation strategy and acceptance criteria',
      'Clinical/biological evidence plan and statistical analysis plan',
      'Benefit/risk and consequence-of-error framing scaled to the COU',
    ],
  },
  {
    stage: 3,
    name: 'Full Qualification Package (FQP)',
    fdaSubmission: 'Full Qualification Package and FDA qualification determination',
    purpose:
      'Submit the complete evidentiary package for FDA review; a successful review yields a ' +
      'qualification determination and a published qualification recommendation for the stated COU.',
    keyDeliverables: [
      'Complete analytical validation report',
      'Complete clinical/biological evidence supporting the COU',
      'Integrated benefit/risk assessment',
      'Final Context of Use as qualified',
    ],
  },
];

// The CLSI analytical parameters and the citation library are in biomarker-reference.ts (moved 2026-11-08).

// ════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS (pure)
// ════════════════════════════════════════════════════════════════════════════

function cite(id: string): Citation {
  const found = CITATION_LIBRARY.find((c: NamedCitation): boolean => c.id === id);
  if (!found) {
    return {
      source: 'Unknown source',
      reference: id,
      statement: 'Citation identifier not found in library.',
    };
  }
  return found.citation;
}

function categoryDescriptor(category: BiomarkerCategory): CategoryDescriptor {
  const found = CATEGORY_TABLE.find(
    (c: CategoryDescriptor): boolean => c.category === category,
  );
  // CATEGORY_TABLE is exhaustive over BiomarkerCategory; fallback kept for safety.
  return found ?? CATEGORY_TABLE[0];
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function roundInterval(ci: Interval): Interval {
  return { lower: round(ci.lower, 4), upper: round(ci.upper, 4) };
}

function uniqueStrings(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (!out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

// ── Stated inputs (Rule 2 S5b, 2026-11-08) ──────────────────────────────────

/** A true/false fact as stated, or not_stated when it was left out. */
type BooleanState = boolean | 'not_stated';

const BIOMARKER_CATEGORIES: readonly BiomarkerCategory[] = CATEGORY_TABLE.map(
  (c: CategoryDescriptor): BiomarkerCategory => c.category,
);
const BIOMARKER_USES: readonly BiomarkerUse[] = USE_CATEGORY_TABLE.map((u: UseToCategory): BiomarkerUse => u.use);
const ASSAY_MODALITIES: readonly AssayModality[] = [
  'ihc', 'pcr', 'ngs', 'fish', 'elisa', 'flow_cytometry', 'mass_spectrometry', 'sequencing_panel',
  'ctdna_liquid_biopsy', 'imaging', 'clinical_chemistry', 'other',
];
const STAKES: readonly ('low' | 'moderate' | 'high')[] = ['low', 'moderate', 'high'];

/** A required non-empty text, for refuseUnlessStated. */
function textInput(field: string, value: unknown): RequiredInputCheck {
  return { field, value, ok: typeof value === 'string' && value.trim().length > 0, expected: 'non-empty text' };
}

/** A required value from a fixed vocabulary, for refuseUnlessStated. */
function oneOfInput(field: string, value: unknown, allowed: readonly string[]): RequiredInputCheck {
  return {
    field,
    value,
    ok: typeof value === 'string' && allowed.includes(value),
    expected: `one of ${allowed.join(', ')}`,
  };
}

/** Every answer the unstated facts could take: each stated fact kept, each undefined one both true and false. */
function everyAnswer<K extends string>(stated: Record<K, boolean | undefined>): Array<Record<K, boolean>> {
  let answers: Array<Record<K, boolean>> = [{} as Record<K, boolean>];
  for (const key of Object.keys(stated) as K[]) {
    const fact = stated[key];
    const values = fact === undefined ? [true, false] : [fact];
    answers = answers.flatMap((a: Record<K, boolean>) => values.map((v: boolean) => ({ ...a, [key]: v })));
  }
  return answers;
}

/** The distinct conclusions those answers give, in first-seen order: one means the stated facts decide it. */
function conclusions<K extends string, T extends string>(
  stated: Record<K, boolean | undefined>,
  conclude: (answer: Record<K, boolean>) => T,
): T[] {
  return uniqueStrings(everyAnswer(stated).map(conclude)) as T[];
}

/** The unstated facts whose answer can change the conclusion. */
function decidingFacts<K extends string, T>(
  stated: Record<K, boolean | undefined>,
  conclude: (answer: Record<K, boolean>) => T,
): K[] {
  return (Object.keys(stated) as K[]).filter(
    (key: K): boolean =>
      stated[key] === undefined &&
      everyAnswer({ ...stated, [key]: false }).some(
        (a: Record<K, boolean>): boolean => conclude({ ...a, [key]: true }) !== conclude(a),
      ),
  );
}

/** "a", "a and b", "a, b and c". */
function listed(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 1 — classifyBiomarker
// ════════════════════════════════════════════════════════════════════════════

export interface ClassifyBiomarkerParams {
  /** Free-text or canonical biomarker name. Required. */
  biomarkerName: string;
  /** Optionally assert a category; otherwise it is inferred from the six distinguishing features. */
  assertedCategory?: BiomarkerCategory;
  /** Intended regulatory use of the biomarker in the program. It adds cautions; it does not infer the category. */
  intendedUse?: BiomarkerUse;
  /** Whether the marker measures a treatment-by-marker interaction (predictive signature). */
  predictsDifferentialTreatmentEffect?: boolean;
  /** Whether the marker is measured in individuals who do NOT yet have the disease. */
  measuredInUnaffectedIndividuals?: boolean;
  /** Whether the marker changes in response to the product (PD). */
  changesWithExposure?: boolean;
  /** Whether the marker is measured serially over time. */
  measuredSerially?: boolean;
  /** Whether the marker indicates toxicity / adverse effect. */
  indicatesToxicity?: boolean;
  /** Whether the marker confirms presence/subtype of disease. */
  confirmsDisease?: boolean;
  /** Disease / therapeutic area context (free text). Not read. */
  diseaseContext?: string;
}

export interface ClassifyBiomarkerResult {
  biomarkerName: string;
  /** null when an answer to an unstated distinguishing feature could change the inferred category. */
  category: BiomarkerCategory | null;
  categoryLabel: string | null;
  definition: string | null;
  clinicalQuestion: string | null;
  inferred: boolean;
  inferenceBasis: string;
  /** The categories the unstated features leave open; empty when the category is decided. */
  candidateCategories: BiomarkerCategory[];
  examples: string[];
  evidentiaryImplications: string | null;
  regulatoryPathway: string | null;
  /** null when the candidate categories disagree. */
  highStakesForLabelClaim: boolean | null;
  supportedUses: BiomarkerUse[];
  /** null when the candidate categories disagree. */
  cdxLikely: boolean | null;
  cautions: Finding[];
  citations: Citation[];
  /** Each distinguishing feature: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
}

/** The six distinguishing features, in the precedence that decides an inferred category. */
const FEATURE_FLAGS = [
  'predictsDifferentialTreatmentEffect',
  'indicatesToxicity',
  'measuredInUnaffectedIndividuals',
  'changesWithExposure',
  'confirmsDisease',
  'measuredSerially',
] as const;
type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** The category one complete set of answers gives. */
function inferCategory(
  features: Record<FeatureFlag, boolean>,
): { category: BiomarkerCategory; basis: string } {
  // Deterministic precedence reflecting BEST distinctions.
  if (features.predictsDifferentialTreatmentEffect) {
    return {
      category: 'predictive',
      basis:
        'Marker reported to predict differential treatment effect (biomarker-by-treatment interaction), ' +
        'the defining feature of a predictive biomarker.',
    };
  }
  if (features.indicatesToxicity) {
    return {
      category: 'safety',
      basis: 'Marker indicates likelihood/presence/extent of toxicity — a safety biomarker.',
    };
  }
  if (features.measuredInUnaffectedIndividuals) {
    return {
      category: 'susceptibility_risk',
      basis:
        'Marker measured in individuals without clinically apparent disease to indicate future risk — ' +
        'a susceptibility/risk biomarker.',
    };
  }
  if (features.changesWithExposure) {
    return {
      category: 'pharmacodynamic_response',
      basis: 'Marker changes in response to product exposure — a pharmacodynamic/response biomarker.',
    };
  }
  if (features.confirmsDisease && !features.measuredSerially) {
    return {
      category: 'diagnostic',
      basis: 'Marker detects/confirms presence or subtype of disease — a diagnostic biomarker.',
    };
  }
  if (features.measuredSerially) {
    return {
      category: 'monitoring',
      basis: 'Marker measured serially to assess disease/treatment status — a monitoring biomarker.',
    };
  }
  // 2026-11-08 (S5b): reached only when all six are false. Before, the intended use's first supporting
  // category was returned here (enrichment gave predictive with predictsDifferentialTreatmentEffect stated
  // false), and with no intended use the category was "defaulted to prognostic".
  return {
    category: 'prognostic',
    basis:
      'Every distinguishing feature was stated false. Prognostic is the one BEST category these six ' +
      'features do not test.',
  };
}

/**
 * Classify a biomarker per the FDA-NIH BEST Resource into one of the seven
 * categories and return the regulatory/evidentiary implications of that category.
 *
 * Deterministic: classification follows a fixed precedence over the stated
 * distinguishing features (or an asserted category), never an LLM. An inferred
 * category is given only when every answer to the unstated features gives the
 * same one; otherwise it is null and candidateCategories lists the possibilities.
 */
export function classifyBiomarker(
  params: ClassifyBiomarkerParams,
): ClassifyBiomarkerResult {
  // 2026-11-08 (S5b): each feature was read `=== true`, so an omitted one was a stated false. `{}` was
  // "defaulted to prognostic", and { confirmsDisease: true } was diagnostic whatever the unstated
  // predictsDifferentialTreatmentEffect. An asserted 'Predictive' took the diagnostic descriptor, a feature of
  // 'true' read as false, and a missing biomarkerName was not asked for.
  refuseUnlessStated('classify_biomarker', [textInput('biomarkerName', params.biomarkerName)], 'classified');
  const asserted = statedOneOf('assertedCategory', params.assertedCategory, BIOMARKER_CATEGORIES);
  const intendedUse = statedOneOf('intendedUse', params.intendedUse, BIOMARKER_USES);
  const inputStates = booleanInputStates(params, FEATURE_FLAGS);
  const features = Object.fromEntries(
    FEATURE_FLAGS.map((k: FeatureFlag): [FeatureFlag, boolean | undefined] => [k, statedBoolean(k, params[k])]),
  ) as Record<FeatureFlag, boolean | undefined>;
  const predicts = features.predictsDifferentialTreatmentEffect;
  const usual = USE_CATEGORY_TABLE.find((u: UseToCategory): boolean => u.use === intendedUse);

  let category: BiomarkerCategory | null;
  let candidateCategories: BiomarkerCategory[] = [];
  let inferred: boolean;
  let basis: string;

  if (asserted) {
    category = asserted;
    inferred = false;
    basis = 'Category asserted by caller; not inferred.';
  } else {
    inferred = true;
    const categoryOf = (a: Record<FeatureFlag, boolean>): BiomarkerCategory => inferCategory(a).category;
    const open = conclusions(features, categoryOf);
    if (open.length === 1) {
      category = open[0];
      basis = inferCategory(everyAnswer(features)[0]).basis;
    } else {
      category = null;
      candidateCategories = BIOMARKER_CATEGORIES.filter((c: BiomarkerCategory): boolean => open.includes(c));
      const deciding = decidingFacts(features, categoryOf);
      basis =
        `Not decided: ${listed(deciding)} ${deciding.length > 1 ? 'are' : 'is'} not stated, and the answers make ` +
        `it one of ${listed(candidateCategories)}. State ${deciding.length > 1 ? 'them' : 'it'}, or assert the category.` +
        (usual ? ` Intended use "${usual.use}" is usually served by ${listed(usual.supportingCategories)}.` : '');
    }
  }

  const desc = category ? categoryDescriptor(category) : null;

  // Supported uses: every use whose supporting categories include this category.
  const supportedUses = category
    ? USE_CATEGORY_TABLE.filter((u: UseToCategory): boolean => u.supportingCategories.includes(category))
      .map((u: UseToCategory): BiomarkerUse => u.use)
    : [];

  const cautions: Finding[] = [];

  // Cross-check asserted category against distinguishing features.
  if (asserted === 'predictive' && predicts === false) {
    cautions.push({
      severity: 'critical',
      message:
        'Asserted PREDICTIVE but predictsDifferentialTreatmentEffect=false. A predictive claim REQUIRES ' +
        'evidence of a biomarker-by-treatment interaction; without it the marker is at most prognostic. ' +
        'Mislabeling a prognostic marker as predictive can wrongly restrict a label population.',
    });
  }
  if (asserted === 'predictive' && predicts === undefined) {
    cautions.push({
      severity: 'caution',
      message:
        'Asserted PREDICTIVE, but predictsDifferentialTreatmentEffect is not stated. A predictive claim ' +
        'REQUIRES evidence of a biomarker-by-treatment interaction; state whether there is one.',
    });
  }
  if (asserted === 'prognostic' && predicts === true) {
    cautions.push({
      severity: 'warning',
      message:
        'Marker reportedly predicts differential treatment effect yet asserted as prognostic. ' +
        'Re-examine: a treatment-interaction signal implies a PREDICTIVE classification.',
    });
  }
  if (asserted === 'prognostic' && predicts === undefined) {
    cautions.push({
      severity: 'info',
      message:
        'predictsDifferentialTreatmentEffect is not stated. If the marker predicts a differential treatment ' +
        'effect, the classification is PREDICTIVE, not prognostic.',
    });
  }
  if (category === 'prognostic' && inferred && usual && !usual.supportingCategories.includes('prognostic')) {
    cautions.push({
      severity: 'warning',
      message:
        `Intended use "${usual.use}" is usually served by ${listed(usual.supportingCategories)}, but the ` +
        'defining feature of each was stated false. Reconcile the intended use with the stated features.',
    });
  }
  if (category === 'pharmacodynamic_response' && intendedUse === 'efficacy_endpoint') {
    cautions.push({
      severity: 'warning',
      message:
        'Using a PD/response marker as an efficacy endpoint requires separate surrogate-endpoint ' +
        'justification; PD activity alone does not establish that the marker predicts clinical benefit.',
    });
  }
  if (
    (category === 'diagnostic' || category === 'predictive') &&
    (intendedUse === 'patient_selection' || desc?.highStakesForLabelClaim)
  ) {
    cautions.push({
      severity: 'caution',
      message:
        'This category, used for patient selection / label claims, generally triggers companion-diagnostic ' +
        'level rigor (analytical + clinical validation co-developed with the therapeutic).',
    });
  }
  if (category === 'susceptibility_risk' && intendedUse === 'screening') {
    cautions.push({
      severity: 'caution',
      message:
        'Screening unaffected populations is prevalence-sensitive: PPV falls sharply at low prevalence ' +
        'even with high analytical performance. Evaluate clinical utility, not just validity.',
    });
  }

  // Each holds for every candidate category, or it is null.
  const candidates = category ? [category] : candidateCategories;
  const agreed = (values: boolean[]): boolean | null => (values.every((v: boolean): boolean => v === values[0]) ? values[0] : null);
  const cdxLikely = agreed(candidates.map((c: BiomarkerCategory): boolean =>
    (c === 'predictive' || c === 'diagnostic') &&
    (intendedUse === 'patient_selection' ||
      predicts === true ||
      categoryDescriptor(c).highStakesForLabelClaim)));
  const highStakesForLabelClaim = agreed(
    candidates.map((c: BiomarkerCategory): boolean => categoryDescriptor(c).highStakesForLabelClaim),
  );

  const citations: Citation[] = [cite('best')];
  if (cdxLikely === true) {
    citations.push(cite('cdx_2014'));
  }
  if (category === 'safety' || category === 'monitoring' || category === 'pharmacodynamic_response') {
    citations.push(cite('cures_act'));
    citations.push(cite('bq_framework'));
  }

  return {
    biomarkerName: params.biomarkerName,
    category,
    categoryLabel: desc ? desc.label : null,
    definition: desc ? desc.definition : null,
    clinicalQuestion: desc ? desc.question : null,
    inferred,
    inferenceBasis: basis,
    candidateCategories,
    examples: desc ? desc.examples.slice() : [],
    evidentiaryImplications: desc ? desc.evidentiaryImplications : null,
    regulatoryPathway: desc ? desc.regulatoryPathway : null,
    highStakesForLabelClaim,
    supportedUses,
    cdxLikely,
    cautions,
    citations,
    inputStates,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 2 — planBiomarkerQualification
// ════════════════════════════════════════════════════════════════════════════

export interface PlanBiomarkerQualificationParams {
  biomarkerName: string;
  category: BiomarkerCategory;
  /** Plain-language statement of how/where the biomarker will be used. */
  proposedContextOfUse: string;
  /** Consequence/impact tier of the COU (drives evidentiary scaling); inferred from the category when omitted. */
  couImpact?: 'low' | 'moderate' | 'high';
  /** Whether intended for use across multiple drug-development programs. */
  crossProgramUse?: boolean;
  /** Whether the marker is genomic (engages ICH E16 structure). */
  isGenomic?: boolean;
  /** Whether a consortium is sponsoring (typical for DDT qualification). */
  consortiumSponsored?: boolean;
  /** Whether the marker is intended only for one specific drug. */
  singleDrugOnly?: boolean;
}

export interface QualificationStageOutput {
  stage: number;
  name: string;
  fdaSubmission: string;
  purpose: string;
  keyDeliverables: string[];
}

export interface PlanBiomarkerQualificationResult {
  biomarkerName: string;
  category: BiomarkerCategory;
  contextOfUse: string;
  couImpactTier: 'low' | 'moderate' | 'high';
  couImpactDescription: string;
  evidentiaryExpectation: string;
  /** 'not_assessed' while an answer to an unstated scope fact could change it. */
  recommendedPathway: 'ddt_qualification' | 'drug_specific_submission' | 'not_assessed';
  pathwayRationale: string;
  stages: QualificationStageOutput[];
  evidentiaryCriteria: string[];
  analyticalValidationNeeded: boolean;
  clinicalEvidenceNeeded: string;
  findings: Finding[];
  citations: Citation[];
  /** Each boolean input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
}

const QUALIFICATION_FLAGS = ['crossProgramUse', 'isGenomic', 'consortiumSponsored', 'singleDrugOnly'] as const;
type ScopeFact = 'singleDrugOnly' | 'crossProgramUse' | 'consortiumSponsored';

/** Pathway: drug-specific for one drug only; DDT qualification for cross-program/consortium use; drug-specific otherwise. */
function qualificationPathway(
  scope: Record<ScopeFact, boolean>,
): 'ddt_qualification' | 'drug_specific_submission' {
  if (scope.singleDrugOnly) return 'drug_specific_submission';
  return scope.crossProgramUse || scope.consortiumSponsored ? 'ddt_qualification' : 'drug_specific_submission';
}

/**
 * Plan an FDA biomarker qualification: define the COU, scale evidentiary criteria
 * to COU impact, choose qualification (DDT) vs drug-specific submission, and lay
 * out the three-stage process (LOI -> QP -> FQP).
 *
 * Deterministic. The pathway is given only when every answer to the unstated
 * scope facts gives the same one.
 */
export function planBiomarkerQualification(
  params: PlanBiomarkerQualificationParams,
): PlanBiomarkerQualificationResult {
  // 2026-11-08 (S5b): with singleDrugOnly, crossProgramUse and consortiumSponsored omitted the pathway was a
  // drug-specific submission, "Use confined to a single drug program", although a stated cross-program use
  // gives DDT qualification. An inferred moderate or low COU tier was not disclosed, an omitted isGenomic read
  // as false, and a category of 'Safety' was inferred as a low tier.
  refuseUnlessStated('plan_biomarker_qualification', [
    textInput('biomarkerName', params.biomarkerName),
    oneOfInput('category', params.category, BIOMARKER_CATEGORIES),
    textInput('proposedContextOfUse', params.proposedContextOfUse),
  ], 'planned');
  const couImpact = statedOneOf('couImpact', params.couImpact, STAKES);
  const inputStates = booleanInputStates(params, QUALIFICATION_FLAGS);
  const scope: Record<ScopeFact, boolean | undefined> = {
    singleDrugOnly: statedBoolean('singleDrugOnly', params.singleDrugOnly),
    crossProgramUse: statedBoolean('crossProgramUse', params.crossProgramUse),
    consortiumSponsored: statedBoolean('consortiumSponsored', params.consortiumSponsored),
  };

  // Determine impact tier (explicit, else inferred from category + cross-program).
  let tier: 'low' | 'moderate' | 'high';
  if (couImpact) {
    tier = couImpact;
  } else if (params.category === 'predictive' || params.category === 'diagnostic') {
    tier = 'high';
  } else if (params.category === 'safety' || params.category === 'monitoring') {
    tier = 'moderate';
  } else {
    tier = 'low';
  }

  const tierDesc = COU_IMPACT_TABLE.find(
    (t: CouImpactTier): boolean => t.tier === tier,
  ) ?? COU_IMPACT_TABLE[0];

  const pathways = conclusions(scope, qualificationPathway);
  const recommendedPathway: PlanBiomarkerQualificationResult['recommendedPathway'] =
    pathways.length === 1 ? pathways[0] : 'not_assessed';
  const deciding = decidingFacts(scope, qualificationPathway);

  const pathwayRationale =
    recommendedPathway === 'ddt_qualification'
      ? 'Cross-program / consortium intent favors formal DDT qualification under FD&C Act §507: once ' +
        'qualified for the COU, the biomarker can be relied upon across programs without re-establishing ' +
        'its validity in each submission.'
      : recommendedPathway === 'drug_specific_submission'
        ? 'Use confined to a single drug program is most efficiently supported by a drug-specific submission ' +
          '(IND/NDA/BLA), where the biomarker is justified in the context of that application rather than ' +
          'formally qualified for general reuse.'
        : `Not assessed: ${listed(deciding)} ${deciding.length > 1 ? 'are' : 'is'} not stated. A biomarker for one ` +
          'drug program only is supported in that program\'s submission (IND/NDA/BLA); one intended for use ' +
          'across programs, or sponsored by a consortium, favors formal DDT qualification under FD&C Act §507.';

  const stages: QualificationStageOutput[] = QUALIFICATION_STAGE_TABLE.map(
    (s: QualificationStage): QualificationStageOutput => ({
      stage: s.stage,
      name: s.name,
      fdaSubmission: s.fdaSubmission,
      purpose: s.purpose,
      keyDeliverables: s.keyDeliverables.slice(),
    }),
  );

  // Evidentiary criteria scaled to tier.
  const evidentiaryCriteria: string[] = [
    'Biological rationale linking the biomarker to the underlying mechanism/outcome in the COU.',
    'Analytical validation appropriate to the measurement and the consequence of error.',
  ];
  if (tier === 'low') {
    evidentiaryCriteria.push(
      'Supportive clinical/biological association data (may be observational) consistent with the COU.',
      'Documented limitations and the bounded set of decisions the marker may inform.',
    );
  } else if (tier === 'moderate') {
    evidentiaryCriteria.push(
      'A coherent body of clinical evidence quantifying the marker-outcome relationship with uncertainty.',
      'Robust multi-condition analytical validation including reproducibility across sites/lots.',
      'Pre-specified acceptance criteria agreed with FDA in the Qualification Plan.',
    );
  } else {
    evidentiaryCriteria.push(
      'Strong clinical evidence — ideally prospective and/or randomized with replication — establishing ' +
        'the marker-outcome (or marker-by-treatment) relationship.',
      'Complete analytical validation to the level of the intended decision (CLSI EP-series).',
      'Explicit characterization of false-positive/false-negative rates and their patient-level consequences.',
      'Pre-specified statistical analysis plan and acceptance criteria agreed with FDA.',
    );
  }

  const findings: Finding[] = [];
  if (params.category === 'predictive' && recommendedPathway === 'ddt_qualification') {
    findings.push({
      severity: 'caution',
      message:
        'A predictive biomarker driving patient selection is usually realized as a co-developed companion ' +
        'diagnostic (device pathway), not solely a DDT qualification. Confirm whether the device-side CDx ' +
        'route (designCDxCodevelopment) is the operative pathway.',
    });
  }
  if (couImpact === undefined) {
    findings.push({
      severity: 'info',
      message:
        `COU impact tier inferred as ${tier.toUpperCase()} from category; supply couImpact explicitly to lock the ` +
        'evidentiary scaling for the qualification plan.',
    });
  }
  if (inputStates.isGenomic === 'not_stated') {
    findings.push({
      severity: 'info',
      message:
        'isGenomic is not stated. For a genomic biomarker, ICH E16 sets the structure of the qualification ' +
        'submission; it is cited when isGenomic is true.',
    });
  }
  if (params.singleDrugOnly === true && params.crossProgramUse === true) {
    findings.push({
      severity: 'warning',
      message:
        'Conflicting inputs: singleDrugOnly=true and crossProgramUse=true. Defaulted to drug-specific ' +
        'submission; reconcile the intended scope of use.',
    });
  }

  const citations: Citation[] = [cite('cures_act'), cite('bq_framework')];
  if (params.isGenomic === true) {
    citations.push(cite('ich_e16'));
  }

  return {
    biomarkerName: params.biomarkerName,
    category: params.category,
    contextOfUse: params.proposedContextOfUse,
    couImpactTier: tier,
    couImpactDescription: tierDesc.description,
    evidentiaryExpectation: tierDesc.evidentiaryExpectation,
    recommendedPathway,
    pathwayRationale,
    stages,
    evidentiaryCriteria,
    analyticalValidationNeeded: true,
    clinicalEvidenceNeeded:
      tier === 'high'
        ? 'Prospective and/or randomized clinical evidence with replication.'
        : tier === 'moderate'
          ? 'A coherent body of clinical evidence with quantified uncertainty.'
          : 'Supportive (possibly observational) clinical association data.',
    findings,
    citations: uniqueCitations([...citations, cite('best')]),
    inputStates,
  };
}

function uniqueCitations(items: Citation[]): Citation[] {
  const out: Citation[] = [];
  for (const c of items) {
    const dup = out.find(
      (o: Citation): boolean =>
        o.source === c.source && o.reference === c.reference && o.statement === c.statement,
    );
    if (!dup) {
      out.push(c);
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 3 — designCDxCodevelopment
// ════════════════════════════════════════════════════════════════════════════

export interface DesignCDxCodevelopmentParams {
  therapeuticName: string;
  biomarkerName: string;
  /** Assay modality used for patient selection. */
  assayModality: AssayModality;
  /** Whether the marker is essential for safe/effective use (true CDx) vs complementary. */
  essentialForUse?: boolean;
  /** Device risk class (drives PMA vs 510(k)). */
  deviceRiskClass?: DeviceClass;
  /** Whether a single locally-developed clinical trial assay (CTA) was used to enroll the pivotal trial. */
  usedClinicalTrialAssay?: boolean;
  /** Whether the market-ready IVD differs from the CTA (drives bridging study need). */
  marketAssayDiffersFromCTA?: boolean;
  /** Therapeutic development phase at planning time. */
  therapeuticPhase?: 'preclinical' | 'phase1' | 'phase2' | 'phase3' | 'filed';
  /** Regulatory framework. Not read: the plan follows the FDA pathway. */
  framework?: DeviceFramework;
}

export interface CodevelopmentMilestone {
  phase: string;
  therapeuticActivity: string;
  diagnosticActivity: string;
  alignmentNote: string;
}

export interface DesignCDxCodevelopmentResult {
  therapeuticName: string;
  biomarkerName: string;
  /** null while essentialForUse is not stated. */
  isCompanionDiagnostic: boolean | null;
  cdxVsComplementary: 'companion' | 'complementary' | 'not_assessed';
  /** 'not_assessed' when neither deviceRiskClass nor essentialForUse is stated. */
  devicePathway: 'pma' | '510k' | 'de_novo' | 'not_assessed';
  devicePathwayRationale: string;
  /** null while essentialForUse is not stated. */
  contemporaneousApprovalRequired: boolean | null;
  parallelTimeline: CodevelopmentMilestone[];
  /** null while an unstated CTA fact could change it. */
  ctaBridgingRequired: boolean | null;
  ctaBridgingPlan: string;
  crossLabelingNote: string;
  findings: Finding[];
  citations: Citation[];
  /** Each boolean input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
}

const CDX_FLAGS = ['essentialForUse', 'usedClinicalTrialAssay', 'marketAssayDiffersFromCTA'] as const;
const THERAPEUTIC_PHASES: readonly NonNullable<DesignCDxCodevelopmentParams['therapeuticPhase']>[] = [
  'preclinical', 'phase1', 'phase2', 'phase3', 'filed',
];

function cdxParallelTimeline(): CodevelopmentMilestone[] {
  return [
    {
      phase: 'Discovery / Preclinical',
      therapeuticActivity:
        'Identify the predictive hypothesis and candidate biomarker linking mechanism to response.',
      diagnosticActivity:
        'Develop a feasible measurement (assay prototype); define analyte, specimen, and preliminary cutoff.',
      alignmentNote:
        'Lock the biomarker hypothesis early — late biomarker definition changes invalidate prior enrollment.',
    },
    {
      phase: 'Phase 1 / early Phase 2',
      therapeuticActivity:
        'Establish safety, PK, and proof-of-mechanism; explore biomarker-defined response signal.',
      diagnosticActivity:
        'Develop and analytically characterize a clinical trial assay (CTA); establish provisional cutoff.',
      alignmentNote:
        'Use the CTA to test the enrichment hypothesis before committing to the pivotal design.',
    },
    {
      phase: 'Late Phase 2 / cutoff selection',
      therapeuticActivity:
        'Confirm the biomarker-defined population and effect size; finalize the enrichment strategy.',
      diagnosticActivity:
        'Lock the cutoff and the assay used for pivotal enrollment; begin analytical validation of the IVD.',
      alignmentNote:
        'The cutoff and assay enrolling the pivotal trial must be fixed before pivotal start; later ' +
        'changes require a bridging study to the originally enrolled population.',
    },
    {
      phase: 'Phase 3 / pivotal',
      therapeuticActivity:
        'Run the pivotal trial in the biomarker-defined population; collect samples for bridging.',
      diagnosticActivity:
        'Complete analytical validation of the market-ready IVD; conduct the CTA-to-IVD bridging study; ' +
        'establish clinical validity from pivotal-trial concordance.',
      alignmentNote:
        'Banked pivotal specimens enable the bridging study that links the market IVD to the clinical ' +
        'outcomes generated with the CTA.',
    },
    {
      phase: 'Submission & approval',
      therapeuticActivity: 'Submit NDA/BLA with the biomarker-restricted indication.',
      diagnosticActivity: 'Submit the IVD marketing application (PMA/510(k)/De Novo) for the CDx.',
      alignmentNote:
        'FDA expects contemporaneous approval/clearance so an approved test is available the day the ' +
        'therapeutic is approved; cross-labeling references the specific test.',
    },
  ];
}

/**
 * Design a contemporaneous drug + companion-diagnostic co-development program:
 * parallel therapeutic/diagnostic timelines, CTA-to-IVD bridging, device pathway
 * (PMA/510(k)/De Novo) and cross-labeling aligned with the therapeutic approval.
 *
 * Deterministic.
 */
export function designCDxCodevelopment(
  params: DesignCDxCodevelopmentParams,
): DesignCDxCodevelopmentResult {
  // 2026-11-08 (S5b): essentialForUse was read `!== false` ("Default true"), so an omitted one made the test a
  // companion diagnostic requiring contemporaneous approval and, with no class stated, Class III and PMA. An
  // omitted usedClinicalTrialAssay read as false (no bridging); an omitted marketAssayDiffersFromCTA read as true
  // (bridging required, and a critical finding at filing). 'false' read as true. Each is now not_stated and
  // decides nothing.
  refuseUnlessStated('design_cdx_codevelopment', [
    textInput('therapeuticName', params.therapeuticName),
    textInput('biomarkerName', params.biomarkerName),
    oneOfInput('assayModality', params.assayModality, ASSAY_MODALITIES),
  ], 'designed');
  const statedClass = statedOneOf('deviceRiskClass', params.deviceRiskClass, DEVICE_CLASSES);
  const phase = statedOneOf('therapeuticPhase', params.therapeuticPhase, THERAPEUTIC_PHASES);
  const inputStates = booleanInputStates(params, CDX_FLAGS);
  const isCompanion = statedBoolean('essentialForUse', params.essentialForUse) ?? null;
  const usedCTA = statedBoolean('usedClinicalTrialAssay', params.usedClinicalTrialAssay);
  const differs = statedBoolean('marketAssayDiffersFromCTA', params.marketAssayDiffersFromCTA);
  const cdxVsComplementary: DesignCDxCodevelopmentResult['cdxVsComplementary'] =
    isCompanion === null ? 'not_assessed' : isCompanion ? 'companion' : 'complementary';

  // Device pathway: Class III -> PMA; explicit De Novo when novel low/moderate risk; else 510(k). With no class
  // stated, a companion diagnostic is taken as Class III and a complementary one as Class II (a finding says so).
  let devicePathway: DesignCDxCodevelopmentResult['devicePathway'];
  let devicePathwayRationale: string;
  const riskClass = statedClass ?? (isCompanion === null ? undefined : isCompanion ? 'III' : 'II');
  if (riskClass === undefined) {
    devicePathway = 'not_assessed';
    devicePathwayRationale =
      'Not assessed: neither deviceRiskClass nor essentialForUse is stated. A companion diagnostic that gates ' +
      'use of a therapy is typically Class III (PMA, 21 CFR Part 814); a complementary one is typically Class II.';
  } else if (riskClass === 'III') {
    devicePathway = 'pma';
    devicePathwayRationale =
      'Most CDx that gate use of a therapy are Class III and follow PMA (21 CFR Part 814): an ' +
      'erroneous result directly drives a treatment decision, so the highest device controls apply.';
  } else if (riskClass === 'II') {
    devicePathway = '510k';
    devicePathwayRationale =
      'A moderate-risk device with a suitable predicate may follow 510(k) (21 CFR Part 807 Subpart E) ' +
      'by demonstrating substantial equivalence; many CDx, however, lack a predicate and require PMA.';
  } else {
    devicePathway = 'de_novo';
    devicePathwayRationale =
      'A novel low/moderate-risk device without a predicate may use the De Novo classification request ' +
      'to establish a new device type and special controls.';
  }

  // Required when a CTA enrolled the pivotal trial and the market IVD differs; not when either is stated false.
  const ctaBridgingRequired: boolean | null =
    usedCTA === false || differs === false ? false : usedCTA === true && differs === true ? true : null;
  const unstatedCta = [
    ...(usedCTA === undefined ? ['usedClinicalTrialAssay'] : []),
    ...(differs === undefined ? ['marketAssayDiffersFromCTA'] : []),
  ];

  const ctaBridgingPlan = ctaBridgingRequired === true
    ? 'A bridging study is required: the market-ready IVD must be shown concordant with the clinical ' +
      'trial assay (CTA) used to enroll the pivotal trial, using banked pivotal specimens, so the ' +
      'clinical outcomes observed with the CTA can be attributed to the marketed test. Characterize ' +
      'concordance (PPA/NPA), discordant cases, and the effect of any discordance on the demonstrated ' +
      'clinical benefit.'
    : ctaBridgingRequired === false
      ? 'No CTA-to-IVD bridging study indicated (the pivotal trial was enrolled with the market-ready ' +
        'assay, or no difference between trial and market assays). Confirm assay equivalence and ' +
        'lock-down status before pivotal start.'
      : `Not assessed: ${listed(unstatedCta)} ${unstatedCta.length > 1 ? 'are' : 'is'} not stated. A bridging ` +
        'study is required when a clinical trial assay (CTA) enrolled the pivotal trial and the market-ready IVD ' +
        'differs from it: banked pivotal specimens then show the marketed test concordant with the CTA.';

  const findings: Finding[] = [];
  if (isCompanion === true && statedClass !== undefined && statedClass !== 'III') {
    findings.push({
      severity: 'caution',
      message:
        'Marker is treated as a true companion diagnostic (essential for safe/effective use) but a ' +
        'non-Class-III risk class was supplied. CDx that gate therapy are typically Class III/PMA; ' +
        'confirm the risk classification with FDA early (pre-submission).',
    });
  }
  if (statedClass === undefined && riskClass !== undefined) {
    findings.push({
      severity: 'info',
      message:
        `deviceRiskClass is not stated: Class ${riskClass} is assumed for a ` +
        `${isCompanion ? 'companion' : 'complementary'} diagnostic. State the class to confirm the device pathway.`,
    });
  }
  if (phase === 'phase3' && differs === true) {
    // 2026-11-08 (S5b review): with usedClinicalTrialAssay unstated, bridging is not assessed, so the finding says
    // what it depends on; it called the bridging study mandatory beside ctaBridgingRequired null.
    findings.push({
      severity: 'warning',
      message:
        'Market IVD differs from the CTA at Phase 3. The cutoff and assay enrolling the pivotal trial ' +
        'should be locked before pivotal start; ' +
        (usedCTA === undefined
          ? 'if the CTA enrolled the pivotal trial (usedClinicalTrialAssay is not stated), a robust bridging study is ' +
            'mandatory and discordance '
          : 'a robust bridging study is now mandatory and discordance ') +
        'risk must be managed against the demonstrated clinical benefit.',
    });
  }
  if (phase === 'filed' && ctaBridgingRequired === true) {
    findings.push({
      severity: 'critical',
      message:
        'Filing the therapeutic while the market IVD still diverges from the enrolling CTA without a ' +
        'completed bridging study risks a non-contemporaneous approval and an unsupported cross-label. ' +
        'Complete and submit the bridging data with, or ahead of, the marketing applications.',
    });
  }
  if (isCompanion === false) {
    findings.push({
      severity: 'info',
      message:
        'Treated as a COMPLEMENTARY diagnostic (informs use but is not required for safe/effective use). ' +
        'Complementary tests do not restrict the indicated population and carry a lighter cross-labeling ' +
        'burden than a companion diagnostic.',
    });
  }
  if (isCompanion === null) {
    findings.push({
      severity: 'info',
      message:
        'essentialForUse is not stated, so whether the test is a companion diagnostic (essential for ' +
        'safe/effective use, approved contemporaneously) or a complementary one is not assessed.',
    });
  }

  const citations: Citation[] = [cite('cdx_2014'), cite('cdx_codev_2016')];
  if (devicePathway === 'pma') {
    citations.push(cite('cfr_814'));
  } else if (devicePathway === '510k') {
    citations.push(cite('cfr_807e'));
  }
  citations.push(cite('cfr_80910'));

  return {
    therapeuticName: params.therapeuticName,
    biomarkerName: params.biomarkerName,
    isCompanionDiagnostic: isCompanion,
    cdxVsComplementary,
    devicePathway,
    devicePathwayRationale,
    contemporaneousApprovalRequired: isCompanion,
    parallelTimeline: cdxParallelTimeline(),
    ctaBridgingRequired,
    ctaBridgingPlan,
    crossLabelingNote:
      'The therapeutic label restricts the indicated population to the biomarker-defined subset and ' +
      'references the approved test; the IVD label references the therapeutic. Cross-labeling must be ' +
      'consistent between the two marketing applications (21 CFR 809.10; 21 CFR 814.20(b)).',
    findings,
    citations: uniqueCitations(citations),
    inputStates,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 4 — assessBiomarkerAnalyticalValidation
// ════════════════════════════════════════════════════════════════════════════

export interface AnalyticalValidationInputs {
  /** Observed/claimed precision CV% at the medical decision level (quantitative). */
  precisionCVPercent?: number;
  /** Maximum acceptable CV% for the COU. */
  maxAcceptableCVPercent?: number;
  /** Established limit of detection (assay units), if claimed. */
  limitOfDetection?: number;
  /** Lowest clinically meaningful concentration / level that must be detectable. */
  lowestClinicallyMeaningfulLevel?: number;
  /** Established limit of quantitation, if claimed. Not read. */
  limitOfQuantitation?: number;
  /** Whether interference/cross-reactivity testing was completed. */
  interferenceTested?: boolean;
  /** Whether linearity / reportable range was established. */
  reportableRangeEstablished?: boolean;
  /** Whether robustness across lots/operators/instruments was demonstrated. */
  robustnessDemonstrated?: boolean;
  /** Whether pre-analytical/specimen-stability conditions are documented. */
  preanalyticalDocumented?: boolean;
  /** Whether multi-site reproducibility was demonstrated. */
  multiSiteReproducibility?: boolean;
  /** For qualitative assays: positive percent agreement with reference (%). */
  positivePercentAgreement?: number;
  /** For qualitative assays: negative percent agreement with reference (%). */
  negativePercentAgreement?: number;
}

export interface AnalyticalValidationParams {
  biomarkerName: string;
  assayModality: AssayModality;
  /** Whether the assay is quantitative (vs qualitative/binary). Required: it decides which parameters apply. */
  quantitative: boolean;
  /** Stakes of the intended use (high for CDx/patient selection). */
  intendedUseStakes?: 'low' | 'moderate' | 'high';
  inputs: AnalyticalValidationInputs;
}

export interface ParameterAssessment {
  parameter: string;
  status: 'pass' | 'fail' | 'not_evaluated';
  detail: string;
  clsiReference: string;
}

export interface AnalyticalValidationResult {
  biomarkerName: string;
  assayModality: AssayModality;
  quantitative: boolean;
  /** 'not_assessed' when no parameter fails and the unstated stakes decide whether precision does. */
  overallReadiness: 'ready' | 'gaps' | 'not_ready' | 'not_assessed';
  parameterAssessments: ParameterAssessment[];
  outstandingRequirements: string[];
  findings: Finding[];
  citations: Citation[];
  /** Each boolean evidence input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
}

const ANALYTICAL_FLAGS = [
  'interferenceTested',
  'reportableRangeEstablished',
  'robustnessDemonstrated',
  'preanalyticalDocumented',
  'multiSiteReproducibility',
] as const;

/**
 * Assess analytical validation of a biomarker assay against CLSI-grounded
 * parameters: accuracy/trueness, precision, sensitivity (LoB/LoD/LoQ),
 * specificity, reportable range, robustness, and pre-analytical control.
 *
 * Deterministic — pass/fail follows fixed rules over the supplied evidence.
 */
export function assessBiomarkerAnalyticalValidation(
  params: AnalyticalValidationParams,
): AnalyticalValidationResult {
  // 2026-11-08 (S5b): `quantitative` was read `!== false` ("Default true"), so an omitted one assessed a
  // qualitative assay by bias and linearity; it is now required, as is `inputs`, whose absence crashed. A
  // malformed number was read ('8' as a CV of 8%), a malformed boolean as not tested, and with neither the limit
  // nor the stakes stated a CV of 12% passed the 15% default although a high-stakes use's 10% fails it. An
  // omitted multi-site fact for a high-stakes use read "not demonstrated". An omitted evidence fact's outstanding
  // requirement read as a stated false's; it now names the fact.
  refuseUnlessStated('assess_biomarker_analytical_validation', [
    textInput('biomarkerName', params.biomarkerName),
    oneOfInput('assayModality', params.assayModality, ASSAY_MODALITIES),
    { field: 'quantitative', value: params.quantitative, ok: typeof params.quantitative === 'boolean', expected: 'true or false' },
    {
      field: 'inputs',
      value: params.inputs,
      ok: typeof params.inputs === 'object' && params.inputs !== null && !Array.isArray(params.inputs),
      expected: 'an object of the stated evidence, {} if none',
    },
  ], 'assessed');
  const quantitative = params.quantitative;
  const stakes = statedOneOf('intendedUseStakes', params.intendedUseStakes, STAKES);
  const i = params.inputs;
  const inputStates = booleanInputStates(i, ANALYTICAL_FLAGS);
  const atLeastZero = (field: string, value: unknown): number | undefined =>
    statedNumber(field, value, (n: number): boolean => n >= 0, 'a number of at least 0');
  const percent = (field: string, value: unknown): number | undefined =>
    statedNumber(field, value, (n: number): boolean => n >= 0 && n <= 100, 'a percentage from 0 to 100');
  const cv = atLeastZero('precisionCVPercent', i.precisionCVPercent);
  const maxCVStated = statedNumber('maxAcceptableCVPercent', i.maxAcceptableCVPercent, (n: number): boolean => n > 0, 'a percentage above 0');
  const lod = atLeastZero('limitOfDetection', i.limitOfDetection);
  const lowestLevel = atLeastZero('lowestClinicallyMeaningfulLevel', i.lowestClinicallyMeaningfulLevel);
  const ppa = percent('positivePercentAgreement', i.positivePercentAgreement);
  const npa = percent('negativePercentAgreement', i.negativePercentAgreement);
  /** Prefixes guidance and outstanding requirements with the fact left out, so an omitted fact does not read as a stated false. */
  const unstated = (flag: (typeof ANALYTICAL_FLAGS)[number]): string =>
    inputStates[flag] === 'not_stated' ? `${flag} not stated. ` : '';
  const assessments: ParameterAssessment[] = [];
  const outstanding: string[] = [];
  const findings: Finding[] = [];
  let precisionUndecided = false;

  // Accuracy / trueness.
  if (quantitative) {
    assessments.push({
      parameter: 'Accuracy / trueness (bias)',
      status: 'not_evaluated',
      detail:
        'Provide method-comparison/bias data (vs reference method) to evaluate trueness for a quantitative ' +
        'assay. Bias should fall within the total-allowable-error budget for the COU.',
      clsiReference: 'CLSI EP09',
    });
    outstanding.push('Method-comparison/bias study (CLSI EP09) demonstrating trueness within TAE.');
  } else {
    if (ppa !== undefined && npa !== undefined) {
      const pass = ppa >= 90 && npa >= 90;
      assessments.push({
        parameter: 'Accuracy (qualitative concordance, PPA/NPA)',
        status: pass ? 'pass' : 'fail',
        detail:
          'PPA=' +
          round(ppa, 1) +
          '%, NPA=' +
          round(npa, 1) +
          '%. Both should meet the pre-specified threshold (commonly ≥ 90% with adequate confidence ' +
          'intervals; CDx may require higher).',
        clsiReference: 'CLSI EP12',
      });
      if (!pass) {
        outstanding.push('Improve PPA/NPA to the pre-specified concordance threshold.');
      }
    } else {
      assessments.push({
        parameter: 'Accuracy (qualitative concordance, PPA/NPA)',
        status: 'not_evaluated',
        detail: 'Provide positive/negative percent agreement vs a reference method or clinical truth.',
        clsiReference: 'CLSI EP12',
      });
      outstanding.push('Qualitative concordance study (PPA/NPA) vs reference (CLSI EP12).');
    }
  }

  // Precision. With no limit stated, the limit is 10% for a high-stakes use and 15% otherwise; with the stakes
  // not stated either, the result is given only when both limits give it.
  if (quantitative && cv !== undefined) {
    const limits = maxCVStated !== undefined ? [maxCVStated] : stakes !== undefined ? [stakes === 'high' ? 10 : 15] : [10, 15];
    const passes = limits.map((limit: number): boolean => cv <= limit);
    const decided = passes.every((p: boolean): boolean => p === passes[0]);
    const pass = decided && passes[0];
    const limitText =
      maxCVStated !== undefined
        ? '≤ ' + round(maxCVStated, 2) + '%'
        : stakes !== undefined
          ? `≤ ${limits[0]}% (the default for ${stakes === 'high' ? 'high-stakes' : 'low- or moderate-stakes'} use; ` +
            'maxAcceptableCVPercent not stated)'
          : '≤ 10% for a high-stakes use or ≤ 15% otherwise (the defaults; maxAcceptableCVPercent and ' +
            'intendedUseStakes not stated)';
    assessments.push({
      parameter: 'Precision (repeatability / reproducibility)',
      status: !decided ? 'not_evaluated' : pass ? 'pass' : 'fail',
      detail:
        'Observed CV=' +
        round(cv, 2) +
        '% vs acceptance ' +
        limitText +
        (decided
          ? '. Evaluate across the medically relevant range and multiple conditions.'
          : '. It meets only the 15% limit, so precision is not assessed until the stakes or the limit are stated.'),
      clsiReference: 'CLSI EP05',
    });
    if (decided && !pass) {
      outstanding.push('Reduce imprecision to meet the CV acceptance limit (CLSI EP05).');
    }
    if (!decided) {
      precisionUndecided = true;
      outstanding.push('State intendedUseStakes or maxAcceptableCVPercent to assess precision (CLSI EP05).');
    }
  } else {
    assessments.push({
      parameter: 'Precision (repeatability / reproducibility)',
      status: 'not_evaluated',
      detail:
        'Provide repeatability and intermediate-precision CV% at decision levels (CLSI EP05); for ' +
        'qualitative tests characterize agreement near the cutoff (C5–C95).',
      clsiReference: 'CLSI EP05',
    });
    outstanding.push('Precision study at the medical decision level(s) (CLSI EP05).');
  }

  // Analytical sensitivity (LoD vs clinical need).
  if (lod !== undefined && lowestLevel !== undefined) {
    const pass = lod <= lowestLevel;
    assessments.push({
      parameter: 'Analytical sensitivity (LoB/LoD/LoQ)',
      status: pass ? 'pass' : 'fail',
      detail:
        'LoD=' +
        lod +
        ' vs lowest clinically meaningful level=' +
        lowestLevel +
        '. LoD must be at or below the lowest level the COU must detect.',
      clsiReference: 'CLSI EP17',
    });
    if (!pass) {
      outstanding.push('Lower the LoD to at or below the lowest clinically meaningful level (CLSI EP17).');
    }
  } else {
    assessments.push({
      parameter: 'Analytical sensitivity (LoB/LoD/LoQ)',
      status: 'not_evaluated',
      detail:
        'Establish LoB/LoD/LoQ (CLSI EP17) and confirm LoD ≤ lowest clinically meaningful level. ' +
        'Critical for low-input modalities (ctDNA/liquid biopsy: define detectable variant allele fraction).',
      clsiReference: 'CLSI EP17',
    });
    outstanding.push('Detection-capability study establishing LoB/LoD/LoQ (CLSI EP17).');
  }

  // Analytical specificity.
  assessments.push({
    parameter: 'Analytical specificity (interference / cross-reactivity)',
    status: i.interferenceTested === true ? 'pass' : 'not_evaluated',
    detail:
      i.interferenceTested === true
        ? 'Interference/cross-reactivity testing reported complete (CLSI EP07).'
        : unstated('interferenceTested') +
          'Test common interferents (hemolysis, lipemia, icterus, concomitant drugs) and cross-reactivity ' +
          '(e.g., homologous regions for NGS) per CLSI EP07.',
    clsiReference: 'CLSI EP07',
  });
  if (i.interferenceTested !== true) {
    outstanding.push(unstated('interferenceTested') + 'Interference / cross-reactivity study (CLSI EP07).');
  }

  // Reportable range / linearity.
  if (quantitative) {
    assessments.push({
      parameter: 'Reportable range / linearity',
      status: i.reportableRangeEstablished === true ? 'pass' : 'not_evaluated',
      detail:
        i.reportableRangeEstablished === true
          ? 'Linearity / measuring interval established (CLSI EP06).'
          : unstated('reportableRangeEstablished') +
            'Establish linearity across the analytical measuring interval and dilution recovery (CLSI EP06).',
      clsiReference: 'CLSI EP06',
    });
    if (i.reportableRangeEstablished !== true) {
      outstanding.push(unstated('reportableRangeEstablished') + 'Linearity / reportable-range study (CLSI EP06).');
    }
  }

  // Robustness.
  assessments.push({
    parameter: 'Robustness / ruggedness',
    status: i.robustnessDemonstrated === true ? 'pass' : 'not_evaluated',
    detail:
      i.robustnessDemonstrated === true
        ? 'Robustness across reagent lots / operators / instruments demonstrated.'
        : unstated('robustnessDemonstrated') +
          'Demonstrate performance across reagent lots, operators, instruments, and small deliberate ' +
          'method variations; guard-band critical parameters.',
    clsiReference: 'CLSI EP05 / EP25',
  });
  if (i.robustnessDemonstrated !== true) {
    outstanding.push(unstated('robustnessDemonstrated') + 'Robustness/ruggedness study including reagent-lot variability.');
  }

  // Pre-analytical.
  assessments.push({
    parameter: 'Pre-analytical factors / specimen stability',
    status: i.preanalyticalDocumented === true ? 'pass' : 'not_evaluated',
    detail:
      i.preanalyticalDocumented === true
        ? 'Acceptable specimen types and stability conditions documented (CLSI EP25).'
        : unstated('preanalyticalDocumented') +
          'Document acceptable specimen types/anticoagulants, time-to-processing/fixation, storage ' +
          'temperature, and freeze-thaw limits; define specimen-rejection criteria (CLSI EP25).',
    clsiReference: 'CLSI EP25',
  });
  if (i.preanalyticalDocumented !== true) {
    outstanding.push(unstated('preanalyticalDocumented') + 'Pre-analytical / specimen-stability characterization (CLSI EP25).');
  }

  // Multi-site reproducibility for high-stakes (CDx) use.
  if (stakes === 'high') {
    if (i.multiSiteReproducibility === true) {
      findings.push({
        severity: 'info',
        message: 'Multi-site reproducibility demonstrated — appropriate for a high-stakes/CDx assay.',
      });
    } else {
      outstanding.push(unstated('multiSiteReproducibility') + 'Multi-site reproducibility study (required for CDx-level assays).');
      findings.push({
        severity: inputStates.multiSiteReproducibility === 'not_stated' ? 'caution' : 'warning',
        message:
          inputStates.multiSiteReproducibility === 'not_stated'
            ? 'High-stakes (CDx) intended use, and whether multi-site reproducibility was demonstrated is not ' +
              'stated. CDx assays must reproduce across sites, lots, and operators.'
            : 'High-stakes (CDx) intended use but multi-site reproducibility not demonstrated. CDx assays ' +
              'must reproduce across sites, lots, and operators.',
      });
    }
  } else if (stakes === undefined) {
    findings.push({
      severity: 'info',
      message:
        'intendedUseStakes is not stated. A high-stakes (CDx or patient-selection) use also requires ' +
        'multi-site reproducibility, and its default precision limit is 10%.',
    });
  }

  // Overall readiness.
  const anyFail = assessments.some((a: ParameterAssessment): boolean => a.status === 'fail');
  const anyNotEvaluated = assessments.some(
    (a: ParameterAssessment): boolean => a.status === 'not_evaluated',
  );
  let overallReadiness: AnalyticalValidationResult['overallReadiness'];
  if (anyFail) {
    overallReadiness = 'not_ready';
  } else if (precisionUndecided) {
    overallReadiness = 'not_assessed';
  } else if (anyNotEvaluated || outstanding.length > 0) {
    overallReadiness = 'gaps';
  } else {
    overallReadiness = 'ready';
  }

  if (anyFail) {
    findings.push({
      severity: 'critical',
      message:
        'One or more analytical parameters FAILED their acceptance criteria. The assay is not ' +
        'analytically validated for the intended use until these are resolved.',
    });
  }

  const citations: Citation[] = [
    cite('clsi_ep17'),
    cite('clsi_ep05'),
    cite('clsi_ep09'),
    cite('clsi_ep12'),
  ];

  return {
    biomarkerName: params.biomarkerName,
    assayModality: params.assayModality,
    quantitative,
    overallReadiness,
    parameterAssessments: assessments,
    outstandingRequirements: uniqueStrings(outstanding),
    findings,
    citations,
    inputStates,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 5 — assessBiomarkerClinicalValidation
// ════════════════════════════════════════════════════════════════════════════

export interface ClinicalValidationParams {
  biomarkerName: string;
  /** True positives: diseased/responders correctly classified positive. */
  truePositives: number;
  /** False negatives: diseased/responders classified negative. */
  falseNegatives: number;
  /** True negatives: non-diseased/non-responders classified negative. */
  trueNegatives: number;
  /** False positives: non-diseased/non-responders classified positive. */
  falsePositives: number;
  /**
   * Optional disease/responder prevalence (0-1) in the intended-use population for
   * recomputing PPV/NPV at that prevalence (Bayes). If omitted, PPV/NPV are reported
   * at the apparent prevalence of the supplied 2x2 table.
   */
  intendedUsePrevalence?: number;
  /** Whether clinical utility (improved outcomes from acting on the result) is demonstrated. */
  clinicalUtilityDemonstrated?: boolean;
  /** Whether the cutoff was pre-specified before the validation dataset was analyzed. */
  cutoffPrespecified?: boolean;
  /** Whether validation used an independent dataset (not the cutoff-derivation set). */
  independentValidationSet?: boolean;
}

export interface ClinicalValidationResult {
  biomarkerName: string;
  clinicalSensitivity: number;
  /** Exact (Clopper–Pearson) 95% interval on clinical sensitivity. */
  clinicalSensitivityCi: Interval;
  clinicalSpecificity: number;
  /** Exact (Clopper–Pearson) 95% interval on clinical specificity. */
  clinicalSpecificityCi: Interval;
  /** Null when no subject tested positive: PPV is undefined there, not 0. */
  ppvApparent: number | null;
  /** Null when no subject tested negative. */
  npvApparent: number | null;
  apparentPrevalence: number;
  /** Null when Bayes is undefined at the supplied prevalence (zero denominator). */
  ppvAtIntendedPrevalence?: number | null;
  npvAtIntendedPrevalence?: number | null;
  intendedUsePrevalence?: number;
  /** null while an unstated cutoff or independence fact could make it true. */
  validityEstablished: boolean | null;
  utilityDistinctionNote: string;
  cutoffNote: string;
  findings: Finding[];
  citations: Citation[];
  /** Each boolean input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
}

const CLINICAL_FLAGS = ['clinicalUtilityDemonstrated', 'cutoffPrespecified', 'independentValidationSet'] as const;
const CLINICAL_COUNTS = ['truePositives', 'falseNegatives', 'trueNegatives', 'falsePositives'] as const;

/**
 * Assess clinical validation of a biomarker: clinical sensitivity/specificity,
 * PPV/NPV (apparent and re-projected to the intended-use prevalence by Bayes),
 * cutoff-determination integrity, and the validity-vs-utility distinction.
 *
 * Deterministic — the 2x2 metrics, their exact (Clopper–Pearson) intervals and
 * the Bayes re-projection come from computeDiagnosticAccuracy, the one 2x2
 * engine. It throws on an empty table or a table with no diseased or no
 * non-diseased subjects, so neither becomes a 0% metric or a verdict here. A
 * count that is not a non-negative safe integer, or a prevalence outside
 * [0, 1], is refused before it, by field. The AnA handler relays those
 * refusals and the "required" one as needs_parameters; an all-zero table
 * ("Confusion matrix is empty.") comes back as an error.
 */
export function assessBiomarkerClinicalValidation(
  params: ClinicalValidationParams,
): ClinicalValidationResult {
  // 2026-11-08 (S5b): an omitted independentValidationSet or clinicalUtilityDemonstrated read as a stated false
  // ("Performance not confirmed on an independent validation set", "Utility is not yet demonstrated"), and
  // validityEstablished was false while an answer could make it true; it is now null. A count of '45' was
  // refused under the 2x2 engine's own name (tp), and an intended-use prevalence of '0.1' was read as 0.1.
  const counts = Object.fromEntries(
    CLINICAL_COUNTS.map((field: (typeof CLINICAL_COUNTS)[number]): [string, number | undefined] => [
      field,
      statedNumber(field, params[field], (n: number): boolean => Number.isSafeInteger(n) && n >= 0, 'a non-negative safe integer'),
    ]),
  ) as Record<(typeof CLINICAL_COUNTS)[number], number | undefined>;
  refuseUnlessStated('assess_biomarker_clinical_validation', [
    textInput('biomarkerName', params.biomarkerName),
    ...CLINICAL_COUNTS.map((field: (typeof CLINICAL_COUNTS)[number]): RequiredInputCheck => ({
      field,
      value: params[field],
      ok: counts[field] !== undefined,
      expected: 'a non-negative safe integer',
    })),
  ], 'computed');
  // A null prevalence is not stated, not 0: PPV/NPV stay at the table's own prevalence.
  const prev = statedNumber(
    'intendedUsePrevalence',
    params.intendedUsePrevalence,
    (n: number): boolean => n >= 0 && n <= 1,
    'in [0, 1]',
  );
  const inputStates = booleanInputStates(params, CLINICAL_FLAGS);
  const cutoffPrespecified = statedBoolean('cutoffPrespecified', params.cutoffPrespecified);
  const independentValidationSet = statedBoolean('independentValidationSet', params.independentValidationSet);
  const clinicalUtilityDemonstrated = statedBoolean('clinicalUtilityDemonstrated', params.clinicalUtilityDemonstrated);
  const accuracy = computeDiagnosticAccuracy(
    {
      tp: params.truePositives,
      fp: params.falsePositives,
      fn: params.falseNegatives,
      tn: params.trueNegatives,
    },
    { prevalence: prev },
  );
  const sensitivity = accuracy.sensitivity;
  const specificity = accuracy.specificity;
  const apparentPrevalence = (params.truePositives + params.falseNegatives) / accuracy.n;

  const findings: Finding[] = [];

  // PPV/NPV re-projected to the intended-use prevalence (Bayes), when one is supplied.
  const ppvAtPrev = prev !== undefined ? accuracy.ppvAdjusted : undefined;
  const npvAtPrev = prev !== undefined ? accuracy.npvAdjusted : undefined;
  if (prev !== undefined) {
    if (prev <= 0.01 && ppvAtPrev != null && ppvAtPrev < 0.5) {
      findings.push({
        severity: 'caution',
        message:
          'At the low intended-use prevalence supplied, PPV is below 50% despite the test’s ' +
          'sensitivity/specificity — most positives will be false positives. This is the canonical ' +
          'screening-population pitfall; consider clinical utility and a confirmatory pathway.',
      });
    }
  }

  // Validity = adequate accuracy on an independent set with a pre-specified cutoff. Inadequate accuracy or
  // either fact stated false settles it as not established; otherwise it is null until both are stated true.
  const accuracyAdequate = sensitivity >= 0.8 && specificity >= 0.8;
  const validityEstablished: boolean | null =
    !accuracyAdequate || independentValidationSet === false || cutoffPrespecified === false
      ? false
      : independentValidationSet === true && cutoffPrespecified === true
        ? true
        : null;

  if (!accuracyAdequate) {
    findings.push({
      severity: 'warning',
      message:
        'Clinical sensitivity (' +
        round(sensitivity * 100, 1) +
        '%) and/or specificity (' +
        round(specificity * 100, 1) +
        '%) are below a typical 80% threshold; clinical validity is not established at this performance.',
    });
  }
  if (cutoffPrespecified !== true) {
    findings.push({
      severity: cutoffPrespecified === false ? 'critical' : 'warning',
      message: cutoffPrespecified === false
        ? 'Cutoff was NOT pre-specified. A data-derived cutoff fitted on the same dataset used to report ' +
          'performance overstates accuracy (optimism bias). Lock the cutoff, then validate on independent data.'
        : 'Cutoff prespecification is not stated. Confirm it was locked before analyzing the validation data; clinical validity is not established without that fact.',
    });
  }
  if (independentValidationSet === false) {
    findings.push({
      severity: 'warning',
      message:
        'Performance not confirmed on an independent validation set. Apparent metrics may reflect ' +
        'overfitting to the development data.',
    });
  } else if (independentValidationSet === undefined) {
    findings.push({
      severity: 'caution',
      message:
        'Whether validation used an independent dataset (not the cutoff-derivation set) is not stated. ' +
        'Clinical validity is not established without that fact; apparent metrics may reflect overfitting.',
    });
  }
  if (clinicalUtilityDemonstrated === false) {
    findings.push({
      severity: 'caution',
      message:
        'Clinical VALIDITY (the test measures what it claims and predicts the outcome) is distinct from ' +
        'clinical UTILITY (acting on the result improves patient outcomes). Utility is not yet demonstrated; ' +
        'a valid test can still lack utility if no action changes outcomes.',
    });
  } else if (clinicalUtilityDemonstrated === undefined) {
    findings.push({
      severity: 'info',
      message:
        'Whether clinical utility is demonstrated is not stated. Clinical VALIDITY (the test measures what it ' +
        'claims and predicts the outcome) is distinct from clinical UTILITY (acting on the result improves ' +
        'patient outcomes); a valid test can still lack utility if no action changes outcomes.',
    });
  }

  return {
    biomarkerName: params.biomarkerName,
    clinicalSensitivity: round(sensitivity, 4),
    clinicalSensitivityCi: roundInterval(accuracy.sensitivityCi),
    clinicalSpecificity: round(specificity, 4),
    clinicalSpecificityCi: roundInterval(accuracy.specificityCi),
    ppvApparent: accuracy.ppvSample === null ? null : round(accuracy.ppvSample, 4),
    npvApparent: accuracy.npvSample === null ? null : round(accuracy.npvSample, 4),
    apparentPrevalence: round(apparentPrevalence, 4),
    ppvAtIntendedPrevalence: ppvAtPrev == null ? ppvAtPrev : round(ppvAtPrev, 4),
    npvAtIntendedPrevalence: npvAtPrev == null ? npvAtPrev : round(npvAtPrev, 4),
    intendedUsePrevalence: prev,
    validityEstablished,
    utilityDistinctionNote:
      'Clinical validity = the biomarker accurately identifies the clinical condition/response it claims. ' +
      'Clinical utility = using the biomarker leads to improved, measurable patient outcomes (net benefit). ' +
      'Regulators and payers may require utility, not just validity.',
    cutoffNote:
      cutoffPrespecified === false
        ? 'Cutoff not pre-specified — re-derive and validate on independent data.'
        : cutoffPrespecified === true
          ? 'Cutoff stated as pre-specified; confirm it was locked before unblinding the validation set.'
          : 'Cutoff prespecification is not stated; confirm it was locked before unblinding the validation set.',
    findings,
    citations: [cite('best'), cite('bq_framework'), cite('clsi_ep12')],
    inputStates,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ENGINE 6 — planEnrichmentStrategy
// ════════════════════════════════════════════════════════════════════════════

export interface PlanEnrichmentStrategyParams {
  biomarkerName: string;
  /** BEST category of the enrichment biomarker. */
  category: BiomarkerCategory;
  /** Prevalence of the biomarker-positive subgroup in the screened population (above 0, at most 1). */
  biomarkerPositivePrevalence: number;
  /** Whether biomarker-negative patients are expected to derive any benefit. */
  negativesExpectedToBenefit?: boolean;
  /** Whether the treatment effect is plausibly large only in biomarker-positives. */
  effectConcentratedInPositives?: boolean;
  /** Expected screen-to-enroll yield consideration: total screening pool size, if known. */
  screeningPoolSize?: number;
  /** Whether the goal is to also characterize the biomarker-negative population. */
  characterizeNegatives?: boolean;
  /** Whether a validated assay exists to operationalize enrichment at screening. */
  validatedAssayAvailable?: boolean;
}

export interface EnrichmentDesignOption {
  design: 'all_comers' | 'biomarker_positive_only' | 'stratified' | 'enrichment_with_negative_cohort';
  description: string;
  whenAppropriate: string;
  tradeoffs: string;
}

export interface PlanEnrichmentStrategyResult {
  biomarkerName: string;
  enrichmentType: 'predictive' | 'prognostic' | 'none';
  enrichmentTypeRationale: string;
  /** 'not_assessed' for a predictive marker while an answer to an unstated design fact could change it. */
  recommendedDesign: EnrichmentDesignOption['design'] | 'not_assessed';
  recommendedDesignRationale: string;
  designOptions: EnrichmentDesignOption[];
  feasibility: {
    biomarkerPositivePrevalence: number;
    screensPerEnrolledPositive: number;
    estimatedScreensNeeded?: number;
    feasibilityFlag: 'feasible' | 'challenging' | 'low_prevalence_warning';
  };
  findings: Finding[];
  citations: Citation[];
  /** Each boolean input: true, false or not_stated. */
  inputStates: Record<string, BooleanState>;
}

const ENRICHMENT_FLAGS = [
  'negativesExpectedToBenefit',
  'effectConcentratedInPositives',
  'characterizeNegatives',
  'validatedAssayAvailable',
] as const;
type DesignFact = 'negativesExpectedToBenefit' | 'characterizeNegatives' | 'effectConcentratedInPositives';

/** The design for a predictive marker from one complete set of answers, with its rationale. */
function predictiveDesign(
  facts: Record<DesignFact, boolean>,
): { design: EnrichmentDesignOption['design']; rationale: string } {
  if (facts.negativesExpectedToBenefit) {
    return {
      design: 'stratified',
      rationale:
        'Negatives may benefit, so do not exclude them: enroll all-comers stratified by biomarker to ' +
        'test the interaction and characterize both subgroups.',
    };
  }
  if (facts.characterizeNegatives) {
    return {
      design: 'enrichment_with_negative_cohort',
      rationale:
        'Benefit concentrated in positives but evidence on negatives is wanted: enrich for positives while ' +
        'including a smaller negative cohort to characterize (not power) the negative population.',
    };
  }
  if (facts.effectConcentratedInPositives) {
    return {
      design: 'biomarker_positive_only',
      rationale:
        'Strong prior that benefit is concentrated in positives and negatives are not expected to benefit: ' +
        'predictive enrichment via biomarker-positive-only enrollment supports a restricted indication and CDx.',
    };
  }
  return {
    design: 'stratified',
    rationale:
      'Predictive hypothesis not yet firmly established: a marker-stratified all-comers design formally ' +
      'tests the biomarker-by-treatment interaction before restricting the population.',
  };
}

function enrichmentDesignOptions(): EnrichmentDesignOption[] {
  return [
    {
      design: 'all_comers',
      description:
        'Enroll the full population regardless of biomarker status; analyze the overall effect and the ' +
        'biomarker subgroup as pre-specified secondary.',
      whenAppropriate:
        'When the predictive hypothesis is uncertain, negatives may benefit, or the goal is to confirm ' +
        'effect across the whole indicated population.',
      tradeoffs:
        'Largest sample size; if the effect is concentrated in positives, dilution by non-responders can ' +
        'mask a real effect.',
    },
    {
      design: 'biomarker_positive_only',
      description:
        'Restrict enrollment to biomarker-positive patients (predictive enrichment); the trial supports ' +
        'a biomarker-restricted indication and a companion diagnostic.',
      whenAppropriate:
        'When strong prior evidence concentrates benefit in positives and negatives are not expected to ' +
        'benefit (or may be harmed).',
      tradeoffs:
        'Most efficient for detecting the effect in positives but cannot characterize negatives; requires ' +
        'a validated selection assay at screening; restricts the labeled population.',
    },
    {
      design: 'stratified',
      description:
        'Enroll all-comers but randomize stratified by biomarker status with pre-specified analyses in ' +
        'each subgroup (marker-stratified design).',
      whenAppropriate:
        'When you must formally test the biomarker-by-treatment interaction and characterize both subgroups.',
      tradeoffs:
        'Balances arms within strata and enables a rigorous interaction test, but needs adequate power in ' +
        'each subgroup, increasing total size.',
    },
    {
      design: 'enrichment_with_negative_cohort',
      description:
        'Primarily enroll biomarker-positives but include a smaller biomarker-negative cohort to ' +
        'characterize (rather than power) the negative population.',
      whenAppropriate:
        'When benefit is expected mainly in positives but regulators want evidence about negatives to ' +
        'support or bound the label.',
      tradeoffs:
        'Captures some negative-population information at moderate cost without fully powering the negative ' +
        'subgroup.',
    },
  ];
}

/**
 * Plan an FDA enrichment strategy: classify the enrichment as prognostic vs
 * predictive, recommend an all-comers / biomarker-positive-only / stratified /
 * enrichment-with-negative-cohort design, and assess prevalence-driven feasibility.
 *
 * Deterministic. For a predictive marker the design is given only when every
 * answer to the unstated design facts gives the same one.
 */
export function planEnrichmentStrategy(
  params: PlanEnrichmentStrategyParams,
): PlanEnrichmentStrategyResult {
  // 2026-11-08 (S5b): a predictive marker with its design facts omitted was "stratified" ("Predictive
  // hypothesis not yet firmly established") although the answers could make it positive-only or add a negative
  // cohort, and an omitted validatedAssayAvailable read "No validated assay reported". The prevalence was
  // clamped: 1.5 read as 1, 'feasible', and 0 reported 0 screens per enrolled positive. A category of
  // 'Predictive' read as no enrichment.
  refuseUnlessStated('plan_enrichment_strategy', [
    textInput('biomarkerName', params.biomarkerName),
    oneOfInput('category', params.category, BIOMARKER_CATEGORIES),
    {
      field: 'biomarkerPositivePrevalence',
      value: params.biomarkerPositivePrevalence,
      ok:
        typeof params.biomarkerPositivePrevalence === 'number' &&
        params.biomarkerPositivePrevalence > 0 &&
        params.biomarkerPositivePrevalence <= 1,
      expected: 'a proportion above 0 and at most 1',
    },
  ], 'planned');
  const prevalence = params.biomarkerPositivePrevalence;
  const screeningPoolSize = statedNumber(
    'screeningPoolSize',
    params.screeningPoolSize,
    (n: number): boolean => Number.isInteger(n) && n >= 1,
    'a whole number of at least 1',
  );
  const inputStates = booleanInputStates(params, ENRICHMENT_FLAGS);
  const designFacts: Record<DesignFact, boolean | undefined> = {
    negativesExpectedToBenefit: statedBoolean('negativesExpectedToBenefit', params.negativesExpectedToBenefit),
    characterizeNegatives: statedBoolean('characterizeNegatives', params.characterizeNegatives),
    effectConcentratedInPositives: statedBoolean('effectConcentratedInPositives', params.effectConcentratedInPositives),
  };
  const validatedAssay = statedBoolean('validatedAssayAvailable', params.validatedAssayAvailable);

  // Enrichment type from category.
  let enrichmentType: 'predictive' | 'prognostic' | 'none';
  let enrichmentTypeRationale: string;
  if (params.category === 'predictive') {
    enrichmentType = 'predictive';
    enrichmentTypeRationale =
      'A predictive biomarker selects patients more likely to respond to the specific mechanism — ' +
      'predictive enrichment (FDA Enrichment Strategies, 2019).';
  } else if (params.category === 'prognostic') {
    enrichmentType = 'prognostic';
    enrichmentTypeRationale =
      'A prognostic biomarker selects higher-risk / higher-event-rate patients to raise absolute event ' +
      'rates and statistical power without claiming differential treatment benefit — prognostic enrichment.';
  } else if (params.category === 'susceptibility_risk') {
    enrichmentType = 'prognostic';
    enrichmentTypeRationale =
      'A susceptibility/risk biomarker enriches a prevention trial for patients likely to develop the ' +
      'event — a prognostic-type enrichment of event rate.';
  } else {
    enrichmentType = 'none';
    enrichmentTypeRationale =
      'This biomarker category does not, by itself, justify prognostic or predictive enrichment. ' +
      'Enrichment relies on prognostic (event-rate) or predictive (response) selection.';
  }

  // Recommended design.
  let recommendedDesign: PlanEnrichmentStrategyResult['recommendedDesign'];
  let recommendedDesignRationale: string;
  if (enrichmentType === 'predictive') {
    const designOf = (facts: Record<DesignFact, boolean>): EnrichmentDesignOption['design'] =>
      predictiveDesign(facts).design;
    const designs = conclusions(designFacts, designOf);
    if (designs.length === 1) {
      // Every answer gives this design. The rationale is the one the unstated facts answered false give, and it
      // names them.
      const chosen = predictiveDesign({
        negativesExpectedToBenefit: designFacts.negativesExpectedToBenefit ?? false,
        characterizeNegatives: designFacts.characterizeNegatives ?? false,
        effectConcentratedInPositives: designFacts.effectConcentratedInPositives ?? false,
      });
      const unstatedFacts = (Object.keys(designFacts) as DesignFact[]).filter(
        (k: DesignFact): boolean => designFacts[k] === undefined,
      );
      recommendedDesign = chosen.design;
      recommendedDesignRationale =
        chosen.rationale +
        (unstatedFacts.length > 0
          ? ` ${listed(unstatedFacts)} ${unstatedFacts.length > 1 ? 'are' : 'is'} not stated; every answer gives this design.`
          : '');
    } else {
      const deciding = decidingFacts(designFacts, designOf);
      recommendedDesign = 'not_assessed';
      recommendedDesignRationale =
        `Not assessed: ${listed(deciding)} ${deciding.length > 1 ? 'are' : 'is'} not stated, and the answers ` +
        `make the design one of ${listed(designs)}. Negatives who may benefit call for a stratified design, ` +
        'negatives to be characterized for enrichment with a negative cohort, and an effect concentrated in ' +
        'positives for biomarker-positive-only enrollment.';
    }
  } else if (enrichmentType === 'prognostic') {
    recommendedDesign = 'all_comers';
    recommendedDesignRationale =
      'Prognostic enrichment raises the event rate by selecting higher-risk patients but does not predict ' +
      'differential benefit; enroll the enriched (high-risk) population without splitting by a treatment-' +
      'interaction marker.';
  } else {
    recommendedDesign = 'all_comers';
    recommendedDesignRationale =
      'No enrichment justified by this biomarker; default to an all-comers design.';
  }

  // Feasibility.
  const screensPerEnrolledPositive = round(1 / prevalence, 2);
  let feasibilityFlag: 'feasible' | 'challenging' | 'low_prevalence_warning';
  if (prevalence >= 0.2) {
    feasibilityFlag = 'feasible';
  } else if (prevalence >= 0.05) {
    feasibilityFlag = 'challenging';
  } else {
    feasibilityFlag = 'low_prevalence_warning';
  }

  const findings: Finding[] = [];
  if (recommendedDesign === 'biomarker_positive_only' && validatedAssay === false) {
    findings.push({
      severity: 'warning',
      message:
        'Biomarker-positive-only enrollment requires a validated selection assay at screening. No validated ' +
        'assay reported — operationalizing enrichment (and the eventual CDx) is blocked until one exists.',
    });
  } else if (recommendedDesign === 'biomarker_positive_only' && validatedAssay === undefined) {
    findings.push({
      severity: 'caution',
      message:
        'Biomarker-positive-only enrollment requires a validated selection assay at screening, and whether ' +
        'one exists (validatedAssayAvailable) is not stated. Enrichment (and the eventual CDx) cannot be ' +
        'operationalized without one.',
    });
  }
  if (feasibilityFlag === 'low_prevalence_warning') {
    findings.push({
      severity: 'caution',
      message:
        'Low biomarker-positive prevalence (' +
        round(prevalence * 100, 1) +
        '%) means many patients must be screened per enrolled positive (~' +
        screensPerEnrolledPositive +
        '). Plan screening logistics, central testing, and consider a low-frequency-subset development ' +
        'strategy.',
    });
  }
  if (enrichmentType === 'predictive' && params.negativesExpectedToBenefit === true && recommendedDesign === 'biomarker_positive_only') {
    findings.push({
      severity: 'warning',
      message:
        'Excluding negatives who may benefit risks an overly narrow label and missed effect in negatives. ' +
        'Reconsider a stratified design.',
    });
  }
  if (params.category !== 'predictive' && params.effectConcentratedInPositives === true) {
    findings.push({
      severity: 'info',
      message:
        'Effect reportedly concentrated in biomarker-positives implies a PREDICTIVE marker; confirm the ' +
        'category — predictive enrichment may be justified.',
    });
  }

  const citations: Citation[] = [cite('enrichment_2019'), cite('best')];
  if (recommendedDesign === 'biomarker_positive_only') {
    citations.push(cite('cdx_2014'));
  }

  return {
    biomarkerName: params.biomarkerName,
    enrichmentType,
    enrichmentTypeRationale,
    recommendedDesign,
    recommendedDesignRationale,
    designOptions: enrichmentDesignOptions(),
    feasibility: {
      biomarkerPositivePrevalence: round(prevalence, 4),
      screensPerEnrolledPositive,
      estimatedScreensNeeded: screeningPoolSize,
      feasibilityFlag,
    },
    findings,
    citations: uniqueCitations(citations),
    inputStates,
  };
}
