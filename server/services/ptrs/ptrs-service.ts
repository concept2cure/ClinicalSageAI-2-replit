/**
 * PTRS service — the IO boundary around the pure {@link predictPtrs} core.
 *
 * Responsibilities:
 *   - pull labelled trials from a {@link LabeledTrialSource} (the corpus in
 *     production, a fake in tests),
 *   - derive the right prior for the requested target (data-derived pooled
 *     completion rate for `registry_completion`; published LOA for
 *     `regulatory_approval`),
 *   - train the logistic model when there are enough labelled trials, cache it
 *     in-process, and serve a blended/trained/prior estimate.
 *
 * The orchestration is separated from the database (same pattern as the corpus
 * ingestion) so the honesty and blending logic is unit-tested with fakes and the
 * pure math stays DB-free.
 *
 * @module server/services/ptrs/ptrs-service
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { csrReports, csrDetails } from 'shared/schema';
import {
  statusToOutcome,
  endpointsFromDetail,
} from '../corpus/precedent-benchmark-reader';
import {
  approvalPrior,
  extractFeatures,
  normalizePhase,
  predictPtrs,
  trainPtrs,
  MIN_TRAIN_SAMPLES,
  type PtrsModelWeights,
  type PtrsPrediction,
  type PtrsPrior,
  type PtrsTarget,
  type TrialDesign,
} from './ptrs-model';

/** Minimum comparable known-outcome trials before a pooled completion rate is used as a prior. */
export const MIN_TRIALS_FOR_PRIOR = 8;

export interface LabeledTrial {
  design: TrialDesign;
  /** Registry outcome: true = completed, false = terminated/withdrawn, null = ongoing/unknown. */
  outcome: boolean | null;
}

export interface LabeledTrialFilter {
  indication?: string;
  phase?: string;
}

/** Supplies labelled trials. Injected so the service is testable without a DB. */
export interface LabeledTrialSource {
  fetchLabeledTrials(filter: LabeledTrialFilter): Promise<LabeledTrial[]>;
}

/** Pooled completion rate over a set of labelled trials, ignoring null outcomes. */
function pooledCompletion(trials: LabeledTrial[]): { knownN: number; successes: number; rate: number | null } {
  const known = trials.filter(t => t.outcome !== null);
  const successes = known.filter(t => t.outcome === true).length;
  return {
    knownN: known.length,
    successes,
    rate: known.length > 0 ? successes / known.length : null,
  };
}

interface CacheEntry {
  model: PtrsModelWeights | null;
  trainedAt: number;
}

export class PtrsService {
  private readonly source: LabeledTrialSource;
  private readonly cache = new Map<PtrsTarget, CacheEntry>();
  private readonly cacheTtlMs: number;

  constructor(deps: { source: LabeledTrialSource; cacheTtlMs?: number }) {
    this.source = deps.source;
    this.cacheTtlMs = deps.cacheTtlMs ?? 5 * 60_000;
  }

  /**
   * Train (or retrain) the model for a target over the whole corpus and cache it.
   * Only `registry_completion` is trainable today; `regulatory_approval` has no
   * local approval labels, so its model stays null and it serves the prior.
   */
  async train(target: PtrsTarget): Promise<PtrsModelWeights | null> {
    if (target === 'regulatory_approval') {
      this.cache.set(target, { model: null, trainedAt: Date.now() });
      return null;
    }
    const pool = await this.source.fetchLabeledTrials({});
    const labelled = pool
      .filter(t => t.outcome !== null)
      .map(t => ({ design: t.design, label: t.outcome === true }));
    const result = trainPtrs(labelled, { target });
    this.cache.set(target, { model: result.model, trainedAt: Date.now() });
    return result.model;
  }

  private async getModel(target: PtrsTarget): Promise<PtrsModelWeights | null> {
    const cached = this.cache.get(target);
    if (cached && Date.now() - cached.trainedAt < this.cacheTtlMs) return cached.model;
    return this.train(target);
  }

