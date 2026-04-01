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
    settings: Symbol('settings'),
    updatedAt: Symbol('updatedAt'),
    name: Symbol('name'),
    email: Symbol('email'),
    userId: Symbol('userId'),
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

describe('Concept2Cure project collaborator routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.update.mockImplementation(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 1, updatedAt: new Date() }]),
        })),
      })),
    }));
  });

  it('returns collaborators from project ownership settings', async () => {
    configureSelectSequence([
      [
        {
          id: 1,
          organizationId: 1,
          settings: {
            ownership: {
              ownershipTeam: [
                { userId: 10, permission: 'can_edit' },
                { userId: 11, permission: 'can_use' },
              ],
            },
          },
        },
      ],
      [
        { userId: 10, name: 'Ada Lovelace', email: 'ada@example.com' },
        { userId: 11, name: 'Grace Hopper', email: 'grace@example.com' },
      ],
    ]);

    const req = createMockRequest({
      params: { projectId: 'proj_1' },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = concept2cureRouter.stack.find(
      (l: any) => l.route?.path === '/projects/:projectId/collaborators' && l.route?.methods?.get
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    await handler(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        projectId: 'proj_1',
        collaborators: expect.arrayContaining([
          expect.objectContaining({ userId: 10, permission: 'can_edit' }),
          expect.objectContaining({ userId: 11, permission: 'can_use' }),
        ]),
      }),
    });
  });

  it('rejects collaborator IDs outside tenant membership on update', async () => {
    configureSelectSequence([
      [
        {
          id: 1,
          organizationId: 1,
          settings: { ownership: { ownershipTeam: [] } },
        },
      ],
      [{ userId: 10 }], // userId 999 is invalid
    ]);

    const req = createMockRequest({
      params: { projectId: 'proj_1' },
      body: {
        collaborators: [
          { userId: 10, permission: 'can_edit' },
          { userId: 999, permission: 'can_use' },
        ],
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = concept2cureRouter.stack.find(
      (l: any) => l.route?.path === '/projects/:projectId/collaborators' && l.route?.methods?.put
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    await handler(req, res);

    expectStatus(res, 400);
    expectJson(res, {
      success: false,
      error: expect.objectContaining({
        message: expect.stringContaining('Collaborator user IDs not in organization'),
      }),
    });
  });
});
