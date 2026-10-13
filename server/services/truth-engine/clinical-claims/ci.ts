/**
 * Estimate, interval and p-value groups as written (design §3, E1–E3, P1, C15):
 * "0.72 (95% CI 0.61, 0.85; p<0.001)", "-0.62% (95% CI: −0.78, −0.46; p<0.0001)",
 * "0,72 (95 % CI [0,61; 0,85]; …)", "0.68 (95% CI 0.56-0.82)", "HR = 0.81 [95% CI:
 * 0.69; 0.95], p = 0.009", "-1.8% with a one-sided 97.5% confidence interval lower
 * bound of -5.6%", "−1.2 kg (95% CI: see Table 14.2.2.1)" (unreadable),
 * "0.72 (CI 0.61–0.85)" (level unstated). A comma-p inside the bracket is cut
 * first, never the cause of a dropped interval (F13).
 */
import type { DocInfo } from './doc';
import { readNumber, type WrittenNumber } from './number';
import type { CI, PBasis, ReasonCode } from './types';

export interface EstimateGroup {
  start: number;
  end: number;
  estimate: WrittenNumber;
  unit?: string;
  pctMarked: boolean;
  lower?: WrittenNumber;
  upper?: WrittenNumber;
  ci?: CI;
  /** Further intervals of the same estimate written in the same bracket ("95% CI …; 90% CI …"), each its own claim. */
  extra?: Array<{ ci: CI; lower?: WrittenNumber; upper?: WrittenNumber }>;
  intervalUnread?: ReasonCode;
  p?: WrittenNumber;
  pSided?: 'one' | 'two';
  pBasis?: PBasis;
  /** "for Drug X 20 mg" between the estimate and its interval. */
  forArm?: string;
  percentagePoints?: boolean;
}

// A thousands-grouped value is one number ("1,012.4" patient-years), its reading decided by readNumber.
const NUM = String.raw`[-−–]?\s?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|\d+(?:[.,·]\d+)?)`;
const BOUND = String.raw`(?:${NUM}\s?%?|NR|not\s+reached)`;
const UNIT = String.raw`(?:\s?%|\s+percentage\s+points|\s+(?:L|kg|mmHg|mmol\/mol|g\/day|months|mg\/dL)\b)`;
// "95%", "95.0%", "95 %", and the level written out: "95 percent confidence interval" states its level as
// plainly as "95% CI" (r2 num-08).
const LEVEL = String.raw`(\d+(?:[.,]\d+)?)\s?(?:%|per\s?cent\b|percent\b)`;
const SIDED = String.raw`(?:(two|one)-sided\s+)?`;
// The interval's kind, with the abbreviation regulatory style gives on first use ("95% confidence interval [CI]:")
// and the SAS/statistician wording ("95% confidence limits 0.63, 0.91") (r2 num-07, pv-ci-confidence-limits).
const KIND = String.raw`((?:CI|CrI|confidence\s+interval|credible\s+interval|confidence\s+limits|credible\s+limits)(?:\s*[[(]\s*(?:CI|CrI)\s*[\])])?)`;
const RSEP = String.raw`\s*(?:,|;|\bto\b|–|-(?=\s?\d)|−(?=\s?\d))\s*`;
/**
 * A p-value as written: with an operator ("p=0.0094", "p<0.001") or in prose ("the p-value was 0.003", "a p-value
 * of 0.003" — ordinary CSR narrative, r2 num-15), and in scientific notation ("p = 1.4 x 10-4", r2 num-03/04).
 */
const PVAL = String.raw`(?:\d+(?:[.,·]\d+)?|[.,]\d+)(?:\s*(?:[x×*·]\s*10|[eE])\s*\^?\s*[-−–+]?\s*\d{1,3})?`;
const P = String.raw`(?:(two|one)-sided\s+)?(?:(?:stratified\s+)?(?:log-rank\s+|CMH\s+)?)?p(?:-value)?\s*(=|<|≤|>|<=|\s+was|\s+of)\s*(${PVAL})`;

