/**
 * applySourceTraceability — Parses [SRC-n] reference tokens from AI-generated
 * content and applies TipTap TraceabilityMark annotations so every claim is
 * visually linked to its provenance source.
 *
 * Flow:
 *   1. Backend returns AI text with inline `[SRC-1]`, `[SRC-2]`, … tokens
 *   2. Backend also returns `provenance.sources[]` with matching indices
 *   3. This utility strips the tokens and wraps adjacent text in traceability
 *      marks carrying sourceId + sourceHash + linkId from the provenance chain
 *
 * The marks are rendered by UnifiedDocumentEditor's TraceabilityMark extension
 * as blue-underlined spans with data-traceability="true".
 */

export interface ProvenanceSource {
  /** 1-based index matching [SRC-n] token */
  index?: number;
  /** Source document / chunk ID */
  sourceId?: string;
  id?: string;
  /** Document name or title */
  name?: string;
  title?: string;
  /** SHA-256 hash of the source content */
  hash?: string;
  contentHash?: string;
  /** Page or section reference */
  page?: number;
  section?: string;
  /** Excerpt from the source */
  excerpt?: string;
  /** Confidence score (0-1) */
  confidence?: number;
}

export interface AIProvenance {
  sourcesRetrieved?: number;
  claims?: Array<{
    text?: string;
    sourceIndices?: number[];
    confidence?: number;
  }>;
  sources?: ProvenanceSource[];
}

interface TraceabilitySegment {
  text: string;
  sourceRef?: ProvenanceSource;
}

/**
 * Parse AI-generated HTML/text content and split into segments around [SRC-n] tokens.
 * Returns an array of segments where each has the text and optional source reference.
 */
function parseSourceTokens(
  content: string,
  sources: ProvenanceSource[]
): TraceabilitySegment[] {
  // Match [SRC-1], [SRC-2], etc. — the backend injects these
  const srcPattern = /\[SRC-(\d+)\]/g;
  const segments: TraceabilitySegment[] = [];

  // Build a lookup map: index → source
  const sourceMap = new Map<number, ProvenanceSource>();
  sources.forEach((src, i) => {
    const idx = src.index ?? i + 1;
    sourceMap.set(idx, src);
  });

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = srcPattern.exec(content)) !== null) {
    const tokenStart = match.index;
    const tokenEnd = tokenStart + match[0].length;
    const srcIndex = parseInt(match[1], 10);
    const source = sourceMap.get(srcIndex);

    // Text before this token — mark it with the source reference
    // The [SRC-n] token typically appears at the end of a sentence/claim
    // So we look backwards from the token to find the sentence it belongs to
    if (lastIndex < tokenStart) {
      const precedingText = content.slice(lastIndex, tokenStart);

      if (source) {
        // Find the last sentence boundary to determine what text this source covers
        const sentenceBoundary = findLastSentenceBoundary(precedingText);

        if (sentenceBoundary > 0) {
          // Text before the sentence → unmarked
          segments.push({ text: precedingText.slice(0, sentenceBoundary) });
          // The sentence itself → marked with source
          segments.push({
            text: precedingText.slice(sentenceBoundary).trim(),
            sourceRef: source,
          });
        } else {
          // Entire text gets the source mark
          segments.push({ text: precedingText, sourceRef: source });
        }
      } else {
        segments.push({ text: precedingText });
      }
    }

    // Skip the [SRC-n] token itself (don't include it in output)
    lastIndex = tokenEnd;
  }

  // Remaining text after last token
  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex) });
  }

  // If no tokens found at all, return the entire content unmarked
  if (segments.length === 0) {
    segments.push({ text: content });
  }

  return segments;
}

/**
 * Find the last sentence boundary (period, semicolon, or newline followed by space)
 * in a text fragment. Returns the index of the boundary, or 0 if none found.
 */
function findLastSentenceBoundary(text: string): number {
  // Look for the last ". " or ".\n" or "; " pattern
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if ((ch === '.' || ch === ';' || ch === '\n') && i > 0) {
      // Return position after the boundary character + space
      const nextIdx = i + 1;
      if (nextIdx < text.length && text[nextIdx] === ' ') {
        return nextIdx + 1;
      }
      return nextIdx;
    }
  }
  return 0;
}

/**
 * Convert AI-generated content with [SRC-n] tokens into HTML with
 * traceability mark spans. This is used when the content is inserted
 * as HTML into the editor.
 */
export function applySourceTraceabilityToHtml(
  htmlContent: string,
  provenance: AIProvenance | null | undefined
): string {
  if (!provenance?.sources?.length) {
    // No provenance — strip any [SRC-n] tokens and return clean HTML
    return htmlContent.replace(/\[SRC-\d+\]/g, '');
  }

  // Process content — we need to handle HTML tags carefully
  // Strategy: only process text nodes, leave HTML tags intact
  const result = htmlContent.replace(
    />((?:[^<]|\n)+)</g,
    (_match, textContent: string) => {
      const processed = processTextWithSources(textContent, provenance.sources!);
      return `>${processed}<`;
    }
  );

  // Also clean up any remaining [SRC-n] tokens that weren't inside tags
  return result.replace(/\[SRC-\d+\]/g, '');
}

/**
 * Process a text fragment, replacing [SRC-n] tokens with traceability spans.
 */
function processTextWithSources(
  text: string,
  sources: ProvenanceSource[]
): string {
  const segments = parseSourceTokens(text, sources);

  return segments
    .map((seg) => {
      if (!seg.sourceRef) return seg.text;

      const sourceId = seg.sourceRef.sourceId || seg.sourceRef.id || '';
      const sourceHash = seg.sourceRef.hash || seg.sourceRef.contentHash || '';
      const linkId = `src-${sourceId}-${Date.now()}`;

      return `<span data-traceability="true" data-source-id="${escapeAttr(sourceId)}" data-source-hash="${escapeAttr(sourceHash)}" data-link-id="${escapeAttr(linkId)}" class="traceability-link bg-blue-100 border-b-2 border-stone-600 cursor-pointer hover:bg-blue-200" title="Source: ${escapeAttr(seg.sourceRef.name || seg.sourceRef.title || sourceId)}">${seg.text}</span>`;
    })
    .join('');
}

function escapeAttr(val: string): string {
  return val.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build TipTap-compatible JSON content with traceability marks applied.
 * Use this when inserting via editor.commands.insertContent().
 */
export function buildTracedTipTapContent(
  htmlContent: string,
  provenance: AIProvenance | null | undefined
): string {
  // Apply traceability marks to the HTML, then return it for TipTap to parse
  return applySourceTraceabilityToHtml(htmlContent, provenance);
}

/**
 * Count the number of [SRC-n] tokens in content.
 */
export function countSourceTokens(content: string): number {
  const matches = content.match(/\[SRC-\d+\]/g);
  return matches?.length || 0;
}

/**
 * Extract all unique source indices from content.
 */
export function extractSourceIndices(content: string): number[] {
  const matches = content.matchAll(/\[SRC-(\d+)\]/g);
  const indices = new Set<number>();
  for (const m of matches) {
    indices.add(parseInt(m[1], 10));
  }
  return Array.from(indices).sort((a, b) => a - b);
}
