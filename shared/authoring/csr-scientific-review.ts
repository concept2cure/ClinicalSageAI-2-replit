/**
 * The CSR scientific-review contract shared by the server, which verifies a
 * review map (server/services/authoring/csr-scientific-review-core.ts), and the
 * review screen, which builds one (client/src/concept2cure/v2/surfaces/csrEvidenceMap.ts).
 *
 * One definition of the format, the table keys, the shapes and the exact
 * numerical-display rule, so a figure the screen offers for a cell is one the
 * server will accept, and a review map is never refused for a reason the
 * screen could have known. No hashing here: the server hashes with
 * node:crypto and the browser with WebCrypto, over the same UTF-8 text.
 */

export const CSR_SCIENTIFIC_REVIEW_FORMAT = 'c2c.csr-scientific-review.v1' as const;
/** Every table the CSR engine builds, by key: the one list. The server's CSR
 * evidence (server/services/csr/cortex-authoring-context.ts) re-exports it. The
 * last two are built only when the source supplies them (CSR slice 6: ADVS/ADEG,
 * ADCM). Until 2026-10-29 the server kept its own copy with them and this one
 * had neither, so the review screen offered no vital-sign or con-med cell and
 * the verifier refused a claim naming either table. Order matters: the tables
 * hash (scientificTablesSha256) walks the keys in this order. */
export const CSR_TABLE_KEYS = ['disposition', 'analysisPopulations', 'demographics',
  'primaryEfficacy', 'secondaryEfficacy', 'exposure', 'aeOverallSummary', 'aeBySOC',
  'aeTopPT', 'deathsSAEsDiscontinuations', 'labShifts', 'vitalSigns', 'concomitantMedications'] as const;
export type CsrTableKey = typeof CSR_TABLE_KEYS[number];

export interface ScientificCellClaim {
  id: string; start: number; end: number; quoteSha256: string;
  runId: string; studyId: string; table: CsrTableKey; row: number; column: number;
  expectedValue: string;
}
export interface ScientificSectionReview {
  sectionId: string; contentSha256: string;
  assessment: 'mapped-results' | 'no-quantitative-results';
  rationale: string; claims: ScientificCellClaim[];
}
export interface ScientificReviewSubmission {
  format: typeof CSR_SCIENTIFIC_REVIEW_FORMAT;
  runIds: string[];
  expectedTablesSha256: string;
  allQuantitativeResultsMapped: true;
  populationsMethodsUnitsReviewed: true;
  sections: ScientificSectionReview[];
}
export interface RetainedScientificTable {
  title: string; headers: string[]; rows: string[][];
}
export interface RetainedScientificRun {
  runId: string; programId: string; releaseEligibilityVerified: boolean;
  studies: Array<{
    source: { documentId: string; sha256: string; version: string; studyId: string;
      protocolNumber: string; clinicalVerification: 'not-established'; sourceApproval: 'canonical-lifecycle' };
    tables: Partial<Record<CsrTableKey, RetainedScientificTable>>;
  }>;
}

/**
 * Whether a document's stored label marks it as a CSR: its module, product
 * code or title names a clinical study report ("CSR", "CSRs", "Clinical Study
 * Report(s)"). The server also treats the built-in CSR templates, a retained CSR
 * origin or an earlier receipt as a CSR
 * (server/services/authoring/csr-scientific-review.ts requiresCsrScientificReview),
 * and returns its answer in the review context, which the screen follows.
 * 2026-10-30: the plural was refused, so the IND library's "5.3.5.1 · Clinical
 * Study Reports of Controlled Studies" was not a CSR.
 */
export const labelledCsr = (value: unknown): boolean =>
  typeof value === 'string' && /(?:^|[^a-z0-9])(?:csrs?|clinical[ _-]+study[ _-]+reports?)(?:$|[^a-z0-9])/i.test(value);

/**
 * The built-in templates a CSR is authored from, by their stored template id
 * (2026-10-30): the IND library's 5.3.5.1 and 5.3.5.2 sections
 * (indTemplateId('section:m5.3.5.1' | 'section:m5.3.5.2')), the registry's ICH
 * CSR and the E3 component (builtinAuthoringTemplateId('registry:ICH_CSR' |
 * 'component:clinical_study_report')). Written out so the release gate does not
 * load the template library; csr-template-identity.pglite.test.ts proves each is
 * the id getBuiltinAuthoringTemplate resolves to that entry. A document made
 * from one of them is a CSR whatever its title says, and a template id is not
 * editable. Before this, only labels counted, so a CSR drafted from the IND
 * 5.3.5.1 template was approved, signed and filed without a review map.
 */
