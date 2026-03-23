/**
 * Module 3 — Defensibility Scoring Engine
 *
 * Computes a 0–100 defensibility score across four dimensions:
 *   1. Evidence Presence (0–25)
 *   2. Claim Precision (0–25)
 *   3. Consistency (0–25)
 *   4. Completeness (0–25)
 *
 * All scoring is deterministic. No LLM calls.
 */

import type {
  DefensibilityScore,
  DefensibilityDriver,
  ClaimEvidenceReport,
  ConsistencyReport,
} from './types';

// ─── Completeness Patterns ───────────────────────────────────────────────────

/** Required sections/elements for a defensible regulatory document */
const COMPLETENESS_MARKERS = {
  studyObjective: [
    /\b(study\s+)?objective/i,
    /\bpurpose\s+of\s+(the\s+)?study/i,
    /\bprimary\s+aim/i,
  ],
  studyDesign: [
    /\bstudy\s+design/i,
    /\brandomized/i,
    /\bcontrolled/i,
    /\bopen[- ]label/i,
    /\bcross[- ]over/i,
    /\bparallel[- ]group/i,
  ],
  patientPopulation: [
    /\b(inclusion|exclusion)\s+criteria/i,
    /\bpatient\s+population/i,
    /\beligib(le|ility)/i,
    /\benrolled\b/i,
  ],
  endpoints: [
    /\bprimary\s+endpoint/i,
    /\bsecondary\s+endpoint/i,
    /\boutcome\s+measure/i,
  ],
  statisticalMethods: [
    /\bstatistical\s+(method|analysis|plan)/i,
    /\bsample\s+size\s+calculation/i,
    /\bpower\s+analysis/i,
    /\bintention[- ]to[- ]treat/i,
  ],
  safetyData: [
    /\badverse\s+event/i,
    /\bsafety\s+(profile|data|analysis)/i,
    /\bserious\s+adverse/i,
    /\btolerab(ility|le)/i,
  ],
  efficacyResults: [
    /\befficacy\s+(result|data|analysis)/i,
    /\bresponse\s+rate/i,
    /\bsurvival\b/i,
    /\bprimary\s+(?:endpoint|outcome)\s+(?:was|were|result)/i,
  ],
  riskBenefit: [
    /\brisk[- ]benefit/i,
    /\bbenefit[- ]risk/i,
    /\bfavor(able)?\s+(?:risk|benefit|balance)/i,
  ],
};

// ─── Scoring Functions ───────────────────────────────────────────────────────

/**
 * Score evidence presence (0–25).
 * Uses claim/evidence report from Module 1.
 */
function scoreEvidencePresence(report: ClaimEvidenceReport): {
  score: number;
  drivers: DefensibilityDriver[];
} {
  const drivers: DefensibilityDriver[] = [];
  const total = report.alignments.length || 1;
  const adequateCount = report.alignments.filter(a => a.evidenceStrength === 'adequate').length;
  const noneCount = report.alignments.filter(a => a.evidenceStrength === 'none').length;

  const adequateRatio = adequateCount / total;
  const noneRatio = noneCount / total;

  let score = Math.round(adequateRatio * 25);

  if (noneRatio > 0.3) {
    score = Math.max(0, score - 5);
    drivers.push({
      factor: 'evidence_gaps',
      impact: 'negative',
      weight: 5,
      detail: `${Math.round(noneRatio * 100)}% of claims have no detectable evidence`,
    });
  }

  if (adequateRatio > 0.6) {
    drivers.push({
      factor: 'strong_evidence_base',
      impact: 'positive',
      weight: score,
      detail: `${Math.round(adequateRatio * 100)}% of claims backed by adequate evidence`,
    });
  }

  return { score: Math.min(25, score), drivers };
}

/**
 * Score claim precision (0–25).
 * Penalizes overstated and unsupported claims.
 */
