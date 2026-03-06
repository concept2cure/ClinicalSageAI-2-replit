/**
 * Regulatory Precedent Engine
 *
 * Transforms CSR intelligence, FDA clearance data, and adversarial precedents
 * into actionable regulatory strategy during document authoring.
 *
 * Architecture:
 *   CSR Intelligence → Precedent Extractor → Knowledge Graph → Similarity Engine
 *                                                                    ↓
 *                                              Authoring Assistant (claim → precedent → guidance)
 *
 * Capabilities:
 *   1. precedent.search     — Find closest regulatory precedents by submission context
 *   2. precedent.compare    — Compare user's submission against a specific precedent
 *   3. precedent.risk       — Analyze regulatory risks based on historical objections
 *   4. precedent.strategy   — Recommend submission strategy based on precedent patterns
 *   5. authoring.check      — Real-time claim checking during document editing
 *
 * Data sources:
 *   - predicate.fda_510k_clearances      — 510(k) clearance decisions
 *   - predicate.fda_510k_embeddings      — Semantic vectors
 *   - predicate.predicate_lineage        — Predicate device graph
 *   - predicate.predicate_safety_signals — Recalls, MDR, warnings
 *   - adversarial.regulatory_adversarial_precedents — Historical FDA questions
 *   - precedent.regulatory_precedents    — Unified precedent records
 *   - csr_reports / csr_details          — CSR structured data
 *
 * @module server/services/precedent-engine
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('precedent-engine');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PrecedentSearchInput {
  /** Type of submission: 510(k), PMA, NDA, BLA, IND, CER */
  submissionType: string;
  /** Target indication or intended use */
  indication?: string;
  /** Device class (1, 2, 3) */
  deviceClass?: string;
  /** Product type: Device, Drug, Biologic */
  productType?: string;
  /** Therapeutic area: Oncology, CNS, etc. */
  therapeuticArea?: string;
  /** Free-text query for semantic search */
  query?: string;
  /** Device or product name */
  deviceName?: string;
  /** Product code */
  productCode?: string;
  /** Maximum results */
  limit?: number;
}

export interface PrecedentRecord {
  id: string;
  submissionType: string;
  productType: string | null;
  deviceClass: string | null;
  therapeuticArea: string | null;
  indication: string | null;
  clearanceNumber: string | null;
  deviceName: string | null;
  applicant: string | null;
  decisionDate: string | null;
  decisionOutcome: string;
  clearanceType: string | null;
  predicateDevice: string | null;
  predicateKNumber: string | null;
  strategySummary: string | null;
  testingApproach: string | null;
  trialDesign: string | null;
  sampleSize: number | null;
  primaryEndpoint: string | null;
  endpointMet: boolean | null;
  fdaComments: string | null;
  fdaQuestions: string[];
  riskFactors: string[];
  similarityScore?: number;
  sourceType: string | null;
  confidenceScore: number;
}

export interface PrecedentComparison {
  precedent: PrecedentRecord;
  similarities: ComparisonItem[];
  differences: ComparisonItem[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  overallScore: number;
  recommendations: string[];
}

interface ComparisonItem {
  dimension: string;
  userValue: string;
  precedentValue: string;
  match: boolean;
  impact: 'low' | 'medium' | 'high';
  note?: string;
}

export interface RiskAnalysisResult {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  factors: RiskFactor[];
  historicalObjections: HistoricalObjection[];
  mitigationStrategies: string[];
  safetySignals: SafetySignalSummary[];
}

interface RiskFactor {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  precedentCount: number;
  mitigation: string;
}

interface HistoricalObjection {
  question: string;
  agency: string;
  failureMode: string;
  therapeuticArea: string;
  submissionType: string;
  similarity: number;
}

interface SafetySignalSummary {
  kNumber: string;
  deviceName: string;
  signalType: string;
  severity: number;
  description: string;
}

export interface StrategyRecommendation {
  recommendedStrategy: string;
  confidence: number;
  supportingPrecedents: PrecedentRecord[];
  alternativeStrategies: AlternativeStrategy[];
  testingRequirements: string[];
  estimatedTimeline: string;
  keyRisks: string[];
}

interface AlternativeStrategy {
  strategy: string;
  precedentCount: number;
  successRate: number;
  description: string;
}

export interface ClaimCheckResult {
  claim: string;
  supported: boolean;
  precedents: PrecedentRecord[];
  warnings: ClaimWarning[];
  suggestedCitations: string[];
  recommendation: string;
}

interface ClaimWarning {
  type: 'rejection_risk' | 'missing_evidence' | 'contradicted_by_precedent' | 'fda_objection';
  message: string;
  severity: 'low' | 'medium' | 'high';
  precedentId?: string;
}

// ─── Precedent Engine ────────────────────────────────────────────────────────

export class PrecedentEngine {
  // ── 1. SEARCH: Find closest regulatory precedents ──────────────────────

