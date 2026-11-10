/**
 * The biostatistics engine's vocabularies, as the words a reader sees.
 *
 * The engine (server/services/ana-biostats/types.ts) speaks in enum keys —
 * `non_inferiority`, `time_to_event`, `biotech_pharma`, `Health_Canada`,
 * `treatment_policy`, `effect_size`. Until 2026-10-31 those keys reached the
 * customer verbatim three ways: the Biostatistics form built its option labels
 * with `replace(/_/g, …)` ("biotech / pharma", "Health_Canada"), the assumption
 * tables printed `effect_size` and `user_provided`, and the governed document
 * generator interpolated the raw keys into prose ("Study Type: dose_response").
 *
 * One map per vocabulary, shared by the client form and the server's document
 * generator so the option a person picks and the sentence the document prints
 * are the same words. A key the map does not know is humanized rather than
 * printed raw, so a vocabulary that grows on the server degrades to readable
 * words, never to snake_case.
 *
 * Display only. The engine's values, the wire and the provenance stay the keys.
 *
 * @module shared/biostat-vocabulary
 */

export type VocabularyMap = Readonly<Record<string, string>>;

/** The sponsor's track (ClientTrack). */
export const TRACK_LABELS: VocabularyMap = {
  biotech_pharma: 'Pharma / biotech',
  medical_device: 'Medical device',
  diagnostics_ivd: 'Diagnostics / IVD',
};

/** The regulator the document is written to (RegulatoryBody). */
export const AGENCY_LABELS: VocabularyMap = {
  FDA: 'FDA',
  EMA: 'EMA',
  MHRA: 'MHRA',
  PMDA: 'PMDA',
  NMPA: 'NMPA',
  TGA: 'TGA',
  Health_Canada: 'Health Canada',
};

/** The design frame (StudyType). Every value the engine accepts, in its order. */
export const STUDY_TYPE_LABELS: VocabularyMap = {
  superiority: 'Superiority',
  non_inferiority: 'Non-inferiority',
  equivalence: 'Equivalence',
  single_arm: 'Single-arm',
  dose_response: 'Dose–response',
  adaptive: 'Adaptive',
  basket: 'Basket',
  platform: 'Platform',
  diagnostic_accuracy: 'Diagnostic accuracy',
  agreement: 'Agreement',
  usability: 'Usability',
  performance: 'Performance goal',
};

/** The primary endpoint's type (EndpointType). */
export const ENDPOINT_TYPE_LABELS: VocabularyMap = {
  continuous: 'Continuous',
  binary: 'Binary',
  time_to_event: 'Time to event',
  ordinal: 'Ordinal',
  count: 'Count',
  composite: 'Composite',
  sensitivity_specificity: 'Sensitivity and specificity',
  auc_roc: 'AUC / ROC',
  agreement: 'Agreement',
};

/** What the study is for (ObjectiveType). */
export const OBJECTIVE_LABELS: VocabularyMap = {
  efficacy: 'Efficacy',
  safety: 'Safety',
  performance: 'Performance',
  diagnostic_accuracy: 'Diagnostic accuracy',
  usability: 'Usability',
  bioequivalence: 'Bioequivalence',
  dose_finding: 'Dose finding',
};

/** The intercurrent-event strategy of the estimand (ICH E9(R1)). */
export const ESTIMAND_STRATEGY_LABELS: VocabularyMap = {
  treatment_policy: 'Treatment policy',
  hypothetical: 'Hypothetical',
  composite: 'Composite',
  principal_stratum: 'Principal stratum',
  while_on_treatment: 'While on treatment',
};

/** The missing-data method. */
export const MISSING_DATA_METHOD_LABELS: VocabularyMap = {
  complete_case: 'Complete-case analysis',
  LOCF: 'Last observation carried forward (LOCF)',
  MMRM: 'Mixed model for repeated measures (MMRM)',
  multiple_imputation: 'Multiple imputation',
  pattern_mixture: 'Pattern-mixture model',
};

/** The control arm. */
export const COMPARATOR_LABELS: VocabularyMap = {
  placebo: 'Placebo',
  active: 'Active control',
  historical: 'Historical control',
  performance_goal: 'Performance goal',
};

