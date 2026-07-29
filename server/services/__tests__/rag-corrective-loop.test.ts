import { describe, it, expect, vi } from 'vitest';
import type { AIRequest, AIResponse } from '../aiProviderRouter';
import {
  gradeContextSufficiency,
  rewriteQuery,
  verifyGroundedness,
} from '../rag-corrective-loop';

function aiResponse(content: string): AIResponse {
  return {
    content,
    provider: 'openai',
    model: 'test',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 13, estimatedCost: 0 },
    latencyMs: 1,
    requestId: 'r',
    cached: false,
  };
}

describe('gradeContextSufficiency', () => {
  it('parses the sufficiency verdict and counts tokens', async () => {
    const route = vi.fn(async (_req: AIRequest) => aiResponse('{"sufficient": false}'));
    const { sufficient, tokensUsed } = await gradeContextSufficiency(route, 'q', 'sources');
    expect(sufficient).toBe(false);
    expect(tokensUsed).toBe(13);
    expect(route.mock.calls[0][0].taskType).toBe('structured_output');
  });

  it('defaults to sufficient=true on unparseable output (no spurious re-retrieval)', async () => {
    const route = vi.fn(async () => aiResponse('garbage'));
    expect((await gradeContextSufficiency(route, 'q', 's')).sufficient).toBe(true);
  });
});

describe('rewriteQuery', () => {
  it('returns the rewritten query, stripped of wrapping quotes', async () => {
    const route = vi.fn(async () => aiResponse('"informed consent re-consent requirements after protocol amendment"'));
    const { query } = await rewriteQuery(route, 'do I need re-consent?');
    expect(query).toBe('informed consent re-consent requirements after protocol amendment');
  });

  it('falls back to the original query when the model returns nothing', async () => {
    const route = vi.fn(async () => aiResponse('   '));
    expect((await rewriteQuery(route, 'original')).query).toBe('original');
  });
});

describe('verifyGroundedness', () => {
  it('parses the groundedness verdict', async () => {
    const route = vi.fn(async () => aiResponse('{"grounded": false}'));
    const { grounded, tokensUsed } = await verifyGroundedness(route, 'answer', 'sources');
    expect(grounded).toBe(false);
    expect(tokensUsed).toBe(13);
  });

  it('defaults to grounded=true on unparseable output (no false flagging)', async () => {
    const route = vi.fn(async () => aiResponse('not json'));
    expect((await verifyGroundedness(route, 'a', 's')).grounded).toBe(true);
  });
});
