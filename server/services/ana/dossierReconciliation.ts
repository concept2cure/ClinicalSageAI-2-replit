/**
 * Dossier numerical reconciliation — flags the same labeled figure disagreeing
 * across documents/modules of a submission (e.g. enrolled N in the protocol vs
 * the CSR vs Module 2.7.3). This is a recurring reviewer finding and the
 * per-document `check_numerical_integrity` cannot see it because it only looks
 * within one artifact.
 *
 * Conservative by design: it extracts only figures that appear next to a curated
 * regulatory label (high precision, few false positives) and reports a
 * discrepancy when one label resolves to more than one distinct value across the
 * supplied documents. Deterministic — no model, no network.
 *
 * @module server/services/ana/dossierReconciliation
 */

export interface DossierDocument {
  /** Stable identifier (artifact id, module code, file name). */
  id: string;
  /** Optional human title for reporting. */
  title?: string;
  /** Plain-text content to scan. */
  text: string;
}

export interface ExtractedFact {
  docId: string;
  docTitle?: string;
  /** Normalized label key, e.g. 'enrolled_n', 'alpha', 'hazard_ratio'. */
  label: string;
  /** Normalized numeric value (counts as integers; rates/probabilities as fractions). */
  value: number;
  /** The matched text window, for traceability. */
  snippet: string;
}

export interface ReconciliationDiscrepancy {
  label: string;
  /** The distinct values found (rounded for comparison), ascending. */
  distinctValues: number[];
  /** Every place the label was found, so a reviewer can click through. */
  occurrences: Array<{ docId: string; docTitle?: string; value: number; snippet: string }>;
}

export interface ReconciliationResult {
  documentsChecked: number;
  factsExtracted: number;
  /** Labels that resolved to >1 distinct value across documents. */
  discrepancies: ReconciliationDiscrepancy[];
  /** Labels that were consistent everywhere they appeared (for assurance). */
  consistentLabels: string[];
  facts: ExtractedFact[];
}

interface LabelPattern {
  label: string;
  regex: RegExp;
  /** Transform the captured string into a normalized number. */
  normalize: (raw: string, full: string) => number | null;
  /** Round for cross-document equality comparison. */
  compareDp: number;
}

