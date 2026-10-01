import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockResolveGovernedContext, mockPoolQuery } = vi.hoisted(() => ({
  mockResolveGovernedContext: vi.fn(),
  mockPoolQuery: vi.fn(),
}));

vi.mock('../../server/services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: mockResolveGovernedContext,
}));

vi.mock('../../server/db.js', () => {
  const poolStub = {
    query: mockPoolQuery,
  };
  return {
    pool: poolStub,
    getPool: () => poolStub,
  };
});

// Some services import the module with an explicit `.ts` extension
// (e.g. server/services/ana-ri/command-executor.ts); vitest treats that
// as a distinct path, so mock it separately with the same stubs.
vi.mock('../../server/db.ts', () => {
  const poolStub = {
    query: mockPoolQuery,
  };
  return {
    pool: poolStub,
    getPool: () => poolStub,
  };
});

vi.mock('../../server/services/chat-thread-helpers.js', () => ({
  getOrCreateThread: vi.fn(),
  getThreadMessages: vi.fn(),
  saveChatMessage: vi.fn(),
}));

vi.mock('../../server/services/ai-gateway/index.js', () => ({
  getGateway: vi.fn(() => ({})),
}));

vi.mock('../../server/services/enhancedEmbeddingService.js', () => ({
  getEmbeddingService: vi.fn(() => ({
    embedAtom: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../server/services/lumen-context-builder.js', () => ({
  getIntelligencePrefix: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../server/services/ana-guidance-executor.js', () => ({
  processResponseActions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/services/kernel-decision-record.js', () => ({
  logKernelDecision: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/services/kernel-router.js', () => ({
  planKernelExecution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/services/kernel-adaptive-policy.js', () => ({
  getKernelPolicyHint: vi.fn().mockResolvedValue(null),
  recordKernelPolicyOutcome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/services/intelligence/rim-interceptors.js', () => ({
  interceptChatResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../server/services/claude/ClaudeToolDefinitions.js', () => ({
  ALL_CLAUDE_TOOLS: [],
}));

vi.mock('../../server/services/claude/ClaudeToolExecutor.js', () => ({
  executeAgenticLoop: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../server/services/memory-context-assembler.js', () => ({
  buildMemoryContextForChat: vi.fn().mockResolvedValue(''),
}));

import chatRouter from '../../server/routes/chat';

function getPostHandler(path: string) {
  const layer = (chatRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.post
  );
  if (!layer) throw new Error(`Missing route POST ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('chat upload governance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 2026-10-01 (PF-03, 1ec8ea494): the upload first checks that the numeric
    // project is a projects row of the caller's organization, and answers 404
    // otherwise. Answer that ownership read for this test's own project (12,
    // org 5) only; every other query keeps the empty default.
    mockPoolQuery.mockImplementation(async (sql: unknown, params?: unknown[]) =>
      /FROM projects WHERE id::text = \$1 AND organization_id = \$2/.test(String(sql)) &&
      params?.[0] === '12' && Number(params?.[1]) === 5
        ? { rows: [{ present: 1 }] }
        : { rows: [] },
    );
    mockResolveGovernedContext.mockReturnValue({
      contract: {
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        documentClass: 'evidence_memo',
        readinessGate: 'internal_review',
        workspaceTarget: 'project',
        originSurface: 'import_pipeline',
        recommendationSource: 'report_engine',
        regulatorIntent: 'evidence_analysis',
        exportEligibility: {
          gateChecks: [],
          blockingReasons: [],
          readinessOutcome: 'ready',
        },
      },
      validation: { valid: true, errors: [], warnings: [] },
      resolved: {},
    });
  });

  it('returns GOVERNED_CONTRACT_INVALID when governed context fails', async () => {
    mockResolveGovernedContext.mockReturnValue({
      contract: {},
      validation: { valid: false, errors: ['missing clientTrack'], warnings: [] },
      resolved: { clientTrack: null },
    });

    const req = createMockRequest({
      body: {
        projectId: 'proj_12',
      },
    }) as any;
    req.user = { id: 9 };
    req.tenantId = 5;
    req.file = {
      originalname: 'source.txt',
      mimetype: 'text/plain',
      size: 100,
      buffer: Buffer.from('abc'),
    };
    const res = createMockResponse();

    const handler = getPostHandler('/upload');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'GOVERNED_CONTRACT_INVALID',
      })
    );
    const artifactInsertCall = mockPoolQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO concept2cure_artifacts')
    );
    expect(artifactInsertCall).toBeUndefined();
  });
});
