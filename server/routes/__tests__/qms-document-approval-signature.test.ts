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
 *   - a suspended account            → 401 ACCOUNT_INACTIVE, nothing compared (F-28)
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
import type { RequestSqlClient } from '../../db/requestDb';

const H = vi.hoisted(() => ({
  query: vi.fn(),
  txQuery: vi.fn(),
  release: vi.fn(),
  discard: vi.fn(),
  compare: vi.fn(),
  failures: vi.fn(),
  account: { mfa: false, locked: false, active: true },
  role: vi.fn(),
  recordGoverned: vi.fn(),
  persistSignature: vi.fn(),
}));
// Fresh program/private-object authorization has a real persistence regression in the QMS lifecycle suite.
vi.mock('../../services/authoring/authoring-program-access',()=>({authorizeAuthoringProgram:async()=>({principal:{id:'7',email:null,roles:['ADMIN']}}),AuthoringProgramAccessError:class extends Error{}}));

// Training tasks are planned after COMMIT in their own read-only transaction (services/qms/training-task.ts,
// tests/db/qms-training-tasks.dbtest.ts); here, only that the route asks once the act has committed.
const T = vi.hoisted(() => ({ tasks: vi.fn(async (..._args: unknown[]) => undefined) }));
vi.mock('../../services/qms/training-task', () => ({ reconcileTrainingTasks: (...args: unknown[]) => T.tasks(...args) }));
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
  authoring_document_id: '00000000-0000-4000-8000-000000000011',
  metadata: { sections: [{ key: 'purpose', label: 'Purpose' }] },
};
/** The approvable state: a draft that was sent for review. */
const IN_REVIEW = { ...DRAFT, status: 'in_review' };
const AUTHORED_CONTENT = { documentId: DRAFT.authoring_document_id, programId: '00000000-0000-4000-8000-000000000012', title: DRAFT.title,
  sections: [{ id: 'section', code: 'qms-purpose', title: 'Purpose', content: 'Controls design inputs.', orderIndex: 1 }] };

function app(userId = SIGNER, pinned = true) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: ORG, id: userId };
    // The admitted request owns one connection; the two scripts distinguish
    // reads before BEGIN from the same connection's transaction statements.
    let inTransaction = false;
    if (pinned) (req as unknown as { dbClient: RequestSqlClient }).dbClient = { query: async (sql: string, params?: unknown[]) => {
      if (/^BEGIN/.test(sql)) inTransaction = true;
      const result = await (inTransaction ? H.txQuery : H.query)(sql, params);
      if (/^(COMMIT|ROLLBACK)/.test(sql)) inTransaction = false;
      return result;
    }, discard: H.discard };
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
    if (text.includes('FROM authoring_documents')) return { rows: [{ id: DRAFT.authoring_document_id, title: DRAFT.title, client_program_id: AUTHORED_CONTENT.programId }] };
    if (text.includes('FROM authoring_sections')) return { rows: [{ id: 'section', code: 'qms-purpose', title: 'Purpose', content: 'Controls design inputs.', order_index: 1 }] };
    // RR4: the approval asks the document's review route; these documents have none (today's rule).
    if (text.includes('FROM review_routes')) return { rows: [] };
    if (text.includes('FOR UPDATE')) return { rows: row ? [row] : [] };
    // The filing-agreement check (338fda664) asks first whether a filing store exists. A
    // controlled procedure is usually bound to no filing, so it answers "nothing to compare".
    if (text.includes("to_regclass('public.c2c_document_sections')")) return { rows: [{ ok: false }] };
    if (text.startsWith('INSERT INTO qms_document_versions') || text.startsWith('UPDATE authoring_documents')) return { rows: [] };
    if (text.startsWith('UPDATE qms_documents')) {
      return { rows: row ? [{ ...row, status: 'effective', approver_id: SIGNER, approved_at: '2026-09-21T10:00:00.000Z' }] : [] };
    }
    throw new Error(`unexpected transaction query: ${text.slice(0, 60)}`);
  });
}

const txStatements = () => H.txQuery.mock.calls.map((c) => String(c[0]).split(/\s+/)[0]);

