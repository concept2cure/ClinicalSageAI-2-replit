/**
 * The eCTD export routes refuse a principal with no usable user id (401)
 * instead of assembling under user 0; a placed export hands the review
 * assertion to the governed export record.
 *
 * Until 2026-10-15 actingUserId() in routes/ectd-export.ts returned 0 for a
 * principal without a numeric id, so the canonical assembler (which writes its
 * own audit rows) ran and recorded the package build against user 0 — the
 * export, preview and validate routes alike. And a placed export (the program
 * has a project anchor) passed the review attestation only to the non-fatal
 * ectd_export_generated row: registerExportGovernanceQuick took no metadata.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const hoisted = vi.hoisted(() => ({
  assembleSubmissionEctd: vi.fn(),
  validateEctdPackage: vi.fn(),
  registerExportGovernanceQuick: vi.fn(),
  auditLogAction: vi.fn(),
  resolveProgramProjectAnchor: vi.fn(),
}));

vi.mock('../../services/ectd/assemble-from-core', () => ({
  assembleSubmissionEctd: (...a: unknown[]) => hoisted.assembleSubmissionEctd(...a),
}));
vi.mock('../../services/submission-gateways/ectd-structural-validator', () => ({
  validateEctdPackage: (...a: unknown[]) => hoisted.validateEctdPackage(...a),
}));
vi.mock('../../services/compute/exportGovernance', () => ({
  registerExportGovernanceQuick: (...a: unknown[]) => hoisted.registerExportGovernanceQuick(...a),
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => hoisted.auditLogAction(...a) },
}));
vi.mock('../../services/c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: (...a: unknown[]) => hoisted.resolveProgramProjectAnchor(...a),
}));
vi.mock('../../db/requestDb', () => ({ requestDb: () => ({}) }));
vi.mock('../../db', () => {
  const db = { execute: vi.fn(), select: vi.fn(), update: vi.fn(), insert: vi.fn() };
  return { db, pool: null, getPool: () => null, getDb: () => db };
});

import ectdExportRouter from '../ectd-export';

const ASSERTED = {
  aiGenerated: true,
  humanReviewApproved: true,
  reviewerName: 'Dana Reviewer',
  reviewerRole: 'regulatory_affairs',
  reviewTimestamp: '2026-10-15T09:00:00.000Z',
};

function makeApp(user: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenantContext: { organizationId: 100 }, user });
    next();
  });
  app.use('/api/ectd/export', ectdExportRouter);
  return app;
}

beforeEach(() => {
  for (const fn of Object.values(hoisted)) fn.mockReset();
  hoisted.resolveProgramProjectAnchor.mockResolvedValue(77);
  hoisted.assembleSubmissionEctd.mockResolvedValue({
    buffer: Buffer.from('FAKE-ZIP-BYTES'), filename: 'SEQ-1-0000-fda.zip', sequenceId: 1, sequenceNumber: '0000',
    region: 'fda', sha256: 'a'.repeat(64), materialized: 9, unresolvedLeaves: [], skipped: [],
    priorState: 'filed', unfiledPriorSequences: [], programId: '5eb50a2e-235a-4605-bd1b-af2d75e8518c',
    stats: { totalModules: 5, totalFiles: 12, totalGranules: 9, generatedAt: '2026-06-29T00:00:00.000Z' },
  });
  hoisted.validateEctdPackage.mockResolvedValue({ valid: true, errors: [], warnings: [] });
  hoisted.registerExportGovernanceQuick.mockResolvedValue({ ok: true });
  hoisted.auditLogAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
});

describe('eCTD export routes: no user id, no assembly', () => {
  const NO_ID = { organizationId: 100, email: 'someone@example.com' };

  it('POST /:submissionId answers 401 and assembles nothing', async () => {
    const res = await request(makeApp(NO_ID)).post('/api/ectd/export/42').send({ applicationNumber: '123456', governance: ASSERTED });
    expect(res.status, 'a principal with no user id was assembled under user 0').toBe(401);
    expect(hoisted.assembleSubmissionEctd).not.toHaveBeenCalled();
  });

  it('GET /:submissionId/preview answers 401 and assembles nothing', async () => {
    const res = await request(makeApp(NO_ID)).get('/api/ectd/export/42/preview');
    expect(res.status).toBe(401);
    expect(hoisted.assembleSubmissionEctd).not.toHaveBeenCalled();
  });

  it('POST /:submissionId/validate (generate-then-validate) answers 401 and assembles nothing', async () => {
    const res = await request(makeApp(NO_ID)).post('/api/ectd/export/42/validate').send({});
    expect(res.status).toBe(401);
    expect(hoisted.assembleSubmissionEctd).not.toHaveBeenCalled();
  });

  it('a user id of 0 is not a user', async () => {
    const res = await request(makeApp({ id: 0, organizationId: 100 })).get('/api/ectd/export/42/preview');
    expect(res.status).toBe(401);
    expect(hoisted.assembleSubmissionEctd).not.toHaveBeenCalled();
  });
});

describe('a placed eCTD export: the governed record carries the review assertion', () => {
  it('passes the attestation, with the user who made it, to registerExportGovernanceQuick', async () => {
    const res = await request(makeApp({ id: 7, organizationId: 100 }))
      .post('/api/ectd/export/42')
      .send({ applicationNumber: '123456', governance: ASSERTED })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(hoisted.assembleSubmissionEctd).toHaveBeenCalledWith(expect.objectContaining({ userId: 7 }));
    const [args] = hoisted.registerExportGovernanceQuick.mock.calls[0] as [{ userId: number; metadata?: { reviewAttestation?: unknown } }];
    expect(args.userId).toBe(7);
    expect(args.metadata?.reviewAttestation, 'the governed record was given no review attestation').toEqual({
      authorization: 'caller-asserted-review',
      assertedByUserId: 7,
      aiGenerated: true,
      reviewerName: 'Dana Reviewer',
      reviewerRole: 'regulatory_affairs',
      reviewTimestamp: '2026-10-15T09:00:00.000Z',
    });
  });
});
