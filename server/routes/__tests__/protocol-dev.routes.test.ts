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
const listPdevProtocolIndex = vi.fn();
const pinned = { query: vi.fn(), discard: vi.fn() };
vi.mock('../../services/protocol-development/pdev-view-assembler', () => ({
  assembleOrgPdevDocs: (...a: unknown[]) => assembleOrgPdevDocs(...a),
  listPdevProtocolIndex: (...a: unknown[]) => listPdevProtocolIndex(...a),
}));

import protocolDevRouter from '../protocol-dev.routes';

function appWith(org: number | null, hasPinned = true) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (org != null) Object.assign(req, { tenantContext: { organizationId: org }, ...(hasPinned ? { dbClient: pinned } : {}) });
    next();
  });
  app.use('/api/protocol-dev', protocolDevRouter);
  return app;
}

beforeEach(() => {
  assembleOrgPdevDocs.mockReset(); listPdevProtocolIndex.mockReset();
  pinned.discard.mockReset().mockResolvedValue(undefined);
  pinned.query.mockReset().mockImplementation(async (sql: string) => ({ rows: sql.includes("current_setting('transaction_isolation')")
    ? [{ active_transaction: false, transaction_isolation: 'read committed' }] : [] }));
});

describe('GET /api/protocol-dev', () => {
  it('reads the full index in the requested program scope', async () => {
    const programId = '11111111-1111-4111-8111-111111111111';
    listPdevProtocolIndex.mockResolvedValue([{ id: '9', title: 'Older document', programId }]);
    const res = await request(appWith(7)).get('/api/protocol-dev').query({ view: 'index', programId });
    expect(res.status).toBe(200);
    expect(listPdevProtocolIndex).toHaveBeenCalledWith(7, { programId }, pinned);
    expect(assembleOrgPdevDocs).not.toHaveBeenCalled();
  });

  it('loads the selected older document by id and explicit unfiled scope', async () => {
    assembleOrgPdevDocs.mockResolvedValue([{ id: '5', title: 'Older document' }]);
    const res = await request(appWith(7)).get('/api/protocol-dev').query({ documentId: '5', programId: 'unfiled' });
    expect(res.status).toBe(200);
    expect(assembleOrgPdevDocs).toHaveBeenCalledWith(7, { documentId: 5, programId: 'unfiled' }, pinned);
  });

  it.each([{ documentId: '0' }, { documentId: '1 OR 1=1' }, { documentId: '9007199254740993' }, { programId: 'other' }, { view: 'raw' }])('refuses invalid selection %j before any read', async (query) => {
    const res = await request(appWith(7)).get('/api/protocol-dev').query(query);
    expect(res.status).toBe(400);
    expect(assembleOrgPdevDocs).not.toHaveBeenCalled();
    expect(listPdevProtocolIndex).not.toHaveBeenCalled();
  });
  it('403 without organization context', async () => {
    const res = await request(appWith(null)).get('/api/protocol-dev');
    expect(res.status).toBe(403);
    expect(assembleOrgPdevDocs).not.toHaveBeenCalled();
  });
  it('refuses an organization-scoped request without its pinned connection before querying a shared pool', async () => {
    const res = await request(appWith(7, false)).get('/api/protocol-dev');
    expect(res.status).toBe(500); expect(assembleOrgPdevDocs).not.toHaveBeenCalled(); expect(listPdevProtocolIndex).not.toHaveBeenCalled();
  });

  it('returns the real-store protocols for the acting org, source = protocol_documents', async () => {
    assembleOrgPdevDocs.mockResolvedValue([{ id: '5', title: 'A Phase 3 NSCLC Study' }]);
    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(200);
    expect(assembleOrgPdevDocs).toHaveBeenCalledWith(7, {}, pinned);
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


describe('GET protocol read snapshot failure ownership', () => {
  it('refuses to start a transaction when the actual transaction state is unknown', async () => {
    pinned.query.mockResolvedValue({ rows: [] });
    const response = await request(appWith(7)).get('/api/protocol-dev');
    expect(response.status).toBe(500); expect(assembleOrgPdevDocs).not.toHaveBeenCalled();
    expect(pinned.query.mock.calls.some(([sql]) => sql.startsWith('BEGIN'))).toBe(false);
  });

  it('discards an uncertain read commit without claiming a rollback or returning healthy data', async () => {
    assembleOrgPdevDocs.mockResolvedValue([{ id: '5' }]);
    pinned.query.mockImplementation(async (sql: string) => {
      if (sql === 'COMMIT') throw new Error('Synthetic read completion loss');
      return { rows: sql.includes("current_setting('transaction_isolation')")
        ? [{ active_transaction: false, transaction_isolation: 'read committed' }] : [] };
    });
    const response = await request(appWith(7)).get('/api/protocol-dev');
    expect(response.status).toBe(500); expect(response.body.data).toBeUndefined();
    expect(pinned.discard).toHaveBeenCalledOnce();
    expect(pinned.query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(false);
  });

  it('discards a failed read transaction whose rollback could not be confirmed', async () => {
    assembleOrgPdevDocs.mockRejectedValue(new Error('Synthetic read failure'));
    pinned.query.mockImplementation(async (sql: string) => {
      if (sql === 'ROLLBACK') throw new Error('Synthetic cleanup failure');
      return { rows: sql.includes("current_setting('transaction_isolation')")
        ? [{ active_transaction: false, transaction_isolation: 'read committed' }] : [] };
    });
    const response = await request(appWith(7)).get('/api/protocol-dev');
    expect(response.status).toBe(500); expect(pinned.discard).toHaveBeenCalledOnce();
    expect(pinned.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
  });
});
