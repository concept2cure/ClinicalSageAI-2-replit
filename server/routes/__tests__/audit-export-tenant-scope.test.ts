/**
 * VR-02 — the audit export routes read inside a tenant-stamped transaction and
 * state the audit_logs chain verdict.
 *
 * GET /api/audit/export and /api/audit/export/signed passed the shared pool to
 * the export. Under RLS_ENFORCE=on a pooled connection carries no tenant (the
 * audit-trail ledger's own header says so, and it reads in a transaction
 * stamped by setTenantContextTx), so the audit_logs rows the export now reads
 * would come back empty in production. Both routes now run the export in that
 * transaction, supply the one tenant-chain verifier, and pass the record
 * filters an inspector can use to export one document's history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { generate, setTenantContextTx, verifier, verifyExport } = vi.hoisted(() => ({
  generate: vi.fn(), setTenantContextTx: vi.fn(), verifier: vi.fn(), verifyExport: vi.fn(),
}));
vi.mock('../../services/audit/signedAuditExport.js', () => ({
  generateSignedAuditExport: generate,
  verifySignedAuditExport: verifyExport,
}));
vi.mock('../../services/tenant/governed-tenant-context.js', () => ({ setTenantContextTx }));
vi.mock('../../services/audit/tenant-chain-verdict.js', () => ({ verifyTenantChainOnAdminScope: verifier }));

import { createAuditTrailRoutes } from '../audit-trail-routes';

const clientQuery = vi.fn();
const client = { query: clientQuery, release: vi.fn() };
const pool = { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn(async () => client) };

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    // An organisation admin: exports are read by owners, admins and managers (P1-20).
    (req as unknown as { user: unknown }).user = { organizationId: 7, id: 3, name: 'Inspector', role: 'admin' };
    next();
  });
  a.use('/api', createAuditTrailRoutes(pool as never));
  return a;
}

const signed = {
  data: '[]', contentType: 'application/json', filename: 'x.json', signature: 'sig',
  manifest: { exportId: 'E1', dataHash: 'h', rowCount: 0, chainIntegrity: { status: 'unverified' } },
};
const DOC = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  clientQuery.mockResolvedValue({ rows: [] });
  generate.mockResolvedValue(signed);
});

describe.each(['/api/audit/export', '/api/audit/export/signed'])('%s', (path) => {
  it('exports inside a tenant-stamped transaction, with the chain verifier', async () => {
    const res = await request(app()).get(path);
    expect(res.status).toBe(200);
    const [db, req, deps] = generate.mock.calls[0];
    expect(db).toBe(client);
    expect(req.organizationId).toBe(7);
    expect(deps.verifyAuditLogsChain).toBe(verifier);
    expect(setTenantContextTx).toHaveBeenCalledWith(client, 7);
    const sql = clientQuery.mock.calls.map((c) => c[0]);
    expect(sql[0]).toBe('BEGIN');
    expect(sql).toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('passes the record filters', async () => {
    await request(app()).get(`${path}?resource_type=vault_document&record_ids=${DOC}`);
    expect(generate.mock.calls[0][1]).toMatchObject({ resourceType: 'vault_document', recordIds: [DOC] });
  });

  it('refuses a malformed filter rather than exporting everything', async () => {
    const res = await request(app()).get(`${path}?resource_type=vault_document;drop&record_ids=${DOC}`);
    expect(res.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it('rolls back and releases when the export fails', async () => {
    generate.mockRejectedValue(new Error('boom'));
    const res = await request(app()).get(path);
    expect(res.status).toBe(500);
    expect(clientQuery.mock.calls.map((c) => c[0])).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

// P1-19b: every manifest names the key that sealed it (signingKeyId). The
// instructions handed to an inspector and the verification answer say which
// key; neither speaks of "the server signing key" as if there were one.
describe('the export names its key (P1-19b)', () => {
  it('the signed export tells the inspector to use the key its manifest names', async () => {
    generate.mockResolvedValue({ ...signed, manifest: { ...signed.manifest, signingKeyId: 'k2' } });
    const res = await request(app()).get('/api/audit/export/signed');
    expect(res.status).toBe(200);
    expect(res.body.export.verification.signingKeyId).toBe('k2');
    expect(res.body.export.verification.instruction).toMatch(/signingKeyId/);
    expect(res.body.export.verification.instruction).not.toMatch(/the server signing key/);
  });

  it('verification says which key vouched for the export', async () => {
    verifyExport.mockReturnValue({ valid: true, errors: [], signingKeyId: 'k1' });
    const res = await request(app())
      .post('/api/audit/export/verify')
      .send({ data: '[]', manifest: { exportId: 'E1', signingKeyId: 'k1' }, signature: 'sig' });
    expect(res.status).toBe(200);
    expect(res.body.verification).toMatchObject({ valid: true, signingKeyId: 'k1' });
  });

  it('a manifest from before key ids verifies and says no key was named', async () => {
    verifyExport.mockReturnValue({ valid: true, errors: [], signingKeyId: null });
    const res = await request(app())
      .post('/api/audit/export/verify')
      .send({ data: '[]', manifest: { exportId: 'E0' }, signature: 'sig' });
    expect(res.status).toBe(200);
    expect(res.body.verification.valid).toBe(true);
    expect(res.body.verification.signingKeyId).toBeNull();
  });
});
