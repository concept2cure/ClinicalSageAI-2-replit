/** Complete customer data return uses current tenant-wide authority, while
 * audit attestation keeps its existing separate permission. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  query: vi.fn(), curated: vi.fn(), full: vi.fn(), receipt: vi.fn(), attestation: vi.fn(), exportAudit: vi.fn(),
  user: { id: 3, organizationId: 7, role: 'admin', roles: ['admin'] },
}));
vi.mock('../../middleware/auth', () => ({ authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
  Object.assign(req, { user: h.user }); next();
} }));
vi.mock('../../db', () => ({ pool: { query: h.query, connect: async () => ({ query: h.query, release: () => undefined }) } }));
vi.mock('../../services/tenant-export/tenant-export.service', () => ({ exportTenantData: h.curated,
  TenantNotFoundError: class TenantNotFoundError extends Error {} }));
vi.mock('../../services/tenant-export/tenant-full-export.service', () => ({ exportTenantFull: h.full,
  recordExportReceipt: h.receipt, digestOf: () => 'sha256:synthetic', TenantNotFoundError: class TenantNotFoundError extends Error {} }));
// The integrity section (P-58) has its own suites; here the export passes through it unchanged.
vi.mock('../../services/tenant-export/held-record-integrity', () => ({
  withIntegrity: async (_c: unknown, _o: number, payload: Record<string, unknown>) => ({ ...payload, integrity: { chains: [], signatures: [], gateApprovals: [] } }),
}));
vi.mock('../../services/tenant-export/attestation-report.service', () => ({ generateAttestation: h.attestation,
  AttestationKeyMissingError: class AttestationKeyMissingError extends Error {} }));
vi.mock('../../services/audit/audit-write-outcome', () => ({ recordAuditRow: vi.fn(async () => ({ persisted: true, chained: true })) }));
// Attestation delivery independently records its exact bytes through the
// canonical audited sender; the authority fixture supplies that outcome too.
vi.mock('../../services/auditService', () => ({ default: { logAction: h.exportAudit } }));

import router from '../tenant-export';
let db: PGlite;
const app = express(); app.use('/api/tenant-export', router);
beforeAll(async () => {
  db = await PGlite.create();
  // uuid: the export runs in the organization's own scope, its tenant id and its uuid (P-58's data return).
  await db.exec(`CREATE TABLE organizations (id int PRIMARY KEY,status text,uuid uuid DEFAULT gen_random_uuid());
    CREATE TABLE users (id int PRIMARY KEY,status text);
    CREATE TABLE organization_users (organization_id int,user_id int,role text);
    INSERT INTO organizations VALUES (7,'active'),(8,'active');
    INSERT INTO users VALUES (3,'active');
    INSERT INTO organization_users VALUES (7,3,'admin');`);
}, 60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  [h.query, h.curated, h.full, h.receipt, h.attestation, h.exportAudit].forEach(mock => mock.mockReset());
  h.user = { id: 3, organizationId: 7, role: 'admin', roles: ['admin'] };
  h.query.mockImplementation((sql: string, params?: unknown[]) => db.query(sql, params));
  h.curated.mockResolvedValue({ organization: { slug: 'customer' }, counts: {} });
  h.full.mockResolvedValue({ organization: { slug: 'customer' }, coverage: { tablesExported: 0, totalRows: 0 }, tables: [] });
  h.receipt.mockResolvedValue({ recorded: true, inserted: true });
  h.attestation.mockResolvedValue({ schemaVersion: '1.0', organization: { slug: 'customer' } });
  h.exportAudit.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
  await db.exec("UPDATE organizations SET status='active'; UPDATE users SET status='active'; UPDATE organization_users SET role='admin'");
});

describe('current complete tenant data-return authority', () => {
  it.each(['owner', 'admin'])('allows a current %s without relying on the token role', async role => {
    await db.query('UPDATE organization_users SET role=$1', [role]);
    h.user.role = 'member'; h.user.roles = ['member'];
    expect((await request(app).get('/api/tenant-export')).status).toBe(200);
    expect((await request(app).get('/api/tenant-export/full')).status).toBe(200);
    expect(h.receipt).toHaveBeenCalledOnce();
  });

  it.each(['manager', 'approver', 'member', 'viewer'])('refuses current %s despite stale admin claims', async role => {
    await db.query('UPDATE organization_users SET role=$1', [role]);
    expect((await request(app).get('/api/tenant-export')).status).toBe(403);
    expect((await request(app).get('/api/tenant-export/full')).status).toBe(403);
    expect(h.curated).not.toHaveBeenCalled(); expect(h.full).not.toHaveBeenCalled(); expect(h.receipt).not.toHaveBeenCalled();
  });

  it('keeps an eligible administrator able to export during pending deletion', async () => {
    await db.query("UPDATE organizations SET status='pending_deletion' WHERE id=7");
    expect((await request(app).get('/api/tenant-export/full')).status).toBe(200);
  });

  it('refuses a foreign tenant, inactive actor and purged organization', async () => {
    h.user.organizationId = 8;
    expect((await request(app).get('/api/tenant-export/full')).status).toBe(403);
    h.user.organizationId = 7;
    await db.query("UPDATE users SET status='inactive'");
    expect((await request(app).get('/api/tenant-export/full')).status).toBe(403);
    await db.exec("UPDATE users SET status='active'; UPDATE organizations SET status='purged' WHERE id=7");
    expect((await request(app).get('/api/tenant-export/full')).status).toBe(403);
    expect(h.full).not.toHaveBeenCalled();
  });

  it('rechecks a revoked role before returning private data or recording a full receipt', async () => {
    h.full.mockImplementation(async () => {
      await db.query("UPDATE organization_users SET role='viewer'");
      return { companyDocuments: { data: 'private-profile-fixture' } };
    });
    const response = await request(app).get('/api/tenant-export/full');
    expect(response.status).toBe(403); expect(JSON.stringify(response.body)).not.toContain('private-profile-fixture');
    expect(h.receipt).not.toHaveBeenCalled();
  });

  it('leaves the preexisting audit-attestation policy separate from complete data-return authority', async () => {
    await db.query("UPDATE organization_users SET role='manager'"); h.user.role = 'manager'; h.user.roles = ['manager'];
    expect((await request(app).get('/api/tenant-export/attestation')).status).toBe(403);
    h.user.role = 'admin'; h.user.roles = ['admin'];
    expect((await request(app).get('/api/tenant-export/attestation')).status).toBe(200);
    expect((await request(app).get('/api/tenant-export/full')).status).toBe(403);
    expect(h.exportAudit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      action: 'EXPORT_GENERATED', organizationId: 7, userId: 3, resourceType: 'audit_attestation_report',
    }));
    expect(h.attestation).toHaveBeenCalledOnce(); expect(h.full).not.toHaveBeenCalled(); expect(h.receipt).not.toHaveBeenCalled();
  });

  it('refuses an authorized attestation when its independent export record does not persist', async () => {
    h.exportAudit.mockResolvedValue({ persisted: false });
    const response = await request(app).get('/api/tenant-export/attestation');
    expect(response.status).toBe(503);
    expect(response.headers['content-disposition']).toBeUndefined();
    expect(response.headers['x-export-sha256']).toBeUndefined();
    expect(response.body).toMatchObject({ error: 'Attestation not delivered' });
    expect(h.exportAudit).toHaveBeenCalledOnce(); expect(h.attestation).toHaveBeenCalledOnce();
    expect(h.curated).not.toHaveBeenCalled(); expect(h.full).not.toHaveBeenCalled(); expect(h.receipt).not.toHaveBeenCalled();
  });
});
