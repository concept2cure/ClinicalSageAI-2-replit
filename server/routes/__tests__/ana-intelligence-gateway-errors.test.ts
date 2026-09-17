/**
 * /api/claude/* — a gateway refusal is answered as what it is, not as a crash.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Every handler on this router caught every error with
 * `serverError(res, logger, 'saving batch', error)`: HTTP 500, code
 * INTERNAL_ERROR, "Something went wrong while saving batch." A request the
 * gateway refused because no model can hold it, a provider rate limit and a
 * genuine fault were indistinguishable to the client — and the copy said
 * "saving" on routes that draft. The author of a section too large to revise
 * was told the server had a problem, and given a support reference for it.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • a gateway context-window refusal → 413, code TOKEN_LIMIT_EXCEEDED, and the
 *     gateway's own actionable sentence (size, ceiling, how much to cut);
 *   • a fault of ours → still 500 INTERNAL_ERROR with the internals withheld;
 *   • a batch with one failed section → 200, that section's result carries the
 *     code and message, and the summary counts it rather than dividing by it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { GatewayContextWindowError, fitsContextWindow } from '../../services/ai-gateway/context-budget';

const svc = {
  draftDocument: vi.fn(),
  batchDraft: vi.fn(),
  reviewCompliance: vi.fn(),
  analyzeGaps: vi.fn(),
  analyzeImage: vi.fn(),
  quickComplete: vi.fn(),
};
vi.mock('../../services/ana/AnaDocumentDraftingService', () => ({
  getAnaDraftingService: () => svc,
}));

import router from '../ana-intelligence';

function app() {
  const a = express();
  a.use(express.json({ limit: '4mb' }));
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { organizationId: number; userId: number }).organizationId = 7;
    (req as unknown as { organizationId: number; userId: number }).userId = 1;
    next();
  });
  a.use('/api/claude', router);
  return a;
}

function tooLargeForEveryModel(): GatewayContextWindowError {
  const fit = fitsContextWindow(
    { taskType: 'document_drafting', messages: [{ role: 'user', content: 'x'.repeat(1_200_000) }] },
    {
      id: 'claude-opus-4', provider: 'anthropic', model: 'claude-opus-4-8', contextWindow: 200_000,
      qualityScore: 99, costPer1kInput: 0, costPer1kOutput: 0, capabilities: ['document_drafting'], enabled: true,
    },
  );
  return new GatewayContextWindowError([fit]);
}

const draftBody = { framework: 'ich_clinical', sectionType: '§12.2 Adverse Events', instructions: 'Draft it.' };

beforeEach(() => {
  for (const fn of Object.values(svc)) fn.mockReset();
});

describe('POST /api/claude/draft', () => {
  it('answers a context-window refusal with 413 TOKEN_LIMIT_EXCEEDED and the actionable sentence', async () => {
    svc.draftDocument.mockRejectedValueOnce(tooLargeForEveryModel());
    const res = await request(app()).post('/api/claude/draft').send(draftBody);
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('TOKEN_LIMIT_EXCEEDED');
    expect(res.body.message).toMatch(/tokens/);
    expect(res.body.message).toMatch(/Reduce the input/);
  });

  it('still answers a fault of ours with 500 INTERNAL_ERROR and withholds the internals', async () => {
    svc.draftDocument.mockRejectedValueOnce(new Error('relation "prompt_versions" does not exist'));
    const res = await request(app()).post('/api/claude/draft').send(draftBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/relation|does not exist/);
  });
});

describe('POST /api/claude/batch', () => {
  it('returns 200 with the failed section marked and the summary counting it', async () => {
    svc.batchDraft.mockResolvedValueOnce([
      {
        content: '<p>ok</p>', model: 'claude-opus-4-7',
        usage: { inputTokens: 10, outputTokens: 20, estimatedCostUsd: 0.001 }, latencyMs: 5,
      },
      {
        error: 'TOKEN_LIMIT_EXCEEDED',
        message: 'The request is about 240,000 tokens. Reduce the input by about 40,000 tokens.',
        sectionType: '§12.2 Adverse Events',
      },
    ]);
    const res = await request(app())
      .post('/api/claude/batch')
      .send({ requests: [draftBody, { ...draftBody, sectionType: '§12.1' }] });

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(2);
    expect(res.body.data.results[0].content).toBe('<p>ok</p>');
    expect(res.body.data.results[1].error).toBe('TOKEN_LIMIT_EXCEEDED');
    expect(res.body.data.results[1].message).toMatch(/Reduce the input/);
    expect(res.body.data.summary.total).toBe(2);
    expect(res.body.data.summary.failed).toBe(1);
    expect(res.body.data.summary.totalInputTokens).toBe(10);
  });

  it('answers a whole-batch gateway refusal with 413, not 500', async () => {
    svc.batchDraft.mockRejectedValueOnce(tooLargeForEveryModel());
    const res = await request(app()).post('/api/claude/batch').send({ requests: [draftBody] });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('TOKEN_LIMIT_EXCEEDED');
  });
});
