/**
 * RIM claim metrics for the AnA turn.
 *
 * The RIM interceptor wants two numbers per turn: how many claims the answer
 * made (`claimCount`) and what fraction were supported (`supportedClaimRate`).
 * Historically the stream path had no direct measurement, so it used the
 * response-structure score as a rough proxy (and 0.5 when even that was absent).
 *
 * The self-verification grounding round (answer-grounding.ts) now produces a
 * direct signal: of the specific, checkable claims in the answer (trial ids,
 * quoted source text), how many actually appear in the tool evidence. When any
 * such claims were checked, this folds that real measurement into the rate so
 * fabrication drags the score down — while keeping the structure score as a
 * quality floor. When nothing was checkable, behaviour is identical to before.
 */

export interface StructureLike {
  score: number;
  maxScore: number;
}

export interface EvidenceLike {
  totalLabels: number;
}

export interface GroundingLike {
  checked: number;
  ratio: number;
}

export interface RimClaimMetrics {
  claimCount: number;
  supportedClaimRate: number;
}

/**
 * Derive `claimCount` + `supportedClaimRate` for RIM from the turn's structure,
 * evidence-discipline, and grounding verdicts. Pure.
 */
export function computeRimClaimMetrics(args: {
  structure: StructureLike | null;
  evidence: EvidenceLike | null;
  grounding: GroundingLike | null;
}): RimClaimMetrics {
  const { structure, evidence, grounding } = args;

  // Baseline (unchanged from the original inline logic).
  const structureScorePositive = structure && structure.score > 0 ? 1 : 0;
  const baseClaimCount = Math.max(evidence?.totalLabels || 0, structureScorePositive);
  const structureRate =
    structure && structure.maxScore > 0 ? structure.score / structure.maxScore : 0.5;

  // No checkable claims this turn → identical to prior behaviour.
  if (!grounding || grounding.checked <= 0) {
    return { claimCount: baseClaimCount, supportedClaimRate: structureRate };
  }

  // Blend the direct grounding measurement with the structure floor, and count
  // the concretely-checked claims toward claimCount.
  return {
    claimCount: Math.max(baseClaimCount, grounding.checked),
    supportedClaimRate: (structureRate + grounding.ratio) / 2,
  };
}
