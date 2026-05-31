/**
 * Calibrated probability-of-technical-and-regulatory-success (PTRS) model — pure core.
 *
 * This replaces the hand-tuned additive "bump-and-clamp" heuristic that used to
 * live in `statistics-service.predictTrialSuccess` (a baseline rate nudged up or
 * down by magic constants) with a trained logistic-regression scorer plus an
 * honest cold-start prior. It follows the template established by
 * `intelligence/risk-model.ts` and reuses its pure trainer (`trainLogistic`) and
 * scorer (`sigmoid`/`dot`) so there is one gradient-descent implementation in the
 * codebase, not two.
 *
 * Two targets, with different evidence available today:
 *
 *   - `registry_completion` — probability the trial reaches completion rather than
 *     being terminated/withdrawn. This is *trainable from the current corpus*,
 *     because CT.gov registry status maps to a completed/failed label
 *     (`statusToOutcome`). Its prior is the pooled empirical completion rate of
 *     the corpus, which is data-derived, not invented.
 *
 *   - `regulatory_approval` — the "true" PTRS: probability a program at the start
 *     of this phase is eventually approved. The corpus does not yet carry approval
 *     labels, so this target is *prior-only* until an approval-labelled corpus
 *     exists. Its prior is the published phase-transition likelihood-of-approval
 *     from Hay et al. 2014 (see {@link HAY_2014}), derived cumulatively in code so
 *     the number is transparent and internally consistent rather than an opaque
 *     constant.
 *
 * Honesty contract (matches GA_READINESS_PLAN §1):
 *   - Never fabricates a number. When there is no trained model and no prior, the
 *     prediction is `not_assessable`, not a fake 0.5 dressed up as analysis.
 *   - Every prediction carries the N behind it, an evidence interval (Wilson) or
 *     an explicit null when there is no local evidence, the prior used and its
 *     source, and a provenance record.
 *   - Reproducible: serving is deterministic; the label semantics of each target
 *     are stated on every result so a registry-completion estimate is never
 *     silently read as a regulatory-approval estimate.
 *
 * @module server/services/ptrs/ptrs-model
 */

import { sigmoid, dot, trainLogistic, type FeatureMap } from '../intelligence/risk-model';
import { wilsonInterval } from '../corpus/precedent-benchmark';
import { buildProvenance, type StatsProvenance } from '../stats/computation-provenance';

export const PTRS_MODEL_VERSION = '1.0.0';

/**
 * Minimum local labelled trials before a trained model is trusted at full weight
 * over the prior. Below `4×` this floor the prior keeps anchoring the blend
 * (same rule as risk-model). Kept conservative because the cost of an
 * overconfident success probability in this domain is high.
 */
export const MIN_TRAIN_SAMPLES = 40;

export type PtrsTarget = 'registry_completion' | 'regulatory_approval';

/** A candidate trial design to score. */
export interface TrialDesign {
  indication: string;
  /** Free-text phase, e.g. "Phase 2", "II", "phase_3". Normalized internally. */
  phase: string;
  sampleSize: number | null;
  durationWeeks: number | null;
  /**
   * Free-text design tokens, e.g. ["randomized", "double-blind", "placebo",
   * "multicenter", "adaptive", "biomarker enrichment"]. Parsed defensively.
   */
  designFeatures: string[];
}

// ─── Feature engineering (pure, interpretable) ───────────────────────────────

/**
 * The ordered feature set. Phase 1 is the reference level (absorbed by the
 * intercept), so only phases 2–4 get indicators. Numeric features are centered
 * on log scale so gradient descent is well-conditioned and the coefficients are
 * comparable in magnitude.
 */
export const PTRS_FEATURE_NAMES: readonly string[] = [
  'phase_2',
  'phase_3',
  'phase_4',
  'log10_sample_size_centered',
  'sample_size_known',
  'log10_duration_centered',
  'duration_known',
  'randomized',
  'double_blind',
  'any_blinding',
  'placebo_controlled',
  'active_controlled',
  'multicenter',
  'adaptive',
  'biomarker_selection',
];

const LOG10_SAMPLE_CENTER = 2; // log10(100 subjects)
const LOG10_DURATION_CENTER = Math.log10(52); // log10(52 weeks ≈ 1 year)

/** Normalize a free-text phase to 1–4, or null when unrecognized. */
export function normalizePhase(phase: string | null | undefined): 1 | 2 | 3 | 4 | null {
  if (!phase) return null;
  const s = phase.toLowerCase();
  // Treat "phase 1/2", "phase 2/3" by the higher phase (the harder bar).
  if (/\b(4|iv)\b/.test(s) || s.includes('phase 4') || s.includes('phase iv')) return 4;
  if (/\b(3|iii)\b/.test(s) || s.includes('phase 3') || s.includes('phase iii')) return 3;
  if (/\b(2|ii)\b/.test(s) || s.includes('phase 2') || s.includes('phase ii')) return 2;
  if (/\b(1|i)\b/.test(s) || s.includes('phase 1') || s.includes('phase i')) return 1;
  return null;
}