export const CSR_TEMPLATE_IDS: readonly string[] = [
  'f7e72f59-71ed-5cf6-96bf-d8edea20cb84', // section:m5.3.5.1
  'ba5f51bc-7257-50c9-a79f-66fc30e53d68', // section:m5.3.5.2
  '5d888ae5-4216-594e-bc5e-9c8bc22f9527', // registry:ICH_CSR
  '4331e7e3-7777-5c21-8c9b-0e2f56194e7e', // component:clinical_study_report
];

/** Whether a stored template id is one of the built-in CSR templates. */
export const isCsrTemplateId = (value: unknown): boolean =>
  typeof value === 'string' && CSR_TEMPLATE_IDS.includes(value.toLowerCase());

function continuedNumericalSuffix(text: string, end: number): boolean {
  const right = text[end] ?? '';
  const after = text.slice(end);
  // A decimal/grouping separator continues a figure only before a digit;
  // sentence and clause punctuation still end the display.
  return /[0-9A-Za-z_%/^\ufffc]/.test(right)
    || (/[.,]/.test(right) && /[0-9]/.test(text[end + 1] ?? ''))
    || UNIT_AFTER.test(after) || COMPOSITE_UNIT_AFTER.test(after) || /^\s*\ufffc/.test(after)
    || /^\s*&(?:#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/i.test(after);
}

function continuedNumericalPrefix(before: string): boolean {
  return /(?:[<>]=?|[≤≥+\-−≈≠≪≫≦≧~±\ufffc])\s*$/.test(before)
    || /&(?:#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);\s*$/i.test(before);
}

function scalarWithinAggregate(display: string, before: string, after: string): boolean {
  return numericalFigures(display, 'text').length === 1 && (
    /\d\s*(?:\/|\bof|\bto|[–—])\s*$/i.test(before)
    || /^\s*(?:\/|of\b|to\b|[-–—])\s*[+-]?\d/i.test(after));
}

/**
 * Whether `display` stands as a whole number at `offset` in `text`: the
 * characters either side do not continue it ("190" is not at offset 1 of
 * "1190", and "12" is not inside "12.5").
 */
export function isExactNumericalDisplayAt(text: string, offset: number, display: string): boolean {
  if (text.slice(offset, offset + display.length) !== display) return false;
  if (display.includes('\ufffc')) return false;
  const left = offset > 0 ? text[offset - 1] : '';
  const before = text.slice(0, offset);
  const after = text.slice(offset + display.length);
  const startsNumerically = /^[+-]?[0-9.]/.test(display);
  if (continuedNumericalPrefix(before)) return false;
  if (startsNumerically && /[0-9A-Za-z_.,%/]/.test(left)) return false;
  if (continuedNumericalSuffix(text, offset + display.length)) return false;
  // A scalar is not a numerator, denominator or interval endpoint merely
  // because those digits occur inside a larger quantitative expression.
  return !scalarWithinAggregate(display, before, after);
}

/** Character ranges inside HTML tags and entities: a digit there is markup, not a reported result. */
const MARKUP = /<(?:script|style|template|head)\b[^>]*>[\s\S]*?<\/(?:script|style|template|head)\s*>|<!--[\s\S]*?-->|<\/?[A-Za-z](?:"[^"]*"|'[^']*'|[^'">])*>|&#(?:x[0-9a-f]+|\d+);|&[a-z][a-z0-9]+;/gi;
export function markupRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const m of content.matchAll(MARKUP)) ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return ranges;
}

const ENTITIES: Readonly<Record<string, string>> = Object.assign(Object.create(null), { lt: '<', LT: '<', gt: '>', GT: '>', amp: '&', AMP: '&', quot: '"', QUOT: '"', apos: "'",
  nbsp: ' ', minus: '-', le: '<=', ge: '>=', leq: '<=', geq: '>=', percnt: '%', plus: '+',
  ndash: '–', mdash: '—', plusmn: '±', times: '×', micro: 'µ' });
export type NumericalTextFormat = 'encoded' | 'text';
export interface NumericalText { text: string; starts: number[]; ends: number[] }

function decodedNumericalEntity(raw: string): string {
  const numeric = /^&#(x[0-9a-f]+|\d+);$/i.exec(raw)?.[1];
  const code = numeric ? Number.parseInt(numeric.replace(/^x/i, ''), /^x/i.test(numeric) ? 16 : 10) : NaN;
  return numeric && Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
    ? String.fromCodePoint(code) : ENTITIES[raw.slice(1, -1)] ?? '\ufffc';
}

