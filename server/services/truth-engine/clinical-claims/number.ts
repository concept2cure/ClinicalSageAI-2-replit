/**
 * Numbers exactly as written (design §3, conventions C9, C10, C19).
 *
 * A figure is held as its written digits, sign and decimal places — never as a
 * float — so "2.0" keeps one decimal and "0.00" two (failure-spec item 1), and
 * agreement is decided in exact integer arithmetic: two values agree when they
 * differ by at most half a unit of the coarser written place, boundary included.
 * A bound ("<0.001", "more than 500") or an approximation ("approximately",
 * "ca.") is not a value.
 *
 * Pure: no I/O, no Date, no randomness.
 */

export type NumberConvention = 'point' | 'comma' | 'mixed';

/** A number exactly as written. Never a JS float for comparison. */
export interface WrittenNumber {
  /** The text as written: "−0,62", "1 227", "Six hundred and twelve", "<0.001", "4.0". */
  raw: string;
  /** Canonical unsigned decimal digits, trailing zeros kept: "0.62", "1227", "612", "0.001", "4.0". */
  digits: string;
  sign: -1 | 1;
  /** Decimal places as written: "4.0" → 1, "0,00" → 2, "612" → 0. */
  dp: number;
  /** 'nr': "NR" / "not reached", a non-numeric bound of an interval. */
  kind: 'exact' | 'bound' | 'approximate' | 'nr';
  op?: '<' | '≤' | '>' | '≥';
  /** Spelled out ("Three", "Six hundred and twelve"). */
  word?: true;
  /** How a percentage was marked: '%' sign, "per cent", or a "%" column declaration. */
  pct?: 'sign' | 'per cent' | 'column';
  /** A percentage that is exactly zero because its count is a written zero ("0", "no patients"). */
  exactZero?: true;
}

export type Agreement = 'agree' | 'differ' | { notCompared: 'bound_not_value' | 'bounds_differ' | 'approximate_value' | 'zero_precision_ambiguous' };

// ── Number words ────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

const WORD_LIST = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand'.split(' ');
/** The words a spelled-out count is made of, for building matchers; a sentence-initial capital is allowed ("Six hundred …"). */
export const NUMBER_WORD = `(?:${WORD_LIST.map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join('|')})`;
/** A spelled-out count: "three", "Twenty-one", "Six hundred and twelve". */
export const NUMBER_WORDS = String.raw`(?:${NUMBER_WORD}(?:(?:[\s-]+|\s+and\s+)${NUMBER_WORD})*)`;
/**
 * A spelled-out count in a count position ("five deaths", "three patients died", "two in the placebo group",
 * "Six hundred and twelve patients"): a sentence holding one has a figure even without a digit.
 */
export const WORD_FIGURE = new RegExp(
  String.raw`(?<![\w-])${NUMBER_WORDS}(?=\s+(?:adult\s+|pediatric\s+)?(?:patients?|subjects?|participants?|deaths?|died|in\s+(?:the|each)\b))`,
);

/** "Six hundred and twelve" → 612; null when it is not a number phrase. */
export function wordsToInt(phrase: string): number | null {
  const parts = phrase.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter((w) => w && w !== 'and');
  if (parts.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const w of parts) {
    if (w in UNITS) current += UNITS[w];
    else if (w in TENS) current += TENS[w];
    else if (w === 'hundred') current = (current || 1) * 100;
    else if (w === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
    } else return null;
  }
  return total + current;
}

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * The words that make a figure an approximation or a bound. Written as sources so that one copy
 * serves both `readNumber`, which strips them from the front of a figure it is handed, and
 * `APPROX_OR_BOUND`, which a form uses to capture them with the figure in the first place. A form
 * that captures only the digits turns "more than 500 patients" into an exact 500, and a lower bound
 * then compares as a value (lu-06).
 */
