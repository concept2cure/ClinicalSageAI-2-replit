/**
 * POST /api/vault/ingest refuses lineage on the upload body (VR-05, D5).
 *
 * The body accepted `parentDocumentId` and `supersedesId` as any UUID and
 * wrote them to the new version's record. Nothing checked that they named a
 * document at all, let alone one in the same program or organization, and no
 * client sends them (useVaultUpload.ts, Etmf.tsx, AnA's filing tool). So the
 * only way to set a version's lineage was a raw API call that could name
 * anything. Lineage is part of the record VR-06 freezes. It is refused here,
 * before anything is stored, rather than accepted unchecked or dropped
 * silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const ingestVaultDocument = vi.hoisted(() => vi.fn());

vi.mock('../../middleware/orgMembership', () => ({
  requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../db/tenantStore', () => ({
  runWithTenantScope: (_scope: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../../services/vault/vault-ingest.service', () => ({
  ingestVaultDocument: (...a: unknown[]) => ingestVaultDocument(...a),
}));

import createVaultIngestRoutes from '../vault-ingest';
import { errorHandler } from '../../middleware/errorHandler';

const PROGRAM = '11111111-1111-1111-1111-111111111111';
const OTHER_DOC = '33333333-3333-4333-8333-333333333333';
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

function app() {
  const a = express();
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 1, organizationId: 2, role: 'member' };
    (req as unknown as { tenantId: number }).tenantId = 2;
    next();
  });
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use(errorHandler);
  return a;
}

const upload = (extra: Record<string, string> = {}) => {
  let r = request(app())
    .post('/api/vault/ingest')
    .field('programId', PROGRAM)
    .field('documentCode', 'protocol')
    .field('documentTitle', 'Protocol')
    .field('documentType', 'PROTOCOL');
  for (const [k, v] of Object.entries(extra)) r = r.field(k, v);
  return r.attach('file', PDF, { filename: 'protocol.pdf', contentType: 'application/pdf' });
};

beforeEach(() => {
  ingestVaultDocument.mockReset();
  ingestVaultDocument.mockResolvedValue({
    ok: true,
    document: { id: 'd1' },
    filing: { folderId: null, needsReview: true },
  });
});

describe('POST /api/vault/ingest — lineage is not set by an upload', () => {
  it.each(['parentDocumentId', 'supersedesId'])('refuses %s with 400, before anything is stored', async (field) => {
    const res = await upload({ [field]: OTHER_DOC });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LINEAGE_NOT_ACCEPTED');
    expect(res.body.error.message).toMatch(/Nothing was saved/);
    expect(ingestVaultDocument).not.toHaveBeenCalled();
  });

  it('admits an upload that names no lineage, as before', async () => {
    const res = await upload();
    expect(res.status).toBe(201);
    expect(ingestVaultDocument).toHaveBeenCalledTimes(1);
  });
});
