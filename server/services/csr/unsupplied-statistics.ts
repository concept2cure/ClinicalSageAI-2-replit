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
import { numericalClaimDisplays, numericalFigures, renderedCsrText, type NumericalTextFormat } from '../../../shared/authoring/csr-scientific-review.js';

/** ICH E3 sections whose content is statistical methods or results. */
const STATISTICAL_SECTION = /^(2|9\.7|10|11|12|13|14)(\.|$)/;

export function isStatisticalSection(sectionNumber: string): boolean {
  return STATISTICAL_SECTION.test(sectionNumber.trim());
}

/**
 * ICH E3 sections 10–13 report OBSERVED clinical disposition, efficacy,
 * safety and interpretation. A planned sample size, phase, protocol number or
 * study-metadata digit is never a substitute for an observed result's
 * retained analysis-table cell. §2 (synopsis) and §9.7 (methods) also contain
 * planned design facts, so their metadata allowance is handled separately.
 */
export function isCsrObservedResultsSection(sectionNumber: string): boolean {
  return /^1[0-3](?:\.|$)/.test(sectionNumber.trim());
}

/** ICH E3 §2 mixes planned design with actual outcomes. The plan's enrollment
 * target cannot support an observed number elsewhere in the same synopsis.
 * Inspect clinical-result clauses independently; a flat list of metadata
 * digits is not enough to distinguish an actual count from a planned one.
 */
