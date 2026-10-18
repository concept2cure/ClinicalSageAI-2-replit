/**
 * POST /api/cortex/save-draft records the draft's governed decision as the
 * signed-in user, and says whether that decision was written.
 *
 * What the code used to do (until 2026-10-15):
 *   - the governed evaluation's actor was `String(userId || 'system')`: with no
 *     user on the request the decision was filed as made by 'system' before the
 *     write was refused as unattributable;
 *   - the response handed back `decisionReference` without
 *     `decisionPersisted`, though the ledger insert behind that id is queued
 *     and can fail — so a caller showed an id that might name no row.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  execute: vi.fn(),
}));

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
    if (H.user) req.user = { ...H.user };
    next();
  },
}));
vi.mock('../../services/ana-context-builder.js', () => ({ buildContextAwarePrompt: vi.fn() }));
vi.mock('../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: vi.fn(),
  getThreadMessages: vi.fn(),
  getWindowedMessages: vi.fn(),
  ThreadAccessError: class ThreadAccessError extends Error {},
  saveChatMessage: vi.fn(),
  deleteConversation: vi.fn(),
}));
vi.mock('../../services/ai-gateway/index.js', () => ({ getGateway: () => ({}) }));
vi.mock('../../services/ana-ri/orchestrator.js', () => ({
  orchestrate: vi.fn(),
  detectIntent: () => null,
  detectSubmissionType: () => null,
}));
vi.mock('../../services/kernel-router.js', () => ({ planKernelExecution: vi.fn() }));
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
vi.mock('../../services/governed-ana-execution.js', () => ({ executeGovernedAnaOperation: (...a: unknown[]) => H.execute(...a) }));
vi.mock('../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: vi.fn() }));

let app: express.Express;

beforeAll(async () => {
  const router = (await import('../cortex-unified')).default;
  app = express();
  app.use(express.json());
  app.use('/api/cortex', router);
}, 60_000);

const BODY = { project_id: 12, section_code: '2.5', content: 'A draft of the clinical overview.' };
const save = () => request(app).post('/api/cortex/save-draft').send(BODY);

beforeEach(() => {
  H.user = { id: 11, organizationId: 3 };
  H.execute.mockReset();
  H.execute.mockResolvedValue({
    persistenceStatus: 'persisted',
    artifactMutation: { artifactId: 5, sectionCode: '2.5', isNew: true, sectionStatusUpdated: false },
    decisionReference: 'dec-1',
    decisionPersisted: false,
  });
});

describe('POST /save-draft', () => {
  it('answers 401 with no user, and records no governed decision (it recorded "system")', async () => {
    H.user = { organizationId: 3 };
    const res = await save();
    expect(res.status).toBe(401);
    expect(H.execute).not.toHaveBeenCalled();
  });

  it('evaluates the draft as the signed-in user', async () => {
    await save();
    expect(H.execute.mock.calls[0][0].evaluationInput.context.actorId).toBe('11');
  });

  it('says whether the decision it names was written', async () => {
    const res = await save();
    expect(res.status).toBe(200);
    expect(res.body.decisionReference).toBe('dec-1');
    expect(res.body.decisionPersisted).toBe(false);
  });

  it('says so on a refused write too', async () => {
    H.execute.mockResolvedValue({
      persistenceStatus: 'rejected',
      artifactMutation: null,
      decisionReference: 'dec-2',
      decisionPersisted: true,
    });
    const res = await save();
    expect(res.status).toBe(409);
    expect(res.body.details).toMatchObject({ decisionReference: 'dec-2', decisionPersisted: true });
  });
});
