import { db } from '../db';
import { eq, and, like, sql } from 'drizzle-orm';
import {
  estimandDefinitions,
  multiplicityStrategies,
  methodRegulatoryOutcomes,
} from 'shared/schema';
import type {
  EstimandDefinition,
  MultiplicityStrategy,
  MethodRegulatoryOutcome,
} from 'shared/schema';
import { ai } from '../lib/unified-ai-client';
import { hochbergReject, holmReject } from './stats/multiplicity';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EstimandStrategy =
  | 'treatment_policy'
  | 'hypothetical'
  | 'composite'
  | 'principal_stratum'
  | 'while_on_treatment';

interface IntercurrentEvent {
  name: string;
  description: string;
  strategy: EstimandStrategy;
  justification?: string;
}

interface DefineEstimandParams {
  threadId?: number;
  endpointName: string;
  population: string;
  variable: string;
  summaryMeasure: string;
  intercurrentEvents: IntercurrentEvent[];
  strategy: EstimandStrategy;
}

interface MethodRecommendation {
  primaryMethod: string;
  primaryMethodRationale: string;
  sensitivityAnalyses: Array<{
    method: string;
    rationale: string;
    targetEstimand: string;
  }>;
  supplementaryAnalyses: Array<{
    method: string;
    rationale: string;
  }>;
  regulatoryConsiderations: string;
  /**
   * Who produced it. `model`: a model approved for regulatory review, named in
   * generatedBy. `deterministic`: STRATEGY_METHOD_MAP, because the model call
   * failed, was refused, or returned something unusable. Until 2026-09-23 the
   * two were indistinguishable to the caller.
   */
  source: 'model' | 'deterministic';
  generatedBy: { provider: string; model: string } | null;
}

interface Hypothesis {
  id: string;
  description: string;
  endpoint: string;
  population?: string;
  weight?: number;
}

interface DesignMultiplicityParams {
  threadId?: number;
  hypotheses: Hypothesis[];
  overallAlpha?: number;
  approach: 'graphical' | 'fixed_sequence' | 'fallback' | 'gatekeeping' | 'holm' | 'hochberg';
}

/**
 * One threshold of the Holm (step-down) or Hochberg (step-up) procedure. Order
 * the observed p-values p(1) ≤ … ≤ p(m); p(rank) is compared with `threshold`,
 * alpha / (m − rank + 1), the comparison `holmReject` / `hochbergReject` in
 * stats/multiplicity.ts make. It belongs to a RANK of the ordered p-values,
 * never to a particular hypothesis, and it is not an initial level: it must
 * never be written into an id- or endpoint-keyed allocation such as
 * StudyDesign.statisticalPlan.multiplicity.alphaAllocation.
 */
interface RankThreshold {
  /** 1 = the smallest observed p-value, m = the largest. */
  rank: number;
  /** Unrounded. */
  threshold: number;
}

interface MultiplicityResult {
  id: number;
  approach: string;
  hypotheses: Hypothesis[];
  /**
   * Each hypothesis's INITIAL significance level (the weights × alpha of Bretz
   * et al. 2009), keyed by hypothesis id: the meaning
   * StudyDesign.statisticalPlan.multiplicity.alphaAllocation has, read by
   * study-design/multiplicity-check.ts. For holm and hochberg that is alpha/m
   * for every hypothesis, unrounded; their later thresholds belong to ranks and
   * are in `rankThresholds`. Until 2026-09-28 holm and hochberg put step
   * thresholds here against the hypotheses in the order they were listed (and
   * hochberg's were the Simes k·alpha/m, not alpha/(m − k + 1)).
   */
  alphaAllocation: Record<string, number>;
  transitionWeights: Record<string, Record<string, number>> | null;
  /** A pre-specified order; null where the order is the observed p-values' (holm, hochberg) or the graph's. */
  testingOrder: string[] | null;
  /** holm and hochberg only, else null: the thresholds for the ordered p-values, by rank. Added 2026-09-28. */
  rankThresholds: RankThreshold[] | null;
  overallAlpha: number;
  graphDefinition: object | null;
  gatekeepingStrategy: string | null;
  description: string;
}

