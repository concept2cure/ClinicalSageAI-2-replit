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
    (req as unknown as { user: unknown }).user = { id: 1, organizationId: 7 };
    (req as unknown as { dbClient: unknown }).dbClient = { query: vi.fn(async () => ({ rows: [] })) };
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
      thinkingMode: 'adaptive', supportsSamplingParams: false,
    },
  );
  return new GatewayContextWindowError([fit]);
}

const draftBody = { framework: 'ich_clinical', sectionType: '§12.2 Adverse Events', instructions: 'Draft it.' };

beforeEach(() => {
  for (const fn of Object.values(svc)) fn.mockReset();
});

describe('POST /api/claude/draft', () => {
  it('forwards an approved derivative reference with canonical identity and the existing project admission context', async () => {
    svc.draftDocument.mockRejectedValueOnce(tooLargeForEveryModel());
    const derivativeId = '40000000-0000-4000-8000-000000000001';
    const res = await request(app()).post('/api/claude/draft').send({ derivativeId, projectId: 42, organizationId: 99, userId: 999 });
    expect(res.status).toBe(413);
    expect(svc.draftDocument).toHaveBeenCalledWith(expect.objectContaining({ derivativeId, projectId: 42, organizationId: 7, userId: 1, instructions: '' }));
  });

  it.each([null, '', true, '../map'])('refuses an invalid explicit derivative reference %s instead of using ordinary drafting', async derivativeId => {
    const res = await request(app()).post('/api/claude/draft').send({ ...draftBody, derivativeId });
    expect(res.status).toBe(400);
    expect(svc.draftDocument).not.toHaveBeenCalled();
  });

  it.each([{ derivativeId: '40000000-0000-4000-8000-000000000001' }, { qualifiedModelPin: { id: 'requested-qualified-model' } }])('refuses protected drafting on the streaming endpoint before SSE headers', async protectedRequest => {
    const res = await request(app()).post('/api/claude/draft/stream').send({ ...draftBody, ...protectedRequest });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBe('NONSTREAMING_REQUIRED');
    expect(svc.draftDocument).not.toHaveBeenCalled();
  });
  it('forwards a qualified pin on the existing nonstreaming drafting endpoint', async () => {
    svc.draftDocument.mockRejectedValueOnce(tooLargeForEveryModel());
    const qualifiedModelPin = { id: 'controlled-model', provider: 'local', pinnedVersion: `sha256:${'a'.repeat(64)}`,
      intendedUse: 'document_drafting', pqReference: 'docs/evidence/PQ/review.json', pqSha256: 'b'.repeat(64) };
    await request(app()).post('/api/claude/draft').send({ ...draftBody, qualifiedModelPin });
    expect(svc.draftDocument).toHaveBeenCalledWith(expect.objectContaining({ qualifiedModelPin }));
  });
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
