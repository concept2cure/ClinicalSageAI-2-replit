/**
 * POST /api/mdx/qms/documents/:id/approve is an electronic signature.
 *
 * VSR-001 F-3 (OQ-QMS-06): the route accepted an empty body and set an SOP
 * effective with no credential, no meaning and no signature row. This suite
 * pins each refusal and the one write path:
 *
 *   - empty body                     → 400, naming the missing components,
 *                                      nothing verified, nothing written
 *   - role without signing authority → 403 before the password is looked at
 *   - wrong password                 → 401, counted against the account,
 *                                      nothing written
 *   - a locked account               → 423 before the password is compared
 *   - an enrolled factor, no code    → 400 MFA_TOKEN_REQUIRED
 *   - author approving own document  → 403 QMS_SELF_APPROVAL, rolled back
 *   - a valid signing                → 200, ONE electronic_signatures write on
 *                                      the transaction, bound to the content
 *                                      digest, meaning APPROVED, COMMIT
 *   - the signature write throwing   → ROLLBACK, 500, document not effective
 *
 * Verified by making it fail: with the signature call removed from the
 * service, the "exactly one signature" and "digest-bound" assertions fail.
 *
 * The signer is re-verified by the platform's one ceremony
 * (services/part11/reverify-signer.ts), which runs for real here: only its
 * production wiring (reverify-signer-deps) is replaced by the account's state.
 * This route used a second implementation of the same policy
 * (ana-ri/governed-action-signoff.ts, now deleted) that did not keep the
 * account's lockout (F-27).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({
  query: vi.fn(),
  txQuery: vi.fn(),
  release: vi.fn(),
  compare: vi.fn(),
  failures: vi.fn(),
  account: { mfa: false, locked: false },
  role: vi.fn(),
  recordGoverned: vi.fn(),
  persistSignature: vi.fn(),
}));

vi.mock('../../db', () => ({
  pool: {
    query: (...a: unknown[]) => H.query(...a),
    connect: async () => ({ query: (...a: unknown[]) => H.txQuery(...a), release: H.release }),
  },
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: (plain: string, hash: string) => H.compare(plain, hash),
    isMfaEnabled: async () => H.account.mfa,
    verifyMfaToken: async (_id: number, token: string) => token === '123456',
    isAccountLocked: async () => H.account.locked,
    recordFailedAttempt: (id: number) => H.failures(id),
    warn: () => {},
  }),
}));
vi.mock('../../services/part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: (...a: unknown[]) => H.role(...a),
}));
vi.mock('../c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => H.recordGoverned(...a),
}));
vi.mock('../../services/part11/signature-persistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/part11/signature-persistence')>();
  return {
    ...real,
    persistGovernedActionSignature: (...a: unknown[]) => H.persistSignature(...a),
  };
});

import mdxQmsRouter from '../mdx-qms';
import {
  computeQmsDocumentContentDigest,
  QMS_DOCUMENT_BINDING_BASIS,
} from '../../services/qms/document-approval-signature';

const ORG = 9;
const SIGNER = 7;
const AUTHOR = 3;

const DRAFT = {
  id: 11, organization_id: ORG, doc_number: 'SOP-001', title: 'Design control', doc_type: 'sop',
  category: 'design', version: '1.0', status: 'draft', effective_date: null, next_review_date: '2027-01-01',
  author_id: AUTHOR, approver_id: null, approved_at: null, superseded_by_id: null, artifact_id: null,
  metadata: { sections: [{ key: 'purpose', body: 'Controls design inputs.' }] },
};

function app(userId = SIGNER) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: ORG, id: userId };
    next();
  });
  a.use('/api/mdx', mdxQmsRouter);
  return a;
}

const VALID_BODY = { password: 'correct horse', meaning: 'APPROVED', reason: 'Reviewed against QMSR 820.40; approved for release.' };

/** Transaction script: FOR UPDATE read returns `row`; UPDATE returns the effective row. */
function scriptTransaction(row: Record<string, unknown> | null) {
  H.txQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.startsWith('BEGIN') || text.startsWith('COMMIT') || text.startsWith('ROLLBACK')) return { rows: [] };
    if (text.includes('FOR UPDATE')) return { rows: row ? [row] : [] };
    if (text.startsWith('UPDATE qms_documents')) {
      return { rows: row ? [{ ...row, status: 'effective', approver_id: SIGNER, approved_at: '2026-09-21T10:00:00.000Z' }] : [] };
    }
    throw new Error(`unexpected transaction query: ${text.slice(0, 60)}`);
  });
}

const txStatements = () => H.txQuery.mock.calls.map((c) => String(c[0]).split(/\s+/)[0]);

beforeEach(() => {
  H.query.mockReset();
  H.txQuery.mockReset();
  H.release.mockReset();
  H.compare.mockReset();
  H.failures.mockReset();
  H.account = { mfa: false, locked: false };
  H.role.mockReset();
  H.recordGoverned.mockReset();
  H.persistSignature.mockReset();
  H.role.mockResolvedValue('admin');
  H.compare.mockImplementation(async (plain: string) => plain === 'correct horse');
  H.failures.mockResolvedValue(undefined);
  H.recordGoverned.mockResolvedValue({ actionId: 'act_1', auditId: 'aud-1', sha256Chain: 'chain-1' });
  H.persistSignature.mockResolvedValue({ id: 501, signedAt: new Date('2026-09-21T10:00:00.000Z') });
  scriptTransaction(DRAFT);
});