interface ValidationResult {
  isCompliant: boolean;
  issues: Array<{
    component: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Strategy -> Method mapping (deterministic fallback)
// ---------------------------------------------------------------------------

const STRATEGY_METHOD_MAP: Record<
  EstimandStrategy,
  { primary: string; sensitivity: string[] }
> = {
  treatment_policy: {
    primary: 'Mixed Model for Repeated Measures (MMRM)',
    sensitivity: [
      'Multiple Imputation under Missing-at-Random',
      'Tipping Point Analysis',
      'Return-to-Baseline Imputation',
    ],
  },
  hypothetical: {
    primary: 'Response-Mean with Pattern-Mixture (RMPW)',
    sensitivity: [
      'Inverse Probability Weighting',
      'Multiple Imputation under Missing-Not-at-Random',
      'Controlled Imputation',
    ],
  },
  composite: {
    primary: 'Composite Endpoint Analysis with Win Ratio',
    sensitivity: [
      'Individual Component Analysis',
      'Generalized Pairwise Comparisons',
      'Time-to-First-Event Analysis',
    ],
  },
  principal_stratum: {
    primary: 'Principal Stratum Weighted Analysis',
    sensitivity: [
      'Instrumental Variable Estimation',
      'Bayesian Principal Stratification',
      'Bounds Analysis (Horowitz-Manski)',
    ],
  },
  while_on_treatment: {
    primary: 'Duration-Adjusted Analysis (on-treatment)',
    sensitivity: [
      'Kaplan-Meier with Treatment Discontinuation Censoring',
      'Restricted Mean Survival Time',
      'Recurrent Events Analysis',
    ],
  },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------


/**
 * The model's recommendation, checked before anything is stored. A reply that
 * parses but lacks a primary method or the analysis lists is not a
 * recommendation: drizzle drops undefined fields from an update, so it would
 * have been reported as a success that changed nothing.
 */
function readRecommendation(raw: unknown): Omit<MethodRecommendation, 'source' | 'generatedBy'> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const isMethodList = (v: unknown) =>
    Array.isArray(v) && v.every((x) => typeof (x as { method?: unknown })?.method === 'string');
  if (typeof r.primaryMethod !== 'string' || !r.primaryMethod.trim()) {
    throw new Error('Model recommendation has no primary method');
  }
  if (!isMethodList(r.sensitivityAnalyses) || !isMethodList(r.supplementaryAnalyses)) {
    throw new Error('Model recommendation is missing its sensitivity or supplementary analyses');
  }
  return {
    primaryMethod: r.primaryMethod,
    primaryMethodRationale: typeof r.primaryMethodRationale === 'string' ? r.primaryMethodRationale : '',
    sensitivityAnalyses: r.sensitivityAnalyses as MethodRecommendation['sensitivityAnalyses'],
    supplementaryAnalyses: r.supplementaryAnalyses as MethodRecommendation['supplementaryAnalyses'],
    regulatoryConsiderations: typeof r.regulatoryConsiderations === 'string' ? r.regulatoryConsiderations : '',
  };
}

// ---------------------------------------------------------------------------
// Multiplicity: input refusal, and Holm / Hochberg as rank procedures
// ---------------------------------------------------------------------------

const MULTIPLICITY_APPROACHES: ReadonlyArray<DesignMultiplicityParams['approach']> = [
  'graphical', 'fixed_sequence', 'fallback', 'gatekeeping', 'holm', 'hochberg',
];

type RankProcedure = 'holm' | 'hochberg';

/**
 * The largest family a Holm or Hochberg design is produced for. Every rank
 * threshold is confirmed against the canonical engine (below), one probe of
 * length m per rank, so the cost is quadratic in m; a larger family is refused
 * rather than let one request hold the event loop.
 */
const MAX_RANK_FAMILY = 100;

const DESIGNER = 'designMultiplicityStrategy';

function describeValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === null || typeof v === 'number' || typeof v === 'boolean' || v === undefined) return String(v);
  return Array.isArray(v) ? 'an array' : typeof v;
}

/**
 * Refuses, with a TypeError or RangeError naming it, an input the designer
 * cannot honour. Until 2026-09-28 an alpha of 1.5 or "0.05" produced an
 * allocation, a repeated id silently merged two hypotheses' entries, and the
 * refusals there were (no hypotheses, an unknown approach) were rewrapped as a
 * plain Error, which the route answered as a 500.
 */
function refuseMultiplicityInput(params: DesignMultiplicityParams, overallAlpha: unknown): void {
  if (!MULTIPLICITY_APPROACHES.includes(params.approach)) {
    throw new RangeError(
      `${DESIGNER}: approach ${describeValue(params.approach)} is not supported; supported: ${MULTIPLICITY_APPROACHES.join(', ')}`,
    );
  }
  const hypotheses: unknown = params.hypotheses;
  if (!Array.isArray(hypotheses)) {
    throw new TypeError(`${DESIGNER}: hypotheses must be an array; got ${describeValue(hypotheses)}`);
  }
  if (hypotheses.length === 0) {
    throw new RangeError(`${DESIGNER}: hypotheses is empty; at least one hypothesis must be provided`);
  }
  const seen = new Set<string>();
  hypotheses.forEach((h: unknown, i) => {
    const id: unknown = (h as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || id.trim() === '') {
      throw new TypeError(`${DESIGNER}: hypotheses[${i}].id must be a non-empty string; got ${describeValue(id)}`);
    }
    if (seen.has(id)) {
      throw new RangeError(`${DESIGNER}: hypotheses[${i}].id "${id}" repeats an earlier hypothesis; the allocation is keyed by id`);
    }
    seen.add(id);
  });
  if (typeof overallAlpha !== 'number') {
    throw new TypeError(`${DESIGNER}: overallAlpha must be a number; got ${describeValue(overallAlpha)}`);
  }
  if (!(overallAlpha > 0 && overallAlpha < 1)) {
    throw new RangeError(`${DESIGNER}: overallAlpha must lie strictly between 0 and 1; got ${overallAlpha}`);
  }
  if (params.approach === 'holm' || params.approach === 'hochberg') {
    if (hypotheses.length > MAX_RANK_FAMILY) {
      throw new RangeError(
        `${DESIGNER}: ${params.approach} over ${hypotheses.length} hypotheses exceeds the ${MAX_RANK_FAMILY} ` +
        `this designer confirms rank by rank against the canonical engine`,
      );
    }
    refuseUnequalWeights(params.approach, params.hypotheses);
  }
}

