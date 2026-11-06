/** Native Quality tasks retain verified source doors instead of becoming anonymous board work. */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROGRAM = '46e5c864-08bf-4860-aa6f-36e015485015';
const AUTHORED = '10b7e1a5-3c55-4a0e-9a8e-111111111111';
const CAPA = 'aabbccdd-0000-4000-8000-000000000001';
const ACTION = 'aabbccdd-0000-4000-8000-000000000002';
const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[], present: true, fail: false, denied: false, assigned: false,
  queries: [] as Array<{ text: string; values: unknown[] }>,
  admit: vi.fn(), content: vi.fn(), training: vi.fn(), assignee: vi.fn(),
}));
vi.mock('../../db/requestDb', () => {
  const chain: Record<string, unknown> = {};
  for (const key of ['select', 'from']) chain[key] = () => chain;
  chain.where = () => ({ orderBy: async () => h.rows, then: (done: (value: unknown[]) => void) => done([]) });
  return { requestDb: () => chain, requestPgClient: () => ({ query: async (text: string, values: unknown[]) => {
    h.queries.push({ text, values });
    if (h.fail) throw new Error('native read unavailable');
    if (!h.present) return { rows: [] };
    if (text.includes('FROM qms_documents')) return { rows: [{ id: 12, organization_id: 7, authoring_document_id: AUTHORED, metadata: { programId: 'not-the-owner' } }] };
    if (text.includes('FROM authoring_documents')) return { rows: [{ program_id: PROGRAM, client_program_id: PROGRAM }] };
    if (text.includes('capa_records')) return { rows: [{ id: CAPA, program_id: PROGRAM }] };
    if (text.includes('FROM qc_deviations') || text.includes('FROM qms_suppliers') || text.includes('FROM qms_internal_audits')) return { rows: [{ id: 8, organization_id: 7 }] };
    return { rows: [] };
  } }) };
});
vi.mock('../../utils/tenantContext', () => ({ getSecureOrgId: () => 7 }));
vi.mock('../../services/unified-work/unified-work-view', async original => ({
  ...await original<typeof import('../../services/unified-work/unified-work-view')>(),
  loadUnifiedWork: async () => ({ items: [], sources: { unified_tasks: { ran: true } } }),
}));
vi.mock('../../services/authoring/authoring-program-access', () => ({ authorizeAuthoringProgram: h.admit }));
vi.mock('../../services/qms/controlled-document-content', () => ({ authorizeQmsContentRead: h.content }));
vi.mock('../../services/qms/training-assignment', () => ({ isQmsTrainingAssignee: h.assignee, authorizeQmsTrainingRead: h.training }));

import createTaskBoardRoutes from '../taskBoard.routes';

const row = (sourceEntityType: string | null, sourceEntityId: string | null, extra: Record<string, unknown> = {}) => ({
  taskId: 'TASK-native', title: 'Native Quality work', projectId: null, moduleType: 'Quality', taskType: 'action', status: 'pending',
  priority: 'medium', assigneeId: 2, assignedBy: 1, progress: 0, approvalHistory: [], comments: [], attachments: [],
  sourceEntityType, sourceEntityId, dueDate: null, blockedBy: null, reviewRouteId: null, ...extra,
});
async function board() {
  const app = express();
  app.use((req, _res, next) => { req.userId = '2'; next(); });
  app.use('/api/task-management', createTaskBoardRoutes());
  const response = await request(app).get('/api/task-management/board');
  expect(response.status).toBe(200);
  return response.body.data as Array<{ source: string; sourceEntityType?: string; sourceEntityId?: string; qualitySource?: Record<string, unknown>; reviewRoute?: unknown }>;
}
beforeEach(() => {
  h.rows = []; h.present = true; h.fail = false; h.denied = false; h.assigned = false; h.queries = [];
  for (const mock of [h.admit, h.content, h.training, h.assignee]) mock.mockReset();
  h.admit.mockImplementation(async () => { if (h.denied) throw new Error('private project'); return { projectId: 31, programId: PROGRAM }; });
  h.content.mockImplementation(async () => { if (h.denied) throw new Error('private document'); });
  h.training.mockResolvedValue(undefined);
  h.assignee.mockImplementation(async () => h.assigned);
});

