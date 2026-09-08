/**
 * Automated source attribution — verified quotes only.
 *
 * This is the write side of span-grain source lineage (span-lineage.service.ts
 * has the read side and the recording primitive; this module decides WHAT to
 * record when content is generated from retrieved sources). It is the keystone
 * of the automated-attribution design in
 * docs/architecture/SOURCE_ATTRIBUTION_AUTOMATED_DESIGN.md.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 * The source-usage subsystem is built on a single principle, stated in
 * source-usage.service.ts:
 *
 *     "Nothing is inferred from titles, filenames or text similarity.
 *      A usage exists because someone recorded it."
 *
 * Automated attribution must not quietly break that by turning "the model
 * probably used this source" into a recorded citation. So this function records
 * a source span ONLY where it is a verifiable fact: a span of the generated text
 * whose words appear, in order, inside a retrieved source's own content. That is
 * a `quoted` usage — checkable at any later time by anyone, with no trust placed
 * in the model. Text the model paraphrased or wrote itself is deliberately NOT
 * attributed here; it is left to the model-asserted path (recorded as an
 * assertion, never a quote) and to author lineage. Silence is the honest answer
 * for text we cannot verify, and getSelectionOrigins reports uncovered ranges
 * precisely so that silence is visible rather than hidden.
 *
 * ── OFFSETS ─────────────────────────────────────────────────────────────────
 * Spans are produced by detectSpans(), which guarantees
 * `generatedText.slice(charStart, charEnd) === span.text`. The returned offsets
 * are therefore exact positions in the generated document's canonical text —
 * the same coordinate system document_span_lineage stores and the Data Origins
 * click-through reads. Matching is done on a normalized COPY; the offsets always
 * refer to the original, unnormalized text.
 *
 * This module is intentionally pure — no database, no model calls, no clock. It
 * computes the set of verifiable attributions; persisting them (via
 * recordSourceSpan, inside the content's transaction, followed by
 * assertLineageCoversContent) is the caller's job. Purity is what makes the one
 * risk surface — the match rules — exhaustively unit-testable.
 *
 * @module server/services/clinical-regulatory-evidence/source-attribution
 */

import { detectSpans, type SpanGranularity } from '../sentenceTraceabilityService';
import {
  recordSourceSpan,
  type SpanUsage,
  type DocumentRef,
  type Queryable,
} from './span-lineage.service';

/** A retrieved source, carrying its canonical identity and the text it contributed. */
export interface RetrievedSource {
  /** cre_evidence_sources.id — the canonical Data Room source id. */
  sourceId: number;
  /** The source's content as retrieved (the chunk/atom text, or the whole doc). */
  content: string;
  title?: string | null;
}

/** One verified attribution: a span of the generated text and the source it quotes. */
export interface AttributedSpan {
  /** Half-open [charStart, charEnd) over the GENERATED text (original offsets). */
  charStart: number;
  charEnd: number;
  /** The cre_evidence_sources.id this span is quoted from. */
  sourceId: number;
  /** Always 'quoted' from this path — it is a verified substring fact. */
  usage: SpanUsage;
  /** The span's text, exactly as it appears in the generated document. */
  spanText: string;
}

export interface AttributeOptions {
  /**
   * Spans shorter than this (measured on normalized text) are not attributed.
   * A three-word clause that happens to also appear in a source is more likely a
   * coincidence than a quotation; declining to record it is conservative, not
   * dishonest. Default 24 characters (~4 words).
   */
  minQuoteChars?: number;
  /** Span granularity to attribute at. Default 'clause', matching author lineage. */
  granularity?: SpanGranularity;
  /**
   * When a span is quoted by more than one source, record it against every
   * source that contains it (true, default — honest: "this appears in A and B")
   * or only the first (false). Overlapping spans are supported by the reader.
   */
  multiSource?: boolean;
}

const DEFAULT_MIN_QUOTE_CHARS = 24;

/**
 * Normalize for comparison only — never for storage or offsets.
 *
 * Collapses all runs of whitespace to a single space, trims, and lowercases, so
 * a quote survives reflow (a source's "foo\nbar" vs the generated "foo bar") and
 * the sentence-initial capitalization of a phrase quoted from mid-source. The
 * result is still an honest verbatim match: the same words in the same order.
 * What it is NOT is a similarity score — either the normalized span is a
 * substring of the normalized source, or it is not.
 */
export function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The verified source spans of `generatedText`.
 *
 * For each detected span, if its normalized text is long enough and appears as a
 * substring of some source's normalized content, that span is attributed to the
 * source as a `quoted` usage. Nothing else is recorded — text this function
 * cannot verify is returned to no one, which is the point.
 *
 * Deterministic and side-effect-free: the same inputs always yield the same
 * spans, in generated-document order, then by ascending sourceId.
 */