/**
 * Holm and Hochberg here are the canonical engine's UNWEIGHTED procedures, so a
 * weight they would ignore is refused. Equal positive weights on every
 * hypothesis change nothing and pass.
 */
function refuseUnequalWeights(procedure: RankProcedure, hypotheses: Hypothesis[]): void {
  const weights: unknown[] = hypotheses.map((h) => h.weight);
  if (weights.every((w) => w === undefined)) return;
  const i = weights.findIndex(
    (w) => typeof w !== 'number' || !Number.isFinite(w) || w <= 0 || w !== weights[0],
  );
  if (i >= 0) {
    throw new RangeError(
      `${DESIGNER}: ${procedure} is the unweighted procedure (initial level alpha/m for every hypothesis), ` +
      `so weights must be omitted or equal and positive on every hypothesis; hypotheses[${i}].weight is ` +
      `${describeValue(weights[i])} where hypotheses[0].weight is ${describeValue(weights[0])}. ` +
      `Use 'fallback' for a weighted allocation`,
    );
  }
}

/**
 * p-values in rank order with p(rank) = `at`, every smaller rank at 0 and every
 * larger rank at 1. Under Holm and Hochberg alike p(rank) is then rejected
 * exactly when `at` lies at or below the rank's threshold.
 */
function rankProbe(m: number, rank: number, at: number): number[] {
  return Array.from({ length: m }, (_, i) => {
    if (i < rank - 1) return 0;
    return i === rank - 1 ? at : 1;
  });
}

/**
 * The rank thresholds alpha/(m − k + 1), k = 1…m, of Holm and Hochberg (the two
 * share them; one steps down, the other up). One source: each threshold is
 * confirmed to be the canonical procedure's decision boundary at its rank —
 * `holmReject` / `hochbergReject` reject p(k) at the threshold and not just
 * above it — and a canonical rule that disagrees refuses the design rather than
 * let this service display thresholds the engine does not apply.
 */
function canonicalRankThresholds(procedure: RankProcedure, m: number, alpha: number): RankThreshold[] {
  const reject = procedure === 'holm' ? holmReject : hochbergReject;
  return Array.from({ length: m }, (_, i) => {
    const rank = i + 1;
    const threshold = alpha / (m - rank + 1);
    // Beyond the canonical engine's absolute tolerance (1e-12).
    const above = threshold + Math.max(threshold * 1e-9, 1e-11);
    const rejectedAt = reject(rankProbe(m, rank, threshold), alpha)[rank - 1];
    // No p-value lies above 1, so there is nothing to probe there.
    const rejectedAbove = above <= 1 && reject(rankProbe(m, rank, above), alpha)[rank - 1];
    if (!rejectedAt || rejectedAbove) {
      throw new Error(
        `${procedure} rank ${rank} of ${m} at alpha ${alpha}: alpha/(m − k + 1) = ${threshold} is not the canonical ` +
        `${procedure}Reject boundary (stats/multiplicity.ts); the design is refused rather than displayed`,
      );
    }
    return { rank, threshold };
  });
}

/** Four significant figures for narrative; the exact values are in the result's fields. */
const sig4 = (x: number): string => String(Number(x.toPrecision(4)));