/** The judgment engine's verdict, action and fragility words. */
export const VERDICT_LABELS: VocabularyMap = {
  adequate: 'Adequate',
  marginal: 'Marginal',
  inadequate: 'Inadequate',
  insufficient_information: 'Insufficient information',
};
export const ACTION_LABELS: VocabularyMap = {
  proceed: 'Proceed',
  proceed_with_conditions: 'Proceed with conditions',
  revise: 'Revise',
  escalate: 'Escalate',
};
export const FRAGILITY_LABELS: VocabularyMap = {
  robust: 'Robust',
  moderate: 'Moderate',
  fragile: 'Fragile',
  very_fragile: 'Very fragile',
};

/** Where an assumed value came from (ComputationAssumption.source). */
export const ASSUMPTION_SOURCE_LABELS: VocabularyMap = {
  user_provided: 'Stated',
  default: 'Engine default',
  derived: 'Derived',
  literature: 'Literature',
};

/**
 * The values the sizing stood on — the computation engine's assumption names
 * (snake_case) and the design inputs a gap or a task names (camelCase).
 */
export const PARAMETER_LABELS: VocabularyMap = {
  alpha: 'Alpha',
  power: 'Power',
  powerTarget: 'Target power',
  effect_size: 'Effect size',
  effectSize: 'Effect size',
  variance: 'Variance',
  attrition_rate: 'Attrition rate',
  attritionRate: 'Attrition rate',
  dropoutRate: 'Dropout rate',
  allocation_ratio: 'Allocation ratio',
  allocationRatio: 'Allocation ratio',
  control_rate: 'Control rate',
  controlRate: 'Control rate',
  treatment_rate: 'Treatment rate',
  treatmentRate: 'Treatment rate',
  event_rate: 'Event rate',
  eventRate: 'Event rate',
  prevalence: 'Prevalence',
  sensitivity: 'Sensitivity',
  specificity: 'Specificity',
  auc_null: 'Null AUC',
  aucNull: 'Null AUC',
  aucTarget: 'Expected AUC',
  auc_target_not_used: 'AUC target (not used)',
  design: 'Design',
  within_subject_correlation: 'Within-subject correlation',
  withinSubjectCorrelation: 'Within-subject correlation',
  crossoverPeriods: 'Crossover periods',
  carryover: 'Carryover',
  reader_variability: 'Reader variability',
  endpoint_distribution: 'Endpoint distribution',
  nonInferiorityMargin: 'Non-inferiority margin',
  equivalenceMargin: 'Equivalence margin',
  numberOfGroups: 'Number of groups',
  numberOfEndpoints: 'Number of endpoints',
  interimAnalyses: 'Interim analyses',
  studyType: 'Study type',
  endpointType: 'Endpoint type',
  objectiveType: 'Objective',
  clientTrack: 'Track',
  regulatoryBody: 'Agency',
  estimandStrategy: 'Estimand strategy',
  missingDataMethod: 'Missing-data method',
  comparatorType: 'Comparator',
  indication: 'Indication',
  phase: 'Phase',
};

/** Words that stay upper case when a key is humanized. */
const ACRONYMS = new Set([
  'auc', 'roc', 'hr', 'ci', 'se', 'sd', 'n', 'ppv', 'npv', 'mmrm', 'locf', 'rmst', 'mrmc', 'boin', 'mtd', 'dlt',
  'icc', 'oc', 'ivd', 'fda', 'ema', 'ich', 'sap', 'csr', 'dmc', 'dsmb', 'idmc', 'lod', 'lob', 'loq', 'clsi', 'ate', 'id',
]);

/**
 * A key the maps do not know, as words: `typeIError` → "Type I error",
 * `posterior_se` → "Posterior SE", `nPerArm` → "N per arm".
 */
export function humanizeKey(key: string): string {
  const words = String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      // Roman numerals (Type I, Phase II) and stated all-caps tokens stay as written.
      if (/^[IVX]+$/.test(w) || (w.length > 1 && w === w.toUpperCase())) return w;
      return lower;
    });
  if (words.length === 0) return '';
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
}

/** The label for a vocabulary value; an unknown value is humanized, never printed raw. */
export function vocabLabel(map: VocabularyMap, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const key = String(value);
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : humanizeKey(key);
}

/** The same label, lower-cased for use inside a sentence ("a non-inferiority design"). */
export function vocabPhrase(map: VocabularyMap, value: unknown): string {
  const label = vocabLabel(map, value);
  // Keep acronyms ("AUC / ROC", "FDA") as written; lower only an initial capital.
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

/** A parameter or field name as a reader says it. */
export function parameterLabel(key: string): string {
  return vocabLabel(PARAMETER_LABELS, key);
}

/** Options for a select, in the map's order: every value the engine accepts. */
export function vocabOptions(map: VocabularyMap): Array<{ value: string; label: string }> {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}
