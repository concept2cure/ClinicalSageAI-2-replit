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
 * Every call that produces an RTF probability writes a `risk_predictions` row
 * so calibration can be measured retrospectively when the corresponding
 * outcome eventually lands. A target nothing estimated is null, not persisted.
 *
 * @module server/services/intelligence/regulatory-intelligence
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';
import {
  validateCompletenessEngine,
  isCompletenessAssessed,
  type ValidateInput,
  type AssessedCompletenessResult,
  type NotAssessedCompletenessResult,
} from '../validate-completeness-engine.js';
import {
  featuresForDraft,
  binCompleteness,
  extractPendingOutcomeVectors,
  type FeatureContext,
} from './outcome-feature-extraction.js';
import { assertInferenceFeaturesClean } from './prediction-governance.js';
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
  type PriorLookup,
} from './network-risk-aggregator.js';
import {
  ingestOutcomeAsPrecedent,
  type EmbedFn,
} from './outcome-precedent-ingestor.js';
import type { ActiveWarning } from './counterfactual-replay.js';

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

/*
 * 1.1.0 (2026-10-05, g-validate-completeness-canonical): the completeness
 * features changed meaning. See COMPLETENESS_FEATURE_DRIFT.
 */
export const REGULATORY_INTELLIGENCE_VERSION = '1.1.0';

/**
 * Model-version note for the completeness features (DECISIONS.md #13, the
 * recommendation applied). Predictions and trained weights from before 1.1.0
 * were built on features that no longer mean the same thing:
 *   - `missing_critical` counted only missing sections whose module string
 *     compared <= '3'; it now counts every missing required section of the
 *     canonical profile (`ectd/required-sections`), Modules 4 and 5 included.
 *   - `missing_important` counted missing Modules 4-5 (and every device and
 *     IVDR item); it is now always 0, because every missing required section
 *     is critical.
 *   - `completeness_pct` was computed over a hand table with substring
 *     presence ('3.2.S.1.1' satisfied '1.1'); it is now over the canonical
 *     profile with exact-or-descendant presence.
 *   - Types with no profile (510(k), De Novo, PMA, IVDR, ANDA, 505(b)(2), CTA,
 *     a non-home region) are no longer scored at all; before, they were scored
 *     on invented or borrowed checklists.
 * A model trained on pre-1.1.0 vectors should be retrained before its
 * coefficients are trusted on these features.
 */
export const COMPLETENESS_FEATURE_DRIFT =
  'regulatory-intelligence@1.1.0: completeness features re-based on ectd/required-sections ' +
  '(missing_critical = every missing required section; missing_important = 0; completeness_pct over the ' +
  'canonical profile with exact-or-descendant presence); unprofiled types are refused, not scored. ' +
  'Weights trained on earlier vectors are not comparable.';

/**
 * scoreSubmissionDraft refuses a draft whose completeness was not assessed.
 *
 * A prediction built on a checklist that does not exist is a number with no
 * basis; before 1.1.0 such a type was scored on an invented table, and an
 * empty checklist would have divided 0 by 0. The error carries the engine's
 * not-assessed result (with the engine that does assess the type, when one
 * exists), and a 422 status so an error handler answers it as the caller's
 * request, not as a server fault.
 */
export class CompletenessNotAssessedError extends Error {
  readonly code = 'COMPLETENESS_NOT_ASSESSED';
  readonly statusCode = 422;
  readonly status = 422;
  constructor(readonly completeness: NotAssessedCompletenessResult) {
    super(`Predictive RTF/CRL scoring refused: ${completeness.assessment.reason}`);
    this.name = 'CompletenessNotAssessedError';
  }
}

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

type RiskBand = 'low' | 'medium' | 'high' | 'critical';

/** How a target's probability was produced: source, model version, blend weights, prior, sample size. */
type TargetPredictionBasis = Omit<RiskPrediction, 'target' | 'probability'>;

/**
 * RTF or CRL: the probability is the chance of the adverse event. probability,
 * score and band are null when the target was not assessed (source
 * 'cold_start': no trained model and no network prior) — until 2026-10-15 that
 * case read 0.5, score 50, band "high".
 */
export interface RiskTargetScore extends TargetPredictionBasis {
  readonly target: 'rtf' | 'crl';
  readonly probability: number | null;   // 0..1
  readonly score: number | null;         // 100 - probability*100, surfaced to UI
  readonly band: RiskBand | null;
}

