/**
 * Regulatory Intelligence (RI) orchestrator — AnA 1.0 RI.
 *
 * Public surface for the predictive layer. Composes:
 *   - validate-completeness rule-based RTF score (existing)
 *   - logistic-regression CRL/RTF risk model (new — `risk-model.ts`)
 *   - cross-tenant DP-anonymized priors (new — `network-risk-aggregator.ts`)
 *   - outcome → precedent ingestion (new — `outcome-precedent-ingestor.ts`)
 *
 * The orchestrator is the only module routes should call. It hides which
 * version of the model is live, which features the model needs, and how the
 * model + network prior are blended into a single score.
 *
 * Every public call writes a `risk_predictions` row so calibration can be
 * measured retrospectively when the corresponding outcome eventually lands.
 *
 * @module server/services/intelligence/regulatory-intelligence
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';
import {
  validateCompletenessEngine,
  type ValidateInput,
  type ValidateCompletenessResult,
} from '../validate-completeness-engine.js';
import {
  featuresForDraft,
  buildFeatures,
  binCompleteness,
  extractPendingOutcomeVectors,
  type FeatureContext,
  type CompletenessBin,
} from './outcome-feature-extraction.js';
import {
  predict as predictRisk,
  trainModel,
  getActiveModel,
  type RiskTarget,
  type RiskPrediction,
} from './risk-model.js';
import {
  lookupNetworkPrior,
  rebuildNetworkPriors,
} from './network-risk-aggregator.js';
import {
  ingestOutcomeAsPrecedent,
  type EmbedFn,
} from './outcome-precedent-ingestor.js';

const log = createScopedLogger('regulatory-intelligence');

export const REGULATORY_INTELLIGENCE_VERSION = '1.0.0';

// ─── Score-time API ──────────────────────────────────────────────────────────

export interface ScoreDraftInput {
  readonly organizationId: number;
  readonly projectId?: number;
  readonly submissionId?: string;
  readonly submissionType: string;
  readonly targetAgency?: string;
  readonly therapeuticArea?: string | null;
  /** Sections present in the submission draft (section IDs or CTD module paths). */
  readonly presentSections: string[];
  readonly sectionScores?: Record<string, number>;
  readonly harmonizeIssueCount?: number;
  readonly openEscalations?: number;
}

export interface RiskTargetScore {
  readonly target: RiskTarget;
  readonly probability: number;          // 0..1
  readonly score: number;                // 100 - probability*100, surfaced to UI
  readonly band: 'low' | 'medium' | 'high' | 'critical';
  readonly source: RiskPrediction['source'];
  readonly modelVersionId: string | null;
  readonly localWeight: number;
  readonly priorWeight: number;
  readonly priorProbability: number | null;
  readonly sampleSize: number;
}

export interface ScoreDraftResult {
  readonly engineVersion: string;
  readonly completeness: ValidateCompletenessResult;
  readonly rtf: RiskTargetScore;
  readonly crl: RiskTargetScore;
  readonly firstCycleApproval: RiskTargetScore;
  /** Blended 0..100 readiness score — combines rule-based + predictive RTF. */
  readonly blendedReadiness: number;
  readonly recommendations: string[];
}

function probabilityToBand(p: number): RiskTargetScore['band'] {
  if (p >= 0.6) return 'critical';
  if (p >= 0.35) return 'high';
  if (p >= 0.15) return 'medium';
  return 'low';
}

function buildRecommendations(
  completeness: ValidateCompletenessResult,
  rtf: RiskTargetScore,
  crl: RiskTargetScore,
): string[] {
  const out: string[] = [];
  if (rtf.band === 'critical' || crl.band === 'critical') {
    out.push('Do not file: predicted CRL/RTF risk is critical. Address blocking deficiencies before submission.');
  } else if (rtf.band === 'high') {
    out.push('High RTF risk: resolve all missing critical sections and request internal regulatory review before filing.');
  }
  for (const blocker of completeness.rtfRisk.missingCritical.slice(0, 3)) {
    out.push(`Critical gap: ${blocker}`);
  }
  if (rtf.source === 'cold_start' || crl.source === 'cold_start') {
    out.push('Predictive risk is operating from rule-based signals only — no comparable outcomes in network yet.');
  }
  if (rtf.source === 'network_prior' || crl.source === 'network_prior') {
    out.push('Predictive risk is using cross-platform priors. Site-specific model will activate once your portfolio has more outcomes.');
  }
  return out;
}

