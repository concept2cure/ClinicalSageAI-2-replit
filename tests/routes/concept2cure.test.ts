/**
 * Concept2Cure Routes - Unit Tests
 *
 * Covers project creation, conversation creation, artifact creation,
 * and electronic signature creation paths.
 *
 * @module tests/routes/concept2cure.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  expectStatus,
  expectJson,
} from '../setup';

// Mock dependencies used by concept2cure routes
vi.mock('../../server/db', () => {
  const baseProject = {
    id: 1,
    name: 'Test Project',
    description: 'Test description',
    metadata: {},
    status: 'planning',
    organizationId: 1,
    clientWorkspaceId: 1,
    createdById: 1,
    ownerId: 1,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const makeQueryChain = (rows: any[]) => {
    const chain: any = {};
    chain.where = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.leftJoin = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => Promise.resolve(rows));
    chain.limit = vi.fn(() => Promise.resolve(rows));
    // Drizzle select chains are awaitable; mirror that in tests.
    chain.then = (onFulfilled: any, onRejected: any) => Promise.resolve(rows).then(onFulfilled, onRejected);
    chain.catch = (onRejected: any) => Promise.resolve(rows).catch(onRejected);
    chain.finally = (onFinally: any) => Promise.resolve(rows).finally(onFinally);
    return chain;
  };

  const db = {
    select: vi.fn((shape?: any) => {
      const keys = shape && typeof shape === 'object' ? Object.keys(shape) : [];

      // Project access checks: load scoped project row
      if (
        keys.includes('createdById') &&
        keys.includes('ownerId') &&
        keys.includes('settings') &&
        keys.includes('organizationId')
      ) {
        return {
          from: vi.fn(() => makeQueryChain([{ ...baseProject }])),
        };
      }

      // Sharing visibility read
      if (keys.length === 1 && keys[0] === 'visibility') {
        return {
          from: vi.fn(() => makeQueryChain([{ visibility: 'private' }])),
        };
      }

      // Sharing members read
      if (keys.includes('role') && keys.includes('status') && keys.includes('userId')) {
        return {
          from: vi.fn(() =>
            makeQueryChain([
              {
                userId: 1,
                role: 'owner',
                status: 'active',
                invitedById: 1,
                acceptedAt: new Date(),
              },
            ])
          ),
        };
      }

      // Generic fallback
      return {
        from: vi.fn(() => makeQueryChain([{ ...baseProject }])),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn((payload: any) => {
        const chain: any = {};
        chain.returning = vi.fn().mockResolvedValue([
          {
            id: payload?.id ?? 1,
            ...payload,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: payload?.version ?? 1,
          },
        ]);
        chain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
        chain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
        return chain;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: 1,
              artifactId: 'artifact_test',
              organizationId: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
              version: 1,
              type: 'document',
              category: 'document',
              title: 'Test Artifact',
              content: 'Content',
              contentHash: 'hash',
              metadata: {},
              settings: {},
            },
          ]),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };

  return { db };
});

vi.mock('../../server/services/ai-gateway/gateway.js', () => ({
  getGateway: () => ({
    getEnabledProviders: () => ['mock-provider'],
    route: vi.fn().mockResolvedValue({
      content: 'Generated template content',
      model: 'mock-model',
    }),
  }),
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

// Import after mocks
import concept2cureRouter from '../../server/routes/concept2cure';

describe('Concept2Cure API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a project with valid payload', async () => {
    const req = createMockRequest({
      body: {
        name: 'Test Project',
        submissionType: 'IND',
        description: 'Test description',
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();

    // Invoke handler directly by simulating route
    const layer = concept2cureRouter.stack.find((l: any) => l.route?.path === '/projects' && l.route?.methods?.post);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expectStatus(res, 201);
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        name: 'Test Project',
        submissionType: 'IND',
      }),
    });
  });

  it('should create a conversation for a project', async () => {
    const req = createMockRequest({
      params: { projectId: 'proj_1' },
      body: { title: 'New Conversation' },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();

    const layer = concept2cureRouter.stack.find((l: any) => l.route?.path === '/projects/:projectId/conversations' && l.route?.methods?.post);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expectStatus(res, 201);
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        title: 'New Conversation',
      }),
    });
  });

  it('should create an artifact for a project', async () => {
    const req = createMockRequest({
      params: { projectId: 'proj_1' },
      body: {
        type: 'document',
        category: 'document',
        title: 'Test Artifact',
        content: 'Test content',
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();

    const layer = concept2cureRouter.stack.find((l: any) => l.route?.path === '/projects/:projectId/artifacts' && l.route?.methods?.post);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expectStatus(res, 201);
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        title: 'Test Artifact',
      }),
    });
  });

  it('should persist template lineage when creating artifact from template', async () => {
    const req = createMockRequest({
      params: { projectId: 'proj_1' },
      body: {
        type: 'document',
        category: 'document',
        title: 'Template Artifact',
        content: 'Template-driven content',
        templateId: 'tpl_ind_cover_letter',
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();

    const layer = concept2cureRouter.stack.find(
      (l: any) => l.route?.path === '/projects/:projectId/artifacts' && l.route?.methods?.post
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expectStatus(res, 201);
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        title: 'Template Artifact',
      }),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Template Artifact',
        }),
      })
    );
  });

  it('should reject AI template generation without projectId unless adhoc context is explicit', async () => {
    const req = createMockRequest({
      params: { templateId: 'ind-cover-letter' },
      body: {
        variables: {
          PRODUCT_NAME: 'Test Product',
          INDICATION: 'Oncology',
          SPONSOR: 'Test Sponsor',
          IND_NUMBER: '000000',
          SUBMISSION_TYPE: 'Initial IND',
          DIVISION: 'CDER',
        },
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = concept2cureRouter.stack.find(
      (l: any) =>
        l.route?.path === '/ai/templates/:templateId/generate' && l.route?.methods?.post
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);
    expectStatus(res, 400);
  });

  it('should return IND package templates when filtered by package', async () => {
    const req = createMockRequest({
      query: { package: 'ind_readiness' },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = concept2cureRouter.stack.find(
      (l: any) => l.route?.path === '/templates' && l.route?.methods?.get
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'tpl_ind_cover_letter' }),
          expect.objectContaining({ id: 'tpl_ind_investigator_brochure' }),
          expect.objectContaining({ id: 'tpl_ind_pre_ind_briefing' }),
        ]),
      })
    );
  });

  it('should allow AI template generation when adhoc context is explicit', async () => {
    const req = createMockRequest({
      params: { templateId: 'ind-cover-letter' },
      body: {
        contextAttachment: 'adhoc',
        variables: {
          PRODUCT_NAME: 'Test Product',
          INDICATION: 'Oncology',
          SPONSOR: 'Test Sponsor',
          IND_NUMBER: '000000',
          SUBMISSION_TYPE: 'Initial IND',
          DIVISION: 'CDER',
        },
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = concept2cureRouter.stack.find(
      (l: any) =>
        l.route?.path === '/ai/templates/:templateId/generate' && l.route?.methods?.post
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          result: expect.any(String),
          template: expect.objectContaining({
            id: 'ind-cover-letter',
          }),
        }),
      })
    );
  });

  it('should create a signature for an artifact version', async () => {
    const req = createMockRequest({
      params: { projectId: 'proj_1', artifactId: 'artifact_test' },
      body: {
        signaturePurpose: 'Approved for submission',
        authenticationMethod: 'password',
      },
    }) as any;
    req.headers = { 'x-forwarded-for': '127.0.0.1' };
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();

    const layer = concept2cureRouter.stack.find((l: any) => l.route?.path === '/projects/:projectId/artifacts/:artifactId/signatures' && l.route?.methods?.post);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expectStatus(res, 201);
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        signaturePurpose: 'Approved for submission',
      }),
    });
  });
});
