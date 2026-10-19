import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), file: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock('../../db', () => ({ db: {}, pool: { connect: async () => ({ query: h.query, release: () => undefined }) } }));
vi.mock('../../db/requestDb', () => ({ requestPgClient: (req: { dbClient?: unknown }) => {
  if (!req.dbClient) throw new Error('Missing context'); return req.dbClient;
} }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: async () => undefined }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: h.audit }));
vi.mock('../../services/protocol-development/protocol-development-service', async (original) => ({
  ...(await original<typeof import('../../services/protocol-development/protocol-development-service')>()),
  createProtocolDocumentTx: h.create, fileProtocolProgramTx: h.file,
}));
import router from '../protocol-development';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const reason = 'Explicitly filing this protocol in its program';
function app(role = 'member', hasClient = true) {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => { Object.assign(req, { tenantId: 7, userId: 11, userRole: role, ...(hasClient ? { dbClient: { query: h.query } } : {}) }); next(); });
  a.use('/api/protocol-development', router); return a;
}
beforeEach(() => {
  vi.clearAllMocks(); h.query.mockResolvedValue({ rows: [] }); h.file.mockResolvedValue(undefined);
  h.create.mockResolvedValue({ id: 41, sectionsSeeded: 12 }); h.audit.mockResolvedValue({ actionId: 'act_real' });
});
describe('Governed protocol program writes', () => {
  it('pins create actor/org to the session and audits the exact UUID association', async () => {
    const res = await request(app()).post('/api/protocol-development/documents').send({ programId: PROGRAM, protocolKind: 'clinical', title: 'First protocol', reason, actorUserId: 99, orgId: 9 });
    expect(res.status).toBe(201);
    expect(h.create).toHaveBeenCalledWith(expect.anything(), 7, 11, expect.objectContaining({ programId: PROGRAM, title: 'First protocol' }));
    expect(h.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orgId: 7, userId: 11, reason, target: 'protocol-document:41', payload: expect.objectContaining({ programId: PROGRAM }) }));
    expect(res.body.programId).toBe(PROGRAM);
  });
  it('refuses a new unfiled protocol at the API edge before any canonical create or audit', async () => {
    const res = await request(app()).post('/api/protocol-development/documents').send({ protocolKind: 'clinical', title: 'Unfiled new protocol', reason });
    expect(res.status).toBe(400); expect(h.create).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled();
  });
  it('files on the request connection, with the governed reason and session actor', async () => {
    const res = await request(app()).post('/api/protocol-development/documents/41/program').send({ programId: PROGRAM, reason });
    expect(res.status).toBe(201);
    expect(h.file).toHaveBeenCalledWith(expect.anything(), 7, 41, PROGRAM, 11);
    expect(h.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ command: 'update', reason, userId: 11, target: 'protocol-document:41', payload: { programId: PROGRAM } }));
    expect(h.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
  });
  it('refuses viewer, missing request context, short reason and spoofed actor fields before the filing writer', async () => {
    expect((await request(app('viewer')).post('/api/protocol-development/documents/41/program').send({ programId: PROGRAM, reason })).status).toBe(403);
    expect((await request(app('member', false)).post('/api/protocol-development/documents/41/program').send({ programId: PROGRAM, reason })).status).toBe(500);
    expect((await request(app()).post('/api/protocol-development/documents/41/program').send({ programId: PROGRAM, reason: 'short' })).status).toBe(400);
    expect((await request(app()).post('/api/protocol-development/documents/41/program').send({ programId: PROGRAM, reason, actorUserId: 99 })).status).toBe(400);
    expect(h.file).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled();
  });
  it('rolls back if current authority is denied or the audit fails', async () => {
    h.file.mockRejectedValueOnce(Object.assign(new Error('Current program authority required'), { code: 'FORBIDDEN' }));
    const refusal = await request(app()).post('/api/protocol-development/documents/41/program').send({ programId: PROGRAM, reason });
    expect(refusal.status).toBe(403); expect(h.audit).not.toHaveBeenCalled();
    expect(h.query).toHaveBeenCalledWith('ROLLBACK');
    h.audit.mockRejectedValueOnce(new Error('Audit unavailable'));
    const failed = await request(app()).post('/api/protocol-development/documents/41/program').send({ programId: PROGRAM, reason });
    expect(failed.status).toBe(500); expect(h.query).not.toHaveBeenCalledWith('COMMIT');
  });
});
