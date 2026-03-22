/**
 * Tests for AnA 1.0 RI Guidance-to-Action Executor
 *
 * Validates:
 * - Action signal detection from AnA response text
 * - Confidence gating (strong/moderate execute, provisional/uncertain don't)
 * - Action signal stripping from response text
 * - Payload validation
 */

import { describe, it, expect } from 'vitest';
import {
  detectActionSignals,
  stripActionSignals,
  shouldAutoExecute,
} from '../ana-guidance-executor';

describe('AnA Guidance Executor', () => {
  // ─── Signal Detection ───────────────────────────────────────────────────

  describe('detectActionSignals', () => {
    it('detects a well-formed memo action block', () => {
      const response = `Here is my analysis.

\`\`\`ana-action
{
  "type": "memo",
  "confidence": "strong",
  "title": "Risk Memo: Missing Stability Data",
  "content": "## Summary\\nThe drug substance stability package is incomplete.",
  "sectionCode": "3.2.S.7",
  "decisionContext": "can_we_proceed"
}
\`\`\`

The above memo has been prepared.`;

      const signals = detectActionSignals(response);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('memo');
      expect(signals[0].confidence).toBe('strong');
      expect(signals[0].title).toBe('Risk Memo: Missing Stability Data');
      expect(signals[0].sectionCode).toBe('3.2.S.7');
    });

    it('detects multiple action blocks', () => {
      const response = `Analysis complete.

\`\`\`ana-action
{"type": "memo", "confidence": "strong", "title": "Risk Memo", "content": "Content A"}
\`\`\`

\`\`\`ana-action
{"type": "review_thread", "confidence": "moderate", "title": "Review: Safety Data", "content": "Content B"}
\`\`\``;

      const signals = detectActionSignals(response);
      expect(signals).toHaveLength(2);
      expect(signals[0].type).toBe('memo');
      expect(signals[1].type).toBe('review_thread');
    });

    it('ignores malformed JSON blocks', () => {
      const response = `\`\`\`ana-action
{this is not valid json}
\`\`\``;

      const signals = detectActionSignals(response);
      expect(signals).toHaveLength(0);
    });

    it('ignores blocks missing required fields', () => {
      const response = `\`\`\`ana-action
{"type": "memo", "confidence": "strong"}
\`\`\``;

      const signals = detectActionSignals(response);
      expect(signals).toHaveLength(0);
    });

    it('returns empty array when no action blocks present', () => {
      const signals = detectActionSignals('Just a regular response with no actions.');
      expect(signals).toHaveLength(0);
    });
  });

  // ─── Signal Stripping ──────────────────────────────────────────────────

  describe('stripActionSignals', () => {
    it('removes action blocks from response text', () => {
      const response = `Here is the analysis.

\`\`\`ana-action
{"type": "memo", "confidence": "strong", "title": "Risk Memo", "content": "Content"}
\`\`\`

The memo has been created.`;

      const cleaned = stripActionSignals(response);
      expect(cleaned).not.toContain('ana-action');
      expect(cleaned).toContain('Here is the analysis');
      expect(cleaned).toContain('The memo has been created');
    });

    it('preserves non-action code blocks', () => {
      const response = `\`\`\`json
{"regular": "code block"}
\`\`\``;

      const cleaned = stripActionSignals(response);
      expect(cleaned).toContain('regular');
    });
  });

  // ─── Confidence Gating ─────────────────────────────────────────────────

  describe('shouldAutoExecute', () => {
    it('allows execution for strong confidence', () => {
      expect(shouldAutoExecute('strong')).toBe(true);
    });

    it('allows execution for moderate confidence', () => {
      expect(shouldAutoExecute('moderate')).toBe(true);
    });

    it('blocks execution for provisional confidence', () => {
      expect(shouldAutoExecute('provisional')).toBe(false);
    });

    it('blocks execution for uncertain confidence', () => {
      expect(shouldAutoExecute('uncertain')).toBe(false);
    });
  });
});