function rd(raw: string | undefined, doc: DocInfo): WrittenNumber | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (/^(?:NR|not\s+reached)$/i.test(s)) return readNumber('NR') ?? undefined;
  return readNumber(s, { convention: doc.convention }) ?? undefined;
}

/**
 * The basis of a p-value from the words written with it (r1 nsf-01..04): "one-sided p=0.0047", "p=0.0094 (stratified
 * log-rank test)", "p=0.0101 (Wald test from the stratified Cox model)", "p=0.0094 (nominal)", "p=0.0376 (adjusted for
 * multiplicity)". Undefined when nothing is stated: an unstated p is two-sided (C3) and its test unstated.
 */
export function pBasisOf(window: string, sided?: 'one' | 'two'): PBasis | undefined {
  const b: PBasis = {};
  const sd = sided ?? (/\b(one|two)-sided\b/i.exec(window)?.[1]?.toLowerCase() as 'one' | 'two' | undefined);
  if (sd) b.sided = sd;
  if (/\blog-rank\b/i.test(window)) b.test = 'log-rank';
  else if (/\bWald\b/i.test(window)) b.test = 'wald';
  else if (/\b(?:CMH|Cochran[\s-]Mantel[\s-]Haenszel)\b/i.test(window)) b.test = 'cmh';
  else if (/\bFisher'?s?\s+exact\b/i.test(window)) b.test = 'fisher-exact';
  else if (/\bchi-?square[d]?\b/i.test(window)) b.test = 'chi-square';
  else if (/\blikelihood[\s-]ratio\s+test\b/i.test(window)) b.test = 'likelihood-ratio';
  if (/\bnominal\b/i.test(window)) b.adjusted = 'nominal';
  else if (/\b(?:multiplicity[\s-]adjusted|adjusted\s+for\s+multiplicity|Hochberg|Bonferroni|Holm|Hommel)\b/i.test(window)) b.adjusted = 'adjusted';
  return Object.keys(b).length ? b : undefined;
}

/** A parenthetical after a p-value that says what it is: "(stratified log-rank test)", "(nominal)", "(adjusted for multiplicity)". */
const P_NOTE = String.raw`(?:\s*\((?=[^()]*\b(?:test|nominal|adjusted|multiplicity|log-rank|Wald|CMH|Hochberg|Bonferroni|Holm)\b)[^()]{1,80}\))?`;

function pOf(op: string, v: string, doc: DocInfo): WrittenNumber | undefined {
  // "p=0.003", "p<0.001", "the p-value was 0.003": only a comparison operator is part of the value (C9).
  const bound = /^(?:<|>|≤|<=)$/.test(op.trim()) ? op.trim() : '';
  const w = readNumber(`${bound}${v}`, { convention: doc.convention });
  return w ?? undefined;
}

/**
 * The estimate group starting at `at` (the first character of the estimate) in
 * `text`; `ciDecl` is a "(95% CI)" declaration from a row label or header.
 */
export function estimateAt(text: string, at: number, doc: DocInfo, ciDecl?: { level: string; sided?: 'one' | 'two'; kind: CI['kind'] }): EstimateGroup | null {
  const head = new RegExp(String.raw`^(${NUM})(${UNIT})?`, 'y');
  head.lastIndex = 0;
  const s = text.slice(at);
  const hm = head.exec(s);
  if (!hm) return null;
  const estimate = rd(hm[1] + (hm[2] && /%/.test(hm[2]) ? '%' : ''), doc);
  if (!estimate) return null;
  const g: EstimateGroup = { start: at, end: at + hm[0].length, estimate, pctMarked: !!hm[2] && /%|percentage/.test(hm[2]), unit: hm[2]?.trim() };
  if (hm[2] && /percentage\s+points/i.test(hm[2])) g.percentagePoints = true;
  let rest = s.slice(hm[0].length);
  let off = hm[0].length;
  // "for Drug X 20 mg" before the interval.
  const forArm = /^\s+for\s+((?:Drug\s+[A-Z]|[a-z]\w+)(?:\s+\d+(?:\.\d+)?\s?mg)?)(?=\s*\()/i.exec(rest);
  if (forArm) {
    g.forArm = forArm[1];
    rest = rest.slice(forArm[0].length);
    off += forArm[0].length;
  }
  // "(…)", "[…]", or "; 95% CI …" / ", 95% confidence interval …" inside an outer parenthesis.
  const open = /^\s*([([])/.exec(rest);
  let inner: string | null = null;
  let innerOff = 0;
  let closeLen = 0;
  if (open) {
    const startI = open[0].length;
    let depth = 1;
    let k = startI;
    for (; k < rest.length && depth > 0; k++) {
      if (rest[k] === '(' || rest[k] === '[') depth++;
      else if (rest[k] === ')' || rest[k] === ']') depth--;
    }
    if (depth === 0) {
      inner = rest.slice(startI, k - 1);
      innerOff = off + startI;
      closeLen = k;
    }
  } else {
    const semi = /^\s*[;,]\s*(?=(?:two-sided\s+|one-sided\s+)?\d+(?:[.,]\d+)?\s?%\s?(?:CI|CrI|confidence|credible))/i.exec(rest);
    if (semi) {
      // The interval ends at a closing bracket or at the sentence's own full stop ("…, 90% CI 97.35-111.36.").
      const stop = rest.slice(semi[0].length).search(/\)|\.(?=\s|$)|$/);
      inner = rest.slice(semi[0].length, semi[0].length + (stop >= 0 ? stop : rest.length));
      innerOff = off + semi[0].length;
      closeLen = semi[0].length + inner.length;
    }
    // The interval written out as prose rather than parenthetically: "…, with a 95% confidence interval of 0.63
    // to 0.91" (r2 pv-ci-interval-of-x-to-y-prose).
    const prose = new RegExp(String.raw`^\s*[,;]?\s*(?:with|and)\s+(?:a|an)\s+${SIDED}${LEVEL}\s?${KIND}\s+of\s+(${BOUND})${RSEP}(${BOUND})`, 'i').exec(rest);
    if (prose) {
      g.lower = rd(prose[4], doc);
      g.upper = rd(prose[5], doc);
      g.ci = { level: prose[2].replace(',', '.'), sided: prose[1] === 'one' ? 'one' : 'two', sidedStated: !!prose[1], kind: /credible|CrI/i.test(prose[3]) ? 'credible' : 'confidence' };
      g.end = at + off + prose[0].length;
      return trailingP(g, s.slice(g.end - at), g.end, doc);
    }
    const oneSided = /^\s+with\s+a\s+one-sided\s+(\d+(?:[.,]\d+)?)\s?%\s+confidence\s+interval\s+lower\s+bound\s+of\s+([-−–]?\s?\d+(?:[.,]\d+)?\s?%?)/i.exec(rest);
    if (oneSided) {
      g.lower = rd(oneSided[2], doc);
      g.ci = { level: oneSided[1].replace(',', '.'), sided: 'one', sidedStated: true, kind: 'confidence' };
      g.end = at + off + oneSided[0].length;
      return g;
    }
  }
  if (inner === null) {
    g.end = at + off;
    return trailingP(g, s.slice(off), at + off, doc);
  }
  // The p-value inside the bracket, cut before the interval is read.
  let ci = inner;
  const pOnly = new RegExp(String.raw`^\s*${P}\s*$`, 'i').exec(ci);
  if (pOnly) {
    g.p = pOf(pOnly[2], pOnly[3], doc);
    if (pOnly[1]) g.pSided = pOnly[1] as 'one' | 'two';
    g.pBasis = pBasisOf(pOnly[0], g.pSided);
    g.end = at + innerOff + inner.length + 1;
    return g;
  }
  const pIn = new RegExp(String.raw`[;,]\s*${P}\s*$`, 'i').exec(ci) ?? new RegExp(String.raw`[;,]\s*${P}\s*[;,]`, 'i').exec(ci);
  if (pIn) {
    g.p = pOf(pIn[2], pIn[3], doc);
    if (pIn[1]) g.pSided = pIn[1] as 'one' | 'two';
    g.pBasis = pBasisOf(pIn[0], g.pSided);
  }
  ci = ci.replace(new RegExp(String.raw`[;,]\s*${P}`, 'gi'), '');
  // Trailing qualifiers inside the bracket: "; FAS, MMRM", "; Clopper-Pearson", "; FAS, non-responder imputation".
  ci = ci.replace(/;\s*(?:[A-Za-z][^;]*)$/, (x) => (/\d/.test(x) ? x : ''));
  // "95% CI, 0.61 to 0.85": the comma after the kind is the NEJM/JAMA house style, pervasive in Module 2.7.3,
  // USPI 14 and SmPC 5.1 (r2 num-05, num-06, pv-ci-comma-nejm-style-*).
  const levelRe = new RegExp(String.raw`^\s*(?:(\d+(?:\/\d+)?)\s*;\s*)?${SIDED}${LEVEL}\s?${KIND}\s*[:,]?\s*\[?\s*(${BOUND})${RSEP}(${BOUND})\s*\]?\s*(?:L|kg)?\s*$`, 'i');
  // Two intervals of one estimate in one bracket ("0.72 (95% CI 0.61, 0.85; 90% CI 0.63, 0.82)"), ordinary
  // non-inferiority and bioequivalence reporting: each is read and matched on its own level (r2 num-11).
  const parts = ci.split(';');
  if (!levelRe.test(ci) && parts.length >= 2) {
    const read = parts.map((x) => levelRe.exec(x));
    if (read.every((x) => x !== null)) {
      const all = (read as RegExpExecArray[]).map((x) => ({
        ci: { level: x[3].replace(',', '.'), sided: (x[2] === 'one' ? 'one' : 'two') as 'one' | 'two', sidedStated: !!x[2], kind: (/credible|CrI/i.test(x[4]) ? 'credible' : 'confidence') as CI['kind'] },
        lower: rd(x[5], doc),
        upper: rd(x[6], doc),
      }));
      g.lower = all[0].lower;
      g.upper = all[0].upper;
      g.ci = all[0].ci;
      g.extra = all.slice(1);
      g.end = at + innerOff + inner.length + 1;
      return trailingP(g, s.slice(g.end - at), g.end, doc);
    }
  }
  const lm = levelRe.exec(ci);
  if (lm) {
    g.lower = rd(lm[5], doc);
    g.upper = rd(lm[6], doc);
    g.ci = { level: lm[3].replace(',', '.'), sided: lm[2] === 'one' ? 'one' : 'two', sidedStated: !!lm[2], kind: /credible|CrI/i.test(lm[4]) ? 'credible' : 'confidence' };
    if (/clopper/i.test(inner)) g.ci.method = 'clopper-pearson';
  } else {
    const oneSided = new RegExp(String.raw`^\s*one-sided\s+${LEVEL}\s?${KIND}\s*[:,]?\s*lower\s+bound\s+(${BOUND})\s*$`, 'i').exec(ci);
    const bare = new RegExp(String.raw`^\s*\[?\s*(${BOUND})${RSEP}(${BOUND})\s*\]?\s*$`, 'i').exec(ci);
    const otherInterval = new RegExp(String.raw`^\s*(IQR|interquartile\s+range|Q1\s*[-–,]\s*Q3|range|min(?:imum)?\s*[-–,]\s*max(?:imum)?)\s*[:,]?\s*\[?\s*(${BOUND})${RSEP}(${BOUND})\s*\]?\s*$`, 'i').exec(ci);
    const nOfN = new RegExp(String.raw`^\s*(\d+)\s*\/\s*(\d+)\s*;\s*${LEVEL}\s?${KIND}\s*[:,]?\s*(${BOUND})${RSEP}(${BOUND})\s*;?\s*(?:Clopper-Pearson)?\s*$`, 'i').exec(ci);
    if (oneSided) {
      g.lower = rd(oneSided[3], doc);
      g.ci = { level: oneSided[1].replace(',', '.'), sided: 'one', sidedStated: true, kind: 'confidence' };
    } else if (nOfN) {
      g.lower = rd(nOfN[5], doc);
      g.upper = rd(nOfN[6], doc);
      g.ci = { level: nOfN[3].replace(',', '.'), sided: 'two', sidedStated: false, kind: 'confidence' };
      if (/clopper/i.test(inner)) g.ci.method = 'clopper-pearson';
    } else if (bare && (ciDecl ?? doc.ciDefault)) {
      // The level from a row/column declaration, else the convention the source states for itself (r2 num-09).
      const decl = (ciDecl ?? doc.ciDefault)!;
      g.lower = rd(bare[1], doc);
      g.upper = rd(bare[2], doc);
      g.ci = { level: decl.level, sided: decl.sided ?? 'two', sidedStated: !!decl.sided, kind: decl.kind };
    } else if (bare) {
      // "Adjusted difference, %  16.6 (8.4, 24.8)": an interval whose level is stated nowhere. The estimate is a
      // claim; the bounds are kept as written and never compared (C15, E3).
      g.lower = rd(bare[1], doc);
      g.upper = rd(bare[2], doc);
      g.intervalUnread = 'ci_level_unstated';
    } else if (/\bCI\b|confidence|credible/i.test(ci) && /\d/.test(ci) && !new RegExp(LEVEL).test(ci.split(/CI|confidence|credible/i)[0])) {
      g.intervalUnread = 'ci_level_unstated';
      const b = new RegExp(String.raw`(${BOUND})${RSEP}(${BOUND})`, 'i').exec(ci);
      if (b) {
        g.lower = rd(b[1], doc);
        g.upper = rd(b[2], doc);
      }
    } else if (/\bCI\b|confidence|credible/i.test(ci)) {
      g.intervalUnread = 'ci_unreadable';
    } else if (otherInterval) {
      // "(interquartile range 6.1, 12.3)", "(range 2, 48)", "(Q1-Q3 6.1, 12.3)": an interval of another kind. Its
      // bounds are read and reported as written, and never set against a confidence interval's (r2 num-12, C15).
      g.lower = rd(otherInterval[2], doc);
      g.upper = rd(otherInterval[3], doc);
      g.intervalUnread = 'interval_kind_differs';
    } else if (/^\s*(?:two-sided|one-sided)?\s*$/.test(ci) || (!/\d/.test(ci) && !g.p)) {
      // "(two-sided p=0.0004)" leaves nothing: no interval.
    } else if (g.p && !/\d/.test(ci)) {
      // only a p-value
    } else if (/^\s*\d+\s*\/\s*\d+\s*$/.test(ci)) {
      // "(52/128)"
    } else {
      return null;
    }
  }
  g.end = at + innerOff + inner.length + 1;
  void closeLen;
  return trailingP(g, s.slice(g.end - at), g.end, doc);
}

/** ", p = 0.009", "; p<0.001 (stratified log-rank test)", ", two-sided stratified log-rank p=0.0012" after the group. */
function trailingP(g: EstimateGroup, after: string, at: number, doc: DocInfo): EstimateGroup {
  if (g.p) return g;
  const m = new RegExp(String.raw`^\s*[,;]?\s*(?:and\s+)?(?:the\s+)?(?:with\s+a\s+)?${P}${P_NOTE}`, 'i').exec(after);
  if (m && (/^\s*[,;]/.test(after) || /^\s*(?:and|with)\s+(?:a\s+|the\s+)?p/i.test(after))) {
    g.p = pOf(m[2], m[3], doc);
    if (m[1]) g.pSided = m[1] as 'one' | 'two';
    g.pBasis = pBasisOf(m[0], g.pSided);
    g.end = at + m[0].length;
  }
  return g;
}

/** A standalone p-value: "(p=0.003)", "p<0.001", "Nominal p-value: <0.001", "stratified log-rank p<0.001". */
export const P_ALONE = new RegExp(String.raw`(?:\(|\b)${P}${P_NOTE}`, 'gi');
export function pAt(m: RegExpExecArray, doc: DocInfo): { p: WrittenNumber; sided?: 'one' | 'two'; basis?: PBasis } | null {
  const p = pOf(m[2], m[3], doc);
  const sided = m[1] ? (m[1].toLowerCase() as 'one' | 'two') : undefined;
  const basis = pBasisOf(m[0], sided);
  return p ? { p, ...(sided ? { sided } : {}), ...(basis ? { basis } : {}) } : null;
}
