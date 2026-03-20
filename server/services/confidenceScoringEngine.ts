/**
 * @fileoverview Confidence Scoring & Data Verification Engine
 * @module server/services/confidenceScoringEngine
 * @version 1.0.0
 *
 * Addresses P1 audit gaps:
 * - "4.6 Is there confidence scoring for data integrity? ⚠️ Partial —
 *    Scores stored but not auto-calculated; require manual assignment"
 * - "4.2 Is automated data verification implemented? ⚠️ Partial —
 *    Rule-based, not comprehensive automated verification across all claim types"
 *
 * Provides:
 * 1. Auto-calculated confidence scores for evidence objects
 * 2. Auto-calculated quality scores for artifacts
 * 3. Multi-factor verification engine (not just rule-based)
 * 4. Cross-validation between claims and source data
 * 5. Anomaly detection for statistical claims
 * 6. Regulatory completeness scoring
 *
 * @compliance FDA 21 CFR Part 11, ICH E6(R3), data integrity principles
 */

import { pool } from '../db.js';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConfidenceScore {
  overallScore: number; // 0-1
  factors: ConfidenceFactor[];
  interpretation: 'high' | 'medium' | 'low' | 'insufficient';
  recommendations: string[];
  computedAt: string;
  method: 'multi-factor' | 'heuristic' | 'ai-assessed';
}

export interface ConfidenceFactor {
  name: string;
  weight: number; // 0-1, how much this factor contributes
  score: number; // 0-1, factor score
  weightedScore: number; // weight × score
  details: string;
}

export interface VerificationResult {
  id: string;
  entityType: 'evidence' | 'artifact' | 'claim' | 'table' | 'section';
  entityId: string;
  verificationStatus: 'verified' | 'partially_verified' | 'unverified' | 'failed' | 'flagged';
  confidenceScore: ConfidenceScore;
  checks: VerificationCheck[];
  anomalies: DataAnomaly[];
  completenessScore: number; // 0-1, regulatory completeness
  verifiedAt: string;
}
import { ai } from '../lib/unified-ai-client';

export interface VerificationCheck {
  checkId: string;
  checkName: string;
  category:
    | 'source_match'
    | 'statistical'
    | 'format'
    | 'completeness'
    | 'consistency'
    | 'regulatory'
    | 'cross_reference';
  result: 'pass' | 'fail' | 'warning' | 'skipped';
  details: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
}

export interface DataAnomaly {
  type:
    | 'statistical_outlier'
    | 'missing_data'
    | 'inconsistency'
    | 'format_error'
    | 'stale_reference';
  description: string;
  location?: string;
  severity: 'high' | 'medium' | 'low';
  suggestedAction: string;
}