export function unclaimedCsrSynopsisResults(prose: string, claimed: string[], format: NumericalTextFormat = 'encoded'): string[] {
  const observed = /\b(?:completed|reported|experienced|occurred|died|deaths?|fatal\w*|responders?|remission|cured|(?:were|was)\s+(?:randomi[sz]ed|enrolled|treated|observed))\b/i;
  const planned = /\b(?:planned|targeted|intended|expected|proposed|anticipated)\b/i;
  const findings = new Set<string>();
  for (const clause of prose.split(/;|\n+|(?<=\.)\s+(?=[A-Z0-9])/)) {
    if (!observed.test(clause)) continue;
    // A clause describing planned recruitment is not an observed finding.
    // Actual-conduct verbs in that same clause still require receipts.
    if (planned.test(clause) && !/\b(?:completed|reported|experienced|occurred|died|deaths?|fatal\w*|cured|remission)\b/i.test(clause)) continue;
    for (const figure of findUnclaimedNumbers(clause, { claimed }, format)) findings.add(figure.text);
  }
  return [...findings];
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

/** Every supplied numerical identity, including its comparator, sign,
 * displayed precision and unit. Equal digit magnitudes are not equal claims. */
function suppliedNumbers(supplied: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (v == null) return;
    if (typeof v === 'number' && Number.isFinite(v)) {
      for (const figure of numericalFigures(String(v))) out.add(figure.identity);
      return;
    }
    if (typeof v === 'string') {
      for (const figure of numericalFigures(v)) out.add(figure.identity);
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
  const visible = renderedCsrText(draft);
  const found: UnsuppliedStatistic[] = [];
  const seen = new Set<string>();
  for (const { kind, re } of PATTERNS) {
    for (const m of visible.matchAll(re)) {
      const text = m[0].trim();
      const numbers = numericalFigures(text, 'text');
      const allSupplied = numbers.length > 0 && numbers.every(n => known.has(n.identity));
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

// A number with two or more points ("16.2.8", "12.4.2.1") is a report part even with no word before it: no clinical
// figure is written that way. ICH E3's own title of §12.4.1 carries two ("… by Patient (16.2.8) and Each Abnormal
// Laboratory Value (14.3.4)"), and the builder tells the model to head the section with that title. Read as the
// figures 16.2, 0.8, 14.3 and 0.4, they refused every draft of §12.4.1 that obeyed (2026-11-10). Never a percentage.
const PART_NUMBER = /(?<![\d.])\d+(?:\.\d+){2,}(?!\.?\d)(?!\s*%)/g;

/**
 * Every number in an evidence-bound draft that neither a reconciled claim nor
 * the study information carries. The statistic patterns above recognise how a
 * figure is usually written; a section drafted over retained tables is held to
 * more: any number at all ("13 of 114", "11.5 percent") must be a claimed
 * cell's. Cross-references to report parts are not figures.
 */
export function findUnclaimedNumbers(prose: string, supplied: unknown, format: NumericalTextFormat = 'encoded'): UnsuppliedStatistic[] {
  const known = suppliedNumbers(supplied);
  const found: UnsuppliedStatistic[] = [];
  // A protocol/product identifier is not a clinical figure. It may contain
  // digits (LMN-201, PROTO-7, NCT05330182), and the synopsis/result text
  // legitimately names its study while its outcomes must still cite cells.
  // Exempt only visibly structured UPPERCASE identifiers, not bare metadata
  // digits or quantitative phrases such as "300 patients" or "300mg".
  const identifiers = /\b(?:NCT\d{8}|[A-Z]{2,}[A-Z0-9_-]*[-_][A-Z0-9_-]*\d[A-Z0-9_-]*)\b/g;
  const text = renderedCsrText(prose, format).replace(REFERENCE, ' ').replace(PART_NUMBER, ' ').replace(identifiers, ' ');
  for (const figure of numericalFigures(text, 'text')) {
    if (known.has(figure.identity)) continue;
    // Keep the established caller-facing number field; the admission above
    // compares its full identity and visits every occurrence independently.
    found.push({ kind: 'number', text: figure.number });
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
/** High-consequence qualitative clinical conclusions require more than a
 * model's interpretation of study metadata or an arbitrary numeric cell.
 * The source table might show zero patients for one category, but whether
 * "no safety signal" or "the endpoint was met" is justified still requires the
 * recorded analysis population, SAP criteria and independent clinical review.
 *
 * Automated sections may instead state the verbatim cell count with a claim
 * receipt. Human reviewers may author a justified conclusion in the governed
 * editor using the actual verified source and their own sign-off.
 */
export function findUnsupportedCsrOutcomeConclusion(sectionNumber: string, prose: string): string | null {
  if (sectionNumber.trim() !== '2' && !isCsrObservedResultsSection(sectionNumber)) return null;
  const text = prose.replace(/\[[^\]]*\]/g, ' ');
  const conclusions: Array<{ code: string; pattern: RegExp }> = [
    { code: 'absence_of_safety_event', pattern:
      /\b(?:no|zero)\s+(?:(?:treatment[- ](?:emergent|related)|serious|fatal|clinically significant)\s+){0,3}(?:deaths?|fatalities|adverse events?|saes?|safety signals?)\b/i },
    { code: 'endpoint_success', pattern:
      /\b(?:(?:primary|secondary|co-primary)\s+(?:efficacy\s+)?)?endpoints?\s+(?:was|were|is|has been|have been)\s+(?:met|achieved|satisfied)\b/i },
    { code: 'comparative_success', pattern:
      /\b(?:demonstrated|established|confirmed|proved)\s+(?:non[- ]?inferiority|superiority|equivalence)\b/i },
    { code: 'safety_or_benefit_risk_verdict', pattern:
      /\b(?:well[- ]tolerated|no clinically meaningful (?:safety )?(?:differences?|changes?)|favo[u]?rable benefit[- ]risk)\b/i },
  ];
  // "Whether the primary endpoint was met is not established" identifies
  // an UNKNOWN, not an affirmative conclusion. Evaluate clause by clause and
  // exempt only a plainly nonassertive question/negative-evidence statement.
  // An adversative clause ("however the endpoint WAS met") remains subject
  // to the outcome refusal. Do not globally remove all negative words.
  const clauses = text.split(/[;\n]+/);
  for (const clause of clauses) {
    const uncertain =
      (/^\s*(?:whether|if)\b/i.test(clause) &&
       /\b(?:is|was|remains)\s+(?:not\s+(?:established|confirmed|known|documented)|unknown|uncertain)\b/i.test(clause)) ||
      (/^\s*(?:there\s+(?:is|was)\s+)?no\s+(?:evidence|record|documentation)\s+that\b/i.test(clause));
    if (uncertain && !/\b(?:but|however|nevertheless|although)\b/i.test(clause)) continue;
    const found = conclusions.find(item => item.pattern.test(clause));
    if (found) return found.code;
  }
  return null;
}

/** Narrow clinical-meaning check for a high-consequence misattribution.
 *
 * Exact-cell numerical reconciliation alone would allow "300 patients died"
 * when the model claimed 300 from the Safety population row (and the death
 * table actually reports 1). This checks that every explicit death/fatal-event
 * count is tied to a death/fatal-event row with that SAME count. It does not
 * pretend to resolve all endpoint semantics; human scientific review remains
 * mandatory for interpretation and risk conclusions.
 */
export function unsupportedCsrDeathCounts(
  prose: string,
  claims: unknown,
  evidence: CsrAuthoringEvidence,
): string[] {
  if (!Array.isArray(claims)) return [];
  const figures = new Set<string>();
  for (const match of prose.matchAll(
    /\b(?:([0-9][0-9,]*)\s+(?:patients?|subjects?|participants?)\s+(?:died|were\s+deceased)|([0-9][0-9,]*)\s+(?:deaths?|fatalities|fatal\s+(?:adverse\s+)?events?))\b/gi,
  )) {
    const count = (match[1] ?? match[2]).replace(/,/g, '');
    figures.add(count);
  }
  const supported = new Set<string>();
  for (const claim of claims) {
    if (!claim || typeof claim !== 'object') continue;
    const c = claim as { table?: unknown; row?: unknown; column?: unknown; value?: unknown };
    if (typeof c.table !== 'string' || !Number.isSafeInteger(c.row) ||
        !Number.isSafeInteger(c.column) || typeof c.value !== 'string') continue;
    const table = evidence.tables.find(t => t.key === c.table);
    if (!table || !/^(?:deathsSAEsDiscontinuations|aeOverallSummary|aeBySOC|aeTopPT)$/.test(c.table)) continue;
    const row = table.rows[c.row as number];
    const label = row?.[0] ?? '';
    if (!/\b(?:deaths?|fatal\w*|mortality)\b/i.test(label)) continue;
    if (row?.[c.column as number] !== c.value) continue;
    const first = c.value.match(/^\s*([0-9][0-9,]*)\b/);
    if (first) supported.add(first[1].replace(/,/g, ''));
  }
  return [...figures].filter(n => !supported.has(n));
}

/**
 * The death figures of a results or synopsis section that no death row supports, split in two: those the draft
 * claimed from another row (a misattribution, `outcome_cell_mismatch`) and those it did not claim at all, which are
 * unreconciled figures like any other unclaimed number. Either kind refuses the draft.
 */
function unsupportedDeathFigures(
  sectionNumber: string, prose: string, claims: unknown, evidence: CsrAuthoringEvidence, claimed: string[],
): { misattributed: string[]; unclaimed: string[] } {
  if (!isCsrObservedResultsSection(sectionNumber) && sectionNumber.trim() !== '2') return { misattributed: [], unclaimed: [] };
  const figures = unsupportedCsrDeathCounts(prose, claims, evidence);
  const cited = new Set(claimed.map(value => /^\s*([0-9][0-9,]*)\b/.exec(value)?.[1]?.replace(/,/g, '')));
  return { misattributed: figures.filter(n => cited.has(n)), unclaimed: figures.filter(n => !cited.has(n)) };
}

/** A model's draft of one section: its prose and the claims it made about it. */
export interface EvidenceBoundDraft {
  sectionNumber: string;
  prose: string;
  claims: unknown;
}

export function acceptEvidenceBoundDraft(
  { sectionNumber, prose, claims }: EvidenceBoundDraft,
  evidence: CsrAuthoringEvidence,
  supplied: unknown,
  lineage: Record<string, unknown>,
): boolean {
  if (!prose.trim()) return false;
  // Neither matching a planned number nor citing an unrelated table cell can
  // substantiate a categorical efficacy/safety verdict. Do not claim one as
  // machine-authored medical writing; flag it for independent human review.
  const unsupportedOutcome = findUnsupportedCsrOutcomeConclusion(sectionNumber, prose);
  if (unsupportedOutcome) {
    lineage.rejectedModelDraft = { reason: 'unsubstantiated_outcome_conclusion',
      category: unsupportedOutcome, evidenceDigest: evidence.evidenceDigest };
    return false;
  }
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
  const claimed = numericalClaimDisplays(prose, (claims as Array<{ table: string; column: number; value: string }>).map(c => ({
    value: c.value, header: evidence.tables.find(table => table.key === c.table)?.headers[c.column],
  })));
  const deaths = unsupportedDeathFigures(sectionNumber, prose, claims, evidence, claimed);
  if (deaths.misattributed.length) {
    lineage.rejectedModelDraft = { reason: 'outcome_cell_mismatch',
      category: 'death_count', evidenceDigest: evidence.evidenceDigest };
    return false;
  }
  if (sectionNumber.trim() === '2' && unclaimedCsrSynopsisResults(prose, claimed).length) {
    lineage.rejectedModelDraft = { reason: 'synopsis_observed_figures_unclaimed',
      evidenceDigest: evidence.evidenceDigest };
    return false;
  }
  // Rule 2: only an engine cell can support a clinical RESULT. Before this
  // guard, the metadata's planned enrollment (e.g. sampleSize=300) made an
  // invented claim of "300 patients died" pass with zero cell receipts:
  // findUnsuppliedStatistics and findUnclaimedNumbers both searched the
  // metadata's digits and mistook that unrelated number for support.
  // Preserve the metadata allowance for synopsis/methods/planned design; it
  // must NOT authorize observed results in E3 §§10–13.
  const known = isCsrObservedResultsSection(sectionNumber) ? { claimed } : { supplied, claimed };
  const statistics = isStatisticalSection(sectionNumber) ? findUnsuppliedStatistics(prose, known) : [];
  const scanned = statistics.length > 0 ? statistics : findUnclaimedNumbers(prose, known);
  // An unclaimed death figure refuses the draft even where the metadata's digits would let it pass the scan (§2).
  const unsupplied = scanned.length > 0 ? scanned : deaths.unclaimed.map(text => ({ kind: 'death_count', text }));
  if (unsupplied.length > 0) {
    lineage.rejectedModelDraft = { reason: 'unreconciled_figures', evidenceDigest: evidence.evidenceDigest, statistics: unsupplied.slice(0, 20) };
    return false;
  }
  lineage.reconciliation = { basis: reconciliation.basis, status: reconciliation.status, evidenceDigest: evidence.evidenceDigest,
    clinicalVerification: reconciliation.clinicalVerification, findings: reconciliation.findings };
  return true;
}
