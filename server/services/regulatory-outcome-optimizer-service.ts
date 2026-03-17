import { db } from '../db';
import { eq, and, like, sql, desc, count } from 'drizzle-orm';
import {
  regulatoryOutcomes,
  designParameterCorrelations,
  csrReports,
  csrDetails,
} from 'shared/schema';
import type {
  RegulatoryOutcome,
  DesignParameterCorrelation,
} from 'shared/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DesignRecommendationParams {
  indication: string;
  phase: string;
  drugClass?: string;
  endpoint?: string;
}

interface DesignOption {
  rank: number;
  endpoint: string;
  statisticalMethod: string;
  suggestedSampleSize: number;
  successProbability: number;
  agencyBreakdown: Record<string, { approved: number; total: number; rate: number }>;
  precedentCount: number;
  rationale: string;
}

interface DesignRecommendation {
  indication: string;
  phase: string;
  drugClass?: string;
  options: DesignOption[];
  generatedAt: string;
}

interface RegulatoryPrecedent {
  agency: string;
  decision: string;
  decisionDate: string | null;
  drugClass: string | null;
  endpoint: string | null;
  statisticalMethod: string | null;
  sampleSize: number | null;
  effectSize: number | null;
  pValue: number | null;
  reviewNotes: string | null;
  csrTitle?: string;
}

interface PrecedentSummary {
  indication: string;
  totalOutcomes: number;
  byAgency: Record<string, { approved: number; rejected: number; total: number }>;
  precedents: RegulatoryPrecedent[];
}

interface SensitivityScenario {
  parameter: string;
  value: string;
  predictedSuccessRate: number;
  delta: number;
  sampleSizeImpact: string;
}

interface SensitivityResult {
  baselineSuccessRate: number;
  scenarios: SensitivityScenario[];
  generatedAt: string;
}

