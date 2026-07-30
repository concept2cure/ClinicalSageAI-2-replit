/**
 * GET /api/protocol-dev — the converged protocol read for the v2 ProtocolDev surface.
 *
 * The route is thin: guard the org, delegate to the real-store assembler, and shape
 * the envelope. It reads ONLY the real normalized store — no legacy/seed fallback —
 * so an org with no protocols gets an honest empty list. (The full field mapping is
 * proven against real SQL in pdev-view-assembler.pglite.integration.test.ts.)
 */

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const assembleOrgPdevDocs = vi.fn();
vi.mock('../../services/protocol-development/pdev-view-assembler', () => ({
  assembleOrgPdevDocs: (...a: unknown[]) => assembleOrgPdevDocs(...a),
}));

import protocolDevRouter from '../protocol-dev.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (org != null) (req as unknown as { tenantContext: unknown }).tenantContext = { organizationId: org };
    next();
  });
  app.use('/api/protocol-dev', protocolDevRouter);
  return app;
}

beforeEach(() => assembleOrgPdevDocs.mockReset());

describe('GET /api/protocol-dev', () => {
  it('403 without organization context', async () => {
    const res = await request(appWith(null)).get('/api/protocol-dev');
    expect(res.status).toBe(403);
    expect(assembleOrgPdevDocs).not.toHaveBeenCalled();
  });

  it('returns the real-store protocols for the acting org, source = protocol_documents', async () => {
    assembleOrgPdevDocs.mockResolvedValue([{ id: '5', title: 'A Phase 3 NSCLC Study' }]);
    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(200);
    expect(assembleOrgPdevDocs).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('protocol_documents');
    expect(res.body.data[0].title).toBe('A Phase 3 NSCLC Study');
  });

  it('honest empty list when the org has no protocols — no fallback data', async () => {
    assembleOrgPdevDocs.mockResolvedValue([]);
    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  it('fails closed to an empty list when the store is not provisioned (42P01)', async () => {
    // The route catches a missing-relation error and returns an empty list
    // with pendingStore:true, so an unprovisioned store never 500s. (Moved
    // here from the retired protocol-dev-read.test.ts, which tested the
    // pre-refactor single-query route; the field mapping it also asserted is
    // now proven against real SQL in the pdev-view-assembler pglite test.)
    assembleOrgPdevDocs.mockImplementationOnce(() => {
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
    });
    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });

  it('500s on a non-42P01 assembler failure', async () => {
    assembleOrgPdevDocs.mockImplementationOnce(() => {
      throw new Error('connection reset');
    });
    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
  });
});