  async search(input: PrecedentSearchInput): Promise<PrecedentRecord[]> {
    const limit = Math.min(input.limit || 10, 50);
    log.info(`Searching precedents: ${input.submissionType}, query="${input.query || ''}"`, {
      submissionType: input.submissionType,
      indication: input.indication,
      deviceClass: input.deviceClass,
    });

    const precedents: PrecedentRecord[] = [];

    // Strategy 1: Search unified precedent table with filters
    const unifiedResults = await this.searchUnifiedPrecedents(input, limit);
    precedents.push(...unifiedResults);

    // Strategy 2: Search 510(k) clearance universe (for device submissions)
    if (['510(k)', '510k', 'PMA', 'De_Novo'].includes(input.submissionType)) {
      const clearanceResults = await this.search510kClearances(input, limit);
      precedents.push(...clearanceResults);
    }

    // Strategy 3: Search adversarial precedents for FDA objection patterns
    const adversarialResults = await this.searchAdversarialPrecedents(input, Math.ceil(limit / 2));
    // Merge adversarial data as risk context into existing precedents
    this.enrichWithAdversarialData(precedents, adversarialResults);

    // Deduplicate by clearance number
    const seen = new Set<string>();
    const deduped = precedents.filter(p => {
      const key = p.clearanceNumber || p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by similarity score descending
    deduped.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));

    log.info(`Found ${deduped.length} precedents`);
    return deduped.slice(0, limit);
  }

