import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ draft: vi.fn(), batch: vi.fn(), audit: vi.fn(), turn: vi.fn(), query: vi.fn() }));
vi.mock('../../services/ana/AnaDocumentDraftingService', () => ({
  getAnaDraftingService: () => ({ draftDocument: h.draft, batchDraft: h.batch }),
}));
vi.mock('../ana-model-provenance', () => ({ recordModelProvenance: h.audit, unavailableModelProvenance: vi.fn() }));
vi.mock('../../services/ana/turn-record.js', () => ({
  canonicalJson: JSON.stringify, openTurnRecorder: () => undefined, writeTurnRecordSafely: h.turn,
}));

import router from '../ana-intelligence';
import { AnaProjectScopeError } from '../../services/ana/project-scope-admission';

const SQL = { query: h.query };
const PROGRAM = '7abb1c22-aaaa-4000-8000-000000000001';
const section = { sectionType: '1.2', instructions: 'Draft from the recorded project.' };
const ordinary = { ...section, framework: 'general_regulatory' };
const draft = { content: 'Synthetic draft', model: 'fixture', usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }, latencyMs: 1 };

function app(withSql = true) {
  const result = express();
  result.use(express.json());
  result.use((req, _res, next) => {
    Object.assign(req, { tenantContext: { organizationId: 7 }, user: { id: 3, organizationId: 7 }, ...(withSql ? { dbClient: SQL } : {}) });
    next();
  });
  result.use('/api/claude', router);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.draft.mockResolvedValue(draft);
  h.batch.mockResolvedValue([draft]);
  h.audit.mockResolvedValue({ persisted: true, chained: true });
  h.turn.mockResolvedValue(null);
});

