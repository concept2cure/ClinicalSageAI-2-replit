/**
 * The two CMC drafting endpoints under /api/cmc/blueprint are served only by an
 * approved model, and a draft that was not produced is reported as one.
 *
 * POST /generate-blueprint drafts a Module 3 regulatory strategy; POST
 * /playbook/ai-tools/execute drafts validation summaries, stability protocols
 * and risk assessments. Until 2026-09-23:
 *   - they pinned 'gpt-4' and 'gpt-5' — names no configured model matches — as
 *     'general' requests, which the gateway's approval check never sees, so
 *     whatever the unfiltered fallback ladder reached drafted them;
 *   - a failed draft answered 200 success: a placeholder blueprint ("Fallback
 *     blueprint content generated due to AI service unavailability"), or a
 *     canned "AI service temporarily unavailable" string stored as status
 *     'completed' with "<command> completed successfully";
 *   - the blueprint's project row was written before the draft, so every
 *     failed attempt left one behind.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ModelNotApprovedError } from '../../../services/ai-gateway/gateway';

const S = vi.hoisted(() => ({
  chat: vi.fn(),
  queries: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 1, organizationId: 9 };
    next();
  },
}));
vi.mock('../../../db.js', () => ({
  pool: {
    query: async (sql: string, params: unknown[] = []) => {
      S.queries.push({ sql, params });
      if (/INSERT INTO cmc_projects/.test(sql)) return { rows: [{ id: params[0], name: params[2] }] };
      return { rows: [{ id: 'row-1' }] };
    },
  },
  query: async () => ({ rows: [] }),
}));
vi.mock('../../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import router from '../blueprintRoutes';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/cmc/blueprint', router);
  return a;
}

const blueprint = () =>
  request(app())
    .post('/api/cmc/blueprint/generate-blueprint')
    .send({ drugName: 'Examplimab', drugType: 'biologic', dosageForm: 'injection' });
const playbook = () =>
  request(app())
    .post('/api/cmc/blueprint/playbook/ai-tools/execute')
    .send({ command: 'Generate analytical method summary', drugName: 'Examplimab' });

const projectInserts = () => S.queries.filter(q => /INSERT INTO cmc_projects/.test(q.sql));
const executionUpdates = () => S.queries.filter(q => /UPDATE cmc_ai_tool_executions/.test(q.sql));
const DRAFT = { content: '## CMC strategy\n\nDrug substance characterisation…', provider: 'anthropic', model: 'claude-opus-5' };

beforeEach(() => {
  S.chat.mockReset();
  S.queries.length = 0;
});

describe('POST /generate-blueprint', () => {
  it('is drafted as document_drafting with no model pinned, for the caller\'s tenant', async () => {
    S.chat.mockResolvedValue(DRAFT);
    const res = await blueprint();
    expect(res.status).toBe(200);
    const [req] = S.chat.mock.calls[0];
    expect(req).toMatchObject({ taskType: 'document_drafting', organizationId: 9 });
    expect(req.model).toBeUndefined();
    expect(res.body.data.blueprint.generatedBy).toEqual({ provider: 'anthropic', model: 'claude-opus-5' });
    expect(projectInserts()).toHaveLength(1);
  });

  it('a refusal is answered as one, and creates no project', async () => {
    S.chat.mockImplementation(async () => {
      throw new ModelNotApprovedError('document_drafting', ['gpt-4o'], 'no-approved-model');
    });
    const res = await blueprint();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('NO_DRAFT_PRODUCED');
    expect(res.body.message).toMatch(/No model approved for regulatory drafting/);
    expect(projectInserts()).toHaveLength(0);
  });

  it('an empty draft is not a strategy: 503, no project', async () => {
    S.chat.mockResolvedValue({ ...DRAFT, content: '  ' });
    const res = await blueprint();
    expect(res.status).toBe(503);
    expect(res.body.data).toBeUndefined();
    expect(projectInserts()).toHaveLength(0);
  });
});

describe('POST /playbook/ai-tools/execute', () => {
  it('is drafted as document_drafting with no model pinned, and records who drafted it', async () => {
    S.chat.mockResolvedValue(DRAFT);
    const res = await playbook();
    expect(res.status).toBe(200);
    const [req] = S.chat.mock.calls[0];
    expect(req).toMatchObject({ taskType: 'document_drafting', organizationId: 9 });
    expect(req.model).toBeUndefined();
    expect(req.messages[0].content).toMatch(/Not supplied/);
    const [update] = executionUpdates();
    expect(update.params[0]).toBe('completed');
    expect(JSON.parse(update.params[1] as string).generatedBy).toEqual({ provider: 'anthropic', model: 'claude-opus-5' });
  });

  it('a failed draft is recorded as failed and answered as an error, never "completed successfully"', async () => {
    S.chat.mockImplementation(async () => {
      throw new Error('provider unavailable');
    });
    const res = await playbook();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('NO_DRAFT_PRODUCED');
    expect(executionUpdates().map(u => u.params[0])).toEqual(['failed']);
    expect(JSON.stringify(executionUpdates())).not.toMatch(/temporarily unavailable/);
  });

  it('an empty draft is a failed one', async () => {
    S.chat.mockResolvedValue({ ...DRAFT, content: '' });
    const res = await playbook();
    expect(res.status).toBe(503);
    expect(executionUpdates().map(u => u.params[0])).toEqual(['failed']);
  });
});
