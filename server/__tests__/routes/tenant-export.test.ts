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
  audit: { logAction: vi.fn().mockResolvedValue(undefined) },
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
