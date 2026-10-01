/**
 * POST /api/mdx/qms/documents/:id/retire is an electronic signature.
 *
 * Security review 2026-09-24, DP-32 (remediation plan P1-29). Retiring a
 * controlled document is the terminal transition of an effective procedure: it
 * takes the document out of use for everyone trained on it. Until this change
 * the route was an editor-gated, autocommitted UPDATE with a reason (6582e3a3
 * made the reason mandatory and gated the role, 2026-09-25) and nothing else:
 * no re-authentication, no signing authority, no meaning, no
 * electronic_signatures row, and the audit row was written after the write.
 * Under §11.50 the transition that ends a controlled document's effect is a
 * signed record, as the approval that began it already is (VSR-001 F-3).
 *
 * The route now runs the approve ceremony and the service sibling
 * `retireQmsDocumentSigned`. Body = the approve body without effectiveDate;
 * the reason keeps the floor 6582e3a3 set (8). In the order checked:
 *
 *   - viewer                        → 403 before any query (requireEditorAccess, kept)
 *   - a reason alone                → 400 ESIGNATURE_COMPONENT_MISSING naming
 *                                     password and meaning; nothing verified,
 *                                     nothing written. THE RED-FIRST CASE: on
 *                                     the head before this change it was 200
 *                                     and the UPDATE ran on the pool.
 *   - reason under the floor        → 400, fieldErrors.reason
 *   - no signing authority          → 403 before the password is looked at
 *   - wrong password                → 401, counted against the account
 *   - a locked account              → 423 before the password is compared
 *   - an enrolled factor, no code   → 400 MFA_TOKEN_REQUIRED
 *   - already retired               → 409 QMS_INVALID_STATE, rolled back
 *   - outside the tenant            → 404
 *   - a valid signing               → 200: the UPDATE, ONE chained ledger row
 *                                     (command 'retire') and ONE signature bound
 *                                     to the content digest, meaning APPROVED, on
 *                                     one transaction, then COMMIT; the pool is
 *                                     never written to
 *   - the signature write throwing  → ROLLBACK, 500, the caught text not echoed
 *
 * The ceremony (reverifySigner) runs for real; only its production wiring is
 * replaced by the account's state, as in qms-document-approval-signature.test.ts.
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
  account: { mfa: false, locked: false, active: true },
  role: vi.fn(),
  recordGoverned: vi.fn(),
  persistSignature: vi.fn(),
}));

vi.mock('../../db', () => ({
  pool: {
    query: (...a: unknown[]) => H.query(...a),
    connect: async () => ({ query: (...a: unknown[]) => H.txQuery(...a), release: H.release }),
  },
  getPool: () => ({ query: (...a: unknown[]) => H.query(...a) }),
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
    isAccountActive: async () => H.account.active,
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
  return { ...real, persistGovernedActionSignature: (...a: unknown[]) => H.persistSignature(...a) };
});

import mdxQmsRouter from '../mdx-qms';
import {
  computeQmsDocumentContentDigest,
  QMS_DOCUMENT_BINDING_BASIS,
} from '../../services/qms/document-approval-signature';

const ORG = 7;
const SIGNER = 42;
const AUTHOR = 3;

/** An effective SOP, approved by someone else earlier; the row the retirement reads under lock. */
const EFFECTIVE = {
  id: 5, organization_id: ORG, doc_number: 'SOP-900', title: 'Complaint handling', doc_type: 'sop',
  category: 'quality', version: '1.0', status: 'effective', effective_date: '2026-06-01', next_review_date: '2027-06-01',
  author_id: AUTHOR, approver_id: 9, approved_at: '2026-06-01T09:00:00.000Z', superseded_by_id: null, artifact_id: null,
  metadata: {
    sections: [{ key: 'purpose', body: 'How complaints are received and trended.' }],
    approval: { reason: 'Released.', meaning: 'APPROVED', contentDigest: 'a'.repeat(64) },
  },
};

const REASON = 'Superseded by SOP-901 rev 4.';
const VALID_BODY = { password: 'correct horse', meaning: 'APPROVED', reason: REASON };

/** The register's editor gate is real here: the role travels on the request as the session middleware sets it. */
function appAs(role: string, userId = SIGNER) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: userId, organizationId: ORG, role };
    (req as unknown as { userRole: string }).userRole = role;
    (req as unknown as { tenantId: number }).tenantId = ORG;
    next();
  });
  app.use('/api/mdx', mdxQmsRouter);
  return app;
}
const retire = (role: string, body: Record<string, unknown>, userId = SIGNER) =>
  request(appAs(role, userId)).post('/api/mdx/qms/documents/5/retire').send(body);

