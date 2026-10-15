/**
 * Platform AI-provider routes — a 500 carries the envelope, never the
 * thrower's text (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * GET /ai-providers and PUT /ai-providers/preference answered
 * `{ error: { code: 'INTERNAL', message: err.message } }`. The tenant provider
 * resolver reads and writes the tenant's settings row, so the message is driver
 * text in practice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL relation "tenant_ai_provider_preferences" does not exist';

const { resolver, logError } = vi.hoisted(() => ({
  resolver: { resolve: vi.fn(), setPreference: vi.fn() as any },
  logError: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../services/platform/platform-capabilities', () => ({ getPlatformCatalog: () => ({}) }));
vi.mock('../../services/ai-gateway/providers/provider-preference', () => ({
  getProviderCatalog: (d: unknown) => ({ providers: [], tenantDefault: d }),
  getTenantProviderResolver: () => resolver,
  isClientSelectableProvider: (p: string) => p === 'anthropic',
}));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import router from '../platform-capabilities.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-platcap');
    (req as any).user = { id: 3, organizationId: 7 };
    next();
  });
  a.use('/api/platform', router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('SENTINEL-DB-DETAIL');
  expect(JSON.stringify(res.body)).not.toMatch(/tenant_ai_provider_preferences|does not exist/);
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-platcap');
}

beforeEach(() => {
  vi.clearAllMocks();
  resolver.setPreference = vi.fn();
});

describe('platform AI-provider 500s: envelope out, detail to the log', () => {
  it('GET /ai-providers', async () => {
    resolver.resolve.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).get('/api/platform/ai-providers'));
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('PUT /ai-providers/preference', async () => {
    resolver.setPreference.mockRejectedValue(new Error(SENTINEL));
    expectContained(
      await request(app()).put('/api/platform/ai-providers/preference').send({ provider: 'anthropic' }),
    );
  });

  it('leaves the 400 and 501 answers unchanged', async () => {
    const bad = await request(app()).put('/api/platform/ai-providers/preference').send({ provider: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: { code: 'VALIDATION', message: 'A client-selectable provider is required.' } });
    resolver.setPreference = undefined;
    const ro = await request(app()).put('/api/platform/ai-providers/preference').send({ provider: 'anthropic' });
    expect(ro.status).toBe(501);
    expect(ro.body.error.code).toBe('NOT_IMPLEMENTED');
  });
});
