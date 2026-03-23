/**
 * Module 1 — Claim/Evidence Alignment Engine
 *
 * Deterministic analysis of claim strength vs evidence presence.
 * Does NOT rely on LLM for core judgments — uses pattern detection,
 * linguistic markers, and structural analysis.
 */

import type {
  ClaimStrength,
  EvidenceStrength,
  AlignmentVerdict,
  ClaimEvidenceAlignment,
  ClaimEvidenceReport,
} from './types';

// ─── Linguistic Markers ──────────────────────────────────────────────────────

const STRONG_CLAIM_MARKERS = [
  /\bproven?\b/i,
  /\bdemonstrat(es?|ed|ing)\b/i,
  /\bconfirm(s|ed|ing)?\b/i,
  /\bestablish(es|ed|ing)?\b/i,
  /\bsuperior(ity)?\b/i,
  /\bsignificantly?\b/i,
  /\bclear(ly)?\b/i,
  /\bdefinitiv(e|ely)\b/i,
  /\bunequivocal(ly)?\b/i,
  /\bconclusiv(e|ely)\b/i,
];

const MODERATE_CLAIM_MARKERS = [
  /\bsugg?est(s|ed|ing)?\b/i,
  /\bindicat(es?|ed|ing)\b/i,
  /\bsupport(s|ed|ing)?\b/i,
  /\bconsistent\s+with\b/i,
  /\bcomparable\b/i,
  /\bfavor(s|ed|able|ably)?\b/i,
  /\bpromising\b/i,
  /\btrend(s|ed|ing)?\b/i,
];

const WEAK_CLAIM_MARKERS = [
  /\bmay\b/i,
  /\bmight\b/i,
  /\bcould\b/i,
  /\bpossib(le|ly|ility)\b/i,
  /\bpotential(ly)?\b/i,
  /\bpreliminari?(ly|y)?\b/i,
  /\blimited\s+(evidence|data)\b/i,
  /\bexploratory\b/i,
  /\bunclear\b/i,
];

