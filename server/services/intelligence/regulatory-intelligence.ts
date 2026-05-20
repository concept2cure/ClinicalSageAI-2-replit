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

// Default embedding function — lazily imports the unified AI client so we
// don't take a hard dependency on the LLM stack at module load. Returns
// `null` when the embedding call fails so the ingestor still records the
// precedent (just without a vector). Keep dim-1536 to match the existing
// `precedent.regulatory_precedents.embedding vector(1536)` column.
const defaultEmbedFn: EmbedFn = async (text: string) => {
  try {
    const { ai } = await import('../../lib/unified-ai-client.js');
    const result = await ai.embeddings({ input: text, dimensions: 1536 });
    if (!Array.isArray(result.embedding) || result.embedding.length === 0) return null;
    return result.embedding;
  } catch (err) {
    log.warn('Default embed failed:', err instanceof Error ? err.message : err);
    return null;
  }
};

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
  const ingest = await ingestOutcomeAsPrecedent({
    limit: 200,
    embedFn: opts.embedFn ?? defaultEmbedFn,
  });

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

// ─── Composite readiness (single-call enrichment of scoreSubmissionDraft) ────
//
// This is a thin enrichment on top of `scoreSubmissionDraft` — it adds the
// three signals the UI also needs to render a "ready to file?" verdict:
//   • latest template conformance (from `template_validations`)
//   • active proactive warnings count + severity bucket (existing
//     `getActiveWarnings`, no new infra)
//   • signal reliability (existing `getCachedSignalReliability`, no new infra)
//
// Deliberately NOT a new orchestrator service. We already have the
// orchestrator (`scoreSubmissionDraft`); this just attaches what's missing.

export interface ReadinessSummary {
  readonly engineVersion: string;
  /** 0..100 composite score, null when nothing contributed. */
  readonly compositeScore: number | null;
  readonly band: 'critical' | 'high_risk' | 'caution' | 'ready';
  readonly riskScores: ScoreDraftResult;
  readonly templateConformance: number | null;
  readonly templateName: string | null;
  readonly activeWarnings: number;
  readonly highSeverityWarnings: number;
  readonly signalReliability: number | null;
  readonly recommendations: readonly string[];
}

function bandFromScore(score: number | null): ReadinessSummary['band'] {
  if (score === null) return 'caution';
  if (score < 35) return 'critical';
  if (score < 60) return 'high_risk';
  if (score < 80) return 'caution';
  return 'ready';
}

export async function computeReadiness(input: ScoreDraftInput & { artifactId?: string }): Promise<ReadinessSummary> {
  // Delegate to the existing orchestrator for completeness + risk scoring.
  const riskScores = await scoreSubmissionDraft(input);

  // Pull the three missing pieces from existing services (no new tables, no
  // new aggregation paths). All three return null/0 gracefully when there's
  // no data.
  const [warnings, reliability, templateLatest] = await Promise.all([
    (async () => {
      const { getActiveWarnings } = await import('./counterfactual-replay.js');
      return getActiveWarnings({
        organizationId: input.organizationId,
        projectId: input.projectId,
        artifactId: input.artifactId,
      });
    })(),
    input.projectId
      ? (async () => {
          const { getCachedSignalReliability } = await import('./learning-loop-service.js');
          return getCachedSignalReliability(input.projectId!, input.organizationId);
        })()
      : Promise.resolve(null),
    pool.query<{ conformance_score: string; template_name: string }>(
      `SELECT tv.conformance_score, dt.template_name
         FROM intelligence.template_validations tv
         JOIN intelligence.document_templates dt ON dt.id = tv.template_id
        WHERE tv.organization_id = $1
          AND ($2::bigint IS NULL OR tv.project_id = $2)
          AND ($3::text IS NULL OR tv.artifact_id = $3)
        ORDER BY tv.validated_at DESC
        LIMIT 1`,
      [input.organizationId, input.projectId ?? null, input.artifactId ?? null],
    ),
  ]);

  const highSeverityWarnings = warnings.filter(w => w.severity === 'high').length;
  const mediumSeverityWarnings = warnings.filter(w => w.severity === 'medium').length;

  const templateConformance =
    templateLatest.rows.length > 0
      ? Math.round(parseFloat(templateLatest.rows[0].conformance_score) * 100)
      : null;
  const templateName = templateLatest.rows.length > 0 ? templateLatest.rows[0].template_name : null;
  const reliabilityScore =
    reliability && reliability.reliabilityIndex !== null
      ? Math.round(reliability.reliabilityIndex * 100)
      : null;
  const warningsScore = warnings.length === 0
    ? 100
    : Math.max(0, 100 - (highSeverityWarnings * 25 + mediumSeverityWarnings * 10 + (warnings.length - highSeverityWarnings - mediumSeverityWarnings) * 4));

  // Weighted composite over the components that returned data. Weights tuned
  // by regulatory consequence — RTF and CRL probability matter most.
  const components: Array<{ score: number | null; weight: number }> = [
    { score: riskScores.rtf.source === 'cold_start' ? null : riskScores.rtf.score, weight: 0.30 },
    { score: riskScores.crl.source === 'cold_start' ? null : riskScores.crl.score, weight: 0.20 },
    { score: templateConformance, weight: 0.25 },
    { score: warningsScore, weight: 0.15 },
    { score: reliabilityScore, weight: 0.10 },
  ];
  const available = components.filter(c => c.score !== null);
  const compositeScore = available.length > 0
    ? Math.round(
        available.reduce((sum, c) => sum + (c.score as number) * c.weight, 0)
          / available.reduce((sum, c) => sum + c.weight, 0),
      )
    : null;
  const band = bandFromScore(compositeScore);

  const recommendations: string[] = [];
  if (band === 'critical') recommendations.push('Do not file. Composite readiness is critical — resolve every blocking finding before submission.');
  else if (band === 'high_risk') recommendations.push('High risk: request internal regulatory review before filing.');
  if (templateConformance !== null && templateConformance < 70) recommendations.push(`Template conformance is ${templateConformance}%. Check missing sections.`);
  if (highSeverityWarnings > 0) recommendations.push(`${highSeverityWarnings} high-severity proactive warning(s) match this draft.`);
  for (const r of riskScores.recommendations.slice(0, 3)) recommendations.push(r);

  return {
    engineVersion: REGULATORY_INTELLIGENCE_VERSION,
    compositeScore,
    band,
    riskScores,
    templateConformance,
    templateName,
    activeWarnings: warnings.length,
    highSeverityWarnings,
    signalReliability: reliabilityScore,
    recommendations,
  };
}

// Re-exports for routes / tests.
export {
  trainModel,
  rebuildNetworkPriors,
  lookupNetworkPrior,
  extractPendingOutcomeVectors,
  ingestOutcomeAsPrecedent,
};