describe('verified native Quality source identity', () => {
  it.each([
    ['qms_periodic_review', 'qms-document:12', 'sop', PROGRAM],
    ['capa_record', `capa:${CAPA}`, 'capa', PROGRAM],
    ['capa_action', `capa-action:${ACTION}`, 'capa', PROGRAM],
    ['qms_deviation', 'qms-deviation:8', 'deviations', null],
    ['qms_supplier_audit', 'qms-supplier-audit:8', 'suppliers', null],
    ['qms_supplier_reapproval', 'qms-supplier-reapproval:8', 'suppliers', null],
    ['qms_internal_audit', 'qms-internal-audit:8', 'audits', null],
  ])('retains %s identity and an honest Quality destination', async (type, id, tab, programId) => {
    h.rows = [row(type, id)];
    const [card] = await board();
    expect(card).toMatchObject({ source: 'quality', sourceEntityType: type, sourceEntityId: id,
      qualitySource: { kind: 'quality', qmsTab: tab, programId } });
    if (tab === 'sop') expect(card.qualitySource?.qmsDocumentId).toBe('12');
    else expect(card.qualitySource?.qmsDocumentId).toBeUndefined();
    expect(h.queries.some(query => query.values.includes(7))).toBe(true);
  });

  it('admits the actual CAPA program before publishing it, independent of task placement', async () => {
    h.rows = [row('capa_record', `capa:${CAPA}`, { projectId: 999 })];
    const [card] = await board();
    expect(h.admit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 7, actor: { id: '2', email: null }, programId: PROGRAM, forWrite: false }));
    expect(card.qualitySource?.programId).toBe(PROGRAM);
  });

  it('uses the controlled document binding, not its mutable metadata or the board project', async () => {
    h.rows = [row('qms_periodic_review', 'qms-document:12', { projectId: 999 })];
    const [card] = await board();
    expect(h.content).toHaveBeenCalled();
    expect(card.qualitySource).toMatchObject({ qmsDocumentId: '12', programId: PROGRAM });
    expect(h.queries.some(query => query.text.includes('authoring_documents') && query.values.includes(AUTHORED) && query.values.includes(7))).toBe(true);
  });
});

describe('missing or inaccessible Quality sources never produce guessed doors', () => {
  it.each(['missing/deleted/other organisation', 'failed read', 'private project'])('keeps the task and marks its source unresolved after %s', async outcome => {
    h.rows = [row('capa_record', `capa:${CAPA}`)];
    h.present = outcome !== 'missing/deleted/other organisation'; h.fail = outcome === 'failed read'; h.denied = outcome === 'private project';
    const [card] = await board();
    expect(card.source).toBe('quality');
    expect(card.qualitySource).toEqual({ kind: 'unresolved' });
    expect(JSON.stringify(card)).not.toContain(PROGRAM);
  });

  it('rejects malformed native keys without reading a guessed record', async () => {
    h.rows = [row('qms_periodic_review', 'qms-document:12;select'), row('capa_record', 'capa:foreign')];
    for (const card of await board()) expect(card.qualitySource).toEqual({ kind: 'unresolved' });
    expect(h.queries).toHaveLength(0);
  });

  it('leaves an ordinary board task unchanged', async () => {
    h.rows = [row(null, null, { moduleType: 'Clinical' })];
    expect((await board())[0]).toMatchObject({ source: 'unified' });
    expect((await board())[0].qualitySource).toBeUndefined();
  });
});

describe('training and existing review routes retain their native safeguards', () => {
  it('opens an assigned training reader without disclosing its private editing project', async () => {
    h.rows = [row('qms_training', 'qms-document:12:user:2')]; h.assigned = true; h.denied = true;
    expect((await board())[0].qualitySource).toEqual({ kind: 'quality', qmsTab: 'sop', qmsDocumentId: '12', qmsIntent: 'read', programId: null });
    expect(h.training).toHaveBeenCalled(); expect(h.content).not.toHaveBeenCalled();
  });

  it('verifies the QMS document behind a review route and retains its canonical program', async () => {
    h.rows = [row('qms_document', '12', { reviewRouteId: CAPA })];
    expect((await board())[0].reviewRoute).toEqual({ kind: 'quality', qmsDocumentId: '12', programId: PROGRAM });
    h.present = false;
    expect((await board())[0].reviewRoute).toEqual({ kind: 'unresolved' });
  });
});