function scoreClaimPrecision(report: ClaimEvidenceReport): {
  score: number;
  drivers: DefensibilityDriver[];
} {
  const drivers: DefensibilityDriver[] = [];
  const total = report.alignments.length || 1;

  const alignedCount = report.alignments.filter(a => a.alignment === 'aligned').length;
  const overstatedCount = report.overstatedCount;
  const unsupportedCount = report.unsupportedCount;

  const alignedRatio = alignedCount / total;
  let score = Math.round(alignedRatio * 25);

  if (overstatedCount > 0) {
    const penalty = Math.min(10, overstatedCount * 3);
    score = Math.max(0, score - penalty);
    drivers.push({
      factor: 'overstated_claims',
      impact: 'negative',
      weight: penalty,
      detail: `${overstatedCount} claims exceed their evidence level`,
    });
  }

  if (unsupportedCount > 0) {
    const penalty = Math.min(15, unsupportedCount * 5);
    score = Math.max(0, score - penalty);
    drivers.push({
      factor: 'unsupported_claims',
      impact: 'negative',
      weight: penalty,
      detail: `${unsupportedCount} claims have no detectable evidence`,
    });
  }

  if (alignedRatio > 0.8) {
    drivers.push({
      factor: 'precise_claims',
      impact: 'positive',
      weight: score,
      detail: `${Math.round(alignedRatio * 100)}% of claims are proportionate to evidence`,
    });
  }

  return { score: Math.min(25, score), drivers };
}

/**
 * Score cross-section consistency (0–25).
 * Uses consistency report from Module 2.
 */
function scoreConsistency(report: ConsistencyReport): {
  score: number;
  drivers: DefensibilityDriver[];
} {
  const drivers: DefensibilityDriver[] = [];

  // Direct mapping from consistency score (0-100) → (0-25)
  let score = Math.round(report.consistencyScore / 4);

  const highInconsistencies = report.inconsistencies.filter(i => i.severity === 'high').length;
  if (highInconsistencies > 0) {
    drivers.push({
      factor: 'high_severity_inconsistencies',
      impact: 'negative',
      weight: highInconsistencies * 5,
      detail: `${highInconsistencies} high-severity inconsistencies detected across sections`,
    });
  }

  if (report.consistencyScore >= 90) {
    drivers.push({
      factor: 'strong_consistency',
      impact: 'positive',
      weight: score,
      detail: 'Document sections are highly consistent',
    });
  }

  return { score: Math.min(25, score), drivers };
}

/**
 * Score document completeness (0–25).
 * Checks for presence of required structural elements.
 */
function scoreCompleteness(content: string): {
  score: number;
  drivers: DefensibilityDriver[];
} {
  const drivers: DefensibilityDriver[] = [];
  const totalCategories = Object.keys(COMPLETENESS_MARKERS).length;
  let foundCategories = 0;

  for (const [category, patterns] of Object.entries(COMPLETENESS_MARKERS)) {
    const found = patterns.some(p => p.test(content));
    if (found) {
      foundCategories++;
    } else {
      drivers.push({
        factor: `missing_${category}`,
        impact: 'negative',
        weight: Math.round(25 / totalCategories),
        detail: `Missing or undetectable: ${category.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`,
      });
    }
  }

  const completionRatio = foundCategories / totalCategories;
  const score = Math.round(completionRatio * 25);

  if (completionRatio >= 0.9) {
    drivers.push({
      factor: 'comprehensive_coverage',
      impact: 'positive',
      weight: score,
      detail: `${foundCategories}/${totalCategories} required structural elements present`,
    });
  }

  return { score: Math.min(25, score), drivers };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute defensibility score for a document.
 * Requires outputs from Module 1 (claim/evidence) and Module 2 (consistency).
 */
export function computeDefensibility(
  claimEvidenceReport: ClaimEvidenceReport,
  consistencyReport: ConsistencyReport,
  fullContent: string
): DefensibilityScore {
  const evidence = scoreEvidencePresence(claimEvidenceReport);
  const claims = scoreClaimPrecision(claimEvidenceReport);
  const consistency = scoreConsistency(consistencyReport);
  const completeness = scoreCompleteness(fullContent);

  const totalScore = evidence.score + claims.score + consistency.score + completeness.score;
  const allDrivers = [
    ...evidence.drivers,
    ...claims.drivers,
    ...consistency.drivers,
    ...completeness.drivers,
  ];

  let riskLevel: 'low' | 'moderate' | 'high';
  if (totalScore >= 70) {
    riskLevel = 'low';
  } else if (totalScore >= 45) {
    riskLevel = 'moderate';
  } else {
    riskLevel = 'high';
  }

  return {
    score: totalScore,
    riskLevel,
    drivers: allDrivers,
    breakdown: {
      evidencePresence: evidence.score,
      claimPrecision: claims.score,
      consistency: consistency.score,
      completeness: completeness.score,
    },
  };
}