export function attributeQuotedSpans(
  generatedText: string,
  sources: RetrievedSource[],
  opts: AttributeOptions = {},
): AttributedSpan[] {
  if (!generatedText || generatedText.length === 0) return [];
  if (!Array.isArray(sources) || sources.length === 0) return [];

  const minChars = opts.minQuoteChars ?? DEFAULT_MIN_QUOTE_CHARS;
  const granularity = opts.granularity ?? 'clause';
  const multiSource = opts.multiSource ?? true;

  // Normalize each source once. A source with no usable content cannot back a
  // quote, so it is dropped rather than carried as an empty haystack.
  const haystacks = sources
    .filter((s) => s && Number.isInteger(s.sourceId) && s.sourceId > 0 && typeof s.content === 'string')
    .map((s) => ({ sourceId: s.sourceId, norm: normalizeForMatch(s.content) }))
    .filter((s) => s.norm.length > 0);

  if (haystacks.length === 0) return [];

  const out: AttributedSpan[] = [];

  for (const span of detectSpans(generatedText, granularity)) {
    const needle = normalizeForMatch(span.text);
    // Too short to be a confident quotation, or empty after normalization.
    if (needle.length < minChars) continue;

    for (const h of haystacks) {
      if (h.norm.includes(needle)) {
        out.push({
          charStart: span.charStart,
          charEnd: span.charEnd,
          sourceId: h.sourceId,
          usage: 'quoted',
          spanText: span.text,
        });
        if (!multiSource) break;
      }
    }
  }

  // Document order, then ascending sourceId — stable and reader-friendly.
  out.sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd || a.sourceId - b.sourceId);
  return out;
}

/** One model-asserted derivation: a snippet of the generated text the model
 *  claims it derived from a specific retrieved source. NOT a verified fact. */
export interface ParaphraseAssertion {
  /** A snippet of the GENERATED text the model says it derived from `sourceId`. */
  quote: string;
  /** The cre_evidence_sources.id the model claims the snippet derives from. */
  sourceId: number;
}

/**
 * Model-ASSERTED paraphrase spans — the honest, layered complement to
 * {@link attributeQuotedSpans}.
 *
 * A verified quote is a substring fact: the generated text appears in the source,
 * checkable by anyone. A paraphrase is NOT — it is the model's own claim that it
 * derived a passage from a particular retrieved source. This records exactly that
 * claim and no more, under two guards that keep it honest:
 *
 *   1. It only attributes a clause the model actually flagged: the clause's text
 *      must appear (normalized) inside one of the model's asserted `quote`s — the
 *      model cannot tag text it never quoted back.
 *   2. It only attributes to a source that was actually retrieved (`sourceId`
 *      present in `sources`) — the model cannot cite a document it was not given.
 *
 * Everything returned carries `usage: 'paraphrased'`, never `'quoted'`, so a
 * reader (and the Data Origins panel) can always tell a checkable citation from a
 * claimed one. The verified-quote pass is meant to run FIRST: pass its clause
 * ranges as `alreadyQuotedRanges` and any clause already proven a quote is left to
 * it — a verified fact always wins over an assertion about the same characters.
 *
 * Pure and deterministic, exactly like attributeQuotedSpans; the only difference
 * is that the haystacks are the model's asserted quotes, not the source content.
 * Offsets are the detected clause's own — the same coordinate system the reader
 * and document_span_lineage use.
 */
export function attributeAssertedParaphraseSpans(
  generatedText: string,
  sources: RetrievedSource[],
  assertions: ParaphraseAssertion[],
  opts: AttributeOptions & { alreadyQuotedRanges?: Set<string> } = {},
): AttributedSpan[] {
  if (!generatedText || generatedText.length === 0) return [];
  if (!Array.isArray(assertions) || assertions.length === 0) return [];

  const minChars = opts.minQuoteChars ?? DEFAULT_MIN_QUOTE_CHARS;
  const granularity = opts.granularity ?? 'clause';
  const multiSource = opts.multiSource ?? true;
  const alreadyQuoted = opts.alreadyQuotedRanges ?? new Set<string>();

  // Only sources actually retrieved can be cited — an assertion naming anything
  // else is dropped rather than resolved to a guessed id.
  const validSourceIds = new Set(
    (Array.isArray(sources) ? sources : [])
      .filter((s) => s && Number.isInteger(s.sourceId) && s.sourceId > 0)
      .map((s) => s.sourceId),
  );

  // Each assertion becomes a normalized haystack tagged with its (valid) source id.
  const claims = assertions
    .filter(
      (a) =>
        a &&
        typeof a.quote === 'string' &&
        Number.isInteger(a.sourceId) &&
        validSourceIds.has(a.sourceId),
    )
    .map((a) => ({ sourceId: a.sourceId, norm: normalizeForMatch(a.quote) }))
    .filter((a) => a.norm.length > 0);

  if (claims.length === 0) return [];

  const out: AttributedSpan[] = [];

  for (const span of detectSpans(generatedText, granularity)) {
    // A verified quote about these characters wins — leave it to the quote pass.
    if (alreadyQuoted.has(`${span.charStart}:${span.charEnd}`)) continue;

    const needle = normalizeForMatch(span.text);
    if (needle.length < minChars) continue;

    const seen = new Set<number>();
    for (const c of claims) {
      if (seen.has(c.sourceId)) continue;
      if (c.norm.includes(needle)) {
        out.push({
          charStart: span.charStart,
          charEnd: span.charEnd,
          sourceId: c.sourceId,
          usage: 'paraphrased',
          spanText: span.text,
        });
        seen.add(c.sourceId);
        if (!multiSource) break;
      }
    }
  }

  out.sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd || a.sourceId - b.sourceId);
  return out;
}

