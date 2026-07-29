/**
 * Promotional-language / claims compliance screener for AnA.
 *
 * Deterministic lexicon scan that flags language at risk under FDA OPDP and EU
 * advertising rules and good scientific-writing practice — superiority/
 * superlatives, absolutes, unqualified safety claims, causal overreach, and
 * unsupported comparatives — with the offending phrase, a category, a severity,
 * and a remediation suggestion. A QC pass before any externally-facing or
 * regulatory text goes out.
 *
 * Lexicon-based (not a substitute for regulatory/legal review) — high precision
 * on the listed patterns, conservative on false positives via word boundaries.
 *
 * @module server/services/ana/promotional-screening
 */

export type ClaimCategory =
  | 'superiority'
  | 'absolute'
  | 'unqualified_safety'
  | 'causal_overreach'
  | 'unsupported_comparative'
  | 'promotional_tone';

export type ClaimSeverity = 'high' | 'medium' | 'low';

export interface ClaimFlag {
  phrase: string;
  category: ClaimCategory;
  severity: ClaimSeverity;
  index: number;
  context: string;
  suggestion: string;
}

export interface PromotionalScreenResult {
  flags: ClaimFlag[];
  total: number;
  byCategory: Record<string, number>;
  highSeverityCount: number;
  verdict: string;
}

interface Rule {
  pattern: RegExp; // must be global; matched case-insensitively
  category: ClaimCategory;
  severity: ClaimSeverity;
  suggestion: string;
}

const RULES: Rule[] = [
  // Superiority / superlatives.
  {
    pattern: /\b(best|safest|strongest|most effective|most powerful|superior|unsurpassed|unmatched|#\s?1|number one|gold standard|breakthrough|miracle|revolutionary|game[- ]chang(?:er|ing)|optimal)\b/gi,
    category: 'superiority',
    severity: 'high',
    suggestion: 'Remove the superlative/superiority claim or restate as a specific, head-to-head, statistically supported comparison.',
  },
  // Absolutes / guarantees.
  {
    pattern: /\b(guarantee[ds]?|always works?|never fails?|100%\s*(?:effective|safe)|all patients|every patient|in all cases|completely|totally)\b/gi,
    category: 'absolute',
    severity: 'high',
    suggestion: 'Replace the absolute with the observed rate and its uncertainty (e.g. "X% of patients (95% CI …)").',
  },
  // Unqualified safety claims.
  {
    pattern: /\b(?:completely\s+safe|perfectly\s+safe|totally\s+safe|no\s+side\s+effects|free\s+of\s+side\s+effects|non[- ]toxic|harmless)\b/gi,
    category: 'unqualified_safety',
    severity: 'high',
    suggestion: 'No drug/device is without risk; report the actual adverse-event profile and avoid blanket safety claims.',
  },
  {
    // "safe" / "well tolerated" as bare claims (word-boundary; not "safety"/"safely").
    pattern: /\b(?:is|was|are|were)\s+(?:safe|well[- ]tolerated)\b/gi,
    category: 'unqualified_safety',
    severity: 'medium',
    suggestion: 'Qualify with the data ("was generally well tolerated, with [most common AEs]…") rather than an unqualified claim.',
  },
  // Causal overreach (esp. from associative/uncontrolled data).
  {
    pattern: /\b(prov(?:es|en|ed)|cures?|eliminat(?:es|ed)|eradicat(?:es|ed)|reverses?|guarantees? (?:a )?(?:cure|response))\b/gi,
    category: 'causal_overreach',
    severity: 'high',
    suggestion: 'Avoid causal/curative language; state the measured effect and the evidence level (e.g. "associated with", "reduced … by").',
  },
  // Unsupported comparatives.
  {
    pattern: /\b(better than|more effective than|safer than|outperforms?|superior to)\b/gi,
    category: 'unsupported_comparative',
    severity: 'medium',
    suggestion: 'A comparative claim needs a direct, adequately-powered head-to-head study; cite it or remove the comparison.',
  },
  // Promotional tone / hype adjectives.
  {
    pattern: /\b(remarkable|dramatic|dramatically|powerful|exciting|impressive|extraordinary|unprecedented|cutting[- ]edge|state[- ]of[- ]the[- ]art)\b/gi,
    category: 'promotional_tone',
    severity: 'low',
    suggestion: 'Replace promotional adjectives with the specific quantitative finding.',
  },
];

const SEVERITY_RANK: Record<ClaimSeverity, number> = { high: 3, medium: 2, low: 1 };

/** Scan text for promotional / non-compliant claim language. */
export function screenPromotionalLanguage(text: string): PromotionalScreenResult {
  const flags: ClaimFlag[] = [];
  const byCategory: Record<string, number> = {};

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      const phrase = m[0];
      const index = m.index;
      const start = Math.max(0, index - 40);
      const end = Math.min(text.length, index + phrase.length + 40);
      const context = `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
      flags.push({ phrase, category: rule.category, severity: rule.severity, index, context, suggestion: rule.suggestion });
      byCategory[rule.category] = (byCategory[rule.category] ?? 0) + 1;
      if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++; // guard against zero-width
    }
  }

  flags.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.index - b.index);
  const highSeverityCount = flags.filter(f => f.severity === 'high').length;
  const verdict =
    flags.length === 0
      ? 'No promotional/non-compliant claim language detected.'
      : highSeverityCount > 0
        ? `${flags.length} flag(s), including ${highSeverityCount} high-severity — revise before release (FDA OPDP / EU advertising risk).`
        : `${flags.length} flag(s) to review for tone/claims compliance.`;

  return { flags, total: flags.length, byCategory, highSeverityCount, verdict };
}