/** Render only the numerical context, retaining a raw offset for every visible
 * character. Entities are not silently discarded; attributes are never text.
 * A literal comparison such as <0.001 is not an HTML tag. `text` mode is for
 * already-rendered or canonical plain text: it never interprets HTML/entities.
 * Every offset belongs to the input string, not to an earlier rendering. */
export function numericalText(content: string, format: NumericalTextFormat = 'encoded'): NumericalText {
  const view: NumericalText = { text: '', starts: [], ends: [] };
  const append = (value: string, start: number, end: number) => {
    const normalized = value.replace(/−/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/\u00a0/g, ' ');
    view.text += normalized;
    for (let i = 0; i < normalized.length; i++) { view.starts.push(start); view.ends.push(end); }
  };
  const plain = (start: number, end: number) => { for (let i = start; i < end; i++) append(content[i], i, i + 1); };
  if (format === 'text') { plain(0, content.length); return view; }
  let from = 0;
  for (const match of content.matchAll(MARKUP)) {
    const start = match.index ?? 0;
    plain(from, start);
    const raw = match[0];
    if (raw[0] === '&') {
      append(decodedNumericalEntity(raw), start, start + raw.length);
    } else if (/^<(?:\/?(?:p|div|br|li|td|th|tr|h[1-6]|section|script|style|template|head)\b|!)/i.test(raw)) {
      append(' ', start, start + raw.length);
    }
    from = start + raw.length;
  }
  plain(from, content.length);
  return view;
}

export const renderedCsrText = (content: string, format: NumericalTextFormat = 'encoded'): string => numericalText(content, format).text;
const UNIT = '(?:%|percentage\\s+points?\\b|percent\\b|per\\s+cent\\b|mmHg\\b|mL\\b|µg\\b|ug\\b|ng\\b|mg\\b|kg\\b|g\\b|L\\b|ms\\b|days?\\b|weeks?\\b|months?\\b|years?\\b|hours?\\b|minutes?\\b)';
const UNIT_AFTER = new RegExp(`^\\s*${UNIT}`, 'i');
// A clearly formed unit/unit token is a suffix even when its unit names are
// outside the standalone vocabulary. This does not infer a unit from a header.
const UNIT_WORD = '[A-Za-zµμ][A-Za-zµμ\\d_.%+^-]*';
const COMPOSITE_UNIT_AFTER = new RegExp(`^\\s+${UNIT_WORD}(?:\\s*/\\s*${UNIT_WORD})+`);
const UNIT_DENOMINATOR_AFTER = new RegExp(`^(?:\\s*/\\s*${UNIT_WORD})+`);

function compositeUnitSuffix(following: string, unitAlreadyPresent: boolean): string {
  const unit = (unitAlreadyPresent ? UNIT_DENOMINATOR_AFTER : COMPOSITE_UNIT_AFTER).exec(following)?.[0];
  // Layout spacing and sentence punctuation are not part of the unit token.
  return unit?.replace(/\s+/g, '').replace(/\.$/, '') ?? '';
}

const FIGURE = new RegExp(`(?:(?<comparator><=|>=|<|>|≈|≠|≪|≫|≦|≧|~|±)\\s*)?(?:(?<sign>[+\\-])\\s*)?`
  + '(?<number>(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|\\.\\d+)'
  + `(?<exponent>[eE][+\\-]?\\d+)?(?:\\s*(?<unit>${UNIT}))?`, 'g');
const unitIdentity = (unit: string) => /^(?:%|percent|per\s+cent)$/i.test(unit) ? '%'
  : unit.toLowerCase().replace(/\s+/g, ' ').replace(/^(day|week|month|year|hour|minute)s$/, '$1');

export interface NumericalFigure {
  start: number; end: number; text: string; number: string; identity: string;
}
/** Numerical identity retains the comparator, sign, precision, exponent and
 * unit. Only grouping separators, operator glyphs and unit spelling normalize. */
