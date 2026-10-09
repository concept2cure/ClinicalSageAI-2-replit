/**
 * GET /api/c2c/project-vault/:id/documents/:documentId/history — VR-01's route.
 * The reader itself is proven on PGlite (vault-document-history.pglite.test.ts);
 * this pins the route's contract: the document must be this program's and this
 * org's before any history is read, the read runs in a tenant-stamped
 * transaction, and a failed read is an error, never an empty history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query, clientQuery, readRecordAuditHistory, setTenantContextTx } = vi.hoisted(() => ({
  query: vi.fn(), clientQuery: vi.fn(), readRecordAuditHistory: vi.fn(), setTenantContextTx: vi.fn(),
}));
vi.mock('../../../db.js', () => ({
  pool: { query, connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })) },
}));
vi.mock('../../audit-trail-ledger.routes.js', () => ({ readRecordAuditHistory }));
vi.mock('../../../services/tenant/governed-tenant-context.js', () => ({ setTenantContextTx }));

import createProjectVaultRoutes from '../project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const url = `/api/c2c/project-vault/${PROGRAM}/documents/${DOC}/history`;

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: 7, id: 3 };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const entry = { id: 'AUD-1', event: 'Vault Document Download', actor: 'Dana Reviewer', at: '2026-09-24T10:00:00.000Z', hash: 'h1', prevHash: 'h0', seq: 9 };
const verdict = { store: 'audit_logs', ok: true, rowsChecked: 3, legacyRows: 0, sequencedRows: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  query.mockImplementation(async (sql: string) =>
    /FROM regulatory_programs/.test(sql) && !/vault\.documents/.test(sql) ? { rows: [{ id: PROGRAM }] }
    : /FROM vault\.documents/.test(sql) ? { rows: [{ id: DOC }] }
    : { rows: [] });
  clientQuery.mockResolvedValue({ rows: [] });
  readRecordAuditHistory.mockResolvedValue({ data: [entry], meta: { chain: verdict } });
});

describe('document history route', () => {
  it('reads this document\'s rows from the ledger, in a tenant-stamped transaction', async () => {
    const res = await request(app()).get(url);
    expect(res.status).toBe(200);
    expect(res.body.data.entries).toEqual([entry]);
    expect(res.body.data.chain).toEqual(verdict);
    const [, orgId, record] = readRecordAuditHistory.mock.calls[0];
    expect(orgId).toBe(7);
    expect(record).toMatchObject({ tableName: 'vault_document', recordId: DOC });
    expect(setTenantContextTx).toHaveBeenCalledWith(expect.anything(), 7);
    expect(clientQuery.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
  });

  it('404s a document that is not this program\'s or this org\'s, and reads nothing', async () => {
    query.mockImplementation(async (sql: string) =>
      /FROM vault\.documents/.test(sql) ? { rows: [] } : { rows: [{ id: PROGRAM }] });
    const res = await request(app()).get(url);
    expect(res.status).toBe(404);
    expect(readRecordAuditHistory).not.toHaveBeenCalled();
  });

  it('a failed read is an error, never an empty history', async () => {
    readRecordAuditHistory.mockRejectedValue(new Error('boom'));
    const res = await request(app()).get(url);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.data?.entries).toBeUndefined();
  });
});
