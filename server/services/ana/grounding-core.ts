/**
 * Grounding guarantee — pure detection of ungrounded quantitative claims.
 *
 * The product's trust moat is "decision confidence with its denominator
 * attached", and its governance rule is that AnA "never invents figures". This
 * module makes that checkable: it finds quantitative claims (percentages,
 * p-values, sample sizes, fold-changes, counts, CIs, durations) in drafted text
 * and flags any that are not accompanied by a citation/source marker, so AnA
 * can ground or hedge them before the text reaches a regulatory reader.
 *
 * Pure and deterministic (no I/O, no LLM), so the claim/citation detection is
 * directly unit-testable.
 */

export interface QuantClaim {
  sentence: string;
  numbers: string[];
  hasCitation: boolean;
}

export interface GroundingReport {
  totalClaims: number;
  groundedClaims: number;
  ungroundedClaims: QuantClaim[];
  /** grounded / total; 1 when there are no quantitative claims to ground. */
  groundingScore: number;
  ok: boolean;
}

// Quantitative-claim signals: percentages, p-values, n=, CIs, fold-changes,
// ratios, counts of subjects/patients, and durations with a number.
const QUANT_PATTERNS: RegExp[] = [
  /\b\d+(?:\.\d+)?\s?%/, // 42%, 3.5 %
  /\bp\s*[<=>]\s*0?\.\d+/i, // p<0.05
  /\bn\s*=\s*\d+/i, // n=120
  /\b\d+(?:\.\d+)?\s*-?\s*fold\b/i, // 2-fold, 3.5 fold
  /\b(?:95|90|99)\s?%?\s?(?:ci|confidence interval)\b/i, // 95% CI
  /\bhr\s*[:=]?\s*0?\.\d+/i, // HR 0.62
  /\b(?:odds|hazard|risk)\s+ratio\s+(?:of\s+)?\d/i,
  /\b\d{2,}\s+(?:patients|subjects|participants|cases)\b/i, // 240 patients
  /\b\d+(?:\.\d+)?\s*(?:mg|kg|ml|mcg|µg|units?)\b/i, // doses
  /\b\d+(?:\.\d+)?\s*(?:months?|weeks?|days?|years?)\b/i, // durations
];

// Citation / source markers that count as grounding for a nearby claim.
const CITATION_PATTERNS: RegExp[] = [
  /\[\d+\]/, // [12]
  /\([A-Z][A-Za-z\-]+(?:\s+et al\.?)?,?\s*\d{4}[a-z]?\)/, // (Smith et al., 2021)
  /\bK\d{6}\b/, // 510(k) number
  /\bNCT\d{8}\b/, // trial id
  /\bdoi:\s*\S+/i,
  /\b(?:Section|§)\s*\d/i,
  /\bp\.?\s?\d+\b/i, // p. 12  (page reference)
  /\b(?:Table|Figure|Appendix)\s*\d/i,
  /\bper\s+(?:the\s+)?(?:ICH|FDA|EMA|PMDA|guidance|protocol|SAP|CSR|label|monograph)\b/i,
  /\baccording to\b/i,
  /\b(?:CFR|ICH\s?[EQSM]\d)/i,
];

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?:;])\s+(?=[A-Z0-9(\[])/)
    .map(s => s.trim())
    .filter(Boolean);
}

function numbersIn(sentence: string): string[] {
  const out: string[] = [];
  for (const re of QUANT_PATTERNS) {
    const m = sentence.match(new RegExp(re, re.flags.includes('g') ? re.flags : re.flags + 'g'));
    if (m) out.push(...m.map(s => s.trim()));
  }
  return [...new Set(out)];
}

function hasQuant(sentence: string): boolean {
  return QUANT_PATTERNS.some(re => re.test(sentence));
}

function hasCitation(sentence: string): boolean {
  return CITATION_PATTERNS.some(re => re.test(sentence));
}

/**
 * Assess whether every quantitative claim in `text` is grounded by a nearby
 * citation/source marker. Returns the ungrounded claims and a 0–1 score.
 */
export function assessGrounding(text: string): GroundingReport {
  const sentences = splitSentences(text);
  const claims: QuantClaim[] = [];

  for (const sentence of sentences) {
    if (!hasQuant(sentence)) continue;
    // A claim is grounded only if its OWN sentence carries a citation/source
    // marker. Same-sentence is the defensible rule for a grounding guarantee —
    // a citation elsewhere must not silently ground an unrelated figure.
    claims.push({
      sentence,
      numbers: numbersIn(sentence),
      hasCitation: hasCitation(sentence),
    });
  }

  const grounded = claims.filter(c => c.hasCitation).length;
  const ungrounded = claims.filter(c => !c.hasCitation);
  const groundingScore = claims.length === 0 ? 1 : grounded / claims.length;

  return {
    totalClaims: claims.length,
    groundedClaims: grounded,
    ungroundedClaims: ungrounded,
    groundingScore: Math.round(groundingScore * 1000) / 1000,
    ok: ungrounded.length === 0,
  };
}