/** Lowercased join of the design tokens for substring testing. */
function designText(designFeatures: string[]): string {
  return designFeatures.map(d => (d ?? '').toLowerCase()).join(' | ');
}

/**
 * Map a {@link TrialDesign} to a numeric feature vector. Pure and deterministic;
 * unknown numeric inputs contribute zero and set their `*_known` flag to 0, so
 * missingness is represented honestly rather than imputed to a fake value.
 */
export function extractFeatures(design: TrialDesign): FeatureMap {
  const phase = normalizePhase(design.phase);
  const t = designText(design.designFeatures);

  const n = typeof design.sampleSize === 'number' && design.sampleSize > 0 ? design.sampleSize : null;
  const weeks =
    typeof design.durationWeeks === 'number' && design.durationWeeks > 0 ? design.durationWeeks : null;

  const isBlinded = /blind/.test(t) && !/open[\s-]*label/.test(t);
  const isDoubleBlind = isBlinded && /(double|triple|quadruple)/.test(t);

  return {
    phase_2: phase === 2 ? 1 : 0,
    phase_3: phase === 3 ? 1 : 0,
    phase_4: phase === 4 ? 1 : 0,
    log10_sample_size_centered: n !== null ? Math.log10(n) - LOG10_SAMPLE_CENTER : 0,
    sample_size_known: n !== null ? 1 : 0,
    log10_duration_centered: weeks !== null ? Math.log10(weeks) - LOG10_DURATION_CENTER : 0,
    duration_known: weeks !== null ? 1 : 0,
    randomized: /random/.test(t) ? 1 : 0,
    double_blind: isDoubleBlind ? 1 : 0,
    any_blinding: isBlinded ? 1 : 0,
    placebo_controlled: /placebo/.test(t) ? 1 : 0,
    active_controlled: /active/.test(t) && /(control|comparator)/.test(t) ? 1 : 0,
    multicenter: /(multi[\s-]*cent)/.test(t) ? 1 : 0,
    adaptive: /adaptive/.test(t) ? 1 : 0,
    biomarker_selection: /(biomarker|enrichment)/.test(t) ? 1 : 0,
  };
}

// ─── Published cold-start prior (regulatory_approval target) ─────────────────

/**
 * Hay et al. 2014, the most widely cited phase-transition benchmark. The four
 * transition probabilities are reported for "all indications / all drugs"; their
 * product is the headline 10.4% Phase 1 → approval likelihood, so deriving the
 * cumulative LOA from them in code (rather than hardcoding each cumulative value)
 * keeps the numbers internally consistent and auditable.
 *
 * Hay M, Thomas DW, Craighead JL, Economides C, Rosenthal J. "Clinical
 * development success rates for investigational drugs." Nat Biotechnol.
 * 2014;32(1):40–51. (Cross-checked against Wong, Siah & Lo 2019, Biostatistics
 * 20(2):273–286, overall PoS ≈ 13.8% for 2000–2015.)
 */
export const HAY_2014 = {
  citation:
    'Hay et al. 2014, Nat Biotechnol 32(1):40-51 — clinical development success rates (all indications).',
  transitions: {
    phase1to2: 0.645,
    phase2to3: 0.324,
    phase3toReg: 0.601,
    regToApproval: 0.832,
  },
} as const;

export interface ApprovalPrior {
  probability: number;
  source: string;
  derivation: string;
}

/**
 * Cumulative probability that a program *at the start of* `phase` is eventually
 * approved, derived from {@link HAY_2014}. Phase 4 is post-approval, so its
 * "regulatory success" is already realized and a development-risk prior does not
 * apply — returns null with that explanation.
 */
export function approvalPrior(phase: 1 | 2 | 3 | 4 | null): ApprovalPrior | null {
  const { phase1to2, phase2to3, phase3toReg, regToApproval } = HAY_2014.transitions;
  switch (phase) {
    case 1:
      return {
        probability: phase1to2 * phase2to3 * phase3toReg * regToApproval,
        source: HAY_2014.citation,
        derivation: 'phase1to2 × phase2to3 × phase3toReg × regToApproval',
      };
    case 2:
      return {
        probability: phase2to3 * phase3toReg * regToApproval,
        source: HAY_2014.citation,
        derivation: 'phase2to3 × phase3toReg × regToApproval',
      };
    case 3:
      return {
        probability: phase3toReg * regToApproval,
        source: HAY_2014.citation,
        derivation: 'phase3toReg × regToApproval',
      };
    case 4:
    case null:
      return null;
  }
}

