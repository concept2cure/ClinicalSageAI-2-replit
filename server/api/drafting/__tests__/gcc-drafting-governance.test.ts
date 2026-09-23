/**
 * /api/gcc/drafting/generate — the "regulatory-grade" draft is served by an
 * approved model and records the model that served it.
 *
 * Until 2026-09-23 the draft was requested with `model: 'gpt-4o'` as a
 * 'general' request (no approval check applies), and both the response's
 * metadata.model and the session audit row's model_used were the literal
 * CONFIG.model — 'gpt-4o' — whatever had actually answered.
 *
 * The query embedding it needs came from ai.embeddings, which sent the text to
 * a chat completion and returned [] when that did not parse. It is now the
 * gateway embedding provider (tested in unified-ai-client-embeddings.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const S = vi.hoisted(() => ({
  chat: vi.fn(),
  queries: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../../middleware/tenantContext', () => ({
  getRequestDbClient: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      S.queries.push({ sql, params });
      if (/vault\.hybrid_search/.test(sql)) {
        return {
          rows: [
            { chunk_id: 'c1', document_id: 'd1', content_type: 'TEXT', chunk_text: 'AE rate 12% vs 9%.', page_number: 4, vector_score: 0.8, combined_score: 0.8 },
          ],
        };
      }
      return { rows: [] };
    },
  }),
}));
vi.mock('../../../lib/unified-ai-client', () => ({
  ai: {
    chat: S.chat,
    embeddings: async () => ({ embedding: [0.1, 0.2, 0.3] }),
  },
}));

import router from '../routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/gcc/drafting', router);
  return a;
}

beforeEach(() => {
  S.chat.mockReset();
  S.queries.length = 0;
});

describe('POST /api/gcc/drafting/generate', () => {
  it('routes the draft as document_drafting with no model, and records the model that served', async () => {
    S.chat.mockResolvedValue({
      content: JSON.stringify({ draft_text: 'The AE rate was 12% [1].', reasoning_trace: 'r', citations: [{ sourceId: 'c1', text: 'AE rate 12%' }] }),
      provider: 'anthropic',
      model: 'claude-opus-5',
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const res = await request(app())
      .post('/api/gcc/drafting/generate')
      .send({ prompt: 'Summarise the safety data', promptType: 'safety_analysis', options: { prioritizeTables: false } });

    expect(res.status).toBe(200);
    const [req] = S.chat.mock.calls[0];
    expect(req.taskType).toBe('document_drafting');
    expect(req.model).toBeUndefined();
    expect(res.body.metadata.model).toBe('claude-opus-5');
    await vi.waitFor(() => expect(S.queries.some(q => /INSERT INTO vault\.drafting_sessions/.test(q.sql))).toBe(true));
    const audit = S.queries.find(q => /INSERT INTO vault\.drafting_sessions/.test(q.sql))!;
    expect(audit.params).toContain('claude-opus-5');
    expect(audit.params).not.toContain('gpt-4o');
  });
});