/** Holm or Hochberg: initial levels by hypothesis, thresholds by rank, and the wording that keeps them apart. */
function rankProcedureDesign(
  procedure: RankProcedure,
  hypotheses: Hypothesis[],
  alpha: number,
): { alphaAllocation: Record<string, number>; rankThresholds: RankThreshold[]; description: string } {
  const m = hypotheses.length;
  const rankThresholds = canonicalRankThresholds(procedure, m, alpha);
  const initial = rankThresholds[0].threshold; // alpha / m
  const alphaAllocation = Object.fromEntries(hypotheses.map((h) => [h.id, initial]));
  const byRank = rankThresholds.map((t) => `p(${t.rank}) ≤ ${sig4(t.threshold)}`).join(', ');
  const common =
    `Each hypothesis's initial significance level is alpha/${m} = ${sig4(initial)} (alphaAllocation): ` +
    `a hypothesis whose p-value is at or below it is rejected whatever the other p-values. ` +
    `Rank thresholds alpha/(m − k + 1) for the ordered p-values p(1) ≤ … ≤ p(${m}) (rankThresholds): ${byRank}. ` +
    `These thresholds belong to the ranks of the ordered p-values, not to particular hypotheses, and are not initial levels; ` +
    `the testing order is the order of the observed p-values, so none is fixed in advance.`;
  const description = procedure === 'holm'
    ? `Holm step-down procedure over ${m} hypotheses at overall alpha ${alpha}; family-wise error controlled under any dependence. ` +
      `${common} Step down from the smallest p-value, rejecting each p(k) at or below its threshold, and stop at the first p(k) above it.`
    : `Hochberg step-up procedure over ${m} hypotheses at overall alpha ${alpha}; family-wise error controlled under independence or ` +
      `positive regression dependence of the test statistics, and, unlike Holm's, not under arbitrary dependence. ` +
      `${common} Step up from the largest p-value: at the first p(k) at or below its threshold, reject it and every smaller p-value; ` +
      `if there is none, reject nothing.`;
  return { alphaAllocation, rankThresholds, description };
}

export class EstimandEngineService {
  private static instance: EstimandEngineService;

  private constructor() {}

  static getInstance(): EstimandEngineService {
    if (!EstimandEngineService.instance) {
      EstimandEngineService.instance = new EstimandEngineService();
    }
    return EstimandEngineService.instance;
  }

  private getDb() {
    if (!db) {
      throw new Error('Database unavailable');
    }
    return db;
  }

  // -------------------------------------------------------------------------
  // 1. defineEstimand
  // -------------------------------------------------------------------------