export function numericalFigures(content: string, format: NumericalTextFormat = 'encoded'): NumericalFigure[] {
  const view = numericalText(content, format);
  return [...view.text.matchAll(FIGURE)].map(match => {
    const at = match.index ?? 0;
    const groups = match.groups!;
    const number = groups.number.replace(/,/g, '').replace(/^\./, '0.');
    // An attached suffix is part of this expression, not a separate supplied
    // number. In particular, "12%3" cannot borrow both "12%" and "3".
    const following = view.text.slice(at + match[0].length);
    const suffix = /^(?:[A-Za-z_\d%^\ufffc][A-Za-z_\d.%/+^\-\ufffc]*|[.,]\d[\d.]*|\s*\ufffc|\s*&(?:#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);)/i.exec(following)?.[0]
      ?? compositeUnitSuffix(following, Boolean(groups.unit));
    const prefix = continuedNumericalPrefix(view.text.slice(0, at)) ? 'invalid-prefix:' : '';
    return { start: view.starts[at], end: view.ends[at + match[0].length - 1], text: match[0], number,
      identity: `${prefix}${groups.comparator ?? ''}${groups.sign ?? ''}${number}${groups.exponent?.toLowerCase() ?? ''}${unitIdentity(groups.unit ?? '')}${suffix}` };
  });
}

const escapeDisplay = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function displayPattern(value: string): RegExp {
  const text = renderedCsrText(value).trim();
  let pattern = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/\s/.test(char)) { pattern += /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '') ? '\\s+' : '\\s*'; }
    else if (char === '%') pattern += '\\s*(?:%|percent\\b|per\\s+cent\\b)';
    else if (/[<>+\-/()[\]–—]/.test(char)) pattern += `\\s*${escapeDisplay(char)}\\s*`;
    else pattern += escapeDisplay(char);
  }
  return new RegExp(pattern, 'g');
}

export interface NumericalDisplaySpan { start: number; end: number }

/** A confidence level or a combined count/percent heading does not give a
 * bare cell a percent unit. Only an explicit, unambiguous unit heading does. */
function headerDeclaresUnit(header: string, unit: string): boolean {
  const text = renderedCsrText(header).trim();
  if (unit === '%') {
    if (/\b(?:n|counts?|numbers?|no|CI|CrI|confidence|credible)\b/i.test(text) || /\d\s*%/.test(text)) return false;
    return /^(?:%|percent(?:age)?)$/i.test(text) || /^percent(?:age)?\b/i.test(text)
      || /[([]\s*(?:%|percent(?:age)?)\s*[)\]]/i.test(text)
      || /(?:\bpercent(?:age)?|(?:^|\s)%)\s*$/i.test(text);
  }
  const named = `${escapeDisplay(unit)}${/^(day|week|month|year|hour|minute)$/.test(unit) ? 's?' : ''}`;
  return new RegExp(`^(?:${named})$|[([]\\s*(?:${named})\\s*[)\\]]`, 'i').test(text);
}