const APPROX_SRC = String.raw`(?:approximately|approx\.?|about|around|nearly|almost|ca\.?|circa|~|≈)`;
const BOUND_SRC = String.raw`(?:(<=|>=|[<>≤≥])\s*|(less than|fewer than|under|below)\s+|(more than|greater than|over|above)\s+|(at least)\s+|(up to|at most)\s+)`;
const APPROX = new RegExp(String.raw`^${APPROX_SRC}\s*`, 'i');
/** Its five groups say which bound was written; `readNumber` reads them, so they stay capturing. */
const BOUND = new RegExp(String.raw`^${BOUND_SRC}`, 'i');
/**
 * The same words as a prefix a form can capture with its figure. Its groups are non-capturing, so a
 * form's own group numbers do not move when it adopts this.
 */
export const APPROX_OR_BOUND = String.raw`(?:${APPROX_SRC}\s*)?(?:${BOUND_SRC.replace(/\((?!\?)/g, '(?:')})?`;
const PCT_TAIL = /\s*(%|per\s?cent\b|percent\b)\s*$/i;
const SPACE_GROUP = /^\d{1,3}(?:[ \u00a0\u202f\u2009]\d{3})+$/;
const COMMA_GROUP = /^\d{1,3}(?:,\d{3})+$/;
const POINT_GROUP = /^\d{1,3}(?:\.\d{3})+$/;

export interface ReadOptions {
  /** The source's decimal convention (default 'point'). */
  convention?: NumberConvention;
  /** The token is a count of patients: a period between groups of three is a thousands separator in a comma source. */
  countSlot?: boolean;
}

/**
 * Read one written number. Returns null when the text is not a number, or when
 * its reading depends on a convention the source does not settle (a mixed
 * source's "1,227").
 */