/**
 * First-cycle approval: the probability is a chance of success, so it has no
 * risk score or band. 2026-10-15: it went through the risk mapping, so a 10%
 * chance of approval read score 90, band "low". Its own mapping is
 * nonApprovalBand, the band of 1 - p (the chance of not being approved in the
 * first cycle) on the risk targets' thresholds. Both null when not assessed.
 */
export interface ApprovalTargetScore extends TargetPredictionBasis {
  readonly target: 'first_cycle_approval';
  readonly probability: number | null;   // 0..1
  readonly nonApprovalBand: RiskBand | null;
}

export interface ScoreDraftResult {
  readonly engineVersion: string;
  /** Always an assessed result: a not-assessed type is refused (CompletenessNotAssessedError). */
  readonly completeness: AssessedCompletenessResult;
  readonly rtf: RiskTargetScore;
  readonly crl: RiskTargetScore;
  readonly firstCycleApproval: ApprovalTargetScore;
  /**
   * 0..100, higher = fewer refuse-to-file deductions: the rule-based RTF score
   * (completeness.rtfRisk.rtfScore), blended with the predicted RTF score by the
   * trained model's local weight; the rule-based score itself when no trained
   * model contributes. 2026-10-15: was `blendedReadiness` — it is not readiness.
   */
  readonly refuseToFileScore: number;
  readonly recommendations: string[];
}

function probabilityToBand(p: number): RiskBand {
  if (p >= 0.6) return 'critical';
  if (p >= 0.35) return 'high';
  if (p >= 0.15) return 'medium';
  return 'low';
}

function buildRecommendations(
  completeness: AssessedCompletenessResult,
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
  // Said "operating from rule-based signals only" — as if the predicted risk
  // existed and came from the rules. It does not exist (2026-10-15).
  const notAssessed = [rtf, crl].filter(t => t.probability === null).map(t => t.target.toUpperCase());
  if (notAssessed.length > 0) {
    out.push(
      `Predicted ${notAssessed.join(' and ')} risk not assessed: no trained model and no comparable outcomes in the network yet. ` +
      'Only the rule-based completeness check was run.',
    );
  }
  if (rtf.source === 'network_prior' || crl.source === 'network_prior') {
    out.push('Predictive risk is using cross-platform priors. Site-specific model will activate once your portfolio has more outcomes.');
  }
  return out;
}

async function predictTarget(lookup: PriorLookup, features: ReturnType<typeof featuresForDraft>): Promise<RiskPrediction> {
  const prior = await lookupNetworkPrior(lookup);
  return predictRisk({ target: lookup.target, features, networkPrior: prior.probability });
}

function toRiskTargetScore(target: 'rtf' | 'crl', prediction: RiskPrediction): RiskTargetScore {
  const p = prediction.probability;
  return {
    ...prediction,
    target,
    score: p === null ? null : Math.round((1 - p) * 100),
    band: p === null ? null : probabilityToBand(p),
  };
}

function toApprovalTargetScore(prediction: RiskPrediction): ApprovalTargetScore {
  const p = prediction.probability;
  return {
    ...prediction,
    target: 'first_cycle_approval',
    nonApprovalBand: p === null ? null : probabilityToBand(1 - p),
  };
}