describe('QMS approval rechecks on the reserved request connection', () => {
  it('refuses an actor now demoted after an earlier allowed authority read without writing or signing', async () => {
    H.role.mockResolvedValueOnce('admin').mockResolvedValue('viewer');
    const response = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(response.status).toBe(403);
    expect(response.body.details.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(H.txQuery.mock.calls.some(call => String(call[0]).includes('FOR UPDATE'))).toBe(true);
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(H.recordGoverned).not.toHaveBeenCalled(); expect(H.persistSignature).not.toHaveBeenCalled();
    expect(H.release).not.toHaveBeenCalled();
  });

  it('returns safe unavailable when current authority cannot be read on the actual signing client', async () => {
    H.role.mockResolvedValueOnce('admin').mockRejectedValueOnce(new Error('Private database diagnostic for this fixture'));
    const response = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(response.status).toBe(503);
    expect(response.body.details.code).toBe('SIGNING_AUTHORITY_UNVERIFIED');
    expect(JSON.stringify(response.body)).not.toContain('Private database diagnostic');
    expect(H.recordGoverned).not.toHaveBeenCalled(); expect(H.persistSignature).not.toHaveBeenCalled();
    expect(txStatements().at(-1)).toBe('ROLLBACK');
  });

  it('has no pooled fallback when the request-owned database context is missing', async () => {
    const response = await request(app(SIGNER, false)).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(response.status).toBe(500);
    expect(H.txQuery).not.toHaveBeenCalled(); expect(H.query).not.toHaveBeenCalled();
    expect(H.recordGoverned).not.toHaveBeenCalled(); expect(H.persistSignature).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  T.tasks.mockClear();
  H.query.mockReset();
  H.txQuery.mockReset();
  H.release.mockReset();
  H.discard.mockReset();
  H.compare.mockReset();
  H.failures.mockReset();
  H.account = { mfa: false, locked: false, active: true };
  H.role.mockReset();
  H.recordGoverned.mockReset();
  H.persistSignature.mockReset();
  H.role.mockResolvedValue('admin');
  H.compare.mockImplementation(async (plain: string) => plain === 'correct horse');
  H.failures.mockResolvedValue(undefined);
  H.recordGoverned.mockResolvedValue({ actionId: 'act_1', auditId: 'aud-1', sha256Chain: 'chain-1' });
  H.persistSignature.mockResolvedValue({ id: 501, signedAt: new Date('2026-09-21T10:00:00.000Z') });
  // RR4: before the credential, the approval asks whether the document is on a review route (none here).
  H.query.mockImplementation(async (sql: string) => (String(sql).includes('FROM qms_documents') ? { rows: [IN_REVIEW] } : { rows: [] }));
  scriptTransaction(IN_REVIEW);
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

  it('refuses an account that is not active before its password is compared (F-28)', async () => {
    H.account.active = false;
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status, 'a suspended account approved a controlled document').toBe(401);
    expect(res.body.details.code).toBe('ACCOUNT_INACTIVE');
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
    expect(H.release).not.toHaveBeenCalled(); // Response completion owns release.
  });

  it('refuses a document that is not in_review with 409', async () => {
    scriptTransaction({ ...DRAFT, status: 'effective' });
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('QMS_INVALID_STATE');
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  /* QA walk 2026-10-08 (J8): the register offered Approve on a draft that was
     never routed, its dialog said "v1.2 becomes effective when you sign", and
     the service admitted draft — one signature made an unreviewed draft
     effective. A draft is sent for review first (PATCH status in_review); only
     a document under review can be signed effective. */
  it('refuses a draft that was never sent for review with 409, writing no signature', async () => {
    scriptTransaction(DRAFT);
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('QMS_INVALID_STATE');
    expect(res.body.error).toMatch(/send it for review/i);
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(H.recordGoverned).not.toHaveBeenCalled();
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('404s a document outside the tenant', async () => {
    scriptTransaction(null);
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(404);
    expect(H.persistSignature).not.toHaveBeenCalled();
  });

});

describe('POST /api/mdx/qms/documents/:id/approve — controlled-text authorship', () => {
  it.each([AUTHOR, null])('refuses a protected controlled-text contributor regardless of original author %s', async authorId => {
    scriptTransaction({ ...IN_REVIEW, author_id: authorId,
      metadata: { ...IN_REVIEW.metadata, controlledTextAuthorship: { authorUserIds: [SIGNER] } } });
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(403); expect(res.body.details.code).toBe('QMS_SELF_APPROVAL');
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(H.recordGoverned).not.toHaveBeenCalled(); expect(H.persistSignature).not.toHaveBeenCalled();
  });

  it('fails closed on malformed protected authorship without signing or mutation', async () => {
    scriptTransaction({ ...IN_REVIEW,
      metadata: { ...IN_REVIEW.metadata, controlledTextAuthorship: { authorUserIds: [String(SIGNER)] } } });
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(409); expect(res.body.details.code).toBe('QMS_INVALID_AUTHORSHIP');
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(H.recordGoverned).not.toHaveBeenCalled(); expect(H.persistSignature).not.toHaveBeenCalled();
  });
});

describe('POST /api/mdx/qms/documents/:id/approve — the signed write path', () => {
  it('permits an uninvolved signer and records enforced two-person attribution when contributors exist without an original author', async () => {
    scriptTransaction({ ...IN_REVIEW, author_id: null,
      metadata: { ...IN_REVIEW.metadata, controlledTextAuthorship: { authorUserIds: [8] } } });
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(H.persistSignature).toHaveBeenCalledTimes(1);
    expect(H.persistSignature.mock.calls[0][1].extraManifest).toMatchObject({ twoPersonRule: 'enforced' });
  });
  /* CAT2-19 (2026-10-29): the version is effective from the date the approver
     signs, never the prior version's; a past date is refused; the date is in
     the signature's manifest. */
  it('is effective from the approval day when no date is given, never the prior date, and the manifest binds it', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(200);
    const update = H.txQuery.mock.calls.find((c) => String(c[0]).startsWith('UPDATE qms_documents'))!;
    expect(String(update[0])).toMatch(/effective_date = \$4::date,/);
    expect((update[1] as unknown[])[3]).toBe(today);
    const [, params] = H.persistSignature.mock.calls[0] as [unknown, Record<string, any>];
    expect(params.extraManifest).toMatchObject({ effectiveDate: today });
    expect((H.recordGoverned.mock.calls[0] as [unknown, Record<string, any>])[1].payload).toMatchObject({ effectiveDate: today });
  });

  it('refuses an effective date before the database day with 422, and signs nothing', async () => {
    const scripted = H.txQuery.getMockImplementation()!;
    H.txQuery.mockImplementation(async (sql: string, args?: unknown[]) =>
      (String(sql).includes('< CURRENT_DATE AS backdated') ? { rows: [{ backdated: true }] } : scripted(sql, args)));
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send({ ...VALID_BODY, effectiveDate: '2020-01-01' });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.details.code).toBe('QMS_EFFECTIVE_DATE_BACKDATED');
    expect(H.txQuery.mock.calls.some((c) => String(c[0]).startsWith('UPDATE qms_documents'))).toBe(false);
    expect(H.persistSignature).not.toHaveBeenCalled();
    expect(H.recordGoverned).not.toHaveBeenCalled();
  });

  it('signs: one electronic_signatures write on the transaction, bound to the content digest, meaning APPROVED, then COMMIT', async () => {
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('effective');
    expect(res.body.data.approver_id).toBe(SIGNER);
    expect(res.body.meta.auditTrail).toEqual({ persisted: true, chained: true });

    // The write order: read under lock, update, ledger pair, signature, commit.
    // Five reads before the first write: the fifth is the filing-agreement check (338fda664), which precedes every write.
    // The sixth SELECT is the review route's (RR4): the document has none, so today's rule approves it.
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'UPDATE', 'INSERT', 'UPDATE', 'COMMIT']);
    expect(H.recordGoverned).toHaveBeenCalledTimes(1);
    expect(T.tasks, 'the people assigned get their tasks after the commit').toHaveBeenCalledExactlyOnceWith(expect.anything(), ORG, { documentIds: [11] }, SIGNER);
    expect(H.persistSignature).toHaveBeenCalledTimes(1);

    const [client, params] = H.persistSignature.mock.calls[0] as [unknown, Record<string, any>];
    // Same client as the transaction — not the pool.
    expect(typeof (client as { query: unknown }).query).toBe('function');
    // Before the transaction, only the review route's precheck reads (RR4, before the credential): nothing is written there.
    expect(H.query.mock.calls.map((c) => String(c[0]).split(/\s+/).slice(0, 4).join(' '))).toEqual([
      'SELECT * FROM qms_documents', 'SELECT * FROM review_routes',
    ]);
    expect(params.target).toBe('qms-document:11');
    expect(params.payload).toEqual({ meaning: 'APPROVED' });
    expect(params.reason).toBe(VALID_BODY.reason);
    expect(params.authenticationMethod).toBe('password');
    expect(params.secondFactorVerified).toBe(false);
    expect(params.binding.basis).toBe(QMS_DOCUMENT_BINDING_BASIS);
    expect(params.binding.digest).toBe(computeQmsDocumentContentDigest({ ...IN_REVIEW, metadata: { ...IN_REVIEW.metadata, authoringContent: AUTHORED_CONTENT } } as any));
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

  it('returns explicit recovery and discards the request connection when the COMMIT reply is lost', async () => {
    const scripted = H.txQuery.getMockImplementation()!;
    H.txQuery.mockImplementation(async (...args: unknown[]) => {
      const result = await scripted(...args);
      if (args[0] === 'COMMIT') throw new Error('Synthetic private COMMIT diagnostic');
      return result;
    });
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(503);
    expect(res.body.details).toMatchObject({ code: 'QMS_SIGNATURE_COMMIT_UNCONFIRMED', recordId: 11, recoveryUrl: '/api/mdx/qms/documents/11' });
    expect(txStatements().at(-1)).toBe('COMMIT');
    expect(txStatements()).not.toContain('ROLLBACK');
    expect(H.discard).toHaveBeenCalledOnce();
    expect(JSON.stringify(res.body)).not.toContain('Synthetic private COMMIT diagnostic');
  });

  it('rolls the approval back when the signature row cannot be written — never effective without a signature', async () => {
    H.persistSignature.mockRejectedValue(new Error('electronic_signatures insert failed'));
    const res = await request(app()).post('/api/mdx/qms/documents/11/approve').send(VALID_BODY);
    expect(res.status).toBe(500);
    expect(txStatements()).toEqual(['BEGIN', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT', 'UPDATE', 'ROLLBACK']);
    expect(H.release).not.toHaveBeenCalled(); // Response completion owns release.
  });
});
