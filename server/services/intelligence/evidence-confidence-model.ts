/**
 * Evidence + Confidence Model — Structured Evidence Classification
 *
 * Ensures every AI-generated output in the intelligence layer declares:
 *   - What evidence it's based on (source chain)
 *   - A confidence (0-100) only when one was measured and stated; otherwise a
 *     heuristic evidence coverage (0-100), labelled as one
 *   - Whether it's rules-based, validation-based, or AI-inferred
 *
 * This module provides:
 *   - Evidence chain builder
 *   - Heuristic evidence-coverage calculator (computeConfidence)
 *   - Evidence validation
 *   - Audit-ready evidence formatting
 *
 * @module server/services/intelligence/evidence-confidence-model
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type EvidenceSourceType =
  | 'readiness_criterion'
  | 'validation_result'
  | 'document_state'
  | 'historical_pattern'
  | 'regulatory_reference'
  | 'user_feedback'
  | 'ai_analysis'
  | 'cross_reference';

export type ConfidenceBasis =
  | 'rules_based'       // Deterministic: confidence = null (implicit 100%)
  | 'validation_based'  // From validation engine: confidence derived from rule match
  | 'ai_inferred';      // AI-generated: a confidence only when the model or caller states one

export interface EvidenceChain {
  readonly primarySource: EvidenceSource;
  readonly supportingSources: readonly EvidenceSource[];
  readonly confidenceBasis: ConfidenceBasis;
  /**
   * A confidence the caller measured and stated (overrideConfidence); null when
   * none was, and always for rules_based. 2026-10-15: held computeConfidence's
   * heuristic, which a RIM chain computes from fixed evidence weights, and was
   * persisted and printed as a confidence.
   */
  readonly confidenceScore: number | null;
  /**
   * Heuristic evidence coverage, 0-100 (computeConfidence): from the number of
   * sources, their relevance, kinds and recency. Not a confidence. Absent on a
   * rules-based chain and on a chain with no evidence.
   */
  readonly evidenceCoverage?: number;
  /** Graded from a stated confidence, else from evidenceCoverage; 'strong' for rules_based. */
  readonly chainStrength: 'strong' | 'moderate' | 'weak';
}

export interface EvidenceSource {
  readonly sourceType: EvidenceSourceType;
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly relevance: number; // 0-1
  /**
   * 'fixed_weight': `relevance` is a weight set by hand per kind of evidence
   * (recommendation-engine's EVIDENCE_WEIGHT), not a measurement. Absent: the
   * caller's own figure.
   */
  readonly relevanceBasis?: 'fixed_weight';
  readonly extractedValue?: string;
  readonly timestamp?: string;
}

export interface ConfidenceFactors {
  readonly evidenceCount: number;
  readonly averageRelevance: number;
  readonly hasRegulatoryReference: boolean;
  readonly hasUserVerification: boolean;
  readonly recency: 'current' | 'recent' | 'stale';
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE CHAIN BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build an evidence chain from a set of sources.
 */
export function buildEvidenceChain(
  sources: EvidenceSource[],
  basis: ConfidenceBasis,
  overrideConfidence?: number,
): EvidenceChain {
  if (sources.length === 0) {
    return {
      primarySource: {
        sourceType: 'ai_analysis',
        sourceId: 'none',
        sourceTitle: 'No evidence available',
        relevance: 0,
      },
      supportingSources: [],
      confidenceBasis: basis,
      // Was 20 unless rules_based: a confidence for a chain with no evidence.
      confidenceScore: null,
      chainStrength: 'weak',
    };
  }

  // Sort by relevance, highest first
  const sorted = [...sources].sort((a, b) => b.relevance - a.relevance);
  const primary = sorted[0];
  const supporting = sorted.slice(1);

  // 2026-10-15: the heuristic was the confidence (`override ?? computeConfidence`);
  // over a RIM chain's fixed weights a profile risk read "Confidence: 65%".
  const confidence = overrideConfidence ?? null;
  const evidenceCoverage = basis === 'rules_based' ? undefined : computeConfidence(sources);

  const strength = getChainStrength(sources, basis, confidence ?? evidenceCoverage ?? null);

  return {
    primarySource: primary,
    supportingSources: supporting,
    confidenceBasis: basis,
    confidenceScore: confidence,
    evidenceCoverage,
    chainStrength: strength,
  };
}

/**
 * Heuristic evidence coverage (0-100): base 40, plus terms for the number of
 * sources, their mean relevance, their kinds and recency. Not a confidence —
 * nothing here measures one; the name predates that. buildEvidenceChain keeps
 * it as `evidenceCoverage`.
 */
export function computeConfidence(sources: EvidenceSource[]): number {
  if (sources.length === 0) return 20;

  const factors = analyzeFactors(sources);

  let score = 40; // Base confidence

  // Evidence count boost (more sources = higher confidence, diminishing returns)
  score += Math.min(factors.evidenceCount * 8, 25);

  // Average relevance boost
  score += factors.averageRelevance * 20;

  // Regulatory reference boost
  if (factors.hasRegulatoryReference) score += 10;

  // User verification boost
  if (factors.hasUserVerification) score += 10;

  // Recency adjustment
  if (factors.recency === 'stale') score -= 10;
  else if (factors.recency === 'current') score += 5;

  return Math.max(10, Math.min(100, Math.round(score)));
}

/**
 * Analyze evidence factors for confidence computation.
 */
export function analyzeFactors(sources: EvidenceSource[]): ConfidenceFactors {
  const relevances = sources.map(s => s.relevance);
  const averageRelevance = relevances.length > 0
    ? relevances.reduce((a, b) => a + b, 0) / relevances.length
    : 0;

  const hasRegulatoryReference = sources.some(s => s.sourceType === 'regulatory_reference');
  const hasUserVerification = sources.some(s => s.sourceType === 'user_feedback');

  // Check recency
  const now = Date.now();
  const timestamps = sources
    .filter(s => s.timestamp)
    .map(s => new Date(s.timestamp!).getTime());

  let recency: 'current' | 'recent' | 'stale' = 'recent';
  if (timestamps.length > 0) {
    const newest = Math.max(...timestamps);
    const daysSinceNewest = (now - newest) / (1000 * 60 * 60 * 24);
    if (daysSinceNewest <= 7) recency = 'current';
    else if (daysSinceNewest > 30) recency = 'stale';
  }

  return {
    evidenceCount: sources.length,
    averageRelevance,
    hasRegulatoryReference,
    hasUserVerification,
    recency,
  };
}

/**
 * Validate that an evidence chain meets minimum quality thresholds.
 */
export function validateEvidenceChain(chain: EvidenceChain): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (chain.primarySource.relevance < 0.3) {
    warnings.push('Primary evidence source has low relevance');
  }