/** Start a claim's search at its raw offset without rebuilding the section. */
function visibleOffsetAt(view: NumericalText, rawOffset: number): number {
  let low = 0; let high = view.starts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (view.starts[middle] < rawOffset) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Trim layout spacing, retain a declared unit, then project the whole figure
 * back onto the original saved bytes. Boundary/design exclusions are shared. */
function rawNumericalSpan(view: NumericalText, match: RegExpMatchArray, header: string): NumericalDisplaySpan | null {
  let at = match.index ?? 0;
  let end = at + match[0].length;
  while (/\s/.test(view.text[at] ?? '') && at < end) at++;
  while (end > at && /\s/.test(view.text[end - 1])) end--;
  const unit = UNIT_AFTER.exec(view.text.slice(end));
  if (unit && headerDeclaresUnit(header, unitIdentity(unit[0].trim()))) end += unit[0].length;
  if (!isExactNumericalDisplayAt(view.text, at, view.text.slice(at, end)) || studyDesignNumberAt(view.text, at, end)) return null;
  return { start: view.starts[at], end: view.ends[end - 1] };
}

/** Exact numerical displays, expressed as whole ranges of the RAW saved text.
 * These ranges, including encoded operators and implicit column units, are
 * what a review quote must enclose and hash. Every occurrence is inspected. */
export function reportedDisplaySpans(content: string, display: string, header: string,
  view: NumericalText = numericalText(content), within?: NumericalDisplaySpan): NumericalDisplaySpan[] {
  if (!display.trim() || !/\d/.test(display)) return [];
  const found: NumericalDisplaySpan[] = [];
  const pattern = displayPattern(display);
  if (within) pattern.lastIndex = visibleOffsetAt(view, within.start);
  for (const match of view.text.matchAll(pattern)) {
    if (within && view.starts[match.index ?? 0] >= within.end) break;
    const span = rawNumericalSpan(view, match, header);
    if (span && (!within || (span.start >= within.start && span.end <= within.end))) found.push(span);
  }
  return found;
}

/** Source values plus equivalent displays actually present in this passage.
 * The only extra unit comes from that claim's retained column header; row
 * numbers, study identifiers and other metadata never become supplied figures. */
export function numericalClaimDisplays(content: string, claims: readonly { value: string; header?: string }[],
  view: NumericalText = numericalText(content)): string[] {
  return claims.flatMap(claim => [claim.value, ...reportedDisplaySpans(content, claim.value, claim.header ?? '', view)
    .map(span => content.slice(span.start, span.end))]);
}

/**
 * An unresolved data placeholder in CSR text: a bracketed span holding a letter, such as "[DATA TO BE INSERTED]",
 * "[N]" or "[value]", the convention the build's prompt and its template use where data is missing. The one rule
 * of the build runner, the assembly's placement (server/services/csr/csr-placeholders.ts) and the scientific review.
 */
export const CSR_DATA_PLACEHOLDER = /\[[^[\]]*[A-Za-z][^[\]]*\]/;

/**
 * The first data placeholder in a saved section's visible text, or null. Markup is read as blank, so brackets in
 * an attribute are not text (F8 of the CSR demo walk, 2026-11-02: the scientific review now refuses a section
 * that still holds one).
 */
export function placeholderIn(content: string | null | undefined): string | null {
  if (!content) return null;
  const visible: string[] = [];
  let at = 0;
  for (const [from, to] of markupRanges(content)) { visible.push(content.slice(at, from), ' '.repeat(to - from)); at = to; }
  visible.push(content.slice(at));
  return CSR_DATA_PLACEHOLDER.exec(visible.join(''))?.[0] ?? null;
}

/** A placeholder as a message quotes it: whole up to 80 characters, otherwise cut and closed with "…]". */
export const quotedPlaceholder = (held: string): string => (held.length <= 80 ? held : `${held.slice(0, 78)}…]`);

/* A number the study design writes, named by the word before it: a trial phase ("Phase 2", "Phase 2/3") and a
 * scheduled time point ("Week 8", "Weeks 8 and 16", "Week 4 to Week 24", "Days 1-14", "Visit 3", "Cycle 2"). */
const DESIGN_LABEL_BEFORE = /\b(?:phases?|weeks?|days?|months?|years?|visits?|cycles?)\s+(?:\d+[a-z]?(?:-|\s*(?:,|\/|–|and|or|to|through)\s*))*$/i;
/* An instrument's item count in brackets after its hyphenated acronym: "ADAS-Cog (11)", "HAM-D (17)", "NPI-X (9)".
 * An arm or a population is not one: "Placebo (86)" and "Non-completers (12)" are counts. */
const INSTRUMENT_ITEMS_BEFORE = /\b[A-Z]{2,}-[A-Za-z]+\s?\($/;

/**
 * Whether the number at `at`–`end` of a saved section is study design, not a result (B6, CSR demo walk 2026-11-05:
 * the review offered "Phase 2", "Weeks 8 and 16", "Week 4 to Week 24" and the "(11)" of "ADAS-Cog (11)" as figures to
 * map, each with unrelated table cells). Only the word before the number decides, so a result written beside one
 * ("at Week 24 the difference was -2.5", "86 (33.9%)") is still a result.
 */
export function studyDesignNumberAt(content: string, at: number, end: number): boolean {
  const before = content.slice(Math.max(0, at - 80), at).replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|\u00a0/g, ' ');
  if (DESIGN_LABEL_BEFORE.test(before)) return true;
  return INSTRUMENT_ITEMS_BEFORE.test(before) && content[end] === ')';
}

/**
 * Whether a retained cell's value `display` is reported at `at` in a saved
 * section's `content`: outside markup, not study design (studyDesignNumberAt),
 * and on the number boundaries above, so "190" is not inside "1190" and "12" is
 * not inside "12.5". A following "%"
 * continues a number ("12" is not "12%"), except for a cell in a percentage
 * column (`header` names "%"), whose value the text reports with its unit
 * ("83.3%"). The one rule by which the screen offers an occurrence
 * (csrEvidenceMap.ts figureOccurrences) and the server verifies a claim against
 * the whole saved section (csr-scientific-review-core.ts, 2026-10-30; it checked
 * only inside the claimed span, which has no neighbours).
 */
export function reportedDisplayAt(content: string, at: number, display: string, header: string,
  _markup: ReadonlyArray<[number, number]> = markupRanges(content)): boolean {
  return reportedDisplaySpans(content, display, header).some(span => span.start === at);
}

/** Do not accept a source cell of "190" merely because the draft says "1190".
 * This is exact display matching, not an NLP claim/estimand assessment. */
export function containsExactNumericalDisplay(quote: string, display: string): boolean {
  return reportedDisplaySpans(quote, display, '').length > 0;
}
