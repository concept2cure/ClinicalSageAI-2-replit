/**
 * POST /api/audit/export/verify — who may check a sealed package, whose package it may be, and that the check
 * is recorded (GA readiness map 2026-11-10, GA-D6-03).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * The route sat beside GET /audit/export and /audit/export/signed, which need the session's organisation and
 * the audit-reader role, and had neither: any signed-in session, a viewer included, could put any package to
 * the platform's seal key and learn whether it was genuine, another organisation's package included, and
 * nothing recorded that the check was made.
 *
 * Pinned here: the same two gates as the exports; a package sealed for another organisation, or one that names
 * no organisation, is refused with no verdict; and the verdict is returned only after one row on the
 * organisation's audit chain says who checked which package and what the answer was. The real router, signer
 * and verifier run; the database and the chain writer are doubles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { record } = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock('../../services/auditService.js', () => ({ writeChainedAuditRow: record }));
vi.mock('../../services/tenant/governed-tenant-context.js', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../services/audit/tenant-chain-verdict.js', () => ({ verifyTenantChainOnAdminScope: vi.fn(async () => ({ ok: true })) }));

import { createAuditTrailRoutes } from '../audit-trail-routes';
import { sealManifestV2, sha256Hex } from '../../services/audit/signedAuditExport';

const ORG = 7;
const clientQuery = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })) };

function app(role: string, organizationId = ORG) {
  const a = express();
  a.use(express.json({ limit: '5mb' }));
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: { id: 2, email: 'b@acme.test', organizationId, role, roles: [role] }, userId: 2, userRole: role, tenantContext: { organizationId } });
    next();
  });
  a.use('/api', createAuditTrailRoutes(pool as never));
  return a;
}

const DATA = JSON.stringify([{ source: 'audit_events', id: 1, organization_id: ORG, user_name: 'Rae Okafor' }]);
/** A signed audit export: the organisation is sealed in queryFilters. */
const auditExport = (org: number | undefined) => ({ data: DATA, ...sealManifestV2({
  exportId: 'AUDIT-EXPORT-1', exportedAt: '2026-11-01T09:00:00.000Z', exportedBy: 'Rae Okafor', exportedByRole: 'manager',
  queryFilters: org === undefined ? {} : { organizationId: org }, format: 'json', rowCount: 1, truncated: false, dataHash: sha256Hex(DATA), hashAlgorithm: 'SHA-256',
}) });
/** A compliance report: the organisation is sealed at the top of the manifest. */
const complianceReport = (org: number) => ({ data: DATA, ...sealManifestV2({
  exportId: 'COMPLIANCE-REPORT-1', kind: 'compliance-report', report: 'access-review', organizationId: org, format: 'json', dataHash: sha256Hex(DATA), hashAlgorithm: 'SHA-256',
}) });
const verify = (a: express.Express, pkg: object) => request(a).post('/api/audit/export/verify').send(pkg);

const saved = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUDIT_EXPORT_SIGNING_KEY = 'v'.repeat(48);
  process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k-verify';
  record.mockResolvedValue(undefined);
});
afterEach(() => { process.env = { ...saved }; });

describe('POST /api/audit/export/verify — who may check a package', () => {
  it.each(['member', 'viewer'])('a %s is refused before the seal key is used', async (role) => {
    const r = await verify(app(role), auditExport(ORG));
    expect(r.status, `a ${role} put a package to the seal key`).toBe(403);
    expect(r.body.error).toBe('AUDIT_READ_RESTRICTED');
    expect(r.body.verification).toBeUndefined();
    expect(record).not.toHaveBeenCalled();
  });

  it('a session whose organisation is 0 is refused: 0 is not a tenant', async () => {
    const r = await verify(app('admin', 0), auditExport(0));
    expect(r.status).toBe(403);
    expect(r.body.verification).toBeUndefined();
    expect(record).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin', 'manager'])('%s checks the organisation\'s own package', async (role) => {
    const r = await verify(app(role), auditExport(ORG));
    expect(r.status).toBe(200);
    expect(r.body.verification).toMatchObject({ valid: true, errors: [], signingKeyId: 'k-verify' });
  });
});

describe('POST /api/audit/export/verify — whose package it is', () => {
  it.each([
    ['a signed audit export', auditExport(8)],
    ['a compliance report', complianceReport(8)],
  ])('%s sealed for another organisation is refused with no verdict', async (_what, pkg) => {
    const r = await verify(app('admin'), pkg);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('AUDIT_EXPORT_TENANT_MISMATCH');
    expect(r.body.verification, 'the platform vouched for another organisation\'s package').toBeUndefined();
    expect(record).not.toHaveBeenCalled();
  });

  it('a package that names no organisation is refused with no verdict', async () => {
    const r = await verify(app('admin'), auditExport(undefined));
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('AUDIT_EXPORT_TENANT_MISMATCH');
    expect(r.body.verification).toBeUndefined();
  });

  it('the organisation\'s own compliance report is checked', async () => {
    const r = await verify(app('manager'), complianceReport(ORG));
    expect(r.status).toBe(200);
    expect(r.body.verification.valid).toBe(true);
  });

  it('relabelling another organisation\'s package as one\'s own does not verify: the organisation is under the seal', async () => {
    const theirs = auditExport(8);
    const r = await verify(app('admin'), { ...theirs, manifest: { ...theirs.manifest, queryFilters: { organizationId: ORG } } });
    expect(r.status).toBe(200);
    expect(r.body.verification.valid).toBe(false);
  });
});

describe('POST /api/audit/export/verify — the check is recorded', () => {
  it('a passing check writes one row on the organisation\'s chain, before the verdict is sent', async () => {
    const pkg = auditExport(ORG);
    const r = await verify(app('admin'), pkg);
    expect(r.status).toBe(200);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][1]).toMatchObject({
      tenantId: ORG, userId: 2, action: 'audit.export_verify', resourceType: 'audit_export', resourceId: 'AUDIT-EXPORT-1',
      details: { exportId: 'AUDIT-EXPORT-1', dataHash: pkg.manifest.dataHash, valid: true, errors: [], signingKeyId: 'k-verify' },
    });
    expect(clientQuery.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
  });

  it('a failing check is recorded as failing, with what failed', async () => {
    const pkg = auditExport(ORG);
    const r = await verify(app('admin'), { ...pkg, data: pkg.data.replace('Rae', 'Rai') });
    expect(r.body.verification.valid).toBe(false);
    expect(record.mock.calls[0][1].details).toMatchObject({ valid: false, errors: [expect.stringMatching(/Data hash mismatch/)] });
  });

  it('when the row cannot be written, no verdict is sent (503)', async () => {
    record.mockRejectedValueOnce(new Error('chain writer down'));
    const r = await verify(app('admin'), auditExport(ORG));
    expect(r.status).toBe(503);
    expect(r.body.error).toMatchObject({ code: 'AUDIT_EXPORT_VERIFICATION_NOT_RECORDED' });
    expect(r.body.verification).toBeUndefined();
    expect(clientQuery.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('a malformed request is refused before anything is recorded', async () => {
    const r = await verify(app('admin'), { data: DATA });
    expect(r.status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });
});
