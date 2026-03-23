/**
 * Module 4 — Reviewer Question Generator
 *
 * Hybrid approach:
 *   1. Deterministic signals detect gaps, risks, mismatches
 *   2. Questions generated from signal patterns (no LLM needed for generation)
 *   3. LLM can optionally refine wording (controlled, not required)
 *
 * Every question maps to a specific deterministic trigger.
 */

import type {
  ReviewerQuestion,
  ClaimEvidenceReport,
  ConsistencyReport,
  DefensibilityScore,
  RiskReport,
} from './types';

// ─── Question Templates ──────────────────────────────────────────────────────

/** Templates keyed by trigger type. Each produces specific, non-generic questions. */

const CLAIM_EVIDENCE_TEMPLATES = {
  overstated: (claim: string) =>
    `The claim "${claim.slice(0, 80)}..." uses strong language but evidence appears limited. What additional data supports this characterization?`,
  unsupported: (claim: string) =>
    `The statement "${claim.slice(0, 80)}..." lacks detectable supporting evidence. Can you provide the specific study or data reference?`,
  noQuantitative: () =>
    `Several efficacy claims lack quantitative endpoints (p-values, confidence intervals, effect sizes). Can these be added?`,
} as const;

const CONSISTENCY_TEMPLATES = {
  contradiction: (desc: string) =>
    `A contradiction was detected: ${desc}. Which value is correct, and can the inconsistency be resolved?`,
  divergence: (desc: string) =>
    `A numeric divergence was found: ${desc}. Is this intentional (e.g., different analysis populations), or does it need correction?`,
  summaryMismatch: (section: string) =>
    `The executive summary may not fully reflect findings in ${section}. Can you verify alignment?`,
} as const;

const COMPLETENESS_TEMPLATES = {
  missingSection: (section: string) =>
    `The document appears to lack a ${section} section. Is this intentional, or should it be added for regulatory completeness?`,
  weakSafetyNarrative: () =>
    `The safety narrative could be more comprehensive. Can you expand on the characterization of adverse events and their clinical significance?`,
  missingRiskBenefit: () =>
    `No explicit risk-benefit assessment was detected. Regulatory reviewers typically expect this. Can one be added?`,
} as const;

const DEFENSIBILITY_TEMPLATES = {
  lowScore: (score: number) =>
    `The overall defensibility score is ${score}/100, which indicates potential vulnerability to reviewer challenges. What are the key areas for strengthening?`,
  evidenceGap: (detail: string) =>
    `${detail}. How can the evidence base be strengthened before submission?`,
  claimRisk: (detail: string) =>
    `${detail}. Should the language be moderated to better match the available evidence?`,
} as const;

// ─── Core Engine ─────────────────────────────────────────────────────────────

/**
 * Generate reviewer questions from claim/evidence analysis.
 */
function questionsFromClaimEvidence(report: ClaimEvidenceReport): ReviewerQuestion[] {
  const questions: ReviewerQuestion[] = [];

  // Overstated claims
  const overstated = report.alignments.filter(a => a.alignment === 'overstated');
  for (const a of overstated.slice(0, 5)) { // Cap at 5 to avoid noise
    questions.push({
      question: CLAIM_EVIDENCE_TEMPLATES.overstated(a.claimText),
      trigger: `Claim strength: ${a.claimStrength}, Evidence: ${a.evidenceStrength}`,
      severity: 'warning',
      category: 'evidence',
      sectionRef: undefined,
    });
  }

  // Unsupported claims
  const unsupported = report.alignments.filter(a => a.alignment === 'unsupported');
  for (const a of unsupported.slice(0, 5)) {
    questions.push({
      question: CLAIM_EVIDENCE_TEMPLATES.unsupported(a.claimText),
      trigger: `Unsupported claim detected: no evidence markers`,
      severity: 'critical',
      category: 'evidence',
      sectionRef: undefined,
    });
  }

  // Check if many claims lack quantitative data
  const noQuantitative = report.alignments.filter(
    a => a.evidenceStrength === 'none' && a.claimStrength !== 'weak'
  );
  if (noQuantitative.length >= 3) {
    questions.push({
      question: CLAIM_EVIDENCE_TEMPLATES.noQuantitative(),
      trigger: `${noQuantitative.length} non-weak claims lack quantitative evidence`,
      severity: 'warning',
      category: 'evidence',
    });
  }

  return questions;
}