  private async searchUnifiedPrecedents(
    input: PrecedentSearchInput,
    limit: number
  ): Promise<PrecedentRecord[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // Always filter by submission type
    conditions.push(`submission_type = $${paramIdx++}`);
    params.push(input.submissionType);

    if (input.productType) {
      conditions.push(`product_type = $${paramIdx++}`);
      params.push(input.productType);
    }
    if (input.deviceClass) {
      conditions.push(`device_class = $${paramIdx++}`);
      params.push(input.deviceClass);
    }
    if (input.therapeuticArea) {
      conditions.push(`therapeutic_area = $${paramIdx++}`);
      params.push(input.therapeuticArea);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT *
      FROM precedent.regulatory_precedents
      ${whereClause}
      ORDER BY decision_date DESC NULLS LAST, confidence_score DESC
      LIMIT $${paramIdx}
    `;
    params.push(limit);

    try {
      const result = await pool.query(query, params);
      return result.rows.map(this.mapPrecedentRow);
    } catch (err: any) {
      log.warn(`Unified precedent search failed: ${err.message}`);
      return [];
    }
  }

  private async search510kClearances(
    input: PrecedentSearchInput,
    limit: number
  ): Promise<PrecedentRecord[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (input.productCode) {
      conditions.push(`c.product_code = $${paramIdx++}`);
      params.push(input.productCode);
    }
    if (input.deviceName) {
      conditions.push(`c.device_name ILIKE $${paramIdx++}`);
      params.push(`%${input.deviceName}%`);
    }
    if (input.deviceClass) {
      conditions.push(`p.device_class = $${paramIdx++}`);
      params.push(input.deviceClass);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        c.k_number,
        c.device_name,
        c.applicant,
        c.product_code,
        c.decision_date,
        c.decision_code,
        c.clearance_type,
        c.txt_content,
        c.statement_or_summary,
        c.third_party_review,
        c.expedited_review,
        p.device_class,
        p.regulation_number,
        p.review_panel,
        p.name AS product_code_name
      FROM predicate.fda_510k_clearances c
      LEFT JOIN predicate.fda_product_codes p ON c.product_code = p.code
      ${whereClause}
      ORDER BY c.decision_date DESC NULLS LAST
      LIMIT $${paramIdx}
    `;
    params.push(limit);

    try {
      const result = await pool.query(query, params);
      return result.rows.map(row => ({
        id: row.k_number,
        submissionType: '510(k)',
        productType: 'Device',
        deviceClass: row.device_class || null,
        therapeuticArea: row.review_panel || null,
        indication: row.product_code_name || null,
        clearanceNumber: row.k_number,
        deviceName: row.device_name,
        applicant: row.applicant,
        decisionDate: row.decision_date?.toISOString?.() || null,
        decisionOutcome: row.decision_code === 'SE' ? 'CLEARED' : row.decision_code || 'UNKNOWN',
        clearanceType: row.clearance_type,
        predicateDevice: null,
        predicateKNumber: null,
        strategySummary: row.txt_content ? row.txt_content.substring(0, 500) : null,
        testingApproach: null,
        trialDesign: null,
        sampleSize: null,
        primaryEndpoint: null,
        endpointMet: null,
        fdaComments: null,
        fdaQuestions: [],
        riskFactors: [],
        similarityScore: 0.5, // Base score for structured match
        sourceType: 'FDA_510k',
        confidenceScore: 1.0,
      }));
    } catch (err: any) {
      log.warn(`510(k) clearance search failed: ${err.message}`);
      return [];
    }
  }

  private async searchAdversarialPrecedents(
    input: PrecedentSearchInput,
    limit: number
  ): Promise<HistoricalObjection[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (input.submissionType) {
      conditions.push(`submission_type = $${paramIdx++}`);
      params.push(input.submissionType);
    }
    if (input.therapeuticArea) {
      conditions.push(`therapeutic_area = $${paramIdx++}`);
      params.push(input.therapeuticArea);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const result = await pool.query(
        `SELECT id, agency_code, failure_mode, historical_question, therapeutic_area, submission_type
         FROM adversarial.regulatory_adversarial_precedents
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIdx}`,
        [...params, limit]
      );

      return result.rows.map(row => ({
        question: row.historical_question,
        agency: row.agency_code,
        failureMode: row.failure_mode,
        therapeuticArea: row.therapeutic_area || '',
        submissionType: row.submission_type || '',
        similarity: 0.7,
      }));
    } catch (err: any) {
      log.warn(`Adversarial precedent search failed: ${err.message}`);
      return [];
    }
  }

  private enrichWithAdversarialData(
    precedents: PrecedentRecord[],
    objections: HistoricalObjection[]
  ): void {
    if (objections.length === 0) return;
    // Attach adversarial questions as risk factors to matching precedents
    for (const p of precedents) {
      const relevant = objections.filter(
        o => o.submissionType === p.submissionType || o.therapeuticArea === p.therapeuticArea
      );
      if (relevant.length > 0) {
        p.fdaQuestions = [...p.fdaQuestions, ...relevant.map(o => o.question)];
        p.riskFactors = [
          ...p.riskFactors,
          ...relevant.map(o => `[${o.failureMode}] ${o.question.substring(0, 200)}`),
        ];
      }
    }
  }

  // ── 2. COMPARE: User submission vs specific precedent ──────────────────

  async compare(
    userContext: {
      submissionType: string;
      deviceName?: string;
      indication?: string;
      trialDesign?: string;
      sampleSize?: number;
      primaryEndpoint?: string;
      testingApproach?: string;
      predicateDevice?: string;
    },
    precedentId: string
  ): Promise<PrecedentComparison> {
    log.info(`Comparing submission against precedent ${precedentId}`);

    // Load the precedent record
    const precedent = await this.getPrecedentById(precedentId);
    if (!precedent) {
      throw new Error(`Precedent ${precedentId} not found`);
    }

    const similarities: ComparisonItem[] = [];
    const differences: ComparisonItem[] = [];

    // Compare each dimension
    const comparisons: {
      dim: string;
      user: string | undefined;
      prec: string | null;
      impact: 'low' | 'medium' | 'high';
    }[] = [
      {
        dim: 'Submission Type',
        user: userContext.submissionType,
        prec: precedent.submissionType,
        impact: 'high',
      },
      {
        dim: 'Device/Product Name',
        user: userContext.deviceName,
        prec: precedent.deviceName,
        impact: 'medium',
      },
      {
        dim: 'Indication',
        user: userContext.indication,
        prec: precedent.indication,
        impact: 'high',
      },
      {
        dim: 'Trial Design',
        user: userContext.trialDesign,
        prec: precedent.trialDesign,
        impact: 'high',
      },
      {
        dim: 'Sample Size',
        user: userContext.sampleSize?.toString(),
        prec: precedent.sampleSize?.toString(),
        impact: 'medium',
      },
      {
        dim: 'Primary Endpoint',
        user: userContext.primaryEndpoint,
        prec: precedent.primaryEndpoint,
        impact: 'high',
      },
      {
        dim: 'Testing Approach',
        user: userContext.testingApproach,
        prec: precedent.testingApproach,
        impact: 'medium',
      },
      {
        dim: 'Predicate Device',
        user: userContext.predicateDevice,
        prec: precedent.predicateDevice,
        impact: 'high',
      },
    ];

    for (const c of comparisons) {
      if (!c.user && !c.prec) continue;
      const userVal = c.user || '(not specified)';
      const precVal = c.prec || '(not specified)';
      const match =
        c.user !== undefined &&
        c.prec !== null &&
        c.user.toLowerCase().trim() === c.prec.toLowerCase().trim();

      const item: ComparisonItem = {
        dimension: c.dim,
        userValue: userVal,
        precedentValue: precVal,
        match,
        impact: c.impact,
      };

      if (match) {
        similarities.push(item);
      } else if (c.user || c.prec) {
        differences.push(item);
      }
    }

    // Calculate risk level
    const highImpactDiffs = differences.filter(d => d.impact === 'high').length;
    const riskLevel =
      highImpactDiffs >= 3
        ? 'critical'
        : highImpactDiffs >= 2
          ? 'high'
          : highImpactDiffs >= 1
            ? 'medium'
            : 'low';

    const totalDims = similarities.length + differences.length;
    const overallScore = totalDims > 0 ? similarities.length / totalDims : 0;

    // Generate recommendations
    const recommendations: string[] = [];
    if (precedent.decisionOutcome === 'CLEARED' || precedent.decisionOutcome === 'APPROVED') {
      if (overallScore >= 0.7) {
        recommendations.push(
          `Strong alignment with cleared precedent ${precedent.clearanceNumber}. Use this as primary comparator.`
        );
      }
      if (precedent.testingApproach) {
        recommendations.push(`Consider replicating testing approach: ${precedent.testingApproach}`);
      }
      if (precedent.strategySummary) {
        recommendations.push(`Reference strategy: ${precedent.strategySummary.substring(0, 200)}`);
      }
    }

    for (const d of differences) {
      if (d.impact === 'high') {
        recommendations.push(
          `Address difference in ${d.dimension}: your "${d.userValue}" vs precedent "${d.precedentValue}"`
        );
      }
    }

    if (precedent.fdaComments) {
      recommendations.push(`FDA reviewer noted: ${precedent.fdaComments.substring(0, 200)}`);
    }

    return {
      precedent,
      similarities,
      differences,
      riskLevel,
      overallScore,
      recommendations,
    };
  }

  // ── 3. RISK ANALYSIS: Regulatory risk from historical objections ───────

  async analyzeRisk(input: PrecedentSearchInput): Promise<RiskAnalysisResult> {
    log.info(`Analyzing regulatory risk for ${input.submissionType}`);

    const factors: RiskFactor[] = [];

    // 1. Check adversarial precedents for historical FDA objections
    const objections = await this.searchAdversarialPrecedents(input, 20);
    const objectionGroups = new Map<string, HistoricalObjection[]>();
    for (const o of objections) {
      const group = objectionGroups.get(o.failureMode) || [];
      group.push(o);
      objectionGroups.set(o.failureMode, group);
    }

    for (const [mode, group] of objectionGroups) {
      const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
        'Clinical Gap': 'high',
        'CMC Inconsistency': 'medium',
        'Safety Signal': 'critical',
        'Bioequivalence Failure': 'high',
        'Manufacturing Deficiency': 'medium',
      };
      factors.push({
        category: mode,
        description: `${group.length} historical objection(s) in this failure mode for ${input.submissionType} submissions`,
        severity: severityMap[mode] || 'medium',
        precedentCount: group.length,
        mitigation: this.getMitigationForFailureMode(mode),
      });
    }

    // 2. Check safety signals for related devices
    const safetySignals = await this.getSafetySignals(input);

    if (safetySignals.length > 0) {
      factors.push({
        category: 'Safety Signal History',
        description: `${safetySignals.length} safety signal(s) found in similar devices (recalls, MDR reports, warnings)`,
        severity: safetySignals.some(s => s.severity > 0.7) ? 'critical' : 'high',
        precedentCount: safetySignals.length,
        mitigation:
          'Include comprehensive safety data addressing known signal patterns in your submission',
      });
    }

    // 3. Check predicate lineage for toxic predicates
    if (['510(k)', '510k'].includes(input.submissionType) && input.productCode) {
      const toxicCount = await this.checkToxicPredicates(input.productCode);
      if (toxicCount > 0) {
        factors.push({
          category: 'Toxic Predicate Risk',
          description: `${toxicCount} predicate(s) in this product code have safety concerns`,
          severity: 'high',
          precedentCount: toxicCount,
          mitigation: 'Avoid toxic predicates. Select predicates with clean safety history.',
        });
      }
    }

    // Calculate overall risk
    const severityWeights = { low: 1, medium: 2, high: 3, critical: 4 };
    const totalWeight = factors.reduce((sum, f) => sum + severityWeights[f.severity], 0);
    const avgWeight = factors.length > 0 ? totalWeight / factors.length : 0;
    const riskScore = Math.min(avgWeight / 4, 1);
    const overallRisk: RiskAnalysisResult['overallRisk'] =
      riskScore >= 0.75
        ? 'critical'
        : riskScore >= 0.5
          ? 'high'
          : riskScore >= 0.25
            ? 'medium'
            : 'low';

    // Generate mitigation strategies
    const mitigationStrategies = factors
      .filter(f => f.severity !== 'low')
      .map(f => f.mitigation)
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    return {
      overallRisk,
      riskScore,
      factors,
      historicalObjections: objections.slice(0, 10),
      mitigationStrategies,
      safetySignals,
    };
  }