/**
 * The single call routes use to score a draft. Returns rule-based completeness
 * + predictive CRL/RTF/first-cycle probabilities + the refuse-to-file score.
 *
 * Throws CompletenessNotAssessedError (422) when the submission type has no
 * canonical required-section profile: nothing is predicted or persisted.
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
  const result = await validateCompletenessEngine.validate(validateInput);
  // Fail closed: no profile, no checklist, no prediction (DECISIONS.md #13).
  if (!isCompletenessAssessed(result)) throw new CompletenessNotAssessedError(result);
  const completeness = result;
  // The agency the completeness was judged for — the profile's home agency
  // when the caller named none (an MAA is EMA, not the old 'FDA' default).
  const agency = completeness.targetAgency;

  // Step 2: assemble feature context from completeness output.
  const featureCtx: Omit<FeatureContext,
    'reviewDays' | 'questionsReceived' | 'informationRequests' | 'deficienciesCited' | 'hadAdvisoryCommittee'
  > = {
    submissionType: input.submissionType,
    agency,
    therapeuticArea: input.therapeuticArea ?? null,
    readinessPercentage: completeness.summary.readinessPercentage,
    missingCriticalCount: completeness.rtfRisk.missingCritical.length,
    // Every missing required section is now critical (COMPLETENESS_FEATURE_DRIFT).
    missingImportantCount: 0,
    weakSectionCount: completeness.rtfRisk.weakSections.length,
    harmonizeIssueCount: input.harmonizeIssueCount ?? 0,
    openEscalations: input.openEscalations ?? 0,
  };
  const features = featuresForDraft(featureCtx);
  // Runtime prediction-governance guard at the serving boundary (Phase 7 / audit
  // P2). featureCtx carries ONLY completeness metrics, so this is defense-in-depth
  // against a future regression that lets a realized post-submission outcome or a
  // regulatory-evidence signal reach inference directly: fail closed (throw) rather
  // than ever serve a leaked score. The same invariant is enforced in CI; this makes
  // it hold at runtime too.
  assertInferenceFeaturesClean(features);
  const completenessBin = binCompleteness(completeness.summary.readinessPercentage);

  // Step 3: predict each target in parallel.
  const lookup = { submissionType: input.submissionType, agency, therapeuticArea: input.therapeuticArea ?? null, completenessBin };
  const [rtfPrediction, crlPrediction, firstCyclePrediction] = await Promise.all([
    predictTarget({ target: 'rtf', ...lookup }, features),
    predictTarget({ target: 'crl', ...lookup }, features),
    predictTarget({ target: 'first_cycle_approval', ...lookup }, features),
  ]);
  const rtf = toRiskTargetScore('rtf', rtfPrediction);
  const crl = toRiskTargetScore('crl', crlPrediction);
  const firstCycle = toApprovalTargetScore(firstCyclePrediction);

  // Step 4: blend the rule-based and predictive RTF scores. When the model has
  // not converged, lean on the rule-based score; once it's trained, weigh the
  // model more.
  const ruleScore = completeness.rtfRisk.rtfScore;
  const refuseToFileScore = rtf.score === null || rtf.localWeight === 0
    ? ruleScore
    : Math.round((1 - rtf.localWeight) * ruleScore + rtf.localWeight * rtf.score);

  // Step 5: persist the prediction for downstream calibration — only one that
  // was made. 2026-10-15: a cold start was written as predicted_prob 0.5, and
  // the deployed-model backtest read it back as a prediction.
  if (rtf.probability !== null) {
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
          refuseToFileScore,
        ],
      );
    } catch (err) {
      log.warn('Failed to persist risk prediction:', err instanceof Error ? err.message : err);
    }
  }

  return {
    engineVersion: REGULATORY_INTELLIGENCE_VERSION,
    completeness,
    rtf,
    crl,
    firstCycleApproval: firstCycle,
    refuseToFileScore,
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

const COMPONENT_LABEL = {
  completeness: 'required-section completeness',
  rtf_risk: 'predicted RTF risk',
  crl_risk: 'predicted CRL risk',
  template_conformance: 'template conformance',
  pattern_warnings: 'failure-pattern warnings',
  signal_reliability: 'signal reliability',
} as const;

/** What the composite can be computed from. */
type CompositeComponent = keyof typeof COMPONENT_LABEL;

/** Fewer assessed components than this and there is no composite. */
const MIN_COMPOSITE_COMPONENTS = 2;

export interface ReadinessSummary {
  readonly engineVersion: string;
  /** 0..100 over the assessed components; null when fewer than two were assessed. */
  readonly compositeScore: number | null;
  /** 'not_assessed' when compositeScore is null. Never 'ready' while a required section is missing. */
  readonly band: 'critical' | 'high_risk' | 'caution' | 'ready' | 'not_assessed';
  readonly riskScores: ScoreDraftResult;
  /** The components the composite was computed from, and those with no data. */
  readonly componentsAssessed: readonly CompositeComponent[];
  readonly componentsNotAssessed: readonly CompositeComponent[];
  /**
   * The draft's latest template validation's conformance (0..100), of the date
   * below. Null when not assessed: no validation on record, or neither a
   * project nor an artifact was given, so none can be tied to the draft.
   */
  readonly templateConformance: number | null;
  readonly templateName: string | null;
  /**
   * When that validation ran (ISO 8601). Null when no date is recorded: its age
   * is unknown, and it is not counted in the composite as current.
   */
  readonly templateValidatedAt: string | null;
  /** Open pattern warnings; null when no failure-pattern replay has reached the organization. */
  readonly activeWarnings: number | null;
  readonly highSeverityWarnings: number | null;
  readonly signalReliability: number | null;
  readonly recommendations: readonly string[];
}

