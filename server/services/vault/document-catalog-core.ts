/**
 * Document catalog — the pure core: span arithmetic, read coverage, the
 * catalog-write gate, extraction-outcome honesty, and the key_data verifier.
 * No DB, no I/O.
 *
 * Split from document-catalog.service.ts the way ana-session-bootstrap-format
 * is split from its loader: the logic that defines the discipline is directly
 * unit-testable here, and only the service wires it to the database. The
 * service re-exports everything below, so callers keep one import path.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Spans + coverage
// ─────────────────────────────────────────────────────────────────────────────

/** Half-open character span [start, end) over a document's extracted text. */
export interface Span {
  start: number;
  end: number;
}

export interface SpanCoverageReport {
  /** Total characters of extracted text the spans are measured against. */
  charCount: number;
  /** Characters covered by the union of the recorded spans (clamped). */
  coveredChars: number;
  /** Maximal uncovered ranges, in order. Empty iff complete. */
  uncovered: Span[];
  /** True only when every character of the text has been served. */
  complete: boolean;
}

/** Merge spans into a minimal sorted set of disjoint spans, clamped to [0, charCount]. */
export function mergeSpans(spans: Span[], charCount: number): Span[] {
  const clamped = spans
    .map(s => ({ start: Math.max(0, Math.floor(s.start)), end: Math.min(charCount, Math.floor(s.end)) }))
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const s of clamped) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/** Exact integer coverage of `spans` over a text of `charCount` characters. */
export function computeCoverage(spans: Span[], charCount: number): SpanCoverageReport {
  if (charCount <= 0) {
    // A document with no extracted text has nothing to cover; "complete" here
    // would launder an extraction failure into a full read, so it is false.
    return { charCount: Math.max(0, charCount), coveredChars: 0, uncovered: [], complete: false };
  }
  const merged = mergeSpans(spans, charCount);
  let covered = 0;
  const uncovered: Span[] = [];
  let cursor = 0;
  for (const s of merged) {
    if (s.start > cursor) uncovered.push({ start: cursor, end: s.start });
    covered += s.end - s.start;
    cursor = s.end;
  }
  if (cursor < charCount) uncovered.push({ start: cursor, end: charCount });
  return { charCount, coveredChars: covered, uncovered, complete: covered === charCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction outcomes
// ─────────────────────────────────────────────────────────────────────────────

export type CatalogStatus = 'extracted' | 'extraction_failed' | 'cataloged';

export interface ExtractionOutcome {
  status: 'extracted' | 'extraction_failed';
  method: string;
  confidence: number | null;
  error: string | null;
  charCount: number;
  wordCount: number | null;
}

/**
 * Classify an extraction result honestly. Empty text is a FAILURE with a
 * stated reason — never "extracted, zero characters", which downstream would
 * render as a document with nothing in it.
 */
export function buildExtractionOutcome(input: {
  text: string | null;
  method: string;
  confidence?: number;
  error?: string | null;
}): ExtractionOutcome {
  const text = (input.text ?? '').trim();
  if (input.error) {
    return {
      status: 'extraction_failed',
      method: input.method,
      confidence: input.confidence ?? null,
      error: input.error,
      charCount: 0,
      wordCount: null,
    };
  }
  if (text.length === 0) {
    return {
      status: 'extraction_failed',
      method: input.method,
      confidence: input.confidence ?? null,
      error:
        input.method === 'none'
          ? 'No extraction method produced text for this file type.'
          : `Extraction ran (${input.method}) but produced no text.`,
      charCount: 0,
      wordCount: null,
    };
  }
  return {
    status: 'extracted',
    method: input.method,
    confidence: input.confidence ?? null,
    error: null,
    charCount: text.length,
    wordCount: text.split(/\s+/).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Key-data verification
// ─────────────────────────────────────────────────────────────────────────────
//
// The coverage gate proves the model was SERVED every character. It proves
// nothing about what the model then wrote, and key_data is where it writes
// figures: batch numbers, doses, assay results, study ids. A CoA reading batch
// 23‑104, protocol ST–23–104, assay 99.2 % and D90 45 µm was cataloged as
// batch 23-105, assay 98.4, study ST-99-001, D90 12 — every value wrong — and
// the write succeeded, after which read_project_document, the catalog search
// and the connector all served those values as recorded fact. CLAUDE.md Rule 2:
// numbers come from deterministic engines; the model narrates. So every value
// the model records is checked, deterministically, against the text it claims
// to transcribe, and a value the text does not state is refused, not stored.
//
// What "occurs" means, stated once so it can be argued with:
//
//   Normalisation, for COMPARISON ONLY (the stored value is never rewritten):
//     - superscript/subscript digits become ^n / _n first, because NFKC alone
//       folds 10³ into "103" and a microbial limit would then verify a number
//       the document never wrote;
//     - Unicode NFKC (full-width forms, NBSP-family spaces, compatibility
//       characters, and the micro sign µ → Greek μ);
//     - U+2010–U+2015 and U+2212 → "-" (NFKC already sends the non-breaking
//       hyphen U+2011 to U+2010);
//     - every run of Unicode whitespace → one space;
//     - letters compared case-insensitively.
//
//   A value must appear as a whole TOKEN, never as a fragment: "23-10" is not
//   in "23-104", 99 is not in "99.2", 120 is not in "1 120 000", 5 is not in
//   "−5 °C", and 10 is not in "10mg" or "10³". A hyphen between words is a
//   token boundary, so 24 is stated by "24-month" — but a value that itself
//   contains a hyphen may not be cut out of a longer hyphenated identifier
//   ("ST-23" is not in "ST-23-104").
//
//   A number is matched in its exact decimal form (98.4 never matches 99.2,
//   and 99.2 does not match "99.20" — a JSON number cannot carry the trailing
//   zero, so that figure is recorded as the string "99.20"). A number may also
//   be matched with thousands grouping added — 120000 matches "120,000" and
//   "120 000" — which is the one allowance strings do not get.
//
//   A boolean or null is refused outright: it is a judgement about the
//   document ("released: true"), not a transcription from it. Keys are not
//   verified — they are the model's labels. The check proves a value is IN the
//   document; it does not prove the label is the right one for it.

/** Why a key_data leaf was refused. */
export type KeyDataLeafProblem =
  /** The value does not occur in the document's extracted text. */
  | 'not_in_text'
  /** A boolean or null: a judgement about the document, not a transcription. */
  | 'verdict'
  /** A blank string transcribes nothing. */
  | 'empty'
  /** Not a JSON string/number (or a non-finite number), so it cannot be checked. */
  | 'unsupported';

export interface UnverifiedKeyDataLeaf {
  /** Path from the key_data root, e.g. `batch` or `results[1].value`. */
  path: string;
  value: unknown;
  problem: KeyDataLeafProblem;
}

export interface KeyDataVerdict {
  verified: boolean;
  /** Scalar leaves examined (keys and containers are not leaves). */
  checkedLeaves: number;
  unverified: UnverifiedKeyDataLeaf[];
  reason: string | null;
}

const SUPERSCRIPT_DIGITS = '\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079';

function normaliseForComparison(s: string): string {
  return s
    .replace(/[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]/g, c => `^${SUPERSCRIPT_DIGITS.indexOf(c)}`)
    .replace(/[\u2080-\u2089]/g, c => `_${c.charCodeAt(0) - 0x2080}`)
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const ALNUM = /[\p{L}\p{N}]/u;
const isAlnum = (c: string | undefined): boolean => c !== undefined && ALNUM.test(c);
const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

/** A bare figure: optional sign, digits (optionally grouped), optional decimals. */
const BARE_FIGURE = /^-?(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d+)?$/;

/** The characters around one match of a needle in the normalised text. */
interface MatchEdges {
  needle: string;
  first: string | undefined;
  last: string | undefined;
  b1: string | undefined;
  b2: string | undefined;
  a1: string | undefined;
  a2: string | undefined;
  /** The four characters after a1: enough to see a following " 000" group. */
  after: string;
}

const isDecimalOrGroupMark = (c: string | undefined): boolean => c === '.' || c === ',';

/** A 3-digit leading group preceded by "<digit> " is the tail of a longer grouped figure. */
function continuesGroupBefore(m: MatchEdges): boolean {
  const lead = /^-?(\d+)/.exec(m.needle)?.[1] ?? '';
  return lead.length === 3 && m.b1 === ' ' && isDigit(m.b2);
}

/** An integer tail of 1-3 digits followed by " ddd" is the head of a longer grouped figure. */
function continuesGroupAfter(m: MatchEdges): boolean {
  const tail = /(\.?)(\d+)$/.exec(m.needle);
  if (!tail || tail[1] !== '' || tail[2].length > 3) return false;
  return m.a1 === ' ' && /^\d{3}(?!\d)/.test(m.after);
}

/**
 * Each rule is one way a wrong value could otherwise "occur" inside a longer
 * word or figure. A match any rule fires on is a fragment, not a token; see
 * the section header for the examples.
 */
const FRAGMENT_RULES: ReadonlyArray<(m: MatchEdges) => boolean> = [
  // Word edges: an alphanumeric edge may not run on into more alphanumerics.
  m => isAlnum(m.first) && isAlnum(m.b1),
  m => isAlnum(m.last) && isAlnum(m.a1),
  // A hyphenated value may not be cut out of a longer hyphenated identifier.
  m =>
    m.needle.indexOf('-', 1) > 0 &&
    ((m.b1 === '-' && isAlnum(m.b2)) || (m.a1 === '-' && isAlnum(m.a2))),
  // Signs: "-8" in "2-8" is a range, and "5" in " -5" is a negative figure.
  m => m.first === '-' && isAlnum(m.b1),
  m => isDigit(m.first) && m.b1 === '-' && !isAlnum(m.b2),
  // Figure continuation: the tail or head of 99.2 / 1,120, or a base carrying an exponent.
  m => isDigit(m.first) && isDecimalOrGroupMark(m.b1) && isDigit(m.b2),
  m => isDigit(m.last) && ((isDecimalOrGroupMark(m.a1) && isDigit(m.a2)) || m.a1 === '^'),
  // Space-grouped figures: "1 120 000" is one number, so neither "120" nor
  // "1 120" may be read out of it. Only a bare figure is at risk; an
  // identifier such as "23-104" beside a number is not a digit group.
  m => BARE_FIGURE.test(m.needle) && (continuesGroupBefore(m) || continuesGroupAfter(m)),
];

/** Whether the match hay[start, end) is a whole token rather than a piece of a longer word or figure. */
function standsAlone(hay: string, start: number, end: number, needle: string): boolean {
  const edges: MatchEdges = {
    needle,
    first: hay[start],
    last: hay[end - 1],
    b1: hay[start - 1],
    b2: hay[start - 2],
    a1: hay[end],
    a2: hay[end + 1],
    after: hay.slice(end + 1, end + 5),
  };
  return !FRAGMENT_RULES.some(rule => rule(edges));
}

function occursAsToken(hay: string, needle: string): boolean {
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    if (standsAlone(hay, i, i + needle.length, needle)) return true;
  }
  return false;
}

/** The textual forms a number may take: as JavaScript prints it, and grouped by "," or " ". */
function numberForms(n: number): string[] {
  const plain = String(n);
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(plain);
  if (!m || m[2].length <= 3) return [plain];
  const [, sign, int, frac = ''] = m;
  const grouped = (sep: string) => sign + int.replace(/\B(?=(\d{3})+$)/g, sep) + frac;
  return [plain, grouped(','), grouped(' ')];
}

function leafProblem(value: unknown, hay: string): KeyDataLeafProblem | null {
  if (value === null || typeof value === 'boolean') return 'verdict';
  if (typeof value === 'string') {
    const needle = normaliseForComparison(value).trim();
    if (!needle) return 'empty';
    return occursAsToken(hay, needle) ? null : 'not_in_text';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'unsupported';
    return numberForms(value).some(f => occursAsToken(hay, normaliseForComparison(f)))
      ? null
      : 'not_in_text';
  }
  return 'unsupported';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Visit every scalar leaf, at any depth of objects and arrays, with its path. */
function walkLeaves(value: unknown, path: string, visit: (path: string, leaf: unknown) => void): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkLeaves(v, `${path}[${i}]`, visit));
  } else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      const seg = /^[A-Za-z_$][\w$]*$/.test(k) ? (path ? `${path}.${k}` : k) : `${path}[${JSON.stringify(k)}]`;
      walkLeaves(v, seg, visit);
    }
  } else {
    visit(path || '(key_data)', value);
  }
}