export interface BatchVerificationResult {
  projectId: number;
  organizationId: number;
  totalEntities: number;
  verified: number;
  failed: number;
  flagged: number;
  averageConfidence: number;
  results: VerificationResult[];
  verifiedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-COMPUTED CONFIDENCE SCORES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Auto-compute confidence score for an evidence object.
 * Uses multi-factor scoring instead of manual assignment.
 */
export async function computeEvidenceConfidence(
  evidenceId: string,
  organizationId: number
): Promise<ConfidenceScore> {
  const factors: ConfidenceFactor[] = [];

  try {
    // Load evidence object
    const result = await pool.query(
      `SELECT * FROM evidence_objects WHERE id = $1::uuid AND organization_id = $2`,
      [evidenceId, organizationId]
    );
    if (result.rows.length === 0) {
      return buildScore(factors, 'heuristic');
    }

    const ev = result.rows[0];

    // Factor 1: Source completeness (0.20 weight)
    {
      let score = 0;
      if (ev.source_reference) score += 0.25;
      if (ev.source_citation) score += 0.25;
      if (ev.doi || ev.pmid) score += 0.25;
      if (ev.authors && JSON.parse(ev.authors || '[]').length > 0) score += 0.25;
      factors.push({
        name: 'source_completeness',
        weight: 0.2,
        score,
        weightedScore: 0.2 * score,
        details: `Source fields: ${[ev.source_reference ? 'ref' : '', ev.source_citation ? 'citation' : '', ev.doi ? 'DOI' : ev.pmid ? 'PMID' : '', ev.authors ? 'authors' : ''].filter(Boolean).join(', ') || 'none'}`,
      });
    }

    // Factor 2: Evidence level (0.20 weight)
    {
      const levelScores: Record<string, number> = {
        I: 1.0,
        II: 0.85,
        III: 0.65,
        IV: 0.45,
        V: 0.25,
      };
      const score = levelScores[ev.evidence_level] || 0.3;
      factors.push({
        name: 'evidence_level',
        weight: 0.2,
        score,
        weightedScore: 0.2 * score,
        details: `Level ${ev.evidence_level || 'unknown'} evidence`,
      });
    }

    // Factor 3: Verification status (0.20 weight)
    {
      const score = ev.is_verified ? 1.0 : 0.2;
      factors.push({
        name: 'verification_status',
        weight: 0.2,
        score,
        weightedScore: 0.2 * score,
        details: ev.is_verified ? `Verified by ${ev.verified_by || 'unknown'}` : 'Not yet verified',
      });
    }

    // Factor 4: Content quality (0.15 weight)
    {
      let score = 0;
      if (ev.excerpt && ev.excerpt.length > 50) score += 0.3;
      if (ev.description && ev.description.length > 100) score += 0.3;
      if (ev.test_results) score += 0.2;
      if (ev.page_range) score += 0.2;
      factors.push({
        name: 'content_quality',
        weight: 0.15,
        score,
        weightedScore: 0.15 * score,
        details: `Content: ${ev.excerpt?.length || 0} chars excerpt, ${ev.description?.length || 0} chars description`,
      });
    }

    // Factor 5: Linkage density (0.15 weight)
    {
      const linkResult = await pool.query(
        `SELECT COUNT(*) as link_count FROM evidence_links WHERE evidence_id = $1::uuid`,
        [evidenceId]
      );
      const linkCount = parseInt(linkResult.rows[0]?.link_count || '0');
      const score = Math.min(linkCount / 5, 1); // 5+ links = full score
      factors.push({
        name: 'linkage_density',
        weight: 0.15,
        score,
        weightedScore: 0.15 * score,
        details: `${linkCount} linked claims/sections`,
      });
    }

    // Factor 6: Recency (0.10 weight)
    {
      const createdAt = new Date(ev.created_at);
      const ageMonths = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
      const score = ageMonths < 6 ? 1.0 : ageMonths < 12 ? 0.8 : ageMonths < 24 ? 0.6 : 0.3;
      factors.push({
        name: 'recency',
        weight: 0.1,
        score,
        weightedScore: 0.1 * score,
        details: `Evidence age: ${Math.round(ageMonths)} months`,
      });
    }

    const confidenceScore = buildScore(factors, 'multi-factor');

    // Auto-update the evidence object's quality_score
    await pool.query(
      `UPDATE evidence_objects SET quality_score = $1, relevance_score = $2, updated_at = NOW()
       WHERE id = $3::uuid AND organization_id = $4`,
      [confidenceScore.overallScore, confidenceScore.overallScore, evidenceId, organizationId]
    );

    return confidenceScore;
  } catch (error) {
    console.error('[ConfidenceScoring] Failed to compute evidence confidence:', error);
    return buildScore(factors, 'heuristic');
  }
}

/**
 * Auto-compute confidence scores for ALL evidence objects in a project.
 */
export async function batchComputeConfidence(
  organizationId: number,
  options?: { limit?: number; onlyUnscored?: boolean }
): Promise<{ computed: number; averageScore: number }> {
  try {
    const where = options?.onlyUnscored ? `AND (quality_score IS NULL OR quality_score = 0)` : '';

    const result = await pool.query(
      `SELECT id FROM evidence_objects
       WHERE organization_id = $1 ${where}
       ORDER BY created_at DESC LIMIT $2`,
      [organizationId, options?.limit || 500]
    );

    let totalScore = 0;
    let computed = 0;

    for (const row of result.rows) {
      const score = await computeEvidenceConfidence(row.id, organizationId);
      totalScore += score.overallScore;
      computed++;
    }

    return {
      computed,
      averageScore: computed > 0 ? Math.round((totalScore / computed) * 100) / 100 : 0,
    };
  } catch (error) {
    console.error('[ConfidenceScoring] Batch computation failed:', error);
    return { computed: 0, averageScore: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA VERIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify a claim against its source evidence using multi-method verification.
 */
export async function verifyClaim(
  claimText: string,
  sourceEvidenceIds: string[],
  organizationId: number,
  options?: {
    checkStatistical?: boolean;
    checkConsistency?: boolean;
    checkCompleteness?: boolean;
  }
): Promise<VerificationResult> {
  const checks: VerificationCheck[] = [];
  const anomalies: DataAnomaly[] = [];

  // Load source evidence
  const sources = await loadEvidence(sourceEvidenceIds, organizationId);

  // Check 1: Source match — does the claim text match sources?
  const sourceMatchCheck = await checkSourceMatch(claimText, sources);
  checks.push(sourceMatchCheck);

  // Check 2: Statistical verification — check p-values, CIs, etc.
  if (options?.checkStatistical !== false) {
    const statisticalCheck = checkStatisticalClaims(claimText, sources);
    checks.push(...statisticalCheck.checks);
    anomalies.push(...statisticalCheck.anomalies);
  }

  // Check 3: Format compliance
  const formatCheck = checkFormatCompliance(claimText);
  checks.push(formatCheck);

  // Check 4: Completeness — are required elements present?
  if (options?.checkCompleteness !== false) {
    const completenessCheck = checkClaimCompleteness(claimText, sources);
    checks.push(completenessCheck);
  }

  // Check 5: Cross-reference consistency
  if (options?.checkConsistency !== false) {
    const consistencyCheck = await checkCrossReferenceConsistency(claimText, organizationId);
    checks.push(consistencyCheck);
  }

  // Compute overall verification status
  const failedChecks = checks.filter(c => c.result === 'fail');
  const warningChecks = checks.filter(c => c.result === 'warning');
  const criticalFails = failedChecks.filter(c => c.severity === 'critical');

  let verificationStatus: VerificationResult['verificationStatus'];
  if (criticalFails.length > 0) {
    verificationStatus = 'failed';
  } else if (failedChecks.length > 0) {
    verificationStatus = 'flagged';
  } else if (warningChecks.length > 0) {
    verificationStatus = 'partially_verified';
  } else {
    verificationStatus = 'verified';
  }

  // Compute confidence score from checks
  const factors: ConfidenceFactor[] = checks.map(c => ({
    name: c.checkName,
    weight: c.severity === 'critical' ? 0.3 : c.severity === 'major' ? 0.2 : 0.1,
    score: c.result === 'pass' ? 1.0 : c.result === 'warning' ? 0.5 : 0.0,
    weightedScore: 0,
    details: c.details,
  }));

  // Normalize weights
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  for (const f of factors) {
    f.weight = totalWeight > 0 ? f.weight / totalWeight : 0;
    f.weightedScore = f.weight * f.score;
  }

  const confidenceScore = buildScore(factors, 'multi-factor');

  const completenessScore = computeCompleteness(checks);

  return {
    id: crypto.randomUUID(),
    entityType: 'claim',
    entityId: crypto.createHash('md5').update(claimText).digest('hex'),
    verificationStatus,
    confidenceScore,
    checks,
    anomalies,
    completenessScore,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Batch-verify all claims in a section/document.
 */
export async function batchVerifyDocument(
  documentContent: string,
  projectId: number,
  organizationId: number
): Promise<BatchVerificationResult> {
  const results: VerificationResult[] = [];

  // Split into claim-bearing sentences (filter out headings, short lines)
  const sentences = documentContent
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && !s.startsWith('#'));

  // Load all evidence for the organization
  const allEvidence = await pool.query(
    `SELECT id FROM evidence_objects WHERE organization_id = $1 LIMIT 200`,
    [organizationId]
  );
  const evidenceIds = allEvidence.rows.map((r: any) => r.id);

  // Verify each sentence (batch for efficiency)
  for (const sentence of sentences.slice(0, 100)) {
    try {
      const result = await verifyClaim(
        sentence,
        evidenceIds.slice(0, 20), // Limit sources per claim
        organizationId,
        { checkStatistical: true, checkConsistency: false, checkCompleteness: true }
      );
      results.push(result);
    } catch {
      // Skip failed verifications
    }
  }

  const verified = results.filter(r => r.verificationStatus === 'verified').length;
  const failed = results.filter(r => r.verificationStatus === 'failed').length;
  const flagged = results.filter(r => r.verificationStatus === 'flagged').length;
  const avgConfidence =
    results.length > 0
      ? results.reduce((s, r) => s + r.confidenceScore.overallScore, 0) / results.length
      : 0;

  return {
    projectId,
    organizationId,
    totalEntities: results.length,
    verified,
    failed,
    flagged,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    results,
    verifiedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

async function checkSourceMatch(
  claimText: string,
  sources: EvidenceRecord[]
): Promise<VerificationCheck> {
  if (sources.length === 0) {
    return {
      checkId: crypto.randomUUID(),
      checkName: 'source_match',
      category: 'source_match',
      result: 'fail',
      details: 'No source evidence linked to this claim',
      severity: 'critical',
    };
  }

  // Use AI to verify claim against source excerpts
  try {
    const sourceTexts = sources
      .slice(0, 5)
      .map(s => `Source: ${s.title}\nExcerpt: ${(s.excerpt || s.description || '').slice(0, 500)}`)
      .join('\n\n');

    const aiResult = await ai.chat({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Verify if the claim is supported by the provided source evidence.
Return JSON: {
  "supported": true/false,
  "confidence": 0-1,
  "verdict": "supported|contradicted|partially_supported|unsupported",
  "reasoning": "brief explanation"
}`,
        },
        {
          role: 'user',
          content: `CLAIM: ${claimText}\n\nSOURCE EVIDENCE:\n${sourceTexts}`,
        },
      ],
    });

    const parsed = JSON.parse(aiResult.content || '{}');

    if (parsed.supported && parsed.confidence >= 0.7) {
      return {
        checkId: crypto.randomUUID(),
        checkName: 'source_match',
        category: 'source_match',
        result: 'pass',
        details: `Claim supported (${Math.round(parsed.confidence * 100)}% confidence): ${parsed.reasoning || ''}`,
        severity: 'critical',
      };
    } else if (parsed.verdict === 'contradicted') {
      return {
        checkId: crypto.randomUUID(),
        checkName: 'source_match',
        category: 'source_match',
        result: 'fail',
        details: `Claim CONTRADICTED by source: ${parsed.reasoning || ''}`,
        severity: 'critical',
      };
    } else {
      return {
        checkId: crypto.randomUUID(),
        checkName: 'source_match',
        category: 'source_match',
        result: 'warning',
        details: `Claim ${parsed.verdict || 'partially supported'} (${Math.round((parsed.confidence || 0) * 100)}%): ${parsed.reasoning || ''}`,
        severity: 'major',
      };
    }
  } catch {
    return {
      checkId: crypto.randomUUID(),
      checkName: 'source_match',
      category: 'source_match',
      result: 'skipped',
      details: 'AI verification unavailable — manual review required',
      severity: 'major',
    };
  }
}

function checkStatisticalClaims(
  claimText: string,
  sources: EvidenceRecord[]
): { checks: VerificationCheck[]; anomalies: DataAnomaly[] } {
  const checks: VerificationCheck[] = [];
  const anomalies: DataAnomaly[] = [];

  // Check for p-values
  const pValueMatch = claimText.match(/p\s*[<=<]\s*(\d+\.?\d*)/i);
  if (pValueMatch) {
    const pValue = parseFloat(pValueMatch[1]);
    if (pValue > 1 || pValue < 0) {
      anomalies.push({
        type: 'statistical_outlier',
        description: `Invalid p-value: ${pValue} (must be 0-1)`,
        location: pValueMatch[0],
        severity: 'high',
        suggestedAction: 'Verify p-value with source data',
      });
      checks.push({
        checkId: crypto.randomUUID(),
        checkName: 'p_value_range',
        category: 'statistical',
        result: 'fail',
        details: `p-value ${pValue} is out of valid range (0-1)`,
        severity: 'critical',
      });
    } else {
      checks.push({
        checkId: crypto.randomUUID(),
        checkName: 'p_value_range',
        category: 'statistical',
        result: 'pass',
        details: `p-value ${pValue} is in valid range`,
        severity: 'major',
      });
    }
  }

  // Check for confidence intervals
  const ciMatch = claimText.match(
    /(\d+\.?\d*)%?\s*(?:CI|confidence interval)\s*[:(]\s*(\d+\.?\d*)\s*[-–,]\s*(\d+\.?\d*)/i
  );
  if (ciMatch) {
    const lower = parseFloat(ciMatch[2]);
    const upper = parseFloat(ciMatch[3]);
    if (lower >= upper) {
      anomalies.push({
        type: 'statistical_outlier',
        description: `CI lower bound (${lower}) >= upper bound (${upper})`,
        location: ciMatch[0],
        severity: 'high',
        suggestedAction: 'Verify CI bounds with source statistics',
      });
      checks.push({
        checkId: crypto.randomUUID(),
        checkName: 'ci_bounds',
        category: 'statistical',
        result: 'fail',
        details: `CI bounds inverted: ${lower} >= ${upper}`,
        severity: 'critical',
      });
    } else {
      checks.push({
        checkId: crypto.randomUUID(),
        checkName: 'ci_bounds',
        category: 'statistical',
        result: 'pass',
        details: `CI bounds valid: ${lower} to ${upper}`,
        severity: 'major',
      });
    }
  }

  // Check for percentages > 100
  const percentMatches = claimText.matchAll(/(\d+\.?\d*)%/g);
  for (const match of percentMatches) {
    const pct = parseFloat(match[1]);
    if (pct > 100) {
      anomalies.push({
        type: 'statistical_outlier',
        description: `Percentage ${pct}% exceeds 100%`,
        location: match[0],
        severity: 'medium',
        suggestedAction: 'Verify if this is a relative change or actual percentage',
      });
    }
  }

  return { checks, anomalies };
}

function checkFormatCompliance(claimText: string): VerificationCheck {
  const issues: string[] = [];

  // Check for unsupported absolute claims
  if (
    /\b(always|never|all patients|100%|zero)\b/i.test(claimText) &&
    !/\b(not always|not never)\b/i.test(claimText)
  ) {
    issues.push('Absolute claim detected — should be qualified');
  }

  // Check for missing units
  if (/\b\d+\.?\d*\s*(?:mg|kg|ml|μg|ng|mmol|μmol)\b/i.test(claimText)) {
    // Has units — good
  } else if (/\b\d+\.?\d*\s+(?:dose|concentration|level|amount)\b/i.test(claimText)) {
    issues.push('Numeric value near dose/concentration but missing units');
  }

  if (issues.length === 0) {
    return {
      checkId: crypto.randomUUID(),
      checkName: 'format_compliance',
      category: 'format',
      result: 'pass',
      details: 'No format issues detected',
      severity: 'minor',
    };
  }

  return {
    checkId: crypto.randomUUID(),
    checkName: 'format_compliance',
    category: 'format',
    result: 'warning',
    details: issues.join('; '),
    severity: 'minor',
  };
}

function checkClaimCompleteness(claimText: string, sources: EvidenceRecord[]): VerificationCheck {
  let completenessScore = 0;
  const total = 4;

  // Has source reference?
  if (sources.length > 0) completenessScore++;

  // Has quantitative data?
  if (/\d+/.test(claimText)) completenessScore++;

  // Has context (time, population, condition)?
  if (/\b(patient|subject|population|group|cohort|study|trial)\b/i.test(claimText))
    completenessScore++;

  // Has comparative reference?
  if (/\b(compared|versus|relative|baseline|control|placebo)\b/i.test(claimText))
    completenessScore++;

  const ratio = completenessScore / total;

  return {
    checkId: crypto.randomUUID(),
    checkName: 'claim_completeness',
    category: 'completeness',
    result: ratio >= 0.75 ? 'pass' : ratio >= 0.5 ? 'warning' : 'fail',
    details: `Completeness: ${completenessScore}/${total} elements present`,
    severity: 'major',
  };
}

async function checkCrossReferenceConsistency(
  claimText: string,
  organizationId: number
): Promise<VerificationCheck> {
  try {
    // Look for similar claims in other documents
    const result = await pool.query(
      `SELECT content, title FROM concept2cure_artifacts
       WHERE organization_id = $1 AND content IS NOT NULL
       AND LENGTH(content) > 100
       ORDER BY updated_at DESC LIMIT 10`,
      [organizationId]
    );

    // Check for contradictions in a lightweight way
    for (const row of result.rows) {
      const content = (row.content || '').slice(0, 2000);
      // Very basic contradiction check — in production, use NLI model
      if (
        content.toLowerCase().includes('not') &&
        claimText
          .split(' ')
          .slice(0, 5)
          .every(w => content.toLowerCase().includes(w.toLowerCase()))
      ) {
        return {
          checkId: crypto.randomUUID(),
          checkName: 'cross_reference_consistency',
          category: 'consistency',
          result: 'warning',
          details: `Potential inconsistency found in "${row.title}" — review recommended`,
          severity: 'major',
        };
      }
    }

    return {
      checkId: crypto.randomUUID(),
      checkName: 'cross_reference_consistency',
      category: 'consistency',
      result: 'pass',
      details: 'No cross-reference inconsistencies detected',
      severity: 'major',
    };
  } catch {
    return {
      checkId: crypto.randomUUID(),
      checkName: 'cross_reference_consistency',
      category: 'consistency',
      result: 'skipped',
      details: 'Cross-reference check unavailable',
      severity: 'minor',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

interface EvidenceRecord {
  id: string;
  title: string;
  description: string;
  excerpt: string;
  evidence_type: string;
  evidence_level: string;
  quality_score: number;
}

async function loadEvidence(
  evidenceIds: string[],
  organizationId: number
): Promise<EvidenceRecord[]> {
  if (evidenceIds.length === 0) return [];

  try {
    const result = await pool.query(
      `SELECT id, title, description, excerpt, evidence_type, evidence_level, quality_score
       FROM evidence_objects
       WHERE id = ANY($1::uuid[]) AND organization_id = $2`,
      [evidenceIds, organizationId]
    );
    return result.rows;
  } catch {
    return [];
  }
}

function buildScore(
  factors: ConfidenceFactor[],
  method: ConfidenceScore['method']
): ConfidenceScore {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const overallScore = totalWeight > 0 ? factors.reduce((s, f) => s + f.weightedScore, 0) : 0;

  const normalized = Math.round(Math.max(0, Math.min(1, overallScore)) * 100) / 100;

  let interpretation: ConfidenceScore['interpretation'];
  if (normalized >= 0.8) interpretation = 'high';
  else if (normalized >= 0.5) interpretation = 'medium';
  else if (normalized >= 0.2) interpretation = 'low';
  else interpretation = 'insufficient';

  const recommendations: string[] = [];
  for (const f of factors) {
    if (f.score < 0.5 && f.weight >= 0.15) {
      recommendations.push(`Improve ${f.name}: ${f.details}`);
    }
  }

  return {
    overallScore: normalized,
    factors,
    interpretation,
    recommendations,
    computedAt: new Date().toISOString(),
    method,
  };
}

function computeCompleteness(checks: VerificationCheck[]): number {
  const completenessChecks = checks.filter(c => c.category === 'completeness');
  if (completenessChecks.length === 0) return 0.5;
  const passing = completenessChecks.filter(c => c.result === 'pass').length;
  return passing / completenessChecks.length;
}
