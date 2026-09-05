/**
 * Submission Release Signing route — unit tests
 *
 * Exercises POST /api/submissions/:submissionId/sign-release.
 * Coverage:
 *   - 401 when JWT principal is absent
 *   - 403 when org context is absent
 *   - 404 collapse on missing-or-cross-org run (getRun returns null)
 *   - 404 when URL submissionId doesn't match the run's submissionId
 *   - 409 when run.status !== 'awaiting-signature'
 *   - 401 on password mismatch (NEVER 200)
 *   - 200 happy path: signature row created + bound digest persisted
 *   - 200 idempotent: existing active signature returns its id without
 *     creating a duplicate row
 *
 * The route depends on:
 *   - submission-package-orchestrator's getRun / findActiveReleaseSignature /
 *     loadSubmissionFkBySubmissionIdText
 *   - part11ComplianceService.verifyUserCredentials + createElectronicSignature
 *     (which now receives the orchestrator's bound digest + tenant scope and
 *     writes them AT INSERT TIME — no post-insert UPDATE exists any more,
 *     preserving the §11.70 append-only invariant)
 *   - auditService.logAction
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ═══════════════════════════════════════════════════════════════════════════════
// HOISTED MOCK STATE
// ═══════════════════════════════════════════════════════════════════════════════

const hoisted = vi.hoisted(() => ({
  getRun: vi.fn(),
  findActiveReleaseSignature: vi.fn(),
  loadSubmissionFkBySubmissionIdText: vi.fn(),
  verifyUserCredentials: vi.fn(),
  createElectronicSignature: vi.fn(),
  auditLogAction: vi.fn(),
  // Drizzle update().set().where() — captured for assertion
  updateCalls: [] as Array<{ patch: unknown; whereCalled: boolean }>,
  poolQuery: vi.fn(),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS — service layer
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../server/services/submission-package-orchestrator.js', () => ({
  getRun: (...args: unknown[]) => hoisted.getRun(...args),
  findActiveReleaseSignature: (...args: unknown[]) =>
    hoisted.findActiveReleaseSignature(...args),
  loadSubmissionFkBySubmissionIdText: (...args: unknown[]) =>
    hoisted.loadSubmissionFkBySubmissionIdText(...args),
  // The route never calls computeBoundPayloadDigest directly — it uses the
  // persisted digest off the run's package.sign outputRef. But the import is
  // still resolved, so we stub it as a no-op.
  computeBoundPayloadDigest: () => 'unused-in-route-tests',
  PACKAGE_SIGN_SIGNATURE_MEANING: 'approval',
}));
vi.mock('../../server/services/submission-package-orchestrator', () => ({
  getRun: (...args: unknown[]) => hoisted.getRun(...args),
  findActiveReleaseSignature: (...args: unknown[]) =>
    hoisted.findActiveReleaseSignature(...args),
  loadSubmissionFkBySubmissionIdText: (...args: unknown[]) =>
    hoisted.loadSubmissionFkBySubmissionIdText(...args),
  computeBoundPayloadDigest: () => 'unused-in-route-tests',
  PACKAGE_SIGN_SIGNATURE_MEANING: 'approval',
}));

vi.mock('../../server/services/part11ComplianceService.js', () => ({
  default: {
    verifyUserCredentials: (...args: unknown[]) =>
      hoisted.verifyUserCredentials(...args),
    createElectronicSignature: (...args: unknown[]) =>
      hoisted.createElectronicSignature(...args),
  },
}));
vi.mock('../../server/services/part11ComplianceService', () => ({
  default: {
    verifyUserCredentials: (...args: unknown[]) =>
      hoisted.verifyUserCredentials(...args),
    createElectronicSignature: (...args: unknown[]) =>
      hoisted.createElectronicSignature(...args),
  },
}));

// §11.10(g) signing-authority gate resolves the signer's org role from the
// membership record before any run work. These tests exercise body/lineage/
// credential behaviour, not authority, so the resolver returns an authorized
// role (the gate is transparent). Static — unaffected by mock resets.
vi.mock('../../server/services/part11/resolve-signer-role.js', () => ({
  resolveSignerOrgRole: async () => 'approver',
}));
vi.mock('../../server/services/part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: async () => 'approver',
}));

vi.mock('../../server/services/auditService.js', () => ({
  default: {
    logAction: (...args: unknown[]) => hoisted.auditLogAction(...args),
  },
}));
vi.mock('../../server/services/auditService', () => ({
  default: {
    logAction: (...args: unknown[]) => hoisted.auditLogAction(...args),
  },
}));

// Drizzle-orm — eq returns a JSON descriptor (don't evaluate)
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (col: any, val: any) => ({ __kind: 'eq', col, val }),
  };
});

// db + pool: the route updates the new signature row's bound_payload_digest
vi.mock('../../server/db', () => {
  const db = {
    update(_table: unknown) {
      const call: { patch: unknown; whereCalled: boolean } = {
        patch: null,
        whereCalled: false,
      };
      hoisted.updateCalls.push(call);
      const builder: any = {
        set(p: unknown) {
          call.patch = p;
          return builder;
        },
        where(_pred: unknown) {
          call.whereCalled = true;
          return Promise.resolve(undefined);
        },
      };
      return builder;
    },
  };
  const pool = { query: (...args: unknown[]) => hoisted.poolQuery(...args) };
  return { db, pool, getPool: () => pool, getDb: () => db };
});
vi.mock('../../server/db.js', () => {
  const db = {
    update(_table: unknown) {
      const call: { patch: unknown; whereCalled: boolean } = {
        patch: null,
        whereCalled: false,
      };
      hoisted.updateCalls.push(call);
      const builder: any = {
        set(p: unknown) {
          call.patch = p;
          return builder;
        },
        where(_pred: unknown) {
          call.whereCalled = true;
          return Promise.resolve(undefined);
        },
      };
      return builder;
    },
  };
  const pool = { query: (...args: unknown[]) => hoisted.poolQuery(...args) };
  return { db, pool, getPool: () => pool, getDb: () => db };
});

// Module3 / validator imports — never invoked by the route on the tested
// paths, but the import resolves. Stub minimally.
vi.mock('../../server/services/module3-extensions.js', () => ({
  composeFullModule3: () => [],
}));
vi.mock('../../server/services/ectd/ectd-validator-hardening.js', () => ({
  validateEctdPackageHardened: vi.fn(),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT THE ROUTER (after mocks)
// ═══════════════════════════════════════════════════════════════════════════════

import signReleaseRouter from '../../server/routes/submission-sign-release';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST APP
// ═══════════════════════════════════════════════════════════════════════════════

interface AuthCtx {
  organizationId?: number | null;
  userId?: number | null;
}

function makeApp(ctx: AuthCtx = { organizationId: 100, userId: 7 }) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as any;
    if (ctx.organizationId != null) {
      r.tenantContext = { organizationId: ctx.organizationId };
    }
    if (ctx.userId != null) {
      r.user = { id: ctx.userId, organizationId: ctx.organizationId ?? undefined };
    }
    next();
  });
  app.use('/api/submissions', signReleaseRouter);
  return app;
}

// Helper: a persisted run that's currently awaiting-signature with a known
// digest. The route's recompute helper trusts the persisted digest on the
// step's outputRef.
function awaitingSignatureRun(over: Partial<Record<string, unknown>> = {}) {
  const steps = [
    {
      key: 'package.sign',
      status: 'awaiting-signature',
      outputRef: JSON.stringify({
        payloadDigest: 'a'.repeat(64),
        awaitingSince: '2026-06-29T00:00:00.000Z',
      }),
      inputHash: 'h',
      dependsOn: [],
    },
  ];
  return {
    runId: 'run-123',
    organizationId: 100,
    submissionId: 'sub-1',
    submissionFk: 42,
    applicationNumber: 'IND123456',
    region: 'US',
    submissionType: 'IND',
    startedAt: '2026-06-29T00:00:00.000Z',
    status: 'awaiting-signature',
    steps,
    ...over,
  };
}

beforeEach(() => {
  hoisted.getRun.mockReset();
  hoisted.findActiveReleaseSignature.mockReset();
  hoisted.loadSubmissionFkBySubmissionIdText.mockReset();
  hoisted.verifyUserCredentials.mockReset();
  hoisted.createElectronicSignature.mockReset();
  hoisted.auditLogAction.mockReset();
  hoisted.poolQuery.mockReset();
  hoisted.updateCalls = [];

  // Default behaviors
  hoisted.findActiveReleaseSignature.mockResolvedValue(null);
  hoisted.loadSubmissionFkBySubmissionIdText.mockResolvedValue(null);
  // What the real auditService.logAction resolves with (AuditWriteResult). It
  // stubbed `undefined` here, from before logAction reported its own outcome —
  // and the route reads `auditWrite.persisted`, so the HAPPY PATH threw and
  // came back 500 with an empty body while every failure case still passed.
  hoisted.auditLogAction.mockResolvedValue({
    persisted: true, chained: true, tamperProof: true,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/submissions/:submissionId/sign-release — auth gating', () => {
  it('returns 401 when no JWT principal is present', async () => {
    const res = await request(makeApp({ organizationId: null, userId: null }))
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'pw',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(401);
    expect(hoisted.getRun).not.toHaveBeenCalled();
    expect(hoisted.verifyUserCredentials).not.toHaveBeenCalled();
  });

  it('returns 403 when JWT principal is present but org context is missing', async () => {
    const res = await request(makeApp({ organizationId: null, userId: 7 }))
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'pw',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(403);
    expect(hoisted.getRun).not.toHaveBeenCalled();
  });
});

describe('POST /api/submissions/:submissionId/sign-release — run lookup + status checks', () => {
  it('returns 404 when getRun returns null (collapsed miss-or-cross-org)', async () => {
    hoisted.getRun.mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'pw',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'run_not_found' });
    // CRITICAL: never reached credential verify on a 404
    expect(hoisted.verifyUserCredentials).not.toHaveBeenCalled();
    expect(hoisted.createElectronicSignature).not.toHaveBeenCalled();
  });

  it('returns 404 when URL submissionId does not match the run\'s submissionId', async () => {
    // Run belongs to sub-1, but URL says sub-XXX — defensive cross-submission check.
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun({ submissionId: 'sub-1' }));

    const res = await request(makeApp())
      .post('/api/submissions/sub-XXX/sign-release')
      .send({
        runId: 'run-123',
        password: 'pw',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(404);
    expect(hoisted.verifyUserCredentials).not.toHaveBeenCalled();
  });

  it('returns 409 when run.status is not awaiting-signature', async () => {
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun({ status: 'complete' }));

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'pw',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('run_not_awaiting_signature');
    expect(hoisted.verifyUserCredentials).not.toHaveBeenCalled();
  });
});

describe('POST /api/submissions/:submissionId/sign-release — credential + signature creation', () => {
  it('returns 401 when password verification fails (NEVER 200, no signature row)', async () => {
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun());
    hoisted.findActiveReleaseSignature.mockResolvedValue(null);
    hoisted.verifyUserCredentials.mockResolvedValue(false);

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'wrong-password',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
    // CRITICAL: signature is NOT created on a credential failure.
    expect(hoisted.createElectronicSignature).not.toHaveBeenCalled();
    // Response body must NOT echo the password or digest.
    expect(JSON.stringify(res.body)).not.toContain('wrong-password');
    expect(JSON.stringify(res.body)).not.toContain('a'.repeat(64));
  });

  it('creates a signature and persists bound_payload_digest on the happy path', async () => {
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun());
    hoisted.findActiveReleaseSignature.mockResolvedValue(null);
    hoisted.verifyUserCredentials.mockResolvedValue(true);
    hoisted.createElectronicSignature.mockResolvedValue({
      success: true,
      signatureId: 999,
      signedBy: 'Test User',
      signedAt: new Date('2026-06-29T00:00:00.000Z'),
      signatureHash: 'attribution-hash',
      verificationCode: 'ABCD1234',
    });

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'right-password',
        signatureMeaning: 'approval',
        reason: 'release authorization',
      });

    expect(res.status).toBe(200);
    expect(res.body.signatureId).toBe(999);

    // Verify the createElectronicSignature call shape — JWT-bound signerId,
    // tenant-scoped orgId, documentType='submission-release', meaning='approval',
    // and the orchestrator's bound digest passed in for insert-time binding.
    expect(hoisted.createElectronicSignature).toHaveBeenCalledTimes(1);
    const callArgs = hoisted.createElectronicSignature.mock.calls[0][0] as {
      userId: number;
      organizationId: number;
      documentId: number;
      documentType: string;
      signatureReason: string;
      signatureMeaning: string;
      password: string;
      boundPayloadDigest: string;
      signerRole: string;
    };
    expect(callArgs.userId).toBe(7);
    expect(callArgs.organizationId).toBe(100);
    expect(callArgs.documentId).toBe(42); // submissionFk
    expect(callArgs.documentType).toBe('submission-release');
    expect(callArgs.signatureMeaning).toBe('approval');
    expect(callArgs.signatureReason).toBe('release authorization');
    expect(callArgs.boundPayloadDigest).toBe('a'.repeat(64));
    expect(callArgs.signerRole).toBe('approver');

    // §11.70 append-only: the row is complete at INSERT — the route must
    // NEVER issue a post-insert UPDATE against electronic_signatures.
    expect(hoisted.updateCalls.length).toBe(0);
    expect(hoisted.poolQuery).not.toHaveBeenCalled();

    // Audit row written ON THE SIGNATURE'S TRANSACTION (ledger L138). The event
    // is handed to createElectronicSignature rather than logged afterwards, so
    // it commits with the signature or the signature does not exist.
    expect(hoisted.auditLogAction).not.toHaveBeenCalled();
    const sigCall = hoisted.createElectronicSignature.mock.calls[0][0] as {
      transactionalAuditEvent?: {
        tenantId: number;
        userId: number;
        action: string;
        resourceType: string;
        resourceId: string;
      };
    };
    const auditCall = sigCall.transactionalAuditEvent;
    expect(auditCall, 'the release event must ride the signature transaction').toBeDefined();
    expect(auditCall!.tenantId).toBe(100);
    expect(auditCall!.userId).toBe(7);
    expect(auditCall!.action).toBe('release_signature_created');
    expect(auditCall!.resourceType).toBe('submission_release');
    expect(auditCall!.resourceId).toBe('run-123');
  });

  it('REGRESSION: a signature whose audit row cannot be written does not exist at all', async () => {
    // This replaces a test that asserted the OPPOSITE outcome, and the change
    // is the point of ledger L138. The route used to write
    // `release_signature_created` after the signature had already committed on
    // another connection, so an audit outage produced a committed signature and
    // a 200 — the old test asserted the honest warning the route returned with
    // it, which was the best answer available while the write was outside the
    // transaction. The event is now written INSIDE it, so the failure mode that
    // warning described cannot occur: the transaction rolls back and there is
    // no signature to warn about. §11.10(e) says a signature has an audit
    // record; the route can now make that claim rather than apologise for it.
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun());
    hoisted.findActiveReleaseSignature.mockResolvedValue(null);
    hoisted.verifyUserCredentials.mockResolvedValue(true);
    hoisted.createElectronicSignature.mockRejectedValue(
      Object.assign(new Error('relation "audit_logs" does not exist'), { code: '42P01' }),
    );

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'right-password',
        signatureMeaning: 'approval',
        reason: 'release authorization',
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('signature_creation_failed');
    // No signature id is handed back, and no "we signed but could not audit it"
    // consolation prize — there is nothing to consolidate.
    expect(res.body.signatureId).toBeUndefined();
    expect(res.body.auditWriteFailed).toBeUndefined();
  });

  it('returns the existing signatureId without creating a duplicate when one already exists (idempotent)', async () => {
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun());
    // findActiveReleaseSignature reports a hit — same digest already signed.
    hoisted.findActiveReleaseSignature.mockResolvedValue({ id: 555 });

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'pw',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(200);
    expect(res.body.signatureId).toBe(555);
    expect(res.body.already_signed).toBe(true);
    // No new signature row, no password check (idempotent short-circuit).
    expect(hoisted.verifyUserCredentials).not.toHaveBeenCalled();
    expect(hoisted.createElectronicSignature).not.toHaveBeenCalled();
  });

  it('resolves a concurrent-signing race idempotently on a 23505 unique violation', async () => {
    // The pre-check missed (findActiveReleaseSignature null), so we proceed to
    // insert — but a concurrent signer won the race and the DB unique index
    // (electronic_signatures_active_release_uniq) rejects our insert with
    // 23505. The route must re-read the winner and return its id as an
    // idempotent 200, NOT a 500 — OQ-3 held because exactly one row landed.
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun());
    hoisted.verifyUserCredentials.mockResolvedValue(true);
    // First findActiveReleaseSignature (pre-check) misses; the second (post
    // unique-violation re-read) finds the winner.
    hoisted.findActiveReleaseSignature
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 777 });
    const uniqueViolation = Object.assign(new Error('duplicate key value'), { code: '23505' });
    hoisted.createElectronicSignature.mockRejectedValue(uniqueViolation);

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'right-password',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(200);
    expect(res.body.signatureId).toBe(777);
    expect(res.body.already_signed).toBe(true);
    // No post-insert UPDATE on the losing path.
    expect(hoisted.updateCalls.length).toBe(0);
  });

  it('surfaces 500 on a non-race createElectronicSignature failure', async () => {
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun());
    hoisted.findActiveReleaseSignature.mockResolvedValue(null);
    hoisted.verifyUserCredentials.mockResolvedValue(true);
    hoisted.createElectronicSignature.mockRejectedValue(new Error('disk on fire'));

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'right-password',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('signature_creation_failed');
  });

  it('returns 422 when no documentId anchor can be resolved (lineage unresolved)', async () => {
    // Run has no submissionFk, AND loadSubmissionFkBySubmissionIdText returns null.
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun({ submissionFk: null }));
    hoisted.findActiveReleaseSignature.mockResolvedValue(null);
    hoisted.verifyUserCredentials.mockResolvedValue(true);
    hoisted.loadSubmissionFkBySubmissionIdText.mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'pw',
        signatureMeaning: 'approval',
        reason: 'release',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('submission_lineage_unresolved');
    expect(hoisted.createElectronicSignature).not.toHaveBeenCalled();
  });
});

describe('POST /api/submissions/:submissionId/sign-release — body schema enforcement', () => {
  it('returns 400 on invalid signatureMeaning (closed enum, only "approval" allowed)', async () => {
    hoisted.getRun.mockResolvedValue(awaitingSignatureRun());

    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'pw',
        signatureMeaning: 'rubber-stamp', // not in the closed enum
        reason: 'release',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_request' });
    expect(hoisted.getRun).not.toHaveBeenCalled();
  });

  it('returns 400 on empty reason (§11.50 requires a meaning manifestation)', async () => {
    const res = await request(makeApp())
      .post('/api/submissions/sub-1/sign-release')
      .send({
        runId: 'run-123',
        password: 'pw',
        signatureMeaning: 'approval',
        reason: '',
      });

    expect(res.status).toBe(400);
    expect(hoisted.getRun).not.toHaveBeenCalled();
  });
});
