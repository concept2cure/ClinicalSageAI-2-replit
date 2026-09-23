/**
 * Finalizing a protocol and recording a reviewer's disposition are electronic
 * signatures. Until 2026-09-23 both routes wrote a `command='sign'` ledger row
 * through recordGovernedAction with nothing else: no re-authentication, no
 * separation-of-duties check, no electronic_signatures row. The ledger claimed
 * a signature the signer never gave (weekly review 2026-09-22, finding P1).
 *
 * These tests drive the real handlers. The ceremony's pieces are stubbed at
 * their module boundary so each test can say which one refused, and the fake
 * transaction client records the order of writes so "the signature landed with
 * the change or not at all" is asserted, not assumed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  log: [] as string[],
  reauth: { ok: true } as { ok: boolean; error?: string },
  sod: null as unknown,
  sigFail: null as unknown,
  finalizeFail: null as unknown,
  dispositionFail: null as unknown,
  authors: [11] as number[],
  role: 'member',
}));

const client = {
  query: vi.fn(async (sql: string) => {
    const word = sql.trim().split(/\s+/)[0].toUpperCase();
    if (word === 'BEGIN' || word === 'COMMIT' || word === 'ROLLBACK') h.log.push(word);
    return { rows: [], rowCount: 0 };
  }),
  release: vi.fn(),
};

vi.mock('../../db', () => ({
  pool: { connect: vi.fn(async () => client), query: vi.fn(async () => ({ rows: [] })) },
  db: {},
}));
vi.mock('../../db/requestDb', () => ({ requestPgClient: () => client }));
// Every case here signs as the same user; the attempt limit has its own suite
// (server/middleware/__tests__/signing-attempt-limiter.test.ts).
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../services/protocol-development-metrics', () => ({
  recordProtocolDocCreated: vi.fn(), recordProtocolSectionUpdated: vi.fn(), recordProtocolObjectiveAdded: vi.fn(),
  recordProtocolEligibilityAdded: vi.fn(), recordProtocolVisitAdded: vi.fn(), recordProtocolVersionSnapshot: vi.fn(),
  recordProtocolFinalized: vi.fn(),
}));
vi.mock('../../services/protocol-reviews-metrics', () => ({
  recordReviewerAssigned: vi.fn(), recordReviewComment: vi.fn(), recordReviewDisposition: vi.fn(),
}));

const verifyReauth = vi.fn(async () => h.reauth);
const recordGovernedAction = vi.fn(async (_c: unknown, p: { command: string; target: string }) => {
  h.log.push(`LEDGER:${p.command}:${p.target}`);
  return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1' };
});
vi.mock('../c2c/actions', () => ({
  verifyReauth: (...a: unknown[]) => verifyReauth(...(a as [])),
  recordGovernedAction: (...a: unknown[]) => recordGovernedAction(...(a as [unknown, { command: string; target: string }])),
}));

const persistGovernedSignSignature = vi.fn(async (_c: unknown, p: { target: string }) => {
  if (h.sigFail) throw h.sigFail;
  h.log.push(`SIGNATURE:${p.target}`);
  return { id: 314, signedAt: new Date('2026-09-23T00:00:00Z') };
});
vi.mock('../../services/part11/signature-persistence', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGovernedSignSignature: (...a: unknown[]) => persistGovernedSignSignature(...(a as [unknown, { target: string }])),
}));

const assertSignerIsNotAuthor = vi.fn(async () => {
  if (h.sod) throw h.sod;
  h.log.push('SOD');
  return { checked: true, reason: 'ok' };
});
const resolveTargetAuthors = vi.fn(async () => {
  h.log.push('AUTHORS');
  return { modelled: true, authors: h.authors, sources: ['protocol creator'] };
});
vi.mock('../../services/governance/separation-of-duties', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  assertSignerIsNotAuthor: (...a: unknown[]) => assertSignerIsNotAuthor(...(a as [])),
  resolveTargetAuthors: (...a: unknown[]) => resolveTargetAuthors(...(a as [])),
}));

const finalizeProtocolTx = vi.fn(async () => {
  if (h.finalizeFail) throw h.finalizeFail;
  h.log.push('FINALIZE');
  return { finalized: true, version: '1.0', completeness: { readyToFinalize: true, findings: [] } };
});
vi.mock('../../services/protocol-development/protocol-development-service', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  finalizeProtocolTx: (...a: unknown[]) => finalizeProtocolTx(...(a as [])),
}));

const setDispositionTx = vi.fn(async () => {
  if (h.dispositionFail) throw h.dispositionFail;
  h.log.push('DISPOSITION');
  return { id: 9, disposition: 'approve', protocolDocumentId: 5, reviewerName: 'Dr. R', onBehalfOf: null };
});
vi.mock('../../services/protocol-reviews/protocol-reviews-service', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  setDispositionTx: (...a: unknown[]) => setDispositionTx(...(a as [])),
}));

import protocolDevelopment from '../protocol-development';
import protocolReviews from '../protocol-reviews';
import { SeparationOfDutiesError } from '../../services/governance/separation-of-duties';
import { ProtocolReviewError } from '../../services/protocol-reviews/protocol-reviews-service';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { userId: 11, organizationId: 2, userRole: h.role, user: { id: 11, organizationId: 2, role: h.role } });
  next();
});
app.use('/api/protocol-development', protocolDevelopment);
app.use('/api/protocol-reviews', protocolReviews);

const REASON = 'The protocol is complete and ready for use.';
const REAUTH = { password: 'correct horse battery staple' };

const finalize = (body: Record<string, unknown>) =>
  request(app).post('/api/protocol-development/documents/5/finalize').send(body);
const disposition = (body: Record<string, unknown>) =>
  request(app).patch('/api/protocol-reviews/assignments/9/disposition').send(body);

beforeEach(() => {
  h.log.length = 0;
  h.reauth = { ok: true };
  h.sod = null;
  h.sigFail = null;
  h.finalizeFail = null;
  h.dispositionFail = null;
  h.authors = [11];
  h.role = 'member';
  vi.clearAllMocks();
});

describe('POST /documents/:id/finalize is a real electronic signature', () => {
  it('refuses without re-authentication, and writes nothing', async () => {
    h.reauth = { ok: false, error: 'REAUTH_PASSWORD_REQUIRED' };
    const r = await finalize({ reason: REASON, meaning: 'authorship' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('REAUTH_PASSWORD_REQUIRED');
    expect(finalizeProtocolTx).not.toHaveBeenCalled();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);
  });

  it('refuses a wrong password the same way', async () => {
    h.reauth = { ok: false, error: 'REAUTH_PASSWORD_INVALID' };
    const r = await finalize({ reason: REASON, meaning: 'authorship', reauth: { password: 'nope' } });
    expect(r.status).toBe(401);
    expect(h.log).toEqual([]);
  });

  it('refuses an undeclared meaning before asking for credentials (21 CFR 11.50)', async () => {
    const r = await finalize({ reason: REASON, reauth: REAUTH });
    expect(r.status).toBe(400);
    expect(verifyReauth).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);
  });

  it('refuses a meaning finalization cannot carry', async () => {
    const r = await finalize({ reason: REASON, meaning: 'release', reauth: REAUTH });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('MEANING_NOT_ALLOWED');
    expect(h.log).toEqual([]);
  });

  it('finalizes, checks independence, and writes the ledger AND the signature row in one transaction', async () => {
    const r = await finalize({ reason: REASON, meaning: 'authorship', reauth: REAUTH });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(h.log).toEqual([
      'BEGIN',
      'FINALIZE',
      'AUTHORS',
      'LEDGER:sign:protocol-document:5',
      'SIGNATURE:protocol-document:5',
      'COMMIT',
    ]);
    expect(verifyReauth).toHaveBeenCalledWith(11, REAUTH);
    // An authorship signature is checked against the recorded authors, on the
    // signing transaction's own client.
    expect(resolveTargetAuthors).toHaveBeenCalledWith('protocol-document:5', 2, client);
    expect(assertSignerIsNotAuthor).not.toHaveBeenCalled();
    /* Through `unknown`: the mock's inferred call-argument type is narrower
       than the real one, so a direct assertion is a TS2352 and turned tsc red
       on the shared branch. The sibling assertion below already takes this
       route for persistGovernedSignSignature. */
    const ledger = recordGovernedAction.mock.calls[0][1] as unknown as {
      payload: Record<string, unknown>;
      reason: string;
    };
    expect(ledger.payload.meaning).toBe('authorship');
    expect(ledger.reason).toBe(REASON);
    const sig = persistGovernedSignSignature.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(sig[0]).toBe(client); // the SAME transaction client
    expect(sig[1]).toMatchObject({
      target: 'protocol-document:5',
      actionId: 'act_1',
      auditId: 'aud_1',
      sha256Chain: 'chain_1',
      authenticationMethod: 'password',
      secondFactorVerified: false,
    });
    expect((sig[1].payload as Record<string, unknown>).meaning).toBe('authorship');
    expect(r.body).toMatchObject({ documentId: 5, version: '1.0', signatureId: 314, meaning: 'authorship' });
  });

  it('records the second factor only when one was verified', async () => {
    await finalize({ reason: REASON, meaning: 'authorship', reauth: { ...REAUTH, totp: '123456' } });
    const sig = persistGovernedSignSignature.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(sig[1]).toMatchObject({ authenticationMethod: 'password+totp', secondFactorVerified: true });
  });

  it('a non-author cannot sign as the author', async () => {
    h.authors = [99];
    const r = await finalize({ reason: REASON, meaning: 'authorship', reauth: REAUTH });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('NOT_AN_AUTHOR');
    expect(h.log).toEqual(['BEGIN', 'FINALIZE', 'AUTHORS', 'ROLLBACK']);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('an approval is checked for independence on the signing client', async () => {
    await finalize({ reason: REASON, meaning: 'approval', reauth: REAUTH });
    expect(assertSignerIsNotAuthor).toHaveBeenCalledWith('protocol-document:5', 2, 11, { command: 'sign', meaning: 'approval', client });
  });

  it('a viewer cannot sign, and nothing is asked or written', async () => {
    h.role = 'viewer';
    const r = await finalize({ reason: REASON, meaning: 'authorship', reauth: REAUTH });
    expect(r.status).toBe(403);
    expect(verifyReauth).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);
  });

  it('an enrolled second factor that was not given is named as such', async () => {
    h.reauth = { ok: false, error: 'REAUTH_TOTP_REQUIRED' };
    const r = await finalize({ reason: REASON, meaning: 'authorship', reauth: REAUTH });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('REAUTH_TOTP_REQUIRED');
    expect(r.body.error.message).toMatch(/authenticator/);
    expect(h.log).toEqual([]);
  });

  it('an author approving their own protocol is refused, and the finalization rolls back', async () => {
    h.sod = new SeparationOfDutiesError('you are an author of this record');
    const r = await finalize({ reason: REASON, meaning: 'approval', reauth: REAUTH });
    expect(r.status).toBe(403);
    expect(h.log).toEqual(['BEGIN', 'FINALIZE', 'ROLLBACK']);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('if the signature row cannot be written, nothing is committed', async () => {
    h.sigFail = new Error('signer identity unresolvable');
    const r = await finalize({ reason: REASON, meaning: 'authorship', reauth: REAUTH });
    expect(r.status).toBe(500);
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('PATCH /assignments/:id/disposition is a real electronic signature', () => {
  it('refuses without re-authentication, and records no disposition', async () => {
    h.reauth = { ok: false, error: 'REAUTH_PASSWORD_REQUIRED' };
    const r = await disposition({ disposition: 'approve', reason: REASON, meaning: 'review' });
    expect(r.status).toBe(401);
    expect(setDispositionTx).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);
  });

  it('a viewer cannot sign a disposition', async () => {
    h.role = 'viewer';
    const r = await disposition({ disposition: 'approve', reason: REASON, meaning: 'review', reauth: REAUTH });
    expect(r.status).toBe(403);
    expect(setDispositionTx).not.toHaveBeenCalled();
  });

  it('passes the signer and the declared meaning to the domain write, then signs', async () => {
    const r = await disposition({ disposition: 'approve', reason: REASON, meaning: 'review', reauth: REAUTH });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(setDispositionTx).toHaveBeenCalledWith(client, 2, 9, 'approve', 11, 'review');
    expect(h.log).toEqual([
      'BEGIN',
      'DISPOSITION',
      'SOD',
      'LEDGER:sign:protocol-review-assignment:9',
      'SIGNATURE:protocol-review-assignment:9',
      'COMMIT',
    ]);
    expect(r.body).toMatchObject({ assignmentId: 9, disposition: 'approve', signatureId: 314, meaning: 'review' });
  });

  it('a review assigned to someone else is refused and rolled back', async () => {
    h.dispositionFail = new ProtocolReviewError('FORBIDDEN', 'This review is assigned to another user.');
    const r = await disposition({ disposition: 'approve', reason: REASON, meaning: 'review', reauth: REAUTH });
    expect(r.status).toBe(403);
    expect(h.log).toEqual(['BEGIN', 'ROLLBACK']);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('refuses authorship as a review meaning', async () => {
    const r = await disposition({ disposition: 'approve', reason: REASON, meaning: 'authorship', reauth: REAUTH });
    expect(r.status).toBe(400);
    expect(h.log).toEqual([]);
  });
});