const EVIDENCE_MARKERS = [
  /\bp\s*[<=>]\s*0?\.\d+/i,                       // p-values
  /\b(n\s*=\s*\d+|sample\s+size)/i,               // sample sizes
  /\bCI\s*[:=]?\s*\[?\d/i,                         // confidence intervals
  /\b(hazard|odds|risk)\s+ratio/i,                 // effect measures
  /\brandomized/i,                                  // study design
  /\bdouble[- ]blind/i,
  /\bplacebo[- ]control/i,
  /\b(phase\s+[I1][I1]?[I1]?|pivotal)\b/i,       // trial phase
  /\bprimary\s+endpoint/i,
  /\bITT|intention[- ]to[- ]treat/i,
  /\bmedian\s+(PFS|OS|DFS|survival)/i,
  /\b(Table|Figure|Appendix)\s+\d/i,               // data references
  /\bstudy\s+\w{3,}[-\s]\d+/i,                    // study identifiers
  /\bmeta[- ]analysis\b/i,
  /\bsystematic\s+review\b/i,
];

const PARTIAL_EVIDENCE_MARKERS = [
  /\bcase\s+(report|series|study)/i,
  /\bobservational/i,
  /\bretrospective/i,
  /\bsingle[- ]arm/i,
  /\breal[- ]world\s+(data|evidence)/i,
  /\bpost[- ]hoc/i,
  /\bsubgroup\s+analysis/i,
  /\bexploratory\s+(endpoint|analysis)/i,
  /\bnon[- ]?randomized/i,
  /\bopen[- ]label/i,
];

// ─── Core Engine ─────────────────────────────────────────────────────────────

/**
 * Detect claim strength based on linguistic markers.
 * Deterministic: same input → same output.
 */
export function detectClaimStrength(text: string): ClaimStrength {
  const strongHits = STRONG_CLAIM_MARKERS.filter(r => r.test(text)).length;
  const moderateHits = MODERATE_CLAIM_MARKERS.filter(r => r.test(text)).length;
  const weakHits = WEAK_CLAIM_MARKERS.filter(r => r.test(text)).length;

  // Hedging language overrides strong claims
  if (weakHits >= 2 && strongHits <= 1) return 'weak';
  if (strongHits >= 2) return 'strong';
  if (moderateHits >= 2 || strongHits === 1) return 'moderate';
  if (weakHits >= 1) return 'weak';

  // Default: moderate (some assertion is being made)
  return 'moderate';
}

/**
 * Detect evidence strength based on presence of data references,
 * statistical markers, and study design indicators.
 * Deterministic: same input → same output.
 */
export function detectEvidenceStrength(text: string): EvidenceStrength {
  const strongHits = EVIDENCE_MARKERS.filter(r => r.test(text)).length;
  const partialHits = PARTIAL_EVIDENCE_MARKERS.filter(r => r.test(text)).length;

  if (strongHits >= 3) return 'adequate';
  if (strongHits >= 1 || partialHits >= 2) return 'partial';
  return 'none';
}

/**
 * Classify alignment between claim and evidence.
 * Deterministic judgment matrix.
 */
export function classifyAlignment(
  claimStrength: ClaimStrength,
  evidenceStrength: EvidenceStrength
): AlignmentVerdict {
  const matrix: Record<ClaimStrength, Record<EvidenceStrength, AlignmentVerdict>> = {
    strong: {
      adequate: 'aligned',
      partial: 'overstated',
      none: 'unsupported',
    },
    moderate: {
      adequate: 'aligned',
      partial: 'aligned',
      none: 'overstated',
    },
    weak: {
      adequate: 'aligned',
      partial: 'aligned',
      none: 'unsupported',
    },
  };

  return matrix[claimStrength][evidenceStrength];
}

/**
 * Extract signal descriptions for a given alignment.
 */
function extractSignals(
  claimStrength: ClaimStrength,
  evidenceStrength: EvidenceStrength,
  alignment: AlignmentVerdict,
  text: string
): string[] {
  const signals: string[] = [];

  if (alignment === 'overstated') {
    const strongMarkers = STRONG_CLAIM_MARKERS.filter(r => r.test(text));
    if (strongMarkers.length > 0) {
      signals.push(`Strong claim language detected without adequate evidence backing`);
    }
    if (evidenceStrength === 'none') {
      signals.push('No quantitative data or study references found to support claim');
    } else if (evidenceStrength === 'partial') {
      signals.push('Evidence is limited to observational/exploratory data; claim exceeds evidence level');
    }
  }

  if (alignment === 'unsupported') {
    signals.push('Claim made with no detectable evidence in surrounding context');
  }

  if (claimStrength === 'strong' && evidenceStrength === 'adequate') {
    signals.push('Claim is well-grounded: strong language matched by adequate evidence');
  }

  return signals;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyze a single text block for claim/evidence alignment.
 */
export function analyzeClaimEvidence(
  claimText: string,
  evidenceText: string | null
): ClaimEvidenceAlignment {
  const claimStrength = detectClaimStrength(claimText);
  const evidenceStrength = evidenceText
    ? detectEvidenceStrength(evidenceText)
    : detectEvidenceStrength(claimText);
  const alignment = classifyAlignment(claimStrength, evidenceStrength);
  const combinedText = evidenceText ? `${claimText} ${evidenceText}` : claimText;
  const signals = extractSignals(claimStrength, evidenceStrength, alignment, combinedText);

  return {
    claimStrength,
    evidenceStrength,
    alignment,
    claimText: claimText.slice(0, 500),
    evidenceText: evidenceText?.slice(0, 500) ?? null,
    signals,
  };
}

/**
 * Analyze a document by splitting into paragraphs and assessing each.
 * Returns a full report with risk assessment.
 */
export function analyzeDocument(content: string): ClaimEvidenceReport {
  const paragraphs = content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 30); // Skip very short fragments

  const alignments: ClaimEvidenceAlignment[] = [];

  for (const paragraph of paragraphs) {
    // Split sentences to find claim-evidence pairs
    const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(s => s.length > 15);

    if (sentences.length <= 1) {
      // Treat whole paragraph as a single unit
      alignments.push(analyzeClaimEvidence(paragraph, null));
    } else {
      // Check each sentence against the full paragraph context
      for (const sentence of sentences) {
        const claimStrength = detectClaimStrength(sentence);
        if (claimStrength !== 'weak') {
          // Only analyze sentences that make non-trivial claims
          alignments.push(analyzeClaimEvidence(sentence, paragraph));
        }
      }
    }
  }

  const overstatedCount = alignments.filter(a => a.alignment === 'overstated').length;
  const unsupportedCount = alignments.filter(a => a.alignment === 'unsupported').length;
  const total = alignments.length || 1;
  const problemRatio = (overstatedCount + unsupportedCount) / total;

  let overallRisk: 'low' | 'moderate' | 'high';
  if (unsupportedCount >= 3 || problemRatio > 0.4) {
    overallRisk = 'high';
  } else if (overstatedCount >= 2 || problemRatio > 0.2) {
    overallRisk = 'moderate';
  } else {
    overallRisk = 'low';
  }

  return {
    alignments,
    overallRisk,
    overstatedCount,
    unsupportedCount,
  };
}