  // Read the heuristic as what it is: an unstated confidence is not a low one.
  if (chain.confidenceBasis === 'ai_inferred' && chain.evidenceCoverage !== undefined && chain.evidenceCoverage < 40) {
    warnings.push('AI-inferred output has low evidence coverage (heuristic) — consider additional evidence');
  }

  if (chain.supportingSources.length === 0 && chain.confidenceBasis !== 'rules_based') {
    warnings.push('No supporting evidence sources — single-source claim');
  }

  if (chain.chainStrength === 'weak') {
    warnings.push('Evidence chain is weak — recommendation should be flagged for review');
  }

  return {
    isValid: warnings.length <= 1, // Allow one warning
    warnings,
  };
}

/**
 * Format evidence chain for audit trail / regulatory compliance.
 */
export function formatEvidenceForAudit(chain: EvidenceChain): string {
  const lines: string[] = [];
  const relevance = (src: EvidenceSource) =>
    `relevance: ${src.relevance}${src.relevanceBasis === 'fixed_weight' ? ', fixed weight' : ''}`;
  const fromHeuristic = chain.confidenceScore === null && chain.evidenceCoverage !== undefined;

  lines.push(`Evidence Basis: ${chain.confidenceBasis}`);
  // 2026-10-15: a null confidence read "Deterministic" whatever the basis, and
  // the heuristic below was printed as "Confidence: NN%".
  lines.push(`Confidence: ${
    chain.confidenceScore !== null ? `${chain.confidenceScore}%`
      : chain.confidenceBasis === 'rules_based' ? 'Deterministic (rules-based)'
        : 'not assessed — no confidence was measured'
  }`);
  if (chain.evidenceCoverage !== undefined) {
    lines.push(`Evidence coverage (heuristic, not a confidence): ${chain.evidenceCoverage}/100, from the number of sources, their relevance, kinds and recency`);
  }
  lines.push(`Chain Strength${fromHeuristic ? ' (from that heuristic)' : ''}: ${chain.chainStrength}`);
  lines.push('');
  lines.push(`Primary Source: [${chain.primarySource.sourceType}] ${chain.primarySource.sourceTitle} (${relevance(chain.primarySource)})`);

  if (chain.supportingSources.length > 0) {
    lines.push('');
    lines.push('Supporting Sources:');
    for (const src of chain.supportingSources) {
      lines.push(`  - [${src.sourceType}] ${src.sourceTitle} (${relevance(src)})`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL
// ═══════════════════════════════════════════════════════════════════════════════

/** `graded`: the stated confidence, else the heuristic evidence coverage. */
function getChainStrength(
  sources: EvidenceSource[],
  basis: ConfidenceBasis,
  graded: number | null,
): 'strong' | 'moderate' | 'weak' {
  if (basis === 'rules_based') return 'strong';

  if (graded !== null && graded >= 75 && sources.length >= 2) return 'strong';
  if (graded !== null && graded >= 50) return 'moderate';
  return 'weak';
}
