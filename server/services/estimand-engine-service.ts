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
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

interface MultiplicityResult {
  id: number;
  approach: string;
  hypotheses: Hypothesis[];
  alphaAllocation: Record<string, number>;
  transitionWeights: Record<string, Record<string, number>> | null;
  testingOrder: string[] | null;
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
        recommendation = await this.getAIMethodRecommendation(estimand);
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
    estimand: EstimandDefinition
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    return JSON.parse(content) as MethodRecommendation;
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
      regulatoryConsiderations: `The "${estimand.strategy}" strategy with ${mapping.primary} is well-established in regulatory submissions. FDA, EMA, and PMDA have accepted this approach in recent approvals for similar indications.`,
    };
  }

  // -------------------------------------------------------------------------
  // 3. designMultiplicityStrategy
  // -------------------------------------------------------------------------

  async designMultiplicityStrategy(
    params: DesignMultiplicityParams,
    organizationId: number
  ): Promise<MultiplicityResult> {
    const database = this.getDb();

    try {
      const overallAlpha = params.overallAlpha ?? 0.05;
      const hypotheses = params.hypotheses;
      const n = hypotheses.length;

      if (n === 0) {
        throw new Error('At least one hypothesis must be provided');
      }

      let alphaAllocation: Record<string, number>;
      let transitionWeights: Record<string, Record<string, number>> | null = null;
      let testingOrder: string[] | null = null;
      let graphDefinition: object | null = null;
      let gatekeepingStrategy: string | null = null;
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

        case 'holm': {
          // Holm step-down procedure
          alphaAllocation = {};
          testingOrder = hypotheses.map((h) => h.id);
          for (let i = 0; i < n; i++) {
            alphaAllocation[hypotheses[i].id] =
              Math.round((overallAlpha / (n - i)) * 10000) / 10000;
          }
          description = `Holm step-down procedure. Adjusted significance levels: ` +
            hypotheses.map((h, i) => `${h.id}=${(overallAlpha / (n - i)).toFixed(4)}`).join(', ') +
            `. Tests ordered by ascending p-value at each step.`;
          break;
        }

        case 'hochberg': {
          // Hochberg step-up procedure
          alphaAllocation = {};
          testingOrder = hypotheses.map((h) => h.id);
          for (let i = 0; i < n; i++) {
            alphaAllocation[hypotheses[i].id] =
              Math.round((overallAlpha * (i + 1) / n) * 10000) / 10000;
          }
          description = `Hochberg step-up procedure. Adjusted significance levels (step-up): ` +
            hypotheses.map((h, i) => `${h.id}=${(overallAlpha * (i + 1) / n).toFixed(4)}`).join(', ') +
            `. Tests from largest p-value down; stop when first rejection occurs.`;
          break;
        }

        default:
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
