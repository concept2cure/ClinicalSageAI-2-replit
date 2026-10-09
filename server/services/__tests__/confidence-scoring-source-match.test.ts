/**
 * verifyClaim's source-match check — an approved model's verdict, or none.
 *
 * Whether a claim is supported by its evidence is the critical check in a
 * claim's verification. Until 2026-09-23 it:
 *   - defaulted to gpt-4o as a 'general' request (no approval check applies);
 *   - read an unreadable reply as "partially supported (0%)", a verdict;
 *   - and when the check was skipped (model unavailable), a claim whose
 *     rule-based checks passed was still reported "verified".
 */
import { describe, it, expect, vi } from 'vitest';

const S = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock('../../db.js', () => ({
  pool: {
    query: async (sql: string) => {
      if (/FROM evidence_objects/.test(sql)) {
        return {
          rows: [{ id: 'ev1', title: 'Pivotal study', description: 'Randomised trial', excerpt: 'Response rate 42% versus 18%.' }],
        };
      }
      return { rows: [] };
    },
  },
}));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import { verifyClaim } from '../confidenceScoringEngine';

// A claim every rule-based check passes (probed): with a supported source
// match it is "verified", so only the source-match outcome can change that.
const CLAIM = 'In the pivotal study (Study 301), the response rate was 42% versus 18% for placebo [1].';
const run = () => verifyClaim(CLAIM, ['00000000-0000-4000-8000-000000000001'], 9);
const sourceMatch = (r: Awaited<ReturnType<typeof run>>) => r.checks.find(c => c.checkName === 'source_match')!;

describe('verifyClaim source match', () => {
  it('is routed as regulatory_review with no model pinned', async () => {
    S.chat.mockImplementation(async () => ({ content: JSON.stringify({ supported: true, confidence: 0.9, verdict: 'supported' }) }));
    await run();
    const [req] = S.chat.mock.calls.at(-1)!;
    expect(req.taskType).toBe('regulatory_review');
    expect(req.model).toBeUndefined();
  });

  it('control: a supported verdict passes, and the claim is verified', async () => {
    S.chat.mockImplementation(async () => ({ content: JSON.stringify({ supported: true, confidence: 0.9, verdict: 'supported' }) }));
    const r = await run();
    expect(sourceMatch(r).result).toBe('pass');
    expect(r.verificationStatus).toBe('verified');
  });

  it.each([
    ['an unreadable reply', async () => ({ content: 'The claim looks fine.' })],
    ['a reply with no verdict', async () => ({ content: '{"reasoning":"n/a"}' })],
    ['a model failure', async () => { throw new Error('provider unavailable'); }],
  ])('%s is a skipped check, and the claim is not reported verified', async (_what, impl) => {
    S.chat.mockImplementation(impl as () => Promise<{ content: string }>);
    const r = await run();
    expect(sourceMatch(r).result).toBe('skipped');
    expect(r.verificationStatus).not.toBe('verified');
  });
});
