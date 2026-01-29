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
vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue([]),
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            artifactId: 'artifact_test',
            organizationId: 1,
            version: 1,
            contentHash: 'hash',
            title: 'Test Artifact',
            content: 'Content',
            type: 'document',
            category: 'document',
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          }]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((payload: any) => ({
        returning: vi.fn().mockResolvedValue([
          {
            id: payload?.id ?? 1,
            ...payload,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: payload?.version ?? 1,
          },
        ]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{
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
          }]),
        })),
      })),
    })),
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
      name: 'Test Project',
      submissionType: 'IND',
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
      title: 'New Conversation',
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
      title: 'Test Artifact',
    });
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
      signaturePurpose: 'Approved for submission',
    });
  });
});
