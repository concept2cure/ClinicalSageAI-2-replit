/**
 * The QMS decisions that are signed acts (2026-10-29): a nonconformance's
 * disposition (PATCH /api/mdx/qms/nonconforming/:id/disposition) and a
 * supplier's approval standing (POST /api/mdx/qms/suppliers/:id/approval). Each
 * commits only with its ledger pair and its electronic signature, and a refusal
 * writes nothing. A disposition's rationale is the signer's reason.
 * The ceremony's own rules (lockout, second factor, authority) have their
 * suites; the domain SQL has its PGlite test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const GOOD = 'correct horse battery staple';
const REASON = 'Re-test after column replacement confirmed a lab error.';
const H = vi.hoisted(() => ({ log: [] as string[], disposition: null as string | null, standing: 'pending' as string }));

type Rows = { rows: Array<Record<string, unknown>>; rowCount: number };
const none: Rows = { rows: [], rowCount: 0 };
const one = (row: Record<string, unknown>): Rows => ({ rows: [row], rowCount: 1 });

/* The domain SQL each signed decision sends, by statement. Each update logs
   DOMAIN, so its order against the ledger and the signature is visible. */
const DOMAIN: Array<[RegExp, (p: unknown[]) => Rows]> = [
  [/^\s*UPDATE qms_nonconforming_products/, (p) => {
    if (H.disposition && H.disposition !== 'pending') return none;
    H.log.push(`DOMAIN:${String(p[2])}:${String(p[3])}`);
    H.disposition = String(p[2]);
    return one({ id: 4, nc_number: 'NC-2026-004', disposition: p[2], disposition_rationale: p[3] });
  }],
  [/SELECT disposition FROM qms_nonconforming_products/, () => one({ disposition: H.disposition })],
  [/^\s*UPDATE qms_suppliers/, (p) => {
    if (H.standing === p[2]) return none;
    H.log.push(`DOMAIN:${String(p[2])}`);
    H.standing = String(p[2]);
    return one({ id: 12, supplier_name: 'Acme Resins', supplier_code: null, approval_status: p[2], next_audit_date: null, reapproval_date: null });
  }],
  [/SELECT approval_status FROM qms_suppliers/, () => one({ approval_status: H.standing })],
];

const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    const word = sql.trim().split(/\s+/)[0].toUpperCase();
    if (word === 'BEGIN' || word === 'COMMIT' || word === 'ROLLBACK') H.log.push(word);
    const handler = DOMAIN.find(([pattern]) => pattern.test(sql))?.[1];
    return handler ? handler(params) : none;
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

beforeEach(() => { H.log.length = 0; H.disposition = null; H.standing = 'pending'; client.query.mockClear(); });

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

const approve = (body: Record<string, unknown>) => request(app()).post('/api/mdx/qms/suppliers/12/approval').send(body);

describe("a supplier's approval standing is a signed act", () => {
  it('commits the standing with its ledger pair and signature', async () => {
    const res = await approve({ approvalStatus: 'approved', reason: 'Qualification audit passed with no findings.', meaning: 'approval', password: GOOD });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ data: { approval_status: 'approved' }, signatureId: 314 });
    expect(H.log).toEqual(['BEGIN', 'DOMAIN:approved', 'LEDGER:sign:qms-supplier:12', 'SIGNATURE:qms-supplier:12', 'COMMIT']);
  });

  it('refuses the standing through the unsigned writes, as pending, or unchanged, and signs nothing', async () => {
    // Beside another field, the standing is refused, never dropped while the rest is written.
    expect((await request(app()).patch('/api/mdx/qms/suppliers/12').send({ approvalStatus: 'revoked', nextAuditDate: '2026-12-01' })).status).toBe(422);
    expect((await request(app()).post('/api/mdx/qms/suppliers').send({ supplierName: 'New Co', criticality: 'major', approvalStatus: 'approved' })).status).toBe(422);
    expect((await approve({ approvalStatus: 'pending', reason: 'Back to pending for review.', meaning: 'approval', password: GOOD })).status).toBe(400);
    H.standing = 'approved';
    const same = await approve({ approvalStatus: 'approved', reason: 'Approve it again for good measure.', meaning: 'approval', password: GOOD });
    expect([same.status, same.body.error?.code]).toEqual([409, 'SUPPLIER_STANDING_UNCHANGED']);
    expect(H.log.filter((e) => e.startsWith('DOMAIN') || e.startsWith('SIGNATURE'))).toEqual([]);
  });
});
