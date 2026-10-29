/**
 * Statistics a model may not state (CLAUDE.md Rule 2: numbers come from
 * deterministic engines; the model narrates).
 *
 * The CSR builder drafts each ICH E3 section with a model from the study's
 * metadata alone: title, phase, design, endpoints, planned size. It is given
 * no SAP, no analysis datasets and no engine output. For a statistical-methods
 * or results section, then, any p-value, confidence interval, percentage,
 * ratio, count or significance level in the draft is one the model supplied
 * itself. Until 2026-10-05 such a draft was stored as the section, and §11.4's
 * text became the "primary result" quoted in Module 2.5 and 2.7.
 *
 * This finds those figures deterministically. A draft of a statistical section
 * that states one is not stored: the section falls back to its template, whose
 * placeholders say what is missing, and the lineage records why.
 */

/** ICH E3 sections whose content is statistical methods or results. */
const STATISTICAL_SECTION = /^(2|9\.7|10|11|12|13|14)(\.|$)/;

export function isStatisticalSection(sectionNumber: string): boolean {
  return STATISTICAL_SECTION.test(sectionNumber.trim());
}

interface StatPattern {
  kind: string;
  re: RegExp;
}

const PATTERNS: readonly StatPattern[] = [
  { kind: 'p-value', re: /\bp\s*[<>=≤≥]\s*0?\.\d+(?:\s*[x×]\s*10\^?-?\d+)?/gi },
  { kind: 'confidence interval', re: /[([]\s*-?\d+(?:\.\d+)?\s*(?:,|;|–|—|\bto\b)\s*-?\d+(?:\.\d+)?\s*[)\]]/gi },
  {
    kind: 'effect estimate',
    re: /\b(?:HR|OR|RR|hazard ratio|odds ratio|risk ratio|relative risk|mean difference|difference)\b[^.\d\n]{0,24}?-?\d+(?:\.\d+)?/gi,
  },
  { kind: 'count', re: /\bn\s*=\s*\d[\d,]*/gi },
  { kind: 'count', re: /\b\d[\d,]*\s+(?:patients|subjects|participants|deaths|events)\b/gi },
  { kind: 'percentage', re: /\b\d+(?:\.\d+)?\s*%(?!\s*(?:CI\b|confidence\b|credible\b))/gi },
  { kind: 'significance level', re: /\b(?:alpha|α|significance level)\s*(?:of|=|:)?\s*0?\.\d+/gi },
  // A Bayesian result (2026-10-29): a posterior probability, an n/N count and
  // an interval written without brackets. Each is as much an invented figure
  // as a p-value; the patterns above did not see them.
  { kind: 'posterior probability', re: /\b(?:posterior|probability)\b[^.\n]{0,60}?(?<![\d.])0?\.\d+/gi },
  { kind: 'count', re: /(?<![\d/.])\d+\s*\/\s*\d+(?![\d/.])/g },
  { kind: 'interval', re: /\b(?:CI|CrI|credible interval|confidence interval)\b[^.\d\n]{0,12}?-?\d+(?:\.\d+)?\s*(?:,|;|–|—|\bto\b)\s*-?\d+(?:\.\d+)?/gi },
];

/** Every number written in the supplied study information, normalised. */
function suppliedNumbers(supplied: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (v == null) return;
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.add(String(v));
      return;
    }
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\d+(?:\.\d+)?/g)) out.add(String(Number(m[0])));
      return;
    }
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(supplied);
  return out;
}

export interface UnsuppliedStatistic {
  kind: string;
  text: string;
}

/**
 * The statistics in `draft` that the supplied study information does not
 * contain. A match counts as supplied only when every number in it was
 * supplied (a planned sample size restated, for instance).
 */
export function findUnsuppliedStatistics(draft: string, supplied: unknown): UnsuppliedStatistic[] {
  const known = suppliedNumbers(supplied);
  const found: UnsuppliedStatistic[] = [];
  const seen = new Set<string>();
  for (const { kind, re } of PATTERNS) {
    for (const m of draft.matchAll(re)) {
      const text = m[0].trim();
      const numbers = text.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? [];
      const allSupplied = numbers.length > 0 && numbers.every((n) => known.has(String(Number(n))));
      if (allSupplied || seen.has(text)) continue;
      seen.add(text);
      found.push({ kind, text });
    }
  }
  return found;
}

/**
 * Whether a model draft of `sectionNumber` may be stored. False for an empty
 * draft, and for a statistical section that states a figure the study
 * information lacks — in which case the reason is written to `lineage` (when
 * given) so the section's provenance says why its template was used instead.
 */
export function acceptModelDraft(
  sectionNumber: string,
  draft: string | null | undefined,
  supplied: unknown,
  lineage?: Record<string, unknown>,
): draft is string {
  if (!draft) return false;
  if (!isStatisticalSection(sectionNumber)) return true;
  const unsupplied = findUnsuppliedStatistics(draft, supplied);
  if (unsupplied.length === 0) return true;
  if (lineage) {
    lineage.rejectedModelDraft = { reason: 'unsupplied_statistics', statistics: unsupplied.slice(0, 20) };
  }
  return false;
}
