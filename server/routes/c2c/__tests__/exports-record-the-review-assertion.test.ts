/**
 * A chat-artifact export records the review assertion that let it through.
 *
 * Until 2026-10-15 POST /api/concept2cure/artifacts/export-{docx,pdf,pptx}
 * stamped `X-Concept2Cure-Human-Review-Approved: true` with a reviewer name and
 * time taken verbatim from the request body, and its EXPORT_GENERATED row
 * carried only the title: the attestation that passed the review gate was not
 * recorded anywhere, and was presented as a verified approval. The row now
 * carries `reviewAttestation` — the caller's assertion, as an assertion, with
 * the authenticated user who made it — and the response says
 * `X-Concept2Cure-Export-Authorization: caller-asserted-review`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const logAction = vi.hoisted(() => vi.fn());
vi.mock('../../../services/auditService', () => ({ default: { logAction: (...a: unknown[]) => logAction(...a) } }));
vi.mock('../../../services/compute/artifactWriteback', () => ({ registerArtifactWithGovernance: vi.fn() }));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: Request, _s: Response, n: NextFunction) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: Request, _s: Response, n: NextFunction) => n(),
  requireOrganizationContext: (_q: Request, _s: Response, n: NextFunction) => n(),
}));
vi.mock('../shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../shared');
  return {
    ...actual,
    concept2cureRateLimiter: (_q: Request, _s: Response, n: NextFunction) => n(),
    getOrganizationId: () => 7,
    getUserId: () => 3,
  };
});
vi.mock('../../../services/docxGenerator', () => ({ generateDocxBuffer: vi.fn(async () => Buffer.from('PK docx')) }));

import exportsRouter from '../exports';

const binary = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

function exportsApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/concept2cure', exportsRouter);
  return app;
}

beforeEach(() => {
  logAction.mockReset();
  logAction.mockResolvedValue({ persisted: true });
});

describe('POST /api/concept2cure/artifacts/export-docx — the review assertion is recorded as one', () => {
  const body = {
    title: 'Nonclinical Overview',
    content: '# 2.4 Nonclinical overview',
    governance: {
      aiGenerated: true,
      humanReviewApproved: true,
      reviewerName: 'Dr. Jane Doe',
      reviewerRole: 'Regulatory Affairs Lead',
      reviewTimestamp: '2026-03-24T12:00:00.000Z',
    },
  };

  it('the EXPORT_GENERATED row carries the assertion and the user who made it', async () => {
    const res = await request(exportsApp()).post('/api/concept2cure/artifacts/export-docx').send(body).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const row = logAction.mock.calls[0][0];
    expect(row).toMatchObject({ userId: 3, action: 'EXPORT_GENERATED' });
    expect(row.details.reviewAttestation, 'the review attestation was not recorded').toEqual({
      authorization: 'caller-asserted-review',
      assertedByUserId: 3,
      aiGenerated: true,
      reviewerName: 'Dr. Jane Doe',
      reviewerRole: 'Regulatory Affairs Lead',
      reviewTimestamp: '2026-03-24T12:00:00.000Z',
    });
  });

  it('the response names the approval as caller-asserted, not as an approved review', async () => {
    const res = await request(exportsApp()).post('/api/concept2cure/artifacts/export-docx').send(body).buffer(true).parse(binary);
    expect(res.headers['x-concept2cure-human-review-approved']).toBeUndefined();
    expect(res.headers['x-concept2cure-export-authorization']).toBe('caller-asserted-review');
    expect(res.headers['x-concept2cure-asserted-reviewer']).toBe('Dr.%20Jane%20Doe');
  });

  it('an export nobody asserted a review for records that nothing authorized it', async () => {
    const res = await request(exportsApp())
      .post('/api/concept2cure/artifacts/export-docx')
      .send({ title: body.title, content: body.content })
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    expect(logAction.mock.calls[0][0].details.reviewAttestation).toMatchObject({
      authorization: 'none',
      assertedByUserId: 3,
      reviewerName: null,
    });
  });
});
