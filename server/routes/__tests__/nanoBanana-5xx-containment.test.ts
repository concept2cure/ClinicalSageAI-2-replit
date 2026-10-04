/**
 * Nano Banana image routes — a 500 carries the envelope, never the thrower's
 * text (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * generate / edit / presentation / chat answered `{ success: false, error:
 * err.message }`. The service throws the provider SDK's own error text and its
 * configuration errors (the name of the API-key variable among them).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-PROVIDER-DETAIL GOOGLE_GEMINI_API_KEY is required';

const { svc, logError } = vi.hoisted(() => ({
  svc: {
    generateImage: vi.fn(),
    generatePresentation: vi.fn(),
    chatWithNanoBanana: vi.fn(),
    isConfigured: vi.fn(() => false),
  },
  logError: vi.fn(),
}));

vi.mock('../../services/nanoBananaService', () => svc);
vi.mock('../../middleware/nanoBananaGuard', () => ({
  nanoBananaRateLimit: (_req: any, _res: any, next: any) => next(),
  nanoBananaCache: (_req: any, _res: any, next: any) => next(),
  getUsageStats: () => ({}),
}));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import router from '../nanoBanana';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-nano');
    next();
  });
  a.use('/api/nano-banana', router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('SENTINEL-PROVIDER-DETAIL');
  expect(JSON.stringify(res.body)).not.toContain('GOOGLE_GEMINI_API_KEY');
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-nano');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('nano-banana 500s: envelope out, detail to the log', () => {
  it('POST /generate', async () => {
    svc.generateImage.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).post('/api/nano-banana/generate').send({ prompt: 'a cell' }));
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-PROVIDER-DETAIL');
  });

  it('POST /edit', async () => {
    svc.generateImage.mockRejectedValue(new Error(SENTINEL));
    expectContained(
      await request(app()).post('/api/nano-banana/edit').send({ prompt: 'brighter', referenceImage: 'AAAA' }),
    );
  });

  it('POST /presentation', async () => {
    svc.generatePresentation.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).post('/api/nano-banana/presentation').send({ topic: 'CMC' }));
  });

  it('POST /chat', async () => {
    svc.chatWithNanoBanana.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).post('/api/nano-banana/chat').send({ message: 'hello' }));
  });

  it('leaves the 400 answers unchanged', async () => {
    const res = await request(app()).post('/api/nano-banana/generate').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'prompt is required' });
  });
});