/**
 * Generate reviewer questions from consistency analysis.
 */
function questionsFromConsistency(report: ConsistencyReport): ReviewerQuestion[] {
  const questions: ReviewerQuestion[] = [];

  for (const inc of report.inconsistencies) {
    if (inc.type === 'contradiction') {
      questions.push({
        question: CONSISTENCY_TEMPLATES.contradiction(inc.description),
        trigger: `Cross-section contradiction: ${inc.assertionA.sectionName} vs ${inc.assertionB.sectionName}`,
        severity: 'critical',
        category: 'consistency',
        sectionRef: `${inc.assertionA.sectionName}, ${inc.assertionB.sectionName}`,
      });
    } else if (inc.type === 'divergence') {
      questions.push({
        question: CONSISTENCY_TEMPLATES.divergence(inc.description),
        trigger: `Numeric divergence between sections`,
        severity: 'warning',
        category: 'consistency',
        sectionRef: `${inc.assertionA.sectionName}, ${inc.assertionB.sectionName}`,
      });
    }
  }

  return questions;
}

/**
 * Generate reviewer questions from defensibility analysis.
 */
function questionsFromDefensibility(score: DefensibilityScore): ReviewerQuestion[] {
  const questions: ReviewerQuestion[] = [];

  if (score.score < 50) {
    questions.push({
      question: DEFENSIBILITY_TEMPLATES.lowScore(score.score),
      trigger: `Defensibility score below 50: ${score.score}/100`,
      severity: 'critical',
      category: 'completeness',
    });
  }

  // Questions from negative drivers
  for (const driver of score.drivers.filter(d => d.impact === 'negative')) {
    if (driver.factor.includes('evidence')) {
      questions.push({
        question: DEFENSIBILITY_TEMPLATES.evidenceGap(driver.detail),
        trigger: `Defensibility driver: ${driver.factor}`,
        severity: driver.weight >= 10 ? 'critical' : 'warning',
        category: 'evidence',
      });
    } else if (driver.factor.includes('claim') || driver.factor.includes('overstat')) {
      questions.push({
        question: DEFENSIBILITY_TEMPLATES.claimRisk(driver.detail),
        trigger: `Defensibility driver: ${driver.factor}`,
        severity: driver.weight >= 10 ? 'critical' : 'warning',
        category: 'evidence',
      });
    } else if (driver.factor.startsWith('missing_')) {
      const sectionName = driver.factor.replace('missing_', '').replace(/([A-Z])/g, ' $1').trim();
      questions.push({
        question: COMPLETENESS_TEMPLATES.missingSection(sectionName),
        trigger: `Missing structural element: ${sectionName}`,
        severity: 'warning',
        category: 'completeness',
        sectionRef: sectionName,
      });
    }
  }

  // Check for missing risk-benefit
  const hasRiskBenefit = score.drivers.some(
    d => d.factor === 'missing_riskBenefit' && d.impact === 'negative'
  );
  if (hasRiskBenefit) {
    questions.push({
      question: COMPLETENESS_TEMPLATES.missingRiskBenefit(),
      trigger: 'No risk-benefit assessment detected',
      severity: 'critical',
      category: 'completeness',
    });
  }

  return questions;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate all reviewer questions from deterministic intelligence signals.
 * No LLM required — all questions derived from structural analysis.
 */
export function generateReviewerQuestions(
  claimEvidence: ClaimEvidenceReport,
  consistency: ConsistencyReport,
  defensibility: DefensibilityScore
): ReviewerQuestion[] {
  const questions: ReviewerQuestion[] = [
    ...questionsFromClaimEvidence(claimEvidence),
    ...questionsFromConsistency(consistency),
    ...questionsFromDefensibility(defensibility),
  ];

  // Deduplicate by question text similarity
  const seen = new Set<string>();
  return questions.filter(q => {
    const key = q.question.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