export function readNumber(input: string, opts: ReadOptions = {}): WrittenNumber | null {
  const raw = input.trim();
  let s = raw;
  let kind: WrittenNumber['kind'] = 'exact';
  let op: WrittenNumber['op'];
  if (/^(?:NR|not reached|not estimable|NE)$/i.test(s)) return { raw, digits: '', sign: 1, dp: 0, kind: 'nr' };
  const ap = APPROX.exec(s);
  if (ap) {
    kind = 'approximate';
    s = s.slice(ap[0].length);
  }
  const bd = BOUND.exec(s);
  if (bd) {
    kind = 'bound';
    if (bd[1]) op = bd[1] === '<=' ? '≤' : bd[1] === '>=' ? '≥' : (bd[1] as WrittenNumber['op']);
    else if (bd[2]) op = '<';
    else if (bd[3]) op = '>';
    else if (bd[4]) op = '≥';
    else op = '≤';
    s = s.slice(bd[0].length);
  }
  let pct: WrittenNumber['pct'];
  const pm = PCT_TAIL.exec(s);
  if (pm) {
    pct = pm[1] === '%' ? 'sign' : 'per cent';
    s = s.slice(0, pm.index);
  }
  // The Lancet mid-line decimal point ("0·72") is a decimal point (r1 nsf-07).
  s = s.trim().replace(/(\d)·(?=\d)/g, '$1.');
  let sign: 1 | -1 = 1;
  if (/^[-−–]/.test(s)) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) s = s.slice(1);

  // Scientific notation: "1.4 x 10-4", "2.3 × 10−5", "1.4e-4", "2.3 × 10^-5". A mantissa is not a p-value, so the
  // written form is expanded to its plain decimal digits and compared like any other number (r2 num-03, num-04).
  const sci = /^(\d+(?:[.,·]\d+)?)\s*(?:[x×*·]\s*10|[eE])\s*\^?\s*([-−–+]?)\s*(\d{1,3})$/.exec(s);
  if (sci) {
    const exp = Number(sci[3]) * (/^[-−–]$/.test(sci[2]) ? -1 : 1);
    const mant = readNumber(sci[1], opts);
    if (!mant || mant.kind !== 'exact') return null;
    const shifted = shiftDecimal(mant.digits, exp);
    if (!shifted || !/^\d+(?:\.\d+)?$/.test(shifted)) return null;
    const w: WrittenNumber = { raw, digits: shifted, sign: /[1-9]/.test(shifted) ? sign : 1, dp: shifted.includes('.') ? shifted.length - shifted.indexOf('.') - 1 : 0, kind };
    if (op) w.op = op;
    if (pct) w.pct = pct;
    return w;
  }

  // Spelled out: only whole counts.
  if (/^[a-z]/i.test(s)) {
    const n = wordsToInt(s);
    if (n === null) return null;
    const w: WrittenNumber = { raw, digits: String(n), sign, dp: 0, kind, word: true };
    if (op) w.op = op;
    if (pct) w.pct = pct;
    return w;
  }
  const convention = opts.convention ?? 'point';
  let digits: string;
  if (SPACE_GROUP.test(s)) digits = s.replace(/[ \u00a0\u202f\u2009]/g, '');
  // A count of patients is an integer: a comma or a period between groups of three digits in a count slot is a
  // thousands separator whatever the source's decimal convention ("1,227 patients" in a decimal-comma SmPC, "1.227
  // patients" in a decimal-point synopsis) (r1 nsf-05, nsf-06).
  else if (COMMA_GROUP.test(s)) {
    if (opts.countSlot) digits = s.replace(/,/g, '');
    else if (convention === 'comma') digits = s.replace(',', '.'); // "1,227" in a comma source is 1.227
    else if (convention === 'mixed') return null;
    else digits = s.replace(/,/g, '');
  } else if (POINT_GROUP.test(s)) {
    if (opts.countSlot) digits = s.replace(/\./g, '');
    else if (convention === 'mixed') return null;
    else digits = s; // a decimal point
  } else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(s) && convention !== 'comma') {
    digits = s.replace(/,/g, ''); // "1,012.4"
  } else if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(s) && convention !== 'point') {
    digits = s.replace(/\./g, '').replace(',', '.'); // "1.012,4"
  } else if (/^\d+(?:[.,]\d+)?$/.test(s)) {
    if (s.includes(',') && convention === 'point' && /^\d+,\d{3}$/.test(s)) digits = s.replace(',', '');
    else digits = s.replace(',', '.');
  } else if (/^[.,]\d+$/.test(s)) {
    // "p = .003": the leading zero dropped, ordinary statistical style. A leading separator can only be a decimal
    // point, so the reading does not depend on the source's convention (r2 num-16).
    digits = `0.${s.slice(1)}`;
  } else return null;
  if (!/^\d+(?:\.\d+)?$/.test(digits)) return null;
  // "-0" and "0.00" with a sign keep their written sign only when non-zero.
  if (!/[1-9]/.test(digits)) sign = sign === -1 && /\./.test(digits) ? -1 : 1;
  const dp = digits.includes('.') ? digits.length - digits.indexOf('.') - 1 : 0;
  const w: WrittenNumber = { raw, digits, sign, dp, kind };
  if (op) w.op = op;
  if (pct) w.pct = pct;
  return w;
}

/** `digits` with its decimal point moved by `exp` places: ("1.4", -4) → "0.00014", ("1.4", 2) → "140". */
function shiftDecimal(digits: string, exp: number): string | null {
  const [i, f = ''] = digits.split('.');
  if (exp < 0) {
    const pad = '0'.repeat(Math.max(0, -exp - i.length + 1));
    const all = pad + i + f;
    const point = pad.length + i.length + exp;
    return `${all.slice(0, point) || '0'}.${all.slice(point)}`;
  }
  const all = i + f + '0'.repeat(Math.max(0, exp - f.length));
  const point = i.length + exp;
  return point >= all.length ? all : `${all.slice(0, point)}.${all.slice(point)}`;
}

/** Canonical comparison key as written: "-0.62", "4.0", "1227", "<0.001", "~600", "NR". */
export function canonical(w: WrittenNumber | undefined): string {
  if (!w) return '';
  if (w.kind === 'nr') return 'NR';
  const body = `${w.sign < 0 && /[1-9]/.test(w.digits) ? '-' : ''}${w.digits}`;
  if (w.kind === 'approximate') return `~${body}`;
  if (w.kind === 'bound') return `${w.op === '≤' ? '<=' : w.op === '≥' ? '>=' : w.op}${body}`;
  return body;
}

