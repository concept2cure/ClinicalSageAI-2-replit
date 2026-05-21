import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const {
  mockResolveGovernedContext,
  mockEvaluateTransition,
  mockCheckAuthority,
  mockFindFirst,
  mockUpdateWhere,
  mockUpdateSet,
  mockDbUpdate,
  mockSelectLimit,
  mockSelectWhere,
  mockSelectFrom,
  mockDbSelect,
} = vi.hoisted(() => {
  const localMockUpdateWhere = vi.fn();
  const localMockUpdateSet = vi.fn(() => ({ where: localMockUpdateWhere }));
  const localMockSelectLimit = vi.fn();
  const localMockSelectWhere = vi.fn(() => ({ limit: localMockSelectLimit }));
  const localMockSelectFrom = vi.fn(() => ({ where: localMockSelectWhere }));
  return {
    mockResolveGovernedContext: vi.fn(),
    mockEvaluateTransition: vi.fn(),
    mockCheckAuthority: vi.fn(),
    mockFindFirst: vi.fn(),
    mockUpdateWhere: localMockUpdateWhere,
    mockUpdateSet: localMockUpdateSet,
    mockDbUpdate: vi.fn(() => ({ set: localMockUpdateSet })),
    mockSelectLimit: localMockSelectLimit,
    mockSelectWhere: localMockSelectWhere,
    mockSelectFrom: localMockSelectFrom,
    mockDbSelect: vi.fn(() => ({ from: localMockSelectFrom })),
  };
});

vi.mock('../../server/services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: mockResolveGovernedContext,
}));

vi.mock('../../server/services/governance-boundary-service.js', () => ({
  GovernanceBoundaryService: {
    getInstance: () => ({
      evaluateTransition: mockEvaluateTransition,
    }),
  },
}));

vi.mock('../../server/services/decision-lifecycle-service.js', () => ({
  decisionLifecycleService: {
    checkAuthority: mockCheckAuthority,
    recordGovernedActionDecision: vi.fn(() => null),
    transitionDecision: vi.fn(),
    createReceipt: vi.fn(() => null),
  },
}));

vi.mock('../../server/db.js', () => ({
  db: {
    query: {
      concept2cureArtifacts: {
        findFirst: mockFindFirst,
      },
    },
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('../../shared/schema/index.js', () => ({
  concept2cureArtifacts: {
    id: 'id',
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (..._args: any[]) => ({}),
    and: (..._args: any[]) => ({}),
  };
});

import authoringActionsRouter from '../../server/routes/authoring-actions';

function getRouteHandler(path: string) {
  const layer = authoringActionsRouter.stack.find((l: any) => l.route?.path === path && l.route?.methods?.post);
  if (!layer) throw new Error(`Missing route POST ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('authoring-actions governed validation envelopes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluateTransition.mockResolvedValue({
      allowed: true,
      blockedReasons: [],
      transition: null,
    });
    mockCheckAuthority.mockReturnValue({ allowed: true, authority: {} });
    mockFindFirst.mockResolvedValue({
      id: 11,
      artifactId: 'artifact-11',
      status: 'draft',
      type: 'regulatory_document',
      title: 'Draft',
      content: 'content',
      ctdSection: null,
      metadata: {},
      version: 1,
    });
    mockSelectLimit.mockResolvedValue([
      {
        id: 11,
        artifactId: 'artifact-11',
        status: 'review',
        type: 'regulatory_document',
        title: 'Draft',
        content: 'content',
        ctdSection: null,
        metadata: {},
        version: 1,
      },
    ]);
    mockUpdateWhere.mockResolvedValue([]);
  });

  it('returns 400 GOVERNED_CONTRACT_INVALID on promote-to-review when governed validation fails', async () => {
    mockResolveGovernedContext.mockReturnValue({
      validation: {
        valid: false,
        errors: ['module3_output requires ctdSection 3.x'],
        warnings: ['warn'],
      },
      resolved: { resolverVersion: 'test' },
    });

    const req = createMockRequest({
      body: { projectId: 1, artifactId: 11 },
    }) as any;
    req.tenantId = 1;
    const res = createMockResponse();

    const handler = getRouteHandler('/promote-to-review');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'GOVERNED_CONTRACT_INVALID',
        }),
      })
    );
  });
});