/** Transaction script: FOR UPDATE read returns `row`; the UPDATE returns it retired, or nothing when it already is. */
function scriptTransaction(row: Record<string, unknown> | null) {
  H.txQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text)) return { rows: [] };
    if (text.includes('FOR UPDATE')) return { rows: row ? [row] : [] };
    if (/^\s*UPDATE qms_documents/i.test(text)) {
      if (!row || row.status === 'retired') return { rows: [] };
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return { rows: [{ ...row, status: 'retired', metadata: { ...metadata, retired: { reason: REASON } } }] };
    }
    throw new Error(`unexpected transaction query: ${text.slice(0, 60)}`);
  });
}

const txStatements = () => H.txQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0]);

beforeEach(() => {
  for (const f of [H.query, H.txQuery, H.release, H.compare, H.failures, H.role, H.recordGoverned, H.persistSignature]) f.mockReset();
  H.account = { mfa: false, locked: false, active: true };
  // The pool answers the way the OLD route's autocommitted UPDATE needed it to,
  // so a regression to that write is seen as a 200 here, not as a crash.
  H.query.mockResolvedValue({ rows: [{ ...EFFECTIVE, status: 'retired' }] });
  H.role.mockResolvedValue('admin');
  H.compare.mockImplementation(async (plain: string) => plain === 'correct horse');
  H.failures.mockResolvedValue(undefined);
  H.recordGoverned.mockResolvedValue({ actionId: 'act_9', auditId: 'aud-9', sha256Chain: 'c'.repeat(64) });
  H.persistSignature.mockResolvedValue({ id: 601, signedAt: new Date('2026-09-26T12:00:00.000Z') });
  scriptTransaction(EFFECTIVE);
});

