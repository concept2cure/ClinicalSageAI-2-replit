/**
 * POST /api/c2c/project-vault/:id/documents/:documentId/details: Edit details
 * (VR-05, D5). The writer is proven on PostgreSQL
 * (tests/db/vault-metadata-edit.dbtest.ts); this pins the route. It sits
 * behind the governed-write gate, carries only the request's own fields and
 * the session's identity to the writer, and reports a refusal or a failure as
 * one, never as a save.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { editVaultDocumentMetadata } = vi.hoisted(() => ({ editVaultDocumentMetadata: vi.fn() }));
vi.mock('../../../services/vault/vault-metadata-edit.service.js', () => ({ editVaultDocumentMetadata }));
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() } }));

import createProjectVaultRoutes from '../project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const url = `/api/c2c/project-vault/${PROGRAM}/documents/${DOC}/details`;

function app(role: string) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: 7, id: 3, role };
    (req as unknown as { userRole: string }).userRole = role;
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const REASON = 'The sponsor renamed the protocol at the pre-IND meeting.';

beforeEach(() => {
  vi.clearAllMocks();
  editVaultDocumentMetadata.mockResolvedValue({
    ok: true,
    unchanged: false,
    changes: [{ field: 'document_title', from: 'Protocol', to: 'Clinical protocol' }],
  });
});

describe('Edit details route', () => {
  it('carries the request to the writer with the session identity, and returns what changed', async () => {
    const res = await request(app('member'))
      .post(url)
      .send({ documentTitle: 'Clinical protocol', documentType: 'PROTOCOL', classification: 'CONFIDENTIAL', reason: REASON, organizationId: 99 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      unchanged: false,
      changes: [{ field: 'document_title', from: 'Protocol', to: 'Clinical protocol' }],
    });
    expect(editVaultDocumentMetadata).toHaveBeenCalledTimes(1);
    expect(editVaultDocumentMetadata.mock.calls[0][0]).toMatchObject({
      programId: PROGRAM,
      documentId: DOC,
      organizationId: 7,
      userId: 3,
      documentTitle: 'Clinical protocol',
      documentType: 'PROTOCOL',
      classification: 'CONFIDENTIAL',
      reason: REASON,
    });
  });

  it('refuses a viewer at the gate, before the writer runs', async () => {
    const res = await request(app('viewer')).post(url).send({ documentTitle: 'X', reason: REASON });
    expect(res.status).toBe(403);
    expect(editVaultDocumentMetadata).not.toHaveBeenCalled();
  });

  it('passes on only string fields: anything else is not a value to write', async () => {
    await request(app('member')).post(url).send({ documentTitle: 123, classification: ['PUBLIC'], reason: REASON });
    const args = editVaultDocumentMetadata.mock.calls[0][0];
    expect(args.documentTitle).toBeUndefined();
    expect(args.classification).toBeUndefined();
  });

  it("reports the writer's refusal as it was given", async () => {
    editVaultDocumentMetadata.mockResolvedValue({
      ok: false,
      status: 422,
      code: 'REASON_REQUIRED',
      message: 'A reason for change of at least 8 characters is required. Nothing was changed.',
    });
    const res = await request(app('member')).post(url).send({ documentTitle: 'Clinical protocol' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ success: false, error: 'REASON_REQUIRED' });
    expect(res.body.message).toMatch(/Nothing was changed/);
  });

  it('a failed write is a 500 that says nothing was changed, never a save', async () => {
    editVaultDocumentMetadata.mockRejectedValue(new Error('connection reset'));
    const res = await request(app('member')).post(url).send({ documentTitle: 'Clinical protocol', reason: REASON });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Nothing was changed/);
    expect(JSON.stringify(res.body)).not.toMatch(/connection reset/);
  });
});