/**
 * How much of the generated text is verifiably quoted from a source.
 *
 * A convenience for callers and for the coverage indicator: the fraction of
 * non-whitespace characters covered by at least one attributed span. It is a
 * report, not a gate — a low number means "mostly author-original or
 * paraphrased", which is a legitimate and common state, not a failure.
 */
export function quotedCoverage(generatedText: string, spans: AttributedSpan[]): number {
  if (!generatedText || generatedText.length === 0) return 0;
  if (spans.length === 0) return 0;

  // Merge overlapping/adjacent spans so two sources backing the same sentence do
  // not double-count toward coverage.
  const ranges = [...spans]
    .map((s) => ({ start: s.charStart, end: s.charEnd }))
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  let covered = 0;
  let total = 0;
  // Count non-whitespace characters, and of those, how many fall in a covered range.
  for (let i = 0; i < generatedText.length; i++) {
    if (/\s/.test(generatedText[i])) continue;
    total++;
    for (const m of merged) {
      if (i >= m.start && i < m.end) {
        covered++;
        break;
      }
    }
  }

  return total === 0 ? 0 : Math.round((covered / total) * 100);
}

export interface RecordSourceSpansResult {
  /** Source spans written or re-resolved. */
  recorded: number;
  /** Distinct sources those spans cite. */
  distinctSources: number;
  /** Percent of non-whitespace content verifiably quoted from a source. */
  coverage: number;
  /** The attributions, in document order — the same set returned by the pure pass. */
  spans: AttributedSpan[];
}

/**
 * The persistence bridge: compute the verified attributions and record them.
 *
 * This is the one function a generation path calls after drafting content from
 * retrieved sources. It runs the pure {@link attributeQuotedSpans} over the
 * output and writes each verified quote as a `cre_evidence_source` span via
 * recordSourceSpan — passing `exec` so the lineage enlists in the SAME
 * transaction as the content, which is what makes "content does not persist
 * without its provenance" an invariant rather than a hope.
 *
 * It records ONLY source spans. Author lineage for the remaining (original or
 * paraphrased) text and the coverage gate (assertLineageCoversContent) stay the
 * caller's responsibility, exactly as they are for manually-authored content —
 * this function adds the automatic, verifiable half and no more.
 *
 * recordSourceSpan verifies each source is visible to the tenant and throws if
 * it is not; that throw is deliberately not swallowed, because a citation to a
 * source the document's tenant cannot see is a real defect, not noise. A caller
 * running inside the content transaction therefore fails closed.
 *
 * Idempotent per (document, span, source): recording the same draft twice
 * re-resolves rather than duplicating, so re-generation converges.
 */
export async function attributeAndRecordSourceSpans(
  orgId: number,
  ref: DocumentRef,
  generatedText: string,
  sources: RetrievedSource[],
  opts: AttributeOptions & { createdBy?: string | null } = {},
  exec?: Queryable,
): Promise<RecordSourceSpansResult> {
  const spans = attributeQuotedSpans(generatedText, sources, opts);

  for (const s of spans) {
    await recordSourceSpan(
      orgId,
      {
        ...ref,
        charStart: s.charStart,
        charEnd: s.charEnd,
        spanText: s.spanText,
        sourceId: s.sourceId,
        usage: s.usage,
        createdBy: opts.createdBy ?? null,
      },
      exec,
    );
  }

  return {
    recorded: spans.length,
    distinctSources: new Set(spans.map((s) => s.sourceId)).size,
    coverage: quotedCoverage(generatedText, spans),
    spans,
  };
}
