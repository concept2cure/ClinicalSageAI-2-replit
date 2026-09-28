/**
 * The classifier that tells a finished generation from a cut-off one.
 *
 * The distinction that matters is between "not truncated" and "verified
 * complete". An absent or unknown finish reason is neither, and a governed
 * write must not read silence as confirmation.
 */
import { describe, it, expect } from 'vitest';
import { isTruncated, isVerifiedComplete } from '../finish-reason';

describe('isTruncated', () => {
  it('recognises the ceiling reasons every provider emits', () => {
    expect(isTruncated('max_tokens')).toBe(true); // Anthropic
    expect(isTruncated('length')).toBe(true); // OpenAI-shaped
    expect(isTruncated('chunk_timeout')).toBe(true); // gateway: partial body on a stalled stream
  });

  it('does not call a finished generation truncated', () => {
    for (const r of ['end_turn', 'stop', 'stop_sequence', 'tool_use', 'tool_calls']) {
      expect(isTruncated(r), r).toBe(false);
    }
  });

  it('does not invent truncation from silence', () => {
    for (const r of [undefined, null, '', 'unknown', 'error', 'content_filter']) {
      expect(isTruncated(r as string | null | undefined), String(r)).toBe(false);
    }
  });

  it('tolerates surrounding whitespace', () => {
    expect(isTruncated(' max_tokens ')).toBe(true);
  });
});

describe('isVerifiedComplete', () => {
  it('is not the negation of isTruncated — silence confirms nothing', () => {
    for (const r of [undefined, null, '', 'unknown', 'error']) {
      const v = r as string | null | undefined;
      expect(isTruncated(v), `isTruncated(${r})`).toBe(false);
      expect(isVerifiedComplete(v), `isVerifiedComplete(${r})`).toBe(false);
    }
  });

  it('confirms only a positively-recorded finish', () => {
    expect(isVerifiedComplete('end_turn')).toBe(true);
    expect(isVerifiedComplete('stop')).toBe(true);
    expect(isVerifiedComplete('max_tokens')).toBe(false);
  });
});
