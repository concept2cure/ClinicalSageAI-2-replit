/**
 * indCopilot.checkFDACompliance — served by an approved model, and it runs.
 *
 * Until 2026-09-23 the check pinned gpt-4o-mini as a 'general' request (no
 * approval check applies) and then read `aiResult.content` — a name that does
 * not exist in that function — so every call threw and was reported as a failed
 * compliance check with score 0. It is now regulatory_review and reads the
 * reply it received.
 */
import { describe, it, expect, vi } from 'vitest';

const S = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import indCopilot from '../indCopilot.js';

const { checkFDACompliance } = indCopilot as { checkFDACompliance: (content: string, code: string) => Promise<Record<string, unknown>> };

describe('checkFDACompliance', () => {
  it('is routed as regulatory_review with no model pinned, and scores the reply it got', async () => {
    S.chat.mockImplementation(async () => ({
      content: JSON.stringify({ score: 82, issues: [], missing_elements: [], overall_assessment: 'pass' }),
      provider: 'anthropic',
      model: 'claude-opus-5',
    }));

    const r = await checkFDACompliance('2.7.3 Summary of Clinical Efficacy. The primary endpoint was met.', '2.7.3');

    const [req] = S.chat.mock.calls[0];
    expect(req.taskType).toBe('regulatory_review');
    expect(req.model).toBeUndefined();
    expect(r).toMatchObject({ score: 82, passed: true, overall_assessment: 'pass' });
  });
});
