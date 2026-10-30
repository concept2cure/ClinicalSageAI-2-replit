/** Bounded excerpts of an already retrieved chunk; neither a source store nor
 * a sufficiency decision. Offsets are UTF-16, as in chooseSourceWindow. */
import { createHash } from 'node:crypto';
import { chooseSourceWindow } from '../ana/draft-source-window';

export const DRAFT_EXCERPT_CHUNK_CHARS = 2_400;
export const DRAFT_EXCERPT_TOTAL_CHARS = 12_000;
export type DraftExcerptBasis = 'whole' | 'section-window' | 'clinical-context-windows' | 'opening' | 'budget-exhausted';
export type DraftExcerptSpanBasis = 'section-query' | 'source-opening' | 'methods-population' | 'denominator' | 'safety' | 'limitations';
export interface DraftExcerptSpan { start: number; end: number; sha256: string; basis: DraftExcerptSpanBasis[] }
export interface DraftExcerptReceipt {
  version: 1;
  basis: DraftExcerptBasis;
  originalTextLength: number;
  originalTextSha256: string;
  budgetChars: number;
  shownChars: number;
  omittedChars: number;
  promptChars: number;
  spans: DraftExcerptSpan[];
}
export interface DraftExcerptSelection extends DraftExcerptReceipt { promptText: string }
export interface DraftExcerptInputs { query?: string | null; code?: string | null; maxChars?: number; remainingChars?: number }

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const BASIS: readonly DraftExcerptBasis[] = ['whole', 'section-window', 'clinical-context-windows', 'opening', 'budget-exhausted'];
const ROLES: readonly DraftExcerptSpanBasis[] = ['section-query', 'source-opening', 'methods-population', 'denominator', 'safety', 'limitations'];
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function budget(value: number | undefined, maximum: number): number {
  if (value === undefined) return maximum;
  if (!integer(value)) throw new RangeError('An excerpt source-character allowance must be a non-negative safe integer.');
  return Math.min(value, maximum);
}

function safeEdges(text: string, start: number, end: number) {
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start] ?? '') && /[\uD800-\uDBFF]/.test(text[start - 1])) start++;
  if (end > start && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end] ?? '')) end--;
  return { start, end };
}

function selection(content: string, cap: number, basis: DraftExcerptBasis, spans: DraftExcerptSpan[]): DraftExcerptSelection {
  const shownChars = spans.reduce((sum, span) => sum + span.end - span.start, 0);
  const omittedChars = content.length - shownChars;
  const excerpts = spans.map((span, index) => `Excerpt ${index + 1}; UTF-16 source offsets [${span.start}, ${span.end}); SHA-256 ${span.sha256}\nBEGIN_SOURCE_EXCERPT_${index + 1}\n${content.slice(span.start, span.end)}\nEND_SOURCE_EXCERPT_${index + 1}`).join('\n\n');
  const promptText = `${excerpts || 'No source text was shown from this supplied chunk.'}\n\nExcerpt coverage: ${shownChars} of ${content.length} source characters shown; ${omittedChars} characters omitted and not shown. Excerpts do not establish evidence sufficiency or a whole-document review. Do not infer what omitted evidence says.`;
  return { version: 1, basis, originalTextLength: content.length, originalTextSha256: hash(content), budgetChars: cap,
    shownChars, omittedChars, promptChars: promptText.length, spans, promptText };
}

interface WindowSpan { start: number; end: number; basis: DraftExcerptSpanBasis[] }
interface Topic { basis: DraftExcerptSpanBasis; query: string; weight: number; anchor: RegExp }
const CLINICAL_TOPICS: readonly Topic[] = [
  { basis: 'methods-population', weight: 0.20, query: 'design methods randomized randomised double-blind population eligibility inclusion exclusion participants enrolled',
    anchor: /\b(?:randomi[sz]ed|double.blind|eligibility|inclusion|exclusion|study design|study methods|participants|patients)\b/i },
  { basis: 'denominator', weight: 0.20, query: 'denominator denominators intention-to-treat analysis population evaluable analyzed analysed assessments randomized patients',
    anchor: /\b(?:denominators?|intention.to.treat|evaluable|analysis population|analys[ei]s set|analy[sz]ed)\b/i },
  { basis: 'safety', weight: 0.15, query: 'adverse events safety exposed serious deaths discontinuation tolerability',
    anchor: /\b(?:adverse events?|serious|deaths?|exposed|tolerability)\b/i },
  { basis: 'limitations', weight: 0.15, query: 'limitations missing outcome data follow-up post-hoc subgroup uncertainty extrapolation excluded',
    anchor: /\b(?:limitations?|uncertainty|missing (?:outcome |assessment )?data|post.hoc|short follow.up|extrapolation)\b/i },
];

