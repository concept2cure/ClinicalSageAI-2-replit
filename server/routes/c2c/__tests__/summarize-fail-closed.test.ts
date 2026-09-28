/**
 * /conversations/:id/summarize stores a summary only when a model produced one.
 *
 * The working-memory row is chained into the next summary and consolidated into
 * project memory. Until 2026-09-23 a failed or unreadable summary stored a
 * placeholder — "Conversation with N messages", or "Unable to parse summary"
 * with every list empty — as the conversation's remembered state, and answered
 * 200 as though a model had written it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const S = vi.hoisted(() => ({
  chatImpl: null as null | (() => Promise<Record<string, unknown>>),
  stored: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../auth', () => ({
  authMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireOrganizationContext: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  concept2cureRateLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../../lib/unified-ai-client', () => ({
  ai: { chat: async () => (S.chatImpl ? S.chatImpl() : Promise.reject(new Error('unset'))) },
}));
vi.mock('../../../services/working-memory.js', () => ({
  buildWorkingMemoryPrompt: () => 'Summarise this conversation.',
  formatWorkingMemoryForPrompt: () => '',
  getLatestWorkingMemory: async () => null,
  storeWorkingMemory: async (row: Record<string, unknown>) => void S.stored.push(row),
}));
vi.mock('../../../db', () => ({
  pool: {
    query: async (sql: string) => {
      if (/FROM concept2cure_messages/.test(sql)) {
        return { rows: [{ role: 'user', content: 'What CMC data does the pre-IND package need?' }] };
      }
      if (/FROM concept2cure_conversations/.test(sql)) return { rows: [{ thread_id: null }] };
      throw new Error(`unexpected query: ${sql}`);
    },
  },
  db: {},
}));

import router from '../context-intelligence';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as Record<string, unknown>).tenantContext = { organizationId: 9 };
    next();
  });
  a.use('/api/concept2cure', router);
  return a;
}

const summarize = () => request(app()).post('/api/concept2cure/conversations/41/summarize').send({});

beforeEach(() => {
  S.chatImpl = null;
  S.stored.length = 0;
});

describe('POST /conversations/:id/summarize', () => {
  it('a readable summary is stored', async () => {
    S.chatImpl = async () => ({ content: JSON.stringify({ objective: 'Plan the pre-IND CMC package', decisions: [] }) });
    const res = await summarize();
    expect(res.status).toBe(200);
    expect(S.stored).toHaveLength(1);
    expect(S.stored[0].summary).toContain('Plan the pre-IND CMC package');
  });

  it.each([
    ['a model failure', async () => { throw new Error('provider unavailable'); }],
    ['an unreadable reply', async () => ({ content: 'Here is a summary of the discussion.' })],
    ['an empty reply', async () => ({ content: '' })],
    ['JSON with no objective', async () => ({ content: '{"decisions":[]}' })],
  ])('%s stores nothing and answers 503', async (_what, impl) => {
    S.chatImpl = impl as () => Promise<Record<string, unknown>>;
    const res = await summarize();
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).toMatch(/nothing was saved/);
    expect(S.stored).toEqual([]);
  });
});