  // ── 4. STRATEGY: Recommend submission strategy from precedents ─────────

  async recommendStrategy(input: PrecedentSearchInput): Promise<StrategyRecommendation> {
    log.info(`Recommending strategy for ${input.submissionType}`);

    // Get successful precedents
    const precedents = await this.search({ ...input, limit: 20 });
    const approved = precedents.filter(p => ['CLEARED', 'APPROVED'].includes(p.decisionOutcome));
    const rejected = precedents.filter(p =>
      ['REJECTED', 'CRL', 'REFUSE_TO_FILE'].includes(p.decisionOutcome)
    );

    // Analyze patterns in successful submissions
    const strategyPatterns = new Map<string, { count: number; precedents: PrecedentRecord[] }>();

    for (const p of approved) {
      const strategy = p.strategySummary || p.testingApproach || p.clearanceType || 'Standard';
      const existing = strategyPatterns.get(strategy) || { count: 0, precedents: [] };
      existing.count++;
      existing.precedents.push(p);
      strategyPatterns.set(strategy, existing);
    }

    // Find the most common successful strategy
    let recommendedStrategy = 'Standard submission approach';
    let maxCount = 0;
    for (const [strategy, data] of strategyPatterns) {
      if (data.count > maxCount) {
        maxCount = data.count;
        recommendedStrategy = strategy;
      }
    }

    // Build alternative strategies
    const alternativeStrategies: AlternativeStrategy[] = [];
    for (const [strategy, data] of strategyPatterns) {
      if (strategy === recommendedStrategy) continue;
      alternativeStrategies.push({
        strategy,
        precedentCount: data.count,
        successRate: data.count / (approved.length || 1),
        description: `Used in ${data.count} successful precedent(s)`,
      });
    }

    // Extract common testing requirements from successful precedents
    const testingSet = new Set<string>();
    for (const p of approved) {
      if (p.testingApproach) {
        p.testingApproach.split(/[,;]/).forEach(t => testingSet.add(t.trim()));
      }
    }

    // Key risks from rejected submissions
    const keyRisks: string[] = [];
    for (const r of rejected.slice(0, 5)) {
      if (r.fdaComments) {
        keyRisks.push(r.fdaComments.substring(0, 200));
      }
      for (const q of r.fdaQuestions.slice(0, 2)) {
        keyRisks.push(q);
      }
    }

    const confidence =
      approved.length > 0
        ? Math.min(approved.length / (approved.length + rejected.length + 1), 0.95)
        : 0.3;

    // Estimate timeline based on clearance type
    const timelineMap: Record<string, string> = {
      Traditional: '90-120 days (traditional 510(k))',
      Special: '30-60 days (special 510(k))',
      Abbreviated: '60-90 days (abbreviated 510(k))',
      De_Novo: '150+ days (De Novo classification)',
      Priority: '6-8 months (priority review)',
    };

    return {
      recommendedStrategy,
      confidence,
      supportingPrecedents: approved.slice(0, 5),
      alternativeStrategies: alternativeStrategies.slice(0, 3),
      testingRequirements: Array.from(testingSet).slice(0, 10),
      estimatedTimeline: timelineMap[approved[0]?.clearanceType || ''] || '6-12 months (standard)',
      keyRisks: keyRisks.slice(0, 5),
    };
  }