// ─── Trained model shape ─────────────────────────────────────────────────────

export interface PtrsModelWeights {
  readonly target: PtrsTarget;
  readonly featureNames: readonly string[];
  readonly weights: { readonly [feature: string]: number; readonly intercept: number };
  readonly sampleSize: number;
  readonly positiveRate: number;
  readonly logLoss: number | null;
  readonly auc: number | null;
  readonly brier: number | null;
  readonly trainedAt: string;
  readonly modelVersion: string;
}

export interface PtrsTrainResult {
  readonly target: PtrsTarget;
  readonly trained: boolean;
  readonly reason?: string;
  readonly model: PtrsModelWeights | null;
  readonly sampleSize: number;
  readonly logLoss: number | null;
  readonly auc: number | null;
  readonly brier: number | null;
}

/**
 * Train a PTRS logistic model on labelled trials. Pure: no IO. Returns the model
 * with holdout AUC/Brier, or `trained: false` with a reason when there are too
 * few labelled samples to trust over the prior. The feature set is fixed
 * ({@link PTRS_FEATURE_NAMES}) so trained and served vectors always align.
 */
export function trainPtrs(
  samples: ReadonlyArray<{ design: TrialDesign; label: boolean }>,
  opts: { target: PtrsTarget; l2?: number; learningRate?: number; maxEpochs?: number } = {
    target: 'registry_completion',
  },
): PtrsTrainResult {
  const target = opts.target;
  if (samples.length < MIN_TRAIN_SAMPLES) {
    return {
      target,
      trained: false,
      reason: `insufficient_samples (${samples.length} < ${MIN_TRAIN_SAMPLES})`,
      model: null,
      sampleSize: samples.length,
      logLoss: null,
      auc: null,
      brier: null,
    };
  }

  const featureSamples = samples.map(s => ({ features: extractFeatures(s.design), label: s.label }));
  const fit = trainLogistic(featureSamples, PTRS_FEATURE_NAMES, {
    l2: opts.l2,
    learningRate: opts.learningRate,
    maxEpochs: opts.maxEpochs,
  });

  const model: PtrsModelWeights = {
    target,
    featureNames: PTRS_FEATURE_NAMES,
    weights: fit.weights,
    sampleSize: fit.sampleSize,
    positiveRate: fit.positiveRate,
    logLoss: fit.logLoss,
    auc: fit.auc,
    brier: fit.brier,
    trainedAt: new Date().toISOString(),
    modelVersion: PTRS_MODEL_VERSION,
  };

  return {
    target,
    trained: true,
    model,
    sampleSize: fit.sampleSize,
    logLoss: fit.logLoss,
    auc: fit.auc,
    brier: fit.brier,
  };
}

// ─── Serving ─────────────────────────────────────────────────────────────────

/** A prior plus the local labelled evidence it summarizes, for honest intervals. */
export interface PtrsPrior {
  /** The prior point probability (literature LOA, or pooled corpus rate). */
  probability: number;
  /** Human-readable provenance of the prior. */
  source: string;
  /** Local labelled trials behind this prior (the denominator for the interval). */
  localKnownN: number;
  /** Local successes among `localKnownN` (the numerator for the interval). */
  localSuccesses: number;
}

export interface PtrsFactor {
  feature: string;
  /** The learned coefficient (log-odds per unit). */
  weight: number;
  /** The feature value for this design. */
  value: number;
  /** weight × value — this feature's signed contribution to the log-odds. */
  contribution: number;
  direction: 'positive' | 'negative';
}

export interface PtrsPrediction {
  target: PtrsTarget;
  phase: 1 | 2 | 3 | 4 | null;
  /** The label this probability refers to — stated so it is never misread. */
  labelSemantics: string;
  /** Probability in [0,1], or null when not assessable. */
  probability: number | null;
  source: 'trained_model' | 'blended' | 'network_prior' | 'not_assessable';
  /** Local labelled trials standing behind the estimate. */
  sampleSize: number;
  /** Wilson 95% evidence interval, or null when there is no local evidence. */
  interval: [number, number] | null;
  priorProbability: number | null;
  priorSource: string | null;
  /** Weight given to the trained model in a blend (0 = pure prior, 1 = pure model). */
  localWeight: number;
  /** Top contributing features (trained path only), largest |contribution| first. */
  contributingFactors: PtrsFactor[];
  provenance: StatsProvenance;
  note: string;
}

