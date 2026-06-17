/**
 * Submission pre-mortem composition — pure, honest-by-construction core.
 *
 * The RTF/CRL pre-mortem is the platform's economic moat: surfacing what a
 * reviewer will likely flag BEFORE filing, so a client avoids a refuse-to-file
 * or complete-response cycle (months of runway). Per the product's governing
 * principle, the verdict must "degrade honestly": every risk read carries its
 * confidence and its denominator (the n of precedents it is based on), and at
 * cold-start it returns "insufficient data, confidence: low" rather than a
 * fabricated probability.
 *
 * This module is pure (no DB, no LLM, no I/O): the handler feeds it the
 * deterministic deficiency findings and the precedent denominator/citations,
 * and it composes the ranked, confidence-bearing verdict. Kept pure so the
 * ranking, risk roll-up, and honesty-degradation are directly unit-testable.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';

export interface PremortemFinding {
  patternId: string;
  title: string;
  category: string;
  severity: Severity;
  matchedText: string;
  matchConfidence: number;
  reviewerQuestion: string;
  regulatoryBasis: string;
  remediation: string;
}

export interface PrecedentCitation {
  id: string;
  label: string;
  outcome: string;
}

export interface PremortemVerdict {
  riskLevel: RiskLevel;
  confidence: Confidence;
  /** Number of precedents the read is calibrated against (the denominator). */
  denominator: number;
  /** Non-null when the read is not corpus-calibrated; states the limitation plainly. */
  honestyNote: string | null;
  findingsCount: number;
  bySeverity: Record<Severity, number>;
  findings: PremortemFinding[];
  precedentCitations: PrecedentCitation[];
  summary: string;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Confidence is a function of the denominator (how much precedent the read is
 * based on) — never asserted beyond the data. Mirrors the product's
 * "confidence with its denominator attached" rule.
 */
export function confidenceFromDenominator(n: number): Confidence {
  if (n >= 20) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

/** Roll findings up into an overall risk level by severity distribution. */
export function overallRiskFromFindings(findings: PremortemFinding[]): RiskLevel {
  const counts = countBySeverity(findings);
  if (counts.critical > 0) return 'critical';
  if (counts.high >= 2) return 'high';
  if (counts.high === 1) return 'moderate';
  if (counts.medium > 0) return 'moderate';
  if (counts.low > 0) return 'low';
  return 'low';
}

function countBySeverity(findings: PremortemFinding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) c[f.severity] = (c[f.severity] ?? 0) + 1;
  return c;
}

/** Rank findings by severity, then by match confidence (both descending). */
export function rankFindings(findings: PremortemFinding[]): PremortemFinding[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (s !== 0) return s;
    return b.matchConfidence - a.matchConfidence;
  });
}

export interface ComposePremortemInput {
  findings: PremortemFinding[];
  precedentCount: number;
  precedentCitations: PrecedentCitation[];
  submissionType?: string;
  agency?: string;
}

/**
 * Compose the full pre-mortem verdict. Honest by construction: confidence is
 * pinned to the precedent denominator, and a zero/low denominator yields an
 * explicit honestyNote rather than an over-stated probability.
 */
export function composePremortem(input: ComposePremortemInput): PremortemVerdict {
  const findings = rankFindings(input.findings);
  const bySeverity = countBySeverity(findings);
  const riskLevel = overallRiskFromFindings(findings);
  const denominator = Math.max(0, input.precedentCount);
  const confidence = confidenceFromDenominator(denominator);

  const scope = [input.agency, input.submissionType].filter(Boolean).join(' ');
  let honestyNote: string | null = null;
  if (denominator === 0) {
    honestyNote =
      'No precedent corpus is available for this submission context, so this is a PATTERN-ONLY read (deterministic deficiency detection), not a corpus-calibrated probability. Confidence: low. Populate the precedent corpus for calibrated risk.';
  } else if (confidence === 'low') {
    honestyNote = `Calibrated against only ${denominator} precedent(s) — treat the risk level as directional, not a probability. Confidence: low.`;
  }

  const lead =
    findings.length === 0
      ? `No codified deficiency or reviewer-trigger patterns fired${scope ? ` for ${scope}` : ''}. This is NOT proof of soundness — it means no KNOWN pattern matched; a human reviewer must still confirm completeness.`
      : `${findings.length} likely reviewer concern(s) detected${scope ? ` for ${scope}` : ''} — overall pre-mortem risk: ${riskLevel.toUpperCase()} (confidence: ${confidence}, n=${denominator} precedent(s)). Each finding lists the reviewer question, regulatory basis, and a concrete remediation; address criticals/highs before filing.`;

  return {
    riskLevel,
    confidence,
    denominator,
    honestyNote,
    findingsCount: findings.length,
    bySeverity,
    findings,
    precedentCitations: input.precedentCitations.slice(0, 5),
    summary: lead,
  };
}