function bandFromScore(score: number | null): ReadinessSummary['band'] {
  if (score === null) return 'not_assessed';
  if (score < 35) return 'critical';
  if (score < 60) return 'high_risk';
  if (score < 80) return 'caution';
  return 'ready';
}

/**
 * Has a failure-pattern replay ever written a warning for this organization?
 * A replay leaves no other trace, so without one an empty open-warning list
 * says nothing was looked for, not that nothing was found.
 */
async function patternReplayHasReachedOrg(organizationId: number): Promise<boolean> {
  const result = await pool.query<{ reached: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM intelligence.pattern_warnings WHERE organization_id = $1
     ) AS reached`,
    [organizationId],
  );
  return result.rows[0]?.reached === true;
}

/** A timestamp as ISO 8601; null when absent or not a date. */
function isoTimestampOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * 0..100 from the open warnings, 100 when none is open; null when not assessed.
 * 2026-10-15: an empty list scored 100 whether or not anything had been
 * checked, and it was often the only component: composite 100, band "ready",
 * for a draft missing most of its required sections.
 */
function warningsScoreOf(warnings: readonly ActiveWarning[], assessed: boolean): number | null {
  if (!assessed) return null;
  if (warnings.length === 0) return 100;
  const high = warnings.filter(w => w.severity === 'high').length;
  const medium = warnings.filter(w => w.severity === 'medium').length;
  return Math.max(0, 100 - (high * 25 + medium * 10 + (warnings.length - high - medium) * 4));
}

interface WeightedComponent {
  readonly name: CompositeComponent;
  readonly score: number | null;
  readonly weight: number;
}

interface Composite {
  readonly compositeScore: number | null;
  readonly assessed: CompositeComponent[];
  readonly notAssessed: CompositeComponent[];
}

/** The weighted mean over the assessed components; null below MIN_COMPOSITE_COMPONENTS. */
function compositeOf(components: readonly WeightedComponent[]): Composite {
  const available = components.filter(c => c.score !== null);
  const compositeScore = available.length >= MIN_COMPOSITE_COMPONENTS
    ? Math.round(
        available.reduce((sum, c) => sum + (c.score as number) * c.weight, 0)
          / available.reduce((sum, c) => sum + c.weight, 0),
      )
    : null;
  return {
    compositeScore,
    assessed: available.map(c => c.name),
    notAssessed: components.filter(c => c.score === null).map(c => c.name),
  };
}

/** The recommendation the band calls for, saying what was not assessed when there is no composite. */
function compositeVerdict(
  band: ReadinessSummary['band'],
  scoreBand: ReadinessSummary['band'],
  composite: Composite,
  missingCritical: number,
): string[] {
  const labels = (names: readonly CompositeComponent[]) => names.map(c => COMPONENT_LABEL[c]).join(', ');
  const out: string[] = [];
  if (band === 'not_assessed') {
    out.push(
      `Composite readiness not assessed: it needs at least ${MIN_COMPOSITE_COMPONENTS} assessed components, and only ` +
      `${labels(composite.assessed) || 'none'} had data. Not assessed: ${labels(composite.notAssessed)}.`,
    );
  } else if (band === 'critical') out.push('Do not file. Composite readiness is critical — resolve every blocking finding before submission.');
  else if (band === 'high_risk') out.push('High risk: request internal regulatory review before filing.');
  if (scoreBand === 'ready' && band !== 'ready') {
    out.push(`Not ready to file: ${missingCritical} required section(s) missing; each blocks filing.`);
  }
  return out;
}

export async function computeReadiness(input: ScoreDraftInput & { artifactId?: string }): Promise<ReadinessSummary> {
  // Delegate to the existing orchestrator for completeness + risk scoring.
  const riskScores = await scoreSubmissionDraft(input);

  // 2026-10-15: with neither a project nor an artifact the template read below
  // matched the organization's latest validation of ANY draft and reported it
  // as this draft's. With neither, nothing ties a validation to this draft.
  const templateTiedToDraft = input.projectId != null || input.artifactId != null;

  // Pull the missing pieces from existing services (no new tables, no new
  // aggregation paths). A piece with no data is null and stays out of the
  // composite.
  const [warnings, replayReachedOrg, reliability, templateLatest] = await Promise.all([
    (async () => {
      const { getActiveWarnings } = await import('./counterfactual-replay.js');
      return getActiveWarnings({
        organizationId: input.organizationId,
        projectId: input.projectId,
        artifactId: input.artifactId,
      });
    })(),
    patternReplayHasReachedOrg(input.organizationId),
    input.projectId
      ? (async () => {
          const { getCachedSignalReliability } = await import('./learning-loop-service.js');
          return getCachedSignalReliability(input.projectId!, input.organizationId);
        })()
      : Promise.resolve(null),
    templateTiedToDraft
      ? pool.query<{ conformance_score: string; template_name: string; validated_at: Date | string | null }>(
          `SELECT tv.conformance_score, dt.template_name, tv.validated_at
             FROM intelligence.template_validations tv
             JOIN intelligence.document_templates dt ON dt.id = tv.template_id
            WHERE tv.organization_id = $1
              AND ($2::bigint IS NULL OR tv.project_id = $2)
              AND ($3::text IS NULL OR tv.artifact_id = $3)
            ORDER BY tv.validated_at DESC NULLS LAST
            LIMIT 1`,
          [input.organizationId, input.projectId ?? null, input.artifactId ?? null],
        )
      : Promise.resolve(null),
  ]);

  // A warning exists only where a replay put one, so an empty open list is a
  // finding only once a replay has reached this organization.
  const warningsAssessed = warnings.length > 0 || replayReachedOrg;
  const highSeverityWarnings = warnings.filter(w => w.severity === 'high').length;

  const templateRows = templateLatest?.rows ?? [];
  const templateConformance =
    templateRows.length > 0
      ? Math.round(parseFloat(templateRows[0].conformance_score) * 100)
      : null;
  const templateName = templateRows.length > 0 ? templateRows[0].template_name : null;
  // 2026-10-15: the latest validation was reported undated, so one of any age
  // read as current. It is dated now; undated, its age is unknown and it stays
  // out of the composite.
  const templateValidatedAt = templateRows.length > 0 ? isoTimestampOrNull(templateRows[0].validated_at) : null;
  const reliabilityScore =
    reliability && reliability.reliabilityIndex !== null
      ? Math.round(reliability.reliabilityIndex * 100)
      : null;

  // Weighted composite over the components that were assessed; the weights are
  // relative and renormalised over those. Tuned by regulatory consequence —
  // RTF and CRL probability matter most. Required-section completeness, the
  // one component every call assesses, was left out until 2026-10-15; it is
  // weighted as the predicted RTF risk is.
  const composite = compositeOf([
    { name: 'completeness', score: riskScores.completeness.summary.readinessPercentage, weight: 0.30 },
    { name: 'rtf_risk', score: riskScores.rtf.score, weight: 0.30 },
    { name: 'crl_risk', score: riskScores.crl.score, weight: 0.20 },
    { name: 'template_conformance', score: templateValidatedAt === null ? null : templateConformance, weight: 0.25 },
    { name: 'pattern_warnings', score: warningsScoreOf(warnings, warningsAssessed), weight: 0.15 },
    { name: 'signal_reliability', score: reliabilityScore, weight: 0.10 },
  ]);
  // A missing required section blocks filing whatever the other components say.
  const missingCritical = riskScores.completeness.rtfRisk.missingCritical.length;
  const scoreBand = bandFromScore(composite.compositeScore);
  const band = scoreBand === 'ready' && missingCritical > 0 ? 'caution' : scoreBand;

  const recommendations = compositeVerdict(band, scoreBand, composite, missingCritical);
  if (!templateTiedToDraft) {
    recommendations.push('Template conformance not assessed: no project or artifact was given, so no template validation can be tied to this draft.');
  } else if (templateConformance !== null && templateValidatedAt === null) {
    recommendations.push(`Template conformance ${templateConformance}% is from a validation with no recorded date; its age is unknown, so it is not counted as current.`);
  } else if (templateConformance !== null && templateConformance < 70) {
    recommendations.push(`Template conformance was ${templateConformance}% at the latest validation (${templateValidatedAt}). Check missing sections.`);
  }
  if (highSeverityWarnings > 0) recommendations.push(`${highSeverityWarnings} high-severity proactive warning(s) match this draft.`);
  for (const r of riskScores.recommendations.slice(0, 3)) recommendations.push(r);

  return {
    engineVersion: REGULATORY_INTELLIGENCE_VERSION,
    compositeScore: composite.compositeScore,
    band,
    riskScores,
    componentsAssessed: composite.assessed,
    componentsNotAssessed: composite.notAssessed,
    templateConformance,
    templateName,
    templateValidatedAt,
    activeWarnings: warningsAssessed ? warnings.length : null,
    highSeverityWarnings: warningsAssessed ? highSeverityWarnings : null,
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