/** This is a display-selection scope, never a legal applicability decision. */
function clinicalScope(input: DraftExcerptInputs): boolean {
  const code = (input.code ?? '').trim().replace(/^m(?=\d)/i, '');
  const query = input.query ?? '';
  if (/^(?:3|4)(?:\.|$)|^2\.(?:3|4|6)(?:\.|$)|(?:^|[._-])(?:quality|cmc)(?:[._-]|$)/i.test(code)) return false;
  if (/\b(?:nonclinical|non-clinical|toxicology|safety pharmacology|chemistry|manufacturing|stability|drug substance|drug product)\b/i.test(query)) return false;
  return /^2\.(?:5|7)(?:\.|$)|^5(?:\.|$)|^(?:9|10|11|12|13|14)(?:\.|$)/.test(code)
    || /\b(?:CSR|efficacy|patients?|participants?|adverse events?|clinical (?:study|trial|overview|summary))\b/i.test(query);
}

/** Mask only obvious dotted ToC leaders in the search view. Replace UTF-16
 * units one-for-one; neither offsets nor returned source text are normalized. */
function searchView(content: string): string {
  return content.replace(/[^\r\n\f]+/g, line => {
    const dots = line.lastIndexOf('..');
    const ellipsis = line.lastIndexOf('…');
    const end = Math.max(dots >= 0 ? dots + 2 : -1, ellipsis >= 0 ? ellipsis + 1 : -1);
    if (end < 0 || !/^\s*\d+(?:[-–]\d+)?\s*$/.test(line.slice(end))) return line;
    return line.replace(/[^\r\n\f]/g, ' ');
  });
}

function window(content: string, searchable: string, input: {
  query?: string | null; cap: number; basis: DraftExcerptSpanBasis; anchor?: RegExp;
}): WindowSpan | null {
  const { query, cap, basis, anchor } = input;
  if (cap <= 0 || (anchor && !anchor.test(searchable))) return null;
  const chosen = chooseSourceWindow(searchable, query, cap);
  const { start, end } = safeEdges(content, chosen.start, chosen.end);
  if (end <= start || (anchor && !anchor.test(searchable.slice(start, end)))) return null;
  return { start, end, basis: [basis === 'section-query' && chosen.basis === 'opening' ? 'source-opening' : basis] };
}

function merged(windows: WindowSpan[]): WindowSpan[] {
  const result: WindowSpan[] = [];
  for (const current of windows.filter(span => span.end > span.start).sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = result.at(-1);
    if (previous && current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      previous.basis = ROLES.filter(role => previous.basis.includes(role) || current.basis.includes(role));
    } else result.push({ ...current, basis: [...current.basis] });
  }
  return result;
}

function clinicalWindows(content: string, searchable: string, input: DraftExcerptInputs, cap: number): WindowSpan[] {
  const context: WindowSpan[] = [];
  const opening = safeEdges(content, 0, Math.floor(cap * 0.05));
  if (opening.end > opening.start) context.push({ ...opening, basis: ['source-opening'] });
  for (const topic of CLINICAL_TOPICS) {
    const found = window(content, searchable, { ...topic, cap: Math.floor(cap * topic.weight) });
    if (found) context.push(found);
  }
  const others = merged(context);
  const used = others.reduce((sum, span) => sum + span.end - span.start, 0);
  const primary = window(content, searchable, { query: input.query, cap: cap - used, basis: 'section-query' });
  return merged(primary ? [...others, primary] : others);
}

/** Reuse the existing selector for each bounded purpose, and merge overlaps
 * before charging source characters. Wrapper characters are reported separately. */
export function buildDraftExcerpts(content: string, input: DraftExcerptInputs = {}): DraftExcerptSelection {
  const cap = Math.min(budget(input.maxChars, DRAFT_EXCERPT_CHUNK_CHARS), budget(input.remainingChars, DRAFT_EXCERPT_TOTAL_CHARS));
  if (content.length <= cap) {
    const spans: DraftExcerptSpan[] = content.length ? [{ start: 0, end: content.length, sha256: hash(content), basis: ['source-opening'] }] : [];
    return selection(content, cap, 'whole', spans);
  }
  if (cap === 0) return selection(content, cap, 'budget-exhausted', []);
  const searchable = searchView(content);
  const found = clinicalScope(input) ? clinicalWindows(content, searchable, input, cap)
    : [window(content, searchable, { query: input.query, cap, basis: 'section-query' })].filter((span): span is WindowSpan => !!span);
  const spans = found.map(span => ({ ...span, sha256: hash(content.slice(span.start, span.end)) }));
  const clinical = spans.some(span => span.basis.some(role => CLINICAL_TOPICS.some(topic => topic.basis === role)));
  const basis: DraftExcerptBasis = clinical ? 'clinical-context-windows'
    : spans.some(span => span.basis.includes('section-query')) ? 'section-window' : 'opening';
  return selection(content, cap, basis, spans);
}

