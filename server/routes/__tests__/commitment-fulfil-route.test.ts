/**
 * The order a commitment's fulfilment is refused in (rows D2 and D5,
 * 2026-10-19; decision P-41), through the organisation's real router.
 *
 * Recording a PMR, PMC or REMS as fulfilled is a signed act naming what met it.
 * Every refusal the server can give without a password is given before one is
 * asked for: a date that has not happened, a PMR that names nothing, a PMR with
 * no date, and evidence the server would refuse (a sequence the agency never
 * received, a version this person cannot open). Only then does the one ceremony
 * (governed-signed-act.ts) check the password, so a refused fulfilment never
 * spends one of the signer's attempts. A meeting commitment is a governed write
 * with a reason and takes no signature at all.
 *
 * The per-signer signing budget (signedActAttempts, shared by every signed act
 * on the platform) is spent only by a request that reaches the ceremony: the
 * last describe runs the real limiter and shows twelve refused fulfilments
 * leave the budget untouched, and a signed request still spends it.
 *
 * The services and the credential check are doubles here; the real-PostgreSQL
 * half is tests/db/commitment-fulfilment-evidence.dbtest.ts (the routes) and
 * tests/db/commitment-fulfilment-database.dbtest.ts (what the database holds).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  read: vi.fn(), fulfil: vi.fn(), resolve: vi.fn(),
  authority: vi.fn(), reverify: vi.fn(), ledger: vi.fn(), signature: vi.fn(), metric: vi.fn(),
  query: vi.fn(), limiter: vi.fn(),
}));
vi.mock('../../db', () => ({ pool: { connect: vi.fn(), query: vi.fn() } }));
// The limiter as mounted is a stand-in that defers to h.limiter: a pass-through,
// or the real one in the budget describe below.
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (req: unknown, res: unknown, next: (err?: unknown) => void) => h.limiter(req, res, next),
}));
vi.mock('../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: h.authority }));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../../services/part11/reverify-signer', () => ({ reverifySigner: h.reverify }));
vi.mock('../../services/part11/signature-persistence', () => ({
  persistGovernedSignSignature: h.signature,
  isSignatureWithdrawn: () => false,
}));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: h.ledger, verifyReauth: vi.fn() }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../services/ha-metrics', () => ({
  recordHaInteractionCreated: vi.fn(), recordHaCommitmentCreated: vi.fn(), recordHaCommitmentFulfilled: h.metric,
}));
vi.mock('../../services/ha-interactions/ha-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ha-interactions/ha-service')>()),
  readCommitmentForFulfilment: h.read,
  fulfillCommitmentTx: h.fulfil,
}));
vi.mock('../../services/ha-interactions/commitment-fulfilment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ha-interactions/commitment-fulfilment')>()),
  resolveFulfilmentEvidenceTx: h.resolve,
}));

import router from '../ha-interactions';
import { HaError } from '../../services/ha-interactions/ha-service';

const client = { query: h.query };
function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { user: { id: 42, organizationId: 7, role: 'admin' }, userRole: 'admin', dbClient: client });
    next();
  });
  a.use('/api/ha-interactions', router);
  return a;
}
const URL = '/api/ha-interactions/commitments/12/fulfill';
const PMR = { id: 12, commitmentType: 'pmr', status: 'open', submissionId: null, projectId: null, sourceCommunicationEventId: null, visibilityTier: null };
const MEETING = { ...PMR, commitmentType: 'meeting_commitment' };
const SIGNED = { fulfilledDate: '2026-10-01', reason: 'Final study report was filed in sequence 0042.', meaning: 'responsibility', password: 'pw' };
const EVIDENCE = { sequenceId: 5, vaultDocumentId: '11111111-1111-4111-8111-111111111111' };
const RESOLVED = {
  sequence: { id: 5, sequenceNumber: '0042', submissionId: 3, submissionTitle: 'IND 123456', dispatchStatus: 'sent' },
  vaultVersion: { id: EVIDENCE.vaultDocumentId, title: 'Final CSR', version: '2.0', programId: null, sha256: 'a'.repeat(64) },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockResolvedValue({ rows: [] });
  h.read.mockResolvedValue(PMR);
  h.resolve.mockResolvedValue(RESOLVED);
  h.fulfil.mockResolvedValue({ fulfilledDate: '2026-10-01' });
  h.authority.mockResolvedValue(null);
  h.reverify.mockResolvedValue({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
  h.ledger.mockResolvedValue({ actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain' });
  h.signature.mockResolvedValue({ id: 77, signedAt: new Date('2026-10-19T10:00:00Z') });
  h.limiter.mockImplementation((_req: unknown, _res: unknown, next: () => void) => next());
});

describe('what is refused before a password is asked for', () => {
  it('a future date, before the commitment is even read', async () => {
    const res = await request(app()).post(URL).send({ ...SIGNED, fulfilledDate: '2999-01-01', evidence: EVIDENCE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_INPUT');
    expect(h.read).not.toHaveBeenCalled();
    expect(h.reverify).not.toHaveBeenCalled();
  });

  it('a PMR that names neither a sequence nor a document', async () => {
    const res = await request(app()).post(URL).send(SIGNED);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EVIDENCE_REQUIRED');
    expect(res.body.error.message).toMatch(/A PMR is met by a submission or a document/);
    expect(h.reverify).not.toHaveBeenCalled();
    expect(h.ledger).not.toHaveBeenCalled();
  });

  it('a PMR with no date: the signer is shown the date the signature binds, so the server never picks it', async () => {
    const res = await request(app()).post(URL).send({ ...SIGNED, fulfilledDate: undefined, evidence: EVIDENCE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FULFILMENT_DATE_REQUIRED');
    expect(h.reverify).not.toHaveBeenCalled();
  });

  it('evidence the server refuses, answered with its own code and no credential check', async () => {
    h.resolve.mockRejectedValueOnce(new HaError('SEQUENCE_NOT_FILED', 'Sequence 0043 has not reached the agency (dispatch status pending). Nothing was recorded.'));
    const res = await request(app()).post(URL).send({ ...SIGNED, evidence: EVIDENCE });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEQUENCE_NOT_FILED');
    expect(h.reverify).not.toHaveBeenCalled();
    expect(h.fulfil).not.toHaveBeenCalled();
  });

  it('access that could not be verified is a 503, not a 500 or a 404', async () => {
    h.resolve.mockRejectedValueOnce(new HaError('EVIDENCE_ACCESS_UNAVAILABLE', 'Your access to what met this commitment could not be verified. Nothing was recorded.'));
    const res = await request(app()).post(URL).send({ ...SIGNED, evidence: EVIDENCE });
    expect(res.status).toBe(503);
    expect(h.reverify).not.toHaveBeenCalled();
  });

  it('a password sent for a meeting commitment, which takes none', async () => {
    h.read.mockResolvedValue(MEETING);
    const res = await request(app()).post(URL).send({ ...SIGNED, evidence: EVIDENCE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SIGNATURE_NOT_TAKEN');
    expect(h.reverify).not.toHaveBeenCalled();
    expect(h.fulfil).not.toHaveBeenCalled();
  });
});

describe('the signed act', () => {
  it('a PMR with evidence and no password is refused by the ceremony as a missing component', async () => {
    const res = await request(app()).post(URL).send({ ...SIGNED, password: undefined, evidence: EVIDENCE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(h.fulfil).not.toHaveBeenCalled();
  });

  it('signs, re-checks the evidence under lock, and answers with the signature', async () => {
    const res = await request(app()).post(URL).send({ ...SIGNED, evidence: EVIDENCE });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      success: true, actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain', signatureId: 77, meaning: 'responsibility',
      data: { id: 12, status: 'fulfilled', fulfilledDate: '2026-10-01', signed: true },
    });
    expect(typeof res.body.signedAt).toBe('string');
    // Once read-only before the password, once under lock inside the signing transaction.
    expect(h.resolve).toHaveBeenCalledTimes(2);
    expect(h.resolve.mock.calls[0][1]).toMatchObject({ lock: false });
    expect(h.resolve.mock.calls[1][1]).toMatchObject({ lock: true });
    expect(h.ledger.mock.calls[0][1]).toMatchObject({ command: 'sign', target: 'regulatory-commitment:12' });
    // The manifest act carries exactly what the database compares at COMMIT.
    const act = h.signature.mock.calls[0][1].extraManifest.act;
    expect(act).toMatchObject({ fulfilledDate: '2026-10-01', sequenceId: 5, vaultDocumentId: EVIDENCE.vaultDocumentId, vaultSha256: 'a'.repeat(64) });
    expect(h.metric).toHaveBeenCalledTimes(1);
  });

  it('counts nothing as fulfilled when the ceremony refuses the password', async () => {
    h.reverify.mockResolvedValue({ ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'Password refused.' });
    const res = await request(app()).post(URL).send({ ...SIGNED, evidence: EVIDENCE });
    expect(res.status).toBe(401);
    expect(h.fulfil).not.toHaveBeenCalled();
    expect(h.metric).not.toHaveBeenCalled();
  });
});

describe('the unsigned fulfilment', () => {
  it('a meeting commitment with no evidence is a governed resolve with the same body shape', async () => {
    h.read.mockResolvedValue(MEETING);
    h.resolve.mockResolvedValue({ sequence: null, vaultVersion: null });
    const res = await request(app()).post(URL).send({ reason: 'Briefing package sent as agreed at the meeting.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ success: true, actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain', data: { id: 12, status: 'fulfilled', signed: false } });
    expect(res.body.signatureId).toBeUndefined();
    expect(h.ledger.mock.calls[0][1]).toMatchObject({ command: 'resolve', target: 'regulatory-commitment:12', domain: 'ha', surface: 'communication-center' });
    expect(h.reverify).not.toHaveBeenCalled();
    expect(h.metric).toHaveBeenCalledTimes(1);
  });
});

describe("the signer's signing budget (signedActAttempts, 10 per 5 minutes across every signed act)", () => {
  let scope = 0;
  async function realLimiter() {
    const real = await vi.importActual<typeof import('../../middleware/signing-attempt-limiter')>('../../middleware/signing-attempt-limiter');
    scope += 1;
    const limiter = real.signingAttemptLimiter(`commitment-fulfil-route.test-${scope}`, {
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many signing attempts. Wait a few minutes and try again. Nothing was signed.' },
    });
    h.limiter.mockImplementation((req: never, res: never, next: never) => limiter(req, res, next));
  }

  it('fulfilments refused before the password spend none of it: twelve refusals, then the signature still goes through', async () => {
    await realLimiter();
    h.resolve.mockRejectedValue(new HaError('SEQUENCE_NOT_FILED', 'Sequence 0043 has not reached the agency (dispatch status rejected). Nothing was recorded.'));
    const a = app();
    for (let i = 1; i <= 12; i += 1) {
      const res = await request(a).post(URL).send({ ...SIGNED, evidence: EVIDENCE });
      expect(res.status, `refusal ${i}: ${JSON.stringify(res.body)}`).toBe(409);
      expect(res.body.error.code).toBe('SEQUENCE_NOT_FILED');
    }
    for (let i = 1; i <= 3; i += 1) {
      const res = await request(a).post(URL).send({ ...SIGNED, fulfilledDate: '2999-01-01', evidence: EVIDENCE });
      expect(res.status, `future date ${i}`).toBe(400);
    }
    expect(h.reverify).not.toHaveBeenCalled();
    h.resolve.mockResolvedValue(RESOLVED);
    const signed = await request(a).post(URL).send({ ...SIGNED, evidence: EVIDENCE });
    expect(signed.status, JSON.stringify(signed.body)).toBe(201);
  });

  it('a request that reaches the password still spends it: the eleventh within the window is refused before any credential check', async () => {
    await realLimiter();
    h.reverify.mockResolvedValue({ ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'Password refused.' });
    const a = app();
    for (let i = 1; i <= 10; i += 1) {
      expect((await request(a).post(URL).send({ ...SIGNED, evidence: EVIDENCE })).status, `attempt ${i}`).toBe(401);
    }
    const eleventh = await request(a).post(URL).send({ ...SIGNED, evidence: EVIDENCE });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(h.reverify).toHaveBeenCalledTimes(10);
    expect(h.fulfil).not.toHaveBeenCalled();
  });
});