const toInt = (raw: string): number | null => {
  const n = Number(raw.replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const toFrac = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * Curated, high-precision label lexicon. Each pattern must place the captured
 * number immediately beside an unambiguous regulatory label so prose figures
 * are not swept up. Patterns are case-insensitive and global.
 */
const LABEL_PATTERNS: LabelPattern[] = [
  {
    label: 'enrolled_n',
    regex: /(?:enroll(?:ed|ment of)|randomi[sz]ed|accrued)\s+(?:a\s+total\s+of\s+)?([\d,]{1,9})\s+(?:patients|subjects|participants)/gi,
    normalize: toInt,
    compareDp: 0,
  },
  {
    label: 'sample_size_n',
    regex: /(?:sample\s+size|target\s+(?:enrol+ment|N)|total\s+N)\s*(?:of|=|:|\bis\b)?\s*([\d,]{1,9})\b/gi,
    normalize: toInt,
    compareDp: 0,
  },
  {
    label: 'sites',
    regex: /([\d,]{1,6})\s+(?:investigational\s+)?(?:sites|centers|centres)\b/gi,
    normalize: toInt,
    compareDp: 0,
  },
  {
    label: 'events',
    regex: /([\d,]{1,7})\s+(?:primary\s+)?(?:events|deaths)\b/gi,
    normalize: toInt,
    compareDp: 0,
  },
  {
    label: 'alpha',
    regex: /(?:alpha|type\s*I\s*error(?:\s*rate)?|significance\s+level)\s*(?:of|=|:|\bis\b)?\s*(0?\.\d{1,4})/gi,
    normalize: toFrac,
    compareDp: 4,
  },
  {
    label: 'power',
    regex: /power\s*(?:of|=|:|\bis\b)?\s*((?:0?\.\d{1,4})|(?:\d{1,3})\s*%)/gi,
    normalize: (raw: string) => {
      const pct = /%/.test(raw);
      const n = Number(raw.replace(/[%\s]/g, ''));
      if (!Number.isFinite(n)) return null;
      return pct ? n / 100 : n > 1 ? n / 100 : n;
    },
    compareDp: 3,
  },
  {
    label: 'hazard_ratio',
    regex: /(?:hazard\s+ratio|\bHR\b)\s*(?:of|=|:|\bwas\b|\bis\b)?\s*(\d?\.\d{1,4})/gi,
    normalize: toFrac,
    compareDp: 3,
  },
  {
    label: 'primary_p_value',
    regex: /\bp\s*(?:-?\s*value)?\s*[=<]\s*(0?\.\d{1,5})/gi,
    normalize: toFrac,
    compareDp: 5,
  },
];

/** Round to dp decimal places for stable equality comparison. */
function roundDp(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Scan a set of documents for labeled figures and report any label that
 * disagrees across documents. Deterministic.
 */
export function reconcileDossierNumbers(
  documents: DossierDocument[],
): ReconciliationResult {
  if (!Array.isArray(documents)) {
    throw new Error('documents must be an array of { id, text }');
  }
  const facts: ExtractedFact[] = [];

  for (const doc of documents) {
    if (!doc || typeof doc.id !== 'string' || typeof doc.text !== 'string') {
      throw new Error('each document must have a string id and string text');
    }
    for (const pat of LABEL_PATTERNS) {
      pat.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(doc.text)) !== null) {
        const value = pat.normalize(m[1], m[0]);
        if (value === null) continue;
        const start = Math.max(0, m.index - 12);
        const snippet = doc.text.slice(start, m.index + m[0].length + 8).replace(/\s+/g, ' ').trim();
        facts.push({ docId: doc.id, docTitle: doc.title, label: pat.label, value, snippet });
      }
    }
  }

  // Group by label and detect cross-document divergence.
  const byLabel = new Map<string, ExtractedFact[]>();
  const dpByLabel = new Map(LABEL_PATTERNS.map(p => [p.label, p.compareDp]));
  for (const f of facts) {
    const arr = byLabel.get(f.label) ?? [];
    arr.push(f);
    byLabel.set(f.label, arr);
  }

  const discrepancies: ReconciliationDiscrepancy[] = [];
  const consistentLabels: string[] = [];
  for (const [label, group] of byLabel) {
    const dp = dpByLabel.get(label) ?? 4;
    const distinct = Array.from(new Set(group.map(g => roundDp(g.value, dp)))).sort((a, b) => a - b);
    if (distinct.length > 1) {
      discrepancies.push({
        label,
        distinctValues: distinct,
        occurrences: group.map(g => ({ docId: g.docId, docTitle: g.docTitle, value: g.value, snippet: g.snippet })),
      });
    } else if (group.length > 0) {
      consistentLabels.push(label);
    }
  }

  discrepancies.sort((a, b) => a.label.localeCompare(b.label));
  consistentLabels.sort();

  return {
    documentsChecked: documents.length,
    factsExtracted: facts.length,
    discrepancies,
    consistentLabels,
    facts,
  };
}

// ── Within-document figure arithmetic ──────────────────────────────────────

export interface ArithmeticFinding {
  /** 'percent_of': x% against its own n/N. 'arm_sum': arm counts against their stated total. */
  kind: 'percent_of' | 'arm_sum';
  /** The text the figures were read from, so the writer can locate it. */
  clause: string;
  /** The figure as written (a percentage, or the total). */
  stated: number;
  /** The figure the text's own counts give (100·n/N at one more decimal than stated, or the arm sum). */
  recomputed: number;
}

export interface ArithmeticResult {
  findings: ArithmeticFinding[];
  /** Percent/n/N pairs actually recomputed (bounded or impossible pairs are not). */
  percentPairsChecked: number;
  /** Totals whose arm list parsed completely and was summed. */
  armSumsChecked: number;
}

// A count: 1,234 or 1234 — never the start of a decimal or a longer number.
const COUNT = String.raw`\d{1,3}(?:,\d{3})+(?![\d,])|\d+(?![\d.,]?\d)`;
const PCT = String.raw`(\d+(?:\.\d+)?)\s*%`;
const PAIR = String.raw`(${COUNT})\s*\/\s*(${COUNT})`;
// "4.6% (15/305)" — the parenthesis closes on the pair, or the pair ends at ; or ,
const PCT_THEN_PAIR = new RegExp(String.raw`(?<![\d.])${PCT}\s*\(\s*${PAIR}\s*(?=[),;])`, 'g');
// "15/305 (4.6%)" — the percentage closes the parenthesis, or ends at ; or ,
const PAIR_THEN_PCT = new RegExp(String.raw`(?<![\d.,/])${PAIR}\s*\(\s*([<>≤≥]\s*)?${PCT}\s*(?=[),;])`, 'g');
const BOUNDED_BEFORE = /[<>≤≥]\s*$/;
// "12/2023" is a month and year, not a count over a denominator.
const isMonthYear = (n: string, total: string) => /^(?:19|20)\d\d$/.test(total) && Number(n) >= 1 && Number(n) <= 12;

/** n/N reported as a percentage must round to the stated figure at the precision it is written to. */
function percentOf(clause: string, pctRaw: string, nRaw: string, totalRaw: string): ArithmeticFinding | null | 'skip' {
  const n = Number(nRaw.replace(/,/g, ''));
  const total = Number(totalRaw.replace(/,/g, ''));
  if (!(total > 0) || n > total) return 'skip';
  const stated = Number(pctRaw);
  const d = pctRaw.split('.')[1]?.length ?? 0;
  const exact = (100 * n) / total;
  // An exact half (12.5% written as 12 or 13) is accepted either way.
  if (Math.abs(stated - exact) <= 0.5 * 10 ** -d + 1e-9) return null;
  return { kind: 'percent_of', clause, stated, recomputed: roundDp(exact, d + 1) };
}

// A total introduced by randomized/treated/enrolled, in either order, then a
// parenthetical (one level of nesting, for "Drug X (n=306)") in the same clause:
// the bridge to it (group 2) holds no digit, comma or semicolon, so a second
// count or clause ("…randomized, 610 received…") ends the match.
const PAREN = String.raw`([^().,;\d\n]{0,80}?)\(((?:[^()]|\([^()]*\))*)\)`;
const NOUN = String.raw`(?:subjects|patients|participants)`;
const TOTAL_THEN_VERB = new RegExp(
  String.raw`(?<![\d.,])(${COUNT})\s+(?:${NOUN}\s+)?(?:(?:were|was|have\s+been|had\s+been)\s+)?(?:randomi[sz]ed|treated|enrolled)\b${PAREN}`,
  'gi',
);
const VERB_THEN_TOTAL = new RegExp(
  String.raw`\b(?:randomi[sz]ed|treated|enrolled)\s+(?:a\s+total\s+of\s+)?(${COUNT})(?!\s*:)(?:\s+${NOUN})?\b${PAREN}`,
  'gi',
);
const ARM_TO = new RegExp(String.raw`^(${COUNT})\s+(?:${NOUN}\s+)?(?:to|in|received)\s+\S`, 'i');
// "Drug X (n=306)", "Drug X, n=306" or "Drug X: n=306".
const ARM_N = new RegExp(String.raw`^[^()]*\S(?:\s*\(\s*n\s*=\s*(${COUNT})\s*\)|\s*[,:]\s*n\s*=\s*(${COUNT}))$`, 'i');
// Split on ; , and "and" — but not on the comma inside 1,234 or before "n=".
const ARM_SPLIT = /\s*(?:;|,(?!\d{3}(?!\d))(?!\s*n\s*=)|\band\b)\s*/i;
// An item naming an analysis population or an exposure/disposition set: the
// list partitions the total by population, not by arm, so it is not summed.
const POPULATION_ITEM =
  /\b(?:FAS|full[\s-]analysis|m?ITT|intent(?:ion)?[\s-]to[\s-]treat|PPS?|per[\s-]protocol|safety|set|population|analysis|evaluable|completed|discontinued|withdrew|dosed|at\s+least\s+one\s+dose|(?:all|any)\s+doses?)\b/i;
// A bridge that moves to another population ("…randomized and those completing
// the study were analysed (…)") leaves the list unrelated to the total.
const POPULATION_BRIDGE = new RegExp(String.raw`${POPULATION_ITEM.source}|\b(?:receiv|treat|complet|analy[sz])\w*`, 'i');

/**
 * The arm counts of a parenthetical, or null when any item is not an arm count
 * or names an analysis population. A nested "(n=1,224)" holds no separator
 * ARM_SPLIT acts on; any other nested text makes its item unparseable, so the
 * whole list is skipped.
 */
function armCounts(list: string): number[] | null {
  const counts: number[] = [];
  for (const item of list.split(ARM_SPLIT).map(s => s.trim()).filter(Boolean)) {
    if (POPULATION_ITEM.test(item)) return null;
    const m = ARM_TO.exec(item) ?? ARM_N.exec(item);
    if (!m) return null;
    counts.push(Number((m[1] ?? m[2]).replace(/,/g, '')));
  }
  return counts.length >= 2 ? counts : null;
}

/**
 * Recompute the figures a text states about itself: every "x% (n/N)" and
 * "n/N (x%)" against 100·n/N at the stated precision, and every arm list after
 * a randomized/treated/enrolled total against that total. Pure and total.
 *
 * Deliberately narrow, because a finding here is a verdict. Bounded figures
 * ("<1%", "≥50%") and impossible pairs (N = 0, n > N) are not recomputed; an
 * arm list is summed only when every item parses as an arm count, none names
 * an analysis population (FAS, PP, safety set, "received at least one dose"),
 * no randomization ratio is present, and the list follows its total in the
 * same clause (no second count, comma, semicolon or population word between
 * them; "…randomized, 610 were treated (…)" sums against 610, the count
 * immediately before it). Totals are not compared across
 * populations (randomized vs treated vs an SAE denominator): an integrated
 * summary pools studies, a safety set can include subjects dosed without
 * randomization, and sex-specific or subgroup denominators legitimately differ
 * from the arm N. A month/year "12/2023" is not read as n/N.
 * Findings state the recomputed figure; they never propose a correction.
 */
export function checkFigureArithmetic(text: string): ArithmeticResult {
  const findings: ArithmeticFinding[] = [];
  let percentPairsChecked = 0;
  let armSumsChecked = 0;

  const seenPairs = new Set<number>();
  const record = (r: ArithmeticFinding | null | 'skip') => {
    if (r === 'skip') return;
    percentPairsChecked++;
    if (r) findings.push(r);
  };
  // The clause as written, closing parenthesis included when that is what ended it.
  const clauseOf = (m: RegExpMatchArray) => m[0].trim() + (text[m.index! + m[0].length] === ')' ? ')' : '');
  for (const m of text.matchAll(PCT_THEN_PAIR)) {
    if (BOUNDED_BEFORE.test(text.slice(Math.max(0, m.index! - 3), m.index))) continue;
    const open = m[0].indexOf('(');
    seenPairs.add(m.index! + open + m[0].slice(open).search(/\d/));
    if (!isMonthYear(m[2], m[3])) record(percentOf(clauseOf(m), m[1], m[2], m[3]));
  }
  for (const m of text.matchAll(PAIR_THEN_PCT)) {
    if (m[3] || seenPairs.has(m.index!) || isMonthYear(m[1], m[2])) continue; // m[3]: a bounded "(<1%)"
    record(percentOf(clauseOf(m), m[4], m[1], m[2]));
  }

  const seenLists = new Set<number>();
  for (const re of [TOTAL_THEN_VERB, VERB_THEN_TOTAL]) {
    for (const m of text.matchAll(re)) {
      const listAt = m.index! + m[0].lastIndexOf('(' + m[3] + ')');
      if (seenLists.has(listAt)) continue;
      seenLists.add(listAt);
      if (/\d\s*:\s*\d/.test(m[0])) continue; // a randomization ratio, not counts
      if (POPULATION_BRIDGE.test(m[2])) continue;
      const counts = armCounts(m[3]);
      if (!counts) continue;
      armSumsChecked++;
      const stated = Number(m[1].replace(/,/g, ''));
      const sum = counts.reduce((a, b) => a + b, 0);
      if (sum !== stated) findings.push({ kind: 'arm_sum', clause: m[0].trim(), stated, recomputed: sum });
    }
  }

  return { findings, percentPairsChecked, armSumsChecked };
}
