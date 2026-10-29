/**
 * signGovernedAct's two hooks (RR4 of docs/design/REVIEW_ROUTING_2026-10-23.md,
 * §2.8, finding B7): `precheck` runs before the signing authority check and the
 * credential, so a refusal the act decides costs no password guess; `afterSign`
 * runs on the signing transaction after the electronic_signatures row is
 * written and before COMMIT, so it can cite the row's id, and a throw rolls the
 * act back with its signature.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  authority: vi.fn(), deps: vi.fn(), reverify: vi.fn(), audit: vi.fn(), signature: vi.fn(),
  query: vi.fn(), run: vi.fn(), precheck: vi.fn(), afterSign: vi.fn(), afterCommit: vi.fn(),
}));
vi.mock('../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: h.authority }));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: h.deps }));
vi.mock('../../services/part11/reverify-signer', () => ({ reverifySigner: h.reverify }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: h.audit }));
vi.mock('../../services/part11/signature-persistence', () => ({ persistGovernedSignSignature: h.signature }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
import { signGovernedAct } from '../governed-signed-act';

const client = { query: h.query };
const body = { password: 'synthetic-password', reason: 'Synthetic routed review signature', meaning: 'REVIEWED' };
const coded = (code: string) => Object.assign(new Error(`Refused: ${code}. Nothing was signed.`), { code });

function app() {
  const a = express(); a.use(express.json());
  a.post('/sign', (req, res) => {
    Object.assign(req, { user: { id: 42, organizationId: 7, role: 'reviewer' }, dbClient: client });
    return signGovernedAct(req, res, {
      domain: 'qms', target: 'qms-document:11', meanings: ['REVIEWED'],
      codeStatus: { ROUTE_NOT_NAMED: 403, ROUTE_SIGNATURE_UNVERIFIED: 409 },
      precheck: h.precheck, run: h.run, afterSign: h.afterSign, afterCommit: h.afterCommit,
    });
  });
  return a;
}
const statements = () => h.query.mock.calls.map((c) => String(c[0]).split(/\s+/)[0]);

beforeEach(() => {
  vi.clearAllMocks();
  h.authority.mockResolvedValue(null); h.deps.mockReturnValue({ scoped: true });
  h.reverify.mockResolvedValue({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
  h.query.mockResolvedValue({ rows: [] });
  h.precheck.mockResolvedValue(undefined);
  h.run.mockResolvedValue({ target: 'qms-document:11', body: { signed: true } });
  h.afterSign.mockResolvedValue(undefined);
  h.afterCommit.mockResolvedValue(undefined);
  h.audit.mockResolvedValue({ actionId: 'action', auditId: 'audit', sha256Chain: 'chain' });
  h.signature.mockResolvedValue({ id: 501, signedAt: new Date('2026-10-29T00:00:00Z') });
});

describe('precheck: refused before authority and the credential (B7)', () => {
  it('a precheck refusal answers with its code and asks for no authority, no password and no transaction', async () => {
    h.precheck.mockRejectedValue(coded('ROUTE_NOT_NAMED'));
    const res = await request(app()).post('/sign').send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error.code).toBe('ROUTE_NOT_NAMED');
    expect(h.precheck).toHaveBeenCalledWith(client, 7, 42);
    expect(h.authority).not.toHaveBeenCalled();
    expect(h.deps).not.toHaveBeenCalled();
    expect(h.reverify).not.toHaveBeenCalled();
    expect(h.query).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
  });

  it('a precheck that passes is asked before the authority check', async () => {
    const order: string[] = [];
    h.precheck.mockImplementation(async () => { order.push('precheck'); });
    h.authority.mockImplementation(async () => { order.push('authority'); return null; });
    h.reverify.mockImplementation(async () => { order.push('credential'); return { ok: true, authenticationMethod: 'password', secondFactorVerified: false }; });
    const res = await request(app()).post('/sign').send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(order).toEqual(['precheck', 'authority', 'credential']);
  });
});

describe('afterSign: on the signing transaction, citing the signature (B7)', () => {
  it('runs after the signature row and before COMMIT, with the row’s id', async () => {
    const order: string[] = [];
    h.signature.mockImplementation(async () => { order.push('signature'); return { id: 501, signedAt: new Date('2026-10-29T00:00:00Z') }; });
    h.afterSign.mockImplementation(async (c: unknown, sig: { id: number }) => { order.push(`afterSign:${sig.id}:${c === client}`); });
    h.query.mockImplementation(async (sql: string) => { if (/^COMMIT/.test(sql)) order.push('COMMIT'); return { rows: [] }; });
    const res = await request(app()).post('/sign').send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.signatureId).toBe(501);
    expect(order).toEqual(['signature', 'afterSign:501:true', 'COMMIT']);
    expect(h.afterCommit).toHaveBeenCalledTimes(1);
  });

  it('a throw rolls back the act and its signature: no COMMIT, the refusal in its own words', async () => {
    h.afterSign.mockRejectedValue(coded('ROUTE_SIGNATURE_UNVERIFIED'));
    const res = await request(app()).post('/sign').send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('ROUTE_SIGNATURE_UNVERIFIED');
    expect(statements()).toContain('ROLLBACK');
    expect(statements()).not.toContain('COMMIT');
    expect(h.afterCommit).not.toHaveBeenCalled();
  });
});