const PROBLEM_TEXT: Record<KeyDataLeafProblem, string> = {
  not_in_text: 'not in the text',
  verdict: 'a verdict, not a transcription',
  empty: 'empty',
  unsupported: 'not a string or number',
};

function describeLeaf(l: UnverifiedKeyDataLeaf): string {
  const shown = typeof l.value === 'string' ? JSON.stringify(l.value) : String(l.value);
  const clipped = shown.length > 80 ? `${shown.slice(0, 77)}…` : shown;
  return `${l.path} = ${clipped} (${PROBLEM_TEXT[l.problem]})`;
}

/**
 * The key_data gate. Pure and deterministic: every scalar leaf of `keyData`
 * must occur in `extractedText` under the normalisation and token rules above,
 * or the write is refused and each failing leaf is named with its path and
 * value — the way the coverage gate names unread ranges. No key_data at all
 * has nothing to verify; a document with no text verifies nothing.
 */
export function verifyKeyDataAgainstText(keyData: unknown, extractedText: string | null): KeyDataVerdict {
  const unverified: UnverifiedKeyDataLeaf[] = [];
  let checkedLeaves = 0;
  if (keyData !== null && keyData !== undefined) {
    const hay = normaliseForComparison(extractedText ?? '');
    walkLeaves(keyData, '', (path, leaf) => {
      checkedLeaves += 1;
      const problem = leafProblem(leaf, hay);
      if (problem) unverified.push({ path, value: leaf, problem });
    });
  }
  if (unverified.length === 0) return { verified: true, checkedLeaves, unverified, reason: null };

  const named = unverified.slice(0, 10).map(describeLeaf).join('; ');
  const more = unverified.length > 10 ? `; and ${unverified.length - 10} more` : '';
  return {
    verified: false,
    checkedLeaves,
    unverified,
    reason:
      `Refusing to catalog: ${unverified.length} key_data value(s) could not be verified against the ` +
      `document's extracted text — ${named}${more}. Copy every key_data value exactly as the document ` +
      'writes it (identifiers, figures and units; a figure a JSON number cannot carry, such as 99.20 or ' +
      '1.2×10⁶, goes in as a string). A value the text does not state — a correction, a conversion, a ' +
      'count, anything inferred — does not belong in key_data, and true/false/null are judgements, not ' +
      'transcriptions: say those in the summary. Nothing was stored; correct or remove the named values ' +
      'and catalog again.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The catalog-write gate
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogGateVerdict {
  allowed: boolean;
  reason: string | null;
  coverage: SpanCoverageReport;
  /** Present only when key_data was refused: every value the text does not state, by path. */
  unverifiedKeyData?: UnverifiedKeyDataLeaf[];
}

/**
 * The gate. A catalog write is allowed only when the read receipts cover the
 * entire extracted text — exact integer equality, not a percentage heuristic
 * — AND every key_data value occurs in that text (verifyKeyDataAgainstText).
 * On refusal the verdict carries what to fix: the uncovered ranges to go read,
 * or the key_data values to correct. Coverage is judged first, because a value
 * can only be checked against text that was read. The key_data and the text
 * are required arguments: coverage alone let an invented batch number through,
 * so no caller may ask the gate about one without the other.
 */
export function assertCatalogWriteAllowed(
  coverage: SpanCoverageReport,
  keyData: unknown,
  extractedText: string | null,
): CatalogGateVerdict {
  if (coverage.charCount <= 0) {
    return {
      allowed: false,
      reason:
        'This document has no extracted text to read (extraction failed or produced nothing), ' +
        'so a comprehension record cannot honestly be written for it.',
      coverage,
    };
  }
  if (!coverage.complete) {
    const missing = coverage.charCount - coverage.coveredChars;
    const ranges = coverage.uncovered
      .slice(0, 5)
      .map(u => `${u.start}–${u.end}`)
      .join(', ');
    return {
      allowed: false,
      reason:
        `Refusing to catalog: only ${coverage.coveredChars} of ${coverage.charCount} characters have been read ` +
        `(${missing} unread; uncovered ranges: ${ranges}${coverage.uncovered.length > 5 ? ', …' : ''}). ` +
        'Read the remaining ranges with read_project_document (use offset), then catalog.',
      coverage,
    };
  }
  const transcription = verifyKeyDataAgainstText(keyData, extractedText);
  if (!transcription.verified) {
    return {
      allowed: false,
      reason: transcription.reason,
      coverage,
      unverifiedKeyData: transcription.unverified,
    };
  }
  return { allowed: true, reason: null, coverage };
}
