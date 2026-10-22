/**
 * Tenant-export route tests — admin gate, tenant scope, audit emission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { authState, exportSvc, attestationSvc, audit } = vi.hoisted(() => ({
  authState: { user: null as Record<string, any> | null },
  exportSvc: { exportTenantData: vi.fn() },
  attestationSvc: { generateAttestation: vi.fn() },
  audit: { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = authState.user;
    next();
  },
}));

class TenantNotFoundError extends Error {
  constructor(m: string) { super(m); this.name = 'TenantNotFoundError'; }
}
class AttestationKeyMissingError extends Error {
  constructor() { super('key missing'); this.name = 'AttestationKeyMissingError'; }
}

vi.mock('../../services/tenant-export/tenant-export.service', () => ({
  exportTenantData: (...args: any[]) => exportSvc.exportTenantData(...args),
  TenantNotFoundError,
}));
vi.mock('../../services/tenant-export/attestation-report.service', () => ({
  generateAttestation: (...args: any[]) => attestationSvc.generateAttestation(...args),
  AttestationKeyMissingError,
}));
vi.mock('../../db', () => ({ pool: {} }));
vi.mock('../../services/auditService', () => ({ default: audit }));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 1, organizationId: '7', role: 'admin' };
  vi.resetModules();
  const mod = await import('../../routes/tenant-export');
  app = express();
  app.use(express.json());
  app.use('/api/tenant-export', mod.default);
});

describe('GET /api/tenant-export', () => {
  it('returns 403 with no organization context', async () => {
    authState.user = null;
    const res = await request(app).get('/api/tenant-export');
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-admin users', async () => {
    authState.user = { id: 1, organizationId: '7', role: 'member' };
    const res = await request(app).get('/api/tenant-export');
    expect(res.status).toBe(403);
  });

  it('accepts admin role via roles array too', async () => {
    authState.user = { id: 1, organizationId: '7', roles: ['member', 'admin'] };
    exportSvc.exportTenantData.mockResolvedValue({
      organization: { slug: 'a' },
      counts: { programs: 1 },
    });
    const res = await request(app).get('/api/tenant-export');
    expect(res.status).toBe(200);
  });

  it('returns 404 when org missing', async () => {
    exportSvc.exportTenantData.mockRejectedValue(new TenantNotFoundError('nope'));
    const res = await request(app).get('/api/tenant-export');
    expect(res.status).toBe(404);
  });

  it('emits tenant.export audit on success', async () => {
    exportSvc.exportTenantData.mockResolvedValue({
      organization: { slug: 'acme' },
      counts: { programs: 3 },
    });
    const res = await request(app).get('/api/tenant-export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('tenant-export-acme-');
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.export', tenantId: 7 }),
    );
  });

  it('passes the caller orgId through to the service (no override)', async () => {
    exportSvc.exportTenantData.mockResolvedValue({
      organization: { slug: 'acme' },
      counts: {},
    });
    await request(app).get('/api/tenant-export');
    expect(exportSvc.exportTenantData).toHaveBeenCalledWith(expect.anything(), 7);
  });
});

describe('GET /api/tenant-export/attestation', () => {
  it('returns 503 when attestation key not configured', async () => {
    attestationSvc.generateAttestation.mockRejectedValue(new AttestationKeyMissingError());
    const res = await request(app).get('/api/tenant-export/attestation');
    expect(res.status).toBe(503);
    expect(res.body.detail).toContain('AUDIT_ATTESTATION_KEY');
  });

  /* D5: the report is a document handed to an auditor, so its delivery is
     recorded with the SHA-256 of the exact bytes, and refused without it. */
  const REPORT = { organization: { slug: 'acme' }, attestation: 'INTACT', totalEntries: 5, brokenLinks: 0 };
  const rawBody = (res: any, cb: any) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  it('records EXPORT_GENERATED with the SHA-256 of the report it delivers', async () => {
    const { createHash } = await import('node:crypto');
    attestationSvc.generateAttestation.mockResolvedValue(REPORT);
    const res = await request(app).get('/api/tenant-export/attestation').buffer(true).parse(rawBody);
    expect(res.status).toBe(200);
    const digest = createHash('sha256').update(res.body as Buffer).digest('hex');
    const row = audit.logAction.mock.calls.map(([e]: any[]) => e).find((e: any) => e.action === 'EXPORT_GENERATED');
    expect(row, 'no EXPORT_GENERATED row').toBeTruthy();
    expect(row.organizationId).toBe(7);
    expect(row.userId).toBe(1);
    expect(JSON.stringify(row)).toContain(digest);
    expect(res.headers['x-export-sha256']).toBe(digest);
    // The bytes the screen saves: the same serialization of the same report.
    expect((res.body as Buffer).toString('utf8')).toBe(JSON.stringify(REPORT, null, 2));
  });

  it('delivers nothing when the export record does not persist, and says so', async () => {
    attestationSvc.generateAttestation.mockResolvedValue(REPORT);
    audit.logAction.mockImplementation(async (e: any) =>
      e.action === 'EXPORT_GENERATED' ? { persisted: false } : { persisted: true, chained: true, tamperProof: true },
    );
    const res = await request(app).get('/api/tenant-export/attestation');
    expect(res.status).toBe(503);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.body.detail).toMatch(/record could not be written/);
    audit.logAction.mockImplementation(async () => ({ persisted: true, chained: true, tamperProof: true }));
  });

  it('emits tenant.attestation.generate audit on success', async () => {
    attestationSvc.generateAttestation.mockResolvedValue({
      organization: { slug: 'acme' },
      attestation: 'INTACT',
      totalEntries: 5,
      brokenLinks: 0,
    });
    const res = await request(app).get('/api/tenant-export/attestation');
    expect(res.status).toBe(200);
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.attestation.generate' }),
    );
  });
});