const LABEL_SEMANTICS: Record<PtrsTarget, string> = {
  registry_completion:
    'Probability the trial reaches registry completion (vs. termination/withdrawal). Reflects operational completion, not regulatory approval.',
  regulatory_approval:
    'Probability a program at the start of this phase is eventually approved (technical and regulatory success).',
};

function topFactors(design: TrialDesign, model: PtrsModelWeights, limit = 6): PtrsFactor[] {
  const features = extractFeatures(design);
  return model.featureNames
    .map(name => {
      const weight = (model.weights as Record<string, number>)[name] ?? 0;
      const value = Number.isFinite(features[name]) ? (features[name] as number) : 0;
      const contribution = weight * value;
      return {
        feature: name,
        weight,
        value,
        contribution,
        direction: (contribution >= 0 ? 'positive' : 'negative') as 'positive' | 'negative',
      };
    })
    .filter(f => Math.abs(f.contribution) > 1e-9)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, limit);
}

/** Wilson evidence interval from a probability and the labelled N behind it. */
function evidenceInterval(probability: number, knownN: number): [number, number] | null {
  if (knownN <= 0) return null;
  const successes = Math.round(probability * knownN);
  return wilsonInterval(successes, knownN);
}

/**
 * Score a design. Blending rule mirrors risk-model: the trained model earns full
 * weight only once it has seen ~4× {@link MIN_TRAIN_SAMPLES} labelled trials;
 * below that the prior anchors the estimate. With no model and no prior the
 * result is honestly `not_assessable`.
 */
export function predictPtrs(args: {
  target: PtrsTarget;
  design: TrialDesign;
  model: PtrsModelWeights | null;
  prior: PtrsPrior | null;
}): PtrsPrediction {
  const { target, design, model, prior } = args;
  const phase = normalizePhase(design.phase);
  const labelSemantics = LABEL_SEMANTICS[target];
  const provenance = buildProvenance({
    method: `ptrs:${target}`,
    methodVersion: PTRS_MODEL_VERSION,
    seed: 0, // serving is deterministic; no stochastic component
    inputs: { target, design, modelTrainedAt: model?.trainedAt ?? null },
    note: 'PTRS serving is deterministic given the model weights and design.',
  });

  const priorProbability = prior?.probability ?? null;
  const priorSource = prior?.source ?? null;
  const localKnownN = prior?.localKnownN ?? 0;

  // No trained model: serve the prior, or declare not-assessable.
  if (!model) {
    if (prior === null) {
      return {
        target,
        phase,
        labelSemantics,
        probability: null,
        source: 'not_assessable',
        sampleSize: 0,
        interval: null,
        priorProbability: null,
        priorSource: null,
        localWeight: 0,
        contributingFactors: [],
        provenance,
        note: 'No trained model and no prior available for this target — not assessable. Ingest a labelled corpus to train, or supply a prior.',
      };
    }
    return {
      target,
      phase,
      labelSemantics,
      probability: prior.probability,
      source: 'network_prior',
      sampleSize: localKnownN,
      interval: evidenceInterval(prior.probability, localKnownN),
      priorProbability,
      priorSource,
      localWeight: 0,
      contributingFactors: [],
      provenance,
      note: `Cold-start: serving the prior (${priorSource}). No model trained yet for this target; the estimate sharpens once labelled trials are ingested.`,
    };
  }

  const localProb = sigmoid(dot(extractFeatures(design), model.weights as never, model.featureNames));
  const factors = topFactors(design, model);

  if (prior === null) {
    return {
      target,
      phase,
      labelSemantics,
      probability: localProb,
      source: 'trained_model',
      sampleSize: model.sampleSize,
      interval: evidenceInterval(localProb, model.sampleSize),
      priorProbability: null,
      priorSource: null,
      localWeight: 1,
      contributingFactors: factors,
      provenance,
      note: `Trained model (n=${model.sampleSize}${model.auc != null ? `, holdout AUC=${model.auc.toFixed(3)}` : ''}).`,
    };
  }

  const localWeight = Math.min(1, model.sampleSize / Math.max(1, MIN_TRAIN_SAMPLES * 4));
  const blended = localWeight * localProb + (1 - localWeight) * prior.probability;
  const blendN = Math.max(model.sampleSize, localKnownN);
  return {
    target,
    phase,
    labelSemantics,
    probability: blended,
    source: 'blended',
    sampleSize: model.sampleSize,
    interval: evidenceInterval(blended, blendN),
    priorProbability,
    priorSource,
    localWeight,
    contributingFactors: factors,
    provenance,
    note: `Blended: trained model weighted ${(localWeight * 100).toFixed(0)}% (n=${model.sampleSize}), prior ${((1 - localWeight) * 100).toFixed(0)}% (${priorSource}).`,
  };
}