describe.each(['/draft', '/draft/stream'])('%s recorded product context', path => {
  it.each(['projectRef', 'projectId', 'project_id'])('forwards %s on the request executor and allows omitted filing hints', async key => {
    const response = await request(app()).post(`/api/claude${path}`).send({ ...section, [key]: ` ${PROGRAM.toUpperCase()} `,
      organizationId: 99, userId: 55, contextSqlClient: { query: 'forged' } });
    expect(response.status).toBe(200);
    const input = h.draft.mock.calls[0][0];
    expect(input).toMatchObject({ projectId: PROGRAM, organizationId: 7, userId: 3, sectionType: section.sectionType });
    expect(input.contextSqlClient).toBe(SQL);
    expect(input.submissionType).toBeUndefined();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('normalizes agreeing integer aliases without parsing UUID prefixes', async () => {
    await request(app()).post(`/api/claude${path}`).send({ ...ordinary, projectRef: 'proj_21', projectId: 21, project_id: '21' });
    expect(h.draft.mock.calls[0][0]).toMatchObject({ projectId: 21, contextSqlClient: SQL });
  });

  it.each([0, -1, false, {}, [], 1.5, '7abb-not-a-project'].map(projectId => ({ projectId })))('refuses malformed explicit scope $projectId before drafting', async ({ projectId }) => {
    const response = await request(app()).post(`/api/claude${path}`).send({ ...ordinary, projectId });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ANA_PROJECT_SCOPE_INVALID');
    expect(h.draft).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses conflicting aliases before drafting', async () => {
    const response = await request(app()).post(`/api/claude${path}`).send({ ...ordinary, projectRef: PROGRAM, project_id: 21 });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ANA_PROJECT_SCOPE_MISMATCH');
    expect(h.draft).not.toHaveBeenCalled();
  });

  it('keeps the optional no-project path without adopting a posted executor', async () => {
    const response = await request(app(false)).post(`/api/claude${path}`).send({ ...ordinary, contextSqlClient: { query: 'forged' } });
    expect(response.status).toBe(200);
    expect(h.draft.mock.calls[0][0]).not.toHaveProperty('projectId');
    expect(h.draft.mock.calls[0][0]).not.toHaveProperty('contextSqlClient');
  });

  it('refuses explicit project reads without a request connection', async () => {
    const response = await request(app(false)).post(`/api/claude${path}`).send({ ...ordinary, projectId: PROGRAM });
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('DRAFT_PRODUCT_CONTEXT_UNAVAILABLE');
    expect(h.draft).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 409, 503] as const)('preserves a typed %s scope refusal, including an open SSE stream', async status => {
    h.draft.mockRejectedValue(new AnaProjectScopeError(status, 'RECORDED_SCOPE_REFUSED', 'Recorded project scope refused.'));
    const response = await request(app()).post(`/api/claude${path}`).send({ ...ordinary, projectRef: PROGRAM });
    if (path.endsWith('stream')) {
      expect(response.status).toBe(200);
      const events = response.text.split('\n\n').filter(frame => frame.startsWith('data: ')).map(frame => JSON.parse(frame.slice(6)));
      expect(events).toEqual([{ type: 'error', code: 'RECORDED_SCOPE_REFUSED', status, error: 'Recorded project scope refused.' }]);
    } else {
      expect(response.status).toBe(status);
      expect(response.body).toMatchObject({ success: false, error: 'RECORDED_SCOPE_REFUSED', message: 'Recorded project scope refused.' });
    }
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe('/batch recorded product context', () => {
  it.each(['projectRef', 'projectId', 'project_id'])('uses a top-level %s default on each item', async key => {
    const response = await request(app()).post('/api/claude/batch').send({ [key]: PROGRAM, requests: [{ ...section, contextSqlClient: { query: 'forged' } }] });
    expect(response.status).toBe(200);
    expect(h.batch.mock.calls[0][0].requests[0]).toMatchObject({ projectId: PROGRAM, organizationId: 7, userId: 3 });
    expect(h.batch.mock.calls[0][0].requests[0].contextSqlClient).toBe(SQL);
  });

  it('retains each explicit item scope and replaces all posted authority', async () => {
    h.batch.mockResolvedValue([draft, draft]);
    const response = await request(app()).post('/api/claude/batch').send({ projectId: PROGRAM, requests: [
      { ...ordinary, projectRef: 'proj_21', organizationId: 99, userId: 55, contextSqlClient: { query: 'forged' } },
      { ...ordinary, project_id: PROGRAM.toUpperCase(), contextSqlClient: { query: 'forged' } },
    ] });
    expect(response.status).toBe(200);
    const inputs = h.batch.mock.calls[0][0].requests;
    expect(inputs.map((input: { projectId: unknown }) => input.projectId)).toEqual([21, PROGRAM]);
    for (const input of inputs) {
      expect(input).toMatchObject({ organizationId: 7, userId: 3 });
      expect(input.contextSqlClient).toBe(SQL);
      expect(input).not.toHaveProperty('projectRef');
      expect(input).not.toHaveProperty('project_id');
    }
  });

  it('does not retain a forged executor on an ordinary no-project batch item', async () => {
    const response = await request(app(false)).post('/api/claude/batch').send({ requests: [{ ...ordinary, contextSqlClient: { query: 'forged' } }] });
    expect(response.status).toBe(200);
    expect(h.batch.mock.calls[0][0].requests[0]).not.toHaveProperty('contextSqlClient');
  });

  it('refuses an invalid item scope before starting any batch work', async () => {
    const response = await request(app()).post('/api/claude/batch').send({ requests: [ordinary, { ...ordinary, projectRef: {} }] });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ANA_PROJECT_SCOPE_INVALID');
    expect(h.batch).not.toHaveBeenCalled();
  });

  it('preserves a typed whole-batch context refusal', async () => {
    h.batch.mockRejectedValue(new AnaProjectScopeError(409, 'DRAFT_PRODUCT_CONTEXT_CHANGED', 'Reload before drafting.'));
    const response = await request(app()).post('/api/claude/batch').send({ requests: [{ ...ordinary, projectId: PROGRAM }] });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('DRAFT_PRODUCT_CONTEXT_CHANGED');
    expect(h.audit).not.toHaveBeenCalled();
  });
});
