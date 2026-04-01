import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse, expectStatus, expectJson } from '../setup';

const { mockDb, schemaTableStub } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  schemaTableStub: {
    id: Symbol('id'),
    organizationId: Symbol('organizationId'),
    projectId: Symbol('projectId'),
    conversationId: Symbol('conversationId'),
    status: Symbol('status'),
    title: Symbol('title'),
    updatedAt: Symbol('updatedAt'),
    settings: Symbol('settings'),
  },
}));

vi.mock('../../server/db', () => ({
  db: mockDb,
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../shared/schema', () => ({
  regulatoryAuditLogs: schemaTableStub,
  projects: schemaTableStub,
  users: schemaTableStub,
  organizationUsers: schemaTableStub,
  concept2cureConversations: schemaTableStub,
  concept2cureMessages: schemaTableStub,
  concept2cureArtifacts: schemaTableStub,
  concept2cureArtifactVersions: schemaTableStub,
  concept2cureSignatures: schemaTableStub,
  projectTasks: schemaTableStub,
  projectWorkflowStages: schemaTableStub,
  projectMilestones: schemaTableStub,
  concept2cureProvenanceEvents: schemaTableStub,
  concept2cureReviewComments: schemaTableStub,
  concept2cureReviewAssignments: schemaTableStub,
  concept2cureReviewDecisions: schemaTableStub,
  concept2cureSubmissionSnapshots: schemaTableStub,
  concept2cureReviewThreads: schemaTableStub,
  concept2cureThreadComments: schemaTableStub,
  concept2cureReviewTasks: schemaTableStub,
  projectActivities: schemaTableStub,
  c2cProjectWorkItems: schemaTableStub,
  concept2cureNotifications: schemaTableStub,
  conversationWorkingMemory: schemaTableStub,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ __op: 'eq' })),
  ne: vi.fn(() => ({ __op: 'ne' })),
  desc: vi.fn(() => ({ __op: 'desc' })),
  and: vi.fn(() => ({ __op: 'and' })),
  isNull: vi.fn(() => ({ __op: 'isNull' })),
  inArray: vi.fn(() => ({ __op: 'inArray' })),
  or: vi.fn(() => ({ __op: 'or' })),
  sql: vi.fn(() => ({ __op: 'sql' })),
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

import concept2cureRouter from '../../server/routes/concept2cure';

function configureSelectSequence(resolvedValues: any[]) {
  let callIndex = 0;
  const nextValue = () => resolvedValues[callIndex++] ?? [];
  const whereResult = (value: any) => {
    const promise = Promise.resolve(value);
    return {
      limit: vi.fn(() => Promise.resolve(value)),
      orderBy: vi.fn(() => Promise.resolve(value)),
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    };
  };
  mockDb.select.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => whereResult(nextValue())),
    })),
  }));
}

describe('Concept2Cure conversation routes enforce project scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.update.mockImplementation(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: 200,
              conversationId: 'conv_2',
              title: 'Updated',
              updatedAt: new Date(),
            },
          ]),
        })),
      })),
    }));
  });

  it('rejects rename when conversation does not belong to URL project', async () => {
    configureSelectSequence([
      [{ id: 1 }], // verifyProjectAccess project exists
      [], // scoped conversation lookup misses because it is in another project
    ]);

    const req = createMockRequest({
      params: { projectId: 'proj_1', conversationId: 'conv_2' },
      body: { title: 'Renamed thread' },
      headers: {
        'x-organization-id': '1',
        'x-client-workspace-id': '1',
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = concept2cureRouter.stack.find(
      (l: any) =>
        l.route?.path === '/projects/:projectId/conversations/:conversationId' &&
        l.route?.methods?.patch
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    await handler(req, res);

    expectStatus(res, 404);
    expectJson(res, {
      success: false,
      error: expect.objectContaining({
        message: 'Conversation not found',
      }),
    });
  });

  it('rejects archive when conversation does not belong to URL project', async () => {
    configureSelectSequence([
      [{ id: 1 }], // verifyProjectAccess project exists
      [], // scoped conversation lookup misses because it is in another project
    ]);

    const req = createMockRequest({
      params: { projectId: 'proj_1', conversationId: 'conv_2' },
      headers: {
        'x-organization-id': '1',
        'x-client-workspace-id': '1',
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = concept2cureRouter.stack.find(
      (l: any) =>
        l.route?.path === '/projects/:projectId/conversations/:conversationId' &&
        l.route?.methods?.delete
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    await handler(req, res);

    expectStatus(res, 404);
    expectJson(res, {
      success: false,
      error: expect.objectContaining({
        message: 'Conversation not found',
      }),
    });
  });
});
