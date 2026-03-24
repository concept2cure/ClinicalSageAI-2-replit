import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const mockGenerateDocxBuffer = vi.fn(async () => Buffer.from('docx-bytes'));
const mockGeneratePptxBuffer = vi.fn(async () => Buffer.from('pptx-bytes'));

vi.mock('../../server/services/docxGenerator', () => ({
  generateDocxBuffer: mockGenerateDocxBuffer,
}));

vi.mock('../../server/services/pptxGenerator', () => ({
  generatePptxBuffer: mockGeneratePptxBuffer,
}));

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })) })),
  },
  pool: { query: vi.fn() },
}));

vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../server/auth', () => ({ authMiddleware: (_req: any, _res: any, next: any) => next() }));
vi.mock('../../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
  requireOrganizationContext: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

import concept2cureRouter from '../../server/routes/concept2cure';

function getRouteHandler(path: string, method: 'post' | 'get' = 'post') {
  const layer = concept2cureRouter.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('Concept2Cure export governance gates', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalReviewGate = process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalReviewGate === undefined) {
      delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
    } else {
      process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = originalReviewGate;
    }
  });

  it('blocks DOCX export when strict review gate is enabled and approval is missing', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({
      body: {
        title: 'Regulatory Memo',
        content: 'Draft content',
      },
    }) as any;
    const res = createMockResponse();

    const handler = getRouteHandler('/artifacts/export-docx', 'post');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'HUMAN_REVIEW_REQUIRED' }),
      })
    );
    expect(mockGenerateDocxBuffer).not.toHaveBeenCalled();
  });

  it('allows DOCX export in non-strict mode and injects governance headers + review notice', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';

    const req = createMockRequest({
      body: {
        title: 'Regulatory Memo',
        content: 'Draft content',
      },
    }) as any;
    const res = createMockResponse();

    const handler = getRouteHandler('/artifacts/export-docx', 'post');
    await handler(req, res);

    expect(mockGenerateDocxBuffer).toHaveBeenCalledTimes(1);
    const [, mergedContent] = mockGenerateDocxBuffer.mock.calls[0];
    expect(mergedContent).toContain('REGULATORY SAFETY NOTICE');

    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-AI-Generated', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Human-Review-Approved', 'false');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Review-Required', 'true');
    expect(res.send).toHaveBeenCalled();
  });

  it('allows PPTX export in strict mode when approved and includes reviewer headers', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({
      body: {
        title: 'Briefing Deck',
        content: 'Slide 1\n---\nSlide 2',
        governance: {
          aiGenerated: true,
          humanReviewApproved: true,
          reviewerName: 'Dr. Jane Doe',
          reviewerRole: 'Regulatory Affairs Lead',
          reviewTimestamp: '2026-03-24T12:00:00.000Z',
        },
      },
    }) as any;
    const res = createMockResponse();

    const handler = getRouteHandler('/artifacts/export-pptx', 'post');
    await handler(req, res);

    expect(mockGeneratePptxBuffer).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Reviewer', 'Dr.%20Jane%20Doe');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Review-Timestamp', '2026-03-24T12:00:00.000Z');
    expect(res.send).toHaveBeenCalled();
  });
});
