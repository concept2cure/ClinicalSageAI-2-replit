/**
 * POST /api/cortex/chat reports the project context it read: a recorded 0% as
 * 0, and a documents read that did not happen as unread (null), not 0.
 *
 * What the code used to do (until 2026-10-15): the response's `context` block
 * was built with `progress: context.project?.progress || null` — a recorded 0%
 * read null — and `documentsTotal` / `documentsCompleted` with `|| 0`, so a
 * documents read that failed (lumen-context-builder leaves `documents` null and
 * names it unread) was reported as a project with 0 documents.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ build: vi.fn() }));

vi.mock('../../db.js', () => {
  const pool = { query: async () => ({ rows: [] }) };
  return { pool, getPool: () => pool, db: {}, getDb: () => ({}) };
});
vi.mock('../../db', () => {
  const pool = { query: async () => ({ rows: [] }) };
  return { pool, getPool: () => pool, db: {}, getDb: () => ({}) };
});
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 11, organizationId: 3 };
    next();
  },
}));
vi.mock('../../services/ana-context-builder.js', () => ({ buildContextAwarePrompt: H.build }));
vi.mock('../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: async () => 'thread-1',
  getThreadMessages: async () => [],
  getWindowedMessages: async () => ({ messages: [], wasTruncated: false }),
  ThreadAccessError: class ThreadAccessError extends Error {},
  saveChatMessage: async () => undefined,
  deleteConversation: async () => undefined,
}));
vi.mock('../../services/ai-gateway/index.js', () => ({
  getGateway: () => ({
    getEnabledProviders: () => ['stub'],
    route: async () => ({
      content: 'An answer.',
      provider: 'stub',
      model: 'stub-1',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    }),
  }),
}));
vi.mock('../../services/ana-ri/orchestrator.js', () => ({
  orchestrate: () => ({
    systemPrompt: '',
    detectedIntent: { lens: 'general', confidence: 0.5 },
    detectedSubmissionType: null,
    activeWorkstream: { stream: 'general' },
    workstreamHandoff: null,
    suggestedActions: [],
    appliedRole: 'general',
    orchestrationMeta: {
      intentSource: 'stub',
      submissionTypeSource: 'stub',
      deficiencyContextInjected: false,
      documentActionContextInjected: false,
    },
  }),
  detectIntent: () => null,
  detectSubmissionType: () => null,
}));
vi.mock('../../services/kernel-router.js', () => ({
  planKernelExecution: () => ({ allowToolExecution: false, maxToolCalls: 0, maxToolChainDepth: 0 }),
}));
vi.mock('../../services/toolRegistry', () => ({
  getTool: () => undefined,
  toOpenAITools: () => [],
  fromOpenAIName: (n: string) => n,
  logToolRun: () => undefined,
}));
vi.mock('../../services/tools/index', () => ({}));
vi.mock('../../lib/unified-ai-client', () => ({ ai: {} }));
vi.mock('../../services/shared-memory-contract.js', () => ({
  parseSharedMemoryContract: () => ({}),
  renderSharedMemoryForPrompt: () => '',
}));
vi.mock('../../services/governed-ana-execution.js', () => ({ executeGovernedAnaOperation: vi.fn() }));
vi.mock('../../services/working-memory.js', () => ({
  summarizeAndStoreWorkingMemoryForThread: async () => undefined,
}));

let app: express.Express;

beforeAll(async () => {
  const router = (await import('../cortex-unified')).default;
  app = express();
  app.use(express.json());
  app.use('/api/cortex', router);
}, 60_000);

const project = (progress: number | null) => ({
  id: 7,
  name: 'Program X',
  description: null,
  status: 'active',
  submissionType: undefined,
  therapeuticArea: null,
  phase: null,
  progress,
  priority: null,
  riskLevel: null,
  tags: [],
  depth: 1,
  parentProjectId: null,
  submissionTypeContext: null,
});

const documents = (total: number, completed: number) => ({
  totalDocuments: total,
  completedDocuments: completed,
  inProgressDocuments: 0,
  recentDocuments: [],
  totalKnowledgeDocuments: 0,
  activeKnowledgeDocuments: 0,
});

const chat = async (context: Record<string, unknown>) => {
  H.build.mockResolvedValue({ systemPrompt: 'SYS', context });
  const res = await request(app).post('/api/cortex/chat').send({ message: 'Where are we?', project_id: 7 });
  expect(res.status).toBe(200);
  return res.body.context as Record<string, unknown>;
};

beforeEach(() => H.build.mockReset());

describe('POST /api/cortex/chat — the response context is what was read', () => {
  it('reports a recorded 0% as 0, not as unrecorded', async () => {
    const ctx = await chat({ project: project(0), documents: documents(4, 1) });
    expect(ctx.progress).toBe(0);
  });

  it('reports a documents read that did not happen as null, not as 0 documents', async () => {
    const ctx = await chat({ project: project(40), documents: null, unreadContext: ['project documents'] });
    expect(ctx.documentsTotal).toBeNull();
    expect(ctx.documentsCompleted).toBeNull();
  });

  it('still reports what was read: no recorded progress, and a project with no documents', async () => {
    const ctx = await chat({ project: project(null), documents: documents(0, 0) });
    expect(ctx.progress).toBeNull();
    expect(ctx.documentsTotal).toBe(0);
    expect(ctx.documentsCompleted).toBe(0);
  });
});