describe('POST /api/mdx/qms/documents/:id/retire — the refusals', () => {
  it('refuses a viewer before touching the database or the signer (403)', async () => {
    const res = await retire('viewer', VALID_BODY);
    expect(res.status).toBe(403);
    expect(H.query).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
    expect(H.role).not.toHaveBeenCalled();
    expect(H.compare).not.toHaveBeenCalled();
  });

  it('a reason alone does not retire: 400 ESIGNATURE_COMPONENT_MISSING naming password and meaning; nothing verified, nothing written', async () => {
    const res = await retire('member', { reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.details.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(res.body.error).toMatch(/password/);
    expect(res.body.error).toMatch(/APPROVED/);
    expect(Object.keys(res.body.details.fieldErrors).sort()).toEqual(['meaning', 'password']);
    expect(H.role).not.toHaveBeenCalled();
    expect(H.compare).not.toHaveBeenCalled();
    expect(H.query).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('an empty body names every missing component', async () => {
    const res = await retire('member', {});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details.fieldErrors).sort()).toEqual(['meaning', 'password', 'reason']);
    expect(H.query).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
  });

  it('refuses a reason shorter than the floor (8) before verifying anything', async () => {
    const res = await retire('member', { ...VALID_BODY, reason: 'old' });
    expect(res.status).toBe(400);
    expect(res.body.details.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(res.body.details.fieldErrors.reason[0]).toMatch(/at least 8 characters/);
    expect(H.compare).not.toHaveBeenCalled();
    expect(H.query).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
  });

  it('refuses a meaning other than APPROVED', async () => {
    const res = await retire('member', { ...VALID_BODY, meaning: 'REVIEWED' });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.meaning[0]).toMatch(/APPROVED/);
    expect(H.txQuery).not.toHaveBeenCalled();
  });

  it('refuses an editor whose org role carries no signing authority with 403, before the password is looked at', async () => {
    H.role.mockResolvedValue('member');
    const res = await retire('member', VALID_BODY);
    expect(res.status).toBe(403);
    expect(res.body.details.code).toBe('QMS_NO_SIGNING_AUTHORITY');
    expect(res.body.error).toMatch(/retir/i);
    expect(H.compare).not.toHaveBeenCalled();
    expect(H.query).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
  });

  it('refuses a wrong password with 401, counts it against the account, and writes nothing', async () => {
    const res = await retire('member', { ...VALID_BODY, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.details.code).toBe('PASSWORD_VERIFICATION_FAILED');
    expect(H.compare).toHaveBeenCalledWith('wrong', 'stored-hash');
    expect(H.failures).toHaveBeenCalledWith(SIGNER);
    expect(H.query).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('refuses a locked account with 423 before its password is compared', async () => {
    H.account.locked = true;
    const res = await retire('member', VALID_BODY);
    expect(res.status).toBe(423);
    expect(res.body.details.code).toBe('ACCOUNT_LOCKED');
    expect(H.compare).not.toHaveBeenCalled();
    expect(H.txQuery).not.toHaveBeenCalled();
  });

  it('refuses the password alone from a signer with an authenticator enrolled', async () => {
    H.account.mfa = true;
    const res = await retire('member', VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.details.code).toBe('MFA_TOKEN_REQUIRED');
    expect(H.txQuery).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('refuses a document that is already retired with 409 and rolls back', async () => {
    scriptTransaction({ ...EFFECTIVE, status: 'retired' });
    const res = await retire('member', VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('QMS_INVALID_STATE');
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(H.recordGoverned).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
    expect(H.release).toHaveBeenCalledTimes(1);
  });

  it('404s a document outside the tenant', async () => {
    scriptTransaction(null);
    const res = await retire('member', VALID_BODY);
    expect(res.status).toBe(404);
    expect(H.persistSignature).not.toHaveBeenCalled();
  });
});

describe('POST /api/mdx/qms/documents/:id/retire — the signed write path', () => {
  it('signs: the UPDATE, one ledger row (command retire) and one signature bound to the content digest, meaning APPROVED, then COMMIT', async () => {
    const res = await retire('member', VALID_BODY);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('retired');
    expect(res.body.meta.auditTrail).toEqual({ persisted: true, chained: true });

    // Read under lock, update, ledger pair, signature, commit — on the transaction client, never the pool.
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']);
    expect(H.query).not.toHaveBeenCalled();
    const update = H.txQuery.mock.calls.find((c) => /^\s*UPDATE/.test(String(c[0]))) as [string, unknown[]];
    expect(update[0]).toMatch(/SET status = 'retired'/);
    expect(update[0]).toMatch(/status <> 'retired'/);
    expect(update[1]).toContain(REASON);

    expect(H.recordGoverned).toHaveBeenCalledTimes(1);
    const gov = H.recordGoverned.mock.calls[0][1] as Record<string, any>;
    expect(gov).toMatchObject({ command: 'retire', target: 'qms-document:5', reason: REASON, userId: SIGNER, orgId: ORG, domain: 'qms' });
    expect(gov.payload).toMatchObject({ meaning: 'APPROVED', fromStatus: 'effective', toStatus: 'retired', docNumber: 'SOP-900', version: '1.0' });

    expect(H.persistSignature).toHaveBeenCalledTimes(1);
    const [client, sig] = H.persistSignature.mock.calls[0] as [unknown, Record<string, any>];
    expect(typeof (client as { query: unknown }).query).toBe('function');
    expect(sig.target).toBe('qms-document:5');
    expect(sig.signatureType).toBe('qms-document-retirement');
    expect(sig.command).toBe('retire');
    expect(sig.payload).toEqual({ meaning: 'APPROVED' });
    expect(sig.reason).toBe(REASON);
    expect(sig.authenticationMethod).toBe('password');
    expect(sig.secondFactorVerified).toBe(false);
    expect(sig.binding.basis).toBe(QMS_DOCUMENT_BINDING_BASIS);
    expect(sig.binding.digest).toMatch(/^[0-9a-f]{64}$/);
    // Bound to the version content as read under lock (the fixture carries no prior retirement stamp).
    expect(sig.binding.digest).toBe(computeQmsDocumentContentDigest(EFFECTIVE as any));
    expect(gov.payload.contentDigest).toBe(sig.binding.digest);
    expect(update[1]).toContain(sig.binding.digest);
    expect(sig.actionId).toBe('act_9');
    expect(sig.sha256Chain).toBe('c'.repeat(64));

    expect(res.body.meta.signature).toMatchObject({
      id: 601, meaning: 'APPROVED', boundPayloadDigest: sig.binding.digest,
      bindingBasis: QMS_DOCUMENT_BINDING_BASIS, actionId: 'act_9', auditId: 'aud-9',
    });
  });

  it('keeps today\'s admissibility: a draft can be retired too, and the ledger says where it came from', async () => {
    scriptTransaction({ ...EFFECTIVE, status: 'draft', approver_id: null, approved_at: null });
    const res = await retire('member', VALID_BODY);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const gov = H.recordGoverned.mock.calls[0][1] as Record<string, any>;
    expect(gov.payload.fromStatus).toBe('draft');
    expect(H.persistSignature).toHaveBeenCalledTimes(1);
  });

  it('records password+totp only when the verifier actually verified a second factor', async () => {
    H.account.mfa = true;
    const res = await retire('member', { ...VALID_BODY, mfaToken: '123456' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const sig = H.persistSignature.mock.calls[0][1] as Record<string, any>;
    expect(sig.authenticationMethod).toBe('password+totp');
    expect(sig.secondFactorVerified).toBe(true);
  });

  it('rolls the retirement back when the signature row cannot be written, and echoes none of the caught text', async () => {
    H.persistSignature.mockRejectedValue(new Error('electronic_signatures insert failed'));
    const res = await retire('member', VALID_BODY);
    expect(res.status).toBe(500);
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'ROLLBACK']);
    expect(JSON.stringify(res.body)).not.toMatch(/insert failed/);
    expect(H.release).toHaveBeenCalledTimes(1);
  });
});
