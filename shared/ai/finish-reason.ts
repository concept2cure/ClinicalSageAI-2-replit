/**
 * Did the model finish, or did it stop?
 *
 * ── Why this needs a name ────────────────────────────────────────────────────
 * The gateway already records why generation ended — `finishReason` is set on
 * every provider path in gateway.ts (`response.stop_reason` for Anthropic,
 * `choice.finish_reason` for the OpenAI-shaped ones, and `'chunk_timeout'` when
 * a stream stalls and a PARTIAL body is returned deliberately). Nothing read it.
 *
 * AnaDocumentDraftingService drafts at `maxTokens: 8192` and returned only
 * `content`, so a narrative that hit the ceiling mid-sentence was handed back
 * indistinguishable from a complete one. Accepted, it is written to
 * `coauthor_documents` — the table leaf-source-resolver materializes eCTD leaves
 * from — and filed. The size cap on the accept route (400,000 chars) does not
 * catch it: a draft truncated at 8192 tokens is nowhere near that, which is the
 * point. 21 CFR 11.10(a) requires a system able to discern an invalid or
 * altered record; a silently truncated one is exactly that, and it looks normal.
 *
 * ── The vocabulary is per-provider, so it is collected here ──────────────────
 * Anthropic  end_turn · max_tokens · stop_sequence · tool_use · pause_turn
 * OpenAI-ish stop · length · tool_calls · content_filter
 * Gateway    unknown · error · chunk_timeout
 *
 * Only the ceiling cases mean "there was more to say and it was cut off".
 * `error` is a failure the caller already sees; `unknown` is not evidence of
 * truncation and is not treated as such — inventing a truncation would be its
 * own fabrication.
 *
 * @module server/services/ai-gateway/finish-reason
 */

/** Reasons that mean the output was cut off with more still to say. */
export const TRUNCATING_FINISH_REASONS: ReadonlySet<string> = new Set([
  'max_tokens', // Anthropic: hit maxTokens
  'length', // OpenAI-shaped: hit max_tokens
  'chunk_timeout', // gateway: stream stalled, partial body returned on purpose
]);

/**
 * True when the finish reason says the output was cut off.
 *
 * Absent or unrecognised is NOT truncated: a reason nobody recorded is not
 * evidence of one, and asserting truncation on silence would be the same class
 * of fabrication this exists to prevent. Callers that need "verified complete"
 * should test {@link isVerifiedComplete} instead.
 */
export function isTruncated(finishReason: string | null | undefined): boolean {
  return typeof finishReason === 'string' && TRUNCATING_FINISH_REASONS.has(finishReason.trim());
}

/** Reasons that positively confirm the model said everything it meant to. */
const COMPLETE_FINISH_REASONS: ReadonlySet<string> = new Set([
  'end_turn',
  'stop',
  'stop_sequence',
  'tool_use',
  'tool_calls',
]);

/**
 * True only when the finish reason positively confirms a complete generation.
 *
 * The distinction from `!isTruncated()` is the whole point for a governed path:
 * `undefined`, `'unknown'` and `'error'` are all "we do not know", and a
 * governed write should not treat not-knowing as confirmation.
 */
export function isVerifiedComplete(finishReason: string | null | undefined): boolean {
  return typeof finishReason === 'string' && COMPLETE_FINISH_REASONS.has(finishReason.trim());
}
