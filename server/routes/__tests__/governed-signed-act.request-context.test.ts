import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  authority: vi.fn(), deps: vi.fn(), reverify: vi.fn(), audit: vi.fn(), signature: vi.fn(),
  query: vi.fn(), run: vi.fn(),
}));
vi.mock('../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: h.authority }));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: h.deps }));
vi.mock('../../services/part11/reverify-signer', () => ({ reverifySigner: h.reverify }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: h.audit }));
vi.mock('../../services/part11/signature-persistence', () => ({ persistGovernedSignSignature: h.signature }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
import { signGovernedAct } from '../governed-signed-act';

const client = { query: h.query };
const body = { password: 'synthetic-password', reason: 'Synthetic governed signature proof', meaning: 'approval' };
function app(withContext = true) {
  const a = express(); a.use(express.json());
  a.post('/sign', (req, res) => {
    Object.assign(req, { user: { id: 42, organizationId: 7, role: 'admin' }, ...(withContext ? { dbClient: client } : {}) });
    return signGovernedAct(req, res, { domain: 'biopharma', target: 'bla_assessment:synthetic',
      meanings: ['approval'], codeStatus: {}, run: h.run });
  });
  return a;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.authority.mockResolvedValue(null); h.deps.mockReturnValue({ scoped: true });
  h.reverify.mockResolvedValue({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
  h.query.mockResolvedValue({ rows: [] });
  h.run.mockResolvedValue({ target: 'bla_assessment:synthetic', body: { signed: true } });
  h.audit.mockResolvedValue({ actionId: 'action', auditId: 'audit', sha256Chain: 'chain' });
  h.signature.mockResolvedValue({ id: 1, signedAt: new Date('2026-10-14T00:00:00Z') });
});
describe('signed acts use the request context before any authority or credential read', () => {
  it('keeps authority, signer verification and governed writes on the same pinned client', async () => {
    const res = await request(app()).post('/sign').send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(h.authority).toHaveBeenCalledWith(42, 7, client, { organizationStatuses: ['active'] });
    expect(h.deps).toHaveBeenCalledWith(client);
    expect(h.run).toHaveBeenCalledWith(client, 7, 42);
    expect(h.audit.mock.calls[0][0]).toBe(client);
    expect(h.signature.mock.calls[0][0]).toBe(client);
  });
  it('refuses absent request context before authority, credentials or transaction writes', async () => {
    const res = await request(app(false)).post('/sign').send(body);
    expect(res.status).toBe(500);
    expect(h.authority).not.toHaveBeenCalled(); expect(h.deps).not.toHaveBeenCalled();
    expect(h.reverify).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled();
  });
  it('still validates missing signature components before requesting any database context', async () => {
    const res = await request(app(false)).post('/sign').send({ reason: body.reason });
    expect(res.status).toBe(400); expect(res.body.error.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(h.authority).not.toHaveBeenCalled(); expect(h.reverify).not.toHaveBeenCalled();
  });
  it('keeps an authority refusal ahead of credential verification and the domain transaction', async () => {
    h.authority.mockResolvedValue({ status: 403, code: 'ESIGNATURE_NO_AUTHORITY', message: 'Nothing was signed.' });
    const res = await request(app()).post('/sign').send(body);
    expect(res.status).toBe(403); expect(h.authority).toHaveBeenCalledWith(42, 7, client, { organizationStatuses: ['active'] });
    expect(h.reverify).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled();
  });
  it('keeps failed credential accounting outside the domain transaction and leaves the act unsigned', async () => {
    h.reverify.mockResolvedValue({ ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'Password refused.' });
    const res = await request(app()).post('/sign').send(body);
    expect(res.status).toBe(401); expect(h.deps).toHaveBeenCalledWith(client);
    expect(h.query).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled(); expect(h.signature).not.toHaveBeenCalled();
  });
});
