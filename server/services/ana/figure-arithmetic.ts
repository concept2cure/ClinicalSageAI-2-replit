/**
 * The arithmetic a text states about itself: a percentage against its own n/N, and arm
 * counts against their stated total.
 *
 * This is not a comparison between documents — it recomputes what one text's own figures
 * imply and reports where the text disagrees with itself. "4.6% (15/305)" is wrong: 15/305
 * is 4.9%. Nothing is corrected and no prose is written.
 *
 * 2026-10-19: moved here verbatim from ana/dossierReconciliation.ts, which also held a
 * second copy of the platform's labelled-figure lexicon and a second cross-document
 * reconciler. Those were folded into intelligence/cross-artifact-consistency.ts and the
 * module deleted; this capability was never duplicated, so it kept its code and gained its
 * own file. `terminology-consistency.ts` reports its findings as 'arithmetic'.
 *
 * @module server/services/ana/figure-arithmetic
 */

/**
 * Round to `dp` decimal places. Lived in dossierReconciliation.ts above the arithmetic
 * code and was shared with the lexicon that moved to cross-artifact-consistency.ts; the
 * arithmetic check keeps its own, because the precision it rounds to is the stated
 * percentage's, not a label's.
 */
function roundDp(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

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
// A percentage. A decimal comma ("4,6 %", the European form) is a decimal point:
// read as a thousands separator it would be 46%, and read from its last digit, 6%.
const PCT = String.raw`(\d+(?:[.,]\d+)?)\s*%`;
const PAIR = String.raw`(${COUNT})\s*\/\s*(${COUNT})`;
// "4.6% (15/305)" — the parenthesis closes on the pair, or the pair ends at ; or ,
const PCT_THEN_PAIR = new RegExp(String.raw`(?<![\d.]|\d,)${PCT}\s*\(\s*${PAIR}\s*(?=[),;])`, 'g');
// "15/305 (4.6%)" — the percentage closes the parenthesis, or ends at ; or ,
const PAIR_THEN_PCT = new RegExp(String.raw`(?<![\d.,/])${PAIR}\s*\(\s*([<>≤≥]\s*)?${PCT}\s*(?=[),;])`, 'g');
const BOUNDED_BEFORE = /[<>≤≥]\s*$/;
// "12/2023" is a month and year, not a count over a denominator.
const isMonthYear = (n: string, total: string) => /^(?:19|20)\d\d$/.test(total) && Number(n) >= 1 && Number(n) <= 12;
// "amendment 3/4", "protocol version 2/3", "v2/3", "Amendment No. 3/4" name a
// document revision, not a count over a denominator. A bare "v" counts only when
// it touches the number ("v2/3"): "10/20 (50%) v 3/4 (75%)" is "versus".
// "release" is not a version word: "extended release 10/20 (40%)" is a count.
const VERSION_BEFORE =
  /\b(?:(?:version|ver|amendment|amend|amdt|revision|rev|edition)\.?\s*(?:(?:no|number)\.?\s*|#\s*)?|v)$/i;
/** The n/N starting at `at` is a date or a document revision, not a count over a denominator. */
const notACount = (text: string, at: number, n: string, total: string) =>
  isMonthYear(n, total) || VERSION_BEFORE.test(text.slice(Math.max(0, at - 30), at));

/** n/N reported as a percentage must round to the stated figure at the precision it is written to. */
function percentOf(clause: string, pctRaw: string, nRaw: string, totalRaw: string): ArithmeticFinding | null | 'skip' {
  const n = Number(nRaw.replace(/,/g, ''));
  const total = Number(totalRaw.replace(/,/g, ''));
  if (!(total > 0) || n > total) return 'skip';
  const stated = Number(pctRaw.replace(',', '.'));
  const d = pctRaw.split(/[.,]/)[1]?.length ?? 0;
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
// The text between the total's verb and its list must say the list is of that
// same total. A list is summed only after an empty bridge, a bridge that places
// the total in the study or its arms ("in the study", "equally to the two
// treatment groups"), or one that names the total as a whole-population
// analysis set ("and included in the full analysis set"). "to each arm" / "in
// each group" makes the count per arm, not the total, so "each" is not a
// same-population determiner. Anything else
// ("…randomized but only those who took study drug are shown (…)") may move to
// another population, so the list is not summed: an allow-list, because the
// ways of moving to another population cannot be listed.
const WHOLE_SET = String.raw`(?:FAS|full[\s-]analysis\s+set|m?ITT(?:\s+(?:population|set))?|intent(?:ion)?[\s-]to[\s-]treat\s+(?:population|set)|safety\s+(?:analysis\s+)?(?:set|population))`;
const SAME_POPULATION_BRIDGE = new RegExp(
  String.raw`^\s*(?:(?:equally\s+|randomly\s+)?(?:in|into|across|to|between|among)\s+(?:(?:the|this|both|all|two|three|four)\s+)*(?:study|trial|(?:treatment|study)\s+(?:arms?|groups?)|arms?|groups?|cohorts?)\s*|and\s+(?:were\s+)?(?:included|analy[sz]ed)\s+in\s+the\s+${WHOLE_SET}\s*)?(?:as\s+follows\s*)?:?\s*$`,
  'i',
);

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
 * same clause with nothing between them but wording that keeps the same
 * population (SAME_POPULATION_BRIDGE; "…randomized, 610 were treated (…)" sums
 * against 610, the count immediately before it). Totals are not compared across
 * populations (randomized vs treated vs an SAE denominator): an integrated
 * summary pools studies, a safety set can include subjects dosed without
 * randomization, and sex-specific or subgroup denominators legitimately differ
 * from the arm N. A month/year "12/2023" and a version or amendment number
 * ("amendment 3/4") are not read as n/N; a decimal comma ("4,6 %") is read as
 * a decimal point.
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
    const pairAt = m.index! + open + m[0].slice(open).search(/\d/);
    seenPairs.add(pairAt);
    if (!notACount(text, pairAt, m[2], m[3])) record(percentOf(clauseOf(m), m[1], m[2], m[3]));
  }
  for (const m of text.matchAll(PAIR_THEN_PCT)) {
    if (m[3] || seenPairs.has(m.index!) || notACount(text, m.index!, m[1], m[2])) continue; // m[3]: a bounded "(<1%)"
    record(percentOf(clauseOf(m), m[4], m[1], m[2]));
  }

  const seenLists = new Set<number>();
  for (const re of [TOTAL_THEN_VERB, VERB_THEN_TOTAL]) {
    for (const m of text.matchAll(re)) {
      const listAt = m.index! + m[0].lastIndexOf('(' + m[3] + ')');
      if (seenLists.has(listAt)) continue;
      seenLists.add(listAt);
      if (/\d\s*:\s*\d/.test(m[0])) continue; // a randomization ratio, not counts
      if (!SAME_POPULATION_BRIDGE.test(m[2])) continue;
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