interface OutcomeData {
  csrId?: number;
  indication: string;
  phase: string;
  agency: string;
  decision: string;
  decisionDate?: string;
  drugClass?: string;
  primaryEndpoint?: string;
  statisticalMethod?: string;
  sampleSize?: number;
  effectSize?: number;
  pValue?: number;
  designParameters?: Record<string, unknown>;
  reviewNotes?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RegulatoryOutcomeOptimizerService {
  private static instance: RegulatoryOutcomeOptimizerService;

  private constructor() {}

  static getInstance(): RegulatoryOutcomeOptimizerService {
    if (!RegulatoryOutcomeOptimizerService.instance) {
      RegulatoryOutcomeOptimizerService.instance = new RegulatoryOutcomeOptimizerService();
    }
    return RegulatoryOutcomeOptimizerService.instance;
  }

  private getDb() {
    if (!db) {
      throw new Error('Database unavailable');
    }
    return db;
  }

  // -------------------------------------------------------------------------
  // 1. recommendDesign
  // -------------------------------------------------------------------------

  async recommendDesign(
    params: DesignRecommendationParams,
    organizationId: number
  ): Promise<DesignRecommendation> {
    const database = this.getDb();
    const { indication, phase, drugClass, endpoint } = params;

    try {
      // Query historical regulatory outcomes for the indication & phase
      const outcomeFilters = [
        like(regulatoryOutcomes.indication, `%${indication}%`),
        eq(regulatoryOutcomes.phase, phase),
        eq(regulatoryOutcomes.organizationId, organizationId),
      ];

      if (drugClass) {
        outcomeFilters.push(eq(regulatoryOutcomes.drugClass, drugClass));
      }

      const outcomes = await database
        .select()
        .from(regulatoryOutcomes)
        .where(and(...outcomeFilters))
        .orderBy(desc(regulatoryOutcomes.createdAt));

      // Query design-parameter correlations for the indication & phase
      const correlations = await database
        .select()
        .from(designParameterCorrelations)
        .where(
          and(
            like(designParameterCorrelations.indication, `%${indication}%`),
            eq(designParameterCorrelations.phase, phase),
            eq(designParameterCorrelations.organizationId, organizationId)
          )
        );

      // Query CSR reports for additional historical precedents
      const csrPrecedents = await database
        .select({
          id: csrReports.id,
          indication: csrReports.indication,
          phase: csrReports.phase,
          primaryEndpoint: csrReports.primaryEndpoint,
          sampleSize: csrReports.sampleSize,
          studyDesign: csrReports.studyDesign,
        })
        .from(csrReports)
        .where(
          and(
            like(csrReports.indication, `%${indication}%`),
            eq(csrReports.phase, phase),
            eq(csrReports.organizationId, organizationId)
          )
        )
        .limit(50);

      // Build ranked design options from the data
      const options = this.buildDesignOptions(outcomes, correlations, csrPrecedents, endpoint);

      return {
        indication,
        phase,
        drugClass,
        options,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[RegulatoryOutcomeOptimizer] recommendDesign error:', error);
      throw new Error(
        `Failed to generate design recommendations: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private buildDesignOptions(
    outcomes: RegulatoryOutcome[],
    correlations: DesignParameterCorrelation[],
    csrPrecedents: Array<{
      id: number;
      indication: string | null;
      phase: string | null;
      primaryEndpoint: string | null;
      sampleSize: number | null;
      studyDesign: string | null;
    }>,
    filterEndpoint?: string
  ): DesignOption[] {
    // Group outcomes by endpoint + method combination
    const designMap = new Map<
      string,
      {
        endpoint: string;
        method: string;
        approved: number;
        total: number;
        sampleSizes: number[];
        agencyResults: Record<string, { approved: number; total: number }>;
      }
    >();

    for (const outcome of outcomes) {
      const ep = outcome.primaryEndpoint || 'unspecified';
      const method = outcome.statisticalMethod || 'unspecified';

      if (filterEndpoint && !ep.toLowerCase().includes(filterEndpoint.toLowerCase())) {
        continue;
      }

      const key = `${ep}::${method}`;
      if (!designMap.has(key)) {
        designMap.set(key, {
          endpoint: ep,
          method,
          approved: 0,
          total: 0,
          sampleSizes: [],
          agencyResults: {},
        });
      }

      const entry = designMap.get(key)!;
      entry.total += 1;
      const isApproved = outcome.decision.toLowerCase() === 'approved';
      if (isApproved) entry.approved += 1;

      if (outcome.sampleSize) entry.sampleSizes.push(outcome.sampleSize);

      const agency = outcome.agency;
      if (!entry.agencyResults[agency]) {
        entry.agencyResults[agency] = { approved: 0, total: 0 };
      }
      entry.agencyResults[agency].total += 1;
      if (isApproved) entry.agencyResults[agency].approved += 1;
    }

    // Enhance success rates with correlation data
    const correlationMap = new Map<string, number>();
    for (const corr of correlations) {
      correlationMap.set(
        `${corr.parameterName}::${corr.parameterValue}`,
        corr.successRate ?? 0
      );
    }

    // Convert to ranked options
    const options: DesignOption[] = [];
    let rank = 0;

    for (const [, entry] of designMap) {
      const baseRate = entry.total > 0 ? entry.approved / entry.total : 0;

      // Adjust with correlation data if available
      const endpointCorr = correlationMap.get(`endpoint::${entry.endpoint}`) ?? null;
      const methodCorr = correlationMap.get(`statistical_method::${entry.method}`) ?? null;
      let adjustedRate = baseRate;
      if (endpointCorr !== null && methodCorr !== null) {
        adjustedRate = (baseRate + endpointCorr + methodCorr) / 3;
      } else if (endpointCorr !== null) {
        adjustedRate = (baseRate + endpointCorr) / 2;
      } else if (methodCorr !== null) {
        adjustedRate = (baseRate + methodCorr) / 2;
      }

      const medianSampleSize =
        entry.sampleSizes.length > 0
          ? this.median(entry.sampleSizes)
          : this.estimateSampleSize(entry.endpoint);

      const agencyBreakdown: Record<string, { approved: number; total: number; rate: number }> = {};
      for (const [agency, stats] of Object.entries(entry.agencyResults)) {
        agencyBreakdown[agency] = {
          ...stats,
          rate: stats.total > 0 ? stats.approved / stats.total : 0,
        };
      }

      rank += 1;
      options.push({
        rank,
        endpoint: entry.endpoint,
        statisticalMethod: entry.method,
        suggestedSampleSize: medianSampleSize,
        successProbability: Math.round(adjustedRate * 1000) / 1000,
        agencyBreakdown,
        precedentCount: entry.total + csrPrecedents.length,
        rationale: this.generateRationale(entry, adjustedRate),
      });
    }

    // If no historical data, provide heuristic defaults
    if (options.length === 0) {
      options.push({
        rank: 1,
        endpoint: filterEndpoint || 'Overall Survival',
        statisticalMethod: 'Log-rank test',
        suggestedSampleSize: 300,
        successProbability: 0,
        agencyBreakdown: {},
        precedentCount: csrPrecedents.length,
        rationale:
          'No regulatory outcome data available for this combination. Recommendation is based on general clinical trial conventions. Ingest regulatory outcomes to improve predictions.',
      });
    }

    // Sort by success probability descending
    options.sort((a, b) => b.successProbability - a.successProbability);
    options.forEach((opt, idx) => (opt.rank = idx + 1));

    return options;
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  private estimateSampleSize(endpoint: string): number {
    const lower = endpoint.toLowerCase();
    if (lower.includes('survival') || lower.includes('os')) return 400;
    if (lower.includes('pfs') || lower.includes('progression')) return 350;
    if (lower.includes('response') || lower.includes('orr')) return 200;
    if (lower.includes('biomarker')) return 150;
    return 300;
  }

  private generateRationale(
    entry: { endpoint: string; method: string; approved: number; total: number },
    rate: number
  ): string {
    const pct = Math.round(rate * 100);
    if (entry.total === 0) {
      return `No historical outcomes found for ${entry.endpoint} with ${entry.method}.`;
    }
    return (
      `Based on ${entry.total} historical regulatory decision(s), the combination of ` +
      `${entry.endpoint} endpoint with ${entry.method} has a predicted regulatory success ` +
      `probability of ${pct}% (${entry.approved}/${entry.total} approved).`
    );
  }

  // -------------------------------------------------------------------------
  // 2. getRegulatoryPrecedents
  // -------------------------------------------------------------------------

  async getRegulatoryPrecedents(
    indication: string,
    organizationId: number
  ): Promise<PrecedentSummary> {
    const database = this.getDb();

    try {
      const outcomes = await database
        .select()
        .from(regulatoryOutcomes)
        .where(
          and(
            like(regulatoryOutcomes.indication, `%${indication}%`),
            eq(regulatoryOutcomes.organizationId, organizationId)
          )
        )
        .orderBy(desc(regulatoryOutcomes.createdAt));

      // Also fetch CSR report titles for cross-referencing
      const csrTitleMap = new Map<number, string>();
      const csrIds = outcomes.filter((o) => o.csrId !== null).map((o) => o.csrId!);
      if (csrIds.length > 0) {
        const csrs = await database
          .select({ id: csrReports.id, title: csrReports.reportTitle })
          .from(csrReports)
          .where(
            and(
              sql`${csrReports.id} = ANY(${csrIds})`,
              eq(csrReports.organizationId, organizationId)
            )
          );
        for (const csr of csrs) {
          csrTitleMap.set(csr.id, csr.title);
        }
      }

      const byAgency: Record<string, { approved: number; rejected: number; total: number }> = {};
      const precedents: RegulatoryPrecedent[] = [];

      for (const outcome of outcomes) {
        const agency = outcome.agency;
        if (!byAgency[agency]) {
          byAgency[agency] = { approved: 0, rejected: 0, total: 0 };
        }
        byAgency[agency].total += 1;
        if (outcome.decision.toLowerCase() === 'approved') {
          byAgency[agency].approved += 1;
        } else {
          byAgency[agency].rejected += 1;
        }

        precedents.push({
          agency: outcome.agency,
          decision: outcome.decision,
          decisionDate: outcome.decisionDate,
          drugClass: outcome.drugClass,
          endpoint: outcome.primaryEndpoint,
          statisticalMethod: outcome.statisticalMethod,
          sampleSize: outcome.sampleSize,
          effectSize: outcome.effectSize,
          pValue: outcome.pValue,
          reviewNotes: outcome.reviewNotes,
          csrTitle: outcome.csrId ? csrTitleMap.get(outcome.csrId) : undefined,
        });
      }

      return {
        indication,
        totalOutcomes: outcomes.length,
        byAgency,
        precedents,
      };
    } catch (error) {
      console.error('[RegulatoryOutcomeOptimizer] getRegulatoryPrecedents error:', error);
      throw new Error(
        `Failed to retrieve regulatory precedents: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3. runSensitivityAnalysis
  // -------------------------------------------------------------------------

  async runSensitivityAnalysis(
    designParams: {
      indication: string;
      phase: string;
      endpoint?: string;
      sampleSize?: number;
      statisticalMethod?: string;
    },
    organizationId: number
  ): Promise<SensitivityResult> {
    const database = this.getDb();

    try {
      // Get the baseline success rate for the current design
      const baselineCorrelations = await database
        .select()
        .from(designParameterCorrelations)
        .where(
          and(
            like(designParameterCorrelations.indication, `%${designParams.indication}%`),
            eq(designParameterCorrelations.phase, designParams.phase),
            eq(designParameterCorrelations.organizationId, organizationId)
          )
        );

      // Calculate baseline success rate
      let baselineSuccessRate = 0;
      let baselineCount = 0;
      for (const corr of baselineCorrelations) {
        if (corr.successRate !== null) {
          baselineSuccessRate += corr.successRate;
          baselineCount += 1;
        }
      }
      baselineSuccessRate = baselineCount > 0 ? baselineSuccessRate / baselineCount : 0.5;

      // Generate "what-if" scenarios by varying parameters
      const scenarios: SensitivityScenario[] = [];

      // --- Vary endpoint ---
      const endpointCorrelations = baselineCorrelations.filter(
        (c) => c.parameterName === 'endpoint'
      );
      for (const corr of endpointCorrelations) {
        const rate = corr.successRate ?? 0;
        scenarios.push({
          parameter: 'endpoint',
          value: corr.parameterValue,
          predictedSuccessRate: Math.round(rate * 1000) / 1000,
          delta: Math.round((rate - baselineSuccessRate) * 1000) / 1000,
          sampleSizeImpact: this.describeSampleSizeImpact(corr.parameterValue, designParams.sampleSize),
        });
      }

      // --- Vary statistical method ---
      const methodCorrelations = baselineCorrelations.filter(
        (c) => c.parameterName === 'statistical_method'
      );
      for (const corr of methodCorrelations) {
        const rate = corr.successRate ?? 0;
        scenarios.push({
          parameter: 'statistical_method',
          value: corr.parameterValue,
          predictedSuccessRate: Math.round(rate * 1000) / 1000,
          delta: Math.round((rate - baselineSuccessRate) * 1000) / 1000,
          sampleSizeImpact: 'Neutral',
        });
      }

      // --- Vary sample size ---
      const baseSampleSize = designParams.sampleSize || 300;
      const sampleSizeMultipliers = [0.5, 0.75, 1.25, 1.5, 2.0];
      for (const multiplier of sampleSizeMultipliers) {
        const variedSize = Math.round(baseSampleSize * multiplier);
        // Power-based heuristic: higher sample size increases success probability
        const powerGain = Math.min(0.15, Math.log(multiplier) * 0.1);
        const adjustedRate = Math.max(0, Math.min(1, baselineSuccessRate + powerGain));
        scenarios.push({
          parameter: 'sample_size',
          value: String(variedSize),
          predictedSuccessRate: Math.round(adjustedRate * 1000) / 1000,
          delta: Math.round((adjustedRate - baselineSuccessRate) * 1000) / 1000,
          sampleSizeImpact: `${multiplier < 1 ? 'Decrease' : 'Increase'} by ${Math.round(Math.abs(multiplier - 1) * 100)}%`,
        });
      }

      return {
        baselineSuccessRate: Math.round(baselineSuccessRate * 1000) / 1000,
        scenarios,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[RegulatoryOutcomeOptimizer] runSensitivityAnalysis error:', error);
      throw new Error(
        `Failed to run sensitivity analysis: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private describeSampleSizeImpact(endpoint: string, currentSize?: number): string {
    const lower = endpoint.toLowerCase();
    if (lower.includes('survival') || lower.includes('os')) {
      return 'Typically requires larger sample sizes (300-500+)';
    }
    if (lower.includes('response') || lower.includes('orr')) {
      return 'Moderate sample size requirements (150-300)';
    }
    if (lower.includes('biomarker')) {
      return 'Lower sample size requirements (50-200)';
    }
    return currentSize ? `Current: ${currentSize}` : 'Variable';
  }

  // -------------------------------------------------------------------------
  // 4. updateCorrelations
  // -------------------------------------------------------------------------

  async updateCorrelations(organizationId: number): Promise<{ updated: number; created: number }> {
    const database = this.getDb();

    try {
      // Fetch all regulatory outcomes for the organization
      const outcomes = await database
        .select()
        .from(regulatoryOutcomes)
        .where(eq(regulatoryOutcomes.organizationId, organizationId));

      if (outcomes.length === 0) {
        return { updated: 0, created: 0 };
      }

      // Build parameter -> { success, total } maps grouped by (indication, phase)
      const paramStats = new Map<
        string,
        {
          parameterName: string;
          parameterValue: string;
          indication: string;
          phase: string;
          successCount: number;
          totalCount: number;
        }
      >();

      for (const outcome of outcomes) {
        const isSuccess = outcome.decision.toLowerCase() === 'approved';
        const groups: Array<{ name: string; value: string }> = [];

        if (outcome.primaryEndpoint) {
          groups.push({ name: 'endpoint', value: outcome.primaryEndpoint });
        }
        if (outcome.statisticalMethod) {
          groups.push({ name: 'statistical_method', value: outcome.statisticalMethod });
        }
        if (outcome.drugClass) {
          groups.push({ name: 'drug_class', value: outcome.drugClass });
        }
        if (outcome.sampleSize) {
          // Bucket sample sizes
          const bucket = this.sampleSizeBucket(outcome.sampleSize);
          groups.push({ name: 'sample_size_bucket', value: bucket });
        }

        for (const group of groups) {
          const key = `${group.name}::${group.value}::${outcome.indication}::${outcome.phase}`;
          if (!paramStats.has(key)) {
            paramStats.set(key, {
              parameterName: group.name,
              parameterValue: group.value,
              indication: outcome.indication,
              phase: outcome.phase,
              successCount: 0,
              totalCount: 0,
            });
          }
          const stats = paramStats.get(key)!;
          stats.totalCount += 1;
          if (isSuccess) stats.successCount += 1;
        }
      }

      let updated = 0;
      let created = 0;

      for (const [, stats] of paramStats) {
        const successRate = stats.totalCount > 0 ? stats.successCount / stats.totalCount : 0;
        const ci = this.wilsonConfidenceInterval(stats.successCount, stats.totalCount);

        // Try to find existing correlation row
        const existing = await database
          .select()
          .from(designParameterCorrelations)
          .where(
            and(
              eq(designParameterCorrelations.parameterName, stats.parameterName),
              eq(designParameterCorrelations.parameterValue, stats.parameterValue),
              eq(designParameterCorrelations.indication, stats.indication),
              eq(designParameterCorrelations.phase, stats.phase),
              eq(designParameterCorrelations.organizationId, organizationId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await database
            .update(designParameterCorrelations)
            .set({
              successCount: stats.successCount,
              totalCount: stats.totalCount,
              successRate,
              confidenceInterval: ci,
              lastUpdated: new Date(),
            })
            .where(eq(designParameterCorrelations.id, existing[0].id));
          updated += 1;
        } else {
          await database.insert(designParameterCorrelations).values({
            parameterName: stats.parameterName,
            parameterValue: stats.parameterValue,
            indication: stats.indication,
            phase: stats.phase,
            successCount: stats.successCount,
            totalCount: stats.totalCount,
            successRate,
            confidenceInterval: ci,
            organizationId,
          });
          created += 1;
        }
      }

      return { updated, created };
    } catch (error) {
      console.error('[RegulatoryOutcomeOptimizer] updateCorrelations error:', error);
      throw new Error(
        `Failed to update correlations: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private sampleSizeBucket(n: number): string {
    if (n < 50) return '<50';
    if (n < 100) return '50-99';
    if (n < 200) return '100-199';
    if (n < 500) return '200-499';
    if (n < 1000) return '500-999';
    return '1000+';
  }

  private wilsonConfidenceInterval(
    successes: number,
    total: number,
    z: number = 1.96
  ): { lower: number; upper: number } {
    if (total === 0) return { lower: 0, upper: 0 };
    const p = successes / total;
    const denominator = 1 + (z * z) / total;
    const centre = p + (z * z) / (2 * total);
    const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
    return {
      lower: Math.max(0, Math.round(((centre - margin) / denominator) * 1000) / 1000),
      upper: Math.min(1, Math.round(((centre + margin) / denominator) * 1000) / 1000),
    };
  }

  // -------------------------------------------------------------------------
  // 5. ingestRegulatoryOutcome
  // -------------------------------------------------------------------------

  async ingestRegulatoryOutcome(
    outcomeData: OutcomeData,
    organizationId: number
  ): Promise<{ id: number; correlationsUpdated: boolean }> {
    const database = this.getDb();

    try {
      const [inserted] = await database
        .insert(regulatoryOutcomes)
        .values({
          csrId: outcomeData.csrId ?? null,
          indication: outcomeData.indication,
          phase: outcomeData.phase,
          agency: outcomeData.agency,
          decision: outcomeData.decision,
          decisionDate: outcomeData.decisionDate ?? null,
          drugClass: outcomeData.drugClass ?? null,
          primaryEndpoint: outcomeData.primaryEndpoint ?? null,
          statisticalMethod: outcomeData.statisticalMethod ?? null,
          sampleSize: outcomeData.sampleSize ?? null,
          effectSize: outcomeData.effectSize ?? null,
          pValue: outcomeData.pValue ?? null,
          designParameters: outcomeData.designParameters ?? null,
          reviewNotes: outcomeData.reviewNotes ?? null,
          organizationId,
        })
        .returning({ id: regulatoryOutcomes.id });

      // Incrementally update correlations
      let correlationsUpdated = false;
      try {
        await this.updateCorrelations(organizationId);
        correlationsUpdated = true;
      } catch (corrError) {
        console.warn(
          '[RegulatoryOutcomeOptimizer] Correlation update after ingest failed:',
          corrError
        );
      }

      return { id: inserted.id, correlationsUpdated };
    } catch (error) {
      console.error('[RegulatoryOutcomeOptimizer] ingestRegulatoryOutcome error:', error);
      throw new Error(
        `Failed to ingest regulatory outcome: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const regulatoryOutcomeOptimizerService = RegulatoryOutcomeOptimizerService.getInstance();