  // ── 5. AUTHORING ASSISTANT: Real-time claim checking ───────────────────

  async checkClaim(
    claim: string,
    context: { submissionType: string; therapeuticArea?: string; indication?: string }
  ): Promise<ClaimCheckResult> {
    log.info(`Checking claim: "${claim.substring(0, 80)}..."`);

    const warnings: ClaimWarning[] = [];
    const suggestedCitations: string[] = [];

    // Search for relevant precedents based on the claim text
    const precedents = await this.search({
      submissionType: context.submissionType,
      therapeuticArea: context.therapeuticArea,
      indication: context.indication,
      query: claim,
      limit: 5,
    });

    // Search adversarial precedents for contradictions
    const objections = await this.searchAdversarialPrecedents(
      {
        submissionType: context.submissionType,
        therapeuticArea: context.therapeuticArea,
        query: claim,
      },
      5
    );

    // Analyze claim patterns
    const claimLower = claim.toLowerCase();

    // Check for unsupported efficacy claims
    if (claimLower.includes('statistically significant') || claimLower.includes('p <')) {
      const rejected = precedents.filter(
        p => p.decisionOutcome === 'REJECTED' || p.decisionOutcome === 'CRL'
      );
      if (rejected.length > 0) {
        warnings.push({
          type: 'rejection_risk',
          message: `FDA rejected ${rejected.length} similar submission(s) with comparable efficacy claims. Ensure proper multiplicity correction.`,
          severity: 'high',
          precedentId: rejected[0].id,
        });
      }
    }

    // Check for substantial equivalence claims
    if (claimLower.includes('substantial equivalence') || claimLower.includes('predicate')) {
      const cleared = precedents.filter(p => p.decisionOutcome === 'CLEARED' && p.predicateDevice);
      if (cleared.length > 0) {
        for (const c of cleared.slice(0, 3)) {
          suggestedCitations.push(
            `${c.clearanceNumber}: ${c.deviceName} — cleared ${c.decisionDate} via ${c.clearanceType || 'Traditional'} 510(k)`
          );
        }
      }
    }

    // Check for safety claims
    if (
      claimLower.includes('safe') ||
      claimLower.includes('biocompatible') ||
      claimLower.includes('well-tolerated')
    ) {
      for (const o of objections) {
        if (o.failureMode === 'Safety Signal') {
          warnings.push({
            type: 'fda_objection',
            message: `Historical FDA concern: "${o.question.substring(0, 150)}"`,
            severity: 'high',
          });
        }
      }
    }

    // Check for endpoint claims
    if (claimLower.includes('primary endpoint') || claimLower.includes('endpoint met')) {
      for (const o of objections) {
        if (o.failureMode === 'Clinical Gap') {
          warnings.push({
            type: 'fda_objection',
            message: `FDA previously questioned similar endpoint claims: "${o.question.substring(0, 150)}"`,
            severity: 'medium',
          });
        }
      }
    }

    // Add citations from approved precedents
    for (const p of precedents.filter(p => ['CLEARED', 'APPROVED'].includes(p.decisionOutcome))) {
      if (p.clearanceNumber) {
        suggestedCitations.push(
          `${p.clearanceNumber}: ${p.deviceName || p.indication || 'Unknown'} — ${p.decisionOutcome} ${p.decisionDate || ''}`
        );
      }
    }

    const supported =
      warnings.filter(w => w.severity === 'high').length === 0 &&
      precedents.filter(p => ['CLEARED', 'APPROVED'].includes(p.decisionOutcome)).length > 0;

    const recommendation = supported
      ? `Claim is supported by ${precedents.filter(p => ['CLEARED', 'APPROVED'].includes(p.decisionOutcome)).length} approved precedent(s). Include referenced citations.`
      : warnings.length > 0
        ? `Claim requires additional supporting evidence. ${warnings.length} warning(s) identified from historical FDA precedents.`
        : 'No direct precedents found for this claim. Consider adding literature references.';

    return {
      claim,
      supported,
      precedents: precedents.slice(0, 3),
      warnings,
      suggestedCitations: [...new Set(suggestedCitations)].slice(0, 5),
      recommendation,
    };
  }

