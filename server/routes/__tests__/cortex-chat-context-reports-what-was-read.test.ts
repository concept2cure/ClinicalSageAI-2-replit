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
import { assembleSystemPrompt, type AnAContext } from '../../services/lumen-context-builder';
import { BASE_SYSTEM_PROMPT } from '../../services/lumen-context/base-system-prompt';
import { getSubmissionTypeContext } from '../../../shared/regulatory/submission-type-bridge';
import type { UserIntelligence } from '../../services/user-intelligence';

const H = vi.hoisted(() => ({ build: vi.fn(), requests: [] as Array<{ messages: Array<{ role: string; content: string }> }> }));

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
    route: async (request: { messages: Array<{ role: string; content: string }> }) => {
      H.requests.push(request);
      return {
      content: 'An answer.',
      provider: 'stub',
      model: 'stub-1',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    },
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

beforeEach(() => { H.build.mockReset(); H.requests.length = 0; });

describe('POST /api/cortex/chat — the response context is what was read', () => {
  it('passes real-base canonical intelligence and recorded filing scope to the gateway without a provider call', async () => {
    const selected = { id: 7, name: 'Recorded PMA', submissionType: 'US_PMA', phase: null,
      therapeuticArea: null, progress: 0, status: 'active', role: 'owner', lastAccessedAt: null };
    const context: AnAContext = {
      project: { ...project(0), name: selected.name, submissionType: selected.submissionType,
        submissionTypeContext: getSubmissionTypeContext('US_PMA') },
      userIntelligence: { organizationId: 3, organization: { id: 3, name: 'Recorded org', industryMode: null,
        enabledModules: ['submission-center', 'document-authoring'] }, activeProject: selected,
      } as unknown as UserIntelligence,
      documents: null, workflow: null, conversation: null, userName: null, userRole: null,
      organizationName: null, accountCanon: null, clientIntelligence: 'x'.repeat(12_001),
      projectIntelligence: null, anaIntelligenceContext: null,
      unreadContext: ['project documents'], timestamp: '2026-10-27',
    };
    const systemPrompt = await assembleSystemPrompt(context);
    H.build.mockResolvedValue({ systemPrompt, context });
    const response = await request(app).post('/api/cortex/chat').send({ message: 'Explain this filing.', project_id: 7 });
    expect(response.status).toBe(200);
    expect(H.requests).toHaveLength(1);
    const sent = H.requests[0].messages[0].content;
    for (const block of [BASE_SYSTEM_PROMPT, '## Active Project Context', '(US_PMA)',
      '## Medical Device & Diagnostics Intelligence', '## Dossier Assembly Workflow',
      '## Dossier Project Manager', '## Document Editor Intelligence', '## PMA Specific Guidance',
      '## Context Not Read', '## Optional Context Omitted', '## Tool Usage Guidance']) {
      expect(sent).toContain(block);
    }
  });

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
