/**
 * Scientific validity evidence engine for IVDs.
 *
 * Pure and deterministic. Closes the audit gap "scientific validity is a
 * checkbox": IVDR Annex XIII Part A demands a documented scientific-validity
 * report establishing the analyte–clinical-condition association. This engine
 * scores the strength of assembled evidence rather than accepting a boolean.
 *
 * Backbone:
 *   - IVDR 2017/746 Annex XIII Part A §1.2.1 — demonstration of scientific validity
 *   - IVDR Annex I §9.1(a) — scientific validity as the first performance pillar
 *   - Evidence hierarchy adapted from GRADE / Oxford CEBM levels.
 */

/** Sources of scientific-validity evidence, strongest → weakest. */
export const EVIDENCE_SOURCES = [
  'guidelines_consensus', // adopted clinical guidelines / consensus statements
  'systematic_review_meta', // systematic review or meta-analysis
  'peer_reviewed_studies', // primary peer-reviewed clinical studies
  'proof_of_concept', // proof-of-concept / mechanistic studies
  'expert_opinion', // expert opinion only
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/** Weight of each source toward scientific validity (0–1). */
const SOURCE_WEIGHT: Record<EvidenceSource, number> = {
  guidelines_consensus: 1.0,
  systematic_review_meta: 0.9,
  peer_reviewed_studies: 0.7,
  proof_of_concept: 0.4,
  expert_opinion: 0.2,
};

export interface ScientificValidityEvidence {
  source: EvidenceSource;
  /** Citation / DOI / guideline identifier. */
  reference: string;
  /** Number of subjects, if a study. */
  subjects?: number;
  /** Whether the evidence directly concerns the claimed analyte ↔ condition link. */
  directlyOnTarget: boolean;
}

export interface ScientificValidityInput {
  analyte: string;
  clinicalCondition: string;
  intendedPurpose: string;
  evidence: ScientificValidityEvidence[];
}

export interface ScientificValidityResult {
  analyte: string;
  clinicalCondition: string;
  /** 0–1 strength score (weighted, with diminishing returns). */
  validityScore: number;
  /** Verdict band for the PER. */
  verdict: 'established' | 'supported' | 'insufficient';
  /** Highest-tier source present. */
  strongestSource: EvidenceSource | null;
  onTargetCount: number;
  totalEvidenceCount: number;
  gaps: string[];
}

/**
 * Score scientific validity. The strongest on-target source dominates, with a
 * modest corroboration bonus for additional independent on-target sources.
 */
export function assessScientificValidity(
  input: ScientificValidityInput
): ScientificValidityResult {
  const onTarget = input.evidence.filter(e => e.directlyOnTarget);
  const gaps: string[] = [];

  if (input.evidence.length === 0) {
    gaps.push('No scientific-validity evidence provided.');
  }
  if (onTarget.length === 0 && input.evidence.length > 0) {
    gaps.push('No evidence directly concerns the claimed analyte–condition association.');
  }

  let strongestSource: EvidenceSource | null = null;
  let baseWeight = 0;
  for (const e of onTarget) {
    const w = SOURCE_WEIGHT[e.source];
    if (w > baseWeight) {
      baseWeight = w;
      strongestSource = e.source;
    }
  }

  // Corroboration: each additional on-target source adds diminishing value.
  const corroboration = Math.min(0.15, Math.max(0, onTarget.length - 1) * 0.05);
  const validityScore = Math.min(1, baseWeight + (baseWeight > 0 ? corroboration : 0));

  let verdict: ScientificValidityResult['verdict'];
  if (validityScore >= 0.85) verdict = 'established';
  else if (validityScore >= 0.5) verdict = 'supported';
  else verdict = 'insufficient';

  if (verdict === 'supported') {
    gaps.push('Scientific validity is supported but not established; add guideline/consensus or systematic-review evidence.');
  }
  if (strongestSource === 'expert_opinion') {
    gaps.push('Reliance on expert opinion alone is not acceptable for scientific validity.');
  }

  return {
    analyte: input.analyte,
    clinicalCondition: input.clinicalCondition,
    validityScore: Math.round(validityScore * 1000) / 1000,
    verdict,
    strongestSource,
    onTargetCount: onTarget.length,
    totalEvidenceCount: input.evidence.length,
    gaps,
  };
}
