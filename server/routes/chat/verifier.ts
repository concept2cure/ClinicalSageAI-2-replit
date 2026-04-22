/**
 * Verifier v1 — deterministic claim-quality checks.
 * No model needed; runs rules against citation scores + snippets.
 *
 * @module server/routes/chat/verifier
 */

export interface VerifierFlag {
  rule: string;
  severity: 'warn' | 'downgrade';
  message: string;
}

export const VERIFIER_LOW_SCORE_THRESHOLD = parseFloat(
  process.env.ANA_VERIFIER_LOW_SCORE ?? '0.55'
);
export const VERIFIER_LONG_CLAIM_CHARS = parseInt(
  process.env.ANA_VERIFIER_LONG_CLAIM_CHARS ?? '300',
  10
);

/**
 * Run deterministic verifier rules on a claim + its citations.
 * Returns flags (possibly empty) and whether the claim should be downgraded to WEAK.
 */
export function verifyClaim(
  claimText: string,
  citationScores: number[],
  snippets: string[]
): { flags: VerifierFlag[]; shouldDowngrade: boolean } {
  const flags: VerifierFlag[] = [];

  if (citationScores.length === 0) {
    // No citations — nothing to verify (already UNSUPPORTED)
    return { flags, shouldDowngrade: false };
  }

  const bestScore = Math.max(...citationScores);

  // Rule 1: Best citation score below threshold
  if (bestScore < VERIFIER_LOW_SCORE_THRESHOLD) {
    flags.push({
      rule: 'LOW_RELEVANCE',
      severity: 'downgrade',
      message: `Best citation relevance (${Math.round(bestScore * 100)}%) is below threshold (${Math.round(VERIFIER_LOW_SCORE_THRESHOLD * 100)}%)`,
    });
  }

  // Rule 2: Claim contains numbers but no citation snippet does
  // Normalize: strip commas from numbers, ignore years (1900-2100), trivial refs (≤9),
  // and common regulatory reference numbers (e.g. section numbers like 3.2.S.4.3)
  const stripCommas = (s: string) => s.replace(/(\d),(\d)/g, '$1$2');
  const normalizedClaim = stripCommas(claimText);
  const normalizedSnippets = stripCommas(snippets.join(' '));

  const claimNumbers = normalizedClaim.match(/\d+\.?\d*/g) || [];
  const significantNumbers = claimNumbers.filter(n => {
    const val = parseFloat(n);
    // Filter out: trivial refs (≤9) unless decimal (e.g., 3.14, 0.05)
    if (val <= 9 && !n.includes('.')) return false;
    // Filter out: years (1900-2100)
    if (val >= 1900 && val <= 2100 && !n.includes('.')) return false;
    // Filter out: common CFR/ICH numbers (21, 11, 820, etc.)
    if ([21, 11, 820, 312, 314, 510].includes(val) && !n.includes('.')) return false;
    return true;
  });

  if (significantNumbers.length > 0) {
    // Use word-boundary matching to avoid false positives from substring matches
    const unmatchedNumbers = significantNumbers.filter(n => {
      const escapedN = n.replace(/\./g, '\\.');
      const boundary = new RegExp(`(?:^|\\b)${escapedN}(?:\\b|$)`);
      return !boundary.test(normalizedSnippets);
    });
    if (unmatchedNumbers.length > 0) {
      flags.push({
        rule: 'UNGROUNDED_NUMBERS',
        severity: 'downgrade',
        message: `Claim contains numbers (${unmatchedNumbers.slice(0, 3).join(', ')}) not found in any citation`,
      });
    }
  }

  // Rule 3: Claim is long but only one citation
  if (claimText.length > VERIFIER_LONG_CLAIM_CHARS && citationScores.length === 1) {
    flags.push({
      rule: 'THIN_SUPPORT',
      severity: 'downgrade',
      message: `Claim is ${claimText.length} chars but supported by only 1 citation`,
    });
  }

  const shouldDowngrade = flags.some(f => f.severity === 'downgrade');
  return { flags, shouldDowngrade };
}
