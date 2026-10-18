/**
 * An eCTD package export records the review assertion that let it through.
 *
 * Until 2026-10-15 POST /api/ectd/export/:submissionId stamped
 * `X-Concept2Cure-Human-Review-Approved: true` with a reviewer name and time
 * taken verbatim from the request body, and neither its ectd_export_generated
 * audit row nor (for a program with no project anchor) its EXPORT_GENERATED row
 * carried any of it: the attestation that passed the review gate — the only
 * thing standing for a human review of a filing package — was recorded nowhere.
 * Both rows now carry `reviewAttestation`: the caller's assertion, as an
 * assertion, with the authenticated user who made it.
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
  reviewerRole: 'Regulatory Affairs',
  reviewTimestamp: '2026-09-24T10:00:00.000Z',
};
const RECORDED = {
  authorization: 'caller-asserted-review',
  assertedByUserId: 7,
  aiGenerated: true,
  reviewerName: 'Dana Reviewer',
  reviewerRole: 'Regulatory Affairs',
  reviewTimestamp: '2026-09-24T10:00:00.000Z',
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req as any, { tenantContext: { organizationId: 100 }, user: { id: 7, organizationId: 100 } });
    next();
  });
  app.use('/api/ectd/export', ectdExportRouter);
  return app;
}

const post = () =>
  request(makeApp())
    .post('/api/ectd/export/42')
    .send({ applicationNumber: '123456', governance: ASSERTED })
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

const rows = (action: string) =>
  hoisted.auditLogAction.mock.calls.map((c) => c[0]).filter((e: any) => e?.action === action);

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

describe('POST /api/ectd/export/:submissionId — the review assertion is recorded as one', () => {
  it('the ectd_export_generated row carries the assertion and the user who made it', async () => {
    const res = await post();
    expect(res.status, (res.body as Buffer).toString('utf8').slice(0, 300)).toBe(200);
    const [row] = rows('ectd_export_generated');
    expect(row?.userId).toBe(7);
    expect(row?.details?.reviewAttestation, 'the review attestation was not recorded').toEqual(RECORDED);
  });

  it('an unplaced export records it on its EXPORT_GENERATED row too', async () => {
    hoisted.resolveProgramProjectAnchor.mockResolvedValueOnce(null);
    const res = await post();
    expect(res.status).toBe(200);
    expect(rows('EXPORT_GENERATED')[0]?.details?.reviewAttestation).toEqual(RECORDED);
  });

  it('the response names the approval as caller-asserted, not as an approved review', async () => {
    const res = await post();
    expect(res.headers['x-concept2cure-human-review-approved']).toBeUndefined();
    expect(res.headers['x-concept2cure-export-authorization']).toBe('caller-asserted-review');
  });
});
