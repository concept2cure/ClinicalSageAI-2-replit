/**
 * PATCH /api/mdx/qms/nonconforming/:id/disposition is a signed act (2026-10-29):
 * the disposition commits only with its ledger pair and its electronic
 * signature, the signer's reason is its rationale, and a refusal writes nothing.
 * The ceremony's own rules (lockout, second factor, authority) have their
 * suites; the domain SQL has its PGlite test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const GOOD = 'correct horse battery staple';
const REASON = 'Re-test after column replacement confirmed a lab error.';
const H = vi.hoisted(() => ({ log: [] as string[], disposition: null as string | null }));

const client = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    const word = sql.trim().split(/\s+/)[0].toUpperCase();
    if (word === 'BEGIN' || word === 'COMMIT' || word === 'ROLLBACK') H.log.push(word);
    if (/^\s*UPDATE qms_nonconforming_products/.test(sql)) {
      if (H.disposition && H.disposition !== 'pending') return { rows: [], rowCount: 0 };
      H.log.push(`DOMAIN:${String(params?.[2])}:${String(params?.[3])}`);
      H.disposition = String(params?.[2]);
      return { rows: [{ id: 4, nc_number: 'NC-2026-004', disposition: params?.[2], disposition_rationale: params?.[3] }], rowCount: 1 };
    }
    if (/SELECT disposition FROM qms_nonconforming_products/.test(sql)) return { rows: [{ disposition: H.disposition }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }),
  release: vi.fn(),
};
vi.mock('../../db', () => ({ pool: { connect: vi.fn(async () => client), query: vi.fn(async () => ({ rows: [] })) }, db: {} }));
vi.mock('../../db/requestDb', async (orig) => ({ ...(await orig<object>()), requestPgClient: () => client }));
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../middleware/orgMembership', async (orig) => ({
  ...(await orig<typeof import('../../middleware/orgMembership')>()),
  requireEditorAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../services/part11/reverify-signer', () => ({
  reverifySigner: vi.fn(async (_u: number, creds: { password?: string }) => creds.password === GOOD
    ? { ok: true, authenticationMethod: 'password', secondFactorVerified: false }
    : { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'The password was not accepted.' }),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: vi.fn(async () => 'admin') }));
vi.mock('../c2c/actions', () => ({
  recordGovernedAction: vi.fn(async (_c: unknown, p: { command: string; target: string }) => {
    H.log.push(`LEDGER:${p.command}:${p.target}`);
    return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1' };
  }),
}));
vi.mock('../../services/part11/signature-persistence', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGovernedSignSignature: vi.fn(async (_c: unknown, p: { target: string }) => {
    H.log.push(`SIGNATURE:${p.target}`);
    return { id: 314, signedAt: new Date('2026-10-29T12:00:00Z') };
  }),
}));

import mdxQmsRouter from '../mdx-qms';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: { organizationId: 9, id: 7 }, userId: 7, dbClient: client });
    next();
  });
  a.use('/api/mdx', mdxQmsRouter);
  return a;
}
const sign = (body: Record<string, unknown>) => request(app()).patch('/api/mdx/qms/nonconforming/4/disposition').send(body);

beforeEach(() => { H.log.length = 0; H.disposition = null; client.query.mockClear(); });

describe('a nonconformance disposition is a signed act', () => {
  it('commits the disposition with its ledger pair and signature, the reason as its rationale', async () => {
    const res = await sign({ disposition: 'rework', reason: REASON, meaning: 'approval', password: GOOD });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ data: { disposition: 'rework', disposition_rationale: REASON }, signatureId: 314, meaning: 'approval' });
    expect(H.log).toEqual(['BEGIN', `DOMAIN:rework:${REASON}`, 'LEDGER:sign:qms-nonconforming:4', 'SIGNATURE:qms-nonconforming:4', 'COMMIT']);
  });

  it('writes nothing without the signature, with a wrong password, or as pending', async () => {
    expect((await sign({ disposition: 'rework', dispositionRationale: REASON })).status).toBe(400);
    expect((await sign({ disposition: 'rework', reason: REASON, meaning: 'approval', password: 'wrong' })).status).toBe(401);
    expect((await sign({ disposition: 'pending', reason: REASON, meaning: 'approval', password: GOOD })).status).toBe(400);
    expect((await sign({ disposition: 'rework', reason: REASON, meaning: 'review', password: GOOD })).status).toBe(400);
    expect(H.log.filter((e) => e.startsWith('DOMAIN') || e.startsWith('SIGNATURE'))).toEqual([]);
  });

  it('refuses a second disposition and signs nothing', async () => {
    H.disposition = 'scrap';
    const res = await sign({ disposition: 'use_as_is', reason: REASON, meaning: 'responsibility', password: GOOD });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'NC_ALREADY_DISPOSITIONED' });
    expect(H.log).toEqual(['BEGIN', 'ROLLBACK']);
  });
});
