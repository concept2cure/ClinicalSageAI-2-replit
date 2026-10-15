/**
 * Tenant export / full export / attestation — a 500 carries the envelope, never
 * the thrower's text (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * The three handlers answered `{ error: '<…> failed', detail: err.message }`
 * through a local `detail` alias. The export services walk every tenant-keyed
 * table and write a receipt, so the detail is driver text: a relation, a
 * column, a constraint. Harness as server/__tests__/routes/tenant-export.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL permission denied for table tenant_export_receipts';

const { exportSvc, fullSvc, attestationSvc, logError, TenantNotFoundError, AttestationKeyMissingError } = vi.hoisted(
  () => ({
    exportSvc: { exportTenantData: vi.fn() },
    fullSvc: { exportTenantFull: vi.fn(), recordExportReceipt: vi.fn(), digestOf: vi.fn((..._a: any[]) => 'sha256:x') },
    attestationSvc: { generateAttestation: vi.fn() },
    logError: vi.fn(),
    TenantNotFoundError: class TenantNotFoundError extends Error {},
    AttestationKeyMissingError: class AttestationKeyMissingError extends Error {},
  }),
);

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 1, organizationId: '7', role: 'admin' };
    next();
  },
}));
vi.mock('../../services/tenant-export/tenant-export.service', () => ({
  exportTenantData: (...a: any[]) => exportSvc.exportTenantData(...a),
  TenantNotFoundError,
}));
vi.mock('../../services/tenant-export/tenant-full-export.service', () => ({
  exportTenantFull: (...a: any[]) => fullSvc.exportTenantFull(...a),
  recordExportReceipt: (...a: any[]) => fullSvc.recordExportReceipt(...a),
  digestOf: (...a: any[]) => fullSvc.digestOf(...a),
  TenantNotFoundError,
}));
vi.mock('../../services/tenant-export/attestation-report.service', () => ({
  generateAttestation: (...a: any[]) => attestationSvc.generateAttestation(...a),
  AttestationKeyMissingError,
}));
vi.mock('../../db', () => ({ pool: {} }));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async () => ({ persisted: true, chained: true })),
}));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import router from '../tenant-export';

function app() {
  const a = express();
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-tenant-export');
    next();
  });
  a.use('/api/tenant-export', router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toMatch(/SENTINEL-DB-DETAIL|tenant_export_receipts|permission denied/);
  expect(res.body.detail).toBeUndefined();
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-tenant-export');
}

beforeEach(() => vi.clearAllMocks());

describe('tenant-export 500s: envelope out, detail to the log', () => {
  it('GET /', async () => {
    exportSvc.exportTenantData.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).get('/api/tenant-export'));
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('GET /full', async () => {
    fullSvc.exportTenantFull.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).get('/api/tenant-export/full'));
  });

  it('GET /attestation', async () => {
    attestationSvc.generateAttestation.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).get('/api/tenant-export/attestation'));
  });

  it('leaves the 404 and the 503 answers unchanged', async () => {
    exportSvc.exportTenantData.mockRejectedValue(new TenantNotFoundError('Organization 7 not found'));
    const missing = await request(app()).get('/api/tenant-export');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Organization 7 not found' });
    attestationSvc.generateAttestation.mockRejectedValue(new AttestationKeyMissingError());
    const nokey = await request(app()).get('/api/tenant-export/attestation');
    expect(nokey.status).toBe(503);
    expect(nokey.body.detail).toContain('AUDIT_ATTESTATION_KEY');
  });
});
