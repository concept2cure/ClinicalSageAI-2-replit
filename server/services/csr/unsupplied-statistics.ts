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

import { reconcileCsrTableClaims, type CsrAuthoringEvidence } from './cortex-authoring-context.js';

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

// A cross-reference to a report part, not a figure: "section 14", "§12.2.1",
// "Table 14.3.1", "Listing 16.2.7", "ICH E3". Never followed by a percent sign.
const REFERENCE = /(?:\b(?:sections?|tables?|figures?|listings?|appendi(?:x|ces)|ICH\s+E)|§)\s*\d+(?:\.\d+)*(?![\d.]*\s*%)/gi;

/**
 * Every number in an evidence-bound draft that neither a reconciled claim nor
 * the study information carries. The statistic patterns above recognise how a
 * figure is usually written; a section drafted over retained tables is held to
 * more: any number at all ("13 of 114", "11.5 percent") must be a claimed
 * cell's. Cross-references to report parts are not figures.
 */
export function findUnclaimedNumbers(prose: string, supplied: unknown): UnsuppliedStatistic[] {
  const known = suppliedNumbers(supplied);
  const found: UnsuppliedStatistic[] = [];
  const text = prose.replace(REFERENCE, ' ').replace(/(\d),(?=\d{3}\b)/g, '$1');
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
    if (known.has(String(Number(m[0]))) || found.some((f) => f.text === m[0])) continue;
    found.push({ kind: 'number', text: m[0] });
  }
  return found;
}

/**
 * Whether a model draft of an evidence-bound results section may be stored
 * (docs/design/CSR_END_TO_END_2026-10-29.md, slice 2). The section was given
 * its retained engine tables (cortex-authoring-context), and the model listed
 * the cell behind every figure it wrote. Two checks, both deterministic:
 *
 *   1. reconcileCsrTableClaims: every claimed value is the exact text of the
 *      cell it names. A mismatched, unsupported or malformed claim refuses.
 *   2. findUnsuppliedStatistics, then findUnclaimedNumbers: every statistic,
 *      and every other number, in the prose is one that a reconciled claim (or
 *      the study information) carries. A figure without a matching claim — an
 *      AE percentage off by one, a numerator in "13 of 114" — refuses.
 *
 * The supplied set is the claimed cells, not every cell of the pack, so an
 * invented figure cannot pass by coinciding with an unrelated cell. On refusal
 * the reason goes to `lineage.rejectedModelDraft`; on acceptance the claim
 * receipts go to `lineage.reconciliation`.
 */
export function acceptEvidenceBoundDraft(
  sectionNumber: string,
  prose: string,
  claims: unknown,
  evidence: CsrAuthoringEvidence,
  supplied: unknown,
  lineage: Record<string, unknown>,
): boolean {
  if (!prose.trim()) return false;
  let reconciliation: ReturnType<typeof reconcileCsrTableClaims>;
  try {
    reconciliation = reconcileCsrTableClaims(evidence, claims);
  } catch {
    lineage.rejectedModelDraft = { reason: 'claims_invalid', evidenceDigest: evidence.evidenceDigest };
    return false;
  }
  const unreconciled = reconciliation.findings.filter((f) => f.status !== 'matches');
  if (unreconciled.length > 0) {
    lineage.rejectedModelDraft = { reason: 'unreconciled_claims', evidenceDigest: evidence.evidenceDigest, findings: unreconciled.slice(0, 20) };
    return false;
  }
  const claimed = (claims as Array<{ value: string }>).map((c) => c.value);
  const known = { supplied, claimed };
  const statistics = isStatisticalSection(sectionNumber) ? findUnsuppliedStatistics(prose, known) : [];
  const unsupplied = statistics.length > 0 ? statistics : findUnclaimedNumbers(prose, known);
  if (unsupplied.length > 0) {
    lineage.rejectedModelDraft = { reason: 'unreconciled_figures', evidenceDigest: evidence.evidenceDigest, statistics: unsupplied.slice(0, 20) };
    return false;
  }
  lineage.reconciliation = { basis: reconciliation.basis, status: reconciliation.status, evidenceDigest: evidence.evidenceDigest,
    clinicalVerification: reconciliation.clinicalVerification, findings: reconciliation.findings };
  return true;
}