  // ── 6. INGEST: Store a new precedent from CSR or manual entry ──────────

  async ingestPrecedent(data: Omit<PrecedentRecord, 'id' | 'similarityScore'>): Promise<string> {
    log.info(`Ingesting precedent: ${data.clearanceNumber || data.deviceName || 'unknown'}`);

    const result = await pool.query(
      `INSERT INTO precedent.regulatory_precedents (
        submission_type, product_type, device_class, therapeutic_area, indication,
        clearance_number, device_name, applicant, decision_date, decision_outcome,
        clearance_type, predicate_device, predicate_k_number, strategy_summary,
        testing_approach, trial_design, sample_size, primary_endpoint, endpoint_met,
        fda_comments, fda_questions, risk_factors, source_documents, source_type,
        confidence_score, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26
      ) RETURNING id`,
      [
        data.submissionType,
        data.productType,
        data.deviceClass,
        data.therapeuticArea,
        data.indication,
        data.clearanceNumber,
        data.deviceName,
        data.applicant,
        data.decisionDate,
        data.decisionOutcome,
        data.clearanceType,
        data.predicateDevice,
        data.predicateKNumber,
        data.strategySummary,
        data.testingApproach,
        data.trialDesign,
        data.sampleSize,
        data.primaryEndpoint,
        data.endpointMet,
        data.fdaComments,
        JSON.stringify(data.fdaQuestions || []),
        JSON.stringify(data.riskFactors || []),
        data.sourceDocuments || [],
        data.sourceType,
        data.confidenceScore,
        'system',
      ]
    );

    return result.rows[0].id;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async getPrecedentById(id: string): Promise<PrecedentRecord | null> {
    // Try unified table first
    try {
      const result = await pool.query(
        'SELECT * FROM precedent.regulatory_precedents WHERE id = $1',
        [id]
      );
      if (result.rows.length > 0) {
        return this.mapPrecedentRow(result.rows[0]);
      }
    } catch {
      /* table might not exist */
    }

    // Try 510(k) clearances
    try {
      const result = await pool.query(
        `SELECT c.*, p.device_class, p.review_panel
         FROM predicate.fda_510k_clearances c
         LEFT JOIN predicate.fda_product_codes p ON c.product_code = p.code
         WHERE c.k_number = $1`,
        [id]
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          id: row.k_number,
          submissionType: '510(k)',
          productType: 'Device',
          deviceClass: row.device_class || null,
          therapeuticArea: row.review_panel || null,
          indication: null,
          clearanceNumber: row.k_number,
          deviceName: row.device_name,
          applicant: row.applicant,
          decisionDate: row.decision_date?.toISOString?.() || null,
          decisionOutcome: row.decision_code === 'SE' ? 'CLEARED' : row.decision_code || 'UNKNOWN',
          clearanceType: row.clearance_type,
          predicateDevice: null,
          predicateKNumber: null,
          strategySummary: row.txt_content?.substring(0, 500) || null,
          testingApproach: null,
          trialDesign: null,
          sampleSize: null,
          primaryEndpoint: null,
          endpointMet: null,
          fdaComments: null,
          fdaQuestions: [],
          riskFactors: [],
          sourceType: 'FDA_510k',
          confidenceScore: 1.0,
        };
      }
    } catch {
      /* table might not exist */
    }

    return null;
  }

