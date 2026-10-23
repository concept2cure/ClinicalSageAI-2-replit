import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockResolveGovernedContext, mockDbSelectLimit, mockDbInsert, mockDbUpdate, mockPoolQuery } = vi.hoisted(
  () => ({
    mockPoolQuery: vi.fn(),
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
    query: mockPoolQuery,
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
// Isolate this downstream governed-contract refusal. Mounted real-PGlite
// regressions qualify current project membership/edit admission separately.
vi.mock('../../server/routes/c2c/project-access', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/routes/c2c/project-access')>(),
  requireProjectAdmission: vi.fn(async()=>({id:1,organizationId:1,settings:{}})),
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
    /* The upload reads the organization's industry profile when the body states
       no clientTrack (2026-10-22). No profile row is recorded here. */
    mockPoolQuery.mockResolvedValue({ rows: [] });
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

    /* The track is stated, so the contract is evaluated once, under it. */
    const req = createMockRequest({
      body: {
        projectId: 'proj_1',
        clientTrack: 'biotech',
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
    expect(mockResolveGovernedContext).toHaveBeenCalledTimes(1);
    expect(mockResolveGovernedContext).toHaveBeenCalledWith(expect.objectContaining({ clientTrack: 'biotech' }));
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  /* A file whose text could not be read was stored as a placeholder:
     "[application/pdf document X]" became the governed source_document's
     content, hash and version row, an embedded retrieval atom, and a
     knowledge entry marked 'processed' (2026-10-15). */
  // Both pass the type, name and signature checks; neither yields text.
  it.each([
    ['a PDF whose text cannot be read', { originalname: 'Protocol.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj\nnot a document\n%%EOF\n', 'latin1') }],
    ['a text file with no text in it', { originalname: 'blank.txt', mimetype: 'text/plain', buffer: Buffer.from('   \n\t  \n') }],
  ])('refuses %s with TEXT_NOT_EXTRACTED and stores nothing', async (_case, file) => {
    mockResolveGovernedContext.mockReturnValue({
      validation: { valid: true, errors: [], warnings: [] },
      resolved: {},
      contract: { exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'exploratory' } },
    });
    const req = createMockRequest({ body: { projectId: 'proj_1' } }) as any;
    req.userId = 42;
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };
    req.file = { ...file, size: file.buffer.length };
    const res = createMockResponse();

    await getRouteHandler('/documents/upload', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'TEXT_NOT_EXTRACTED' }) }),
    );
    expect(mockResolveGovernedContext).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