  /** Build the prior for a target + design from comparable corpus evidence. */
  private async derivePrior(target: PtrsTarget, design: TrialDesign): Promise<PtrsPrior | null> {
    if (target === 'regulatory_approval') {
      const prior = approvalPrior(normalizePhase(design.phase));
      if (!prior) return null;
      // No local approval-labelled trials exist, so the interval has no local
      // denominator — honestly 0. The served value is the literature point estimate.
      return { probability: prior.probability, source: prior.source, localKnownN: 0, localSuccesses: 0 };
    }

    // registry_completion: pooled empirical completion rate, comparable first.
    const comparable = await this.source.fetchLabeledTrials({
      indication: design.indication,
      phase: design.phase,
    });
    const comp = pooledCompletion(comparable);
    if (comp.rate !== null && comp.knownN >= MIN_TRIALS_FOR_PRIOR) {
      return {
        probability: comp.rate,
        source: `pooled corpus completion rate for ${design.indication} / ${design.phase} (n=${comp.knownN})`,
        localKnownN: comp.knownN,
        localSuccesses: comp.successes,
      };
    }

    // Fall back to the corpus-wide pooled rate when the comparable set is thin.
    const all = await this.source.fetchLabeledTrials({});
    const allPooled = pooledCompletion(all);
    if (allPooled.rate !== null && allPooled.knownN >= MIN_TRIALS_FOR_PRIOR) {
      return {
        probability: allPooled.rate,
        source: `pooled corpus completion rate, all indications (n=${allPooled.knownN})`,
        // Interval reflects the comparable local evidence, which may be smaller.
        localKnownN: comp.knownN,
        localSuccesses: comp.successes,
      };
    }
    return null;
  }

  /**
   * Predict PTRS for a design. Honest by construction: serves a trained/blended
   * estimate when the corpus supports it, a published prior in cold-start, and
   * `not_assessable` when neither exists.
   */
  async predict(target: PtrsTarget, design: TrialDesign): Promise<PtrsPrediction> {
    const [model, prior] = await Promise.all([this.getModel(target), this.derivePrior(target, design)]);
    return predictPtrs({ target, design, model, prior });
  }

  /** Invalidate the cached model for a target (or all). For tests / post-ingest refresh. */
  invalidate(target?: PtrsTarget): void {
    if (target) this.cache.delete(target);
    else this.cache.clear();
  }
}

// ─── Production wiring: corpus-backed labelled-trial source ───────────────────

/** Build the free-text design tokens a model reads from the structured CSR columns. */
function designTokens(detail: {
  studyDesign: string | null;
  blinding: string | null;
  randomization: string | null;
  biomarkerUsed: string | null;
}): string[] {
  const tokens: string[] = [];
  if (detail.studyDesign) tokens.push(detail.studyDesign);
  if (detail.blinding) tokens.push(detail.blinding);
  if (detail.randomization) tokens.push(detail.randomization);
  if (detail.biomarkerUsed && detail.biomarkerUsed.trim()) tokens.push('biomarker');
  return tokens;
}

/**
 * Reads labelled trials from the corpus (csr_reports ⨝ csr_details), mapping
 * registry status to an outcome via {@link statusToOutcome} and structured
 * design columns to model tokens. Mirrors the precedent-benchmark reader's query.
 */
export class CorpusLabeledTrialSource implements LabeledTrialSource {
  async fetchLabeledTrials(filter: LabeledTrialFilter): Promise<LabeledTrial[]> {
    const conditions = [];
    if (filter.indication) conditions.push(eq(csrReports.indication, filter.indication));
    if (filter.phase) conditions.push(eq(csrReports.phase, filter.phase));

    const reports = await db
      .select({
        id: csrReports.id,
        indication: csrReports.indication,
        phase: csrReports.phase,
        status: csrReports.status,
        durationWeeks: csrReports.durationWeeks,
        sampleSize: csrReports.sampleSize,
        studyDesign: csrReports.studyDesign,
      })
      .from(csrReports)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    if (reports.length === 0) return [];

    const reportIds = reports.map(r => r.id);
    const details = await db
      .select()
      .from(csrDetails)
      .where(sql`${csrDetails.reportId} IN (${sql.join(reportIds, sql`, `)})`);
    const detailByReport = new Map<number, (typeof details)[number]>();
    for (const d of details) detailByReport.set(d.reportId, d);

    return reports.map(r => {
      const detail = detailByReport.get(r.id);
      const design: TrialDesign = {
        indication: r.indication ?? '',
        phase: r.phase ?? '',
        sampleSize: r.sampleSize ?? detail?.sampleSize ?? null,
        durationWeeks: r.durationWeeks ?? null,
        designFeatures: designTokens({
          studyDesign: r.studyDesign ?? detail?.studyDesign ?? null,
          blinding: detail?.blinding ?? null,
          randomization: detail?.randomization ?? null,
          biomarkerUsed: detail?.biomarkerUsed ?? null,
        }),
      };
      // endpoints are not a model feature today but kept in the query shape for parity.
      void endpointsFromDetail(detail?.endpoints);
      return { design, outcome: statusToOutcome(r.status) };
    });
  }
}

/** Production singleton, reading from the live corpus. */
export const ptrsService = new PtrsService({ source: new CorpusLabeledTrialSource() });
