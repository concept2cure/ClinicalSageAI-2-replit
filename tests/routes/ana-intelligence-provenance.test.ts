/**
 * Model-governance provenance on the regulated-drafting surfaces
 * (decision register #727 item 8): every successful generation writes an
 * append-only audit row recording the pinned model and a sha256 of the
 * output, so a saved document can be traced back to its model version.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'test-secret-padded-to-32-chars-or-more-okay!!';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import express from 'express';
import request from 'supertest';

const logActionSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('../../server/services/auditService', () => ({
  default: { logAction: (...args: unknown[]) => logActionSpy(...args) },
}));

const draftResult = {
  content: 'Drafted section content',
  model: 'claude-opus-4-7',
  usage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.01 },
  cacheHit: false,
  latencyMs: 1200,
};
vi.mock('../../server/services/ana/AnaDocumentDraftingService', () => ({
  getAnaDraftingService: () => ({
    draftDocument: vi.fn().mockResolvedValue(draftResult),
  }),
}));
vi.mock('../../server/services/ai-gateway/gateway', () => ({
  getGateway: () => ({}),
}));

import anaIntelligenceRouter from '../../server/routes/ana-intelligence';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).organizationId = 42;
    (req as any).userId = 7;
    next();
  });
  app.use('/api/claude', anaIntelligenceRouter);
  return app;
}

describe('POST /api/claude/draft — model provenance', () => {
  beforeEach(() => logActionSpy.mockClear());

  it('records an audit row with the model and a sha256 of the content', async () => {
    const res = await request(makeApp())
      .post('/api/claude/draft')
      .send({ framework: 'FDA_510K', sectionType: 'device-description', instructions: 'draft it' });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(logActionSpy).toHaveBeenCalledTimes(1));

    const entry = logActionSpy.mock.calls[0][0] as any;
    expect(entry.action).toBe('ai_generation');
    expect(entry.tenantId).toBe(42);
    expect(entry.userId).toBe(7);
    expect(entry.resourceType).toBe('ai_drafting_surface');
    expect(entry.resourceId).toBe('draft');
    expect(entry.details.model).toBe('claude-opus-4-7');
    expect(entry.details.contentSha256).toBe(
      createHash('sha256').update(draftResult.content).digest('hex')
    );
  });

  it('does not fail the request when provenance recording throws', async () => {
    logActionSpy.mockRejectedValueOnce(new Error('audit db down'));
    const res = await request(makeApp())
      .post('/api/claude/draft')
      .send({ framework: 'FDA_510K', sectionType: 'x', instructions: 'y' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