/** Display form, exactly as written but with its percentage mark: "4.0%", "−0.62", "<0.001". */
export function shown(w: WrittenNumber | undefined): string {
  if (!w) return '—';
  return w.raw.replace(/\s+/g, ' ');
}

/** The value scaled to an integer at `dp` places, signed, as a BigInt. */
function scaled(w: WrittenNumber, dp: number): bigint {
  const [i, f = ''] = w.digits.split('.');
  const frac = (f + '0'.repeat(dp)).slice(0, dp);
  const n = BigInt(`${i}${frac}` || '0');
  return w.sign < 0 ? -n : n;
}

const isZero = (w: WrittenNumber) => !/[1-9]/.test(w.digits);

/**
 * Agreement as written (C10). Values agree iff 2·|A−B| ≤ 10^(D−d), D and d the
 * finer and coarser written places: within half a unit of the coarser place,
 * boundary included (8.46 written 8 and 8.5 is not a conflict). A zero against
 * a non-zero value that rounds to zero at the zero's precision cannot be told
 * apart; a bound or an approximation is not a value (C9).
 */
export function agreeAsWritten(a: WrittenNumber, b: WrittenNumber): Agreement {
  if (a.kind === 'nr' || b.kind === 'nr') return a.kind === b.kind ? 'agree' : 'differ';
  if (a.kind === 'approximate' || b.kind === 'approximate') return { notCompared: 'approximate_value' };
  if (a.kind === 'bound' || b.kind === 'bound') {
    if (a.kind === 'bound' && b.kind === 'bound' && a.op === b.op && a.digits === b.digits) return 'agree';
    return { notCompared: a.kind === 'bound' && b.kind === 'bound' ? 'bounds_differ' : 'bound_not_value' };
  }
  if (a.exactZero || b.exactZero) {
    const other = a.exactZero ? b : a;
    return isZero(other) ? 'agree' : 'differ';
  }
  const d = Math.min(a.dp, b.dp);
  const D = Math.max(a.dp, b.dp);
  const A = scaled(a, D);
  const B = scaled(b, D);
  const diff = A > B ? A - B : B - A;
  const half = 10n ** BigInt(D - d);
  // The zero rule: "0%" against "0.3%" — the zero is written at the coarser place.
  if ((isZero(a) || isZero(b)) && !(isZero(a) && isZero(b))) {
    const zero = isZero(a) ? a : b;
    if (zero.dp === d && 2n * diff <= half) return { notCompared: 'zero_precision_ambiguous' };
  }
  return 2n * diff <= half ? 'agree' : 'differ';
}

// ── Scanning ───────────────────────────────────────────────────────────────

/**
 * The digits of one written number, for building matchers: "1 227", "1,227",
 * "1.227", "0,72", "4.6", "612". Readings are decided by readNumber.
 */
export const DIGITS = String.raw`(?:\d{1,3}(?:[\u00a0\u202f\u2009 ]\d{3})+(?![\d.,]?\d)|\d{1,3}(?:[.,]\d{3})+(?![\d]|[.,·]\d)|\d+(?:[.,·]\d+)?)`;
/** A signed number: a minus only when it leads (start, space, bracket, colon, semicolon, "=", comma). */
export const SIGNED = String.raw`(?:(?<=^|[\s(\[:;=,])[-−–]\s?)?${DIGITS}`;
/** A percentage mark. */
export const PCT_MARK = String.raw`(?:\s?%|\s?per\s?cent\b|\s?percent\b)`;

/**
 * The decimal convention of a text whose non-figure spans (section and table
 * numbers, dates, doses) are already blanked: 'comma' when it holds an
 * unambiguous decimal comma ("4,6 %", "0,72") and no unambiguous decimal point,
 * 'point' in the opposite case or when neither occurs, else 'mixed'.
 */
export function detectConvention(masked: string): NumberConvention {
  const comma = /(?<![\d.,])(?:0,\d+|\d+,\d{1,2})(?![\d])/.test(masked);
  const point = /(?<![\d.,])(?:0[.·]\d+|\d+[.·]\d{1,2}|\d+\.\d{4,})(?![\d])/.test(masked);
  if (comma && point) return 'mixed';
  return comma ? 'comma' : 'point';
}