async function scoreOneTarget(params: {
  target: RiskTarget;
  features: ReturnType<typeof featuresForDraft>;
  submissionType: string;
  agency: string;
  therapeuticArea: string | null;
  completenessBin: CompletenessBin | null;
}): Promise<RiskTargetScore> {
  const prior = await lookupNetworkPrior({
    target: params.target,
    submissionType: params.submissionType,
    agency: params.agency,
    therapeuticArea: params.therapeuticArea,
    completenessBin: params.completenessBin,
  });
  const prediction = await predictRisk({
    target: params.target,
    features: params.features,
    networkPrior: prior.probability,
  });

  return {
    target: params.target,
    probability: prediction.probability,
    score: Math.round((1 - prediction.probability) * 100),
    band: probabilityToBand(prediction.probability),
    source: prediction.source,
    modelVersionId: prediction.modelVersionId,
    localWeight: prediction.localWeight,
    priorWeight: prediction.priorWeight,
    priorProbability: prediction.priorProbability,
    sampleSize: prediction.sampleSize,
  };
}

/**
 * The single call routes use to score a draft. Returns rule-based completeness
 * + predictive CRL/RTF/first-cycle probabilities + a blended readiness score.
 */
export async function scoreSubmissionDraft(input: ScoreDraftInput): Promise<ScoreDraftResult> {
  // Step 1: rule-based completeness check.
  const validateInput: ValidateInput = {
    submissionType: input.submissionType,
    presentSections: input.presentSections,
    sectionScores: input.sectionScores,
    harmonizeIssueCount: input.harmonizeIssueCount,
    openEscalations: input.openEscalations,
    targetAgency: input.targetAgency,
  };
  const completeness = await validateCompletenessEngine.validate(validateInput);

  // Step 2: assemble feature context from completeness output.
  const featureCtx: Omit<FeatureContext,
    'reviewDays' | 'questionsReceived' | 'informationRequests' | 'deficienciesCited' | 'hadAdvisoryCommittee'
  > = {
    submissionType: input.submissionType,
    agency: input.targetAgency ?? 'FDA',
    therapeuticArea: input.therapeuticArea ?? null,
    readinessPercentage: completeness.summary.readinessPercentage,
    missingCriticalCount: completeness.rtfRisk.missingCritical.length,
    missingImportantCount: completeness.rtfRisk.missingImportant.length,
    weakSectionCount: completeness.rtfRisk.weakSections.length,
    harmonizeIssueCount: input.harmonizeIssueCount ?? 0,
    openEscalations: input.openEscalations ?? 0,
  };
  const features = featuresForDraft(featureCtx);
  const completenessBin = binCompleteness(completeness.summary.readinessPercentage);

  // Step 3: predict each target in parallel.
  const [rtf, crl, firstCycle] = await Promise.all([
    scoreOneTarget({
      target: 'rtf',
      features,
      submissionType: input.submissionType,
      agency: input.targetAgency ?? 'FDA',
      therapeuticArea: input.therapeuticArea ?? null,
      completenessBin,
    }),
    scoreOneTarget({
      target: 'crl',
      features,
      submissionType: input.submissionType,
      agency: input.targetAgency ?? 'FDA',
      therapeuticArea: input.therapeuticArea ?? null,
      completenessBin,
    }),
    scoreOneTarget({
      target: 'first_cycle_approval',
      features,
      submissionType: input.submissionType,
      agency: input.targetAgency ?? 'FDA',
      therapeuticArea: input.therapeuticArea ?? null,
      completenessBin,
    }),
  ]);

  // Step 4: blend the rule-based and predictive RTF scores. When the model has
  // not converged, lean on the rule-based score; once it's trained, weigh the
  // model more.
  const ruleScore = completeness.rtfRisk.rtfScore;
  const blendedReadiness = Math.round(
    (1 - rtf.localWeight) * ruleScore + rtf.localWeight * rtf.score,
  );

  // Step 5: persist the prediction for downstream calibration.
  try {
    await pool.query(
      `INSERT INTO intelligence.risk_predictions (
         organization_id, project_id, submission_id, model_version_id,
         target, features, predicted_prob, network_prior_prob, blend_weight,
         rule_based_score, blended_score
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.organizationId,
        input.projectId ?? null,
        input.submissionId ?? null,
        rtf.modelVersionId,
        'rtf',
        JSON.stringify(features),
        rtf.probability,
        rtf.priorProbability,
        rtf.localWeight,
        ruleScore,
        blendedReadiness,
      ],
    );
  } catch (err) {
    log.warn('Failed to persist risk prediction:', err instanceof Error ? err.message : err);
  }

  return {
    engineVersion: REGULATORY_INTELLIGENCE_VERSION,
    completeness,
    rtf,
    crl,
    firstCycleApproval: firstCycle,
    blendedReadiness,
    recommendations: buildRecommendations(completeness, rtf, crl),
  };
}

// ─── Outcome ingestion (closes the loop) ─────────────────────────────────────

export interface RecordOutcomeOptions {
  readonly embedFn?: EmbedFn;
  /** When true, retrain all targets and rebuild network priors immediately. Default true. */
  readonly retrain?: boolean;
}

export interface RecordOutcomeResult {
  readonly featuresExtracted: number;
  readonly precedentsIngested: number;
  readonly precedentErrors: number;
  readonly retrained: {
    readonly rtf: boolean;
    readonly crl: boolean;
    readonly firstCycleApproval: boolean;
  };
  readonly networkPriorsRebuilt: { published: number; suppressed: number } | null;
}

/**
 * Triggered after a new submission_outcome row lands. Idempotent — re-running
 * over the same outcomes is safe (feature extraction and precedent linkage
 * both gate on existence).
 *
 * The retrain step is gated by sample size inside trainModel; tiny corpora
 * just return `trained: false` without writing a new version.
 */
export async function onOutcomeRecorded(opts: RecordOutcomeOptions = {}): Promise<RecordOutcomeResult> {
  const featuresExtracted = await extractPendingOutcomeVectors({ limit: 500 });
  const ingest = await ingestOutcomeAsPrecedent({ limit: 200, embedFn: opts.embedFn });

  const shouldRetrain = opts.retrain ?? true;
  const retrained = { rtf: false, crl: false, firstCycleApproval: false };
  let priorsResult: { published: number; suppressed: number } | null = null;

  if (shouldRetrain) {
    const [r1, r2, r3] = await Promise.all([
      trainModel({ target: 'rtf', markActive: true }),
      trainModel({ target: 'crl', markActive: true }),
      trainModel({ target: 'first_cycle_approval', markActive: true }),
    ]);
    retrained.rtf = r1.trained;
    retrained.crl = r2.trained;
    retrained.firstCycleApproval = r3.trained;
    try {
      const result = await rebuildNetworkPriors();
      priorsResult = { published: result.published, suppressed: result.suppressed };
    } catch (err) {
      log.warn('Network prior rebuild failed:', err instanceof Error ? err.message : err);
    }
  }

  return {
    featuresExtracted,
    precedentsIngested: ingest.ingested,
    precedentErrors: ingest.errors,
    retrained,
    networkPriorsRebuilt: priorsResult,
  };
}

// ─── Read-only inspection ────────────────────────────────────────────────────

export interface ModelInfo {
  readonly target: RiskTarget;
  readonly active: boolean;
  readonly versionId: string | null;
  readonly sampleSize: number;
  readonly logLoss: number | null;
  readonly auc: number | null;
  readonly brier: number | null;
  readonly positiveRate: number | null;
  readonly trainedAt: string | null;
}

export async function getModelInfo(): Promise<ModelInfo[]> {
  const targets: RiskTarget[] = ['rtf', 'crl', 'first_cycle_approval'];
  const out: ModelInfo[] = [];
  for (const target of targets) {
    const model = await getActiveModel(target);
    if (!model) {
      out.push({ target, active: false, versionId: null, sampleSize: 0, logLoss: null, auc: null, brier: null, positiveRate: null, trainedAt: null });
    } else {
      out.push({
        target,
        active: true,
        versionId: model.versionId,
        sampleSize: model.sampleSize,
        logLoss: model.logLoss,
        auc: model.auc,
        brier: model.brier,
        positiveRate: model.positiveRate,
        trainedAt: model.trainedAt,
      });
    }
  }
  return out;
}

// Re-exports for routes / tests.
export {
  trainModel,
  rebuildNetworkPriors,
  lookupNetworkPrior,
  extractPendingOutcomeVectors,
  ingestOutcomeAsPrecedent,
};