type ExcerptCounts = Pick<DraftExcerptReceipt, 'originalTextLength' | 'budgetChars' | 'shownChars' | 'omittedChars' | 'promptChars'>;
function readCounts(raw: Record<string, unknown>): ExcerptCounts | null {
  for (const key of ['originalTextLength', 'budgetChars', 'shownChars', 'omittedChars', 'promptChars']) if (!integer(raw[key])) return null;
  const { originalTextLength, budgetChars, shownChars, omittedChars, promptChars } = raw as unknown as ExcerptCounts;
  if (budgetChars > DRAFT_EXCERPT_CHUNK_CHARS || shownChars > budgetChars || shownChars + omittedChars !== originalTextLength || promptChars < shownChars || promptChars > shownChars + 4096) return null;
  return { originalTextLength, budgetChars, shownChars, omittedChars, promptChars };
}

function readSpan(raw: unknown, originalTextLength: number, previousEnd: number): DraftExcerptSpan | null {
  if (!object(raw) || !integer(raw.start) || !integer(raw.end) || raw.end <= raw.start || raw.end > originalTextLength || raw.start <= previousEnd || !digest(raw.sha256)) return null;
  if (!Array.isArray(raw.basis) || raw.basis.length === 0 || raw.basis.length > ROLES.length || new Set(raw.basis).size !== raw.basis.length || !raw.basis.every(role => ROLES.includes(role))) return null;
  return { start: raw.start, end: raw.end, sha256: raw.sha256, basis: [...raw.basis] };
}

function readSpans(raw: unknown, originalTextLength: number): DraftExcerptSpan[] | null {
  if (!Array.isArray(raw) || raw.length > ROLES.length) return null;
  const spans: DraftExcerptSpan[] = [];
  let previousEnd = -1;
  for (const value of raw) {
    const span = readSpan(value, originalTextLength, previousEnd);
    if (!span) return null;
    spans.push(span);
    previousEnd = span.end;
  }
  return spans;
}

function scopeCountsAgree(receipt: DraftExcerptReceipt): boolean {
  if (receipt.basis === 'budget-exhausted') return receipt.budgetChars === 0 && receipt.shownChars === 0;
  if (receipt.basis !== 'whole') return true;
  if (receipt.omittedChars !== 0) return false;
  if (receipt.originalTextLength === 0) return receipt.spans.length === 0;
  return receipt.spans.length === 1 && receipt.spans[0].start === 0 && receipt.spans[0].end === receipt.originalTextLength;
}

/** Persisted shape validation; source authenticity additionally needs the original text. */
export function parseDraftExcerptReceipt(raw: unknown): DraftExcerptReceipt | null {
  if (!object(raw) || raw.version !== 1 || !BASIS.includes(raw.basis as DraftExcerptBasis) || !digest(raw.originalTextSha256)) return null;
  const counts = readCounts(raw);
  if (!counts) return null;
  const spans = readSpans(raw.spans, counts.originalTextLength);
  if (!spans || spans.reduce((sum, span) => sum + span.end - span.start, 0) !== counts.shownChars) return null;
  const receipt: DraftExcerptReceipt = { version: 1, basis: raw.basis as DraftExcerptBasis,
    originalTextSha256: raw.originalTextSha256, ...counts, spans };
  return scopeCountsAgree(receipt) ? receipt : null;
}

/** Exact source quotations only: never join windows across text not shown. */
export function quoteWasShown(content: string, raw: unknown, quote: string): boolean {
  const receipt = parseDraftExcerptReceipt(raw);
  if (!receipt || !quote.trim() || receipt.originalTextLength !== content.length || receipt.originalTextSha256 !== hash(content)) return false;
  for (const span of receipt.spans) {
    const safe = safeEdges(content, span.start, span.end);
    if (safe.start !== span.start || safe.end !== span.end || hash(content.slice(span.start, span.end)) !== span.sha256) return false;
  }
  return receipt.spans.some(span => content.slice(span.start, span.end).includes(quote));
}