describe('POST /api/mdx/qms/documents/:id/approve — electronic signature', () => {
  it('refuses an empty body with 400 naming the missing signature components, and writes nothing', async () => {
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send({});
    expect(res.status).toBe(400);
    expect(res.body.details.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(res.body.error).toMatch(/password/);
    expect(res.body.error).toMatch(/APPROVED/);
    expect(res.body.error).toMatch(/reason/);
    expect(Object.keys(res.body.details.fieldErrors).sort()).toEqual(['meaning', 'password', 'reason']);
    expect(H.compare).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('refuses a meaning other than APPROVED — an approval means one thing', async () => {
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send({ ...VALID_BODY, meaning: 'REVIEWED' });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.meaning[0]).toMatch(/APPROVED/);
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('refuses a signer whose org role carries no signing authority with 403, before checking the password', async () => {
    H.role.mockResolvedValue('member');
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(res.body.details.code).toBe('QMS_NO_SIGNING_AUTHORITY');
    expect(H.compare).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('refuses a wrong password with 401, counts it against the account, and writes nothing', async () => {
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send({ ...VALID_BODY, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.details.code).toBe('PASSWORD_VERIFICATION_FAILED');
    expect(H.compare).toHaveBeenCalledWith('wrong', 'stored-hash');
    expect(H.failures).toHaveBeenCalledWith(SIGNER);
    expect(H.txQuery).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('refuses a locked account with 423 before its password is compared (F-27)', async () => {
    H.account.locked = true;
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(423);
    expect(res.body.details.code).toBe('ACCOUNT_LOCKED');
    expect(H.compare).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('refuses the password alone from a signer with an authenticator enrolled', async () => {
    H.account.mfa = true;
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.details.code).toBe('MFA_TOKEN_REQUIRED');
    expect(H.txQuery).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('refuses the author approving their own document with 403 and rolls back', async () => {
    const res = await request(app(AUTHOR)).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(res.body.details.code).toBe('QMS_SELF_APPROVAL');
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(H.persistSignature).not.toHaveBeenCalled();
    expect(H.release).toHaveBeenCalledTimes(1);
  });

  it('refuses a document that is not draft/in_review with 409', async () => {
    scriptTransaction({ ...DRAFT, status: 'effective' });
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('QMS_INVALID_STATE');
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('404s a document outside the tenant', async () => {
    scriptTransaction(null);
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(404);
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

});

describe('POST /api/mdx/qms/documents/:id/approve — the signed write path', () => {
  it('signs: one electronic_signatures write on the transaction, bound to the content digest, meaning APPROVED, then COMMIT', async () => {
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('effective');
    expect(res.body.data.approver_id).toBe(SIGNER);
    expect(res.body.meta.auditTrail).toEqual({ persisted: true, chained: true });

    // The write order: read under lock, update, ledger pair, signature, commit.
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']);
    expect(H.recordGoverned).toHaveBeenCalledTimes(1);
    expect(H.persistSignature).toHaveBeenCalledTimes(1);

    const [client, params] = H.persistSignature.mock.calls[0] as [unknown, Record<string, any>];
    // Same client as the transaction — not the pool.
    expect(typeof (client as { query: unknown }).query).toBe('function');
    expect(H.query).not.toHaveBeenCalled();
    expect(params.target).toBe('qms-document:11');
    expect(params.payload).toEqual({ meaning: 'APPROVED' });
    expect(params.reason).toBe(VALID_BODY.reason);
    expect(params.authenticationMethod).toBe('password');
    expect(params.secondFactorVerified).toBe(false);
    expect(params.binding.basis).toBe(QMS_DOCUMENT_BINDING_BASIS);
    expect(params.binding.digest).toBe(computeQmsDocumentContentDigest(DRAFT as any));
    expect(params.binding.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(params.actionId).toBe('act_1');
    expect(params.sha256Chain).toBe('chain-1');

    // The ledger pair carries the reason and the same digest.
    const gov = H.recordGoverned.mock.calls[0][1] as Record<string, any>;
    expect(gov.command).toBe('approve');
    expect(gov.target).toBe('qms-document:11');
    expect(gov.reason).toBe(VALID_BODY.reason);
    expect(gov.payload.contentDigest).toBe(params.binding.digest);

    expect(res.body.meta.signature).toMatchObject({
      id: 501, meaning: 'APPROVED', boundPayloadDigest: params.binding.digest,
      bindingBasis: QMS_DOCUMENT_BINDING_BASIS, actionId: 'act_1', auditId: 'aud-1',
    });
  });

  it('records password+totp only when the verifier actually verified a second factor', async () => {
    H.account.mfa = true;
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send({ ...VALID_BODY, mfaToken: '123456' });
    expect(res.status).toBe(200);
    const params = H.persistSignature.mock.calls[0][1] as Record<string, any>;
    expect(params.authenticationMethod).toBe('password+totp');
    expect(params.secondFactorVerified).toBe(true);
  });

  it('rolls the approval back when the signature row cannot be written — never effective without a signature', async () => {
    H.persistSignature.mockRejectedValue(new Error('electronic_signatures insert failed'));
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(500);
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'ROLLBACK']);
    expect(H.release).toHaveBeenCalledTimes(1);
  });
});
