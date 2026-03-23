/**
 * Tests for AnA 1.0 RI Guidance-to-Action Executor v2
 *
 * Validates:
 * - Action signal detection (fenced blocks + HTML comment fallback)
 * - Input validation (type enum, confidence enum, required fields)
 * - Confidence gating (strong/moderate execute, provisional/uncertain don't)
 * - Signal stripping from response text
 * - Malformed input handling
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
      expect(signals[0].decisionContext).toBe('can_we_proceed');
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

    it('detects HTML comment fallback format', () => {
      const response = `Analysis.

<!-- ana-action
{"type": "strategy_note", "confidence": "strong", "title": "Strategy Note", "content": "Strategic analysis content"}
-->`;

      const signals = detectActionSignals(response);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('strategy_note');
    });

    it('rejects invalid action types', () => {
      const response = `\`\`\`ana-action
{"type": "invalid_type", "confidence": "strong", "title": "Test", "content": "Test"}
\`\`\``;

      const signals = detectActionSignals(response);
      expect(signals).toHaveLength(0);
    });

    it('rejects invalid confidence levels', () => {
      const response = `\`\`\`ana-action
{"type": "memo", "confidence": "very_high", "title": "Test", "content": "Test"}
\`\`\``;

      const signals = detectActionSignals(response);
      expect(signals).toHaveLength(0);
    });

    it('rejects empty title or content', () => {
      const response = `\`\`\`ana-action
{"type": "memo", "confidence": "strong", "title": "", "content": "Test"}
\`\`\``;

      const signals = detectActionSignals(response);
      expect(signals).toHaveLength(0);
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

    it('handles all valid action types', () => {
      const types = ['rewrite', 'memo', 'strategy_note', 'reviewer_brief', 'risk_log', 'review_thread'];
      for (const type of types) {
        const response = `\`\`\`ana-action
{"type": "${type}", "confidence": "strong", "title": "Test", "content": "Test content"}
\`\`\``;
        const signals = detectActionSignals(response);
        expect(signals).toHaveLength(1);
        expect(signals[0].type).toBe(type);
      }
    });

    it('handles all valid confidence levels', () => {
      const levels = ['strong', 'moderate', 'provisional', 'uncertain'];
      for (const conf of levels) {
        const response = `\`\`\`ana-action
{"type": "memo", "confidence": "${conf}", "title": "Test", "content": "Test content"}
\`\`\``;
        const signals = detectActionSignals(response);
        expect(signals).toHaveLength(1);
        expect(signals[0].confidence).toBe(conf);
      }
    });
  });

  // ─── Signal Stripping ──────────────────────────────────────────────────

  describe('stripActionSignals', () => {
    it('removes fenced action blocks from response text', () => {
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

    it('removes HTML comment action blocks', () => {
      const response = `Analysis.

<!-- ana-action
{"type": "memo", "confidence": "strong", "title": "Test", "content": "Test"}
-->

Done.`;

      const cleaned = stripActionSignals(response);
      expect(cleaned).not.toContain('ana-action');
      expect(cleaned).toContain('Analysis');
      expect(cleaned).toContain('Done');
    });

    it('preserves non-action code blocks', () => {
      const response = `\`\`\`json
{"regular": "code block"}
\`\`\``;

      const cleaned = stripActionSignals(response);
      expect(cleaned).toContain('regular');
    });

    it('returns original text when no action blocks', () => {
      const text = 'No actions here.';
      expect(stripActionSignals(text)).toBe(text);
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
