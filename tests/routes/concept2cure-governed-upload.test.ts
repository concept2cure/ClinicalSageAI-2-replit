import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockResolveGovernedContext, mockDbSelectLimit, mockDbInsert, mockDbUpdate } = vi.hoisted(
  () => ({
    mockResolveGovernedContext: vi.fn(),
    mockDbSelectLimit: vi.fn(),
    mockDbInsert: vi.fn(),
    mockDbUpdate: vi.fn(),
  })
);

vi.mock('../../server/services/concept2cure/governedDocumentContractService', () => ({
  resolveGovernedContext: mockResolveGovernedContext,
}));

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockDbSelectLimit,
        })),
      })),
    })),
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
  requireOrganizationContext: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

import concept2cureRouter from '../../server/routes/c2c/knowledge-sources';

function getRouteHandler(path: string, method: 'post' | 'put' | 'get' = 'post') {
  const layer = concept2cureRouter.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('Concept2Cure knowledge upload governance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelectLimit.mockResolvedValue([
      {
        id: 1,
        organizationId: 1,
        settings: {},
      },
    ]);
    mockDbInsert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    });
  });

  it('fails closed with GOVERNED_CONTRACT_INVALID when upload artifact contract is invalid', async () => {
    mockResolveGovernedContext.mockReturnValue({
      validation: {
        valid: false,
        errors: ['missing clientTrack'],
        warnings: ['persona defaulted to regulatory'],
      },
      resolved: {
        clientTrack: null,
      },
    });

    const req = createMockRequest({
      body: {
        projectId: 'proj_1',
      },
    }) as any;
    req.userId = 42;
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };
    req.file = {
      originalname: 'evidence.txt',
      mimetype: 'text/plain',
      size: 256,
      buffer: Buffer.from('sample evidence'),
    };
    const res = createMockResponse();

    const handler = getRouteHandler('/documents/upload', 'post');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'GOVERNED_CONTRACT_INVALID',
          details: expect.objectContaining({
            errors: expect.arrayContaining(['missing clientTrack']),
          }),
        }),
      })
    );
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
