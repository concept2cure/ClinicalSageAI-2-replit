/**
 * Claim precision — deterministic over-claim / spin detection for scientific
 * prose. Pure, no I/O.
 *
 * "No over-claiming" is a core medical-writing rule, but it was only nudged by a
 * prompt hedge-blacklist. This flags the concrete over-claim patterns a reviewer
 * penalizes: unqualified superlatives, absolute safety/efficacy claims, causal
 * overreach from associative data, and un-hedged definitive language. It is a
 * *precision* check (say exactly what the data support), distinct from the
 * commercial promotional-compliance screener.
 *
 * @module server/services/ana/claim-precision
 */

export interface OverclaimFinding {
  kind: 'superlative' | 'absolute_safety' | 'causal_overreach' | 'unqualified_efficacy';
  severity: 'high' | 'medium';
  /** The offending phrase. */
  phrase: string;
  /** The sentence it appeared in. */
  sentence: string;
  /** How to fix it. */
  suggestion: string;
}

interface Rule {
  kind: OverclaimFinding['kind'];
  severity: OverclaimFinding['severity'];
  pattern: RegExp;
  suggestion: string;
}

const RULES: Rule[] = [
  // Unqualified superlatives / marketing absolutes in a scientific register.
  { kind: 'superlative', severity: 'medium', pattern: /\b(?:the\s+)?(?:best|greatest|superior|unmatched|unparalleled|revolutionary|breakthrough|game[- ]changing|world[- ]class|cutting[- ]edge)\b/i, suggestion: 'Replace the superlative with the specific, quantified comparison the data support.' },
  { kind: 'superlative', severity: 'high', pattern: /\b(?:proven|guaranteed|guarantees?|ensures?|always|never fails?|100%\s+effective)\b/i, suggestion: 'Remove the absolute guarantee; state the observed result with its uncertainty.' },
  { kind: 'superlative', severity: 'medium', pattern: /\b(?:first|only)\s+(?:drug|device|test|therapy|treatment|assay)\b/i, suggestion: 'Substantiate a "first/only" claim with a cited basis, or qualify it.' },
  // Absolute safety.
  { kind: 'absolute_safety', severity: 'high', pattern: /\b(?:completely|totally|entirely|perfectly)\s+safe\b|\bno\s+(?:side\s+effects?|adverse\s+(?:events?|reactions?)|risks?)\b|\bwithout\s+any\s+(?:side\s+effects?|risk)\b/i, suggestion: 'No product is absolutely safe; report the observed safety profile with rates.' },
  { kind: 'absolute_safety', severity: 'medium', pattern: /\b(?:well[- ]tolerated|safe\s+and\s+effective)\b/i, suggestion: 'Qualify "safe and effective" / "well-tolerated" with the supporting data and population.' },
  // Causal overreach — definitive causal verbs (reviewer flags when data are associative).
  { kind: 'causal_overreach', severity: 'medium', pattern: /\b(?:causes?|caused|causing|prevents?|prevented|eliminates?|cures?|cured|reverses?)\b/i, suggestion: 'If the evidence is associative, use "was associated with" rather than a causal verb.' },
  // Un-hedged definitive efficacy language.
  { kind: 'unqualified_efficacy', severity: 'medium', pattern: /\b(?:dramatic(?:ally)?|remarkabl[ey]|highly\s+effective|substantially\s+outperform\w*|far\s+(?:better|superior))\b/i, suggestion: 'Replace the intensifier with the measured effect size and its confidence interval.' },
];

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map(s => s.trim())
    .filter(Boolean);
}

export interface OverclaimReport {
  findings: OverclaimFinding[];
  ok: boolean;
}

/**
 * Scan prose for over-claim / spin. Each rule fires at most once per sentence
 * per kind so a single strong sentence is not double-penalized.
 */
export function checkOverclaims(text: string): OverclaimReport {
  const findings: OverclaimFinding[] = [];
  for (const sentence of splitSentences(text)) {
    const seen = new Set<string>();
    for (const rule of RULES) {
      const m = sentence.match(rule.pattern);
      if (!m) continue;
      const dedupeKey = `${rule.kind}:${m[0].toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      findings.push({
        kind: rule.kind,
        severity: rule.severity,
        phrase: m[0],
        sentence,
        suggestion: rule.suggestion,
      });
    }
  }
  return { findings, ok: findings.length === 0 };
}