  private async getSafetySignals(input: PrecedentSearchInput): Promise<SafetySignalSummary[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (input.productCode) {
        conditions.push(`c.product_code = $${paramIdx++}`);
        params.push(input.productCode);
      }
      if (input.deviceName) {
        conditions.push(`c.device_name ILIKE $${paramIdx++}`);
        params.push(`%${input.deviceName}%`);
      }

      if (conditions.length === 0) return [];

      const result = await pool.query(
        `SELECT s.*, c.device_name
         FROM predicate.predicate_safety_signals s
         JOIN predicate.fda_510k_clearances c ON s.k_number = c.k_number
         WHERE ${conditions.join(' AND ')}
         ORDER BY s.severity_score DESC
         LIMIT 10`,
        params
      );

      return result.rows.map(row => ({
        kNumber: row.k_number,
        deviceName: row.device_name,
        signalType: row.signal_type,
        severity: row.severity_score,
        description: row.description || '',
      }));
    } catch (err: any) {
      log.warn(`Safety signal query failed: ${err.message}`);
      return [];
    }
  }

  private async checkToxicPredicates(productCode: string): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM predicate.toxic_predicates WHERE product_code = $1`,
        [productCode]
      );
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch {
      return 0;
    }
  }

  private getMitigationForFailureMode(mode: string): string {
    const mitigations: Record<string, string> = {
      'Clinical Gap':
        'Provide comprehensive clinical data. Consider conducting additional clinical studies or systematic literature review.',
      'CMC Inconsistency':
        'Ensure manufacturing consistency. Address all CMC sections per ICH Q-series guidelines.',
      'Safety Signal':
        'Include comprehensive safety analysis. Address known adverse events with risk mitigation measures.',
      'Bioequivalence Failure':
        'Strengthen bioequivalence study design. Consider alternative statistical approaches.',
      'Manufacturing Deficiency':
        'Provide detailed manufacturing process descriptions. Include process validation data.',
    };
    return (
      mitigations[mode] ||
      'Address identified concerns with supporting evidence in your submission.'
    );
  }

  private mapPrecedentRow(row: any): PrecedentRecord {
    return {
      id: row.id,
      submissionType: row.submission_type,
      productType: row.product_type || null,
      deviceClass: row.device_class || null,
      therapeuticArea: row.therapeutic_area || null,
      indication: row.indication || null,
      clearanceNumber: row.clearance_number || null,
      deviceName: row.device_name || null,
      applicant: row.applicant || null,
      decisionDate: row.decision_date?.toISOString?.() || null,
      decisionOutcome: row.decision_outcome,
      clearanceType: row.clearance_type || null,
      predicateDevice: row.predicate_device || null,
      predicateKNumber: row.predicate_k_number || null,
      strategySummary: row.strategy_summary || null,
      testingApproach: row.testing_approach || null,
      trialDesign: row.trial_design || null,
      sampleSize: row.sample_size || null,
      primaryEndpoint: row.primary_endpoint || null,
      endpointMet: row.endpoint_met ?? null,
      fdaComments: row.fda_comments || null,
      fdaQuestions: row.fda_questions || [],
      riskFactors: row.risk_factors || [],
      sourceType: row.source_type || null,
      confidenceScore: row.confidence_score ?? 1.0,
    };
  }
}

// Singleton instance
export const precedentEngine = new PrecedentEngine();