  async defineEstimand(
    params: DefineEstimandParams,
    organizationId: number
  ): Promise<{ id: number; ichE9R1Compliant: boolean; validationIssues: string[] }> {
    const database = this.getDb();

    try {
      // Validate ICH E9(R1) components before persisting
      const validationIssues = this.validateEstimandComponents(params);
      const isCompliant = validationIssues.length === 0;

      const [inserted] = await database
        .insert(estimandDefinitions)
        .values({
          threadId: params.threadId ?? null,
          endpointName: params.endpointName,
          population: params.population,
          variable: params.variable,
          summaryMeasure: params.summaryMeasure,
          intercurrentEvents: params.intercurrentEvents,
          strategy: params.strategy,
          ichE9R1Compliant: isCompliant,
          organizationId,
        })
        .returning({ id: estimandDefinitions.id });

      return {
        id: inserted.id,
        ichE9R1Compliant: isCompliant,
        validationIssues,
      };
    } catch (error) {
      console.error('[EstimandEngine] defineEstimand error:', error);
      throw new Error(
        `Failed to define estimand: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private validateEstimandComponents(params: DefineEstimandParams): string[] {
    const issues: string[] = [];

    if (!params.population || params.population.trim().length < 5) {
      issues.push('Population must be clearly defined (e.g., "ITT population, all randomized patients").');
    }

    if (!params.variable || params.variable.trim().length < 3) {
      issues.push('Variable (endpoint measure) must be specified.');
    }

    if (!params.summaryMeasure || params.summaryMeasure.trim().length < 3) {
      issues.push(
        'Summary measure must be specified (e.g., "difference in means", "hazard ratio", "odds ratio").'
      );
    }

    if (!params.intercurrentEvents || params.intercurrentEvents.length === 0) {
      issues.push(
        'At least one intercurrent event must be identified and addressed per ICH E9(R1).'
      );
    } else {
      for (const ice of params.intercurrentEvents) {
        if (!ice.name || ice.name.trim().length === 0) {
          issues.push('Each intercurrent event must have a name.');
        }
        if (!ice.strategy) {
          issues.push(`Intercurrent event "${ice.name}" is missing a strategy.`);
        }
      }
    }

    const validStrategies: EstimandStrategy[] = [
      'treatment_policy',
      'hypothetical',
      'composite',
      'principal_stratum',
      'while_on_treatment',
    ];
    if (!validStrategies.includes(params.strategy)) {
      issues.push(
        `Strategy "${params.strategy}" is not a recognized ICH E9(R1) strategy. Valid options: ${validStrategies.join(', ')}.`
      );
    }

    if (!params.endpointName || params.endpointName.trim().length < 3) {
      issues.push('Endpoint name must be provided.');
    }

    return issues;
  }

  // -------------------------------------------------------------------------
  // 2. recommendMethods
  // -------------------------------------------------------------------------

  async recommendMethods(
    estimandId: number,
    organizationId: number
  ): Promise<MethodRecommendation> {
    const database = this.getDb();

    try {
      // Fetch the estimand definition
      const [estimand] = await database
        .select()
        .from(estimandDefinitions)
        .where(
          and(
            eq(estimandDefinitions.id, estimandId),
            eq(estimandDefinitions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!estimand) {
        throw new Error(`Estimand ${estimandId} not found`);
      }

      // Try AI-powered recommendation first, fall back to deterministic mapping
      let recommendation: MethodRecommendation;

      try {
        recommendation = await this.getAIMethodRecommendation(estimand, organizationId);
      } catch (aiError) {
        console.warn('[EstimandEngine] AI method recommendation unavailable, using deterministic fallback:', aiError);
        recommendation = this.getDeterministicRecommendation(estimand);
      }

      // Persist the recommended primary method and sensitivity analyses back
      await database
        .update(estimandDefinitions)
        .set({
          primaryMethod: recommendation.primaryMethod,
          sensitivityAnalyses: recommendation.sensitivityAnalyses,
          supplementaryAnalyses: recommendation.supplementaryAnalyses,
          updatedAt: new Date(),
        })
        .where(eq(estimandDefinitions.id, estimandId));

      return recommendation;
    } catch (error) {
      console.error('[EstimandEngine] recommendMethods error:', error);
      throw new Error(
        `Failed to recommend methods: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getAIMethodRecommendation(
    estimand: EstimandDefinition,
    organizationId: number
  ): Promise<MethodRecommendation> {
    const intercurrentEvents = estimand.intercurrentEvents as IntercurrentEvent[];
    const iceDescription = intercurrentEvents
      .map((ice) => `- ${ice.name}: strategy=${ice.strategy}`)
      .join('\n');

    const prompt = `You are a senior biostatistician specializing in ICH E9(R1) estimand framework.

Given the following estimand definition, recommend the optimal primary statistical method, sensitivity analyses, and supplementary analyses.

Estimand:
- Endpoint: ${estimand.endpointName}
- Population: ${estimand.population}
- Variable: ${estimand.variable}
- Summary measure: ${estimand.summaryMeasure}
- Primary strategy: ${estimand.strategy}
- Intercurrent events:
${iceDescription}

Respond in JSON with this exact structure:
{
  "primaryMethod": "<name of primary statistical method>",
  "primaryMethodRationale": "<why this method aligns with the estimand>",
  "sensitivityAnalyses": [
    { "method": "<method name>", "rationale": "<why>", "targetEstimand": "<which estimand aspect it addresses>" }
  ],
  "supplementaryAnalyses": [
    { "method": "<method name>", "rationale": "<why>" }
  ],
  "regulatoryConsiderations": "<FDA/EMA/PMDA perspective on this approach>"
}`;

    // A recommended primary analysis for a regulatory estimand is high-risk
    // regulatory review: only an approved model may serve it. It pinned gpt-4o
    // as a 'general' request, which the gateway's approval check never sees.
    const aiResult = await ai.chat({
      taskType: 'regulatory_review',
      callerModule: 'estimand-engine.recommendMethods',
      organizationId,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = aiResult.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    return {
      ...readRecommendation(JSON.parse(content)),
      source: 'model',
      generatedBy: { provider: aiResult.provider, model: aiResult.model },
    };
  }

  private getDeterministicRecommendation(estimand: EstimandDefinition): MethodRecommendation {
    const mapping = STRATEGY_METHOD_MAP[estimand.strategy] || STRATEGY_METHOD_MAP.treatment_policy;

    return {
      primaryMethod: mapping.primary,
      primaryMethodRationale: `Standard primary analysis for "${estimand.strategy}" strategy per ICH E9(R1) guidance, applied to ${estimand.endpointName} in the ${estimand.population}.`,
      sensitivityAnalyses: mapping.sensitivity.map((method, idx) => ({
        method,
        rationale: `Sensitivity analysis ${idx + 1} to assess robustness of primary results under alternative assumptions.`,
        targetEstimand: estimand.strategy,
      })),
      supplementaryAnalyses: [
        {
          method: 'Subgroup Analysis by Key Baseline Covariates',
          rationale: 'Explore treatment effect consistency across subgroups.',
        },
      ],
      // Until 2026-09-23 this claimed "FDA, EMA, and PMDA have accepted this
      // approach in recent approvals for similar indications" — for every
      // estimand, from a lookup table, with no precedent consulted.
      regulatoryConsiderations: `${mapping.primary} is the standard primary method for the "${estimand.strategy}" strategy in the ICH E9(R1) framework. No regulatory precedent was assessed for this recommendation.`,
      source: 'deterministic',
      generatedBy: null,
    };
  }

  // -------------------------------------------------------------------------
  // 3. designMultiplicityStrategy
  // -------------------------------------------------------------------------

  async designMultiplicityStrategy(
    params: DesignMultiplicityParams,
    organizationId: number
  ): Promise<MultiplicityResult> {
    // The default is visible in the result (overallAlpha). A refusal keeps its
    // TypeError / RangeError and happens before anything is stored.
    const overallAlpha = params.overallAlpha ?? 0.05;
    refuseMultiplicityInput(params, overallAlpha);
    const database = this.getDb();

    try {
      const hypotheses = params.hypotheses;
      const n = hypotheses.length;

      let alphaAllocation: Record<string, number>;
      let transitionWeights: Record<string, Record<string, number>> | null = null;
      let testingOrder: string[] | null = null;
      let graphDefinition: object | null = null;
      let gatekeepingStrategy: string | null = null;
      let rankThresholds: RankThreshold[] | null = null;
      let description: string;

      switch (params.approach) {
        case 'graphical': {
          // Bretz et al. graphical approach
          const result = this.buildGraphicalApproach(hypotheses, overallAlpha);
          alphaAllocation = result.alphaAllocation;
          transitionWeights = result.transitionWeights;
          graphDefinition = result.graphDefinition;
          description = `Graphical multiplicity adjustment (Bretz et al.) with ${n} hypotheses. ` +
            `Initial alpha split equally at ${(overallAlpha / n).toFixed(4)} per hypothesis. ` +
            `Transition weights allow alpha propagation upon rejection.`;
          break;
        }

        case 'fixed_sequence': {
          alphaAllocation = {};
          testingOrder = hypotheses.map((h) => h.id);
          // Full alpha to first hypothesis, zero to others until gate opens
          for (let i = 0; i < n; i++) {
            alphaAllocation[hypotheses[i].id] = i === 0 ? overallAlpha : 0;
          }
          description = `Fixed-sequence testing: hypotheses tested in order (${testingOrder.join(' → ')}). ` +
            `Full alpha (${overallAlpha}) allocated to H1; subsequent hypotheses tested only if preceding hypothesis is rejected.`;
          break;
        }

        case 'fallback': {
          // Fallback procedure: pre-specified alpha split with propagation
          alphaAllocation = {};
          const weights = hypotheses.map((h) => h.weight ?? 1 / n);
          const weightSum = weights.reduce((a, b) => a + b, 0);
          for (let i = 0; i < n; i++) {
            alphaAllocation[hypotheses[i].id] =
              Math.round(((weights[i] / weightSum) * overallAlpha) * 10000) / 10000;
          }
          testingOrder = hypotheses.map((h) => h.id);
          description = `Fallback procedure with weighted alpha allocation. ` +
            `If a hypothesis is not rejected, its alpha is passed to the next in sequence.`;
          break;
        }

        case 'gatekeeping': {
          // Parallel gatekeeping: primary family must be rejected before secondary
          const primaryHypotheses = hypotheses.slice(0, Math.ceil(n / 2));
          const secondaryHypotheses = hypotheses.slice(Math.ceil(n / 2));
          alphaAllocation = {};
          const primaryAlpha = overallAlpha;
          for (const h of primaryHypotheses) {
            alphaAllocation[h.id] =
              Math.round((primaryAlpha / primaryHypotheses.length) * 10000) / 10000;
          }
          for (const h of secondaryHypotheses) {
            alphaAllocation[h.id] = 0; // gated until primary family rejected
          }
          gatekeepingStrategy = 'parallel';
          testingOrder = [...primaryHypotheses.map((h) => h.id), ...secondaryHypotheses.map((h) => h.id)];
          description = `Parallel gatekeeping strategy. Primary family (${primaryHypotheses.map((h) => h.id).join(', ')}) ` +
            `tested at alpha=${overallAlpha}. Secondary family gated until >= 1 primary rejected.`;
          break;
        }

        case 'holm':
        case 'hochberg': {
          // Rank procedures: thresholds by rank of the ordered p-values (confirmed
          // against the canonical holmReject / hochbergReject), initial level
          // alpha/m by hypothesis, and no fixed testing order.
          ({ alphaAllocation, rankThresholds, description } =
            rankProcedureDesign(params.approach, hypotheses, overallAlpha));
          break;
        }

        default:
          // Unreachable: refuseMultiplicityInput admits only the cases above.
          throw new Error(`Unsupported multiplicity approach: ${params.approach}`);
      }

      const [inserted] = await database
        .insert(multiplicityStrategies)
        .values({
          threadId: params.threadId ?? null,
          approach: params.approach,
          hypotheses: hypotheses,
          alphaAllocation: alphaAllocation,
          transitionWeights: transitionWeights,
          testingOrder: testingOrder,
          overallAlpha: overallAlpha,
          graphDefinition: graphDefinition,
          gatekeepingStrategy: gatekeepingStrategy,
          organizationId,
        })
        .returning({ id: multiplicityStrategies.id });

      return {
        id: inserted.id,
        approach: params.approach,
        hypotheses,
        alphaAllocation,
        transitionWeights,
        testingOrder,
        rankThresholds,
        overallAlpha,
        graphDefinition,
        gatekeepingStrategy,
        description,
      };
    } catch (error) {
      console.error('[EstimandEngine] designMultiplicityStrategy error:', error);
      throw new Error(
        `Failed to design multiplicity strategy: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private buildGraphicalApproach(
    hypotheses: Hypothesis[],
    overallAlpha: number
  ): {
    alphaAllocation: Record<string, number>;
    transitionWeights: Record<string, Record<string, number>>;
    graphDefinition: object;
  } {
    const n = hypotheses.length;
    const alphaAllocation: Record<string, number> = {};
    const transitionWeights: Record<string, Record<string, number>> = {};

    // Equal initial alpha allocation
    for (const h of hypotheses) {
      alphaAllocation[h.id] = Math.round((overallAlpha / n) * 10000) / 10000;
    }

    // Build transition weight matrix: equal propagation to remaining hypotheses
    for (const h of hypotheses) {
      transitionWeights[h.id] = {};
      for (const other of hypotheses) {
        if (other.id !== h.id) {
          transitionWeights[h.id][other.id] = Math.round((1 / (n - 1)) * 10000) / 10000;
        }
      }
    }

    // Graph definition for visualization
    const nodes = hypotheses.map((h, idx) => ({
      id: h.id,
      label: h.description || h.id,
      alpha: alphaAllocation[h.id],
      x: Math.cos((2 * Math.PI * idx) / n) * 200 + 250,
      y: Math.sin((2 * Math.PI * idx) / n) * 200 + 250,
    }));

    const edges: Array<{ from: string; to: string; weight: number }> = [];
    for (const [from, targets] of Object.entries(transitionWeights)) {
      for (const [to, weight] of Object.entries(targets)) {
        edges.push({ from, to, weight });
      }
    }

    return {
      alphaAllocation,
      transitionWeights,
      graphDefinition: { nodes, edges },
    };
  }

  // -------------------------------------------------------------------------
  // 4. getRegulatoryExamples
  // -------------------------------------------------------------------------

  async getRegulatoryExamples(
    indication: string,
    strategy?: EstimandStrategy,
    organizationId?: number
  ): Promise<{
    indication: string;
    strategy?: string;
    examples: MethodRegulatoryOutcome[];
    summary: string;
  }> {
    const database = this.getDb();

    try {
      const filters = [like(methodRegulatoryOutcomes.indication, `%${indication}%`)];

      // Always filter by organizationId for tenant isolation
      if (organizationId !== undefined) {
        filters.push(eq(methodRegulatoryOutcomes.organizationId, organizationId));
      } else {
        // Prevent cross-tenant leakage — return empty if no org context
        return { indication, strategy, examples: [], summary: 'Organization context required.' };
      }

      // If strategy is provided, map it to likely method names to filter
      if (strategy) {
        const mapping = STRATEGY_METHOD_MAP[strategy];
        if (mapping) {
          const methodNames = [mapping.primary, ...mapping.sensitivity];
          filters.push(
            sql`${methodRegulatoryOutcomes.methodName} = ANY(${methodNames})`
          );
        }
      }

      const examples = await database
        .select()
        .from(methodRegulatoryOutcomes)
        .where(and(...filters));

      // Build summary
      const accepted = examples.filter((e) => e.accepted).length;
      const total = examples.length;
      const agencies = [...new Set(examples.map((e) => e.agency))];

      const summary =
        total === 0
          ? `No regulatory examples found for "${indication}"${strategy ? ` with strategy "${strategy}"` : ''}.`
          : `Found ${total} regulatory precedent(s) for "${indication}": ` +
            `${accepted} accepted, ${total - accepted} rejected across ${agencies.join(', ')}.`;

      return { indication, strategy, examples, summary };
    } catch (error) {
      console.error('[EstimandEngine] getRegulatoryExamples error:', error);
      throw new Error(
        `Failed to retrieve regulatory examples: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // 5. validateEstimand
  // -------------------------------------------------------------------------

  async validateEstimand(
    estimandId: number,
    organizationId: number
  ): Promise<ValidationResult> {
    const database = this.getDb();

    try {
      const [estimand] = await database
        .select()
        .from(estimandDefinitions)
        .where(
          and(
            eq(estimandDefinitions.id, estimandId),
            eq(estimandDefinitions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!estimand) {
        throw new Error(`Estimand ${estimandId} not found`);
      }

      const issues: ValidationResult['issues'] = [];
      const recommendations: string[] = [];

      // --- Population ---
      if (!estimand.population || estimand.population.trim().length < 5) {
        issues.push({
          component: 'population',
          severity: 'error',
          message: 'Population is not adequately defined. ICH E9(R1) requires a clear description of the target population.',
        });
      } else {
        // Check for common population descriptions
        const pop = estimand.population.toLowerCase();
        if (!pop.includes('randomiz') && !pop.includes('intent') && !pop.includes('itt') && !pop.includes('per protocol')) {
          issues.push({
            component: 'population',
            severity: 'warning',
            message: 'Population description does not reference a standard analysis set (ITT, mITT, per-protocol). Consider specifying.',
          });
        }
      }

      // --- Variable ---
      if (!estimand.variable || estimand.variable.trim().length < 3) {
        issues.push({
          component: 'variable',
          severity: 'error',
          message: 'Variable (outcome measure) must be specified.',
        });
      }

      // --- Summary measure ---
      if (!estimand.summaryMeasure || estimand.summaryMeasure.trim().length < 3) {
        issues.push({
          component: 'summaryMeasure',
          severity: 'error',
          message: 'Summary measure not specified. Must define how treatment effect is quantified (e.g., difference in means, hazard ratio).',
        });
      } else {
        const validMeasures = [
          'difference in means',
          'difference in proportions',
          'hazard ratio',
          'odds ratio',
          'risk ratio',
          'relative risk',
          'rate ratio',
          'restricted mean survival time',
          'win ratio',
          'responder rate',
        ];
        const lower = estimand.summaryMeasure.toLowerCase();
        const recognized = validMeasures.some((m) => lower.includes(m));
        if (!recognized) {
          issues.push({
            component: 'summaryMeasure',
            severity: 'info',
            message: `Summary measure "${estimand.summaryMeasure}" is not a commonly recognized type. Verify regulatory acceptance.`,
          });
        }
      }

      // --- Intercurrent events ---
      const ices = estimand.intercurrentEvents as IntercurrentEvent[] | null;
      if (!ices || ices.length === 0) {
        issues.push({
          component: 'intercurrentEvents',
          severity: 'error',
          message: 'No intercurrent events defined. ICH E9(R1) mandates identifying and addressing all relevant intercurrent events.',
        });
        recommendations.push(
          'Common intercurrent events to consider: treatment discontinuation, use of rescue medication, treatment switching, death, protocol deviation.'
        );
      } else {
        for (const ice of ices) {
          if (!ice.name || ice.name.trim().length === 0) {
            issues.push({
              component: 'intercurrentEvents',
              severity: 'error',
              message: 'An intercurrent event is missing a name.',
            });
          }
          if (!ice.strategy) {
            issues.push({
              component: 'intercurrentEvents',
              severity: 'error',
              message: `Intercurrent event "${ice.name || 'unnamed'}" has no strategy assigned.`,
            });
          }
          if (!ice.description || ice.description.trim().length === 0) {
            issues.push({
              component: 'intercurrentEvents',
              severity: 'warning',
              message: `Intercurrent event "${ice.name}" lacks a description. Consider adding context for regulatory reviewers.`,
            });
          }
        }

        // Check for common missing intercurrent events
        const iceNames = ices.map((i) => i.name.toLowerCase());
        const commonICEs = ['discontinuation', 'rescue medication', 'treatment switch', 'death'];
        for (const common of commonICEs) {
          if (!iceNames.some((name) => name.includes(common))) {
            recommendations.push(
              `Consider whether "${common}" should be addressed as an intercurrent event.`
            );
          }
        }
      }

      // --- Strategy ---
      const validStrategies: EstimandStrategy[] = [
        'treatment_policy',
        'hypothetical',
        'composite',
        'principal_stratum',
        'while_on_treatment',
      ];
      if (!validStrategies.includes(estimand.strategy)) {
        issues.push({
          component: 'strategy',
          severity: 'error',
          message: `Strategy "${estimand.strategy}" is not a recognized ICH E9(R1) strategy.`,
        });
      }

      // --- Primary method ---
      if (!estimand.primaryMethod) {
        issues.push({
          component: 'primaryMethod',
          severity: 'warning',
          message: 'No primary statistical method assigned. Run recommendMethods() to generate method recommendations.',
        });
      }

      // --- Sensitivity analyses ---
      if (!estimand.sensitivityAnalyses || (estimand.sensitivityAnalyses as unknown[]).length === 0) {
        issues.push({
          component: 'sensitivityAnalyses',
          severity: 'warning',
          message: 'No sensitivity analyses defined. ICH E9(R1) requires sensitivity analyses to assess robustness of primary results.',
        });
      }

      const isCompliant = issues.filter((i) => i.severity === 'error').length === 0;

      // Update compliance flag in database
      if (estimand.ichE9R1Compliant !== isCompliant) {
        await database
          .update(estimandDefinitions)
          .set({ ichE9R1Compliant: isCompliant, updatedAt: new Date() })
          .where(eq(estimandDefinitions.id, estimandId));
      }

      return { isCompliant, issues, recommendations };
    } catch (error) {
      console.error('[EstimandEngine] validateEstimand error:', error);
      throw new Error(
        `Failed to validate estimand: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // 6. getEstimand
  // -------------------------------------------------------------------------

  async getEstimand(
    estimandId: number,
    organizationId: number
  ): Promise<EstimandDefinition> {
    const database = this.getDb();

    try {
      const [estimand] = await database
        .select()
        .from(estimandDefinitions)
        .where(
          and(
            eq(estimandDefinitions.id, estimandId),
            eq(estimandDefinitions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!estimand) {
        throw new Error(`Estimand ${estimandId} not found for organization ${organizationId}`);
      }

      return estimand;
    } catch (error) {
      console.error('[EstimandEngine] getEstimand error:', error);
      throw new Error(
        `Failed to retrieve estimand: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const estimandEngineService = EstimandEngineService.getInstance();
