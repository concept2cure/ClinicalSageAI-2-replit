import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const {
  mockExtract, mockCreate, mockList, mockUpdateStatus,
  mockGetById, mockLinkTask, mockBuildTask, mockCheckContradictions,
} = vi.hoisted(() => ({
  mockExtract: vi.fn(),
  mockCreate: vi.fn(),
  mockList: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockGetById: vi.fn(),
  mockLinkTask: vi.fn(),
  mockBuildTask: vi.fn(),
  mockCheckContradictions: vi.fn(),
}));

vi.mock('../../server/services/commitments/commitments-service.js', () => ({
  extractCommitments: mockExtract,
  createCommitment: mockCreate,
  listCommitments: mockList,
  updateCommitmentStatus: mockUpdateStatus,
  getCommitmentById: mockGetById,
  linkCommitmentTask: mockLinkTask,
  buildTaskFromCommitment: mockBuildTask,
  checkOutboundContradictions: mockCheckContradictions,
}));

// No DB / audit chain in route tests — pool null makes the best-effort audit a no-op.
vi.mock('../../server/db.js', () => ({ pool: null }));
vi.mock('../../server/services/audit/chain.js', () => ({
  computeAuditChain: vi.fn(async () => 'hash'),
  hashPayload: vi.fn(() => 'ph'),
}));

import commitmentsRouter from '../../server/routes/c2c/commitments';

function handler(method: string, path: string) {
  const layer = (commitmentsRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function req(overrides: Record<string, unknown> = {}, withOrg = true) {
  const r = createMockRequest({ body: {}, params: {}, query: {}, ...overrides } as any) as any;
  if (withOrg) { r.organizationId = 7; r.user = { id: 3 }; }
  return r;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /', () => {
  it('401 without org context', async () => {
    const res = createMockResponse();
    await handler('get', '/')(req({}, false), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it('lists commitments for the org', async () => {
    mockList.mockResolvedValue([{ id: 'cmt_1' }]);
    const res = createMockResponse();
    await handler('get', '/')(req({ query: { direction: 'outbound' } }), res);
    expect(mockList).toHaveBeenCalledWith(7, expect.objectContaining({ direction: 'outbound' }));
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 'cmt_1' }] });
  });
});

describe('POST /', () => {
  it('400 without a title', async () => {
    const res = createMockResponse();
    await handler('post', '/')(req({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it('creates a manual commitment', async () => {
    mockCreate.mockResolvedValue({ id: 'cmt_x' });
    const res = createMockResponse();
    await handler('post', '/')(req({ body: { title: 'Confirmatory trial', direction: 'inbound' } }), res);
    expect(mockCreate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'cmt_x' } });
  });
});

describe('POST /extract', () => {
  it('400 on too-short text', async () => {
    const res = createMockResponse();
    await handler('post', '/extract')(req({ body: { text: 'short' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it('extracts and persists commitments', async () => {
    mockExtract.mockResolvedValue([{ title: 'A', direction: 'outbound' }, { title: 'B', direction: 'inbound' }]);
    mockCreate.mockResolvedValue({ id: 'cmt_n' });
    const res = createMockResponse();
    await handler('post', '/extract')(req({ body: { text: 'a'.repeat(50), documentId: 'doc1' } }), res);
    expect(mockExtract).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ count: 2, persisted: 2 }) }));
  });
});

describe('PATCH /:id/status', () => {
  it('400 when reason < 8 chars', async () => {
    const res = createMockResponse();
    await handler('patch', '/:id/status')(req({ params: { id: 'cmt_1' }, body: { status: 'open', reason: 'short' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it('404 when the commitment is not found', async () => {
    mockUpdateStatus.mockResolvedValue(null);
    const res = createMockResponse();
    await handler('patch', '/:id/status')(req({ params: { id: 'cmt_1' }, body: { status: 'open', reason: 'reviewed by RA lead' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it('updates status when found', async () => {
    mockUpdateStatus.mockResolvedValue({ id: 'cmt_1', status: 'open' });
    const res = createMockResponse();
    await handler('patch', '/:id/status')(req({ params: { id: 'cmt_1' }, body: { status: 'open', reason: 'reviewed by RA lead' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'cmt_1', status: 'open' } });
  });
});

describe('POST /contradictions', () => {
  it('checks outbound commitments for contradictions', async () => {
    mockList.mockResolvedValue([{ id: 'a', title: 'x' }, { id: 'b', title: 'y' }]);
    mockCheckContradictions.mockResolvedValue([{ commitmentIds: ['a', 'b'], kind: 'conflicting_deadline', explanation: 'x', severity: 'high' }]);
    const res = createMockResponse();
    await handler('post', '/contradictions')(req({ body: {} }), res);
    expect(mockList).toHaveBeenCalledWith(7, expect.objectContaining({ direction: 'outbound' }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ checked: 2 }) }));
  });
});

describe('POST /:id/promote-to-task', () => {
  it('404 when not found', async () => {
    mockGetById.mockResolvedValue(null);
    const res = createMockResponse();
    await handler('post', '/:id/promote-to-task')(req({ params: { id: 'cmt_1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it('returns a task spec for a commitment', async () => {
    mockGetById.mockResolvedValue({ id: 'cmt_1', title: 'X', linkedTaskId: null });
    mockBuildTask.mockReturnValue({ sourceCommitmentId: 'cmt_1', title: 'Commitment: X', priority: 'medium' });
    const res = createMockResponse();
    await handler('post', '/:id/promote-to-task')(req({ params: { id: 'cmt_1' }, body: {} }), res);
    expect(mockBuildTask).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ taskSpec: expect.any(Object) }) }));
  });
});
