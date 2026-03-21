/**
 * Evidence + Confidence Model — Structured Evidence Classification
 *
 * Ensures every AI-generated output in the intelligence layer declares:
 *   - What evidence it's based on (source chain)
 *   - How confident the system is (0-100 scale)
 *   - Whether it's rules-based, validation-based, or AI-inferred
 *
 * This module provides:
 *   - Evidence chain builder
 *   - Confidence score calculator
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
  | 'ai_inferred';      // AI-generated: confidence from model output or heuristics

export interface EvidenceChain {
  readonly primarySource: EvidenceSource;
  readonly supportingSources: readonly EvidenceSource[];
  readonly confidenceBasis: ConfidenceBasis;
  readonly confidenceScore: number | null; // null for rules_based
  readonly chainStrength: 'strong' | 'moderate' | 'weak';
}

export interface EvidenceSource {
  readonly sourceType: EvidenceSourceType;
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly relevance: number; // 0-1
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
      confidenceScore: basis === 'rules_based' ? null : 20,
      chainStrength: 'weak',
    };
  }

  // Sort by relevance, highest first
  const sorted = [...sources].sort((a, b) => b.relevance - a.relevance);
  const primary = sorted[0];
  const supporting = sorted.slice(1);

  const confidence = overrideConfidence
    ?? (basis === 'rules_based' ? null : computeConfidence(sources));

  const strength = getChainStrength(sources, basis, confidence);

  return {
    primarySource: primary,
    supportingSources: supporting,
    confidenceBasis: basis,
    confidenceScore: confidence,
    chainStrength: strength,
  };
}

/**
 * Compute confidence score from evidence factors.
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

  if (chain.confidenceBasis === 'ai_inferred' && (chain.confidenceScore ?? 0) < 40) {
    warnings.push('AI-inferred output has low confidence — consider additional evidence');
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

  lines.push(`Evidence Basis: ${chain.confidenceBasis}`);
  lines.push(`Confidence: ${chain.confidenceScore !== null ? `${chain.confidenceScore}%` : 'Deterministic (rules-based)'}`);
  lines.push(`Chain Strength: ${chain.chainStrength}`);
  lines.push('');
  lines.push(`Primary Source: [${chain.primarySource.sourceType}] ${chain.primarySource.sourceTitle} (relevance: ${chain.primarySource.relevance})`);

  if (chain.supportingSources.length > 0) {
    lines.push('');
    lines.push('Supporting Sources:');
    for (const src of chain.supportingSources) {
      lines.push(`  - [${src.sourceType}] ${src.sourceTitle} (relevance: ${src.relevance})`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL
// ═══════════════════════════════════════════════════════════════════════════════

function getChainStrength(
  sources: EvidenceSource[],
  basis: ConfidenceBasis,
  confidence: number | null,
): 'strong' | 'moderate' | 'weak' {
  if (basis === 'rules_based') return 'strong';

  if (confidence !== null && confidence >= 75 && sources.length >= 2) return 'strong';
  if (confidence !== null && confidence >= 50) return 'moderate';
  return 'weak';
}
